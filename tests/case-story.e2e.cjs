/* Real generated HTML + legacy view. Local GET only; no customer data. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const articles = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8')).insights;
const slugs = [
  'buyeo-buyeong-balcony-waterproofing',
  'daejeon-geumho-hansarang-balcony-floor-screed', 'daejeon-jung-gu-heating-pipe-leak-repair',
  'daejeon-jung-gu-yard-water-valve-leak', 'apartment-balcony-rain-pipe-replacement',
  'apartment-upper-lower-rain-pipe-repair', 'apartment-basement-cast-iron-pipe-repair',
  'eunhasu-bathroom-waterproof', 'mugunghwa-pipe-replacement', 'yeolmae-waterproof-screed',
  'geumseong-basement-pipe-valve', 'seonbi-pipe-replacement', 'taesan-rain-pipe-replacement',
  'beomjigi-bathroom-waterproof', 'gaon-bathroom-waterproof', 'doram-waterproof-heating',
  'sejong-cafe-waterproof', 'mokdong-trench-drain', 'daejeon-church-canopy', 'taesan-lexan-frame',
  'nonsan-fire-door', 'daejayeon-bathroom-fixtures', 'daejeon-cafe-restroom-remodel',
  'dodam-floor-screed', 'samsung-apartment-drain-pipe-replacement', 'hanbat-drain-replacement',
];
let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let file;
    try { file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { return res.writeHead(400).end(); }
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
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
const paragraphs = value => String(value || '').replace(/\r\n?/g, '\n').trim()
  .split(/\n[\t ]*\n+/).map(p => p.trim()).filter(Boolean);
function expectedBody(article) {
  return article.body.flatMap(s => [
    { tag: 'H2', text: s.h },
    ...paragraphs(s.p).map(text => ({ tag: 'P', text })),
    ...(s.img ? [{ tag: 'FIGURE', src: s.img, alt: s.imgAlt || s.h, caption: s.imgCaption || '' }] : []),
  ]);
}
async function readBody(page) {
  return page.locator('.post-body').evaluate(el => [...el.children]
    .filter(n => !n.classList.contains('post-excerpt') && ['P', 'H2', 'FIGURE'].includes(n.tagName))
    .map(n => n.tagName === 'FIGURE' ? {
      tag: 'FIGURE', src: n.querySelector('img').getAttribute('src').replace(/^\.\.\//, ''),
      alt: n.querySelector('img').alt, caption: n.querySelector('figcaption')?.textContent || '',
    } : { tag: n.tagName, text: n.innerText }));
}
async function contextFor(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, ...options });
  const errors = [];
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  return context;
}

test('26개 사례의 문단·사진·캡션이 정적 글과 동적 글에서 정본과 일치', { timeout: 180000 }, async t => {
  const context = await contextFor(t);
  const page = await context.newPage();
  for (const slug of slugs) {
    const article = articles.find(a => a.slug === slug);
    assert.ok(article && article.published !== false, slug);
    assert.ok(article.body.every(s => paragraphs(s.p).length >= 2), `${slug}: 소분류의 짧은 문단이 사라짐`);
    for (const route of [`posts/${slug}.html`, `blog.html?post=${slug}`]) {
      await page.goto(origin + '/' + route, { waitUntil: 'domcontentloaded' });
      await page.locator('.post-title').waitFor();
      assert.equal(await page.locator('.post-title').innerText(), article.title);
      assert.deepEqual(await readBody(page), expectedBody(article), route);
      if (article.updated) assert.ok((await page.locator('.post-meta').innerText()).includes(article.updated));
      assert.equal(await page.locator('h1').count(), 1);
      assert.ok(await page.locator('.post-body > p + p').first().evaluate(el => parseFloat(getComputedStyle(el).marginTop) >= 12), route + ': 문단 간격 없음');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ': 가로 넘침');
    }
  }
});

test('320px 모바일과 JavaScript 없는 정적 글에서도 전체 사진 순서를 유지', { timeout: 120000 }, async t => {
  const context = await contextFor(t, { viewport: { width: 320, height: 740 }, javaScriptEnabled: false });
  const page = await context.newPage();
  for (const slug of slugs) {
    const article = articles.find(a => a.slug === slug);
    await page.goto(`${origin}/posts/${slug}.html`, { waitUntil: 'domcontentloaded' });
    assert.deepEqual(await readBody(page), expectedBody(article));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), slug);
    const photo = page.locator('.post-cover-image');
    if (article.image) {
      await photo.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.post-cover-image').naturalWidth > 0);
    }
  }
});

test('문단 합침·사진 누락 변이를 검사가 실제로 탐지하고 HTML 문자열은 실행되지 않는다', async t => {
  const article = articles.find(a => a.slug === slugs[0]);
  const context = await contextFor(t);
  const page = await context.newPage();
  await page.goto(`${origin}/blog.html?post=${article.slug}`);
  await page.locator('.post-title').waitFor();
  const expected = expectedBody(article);
  assert.deepEqual(await readBody(page), expected);
  await page.locator('.post-figure').first().evaluate(el => el.remove());
  assert.notDeepEqual(await readBody(page), expected, '사진 누락 변이를 놓침');
  await page.goto(`${origin}/blog.html?post=${article.slug}`);
  await page.locator('.post-title').waitFor();
  await page.locator('.post-body').evaluate(el => {
    const ps = [...el.children].filter(n => n.tagName === 'P' && !n.classList.contains('post-excerpt'));
    ps[0].append(ps[1].textContent); ps[1].remove();
  });
  assert.notDeepEqual(await readBody(page), expected, '문단 합침 변이를 놓침');
  const fixture = structuredClone(article);
  fixture.body = [{ h: '<svg onload="window.bad=1">', p: '<img src=x onerror="window.bad=1">\r\n\r\nA\r\nB' }];
  await context.route('**/data/site.json', route => route.fulfill({ json: { insights: [fixture] } }));
  await page.goto(`${origin}/blog.html?post=${fixture.slug}`);
  await page.locator('.post-title').waitFor();
  assert.deepEqual(await readBody(page), expectedBody(fixture));
  assert.equal(await page.locator('.post-body img, .post-body svg').count(), 0);
  assert.equal(await page.evaluate(() => window.bad), undefined);
});
