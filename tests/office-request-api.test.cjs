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

function withImmediateTimers(fn) {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  global.setTimeout = (callback) => {
    queueMicrotask(callback);
    return { immediate: true };
  };
  global.clearTimeout = () => {};
  return Promise.resolve().then(fn).finally(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });
}

function createPayload(expectedUploadIds = []) {
  return {
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', unit: '101동 101호', location: '욕실', issueType: '누수',
    pipeType: '미확정', urgency: 'normal', description: '천장 누수', officeContact: { name: '김소장', phone: '010-1234-5678' },
    residentContact: null, preferredVisitDate: '', privacyConsent: true, expectedUploadIds,
  };
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

test('URL 원문과 구조가 정확한 Apps Script 배포 주소일 때만 설정을 허용한다', async () => {
  const valid = 'https://script.google.com/macros/s/Ab_C-9/exec';
  await withFetch(async () => jsonResponse({ enabled: true, apiUrl: valid }), async () => {
    assert.deepEqual(await api.loadConfig(), { enabled: true, apiUrl: valid });
  });
  for (const apiUrl of [
    ` ${valid}`, `${valid} `, `${valid}\n`, `${valid}/`,
    'https://SCRIPT.google.com/macros/s/Ab_C-9/exec',
    'https://script.google.com:443/macros/s/Ab_C-9/exec',
    'https://user@script.google.com/macros/s/Ab_C-9/exec',
    'https://script.google.com/macros/s/Ab_C-9/exec#hash',
    'https://script.google.com/macros/s/Ab_C-9/exec?x=1',
    'https://script.google.com\\macros\\s\\Ab_C-9\\exec',
    'https://script.google.com/macros/s/Ab_C-9/\u0000exec',
    'https://script.goog1e.com/macros/s/Ab_C-9/exec',
    'https://script.googⅼe.com/macros/s/Ab_C-9/exec',
  ]) {
    await withFetch(async () => jsonResponse({ enabled: true, apiUrl }), async () => {
      await assert.rejects(api.loadConfig(), (error) => error.code === 'not-configured');
    });
  }
});

test('설정과 본문 읽기까지 하나의 timeout으로 보호하고 AbortError를 timeout으로 매핑한다', async () => {
  await withImmediateTimers(() => withFetch(async (_url, options) => {
    if (!options.signal) {
      const error = new Error('signal required');
      error.name = 'NoSignalError';
      throw error;
    }
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => {
      const error = new Error('session-test must not escape');
      error.name = 'AbortError';
      reject(error);
    }, { once: true }));
  }, async () => {
    await assert.rejects(api.loadConfig(), (error) => error.code === 'timeout' && error.retryable === true && !String(error).includes('session-test'));
  }));

  await withImmediateTimers(() => withFetch(async (url, options) => {
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    return {
      ok: true,
      status: 200,
      text: () => new Promise((_, reject) => {
        if (options.signal.aborted) {
          const error = new Error('session-test must not escape');
          error.name = 'AbortError';
          reject(error);
          return;
        }
        options.signal.addEventListener('abort', () => {
          const error = new Error('session-test must not escape');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }),
    };
  }, async () => {
    await assert.rejects(api.call('officeList', { sessionToken: 'session-test' }), (error) => error.code === 'timeout' && error.retryable === true && !String(error).includes('session-test'));
  }));
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

test('공개 action allowlist 밖의 내부 action은 전송 전에 거절한다', async () => {
  let fetchCalls = 0;
  await withFetch(async () => { fetchCalls += 1; return jsonResponse({ ok: true }); }, async () => {
    for (const action of ['officeInbox', 'officeAccept', 'officeSetStatus', 'officeAdminUpsert', 'officeRotatePin', 'officeDisable', 'officeRetentionList', 'health']) {
      await assert.rejects(api.call(action, { sessionToken: 'session-test' }), (error) => error.code === 'bad-request' && error.retryable === false);
    }
  });
  assert.equal(fetchCalls, 0);
});

test('허용하는 공개 action 집합은 로그인과 일곱 개 세션 action으로 한정한다', async () => {
  const expected = ['officeLogin', 'officeList', 'officeGet', 'officeCreate', 'officeUpdate', 'officeCancel', 'officeUpload', 'officePhoto'];
  const postedActions = [];
  await withFetch(async (url, options) => {
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    postedActions.push(JSON.parse(options.body).action);
    return jsonResponse({ ok: true });
  }, async () => {
    for (const action of expected) await api.call(action, action === 'officePhoto'
      ? { sessionToken: 'session-test', payload: { requestId: 'req-1', photoId: 'public-photo' } }
      : action === 'officeCreate'
        ? { sessionToken: 'session-test', payload: createPayload() }
        : { sessionToken: 'session-test' });
    await assert.rejects(api.call('officeUnexpected'), (error) => error.code === 'bad-request');
  });
  assert.deepEqual(postedActions, expected);
});

test('officeCreate는 정확한 expectedUploadIds 선언과 payload allowlist만 전송한다', async () => {
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const posted = [];
  await withFetch(async (url, options) => {
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    posted.push(JSON.parse(options.body));
    return jsonResponse({ ok: true, requestId: 'req-1', receiptNo: 'MM-1', status: 'pending_review', createdAt: '2026-08-27T00:00:00.000Z' });
  }, async () => api.call('officeCreate', { sessionToken: 'session-test', payload: createPayload(ids) }));
  assert.deepEqual(posted[0].payload.expectedUploadIds, ids);
  assert.deepEqual(Object.keys(posted[0].payload).sort(), ['description', 'expectedUploadIds', 'idempotencyKey', 'issueType', 'location', 'officeContact', 'pipeType', 'preferredVisitDate', 'privacyConsent', 'residentContact', 'unit', 'urgency']);
});

test('officeCreate는 누락·추가·중복·비정규 expectedUploadIds를 네트워크 전에 거절한다', async () => {
  let fetchCalls = 0;
  await withFetch(async () => { fetchCalls += 1; return jsonResponse({ ok: true }); }, async () => {
    const valid = createPayload();
    const { expectedUploadIds: _removed, ...missing } = valid;
    for (const payload of [
      missing,
      { ...valid, unexpected: true },
      createPayload(['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111']),
      createPayload(['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']),
      createPayload(Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)),
    ]) await assert.rejects(api.call('officeCreate', { sessionToken: 'session-test', payload }), (error) => error.code === 'bad-request');
  });
  assert.equal(fetchCalls, 0);
});

test('officePhoto는 세션과 정확히 requestId 및 photoId만 전송한다', async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    calls.push(JSON.parse(options.body));
    return jsonResponse({ ok: true, photoId: 'public-photo', mimeType: 'image/png', dataB64: 'iVBORw0KGgo=' });
  }, async () => {
    await api.call('officePhoto', { sessionToken: 'session-test', payload: { requestId: 'req-1', photoId: 'public-photo' } });
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    action: 'officePhoto',
    sessionToken: 'session-test',
    payload: { requestId: 'req-1', photoId: 'public-photo' },
    ts: calls[0].ts,
  });
  assert.equal(typeof calls[0].ts, 'number');
});

