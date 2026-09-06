/* leak-kakao.e2e.cjs — 누수 페이지의 접수 전 카카오톡 문의 버튼 (2026-09-06)
   leak.html 은 카카오 링크가 0개(모두 tel:)였고 접수 뒤(showDone)에만 카톡이 나왔다.
   사진은 폼으로 못 보내니 접수 전에도 카톡 통로가 있어야 한다. 단, 미개설 채널로 유도하면 안 된다.
   ① kakao.ready + 채널 주소 → 첫 화면(.hero-actions)·제출 줄(.leak-submit-row)·하단 연락 목록(.contact-action-list)
      세 자리 모두 보이고 href 가 pf.kakao.com, 새 탭(noopener)
   ② kakao.ready=false → 세 자리 모두 hidden 이고 높이 0 (설정 적용 뒤에 본다)
   ③ 390px 에서 탭 크기 44px 이상, 하단 고정 .mobile-call-bar 에 가려지지 않는다 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
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

const IDS = ['lkKakaoHero', 'lkKakaoSubmit', 'lkKakaoContact'];
const HOSTS = { lkKakaoHero: '.hero-actions', lkKakaoSubmit: '.leak-submit-row', lkKakaoContact: '.contact-action-list' };
const CHAT = 'https://pf.kakao.com/_xfnYGX/chat';
const config = (kakao) => JSON.stringify({ kakao, forms: { enabled: true, endpoint: 'https://api.web3forms.com/submit', accessKey: 'test' }, n8n: { enabled: false }, naver: { ready: false } });

async function open(kakao, viewport) {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  await page.route('**/data/config.json', (r) => r.fulfill({ contentType: 'application/json', body: config(kakao) }));
  // 바깥으로는 아무것도 나가지 않는다(web3forms 포함)
  await page.route(/https:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${origin}/leak.html`);
  // 정적 hidden 만 보고 지나가지 않게, 설정을 읽고 판단이 끝난 표식을 기다린다
  await page.waitForFunction((ids) => ids.every((id) => { const el = document.getElementById(id); return el && el.getAttribute('data-leak-kakao-state'); }), IDS);
  return { ctx, page };
}

test('kakao.ready 면 첫 화면·제출 줄·하단 연락 목록 세 자리에 카톡 문의 버튼이 채널 주소로 보인다', async () => {
  const { ctx, page } = await open({ ready: true, chatUrl: CHAT, channelAddUrl: 'https://pf.kakao.com/_xfnYGX' });
  const rows = await page.evaluate(({ ids, hosts }) => ids.map((id) => {
    const el = document.getElementById(id); const r = el.getBoundingClientRect();
    return { id, inHost: !!el.closest(hosts[id]), hidden: el.hidden, href: el.getAttribute('href'), target: el.getAttribute('target'), rel: el.getAttribute('rel'), visible: r.width > 0 && r.height > 0, text: el.textContent.trim() };
  }), { ids: IDS, hosts: HOSTS });
  for (const row of rows) {
    assert.equal(row.inHost, true, `${row.id} 가 ${HOSTS[row.id]} 안에 없다`);
    assert.equal(row.hidden, false, `${row.id} 가 숨겨져 있다`);
    assert.equal(row.visible, true, `${row.id} 가 화면에 크기가 없다`);
    assert.equal(row.href, CHAT, `${row.id} href`);
    assert.equal(row.target, '_blank', `${row.id} target`);
    assert.equal(row.rel, 'noopener', `${row.id} rel`);
    assert.match(row.text, /카카오톡/);
  }
  assert.equal(rows.every((r) => /^https:\/\/pf\.kakao\.com\//.test(r.href)), true);
  await ctx.close();
});

test('kakao.ready 가 아니면 세 자리 모두 숨겨지고 높이가 0 이다 — 미개설 채널로 유도하지 않는다', async () => {
  const { ctx, page } = await open({ ready: false, chatUrl: CHAT, channelAddUrl: 'https://pf.kakao.com/_xfnYGX' });
  const rows = await page.evaluate((ids) => ids.map((id) => { const el = document.getElementById(id); const r = el.getBoundingClientRect(); return { id, hidden: el.hidden, height: r.height, href: el.getAttribute('href') }; }), IDS);
  for (const row of rows) {
    assert.equal(row.hidden, true, `${row.id} 가 ready=false 인데 보인다`);
    assert.equal(row.height, 0, `${row.id} 가 ready=false 인데 높이 ${row.height}`);
    assert.equal(row.href, null, `${row.id} 에 href 가 남아 있다`);
  }
  // 접수 전 카카오 링크가 페이지 어디에도 없어야 한다(showDone 이전)
  assert.equal(await page.locator('a[href*="pf.kakao.com"]').count(), 0);
  await ctx.close();
});

test('390px 에서 세 버튼 모두 탭 크기 44px 이상이고 하단 고정 전화 바에 가려지지 않는다', async () => {
  const { ctx, page } = await open({ ready: true, chatUrl: CHAT }, { width: 390, height: 844 });
  for (const id of IDS) {
    const m = await page.evaluate((id) => {
      const el = document.getElementById(id);
      // 페이지가 smooth scroll 이라 기본 scrollIntoView 는 비동기 — 즉시 이동시켜 놓고 잰다
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.mobile-call-bar');
      const b = bar ? bar.getBoundingClientRect() : null;
      const barFixed = bar ? getComputedStyle(bar).position === 'fixed' : false;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const overlaps = b && barFixed ? !(r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right) : false;
      return { width: r.width, height: r.height, barFixed, overlaps, hitIsLink: !!(hit && (hit === el || el.contains(hit))) };
    }, id);
    assert.ok(m.height >= 44 && m.width >= 44, `${id} 탭 크기 ${m.width}x${m.height}`);
    assert.equal(m.barFixed, true, '390px 에서 .mobile-call-bar 가 고정돼 있지 않다 — 검사 전제가 바뀌었다');
    assert.equal(m.overlaps, false, `${id} 가 하단 전화 바와 겹친다`);
    assert.equal(m.hitIsLink, true, `${id} 중앙을 눌러도 다른 요소가 잡힌다`);
  }
  // 페이지 맨 아래까지 내려도 하단 연락 목록의 카톡 버튼은 전화 바 위에 남는다(footer 여백)
  const bottom = await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    const r = document.getElementById('lkKakaoContact').getBoundingClientRect();
    const b = document.querySelector('.mobile-call-bar').getBoundingClientRect();
    return { linkBottom: r.bottom, barTop: b.top };
  });
  assert.ok(bottom.linkBottom <= bottom.barTop, `맨 아래에서 하단 카톡 버튼(bottom ${bottom.linkBottom})이 전화 바(top ${bottom.barTop})에 덮인다`);
  await ctx.close();
});
