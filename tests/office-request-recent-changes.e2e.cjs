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

test('공백이 있는 canonical 또는 legacy ID 변경은 카드 수와 요약을 맞추고 상세로 연다', async () => {
  let listCall = 0;
  const baseline = [request('req-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const canonical = request(' req-2 ', 'accepted', '2026-08-30T11:00:00.000Z', { receiptNo: 'MM-002' });
  const legacy = { ...request('discarded', 'completed', '2026-08-30T11:01:00.000Z', { receiptNo: '', unit: '', location: '' }), requestId: undefined, id: ' legacy-3 ' };
  const changed = [canonical, legacy];
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    if (body.action === 'officeGet') return { ok: true, request: body.payload.requestId === 'req-2' ? canonical : legacy };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 2건').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 2);
  const recentText = await page.locator('#officeRecentChanges').innerText();
  assert.match(recentText, /MM-002/);
  assert.match(recentText, /접수번호 확인 필요/);
  assert.doesNotMatch(recentText, /req-2|legacy-3/);
  const beforeUrl = page.url();
  for (const button of await page.locator('#officeRecentList button').all()) {
    await button.click();
    await page.locator('#officeDetailView').waitFor({ state: 'visible' });
    assert.equal(page.url(), beforeUrl);
    await page.getByRole('button', { name: '목록으로' }).click();
  }
  assert.deepEqual(calls.filter((entry) => entry.action === 'officeGet').map((entry) => entry.payload.requestId), ['legacy-3', 'req-2']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
