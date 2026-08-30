const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://script.google.com/macros/s/test-office-recent/exec';
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
let browser;
let origin;
let server;

test('목록 응답을 적용하기 직전에 최신 list generation을 확인한다', () => {
  const controller = fs.readFileSync(path.join(ROOT, 'js', 'office-request.js'), 'utf8');
  assert.match(controller, /listGeneration\s*\+=\s*1/);
  const successStart = controller.indexOf("const response = await authenticatedCall('officeList', {});");
  const catchStart = controller.indexOf('} catch (error) {', successStart);
  assert.notEqual(successStart, -1, 'officeList success response is missing');
  assert.notEqual(catchStart, -1, 'officeList success block boundary is missing');
  const successResponse = controller.slice(successStart, catchStart);
  assert.match(successResponse, /const response\s*=\s*await authenticatedCall\('officeList', \{\}\);\s*if\s*\(\s*!isCurrentSession\(\s*candidate\s*,\s*generation\s*\)\s*\|\|\s*listAttempt\s*!==\s*listGeneration\s*\)\s*return\s*;\s*const validationNow\s*=\s*Date\.now\(\)\s*;\s*const normalized\s*=\s*core\.normalizeRecentList/);
});

test('최근 변경 표시용 전체 행은 성공 응답 적용 중 렌더에 한 번만 전달한다', () => {
  const controller = fs.readFileSync(path.join(ROOT, 'js', 'office-request.js'), 'utf8');
  const rowReferences = [...controller.matchAll(/\bnormalized\.rows\b/g)];
  assert.equal(rowReferences.length, 1, 'normalized recent rows must have a single one-shot consumer');
  const rowIndex = rowReferences[0].index;
  const statement = controller.slice(controller.lastIndexOf('\n', rowIndex) + 1, controller.indexOf('\n', rowIndex));
  assert.match(
    statement,
    /^\s*[A-Za-z_$][\w$]*\(\s*normalized\.rows\s*\);\s*$/,
    'normalized recent rows must flow directly into rendering instead of module-level state',
  );
});

function serveStatic(req, res) {
  const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

function loginResult() {
  return { ok: true, sessionToken: 'session-recent', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 관리사무소' }, expiresAt: Date.now() + 3600000 };
}

function request(requestId, status, updatedAt, extra = {}) {
  return {
    requestId, receiptNo: `MM-${requestId}`, unit: '101동 1203호', location: '공용 배관실', issueType: '누수',
    status, updatedAt, description: '최근 변경 화면에는 나오면 안 되는 설명',
    officeContact: { name: '김소장', phone: '010-1111-2222' }, publicAmount: 987654,
    ...extra,
  };
}

async function openPortal(respond) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(1800);
  const calls = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.route('**/office-api.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, apiUrl: API_URL }) }));
  await page.route(API_URL, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(await respond(body, calls)) });
  });
  return { calls, page, pageErrors };
}

