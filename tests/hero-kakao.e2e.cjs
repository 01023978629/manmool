/* hero-kakao.e2e.cjs — 첫 화면 카톡 상담 버튼 (2026-09-04)
   js/main.js 는 kakao.ready 면 #heroKakao 를 켜도록 배선돼 있었지만 요소가 없어 죽은 배선이었다.
   ① kakao.ready=true → 첫 화면 hero-actions 에 카톡 버튼이 보이고 채널 주소로 새 탭(noopener)
   ② kakao.ready=false → 숨김(hidden)
   ③ 주 버튼(.btn-primary)의 실제 배경/글자 대비 ≥ 4.5:1 (계산은 렌더된 색으로) */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
let server, browser, origin;

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

const config = (kakao) => JSON.stringify({ kakao, forms: { enabled: true, endpoint: 'https://api.web3forms.com/submit', accessKey: 'test' }, n8n: { enabled: false }, naver: { ready: false } });

test('kakao.ready 면 첫 화면에 카톡 버튼이 채널 주소로 보인다', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  await page.route('**/data/config.json', (r) => r.fulfill({ contentType: 'application/json', body: config({ ready: true, chatUrl: 'https://pf.kakao.com/_xfnYGX/chat', channelAddUrl: 'https://pf.kakao.com/_xfnYGX' }) }));
  await page.route(/https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${origin}/index.html`);
  await page.waitForFunction(() => { const el = document.getElementById('heroKakao'); return el && !el.hidden; });
  const hero = await page.evaluate(() => { const el = document.getElementById('heroKakao'); const r = el.getBoundingClientRect(); return { inHero: !!el.closest('.hero-actions'), href: el.getAttribute('href'), target: el.getAttribute('target'), rel: el.getAttribute('rel'), visible: r.height > 0 && r.width > 0, text: el.textContent.trim() }; });
  assert.equal(hero.inHero, true); assert.equal(hero.visible, true);
  assert.equal(hero.href, 'https://pf.kakao.com/_xfnYGX/chat'); assert.equal(hero.target, '_blank'); assert.equal(hero.rel, 'noopener');
  assert.match(hero.text, /카카오톡/);
  await page.close();
});

test('kakao.ready 가 아니면 첫 화면 카톡 버튼은 숨겨진다', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  await page.route('**/data/config.json', (r) => r.fulfill({ contentType: 'application/json', body: config({ ready: false }) }));
  await page.route(/https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${origin}/index.html`);
  // 설정이 적용된 뒤에 본다(window.MANMUL 은 setupContactCtas 직전에 놓인다) — 정적 숨김만 보고 지나가지 않게
  await page.waitForFunction(() => window.MANMUL && window.MANMUL.config);
  const hidden = await page.evaluate(() => { const el = document.getElementById('heroKakao'); return el.hidden && el.getBoundingClientRect().height === 0; });
  assert.equal(hidden, true);
  await page.close();
});

test('주 버튼의 렌더된 배경과 흰 글자 대비가 4.5:1 이상이다', async () => {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  await page.route(/https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${origin}/index.html`);
  const ratio = await page.evaluate(() => {
    const el = document.querySelector('.hero-actions .btn-primary');
    const cs = getComputedStyle(el);
    const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const lum = (c) => { const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const bg = lum(rgb(cs.backgroundColor)), fg = lum(rgb(cs.color));
    return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
  });
  assert.ok(ratio >= 4.5, `대비 ${ratio.toFixed(2)}:1`);
  await page.close();
});
