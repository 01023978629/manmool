const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const core = require('../js/office-portal-core.js');

const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://script.google.com/macros/s/test-office-rbac/exec';
const CHALLENGE_ID = '123e4567-e89b-42d3-a456-426614174000';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NETWORK_ABORT = Object.freeze({ networkAbort: true });
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
let browser;
let server;
let origin;

function serve(req, res) {
  const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
}
function user(role, extra = {}) { return { id: `user-${role}`, email: `${role}@example.com`, name: `테스트 ${core.roleLabel(role)}`, role, active: true, ...extra }; }
function office() { return { id: 'office-1', slug: 'sample-apt', complexName: '샘플아파트' }; }
function sessionResponse(role, permissions, extra = {}) { return { ok: true, sessionToken: `token-${role}`, user: user(role), office: office(), permissions, expiresAt: Date.now() + 60 * 60 * 1000, ...extra }; }
function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}
async function openPortal(respond, { enabled = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(2000);
  const calls = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  if (enabled) {
    await page.route('**/office-portal-api.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, apiUrl: API_URL }) }));
    await page.route(API_URL, async (route) => {
      const body = route.request().postDataJSON(); calls.push(body);
      const response = await respond(body);
      if (response === NETWORK_ABORT) { await route.abort('failed'); return; }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
    });
  }
  return { page, calls, errors };
}
async function seedSession(page, response) {
  await page.goto(`${origin}/office-login.html`);
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: core.SESSION_KEY,
    value: { token: response.sessionToken, user: response.user, office: response.office, permissions: response.permissions, expiresAt: response.expiresAt },
  });
}

