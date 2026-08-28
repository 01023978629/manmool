# Manmool Failed Lead Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반 상담과 누수 상담의 전송 실패 개인정보를 영구 브라우저 저장소에 남기지 않고 현재 탭 메모리에서만 한 건 재시도하며, 기존 legacy 문의 자료를 읽지 않고 제거하고 관리자·개인정보 안내를 실제 동작과 일치시킨다.

**Architecture:** js/lead-transport.js를 제공자 응답 검증, legacy key cleanup, 최신 실패 초안 generation, single-flight retry의 유일한 소유자로 만든다. 두 폼은 이 공용 coordinator만 사용하고 성공·실패·재시도 화면을 같은 계약으로 맞춘다. admin은 transport를 먼저 로드해 cleanup을 보장하되 로컬 PII 문의함 기능은 제거하고 외부 접수 경로 상태와 콘텐츠 편집만 유지한다.

**Tech Stack:** 정적 HTML/JavaScript, Web3Forms/n8n HTTP API, Node.js node:test/VM, Playwright, GitHub Pages artifact 검사, PowerShell, Git.

**Spec:** docs/superpowers/specs/2026-08-27-reliability-privacy-three-step-design.md §7, §8, §9.3-9.4, §10, §12, §13

## Global Constraints

- 구현 저장소는 C:\Users\1dncj\Documents\New project\.worktrees\manmool-office-intake 이다.
- 기준 커밋은 설계 커밋 e4f2cca이며 계획 문서 커밋 이후 깨끗한 상태에서 시작한다.
- office-api.json, data/config.json의 실제 endpoint/accessKey/n8n enabled/forms enabled 값은 바꾸지 않는다.
- 실 문의를 보내거나 Web3Forms/n8n/Kakao/Google 계정을 변경하지 않는다.
- 고객 이름, 전화번호, 메모, 증상은 localStorage, sessionStorage, IndexedDB, Cache API, URL, console에 저장하지 않는다.
- legacy key manmul_inquiries는 js/lead-transport.js cleanup과 전용 검사에서만 문자열로 존재할 수 있다.
- cleanup은 값을 getItem, parse, render, log, copy하지 않고 removeItem만 best-effort로 실행한다.
- 첫 removeItem이 throw해도 page load를 막지 않고 다음 문서 로드 때 다시 cleanup을 시도한다.
- HTTP 2xx만으로 제출 성공 처리하지 않는다. provider별 명시적 JSON 성공값이 필요하다.
- 전화·문자·카카오 창을 연 것은 자동 접수 성공으로 표시하지 않는다.
- 실패 초안은 현재 탭 메모리의 최신 1건만 유지하고 새로고침 시 사라진다.
- 늦게 끝난 이전 요청은 최신 초안이나 최신 화면을 지우지 못한다.
- 관리자 외부 접수 경로 상태, 비파괴 설정 확인, 콘텐츠 편집 기능은 유지한다.
- 3단계 변경은 승인 설계에 따라 마지막에 하나의 개인정보 보호 커밋으로 묶는다. 중간에는 RED/GREEN 체크포인트만 남긴다.
- main push, merge, GitHub Pages 배포는 별도 승인 전 수행하지 않는다.

---

## File Structure

### Modify: Runtime

- js/lead-transport.js: legacy cleanup, hard timeout, provider 응답 검증, memory retry coordinator
- js/inquiry.js: local queue 제거, 공용 retry, safe rendering, refresh loss 안내
- js/leak-inquiry.js: 공용 retry와 일반 상담과 같은 대체 행동
- admin.html: lead-transport 선로드, local PII panel/KPI/nav/샘플 제거
- js/admin.js: legacy read/write/render/seed 제거, 외부 route와 content editor 보존
- data/config.json: _demoMode_help 문구만 변경
- privacy.html: 서버 성공 보유와 실패 초안 안내 분리

### Modify: Static Contracts and Operations Docs

- scripts/ensure-conversion-basics.mjs
- scripts/ensure-leak-inquiry.mjs
- scripts/ensure-lead-route-parity.mjs
- scripts/ensure-admin-content-editor.mjs
- integrations/INTEGRATION.md
- integrations/인수인계서.md
- .github/workflows/deploy-pages.yml

운영 문서 두 파일은 현재 localStorage fallback과 1년짜리 브라우저 문의함을 명시하므로 코드와 같은 커밋에서 바로잡는다. README.md, integrations/SETUP-n8n-kakao.md, integrations/config.example.json은 demoMode 설정값과 활성화 절차만 설명하고 브라우저 PII 저장을 약속하지 않으므로 수정하지 않는다.

### Create

- tests/lead-transport.test.cjs: cleanup, provider matrix, timeout, generation, same Promise
- tests/lead-privacy.e2e.cjs: 두 폼과 admin의 no-storage, retry, reload, XSS, 390px 흐름

### Preserve

- 외부 endpoint/accessKey와 provider 선택
- 관리자 leadRoute/renderPipeline/renderConnection
- 관리자 콘텐츠 편집
- 일반·누수 폼의 전화, 문자, 카카오, 복사 대안
- 상담 성공 뒤 서버 보유기간 안내

---

## Task 1: Legacy cleanup과 provider 응답 RED 단위 검사

**Files:**

- Create: tests/lead-transport.test.cjs
- Modify: js/lead-transport.js