test('officePhoto는 세션 또는 정확한 두 payload 키가 없으면 전송 전에 거절한다', async () => {
  let fetchCalls = 0;
  await withFetch(async () => { fetchCalls += 1; return jsonResponse({ ok: true }); }, async () => {
    for (const options of [
      { payload: { requestId: 'req-1', photoId: 'public-photo' } },
      { sessionToken: 'session-test', payload: { requestId: 'req-1' } },
      { sessionToken: 'session-test', payload: { requestId: 'req-1', photoId: 'public-photo', other: 'nope' } },
    ]) await assert.rejects(api.call('officePhoto', options), (error) => error.code === 'bad-request');
  });
  assert.equal(fetchCalls, 0);
});

test('로그인과 인증 action 본문은 공개 계약의 정확한 키만 보낸다', async () => {
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url, options });
    if (url === 'office-api.json') return jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' });
    return jsonResponse({ ok: true });
  }, async () => {
    await api.call('officeLogin', { sessionToken: 'session-test', payload: { slug: 'sample-apt', pin: '123456' } });
    await api.call('officeGet', { sessionToken: 'session-test', payload: { requestId: 'req-1' } });
  });
  const login = JSON.parse(calls[1].options.body);
  const authenticated = JSON.parse(calls[3].options.body);
  assert.deepEqual(Object.keys(login).sort(), ['action', 'payload', 'ts']);
  assert.deepEqual(Object.keys(authenticated).sort(), ['action', 'payload', 'sessionToken', 'ts']);
  assert.equal('token' in login, false);
  assert.equal('APP_TOKEN' in login, false);
  assert.equal('token' in authenticated, false);
  assert.equal('APP_TOKEN' in authenticated, false);
  assert.equal('sessionToken' in login, false);
  assert.equal(authenticated.sessionToken, 'session-test');
});

test('프로토타입 오류코드는 서버 오류로 안전하게 축소한다', async () => {
  for (const errorCode of ['constructor', 'toString', '__proto__']) {
    await withFetch(async (url) => url === 'office-api.json'
      ? jsonResponse({ enabled: true, apiUrl: 'https://script.google.com/macros/s/example-deployment/exec' })
      : jsonResponse({ ok: false, error: errorCode, message: 'session-test must not escape' }), async () => {
      await assert.rejects(api.call('officeList', { sessionToken: 'session-test' }), (error) => {
        assert.equal(error.code, 'server-error');
        assert.equal(error.message, '서버 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        assert.equal(String(error).includes('session-test'), false);
        return true;
      });
    });
  }
});
