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
    office: { id: 'office-1', name: '테스트 한빛마을 관리사무소' },
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
  assert.match(await page.locator('#officeRouteError').innerText(), /관리사무소 전용 주소를 확인해 주세요/);
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
  assert.deepEqual(stored.office, { id: 'office-1', name: '테스트 한빛마을 관리사무소' });
  assert.equal(await page.locator('#officeRequestList').innerText().then((text) => text.includes('MMO-20260827-001')), true);
  assert.equal(await page.locator('#officeRequestList').innerText().then((text) => text.includes('다른 단지 접수')), false);
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
    token: 'session-allowlist-test', office: { id: 'office-1', name: '테스트 한빛마을 관리사무소' }, expiresAt: Date.now() + 60000,
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

test('만료된 세션은 지우고 로그인 화면으로 돌아간다', async () => {
  const { calls, page, pageErrors } = await openPortal(async () => ({ ok: true, requests: requestList() }));
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.evaluate((key) => sessionStorage.setItem(key, JSON.stringify({
    token: 'expired-session', office: { id: 'office-1', name: '테스트 한빛마을 관리사무소' }, expiresAt: Date.now() - 1,
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
