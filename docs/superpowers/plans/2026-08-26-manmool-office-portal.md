# Manmool Management Office Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the undeployed SMS-only office request page with a mobile management-office login, request, progress, and completion-report portal backed by the office intake Apps Script API.

**Architecture:** `office-request.html?office=<slug>` is a noindex static shell. A public fail-closed JSON config supplies only the Apps Script `/exec` URL, a focused API client sends `text/plain` JSON, and an eight-hour session token is stored in `sessionStorage`; contact, description, and photo data are never persisted in browser storage.

**Tech Stack:** Static HTML/CSS/JavaScript, Apps Script JSON API, Canvas image compression, Node.js test runner, Playwright, GitHub Pages artifact scripts.

**Spec:** `docs/superpowers/specs/2026-08-26-office-hyeonjang-integration-design.md`

## Global Constraints

- Repository: `manmool`; continue in the clean isolated `feat/office-intake` worktree at design commit `98075af` or a fresh equivalent worktree containing that commit.
- This plan starts after the intake server and hyeonjang integration focused contracts pass; it does not invent a second backend.
- Replace the SMS-only flow; do not keep `formatRequestMessage`, `buildSmsHref`, or copy-to-SMS as the primary workflow.
- The URL slug is public routing metadata, not authentication; all list/get/create/update/cancel/upload responses require a valid server session.
- Store only the session token, office display name, and expiry in `sessionStorage`. Never store request fields, contacts, descriptions, or image bytes in `localStorage`, `sessionStorage`, or IndexedDB.
- Public configuration may contain the Apps Script URL and feature flag only. It must never contain `APP_TOKEN`, PIN, session secret, generated session, or resident data.
- CSP allows only `self`, `https://script.google.com`, and `https://script.googleusercontent.com` for `connect-src`.
- Render all server/user text with `textContent` or explicit attribute setters; do not interpolate untrusted values into `innerHTML`.
- Photos: JPEG, PNG, or WebP, maximum five, resize longest side to 1600px, encode to JPEG at 0.82 quality, reject a compressed result over 2 MiB.
- Do not display “접수 완료” until the server returns a receipt number; when selected photos are still retrying, display “접수 저장됨 · 사진 전송 필요”.
- Preserve the public `office.html` sales/SEO content and clearly label the portal “관리사무소 직원 전용”.
- The portal remains `noindex,follow` and is excluded from `sitemap.xml`.
- Use TDD and one reviewable commit per task.

---

## File Structure

### Create

- `office-api.json`: public fail-closed API configuration with no secrets.
- `js/office-request-api.js`: configuration loader, `text/plain` API transport, typed error mapping.
- `js/office-request-photo.js`: image validation, resize, compression, and base64 conversion.
- `scripts/configure-office-api.mjs`: validates an Apps Script `/exec` URL and writes `office-api.json` without accepting secrets.
- `tests/office-request-api.test.cjs`: API body, response, and error tests.
- `tests/office-request-auth.e2e.cjs`: slug, login, lockout, session expiry, tenant-safe dashboard.
- `tests/office-request-workflow.e2e.cjs`: create, idempotent retry, photo retry, edit, cancel, status, report.

### Modify

- `office-request.html`: login, dashboard, new request, detail, and completion report views.
- `css/office-request.css`: authenticated mobile portal states and 44px controls.
- `js/office-request-core.js`: slug, validation, state labels, API request payloads; remove SMS generation.
- `js/office-request.js`: session and view controller.
- `office.html`: staff-only portal entry and dedicated-URL explanation.
- `privacy.html`: office contact, optional resident contact, photos, purpose, retention, and Apps Script/Drive path.
- `scripts/build-pages-artifact.mjs`: include portal config and new scripts.
- `scripts/ensure-pages-artifact.mjs`: assert public config and script presence.
- `scripts/ensure-office-intake.mjs`: replace SMS/no-network assertions with session/API/security assertions.
- `tests/office-request.logic.test.cjs`: new core contract.
- `tests/office-intake.e2e.cjs`: replace SMS flow coverage.
- `tests/unified-brand-design.e2e.cjs`: preserve brand, office page, and mobile regression.