- [ ] **Step 1: VM loader와 legacy cleanup RED 검사를 작성한다**

~~~js
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

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body
  };
}

function loadLead(options) {
  const opts = options || {};
  const storage = opts.storage || new Map();
  const calls = [];
  const localStorage = {
    getItem(key) {
      calls.push(['getItem', key]);
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      calls.push(['setItem', key]);
      storage.set(key, String(value));
    },
    removeItem(key) {
      calls.push(['removeItem', key]);
      if (opts.removeThrows) throw new Error('remove blocked');
      storage.delete(key);
    }
  };
  const context = {
    console: { log() {}, warn() {}, error() {} },
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: opts.fetch,
    localStorage,
    navigator: {},
    document: {
      body: { appendChild() {}, removeChild() {} },
      createElement() {
        return { style: {}, focus() {}, select() {}, value: '' };
      },
      execCommand() { return false; }
    }
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'lead-transport.js' });
  return { lead: context.ManmulLead, storage, calls };
}

test('legacy 문의 key는 읽지 않고 제거하며 다른 key는 보존한다', () => {
  const storage = new Map([
    ['manmul_inquiries', '[{"name":"홍길동"}]'],
    ['keep', 'safe']
  ]);
  const loaded = loadLead({ storage, fetch: async () => response(500, '') });
  assert.equal(storage.has('manmul_inquiries'), false);
  assert.equal(storage.get('keep'), 'safe');
  assert.deepEqual(
    loaded.calls.filter(call => call[1] === 'manmul_inquiries'),
    [['removeItem', 'manmul_inquiries']]
  );
});

test('legacy remove 실패는 모듈 로드를 막거나 값을 읽고 쓰지 않는다', () => {
  const loaded = loadLead({
    removeThrows: true,
    fetch: async () => response(500, '')
  });
  assert.equal(typeof loaded.lead.deliver, 'function');
  assert.equal(loaded.calls.some(call => call[0] === 'getItem'), false);
  assert.equal(loaded.calls.some(call => call[0] === 'setItem'), false);
});
~~~

- [ ] **Step 2: provider fail-closed RED matrix를 추가한다**

~~~js
test('Web3Forms는 HTTP 2xx와 success true가 모두 필요하다', async () => {
  const bodies = ['', '<html>', '{}', '{"success":false}', '{"ok":true}'];
  for (const body of bodies) {
    const loaded = loadLead({ fetch: async () => response(200, body) });
    await assert.rejects(
      loaded.lead.deliver({
        forms: {
          enabled: true,
          provider: 'web3forms',
          endpoint: 'https://forms.test/send'
        }
      }, { name: 'A' })
    );
  }
  const ok = loadLead({
    fetch: async () => response(200, '{"success":true}')
  });
  assert.equal(await ok.lead.deliver({
    forms: {
      enabled: true,
      provider: 'web3forms',
      endpoint: 'https://forms.test/send'
    }
  }, { name: 'A' }), true);
});

test('n8n은 HTTP 2xx와 ok true가 모두 필요하다', async () => {
  const bad = loadLead({
    fetch: async () => response(200, '{"success":true,"ok":false}')
  });
  await assert.rejects(
    bad.lead.deliver({
      n8n: {
        enabled: true,
        inquiryWebhookUrl: 'https://n8n.test/send'
      }
    }, { name: 'A' })
  );
  const good = loadLead({
    fetch: async () => response(200, '{"ok":true}')
  });
  assert.equal(await good.lead.deliver({
    n8n: {
      enabled: true,
      inquiryWebhookUrl: 'https://n8n.test/send'
    }
  }, { name: 'A' }), true);
});

test('명시한 generic provider만 ok true 또는 success true를 허용한다', async () => {
  for (const body of ['{"ok":true}', '{"success":true}']) {
    const loaded = loadLead({ fetch: async () => response(200, body) });
    assert.equal(await loaded.lead.deliver({
      forms: {
        enabled: true,
        provider: 'generic',
        endpoint: 'https://forms.test/send'
      }
    }, { name: 'A' }), true);
  }
});

test('unknown 또는 빈 provider는 fail closed다', async () => {
  for (const provider of ['', 'unknown-service']) {
    const loaded = loadLead({
      fetch: async () => response(200, '{"success":true,"ok":true}')
    });
    assert.equal(loaded.lead.backendConfigured({
      forms: {
        enabled: true,
        provider,
        endpoint: 'https://forms.test/send'
      }
    }), false);
    await assert.rejects(
      loaded.lead.deliver({
        forms: {
          enabled: true,
          provider,
          endpoint: 'https://forms.test/send'
        }
      }, { name: 'A' })
    );
  }
});
~~~

500, rejected fetch, AbortError, malformed JSON도 assert.rejects case로 추가한다.

- [ ] **Step 3: RED를 실행한다**

~~~powershell
$root = 'C:\Users\1dncj\Documents\New project\.worktrees\manmool-office-intake'
$node = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
Set-Location $root
& $node --test --test-concurrency=1 tests/lead-transport.test.cjs
if ($LASTEXITCODE -eq 0) { throw 'Expected RED but test passed' }
~~~

Expected: legacy key가 남거나 getItem이 호출되고 HTTP 200 false/empty 응답이 true가 되어 실패한다.

