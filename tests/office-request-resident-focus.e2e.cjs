/* office-request-resident-focus.e2e.cjs — 접힌 입주민 칸의 오류가 직원 눈에 보이는가

   보호하는 사고(2026-09-03 직원 포털 사용성 검토):
     입주민 연락처는 <details> 안에 있다. 직원이 성함·연락처를 적고 스크롤 중 손잡이를
     다시 눌러 접은 뒤 저장하면, "입주민에게 알리고 동의를 받았는지 확인해 주세요"
     오류가 화면 맨 아래에만 뜨고 고칠 체크박스는 접힌 영역 안에 숨어 있다. 닫힌
     <details> 안 요소에는 focus() 가 무효라 포커스는 body 로 떨어진다 — 직원은 어디를
     고치라는지 못 찾는다.

   바깥으로 나가는 전송은 전부 가로챈다. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://script.google.com/macros/s/test-office-focus/exec';
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
let browser, origin, server;

function serveStatic(req, res) {
  const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

async function openCreateForm() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(3000);
  const calls = [];
  await page.route('**/office-api.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, apiUrl: API_URL }) }));
  await page.route(API_URL, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === 'officeLogin') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, sessionToken: 'session-focus', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 관리사무소' }, expiresAt: Date.now() + 3600000 }) });
    if (body.action === 'officeList') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, requests: [] }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'bad-request' }) });
  });
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  await page.locator('#officeNewRequest').click();
  await page.locator('#officeCreateView').waitFor({ state: 'visible' });
  // 필수 칸을 채운다 — 이 검사의 관심은 입주민 칸뿐이다
  await page.locator('[name="unit"]').fill('101동 101호');
  await page.locator('[name="location"]').fill('욕실 천장');
  await page.locator('[name="issueType"]').selectOption('누수');
  await page.locator('#officeCreateForm [name="description"]').fill('천장에서 물이 떨어집니다.');
  await page.locator('[name="officeContactName"]').fill('김소장');
  await page.locator('[name="officeContactPhone"]').fill('010-1111-2222');
  await page.locator('[name="privacyConsent"]').check();
  return { page, calls };
}

before(async () => {
  server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise((r) => server.close(r)); });

test('입주민 칸을 접은 채 저장하면 칸이 펼쳐지고 동의 확인 체크박스로 포커스가 간다', async () => {
  const { page, calls } = await openCreateForm();
  // 직원이 입주민 연락처를 적고 나서 손잡이를 다시 눌러 접었다
  await page.evaluate(() => { document.querySelector('#officeCreateForm details').open = true; });
  await page.locator('[name="residentName"]').fill('홍길동');
  await page.locator('[name="residentPhone"]').fill('010-9876-5432');
  await page.evaluate(() => { document.querySelector('#officeCreateForm details').open = false; });
  assert.equal(await page.evaluate(() => document.querySelector('#officeCreateForm details').open), false, '전제: 접힌 상태');

  await page.locator('#officeCreateSubmit').click();
  await page.waitForFunction(() => (document.getElementById('officeCreateError').textContent || '').length > 0);

  const state = await page.evaluate(() => ({
    error: document.getElementById('officeCreateError').textContent,
    open: document.querySelector('#officeCreateForm details').open,
    focused: document.activeElement && document.activeElement.name,
  }));
  assert.match(state.error, /입주민에게/, '입주민 동의 확인 오류가 아니다: ' + state.error);
  assert.equal(state.open, true, '오류가 났는데 입주민 칸이 접힌 그대로다 — 직원은 고칠 체크박스를 볼 수 없다');
  assert.equal(state.focused, 'residentInformed', '포커스가 동의 확인 체크박스로 가지 않았다: ' + state.focused);
  assert.equal(calls.filter((c) => c.action === 'officeCreate').length, 0, '확인 없이 접수가 서버로 나갔다');

  // 확인을 체크하면 통과해 서버로 나간다(동의 확인 값 자체는 본문에 실리지 않는다)
  await page.locator('[name="residentInformed"]').check();
  await page.locator('#officeCreateSubmit').click();
  await page.waitForFunction((n) => true, null, { timeout: 100 }).catch(() => {});
  await page.waitForTimeout(600);
  const create = calls.find((c) => c.action === 'officeCreate');
  assert.ok(create, '확인 뒤에도 접수가 서버로 나가지 않았다');
  assert.equal(Object.hasOwn(create.payload, 'residentInformed'), false, '동의 확인 값이 전송 본문에 실렸다 — 서버 계약 변경');
  assert.deepEqual(create.payload.residentContact, { name: '홍길동', phone: '010-9876-5432' });
  await page.close();
});

test('입주민 칸을 비우면 동의 확인을 요구하지 않는다', async () => {
  const { page, calls } = await openCreateForm();
  await page.locator('#officeCreateSubmit').click();
  await page.waitForTimeout(600);
  assert.equal(calls.filter((c) => c.action === 'officeCreate').length, 1, '입주민 없는 접수가 막혔다');
  await page.close();
});
