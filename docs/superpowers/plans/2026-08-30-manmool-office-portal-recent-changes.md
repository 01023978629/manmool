# Manmool Office Portal Recent Changes R1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리사무소 직원이 현재 탭에서 수동 새로고침 전후에 새로 확인된 접수와 상태·내용 변경을 안전하게 확인하게 한다.

**Architecture:** 기존 `officeList` 공개 응답을 클라이언트 메모리에서만 정규화해 직전 성공 스냅샷과 비교한다. 비교·중복 제거·표현 분류는 `office-request-core.js`의 순수 함수로 두고, 세션·요청 세대·DOM 렌더링은 `office-request.js`가 담당한다. 서버, API action, Apps Script, hyeonjang 데이터 계약은 변경하지 않는다.

**Tech Stack:** 정적 HTML/CSS, 브라우저 JavaScript UMD 모듈, Node.js `node:test`, Playwright Chromium, GitHub Actions Pages workflow

**Spec:** `docs/superpowers/specs/2026-08-30-manmool-office-portal-recent-changes-design.md`

## Global Constraints

- 구현 기준은 `origin/main`의 `aadf328f159596d23d4ca521b69a53655aa6227e`다.
- 작업 위치는 기존 dirty `manmool/main`이 아니라 별도 clean worktree다.
- 사용자가 누른 `목록 새로고침`만 `officeList`를 한 번 호출한다. 자동 polling, `visibilitychange`, 온라인 복귀 조회와 Browser Notification을 추가하지 않는다.
- 첫 성공 조회는 기준만 만들고 변경 0건으로 표시한다.
- 비교 키의 정본은 `requestId`다. 기존 공개 응답·fixture 호환을 위해 현재 `requestId(item)`의 `id` fallback을 canonical `requestId`로만 정규화하고 화면에는 fallback ID를 표시하지 않는다.
- 비교 스냅샷의 허용 필드는 `requestId`, `status`, 유효한 `updatedAt` 밀리초뿐이다.
- 최근 변경 화면의 허용 필드는 인증된 단지의 `receiptNo`, 동·호/공용 위치, 현재 상태 또는 변경 종류, 변경 시각뿐이다.
- 최근 변경은 최대 10건이다. `officeList`의 최근 50건 창 때문에 새 ID의 문구는 `이번 새로고침에서 새로 확인`으로 고정한다.
- R1 비교 자료는 JavaScript 변수에만 둔다. 기존 인증 세션의 `sessionStorage`는 유지하지만 R1 자료를 `localStorage`, `sessionStorage`, IndexedDB, Cache API, URL, history state, console, analytics 또는 clipboard에 쓰지 않는다.
- `office-request-api.js`, `office-request-photo.js`, `office-api.json`, `privacy.html`, `apps-script-contract/*`, Apps Script, hyeonjang과 `_현장.json`은 변경하지 않는다.
- 실제 PIN·운영 접수·연락처를 테스트하지 않고 합성 fixture만 사용한다.
- 변경 CSS·core·controller의 HTML query marker는 모두 `20260830-office-recent1`이다.
- push, PR, merge, Pages 배포와 운영 설정 변경은 구현 완료 보고 뒤 별도 사용자 승인을 받는다.

## File Structure

- Modify: `js/office-request-core.js` — 목록 정규화, 스냅샷 비교와 변경 라벨 순수 함수
- Modify: `tests/office-request.logic.test.cjs` — 순수 함수의 경계·중복·시각·정렬 계약
- Modify: `office-request.html` — 수동 새로고침과 최근 변경의 접근 가능한 문서 구조
- Modify: `css/office-request.css` — 모바일·44px 조작 영역·긴 텍스트·최근 변경 카드
- Modify: `js/office-request.js` — 메모리 상태, 수동 조회, 세대 검사, 오류·세션 정리와 DOM 렌더링
- Create: `tests/office-request-recent-changes.e2e.cjs` — 실제 Chromium의 R1 사용자 흐름
- Modify: `tests/office-request-auth.e2e.cjs` — 로그아웃·세션 만료·slug 변경의 R1 정리 회귀
- Modify: `tests/office-intake.e2e.cjs` — 정적 소스·cache marker·workflow 순서 계약
- Modify: `scripts/ensure-office-intake.mjs` — 자동 조회·외부 알림·영구 저장 금지 검사
- Modify: `.github/workflows/deploy-pages.yml` — 새 E2E를 기존 포털 회귀 단계에 포함

## Execution Runtime

모든 PowerShell 예시에서 다음 변수명을 사용한다.

```powershell
$taskNode = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$taskNodeModules = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$taskPython = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$env:NODE_PATH = $taskNodeModules
```

---

### Task 1: Pure Recent-Change Comparison Contract

**Files:**
- Modify: `js/office-request-core.js:4-68`
- Modify: `tests/office-request.logic.test.cjs:1-109`

**Interfaces:**
- Consumes: `Array<object>` from `officeList`, one finite `validationNow` epoch millisecond
- Produces: `normalizeRecentList(rows, validationNow) -> { ok: boolean, rows: object[], snapshot: SnapshotEntry[] }`
- Produces: `diffRecentSnapshots(previous, current) -> { total: number, changes: ChangeEntry[] }`
- Produces: `recentChangeLabel(change) -> string`
- `SnapshotEntry`: `{ requestId: string, status: string, updatedAtMs: number|null }`
- `ChangeEntry`: `{ requestId: string, kind: 'appeared'|'status'|'updated', status: string, updatedAtMs: number|null }`

- [ ] **Step 1: Verify the isolated baseline before editing**

Run:

```powershell
git status --short --branch
& $taskNode --test tests\office-request.logic.test.cjs
```

Expected: branch is the isolated feature branch, status has no unexpected files, existing 8 logic tests pass with 0 failures.

- [ ] **Step 2: Append failing normalization and diff tests**

Append this contract to `tests/office-request.logic.test.cjs`:

