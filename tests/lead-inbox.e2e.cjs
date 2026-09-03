/* 문의 접수함(lead-inbox.html) 브라우저 회귀 — 서버(Apps Script)는 page.route 로 대신한다.
   실제 script.google.com 이나 Web3Forms 로는 아무것도 나가지 않는다. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://script.google.com/macros/s/fixture-lead-inbox/exec';
const SESSION_KEY = 'manmul_lead_inbox_session';
const ADMIN_CODE = 'fixture-admin-code-2026';
const TOKEN = 'f'.repeat(64);
const LEAD_NEW = '3f2c9b1e-6d4a-4c8b-9e1f-0a2b3c4d5e6f';
const LEAD_HELD = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const XSS_NAME = 'FIXTURE_NAME<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const PII_MARKERS = ['FIXTURE_NAME', '010-1234-5678', 'FIXTURE_MEMO', ADMIN_CODE, TOKEN];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
let browser;
let origin;
let server;

function serveStatic(req, res) {
  const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

/* 시트 대신 메모리에 든 가짜 서버. 실제 Code.gs 의 응답 모양(ok/error, leads/counts, lead/history)을 따른다. */
function fakeServer() {
  const leads = {
    [LEAD_NEW]: {
      leadId: LEAD_NEW, receiptNo: 'LD-20260903-0001', receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 60000).toISOString(), status: '신규', decidedAt: '',
      name: XSS_NAME, phone: '010-1234-5678', type: '아파트', service: '인테리어', region: '대전 서구', area: '32', scope: '전체',
      works: '도배, 장판', budget: '2,000만 원', movein: '10월', live: '거주 중', symptoms: '', purpose: '', visit: '', memo: 'FIXTURE_MEMO <b>bold</b>',
      source: 'index', sourcePage: 'index.html', ctaId: 'hero', utm: '', emailDelivered: 'N',
      message: '[만물인테리어 상담 신청]\n이름: FIXTURE_NAME\n연락처: 010-1234-5678\n메모: FIXTURE_MEMO',
    },
    [LEAD_HELD]: {
      leadId: LEAD_HELD, receiptNo: 'LD-20260903-0002', receivedAt: '2026-09-03T02:00:00.000Z', status: '보류', decidedAt: '2026-09-03T03:00:00.000Z',
      name: '보류 손님', phone: '042-123-4567', type: '누수', service: '누수', region: '대전 유성구', symptoms: '천장 얼룩', emailDelivered: 'Y', message: '누수 본문',
    },
  };
  const history = {
    [LEAD_NEW]: [{ at: '2026-09-03T01:00:00.000Z', action: '접수', from: '', to: '신규', memo: '', actor: 'form' }],
    [LEAD_HELD]: [
      { at: '2026-09-03T02:00:00.000Z', action: '접수', from: '', to: '신규', memo: '', actor: 'form' },
      { at: '2026-09-03T03:00:00.000Z', action: '판정', from: '신규', to: '보류', memo: '견적 대기', actor: 'admin' },
    ],
  };
  const transitions = { '신규': ['승인', '보류', '거절'], '보류': ['승인', '거절'], '거절': ['보류'], '승인': [] };
  const state = { failedLogins: 0, sessionValid: true, decisions: [], expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
  const counts = () => {
    const c = { '신규': 0, '승인': 0, '보류': 0, '거절': 0 };
    Object.values(leads).forEach((l) => { c[l.status] += 1; });
    return c;
  };
  const respond = (body) => {
    const { action, payload = {}, sessionToken } = body;
    if (action === 'leadLogin') {
      if (state.failedLogins >= 5) return { ok: false, error: 'rate-limited' };
      if (payload.adminCode !== ADMIN_CODE) { state.failedLogins += 1; return { ok: false, error: 'invalid-credentials' }; }
      state.failedLogins = 0;
      return { ok: true, sessionToken: TOKEN, expiresAt: state.expiresAt };
    }
    if (sessionToken !== TOKEN || !state.sessionValid) return { ok: false, error: 'session-expired' };
    if (action === 'leadMe') return { ok: true, expiresAt: state.expiresAt };
    if (action === 'leadLogout') { state.sessionValid = false; return { ok: true }; }
    if (action === 'leadList') {
      const rows = Object.values(leads).filter((l) => !payload.status || payload.status === '전체' || l.status === payload.status)
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
      return { ok: true, leads: rows, total: rows.length, counts: counts() };
    }
    if (action === 'leadGet') {
      const lead = leads[payload.leadId];
      return lead ? { ok: true, lead, history: history[payload.leadId] } : { ok: false, error: 'not-found' };
    }
    if (action === 'leadDecide') {
      const lead = leads[payload.leadId];
      if (!lead) return { ok: false, error: 'not-found' };
      if (!UUID.test(payload.requestId || '')) return { ok: false, error: 'invalid-input' };
      const done = state.decisions.find((d) => d.requestId === payload.requestId);
      if (done) return { ok: true, lead, duplicate: true };
      if (!transitions[lead.status].includes(payload.decision)) return { ok: false, error: 'invalid-transition' };
      if (payload.decision === '거절' && !payload.memo) return { ok: false, error: 'invalid-input' };
      state.decisions.push({ ...payload });
      history[lead.leadId].push({ at: new Date().toISOString(), action: '판정', from: lead.status, to: payload.decision, memo: payload.memo || '', actor: 'admin' });
      lead.status = payload.decision; lead.decidedAt = new Date().toISOString();
      return { ok: true, lead };
    }
    return { ok: false, error: 'bad-request' };
  };
  return { leads, state, respond };
}

