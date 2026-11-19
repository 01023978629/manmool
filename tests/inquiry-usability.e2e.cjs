/* inquiry-usability.e2e.cjs — 폼이 손님을 붙잡지 않는가 · 안 고른 값을 지어내지 않는가

   보호하는 사고(2026-08 리드 감사):
     ① 누수는 급한 일인데, 인테리어 폼은 평수·범위·항목·예산·시기를 다 지나야
        연락처 칸이 나왔다. 그 전에 손님이 나간다.
     ② 라디오에 checked 가 박혀 있어, 손님이 손도 안 댄 '전체 공사 · 거주중 ·
        1~3개월'이 **사실처럼** 대표에게 전달됐다. 대표는 그걸 보고 방문 준비를
        한다 — 자재도 일정도 어긋난다.
     ③ 무엇이 필수인지 표시가 없어, 손님은 폼 전체가 필수인 줄 알고 시작을 안 한다.

   ②는 화면이 아니라 **실제로 나가는 전송 본문**을 가로채서 본다.
   바깥으로 나가는 전송은 전부 가로채므로 대표 메일함에는 아무것도 가지 않는다. */
require('./helpers/e2e-offline.cjs');
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

/* 전송 본문을 담아 둘 상자를 붙인 페이지. sent[0] 에 실제 나간 payload 가 담긴다. */
async function openForm(query) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const sent = [];
  await page.route('https://api.web3forms.com/**', (route) => {
    try { sent.push(JSON.parse(route.request().postData() || '{}')); } catch (e) { sent.push({ __parseError: true }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.goto(`${origin}/index.html${query || ''}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#inquiry').scrollIntoView());
  page.__sent = sent;
  return page;
}
const visible = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  return !!(e && e.offsetParent !== null);
}, sel);

test('① 유형을 누수로 고르면 연락처 지름길이 나타난다', async () => {
  const page = await openForm();
  assert.equal(await visible(page, '#leakShortcut'), false, '누수가 아닌데 지름길이 보인다');
  await page.selectOption('#iType', '누수');
  await page.waitForTimeout(200);
  assert.equal(await visible(page, '#leakShortcut'), true, '누수를 골랐는데 지름길이 안 보인다');
  await page.selectOption('#iType', '주거');
  await page.waitForTimeout(200);
  assert.equal(await visible(page, '#leakShortcut'), false, '유형을 되돌렸는데 지름길이 남아 있다');
  await page.context().close();
});

test('①-2 지름길을 누르면 평수·범위·항목을 건너뛰고 연락처 칸이 바로 나온다', async () => {
  const page = await openForm('?type=누수#inquiry');
  await page.waitForTimeout(300);
  assert.equal(await visible(page, '#leakShortcut'), true, '?type=누수 로 들어왔는데 지름길이 안 보인다');
  assert.equal(await visible(page, '#iPhone'), false, '아직 안 눌렀는데 연락처가 이미 보인다(전제 확인)');

  await page.click('#leakShortcutGo');
  await page.waitForTimeout(300);
  assert.equal(await visible(page, '#iPhone'), true, '지름길을 눌러도 연락처 칸이 안 나온다 — 급한 손님이 나간다');
  assert.equal(await visible(page, '#iName'), true, '지름길을 눌러도 이름 칸이 안 나온다');
  await page.context().close();
});

// A/S 연동 약속(2026-11-19): 시공했던 집의 A/S·하자도 평수·예산이 맞지 않는다 — 누수처럼 연락처로 바로 가고,
// 요청 내용 칸은 '언제 시공한 곳인지, 어떤 증상인지'를 묻고, 메일 '공간' 줄 첫 칸은 정확히 'A/S' 다.
test('①-3 A/S·하자를 고르면 연락처 지름길이 나오고 공간 첫 칸 A/S 로 접수된다', async () => {
  const page = await openForm();
  assert.equal(await visible(page, '#asShortcut'), false, 'A/S 가 아닌데 A/S 지름길이 보인다');
  const defaultPlaceholder = await page.getAttribute('#iMemo', 'placeholder');
  await page.selectOption('#iType', 'A/S');
  await page.waitForTimeout(200);
  assert.equal(await visible(page, '#asShortcut'), true, 'A/S 를 골랐는데 지름길이 안 보인다');
  assert.equal(await visible(page, '#leakShortcut'), false, 'A/S 인데 누수 지름길이 보인다');
  assert.match(await page.getAttribute('#iMemo', 'placeholder'), /언제 시공한 곳인지, 어떤 증상인지/);
  // 유형을 되돌리면 안내도 원래대로 돌아간다
  await page.selectOption('#iType', '주거');
  await page.waitForTimeout(200);
  assert.equal(await visible(page, '#asShortcut'), false, '유형을 되돌렸는데 A/S 지름길이 남아 있다');
  assert.equal(await page.getAttribute('#iMemo', 'placeholder'), defaultPlaceholder, '유형을 되돌렸는데 요청 내용 안내가 A/S 그대로다');
  // 예상견적 챗봇이 유형을 주거로 바꿔도(manmul:estimate) A/S 안내가 따라 사라진다
  await page.selectOption('#iType', 'A/S');
  await page.waitForTimeout(200);
  assert.equal(await visible(page, '#asShortcut'), true, '다시 A/S 를 골랐는데 지름길이 안 보인다');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('manmul:estimate', { detail: { type: '주거' } })));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.getElementById('iType').value), '주거', '예상견적 유형이 폼에 반영되지 않았다(전제 확인)');
  assert.equal(await visible(page, '#asShortcut'), false, '예상견적이 유형을 주거로 바꿨는데 A/S 지름길이 남아 있다');
  assert.equal(await page.getAttribute('#iMemo', 'placeholder'), defaultPlaceholder, '예상견적이 유형을 바꿨는데 요청 내용 안내가 A/S 그대로다');
  assert.equal(await page.getAttribute('#iMemo', 'aria-describedby'), null, '예상견적이 유형을 바꿨는데 요청 칸이 A/S 안내를 계속 가리킨다');
  await page.selectOption('#iType', 'A/S');
  await page.waitForTimeout(200);

  await page.click('#asShortcutGo');
  await page.waitForTimeout(300);
  assert.equal(await visible(page, '#iPhone'), true, 'A/S 지름길을 눌러도 연락처 칸이 안 나온다');
  await page.fill('#iName', '테스트고객');
  await page.fill('#iPhone', '010-1234-5678');
  await page.locator('#nextStep').click();
  await page.waitForTimeout(300);
  assert.equal(await visible(page, '#iMemoAsHint'), true, 'A/S 요청 내용 안내(시공 시기·증상)가 안 보인다');
  await page.fill('#iMemo', '작년 욕실 공사 · 줄눈 갈라짐');
  await page.check('#iConsent');
  await page.click('#submitInquiry');
  await page.waitForSelector('.inquiry-done', { timeout: 9000 });

  assert.equal(page.__sent.length, 1, '전송이 한 번 나가지 않았다: ' + JSON.stringify(page.__sent));
  const p = page.__sent[0];
  assert.equal(p.type, 'A/S');
  assert.match(p.subject || '', /^\[홈페이지 상담\] 테스트고객 · A\/S$/);
  const spaceLine = String(p.message || '').split(/\r?\n/).find((line) => line.startsWith('공간: ')) || '';
  assert.equal(spaceLine.slice('공간: '.length).split(/\s*·\s*/)[0], 'A/S', '메일 공간 줄 첫 칸이 A/S 가 아니다: ' + spaceLine);
  await page.context().close();
});

test('② 손님이 안 고른 항목은 사실처럼 전달되지 않는다', async () => {
  const page = await openForm();
  // 이름·연락처·동의만 채우고, 범위·항목·거주여부·시기는 손도 대지 않는다
  // 실제 손님처럼 화면에 있는 버튼을 누른다. 문서 맨 위에서 smooth 이동 중
  // 보이지 않는 버튼을 programmatic click하면 두 장거리 스크롤이 경합한다.
  const next = () => page.locator('#nextStep').click();
  for (let i = 0; i < 3; i++) { await next(); await page.waitForTimeout(200); }
  await page.fill('#iName', '테스트고객');
  await page.fill('#iPhone', '010-1234-5678');
  await next();
  await page.waitForTimeout(200);
  await page.check('#iConsent');
  await page.click('#submitInquiry');
  await page.waitForSelector('.inquiry-done', { timeout: 9000 });

  assert.equal(page.__sent.length, 1, '전송이 한 번 나가지 않았다: ' + JSON.stringify(page.__sent));
  const p = page.__sent[0];
  assert.equal(p.name, '테스트고객', '전송 본문이 폼 내용이 아니다: ' + JSON.stringify(p));
  assert.equal(p.privacyConsent, true, '현장 연결에 필요한 개인정보 동의 근거가 payload에 없다');
  assert.match(p.message || '', /개인정보 수집·이용 동의: 동의/, '사람이 읽는 메일 본문에 동의 근거가 없다');
  assert.ok(!p.scope, `손님이 안 고른 공사 범위가 '${p.scope}' 로 전달됐다 — 대표가 그걸 믿고 방문 준비를 한다`);
  assert.ok(!p.live, `손님이 안 고른 거주 여부가 '${p.live}' 로 전달됐다`);
  assert.equal(p.movein, '미정', `손님이 안 고른 희망 시기가 '${p.movein}' 로 전달됐다`);
  // 사람이 읽는 문자 본문에도 지어낸 값이 실리면 안 된다
  const body = await page.evaluate(() => {
    const pre = document.querySelector('.done-text');
    return pre ? pre.textContent : '';
  });
  assert.ok(!/전체 공사|거주중/.test(body), '문자 본문에 안 고른 값이 실렸다: ' + body);
  await page.context().close();
});

test('③ 필수 표시는 실제로 막는 칸(이름·연락처·동의) 셋에만 붙는다', async () => {
  const page = await openForm();
  const marks = await page.evaluate(() => {
    const form = document.getElementById('inquiryForm');
    return [...form.querySelectorAll('.req')].map((e) => {
      const label = e.closest('label');
      const input = label && (label.querySelector('input') || document.getElementById(label.getAttribute('for')));
      return input ? input.id : '(연결 없음)';
    });
  });
  assert.deepEqual(marks.sort(), ['iConsent', 'iName', 'iPhone'],
    '필수 표시가 붙은 칸이 이름·연락처·동의 셋이 아니다: ' + JSON.stringify(marks));
  await page.context().close();
});

test('④ 폰에서 다음을 누르면 새 단계의 제목과 첫 칸이 화면 안에 있다', async () => {
  // 예전에는 #inquiry 절 맨 위로 스크롤해, 폰에서는 절 머리(제목+전화 상자 ≈940px)만
  // 보이고 새 단계의 칸은 전부 화면 아래에 있었다(실측 첫 칸 y=1072, 화면 844).
  // 손님은 '다음'을 눌렀는데 화면이 위로 튀고 아무것도 안 보인다고 느끼고 나간다.
  const page = await openForm();
  const next = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('#inquiry button')].find((x) => /다음/.test(x.textContent));
    if (b) b.click();
  });
  const where = () => page.evaluate(() => {
    const vh = innerHeight;
    const top = (e) => (e ? Math.round(e.getBoundingClientRect().top) : null);
    const step = document.querySelector('.inquiry-form .step:not([hidden])');
    const legend = step && step.querySelector('legend');
    const first = step && step.querySelector('input:not([type=radio]):not([type=checkbox]),select,textarea');
    return { vh, step: step && step.dataset.step, legendTop: top(legend), firstTop: top(first) };
  });
  for (const expected of ['2', '3']) {
    await next();
    await page.waitForFunction(() => {
      const title = document.querySelector('.inquiry-form .step:not([hidden]) legend');
      const top = title && title.getBoundingClientRect().top;
      const menu = document.querySelector('.service-jump-nav');
      const edge = menu ? menu.getBoundingClientRect().bottom : 0;
      return top >= edge && top < innerHeight * 0.5;
    }, null, { timeout: 4000 });
    const w = await where();
    assert.equal(w.step, expected, '단계가 넘어가지 않았다: ' + JSON.stringify(w));
    assert.ok(w.legendTop !== null && w.legendTop >= 0 && w.legendTop < w.vh * 0.5,
      `${expected}단계 제목이 화면 위쪽에 없다(y=${w.legendTop}, 화면 ${w.vh}) — 손님은 어느 단계인지 모른다`);
    if (w.firstTop !== null) {
      assert.ok(w.firstTop >= 0 && w.firstTop < w.vh,
        `${expected}단계 첫 칸이 화면 밖이다(y=${w.firstTop}, 화면 ${w.vh}) — 다음을 눌렀는데 아무것도 안 보인다`);
    }
  }
  await page.context().close();
});
