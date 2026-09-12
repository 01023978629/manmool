/* Real Pages 404 semantics: the document stays at the missing nested URL. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../_site');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
let server, browser, origin;
before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, '404.html')), 'Build the Pages artifact first');
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return res.writeHead(400).end(); }
    const relative = pathname.startsWith('/manmool/') ? pathname.slice('/manmool/'.length) : '';
    const target = path.resolve(ROOT, relative);
    if (!relative || !target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { 'content-type': MIME['.html'] });
      return fs.createReadStream(path.join(ROOT, '404.html')).pipe(res);
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function open(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const requests = [], errors = [];
  await context.route('**/*', route => {
    const req = route.request();
    requests.push({ url: req.url(), method: req.method(), referer: req.headers().referer });
    if (!req.url().startsWith(origin + '/') || req.method() !== 'GET') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'browser exceptions');
    assert.deepEqual(requests.filter(req => req.method !== 'GET'), [], 'unexpected submission');
  });
  return { page, requests };
}

async function visit(page, tail = 'posts/old/nested/missing.html?from=old-link#old') {
  const response = await page.goto(`${origin}/manmool/${tail}`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 404, 'missing pages must keep HTTP 404');
}
async function ready(page) { await page.locator('#recovery-search').waitFor({ state: 'visible' }); }

test('중첩 404에 공개 사례·서비스 이동을 표시하고 원래 주소를 자동 변경하지 않는다', async t => {
  const { page, requests } = await open(t);
  await visit(page);
  await ready(page);
  assert.match(page.url(), /\/posts\/old\/nested\/missing\.html\?from=old-link#old$/);
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
  assert.equal(await page.locator('#recovery-results li').count(), 6);
  assert.ok(await page.locator('#recovery-more').isVisible());
  const staticLinks = await page.locator('.service-links a, .primary-link').evaluateAll(links => links.map(link => link.pathname));
  assert.deepEqual(staticLinks.sort(), ['/manmool/blog.html', '/manmool/index.html', '/manmool/leak.html', '/manmool/office.html']);
  for (const url of staticLinks) assert.equal((await page.request.get(origin + url)).status(), 200, url);
  assert.equal(requests.filter(req => req.url === origin + '/manmool/blog.html').length, 1);
  assert.equal(requests.some(req => /\/data\//.test(req.url)), false, 'must use published HTML only');
  assert.equal(requests.some(req => req.referer), false, 'unknown URL leaked in referrer');
  await page.locator('#recovery-more').click();
  assert.equal(await page.locator('#recovery-results li').count(), 12);
  assert.equal(await page.locator('#recovery-results li').nth(6).locator('a').evaluate(link => document.activeElement === link), true);
  await page.locator('#recovery-results a').first().click();
  assert.match(page.url(), /\/manmool\/posts\/[a-z0-9-]+\.html$/);
  assert.equal((await page.request.get(page.url())).status(), 200);
});

test('단지명·띄어쓰기·분야로 찾고 검색어를 URL·저장소·요청에 보내지 않는다', async t => {
  const { page, requests } = await open(t);
  await visit(page);
  await ready(page);
  const query = page.locator('#recovery-query');
  const start = requests.length;
  await query.fill('평화로운 아파트');
  assert.equal(await page.locator('#recovery-results a').count(), 1);
  assert.match(await page.locator('#recovery-results a').getAttribute('href'), /pyeonghaneul-apartment-leak-repair-20260909\.html$/);
  await page.locator('[data-group="interior"]').click();
  assert.ok(await page.locator('#recovery-empty').isVisible());
  await page.locator('#recovery-reset').click();
  assert.equal(await query.inputValue(), '');
  assert.equal(await page.locator('[data-group="all"]').getAttribute('aria-pressed'), 'true');
  await query.fill('선비마을 ３단지');
  assert.equal(await page.locator('#recovery-results a').count(), 1);
  const payload = '<img src=x onerror=window.recoveryXss=1>';
  await query.fill(payload);
  await query.press('Enter');
  assert.equal(await page.evaluate(() => window.recoveryXss), undefined);
  assert.ok(await page.locator('#recovery-empty').isVisible());
  assert.match(page.url(), /missing\.html\?from=old-link#old$/);
  const state = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), history.state]));
  assert.equal(state.includes(payload), false);
  assert.equal(requests.length, start, 'typing/search must not request data');
});

