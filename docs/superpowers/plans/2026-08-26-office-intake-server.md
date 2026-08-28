# Management Office Intake Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing hyeonjang Google Apps Script relay with an isolated, authenticated management-office intake API and Drive-backed request store.

**Architecture:** Public management-office actions use a short-lived office session and never receive the internal `APP_TOKEN`. Internal hyeonjang actions continue to use `APP_TOKEN`; both action groups share the existing `text/plain` POST entry point but dispatch through separate authorization branches. Intake metadata lives in `관리사무소접수.json`, while photos live in per-office/per-receipt Drive folders.

**Tech Stack:** Google Apps Script V8, DriveApp, PropertiesService, CacheService, LockService, Utilities HMAC, CalendarApp, Node.js `vm` contract tests.

**Spec:** `docs/superpowers/specs/2026-08-26-office-hyeonjang-integration-design.md`

## Global Constraints

- Repository: `hyeonjang`; implementation starts from a clean isolated worktree based on current `origin/main`, not the dirty `fix/heic-photo-persistence` checkout.
- Preserve existing relay actions: `health`, `load`, `save`, `backup`, `upload`, `listFiles`, `thumbnail`, `download`.
- Public office requests must never accept, return, log, or embed the internal `APP_TOKEN`.
- All POST requests remain `Content-Type: text/plain;charset=utf-8`; do not add custom browser headers that trigger an Apps Script OPTIONS preflight.
- Office PINs are exactly six digits; sessions expire after eight hours; five failed logins lock that office slug for ten minutes.
- Each request allows JPEG, PNG, or WebP only, at most five images, at most 2 MiB decoded bytes per image.
- Store no secret value in Git, test fixtures, command output, documentation, or chat. Use `[REDACTED_SECRET]` in examples.
- `OFFICE_INTAKE_ENABLED=0` disables public login and create/update/upload actions without disabling existing relay actions.
- Apps Script deployment is separate from GitHub Pages deployment and requires a user-controlled account authorization step.
- Use TDD for every behavior: add a failing test, observe the expected failure, add minimal implementation, then rerun the focused and full suites.

---

## File Structure

### Create

- `apps-script/OfficeIntakePure.gs`: dependency-free validation, status transition, receipt, session-payload, and redaction helpers.
- `apps-script/OfficeIntake.gs`: Apps Script authentication, session, rate limit, Drive store, photos, admin actions, and Calendar alert handlers.
- `tests/office-intake-pure.unit.js`: Node `vm` tests for pure helpers.
- `tests/office-intake-server.unit.js`: Apps Script service stubs and server action contract tests.

### Modify

- `apps-script/Code.gs`: dispatch public office actions before internal token validation and route internal office actions after normal validation.
- `apps-script/README_APPS_SCRIPT.md`: action contract, Script Properties, error codes, and security boundary.
- `APPS_SCRIPT_설치방법.md`: account-side property and redeployment checklist.
- `tests/relay.e2e.js`: static regression assertion that legacy relay actions remain present.

### Do Not Modify

- `현장데이터.json` format or revision rules.
- Existing `uploadFile_`, `saveData_`, backup, download, and thumbnail behavior.
- Watchdog read-only guarantees.

---

### Task 1: Pure Intake Domain Contract

**Files:**

- Create: `apps-script/OfficeIntakePure.gs`
- Create: `tests/office-intake-pure.unit.js`

**Interfaces:**

- Consumes: plain JavaScript values only; no Apps Script globals.
- Produces:
  - `oiNormalizePhone_(value: unknown): string`
  - `oiValidateCreate_(payload: object): {ok:boolean, error?:string, field?:string, value?:object}`
  - `oiCanTransition_(from: string, to: string, actor: 'office'|'internal'): boolean`
  - `oiReceiptNo_(yyyymmdd: string, sequence: number): string`
  - `oiSessionPayload_(officeId: string, sessionVersion: number, issuedAt: number): object`
  - `oiRedactPhone_(value: string): string`

- [ ] **Step 1: Write the failing pure helper tests**

Create `tests/office-intake-pure.unit.js` with a `vm` loader matching `tests/watchdog.unit.js` and these assertions:

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'OfficeIntakePure.gs'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

assert.equal(sandbox.oiNormalizePhone_('01012345678'), '010-1234-5678');
assert.equal(sandbox.oiReceiptNo_('20260826', 7), 'MM-20260826-0007');

