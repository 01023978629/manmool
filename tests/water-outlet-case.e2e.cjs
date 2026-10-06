// Local GET-only public-content tests. External maps and consultation submissions are blocked.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), slug = 'water-outlet-wall-repair-20261006';
const article = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8')).insights.find(a => a.slug === slug);
let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let file;
    try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { return res.writeHead(400).end(); }
    if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some(p => p.startsWith('.'))
      || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type + (type.startsWith('text/') ? '; charset=utf-8' : '') });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
for (const width of [320, 390, 1280]) {
  test(width + 'px: 옥천군 표시·공정별 사진·모바일 줄바꿈·상담 링크', { timeout: 60000 }, async t => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    t.after(() => context.close());
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const route of ['posts/' + slug + '.html', 'blog.html?post=' + slug]) {
      await page.goto(origin + '/' + route);
      assert.equal(await page.locator('.post-title').innerText(), article.title);
      // The legacy dynamic view has no location aside; its summary and prose still identify the county.
      // The normal static route exposes the deliberate county-only map search.
      if (route.startsWith('posts/')) {
        assert.equal(await page.locator('.post-place b').innerText(), '충청북도 옥천군');
        assert.equal(await page.locator('.pp-map').getAttribute('href'), 'https://map.naver.com/p/search/' + encodeURIComponent('충청북도 옥천군'));
      }
      assert.match(await page.locator('.post-summary').innerText(), /충북 옥천군/);
      assert.equal(await page.locator('.post-body .post-figure').count(), 2);
      for (const [i, b] of article.body.filter(b => b.img).entries()) {
        const figure = page.locator('.post-body .post-figure').nth(i);
        await figure.scrollIntoViewIfNeeded();
        await figure.locator('img').evaluate(img => img.decode());
        assert.equal((await figure.locator('img').getAttribute('src')).replace(/^\.\.\//, ''), b.img);
        assert.equal(await figure.locator('figcaption').innerText(), b.imgCaption);
        assert.ok(await figure.locator('img').evaluate(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > img.naturalWidth));
      }
      assert.equal((await page.locator('.post-cta .btn-primary').getAttribute('href')).replace(/^\.\.\//, ''), 'leak.html?case=' + slug + '#leakInquiry');
      assert.match(await page.locator('.post-body').innerText(), /중간 단계/);
      const related = await page.locator('.post-related .insight-card').evaluateAll(nodes =>
        nodes.map(n => n.getAttribute('href').split('/').pop().replace('.html', '')));
      assert.deepEqual(related.slice(0, 2), article.relatedSlugs);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    assert.deepEqual(errors, []);
    if (process.env.MANMOOL_SCREENSHOT_DIR) {
      await page.goto(origin + '/posts/' + slug + '.html');
      await page.screenshot({ path: path.join(process.env.MANMOOL_SCREENSHOT_DIR, 'okcheon-' + width + '.png'), fullPage: true });
    }
  });
}
test('모바일 배관 필터에서 옥천 검색 → 신규 글', async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 850 } });
  t.after(() => context.close());
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin + '/blog.html');
  await page.locator('[data-case-filter="leak"]').click();
  await page.locator('#caseSearch').fill('옥천');
  const link = page.locator('#blogRoot a[href="posts/' + slug + '.html"]:visible');
  assert.equal(await link.count(), 1);
  await link.click();
  await page.locator('.post-title').waitFor();
  assert.equal(await page.locator('.post-title').innerText(), article.title);
});
