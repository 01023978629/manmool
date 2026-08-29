/* inquiry-result-honesty.e2e.cjs — 접수 결과 화면이 사실만 말하는가

   보호하는 사고(2026-08 리드 감사에서 살아남은 지적들):
     ① 전송에 성공해도 "회신이 안 오면 어떻게 하라"는 안내가 없어, 손님은
        메일이 스팸함에 걸린 줄도 모르고 며칠을 기다린다.
     ② 복사 버튼이 성공·실패와 무관하게 "복사했습니다"를 띄웠다. 클립보드가
        막힌 브라우저(권한 거부·구형 iOS)에서는 손님이 빈 카톡을 보내고
        회신을 기다린다 — 리드가 통째로 증발한다.
     ③ 전송이 안 된 화면에 보낼 내용 자체가 없었다. 복사가 막히면 손님이
        옮겨 적을 원문이 화면 어디에도 없다(누수 폼은 이미 <pre>로 보여준다).
     ④ 12초까지 걸리는 전송 동안 버튼 글자가 그대로여서, 손님은 안 눌린 줄
        알고 다시 누른다(중복 접수).

   정규식이 아니라 **실제 브라우저에서 폼을 눌러** 확인한다.
   바깥으로 나가는 전송은 전부 가로챈다 — 대표 메일함에 시험 접수가 가면 안 된다. */
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

/* opts.deliver: 'ok' | 'fail' | 'slow'
   opts.clipboard: 'ok' | 'blocked'  (blocked = writeText 거부 + execCommand false)
    opts.config: 'ok' | 'dead' | 'flaky'
     dead  = data/config.json 이 계속 실패
     flaky = 처음 두 요청만 실패. 이 페이지에서 config.json 을 읽는 스크립트가
             둘(lead-transport·hj-link)이라, '첫 요청만'으로 잡으면 어느 쪽이
             먼저 나가느냐에 따라 재시도가 시험되지 않을 수 있다 — 둘을 다 떨궈
             lead-transport 가 반드시 한 번은 실패하고 재시도하게 만든다.
   4단계까지 몰고 가서 제출한다. 반환: 결과 화면을 볼 수 있는 page */
async function submitInquiry(opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.__configHits = 0;
  if (opts.config === 'dead' || opts.config === 'flaky') {
    await page.route('**/data/config.json*', (route) => {
      page.__configHits += 1;
      if (opts.config === 'dead' || page.__configHits <= 2) return route.fulfill({ status: 503, body: 'nope' });
      return route.continue();
    });
  }
  // 실제 전송은 절대 나가지 않는다(대표 메일함 보호)
  await page.route('https://api.web3forms.com/**', async (route) => {
    if (opts.deliver === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' });
    if (opts.deliver === 'slow') { await new Promise((r) => setTimeout(r, 2500)); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  if (opts.clipboard === 'blocked') {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error('denied')) },
        });
      } catch (e) { /* 무시 */ }
      document.execCommand = () => false;
    });
  }
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#inquiry').scrollIntoView());
  const next = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('#inquiry button')].find((x) => /다음/.test(x.textContent));
    if (b) b.click();
  });
  for (let i = 0; i < 3; i++) { await next(); await page.waitForTimeout(250); }
  await page.fill('#iName', '테스트고객');
  await page.fill('#iPhone', '010-1234-5678');
  await next();
  await page.waitForTimeout(250);
  await page.check('#iConsent');
  return page;
}

const doneText = (page) => page.evaluate(() => {
  const d = document.querySelector('.inquiry-done');
  return d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
});

test('① 전송에 성공하면 "회신이 없으면 전화" 안내와 통화 링크가 함께 뜬다', async () => {
  const page = await submitInquiry({ deliver: 'ok' });
  await page.click('#submitInquiry');
  await page.waitForSelector('.inquiry-done', { timeout: 9000 });
  await page.waitForTimeout(300);

  const t = await doneText(page);
  assert.match(t, /전달되었습니다/, '성공 화면이 아니다: ' + t);
  const tel = await page.evaluate(() => {
    const a = document.querySelector('.inquiry-done .done-followup a[href^="tel:"]');
    return a ? { href: a.getAttribute('href'), label: a.textContent.trim() } : null;
  });
  assert.ok(tel, '성공 화면에 전화 링크가 없다 — 회신이 안 올 때 손님이 갈 곳이 없다: ' + t);
  assert.match(tel.href, /^tel:0\d{7,}$/, '전화 링크가 실제 번호가 아니다: ' + tel.href);
  assert.match(t, /회신이 없거나 급하시면/, '회신 지연 시 무엇을 하라는 안내가 없다: ' + t);
  await page.context().close();
});

