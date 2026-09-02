'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'lead-transport.js'),
  'utf8'
);

const LEGACY_KEY = 'manmul_inquiries';
const FIXTURE_URL = 'https://fixture.invalid/lead';
const FIXTURE_PAYLOAD = Object.freeze({ kind: 'synthetic-fixture' });

function response(status, body, textImpl) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: textImpl || (async () => body)
  };
}

function makeAbortError() {
  const error = new Error('synthetic abort');
  error.name = 'AbortError';
  return error;
}

function loadLead(options) {
  const opts = options || {};
  const storage = opts.storage || new Map();
  const sessionStorageData = new Map();
  const storageCalls = [];
  const persistenceCalls = [];
  const urlCalls = [];
  const consoleCalls = [];
  const copyCalls = [];
  const execCalls = [];
  let cleanupAttempts = 0;

  const localStorage = {
    getItem(key) {
      storageCalls.push(['getItem', key]);
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storageCalls.push(['setItem', key]);
      storage.set(key, String(value));
    },
    removeItem(key) {
      cleanupAttempts += 1;
      storageCalls.push(['removeItem', key]);
      if (opts.removeThrows ||
          (Number.isInteger(opts.removeThrowsCount) && cleanupAttempts <= opts.removeThrowsCount)) {
        throw new Error('synthetic remove blocked');
      }
      storage.delete(key);
    }
  };

  const sessionStorage = {
    getItem(key) {
      persistenceCalls.push(['sessionStorage.getItem', key]);
      return sessionStorageData.has(key) ? sessionStorageData.get(key) : null;
    },
    setItem(key, value) {
      persistenceCalls.push(['sessionStorage.setItem', key]);
      sessionStorageData.set(key, String(value));
    },
    removeItem(key) {
      persistenceCalls.push(['sessionStorage.removeItem', key]);
      sessionStorageData.delete(key);
    }
  };
  const indexedDB = {
    open(...args) {
      persistenceCalls.push(['indexedDB.open', ...args]);
      return {};
    },
    deleteDatabase(...args) {
      persistenceCalls.push(['indexedDB.deleteDatabase', ...args]);
      return {};
    }
  };
  const caches = {
    async open(...args) {
      persistenceCalls.push(['caches.open', ...args]);
      return {
        async put(...putArgs) {
          persistenceCalls.push(['cache.put', ...putArgs]);
        }
      };
    },
    async delete(...args) {
      persistenceCalls.push(['caches.delete', ...args]);
      return false;
    }
  };
  const location = {};
  for (const property of ['href', 'hash', 'search']) {
    Object.defineProperty(location, property, {
      configurable: true,
      get() { return ''; },
      set(value) { urlCalls.push(['location.' + property, String(value)]); }
    });
  }
  const history = {
    pushState(...args) { urlCalls.push(['history.pushState', ...args]); },
    replaceState(...args) { urlCalls.push(['history.replaceState', ...args]); }
  };
  function TrackedURL(...args) {
    urlCalls.push(['URL', ...args]);
    return new URL(...args);
  }
  TrackedURL.createObjectURL = value => {
    urlCalls.push(['URL.createObjectURL', value]);
    return 'blob:synthetic';
  };

  const recordConsole = level => (...args) => consoleCalls.push([level, ...args]);
  const context = {
    console: {
      log: recordConsole('log'),
      info: recordConsole('info'),
      warn: recordConsole('warn'),
      error: recordConsole('error')
    },
    AbortController,
    setTimeout: opts.setTimeout || setTimeout,
    clearTimeout: opts.clearTimeout || clearTimeout,
    fetch: opts.fetch || (async () => response(500, '{}')),
    localStorage,
    sessionStorage,
    indexedDB,
    caches,
    location,
    history,
    URL: TrackedURL,
    navigator: {
      clipboard: {
        writeText(value) {
          copyCalls.push(String(value));
          // 권한 거부·구형 iOS 처럼 클립보드가 막힌 브라우저를 흉내 낸다
          return opts.clipboardRejects
            ? Promise.reject(new Error('synthetic clipboard denied'))
            : Promise.resolve();
        }
      }
    },
    document: {
      body: { appendChild() {}, removeChild() {} },
      createElement() {
        return { style: {}, focus() {}, select() {}, value: '' };
      },
      execCommand(command) {
        execCalls.push(command);
        return false;
      }
    }
  };
  Object.defineProperty(context, 'location', {
    configurable: true,
    get() { return location; },
    set(value) { urlCalls.push(['window.location', String(value)]); }
  });
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'lead-transport.js' });
  return {
    lead: context.ManmulLead,
    storage,
    storageCalls,
    persistenceCalls,
    urlCalls,
    consoleCalls,
    copyCalls,
    execCalls
  };
}

