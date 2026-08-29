/* inquiry-phone.e2e.cjs — 상담 폼이 유선번호 손님을 막지 않는가

   보호하는 사고: index.html 인테리어 상담 폼의 전화 검증이 휴대폰(01X)만
   통과시켜, 042(대전 유선)·02·070 으로 연락받으려는 손님이 3단계에서 영영
   못 넘어갔다. 상가·사무실·관리사무소·고령 손님이 여기 걸린다 — 인테리어는
   큰 공사가 들어오는 통로다. 같은 저장소의 누수 폼(js/leak-inquiry.js
   normalizePhone)은 이미 0으로 시작하는 10~11자리를 받고 있어, 한 사이트
   안에서 규칙이 갈려 있었다.

   여기서는 정규식을 읽지 않고 **실제 폼을 눌러서** 확인한다. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml',
};
let server, browser, origin;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(ROOT, rel);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

/* 3단계(이름·연락처)까지 몰고 가서 번호를 넣고 '다음'을 누른다.
   반환: 오류 문구(없으면 null) — 오류가 없으면 다음 단계로 넘어간 것이다. */
async function tryPhone(number) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // 바깥으로 나가는 전송은 절대 하지 않는다(대표 메일함 보호 — 인수인계서 규칙)
  await page.route('https://api.web3forms.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#inquiry').scrollIntoView());
  const next = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('#inquiry button')].find((x) => /다음/.test(x.textContent));
    if (b) b.click();
  });
  for (let i = 0; i < 3; i++) { await next(); await page.waitForTimeout(300); }
  await page.fill('#iName', '테스트');
  await page.fill('#iPhone', number);
  await next();
  await page.waitForTimeout(400);
  const err = await page.evaluate(() => {
    const e = document.querySelector('.field-error');
    return e ? e.textContent.trim() : null;
  });
  await ctx.close();
  return err;
}

test('대전 유선(042)·서울(02)·인터넷전화(070) 번호로도 상담을 넣을 수 있다', async () => {
  for (const number of ['042-123-4567', '02-123-4567', '070-1234-5678']) {
    const err = await tryPhone(number);
    assert.equal(err, null, `${number} 가 막혔다 — 유선 손님이 상담을 못 넣는다 (오류: ${err})`);
  }
});

test('휴대폰 번호는 종전대로 통과한다', async () => {
  for (const number of ['010-1234-5678', '01012345678']) {
    assert.equal(await tryPhone(number), null, `${number} 가 막혔다`);
  }
});

test('번호가 아닌 입력은 계속 막는다', async () => {
  for (const number of ['12345', '010-12-34', 'abcd']) {
    const err = await tryPhone(number);
    assert.ok(err && /번호/.test(err), `${number} 를 통과시켰다 — 연락 불가능한 리드가 쌓인다 (오류: ${err})`);
  }
});
