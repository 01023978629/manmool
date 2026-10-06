// Public-case reading paths only. No external requests or customer submissions.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const slugs = ['chungmu-heating-rust-water-flushing-20260930', 'chungmu-heating-manifold-installation-20260930',
  'seonbi-boiler-pipe-leak-repair-20260929', 'doan-central-bathroom-pipe-waterproof-20260923', 'jinjam-town-rain-pipe-repair-202609'];
const cases = slugs.map(slug => site.insights.find(a => a.slug === slug));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// 2026-10-02: 30개 사례 보완·열매 공정 분리 승인 반영. 원본 사실·안내 글은 remaining-cases 검사로 별도 보존.
// 2026-10-06: 알루미늄 방충망 사례 1건 추가. 이전 57건 보존은 aluminum-screen-case 검사.
// 2026-10-06: 신규 방충망 현장명만 대표 확인으로 정정. 기존 57개 글과 사진은 전용 검사로 계속 보호.
const othersHash = 'c2e1f21d5c4a64ca82ca3ac8a30a00494a1c86bd887970575e64d5b5de4bf7ee';
const factsHash = 'a0d49c6730aab650c175ec63a5f2b2a07aad7f4649b1d4de0059251e39e4b5e5';
const others = items => items.filter(a => !slugs.includes(a.slug));
const facts = items => items.filter(a => slugs.includes(a.slug)).map(({title, excerpt, updated, consultation, relatedSlugs, body, ...a}) =>
  ({...a, body: body.map(({h, p, ...b}) => b)}));

test('기준 갱신한 53개 글·정렬·기존 5개 글의 날짜·분류·핵심 요약·사진 35장과 설명 보존', () => {
  assert.equal(others(site.insights).length, 53);
  assert.equal(hash(others(site.insights)), othersHash);
  assert.equal(hash(facts(site.insights)), factsHash);
  assert.equal(cases.flatMap(a => a.body.filter(b => b.img)).length, 35);
  const changed = structuredClone(site.insights);
  changed.find(a => !slugs.includes(a.slug)).title += '변이';
  assert.notEqual(hash(others(changed)), othersHash);
  const changedPhoto = structuredClone(site.insights);
  changedPhoto.find(a => a.slug === slugs[0]).body.reverse();
  assert.notEqual(hash(facts(changedPhoto)), factsHash);
});

test('5개 사례의 검색 소개·상담 준비·같은 서비스 관련 글이 유효하다', () => {
  for (const a of cases) {
    assert.ok(a.title.startsWith('대전 ') && a.title.length <= 65);
    assert.ok(a.excerpt.length > 50 && a.excerpt.length <= 200);
    assert.equal(a.updated, '2026-10-01');
    assert.ok(a.body.every(b => b.p.split(/\n\n/).every(p => p.length <= 220)));
    assert.ok(a.consultation.photos.length > 20 && a.consultation.scope.length > 20);
    assert.ok(a.relatedSlugs.length >= 2);
    assert.equal(new Set(a.relatedSlugs).size, a.relatedSlugs.length);
    for (const slug of a.relatedSlugs) {
      const related = site.insights.find(item => item.slug === slug);
      assert.ok(related && related.published !== false && slug !== a.slug);
      assert.ok(related.service === 'leak' || (!('service' in related) && related.category === '방수·설비'));
    }
    assert.doesNotMatch(JSON.stringify(a), /100%|최저가|평생 보증|고객님께서.*만족|92번길|고객명|driveId|sourcePath|GPS|010[- ]/);
  }
});