function n8nConfig() {
  return {
    n8n: {
      enabled: true,
      inquiryWebhookUrl: FIXTURE_URL
    }
  };
}

function formsConfig(provider) {
  return {
    forms: {
      enabled: true,
      provider,
      endpoint: FIXTURE_URL,
      accessKey: 'synthetic-access-key'
    }
  };
}

async function assertNotAccepted(promise) {
  let rejected = false;
  let value;
  try {
    value = await promise;
  } catch (_) {
    rejected = true;
  }
  if (!rejected) assert.equal(value, false, '실패 응답을 성공으로 처리하면 안 된다');
}

async function captureUnhandled(work) {
  const errors = [];
  const onUnhandled = error => errors.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    await work();
    await new Promise(resolve => setTimeout(resolve, 35));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(errors, []);
}

test('모듈 초기화는 legacy 문의 key만 한 번 제거하고 다른 key를 보존한다', () => {
  const storage = new Map([
    [LEGACY_KEY, 'legacy-private-fixture'],
    ['keep', 'safe-fixture']
  ]);

  const loaded = loadLead({ storage });

  assert.equal(storage.has(LEGACY_KEY), false);
  assert.equal(storage.get('keep'), 'safe-fixture');
  assert.deepEqual(
    loaded.storageCalls.filter(call => call[1] === LEGACY_KEY),
    [['removeItem', LEGACY_KEY]]
  );
  assert.equal(loaded.storageCalls.some(call => call[0] === 'getItem'), false);
  assert.equal(loaded.storageCalls.some(call => call[0] === 'setItem'), false);
});

test('legacy 제거 예외는 로드를 막지 않고 같은 초기화에서 읽기·쓰기·복사·로그·재시도하지 않는다', async () => {
  const storage = new Map([[LEGACY_KEY, 'legacy-private-fixture']]);
  const loaded = loadLead({ storage, removeThrows: true });

  assert.equal(typeof loaded.lead.deliver, 'function');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(loaded.storageCalls, [['removeItem', LEGACY_KEY]]);
  assert.deepEqual(loaded.copyCalls, []);
  assert.deepEqual(loaded.execCalls, []);
  assert.deepEqual(loaded.consoleCalls, []);
  assert.equal(storage.get(LEGACY_KEY), 'legacy-private-fixture');
});

test('legacy 제거 실패 뒤 새 모듈 초기화는 정리를 다시 한 번 시도한다', () => {
  const storage = new Map([[LEGACY_KEY, 'legacy-private-fixture']]);
  const first = loadLead({ storage, removeThrows: true });
  const second = loadLead({ storage });

  assert.deepEqual(first.storageCalls, [['removeItem', LEGACY_KEY]]);
  assert.deepEqual(second.storageCalls, [['removeItem', LEGACY_KEY]]);
  assert.equal(storage.has(LEGACY_KEY), false);
});

test('공개 API는 legacy key나 영구 보관 helper를 노출하지 않는다', () => {
  const { lead } = loadLead();
  assert.deepEqual(
    Object.keys(lead).sort(),
    [
      'backendConfigured', 'buildLeadText', 'clearFailure', 'copyToClipboard',
      'deliver', 'fetchWithTimeout', 'loadConfig', 'rememberFailure', 'retryLatest'
    ].sort()
  );
  for (const property of ['STORAGE_KEY', 'RETENTION_DAYS', 'pruneExpired', 'saveLocal', 'LEGACY_STORAGE_KEY']) {
    assert.equal(Object.hasOwn(lead, property), false, property);
  }
});

