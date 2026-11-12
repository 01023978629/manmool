/* review-intake.e2e.cjs — 후기 남기기(review.html) (2026-10-23)
   ① 정상 입력 → 폼 서비스로 type 후기 payload 가 한 번 가고, 제목은 [홈페이지 후기], 성공 화면은 "대표 확인 후 게시"
   ② 동·호수·전화번호가 든 후기는 전송 전에 막히고, "김○○ 고객" 같은 표시 이름은 막히지 않는다
   ③ 공개 동의를 안 하면 보내지 않는다
   ④ 허니팟이 차 있으면 보내지도 기억하지도 않는다
   ⑤ 전송 실패 → 다시 시도·문자·복사가 보이고 영구 저장소에는 아무것도 없다, 다시 시도 성공 → 성공 화면
   입력은 실제 키보드처럼 키 단위로도 넣는다(page.fill 은 input 이벤트를 한 번만 내서 결함을 숨긴 적이 있다). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
const MARK = { site: '유성구 TEST_SITE_MARK', text: 'TEST_REVIEW_MARK 방수 공사 깔끔하게 마무리해 주셨어요', name: 'TEST_NAME_MARK', phone: '010-1234-5678' };
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

const config = () => JSON.stringify({ forms: { enabled: true, provider: 'web3forms', endpoint: FORMS_ENDPOINT, accessKey: 'test' }, n8n: { enabled: false }, inbox: { enabled: false }, kakao: { ready: false }, naver: { ready: false } });

/** 폼 서비스 응답을 흉내 내고, 받은 본문을 모은다. status 로 실패도 만든다. */
async function open(opts) {
  opts = opts || {};
  const page = await browser.newPage(); page.setDefaultTimeout(6000);
  const requests = [];
  const state = { status: opts.status || 200 };
  await page.route('**/data/config.json', (r) => r.fulfill({ contentType: 'application/json', body: config() }));
  await page.route(FORMS_ENDPOINT, (r) => {
    requests.push(JSON.parse(r.request().postData()));
    r.fulfill({ status: state.status, contentType: 'application/json', body: state.status === 200 ? '{"success":true}' : '{"success":false}' });
  });
  await page.route(/https:\/\/(?!127\.0\.0\.1)(?!api\.web3forms\.com)/, (r) => r.abort());
  await page.goto(`${origin}/review.html`);
  await page.waitForFunction(() => window.ManmulLead && window.MANMUL_PII_RULES);
  return { page, requests, state };
}

async function fillValid(page, over) {
  over = over || {};
  await page.click('#rvRating label:nth-child(5)');           // 5점
  await page.selectOption('#rvWorkType', over.workType || '방수');
  await page.fill('#rvSite', over.site !== undefined ? over.site : MARK.site);
  await page.fill('#rvText', '');
  await page.focus('#rvText'); await page.keyboard.type(over.text !== undefined ? over.text : MARK.text);
  await page.fill('#rvName', over.name !== undefined ? over.name : MARK.name);
  await page.fill('#rvPhone', over.phone !== undefined ? over.phone : MARK.phone);
  if (over.consent !== false) await page.check('#rvConsent');
  if (over.publish !== false) await page.check('#rvPublishConsent');
}

const storageDump = (page) => page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) }));
const formHidden = (page) => page.evaluate(() => { const f = document.getElementById('reviewForm'); return f.hidden && f.getBoundingClientRect().height === 0; });
const settle = (page, ms) => page.waitForTimeout(ms || 700);

test('① 정상 입력은 type 후기 payload 로 한 번 전송되고 성공 화면은 대표 확인 후 게시를 안내한다', async () => {
  const { page, requests } = await open();
  await fillValid(page);
  assert.equal(await page.locator('#rvRatingLabel').innerText(), '5점 · 아주 만족해요');
  await page.click('#rvSubmit');
  await page.waitForFunction(() => !document.getElementById('rvDone').hidden);
  assert.equal(requests.length, 1, '폼 서비스로 정확히 한 번 가야 한다');
  const body = requests[0];
  assert.equal(body.type, '후기');
  assert.equal(body.rating, 5);
  assert.equal(body.workType, '방수');
  assert.equal(body.site, MARK.site);
  assert.equal(body.reviewText, MARK.text);
  assert.equal(body.displayName, MARK.name);
  assert.equal(body.name, MARK.name);
  assert.equal(body.phone, '01012345678');
  assert.equal(body.publishConsent, true);
  assert.equal(body.privacyConsent, true);
  assert.equal('consent' in body, false, '체크박스 원값(consent)은 보내지 않는다');
  assert.equal(body.source, 'review-page');
  assert.match(body.subject, /^\[홈페이지 후기\] TEST_NAME_MARK · 후기$/);
  assert.match(body.message, /\[만물인테리어 고객 후기\]/);
  assert.match(body.message, /별점: ★★★★★ \(5\/5\)/);
  assert.match(body.message, /홈페이지 공개 동의: 동의/);
  const done = await page.locator('#rvDone').innerText();
  assert.match(done, /후기를 받았습니다/);
  assert.match(done, /대표가 확인한 뒤/);
  assert.equal(await formHidden(page), true, '전송 뒤 폼은 숨겨진다');
  const dump = await storageDump(page);
  for (const mark of ['TEST_SITE_MARK', 'TEST_REVIEW_MARK', 'TEST_NAME_MARK', '01012345678', '010-1234-5678']) assert.doesNotMatch(dump, new RegExp(mark));
  await page.close();
});