async function login(page) {
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
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

test('390px 대시보드에 수동 새로고침과 접근 가능한 최근 변경 영역이 있다', async () => {
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  assert.equal(await page.locator('#officeRefreshRequests').count(), 1);
  assert.equal(await page.locator('#officeRecentChanges').isVisible(), true);
  assert.equal(await page.locator('#officeRecentSummary').getAttribute('role'), 'status');
  assert.equal(await page.locator('#officeRecentSummary').getAttribute('aria-live'), 'polite');
  assert.equal(await page.locator('#officeRecentList').getAttribute('aria-live'), null);
  const liveContract = await page.locator('#officeRecentList').evaluate((list) => {
    const activeLive = (element) => {
      const ariaLive = String(element.getAttribute('aria-live') || '').trim().toLowerCase();
      const role = String(element.getAttribute('role') || '').trim().toLowerCase();
      return (ariaLive && ariaLive !== 'off') || ['status', 'alert', 'log'].includes(role);
    };
    const ancestors = [];
    for (let element = list; element; element = element.parentElement) {
      if (activeLive(element)) ancestors.push(element.id || element.tagName.toLowerCase());
    }
    const region = list.closest('#officeRecentChanges');
    const regionLive = [...region.querySelectorAll('*')]
      .filter(activeLive)
      .map((element) => element.id || element.tagName.toLowerCase());
    return { ancestors, regionLive };
  });
  assert.deepEqual(liveContract.ancestors, []);
  assert.deepEqual(liveContract.regionLive, ['officeRecentSummary']);
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    refreshHeight: document.getElementById('officeRefreshRequests').getBoundingClientRect().height,
  }));
  assert.equal(metrics.scrollWidth, metrics.width);
  assert.ok(metrics.refreshHeight >= 44);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('지연된 수동 새로고침 완료는 사용자가 옮긴 필터 포커스를 빼앗지 않는다', async () => {
  let listCall = 0;
  let resolveRefresh;
  const baseline = [request('focus-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const changed = [request('focus-1', 'accepted', '2026-08-30T10:00:00.000Z')];
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: baseline };
      return new Promise((resolve) => { resolveRefresh = resolve; });
    }
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.waitForFunction(() => document.getElementById('officeRefreshRequests').disabled);
  assert.equal(await page.locator('#officeRefreshRequests').getAttribute('aria-busy'), 'true');
  const progressFilter = page.getByRole('button', { name: '진행 중' });
  await progressFilter.click();
  await progressFilter.focus();
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.officeFilter), 'progress');
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 2);
  resolveRefresh({ ok: true, requests: changed });
  await page.getByText('최근 변경 1건').waitFor();
  assert.equal(await page.locator('#officeRefreshRequests').isEnabled(), true);
  assert.equal(await page.locator('#officeRefreshRequests').getAttribute('aria-busy'), 'false');
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 2);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.officeFilter), 'progress');
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('첫 조회는 기준만 만들고 수동 새로고침 한 번은 officeList만 정확히 한 번 추가 호출한다', async () => {
  let listCall = 0;
  const baseline = [request('req-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const changed = [
    request('req-2', 'pending_review', '2026-08-30T11:00:00.000Z', { receiptNo: '', unit: '', location: '' }),
    request('req-1', 'needs_info', '2026-08-30T10:00:00.000Z'),
  ];
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByText('다음 새로고침부터 변경을 확인합니다.').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 1);
  const refresh = page.getByRole('button', { name: '목록 새로고침' });
  await refresh.focus();
  await refresh.click();
  await page.getByText('최근 변경 2건').waitFor();
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 2);
  assert.deepEqual(calls.map((entry) => entry.action), ['officeLogin', 'officeList', 'officeList']);
  const text = await page.locator('#officeRecentChanges').innerText();
  assert.match(text, /이번 새로고침에서 새로 확인/);
  assert.match(text, /자료 보완 필요/);
  assert.match(text, /접수번호 확인 필요/);
  assert.match(text, /위치 확인 필요/);
  assert.doesNotMatch(text, /010-1111-2222|최근 변경 화면에는 나오면 안 되는 설명|987654/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('최근 변경의 개인정보는 저장소와 URL에 남지 않고 hard reload는 새 기준을 만든다', async () => {
  let listCall = 0;
  const baseline = [request('private-1', 'pending_review', '2026-08-30T09:00:00.000Z', { receiptNo: 'MM-PRIVATE-001' })];
  const changed = [request('private-1', 'needs_info', '2026-08-30T10:00:00.000Z', { receiptNo: 'MM-PRIVATE-001' })];
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 1건').waitFor();
  const leaked = await page.evaluate(() => ({
    local: JSON.stringify(Object.fromEntries(Object.entries(localStorage))),
    session: JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))),
    url: location.href,
    history: JSON.stringify(history.state),
    title: document.title,
    visible: document.body.innerText,
  }));
  assert.doesNotMatch(JSON.stringify(leaked), /010-1111-2222|최근 변경 화면에는 나오면 안 되는 설명|987654/);
  assert.doesNotMatch(JSON.stringify(leaked), /private-1/);
  const stored = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), 'manmul_office_session_v1');
  assert.deepEqual(Object.keys(stored).sort(), ['expiresAt', 'office', 'token']);
  await page.reload();
  await page.getByText('다음 새로고침부터 변경을 확인합니다.').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('최근 변경은 최신순 10건과 초과 건수를 유지하고 필터와 URL 변경 없이 상세로 이동한다', async () => {
  let listCall = 0;
  const baseline = Array.from({ length: 12 }, (_, index) => request(
    `req-${index}`,
    'pending_review',
    `2026-08-30T08:00:${String(index).padStart(2, '0')}.000Z`,
  ));
  const changed = baseline.map((item, index) => request(
    item.requestId,
    index % 2 ? 'accepted' : 'completed',
    `2026-08-30T11:00:${String(59 - index).padStart(2, '0')}.000Z`,
  ));
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    if (body.action === 'officeGet') return { ok: true, request: changed.find((item) => item.requestId === body.payload.requestId) };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 12건').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 10);
  assert.match(await page.locator('#officeRecentOverflow').innerText(), /외 2건/);
  const firstMeta = await page.locator('#officeRecentList li').first().innerText();
  assert.match(firstMeta, /req-0/);
  await page.getByRole('button', { name: '진행 중' }).click();
  assert.equal(await page.locator('#officeRequestList article').count(), 6);
  assert.equal(await page.locator('#officeRecentList li').count(), 10);
  const beforeUrl = page.url();
  await page.locator('#officeRecentList button').first().click();
  await page.locator('#officeDetailView').waitFor({ state: 'visible' });
  assert.equal(page.url(), beforeUrl);
  assert.equal(calls.filter((entry) => entry.action === 'officeGet').length, 1);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('공백이 있는 canonical 또는 legacy ID 변경은 카드 수와 요약을 맞추고 상세로 연다', async () => {
  let listCall = 0;
  const baseline = [request('req-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const canonical = request(' req-2 ', 'accepted', '2026-08-30T11:00:00.000Z', { receiptNo: 'MM-002' });
  const legacy = { ...request('discarded', 'completed', '2026-08-30T11:01:00.000Z', { receiptNo: '', unit: '', location: '' }), requestId: undefined, id: ' legacy-3 ' };
  const changed = [canonical, legacy];
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: listCall++ === 0 ? baseline : changed };
    if (body.action === 'officeGet') return { ok: true, request: body.payload.requestId === 'req-2' ? canonical : legacy };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 2건').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 2);
  const recentText = await page.locator('#officeRecentChanges').innerText();
  assert.match(recentText, /MM-002/);
  assert.match(recentText, /접수번호 확인 필요/);
  assert.doesNotMatch(recentText, /req-2|legacy-3/);
  const beforeUrl = page.url();
  for (const button of await page.locator('#officeRecentList button').all()) {
    await button.click();
    await page.locator('#officeDetailView').waitFor({ state: 'visible' });
    assert.equal(page.url(), beforeUrl);
    await page.getByRole('button', { name: '목록으로' }).click();
  }
  assert.deepEqual(calls.filter((entry) => entry.action === 'officeGet').map((entry) => entry.payload.requestId), ['legacy-3', 'req-2']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('새로고침 실패는 직전 성공 목록과 변경 카드를 보존하고 다음 성공은 비교 결과를 교체한다', async () => {
  let listCall = 0;
  const baseline = [request('req-1', 'pending_review', '2026-08-30T09:00:00.000Z')];
  const changed = [request('req-1', 'needs_info', '2026-08-30T10:00:00.000Z')];
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: baseline };
      if (listCall === 2) return { ok: true, requests: changed };
      if (listCall === 3) return { ok: false, error: 'server-error' };
      return { ok: true, requests: changed };
    }
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 1건').waitFor();
  const beforeFailure = {
    list: await page.locator('#officeRequestList').innerText(),
    recent: await page.locator('#officeRecentChanges').innerText(),
    checked: await page.locator('#officeLastChecked').innerText(),
  };
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText(/서버 처리 중 문제가 발생했습니다/).waitFor();
  assert.equal(await page.locator('#officeRequestList').innerText(), beforeFailure.list);
  assert.equal(await page.locator('#officeRecentChanges').innerText(), beforeFailure.recent);
  assert.equal(await page.locator('#officeLastChecked').innerText(), beforeFailure.checked);
  assert.match(await page.locator('#officeSyncStatus').innerText(), /마지막 성공/);
  const callsAfterFailure = listCall;
  await page.waitForTimeout(80);
  assert.equal(listCall, callsAfterFailure);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('이번 새로고침에서 확인된 변경이 없습니다.').waitFor();
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('첫 목록 실패는 기준을 만들지 않고 빈 목록과 오류만 표시한다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: false, error: 'server-error' };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByText(/서버 처리 중 문제가 발생했습니다/).waitFor();
  assert.equal(await page.locator('#officeRequestList article').count(), 0);
  assert.match(await page.locator('#officeRequestList').innerText(), /표시할 접수가 없습니다/);
  assert.match(await page.locator('#officeRecentSummary').innerText(), /첫 목록을 기준으로 준비/);
  const listCalls = calls.filter((entry) => entry.action === 'officeList').length;
  await page.waitForTimeout(80);
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, listCalls);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('진행 중 중복 클릭을 막고 로그아웃 전 늦은 목록이 새 로그인 목록을 덮지 않는다', async () => {
  let loginCall = 0;
  let listCall = 0;
  let resolveLate;
  let resolveNew;
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') {
      loginCall += 1;
      return { ...loginResult(), sessionToken: `session-recent-${loginCall}` };
    }
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: [request('initial', 'accepted', '2026-08-30T09:00:00.000Z')] };
      if (listCall === 2) return new Promise((resolve) => { resolveLate = resolve; });
      return new Promise((resolve) => { resolveNew = resolve; });
    }
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.waitForFunction(() => document.getElementById('officeRefreshRequests').disabled);
  assert.equal(await page.locator('#officeRefreshRequests').getAttribute('aria-busy'), 'true');
  await page.dispatchEvent('#officeRefreshRequests', 'click');
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 2);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await page.locator('#officePin').fill('123456');
  const newSessionList = page.waitForRequest((request) => {
    if (request.url() !== API_URL) return false;
    try { return request.postDataJSON().action === 'officeList'; } catch (_) { return false; }
  });
  await page.getByRole('button', { name: '로그인' }).click();
  await newSessionList;
  await page.waitForFunction(() => document.getElementById('officeRefreshRequests').disabled);
  assert.equal(calls.filter((entry) => entry.action === 'officeList').length, 3);
  assert.equal(await page.locator('#officeRefreshRequests').getAttribute('aria-busy'), 'true');
  resolveLate({ ok: true, requests: [request('late-old-session', 'completed', '2026-08-30T12:00:00.000Z')] });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#officeRefreshRequests').isDisabled(), true);
  assert.equal(await page.locator('#officeRefreshRequests').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('#officeRefreshRequests').innerText(), '목록 확인 중');
  assert.equal(await page.locator('#officeRequestList').innerText(), '');
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.equal(await page.locator('#officeLastChecked').innerText(), '');
  resolveNew({ ok: true, requests: [request('new-session', 'accepted', '2026-08-30T11:00:00.000Z')] });
  await page.getByText('MM-new-session').waitFor();
  const visible = await page.locator('#officeRequestList').innerText();
  assert.match(visible, /MM-new-session/);
  assert.doesNotMatch(visible, /late-old-session/);
  assert.equal(await page.locator('#officeRefreshRequests').isEnabled(), true);
  assert.equal(await page.locator('#officeRefreshRequests').getAttribute('aria-busy'), 'false');
  assert.equal(await page.locator('#officeRecentList li').count(), 0);
  assert.match(await page.locator('#officeLastChecked').innerText(), /마지막 확인/);
  assert.match(await page.locator('#officeRecentSummary').innerText(), /다음 새로고침부터 변경을 확인/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('잘못된 시각과 목록은 허위 변경을 만들지 않고 사라진 상세 참조는 API를 호출하지 않는다', async () => {
  let listCall = 0;
  const baseline = [
    request('future-status', 'accepted', '2026-08-30T09:00:00.000Z'),
    request('no-zone-status', 'accepted', '2026-08-30T09:00:00.000Z'),
    request('invalid-transition', 'accepted', 'not-a-time'),
  ];
  const malformedTimes = [
    request('future-status', 'needs_info', '2999-01-01T00:00:00.000Z'),
    request('no-zone-status', 'visit_scheduled', '2026-08-30T10:00:00'),
    request('invalid-transition', 'accepted', '2026-08-30T10:00:00.000Z'),
  ];
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') {
      listCall += 1;
      if (listCall === 1) return { ok: true, requests: baseline };
      if (listCall === 2) return { ok: true, requests: malformedTimes };
      if (listCall === 3) return { ok: true, requests: {} };
      if (listCall === 4) return { ok: true, requests: [{ requestId: '', status: '' }] };
      return { ok: true, requests: [] };
    }
    if (body.action === 'officeGet') return { ok: true, request: malformedTimes[0] };
    throw new Error(`unexpected action ${body.action}`);
  });
  await login(page);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('최근 변경 2건').waitFor();
  assert.equal((await page.locator('#officeRecentChanges').innerText().then((text) => text.match(/시간 확인 필요/g) || [])).length, 2);
  const getCount = calls.filter((entry) => entry.action === 'officeGet').length;
  await page.locator('#officeRecentList button').first().evaluate((button) => { button.dataset.officeRecentDetail = 'missing-request'; });
  await page.locator('#officeRecentList button').first().click();
  assert.match(await page.locator('#officeSyncStatus').innerText(), /현재 목록에서 접수를 찾을 수 없습니다/);
  assert.equal(calls.filter((entry) => entry.action === 'officeGet').length, getCount);
  const preserved = await page.locator('#officeRecentChanges').innerText();
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText(/서버 응답을 확인할 수 없습니다/).waitFor();
  assert.equal(await page.locator('#officeRecentChanges').innerText(), preserved);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText(/서버 응답을 확인할 수 없습니다/).waitFor();
  assert.equal(await page.locator('#officeRecentChanges').innerText(), preserved);
  await page.getByRole('button', { name: '목록 새로고침' }).click();
  await page.getByText('이번 새로고침에서 확인된 변경이 없습니다.').waitFor();
  assert.equal(await page.locator('#officeRequestList article').count(), 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