test('신뢰된 공개 누수 사례는 n8n 원문과 Web3Forms 메시지에 같은 제목과 slug로 전달된다', async () => {
  const referenceCase = {
    slug: 'apartment-upper-lower-rain-pipe-repair',
    title: '대전 아파트 상·하층 우수관 보수 — 배수구 테두리와 관통부 마감'
  };
  const payload = {
    type: '누수', name: 'SAFE_NAME', phone: '01012345678', referenceCase
  };

  const n8nRequests = [];
  const n8n = loadLead({
    fetch: async (url, options) => {
      n8nRequests.push(JSON.parse(options.body));
      return response(200, '{"ok":true}');
    }
  });
  assert.equal(await n8n.lead.deliver(n8nConfig(), payload), true);
  assert.deepEqual(n8nRequests, [payload]);

  const formRequests = [];
  const forms = loadLead({
    fetch: async (url, options) => {
      formRequests.push(JSON.parse(options.body));
      return response(200, '{"success":true}');
    }
  });
  assert.equal(await forms.lead.deliver(formsConfig('web3forms'), payload), true);
  assert.match(formRequests[0].message, new RegExp(referenceCase.title));
  assert.match(formRequests[0].message, new RegExp(referenceCase.slug));
  assert.deepEqual(formRequests[0].referenceCase, referenceCase);
});

test('공개 전환 메타데이터와 문자열 사례는 n8n 원문과 Web3Forms 본문에 모두 보존된다', async () => {
  const payload = {
    source: 'leak-page',
    sourcePage: '/leak.html',
    ctaId: 'leak-inquiry-submit',
    inquiryPurpose: 'paid-device-diagnosis',
    preferredVisitDate: '2026-09-15',
    preferredVisitWindow: 'afternoon',
    bookingStatus: 'inquiry-only',
    utmSource: 'naver',
    utmMedium: 'organic',
    utmCampaign: 'rainy-2026',
    referenceCase: 'apartment-upper-lower-rain-pipe-repair'
  };

  let n8nRequest;
  const n8n = loadLead({
    fetch: async (url, options) => {
      n8nRequest = JSON.parse(options.body);
      return response(200, '{"ok":true}');
    }
  });
  assert.equal(await n8n.lead.deliver(n8nConfig(), payload), true);
  assert.deepEqual(n8nRequest, payload);

  let formsRequest;
  const forms = loadLead({
    fetch: async (url, options) => {
      formsRequest = JSON.parse(options.body);
      return response(200, '{"success":true}');
    }
  });
  assert.equal(await forms.lead.deliver(formsConfig('web3forms'), payload), true);
  for (const [key, value] of Object.entries(payload)) assert.deepEqual(formsRequest[key], value, key);
  assert.match(formsRequest.message, /접수 경로: leak-page/);
  assert.match(formsRequest.message, /유입 페이지: \/leak\.html/);
  assert.match(formsRequest.message, /신청 진입점: leak-inquiry-submit/);
  assert.match(formsRequest.message, /신청 목적: 유상 장비진단·방문 일정 상담/);
  assert.match(formsRequest.message, /희망 일정: 2026-09-15 · 오후/);
  assert.match(formsRequest.message, /예약 상태: inquiry-only/);
  assert.match(formsRequest.message, /UTM Source: naver/);
  assert.match(formsRequest.message, /UTM Medium: organic/);
  assert.match(formsRequest.message, /UTM Campaign: rainy-2026/);
  assert.match(formsRequest.message, /참고 사례: apartment-upper-lower-rain-pipe-repair/);
});