- [ ] **Step 4: 읽지 않는 best-effort cleanup을 모듈 첫 부분에 구현한다**

~~~js
const LEGACY_STORAGE_KEY = 'manmul_inquiries';

function removeLegacyInquiryStorage() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

removeLegacyInquiryStorage();
~~~

STORAGE_KEY, RETENTION_DAYS, pruneExpired, saveLocal export를 제거한다. LEGACY_STORAGE_KEY는 export하지 않는다.

- [ ] **Step 5: hard timeout과 JSON parser를 구현한다**

~~~js
function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timeoutMs = ms || 12000;
  let settled = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new Error('request-timeout'));
    }, timeoutMs);
    Promise.resolve(fetch(url, Object.assign({}, opts, {
      signal: controller.signal
    }))).then(value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function readJsonObject(response) {
  const text = await response.text();
  if (!text) throw new Error('empty-response');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (_) { throw new Error('invalid-json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid-json-object');
  }
  return parsed;
}
~~~

- [ ] **Step 6: backendConfigured와 deliver를 같은 provider 계약으로 바꾼다**

~~~js
const SUPPORTED_FORM_PROVIDERS = ['web3forms', 'generic'];

function formProvider(forms) {
  return String(forms && forms.provider || '').toLowerCase();
}

function backendConfigured(config) {
  const n8n = (config && config.n8n) || {};
  const forms = (config && config.forms) || {};
  const provider = formProvider(forms);
  return !!(
    (n8n.enabled && n8n.inquiryWebhookUrl) ||
    (forms.enabled && forms.endpoint &&
      SUPPORTED_FORM_PROVIDERS.includes(provider))
  );
}

async function deliver(config, payload) {
  const n8n = (config && config.n8n) || {};
  const forms = (config && config.forms) || {};
  if (n8n.enabled && n8n.inquiryWebhookUrl) {
    const response = await fetchWithTimeout(n8n.inquiryWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('n8n-http-error');
    const result = await readJsonObject(response);
    if (result.ok !== true) throw new Error('n8n-not-accepted');
    return true;
  }
  if (forms.enabled && forms.endpoint) {
    const provider = formProvider(forms);
    if (!SUPPORTED_FORM_PROVIDERS.includes(provider)) {
      throw new Error('unsupported-form-provider');
    }
    const body = Object.assign({}, payload, {
      subject: '[홈페이지 상담] ' + (payload.name || '') + ' · ' + (payload.type || ''),
      from_name: '만물인테리어 홈페이지',
      message: buildLeadText(payload)
    }, forms.accessKey ? { access_key: forms.accessKey } : {});
    const response = await fetchWithTimeout(forms.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('form-http-error');
    const result = await readJsonObject(response);
    let accepted = false;
    if (provider === 'web3forms') accepted = result.success === true;
    if (provider === 'generic') {
      accepted = result.ok === true || result.success === true;
    }
    if (!accepted) throw new Error('form-not-accepted');
    return true;
  }
  return false;
}
~~~

- [ ] **Step 7: Task 1 단위 검사를 GREEN으로 만든다**

Expected: 모든 Task 1 test exit 0.

- [ ] **Step 8: 커밋하지 않고 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 2: 최신 1건 메모리 초안과 generation-safe single-flight

**Files:**

- Modify: js/lead-transport.js
- Modify: tests/lead-transport.test.cjs

- [ ] **Step 1: 같은 Promise, latest generation, stale completion RED 검사를 추가한다**

~~~js
test('동시 재시도는 정확히 같은 Promise 객체를 반환한다', async () => {
  let resolveFetch;
  const loaded = loadLead({
    fetch: () => new Promise(resolve => { resolveFetch = resolve; })
  });
  const generation = loaded.lead.rememberFailure({
    name: 'A',
    phone: '010-0000-0000'
  });
  const config = {
    n8n: { enabled: true, inquiryWebhookUrl: 'https://n8n.test/send' }
  };
  const first = loaded.lead.retryLatest(config);
  const second = loaded.lead.retryLatest(config);
  assert.equal(first, second);
  resolveFetch(response(200, '{"ok":true}'));
  const result = await first;
  assert.equal(result.status, 'sent');
  assert.equal(result.generation, generation);
  assert.equal((await loaded.lead.retryLatest(config)).status, 'empty');
});

test('늦은 이전 성공은 새 초안을 지우지 않는다', async () => {
  const resolvers = [];
  const bodies = [];
  const loaded = loadLead({
    fetch: (url, options) => {
      bodies.push(JSON.parse(options.body));
      return new Promise(resolve => resolvers.push(resolve));
    }
  });
  const config = {
    n8n: { enabled: true, inquiryWebhookUrl: 'https://n8n.test/send' }
  };
  loaded.lead.rememberFailure({ name: 'old' });
  const oldAttempt = loaded.lead.retryLatest(config);
  const newest = loaded.lead.rememberFailure({ name: 'new' });
  resolvers.shift()(response(200, '{"ok":true}'));
  const oldResult = await oldAttempt;
  assert.equal(oldResult.status, 'stale');
  assert.equal(oldResult.generation, 1);
  const newAttempt = loaded.lead.retryLatest(config);
  assert.equal(bodies[1].name, 'new');
  resolvers.shift()(response(200, '{"ok":true}'));
  const newResult = await newAttempt;
  assert.equal(newResult.status, 'sent');
  assert.equal(newResult.generation, newest);
});

test('실패는 최신 초안을 보존하고 unavailable과 empty를 구분한다', async () => {
  const loaded = loadLead({
    fetch: async () => response(200, '{"ok":false}')
  });
  assert.equal((await loaded.lead.retryLatest({})).status, 'empty');
  const generation = loaded.lead.rememberFailure({ name: 'A' });
  const unavailable = await loaded.lead.retryLatest({});
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.generation, generation);
  const failed = await loaded.lead.retryLatest({
    n8n: { enabled: true, inquiryWebhookUrl: 'https://n8n.test/send' }
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.generation, generation);
});
~~~

- [ ] **Step 2: RED를 실행한다**

Expected: rememberFailure/retryLatest 부재로 실패한다.

- [ ] **Step 3: 메모리 전용 coordinator를 구현한다**

~~~js
let latestFailure = null;
let failureGeneration = 0;
let retryInFlight = null;

function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload || {}));
}