test('목록 요청 실패 후 재시도하며 없는 목록을 정상으로 오인하지 않는다', async t => {
  const { page } = await open(t);
  await page.route('**/manmool/blog.html', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await visit(page);
  await page.locator('#recovery-retry').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#recovery-search').isVisible(), false);
  assert.ok(await page.locator('.primary-link').isVisible());
  await page.unroute('**/manmool/blog.html');
  await page.locator('#recovery-retry').click();
  await ready(page);
  assert.equal(await page.locator('#recovery-retry').isVisible(), false);
  assert.equal(await page.locator('#recovery-results a').count(), 6);
});

test('목록 요청 지연을 끝내고 재시도 버튼을 표시한다', async t => {
  const { page } = await open(t);
  await page.clock.install();
  let pending;
  await page.route('**/manmool/blog.html', route => { pending = route; });
  const requested = page.waitForRequest('**/manmool/blog.html');
  const response = await page.goto(`${origin}/manmool/posts/missing.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 404);
  await requested;
  await page.clock.fastForward(8100);
  await page.locator('#recovery-retry').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#recovery-search').isVisible(), false);
  if (pending) await pending.abort().catch(() => {});
});

test('공개 목록의 외부 링크·중복·알 수 없는 분류·태그를 실행하거나 삽입하지 않는다', async t => {
  const { page } = await open(t);
  const card = (href, group, title) => `<a data-group="${group}" data-date="2026-09-09" href="${href}"><span class="ic-body"><b>${title}</b></span></a>`;
  await page.route('**/manmool/blog.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: `<div id="blogRoot">
    ${card('posts/contract-checklist.html', 'info', '&lt;img src=x onerror=alert(1)&gt;')}
    ${card('posts/contract-checklist.html', 'info', 'duplicate')}
    ${card('https://external.invalid/posts/unsafe.html', 'leak', 'external')}
    ${card('javascript:alert(1)', 'leak', 'script')}
    ${card('../office-admin.html', 'leak', 'private')}
    ${card('posts/missing.html', 'unknown', 'unknown')}
    <script>window.recoveryXss=1</script></div>` }));
  await visit(page);
  await ready(page);
  assert.equal(await page.locator('#recovery-results a').count(), 1);
  assert.equal(await page.locator('#recovery-results img').count(), 0);
  assert.match(await page.locator('#recovery-results').innerText(), /<img src=x/);
  assert.equal(await page.evaluate(() => window.recoveryXss), undefined);
});

test('JavaScript 없이도 깊은 404의 서비스·사례 링크는 동작한다', async t => {
  const { page } = await open(t, { javaScriptEnabled: false });
  await visit(page);
  assert.equal(await page.locator('#recovery-search').isVisible(), false);
  assert.equal(await page.locator('#recovery-load-status').isVisible(), false);
  assert.equal(await page.locator('noscript a').getAttribute('href'), '/manmool/blog.html');
  await page.locator('.primary-link').click();
  assert.equal(page.url(), `${origin}/manmool/blog.html`);
});

for (const width of [320, 390, 1280]) test(`${width}px 오류 화면의 검색·필터·버튼이 넘치지 않고 누를 수 있다`, async t => {
  const { page } = await open(t, { viewport: { width, height: 900 } });
  await visit(page);
  await ready(page);
  await page.locator('#recovery-query').fill('해당없는현장이름'.repeat(10));
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    short: [...document.querySelectorAll('button, input, .service-links a, .primary-link')]
      .filter(el => el.getClientRects().length && el.getBoundingClientRect().height < 44).map(el => el.id || el.textContent),
  }));
  assert.equal(layout.width, layout.scroll, 'horizontal overflow');
  assert.deepEqual(layout.short, [], 'touch target <44px');
  await page.locator('#recovery-reset').click();
  assert.equal(await page.locator('#recovery-results li').count(), 6);
});