```javascript
const RECENT_NOW = Date.parse('2026-08-30T12:00:00.000Z');
const recentRow = (requestId, status, updatedAt, extra = {}) => ({
  requestId, receiptNo: `MM-${requestId}`, unit: '101동 1203호', location: '공용 배관실',
  status, updatedAt, ...extra,
});

test('최초 목록은 비교 기준만 만들 수 있는 최소 스냅샷으로 정규화한다', () => {
  const row = recentRow('req-1', 'pending_review', '2026-08-30T09:00:00.000Z', {
    description: '스냅샷에 들어가면 안 되는 설명', officeContact: { phone: '010-1111-2222' },
  });
  const result = api.normalizeRecentList([row], RECENT_NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot, [{ requestId: 'req-1', status: 'pending_review', updatedAtMs: Date.parse(row.updatedAt) }]);
  assert.equal('description' in result.snapshot[0], false);
  assert.equal('officeContact' in result.snapshot[0], false);
  assert.equal(api.diffRecentSnapshots(null, result.snapshot).total, 0);
});

test('새 ID와 상태 변경 및 유효한 시각 증가만 최근 변경으로 판정한다', () => {
  const previous = [
    { requestId: 'req-1', status: 'pending_review', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    { requestId: 'req-2', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T09:30:00.000Z') },
    { requestId: 'req-3', status: 'in_progress', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
  ];
  const current = [
    { requestId: 'req-4', status: 'pending_review', updatedAtMs: Date.parse('2026-08-30T11:00:00.000Z') },
    { requestId: 'req-1', status: 'needs_info', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    { requestId: 'req-2', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:30:00.000Z') },
    { requestId: 'req-3', status: 'in_progress', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
  ];
  assert.deepEqual(api.diffRecentSnapshots(previous, current), {
    total: 3,
    changes: [
      { requestId: 'req-4', kind: 'appeared', status: 'pending_review', updatedAtMs: Date.parse('2026-08-30T11:00:00.000Z') },
      { requestId: 'req-2', kind: 'updated', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:30:00.000Z') },
      { requestId: 'req-1', kind: 'status', status: 'needs_info', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    ],
  });
});

test('사라진 ID와 과거 시각 및 무효와 유효 사이 전환은 변경으로 추론하지 않는다', () => {
  const previous = [
    { requestId: 'gone', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
    { requestId: 'older', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
    { requestId: 'invalid-transition', status: 'accepted', updatedAtMs: null },
  ];
  const current = [
    { requestId: 'older', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    { requestId: 'invalid-transition', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T11:00:00.000Z') },
  ];
  assert.deepEqual(api.diffRecentSnapshots(previous, current), { total: 0, changes: [] });
});

test('중복 ID는 유효한 최신 행 하나를 선택하고 입력을 수정하지 않는다', () => {
  const rows = [
    recentRow('duplicate', 'accepted', 'not-a-time', { marker: 'first' }),
    recentRow('duplicate', 'visit_scheduled', '2026-08-30T10:00:00.000Z', { marker: 'second' }),
    recentRow('duplicate', 'completed', '2026-08-30T09:00:00.000Z', { marker: 'third' }),
  ];
  const before = JSON.stringify(rows);
  const result = api.normalizeRecentList(rows, RECENT_NOW);
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].marker, 'second');
  assert.deepEqual(result.snapshot, [{ requestId: 'duplicate', status: 'visit_scheduled', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') }]);
  assert.equal(JSON.stringify(rows), before);
  const allInvalid = api.normalizeRecentList([
    recentRow('invalid-duplicate', 'accepted', 'bad-time', { marker: 'keep-first' }),
    recentRow('invalid-duplicate', 'completed', 'also-bad', { marker: 'drop-second' }),
  ], RECENT_NOW);
  assert.equal(allInvalid.rows[0].marker, 'keep-first');
});

test('legacy id는 canonical requestId로만 정규화하고 잘못된 행은 안전하게 거른다', () => {
  const result = api.normalizeRecentList([
    { id: 'legacy-1', status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: '   ', id: 'legacy-blank-primary', status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: '', status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: 'x'.repeat(121), status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: 'bad-status', status: 'not-contracted', updatedAt: '2026-08-30T10:00:00.000Z' },
  ], RECENT_NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot, [
    { requestId: 'legacy-1', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
    { requestId: 'legacy-blank-primary', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
  ]);
  assert.equal(result.rows[0].id, 'legacy-1');
});

test('비어 있지 않은 전부 무효 응답은 실패하고 진짜 빈 배열은 유효하다', () => {
  assert.deepEqual(api.normalizeRecentList([], RECENT_NOW), { ok: true, rows: [], snapshot: [] });
  assert.deepEqual(api.normalizeRecentList([{ requestId: '', status: '' }], RECENT_NOW), { ok: false, rows: [], snapshot: [] });
  assert.deepEqual(api.normalizeRecentList(null, RECENT_NOW), { ok: false, rows: [], snapshot: [] });
});

test('시간대 없는 ISO와 미래 시각은 무효이며 상태 변경 시에도 시각은 null이다', () => {
  const result = api.normalizeRecentList([
    recentRow('no-zone', 'accepted', '2026-08-30T10:00:00'),
    recentRow('future', 'needs_info', '2026-08-30T12:00:00.001Z'),
  ], RECENT_NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.map((entry) => entry.updatedAtMs), [null, null]);
});

test('최근 변경은 최신순 최대 10건과 전체 건수를 반환한다', () => {
  const current = Array.from({ length: 12 }, (_, index) => ({
    requestId: `req-${index}`, status: 'accepted', updatedAtMs: RECENT_NOW - (index * 1000),
  }));
  const result = api.diffRecentSnapshots([], current);
  assert.equal(result.total, 12);
  assert.equal(result.changes.length, 10);
  assert.deepEqual(result.changes.map((entry) => entry.requestId), current.slice(0, 10).map((entry) => entry.requestId));
  const tied = api.diffRecentSnapshots([], [
    { requestId: 'first-tie', status: 'accepted', updatedAtMs: RECENT_NOW },
    { requestId: 'second-tie', status: 'accepted', updatedAtMs: RECENT_NOW },
  ]);
  assert.deepEqual(tied.changes.map((entry) => entry.requestId), ['first-tie', 'second-tie']);
});

test('업무 상태와 변경 종류를 승인된 문구로 표현한다', () => {
  assert.equal(api.recentChangeLabel({ kind: 'appeared', status: 'pending_review' }), '이번 새로고침에서 새로 확인');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'needs_info' }), '자료 보완 필요');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'visit_scheduled' }), '방문 예정');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'completed' }), '작업 완료');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'billed' }), '청구 완료');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'paid' }), '입금 완료');
  assert.equal(api.recentChangeLabel({ kind: 'updated', status: 'accepted' }), '내용 갱신');
});
```

- [ ] **Step 3: Run the new logic tests and confirm RED**

Run:

```powershell
& $taskNode --test tests\office-request.logic.test.cjs
```

Expected: FAIL because `normalizeRecentList`, `diffRecentSnapshots`, and `recentChangeLabel` are not exported.

- [ ] **Step 4: Implement the pure helpers without DOM or storage access**

Add constants and helpers inside the existing factory in `js/office-request-core.js`. Keep the exact output property names from the interface.