### Remove from Runtime Behavior

- SMS body preview and `sms:` launch.
- “웹에는 접수 내용을 저장하지 않습니다” wording that implies no server submission.
- Free-text complex selection; complex comes from the authenticated slug.

---

### Task 1: Portal Core Contract and Fail-Closed API Client

**Files:**

- Create: `office-api.json`
- Create: `js/office-request-api.js`
- Create: `tests/office-request-api.test.cjs`
- Modify: `js/office-request-core.js`
- Modify: `tests/office-request.logic.test.cjs`

**Interfaces:**

- Consumes: server action names and error codes from `2026-08-26-office-intake-server.md`.
- Produces:
  - `ManmulOfficeRequest.parseOfficeSlug(search: string): string`
  - `ManmulOfficeRequest.validateLogin(data: object): result`
  - `ManmulOfficeRequest.validateRequest(data: object): result`
  - `ManmulOfficeRequest.buildCreatePayload(data: object, idempotencyKey: string): object`
  - `ManmulOfficeRequest.statusLabel(status: string): string`
  - `ManmulOfficeApi.loadConfig(): Promise<{enabled:boolean,apiUrl:string}>`
  - `ManmulOfficeApi.call(action: string, options?: {sessionToken?:string,payload?:object}): Promise<object>`
  - `ManmulOfficeApiError` with `code`, `message`, and `retryable`.

- [ ] **Step 1: Replace SMS unit expectations with portal core expectations**

Update `tests/office-request.logic.test.cjs`:

```js
assert.equal(api.parseOfficeSlug('?office=sample-apt'), 'sample-apt');
assert.equal(api.parseOfficeSlug('?office=%3Cscript%3E'), '');
assert.equal(api.validateLogin({ pin: '123456' }).ok, true);
assert.equal(api.validateLogin({ pin: '12345' }).field, 'pin');

const valid = {
  unit:'103동 1204호',location:'욕실 천장',issueType:'누수',pipeType:'미확정',
  urgency:'normal',description:'천장에서 물이 떨어집니다.',
  officeContactName:'김소장',officeContactPhone:'01012345678',
  residentName:'',residentPhone:'',preferredVisitDate:'2026-08-27',privacyConsent:true
};
assert.equal(api.validateRequest(valid).ok, true);
const payload=api.buildCreatePayload(valid,'b7c9b8af-16f4-4db2-a7e4-f1a8c780b881');
assert.equal(payload.officeContact.phone,'010-1234-5678');
assert.equal(payload.residentContact,null);
assert.equal(payload.idempotencyKey,'b7c9b8af-16f4-4db2-a7e4-f1a8c780b881');
assert.equal(api.statusLabel('visit_scheduled'),'방문 예정');
assert.equal('buildSmsHref' in api,false);
```

- [ ] **Step 2: Write failing API transport tests**

Create `tests/office-request-api.test.cjs` with mocked `fetch` and assert:

```js
const body = JSON.parse(fetchCalls[0].options.body);
assert.equal(fetchCalls[0].options.headers['Content-Type'],'text/plain;charset=utf-8');
assert.equal(body.action,'officeList');
assert.equal(body.sessionToken,'session-test');
assert.equal(typeof body.ts,'number');
assert.equal('token' in body,false);
```

Also assert disabled config throws `not-configured`, HTTP 500 is retryable, `session-expired` is not retried automatically, and no error string contains the session token.

- [ ] **Step 3: Run both tests and verify they fail**

```powershell
$node='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node --test tests\office-request.logic.test.cjs tests\office-request-api.test.cjs
```

Expected: FAIL because portal helpers and API client are missing.

- [ ] **Step 4: Implement the new core helpers**

Keep the existing UMD wrapper and replace SMS helpers with:

