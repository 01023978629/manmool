const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
let browser;
let origin;
let server;

test('배포 게이트의 공개 포털 소스 계약은 설정 CLI와 fail-closed 설정을 요구한다', () => {
  const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const request = read('office-request.html');
  const controller = read('js/office-request.js');
  const portal = [request, read('js/office-request-core.js'), controller, read('js/office-request-api.js'), read('js/office-request-photo.js')].join('\n');
  const config = read('office-api.json');
  const policy = read('scripts/pages-artifact-policy.mjs');
  const workflow = read('.github/workflows/deploy-pages.yml');
  const expectedPortalRegressionRun = [
    '          set -euo pipefail',
    '          node --test --test-concurrency=1 tests/office-request.logic.test.cjs tests/office-request-api.test.cjs tests/office-request-auth.e2e.cjs tests/office-request-workflow.e2e.cjs tests/office-request-recent-changes.e2e.cjs tests/office-intake.e2e.cjs',
  ].join('\n');
  const portalRegressionRun = workflow.match(/      - name: Run management office portal regression\r?\n[\s\S]*?        run: \|\r?\n([\s\S]*?)(?=\r?\n      - name:|\s*$)/);
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'configure-office-api.mjs')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'tests', 'configure-office-api.test.cjs')), true);
  assert.deepEqual(Object.keys(JSON.parse(config)).sort(), ['apiUrl', 'enabled']);
  assert.match(policy, /office-api\.json/);
  assert.match(policy, /office-request-api\.js/);
  assert.match(policy, /office-request-photo\.js/);
  assert.match(portal, /sessionStorage/);
  assert.doesNotMatch(portal, /(localStorage|indexedDB|APP_TOKEN|OFFICE_SESSION_SECRET|pinHash|pinSalt)/);
  assert.match(workflow, /node --test --test-concurrency=1 tests\/configure-office-api\.test\.cjs tests\/pages-artifact-policy\.test\.cjs/);
  assert.ok(portalRegressionRun);
  assert.equal(portalRegressionRun[1].replace(/\r\n/g, '\n').trimEnd(), expectedPortalRegressionRun);
  assert.match(request, /css\/office-request\.css\?v=20260901-office-entry1/);
  assert.match(request, /js\/office-request-core\.js\?v=20260901-office-entry1/);
  assert.match(request, /js\/office-request\.js\?v=20260901-office-status1/);
  assert.match(request, /id="officeDetailNeedsInfoRow"[^>]*hidden[\s\S]*?<dt>보완 요청 사유<\/dt><dd id="officeDetailNeedsInfoReason"><\/dd>/);
  assert.doesNotMatch(controller, /(setInterval|visibilitychange|Notification\s*\(|serviceWorker\.register)/);
  assert.doesNotMatch(controller, /(?:\b(?:[\w$]+(?:\s*\.\s*[\w$]+)*)\s*\.\s*)?addEventListener\s*(?:\?\.)?\s*\(\s*['"]online['"]|(?:\b(?:[\w$]+(?:\s*\.\s*[\w$]+)*)\s*\.\s*)?ononline\s*=/);
  assert.ok(workflow.indexOf('Run management office portal regression') < workflow.indexOf('Build public allowlist artifact'));
});

before(async () => {
  server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': path.extname(target) === '.css' ? 'text/css' : path.extname(target) === '.js' ? 'text/javascript' : 'text/html' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('단지 slug가 없는 포털은 저장이나 API 호출 없이 코드 입력을 안내한다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const calls = [];
  const errors = [];
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) calls.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error));
  await page.goto(`${origin}/office-request.html`);
  assert.equal(await page.locator('#officeRouteError').isVisible(), true);
  assert.match(await page.locator('#officeRouteError').innerText(), /관리사무소 코드 또는 단지 전용 주소/);
  assert.equal(await page.locator('#officeEntry').getAttribute('autocomplete'), 'off');
  assert.equal(await page.locator('#officeEntry').getAttribute('autocapitalize'), 'none');
  assert.equal(await page.locator('#officeEntry').evaluate((element) => element === document.activeElement), true);
  assert.equal(await page.locator('#officeLoginView').isHidden(), true);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(errors, []);
  await page.close();
});

test('발급받은 관리사무소 코드는 기존 PIN 로그인 화면으로만 이동한다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const calls = [];
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) calls.push(request.url()); });
  await page.goto(`${origin}/office-request.html`);
  await page.locator('#officeEntry').fill('sample-apt');
  await page.getByRole('button', { name: '로그인 화면 열기' }).click();
  await page.waitForURL(`${origin}/office-request.html?office=sample-apt`);
  assert.equal(await page.locator('#officeLoginView').isVisible(), true);
  assert.equal(await page.locator('#officePin').isVisible(), true);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(calls, []);
  await page.close();
});

test('다른 사이트 주소와 잘못된 코드는 포털 진입과 API 호출을 막는다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const calls = [];
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) calls.push(request.url()); });
  await page.goto(`${origin}/office-request.html`);
  for (const value of ['-sample', 'https://example.com/office-request.html?office=sample-apt']) {
    await page.locator('#officeEntry').fill(value);
    await page.getByRole('button', { name: '로그인 화면 열기' }).click();
    assert.equal(page.url(), `${origin}/office-request.html`);
    assert.match(await page.locator('#officeEntryError').innerText(), /코드 또는 전용 주소/);
  }
  assert.equal(await page.locator('#officeLoginView').isHidden(), true);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(calls, []);
  await page.close();
});

test('유효한 단지 URL은 390px에서 로그인 제어를 안전하게 표시한다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto(`${origin}/office-request.html?office=sample-apt`);
  assert.equal(await page.locator('#officeLoginView').isVisible(), true);
  assert.equal(await page.locator('#officePin').getAttribute('inputmode'), 'numeric');
  assert.equal(await page.locator('#officeRequestForm').count(), 0);
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    tooShort: [...document.querySelectorAll('.office-action')].filter((element) => element.getClientRects().length && element.getBoundingClientRect().height < 44).length,
  }));
  assert.equal(metrics.scrollWidth, metrics.width);
  assert.equal(metrics.tooShort, 0);
  assert.deepEqual(errors, []);
  await page.close();
});
