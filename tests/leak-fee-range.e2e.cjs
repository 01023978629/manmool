/* leak-fee-range.e2e.cjs — 누수 페이지 탐지비 범위 공개 (2026-10-23 대표 결정: 단계별 표 대신 최소~최대만)
   ① JS 를 꺼도 #leakFeeRange 가 보이고, site.json 단계 최소~최대와 '부가세 별도'가 적혀 있다
   ② 중간 단계 금액은 화면 어디에도 없다 (범위만 공개)
   ③ 검색엔진용 구조화 데이터(AggregateOffer)가 화면과 같은 범위다
   숫자는 테스트에 박지 않고 data/site.json 에서 읽는다 — 요금이 바뀌면 정본만 고치면 된다. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
let server, browser, origin;

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const amounts = site.leakPricing.tiers.map((t) => Number(t.amount));
const min = Math.min(...amounts);
const max = Math.max(...amounts);
const man = (n) => `${n / 10000}만`;

before(async () => {
  server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((resolve) => server.close(resolve)); });

test('JS 없이도 탐지비 범위(최소~최대·부가세 별도)가 보이고 중간 단계 금액은 없다', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  await page.route(/https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${origin}/leak.html`);
  const info = await page.locator('#leakFeeRange').evaluate((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { text: el.textContent, visible: r.height > 0 && r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' };
  });
  assert.equal(info.visible, true, '#leakFeeRange 가 화면에 없다');
  assert.match(info.text, new RegExp(`${man(min)}~${man(max)}원`));
  assert.match(info.text, /부가세 별도/);
  const body = await page.evaluate(() => document.body.innerText);
  for (const amount of amounts.filter((x) => x !== min && x !== max)) {
    assert.doesNotMatch(body, new RegExp(`${amount / 10000}만\\s*원|${amount.toLocaleString('ko-KR')}`), `중간 단계 금액 ${amount} 이 화면에 있다`);
  }
  // 요금 범위는 첫 화면(hero)에 있어야 한다 — 손님이 스크롤 없이 앵커(플랫폼 평균가)와 비교할 수 있게
  const inHero = await page.locator('#leakFeeRange').evaluate((el) => !!el.closest('.hero'));
  assert.equal(inHero, true);
  await context.close();
});

test('구조화 데이터의 탐지비 범위(AggregateOffer)가 화면·정본과 같다', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  await page.route(/https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${origin}/leak.html`);
  const offers = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .flatMap((s) => { const d = JSON.parse(s.textContent); return d['@graph'] || [d]; });
    const service = nodes.find((n) => n['@type'] === 'Service');
    return service ? service.offers : null;
  });
  assert.ok(offers, 'Service 노드에 offers 가 없다');
  assert.equal(offers['@type'], 'AggregateOffer');
  assert.equal(Number(offers.lowPrice), min);
  assert.equal(Number(offers.highPrice), max);
  assert.equal(offers.priceCurrency, 'KRW');
  assert.equal(offers.priceSpecification.valueAddedTaxIncluded, false);
  await page.close();
});