```javascript
const CONTRACTED_STATUSES = new Set(Object.keys(STATUS_LABELS));
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const RECENT_LABELS = {
  needs_info: '자료 보완 필요', visit_scheduled: '방문 예정', completed: '작업 완료',
  billed: '청구 완료', paid: '입금 완료', cancelled: '취소됨',
};

function canonicalRequestId(item) {
  const primary = item && typeof item.requestId === 'string' ? item.requestId.trim() : '';
  const fallback = item && typeof item.id === 'string' ? item.id.trim() : '';
  const id = primary || fallback;
  return id.length > 0 && id.length <= 120 ? id : '';
}

function validUpdatedAt(value, validationNow) {
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value.trim())) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= validationNow ? parsed : null;
}

function normalizeRecentList(rows, validationNow) {
  if (!Array.isArray(rows) || !Number.isFinite(validationNow)) return { ok: false, rows: [], snapshot: [] };
  if (rows.length === 0) return { ok: true, rows: [], snapshot: [] };
  const chosen = new Map();
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const requestId = canonicalRequestId(row);
    const status = typeof row.status === 'string' && CONTRACTED_STATUSES.has(row.status) ? row.status : '';
    if (!requestId || !status) return;
    const updatedAtMs = validUpdatedAt(row.updatedAt, validationNow);
    const candidate = { index, row, snapshot: { requestId, status, updatedAtMs } };
    const current = chosen.get(requestId);
    if (!current || (updatedAtMs !== null && (current.snapshot.updatedAtMs === null || updatedAtMs > current.snapshot.updatedAtMs))) {
      chosen.set(requestId, candidate);
    }
  });
  if (!chosen.size) return { ok: false, rows: [], snapshot: [] };
  const selected = [...chosen.values()].sort((left, right) => left.index - right.index);
  return { ok: true, rows: selected.map((entry) => entry.row), snapshot: selected.map((entry) => entry.snapshot) };
}

function diffRecentSnapshots(previous, current) {
  if (!Array.isArray(current) || previous === null) return { total: 0, changes: [] };
  const before = new Map((Array.isArray(previous) ? previous : []).map((entry) => [entry.requestId, entry]));
  const detected = [];
  current.forEach((entry, order) => {
    const prior = before.get(entry.requestId);
    let kind = '';
    if (!prior) kind = 'appeared';
    else if (prior.status !== entry.status) kind = 'status';
    else if (prior.updatedAtMs !== null && entry.updatedAtMs !== null && entry.updatedAtMs > prior.updatedAtMs) kind = 'updated';
    if (kind) detected.push({ requestId: entry.requestId, kind, status: entry.status, updatedAtMs: entry.updatedAtMs, order });
  });
  detected.sort((left, right) => {
    const leftTime = left.updatedAtMs === null ? Number.NEGATIVE_INFINITY : left.updatedAtMs;
    const rightTime = right.updatedAtMs === null ? Number.NEGATIVE_INFINITY : right.updatedAtMs;
    return rightTime - leftTime || left.order - right.order;
  });
  return {
    total: detected.length,
    changes: detected.slice(0, 10).map(({ order, ...entry }) => entry),
  };
}

function recentChangeLabel(change) {
  if (!change || typeof change !== 'object') return '변경 확인';
  if (change.kind === 'appeared') return '이번 새로고침에서 새로 확인';
  if (change.kind === 'updated') return '내용 갱신';
  return RECENT_LABELS[change.status] || statusLabel(change.status);
}
```

Extend the existing factory return exactly:

```javascript
return {
  normalizePhone, parseOfficeSlug, validateLogin, validateRequest, buildCreatePayload,
  statusLabel, needsInfoLabel, normalizeRecentList, diffRecentSnapshots, recentChangeLabel,
};
```

- [ ] **Step 5: Run focused and existing logic tests**

Run:

```powershell
& $taskNode --test tests\office-request.logic.test.cjs
```

Expected: all 17 logic tests pass, 0 fail.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- js/office-request-core.js tests/office-request.logic.test.cjs
git commit -m "feat: add office recent change comparison"
```

---

### Task 2: Accessible Recent-Changes Shell

**Files:**
- Modify: `office-request.html:13,39-43,79-82`
- Modify: `css/office-request.css:15-32,59-60`
- Create: `tests/office-request-recent-changes.e2e.cjs`

**Interfaces:**
- Consumes: existing `#officeDashboardView`, `#officeNewRequest`, `#officeSyncStatus`
- Produces DOM IDs: `officeRefreshRequests`, `officeRecentChanges`, `officeRecentSummary`, `officeRecentList`, `officeRecentOverflow`, `officeLastChecked`
- Produces CSS hooks: `.office-dashboard-buttons`, `.office-recent`, `.office-recent-list`, `.office-recent-item`, `.office-recent-meta`

- [ ] **Step 1: Create the browser harness and failing layout test**

Create `tests/office-request-recent-changes.e2e.cjs` with this initial content:

```javascript
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://script.google.com/macros/s/test-office-recent/exec';
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
let browser;
let origin;
let server;

function serveStatic(req, res) {
  const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

function loginResult() {
  return { ok: true, sessionToken: 'session-recent', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 관리사무소' }, expiresAt: Date.now() + 3600000 };
}

function request(requestId, status, updatedAt, extra = {}) {
  return {
    requestId, receiptNo: `MM-${requestId}`, unit: '101동 1203호', location: '공용 배관실', issueType: '누수',
    status, updatedAt, description: '최근 변경 화면에는 나오면 안 되는 설명',
    officeContact: { name: '김소장', phone: '010-1111-2222' }, publicAmount: 987654,
    ...extra,
  };
}

async function openPortal(respond) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(1800);
  const calls = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('**/office-api.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, apiUrl: API_URL }) }));
  await page.route(API_URL, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(await respond(body, calls)) });
  });
  return { calls, page, pageErrors };
}

async function login(page) {
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
}

before(async () => {
  server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('390px 대시보드에 수동 새로고침과 접근 가능한 최근 변경 영역이 있다', async () => {
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  assert.equal(await page.locator('#officeRefreshRequests').count(), 1);
  assert.equal(await page.locator('#officeRecentChanges').isVisible(), true);
  assert.equal(await page.locator('#officeRecentSummary').getAttribute('role'), 'status');
  assert.equal(await page.locator('#officeRecentSummary').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#officeRecentList').getAttribute('aria-live'), null);
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    refreshHeight: document.getElementById('officeRefreshRequests').getBoundingClientRect().height,
  }));
  assert.equal(metrics.scrollWidth, metrics.width);
  assert.ok(metrics.refreshHeight >= 44);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
```

- [ ] **Step 2: Run the layout test and confirm RED**

Run:

```powershell
& $taskNode --test tests\office-request-recent-changes.e2e.cjs
```

Expected: FAIL because `#officeRefreshRequests` and `#officeRecentChanges` do not exist.

- [ ] **Step 3: Add the semantic dashboard shell**

Replace the current dashboard action line in `office-request.html` with:

```html
<div class="office-dashboard-actions">
  <div class="office-dashboard-buttons">
    <button id="officeNewRequest" class="office-action request-primary" type="button">새 접수 등록</button>
    <button id="officeRefreshRequests" class="office-action request-secondary" type="button">목록 새로고침</button>
  </div>
  <p id="officeSyncStatus" class="office-sync-status" role="status" aria-live="polite"></p>
</div>
<section id="officeRecentChanges" class="office-recent" aria-labelledby="officeRecentTitle">
  <div class="office-recent-head">
    <h2 id="officeRecentTitle">🔔 최근 변경</h2>
    <p id="officeLastChecked" class="office-recent-checked"></p>
  </div>
  <p id="officeRecentSummary" class="office-recent-summary" role="status" aria-live="polite">첫 목록을 기준으로 준비합니다.</p>
  <ul id="officeRecentList" class="office-recent-list"></ul>
  <p id="officeRecentOverflow" class="office-recent-overflow"></p>
</section>
```

Keep the existing `.office-filters` group and `#officeRequestList` after this section. Change only modified asset query markers:

```html
<link rel="stylesheet" href="css/office-request.css?v=20260830-office-recent1" />
<script src="js/office-request-core.js?v=20260830-office-recent1"></script>
<script src="js/office-request-api.js?v=20260827-office-request2"></script>
<script src="js/office-request-photo.js?v=20260827-office-request3"></script>
<script src="js/office-request.js?v=20260830-office-recent1"></script>
```

- [ ] **Step 4: Add responsive styles**

Add focused rules to `css/office-request.css`:

```css
.office-dashboard-buttons { display: flex; flex-wrap: wrap; gap: 10px; }
.office-recent { margin: 0 0 18px; padding: 18px; border: 1px solid var(--request-line); border-radius: 14px; background: #f4f8f7; }
.office-recent-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.office-recent-head h2 { margin: 0; color: var(--request-navy); font-size: 18px; }
.office-recent-checked, .office-recent-summary, .office-recent-overflow { margin: 0; color: var(--request-muted); font-size: 13px; line-height: 1.5; }
.office-recent-summary { margin-top: 8px; }
.office-recent-list { display: grid; gap: 8px; padding: 0; margin: 12px 0 0; list-style: none; }
.office-recent-item { min-width: 0; padding: 12px; border-radius: 12px; background: #fff; overflow-wrap: anywhere; }
.office-recent-item .office-action { width: 100%; justify-content: flex-start; text-align: left; }
.office-recent-meta { margin: 6px 0 0; color: var(--request-muted); font-size: 13px; line-height: 1.5; }
.office-recent-overflow:not(:empty) { margin-top: 10px; font-weight: 750; }
```

Add these declarations inside the existing `@media (max-width: 640px)` rule:

```css
.office-dashboard-buttons { display: grid; grid-template-columns: 1fr; width: 100%; }
.office-dashboard-buttons .office-action { width: 100%; }
```

- [ ] **Step 5: Run the layout test and existing 390px smoke test**

Run:

```powershell
& $taskNode --test --test-concurrency=1 tests\office-request-recent-changes.e2e.cjs tests\office-intake.e2e.cjs
```

