// Read-only localhost verification; external services and submissions are blocked.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
const SLUG = 'winter-pipe-freeze-prevention-november';
const article = site.insights.find(a => a.slug === SLUG);
let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let file;
    try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { return res.writeHead(400).end(); }
    if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some(p => p.startsWith('.')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream';
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
async function openContext(t, width) {
  const context = await browser.newContext({ viewport: { width, height: 850 } });
  t.after(() => context.close());
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
  return context;
}
for (const width of [320, 390, 1280]) {
  test(width + 'px 동파 예방 안내: 사진 4장·설명·누수 상담·관련 글 3개·가로 넘침 없음', { timeout: 120000 }, async t => {
    const page = await (await openContext(t, width)).newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const route of ['posts/' + SLUG + '.html', 'blog.html?post=' + SLUG]) {
      await page.goto(origin + '/' + route);
      await page.locator('.post-title').waitFor();
      assert.equal(await page.locator('.post-title').innerText(), article.title);
      const figures = article.body.filter(b => b.img);
      assert.equal(await page.locator('.post-body .post-figure').count(), figures.length);
      for (const [i, b] of figures.entries()) {
        const figure = page.locator('.post-body .post-figure').nth(i);
        await figure.scrollIntoViewIfNeeded();
        await figure.locator('img').evaluate(img => { img.loading = 'eager'; return img.decode(); });
        assert.equal((await figure.locator('img').getAttribute('src')).replace(/^\.\.\//, ''), b.img);
        assert.equal(await figure.locator('figcaption').innerText(), b.imgCaption);
        assert.ok(await figure.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
      }
      const cover = page.locator(`img[src$="${article.image}"]`).first();
      await cover.evaluate(img => { img.loading = 'eager'; return img.decode(); });
      assert.equal(await cover.getAttribute('alt'), article.imageAlt);
      const href = (await page.locator('.post-cta .btn-primary').getAttribute('href')).replace(/^\.\.\//, '');
      assert.equal(href, 'leak.html?case=' + SLUG + '#leakInquiry');
      const related = await page.locator('.post-related .insight-card').evaluateAll(nodes => nodes.map(n => n.getAttribute('href').split('/').pop().replace('.html', '')));
      assert.deepEqual(related, article.relatedSlugs);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route);
    }
    assert.deepEqual(errors, []);
  });
}
test('390px 누수 랜딩 카드와 목록 검색에서 안내 글로 이어진다', { timeout: 60000 }, async t => {
  const page = await (await openContext(t, 390)).newPage();
  await page.goto(origin + '/leak.html');
  const card = page.locator(`#cases .case-card:has(a[href="posts/${SLUG}.html"])`);
  assert.equal(await card.count(), 1);
  await card.scrollIntoViewIfNeeded();
  // 2026-11-01: 카드 사진은 loading="lazy"라 화면에 든 직후 아직 요청 전이면 decode()가 EncodingError로 거절된다
  // (CI 실행 41212346848에서 실제로 실패). 바로 불러오게 한 뒤 decode 한다 — recent-cases-20261031 검사와 같은 방식.
  await card.locator('img').evaluate(img => { img.loading = 'eager'; return img.decode(); });
  assert.match(await card.locator('small').innerText(), /동파 예방 안내/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await card.locator('a.text-button').click();
  await page.locator('.post-title').waitFor();
  assert.equal(await page.locator('.post-title').innerText(), article.title);
  await page.goto(origin + '/blog.html');
  await page.locator('[data-case-filter="leak"]').click();
  await page.locator('#caseSearch').fill('동파');
  const link = page.locator(`#blogRoot a[href="posts/${SLUG}.html"]:visible`);
  assert.equal(await link.count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
});
