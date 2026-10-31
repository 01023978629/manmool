// Read-only localhost verification of the October 2026 photo cases; external requests and submissions are blocked.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261031.json');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let file;
    try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { return res.writeHead(400).end(); }
    if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some(p => p.startsWith('.')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
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
const localOnly = context => context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());

for (const width of [320, 390, 1280]) {
  test(width + 'px October cases: photos, captions, legacy route, consultation, related links and no overflow', { timeout: 240000 }, async t => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    t.after(() => context.close());
    await localOnly(context);
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
          assert.ok(await figure.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), b.img);
        }
        const href = (await page.locator('.post-cta .btn-primary').getAttribute('href')).replace(/^\.\.\//, '');
        assert.equal(href, 'leak.html?case=' + c.slug + '#leakInquiry');
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
      }
    }
    assert.deepEqual(errors, []);
  });
}

test('mobile list filter and search find each October case once', { timeout: 120000 }, async t => {
  const context = await browser.newContext({ viewport: { width: 390, height: 850 } });
  t.after(() => context.close());
  await localOnly(context);
  const page = await context.newPage();
  await page.goto(origin + '/blog.html');
  assert.equal(await page.locator('.insight-featured').getAttribute('href'), 'posts/' + site.insights[0].slug + '.html');
  for (const c of fixture.cases) {
    const article = site.insights.find(a => a.slug === c.slug);
    await page.goto(origin + '/blog.html');
    await page.locator('[data-case-filter="leak"]').click();
    await page.locator('#caseSearch').fill(article.title.split('｜')[0]);
    const link = page.locator('#blogRoot a[href="posts/' + c.slug + '.html"]:visible');
    assert.equal(await link.count(), 1, c.slug);
    await link.click();
    await page.locator('.post-title').waitFor();
    assert.equal(await page.locator('.post-title').innerText(), article.title);
  }
});

for (const width of [390, 1280]) {
  test(width + 'px leak page shows each October case card with a loaded photo and a working link', { timeout: 120000 }, async t => {
    const context = await browser.newContext({ viewport: { width, height: 850 } });
    t.after(() => context.close());
    await localOnly(context);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/leak.html');
    for (const c of fixture.cases) {
      const article = site.insights.find(a => a.slug === c.slug);
      const card = page.locator('#cases .case-card', { has: page.locator(`a.text-button[href="posts/${c.slug}.html"]`) });
      assert.equal(await card.count(), 1, c.slug);
      await card.scrollIntoViewIfNeeded();
      const img = card.locator('img');
      await img.evaluate(el => { el.loading = 'eager'; return el.decode(); });
      assert.equal(await img.getAttribute('src'), article.image);
      assert.equal(await img.getAttribute('alt'), article.imageAlt);
      assert.ok(await img.evaluate(el => el.complete && el.naturalWidth > 0), c.slug);
      assert.equal(await card.locator('h3').innerText(), article.title);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const first = fixture.cases[0].slug;
    await page.locator(`#cases a.text-button[href="posts/${first}.html"]`).click();
    await page.locator('.post-title').waitFor();
    assert.equal(new URL(page.url()).pathname, '/posts/' + first + '.html');
    assert.deepEqual(errors, []);
  });
}
