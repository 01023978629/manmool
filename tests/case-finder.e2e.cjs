/* Public blog finder: real generated cards, no account access or submissions. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const published = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'))
  .insights.filter((item) => item && item.published !== false)
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
function caseGroup(item) {
  const service = Object.hasOwn(item, 'service')
    ? (item.service === 'leak' ? 'leak' : 'interior')
    : (['방수·설비', '누수탐지·수리'].includes(item.category) ? 'leak' : 'interior');
  return service === 'leak' ? 'leak' : /견적|계약|보증|관리|브랜드/.test(item.category || '') ? 'info' : 'interior';
}
const featured = published.find((item) => Object.keys(item.caseSummary || {}).length && caseGroup(item) !== 'info');
const featuredSlug = featured?.slug;
// 기본 화면은 실제 작업 대표가 먼저이고, 검색/분야 필터는 날짜순이다.
const allSlugs = [featured, ...published.filter((item) => item !== featured)].filter(Boolean).map((item) => item.slug);
const bySlug = new Map(published.map((item) => [item.slug, item]));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml',
};
let server, browser, origin;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let target;
    try {
      target = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname));
    } catch (_) { res.writeHead(400).end(); return; }
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end(); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' });
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

async function openBlog(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const requests = [];
  const errors = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    requests.push({ url: request.url(), method: request.method() });
    if (!request.url().startsWith(origin + '/') || request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], '브라우저 JavaScript 오류');
    assert.deepEqual(requests.filter((request) => request.method !== 'GET'), [], '폼이나 데이터를 전송함');
  });
  await page.goto(`${origin}/blog.html`, { waitUntil: 'networkidle' });
  if (options.javaScriptEnabled !== false) await page.locator('#caseFinder').waitFor({ state: 'visible' });
  return { page, requests };
}

function cardLinks(page, visible = false) {
  return page.locator(`#blogRoot a[href^="posts/"]${visible ? ':visible' : ''}`);
}

async function slugs(page, visible = false) {
  return cardLinks(page, visible).evaluateAll((links) => links.map((link) =>
    decodeURIComponent(link.getAttribute('href').split('/').pop().replace(/\.html(?:[?#].*)?$/, ''))));
}

async function search(page, value, expectedCount) {
  await page.locator('#caseSearch').fill(value);
  if (expectedCount !== undefined) {
    await page.waitForFunction((count) => [...document.querySelectorAll('#blogRoot a[href^="posts/"]')]
      .filter((link) => link.getClientRects().length > 0).length === count, expectedCount);
  }
}

async function reset(page) {
  await page.locator('[data-case-reset]:visible').first().click();
  await page.waitForFunction((count) => [...document.querySelectorAll('#blogRoot a[href^="posts/"]')]
    .filter((link) => link.getClientRects().length > 0).length === count, published.length);
}

test('JavaScript 없이 공개 목록과 모든 글 링크를 한 벌 유지한다', async (t) => {
  const { page } = await openBlog(t, { javaScriptEnabled: false });
  assert.deepEqual(await slugs(page, true), allSlugs);
  assert.equal(new Set(await slugs(page)).size, published.length);
  assert.equal(await page.locator('.insight-featured:visible').count(), 1);
  assert.equal(await page.locator('#caseFinder').isVisible(), false, '동작하지 않는 검색 폼을 표시함');
  assert.equal(await page.locator('#caseEmpty').isVisible(), false);
  assert.equal(await page.locator('#blogRoot h1').count(), 1);
});

test('기본 목록은 추가 데이터 요청 없이 접근 가능한 검색과 최신 대표 사례를 제공한다', async (t) => {
  const { page, requests } = await openBlog(t);
  assert.deepEqual(await slugs(page, true), allSlugs);
  assert.equal(await page.locator('.insight-featured:visible').count(), 1);
  assert.equal(await page.locator('.insights-grid .insight-card').count(), published.length - 1);
  assert.equal(await page.locator('#caseSearch').getAttribute('maxlength'), '120');
  assert.equal(await page.getByRole('searchbox').count(), 1);
  for (const id of ['caseSearch', 'caseSort']) {
    assert.equal(await page.locator(`#${id}`).evaluate((el) => Boolean(el.labels?.length || el.getAttribute('aria-label'))), true, `${id} 이름 누락`);
  }
  assert.equal(await page.locator('#caseFilterStatus').getAttribute('aria-live'), 'polite');
  assert.match(await page.locator('#caseFilterStatus').innerText(), new RegExp(`${published.length}건`));
  assert.equal(requests.some((request) => /\/data\/site\.json(?:\?|$)/.test(request.url)), false);
});

test('단지명 띄어쓰기·여러 단어·전각 숫자를 찾고 작업 요약만 검색한다', async (t) => {
  const { page } = await openBlog(t);
  await search(page, '금호 한사랑 평탄화', 1);
  assert.deepEqual(await slugs(page, true), ['daejeon-geumho-hansarang-balcony-floor-screed']);
  assert.equal(await page.locator('.insights-grid .insight-card:visible').count(), 1, '대표 사례가 검색 결과에서 빠짐');
  await search(page, '선비마을 ３단지', 1);
  assert.deepEqual(await slugs(page, true), ['seonbi-pipe-replacement']);
  await search(page, '금호한사랑 양생', 0);
  assert.equal(await page.locator('#caseEmpty').isVisible(), true, '본문 전용 단어까지 검색됨');
  await search(page, '금호한사랑 존재하지않는공정', 0);
  assert.equal(await page.locator('#caseEmpty').isVisible(), true, '검색 단어를 OR로 처리함');
});

test('분야 필터는 대표 우선 대신 최신 날짜순이며 정보 글을 대표 시공으로 표시하지 않는다', async (t) => {
  const { page } = await openBlog(t);
  for (const group of ['info', 'interior', 'leak']) {
    await page.locator(`[data-case-filter="${group}"]`).click();
    assert.deepEqual(await slugs(page, true), published.filter((item) => caseGroup(item) === group).map((item) => item.slug));
    assert.equal(await page.locator('.insight-featured:visible').count(), 0);
  }
  await reset(page);
  assert.deepEqual(await slugs(page, true), allSlugs);
  assert.notEqual(await page.locator('.insight-featured').getAttribute('data-group'), 'info');
});

test('검색과 분야를 함께 적용하고 결과 없음 안내에서 상담과 초기화로 이어진다', async (t) => {
  const { page } = await openBlog(t);
  await search(page, '한밭우성 우수관', 1);
  await page.locator('[data-case-filter="leak"]').click();
  assert.deepEqual(await slugs(page, true), ['apartment-balcony-rain-pipe-replacement']);
  await page.locator('[data-case-filter="interior"]').click();
  assert.equal(await cardLinks(page, true).count(), 0);
  assert.equal(await page.locator('#caseSearch').inputValue(), '한밭우성 우수관');
  assert.equal(await page.locator('#caseEmpty').isVisible(), true);
  for (const group of ['leak', 'interior', 'info']) {
    await search(page, '해당없는단지와공정', 0);
    await page.locator(`[data-case-filter="${group}"]`).click();
    assert.equal(await page.locator(`[data-case-filter="${group}"]`).getAttribute('aria-pressed'), 'true');
    const links = await page.locator('#caseEmpty a[href]').evaluateAll((items) => items.map((item) => item.getAttribute('href')));
    assert.equal(links.some((href) => group === 'leak'
      ? /(?:^|\/)leak\.html(?:[?#]|$)/.test(href)
      : /(?:^|\/)index\.html#inquiry$/.test(href)), true, `${group} 상담 경로 누락`);
  }
  await page.locator('#caseSort').selectOption('oldest');
  await reset(page);
  assert.equal(await page.locator('#caseSearch').inputValue(), '');
  assert.equal(await page.locator('#caseSort').inputValue(), 'newest');
  assert.equal(await page.locator('[data-case-filter="all"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#caseEmpty').isVisible(), false);
  assert.deepEqual(await slugs(page, true), allSlugs);
  assert.equal(await page.locator('.insight-featured').getAttribute('href'), `posts/${featuredSlug}.html`);
});

test('오래된순은 대표 사례를 포함해 실제 DOM 순서를 바꾸고 최신순 복귀시 중복하지 않는다', async (t) => {
  const { page } = await openBlog(t);
  await page.locator('#caseSort').selectOption('oldest');
  const oldest = await slugs(page, true);
  assert.equal(oldest.length, published.length);
  assert.equal(new Set(oldest).size, published.length);
  assert.equal(await page.locator('.insights-grid .insight-card:visible').count(), published.length);
  const dates = oldest.map((slug) => bySlug.get(slug).date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(oldest.includes(featuredSlug), true);
  await page.locator('#caseSort').selectOption('newest');
  assert.deepEqual(await slugs(page, true), allSlugs);
  assert.equal(await page.locator('.insight-featured:visible').count(), 1);
  assert.equal(new Set(await slugs(page)).size, published.length);
});

test('글을 읽고 브라우저 뒤로가기를 하면 검색어·분야·정렬·결과가 복원된다', async (t) => {
  const { page } = await openBlog(t);
  await search(page, '배관');
  await page.locator('[data-case-filter="leak"]').click();
  await page.locator('#caseSort').selectOption('oldest');
  const before = await slugs(page, true);
  assert.equal(before.length > 1 && before.length < published.length, true);
  const href = await cardLinks(page, true).first().getAttribute('href');
  await cardLinks(page, true).first().click();
  await page.waitForURL(`${origin}/${href}`);
  await page.goBack({ waitUntil: 'networkidle' });
  await page.locator('#caseFinder').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#caseSearch').inputValue(), '배관');
  assert.equal(await page.locator('#caseSort').inputValue(), 'oldest');
  assert.equal(await page.locator('[data-case-filter="leak"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await slugs(page, true), before);
});

test('검색어는 텍스트로 처리하며 URL·저장소·네트워크에 쓰지 않고 Enter도 전송하지 않는다', async (t) => {
  const { page, requests } = await openBlog(t);
  const payload = '<img src=x onerror=window.caseFinderXss=1>';
  const start = requests.length;
  await search(page, payload, 0);
  await page.locator('#caseSearch').press('Enter');
  assert.equal(page.url(), `${origin}/blog.html`);
  assert.equal(await page.evaluate(() => window.caseFinderXss), undefined);
  assert.equal(await page.locator('#blogRoot img[src="x"]').count(), 0);
  assert.equal(await page.locator('#caseEmpty').isVisible(), true);
  const storage = await page.evaluate(() => ({
    local: JSON.stringify(Object.entries(localStorage)),
    session: JSON.stringify(Object.entries(sessionStorage)),
    state: JSON.stringify(history.state?.manmoolCaseFinder || {}),
  }));
  assert.equal(storage.local.includes(payload) || storage.session.includes(payload), false);
  assert.equal(storage.state.includes(payload), true, '뒤로가기 복원 상태가 없음');
  assert.equal(requests.slice(start).some((request) => request.url.includes('onerror') || /[?&](?:q|search|query)=/.test(request.url)), false);
});

for (const width of [320, 390]) {
  test(`${width}px 모바일에서 검색·빈 결과·초기화가 가로 넘침 없이 동작한다`, async (t) => {
    const { page } = await openBlog(t, { viewport: { width, height: 844 }, isMobile: true });
    await search(page, '금호한사랑', 1);
    await search(page, '모바일에서찾을수없는현장'.repeat(6), 0);
    const metrics = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      short: [...document.querySelectorAll('#caseSearch, #caseSort, [data-case-filter], [data-case-reset]')]
        .filter((el) => el.getClientRects().length && el.getBoundingClientRect().height < 44)
        .map((el) => el.id || el.textContent.trim()),
    }));
    assert.equal(metrics.scroll, metrics.width, '가로 스크롤 발생');
    assert.deepEqual(metrics.short, [], '모바일 조작 영역 44px 미만');
    await reset(page);
    assert.deepEqual(await slugs(page, true), allSlugs);
  });
}