async function openInbox(options = {}) {
  const fake = options.server || fakeServer();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  if (options.clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await context.newPage();
  page.setDefaultTimeout(2000);
  const calls = [];
  const pageErrors = [];
  const consoleText = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('console', (message) => consoleText.push(message.text()));
  await page.route('**/data/config.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(options.config || { inbox: { enabled: true, url: API_URL } }),
  }));
  await page.route(API_URL, async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ body, keepalive: route.request().headers()['content-type'] || '' });
    const result = options.respond ? await options.respond(body, fake) : fake.respond(body);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.route('https://api.web3forms.com/**', (route) => route.abort('failed'));
  return { page, context, calls, pageErrors, consoleText, fake };
}

async function login(page, code = ADMIN_CODE) {
  await page.locator('#inboxLoginButton:not([disabled])').waitFor();
  await page.locator('#inboxAdminCode').fill(code);
  await page.locator('#inboxLoginButton').click();
}

async function storageSnapshot(page) {
  return page.evaluate(async (key) => {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    return { local: JSON.stringify(localStorage), session: sessionStorage.getItem(key) || '', sessionKeys: Object.keys(sessionStorage), databases: databases.map((d) => d.name) };
  }, SESSION_KEY);
}

before(async () => {
  server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('접수함이 설정되지 않았으면(기본값) 로그인 버튼이 잠기고 서버를 부르지 않는다', async () => {
  const repoConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  const { page, context, calls, pageErrors } = await openInbox({ config: repoConfig });
  await page.goto(`${origin}/lead-inbox.html`);
  await page.locator('#inboxConfigNotice.is-off').waitFor();
  assert.match(await page.locator('#inboxConfigNotice').innerText(), /아직 연결되지 않았습니다/);
  assert.equal(await page.locator('#inboxLoginButton').isDisabled(), true);
  await page.locator('#inboxAdminCode').fill(ADMIN_CODE);
  await page.locator('#inboxLoginForm').evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(150);
  assert.equal(calls.length, 0);
  assert.equal(await page.locator('#inboxApp').isHidden(), true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('틀린 비밀번호는 안내만 보이고 입력칸을 비우며, 5회째에는 잠금 안내가 나온다', async () => {
  const { page, context, calls, pageErrors, fake } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page, 'wrong-code-000');
  await page.locator('#inboxLoginError:not(:empty)').waitFor();
  assert.equal(await page.locator('#inboxLoginError').innerText(), '관리 비밀번호를 확인해 주세요.');
  assert.equal(await page.locator('#inboxAdminCode').inputValue(), '');
  assert.equal(await page.locator('#inboxApp').isHidden(), true);
  assert.equal((await storageSnapshot(page)).session, '');
  await login(page, 'short');
  assert.equal(calls.length, 1, '8자 미만은 서버를 부르지 않는다');
  for (let i = 0; i < 4; i += 1) {
    await login(page, `wrong-code-00${i}`);
    await page.locator('#inboxLoginError:not(:empty)').waitFor();
  }
  assert.equal(fake.state.failedLogins, 5);
  await login(page, ADMIN_CODE);
  await page.locator('#inboxLoginError:has-text("15분")').waitFor();
  assert.equal(await page.locator('#inboxApp').isHidden(), true);
  assert.equal(calls.every((c) => c.body.action === 'leadLogin'), true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('로그인하면 세션 필드만 sessionStorage 에 남고 목록은 텍스트로만 그려진다', async () => {
  const { page, context, calls, pageErrors, consoleText } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page);
  await page.locator('#inboxApp:not([hidden])').waitFor();
  const loginCall = calls.find((c) => c.body.action === 'leadLogin');
  assert.deepEqual(loginCall.body.payload, { adminCode: ADMIN_CODE });
  assert.equal('sessionToken' in loginCall.body, false);
  const stored = await storageSnapshot(page);
  assert.deepEqual(Object.keys(JSON.parse(stored.session)).sort(), ['expiresAt', 'token']);
  assert.equal(JSON.parse(stored.session).token, TOKEN);
  assert.deepEqual(stored.sessionKeys, [SESSION_KEY]);
  assert.equal(stored.local, '{}');
  assert.deepEqual(stored.databases, []);
  assert.equal(stored.session.includes(ADMIN_CODE), false);

  const listCall = calls.find((c) => c.body.action === 'leadList');
  assert.equal(listCall.body.sessionToken, TOKEN);
  assert.deepEqual(listCall.body.payload, { status: '신규' });
  await page.locator('#inboxList .inbox-record').waitFor();
  assert.equal(await page.locator('#inboxList .inbox-record').count(), 1);
  const listText = await page.locator('#inboxList').innerText();
  assert.equal(listText.includes('FIXTURE_NAME<img'), true, '손님 이름이 HTML 로 해석되지 않고 글자로 보여야 한다');
  assert.equal(listText.includes('메일 미발송'), true);
  assert.equal(listText.includes('LD-20260903-0001'), true);
  assert.equal(await page.locator('#inboxList img').count(), 0);
  assert.equal(await page.evaluate(() => window.__xss || 0), 0);
  assert.equal(await page.locator('.portal-nav [data-count="신규"]').innerText(), '1');
  assert.equal(await page.locator('.portal-nav [data-count="보류"]').innerText(), '1');
  assert.equal(await page.locator('.portal-nav [data-count="승인"]').innerText(), '');
  assert.equal(await page.locator('#inboxAdminCode').inputValue(), '');
  for (const marker of PII_MARKERS) assert.equal(consoleText.some((line) => line.includes(marker)), false, `console 에 ${marker}`);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('찾기는 이미 받은 목록만 거르고(서버 호출 없음) 전화는 숫자만 비교하며, 하루 넘은 신규에는 답변 대기 표시가 붙는다', async () => {
  const { page, context, calls, pageErrors } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page);
  await page.locator('.portal-nav [data-status="전체"]').click();
  await page.locator('#inboxList .inbox-record').nth(1).waitFor();
  assert.equal(await page.locator('#inboxList .inbox-record').count(), 2);
  assert.equal(await page.locator('#inboxList .inbox-record.is-stale').count(), 1, '3일 지난 신규 한 건만');
  assert.match(await page.locator('#inboxList .inbox-record.is-stale .inbox-stale-flag').innerText(), /^답변 대기 3일$/);
  assert.equal(await page.locator('#inboxList .inbox-record.is-stale').innerText().then((t) => t.includes('FIXTURE_NAME')), true);
  const before = calls.length;
  await page.locator('#inboxSearch').fill('042 123');
  assert.equal(await page.locator('#inboxList .inbox-record').count(), 1);
  assert.match(await page.locator('#inboxList').innerText(), /보류 손님/);
  await page.locator('#inboxSearch').fill('ld-20260903-0001');
  assert.equal(await page.locator('#inboxList .inbox-record').count(), 1);
  assert.match(await page.locator('#inboxList').innerText(), /FIXTURE_NAME/);
  await page.locator('#inboxSearch').fill('없는 이름');
  assert.equal(await page.locator('#inboxList .inbox-record').count(), 0);
  assert.equal(await page.locator('#inboxEmpty').isVisible(), true);
  await page.locator('#inboxSearch').fill('');
  assert.equal(await page.locator('#inboxList .inbox-record').count(), 2);
  assert.equal(calls.length, before, '찾기는 서버를 부르지 않는다');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('건을 열면 내용·이력이 텍스트로 보이고 거절은 사유 없이는 서버를 부르지 않으며 판정은 requestId 로 기록된다', async () => {
  const { page, context, calls, pageErrors, fake } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page);
  await page.locator('#inboxList .inbox-record').waitFor();
  await page.locator('#inboxList .inbox-record').first().click();
  await page.locator('#inboxDetail:not([hidden])').waitFor();
  const getCall = calls.find((c) => c.body.action === 'leadGet');
  assert.deepEqual(getCall.body.payload, { leadId: LEAD_NEW });
  assert.equal(await page.locator('#inboxDetailTitle').innerText(), `${XSS_NAME} · 인테리어`);
  assert.equal(await page.locator('#inboxDetailFields img').count(), 0);
  assert.equal(await page.locator('#inboxDetailFields b').count(), 0, '메모의 <b> 는 글자여야 한다');
  assert.equal(await page.locator('#inboxDetailFields a').getAttribute('href'), 'tel:01012345678');
  assert.match(await page.locator('#inboxDetailFields').innerText(), /미발송 — 접수함에만 남은 문의입니다/);
  assert.equal(await page.locator('#inboxMessage').innerText(), fake.leads[LEAD_NEW].message);
  assert.equal(await page.locator('#inboxHistory li').count(), 1);
  assert.match(await page.locator('#inboxHistory').innerText(), /접수 → 신규/);
  for (const decision of ['승인', '보류', '거절']) assert.equal(await page.locator(`[data-decision="${decision}"]`).isEnabled(), true);

  const before = calls.length;
  await page.locator('[data-decision="거절"]').click();
  assert.equal(await page.locator('#inboxDecisionError').innerText(), '거절 사유를 메모에 적어 주세요.');
  assert.equal(calls.length, before, '사유 없는 거절은 서버를 부르지 않는다');

  await page.locator('#inboxDecisionMemo').fill('FIXTURE_MEMO 예산 불일치');
  await page.locator('[data-decision="거절"]').click();
  await page.locator('#inboxDetailStatus[data-status="거절"]').waitFor();
  const decide = calls.filter((c) => c.body.action === 'leadDecide');
  assert.equal(decide.length, 1);
  assert.equal(decide[0].body.sessionToken, TOKEN);
  assert.equal(decide[0].body.payload.leadId, LEAD_NEW);
  assert.equal(decide[0].body.payload.decision, '거절');
  assert.equal(decide[0].body.payload.memo, 'FIXTURE_MEMO 예산 불일치');
  assert.match(decide[0].body.payload.requestId, UUID);
  assert.equal(await page.locator('#inboxHistory li').count(), 2);
  assert.match(await page.locator('#inboxHistory').innerText(), /신규 → 거절 · FIXTURE_MEMO 예산 불일치/);
  assert.equal(await page.locator('[data-decision="보류"]').isEnabled(), true, '거절은 보류로 되살릴 수 있다');
  assert.equal(await page.locator('[data-decision="승인"]').isDisabled(), true);
  assert.equal(await page.locator('[data-decision="거절"]').isDisabled(), true);
  assert.equal(await page.locator('#inboxDecisionMemo').inputValue(), '');
  assert.match(await page.locator('#inboxStatus').innerText(), /거절\(으\)로 기록했습니다/);
  assert.equal(await page.locator('#inboxList .inbox-record').count(), 0, '신규 탭에서 사라진다');
  assert.equal(await page.locator('#inboxEmpty').isVisible(), true);
  assert.equal(await page.locator('.portal-nav [data-count="거절"]').innerText(), '1');

  await page.locator('.portal-nav [data-status="거절"]').click();
  await page.locator('#inboxList .inbox-record').waitFor();
  assert.equal(await page.locator('#inboxListTitle').innerText(), '거절 문의');
  assert.equal((await storageSnapshot(page)).local, '{}');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('판정 버튼을 연타해도 서버에는 한 번만 가고 서버가 전이를 거부하면 이유가 보인다', async () => {
  const { page, context, calls, pageErrors } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page);
  await page.locator('#inboxList .inbox-record').waitFor();
  await page.locator('#inboxList .inbox-record').first().click();
  await page.locator('#inboxDetail:not([hidden])').waitFor();
  const approve = page.locator('[data-decision="승인"]');
  await approve.dispatchEvent('click');
  await approve.dispatchEvent('click');
  await approve.dispatchEvent('click');
  await page.locator('#inboxDetailStatus[data-status="승인"]').waitFor();
  assert.equal(calls.filter((c) => c.body.action === 'leadDecide').length, 1);
  for (const decision of ['승인', '보류', '거절']) assert.equal(await page.locator(`[data-decision="${decision}"]`).isDisabled(), true, '승인은 종착');
  assert.deepEqual(pageErrors, []);
  await context.close();

  const rejecting = await openInbox({ respond: (body, fake) => (body.action === 'leadDecide' ? { ok: false, error: 'invalid-transition' } : fake.respond(body)) });
  await rejecting.page.goto(`${origin}/lead-inbox.html`);
  await login(rejecting.page);
  await rejecting.page.locator('#inboxList .inbox-record').waitFor();
  await rejecting.page.locator('#inboxList .inbox-record').first().click();
  await rejecting.page.locator('#inboxDetail:not([hidden])').waitFor();
  await rejecting.page.locator('[data-decision="보류"]').click();
  await rejecting.page.locator('#inboxDecisionError:not(:empty)').waitFor();
  assert.match(await rejecting.page.locator('#inboxDecisionError').innerText(), /이 상태에서는 그 판정을 할 수 없습니다/);
  assert.equal(await rejecting.page.locator('[data-decision="승인"]').isEnabled(), true, '실패 뒤 버튼이 다시 살아난다');
  assert.deepEqual(rejecting.pageErrors, []);
  await rejecting.context.close();
});

test('본문 복사는 메일 형식 그대로 클립보드에 넣고 버튼 문구로 결과를 알린다', async () => {
  const { page, context, pageErrors, fake } = await openInbox({ clipboard: true });
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page);
  await page.locator('#inboxList .inbox-record').waitFor();
  await page.locator('#inboxList .inbox-record').first().click();
  await page.locator('#inboxDetail:not([hidden])').waitFor();
  await page.locator('#inboxCopyMessage').click();
  await page.locator('#inboxCopyMessage:has-text("복사했습니다")').waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), fake.leads[LEAD_NEW].message + '\n접수번호: LD-20260903-0001', '복사본 = 메일 형식 본문 + 접수번호 줄(앱이 읽는 라벨)');
  assert.equal(await page.locator('#inboxMessage').innerText(), fake.leads[LEAD_NEW].message, '화면 본문은 서버가 준 그대로');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('로그아웃은 세션을 지우고 서버에 알린 뒤 로그인 화면으로 돌아간다', async () => {
  const { page, context, calls, pageErrors } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page);
  await page.locator('#inboxList .inbox-record').waitFor();
  await page.locator('#inboxLogout').click();
  await page.locator('#inboxLoginView:not([hidden])').waitFor();
  const logout = calls.find((c) => c.body.action === 'leadLogout');
  assert.equal(logout.body.sessionToken, TOKEN);
  const stored = await storageSnapshot(page);
  assert.equal(stored.session, '');
  assert.deepEqual(stored.sessionKeys, []);
  assert.equal(await page.locator('#inboxList').innerText(), '');
  assert.equal(await page.locator('#inboxApp').isHidden(), true);
  assert.equal(calls.filter((c) => c.body.action === 'leadList').length, 1, '로그아웃 뒤 다시 목록을 부르지 않는다');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('서버가 세션 만료를 돌려주면 세션을 지우고 화면의 문의 내용을 비운다', async () => {
  const { page, context, pageErrors, fake } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await login(page);
  await page.locator('#inboxList .inbox-record').waitFor();
  await page.locator('#inboxSearch').fill('FIXTURE');
  fake.state.sessionValid = false;
  await page.locator('#inboxRefresh').click();
  await page.locator('#inboxDenied:not([hidden])').waitFor();
  assert.match(await page.locator('#inboxDeniedMessage').innerText(), /로그인이 만료되었습니다/);
  assert.equal(await page.locator('#inboxList').innerText(), '');
  assert.equal(await page.locator('#inboxSearch').inputValue(), '', '만료 뒤 찾기 칸(손님 이름일 수 있음)도 비운다');
  assert.equal(await page.locator('#inboxApp').isHidden(), true);
  assert.equal((await storageSnapshot(page)).session, '');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('탭 안에 세션이 남아 있으면 leadMe 로 확인한 뒤 바로 접수함을 열고, 깨진 세션은 로그인 화면이다', async () => {
  const { page, context, calls, pageErrors } = await openInbox();
  await page.goto(`${origin}/lead-inbox.html`);
  await page.evaluate(([key, token]) => sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() + 60 * 60 * 1000 })), [SESSION_KEY, TOKEN]);
  await page.reload();
  await page.locator('#inboxList .inbox-record').waitFor();
  assert.deepEqual(calls.map((c) => c.body.action), ['leadMe', 'leadList']);
  assert.equal(await page.locator('#inboxLoginView').isHidden(), true);

  await page.evaluate(([key, token]) => sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() + 60 * 60 * 1000, extra: 1 })), [SESSION_KEY, TOKEN]);
  await page.reload();
  await page.locator('#inboxLoginView:not([hidden])').waitFor();
  assert.equal((await storageSnapshot(page)).session, '', '허용되지 않은 필드가 있는 세션은 버린다');
  assert.equal(await page.locator('#inboxDenied').isHidden(), true);
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('서버가 세션을 모르면 부팅은 로그인 화면으로 돌아오고 거부 카드는 남지 않는다', async () => {
  const { page, context, pageErrors, fake } = await openInbox();
  fake.state.sessionValid = false;
  await page.goto(`${origin}/lead-inbox.html`);
  await page.evaluate(([key, token]) => sessionStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() + 60 * 60 * 1000 })), [SESSION_KEY, TOKEN]);
  await page.reload();
  await page.locator('#inboxLoginView:not([hidden])').waitFor();
  assert.equal(await page.locator('#inboxDenied').isHidden(), true);
  assert.equal(await page.locator('#inboxApp').isHidden(), true);
  assert.equal((await storageSnapshot(page)).session, '');
  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('프레임 안에서는 접수함이 열리지 않는다', async () => {
  const { page, context, calls } = await openInbox();
  await page.goto(`${origin}/index.html`);
  await page.evaluate((src) => new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.src = src; frame.onload = () => resolve();
    document.body.appendChild(frame);
  }), `${origin}/lead-inbox.html`);
  await page.waitForTimeout(300);
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  assert.equal(frames.length, 1);
  assert.equal(frames[0].url(), 'about:blank', '프레임 안의 접수함은 about:blank 로 대체된다');
  assert.equal(calls.length, 0);
  await context.close();
});
