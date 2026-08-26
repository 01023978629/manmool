const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/office-request-api.js');

function jsonResponse(value, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(value) };
}

function withFetch(fake, fn) {
  const original = global.fetch;
  global.fetch = fake;
  return Promise.resolve().then(fn).finally(() => { global.fetch = original; });
}

test('공개 office action은 text/plain과 sessionToken만 전송한다', async () => {
  const fetchCalls = [];
  await withFetch(async (url, options) => {
    fetchCalls.push({ url, options });
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    return jsonResponse({ ok: true, requests: [] });
  }, async () => {
    const result = await api.call('officeList', { sessionToken: 'session-test', payload: { page: 1 } });
    assert.deepEqual(result, { ok: true, requests: [] });
  });
  assert.equal(fetchCalls.length, 2);
  const body = JSON.parse(fetchCalls[1].options.body);
  assert.equal(fetchCalls[1].options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.equal(body.action, 'officeList');
  assert.equal(body.sessionToken, 'session-test');
  assert.equal(typeof body.ts, 'number');
  assert.equal('token' in body, false);
  assert.equal('APP_TOKEN' in body, false);
});

test('기본 비활성 설정은 네트워크 요청 없이 fail-closed 된다', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return jsonResponse({ enabled: false, apiUrl: '' });
  }, async () => {
    await assert.rejects(api.call('officeLogin'), (error) => error.code === 'not-configured' && error.retryable === false);
  });
  assert.equal(calls, 1);
});

test('설정은 정확한 Apps Script HTTPS /exec URL만 허용한다', async () => {
  for (const apiUrl of [
    'http://script.google.com/macros/s/deployment/exec',
    'https://script.googleusercontent.com/macros/s/deployment/exec',
    'https://script.google.com/macros/s/deployment/exec?x=1',
    'https://script.google.com/macros/s/deployment/dev',
  ]) {
    await withFetch(async () => jsonResponse({ enabled: true, apiUrl }), async () => {
      await assert.rejects(api.loadConfig(), (error) => error.code === 'not-configured');
    });
  }
});

test('HTTP, 비JSON, timeout 오류를 안전하게 분류한다', async () => {
  const cases = [
    { response: { ok: false, status: 500, text: async () => 'server exploded' }, code: 'http-error', retryable: true },
    { response: { ok: true, status: 200, text: async () => '<html>bad gateway</html>' }, code: 'invalid-response', retryable: true },
  ];
  for (const item of cases) {
    await withFetch(async (url) => url === 'office-api.json'
      ? jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' })
      : item.response, async () => {
      await assert.rejects(api.call('officeList', { sessionToken: 'session-test' }), (error) => error.code === item.code && error.retryable === item.retryable && !String(error).includes('session-test'));
    });
  }
  await withFetch(async (url) => {
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    const error = new Error('network contains session-test');
    error.name = 'AbortError';
    throw error;
  }, async () => {
    await assert.rejects(api.call('officeList', { sessionToken: 'session-test' }), (error) => error.code === 'timeout' && error.retryable === true && !String(error).includes('session-test'));
  });
});

test('세션 만료는 자동 재시도하지 않고 안전한 오류만 반환한다', async () => {
  let postCalls = 0;
  await withFetch(async (url) => {
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    postCalls += 1;
    return jsonResponse({ ok: false, error: 'session-expired', message: 'raw session-test should not escape' });
  }, async () => {
    await assert.rejects(api.call('officeList', { sessionToken: 'session-test' }), (error) => {
      assert.equal(error.code, 'session-expired');
      assert.equal(error.retryable, false);
      assert.equal(String(error).includes('session-test'), false);
      assert.equal(error.message, '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
      return true;
    });
  });
  assert.equal(postCalls, 1);
});