```js
function parseOfficeSlug(search){
  const slug=new URLSearchParams(String(search||'')).get('office')||'';
  return /^[a-z0-9][a-z0-9-]{2,63}$/.test(slug)?slug:'';
}
function validateLogin(data){
  return /^\d{6}$/.test(String(data&&data.pin||''))
    ? {ok:true,field:null,message:''}
    : {ok:false,field:'pin',message:'6자리 비밀번호를 확인해 주세요.'};
}
const STATUS_LABELS={pending_review:'접수됨',needs_info:'내용 확인 필요',accepted:'확인 완료',visit_scheduled:'방문 예정',in_progress:'작업 중',completed:'작업 완료',billed:'청구 완료',paid:'처리 완료',on_hold:'확인 중',cancelled:'취소됨'};
function statusLabel(status){return STATUS_LABELS[status]||'확인 중';}
```

`validateRequest` and `buildCreatePayload` must match the server field names exactly and cap strings before transport.

- [ ] **Step 5: Implement fail-closed config and API client**

Create `office-api.json`:

```json
{"enabled":false,"apiUrl":""}
```

This is an intentional disabled default, not a deployment placeholder. `loadConfig()` rejects a URL unless it matches `^https://script\.google\.com/macros/s/[^/]+/exec$`. `call()` sends:

```js
const body={action,ts:Date.now(),payload:options.payload||{}};
if(options.sessionToken)body.sessionToken=options.sessionToken;
const response=await fetch(config.apiUrl,{
  method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'
});
```

Map server `ok:false` to a safe Korean message by error code. Never concatenate raw server stack text or the request body into the UI error.

- [ ] **Step 6: Run unit tests and commit**

```powershell
& $node --test tests\office-request.logic.test.cjs tests\office-request-api.test.cjs
git add office-api.json js/office-request-core.js js/office-request-api.js tests/office-request.logic.test.cjs tests/office-request-api.test.cjs
git commit -m "feat: add office portal API contract"
```

Expected: both test files pass.

---

### Task 2: Staff Login, Session, and Own-Office Dashboard

**Files:**

- Create: `tests/office-request-auth.e2e.cjs`
- Modify: `office-request.html`
- Modify: `css/office-request.css`
- Modify: `js/office-request.js`
- Modify: `tests/office-intake.e2e.cjs`

**Interfaces:**

- Consumes: Task 1 core/API and server `officeLogin`, `officeList`, `officeGet`.
- Produces:
  - session key `manmul_office_session_v1` containing `{token,office,expiresAt}` only.
  - login view `#officeLoginView`.
  - dashboard view `#officeDashboardView`.
  - `restoreSession()`, `saveSession(session)`, `clearSession()`, `loadDashboard()`.

- [ ] **Step 1: Write the failing authentication browser tests**

Create `tests/office-request-auth.e2e.cjs` with an in-process static/API test server or Playwright route interception. Verify:

- missing `?office=` shows “관리사무소 전용 주소를 확인해 주세요” and does not call the API;
- valid six-digit PIN calls `officeLogin` with the URL slug;
- successful login stores only token, office display data, and expiry in `sessionStorage`;
- list response renders only returned office requests;
- reload restores a valid session and calls `officeList` without asking for PIN;
- expired session is removed and returns to login;
- server `rate-limited` shows the ten-minute message;
- no request description, phone, or PIN appears in `localStorage` or stored session JSON;
- 390px viewport has no horizontal overflow and all visible action controls are at least 44px high.

- [ ] **Step 2: Run the auth test and verify it fails**

```powershell
$env:NODE_PATH='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& $node --test tests\office-request-auth.e2e.cjs
```

Expected: FAIL because the login and dashboard views do not exist.

- [ ] **Step 3: Replace the SMS HTML with explicit views**

Keep common header/footer and add static sections with no untrusted HTML templates:

- `#officeRouteError`
- `#officeLoginView` with read-only complex placeholder, six-digit PIN, submit, error, and phone fallback.
- `#officeDashboardView` with office name, new request button, pending/in-progress/completed filters, list container, sync status, and logout.
- `#officeCreateView` and `#officeDetailView`, initially hidden.

