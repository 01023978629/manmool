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
  const portal = ['office-request.html', 'js/office-request-core.js', 'js/office-request.js', 'js/office-request-api.js', 'js/office-request-photo.js']
    .map(read)
    .join('\n');
  const config = read('office-api.json');
  const build = read('scripts/build-pages-artifact.mjs');
  const workflow = read('.github/workflows/deploy-pages.yml');
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts', 'configure-office-api.mjs')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'tests', 'configure-office-api.test.cjs')), true);
  assert.deepEqual(Object.keys(JSON.parse(config)).sort(), ['apiUrl', 'enabled']);
  assert.match(build, /office-api\.json/);
  assert.match(build, /office-request-api\.js/);
  assert.match(build, /office-request-photo\.js/);
  assert.match(portal, /sessionStorage/);
  assert.doesNotMatch(portal, /(localStorage|indexedDB|APP_TOKEN|OFFICE_SESSION_SECRET|pinHash|pinSalt)/);
  assert.match(workflow, /node --test tests\/configure-office-api\.test\.cjs tests\/office-request\.logic\.test\.cjs tests\/office-request-api\.test\.cjs tests\/office-request-auth\.e2e\.cjs tests\/office-request-workflow\.e2e\.cjs tests\/office-intake\.e2e\.cjs/);
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

test('단지 slug가 없는 포털은 저장이나 API 호출 없이 안내를 보인다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const calls = [];
  const errors = [];
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) calls.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error));
  await page.goto(`${origin}/office-request.html`);
  assert.equal(await page.locator('#officeRouteError').isVisible(), true);
  assert.match(await page.locator('#officeRouteError').innerText(), /관리사무소 전용 주소/);
  assert.equal(await page.locator('#officeLoginView').isHidden(), true);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(errors, []);
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