const valid = sandbox.oiValidateCreate_({
  idempotencyKey: 'b7c9b8af-16f4-4db2-a7e4-f1a8c780b881',
  unit: '103동 1204호',
  location: '욕실 천장',
  issueType: '누수',
  pipeType: '미확정',
  urgency: 'normal',
  description: '천장에서 물이 떨어집니다.',
  officeContact: { name: '홍길동', phone: '01012345678' },
  residentContact: null,
  preferredVisitDate: '2026-08-27',
  privacyConsent: true,
});
assert.equal(valid.ok, true);
assert.equal(valid.value.officeContact.phone, '010-1234-5678');
assert.equal(sandbox.oiValidateCreate_({ ...valid.value, privacyConsent: false }).field, 'privacyConsent');
assert.equal(sandbox.oiCanTransition_('pending_review', 'cancelled', 'office'), true);
assert.equal(sandbox.oiCanTransition_('accepted', 'cancelled', 'office'), false);
assert.equal(sandbox.oiCanTransition_('accepted', 'visit_scheduled', 'internal'), true);
assert.equal(sandbox.oiCanTransition_('paid', 'in_progress', 'internal'), false);

const session = sandbox.oiSessionPayload_('of1', 3, 1000);
assert.deepEqual(JSON.parse(JSON.stringify(session)), {
  officeId: 'of1', sessionVersion: 3, issuedAt: 1000, expiresAt: 1000 + 8 * 60 * 60 * 1000,
});
assert.equal(sandbox.oiRedactPhone_('010-1234-5678'), '010-****-5678');
console.log('PASS  office intake pure contract');
```

- [ ] **Step 2: Run the test and verify the missing-helper failure**

Run:

```powershell
$node='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\office-intake-pure.unit.js
```

Expected: FAIL because `OfficeIntakePure.gs` or `oiNormalizePhone_` does not exist.

- [ ] **Step 3: Implement the minimal pure contract**

Create `apps-script/OfficeIntakePure.gs` with explicit status and input allowlists:

```js
'use strict';

var OI_SESSION_MS = 8 * 60 * 60 * 1000;
var OI_ISSUE_TYPES = ['누수', '배수', '급수', '난방', '방수', '공용시설', '기타'];
var OI_PIPE_TYPES = ['미확정', '오수', '우수', '잡배수', '난방', '급수'];
var OI_TRANSITIONS = {
  pending_review: ['needs_info', 'accepted', 'on_hold', 'cancelled'],
  needs_info: ['pending_review', 'on_hold', 'cancelled'],
  accepted: ['visit_scheduled', 'on_hold'],
  visit_scheduled: ['in_progress', 'on_hold'],
  in_progress: ['completed', 'on_hold'],
  completed: ['billed'],
  billed: ['paid'],
  paid: [],
  on_hold: ['pending_review', 'accepted', 'visit_scheduled', 'in_progress', 'cancelled'],
  cancelled: []
};