function rememberFailure(payload) {
  failureGeneration += 1;
  latestFailure = {
    generation: failureGeneration,
    payload: clonePayload(payload)
  };
  return failureGeneration;
}

function clearFailure(expectedGeneration) {
  if (!latestFailure) return false;
  if (latestFailure.generation !== expectedGeneration) return false;
  latestFailure = null;
  return true;
}

function retryLatest(config) {
  if (retryInFlight) return retryInFlight;
  if (!latestFailure) {
    return Promise.resolve({ status: 'empty', generation: 0 });
  }
  const captured = latestFailure;
  if (!backendConfigured(config)) {
    return Promise.resolve({
      status: 'unavailable',
      generation: captured.generation
    });
  }
  const promise = deliver(config, captured.payload)
    .then(sent => {
      if (sent !== true) {
        return { status: 'failed', generation: captured.generation };
      }
      if (!latestFailure ||
          latestFailure.generation !== captured.generation) {
        return { status: 'stale', generation: captured.generation };
      }
      clearFailure(captured.generation);
      return { status: 'sent', generation: captured.generation };
    })
    .catch(() => ({
      status: 'failed',
      generation: captured.generation
    }))
    .finally(() => {
      if (retryInFlight === promise) retryInFlight = null;
    });
  retryInFlight = promise;
  return promise;
}
~~~

retryLatest는 async function으로 선언하지 않는다. 그래야 중복 호출이 정확히 같은 Promise 참조를 받는다.

- [ ] **Step 4: 공개 API를 최소화한다**

~~~js
window.ManmulLead = {
  backendConfigured,
  fetchWithTimeout,
  buildLeadText,
  deliver,
  rememberFailure,
  retryLatest,
  clearFailure,
  copyToClipboard
};
~~~

STORAGE_KEY, RETENTION_DAYS, pruneExpired, saveLocal, latestFailure 자체는 export하지 않는다.

- [ ] **Step 5: timeout 뒤 late response가 결과를 바꾸지 않는 검사를 추가한다**

fetchWithTimeout을 10ms로 직접 호출하고 fetch가 signal을 무시한 채 30ms 뒤 성공해도 첫 Promise가 request-timeout으로 reject되는지 검사한다. 뒤늦은 resolve가 unhandled rejection이나 상태 변경을 만들지 않아야 한다.

- [ ] **Step 6: 단위 검사를 GREEN으로 만든다**

~~~powershell
& $node --test --test-concurrency=1 tests/lead-transport.test.cjs
~~~

Expected: exit 0.

- [ ] **Step 7: 커밋 없이 diff 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 3: 일반·누수 폼 공용 memory retry와 안전한 화면

**Files:**

- Modify: js/inquiry.js
- Modify: js/leak-inquiry.js
- Create: tests/lead-privacy.e2e.cjs

- [ ] **Step 1: 기존 unified browser test 패턴으로 E2E server를 만든다**

tests/unified-brand-design.e2e.cjs의 local HTTP server와 Playwright lifecycle을 복사하되 tests/lead-privacy.e2e.cjs 안에서만 사용한다. browser context마다 390×844 viewport와 serviceWorkers block을 적용하고 test endpoint 외 외부 요청을 abort한다.

- [ ] **Step 2: 두 폼의 no-persistent-storage와 reload RED 검사를 작성한다**

각 index.html, leak.html case에서 다음을 수행한다.

1. data/config.json을 n8n test endpoint로 route한다.
2. endpoint는 HTTP 200 + {"ok":false}를 반환한다.
3. 이름 <img src=x onerror="window.__xss=1">, 전화 010-1234-5678, 메모 <script>window.__xss=2</script>를 포함한 유효 폼을 제출한다.
4. 실패 화면에 아직 전송되지 않았습니다, 현재 탭에서만 보관, 새로고침하면 사라짐이 보이는지 검사한다.
5. localStorage와 sessionStorage 값에 전화번호, img, script가 없는지 검사한다.
6. indexedDB.open spy가 문의 payload로 호출되지 않는지 검사한다.
7. window.__xss가 0인지 검사한다.
8. reload 뒤 endpoint request count가 증가하지 않는지 검사한다.

공통 assertion:

