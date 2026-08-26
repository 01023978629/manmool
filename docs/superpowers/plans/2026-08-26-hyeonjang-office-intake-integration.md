# Hyeonjang Office Intake Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable management-office inbox to the hyeonjang PWA and convert approved requests into the existing `aptOrders` workflow without duplicates.

**Architecture:** The PWA reads intake requests through new internal relay actions, stores a small inbox/outbox sync state inside normal hyeonjang data, and creates an `aptOrders` entry only after explicit owner approval. Every server write is idempotent through `sourceRequestId`; offline status updates remain in an outbox until the relay confirms them.

**Tech Stack:** Static single-file PWA (`index.html`), existing Apps Script relay client, IndexedDB/local state, Google Drive file IDs, service worker, Node.js, Playwright, mock relay.

**Spec:** `docs/superpowers/specs/2026-08-26-office-hyeonjang-integration-design.md`

## Global Constraints

- Repository: `hyeonjang`; create a clean isolated worktree from current `origin/main` (`hyeonjang-v229-mobileback` or newer). Never edit the dirty `fix/heic-photo-persistence` checkout.
- This plan starts only after `2026-08-26-office-intake-server.md` focused tests pass and the server action contract is stable.
- Reuse the existing `relayCall(action, payload)` function; never place `APP_TOKEN` in office request data or UI.
- Preserve `serializeData()` revision behavior, Drive save conflict handling, photo persistence, and all existing `aptOrders` fields.
- A request creates at most one order: `sourceRequestId` is the idempotency key on the PWA side.
- The owner must explicitly approve a request before it enters `aptOrders`.
- General intake notifications are in-app; urgent Calendar creation is server-side and must not block receipt storage.
- User input must pass through `escapeHtml`/`escapeAttr` before HTML rendering.
- Status updates may queue offline; do not report server synchronization until an `ok:true` response arrives.
- Update `APP_BUILD` and the `sw.js` cache marker together and verify the live marker after deployment.
- Use TDD for each task and make one reviewable commit per task.

---

## File Structure

### Create

- `tests/office-intake-order.e2e.js`: request-to-order mapping, duplicate guard, state persistence.
- `tests/office-intake-sync.e2e.js`: relay inbox, offline outbox, retry, status mapping.
- `tests/office-intake-ui.e2e.js`: mobile inbox badge, approval, hold, information request, tenant-safe rendering.

### Modify

- `index.html`: intake state, relay calls, inbox UI, order conversion, status outbox, photo/report/admin controls.
- `tests/mock-relay.js`: deterministic office inbox and status action fixtures.
- `tests/relay.e2e.js`: new internal relay action regression.
- `tests/apt-orders.e2e.js`: preserve manual order behavior with extended fields.
- `privacy.html`: internal handling of management-office contact and optional resident contact.
- `terms.html`: clarify operational status sharing boundary if existing terms describe third-party access.
- `sw.js`: synchronized cache marker.
- `tests/version-sync.check.js`: verify the new shell/cache marker pair.

### Do Not Modify

- Existing manual `aptOrders` records or their status values: `recv`, `visit`, `work`, `done`, `billed`, `paid`.
- Existing Drive photo bytes or project assignments.
- Existing queue receipts for normal relay uploads.

---

### Task 1: Intake State and Idempotent Request-to-Order Mapping

**Files:**

- Create: `tests/office-intake-order.e2e.js`
- Modify: `index.html`
- Modify: `tests/apt-orders.e2e.js`

**Interfaces:**

- Consumes: server request schema from `2026-08-26-office-intake-server.md`.
- Produces:
  - `officeIntakeData(): {inbox:object[], cursor:string, outbox:object[], lastSyncAt:string, lastError:string}`
  - `officeIntakeFindRequest(requestId: string): object|null`
  - `officeIntakeFindOrder(requestId: string): object|null`
  - `officeIntakeOrderFromRequest(request: object, projectName?: string): object`
  - `officeIntakeStatusToApt(status: string): string`
  - persisted `state.officeIntake` and extended `state.aptOrders` fields.

- [ ] **Step 1: Write the failing mapping and persistence browser test**