test('관리사무소 파일럿 필드는 전송 원문을 바꾸지 않고 Web3Forms 본문에 업무 표시명으로 보존된다', async () => {
  const payload = {
    source: 'office-pilot',
    complexName: 'SAFE_COMPLEX',
    officeContactName: 'SAFE_CONTACT',
    region: 'SAFE_REGION',
    pilotInterest: ['leak-piping', 'common-repair', 'preventive-inspection', 'other'],
    desiredStart: 'SAFE_START',
    memo: 'SAFE_INQUIRY'
  };

  let n8nRequest;
  let n8nBody;
  const n8n = loadLead({
    fetch: async (url, options) => {
      n8nBody = options.body;
      n8nRequest = JSON.parse(options.body);
      return response(200, '{"ok":true}');
    }
  });
  assert.equal(await n8n.lead.deliver(n8nConfig(), payload), true);
  assert.equal(n8nBody, JSON.stringify(payload));
  assert.deepEqual(n8nRequest, payload);

  let formsRequest;
  const forms = loadLead({
    fetch: async (url, options) => {
      formsRequest = JSON.parse(options.body);
      return response(200, '{"success":true}');
    }
  });
  assert.equal(await forms.lead.deliver(formsConfig('web3forms'), payload), true);
  for (const [key, value] of Object.entries(payload)) assert.deepEqual(formsRequest[key], value, key);
  assert.match(formsRequest.message, /단지명: SAFE_COMPLEX/);
  assert.match(formsRequest.message, /관리사무소 담당자: SAFE_CONTACT/);
  assert.match(formsRequest.message, /지역: SAFE_REGION/);
  assert.match(formsRequest.message, /관심 업무: 누수·배관, 공용부 보수, 예방점검, 기타/);
  assert.match(formsRequest.message, /도입 희망 시점: SAFE_START/);
  assert.match(formsRequest.message, /문의 내용: SAFE_INQUIRY/);
  assert.doesNotMatch(formsRequest.message, /메모: SAFE_INQUIRY/);
  assert.doesNotMatch(formsRequest.message, /leak-piping|common-repair|preventive-inspection/);
});

test('누수 상담 목적과 희망 시간대의 사람용 표시명을 모두 보존한다', () => {
  const { lead } = loadLead();
  const purposeCases = [
    ['phone-consult', '전화로 증상 상담'],
    ['paid-device-diagnosis', '유상 장비진단·방문 일정 상담']
  ];
  for (const [value, label] of purposeCases) {
    assert.match(lead.buildLeadText({ inquiryPurpose: value }), new RegExp('신청 목적: ' + label));
  }
  const windowCases = [
    ['morning', '오전'],
    ['afternoon', '오후'],
    ['any', '시간 협의']
  ];
  for (const [value, label] of windowCases) {
    assert.match(
      lead.buildLeadText({ preferredVisitDate: '2026-09-15', preferredVisitWindow: value }),
      new RegExp('희망 일정: 2026-09-15 · ' + label)
    );
  }
});

test('개인정보 동의는 privacyConsent boolean을 사람이 읽는 메일 문구로 보존한다', () => {
  const { lead } = loadLead();
  assert.match(lead.buildLeadText({ privacyConsent: true }), /개인정보 수집·이용 동의: 동의/);
  assert.match(lead.buildLeadText({ privacyConsent: false }), /개인정보 수집·이용 동의: 미동의/);
  assert.doesNotMatch(lead.buildLeadText({ consent: true }), /개인정보 수집·이용 동의:/,
    'transport가 정규화되지 않은 consent 키를 암묵적으로 추론하면 안 된다');
});

test('HTTP 500은 성공 JSON이어도 제출 성공이 아니다', async () => {
  for (const config of [n8nConfig(), formsConfig('web3forms')]) {
    const loaded = loadLead({ fetch: async () => response(500, '{"success":true,"ok":true}') });
    await assertNotAccepted(loaded.lead.deliver(config, FIXTURE_PAYLOAD));
  }
});

test('rejected fetch, synchronous fetch throw, AbortError는 제출 성공이 아니다', async () => {
  const failures = [
    () => Promise.reject(new Error('synthetic network rejection')),
    () => { throw new Error('synthetic synchronous fetch throw'); },
    () => Promise.reject(makeAbortError())
  ];
  for (const fetchImpl of failures) {
    const loaded = loadLead({ fetch: fetchImpl });
    await assertNotAccepted(loaded.lead.deliver(n8nConfig(), FIXTURE_PAYLOAD));
  }
});

test('빈 본문, malformed JSON, array, null, 명시적 false는 제출 성공이 아니다', async () => {
  const bodies = [
    '',
    '<not-json>',
    '[]',
    'null',
    '{}',
    '{"ok":false,"success":false}'
  ];
  for (const body of bodies) {
    const loaded = loadLead({ fetch: async () => response(200, body) });
    await assertNotAccepted(loaded.lead.deliver(n8nConfig(), FIXTURE_PAYLOAD));
  }
});