~~~js
const persistent = await page.evaluate(() => ({
  legacy: localStorage.getItem('manmul_inquiries'),
  localValues: Object.values(localStorage),
  sessionValues: Object.values(sessionStorage),
  xss: window.__xss || 0
}));
assert.equal(persistent.legacy, null);
assert.equal(
  persistent.localValues.concat(persistent.sessionValues)
    .some(value => /010-1234-5678|<script|<img/i.test(value)),
  false
);
assert.equal(persistent.xss, 0);
~~~

폼 입력 helper는 실제 selector를 사용한다.

- index.html: #iName, #iPhone, #iConsent, 단계 이동 버튼, #submitInquiry
- leak.html: #lkName, #lkPhone, 증상 checkbox, #lkConsent, #lkSubmit

- [ ] **Step 3: 수동 retry와 online single-flight RED 검사를 작성한다**

첫 전송을 pending으로 두고 수동 retry와 online 이벤트를 겹치게 발생시킨다. 공용 coordinator가 retry network 한 건만 만들고 같은 generation 결과만 현재 화면을 성공으로 바꾸는지 검사한다.

초기 제출 A를 pending으로 둔 채 programmatic second submit B를 시작하고 B 실패 화면을 만든다. A를 늦게 성공시켜도 submit attempt epoch가 B 화면을 성공으로 덮지 않는지 일반·누수 양쪽에서 검사한다. 이어서 새 B 실패를 rememberFailure한 뒤 A retry의 늦은 성공을 resolve해도 B 화면이 아직 전송되지 않았습니다로 남는지 별도 case로 검사한다.

- [ ] **Step 4: RED를 실행한다**

~~~powershell
$env:NODE_PATH = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& $node --test --test-concurrency=1 tests/lead-privacy.e2e.cjs
if ($LASTEXITCODE -eq 0) { throw 'Expected RED but test passed' }
~~~

Expected: localStorage PII, reload 자동 retry, 누수 retry 버튼 부재 중 하나 이상으로 실패한다.

- [ ] **Step 5: inquiry.js의 local queue를 완전히 제거한다**

다음을 삭제한다.

- STORAGE_KEY, saveLocal, pruneExpired alias
- RETRY_MAX, RETRY_BATCH, retrying
- loadLocal, writeLocal, retryPending
- init의 3초 retry
- 자체 localStorage getItem/setItem

초기 제출은 기존 validation과 payload 생성 뒤 다음 계약을 사용한다.

~~~js
let visibleFailureGeneration = 0;
let submitAttemptEpoch = 0;

async function deliverCurrentPayload(payload, hasBackend) {
  const attempt = ++submitAttemptEpoch;
  let delivered = false;
  try {
    delivered = await deliver(payload);
  } catch (_) {
    delivered = false;
  }
  if (attempt !== submitAttemptEpoch) return;

  if (delivered === true) {
    showSuccess(payload, {
      delivered: true,
      hasBackend,
      generation: 0
    });
    return;
  }

  visibleFailureGeneration = LEAD.rememberFailure(payload);
  showSuccess(payload, {
    delivered: false,
    hasBackend,
    failed: true,
    generation: visibleFailureGeneration
  });
}
~~~

deliver는 inquiry.js의 기존 wrapper가 CONFIG을 닫아두고 있으므로 실제 signature를 유지한다. 새 wrapper 이름이 기존 scope와 충돌하면 submit 본문에 같은 분기를 직접 넣는다.

- [ ] **Step 6: inquiry.js retry UI를 공용 coordinator에 연결한다**

~~~js
function retryVisibleFailure(payload, generation, button) {
  button.disabled = true;
  button.textContent = '다시 시도 중…';
  return LEAD.retryLatest(CONFIG).then(result => {
    if (result.status === 'sent' && result.generation === generation) {
      showSuccess(payload, {
        delivered: true,
        hasBackend: true,
        generation
      });
      return;
    }
    if (result.status === 'stale' || result.generation !== generation) return;
    button.disabled = false;
    button.textContent = '🔄 다시 시도 (전송 실패)';
  });
}
~~~

online handler는 event 한 번에 LEAD.retryLatest(CONFIG)을 한 번만 호출한다. 반환 generation이 visibleFailureGeneration과 같고 status가 sent일 때만 화면을 성공으로 바꾼다. page load에서는 retryLatest를 호출하지 않는다.

- [ ] **Step 7: inquiry.js 사용자 입력 렌더링을 안전하게 바꾼다**

현재 payload.name raw interpolation을 다음처럼 바꾼다.

~~~js
const safeName = esc(payload.name || '고객');
~~~

innerHTML에는 safeName만 넣는다. 더 안전한 DOM 구성으로 바꾸는 경우 이름 span의 textContent를 사용한다. 메모, 증상, payload 원문은 status innerHTML에 넣지 않는다.

실패 문구는 다음 의미를 모두 포함한다.

- 아직 제출되지 않음
- 이 탭에서만 임시 보관
- 새로고침하거나 탭을 닫으면 사라짐
- 다시 시도, 전화, 문자 대안

- [ ] **Step 8: leak-inquiry.js를 같은 계약으로 바꾼다**