Expected: both files pass, 0 fail, no horizontal overflow, refresh control at least 44px.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- office-request.html css/office-request.css tests/office-request-recent-changes.e2e.cjs
git commit -m "feat: add office recent changes panel"
```

---

### Task 3: Manual Refresh Happy Path and Rendering

**Files:**
- Modify: `js/office-request.js:5-38,125-134,175-191`
- Modify: `tests/office-request-recent-changes.e2e.cjs`

**Interfaces:**
- Consumes: Task 1 `normalizeRecentList`, `diffRecentSnapshots`, `recentChangeLabel`
- Consumes: Task 2 DOM IDs
- Produces: `loadDashboard({ focus?: boolean, manual?: boolean }) -> Promise<void>`
- Produces internal state: `listSnapshot`, `recentChanges`, `recentTotal`, `lastSuccessfulRefreshAt`, `refreshPending`
- Produces: `renderRecentChanges()`, `clearRecentState()`, `setRefreshBusy(boolean)`

- [ ] **Step 1: Add failing first-load and one-click API-count test**

Append a test that returns one baseline list and one updated list. Use `calls.filter(({ action }) => action === 'officeList').length` before and after clicking.

```javascript
test('첫 조회는 기준만 만들고 수동 새로고침 한 번은 officeList만 정확히 한 번 추가 호출한다', async () => {
  let listCall = 0;
  const baseline = [request('req-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const changed = [
    request('req-2', 'pending_review', '2026-08-30T11:00:00.000Z', { receiptNo: '', unit: '', location: '' }),
    request('req-1', 'needs_info', '2026-08-30T10:00:00.000Z'),
  ];
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByText('다음 새로고침부터 변경을 확인합니다.').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 1);
  const refresh = page.getByRole('button', { name: '목록 새로고침' });
  await refresh.focus();
  await refresh.click();
  await page.getByText('최근 변경 2건').waitFor();
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 2);
  assert.deepEqual(calls.map((entry) => entry.action), ['officeLogin', 'officeList', 'officeList']);
  const text = await page.locator('#officeRecentChanges').innerText();
  assert.match(text, /이번 새로고침에서 새로 확인/);
  assert.match(text, /자료 보완 필요/);
  assert.match(text, /접수번호 확인 필요/);
  assert.match(text, /위치 확인 필요/);
  assert.doesNotMatch(text, /010-1111-2222|최근 변경 화면에는 나오면 안 되는 설명|987654/);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'officeRefreshRequests');
  assert.deepEqual(pageErrors, []);
  await page.close();
});
```

- [ ] **Step 2: Add failing sorting, overflow, filter and detail test**

Append this complete test:

```javascript
test('최근 변경은 최신순 10건과 초과 건수를 유지하고 필터와 URL 변경 없이 상세로 이동한다', async () => {
  let listCall = 0;
  const baseline = Array.from({ length: 12 }, (_, index) => request(
    `req-${index}`,
    'pending_review',
    `2026-08-30T08:00:${String(index).padStart(2, '0')}.000Z`,
  ));
  const changed = baseline.map((item, index) => request(
    item.requestId,
    index % 2 ? 'accepted' : 'completed',
    `2026-08-30T11:00:${String(59 - index).padStart(2, '0')}.000Z`,
  ));
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    if (body.action === 'officeGet') return { ok: true, request: changed.find((item) => item.requestId === body.payload.requestId) };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 12건').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 10);
  assert.match(await page.locator('#officeRecentOverflow').innerText(), /외 2건/);
  const firstMeta = await page.locator('#officeRecentList li').first().innerText();
  assert.match(firstMeta, /req-0/);
  await page.getByRole('button', { name: '진행 중' }).click();
  assert.equal(await page.locator('#officeRequestList article').count(), 6);
  assert.equal(await page.locator('#officeRecentList li').count(), 10);
  const beforeUrl = page.url();
  await page.locator('#officeRecentList button').first().click();
  await page.locator('#officeDetailView').waitFor({ state: 'visible' });
  assert.equal(page.url(), beforeUrl);
  assert.equal(calls.filter((entry) => entry.action === 'officeGet').length, 1);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
```

- [ ] **Step 3: Run the new tests and confirm RED**

Run:

```powershell
& $taskNode --test tests\office-request-recent-changes.e2e.cjs
```

Expected: FAIL because the refresh button has no controller and no recent-change rendering.

- [ ] **Step 4: Add state, formatting and rendering helpers**

Extend the DOM bindings and state declarations in `js/office-request.js`:

```javascript
const refreshRequests = byId('officeRefreshRequests'), recentSummary = byId('officeRecentSummary');
const recentList = byId('officeRecentList'), recentOverflow = byId('officeRecentOverflow');
const lastChecked = byId('officeLastChecked');
let listSnapshot = null, recentChanges = [], recentTotal = 0, lastSuccessfulRefreshAt = null, refreshPending = false;
```

Add helpers with no persistent-storage writes:

```javascript
function formatCheckedTime(value) {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function formatChangedTime(value) {
  return value === null ? '시간 확인 필요' : new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
function displayRecentReceipt(item) {
  const receipt = typeof item.receiptNo === 'string' ? item.receiptNo.trim().slice(0, 100) : '';
  return receipt || '접수번호 확인 필요';
}
function displayRecentLocation(item) {
  const parts = [item && item.unit, item && item.location]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim().slice(0, 140));
  return parts.join(' · ') || '위치 확인 필요';
}
function clearRecentState() {
  listSnapshot = null; recentChanges = []; recentTotal = 0; lastSuccessfulRefreshAt = null;
  if (recentList) recentList.textContent = '';
  if (recentOverflow) recentOverflow.textContent = '';
  if (recentSummary) recentSummary.textContent = '첫 목록을 기준으로 준비합니다.';
  if (lastChecked) lastChecked.textContent = '';
}
function setRefreshBusy(value) {
  refreshPending = value;
  if (refreshRequests) {
    refreshRequests.disabled = value;
    refreshRequests.setAttribute('aria-busy', String(value));
    refreshRequests.textContent = value ? '목록 확인 중' : '목록 새로고침';
  }
}
function renderRecentChanges() {
  if (!recentList || !recentSummary || !recentOverflow) return;
  recentList.textContent = '';
  const byRequestId = new Map(requests.map((item) => [requestId(item), item]));
  recentChanges.forEach((change) => {
    const item = byRequestId.get(change.requestId);
    if (!item) return;
    const li = document.createElement('li');
    li.className = 'office-recent-item';
    const button = actionButton(displayRecentReceipt(item), 'data-office-recent-detail', change.requestId);
    li.appendChild(button);
    addText(li, 'office-recent-meta', displayRecentLocation(item));
    addText(li, 'office-recent-meta', `${core.recentChangeLabel(change)} · ${formatChangedTime(change.updatedAtMs)}`);
    recentList.appendChild(li);
  });
  recentSummary.textContent = recentTotal ? `최근 변경 ${recentTotal}건` : '이번 새로고침에서 확인된 변경이 없습니다.';
  recentOverflow.textContent = recentTotal > recentChanges.length ? `외 ${recentTotal - recentChanges.length}건의 변경이 있습니다.` : '';
  lastChecked.textContent = lastSuccessfulRefreshAt ? `마지막 확인 ${formatCheckedTime(lastSuccessfulRefreshAt)}` : '';
}
```

- [ ] **Step 5: Refactor `loadDashboard` into initial and manual modes**

Use one `validationNow` per successful response. The successful application order must be normalization → diff → atomic state assignment → rendering.

```javascript
async function loadDashboard({ focus = false, manual = false } = {}) {
  const candidate = session, generation = sessionGeneration;
  if (!candidate || refreshPending) return;
  if (officeName) officeName.textContent = officeLabel(candidate.office);
  setView(dashboardView);
  if (focus) focusTitle('officeDashboardTitle');
  setRefreshBusy(true);
  if (syncStatus) syncStatus.textContent = manual ? '접수 목록을 새로고침하는 중입니다.' : '접수 목록을 불러오는 중입니다.';
  try {
    const response = await authenticatedCall('officeList', {});
    if (!isCurrentSession(candidate, generation)) return;
    const validationNow = Date.now();
    const normalized = core.normalizeRecentList(response.requests, validationNow);
    if (!normalized.ok) throw Object.assign(new Error('invalid-response'), { code: 'invalid-response' });
    const compared = listSnapshot === null ? { total: 0, changes: [] } : core.diffRecentSnapshots(listSnapshot, normalized.snapshot);
    requests = normalized.rows;
    recentChanges = compared.changes;
    recentTotal = compared.total;
    listSnapshot = normalized.snapshot;
    lastSuccessfulRefreshAt = validationNow;
    renderRequests();
    renderRecentChanges();
    if (recentSummary && compared.total === 0 && !manual) recentSummary.textContent = '다음 새로고침부터 변경을 확인합니다.';
    if (syncStatus) syncStatus.textContent = manual ? '접수 목록을 새로고침했습니다.' : '접수 목록을 최신 상태로 불러왔습니다.';
  } catch (error) {
    if (error.code === 'stale-session' || error.officeSessionHandled) return;
    if (!isCurrentSession(candidate, generation)) return;
    if (syncStatus) syncStatus.textContent = errorMessage(error);
  } finally {
    if (isCurrentSession(candidate, generation)) setRefreshBusy(false);
  }
}
```

Register the button and recent-list delegation:

```javascript
if (refreshRequests) refreshRequests.addEventListener('click', () => { loadDashboard({ manual: true }); });
if (recentList) recentList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-office-recent-detail]');
  if (!button) return;
  const item = requests.find((entry) => requestId(entry) === button.dataset.officeRecentDetail);
  if (!item) { if (syncStatus) syncStatus.textContent = '현재 목록에서 접수를 찾을 수 없습니다. 목록을 새로고침해 주세요.'; return; }
  openDetail(button.dataset.officeRecentDetail, button);
});
```

- [ ] **Step 6: Run happy-path, workflow and auth regression tests**

Run:

```powershell
& $taskNode --test --test-concurrency=1 tests\office-request-recent-changes.e2e.cjs tests\office-request-workflow.e2e.cjs tests\office-request-auth.e2e.cjs
```

Expected: all tests pass, 0 fail; no existing create/edit/detail behavior regresses.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- js/office-request.js tests/office-request-recent-changes.e2e.cjs
git commit -m "feat: add manual office list refresh"
```

---

### Task 4: Failure, Session, Race and Privacy Hardening

**Files:**
- Modify: `js/office-request.js:11-38,128-191`
- Modify: `tests/office-request-recent-changes.e2e.cjs`
- Modify: `tests/office-request-auth.e2e.cjs:1-220`

**Interfaces:**
- Consumes: Task 3 `loadDashboard`, `clearRecentState`, `setRefreshBusy`
- Produces internal state: `listGeneration: number`
- Guarantees: only the latest list generation in the current session can mutate list, snapshot, recent cards, status or button
- Guarantees: ordinary failures preserve the last successful list and recent cards; session termination clears all R1 state

- [ ] **Step 1: Add failing ordinary-error preservation and recovery tests**

Append this test to `tests/office-request-recent-changes.e2e.cjs`:

```javascript
test('새로고침 실패는 직전 성공 목록과 변경 카드를 보존하고 다음 성공은 비교 결과를 교체한다', async () => {
  let listCall = 0;
  const baseline = [request('req-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const changed = [request('req-1', 'needs_info', '2026-08-30T10:00:00.000Z')];
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: baseline };
      if (listCall === 2) return { ok: true, requests: changed };
      if (listCall === 3) return { ok: false, error: 'server-error' };
      return { ok: true, requests: changed };
    }
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 1건').waitFor();
  const beforeFailure = {
    list: await page.locator('#officeRequestList').innerText(),
    recent: await page.locator('#officeRecentChanges').innerText(),
    checked: await page.locator('#officeLastChecked').innerText(),
  };
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText(/서버 처리 중 문제가 발생했습니다/).waitFor();
  assert.equal(await page.locator('#officeRequestList').innerText(), beforeFailure.list);
  assert.equal(await page.locator('#officeRecentChanges').innerText(), beforeFailure.recent);
  assert.equal(await page.locator('#officeLastChecked').innerText(), beforeFailure.checked);
  assert.match(await page.locator('#officeSyncStatus').innerText(), /마지막 성공/);
  const callsAfterFailure = listCall;
  await page.waitForTimeout(80);
  assert.equal(listCall, callsAfterFailure);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('이번 새로고침에서 확인된 변경이 없습니다.').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('첫 목록 실패는 기준을 만들지 않고 빈 목록과 오류만 표시한다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: false, error: 'server-error' };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByText(/서버 처리 중 문제가 발생했습니다/).waitFor();
  assert.equal(await page.locator('#officeRequestList article').count(), 0);
  assert.match(await page.locator('#officeRequestList').innerText(), /표시할 접수가 없습니다/);
  assert.match(await page.locator('#officeRecentSummary').innerText(), /첫 목록을 기준으로 준비/);
  const listCalls = calls.filter((entry) => entry.action === 'officeList').length;
  await page.waitForTimeout(80);
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, listCalls);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
```

- [ ] **Step 2: Add failing duplicate-click and late-response tests**

Append this deferred-response test:

```javascript
test('진행 중 중복 클릭을 막고 로그아웃 전 늦은 목록이 새 로그인 목록을 덮지 않는다', async () => {
  let loginCall = 0;
  let listCall = 0;
  let resolveLate;
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') {
      loginCall += 1;
      return { ...loginResult(), sessionToken: `session-recent-${loginCall}` };
    }
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: [request('initial', 'accepted', '2026-08-30T09:00:00.000Z')] };
      if (listCall === 2) return new Promise((resolve) => { resolveLate = resolve; });
      return { ok: true, requests: [request('new-session', 'accepted', '2026-08-30T11:00:00.000Z')] };
    }
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.waitForFunction(() => document.getElementById('officeRefreshRequests').disabled);
  assert.equal(await page.locator('#officeRefreshRequests').getAttribute('aria-busy'), 'true');
  await page.dispatchEvent('#officeRefreshRequests', 'click');
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 2);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByText('MM-new-session').waitFor();
  resolveLate({ ok: true, requests: [request('late-old-session', 'completed', '2026-08-30T12:00:00.000Z')] });
  await page.waitForTimeout(80);
  const visible = await page.locator('#officeRequestList').innerText();
  assert.match(visible, /MM-new-session/);
  assert.doesNotMatch(visible, /late-old-session/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
```

Add a source assertion that `listGeneration` is checked immediately before applying a list response.

```javascript
const controller = fs.readFileSync(path.join(ROOT, 'js', 'office-request.js'), 'utf8');
assert.match(controller, /listGeneration\s*\+=\s*1/);
assert.match(controller, /listAttempt\s*!==\s*listGeneration/);
```

- [ ] **Step 3: Add failing cleanup and storage-boundary tests**

Extend `tests/office-request-auth.e2e.cjs` so logout and `session-expired` both assert:

```javascript
assert.equal(await page.locator('#officeRecentList li').count(), 0);
assert.equal(await page.locator('#officeLastChecked').innerText(), '');
assert.match(await page.locator('#officeRecentSummary').innerText(), /첫 목록을 기준으로 준비/);
```

Append this R1 storage and reload test after the first happy-path test:

```javascript
test('최근 변경의 개인정보는 저장소와 URL에 남지 않고 hard reload는 새 기준을 만든다', async () => {
  let listCall = 0;
  const baseline = [request('private-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const changed = [request('private-1', 'needs_info', '2026-08-30T10:00:00.000Z')];
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 1건').waitFor();
  const leaked = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    url: location.href,
  }));
  assert.doesNotMatch(JSON.stringify(leaked), /010-1111-2222|최근 변경 화면에는 나오면 안 되는 설명|987654/);
  await page.reload();
  await page.getByText('다음 새로고침부터 변경을 확인합니다.').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
```

- [ ] **Step 4: Add failing malformed-time, malformed-list and missing-detail tests**

Append this combined boundary test:

```javascript
test('잘못된 시각과 목록은 허위 변경을 만들지 않고 사라진 상세 참조는 API를 호출하지 않는다', async () => {
  let listCall = 0;
  const baseline = [
    request('future-status', 'accepted', '2026-08-30T09:00:00.000Z'),
    request('no-zone-status', 'accepted', '2026-08-30T09:00:00.000Z'),
    request('invalid-transition', 'accepted', 'not-a-time'),
  ];
  const malformedTimes = [
    request('future-status', 'needs_info', '2999-01-01T00:00:00.000Z'),
    request('no-zone-status', 'visit_scheduled', '2026-08-30T10:00:00'),
    request('invalid-transition', 'accepted', '2026-08-30T10:00:00.000Z'),
  ];
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: baseline };
      if (listCall === 2) return { ok: true, requests: malformedTimes };
      if (listCall === 3) return { ok: true, requests: {} };
      if (listCall === 4) return { ok: true, requests: [{ requestId: '', status: '' }] };
      return { ok: true, requests: [] };
    }
    if (body.action === 'officeGet') return { ok: true, request: malformedTimes[0] };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 2건').waitFor();
  assert.equal((await page.locator('#officeRecentChanges').innerText().then((text) => text.match(/시간 확인 필요/g) || [])).length, 2);
  const getCount = calls.filter((entry) => entry.action === 'officeGet').length;
  await page.locator('#officeRecentList button').first().evaluate((button) => { button.dataset.officeRecentDetail = 'missing-request'; });
  await page.locator('#officeRecentList button').first().click();
  assert.match(await page.locator('#officeSyncStatus').innerText(), /현재 목록에서 접수를 찾을 수 없습니다/);
  assert.equal(calls.filter((entry) => entry.action === 'officeGet').length, getCount);
  const preserved = await page.locator('#officeRecentChanges').innerText();
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText(/서버 응답을 확인할 수 없습니다/).waitFor();
  assert.equal(await page.locator('#officeRecentChanges').innerText(), preserved);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText(/서버 응답을 확인할 수 없습니다/).waitFor();
  assert.equal(await page.locator('#officeRecentChanges').innerText(), preserved);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('이번 새로고침에서 확인된 변경이 없습니다.').waitFor();
  assert.equal(await page.locator('#officeRequestList article').count(), 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
```

- [ ] **Step 5: Run hardening tests and confirm RED**

Run:

```powershell
& $taskNode --test --test-concurrency=1 tests\office-request-recent-changes.e2e.cjs tests\office-request-auth.e2e.cjs
```

Expected: failures identify missing list-generation, cleanup and preservation behavior.

- [ ] **Step 6: Add list generation and atomic failure preservation**

Add `listGeneration` beside the Task 3 state. Increment it at the start of every list attempt and in `clearRecentState()`. Capture `listAttempt` in `loadDashboard()` and require both the current session and `listAttempt === listGeneration` before every success, catch and finally DOM mutation.