test('Web3Forms는 HTTP 2xx와 object success true가 모두 필요하다', async () => {
  for (const body of ['{"ok":true}', '{"success":false}', '{}']) {
    const loaded = loadLead({ fetch: async () => response(200, body) });
    await assertNotAccepted(loaded.lead.deliver(formsConfig('web3forms'), FIXTURE_PAYLOAD));
  }

  const accepted = loadLead({ fetch: async () => response(204, '{"success":true}') });
  assert.equal(await accepted.lead.deliver(formsConfig('web3forms'), FIXTURE_PAYLOAD), true);
});

test('n8n은 HTTP 2xx object의 ok true 또는 success true를 각각 허용한다', async () => {
  for (const body of ['{"ok":true}', '{"success":true}']) {
    const loaded = loadLead({ fetch: async () => response(200, body) });
    assert.equal(await loaded.lead.deliver(n8nConfig(), FIXTURE_PAYLOAD), true);
  }

  const refused = loadLead({ fetch: async () => response(200, '{"ok":false,"success":false}') });
  await assertNotAccepted(refused.lead.deliver(n8nConfig(), FIXTURE_PAYLOAD));
});

test('generic과 formspree는 HTTP 2xx object의 ok true 또는 success true를 각각 허용한다', async () => {
  for (const provider of ['generic', 'formspree']) {
    for (const body of ['{"ok":true}', '{"success":true}']) {
      const loaded = loadLead({ fetch: async () => response(200, body) });
      assert.equal(loaded.lead.backendConfigured(formsConfig(provider)), true);
      assert.equal(await loaded.lead.deliver(formsConfig(provider), FIXTURE_PAYLOAD), true);
    }
    const refused = loadLead({
      fetch: async () => response(200, '{"ok":false,"success":false}')
    });
    await assertNotAccepted(refused.lead.deliver(formsConfig(provider), FIXTURE_PAYLOAD));
  }
});

test('빈 provider와 unknown provider는 구성되지 않았으며 성공 응답도 fail closed다', async () => {
  for (const provider of ['', 'unknown-service']) {
    let fetchCalls = 0;
    const loaded = loadLead({
      fetch: async () => {
        fetchCalls += 1;
        return response(200, '{"ok":true,"success":true}');
      }
    });
    const config = formsConfig(provider);
    assert.equal(loaded.lead.backendConfigured(config), false);
    await assertNotAccepted(loaded.lead.deliver(config, FIXTURE_PAYLOAD));
    assert.equal(fetchCalls, 0);
  }
});

test('n8n이 구성되면 forms보다 우선해 n8n 계약만 적용한다', async () => {
  const requested = [];
  const loaded = loadLead({
    fetch: async url => {
      requested.push(url);
      return response(200, '{"success":true}');
    }
  });
  const config = {
    n8n: { enabled: true, inquiryWebhookUrl: 'https://fixture.invalid/n8n' },
    forms: { enabled: true, provider: 'web3forms', endpoint: 'https://fixture.invalid/forms' }
  };

  assert.equal(await loaded.lead.deliver(config, FIXTURE_PAYLOAD), true);
  assert.deepEqual(requested, ['https://fixture.invalid/n8n']);
});

test('fetchWithTimeout은 동기 fetch throw와 동기 response.text throw를 Promise rejection으로 만든다', async () => {
  const syncFetch = loadLead({ fetch: () => { throw new Error('synthetic fetch throw'); } });
  await assert.rejects(
    syncFetch.lead.fetchWithTimeout(FIXTURE_URL, {}, 25),
    /synthetic fetch throw/
  );

  const syncText = loadLead({
    fetch: async () => response(200, '', () => { throw new Error('synthetic text throw'); })
  });
  await assert.rejects(
    syncText.lead.fetchWithTimeout(FIXTURE_URL, {}, 25),
    /synthetic text throw/
  );
});

test('fetch Promise가 deadline 뒤 늦게 끝나도 request-timeout 결과와 unhandled 상태는 바뀌지 않는다', async () => {
  await captureUnhandled(async () => {
    const loaded = loadLead({
      fetch: () => new Promise(resolve => {
        setTimeout(() => resolve(response(200, '{"ok":true}')), 25);
      })
    });
    const pending = loaded.lead.fetchWithTimeout(FIXTURE_URL, {}, 8);
    await assert.rejects(pending, error => error && error.message === 'request-timeout');
    await new Promise(resolve => setTimeout(resolve, 35));
    await assert.rejects(pending, error => error && error.message === 'request-timeout');
  });
});