test('② 동·호수·전화번호가 든 후기는 전송 전에 막히고, "김○○ 고객" 표시 이름은 막히지 않는다', async () => {
  const { page, requests } = await open();
  await fillValid(page, { text: 'TEST_REVIEW_MARK 301동 1502호 천장 누수 잘 잡아 주셨어요' });
  await page.click('#rvSubmit'); await settle(page);
  assert.equal(requests.length, 0, '동·호수가 든 후기가 전송됐다');
  assert.match(await page.locator('#rvStatus').innerText(), /동·호수/);
  assert.equal(await formHidden(page), false);

  await page.fill('#rvText', ''); await page.focus('#rvText'); await page.keyboard.type('TEST_REVIEW_MARK 궁금하면 010-9876-5432 로 연락 주세요 정말 친절했어요');
  await page.click('#rvSubmit'); await settle(page);
  assert.equal(requests.length, 0, '전화번호가 든 후기가 전송됐다');
  assert.match(await page.locator('#rvStatus').innerText(), /휴대전화/);

  await page.fill('#rvSite', '유성구 TEST_SITE_MARK 1502호');
  await page.fill('#rvText', ''); await page.focus('#rvText'); await page.keyboard.type(MARK.text);
  await page.click('#rvSubmit'); await settle(page);
  assert.equal(requests.length, 0, '현장란의 호수가 전송됐다');
  assert.match(await page.locator('#rvStatus').innerText(), /현장에 동·호수/);

  // 표시 이름 "김○○ 고객" 은 고객명 규칙(등록 화면용) 오탐 대상 — 여기서는 통과해야 한다
  await page.fill('#rvSite', MARK.site);
  await page.fill('#rvName', '김○○ 고객');
  await page.click('#rvSubmit');
  await page.waitForFunction(() => !document.getElementById('rvDone').hidden);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].displayName, '김○○ 고객');
  await page.close();
});

test('③ 개인정보 동의나 공개 동의가 없으면 보내지 않는다', async () => {
  const { page, requests } = await open();
  await fillValid(page, { publish: false });
  await page.click('#rvSubmit'); await settle(page);
  assert.equal(requests.length, 0);
  assert.match(await page.locator('#rvStatus').innerText(), /공개에 동의/);
  await page.uncheck('#rvConsent');
  await page.check('#rvPublishConsent');
  await page.click('#rvSubmit'); await settle(page);
  assert.equal(requests.length, 0);
  assert.match(await page.locator('#rvStatus').innerText(), /개인정보 수집·이용에 동의/);
  await page.close();
});

test('④ 허니팟이 차 있으면 전송도 보관도 하지 않는다', async () => {
  const { page, requests } = await open();
  await fillValid(page);
  await page.evaluate(() => { document.getElementById('rvCompanyUrl').value = 'https://spam.invalid'; });
  await page.click('#rvSubmit');
  await page.waitForFunction(() => !document.getElementById('rvDone').hidden);
  assert.equal(requests.length, 0);
  assert.match(await page.locator('#rvDone').innerText(), /아직 전송되지 않았습니다/);
  assert.equal(await page.locator('#rvRetry').count(), 0, '허니팟은 다시 시도 대상이 아니다');
  assert.doesNotMatch(await storageDump(page), /TEST_REVIEW_MARK/);
  await page.close();
});

test('⑤ 전송 실패 → 다시 시도·문자·복사가 보이고 영구 저장소는 비어 있다, 다시 시도 성공 → 성공 화면', async () => {
  const { page, requests, state } = await open({ status: 500 });
  await fillValid(page);
  await page.click('#rvSubmit');
  await page.waitForFunction(() => !document.getElementById('rvDone').hidden);
  assert.equal(requests.length, 1);
  const done = await page.locator('#rvDone').innerText();
  assert.match(done, /아직 전송되지 않았습니다/);
  assert.match(done, /현재 탭 메모리/);
  assert.equal(await page.locator('#rvRetry').count(), 1);
  assert.match(await page.locator('#rvDone a[href^="sms:01023978629"]').getAttribute('href'), /TEST_REVIEW_MARK|%ED%9B%84%EA%B8%B0/);
  assert.equal(await page.locator('#rvCopy').count(), 1);
  const dump = await storageDump(page);
  for (const mark of ['TEST_SITE_MARK', 'TEST_REVIEW_MARK', 'TEST_NAME_MARK', '01012345678']) assert.doesNotMatch(dump, new RegExp(mark));

  state.status = 200;
  await page.click('#rvRetry');
  await page.waitForFunction(() => /후기를 받았습니다/.test(document.getElementById('rvDone').innerText));
  assert.equal(requests.length, 2, '다시 시도는 한 번 더 보낸다');
  assert.equal(requests[1].reviewText, MARK.text);
  await page.close();
});
