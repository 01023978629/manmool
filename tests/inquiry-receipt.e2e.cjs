/* inquiry-receipt.e2e.cjs — 접수함이 받은 문의는 손님 화면에 접수번호가 보인다

   보호하는 사고
   - 접수함(Apps Script)이 접수번호(LD-날짜-순번)를 돌려줬는데 손님 화면이 그 번호를 보여 주지 않으면,
     손님이 전화로 "제 문의 어떻게 됐나요" 할 때 대표가 찾을 열쇠가 없다.
   - 반대로 접수함이 꺼져 있거나 번호를 안 줬는데 화면이 번호를 지어내면 안 된다.
   - 재전송(메모리 재시도) 성공에도 번호가 붙어야 한다.

   실제 전송은 전부 가로챈다(Web3Forms·script.google.com). 대표 메일함에는 아무것도 가지 않는다. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const INBOX_URL = 'https://script.google.com/macros/s/fixture-lead-inbox/exec';
const RECEIPT = 'LD-20260903-0042';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml',
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

/* 설정: 저장소 config.json 그대로 두되 inbox 만 켜거나 끈다. 메일(Web3Forms)·접수함 응답은 옵션으로 조절. */
async function openPage(file, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const calls = { mail: 0, inbox: 0 };
  const state = { mail: opts.mail || 'ok', inbox: opts.inbox || 'ok' };
  const repoConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  await page.route('**/data/config.json*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ...repoConfig, inbox: opts.inboxOff ? { enabled: false, url: '' } : { enabled: true, url: INBOX_URL } }),
  }));
  await page.route('https://api.web3forms.com/**', (route) => {
    calls.mail += 1;
    if (state.mail === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.route(INBOX_URL, (route) => {
    calls.inbox += 1;
    if (state.inbox === 'fail') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"server-error"}' });
    if (state.inbox === 'no-receipt') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (state.inbox === 'bad-receipt') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"receiptNo":"<b>7</b>"}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, receiptNo: RECEIPT }) });
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto(`${origin}/${file}`, { waitUntil: 'networkidle' });
  return { page, ctx, calls, state, pageErrors };
}

async function fillInterior(page) {
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
}
const interiorDone = (page) => page.evaluate(() => {
  const d = document.querySelector('.inquiry-done');
  return d ? d.textContent.replace(/\s+/g, ' ').trim() : '';
});

test('인테리어 폼: 접수함이 번호를 주면 성공 화면에 접수번호가 보이고, 안 주거나 형식이 틀리면 안 보인다', async () => {
  const shown = await openPage('index.html');
  await fillInterior(shown.page);
  await shown.page.click('#submitInquiry');
  await shown.page.waitForSelector('.inquiry-done', { timeout: 9000 });
  await shown.page.waitForTimeout(200);
  const text = await interiorDone(shown.page);
  assert.match(text, /전달되었습니다/);
  assert.match(text, new RegExp(`접수번호 ${RECEIPT}`), '성공 화면에 접수번호가 없다: ' + text);
  assert.equal(await shown.page.locator('.inquiry-done .done-receipt-no').innerText(), RECEIPT);
  assert.deepEqual(shown.calls, { mail: 1, inbox: 1 });
  assert.deepEqual(shown.pageErrors, []);
  await shown.ctx.close();

  for (const variant of [{ inboxOff: true }, { inbox: 'no-receipt' }, { inbox: 'bad-receipt' }]) {
    const hidden = await openPage('index.html', variant);
    await fillInterior(hidden.page);
    await hidden.page.click('#submitInquiry');
    await hidden.page.waitForSelector('.inquiry-done', { timeout: 9000 });
    await hidden.page.waitForTimeout(200);
    const t = await interiorDone(hidden.page);
    assert.match(t, /전달되었습니다/, JSON.stringify(variant));
    assert.doesNotMatch(t, /접수번호/, '번호가 없는데 화면이 접수번호를 말한다: ' + JSON.stringify(variant));
    assert.equal(await hidden.page.locator('.inquiry-done b').filter({ hasText: '7' }).count(), 0, '형식이 틀린 번호가 HTML 로 들어갔다');
    assert.deepEqual(hidden.pageErrors, []);
    await hidden.ctx.close();
  }
});

test('인테리어 폼: 처음 실패한 뒤 다시 시도로 성공하면 그때 받은 접수번호가 보인다', async () => {
  const { page, ctx, calls, state, pageErrors } = await openPage('index.html', { mail: 'fail', inbox: 'fail' });
  await fillInterior(page);
  await page.click('#submitInquiry');
  await page.waitForSelector('#doneRetry', { timeout: 9000 });
  assert.doesNotMatch(await interiorDone(page), /접수번호/);
  state.mail = 'ok'; state.inbox = 'ok';
  await page.click('#doneRetry');
  await page.waitForFunction(() => /전달되었습니다/.test((document.querySelector('.inquiry-done') || {}).textContent || ''), null, { timeout: 9000 });
  await page.waitForTimeout(200);
  assert.match(await interiorDone(page), new RegExp(`접수번호 ${RECEIPT}`));
  assert.equal(calls.inbox, 2);
  assert.deepEqual(pageErrors, []);
  await ctx.close();
});