function oiText_(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
function oiDigits_(value) { return String(value == null ? '' : value).replace(/\D/g, ''); }
function oiNormalizePhone_(value) {
  var n = oiDigits_(value);
  if (n.length === 11) return n.slice(0, 3) + '-' + n.slice(3, 7) + '-' + n.slice(7);
  if (n.length === 10) return n.slice(0, 3) + '-' + n.slice(3, 6) + '-' + n.slice(6);
  return '';
}
function oiValidateCreate_(p) {
  p = p && typeof p === 'object' ? p : {};
  var value = {
    idempotencyKey: oiText_(p.idempotencyKey, 80),
    unit: oiText_(p.unit, 80),
    location: oiText_(p.location, 120),
    issueType: oiText_(p.issueType, 20),
    pipeType: oiText_(p.pipeType || '미확정', 20),
    urgency: p.urgency === 'urgent' ? 'urgent' : 'normal',
    description: oiText_(p.description, 1200),
    officeContact: {
      name: oiText_(p.officeContact && p.officeContact.name, 60),
      phone: oiNormalizePhone_(p.officeContact && p.officeContact.phone)
    },
    residentContact: p.residentContact ? {
      name: oiText_(p.residentContact.name, 60),
      phone: oiNormalizePhone_(p.residentContact.phone)
    } : null,
    preferredVisitDate: oiText_(p.preferredVisitDate, 10),
    privacyConsent: p.privacyConsent === true
  };
  var required = [['idempotencyKey', value.idempotencyKey], ['unit', value.unit], ['location', value.location], ['description', value.description]];
  for (var i = 0; i < required.length; i++) if (!required[i][1]) return { ok: false, error: 'invalid-input', field: required[i][0] };
  if (OI_ISSUE_TYPES.indexOf(value.issueType) < 0) return { ok: false, error: 'invalid-input', field: 'issueType' };
  if (OI_PIPE_TYPES.indexOf(value.pipeType) < 0) return { ok: false, error: 'invalid-input', field: 'pipeType' };
  if (!value.officeContact.name) return { ok: false, error: 'invalid-input', field: 'officeContact.name' };
  if (!value.officeContact.phone) return { ok: false, error: 'invalid-input', field: 'officeContact.phone' };
  if (!value.privacyConsent) return { ok: false, error: 'consent-required', field: 'privacyConsent' };
  return { ok: true, value: value };
}
function oiCanTransition_(from, to, actor) {
  if (actor === 'office') return (from === 'pending_review' || from === 'needs_info') && (to === 'pending_review' || to === 'cancelled');
  return !!(OI_TRANSITIONS[from] && OI_TRANSITIONS[from].indexOf(to) >= 0);
}
function oiReceiptNo_(yyyymmdd, sequence) { return 'MM-' + yyyymmdd + '-' + ('0000' + sequence).slice(-4); }
function oiSessionPayload_(officeId, sessionVersion, issuedAt) {
  return { officeId: officeId, sessionVersion: sessionVersion, issuedAt: issuedAt, expiresAt: issuedAt + OI_SESSION_MS };
}
function oiRedactPhone_(value) {
  var n = oiNormalizePhone_(value); return n ? n.slice(0, 4) + '****' + n.slice(-5) : '';
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run the Step 2 command. Expected: `PASS  office intake pure contract` and exit code 0.

- [ ] **Step 5: Commit the pure contract**

```powershell
git add apps-script/OfficeIntakePure.gs tests/office-intake-pure.unit.js
git commit -m "feat: define office intake server contract"
```

---

### Task 2: Public Office Login and Signed Session

**Files:**

- Create: `apps-script/OfficeIntake.gs`
- Create: `tests/office-intake-server.unit.js`
- Modify: `apps-script/Code.gs`

**Interfaces:**

- Consumes: Task 1 helpers and Script Properties `OFFICE_INTAKE_ENABLED`, `OFFICE_SESSION_SECRET`, `OFFICE_CONFIG_JSON`.
- Produces:
  - `oiIsPublicAction_(action: string): boolean`
  - `oiHandlePublicAction_(action: string, req: object): object`
  - `oiHashPin_(pin: string, salt: string): string`
  - `oiLogin_(payload: object, now: number): object`
  - `oiIssueSession_(office: object, now: number): string`
  - `oiVerifySession_(token: string, now: number): object|null`
  - error codes `office-disabled`, `invalid-credentials`, `rate-limited`, `session-expired`.

- [ ] **Step 1: Write failing login, lockout, and session tests**

Build `tests/office-intake-server.unit.js` with stubs for `PropertiesService`, `CacheService`, `Utilities`, `LockService`, `DriveApp`, and `CalendarApp`. Assert these cases:

```js
const login = sandbox.oiLogin_({ slug: 'sample-apt', pin: '123456' }, 1000);
assert.equal(login.ok, true);
assert.equal(login.office.complexName, '예시 아파트');
assert.equal(sandbox.oiVerifySession_(login.sessionToken, 1001).officeId, 'of1');
assert.equal(sandbox.oiVerifySession_(login.sessionToken, 1000 + 8 * 60 * 60 * 1000 + 1), null);

for (let i = 0; i < 5; i++) sandbox.oiLogin_({ slug: 'sample-apt', pin: '000000' }, 2000 + i);
assert.equal(sandbox.oiLogin_({ slug: 'sample-apt', pin: '123456' }, 2010).error, 'rate-limited');

properties.OFFICE_INTAKE_ENABLED = '0';
assert.equal(sandbox.oiLogin_({ slug: 'sample-apt', pin: '123456' }, 3000).error, 'office-disabled');
```

Use a deterministic `Utilities.computeHmacSha256Signature` stub so tests contain no real secret.

- [ ] **Step 2: Run the server test and verify it fails**

```powershell
$node='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node tests\office-intake-server.unit.js
```

Expected: FAIL because `oiLogin_` and session helpers are not defined.

- [ ] **Step 3: Implement the session boundary in `OfficeIntake.gs`**

Use `Utilities.computeHmacSha256Signature`, `Utilities.base64EncodeWebSafe`, and `Utilities.base64DecodeWebSafe`. Store the login failure count in `CacheService.getScriptCache()` under `oi-login:<slug>` for 600 seconds. The session payload must contain only `officeId`, `sessionVersion`, `issuedAt`, and `expiresAt`.

Implement the cryptographic boundary with these exact inputs: PIN hash input is `salt + ':' + pin`, session signing input is the web-safe base64 payload, and both use `OFFICE_SESSION_SECRET` as the HMAC key. Compare decoded signatures byte-by-byte without returning early:

```js
function oiSecret_(){
  var s=PropertiesService.getScriptProperties().getProperty('OFFICE_SESSION_SECRET')||'';
  if(s.length<32) throw new Error('office-secret-not-configured');
  return s;
}
function oiMac_(text){
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(String(text),oiSecret_())
  ).replace(/=+$/,'');
}
function oiHashPin_(pin,salt){return oiMac_(String(salt)+':'+String(pin));}
function oiSafeEqual_(a,b){
  if(!a||!b)return false;
  var x,y;
  try{x=Utilities.base64DecodeWebSafe(String(a));y=Utilities.base64DecodeWebSafe(String(b));}
  catch(_){return false;}
  if(!x.length||!y.length)return false;
  var diff=x.length^y.length, n=Math.max(x.length,y.length);
  for(var i=0;i<n;i++) diff|=(x[i%x.length]||0)^(y[i%y.length]||0);
  return diff===0;
}
function oiIssueSession_(office,now){
  var p={officeId:office.id,sessionVersion:Number(office.sessionVersion||1),issuedAt:now,expiresAt:now+8*60*60*1000};
  var body=Utilities.base64EncodeWebSafe(JSON.stringify(p)).replace(/=+$/,'');
  return body+'.'+oiMac_(body);
}
```

`oiVerifySession_` splits on the single `.`, validates the signature with `oiSafeEqual_`, parses the decoded payload, rejects expiry, disabled/missing office, and `sessionVersion` mismatch, then returns `{officeId, office}` only. Return `null` for every malformed token.

The public action list is exact:

```js
var OI_PUBLIC_ACTIONS = ['officeLogin', 'officeList', 'officeGet', 'officeCreate', 'officeUpdate', 'officeCancel', 'officeUpload'];
var OI_INTERNAL_ACTIONS = ['officeInbox', 'officeAccept', 'officeSetStatus', 'officeAdminUpsert', 'officeRotatePin', 'officeDisable', 'officeRetentionList'];

function oiIsPublicAction_(action) { return OI_PUBLIC_ACTIONS.indexOf(action) >= 0; }
function oiIsInternalAction_(action) { return OI_INTERNAL_ACTIONS.indexOf(action) >= 0; }
```

`oiLogin_` must validate `^\d{6}$`, compare a server-side HMAC of the submitted PIN with the stored `pinHash`, return the same `invalid-credentials` message for unknown and disabled slugs, and never return `pinHash` or `pinSalt`.

- [ ] **Step 4: Split `doPost` authorization without weakening legacy relay security**

In `apps-script/Code.gs`, retain body size, JSON, and ±10-minute timestamp checks. Dispatch public actions before `checkToken_`, then apply `checkToken_` to all existing and internal actions:

```js
var action = String(req.action || '');
var ts = Number(req.ts || 0);
if (!ts || Math.abs(Date.now() - ts) > TS_WINDOW_MS) return fail_('bad-request', '요청 시간이 유효하지 않습니다(기기 시계를 확인하세요)');

if (oiIsPublicAction_(action)) return out_(oiHandlePublicAction_(action, req));

var tk = checkToken_(req.token);
if (tk) return fail_(tk, tk === 'not-configured' ? '서버에 APP_TOKEN이 설정되지 않았습니다' : '인증키가 일치하지 않습니다');
if (oiIsInternalAction_(action)) return out_(oiHandleInternalAction_(action, req));
if (ALLOWED_ACTIONS.indexOf(action) < 0) return fail_('bad-request', '허용되지 않은 action');
```

Do not add office actions to the legacy `ALLOWED_ACTIONS` array; the two branches must remain explicit.

- [ ] **Step 5: Run focused and legacy relay tests**

```powershell
& $node tests\office-intake-server.unit.js
& $node tests\syntax.check.js
```

Expected: both exit 0; existing internal actions still reject a missing or wrong `APP_TOKEN` in the server unit test.

- [ ] **Step 6: Commit the authentication boundary**

```powershell
git add apps-script/OfficeIntake.gs apps-script/Code.gs tests/office-intake-server.unit.js
git commit -m "feat: add isolated office intake authentication"
```

---

### Task 3: Drive Request Store and Photo Upload

**Files:**

- Modify: `apps-script/OfficeIntake.gs`
- Modify: `tests/office-intake-server.unit.js`

**Interfaces:**

- Consumes: verified office session from Task 2 and Task 1 validation.
- Produces:
  - `oiReadStore_(): {version:number, requests:object[]}`
  - `oiWriteStore_(store: object): void`
  - `oiCreate_(session: object, payload: object, now: number): object`
  - `oiList_(session: object, payload: object): object`
  - `oiGet_(session: object, requestId: string): object`
  - `oiUpdate_(session: object, payload: object, now: number): object`
  - `oiCancel_(session: object, payload: object, now: number): object`
  - `oiUpload_(session: object, payload: object, now: number): object`

- [ ] **Step 1: Add failing tenant-isolation, idempotency, and photo tests**

Extend `tests/office-intake-server.unit.js` so two office sessions exist. Assert:

```js
const first = sandbox.oiCreate_(sessionOf1, validPayload, 10000);
const replay = sandbox.oiCreate_(sessionOf1, validPayload, 10001);
assert.equal(first.receiptNo, 'MM-19700101-0001');
assert.equal(replay.requestId, first.requestId);
assert.equal(sandbox.oiList_(sessionOf2, {}).requests.length, 0);
assert.equal(sandbox.oiGet_(sessionOf2, first.requestId).error, 'not-found');

const badPhoto = sandbox.oiUpload_(sessionOf1, {
  requestId: first.requestId,
  name: 'bad.gif', mimeType: 'image/gif', dataB64: 'R0lGODlhAQABAIAAAAUEBA=='
}, 10002);
assert.equal(badPhoto.error, 'unsupported-type');
```

Also assert that the sixth valid photo returns `too-many-files`, a decoded file larger than 2 MiB returns `too-large`, and office 2 cannot upload to office 1's request.

- [ ] **Step 2: Run the focused test and verify the missing-store failure**

Run `& $node tests\office-intake-server.unit.js`.

Expected: FAIL at `oiCreate_` or store access.

- [ ] **Step 3: Implement the locked JSON store**

Use one Drive file named by `OFFICE_STORE_FILE` with default `관리사무소접수.json` inside the configured root folder. Every read-modify-write operation must:

```js
var lock = LockService.getScriptLock();
lock.waitLock(20000);
try {
  var store = oiReadStore_();
  // validate, mutate, write
  oiWriteStore_(store);
} finally {
  lock.releaseLock();
}
```

The store root is `{version:1, requests:[]}`. Generate request IDs with `Utilities.getUuid()`. Generate daily receipt numbers under the same lock using Script Property `OFFICE_RECEIPT_YYYYMMDD`. Search `(officeId, idempotencyKey)` before allocating a receipt number.

- [ ] **Step 4: Implement office-scoped CRUD**

All lookups must use both `requestId` and the session's `officeId`. `officeUpdate` and `officeCancel` accept only `pending_review` and `needs_info`. The list response returns the newest 50 requests and excludes `residentContact` unless it belongs to that office request.

The create response is exact:

```js
{
  ok: true,
  requestId: request.requestId,
  receiptNo: request.receiptNo,
  status: request.status,
  createdAt: request.createdAt
}
```

- [ ] **Step 5: Implement safe image storage**

Decode base64 before size checks. Validate both declared MIME and magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`. Store files under `관리사무소접수/<slug>/<receiptNo>/` with server-generated names `<receiptNo>_01.jpg` through `_05.webp`. Persist only `fileId`, generated name, MIME, byte size, and created time in the JSON request.

- [ ] **Step 6: Run focused tests and commit**

```powershell
& $node tests\office-intake-pure.unit.js
& $node tests\office-intake-server.unit.js
git add apps-script/OfficeIntake.gs tests/office-intake-server.unit.js
git commit -m "feat: persist office requests and photos"
```

Expected: both tests exit 0.

---

### Task 4: Internal Inbox, Status Sync, Office Administration, Audit, and Urgent Alert

**Files:**

- Modify: `apps-script/OfficeIntake.gs`
- Modify: `tests/office-intake-server.unit.js`

**Interfaces:**

- Consumes: internal `APP_TOKEN` authorization already completed by `Code.gs` and store functions from Task 3.
- Produces:
  - `oiInbox_(payload: object): object`
  - `oiAccept_(payload: object, now: number): object`
  - `oiSetStatus_(payload: object, now: number): object`
  - `oiAdminUpsert_(payload: object, now: number): object`
  - `oiRotatePin_(payload: object, now: number): object`
  - `oiDisable_(payload: object, now: number): object`
  - `oiRetentionCandidates_(now: number): object[]`
  - `oiAudit_(officeId: string, receiptNo: string, action: string, result: string, now: number): void`
  - `oiNotifyUrgent_(request: object): {ok:boolean, error?:string}`

- [ ] **Step 1: Add failing internal action tests**

Cover these exact behaviors:

```js
assert.equal(sandbox.oiInbox_({ updatedAfter: '' }).requests.length, 1);
const linked = sandbox.oiAccept_({ requestId: first.requestId, hyeonjangOrderId: 'apt-1' }, 20000);
assert.equal(linked.ok, true);
assert.equal(sandbox.oiAccept_({ requestId: first.requestId, hyeonjangOrderId: 'apt-1' }, 20001).hyeonjangOrderId, 'apt-1');
assert.equal(sandbox.oiAccept_({ requestId: first.requestId, hyeonjangOrderId: 'apt-2' }, 20002).error, 'already-linked');
assert.equal(sandbox.oiSetStatus_({ requestId: first.requestId, status: 'visit_scheduled', visitAt: '2026-08-27T10:00:00+09:00' }, 20003).status, 'visit_scheduled');
assert.equal(sandbox.oiSetStatus_({ requestId: first.requestId, status: 'paid' }, 20004).error, 'invalid-transition');
```

Assert that `oiRotatePin_` increments `sessionVersion`, old sessions fail, `oiDisable_` blocks new login without deleting requests, and Calendar failure leaves `oiCreate_` successful with an operational error record. Also assert that an unreviewed request older than 24 hours returns `overdue:true`, retention candidates include cancelled requests after 90 days and completed requests after one year, and audit rows contain only receipt number, office ID, action, result, and timestamp—never PIN, session token, description, photo bytes, or a full phone number.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `& $node tests\office-intake-server.unit.js`.

Expected: FAIL because internal action handlers are not implemented.

- [ ] **Step 3: Implement internal inbox and idempotent link**

`oiInbox_` returns requests updated after the cursor, sorted oldest first, at most 100. It adds `overdue:true` when `status === 'pending_review'` and `createdAt` is at least 24 hours old, and returns the latest sanitized operational errors separately. `oiAccept_` sets `hyeonjangOrderId` and status `accepted` under one lock. Repeating the same `(requestId, hyeonjangOrderId)` is success; a different order ID is `already-linked`.

- [ ] **Step 4: Implement status publishing**

`oiSetStatus_` uses `oiCanTransition_(current, next, 'internal')`. Only these fields can be published to the office response:

```js
request.status = payload.status;
request.visitAt = payload.visitAt || request.visitAt || null;
request.publicAmount = Number.isFinite(Number(payload.publicAmount)) ? Number(payload.publicAmount) : request.publicAmount;
request.completionReport = payload.completionReport ? {
  summary: oiText_(payload.completionReport.summary, 800),
  photoIds: (payload.completionReport.photoIds || []).slice(0, 10)
} : request.completionReport;
```

Do not return internal notes, all-office totals, or unrelated Drive file IDs to public actions.

- [ ] **Step 5: Implement audit records and retention candidates**

Extend the store to `{version,requests,audit,operationalErrors}`. `oiAudit_` appends a sanitized row and keeps the newest 1,000. Login failure/success, create/update/cancel/upload, accept/status, PIN rotation, and disable each write one result row. Calendar and sync failures go to `operationalErrors`, capped at 100; they do not enter the security audit message field.

`officeRetentionList` is internal-token-only and calls `oiRetentionCandidates_(now)`. Return metadata for human review only: `{requestId,receiptNo,officeId,status,retentionReason,eligibleAt}`. Cancelled/declined items become candidates after 90 days and completed general items after one year; records marked `legalRetention:true` are excluded. Do not implement permanent deletion in this phase.

- [ ] **Step 6: Implement office administration and urgent Calendar alert**

`oiAdminUpsert_` is the only action that creates an office record, and it must accept the stable existing `aptOffices.id`. `oiRotatePin_` generates a random six-digit PIN with `Utilities.getUuid()`-derived entropy, stores only its hash and salt, increments `sessionVersion`, and returns the PIN once. Tests must replace the generated value; no real PIN may appear in fixtures.

When `urgency === 'urgent'`, create a Calendar event titled `[긴급 관리사무소 접수] <단지> <위치>`. Wrap Calendar access in `try/catch`; on failure append `{code:'calendar-failed',requestId,at}` to `operationalErrors` and still return the successful receipt.

- [ ] **Step 7: Run server tests and commit**

```powershell
& $node tests\office-intake-pure.unit.js
& $node tests\office-intake-server.unit.js
git add apps-script/OfficeIntake.gs tests/office-intake-server.unit.js
git commit -m "feat: sync office intake with hyeonjang"
```

Expected: all focused assertions pass, including Calendar failure preservation, audit sanitization, overdue marking, and retention-candidate classification.

---

### Task 5: Installation Contract, Legacy Regression, and Deployment Gate

**Files:**

- Modify: `apps-script/README_APPS_SCRIPT.md`
- Modify: `APPS_SCRIPT_설치방법.md`
- Modify: `tests/relay.e2e.js`

**Interfaces:**

- Consumes: all server actions from Tasks 1–4.
- Produces: exact operator checklist and regression evidence; no production deployment in this task.

- [ ] **Step 1: Add failing documentation/static checks**

Extend `tests/relay.e2e.js` or add static assertions in `tests/office-intake-server.unit.js` that verify:

```js
assert(codeSource.includes("oiIsPublicAction_(action)"));
assert(codeSource.includes("checkToken_(req.token)"));
assert(!officeSource.includes('APP_TOKEN='));
assert(readme.includes('OFFICE_INTAKE_ENABLED'));
assert(readme.includes('OFFICE_SESSION_SECRET'));
assert(readme.includes('OFFICE_CONFIG_JSON'));
assert(readme.includes('OFFICE_STORE_FILE'));
```

- [ ] **Step 2: Run the check and observe the documentation failure**

Run the server unit test. Expected: FAIL until the documentation lists all required properties.

- [ ] **Step 3: Document exact Script Properties and deployment order**

Document these keys without values:

- `APP_TOKEN`
- `DRIVE_FOLDER_ID`
- `DATA_FILE_NAME`
- `OFFICE_INTAKE_ENABLED`
- `OFFICE_SESSION_SECRET`
- `OFFICE_CONFIG_JSON`
- `OFFICE_STORE_FILE`

Document that the web app remains `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS`, that office sessions protect office actions, and that account authorization and redeployment are manual user-controlled steps.

- [ ] **Step 4: Run the full server and syntax verification**

```powershell
& $node tests\office-intake-pure.unit.js
& $node tests\office-intake-server.unit.js
& $node tests\syntax.check.js
& $node tests\watchdog.unit.js
git diff --check
```

Expected: every command exits 0; no secret-like value is printed.

- [ ] **Step 5: Commit the server deployment contract**

```powershell
git add apps-script/README_APPS_SCRIPT.md APPS_SCRIPT_설치방법.md tests/relay.e2e.js tests/office-intake-server.unit.js
git commit -m "docs: define office intake relay deployment"
```

- [ ] **Step 6: Stop at the account boundary**

Report the commit list, exact tests, and the required Apps Script account actions. Do not create Script Properties, reveal generated PINs, authorize the Google account, or deploy a new `/exec` version without a separate explicit deployment approval.
