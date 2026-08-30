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
