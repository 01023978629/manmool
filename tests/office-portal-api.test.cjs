const { test } = require('node:test');
const assert = require('node:assert/strict');
const portalApi = require('../js/office-portal-api.js');

const API_URL = 'https://script.google.com/macros/s/example-portal-deployment/exec';
function response(value, ok = true) { return { ok, text: async () => JSON.stringify(value) }; }
async function withFetch(implementation, run) { const old = global.fetch; global.fetch = implementation; try { await run(); } finally { global.fetch = old; } }

test('포털 action 계약은 승인된 운영 action만 제공한다', () => {
  assert.deepEqual(portalApi.ACTIONS, [
    'portalLogin', 'portalMe', 'portalLogout', 'portalDashboard',
    'portalStatusList', 'portalStatusSave', 'portalLogList', 'portalLogSave',
    'portalUserList', 'portalUserSave', 'portalPermissionSave', 'portalAuditList',
    'portalWorkOrderList', 'portalWorkOrderSave', 'portalNoticeList', 'portalNoticeSave',
    'portalCostList', 'portalCostSave', 'portalCostApprove', 'portalReportSummary',
  ]);
});

test('기본 disabled 설정은 endpoint 요청 없이 fail-closed 된다', async () => {
  const calls = [];
  await withFetch(async (url) => { calls.push(url); return response({ enabled: false, apiUrl: '' }); }, async () => {
    const config = await portalApi.loadConfig();
    assert.deepEqual(config, { enabled: false, apiUrl: '' });
    await assert.rejects(() => portalApi.call('portalLogin', { payload: { officeCode: 'sample-apt', email: 'a@example.com', loginCode: '123456' } }), (error) => error.code === 'not-configured');
  });
  assert.deepEqual(calls, ['office-portal-api.json', 'office-portal-api.json']);
});

test('로그인은 세션 토큰 없이, 인증 후 action은 세션 토큰과 exact text/plain POST를 사용한다', async () => {
  const calls = [];
  await withFetch(async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'office-portal-api.json') return response({ enabled: true, apiUrl: API_URL });
    return response({ ok: true, user: {}, office: {}, permissions: [] });
  }, async () => {
    await portalApi.call('portalLogin', { payload: { officeCode: 'sample-apt', email: 'a@example.com', loginCode: '123456' } });
    await portalApi.call('portalMe', { sessionToken: 'signed-token', payload: {} });
  });
  const posts = calls.filter((call) => call.url === API_URL);
  assert.equal(posts.length, 2);
  const first = JSON.parse(posts[0].options.body);
  const second = JSON.parse(posts[1].options.body);
  assert.deepEqual(Object.keys(first).sort(), ['action', 'payload', 'ts']);
  assert.equal(first.action, 'portalLogin');
  assert.deepEqual(Object.keys(second).sort(), ['action', 'payload', 'sessionToken', 'ts']);
  assert.equal(second.sessionToken, 'signed-token');
  assert.equal(posts[1].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(posts[1].options.credentials, 'omit');
});

test('인증 action의 토큰 누락과 내부·알 수 없는 action은 네트워크 전에 거절한다', async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; return response({ enabled: true, apiUrl: API_URL }); }, async () => {
    await assert.rejects(() => portalApi.call('portalDashboard', { payload: {} }), (error) => error.code === 'session-expired');
    await assert.rejects(() => portalApi.call('officeAdminUpsert', { sessionToken: 'x', payload: {} }), (error) => error.code === 'bad-request');
  });
  assert.equal(calls, 0);
});

test('설정은 exact Apps Script HTTPS exec 주소만 허용한다', () => {
  assert.equal(portalApi.isAllowedApiUrl(API_URL), true);
  for (const value of [
    'http://script.google.com/macros/s/x/exec', 'https://script.googleusercontent.com/macros/s/x/exec',
    'https://script.google.com/macros/s/x/exec?token=secret', ' https://script.google.com/macros/s/x/exec',
  ]) assert.equal(portalApi.isAllowedApiUrl(value), false);
});