test('누수 폼: 접수함이 번호를 주면 접수 화면에 접수번호가 보이고, 꺼져 있으면 안 보인다', async () => {
  for (const [variant, expectReceipt] of [[{}, true], [{ inboxOff: true }, false], [{ inbox: 'bad-receipt' }, false]]) {
    const { page, ctx, pageErrors } = await openPage('leak.html', variant);
    await page.waitForFunction(() => window.ManmulLead && document.querySelector('#lkSubmit'));
    await page.fill('#lkPhone', '010-1234-5678');
    await page.check('#lkConsent');
    await page.click('#lkSubmit');
    await page.waitForFunction(() => /접수됐습니다/.test((document.querySelector('#lkDone') || document.body).textContent || ''), null, { timeout: 9000 });
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    if (expectReceipt) {
      assert.match(text, new RegExp(`접수번호 ${RECEIPT}`), '누수 접수 화면에 접수번호가 없다');
      assert.equal(await page.locator('.leak-done-receipt b').innerText(), RECEIPT);
    } else {
      assert.doesNotMatch(text, /접수번호 /, '번호가 없는데 화면이 접수번호를 말한다: ' + JSON.stringify(variant));
      assert.equal(await page.locator('.leak-done-receipt').count(), 0);
    }
    assert.deepEqual(pageErrors, []);
    await ctx.close();
  }
});

test('관리사무소 파일럿 폼: 접수함이 번호를 주면 접수 화면에 접수번호가 보이고, 재시도 성공에도 붙는다', async () => {
  const { page, ctx, state, pageErrors } = await openPage('office.html', { mail: 'fail', inbox: 'fail' });
  await page.waitForFunction(() => window.ManmulLead && document.querySelector('#officePilotSubmit'));
  await page.fill('#pilotComplexName', '테스트 한빛아파트');
  await page.fill('#pilotOfficeContactName', '시설 담당자');
  await page.fill('#pilotPhone', '070-1234-5678');
  await page.fill('#pilotRegion', '대전 중구');
  await page.check('input[name="pilotInterest"][value="leak-piping"]');
  await page.check('#pilotPrivacyConsent');
  await page.click('#officePilotSubmit');
  await page.waitForSelector('#officePilotRetry', { timeout: 9000 });
  state.mail = 'ok'; state.inbox = 'ok';
  await page.click('#officePilotRetry');
  await page.waitForFunction(() => /접수됐습니다/.test((document.querySelector('#officePilotDone') || {}).textContent || ''), null, { timeout: 9000 });
  assert.equal(await page.locator('#officePilotDone .office-pilot-receipt b').innerText(), RECEIPT);
  assert.deepEqual(pageErrors, []);
  await ctx.close();

  const direct = await openPage('office.html');
  await direct.page.waitForFunction(() => window.ManmulLead && document.querySelector('#officePilotSubmit'));
  await direct.page.fill('#pilotComplexName', '테스트 한빛아파트');
  await direct.page.fill('#pilotOfficeContactName', '시설 담당자');
  await direct.page.fill('#pilotPhone', '070-1234-5678');
  await direct.page.fill('#pilotRegion', '대전 중구');
  await direct.page.check('input[name="pilotInterest"][value="leak-piping"]');
  await direct.page.check('#pilotPrivacyConsent');
  await direct.page.click('#officePilotSubmit');
  await direct.page.waitForFunction(() => /접수됐습니다/.test((document.querySelector('#officePilotDone') || {}).textContent || ''), null, { timeout: 9000 });
  assert.equal(await direct.page.locator('#officePilotDone .office-pilot-receipt b').innerText(), RECEIPT);
  const off = await openPage('office.html', { inboxOff: true });
  await off.page.waitForFunction(() => window.ManmulLead && document.querySelector('#officePilotSubmit'));
  await off.page.fill('#pilotComplexName', '테스트 한빛아파트');
  await off.page.fill('#pilotOfficeContactName', '시설 담당자');
  await off.page.fill('#pilotPhone', '070-1234-5678');
  await off.page.fill('#pilotRegion', '대전 중구');
  await off.page.check('input[name="pilotInterest"][value="leak-piping"]');
  await off.page.check('#pilotPrivacyConsent');
  await off.page.click('#officePilotSubmit');
  await off.page.waitForFunction(() => /접수됐습니다/.test((document.querySelector('#officePilotDone') || {}).textContent || ''), null, { timeout: 9000 });
  assert.equal(await off.page.locator('#officePilotDone .office-pilot-receipt').count(), 0);
  assert.deepEqual(direct.pageErrors.concat(off.pageErrors), []);
  await direct.ctx.close();
  await off.ctx.close();
});