- LEAD.saveLocal 호출 제거
- 실패 시 generation = LEAD.rememberFailure(payload)
- 실패 UI에 #lkRetry native button 추가
- #lkRetry와 online handler는 LEAD.retryLatest(CONFIG) 사용
- leakSubmitAttemptEpoch를 제출 전에 증가시키고 await 뒤 epoch가 최신일 때만 showDone 호출
- generation이 현재 화면과 같을 때만 retry 성공 화면
- 이 기기에 남겨 두었음 문구를 이 탭에서만 임시 보관, 새로고침 시 사라짐으로 교체
- 전화, 문자, 카카오, 복사 버튼 유지
- 링크/창 열기를 delivered true로 바꾸지 않음

- [ ] **Step 9: 두 폼의 집중 E2E를 GREEN으로 만든다**

Expected:

- persistent PII 0
- reload 자동 재전송 0
- manual+online single-flight
- 초기 제출 attempt epoch와 retry generation 모두 late response 안전
- XSS 0
- 390px overflow 0
- retry button 높이 44px 이상

- [ ] **Step 10: 커밋 없이 diff 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 4: admin-first cleanup과 로컬 PII 문의함 폐지

**Files:**

- Modify: admin.html
- Modify: js/admin.js
- Modify: tests/lead-privacy.e2e.cjs

- [ ] **Step 1: admin-first cleanup RED 검사를 추가한다**

~~~js
test('admin을 먼저 열어도 legacy PII를 제거하고 렌더하지 않는다', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html');
  await page.evaluate(() => {
    localStorage.setItem(
      'manmul_inquiries',
      JSON.stringify([{
        name: '홍길동',
        phone: '010-9999-9999',
        memo: 'legacy memo'
      }])
    );
  });
  await page.goto(origin + '/admin.html');
  assert.equal(
    await page.evaluate(() => localStorage.getItem('manmul_inquiries')),
    null
  );
  const body = await page.locator('body').innerText();
  assert.equal(body.includes('010-9999-9999'), false);
  assert.equal(await page.locator('#inquiryPanel').count(), 0);
  await page.close();
});
~~~

removeItem 첫 load throw를 주입한 뒤 page가 계속 뜨고, 다음 reload에서 cleanup되는 case도 추가한다.

- [ ] **Step 2: RED를 실행한다**

Expected: admin이 legacy PII를 읽어 렌더하거나 #inquiryPanel이 남아 실패한다.

- [ ] **Step 3: admin.html에서 transport를 admin보다 먼저 로드한다**

~~~html
<script src="js/lead-transport.js"></script>
<script src="js/admin.js"></script>
~~~

기존 defer/위치 방식은 유지하되 실행 순서는 반드시 transport 다음 admin이다.

- [ ] **Step 4: admin.html의 local PII UI를 제거한다**

다음을 제거한다.

- 상담 문의 nav anchor
- 문의 수 KPI/count
- #inquiryPanel 전체
- #seedBtn
- local 문의 empty note

외부 접수 경로 panel, 연결 점검, 콘텐츠 편집 panel은 유지한다. h1과 설명은 문의 보관 대시보드가 아니라 접수 경로·사이트 콘텐츠 관리로 바꾼다.

- [ ] **Step 5: admin.js의 PII read/write/render/seed 경로를 제거한다**

다음을 제거한다.

- STORAGE_KEY, RETENTION_DAYS
- load, save, prune logic
- inquiry KPI/card/status/response/send history/hyeonjang handoff
- seed와 seedBtn wiring
- init의 local lead render

다음을 유지한다.

- loadConfig
- leadRoute
- renderPipeline
- renderConnection
- 외부 설정 비파괴 확인
- 콘텐츠 편집 초기화

demoMode 표시 문구는 브라우저 영구 PII 백업 없음과 자동 실패 시 직접 대안 사용으로 바꾼다.

- [ ] **Step 6: admin-first E2E를 GREEN으로 만든다**

Expected: legacy key null, PII 미렌더, route status와 content editor 가시성 유지.

- [ ] **Step 7: 커밋 없이 diff 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

Expected: js/lead-transport.js와 tests/lead-transport.test.cjs만 변경. 단일 개인정보 커밋을 위해 아직 commit하지 않는다.

---

## Task 5: 개인정보 안내와 정적 계약 정합성

**Files:**

- Modify: data/config.json
- Modify: privacy.html
- Modify: integrations/INTEGRATION.md
- Modify: integrations/인수인계서.md
- Modify: scripts/ensure-conversion-basics.mjs
- Modify: scripts/ensure-leak-inquiry.mjs
- Modify: scripts/ensure-lead-route-parity.mjs
- Modify: scripts/ensure-admin-content-editor.mjs

- [ ] **Step 1: config 값은 유지하고 도움말 문구만 수정한다**

data/config.json의 _demoMode_help를 다음 의미로 바꾼다.

“자동 전송 실패 초안은 현재 탭 메모리에만 잠시 유지되며 새로고침 또는 탭 종료 시 폐기됩니다. 고객 문의를 localStorage에 백업하지 않습니다.”

demoMode, endpoint, accessKey, enabled, provider 실제 값은 byte-level diff에서 바뀌지 않아야 한다.

- [ ] **Step 2: privacy.html에서 서버 성공 보유와 실패 초안을 분리한다**

안내 계약:

- 성공적으로 외부 접수 서비스에 전달된 개인정보: 현재 서버 처리·보유 안내 유지
- 자동 전송 실패 초안: 브라우저 영구 저장소에 저장하지 않음
- 실패 초안: 현재 탭 메모리 최신 1건, 새로고침/탭 종료 시 폐기
- 사용자는 재시도 또는 전화·문자로 직접 전달 가능