Update CSP:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-src 'none'; connect-src 'self' https://script.google.com https://script.googleusercontent.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'" />
```

Load scripts in order: core, API, photo, controller.

- [ ] **Step 4: Implement session lifecycle and safe rendering**

```js
const SESSION_KEY='manmul_office_session_v1';
function saveSession(s){
  sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:s.sessionToken,office:s.office,expiresAt:s.expiresAt}));
}
function restoreSession(){
  try{const s=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(!s||!s.token||Date.now()>=Number(s.expiresAt))return null;return s;}catch(_){return null;}
}
function clearSession(){sessionStorage.removeItem(SESSION_KEY);}
```

Render each request by creating DOM nodes and setting `textContent`. On `session-expired`, clear the session, hide private views, and focus the PIN input.

- [ ] **Step 5: Run auth and core tests; commit**

```powershell
& $node --test tests\office-request.logic.test.cjs tests\office-request-api.test.cjs tests\office-request-auth.e2e.cjs
git add office-request.html css/office-request.css js/office-request.js tests/office-request-auth.e2e.cjs tests/office-intake.e2e.cjs
git commit -m "feat: add management office login dashboard"
```

Expected: all tests pass and page errors are zero.

---

### Task 3: Request Create, Edit, Cancel, and Photo Retry

**Files:**

- Create: `js/office-request-photo.js`
- Create: `tests/office-request-workflow.e2e.cjs`
- Modify: `office-request.html`
- Modify: `css/office-request.css`
- Modify: `js/office-request.js`

**Interfaces:**

- Consumes: authenticated session and server `officeCreate`, `officeUpdate`, `officeCancel`, `officeUpload`.
- Produces:
  - `compressOfficePhoto(file: File): Promise<{name:string,mimeType:'image/jpeg',dataB64:string,bytes:number}>`
  - in-memory photo slots `{uploadId:string,compressed:object,state:'pending'|'sent'|'failed'}`; `uploadId` is created once per selected photo and is never persisted in browser storage.
  - `submitOfficeRequest(form: HTMLFormElement): Promise<object>`
  - `retryOfficePhotos(): Promise<boolean>`
  - `editOfficeRequest(requestId: string): Promise<boolean>`
  - `cancelOfficeRequest(requestId: string): Promise<boolean>`

- [ ] **Step 1: Write failing workflow tests**

Cover these cases with mocked API responses:

- required fields and consent focus the first invalid control;
- free-text complex input does not exist;
- create sends one UUID idempotency key and receives `MM-20260826-0001`;
- retry after network failure sends the same idempotency key and displays the same receipt;
- selected photos are uploaded sequentially only after create;
- every photo upload sends its own canonical UUID `uploadId`, and retrying a failed slot reuses that exact ID;
- one failed photo leaves the view at “접수 저장됨 · 사진 전송 필요” with a `사진 다시 보내기` button;
- retry sends only failed photo slots;
- six selected photos are rejected before API calls;
- GIF and a compressed image over 2 MiB are rejected;
- edit and cancel controls appear only for `pending_review` or `needs_info`;
- `accepted` requests cannot call `officeUpdate` or `officeCancel` from the UI.

- [ ] **Step 2: Run the workflow test and verify it fails**

Run `& $node --test tests\office-request-workflow.e2e.cjs`.

Expected: FAIL because create/photo workflow is absent.

- [ ] **Step 3: Implement deterministic photo compression**

`office-request-photo.js` must:

1. reject MIME outside JPEG/PNG/WebP;
2. decode with `createImageBitmap` when available and `Image` fallback otherwise;
3. scale longest side to at most 1600px;
4. draw to an offscreen canvas;
5. call `canvas.toBlob(..., 'image/jpeg', 0.82)`;
6. reject blob size over `2 * 1024 * 1024`;
7. return base64 without the `data:` prefix.

Do not put the original File or base64 in browser storage.

- [ ] **Step 4: Implement create and idempotent retry**

Generate `crypto.randomUUID()` once for the request idempotency key when the user first presses submit and keep it in the current controller object until the server returns or the user explicitly resets the form. Separately generate one `crypto.randomUUID()` for each accepted photo selection and keep it with that in-memory photo slot. Send the slot ID as `officeUpload.payload.uploadId` on both first upload and retry. Never generate a new request key or photo upload ID for a network retry, and never store either the original File or base64 in browser storage.

After `officeCreate` succeeds:

```js
currentDraft.requestId=result.requestId;
currentDraft.receiptNo=result.receiptNo;
setProgress('접수 저장됨 · 사진 전송 중');
await uploadPendingPhotos();
if(currentDraft.failedPhotos.length)setProgress('접수 저장됨 · 사진 전송 필요');
else setProgress('접수 완료 · '+result.receiptNo);
```

- [ ] **Step 5: Implement edit and cancel guards**

Check local status before calling the server, but rely on server rejection as the authority. Show “대표 확인 후에는 전화로 변경해 주세요” for `accepted` and later states. Cancel requires an explicit confirmation dialog and never deletes the local list row; it re-renders status `취소됨`. `officeUpdate` and `officeCancel` return only a minimal state result, so call `officeGet` after success instead of assuming a full request response.

- [ ] **Step 6: Run workflow, auth, and unit tests; commit**

```powershell
& $node --test tests\office-request.logic.test.cjs tests\office-request-api.test.cjs tests\office-request-auth.e2e.cjs tests\office-request-workflow.e2e.cjs
git add office-request.html css/office-request.css js/office-request.js js/office-request-photo.js tests/office-request-workflow.e2e.cjs
git commit -m "feat: submit office requests with photo retry"
```

Expected: all tests pass.

---

### Task 4: Progress Detail, Completion Report, Privacy, and Public Entry

**Files:**

- Modify: `office-request.html`
- Modify: `css/office-request.css`
- Modify: `js/office-request.js`
- Modify: `js/office-request-api.js`
- Modify: `office.html`
- Modify: `privacy.html`
- Modify: `tests/office-request-workflow.e2e.cjs`
- Modify: `tests/unified-brand-design.e2e.cjs`

**Interfaces:**

- Consumes: server `officeGet` response and authenticated `officePhoto({requestId,photoId})` response. The server must revalidate that the request belongs to the session office and that `photoId` is present in that request's explicit `completionReport.publicPhotoIds` allowlist before reading Drive.
- Produces: status timeline, visit display, public amount, public completion report, staff-only sales-page entry.

- [ ] **Step 1: Add failing detail/report/privacy tests**

Assert:

- `pending_review`, `visit_scheduled`, `in_progress`, `completed`, `billed`, `paid`, `on_hold`, and `cancelled` use the approved Korean labels;
- visit time appears only when present;
- amount appears only when `publicAmount` is a finite number;
- report renders only `completionReport.summary` and returned `publicPhotoIds`;
- bitmap requests are issued only for IDs returned in `completionReport.publicPhotoIds`; an unrelated or non-public ID is never requested or inferred;
- office/resident phone, internal cost, margin, and unrelated photo IDs are absent from the report;
- `office.html` says “관리사무소 직원 전용” and explains that each office receives a dedicated URL;
- privacy text names office contact, optional resident contact, photos, purpose, 90-day cancelled classification, one-year general retention, and legal retention for contract/tax evidence.

- [ ] **Step 2: Run tests and verify they fail**

```powershell
& $node --test tests\office-request-workflow.e2e.cjs tests\unified-brand-design.e2e.cjs
```

Expected: FAIL until detail and legal copy are present.

- [ ] **Step 3: Implement safe detail and report rendering**

Use a fixed status step list. Set text with `textContent`. For public photos, request only IDs returned in `completionReport.publicPhotoIds`; do not infer or enumerate other Drive files. Fetch each bitmap through authenticated `officePhoto` and accept only its validated JPEG/PNG/WebP base64 response for an in-memory `data:` image URL. Do not store image bytes or IDs in browser storage. Show an explicit empty state when a report is not yet public.

- [ ] **Step 4: Update `office.html` and privacy copy**

Keep the sales page primary action `업무 문의`. Add a secondary staff portal action to `office-request.html` and explain that actual staff use the supplied `?office=<slug>` URL. The no-slug portal remains fail-closed and asks staff to check their dedicated link.

- [ ] **Step 5: Run focused tests and commit**

```powershell
& $node --test tests\office-request-workflow.e2e.cjs tests\unified-brand-design.e2e.cjs
git add office-request.html css/office-request.css js/office-request.js office.html privacy.html tests/office-request-workflow.e2e.cjs tests/unified-brand-design.e2e.cjs
git commit -m "feat: show office request progress reports"
```

Expected: all focused tests pass.

---

### Task 5: Safe API Configuration, Pages Artifact, Full Regression, and Deployment Gate

**Files:**

- Create: `scripts/configure-office-api.mjs`
- Modify: `scripts/build-pages-artifact.mjs`
- Modify: `scripts/ensure-pages-artifact.mjs`
- Modify: `scripts/ensure-office-intake.mjs`
- Modify: `tests/office-intake.e2e.cjs`
- Modify: `office-api.json`

**Interfaces:**

- Consumes: the user-approved deployed Apps Script `/exec` URL.
- Produces: a secret-free Pages artifact and deployment readiness evidence; no production publish without separate approval.

- [ ] **Step 1: Write failing configuration and artifact tests**

Update `scripts/ensure-office-intake.mjs` to assert:

```js
check(/office-request-api\.js/.test(request), 'API client script missing');
check(/office-request-photo\.js/.test(request), 'photo client script missing');
check(/sessionStorage/.test(controller), 'session storage missing');
check(!/(localStorage|indexedDB)/.test(request + core + controller + apiClient), 'persistent browser storage used');
check(!/(APP_TOKEN|OFFICE_SESSION_SECRET|pinHash|pinSalt)/.test(request + core + controller + apiConfig), 'secret identifier leaked to public artifact');
check(/'office-api\.json'/.test(build), 'office-api.json missing from Pages allowlist');
check(!/office-request\.html/.test(sitemap), 'noindex portal entered sitemap');
```

Add a test that `configure-office-api.mjs` rejects non-HTTPS, non-Apps-Script, and non-`/exec` URLs, and rejects any `--token`, `--pin`, or `--secret` argument.

- [ ] **Step 2: Run the static checks and verify they fail**

```powershell
& $node scripts\ensure-office-intake.mjs
& $node scripts\ensure-pages-artifact.mjs
```

Expected: FAIL until new scripts and config are included.

- [ ] **Step 3: Implement the configuration tool**

`scripts/configure-office-api.mjs` accepts only:

```powershell
node scripts/configure-office-api.mjs --url $env:OFFICE_API_URL --enable
node scripts/configure-office-api.mjs --disable
```

It validates the exact Apps Script URL pattern and writes formatted JSON `{ "enabled": true, "apiUrl": ".../exec" }` or the fail-closed disabled JSON. It must terminate with an error when argument names contain `token`, `pin`, or `secret`.

- [ ] **Step 4: Include all portal files in the Pages artifact**

Add `office-api.json`, `js/office-request-api.js`, and `js/office-request-photo.js` to the explicit allowlist. Ensure the build never copies `.env`, Apps Script source, test fixtures, or configuration command history.

- [ ] **Step 5: Run the full portal regression**

```powershell
$env:NODE_PATH='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& $node --test tests\office-request.logic.test.cjs tests\office-request-api.test.cjs tests\office-request-auth.e2e.cjs tests\office-request-workflow.e2e.cjs tests\office-intake.e2e.cjs tests\unified-brand-design.e2e.cjs
& $node scripts\ensure-office-intake.mjs
& $node scripts\ensure-pages-artifact.mjs
& $node scripts\build-pages-artifact.mjs
git diff --check
```

Expected: all tests and static checks pass, artifact creation exits 0, and an artifact scan finds no `APP_TOKEN`, PIN, session secret, real session token, or contact fixture outside tests.

- [ ] **Step 6: Commit the deployment-ready portal**

```powershell
git add scripts/configure-office-api.mjs scripts/build-pages-artifact.mjs scripts/ensure-pages-artifact.mjs scripts/ensure-office-intake.mjs tests/office-intake.e2e.cjs office-api.json
git commit -m "chore: prepare management office portal release"
```

- [ ] **Step 7: Stop before account configuration and deployment**

Report commits, tests, and the disabled/enabled state of `office-api.json`. Do not insert the live `/exec` URL, generate office URLs or PINs, push, merge, or deploy GitHub Pages without separate explicit approval. After approval, configure the public URL, deploy the static site, and perform a real PC/mobile login→create→photo→hyeonjang approve→status→report test.
