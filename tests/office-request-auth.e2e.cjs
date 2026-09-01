const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://script.google.com/macros/s/test-office-portal/exec';
const SESSION_KEY = 'manmul_office_session_v1';
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
let browser;
let origin;
let server;

function serveStatic(req, res) {
  const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

async function openPortal(respond) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(1000);
  const calls = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('**/office-api.json', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ enabled: true, apiUrl: API_URL }),
  }));
  await page.route(API_URL, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(await respond(body)) });
  });
  return { calls, page, pageErrors };
}

function loginResult() {
  return {
    ok: true,
    sessionToken: 'session-allowlist-test',
    office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 한빛마을 관리사무소' },
    expiresAt: Date.now() + (60 * 60 * 1000),
  };
}

function requestList() {
  return [{
    id: 'req-returned', receiptNo: 'MMO-20260827-001', unit: '101동 1203호', location: '욕실 천장',
    issueType: '누수', status: 'pending_review', createdAt: '2026-08-27T09:00:00.000Z',
    description: '반환된 접수 설명', officeContact: { phone: '042-123-4567' },
  }];
}

function recentRequest(requestId, status, updatedAt, extra = {}) {
  return {
    requestId, receiptNo: `MMO-${requestId}`, unit: '101동 1203호', location: '공용 배관실',
    issueType: '누수', status, updatedAt, description: '합성 개인정보 설명',
    officeContact: { name: '합성 관리자', phone: '010-0000-0000' },
    ...extra,
  };
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

test('단지 slug가 없으면 경고만 보이고 API를 호출하지 않는다', async () => {
  const { calls, page, pageErrors } = await openPortal(async () => ({ ok: true }));
  await page.goto(`${origin}/office-request.html`);
  assert.equal(await page.locator('#officeRouteError').isVisible(), true);
  assert.match(await page.locator('#officeRouteError').innerText(), /관리사무소 직원 로그인/);
  assert.equal(await page.locator('#officeRouteForm').isVisible(), true);
  assert.equal(calls.length, 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('여섯 자리 PIN 로그인은 slug를 보내고 허용된 세션 필드만 저장한다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: requestList() };
    throw new Error(`unexpected action ${body.action}`);
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  const login = calls.find((call) => call.action === 'officeLogin');
  assert.deepEqual(login.payload, { slug: 'test-complex', pin: '123456' });
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), SESSION_KEY);
  assert.deepEqual(Object.keys(stored).sort(), ['expiresAt', 'office', 'token']);
  assert.equal(stored.token, 'session-allowlist-test');
  assert.deepEqual(stored.office, { id: 'office-1', slug: 'test-complex', complexName: '테스트 한빛마을 관리사무소' });
  const storage = await page.evaluate((key) => ({ local: JSON.stringify(localStorage), session: sessionStorage.getItem(key) || '' }), SESSION_KEY);
  assert.equal(storage.local.includes('042-123-4567'), false);
  assert.equal(storage.session.includes('042-123-4567'), false);
  assert.equal(storage.local.includes('반환된 접수 설명'), false);
  assert.equal(storage.session.includes('반환된 접수 설명'), false);
  assert.equal(storage.session.includes('123456'), false);
  assert.equal(await page.locator('#officeRequestList').innerText().then((text) => text.includes('MMO-20260827-001')), true);
  assert.equal(await page.locator('#officeRequestList').innerText().then((text) => text.includes('다른 단지 접수')), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('새 로그인 응답의 단지 slug가 현재 주소와 다르면 세션과 목록을 남기지 않는다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return { ...loginResult(), office: { id: 'office-other', slug: 'other-complex', complexName: '다른 단지' } };
    throw new Error(`unexpected action ${body.action}`);
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeLoginView').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#officeLoginView').isVisible(), true);
  assert.equal(await page.locator('#officeRequestList').innerText(), '');
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  assert.equal(calls.filter((call) => call.action === 'officeList').length, 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('로그아웃 뒤 늦게 도착한 목록 응답은 접수 목록에 개인정보를 다시 렌더링하지 않는다', async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return delayed;
    throw new Error(`unexpected action ${body.action}`);
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '로그아웃' }).click();
  release({ ok: true, requests: requestList() });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#officeLoginView').isVisible(), true);
  assert.equal(await page.locator('#officeRequestList').innerText(), '');
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.equal(await page.locator('#officeLastChecked').innerText(), '');
  assert.match(await page.locator('#officeRecentSummary').innerText(), /첫 목록을 기준으로 준비/);
  assert.equal((await page.content()).includes('반환된 접수 설명'), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('변경 카드가 채워진 로그아웃은 최근 상태와 private DOM을 지우고 재로그인은 새 기준을 만든다', async () => {
  let loginCall = 0;
  let listCall = 0;
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return { ...loginResult(), sessionToken: `session-cleanup-${++loginCall}` };
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: [recentRequest('logout-old', 'pending_review', '2026-08-30T09:00:00.000Z')] };
      if (listCall === 2) return { ok: true, requests: [recentRequest('logout-old', 'needs_info', '2026-08-30T10:00:00.000Z')] };
      return { ok: true, requests: [recentRequest('logout-new', 'accepted', '2026-08-30T11:00:00.000Z')] };
    }
    throw new Error(`unexpected action ${body.action}`);
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 1건').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 1);
  assert.match(await page.locator('#officeLastChecked').innerText(), /마지막 확인/);
  assert.match(await page.locator('#officeRequestList').innerText(), /MMO-logout-old/);
  await page.getByRole('button', { name: '로그아웃' }).click();
  assert.equal(await page.locator('#officeRequestList').innerText(), '');
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.equal(await page.locator('#officeLastChecked').innerText(), '');
  assert.match(await page.locator('#officeRecentSummary').innerText(), /첫 목록을 기준으로 준비/);
  assert.doesNotMatch(await page.locator('body').innerText(), /MMO-logout-old/);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByText('다음 새로고침부터 변경을 확인합니다.').waitFor();
  assert.match(await page.locator('#officeRequestList').innerText(), /MMO-logout-new/);
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /MMO-logout-old/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('로그인과 새 접수 및 목록 복귀는 각각 화면 제목과 원래 버튼에 초점을 둔다', async () => {
  const { page, pageErrors } = await openPortal(async (body) => body.action === 'officeLogin' ? loginResult() : { ok: true, requests: [] });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'officeDashboardTitle');
  await page.getByRole('button', { name: '새 접수 등록' }).click();
  await page.locator('#officeCreateView').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'officeCreateTitle');
  await page.getByRole('button', { name: '목록으로' }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'officeNewRequest');
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('유효한 세션은 새로고침 뒤 PIN 없이 목록을 다시 불러온다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: requestList() };
    throw new Error(`unexpected action ${body.action}`);
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({
    token: 'session-allowlist-test', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 한빛마을 관리사무소' }, expiresAt: Date.now() + 60000,
  })), SESSION_KEY);
  await page.reload();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#officeLoginView').isHidden(), true);
  assert.equal(calls.filter((call) => call.action === 'officeLogin').length, 0);
  assert.equal(calls.filter((call) => call.action === 'officeList').length, 1);
  assert.equal(calls.find((call) => call.action === 'officeList').sessionToken, 'session-allowlist-test');
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('다른 단지 slug로 이동하면 기존 세션을 지우고 다시 로그인하게 한다', async () => {
  const { calls, page, pageErrors } = await openPortal(async () => ({ ok: true, requests: requestList() }));
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({
    token: 'session-allowlist-test', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 한빛마을 관리사무소' }, expiresAt: Date.now() + 60000,
  })), SESSION_KEY);
  await page.goto(`${origin}/office-request.html?office=other-complex`);
  assert.equal(await page.locator('#officeLoginView').isVisible(), true);
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('서버가 세션 만료를 반환하면 저장소를 지우고 PIN 입력으로 되돌린다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeList') return { ok: false, error: 'session-expired' };
    throw new Error(`unexpected action ${body.action}`);
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({
    token: 'session-allowlist-test', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 한빛마을 관리사무소' }, expiresAt: Date.now() + 60000,
  })), SESSION_KEY);
  await page.reload();
  await page.locator('#officeLoginView').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  assert.equal(calls.filter((call) => call.action === 'officeList').length, 1);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'officePin');
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.equal(await page.locator('#officeLastChecked').innerText(), '');
  assert.match(await page.locator('#officeRecentSummary').innerText(), /첫 목록을 기준으로 준비/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('변경 카드가 채워진 세션 만료는 최근 상태와 private DOM을 지우고 재로그인은 새 기준을 만든다', async () => {
  let loginCall = 0;
  let listCall = 0;
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return { ...loginResult(), sessionToken: `session-expiry-${++loginCall}` };
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: [recentRequest('expiry-old', 'pending_review', '2026-08-30T09:00:00.000Z')] };
      if (listCall === 2) return { ok: true, requests: [recentRequest('expiry-old', 'needs_info', '2026-08-30T10:00:00.000Z')] };
      if (listCall === 3) return { ok: false, error: 'session-expired' };
      return { ok: true, requests: [recentRequest('expiry-new', 'accepted', '2026-08-30T11:00:00.000Z')] };
    }
    throw new Error(`unexpected action ${body.action}`);
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 1건').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 1);
  assert.match(await page.locator('#officeLastChecked').innerText(), /마지막 확인/);
  assert.match(await page.locator('#officeRequestList').innerText(), /MMO-expiry-old/);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.locator('#officeLoginView').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  assert.equal(await page.locator('#officeRequestList').innerText(), '');
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.equal(await page.locator('#officeLastChecked').innerText(), '');
  assert.match(await page.locator('#officeRecentSummary').innerText(), /첫 목록을 기준으로 준비/);
  assert.doesNotMatch(await page.locator('body').innerText(), /MMO-expiry-old/);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByText('다음 새로고침부터 변경을 확인합니다.').waitFor();
  assert.match(await page.locator('#officeRequestList').innerText(), /MMO-expiry-new/);
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.doesNotMatch(await page.locator('body').innerText(), /MMO-expiry-old/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('지연된 로그인 중 중복 제출을 막고 완료 뒤 버튼을 복구한다', async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action !== 'officeLogin') throw new Error(`unexpected action ${body.action}`);
    await delayed;
    return { ok: false, error: 'invalid-credentials' };
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.evaluate(() => {
    const form = document.getElementById('officeLoginForm');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.getElementById('officeLoginSubmit').disabled);
  assert.equal(calls.filter((call) => call.action === 'officeLogin').length, 1);
  release();
  await page.waitForFunction(() => !document.getElementById('officeLoginSubmit').disabled);
  assert.match(await page.locator('#officeLoginError').innerText(), /비밀번호/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('악성 문자열을 포함한 반환 접수는 HTML을 실행하지 않고 문자 그대로 표시한다', async () => {
  const malicious = [{
    id: 'req-malicious', receiptNo: 'MMO-20260827-002', unit: '<img src=x onerror="window.officeInjected=true">', location: '욕실',
    issueType: '누수', status: 'pending_review', description: '<script>window.officeInjected=true</script>', officeContact: { phone: '042-111-2222' },
  }];
  const { page, pageErrors } = await openPortal(async (body) => body.action === 'officeLogin'
    ? loginResult()
    : { ok: true, requests: malicious });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.evaluate(() => { window.officeInjected = false; });
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => window.officeInjected), false);
  assert.equal(await page.locator('#officeRequestList img').count(), 0);
  assert.match(await page.locator('#officeRequestList').innerText(), /<img src=x onerror/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('만료된 세션은 지우고 로그인 화면으로 돌아간다', async () => {
  const { calls, page, pageErrors } = await openPortal(async () => ({ ok: true, requests: requestList() }));
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({
    token: 'expired-session', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 한빛마을 관리사무소' }, expiresAt: Date.now() - 1,
  })), SESSION_KEY);
  await page.reload();
  assert.equal(await page.locator('#officeLoginView').isVisible(), true);
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('로그인 제한은 10분 안내를 표시하고 개인정보를 브라우저 저장소에 남기지 않는다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => body.action === 'officeLogin'
    ? { ok: false, error: 'rate-limited' }
    : { ok: true, requests: requestList() });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('654321');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForFunction(() => document.getElementById('officeLoginError').textContent.includes('10분'));
  assert.match(await page.locator('#officeLoginError').innerText(), /10분/);
  assert.equal(calls.filter((call) => call.action === 'officeLogin').length, 1);
  const storage = await page.evaluate((key) => ({ local: JSON.stringify(localStorage), session: sessionStorage.getItem(key) || '' }), SESSION_KEY);
  assert.equal(storage.local.includes('654321'), false);
  assert.equal(storage.session.includes('654321'), false);
  assert.equal(storage.local.includes('010-123-4567'), false);
  assert.equal(storage.session.includes('반환된 접수 설명'), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('390px 화면에서 인증 후 표시되는 작업 제어는 가로 넘침과 작은 터치 영역이 없다', async () => {
  const { page, pageErrors } = await openPortal(async (body) => body.action === 'officeLogin'
    ? loginResult()
    : { ok: true, requests: requestList() });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    tooShort: [...document.querySelectorAll('.office-action, .request-button')]
      .filter((element) => element.getClientRects().length && element.getBoundingClientRect().height < 44).length,
  }));
  assert.equal(metrics.scrollWidth, metrics.width);
  assert.equal(metrics.tooShort, 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