Create `tests/office-intake-order.e2e.js` using the same server and Playwright pattern as `tests/apt-orders.e2e.js`. Seed one request and assert:

```js
const result = await page.evaluate(() => {
  state.aptOffices = [{ id: 'of1', complex: '예시 아파트', manager: '김소장', phone: '010-1111-2222' }];
  state.aptOrders = [];
  state.officeIntake = { inbox: [], cursor: '', outbox: [], lastSyncAt: '', lastError: '' };
  const request = {
    requestId: 'req-1', receiptNo: 'MM-20260826-0001', officeId: 'of1',
    unit: '103동 1204호', location: '욕실 천장', issueType: '누수', pipeType: '미확정',
    urgency: 'urgent', description: '천장에서 물이 떨어집니다.',
    officeContact: { name: '김소장', phone: '010-1111-2222' }, residentContact: null,
    preferredVisitDate: '2026-08-27', photos: [{ fileId: 'photo-1', name: 'MM-20260826-0001_01.jpg', mimeType: 'image/jpeg' }],
    status: 'pending_review'
  };
  const order = officeIntakeOrderFromRequest(request, '예시 아파트 103동 1204호');
  state.aptOrders.push(order);
  return {
    order,
    duplicate: officeIntakeFindOrder('req-1').id,
    serialized: serializeData().officeIntake,
  };
});
assert(result.order.source === 'office-intake', 'source field');
assert(result.order.sourceRequestId === 'req-1', 'sourceRequestId field');
assert(result.order.officeId === 'of1', 'office mapping');
assert(result.order.status === 'recv', 'initial apt status');
assert(result.order.intakePhotoIds[0] === 'photo-1', 'photo ID');
assert(result.duplicate === result.order.id, 'duplicate lookup');
assert(Array.isArray(result.serialized.outbox), 'officeIntake persisted');
```

Also assert that the existing manual order fixture without `sourceRequestId` still renders.

- [ ] **Step 2: Run the focused test and verify it fails**

Start the existing static server, run the test, and stop the server:

```powershell
$node='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$server=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try { & $node tests\office-intake-order.e2e.js } finally { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
```

Expected: FAIL because `officeIntakeOrderFromRequest` is undefined.

- [ ] **Step 3: Add the intake state and status mapping**

Add near the existing `aptData()` helpers:

```js
function officeIntakeData(){
  if(!state.officeIntake||typeof state.officeIntake!=='object')state.officeIntake={};
  const d=state.officeIntake;
  if(!Array.isArray(d.inbox))d.inbox=[];
  if(!Array.isArray(d.outbox))d.outbox=[];
  d.cursor=String(d.cursor||'');d.lastSyncAt=String(d.lastSyncAt||'');d.lastError=String(d.lastError||'');
  return d;
}
const OFFICE_TO_APT_STATUS={accepted:'recv',visit_scheduled:'visit',in_progress:'work',completed:'done',billed:'billed',paid:'paid'};
const APT_TO_OFFICE_STATUS={recv:'accepted',visit:'visit_scheduled',work:'in_progress',done:'completed',billed:'billed',paid:'paid'};
function officeIntakeStatusToApt(status){return OFFICE_TO_APT_STATUS[status]||'recv';}
function officeIntakeFindRequest(id){return officeIntakeData().inbox.find(x=>x&&x.requestId===id)||null;}
function officeIntakeFindOrder(id){return (state.aptOrders||[]).find(x=>x&&x.sourceRequestId===id)||null;}
```

- [ ] **Step 4: Implement the request-to-order mapper**

```js
function officeIntakeOrderFromRequest(r,projectName){
  if(!r||!r.requestId)throw new Error('접수번호가 없습니다');
  const existing=officeIntakeFindOrder(r.requestId);if(existing)return existing;
  return {
    id:uid(),officeId:r.officeId,unit:String(r.unit||r.location||'').trim(),
    text:String(r.description||r.issueType||'').trim(),amount:0,pipeType:aptPipeType(r.pipeType),
    date:localDate(),status:'recv',doneAt:'',project:projectName||'',
    source:'office-intake',sourceRequestId:r.requestId,receiptNo:String(r.receiptNo||''),
    officeContactName:String((r.officeContact||{}).name||''),
    officeContactPhone:String((r.officeContact||{}).phone||''),
    residentContact:r.residentContact||null,urgency:r.urgency==='urgent'?'urgent':'normal',
    location:String(r.location||''),preferredVisitDate:String(r.preferredVisitDate||''),
    intakePhotoIds:(r.photos||[]).map(p=>p&&p.fileId).filter(Boolean).slice(0,5)
  };
}
```