test('response.text가 deadline 뒤 늦게 끝나도 같은 request-timeout 결과와 unhandled 상태는 바뀌지 않는다', async () => {
  await captureUnhandled(async () => {
    const loaded = loadLead({
      fetch: async () => response(200, '', () => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('synthetic late body rejection')), 25);
      }))
    });
    const pending = loaded.lead.fetchWithTimeout(FIXTURE_URL, {}, 8);
    await assert.rejects(pending, error => error && error.message === 'request-timeout');
    await new Promise(resolve => setTimeout(resolve, 35));
    await assert.rejects(pending, error => error && error.message === 'request-timeout');
  });
});

test('겹친 retryLatest 호출은 같은 Promise를 반환하고 전송은 한 번만 한다', async () => {
  let releaseFetch;
  let fetchCalls = 0;
  const loaded = loadLead({
    fetch: () => {
      fetchCalls += 1;
      return new Promise(resolve => {
        releaseFetch = () => resolve(response(200, '{"ok":true}'));
      });
    }
  });
  const generation = loaded.lead.rememberFailure({ kind: 'single-flight-fixture' });

  const first = loaded.lead.retryLatest(n8nConfig());
  const second = loaded.lead.retryLatest(n8nConfig());

  const samePromise = first === second;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchCalls, 1);
  releaseFetch();
  const result = await first;
  assert.equal(samePromise, true);
  assert.equal(result.status, 'sent');
  assert.equal(result.generation, generation);
});

test('현재 세대 재전송 성공은 sent 후 비우고 다음 재전송은 empty다', async () => {
  const loaded = loadLead({
    fetch: async () => response(200, '{"success":true}')
  });
  const generation = loaded.lead.rememberFailure({ kind: 'current-success-fixture' });

  const sent = await loaded.lead.retryLatest(n8nConfig());
  const empty = await loaded.lead.retryLatest(n8nConfig());

  assert.equal(sent.status, 'sent');
  assert.equal(sent.generation, generation);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.generation, 0);
});

test('실패와 미구성 재전송은 같은 세대를 보존해 다시 시도할 수 있다', async () => {
  let fetchCalls = 0;
  const loaded = loadLead({
    fetch: async () => {
      fetchCalls += 1;
      throw new Error('synthetic retry rejection');
    }
  });
  const generation = loaded.lead.rememberFailure({ kind: 'preserved-fixture' });

  const failed = await loaded.lead.retryLatest(n8nConfig());
  const unavailable = await loaded.lead.retryLatest({});

  assert.equal(failed.status, 'failed');
  assert.equal(failed.generation, generation);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.generation, generation);
  assert.equal(fetchCalls, 1);
});

test('이전 세대의 늦은 성공은 stale이며 새 실패를 지우지 않고 다음 시도는 새 복제본만 보낸다', async () => {
  const requests = [];
  let releaseOld;
  const loaded = loadLead({
    fetch: (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (requests.length === 1) {
        return new Promise(resolve => {
          releaseOld = () => resolve(response(200, '{"ok":true}'));
        });
      }
      return Promise.resolve(response(200, '{"ok":true}'));
    }
  });
  const oldGeneration = loaded.lead.rememberFailure({ kind: 'old-fixture' });
  const oldAttempt = loaded.lead.retryLatest(n8nConfig());
  await new Promise(resolve => setImmediate(resolve));

  const newPayload = { kind: 'new-fixture', nested: { stage: 'captured' } };
  const newGeneration = loaded.lead.rememberFailure(newPayload);
  newPayload.nested.stage = 'mutated-after-remember';
  releaseOld();

  const stale = await oldAttempt;
  assert.equal(stale.status, 'stale');
  assert.equal(stale.generation, oldGeneration);

  const sent = await loaded.lead.retryLatest(n8nConfig());
  assert.equal(sent.status, 'sent');
  assert.equal(sent.generation, newGeneration);
  assert.deepEqual(requests.map(request => request.body), [
    { kind: 'old-fixture' },
    { kind: 'new-fixture', nested: { stage: 'captured' } }
  ]);
});