```javascript
let listGeneration = 0;

function clearRecentState() {
  listGeneration += 1;
  listSnapshot = null; recentChanges = []; recentTotal = 0; lastSuccessfulRefreshAt = null;
  if (recentList) recentList.textContent = '';
  if (recentOverflow) recentOverflow.textContent = '';
  if (recentSummary) recentSummary.textContent = '첫 목록을 기준으로 준비합니다.';
  if (lastChecked) lastChecked.textContent = '';
  setRefreshBusy(false);
}
```

At the start of `loadDashboard()`:

```javascript
const listAttempt = ++listGeneration;
```

Before applying or reporting:

```javascript
if (!isCurrentSession(candidate, generation) || listAttempt !== listGeneration) return;
```

Add a safe failure formatter:

```javascript
function refreshFailureMessage(error) {
  const message = errorMessage(error);
  return lastSuccessfulRefreshAt ? `${message} · 마지막 성공 ${formatCheckedTime(lastSuccessfulRefreshAt)}` : message;
}
```

Use this exact ordinary-error branch after the session/list generation guards:

```javascript
if (listSnapshot === null) {
  requests = [];
  renderRequests();
}
if (syncStatus) syncStatus.textContent = refreshFailureMessage(error);
```

Do not clear `requests`, `listSnapshot`, `recentChanges` or `lastSuccessfulRefreshAt` after a successful baseline exists.

- [ ] **Step 7: Wire cleanup into every session boundary**

Call `clearRecentState()` from `clearSession()`. Keep `showLogin()` responsible only for private DOM view switching. Logout, session expiry, invalid restored session and slug mismatch already pass through `clearSession()` and must keep doing so. In `submitLogin()`, call `clearRecentState()` after validating the returned session and immediately before assigning `session = saved`; do not call `clearSession()` after `saveSession()` because that would remove the new token.

Do not remove the existing `sessionGeneration`, `clearDetail`, session `sessionStorage.removeItem`, photo clearing or create-draft reset behavior.

- [ ] **Step 8: Run hardening and full portal focused tests**

Run:

```powershell
& $taskNode --test --test-concurrency=1 tests\office-request.logic.test.cjs tests\office-request-api.test.cjs tests\office-request-auth.e2e.cjs tests\office-request-workflow.e2e.cjs tests\office-request-recent-changes.e2e.cjs tests\office-intake.e2e.cjs
```

Expected: all existing 69 tests plus all new tests pass, 0 fail.

- [ ] **Step 9: Commit Task 4**

```powershell
git add -- js/office-request.js tests/office-request-recent-changes.e2e.cjs tests/office-request-auth.e2e.cjs
git commit -m "fix: harden office recent change lifecycle"
```

---

### Task 5: Static Release Gates and Cache Contract

**Files:**
- Modify: `tests/office-intake.e2e.cjs:10-33`
- Modify: `scripts/ensure-office-intake.mjs:1-45`
- Modify: `.github/workflows/deploy-pages.yml:71-78`

**Interfaces:**
- Consumes: R1 static files and new E2E test path
- Produces: deployment workflow that executes the new E2E before artifact build
- Guarantees: no R1 automatic polling, external notification or persistent recent-state path

- [ ] **Step 1: Write failing workflow, asset-marker and forbidden-feature assertions**

In the first test in `tests/office-intake.e2e.cjs`, replace the current `portal` declaration with the three declarations below, then append the assertions. This avoids defining `portal` twice and gives the cache and controller checks named source strings.

```javascript
const request = read('office-request.html');
const controller = read('js/office-request.js');
const portal = [request, read('js/office-request-core.js'), controller, read('js/office-request-api.js'), read('js/office-request-photo.js')].join('\n');
assert.match(workflow, /node --test --test-concurrency=1 tests\/office-request\.logic\.test\.cjs tests\/office-request-api\.test\.cjs tests\/office-request-auth\.e2e\.cjs tests\/office-request-workflow\.e2e\.cjs tests\/office-request-recent-changes\.e2e\.cjs tests\/office-intake\.e2e\.cjs/);
assert.match(request, /css\/office-request\.css\?v=20260830-office-recent1/);
assert.match(request, /js\/office-request-core\.js\?v=20260830-office-recent1/);
assert.match(request, /js\/office-request\.js\?v=20260830-office-recent1/);
assert.doesNotMatch(controller, /(setInterval|visibilitychange|Notification\s*\(|serviceWorker\.register)/);
```

Keep the API and photo marker assertions unchanged.

- [ ] **Step 2: Run the static contract test and confirm RED**

Run:

```powershell
& $taskNode --test tests\office-intake.e2e.cjs
```

Expected: FAIL because the workflow does not yet list `office-request-recent-changes.e2e.cjs`.

- [ ] **Step 3: Extend the source-quality script**

Add checks to `scripts/ensure-office-intake.mjs`:

```javascript
check(/id="officeRefreshRequests"/.test(request) && /id="officeRecentChanges"/.test(request), '최근 변경 또는 수동 새로고침 UI가 없다');
check(!/(setInterval|visibilitychange|Notification\s*\(|serviceWorker\.register)/.test(controller), 'R1 포털에 자동 조회 또는 외부 브라우저 알림이 있다');
check(/20260830-office-recent1/.test(request), 'R1 변경 자산 cache marker가 없다');
check(!/(localStorage|indexedDB)/.test(request + core + controller + apiClient + photoClient), '포털이 허용되지 않은 영구 브라우저 저장소를 사용한다');
```

Do not reject existing `sessionStorage`; it remains the authenticated session store.

- [ ] **Step 4: Add the new E2E to the existing Pages regression step**

Change only the command under `Run management office portal regression`:

```yaml
node --test --test-concurrency=1 tests/office-request.logic.test.cjs tests/office-request-api.test.cjs tests/office-request-auth.e2e.cjs tests/office-request-workflow.e2e.cjs tests/office-request-recent-changes.e2e.cjs tests/office-intake.e2e.cjs
```

Do not add a PR deploy trigger and do not alter Pages permissions, environment or deploy steps.

- [ ] **Step 5: Run static and portal gates**

Run:

```powershell
& $taskNode --test tests\office-intake.e2e.cjs
& $taskNode scripts\ensure-office-intake.mjs
& $taskNode --test --test-concurrency=1 tests\office-request.logic.test.cjs tests\office-request-api.test.cjs tests\office-request-auth.e2e.cjs tests\office-request-workflow.e2e.cjs tests\office-request-recent-changes.e2e.cjs tests\office-intake.e2e.cjs
```

Expected: every command exits 0; the new E2E runs before `Build public allowlist artifact`.

- [ ] **Step 6: Verify the forbidden-file boundary**

Run:

```powershell
$taskForbidden = @(
  'js/office-request-api.js', 'js/office-request-photo.js', 'office-api.json', 'privacy.html'
)
$taskChanged = @(git diff --name-only aadf328f159596d23d4ca521b69a53655aa6227e...HEAD)
$taskUnexpected = @($taskForbidden | Where-Object { $taskChanged -contains $_ })
if ($taskUnexpected.Count) { $taskUnexpected; throw 'R1 forbidden files changed' }
```

Expected: no forbidden file is printed and the command exits 0.

- [ ] **Step 7: Commit Task 5**