before(async () => {
  server = http.createServer(serve); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`; browser = await chromium.launch({ headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

test('기본 설정은 이메일 인증을 비활성화하고 mock/demo 로그인을 제공하지 않는다', async () => {
  const { page, errors } = await openPortal(async () => { throw new Error('endpoint must not be called'); }, { enabled: false });
  await page.goto(`${origin}/office-login.html`);
  await page.waitForFunction(() => document.getElementById('portalConfigNotice').textContent.includes('준비'));
  assert.equal(await page.locator('#portalRequestCode').isDisabled(), true);
  assert.match(await page.locator('#portalConfigNotice').innerText(), /준비/);
  assert.equal(await page.getByRole('link', { name: '기존 접수 포털 열기' }).getAttribute('href'), 'office-request.html');
  assert.equal(await page.locator('html').getAttribute('data-office-frame-pending'), null);
  assert.deepEqual(errors, []); await page.close();
});

test('OTP 검증 중에는 이메일 재입력을 막아 늦은 검증 응답이 다른 로그인 흐름에 섞이지 않는다', async () => {
  const verifyGate = deferred();
  const login = sessionResponse('resident', ['dashboard.view']);
  const { page, calls, errors } = await openPortal(async (body) => {
    if (body.action === 'portalRequestCode') return { ok: true, challengeId: CHALLENGE_ID };
    if (body.action === 'portalVerifyCode') return verifyGate.promise;
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalDashboard') return { ok: true, metrics: [], notices: [] };
    throw new Error(`unexpected ${body.action}`);
  });
  await page.goto(`${origin}/office-login.html`);
  await page.waitForFunction(() => !document.getElementById('portalRequestCode').disabled);
  await page.locator('#portalOfficeCode').fill('sample-apt'); await page.locator('#portalEmail').fill('resident@example.com');
  await page.locator('#portalCodeRequestForm').evaluate((form) => form.requestSubmit());
  await page.locator('#portalCode').fill('123456');
  await page.locator('#portalCodeVerifyForm').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => document.getElementById('portalChangeAccount').disabled === true);
  assert.equal(calls.filter((call) => call.action === 'portalVerifyCode').length, 1);
  assert.equal(await page.locator('#portalChangeAccount').isDisabled(), true);
  await page.locator('#portalChangeAccount').evaluate((button) => button.click());
  assert.equal(await page.locator('#portalCodeRequestForm').isHidden(), true);
  assert.equal(await page.locator('#portalCodeVerifyForm').isVisible(), true);
  verifyGate.resolve(login);
  await page.waitForURL(`${origin}/office-portal.html`);
  assert.deepEqual(errors, []); await page.close();
});

test('이메일 OTP는 challengeId와 함께 검증하고 세션에는 OTP 없이 서버 권한만 저장한다', async () => {
  const login = sessionResponse('manager_chief', ['dashboard.view']);
  const { page, calls, errors } = await openPortal(async (body) => {
    if (body.action === 'portalRequestCode') return { ok: true, challengeId: CHALLENGE_ID };
    if (body.action === 'portalVerifyCode') return login;
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalDashboard') return { ok: true, metrics: [{ label: '보수 필요', value: 2 }], notices: ['정기점검 예정'] };
    throw new Error(`unexpected ${body.action}`);
  });
  await page.goto(`${origin}/office-login.html`);
  await page.waitForFunction(() => !document.getElementById('portalRequestCode').disabled);
  await page.locator('#portalOfficeCode').fill('sample-apt'); await page.locator('#portalEmail').fill('chief@example.com');
  await page.getByRole('button', { name: '이메일 인증번호 받기' }).click();
  await page.locator('#portalCode').fill('123456'); await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL(`${origin}/office-portal.html`); await page.locator('#portalApp').waitFor({ state: 'visible' });
  const verify = calls.find((call) => call.action === 'portalVerifyCode');
  assert.deepEqual(verify.payload, { officeCode: 'sample-apt', email: 'chief@example.com', code: '123456', challengeId: CHALLENGE_ID });
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), core.SESSION_KEY);
  assert.deepEqual(Object.keys(stored).sort(), ['expiresAt', 'office', 'permissions', 'token', 'user']);
  assert.equal(JSON.stringify(stored).includes('123456'), false);
  assert.deepEqual(stored.permissions, ['dashboard.view']);
  assert.equal(await page.locator('[data-panel="status"]').isHidden(), true);
  assert.equal(await page.locator('#portalAdminLink').isHidden(), true);
  assert.match(await page.locator('#portalDashboardCards').innerText(), /보수 필요[\s\S]*2/);
  assert.deepEqual(errors, []); await page.close();
});

test('시설·일지 저장은 실패 재시도 ID를 유지하고 성공 뒤 새 작업에 새 UUID를 쓴다', async () => {
  const login = sessionResponse('facility_manager', ['status.manage', 'status.view', 'logs.manage', 'logs.view']);
  let statusSaveCount = 0;
  const { page, calls, errors } = await openPortal(async (body) => {
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalStatusList') return { ok: true, statuses: [] };
    if (body.action === 'portalStatusSave') { statusSaveCount += 1; return statusSaveCount === 1 ? NETWORK_ABORT : { ok: true }; }
    if (body.action === 'portalLogList') return { ok: true, logs: [] };
    if (body.action === 'portalLogSave') return { ok: true };
    throw new Error(`unexpected ${body.action}`);
  });
  await seedSession(page, login); await page.goto(`${origin}/office-portal.html`); await page.locator('#portalApp').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-panel="dashboard"]').isHidden(), true);
  assert.equal(await page.locator('[data-panel="status"]').isVisible(), true);
  assert.equal(await page.locator('#portalStatusForm').isVisible(), true);
  await page.locator('[name="location"]').fill('지하 기계실');
  await page.locator('#portalStatusForm [name="category"]').selectOption('water');
  await page.locator('#portalStatusForm [name="summary"]').fill('급수 배관 점검 완료');
  await page.locator('#portalStatusForm button[type="submit"]').click();
  await page.waitForFunction(() => document.getElementById('portalStatusError').textContent.includes('네트워크'));
  const firstStatus = calls.filter((call) => call.action === 'portalStatusSave')[0];
  assert.match(firstStatus.payload.requestId, UUID_V4);
  assert.deepEqual(firstStatus.payload, { requestId: firstStatus.payload.requestId, location: '지하 기계실', category: 'water', state: 'normal', summary: '급수 배관 점검 완료', visibility: 'internal' });
  await page.locator('#portalStatusForm button[type="submit"]').click();
  await page.waitForFunction(() => document.getElementById('portalStatusForm').elements.namedItem('location').value === '');
  const secondStatus = calls.filter((call) => call.action === 'portalStatusSave')[1];
  assert.equal(secondStatus.payload.requestId, firstStatus.payload.requestId);
  await page.locator('[name="location"]').fill('옥상 배수구');
  await page.locator('#portalStatusForm [name="category"]').selectOption('water');
  await page.locator('#portalStatusForm [name="summary"]').fill('두 번째 신규 기록');
  const secondSaveRequest = page.waitForRequest((request) => request.url() === API_URL && request.postDataJSON().action === 'portalStatusSave' && request.postDataJSON().payload.location === '옥상 배수구');
  await page.locator('#portalStatusForm button[type="submit"]').click();
  const nextStatus = (await secondSaveRequest).postDataJSON().payload;
  assert.match(nextStatus.requestId, UUID_V4);
  assert.notEqual(nextStatus.requestId, firstStatus.payload.requestId);
  assert.equal(Object.hasOwn(nextStatus, 'revision'), false);

  await page.locator('[data-panel="logs"]').click();
  await page.locator('#portalLogForm [name="workDate"]').fill('2026-09-01');
  await page.locator('#portalLogForm [name="title"]').fill('기계실 점검');
  await page.locator('#portalLogForm [name="content"]').fill('급수 배관 상태를 확인했습니다.');
  const firstLogRequest = page.waitForRequest((request) => request.url() === API_URL && request.postDataJSON().action === 'portalLogSave');
  await page.locator('#portalLogForm button[type="submit"]').click();
  const firstLog = (await firstLogRequest).postDataJSON().payload;
  assert.match(firstLog.requestId, UUID_V4);
  assert.equal(firstLog.visibility, 'internal');
  await page.waitForFunction(() => document.getElementById('portalLogForm').elements.namedItem('title').value === '');
  await page.locator('#portalLogForm [name="workDate"]').fill('2026-09-02');
  await page.locator('#portalLogForm [name="title"]').fill('새 점검');
  await page.locator('#portalLogForm [name="content"]').fill('새 작업을 기록했습니다.');
  const nextLogRequest = page.waitForRequest((request) => request.url() === API_URL && request.postDataJSON().action === 'portalLogSave' && request.postDataJSON().payload.title === '새 점검');
  await page.locator('#portalLogForm button[type="submit"]').click();
  const nextLog = (await nextLogRequest).postDataJSON().payload;
  assert.match(nextLog.requestId, UUID_V4);
  assert.notEqual(nextLog.requestId, firstLog.requestId);
  assert.deepEqual(errors, []); await page.close();
});

test('입주민은 서버가 허용한 공개 목록만 읽고 상태·일지 작성 폼을 볼 수 없다', async () => {
  const login = sessionResponse('resident', ['status.view', 'logs.view'], { user: user('resident', { unit: '101동 202호' }) });
  const { page, calls, errors } = await openPortal(async (body) => {
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalStatusList') return { ok: true, statuses: [{ statusId: 's1', location: '놀이터', state: 'complete', summary: '안전매트 보수 완료', visibility: 'public' }] };
    if (body.action === 'portalLogList') return { ok: true, logs: [] };
    throw new Error(`unexpected ${body.action}`);
  });
  await seedSession(page, login); await page.goto(`${origin}/office-portal.html`); await page.locator('#portalApp').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#portalStatusForm').isHidden(), true);
  assert.equal(await page.locator('#portalLogForm').isHidden(), true);
  assert.match(await page.locator('#portalStatusList').innerText(), /놀이터[\s\S]*입주민 공개/);
  assert.equal(calls.some((call) => /Save$/.test(call.action)), false);
  assert.deepEqual(errors, []); await page.close();
});

test('포털 로그아웃은 서버 응답 전에 민감 화면을 지우고 1.2초 안팎에 로그인으로 복귀한다', async () => {
  const logoutGate = deferred();
  const login = sessionResponse('manager_chief', ['dashboard.view']);
  const { page, calls, errors } = await openPortal(async (body) => {
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalDashboard') return { ok: true, metrics: [{ label: '민감 지표', value: 7 }], notices: ['비공개 점검 일정'] };
    if (body.action === 'portalLogout') return logoutGate.promise;
    throw new Error(`unexpected ${body.action}`);
  });
  await seedSession(page, login); await page.goto(`${origin}/office-portal.html`); await page.locator('#portalApp').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('portalDashboardCards').textContent.includes('민감 지표'));
  const logoutStartedAt = Date.now();
  await page.locator('#portalLogout').click();
  await page.waitForFunction(() => document.getElementById('portalDeniedMessage').textContent.includes('로그아웃'));
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), core.SESSION_KEY), null);
  assert.equal(await page.locator('#portalApp').isHidden(), true);
  assert.equal(await page.locator('#portalAccount').isHidden(), true);
  assert.equal(await page.locator('#portalDashboardCards').innerText(), '');
  assert.equal(await page.locator('#portalDashboardNotices').innerText(), '');
  assert.equal(calls.filter((call) => call.action === 'portalLogout').length, 1);
  await page.waitForURL(`${origin}/office-login.html`);
  assert.ok(Date.now() - logoutStartedAt < 1900, '서버 로그아웃 무응답 시 로컬 복귀가 짧은 타임아웃을 넘어섰습니다.');
  assert.deepEqual(errors, []); await page.close();
});

test('관리자는 사용자·역할·동호와 보기 권한을 관리하고 권한 저장은 view allowlist만 보낸다', async () => {
  const permissions = ['admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view'];
  const login = sessionResponse('system_admin', permissions);
  const resident = { ...user('resident', { id: 'resident-1', unit: '101동 202호' }), permissions: ['dashboard.view'] };
  let userSaveCount = 0;
  let permissionSaveCount = 0;
  const { page, calls, errors } = await openPortal(async (body) => {
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalUserList') return { ok: true, users: [resident] };
    if (body.action === 'portalUserSave') { userSaveCount += 1; return userSaveCount === 1 || userSaveCount === 4 ? NETWORK_ABORT : { ok: true }; }
    if (body.action === 'portalPermissionSave') { permissionSaveCount += 1; return permissionSaveCount === 1 ? NETWORK_ABORT : { ok: true }; }
    if (body.action === 'portalAuditList') return { ok: true, audit: [] };
    throw new Error(`unexpected ${body.action}`);
  });
  await seedSession(page, login); await page.goto(`${origin}/office-admin.html`); await page.locator('#portalAdminApp').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('portalUserList').textContent.includes('101동 202호'));
  assert.match(await page.locator('#portalUserList').innerText(), /101동 202호/);
  assert.deepEqual(await page.locator('#portalUserForm [name="role"] option[value="system_admin"]').evaluate((option) => ({ hidden: option.hidden, disabled: option.disabled })), { hidden: false, disabled: false });
  await page.getByRole('button', { name: '사용자 수정', exact: true }).click();
  assert.equal(await page.locator('#portalUserForm [name="unit"]').inputValue(), '101동 202호');
  await page.locator('#portalUserForm [name="unit"]').fill('102동 303호');
  await page.locator('#portalUserForm button[type="submit"]').click();
  await page.waitForFunction(() => document.getElementById('portalUserError').textContent.includes('네트워크'));
  const firstUserSave = calls.filter((call) => call.action === 'portalUserSave')[0].payload;
  assert.match(firstUserSave.requestId, UUID_V4);
  assert.deepEqual(firstUserSave, { requestId: firstUserSave.requestId, userId: 'resident-1', email: 'resident@example.com', name: '테스트 아파트 입주민', role: 'resident', active: true, unit: '102동 303호' });
  await page.locator('#portalUserForm button[type="submit"]').click();
  await page.waitForFunction(() => document.getElementById('portalUserForm').elements.namedItem('userId').value === '');
  const retriedUserSave = calls.filter((call) => call.action === 'portalUserSave')[1].payload;
  assert.equal(retriedUserSave.requestId, firstUserSave.requestId);
  await page.waitForFunction(() => document.getElementById('portalUserList').textContent.includes('101동 202호'));
  await page.getByRole('button', { name: '사용자 수정', exact: true }).click();
  await page.locator('#portalUserForm [name="unit"]').fill('103동 404호');
  const nextUserRequest = page.waitForRequest((request) => request.url() === API_URL && request.postDataJSON().action === 'portalUserSave' && request.postDataJSON().payload.unit === '103동 404호');
  await page.locator('#portalUserForm button[type="submit"]').click();
  const nextUserSave = (await nextUserRequest).postDataJSON().payload;
  assert.match(nextUserSave.requestId, UUID_V4);
  assert.notEqual(nextUserSave.requestId, firstUserSave.requestId);
  await page.waitForFunction(() => document.getElementById('portalUserForm').elements.namedItem('userId').value === '');
  await page.getByRole('button', { name: '보기 권한', exact: true }).click();
  assert.equal(await page.locator('#portalPermissionChecks input[value="status.view"]').isDisabled(), false);
  assert.equal(await page.locator('#portalPermissionChecks input[value="admin.users.view"]').isDisabled(), true);
  assert.equal(await page.locator('#portalPermissionChecks input[value="admin.users.view"]').locator('..').isHidden(), true);
  await page.locator('#portalPermissionChecks input[value="status.view"]').check();
  await page.locator('#portalPermissionSave').click();
  await page.waitForFunction(() => document.getElementById('portalPermissionError').textContent.includes('네트워크'));
  const firstPermissionSave = calls.filter((call) => call.action === 'portalPermissionSave')[0].payload;
  assert.match(firstPermissionSave.requestId, UUID_V4);
  await page.locator('#portalPermissionSave').click();
  await page.waitForFunction(() => document.getElementById('portalAdminStatus').textContent.includes('보기 권한을 저장했습니다'));
  const retriedPermissionSave = calls.filter((call) => call.action === 'portalPermissionSave')[1].payload;
  assert.equal(retriedPermissionSave.requestId, firstPermissionSave.requestId);
  assert.deepEqual(retriedPermissionSave, { requestId: firstPermissionSave.requestId, userId: 'resident-1', permissions: ['dashboard.view', 'status.view'] });
  await page.getByRole('button', { name: '보기 권한', exact: true }).click();
  const nextPermissionRequest = page.waitForRequest((request) => request.url() === API_URL && request.postDataJSON().action === 'portalPermissionSave');
  await page.locator('#portalPermissionSave').click();
  const nextPermissionSave = (await nextPermissionRequest).postDataJSON().payload;
  assert.match(nextPermissionSave.requestId, UUID_V4);
  assert.notEqual(nextPermissionSave.requestId, firstPermissionSave.requestId);

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '계정 비활성화', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('portalAdminStatus').textContent.includes('네트워크'));
  const firstToggle = calls.filter((call) => call.action === 'portalUserSave')[3].payload;
  assert.match(firstToggle.requestId, UUID_V4);
  assert.equal(firstToggle.active, false);
  await page.getByRole('button', { name: '계정 비활성화', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('portalAdminStatus').textContent.includes('사용자 목록을 불러왔습니다'));
  const retriedToggle = calls.filter((call) => call.action === 'portalUserSave')[4].payload;
  assert.equal(retriedToggle.requestId, firstToggle.requestId);
  const nextToggleRequest = page.waitForRequest((request) => request.url() === API_URL && request.postDataJSON().action === 'portalUserSave' && request.postDataJSON().payload.active === false);
  await page.getByRole('button', { name: '계정 비활성화', exact: true }).click();
  const nextToggle = (await nextToggleRequest).postDataJSON().payload;
  assert.match(nextToggle.requestId, UUID_V4);
  assert.notEqual(nextToggle.requestId, firstToggle.requestId);
  assert.match(await page.locator('.portal-warning').innerText(), /마지막 관리자/);
  assert.deepEqual(errors, []); await page.close();
});

test('관리소장은 system_admin을 만들 수 없고 보호 역할의 보기 권한을 변경할 수 없다', async () => {
  const permissions = ['admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view'];
  const login = sessionResponse('manager_chief', permissions);
  const self = { ...login.user, permissions };
  const peer = { ...user('manager_chief', { id: 'chief-peer', email: 'peer@example.com', name: '다른 관리소장' }), permissions: ['dashboard.view'] };
  const facility = { ...user('facility_manager', { id: 'facility-1' }), permissions: ['dashboard.view', 'status.view'] };
  const { page, errors } = await openPortal(async (body) => {
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalUserList') return { ok: true, users: [self, peer, facility] };
    if (body.action === 'portalAuditList') return { ok: true, audit: [] };
    throw new Error(`unexpected ${body.action}`);
  });
  await seedSession(page, login); await page.goto(`${origin}/office-admin.html`); await page.locator('#portalAdminApp').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('portalUserList').textContent.includes('다른 관리소장'));
  assert.deepEqual(await page.locator('#portalUserForm [name="role"] option[value="system_admin"]').evaluate((option) => ({ hidden: option.hidden, disabled: option.disabled })), { hidden: true, disabled: true });
  const selfCard = page.locator('.portal-user-card').filter({ hasText: login.user.email });
  const peerCard = page.locator('.portal-user-card').filter({ hasText: 'peer@example.com' });
  const facilityCard = page.locator('.portal-user-card').filter({ hasText: 'facility_manager@example.com' });
  assert.equal(await selfCard.getByRole('button', { name: '보기 권한', exact: true }).count(), 0);
  assert.equal(await peerCard.getByRole('button', { name: '보기 권한', exact: true }).count(), 0);
  assert.equal(await facilityCard.getByRole('button', { name: '보기 권한', exact: true }).count(), 1);
  await facilityCard.getByRole('button', { name: '보기 권한', exact: true }).click();
  assert.equal(await page.locator('#portalPermissionChecks input[value="status.view"]').isDisabled(), false);
  assert.equal(await page.locator('#portalPermissionChecks input[value="admin.users.view"]').isDisabled(), true);
  assert.deepEqual(errors, []); await page.close();
});

test('관리 화면 로그아웃도 서버 응답 전에 사용자·감사 DOM과 세션을 지운다', async () => {
  const logoutGate = deferred();
  const permissions = ['admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view'];
  const login = sessionResponse('system_admin', permissions);
  const { page, calls, errors } = await openPortal(async (body) => {
    if (body.action === 'portalMe') return login;
    if (body.action === 'portalUserList') return { ok: true, users: [{ ...user('resident', { id: 'resident-sensitive', name: '민감 사용자' }), permissions: [] }] };
    if (body.action === 'portalAuditList') return { ok: true, audit: [{ action: '민감 변경', summary: '민감 감사 내용', actorName: '관리자' }] };
    if (body.action === 'portalLogout') return logoutGate.promise;
    throw new Error(`unexpected ${body.action}`);
  });
  await seedSession(page, login); await page.goto(`${origin}/office-admin.html`); await page.locator('#portalAdminApp').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('portalUserList').textContent.includes('민감 사용자') && document.getElementById('portalAuditList').textContent.includes('민감 변경'));
  await page.locator('#portalAdminLogout').click();
  await page.waitForFunction(() => document.getElementById('portalAdminDeniedMessage').textContent.includes('로그아웃'));
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), core.SESSION_KEY), null);
  assert.equal(await page.locator('#portalAdminApp').isHidden(), true);
  assert.equal(await page.locator('#portalAdminAccount').isHidden(), true);
  assert.equal(await page.locator('#portalUserList').innerText(), '');
  assert.equal(await page.locator('#portalAuditList').innerText(), '');
  assert.equal(calls.filter((call) => call.action === 'portalLogout').length, 1);
  logoutGate.resolve({ ok: true });
  await page.waitForURL(`${origin}/office-login.html`);
  assert.deepEqual(errors, []); await page.close();
});

test('로그인·포털·관리 화면은 다른 페이지의 iframe 안에서 about:blank로 fail-closed한다', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(2500);
  await page.goto(`${origin}/index.html`);
  for (const file of ['office-login.html', 'office-portal.html', 'office-admin.html']) {
    await page.evaluate((url) => {
      document.querySelector('iframe')?.remove();
      const frame = document.createElement('iframe'); frame.src = url; document.body.appendChild(frame);
    }, `${origin}/${file}`);
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe');
      try { return frame && frame.contentWindow.location.href === 'about:blank'; } catch (_) { return false; }
    });
  }
  await page.close();
});