실패 초안에 1년 보유가 적용되는 것처럼 쓰지 않는다.

- [ ] **Step 3: 확인된 stale 운영 문서 두 곳을 수정한다**

- integrations/INTEGRATION.md의 demoMode localStorage fallback과 관리자 localStorage 데모 설명을 현재 탭 memory/no local PII board로 변경
- integrations/인수인계서.md의 RETENTION_DAYS/saveLocal legacy 설명을 “이전 동작, 현재 폐지 및 cleanup”으로 변경

다른 운영·설치 값은 바꾸지 않는다.

- [ ] **Step 4: ensure-conversion-basics를 새 계약으로 바꾼다**

삭제할 필수 조건:

- RETENTION_DAYS
- pruneExpired
- saveLocal
- retryPending
- RETRY_MAX/RETRY_BATCH
- admin local inquiry board

추가할 필수 조건:

- lead-transport exports rememberFailure/retryLatest/clearFailure
- 두 폼이 rememberFailure와 retryLatest 사용
- inquiry/leak/admin에 legacy key와 PII localStorage queue가 없음
- privacy에 탭 메모리와 refresh 폐기 안내
- admin transport 선로드와 외부 route/content editor 보존

- [ ] **Step 5: ensure-leak-inquiry를 공용 retry 계약으로 바꾼다**

검사할 공용 API:

- deliver
- backendConfigured
- rememberFailure
- retryLatest
- clearFailure

누수 폼의 retry button, 전화/문자/복사 대안, no saveLocal, refresh loss 문구를 정적으로 검사한다.

- [ ] **Step 6: route parity와 admin content editor 검사를 강화한다**

- provider가 routing 조건일 때 lead-transport/backendConfigured/admin leadRoute가 같은 forms.provider 조건을 사용하도록 검사한다.
- admin에 legacy reader/writer/seed/inquiryPanel이 없음을 검사한다.
- content editor의 자체 비-PII draft localStorage는 이 범위에서 제거하지 않는다.

- [ ] **Step 7: 네 정적 검사를 실행한다**

~~~powershell
& $node scripts/ensure-conversion-basics.mjs
& $node scripts/ensure-leak-inquiry.mjs
& $node scripts/ensure-lead-route-parity.mjs
& $node scripts/ensure-admin-content-editor.mjs
~~~

Expected: 모두 exit 0.

- [ ] **Step 8: legacy string 허용 범위를 검사한다**

~~~powershell
rg -n "manmul_inquiries" .
~~~

Expected: js/lead-transport.js의 remove-only cleanup과 tests/lead-transport.test.cjs, tests/lead-privacy.e2e.cjs만 표시된다. 운영 문서나 admin/form runtime에는 없어야 한다.

- [ ] **Step 9: 커밋 없이 diff 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 6: CI, 전체 회귀, 변이 검증, 단일 개인정보 커밋

**Files:**

- Modify: .github/workflows/deploy-pages.yml
- Verify: 모든 Task 1-5 파일

- [ ] **Step 1: CI의 기존 Node/Playwright 단계에 신규 검사를 추가한다**

기존 Playwright 설치 뒤 다음 명령을 실행하는 step을 추가한다.

~~~yaml
- name: Verify lead privacy
  env:
    NODE_PATH: ${{ runner.temp }}/manmool-e2e/node_modules
  run: >-
    node --test --test-concurrency=1
    tests/lead-transport.test.cjs
    tests/lead-privacy.e2e.cjs
~~~

기존 artifact, office request, unified brand 검사를 제거하지 않는다.

- [ ] **Step 2: 집중 단위·브라우저 검사를 실행한다**

~~~powershell
$env:NODE_PATH = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& $node --test --test-concurrency=1 tests/lead-transport.test.cjs tests/lead-privacy.e2e.cjs
~~~

Expected: exit 0.

- [ ] **Step 3: 모든 ensure script를 종료코드 기준으로 실행한다**

~~~powershell
Get-ChildItem scripts/ensure-*.mjs |
  Where-Object Name -ne 'ensure-pages-artifact.mjs' |
  Sort-Object Name |
  ForEach-Object {
    & $node $_.FullName
    if ($LASTEXITCODE -ne 0) {
      throw "FAIL $($_.Name) exit=$LASTEXITCODE"
    }
  }
~~~

- [ ] **Step 4: 전체 Node/Playwright 회귀를 실행한다**

~~~powershell
$testFiles = @(
  'tests/configure-office-api.test.cjs',
  'tests/pages-artifact-policy.test.cjs',
  'tests/office-request.logic.test.cjs',
  'tests/office-request-api.test.cjs',
  'tests/office-request-auth.e2e.cjs',
  'tests/office-request-workflow.e2e.cjs',
  'tests/office-intake.e2e.cjs',
  'tests/unified-brand-design.e2e.cjs',
  'tests/lead-transport.test.cjs',
  'tests/lead-privacy.e2e.cjs'
)
& $node --test --test-concurrency=1 $testFiles
if ($LASTEXITCODE -ne 0) { throw 'Node/Playwright regression failed' }
~~~