test('clearFailure는 현재의 정확한 양수 세대만 지울 수 있다', async () => {
  const loaded = loadLead();
  const oldGeneration = loaded.lead.rememberFailure({ kind: 'old-clear-fixture' });
  const currentGeneration = loaded.lead.rememberFailure({ kind: 'current-clear-fixture' });

  assert.equal(loaded.lead.clearFailure(), false);
  assert.equal(loaded.lead.clearFailure(0), false);
  assert.equal(loaded.lead.clearFailure(oldGeneration), false);
  assert.equal(loaded.lead.clearFailure(currentGeneration + 1), false);
  const preserved = await loaded.lead.retryLatest({});
  assert.equal(preserved.status, 'unavailable');
  assert.equal(preserved.generation, currentGeneration);

  assert.equal(loaded.lead.clearFailure(currentGeneration), true);
  assert.equal(loaded.lead.clearFailure(currentGeneration), false);
  const empty = await loaded.lead.retryLatest({});
  assert.equal(empty.status, 'empty');
  assert.equal(empty.generation, 0);
});

test('rememberFailure 뒤 원본을 바꿔도 재전송 본문은 저장 당시 복제본이다', async () => {
  let sentBody;
  const loaded = loadLead({
    fetch: async (url, options) => {
      sentBody = JSON.parse(options.body);
      return response(200, '{"ok":true}');
    }
  });
  const original = {
    kind: 'clone-fixture',
    nested: { state: 'original' },
    items: ['first']
  };
  loaded.lead.rememberFailure(original);
  original.nested.state = 'mutated';
  original.items.push('second');

  const result = await loaded.lead.retryLatest(n8nConfig());

  assert.equal(result.status, 'sent');
  assert.deepEqual(sentBody, {
    kind: 'clone-fixture',
    nested: { state: 'original' },
    items: ['first']
  });
});

test('재전송 timeout 뒤 늦은 수락 응답은 failed 결과나 보존된 세대를 바꾸지 않는다', async () => {
  let releaseBody;
  const loaded = loadLead({
    setTimeout(callback, delay, ...args) {
      return setTimeout(callback, delay === 12000 ? 8 : delay, ...args);
    },
    fetch: async () => response(200, '', () => new Promise(resolve => {
      releaseBody = () => resolve('{"ok":true}');
    }))
  });
  const generation = loaded.lead.rememberFailure({ kind: 'late-timeout-fixture' });

  const pending = loaded.lead.retryLatest(n8nConfig());
  await new Promise(resolve => setImmediate(resolve));
  const failed = await pending;
  assert.equal(failed.status, 'failed');
  assert.equal(failed.generation, generation);

  releaseBody();
  await new Promise(resolve => setTimeout(resolve, 25));
  const sameResult = await pending;
  assert.equal(sameResult.status, 'failed');
  assert.equal(sameResult.generation, generation);

  const preserved = await loaded.lead.retryLatest({});
  assert.equal(preserved.status, 'unavailable');
  assert.equal(preserved.generation, generation);
});

test('메모리 실패 등록·조회·삭제는 영구 저장소·캐시·URL·console sink를 사용하지 않는다', async () => {
  const loaded = loadLead();
  const storageCallsBefore = loaded.storageCalls.slice();
  const persistenceCallsBefore = loaded.persistenceCalls.slice();
  const urlCallsBefore = loaded.urlCalls.slice();
  const consoleCallsBefore = loaded.consoleCalls.slice();

  const generation = loaded.lead.rememberFailure({ kind: 'sink-fixture' });
  const unavailable = await loaded.lead.retryLatest({});
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.generation, generation);
  assert.equal(loaded.lead.clearFailure(generation), true);

  assert.deepEqual(loaded.storageCalls, storageCallsBefore);
  assert.deepEqual(loaded.persistenceCalls, persistenceCallsBefore);
  assert.deepEqual(loaded.urlCalls, urlCallsBefore);
  assert.deepEqual(loaded.consoleCalls, consoleCallsBefore);
});

/* ---- 설정 로더 -----------------------------------------------------------
   config.json 요청이 한 번 실패하면 backendConfigured() 가 false 가 되어,
   접수 경로는 멀쩡한데 손님 화면이 "이 업체는 온라인 접수를 안 받는다"처럼
   말했다(다시 시도 버튼도 안 나온다). 한 번 더 시도하고, 그래도 못 읽으면
   '못 읽었다'는 사실을 표시로 남겨 화면이 사실대로 말할 수 있게 한다. */
