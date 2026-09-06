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

/* ---------------------------------------------------------------------
   자동 하이픈이 유선번호를 망가뜨리지 않는가 (2026-09-06)

   보호하는 사고: js/inquiry.js formatPhone 이 모든 번호를 3-4-4 로 잘라
   "0421234567" → "042-1234-567", "021234567" → "021-2345-67" 이 됐다.
   validateStep 은 자릿수만 보고 collect() 는 칸의 표시 문자열을 그대로
   payload.phone 에 넣으므로, 대표는 잘못 끊긴 번호를 받아 되걸기 어려웠다.
   여기서는 390px 화면에서 실제로 치고 제출해, 칸의 값과 가로챈 전송
   payload.phone 을 함께 본다(실제 web3forms 로는 절대 보내지 않는다). */
async function formatAndSubmit(number, { typeKeys = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(9000);
  let payload = null;
  await page.route('https://api.web3forms.com/**', (route) => {
    try { payload = route.request().postDataJSON(); } catch { payload = { parseError: true }; }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#inquiry').scrollIntoView());
  const next = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('#inquiry button')].find((x) => /다음/.test(x.textContent));
    if (b) b.click();
  });
  for (let i = 0; i < 3; i++) { await next(); await page.waitForTimeout(250); }
  await page.fill('#iName', '테스트');
  if (typeKeys) { await page.click('#iPhone'); await page.type('#iPhone', number, { delay: 20 }); }
  else await page.fill('#iPhone', number);
  const shown = await page.inputValue('#iPhone');
  await next();
  await page.waitForTimeout(250);
  await page.check('#iConsent');
  await page.click('#submitInquiry');
  await page.waitForSelector('.inquiry-done');
  await page.waitForTimeout(150);
  await ctx.close();
  return { shown, sent: payload ? payload.phone : null };
}

test('유선번호는 지역번호에 맞게 끊기고, 대표에게 가는 payload.phone 도 같은 값이다 (390px)', async () => {
  for (const [typed, expected] of [
    ['0421234567', '042-123-4567'],   // 대전 유선 3-3-4
    ['021234567', '02-123-4567'],     // 서울 2-3-4
    ['0212345678', '02-1234-5678'],   // 서울 2-4-4
    ['01012345678', '010-1234-5678'], // 휴대폰은 종전대로 3-4-4
  ]) {
    const { shown, sent } = await formatAndSubmit(typed);
    assert.equal(shown, expected, `${typed} 를 칸에 ${shown} 으로 보여줬다`);
    assert.equal(sent, expected, `${typed} 가 대표에게 ${sent} 로 갔다 — 되걸 수 없는 번호`);
  }
});

test('한 글자씩 쳐도(입력 리스너·커서 처리) 결과가 같다', async () => {
  const { shown, sent } = await formatAndSubmit('0421234567', { typeKeys: true });
  assert.equal(shown, '042-123-4567');
  assert.equal(sent, '042-123-4567');
});

test('누수 폼: 잘못된 연락처 문구가 010 만 예로 들지 않는다 (042·02·070 도 받으므로)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(9000);
  let posts = 0;
  await page.route('https://api.web3forms.com/**', (route) => { posts += 1; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }); });
  await page.goto(`${origin}/leak.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.ManmulLead && document.querySelector('#lkSubmit'));
  await page.fill('#lkPhone', '12345');
  await page.check('#lkConsent');
  await page.click('#lkSubmit');
  await page.waitForFunction(() => /연락처/.test((document.querySelector('#lkStatus') || {}).textContent || ''));
  const msg = await page.evaluate(() => document.querySelector('#lkStatus').textContent.trim());
  assert.equal(msg, '연락처를 숫자 10~11자리로 입력해 주세요 (예: 010-1234-5678, 042-123-4567)');
  assert.equal(posts, 0, '잘못된 번호가 전송됐다');
  await ctx.close();
});
