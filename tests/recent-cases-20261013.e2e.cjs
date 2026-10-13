// Read-only localhost verification; external services and submissions are blocked.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261013.json');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let file;
    try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { return res.writeHead(400).end(); }
    if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some(p => p.startsWith('.')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
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
  test(width + 'px five cases: photos, captions, legacy routes, related links and no overflow', { timeout: 120000 }, async t => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    t.after(() => context.close());
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const c of fixture.cases) {
      const article = site.insights.find(a => a.slug === c.slug);
      for (const route of ['posts/' + c.slug + '.html', 'blog.html?post=' + c.slug]) {
        await page.goto(origin + '/' + route);
        await page.locator('.post-title').waitFor();
        assert.equal(await page.locator('.post-title').innerText(), article.title);
        assert.equal(await page.locator('.post-body .post-figure').count(), c.photoCount);
        for (const [i, b] of article.body.filter(b => b.img).entries()) {
          const figure = page.locator('.post-body .post-figure').nth(i);
          await figure.scrollIntoViewIfNeeded();
          await figure.locator('img').evaluate(img => img.decode());
          assert.equal((await figure.locator('img').getAttribute('src')).replace(/^\.\.\//, ''), b.img);
          assert.equal(await figure.locator('figcaption').innerText(), b.imgCaption);
          assert.ok(await figure.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
        }
        const href = (await page.locator('.post-cta .btn-primary').getAttribute('href')).replace(/^\.\.\//, '');
        assert.equal(href, c.service === 'leak' ? 'leak.html?case=' + c.slug + '#leakInquiry' : 'index.html#estimator');
        if (c.service === 'interior') assert.equal((await page.locator('.post-cta .btn-ghost').getAttribute('href')).replace(/^\.\.\//, ''), 'index.html#inquiry');
        const related = await page.locator('.post-related .insight-card').evaluateAll(nodes => nodes.map(n => n.getAttribute('href').split('/').pop().replace('.html', '')));
        assert.deepEqual(related.slice(0, 2), article.relatedSlugs);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), c.slug);
      }
      if (width === 390 && process.env.MANMOOL_SCREENSHOT_DIR) {
        await page.goto(origin + '/posts/' + c.slug + '.html');
        await page.locator('img').evaluateAll(async images => {
          await Promise.all(images.map(async img => { img.loading = 'eager'; await img.decode(); }));
        });
        await page.screenshot({ path: path.join(process.env.MANMOOL_SCREENSHOT_DIR, c.slug + '-390.png'), fullPage: true });
        await page.screenshot({ path: path.join(process.env.MANMOOL_SCREENSHOT_DIR, c.slug + '-390-top.png') });
      }
    }
    assert.deepEqual(errors, []);
  });
}
test('mobile list filters and search discover each approved case', { timeout: 60000 }, async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 850 } });
  t.after(() => context.close());
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
  const page = await context.newPage();
  for (const c of fixture.cases) {
    const article = site.insights.find(a => a.slug === c.slug);
    await page.goto(origin + '/blog.html');
    await page.locator('[data-case-filter="' + c.service + '"]').click();
    await page.locator('#caseSearch').fill(article.title.split('｜')[0]);
    const link = page.locator('#blogRoot a[href="posts/' + c.slug + '.html"]:visible');
    assert.equal(await link.count(), 1, c.slug);
    await link.click();
    await page.locator('.post-title').waitFor();
    assert.equal(await page.locator('.post-title').innerText(), article.title);
  }
});