function configLoader(responses) {
  const calls = [];
  const queue = responses.slice();
  const loaded = loadLead({
    fetch: async (url, init) => {
      calls.push(url);
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (typeof next === 'function') return next();
      return next;
    }
  });
  return { lead: loaded.lead, calls };
}
const okConfig = (body) => response(200, body, async () => body);
const boom = () => { throw new Error('synthetic config network failure'); };
// VM 안에서 만들어진 객체는 프로토타입이 이쪽 realm 과 달라 deepEqual 이 모양이
// 같아도 실패한다. 모양만 보려고 JSON 으로 견준다.
const shape = (value) => JSON.stringify(value);

test('설정을 읽으면 그대로 돌려주고 실패 표시를 붙이지 않는다', async () => {
  const { lead, calls } = configLoader([okConfig('{"forms":{"enabled":true}}')]);
  const config = await lead.loadConfig({ retryDelayMs: 0 });
  assert.equal(shape(config), shape({ forms: { enabled: true } }));
  assert.equal(Object.hasOwn(config, 'configLoadFailed'), false);
  assert.equal(calls.length, 1, '성공했는데 요청을 더 보냈다');
});

test('첫 요청이 실패해도 한 번 더 시도해 살려낸다', async () => {
  for (const firstFailure of [boom, () => response(500, 'nope'), () => response(200, 'not json', async () => { throw new Error('bad json'); })]) {
    const { lead, calls } = configLoader([firstFailure, okConfig('{"n8n":{"enabled":true}}')]);
    const config = await lead.loadConfig({ retryDelayMs: 0 });
    assert.equal(shape(config), shape({ n8n: { enabled: true } }), '재시도가 살려내지 못했다');
    assert.equal(calls.length, 2, `요청을 ${calls.length}번 보냈다 — 실패 뒤 정확히 한 번 더여야 한다`);
  }
});

test('계속 실패하면 빈 설정이 아니라 못 읽었다는 표시를 돌려준다', async () => {
  const { lead, calls } = configLoader([boom]);
  const config = await lead.loadConfig({ retryDelayMs: 0 });
  assert.equal(shape(config), shape({ configLoadFailed: true }),
    "조용히 빈 설정을 주면 '설정을 못 읽음'과 '접수 경로가 없음'을 화면이 구분할 수 없다");
  assert.equal(calls.length, 2, `요청을 ${calls.length}번 보냈다 — 두 번은 시도해야 한다`);
  assert.equal(lead.backendConfigured(config), false, '못 읽은 설정으로 접수 경로가 있다고 판단한다');
});

test('설정으로 쓸 수 없는 응답(배열·문자열·null)도 못 읽은 것으로 본다', async () => {
  for (const body of ['[1,2,3]', '"문자열"', 'null']) {
    const { lead } = configLoader([okConfig(body)]);
    assert.equal(shape(await lead.loadConfig({ retryDelayMs: 0 })), shape({ configLoadFailed: true }),
      `${body} 를 설정으로 받아들였다`);
  }
});

test('복사 결과를 boolean 으로 돌려준다 — 두 폼이 이 값으로 분기한다', async () => {
  const { lead } = configLoader([okConfig('{}')]);
  assert.equal(await lead.copyToClipboard('보낼 내용'), true,
    '복사에 성공했는데 true 가 아니다 — 화면이 성공을 알릴 근거가 없다');
});

test('클립보드가 막히면 대체 복사를 거쳐 false 를 돌려준다', async () => {
  // 실패를 true 로 보고하면 화면이 '복사했습니다'를 띄우고, 손님은 빈 카톡을
  // 보내고 회신을 기다린다 — 리드가 통째로 증발한다.
  const { lead, execCalls } = loadLead({ clipboardRejects: true });
  assert.equal(await lead.copyToClipboard('보낼 내용'), false,
    '복사가 막혔는데 성공했다고 돌려준다');
  assert.deepEqual(execCalls, ['copy'],
    '클립보드가 막혔는데 대체 복사(execCommand)를 시도하지 않았다');
});
