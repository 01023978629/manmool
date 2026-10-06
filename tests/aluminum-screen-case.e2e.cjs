// Local public-case preview only: never log in, submit a form, or fetch external services.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const slug = 'daejeon-aluminum-window-screen-replacement-20261006';
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const article = site.insights.find(a => a.slug === slug);
let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let file;
    try { file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { return res.writeHead(400).end(); }
    if (!file.startsWith(ROOT + path.sep) || path.relative(ROOT, file).split(path.sep).some(p => p.startsWith('.'))
        || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type + (type.startsWith('text/') ? '; charset=utf-8' : '') });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
for (const width of [320, 390, 1280]) {
  test(`${width}px: 실제 공정 사진 6장·완료 표지·정확한 범위·상담 및 가로 넘침 검사`, { timeout: 60000 }, async t => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    t.after(() => context.close());
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${origin}/posts/${slug}.html`);
    assert.equal(await page.locator('.post-title').innerText(), article.title);
    assert.equal(await page.locator('.post-place b').innerText(), article.place.name);
    assert.equal(await page.locator('.pp-note').innerText(), article.place.note);
    const cover = page.locator('.post-cover-image');
    await cover.scrollIntoViewIfNeeded();
    await cover.evaluate(img => img.decode());
    assert.equal(await cover.getAttribute('src'), '../' + article.image);
    assert.equal(await page.locator('.post-body .post-figure').count(), 6);
    for (const [i, section] of article.body.entries()) {
      const figure = page.locator('.post-body .post-figure').nth(i);
      await figure.scrollIntoViewIfNeeded();
      await figure.locator('img').evaluate(img => img.decode());
      assert.equal(await figure.locator('img').getAttribute('src'), '../' + section.img);
      assert.equal(await figure.locator('figcaption').innerText(), section.imgCaption);
      // srcset의 w 디스크립터는 naturalWidth를 CSS 픽셀로 보정한다.
      // 실제 축소본 URL과 디코딩·크기를 함께 확인한다.
      assert.ok(await figure.locator('img').evaluate(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0));
      assert.match(await figure.locator('img').evaluate(img => img.currentSrc), new RegExp(`-${width < 480 ? 480 : 960}w\\.jpg$`));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    assert.equal(await page.locator('.post-cta .btn-primary').getAttribute('href'), '../index.html#estimator');
    assert.equal(await page.locator('.post-cta .btn-ghost').getAttribute('href'), '../index.html#inquiry');
    const mapHref = await page.locator('.pp-map').getAttribute('href');
    assert.equal(mapHref, 'https://map.naver.com/p/search/' + encodeURIComponent(article.place.name));
    assert.doesNotMatch(await page.locator('.post-body').innerText(), /36\.34|127\.39|목련아파트|\d+동\s*\d+호/);
    await page.evaluate(() => scrollTo(0, 0));
    if (process.env.MANMOOL_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.MANMOOL_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.MANMOOL_SCREENSHOT_DIR, `article-${width}.png`), fullPage: true });
      await page.screenshot({ path: path.join(process.env.MANMOOL_SCREENSHOT_DIR, `article-${width}-overview.png`) });
    }
    assert.deepEqual(errors, []);
  });
}
test('목록의 인테리어 검색에서 확인된 아파트명으로 사례를 찾아 정적 원고로 이동한다', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 850 } });
  t.after(() => context.close());
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(`${origin}/blog.html`);
  await page.locator('[data-case-filter="interior"]').click();
  await page.locator('#caseSearch').fill('한가람아파트');
  const link = page.locator(`#blogRoot a[href="posts/${slug}.html"]:visible`);
  assert.equal(await link.count(), 1);
  await link.click();
  await page.locator('.post-title').waitFor();
  assert.equal(await page.locator('.post-title').innerText(), article.title);
});