let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') return res.writeHead(405).end();
    let file;
    try { file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { return res.writeHead(400).end(); }
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const type = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.jpg':'image/jpeg', '.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'content-type':type + (type.startsWith('text/') ? '; charset=utf-8' : '')});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true});
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function contextFor(t, options = {}) {
  const context = await browser.newContext({viewport:{width:1280,height:850}, ...options});
  const errors = [];
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') && route.request().method() === 'GET' ? route.continue() : route.abort());
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  return context;
}
async function verifyArticle(page, a) {
  await page.locator('.post-title').waitFor();
  assert.equal(await page.locator('.post-title').innerText(), a.title);
  assert.equal(await page.locator('.post-excerpt').innerText(), a.excerpt);
  assert.equal(await page.locator('meta[name="description"]').getAttribute('content'), a.excerpt);
  assert.match(await page.locator('link[rel="canonical"]').getAttribute('href'), new RegExp('/posts/' + a.slug + '\\.html$'));
  assert.equal(await page.locator('.post-cta h2').innerText(), '비슷한 작업을 상담하고 싶다면');
  assert.ok((await page.locator('.post-cta-prep').innerText()).includes(a.consultation.photos));
  assert.ok((await page.locator('.post-cta-scope').innerText()).includes(a.consultation.scope));
  const inquiry = await page.locator('.post-cta .btn-primary').getAttribute('href');
  assert.equal(inquiry.replace(/^\.\.\//, ''), `leak.html?case=${a.slug}#leakInquiry`);
  assert.equal(await page.locator('.post-cta .btn-ghost').getAttribute('href'), `tel:${site.company.phone.replace(/-/g, '')}`);
  const related = await page.locator('.post-related .insight-card').evaluateAll(links => links.map(link => link.getAttribute('href').split('/').pop().replace('.html', '')));
  assert.equal(related.length, 3);
  assert.equal(new Set(related).size, 3);
  assert.ok(!related.includes(a.slug));
  assert.deepEqual(related.slice(0, a.relatedSlugs.length), a.relatedSlugs);
  assert.deepEqual(await page.locator('.post-body figure img').evaluateAll(images => images.map(img => img.getAttribute('src').replace(/^\.\.\//, ''))), a.body.filter(b => b.img).map(b => b.img));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}

test('정적·동적 글 10개 경로: 수정 원고·검색 메타·상담 링크·관련 사례·사진 순서', {timeout:120000}, async t => {
  const context = await contextFor(t), page = await context.newPage();
  for (const a of cases) for (const route of [`posts/${a.slug}.html`, `blog.html?post=${a.slug}`]) {
    await page.goto(`${origin}/${route}`, {waitUntil:'domcontentloaded'});
    await verifyArticle(page, a);
  }
});

test('320px 모바일·JavaScript 꺼짐: 5개 사례의 사진과 상담 버튼을 이용할 수 있다', {timeout:120000}, async t => {
  const context = await contextFor(t, {viewport:{width:320,height:740},javaScriptEnabled:false}), page = await context.newPage();
  for (const a of cases) {
    await page.goto(`${origin}/posts/${a.slug}.html`, {waitUntil:'domcontentloaded'});
    await verifyArticle(page, a);
    for (const img of await page.locator('.post-body figure img').all()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(el => el.complete && el.naturalWidth ? Promise.resolve() : new Promise((resolve, reject) => {
        el.addEventListener('load', resolve, {once:true}); el.addEventListener('error', () => reject(new Error('broken image')), {once:true});
      }));
    }
    await page.locator('.post-cta .btn-primary').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.post-cta .btn-primary').isVisible());
    if (process.env.CASE_READER_SCREENSHOTS && a === cases[1]) {
      await page.locator('.post-cta').screenshot({path:path.join(process.env.CASE_READER_SCREENSHOTS, 'case-reader-mobile-cta.png')});
      await page.screenshot({path:path.join(process.env.CASE_READER_SCREENSHOTS, 'case-reader-mobile-full.png'),fullPage:true});
    }
  }
});

test('동적 렌더는 상담 문구 HTML을 실행하지 않고 관련 글의 자기참조·중복·없는 글을 제외', async t => {
  const context = await contextFor(t), page = await context.newPage();
  const fixture = structuredClone(site), a = fixture.insights.find(a => a.slug === slugs[0]);
  a.consultation.photos = '<img src=x onerror="window.injected=true">';
  a.relatedSlugs = [a.slug, 'not-a-post', slugs[1], slugs[1], 'eunhasu-bathroom-waterproof'];
  await context.route('**/data/site.json*', route => route.fulfill({json:fixture}));
  await page.goto(`${origin}/blog.html?post=${a.slug}`, {waitUntil:'domcontentloaded'});
  await page.locator('.post-cta-prep').waitFor();
  assert.ok((await page.locator('.post-cta-prep').innerText()).includes(a.consultation.photos));
  assert.equal(await page.locator('.post-cta-prep img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  const links = await page.locator('.post-related a').evaluateAll(els => els.map(el => el.getAttribute('href')));
  assert.equal(links[0], `posts/${slugs[1]}.html`);
  assert.equal(new Set(links).size, 3);
  assert.ok(links.every(link => !link.includes(a.slug) && !link.includes('not-a-post') && !link.includes('eunhasu')));
});