Expected: exit 0. 외부 endpoint는 test route/mock만 사용하고 실 문의를 보내지 않는다.

- [ ] **Step 5: Pages artifact를 새로 만들고 정책 검사를 실행한다**

~~~powershell
& $node scripts/build-pages-artifact.mjs
if ($LASTEXITCODE -ne 0) { throw 'build-pages-artifact failed' }
& $node scripts/ensure-pages-artifact.mjs
if ($LASTEXITCODE -ne 0) { throw 'ensure-pages-artifact failed' }
~~~

생성 artifact에도 두 폼의 PII 저장 코드와 admin legacy 문의함이 없어야 한다.

- [ ] **Step 6: 변이를 하나씩 적용해 관련 검사가 RED인지 확인하고 즉시 원복한다**

1. inquiry.js에 localStorage.setItem으로 payload를 저장한다. lead-privacy e2e가 실패해야 한다.
2. admin.js에 getItem legacy reader를 넣는다. static/admin-first 검사가 실패해야 한다.
3. deliver에서 HTTP 200을 바로 true로 반환한다. provider matrix가 실패해야 한다.
4. retryLatest의 generation equality guard를 제거한다. stale completion test가 실패해야 한다.
5. removeLegacyInquiryStorage 호출을 제거한다. cleanup unit/admin-first e2e가 실패해야 한다.
6. retryLatest를 async function으로 바꾼다. exact same Promise test가 실패해야 한다.
7. 실패 화면에 payload.name을 raw innerHTML로 넣는다. XSS e2e가 실패해야 한다.

- [ ] **Step 7: 최종 정적 개인정보 scan을 실행한다**

~~~powershell
rg -n "manmul_inquiries|RETENTION_DAYS|pruneExpired|saveLocal|retryPending" .
rg -n "localStorage|sessionStorage|indexedDB" js/inquiry.js js/leak-inquiry.js js/admin.js js/lead-transport.js
git diff --check
git status --short
git diff --name-only
~~~

판정:

- manmul_inquiries는 cleanup과 전용 test만
- 문의 runtime에 PII queue read/write 없음
- lead-transport의 localStorage 사용은 removeItem만
- admin content-editor 같은 비-PII 저장은 범위 밖 파일에서 유지 가능
- endpoint/accessKey 값 diff 없음

- [ ] **Step 8: 독립 코드 리뷰를 요청하고 blocker를 수정한다**

리뷰 범위:

- provider 응답 fail-closed
- timeout late response
- generation race
- no persistent PII
- admin route/content editor 회귀
- 개인정보 문구 정합성

수정 뒤 Step 2-7 전체를 다시 실행한다.

- [ ] **Step 9: 3단계 단일 개인정보 보호 커밋을 만든다**

~~~powershell
$privacyFiles = @(
  'js/lead-transport.js',
  'js/inquiry.js',
  'js/leak-inquiry.js',
  'js/admin.js',
  'admin.html',
  'data/config.json',
  'privacy.html',
  'scripts/ensure-conversion-basics.mjs',
  'scripts/ensure-leak-inquiry.mjs',
  'scripts/ensure-lead-route-parity.mjs',
  'scripts/ensure-admin-content-editor.mjs',
  'tests/lead-transport.test.cjs',
  'tests/lead-privacy.e2e.cjs',
  'integrations/INTEGRATION.md',
  'integrations/인수인계서.md',
  '.github/workflows/deploy-pages.yml'
)
git add -- $privacyFiles
git diff --cached --check
git status --short
git commit -m "fix: keep failed inquiry data in tab memory only"
~~~

- [ ] **Step 10: 배포 전 종료 조건을 확인한다**

~~~powershell
git status --short
git log -5 --oneline
~~~

Expected: clean. push, merge, Pages 배포, 외부 설정 변경은 하지 않고 별도 승인을 기다린다.

---

## Review Checklist

- [ ] 일반·누수 폼 모두 실패 payload를 영구 storage에 쓰지 않는다.
- [ ] 실패 초안은 현재 탭 최신 1건이고 reload 뒤 자동 재전송되지 않는다.
- [ ] manual과 online retry가 같은 in-flight Promise를 공유한다.
- [ ] 이전 generation의 늦은 성공이 최신 초안/화면을 지우지 않는다.
- [ ] Web3Forms는 success true, n8n은 ok true만 성공이다.
- [ ] empty/malformed/false/500/reject/timeout/late response는 제출 완료가 아니다.
- [ ] legacy 문의 key는 읽지 않고 best-effort remove만 한다.
- [ ] admin-first load가 cleanup을 실행하고 PII를 렌더하지 않는다.
- [ ] 관리자 외부 접수 경로와 콘텐츠 편집이 유지된다.
- [ ] 실패 화면은 현재 탭 한정·refresh loss와 재시도/전화/문자를 알린다.
- [ ] 사용자 입력은 textContent 또는 escape 후에만 HTML에 들어간다.
- [ ] config 실제 전송 값과 office-api.json은 바뀌지 않았다.
- [ ] 운영 문서와 privacy 안내가 실제 동작과 일치한다.
- [ ] 신규 test가 CI와 Pages artifact 회귀에 포함된다.
- [ ] 모든 ensure, Node, Playwright, artifact, 변이 검증이 통과했다.
- [ ] push, merge, 배포, 실 문의 전송을 수행하지 않았다.