- [ ] **Step 5: Persist `officeIntake` without breaking old data**

Add `officeIntake:officeIntakeData()` to `serializeData()`. In `applyData()`, accept `data.officeIntake` only if it is an object and keep the current local value when the key is absent. Add `officeIntake` to schema validation without requiring it for old backups.

- [ ] **Step 6: Run focused and existing apt-order tests**

```powershell
$server=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try {
  & $node tests\office-intake-order.e2e.js
  & $node tests\apt-orders.e2e.js
  & $node tests\syntax.check.js
} finally { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the data contract**

```powershell
git add index.html tests/office-intake-order.e2e.js tests/apt-orders.e2e.js
git commit -m "feat: map office intake to apartment orders"
```

---

### Task 2: Relay Inbox Sync and Durable Outbox

**Files:**

- Create: `tests/office-intake-sync.e2e.js`
- Modify: `index.html`
- Modify: `tests/mock-relay.js`
- Modify: `tests/relay.e2e.js`

**Interfaces:**

- Consumes: `relayCall`, `relayReady`, `officeIntakeData`, server internal actions.
- Produces:
  - `cloudOfficeInbox(cursor: string): Promise<object>`
  - `cloudOfficeAccept(requestId: string, orderId: string): Promise<object>`
  - `cloudOfficeSetStatus(payload: object): Promise<object>`
  - `officeIntakeSync(): Promise<boolean>`
  - `officeIntakeQueue(action: string, payload: object): void`
  - `officeIntakeFlush(): Promise<number>`

- [ ] **Step 1: Extend the mock relay with deterministic office fixtures**

Add mock state:

```js
officeRequests: [{
  requestId:'req-1',receiptNo:'MM-20260826-0001',officeId:'of1',unit:'103동 1204호',
  location:'욕실 천장',issueType:'누수',pipeType:'미확정',urgency:'normal',
  description:'천장에서 물이 떨어집니다.',officeContact:{name:'김소장',phone:'010-1111-2222'},
  residentContact:null,preferredVisitDate:'2026-08-27',photos:[],status:'pending_review',updatedAt:'2026-08-26T09:00:00+09:00'
}],
officeAccepts: [],
officeStatuses: []
```

Implement mock `officeInbox`, `officeAccept`, and `officeSetStatus` responses with the same idempotency rules as the server plan.

- [ ] **Step 2: Write the failing sync/outbox test**

In `tests/office-intake-sync.e2e.js`, configure the relay to the mock, call `officeIntakeSync()`, and assert one inbox record and cursor. Then force `fetch` to reject, call `officeIntakeQueue('officeSetStatus', payload)`, restore fetch, call `officeIntakeFlush()`, and assert the mock received one status and the outbox is empty.

```js
const afterSync = await page.evaluate(async () => {
  await officeIntakeSync();
  const d=officeIntakeData();return {n:d.inbox.length,cursor:d.cursor,error:d.lastError};
});
assert(afterSync.n===1,'inbox count');
assert(afterSync.cursor,'cursor stored');
assert(afterSync.error==='','sync error cleared');
```

- [ ] **Step 3: Run the focused test and verify it fails**

```powershell
$static=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
$mock=Start-Process -FilePath $node -ArgumentList 'tests/mock-relay.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try { & $node tests\office-intake-sync.e2e.js }
finally {
  Stop-Process -Id $static.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $mock.Id -ErrorAction SilentlyContinue
}
```

Expected: FAIL because `cloudOfficeInbox` is undefined.

- [ ] **Step 4: Add internal relay wrappers**

```js
function cloudOfficeInbox(cursor){return relayCall('officeInbox',{updatedAfter:cursor||''});}
function cloudOfficeAccept(requestId,orderId){return relayCall('officeAccept',{requestId:requestId,hyeonjangOrderId:orderId});}
function cloudOfficeSetStatus(payload){return relayCall('officeSetStatus',payload);}
function cloudOfficeAdmin(action,payload){return relayCall(action,payload||{});}
```

- [ ] **Step 5: Implement inbox merge and durable outbox**

Merge inbox records by `requestId`, keeping the newest `updatedAt`. Never remove a local record merely because a paged response omits it. Queue entries are `{id,action,payload,createdAt,attempts,lastError}` and live in `state.officeIntake.outbox`, so normal `markDirty()` persists them through the existing save flow.

`officeIntakeFlush()` processes oldest first, removes only confirmed `ok:true` entries, increments `attempts` on errors, and leaves unauthorized errors visible in `lastError` instead of retrying continuously.

- [ ] **Step 6: Run focused relay tests and commit**

```powershell
$static=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
$mock=Start-Process -FilePath $node -ArgumentList 'tests/mock-relay.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try {
  & $node tests\office-intake-sync.e2e.js
  & $node tests\relay.e2e.js
} finally {
  Stop-Process -Id $static.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $mock.Id -ErrorAction SilentlyContinue
}
git add index.html tests/mock-relay.js tests/relay.e2e.js tests/office-intake-sync.e2e.js
git commit -m "feat: sync management office inbox"
```

Expected: focused and relay tests exit 0.

---

### Task 3: Inbox Badge, Review Actions, and Order Approval UI

**Files:**

- Create: `tests/office-intake-ui.e2e.js`
- Modify: `index.html`

**Interfaces:**

- Consumes: Task 1 mapping and Task 2 inbox sync.
- Produces:
  - `officeIntakePending(): object[]`
  - `officeIntakeOpen(): void`
  - `officeIntakeAccept(requestId: string, projectMode: 'none'|'existing'|'new', projectName?: string): Promise<boolean>`
  - `officeIntakeNeedsInfo(requestId: string): Promise<boolean>`
  - `officeIntakeHold(requestId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing mobile UI test**

Seed two pending requests and assert:

- the `아파트 오더` entry displays `신규 2`;
- a `pending_review` request older than 24 hours displays `24시간 이상 미확인`;
- opening the inbox shows receipt, escaped unit/location/description, urgency, contact call button, and photo count;
- clicking `오더 등록` once creates one order;
- clicking it again does not create a second order;
- `내용 보완 요청` and `보류` enqueue the correct server status action;
- injected description `<img src=x onerror=window.__xss=1>` appears as text and `window.__xss` stays undefined;
- viewport 390×844 has no horizontal overflow.

- [ ] **Step 2: Run the UI test and verify it fails**

```powershell
$static=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try { & $node tests\office-intake-ui.e2e.js }
finally { Stop-Process -Id $static.Id -ErrorAction SilentlyContinue }
```

Expected: FAIL because `officeIntakeOpen` and the badge do not exist.

- [ ] **Step 3: Add the pending count and inbox view**

```js
function officeIntakePending(){
  return officeIntakeData().inbox.filter(r=>r&&['pending_review','needs_info','on_hold'].includes(r.status));
}
```

Add `신규 N` next to the existing `🏢 아파트 오더` label without removing the manual order entry. Show `24시간 이상 미확인` on server-marked overdue rows and include the overdue count in the badge accessible label. Build request rows with `escapeHtml` and `escapeAttr`; no unescaped request value may enter template HTML.

- [ ] **Step 4: Implement explicit approval**

On approval:

1. Return the existing order when `sourceRequestId` already exists.
2. Optionally select an existing project or create a new project through existing project helpers.
3. Build the order with `officeIntakeOrderFromRequest`.
4. Push exactly one order, call `markDirty()`, then call `cloudOfficeAccept`.
5. If the server call fails, queue `officeAccept` with the same request and order IDs.
6. Update local request status to `accepted` only after the local order exists.

- [ ] **Step 5: Implement information request and hold**

`officeIntakeNeedsInfo` asks for a short reason capped at 300 characters and queues status `needs_info`. `officeIntakeHold` queues `on_hold`. Neither action deletes the request or creates an order.

- [ ] **Step 6: Run UI, syntax, and manual-order tests; commit**

```powershell
$static=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try {
  & $node tests\office-intake-ui.e2e.js
  & $node tests\apt-orders.e2e.js
  & $node tests\menu-integrity.e2e.js
  & $node tests\syntax.check.js
} finally { Stop-Process -Id $static.Id -ErrorAction SilentlyContinue }
git add index.html tests/office-intake-ui.e2e.js
git commit -m "feat: review office requests in hyeonjang"
```

Expected: all tests exit 0 and no browser page errors occur.

---

### Task 4: Status Publishing, Intake Photos, Completion Report, and Office Access Settings

**Files:**

- Modify: `index.html`
- Modify: `tests/office-intake-sync.e2e.js`
- Modify: `tests/apt-photos.e2e.js`
- Modify: `tests/apt-order-approval.e2e.js`

**Interfaces:**

- Consumes: existing `APT_STAT`, thumbnail relay, `state.files`, Task 2 outbox, server admin actions.
- Produces:
  - `officeIntakeQueueOrderStatus(order: object): void`
  - `officeIntakeAttachPhotos(request: object, order: object, projectName?: string): number`
  - `officeIntakeCompletionPayload(order: object): object`
  - `officeIntakeOfficeAccess(officeId: string): Promise<void>`

- [ ] **Step 1: Add failing status, photo, report, and session-revocation tests**

Assert that changing an intake-derived order from `recv` to `visit` queues:

```js
{
  action:'officeSetStatus',
  payload:{requestId:'req-1',status:'visit_scheduled',visitAt:'2026-08-27T10:00:00+09:00'}
}
```

Assert that manual orders create no office outbox entry. Assert intake photos become virtual `state.files` items with `_driveId`, `kind:'photo'`, and the selected project. Assert the completion payload includes only summary, explicitly public amount, and selected photo IDs. Assert rotating a PIN shows it once and increments the server session version through the mock.

- [ ] **Step 2: Run focused tests and verify they fail**

```powershell
$static=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
$mock=Start-Process -FilePath $node -ArgumentList 'tests/mock-relay.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try {
  & $node tests\office-intake-sync.e2e.js
  & $node tests\apt-photos.e2e.js
  & $node tests\apt-order-approval.e2e.js
} finally {
  Stop-Process -Id $static.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $mock.Id -ErrorAction SilentlyContinue
}
```

Expected: FAIL because `officeIntakeQueueOrderStatus` or the photo attachment helper is missing.

- [ ] **Step 3: Publish order status changes**

Hook the existing `.apoStat` handler after the local order status is changed and `markDirty()` is called:

```js
function officeIntakeQueueOrderStatus(o){
  if(!o||o.source!=='office-intake'||!o.sourceRequestId)return;
  officeIntakeQueue('officeSetStatus',{
    requestId:o.sourceRequestId,status:APT_TO_OFFICE_STATUS[o.status]||'accepted',
    visitAt:o.visitAt||null,publicAmount:o.publicAmount==null?null:num(o.publicAmount),
    completionReport:(o.status==='done'||o.status==='billed'||o.status==='paid')?officeIntakeCompletionPayload(o):null
  });
}
```

The queue must flush after normal cloud save succeeds and when the user presses a visible `다시 동기화` action.

- [ ] **Step 4: Attach intake photos without duplicating Drive bytes**

Create virtual `state.files` records only when `_driveId` is not already present. Use the server-generated photo name, `kind:'photo'`, selected project, `_driveId:fileId`, `_relayLink:'relay:'+fileId`, and a work label `관리사무소 접수`. Never download and re-upload the image.

- [ ] **Step 5: Add explicit public report fields**

Add `publicAmount` and `publicPhotoIds` controls to intake-derived orders only. Default both to private. `officeIntakeCompletionPayload` returns:

```js
{
  summary:String(order.completionSummary||order.text||'').slice(0,800),
  photoIds:(order.publicPhotoIds||[]).filter(id=>(order.intakePhotoIds||[]).includes(id)).slice(0,10)
}
```

Do not include phone, resident name, internal cost, margin, or unrelated project photos.

- [ ] **Step 6: Add office access administration**

In the existing `아파트 오더` office list, add `접수 주소·비밀번호` per office. It calls `officeAdminUpsert` with the stable `aptOffices.id`, then allows `officeRotatePin` and `officeDisable`. Display a generated PIN once in a copyable read-only field; never persist it to state or logs.

Add a `보존기간 확인` action that calls internal `officeRetentionList` and displays receipt number, office, status, reason, and eligible date for human review. This phase must not expose a delete button or delete data automatically. Show sanitized `operationalErrors` from inbox sync in the existing sync/error area without contact details or request descriptions.

- [ ] **Step 7: Run focused tests and commit**

```powershell
$static=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
$mock=Start-Process -FilePath $node -ArgumentList 'tests/mock-relay.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try {
  & $node tests\office-intake-sync.e2e.js
  & $node tests\apt-photos.e2e.js
  & $node tests\apt-order-approval.e2e.js
  & $node tests\syntax.check.js
} finally {
  Stop-Process -Id $static.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $mock.Id -ErrorAction SilentlyContinue
}
git add index.html tests/office-intake-sync.e2e.js tests/apt-photos.e2e.js tests/apt-order-approval.e2e.js
git commit -m "feat: publish office order progress safely"
```

Expected: all focused tests exit 0.

---

### Task 5: Privacy, Versioning, Full Regression, and Hyeonjang Deployment Gate

**Files:**

- Modify: `privacy.html`
- Modify: `terms.html`
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `tests/privacy.e2e.js`
- Modify: `tests/version-sync.check.js`

**Interfaces:**

- Consumes: all previous hyeonjang tasks.
- Produces: version-synchronized, tested, deployment-ready static build; no deployment without separate approval.

- [ ] **Step 1: Add failing privacy and version tests**

Require privacy text to name management-office contact, optional resident contact, purpose, one-year general retention, 90-day cancelled-request classification, and separate legal retention for contract/tax evidence. Require `APP_BUILD` and the `sw.js` cache marker to match exactly.

- [ ] **Step 2: Run tests and observe the expected failures**

```powershell
& $node tests\privacy.e2e.js
& $node tests\version-sync.check.js
```

Expected: FAIL until content and markers are updated.

- [ ] **Step 3: Update legal copy and build markers**

Add plain Korean disclosure without exposing internal tokens or server details. For the verified `origin/main` v229 baseline, use the exact build marker `hyeonjang-v230-officeintake` in both `index.html` and `sw.js`. If `origin/main` has advanced beyond v229 before execution, stop and update this plan to the next non-conflicting version before editing; never reuse the stale local `v195` marker.

- [ ] **Step 4: Run focused and broad regressions**

Run at minimum:

```powershell
& $node tests\syntax.check.js
& $node tests\version-sync.check.js
& $node tests\sw-cache.check.js
git diff --check
```

Run the browser tests under explicit server lifetimes:

```powershell
$static=Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
$mock=Start-Process -FilePath $node -ArgumentList 'tests/mock-relay.js' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
try {
  & $node tests\privacy.e2e.js
  & $node tests\office-intake-order.e2e.js
  & $node tests\office-intake-sync.e2e.js
  & $node tests\office-intake-ui.e2e.js
  & $node tests\apt-orders.e2e.js
  & $node tests\apt-photos.e2e.js
  & $node tests\apt-order-approval.e2e.js
  & $node tests\relay.e2e.js
} finally {
  Stop-Process -Id $static.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $mock.Id -ErrorAction SilentlyContinue
}
```

Expected: every command exits 0, no page errors, and no secret values in output.

- [ ] **Step 5: Commit the deployment-ready hyeonjang build**

```powershell
git add index.html sw.js privacy.html terms.html tests/privacy.e2e.js tests/version-sync.check.js
git commit -m "chore: prepare office intake hyeonjang release"
```

- [ ] **Step 6: Stop before deployment**

Report commits, test counts, the target build marker, and the Apps Script deployment prerequisite. Do not push, merge, deploy GitHub Pages, clear caches, or change live Script Properties without separate explicit approval. After approval, verify live `sw.js`, live `index.html`, and the internal `officeInbox` contract against the same Apps Script deployment.