test('② 전송이 실패하면 보낼 내용을 화면에 그대로 펼쳐 둔다', async () => {
  const page = await submitInquiry({ deliver: 'fail' });
  await page.click('#submitInquiry');
  await page.waitForSelector('.inquiry-done', { timeout: 9000 });
  await page.waitForTimeout(300);

  const body = await page.evaluate(() => {
    const pre = document.querySelector('.inquiry-done .done-text');
    return pre ? pre.textContent : null;
  });
  assert.ok(body, '실패 화면에 문의 본문이 없다 — 복사가 막히면 손님이 옮겨 적을 원문이 없다');
  assert.match(body, /테스트고객/, '본문에 이름이 없다: ' + body);
  assert.match(body, /010-1234-5678/, '본문에 연락처가 없다: ' + body);
  await page.context().close();
});

test('③ 복사가 막힌 브라우저에서는 "복사했습니다"라고 말하지 않는다', async () => {
  const page = await submitInquiry({ deliver: 'fail', clipboard: 'blocked' });
  await page.click('#submitInquiry');
  await page.waitForSelector('#doneCopy', { timeout: 9000 });
  await page.click('#doneCopy');
  await page.waitForTimeout(400);

  const label = await page.evaluate(() => document.getElementById('doneCopy').textContent.trim());
  assert.ok(!/복사했습니다/.test(label),
    '복사가 실패했는데 성공했다고 알린다 — 손님이 빈 카톡을 보내고 회신을 기다린다: ' + label);
  assert.match(label, /막혔|직접/, '복사 실패를 손님이 알아들을 문구로 알리지 않는다: ' + label);
  await page.context().close();
});

test('③-2 복사가 되는 브라우저에서는 종전대로 성공을 알린다', async () => {
  const page = await submitInquiry({ deliver: 'fail', clipboard: 'ok' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.click('#submitInquiry');
  await page.waitForSelector('#doneCopy', { timeout: 9000 });
  await page.click('#doneCopy');
  await page.waitForTimeout(400);

  const label = await page.evaluate(() => document.getElementById('doneCopy').textContent.trim());
  assert.match(label, /복사했습니다/, '복사에 성공했는데 실패 문구가 뜬다: ' + label);
  await page.context().close();
});

test('④ 전송 중에는 제출 버튼이 눌린 상태로 바뀐다(중복 접수 방지)', async () => {
  const page = await submitInquiry({ deliver: 'slow' });
  await page.click('#submitInquiry');
  await page.waitForTimeout(500);   // 아직 전송 중(응답을 2.5초 붙잡아 둔다)

  const mid = await page.evaluate(() => {
    const b = document.getElementById('submitInquiry');
    return { disabled: b.disabled, label: b.textContent.trim() };
  });
  assert.equal(mid.disabled, true, '전송 중에 버튼이 다시 눌린다 — 중복 접수가 생긴다');
  assert.match(mid.label, /접수 중/, '전송 중인데 버튼 글자가 그대로다 — 손님이 안 눌린 줄 안다: ' + mid.label);

  await page.waitForSelector('.inquiry-done', { timeout: 9000 });
  await page.context().close();
});

test('⑤ 설정을 못 읽었을 때는 "접수 경로가 없다"가 아니라 "새로고침하시라"고 말한다', async () => {
  const page = await submitInquiry({ config: 'dead' });
  await page.click('#submitInquiry');
  await page.waitForSelector('.inquiry-done', { timeout: 9000 });
  await page.waitForTimeout(300);

  const t = await doneText(page);
  assert.match(t, /설정을 잠시 못 읽어/,
    '설정 로드 실패인데 일반 실패 문구가 나온다 — 손님은 이 업체가 온라인 접수를 안 받는 줄 안다: ' + t);
  assert.match(t, /새로고침/, '손님이 무엇을 하면 되는지(새로고침) 안내가 없다: ' + t);
  // 실패해도 연락 경로는 그대로 있어야 한다
  assert.ok(await page.evaluate(() => !!document.querySelector('.done-actions a[href^="tel:"]')),
    '설정 로드 실패 화면에 전화 경로가 없다');
  await page.context().close();
});

test('⑤-2 설정 요청이 한 번 실패해도 재시도가 살려낸다', async () => {
  const page = await submitInquiry({ config: 'flaky' });
  await page.click('#submitInquiry');
  await page.waitForSelector('.inquiry-done', { timeout: 9000 });
  await page.waitForTimeout(300);

  const t = await doneText(page);
  assert.match(t, /전달되었습니다/,
    '첫 요청만 실패했는데 재시도가 살려내지 못했다 — 멀쩡한 접수가 통째로 실패로 떨어진다: ' + t);
  await page.context().close();
});