```powershell
git add -- tests/office-intake.e2e.cjs scripts/ensure-office-intake.mjs .github/workflows/deploy-pages.yml
git commit -m "test: gate office recent changes release"
```

---

### Task 6: Full Regression, Mutation Proof and Local Release Handoff

**Files:**
- Verify: every file listed in File Structure
- Verify unchanged: `js/office-request-api.js`, `js/office-request-photo.js`, `office-api.json`, `apps-script-contract/*`
- Generated temporary output: `_site/` from Pages artifact build; it must remain ignored and uncommitted

**Interfaces:**
- Consumes: Tasks 1-5 committed feature
- Produces: test evidence, mutation evidence, independent review result and a clean local branch
- Does not produce: push, PR, merge, GitHub Pages deployment, Apps Script deployment or production data

- [ ] **Step 1: Run all management-office and artifact mutation tests**

```powershell
& $taskNode --test --test-concurrency=1 tests\configure-office-api.test.cjs tests\pages-artifact-policy.test.cjs
& $taskNode --test --test-concurrency=1 tests\office-request.logic.test.cjs tests\office-request-api.test.cjs tests\office-request-auth.e2e.cjs tests\office-request-workflow.e2e.cjs tests\office-request-recent-changes.e2e.cjs tests\office-intake.e2e.cjs
```

Expected: both commands exit 0, all tests pass, 0 fail.

- [ ] **Step 2: Run lead privacy and public-site browser regressions**

```powershell
& $taskNode --test --test-concurrency=1 tests\lead-transport.test.cjs tests\lead-privacy.e2e.cjs tests\inquiry-phone.e2e.cjs tests\inquiry-result-honesty.e2e.cjs tests\inquiry-usability.e2e.cjs
```

Expected: exit 0, all tests pass, 0 fail.

- [ ] **Step 3: Run source-quality and generated-content checks**

```powershell
Get-ChildItem -LiteralPath scripts -Filter 'ensure-*.mjs' | Where-Object Name -ne 'ensure-pages-artifact.mjs' | ForEach-Object {
  & $taskNode $_.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $taskPython -m unittest tests/test_prerender_posts.py
& $taskNode --test tests\unified-brand-design.e2e.cjs
& $taskNode --test scripts\new-case-post.test.mjs
$taskContractTests = @(Get-ChildItem -LiteralPath 'apps-script-contract\test' -Filter '*.mjs' | Select-Object -ExpandProperty FullName)
& $taskNode --test @taskContractTests
```

Expected: every process exits 0.

- [ ] **Step 4: Verify generated blog freshness without keeping generated diffs**

```powershell
& $taskPython scripts\prerender-posts.py
git diff --exit-code -- blog.html posts rss.xml data/leak-case-index.json
```

Expected: exit 0 and no generated blog diff.

- [ ] **Step 5: Build and verify the Pages allowlist artifact**

```powershell
& $taskNode scripts\build-pages-artifact.mjs
& $taskNode scripts\ensure-pages-artifact.mjs
git status --short
```

Expected: artifact verification passes; `_site/` is not staged or shown as an unexpected source change.

- [ ] **Step 6: Perform four local mutation checks one at a time**

For each mutation below, use `apply_patch`, run the named focused test expecting failure, and immediately apply the reverse patch. After each reversal run `git diff --check` and the focused test expecting pass.

1. Remove `listSnapshot = normalized.snapshot` from the success block. `tests/office-request-recent-changes.e2e.cjs` must fail because the same delta repeats.
2. Clear `requests` in the ordinary error catch. The error-preservation test must fail.
3. Remove `listAttempt !== listGeneration` from the response guard. The source/race contract test must fail.
4. Remove `clearRecentState()` from `clearSession()`. The logout/session-expiry test must fail.

Do not commit any mutation. Finish with:

```powershell
git diff --check
& $taskNode --test --test-concurrency=1 tests\office-request-recent-changes.e2e.cjs tests\office-request-auth.e2e.cjs
```

Expected: mutation runs fail for the stated reason; restored code passes; no unstaged mutation remains.

- [ ] **Step 7: Request independent code review against the spec**

The reviewer must inspect the exact diff from `aadf328` and report P0/P1/P2 findings for:

- first-load baseline and 50-record wording
- snapshot/display allowlists and no persistent R1 storage
- failure preservation and list/session generation
- XSS, detail lookup and session cleanup
- 390px/44px/aria-live behavior
- workflow order, cache marker and forbidden-file boundary

Resolve every P0/P1 finding. Add or strengthen a regression test before each correction. Commit review corrections with:

```powershell
git add -- office-request.html css/office-request.css js/office-request-core.js js/office-request.js tests/office-request.logic.test.cjs tests/office-request-recent-changes.e2e.cjs tests/office-request-auth.e2e.cjs tests/office-intake.e2e.cjs scripts/ensure-office-intake.mjs .github/workflows/deploy-pages.yml
git commit -m "fix: address office recent changes review"
```

If the reviewer has no P0/P1 findings, do not create an empty commit.

- [ ] **Step 8: Rerun the complete gate after the last correction**

Repeat Steps 1-5 after the final code change. Do not rely on test output from before review corrections.

Expected: every command exits 0, every test reports 0 failures, generated content is current, Pages artifact passes.

- [ ] **Step 9: Verify final diff allowlist and branch cleanliness**

```powershell
$taskAllowed = @(
  '.github/workflows/deploy-pages.yml',
  'css/office-request.css',
  'docs/superpowers/specs/2026-08-30-manmool-office-portal-recent-changes-design.md',
  'docs/superpowers/plans/2026-08-30-manmool-office-portal-recent-changes.md',
  'js/office-request-core.js',
  'js/office-request.js',
  'office-request.html',
  'scripts/ensure-office-intake.mjs',
  'tests/office-intake.e2e.cjs',
  'tests/office-request-auth.e2e.cjs',
  'tests/office-request-recent-changes.e2e.cjs',
  'tests/office-request.logic.test.cjs'
)
$taskChanged = @(git diff --name-only aadf328f159596d23d4ca521b69a53655aa6227e...HEAD)
$taskUnexpected = @($taskChanged | Where-Object { $taskAllowed -notcontains $_ })
if ($taskUnexpected.Count) { $taskUnexpected; throw 'Unexpected R1 files changed' }
git status --short --branch
git log --oneline aadf328f159596d23d4ca521b69a53655aa6227e..HEAD
```

Expected: no unexpected path, no unstaged/staged file, only the approved spec/plan and Task 1-5 feature commits plus an evidence-backed review-fix commit when needed.

- [ ] **Step 10: Stop at the external-action gate**

Report local commit IDs, exact test counts, full-regression exit codes, mutation outcomes, independent review findings and remaining real-account/mobile checks. Record that rollback is the R1 static HTML/CSS/JS and matching cache-marker commits reverted together, with no Apps Script, hyeonjang or 접수 데이터 삭제·상태 역전. State explicitly that no push, PR, merge, Pages deployment, Apps Script deployment or production data change occurred.

Wait for a separate user instruction such as `배포 승인` before any remote or public action.
