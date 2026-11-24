/* e2e-offline.test.cjs — tests/helpers/e2e-offline.cjs 의 동작을 브라우저 없이 고정한다 (2026-11-19)

   지키는 것
     ① 모든 BrowserContext(newContext·newPage 뒤의 숨은 context)에 helper 라우트 세 개가 시험 라우트보다 먼저, 한 번만 걸린다.
     ② Playwright 1.55 의 라우트 순서(page → context, 같은 층은 나중 것 먼저, fallback 은 다음 라우트로, continue 는 네트워크로)
        에서: 기본값은 config.json 의 inbox·n8n 꺼짐, 시험이 직접 준 설정은 그대로, 실서버 요청은 abort·기록,
        시험이 받지 않은 로컬 밖 쓰기 요청(POST 등)도 마지막 그물이 abort·기록.
     ③ config 변환은 inbox·n8n(enabled·inquiryWebhookUrl)만 바꾸고 나머지는 바이트까지 그대로(키 순서·들여쓰기·줄끝·마지막 줄바꿈).
        변환 중 오류(닫히는 context)는 던지지 않고 abort 한다.
     ④ chromium 실행 인자에 이름풀이 차단(--host-resolver-rules)이 들어간다. 막은 요청이 있으면 프로세스가 1 로 끝난다.
     ⑤ scripts/ensure-e2e-offline.mjs 가 고장(helper 빠짐·순서 뒤집힘·route.continue·브라우저 밖 요청·보호 삭제·라이브 주소·
        워크플로 순서)을 잡는다. glob 문자열('**' + '/*' 꼴) 뒤에 숨은 코드도 본다.
   실제 브라우저 동작은 CI 의 Playwright e2e 가 본다. 여기서는 실제 네트워크를 쓰지 않는다. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const HELPER_PATH = path.join(__dirname, 'helpers', 'e2e-offline.cjs');
const LOCAL = 'http://127.0.0.1:43210';
const FAKE_INBOX = 'https://script.google.com/macros/s/fixture-offline-inbox/exec';

/* ---------- Playwright 흉내(라우트 순서 의미만 정확히) ---------- */
function fakePlaywright({ newPageSkipsNewContext = false } = {}) {
  class FakePage {
    constructor(context) { this.ctx = context; this.routes = []; }
    context() { return this.ctx; }
    async route(matcher, handler) { this.routes.push({ matcher, handler }); }
  }
  class FakeContext {
    constructor(options) { this.options = options; this.routes = []; }
    async route(matcher, handler) { this.routes.push({ matcher, handler }); }
    async newPage() { return new FakePage(this); }
  }
  class FakeBrowser {
    constructor(options) { this.launchOptions = options; this.contextsCreated = 0; }
    async newContext(options) { this.contextsCreated += 1; return new FakeContext(options); }
    async newPage(options) {
      if (newPageSkipsNewContext) { this.contextsCreated += 1; return new FakeContext(options).newPage(); }
      return (await this.newContext(options)).newPage();
    }
  }
  const chromium = { launches: [], async launch(options) { this.launches.push(options); return new FakeBrowser(options); } };
  return { chromium };
}

function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') { source += '.*'; index += 1; }
    else if (char === '*') source += '[^/]*';
    else source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

function matches(matcher, url) {
  if (typeof matcher === 'function') return matcher(url);
  if (matcher instanceof RegExp) return matcher.test(url.href);
  return globToRegExp(matcher).test(url.href);
}

/* page 라우트 → context 라우트, 같은 층은 나중에 건 것부터. fallback 은 다음으로, continue 는 남은 라우트 없이 네트워크로. */
async function dispatch(page, request) {
  const url = new URL(request.url);
  const chain = [...page.routes].reverse().concat([...page.context().routes].reverse());
  for (const { matcher, handler } of chain) {
    if (!matches(matcher, url)) continue;
    const outcome = await new Promise((resolve, reject) => {
      const server = request.server || { status: 200, headers: { 'content-type': 'application/json' }, body: '' };
      const route = {
        request: () => ({ url: () => request.url, method: () => request.method || 'GET' }),
        fallback: async () => resolve({ kind: 'fallback' }),
        continue: async () => resolve({ kind: 'network', via: 'continue' }),
        abort: async (code) => resolve({ kind: 'abort', code }),
        fulfill: async (options) => resolve({ kind: 'fulfill', ...options }),
        fetch: async () => ({ status: () => server.status, headers: () => ({ ...server.headers }), text: async () => server.body }),
      };
      Promise.resolve(handler(route)).catch(reject);
    });
    if (outcome.kind !== 'fallback') return outcome;
  }
  return { kind: 'network', via: 'no-route' };
}

/* ---------- helper 를 '진짜 playwright 대신 흉내'로 불러온다 ---------- */
const autoFake = fakePlaywright();
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'playwright') return autoFake;
  return originalLoad.call(this, request, parent, isMain);
};
let helper;
try { helper = require(HELPER_PATH); } finally { Module._load = originalLoad; }

const repoConfigText = fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8');
const repoConfig = JSON.parse(repoConfigText);

async function openPage(options) {
  const pw = helper.install(fakePlaywright(options));
  const browser = await pw.chromium.launch({ headless: true });
  return { pw, browser, page: await browser.newPage() };
}

test('불러오기만 해도 playwright 의 chromium.launch 가 감싸지고 이름풀이 차단 인자가 붙는다', async () => {
  const browser = await autoFake.chromium.launch({ headless: true, args: ['--lang=ko-KR'] });
  const [options] = autoFake.chromium.launches;
  assert.equal(options.headless, true);
  assert.equal(options.args[0], '--lang=ko-KR');
  assert.equal(options.args.length, 2);
  assert.match(options.args[1], /^--host-resolver-rules=/);
  for (const host of ['script.google.com', 'script.googleusercontent.com', '*-script.googleusercontent.com', 'api.web3forms.com']) {
    assert.ok(options.args[1].includes(`MAP ${host} ~NOTFOUND`), host);
  }
  const context = await browser.newContext();
  assert.equal(context.routes.length, 3, 'newContext 직후 helper 라우트 세 개');
  assert.deepEqual(context.routes.map(({ handler }) => handler.name), ['denyUnhandledWrite', 'serveSiteConfig', 'abortBackend'], '마지막 그물을 맨 먼저 걸어 맨 마지막에 돈다');
});

test('이미 이름풀이 규칙이 있으면 차단 규칙을 맨 앞에 합치고 원래 옵션은 건드리지 않는다', () => {
  const input = { headless: true, args: ['--host-resolver-rules=MAP * 127.0.0.1', '--foo'] };
  const output = helper.withOfflineArgs(input);
  assert.deepEqual(input.args, ['--host-resolver-rules=MAP * 127.0.0.1', '--foo']);
  assert.equal(output.args.length, 2);
  assert.equal(output.args[0], `--host-resolver-rules=${helper.HOST_RESOLVER_RULES}, MAP * 127.0.0.1`);
  assert.equal(output.args[1], '--foo');
  assert.deepEqual(helper.withOfflineArgs(undefined).args, [`--host-resolver-rules=${helper.HOST_RESOLVER_RULES}`]);
});

test('browser.newPage 뒤에 숨은 context 에도 helper 라우트가 정확히 한 번 걸린다(구현이 newContext 를 거치든 말든)', async () => {
  for (const newPageSkipsNewContext of [false, true]) {
    const { browser, page } = await openPage({ newPageSkipsNewContext });
    assert.equal(browser.contextsCreated, 1);
    assert.equal(page.context().routes.length, 3, `newPageSkipsNewContext=${newPageSkipsNewContext}`);
    assert.equal(page.routes.length, 0);
  }
});

test('시험 라우트가 없으면 config.json 은 서버 원문에서 접수 경로(inbox·n8n)만 꺼서 돌려준다', async () => {
  const { page } = await openPage();
  const outcome = await dispatch(page, {
    url: `${LOCAL}/data/config.json`,
    server: { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(repoConfigText)) }, body: repoConfigText },
  });
  assert.equal(outcome.kind, 'fulfill');
  assert.equal(outcome.status, 200);
  assert.equal(outcome.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(Object.hasOwn(outcome.headers, 'content-length'), false, '본문 길이가 바뀌므로 원래 길이 헤더는 버린다');
  const served = JSON.parse(outcome.body);
  assert.deepEqual(served.inbox, { enabled: false, url: '' });
  assert.deepEqual(Object.keys(served), Object.keys(repoConfig));
  if (Object.hasOwn(repoConfig, 'n8n')) assert.deepEqual(served.n8n, { ...repoConfig.n8n, enabled: false, inquiryWebhookUrl: '' });
  for (const key of Object.keys(repoConfig)) if (key !== 'inbox' && key !== 'n8n') assert.deepEqual(served[key], repoConfig[key], key);
  if (repoConfig.inbox && repoConfig.inbox.url) assert.equal(outcome.body.includes(repoConfig.inbox.url), false, '라이브 접수함 주소가 페이지로 가면 안 된다');
  if (repoConfig.n8n && repoConfig.n8n.inquiryWebhookUrl) assert.equal(outcome.body.includes(repoConfig.n8n.inquiryWebhookUrl), false, 'n8n 웹훅 주소가 페이지로 가면 안 된다');
});

test('하위 경로(/manmool/…)도 같고, 404·JSON 아님·inbox 없음은 서버 응답을 그대로 둔다', async () => {
  const { page } = await openPage();
  const prefixed = await dispatch(page, { url: `${LOCAL}/manmool/data/config.json`, server: { status: 200, headers: {}, body: repoConfigText } });
  assert.deepEqual(JSON.parse(prefixed.body).inbox, { enabled: false, url: '' });
  const missing = await dispatch(page, { url: `${LOCAL}/posts/data/config.json`, server: { status: 404, headers: {}, body: 'not found' } });
  assert.deepEqual({ status: missing.status, body: missing.body }, { status: 404, body: 'not found' });
  const noInbox = '{\n  "kakao": {\n    "ready": false\n  }\n}\n';
  const plain = await dispatch(page, { url: `${LOCAL}/data/config.json`, server: { status: 200, headers: {}, body: noInbox } });
  assert.equal(plain.body, noInbox);
});

test('시험이 page 라우트로 준 설정(가짜 접수함 켜기)이 helper 보다 먼저다', async () => {
  const { page } = await openPage();
  const body = JSON.stringify({ inbox: { enabled: true, url: FAKE_INBOX } });
  await page.route('**/data/config.json*', (route) => route.fulfill({ contentType: 'application/json', body }));
  const outcome = await dispatch(page, { url: `${LOCAL}/data/config.json`, server: { status: 200, headers: {}, body: repoConfigText } });
  assert.equal(outcome.body, body);
});

test('시험 라우트가 fallback 으로 넘기면 helper 가 받고, continue 는 helper 를 건너뛴다(그래서 금지)', async () => {
  const local = (route) => route.request().url().startsWith(`${LOCAL}/`) && route.request().method() === 'GET';
  const viaFallback = await openPage();
  await viaFallback.page.context().route('**/*', (route) => (local(route) ? route.fallback() : route.abort()));
  const served = await dispatch(viaFallback.page, { url: `${LOCAL}/data/config.json`, server: { status: 200, headers: {}, body: repoConfigText } });
  assert.deepEqual(JSON.parse(served.body).inbox, { enabled: false, url: '' });
  const other = await dispatch(viaFallback.page, { url: `${LOCAL}/index.html` });
  assert.deepEqual(other, { kind: 'network', via: 'no-route' }, '로컬 페이지는 그대로 서버로');

  const viaContinue = await openPage();
  await viaContinue.page.context().route('**/*', (route) => (local(route) ? route.continue() : route.abort()));
  const skipped = await dispatch(viaContinue.page, { url: `${LOCAL}/data/config.json`, server: { status: 200, headers: {}, body: repoConfigText } });
  assert.deepEqual(skipped, { kind: 'network', via: 'continue' }, 'continue 는 helper 라우트에 닿지 않는다 — ensure-e2e-offline 이 막는 이유');
});

test('실서버(접수함·메일 접수)로 가는 요청은 abort 하고 기록한다. 시험이 가짜로 받아 주면 그쪽이 먼저다', async () => {
  helper.state.blockedRequests.length = 0;
  const { page } = await openPage();
  for (const url of [
    'https://script.google.com/macros/s/live-deployment/exec',
    'https://script.googleusercontent.com/macros/echo?user_content_key=x',
    'https://n-abc123-0lu-script.googleusercontent.com/userCodeAppPanel',
    'https://api.web3forms.com/submit',
    'https://formspree.io/f/abc',
  ]) {
    const outcome = await dispatch(page, { url, method: 'POST' });
    assert.deepEqual(outcome, { kind: 'abort', code: 'blockedbyclient' }, url);
  }
  assert.equal(helper.state.blockedRequests.length, 5);
  assert.deepEqual(helper.state.blockedRequests[0], { method: 'POST', url: 'https://script.google.com/macros/s/live-deployment/exec' });

  helper.state.blockedRequests.length = 0;
  await page.route(FAKE_INBOX, (route) => route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));
  const faked = await dispatch(page, { url: FAKE_INBOX, method: 'POST' });
  assert.equal(faked.kind, 'fulfill');
  assert.equal(helper.state.blockedRequests.length, 0);

  for (const url of ['https://lh3.googleusercontent.com/a.jpg', 'https://pf.kakao.com/_x/chat', 'https://fonts.googleapis.com/css2', 'https://evil.example/script.google.com', `${LOCAL}/data/site.json`]) {
    assert.deepEqual(await dispatch(page, { url }), { kind: 'network', via: 'no-route' }, url);
  }
});

/* 저장소 config.json 에 n8n 을 켠 원문(대표가 n8n 을 켠 날의 모양). n8n 이 원래 켜져 있어도 같은 원문이 된다. */
function repoConfigTextWithN8nOn(eol) {
  const lines = repoConfigText.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf('  "n8n": {');
  assert.ok(start > 0, 'n8n 블록');
  for (let index = start + 1; lines[index] !== '  },' && lines[index] !== '  }'; index += 1) {
    lines[index] = lines[index]
      .replace(/^(    "enabled": )(?:true|false)(,?)$/, '$1true$2')
      .replace(/^(    "inquiryWebhookUrl": )"[^"]*"(,?)$/, '$1"https://n8n.owner-live.example.test/webhook/manmul-inquiry"$2');
  }
  return lines.join(eol);
}

test('config 변환은 inbox 와 n8n 의 enabled·inquiryWebhookUrl 만 바꾸고 나머지는 바이트까지 그대로다(LF·CRLF·마지막 줄바꿈)', () => {
  const lf = repoConfigText.replace(/\r\n/g, '\n');
  assert.equal(`${JSON.stringify(JSON.parse(lf), null, 2)}\n`, lf, '저장소 config.json 은 2칸 들여쓰기 표준 JSON 이어야 한다');
  for (const eol of ['\n', '\r\n']) {
    for (const original of [lf.replace(/\n/g, eol), repoConfigTextWithN8nOn(eol)]) {
      const result = helper.offlineSiteConfigText(original);
      const before = original.split(eol);
      const after = result.split(eol);
      const start = before.indexOf('  "inbox": {');
      assert.ok(start > 0, 'inbox 블록');
      let end = start + 1;
      while (before[end] !== '  },' && before[end] !== '  }') end += 1;
      // inbox 앞(n8n 포함): 줄 수 그대로, n8n 의 두 값 줄만 꺼진 값으로 바뀐다.
      const n8nStart = before.indexOf('  "n8n": {');
      assert.ok(n8nStart > 0 && n8nStart < start, 'n8n 블록은 inbox 앞에 있다');
      let n8nEnd = n8nStart + 1;
      while (before[n8nEnd] !== '  },' && before[n8nEnd] !== '  }') n8nEnd += 1;
      for (let index = 0; index < start; index += 1) {
        const inN8n = index > n8nStart && index < n8nEnd && /^    "(?:enabled|inquiryWebhookUrl)": /.test(before[index]);
        if (inN8n && /^    "enabled": /.test(before[index])) assert.equal(after[index], before[index].replace(/(?:true|false)(,?)$/, 'false$1'), before[index]);
        else if (inN8n) assert.equal(after[index], before[index].replace(/"[^"]*"(,?)$/, '""$1'), before[index]);
        else assert.equal(after[index], before[index], `${index + 1}번째 줄`);
      }
      assert.deepEqual(after.slice(start, start + 4), ['  "inbox": {', '    "enabled": false,', '    "url": ""', before[end]]);
      assert.deepEqual(after.slice(start + 4), before.slice(end + 1));
      assert.equal(result.endsWith(eol), true);
      const served = JSON.parse(result);
      assert.deepEqual({ enabled: served.n8n.enabled, inquiryWebhookUrl: served.n8n.inquiryWebhookUrl }, { enabled: false, inquiryWebhookUrl: '' });
      assert.deepEqual(Object.keys(served.n8n), Object.keys(JSON.parse(original).n8n), 'n8n 의 다른 키·순서는 그대로');
    }
  }
  assert.equal(helper.offlineSiteConfigText('{"inbox":{"enabled":true,"url":"x"}}'), '{\n  "inbox": {\n    "enabled": false,\n    "url": ""\n  }\n}');
  assert.equal(helper.offlineSiteConfigText('{"n8n":{"inquiryWebhookUrl":"https://n8n.example.test/w","enabled":true,"note":"k"}}'), '{\n  "n8n": {\n    "inquiryWebhookUrl": "",\n    "enabled": false,\n    "note": "k"\n  }\n}');
  assert.equal(helper.offlineSiteConfigText('{"n8n":null}'), '{\n  "n8n": {\n    "enabled": false,\n    "inquiryWebhookUrl": ""\n  }\n}');
  assert.equal(helper.offlineSiteConfigText('not json'), null);
  assert.equal(helper.offlineSiteConfigText('[1]'), null);
  assert.deepEqual(helper.siteConfigWithInboxOff(), {
    ...repoConfig,
    ...(Object.hasOwn(repoConfig, 'n8n') ? { n8n: { ...repoConfig.n8n, enabled: false, inquiryWebhookUrl: '' } } : {}),
    inbox: { enabled: false, url: '' },
  });
});

test('n8n 을 켠 저장소 설정도 페이지에는 n8n·접수함 꺼짐으로 간다(웹훅 주소가 페이지로 가지 않는다)', async () => {
  const { page } = await openPage();
  const body = repoConfigTextWithN8nOn('\n');
  const outcome = await dispatch(page, { url: `${LOCAL}/data/config.json`, server: { status: 200, headers: {}, body } });
  const served = JSON.parse(outcome.body);
  assert.equal(served.n8n.enabled, false);
  assert.equal(served.n8n.inquiryWebhookUrl, '');
  assert.equal(outcome.body.includes('n8n.owner-live.example.test'), false);
  assert.deepEqual(served.forms, repoConfig.forms, 'forms 는 그대로 — 시험은 Web3Forms 를 가짜로 받는다');
});

test('마지막 그물: 시험이 받지 않은 로컬 밖 쓰기 요청(POST 등)은 abort·기록, 읽기 요청·로컬 요청·시험이 받은 요청은 그대로', async () => {
  helper.state.blockedRequests.length = 0;
  try {
    const { page } = await openPage();
    for (const [url, method] of [
      ['https://n8n.owner-live.example.test/webhook/manmul-inquiry', 'POST'],
      ['https://hooks.owner-live.example.test/lead', 'PUT'],
      ['https://hooks.owner-live.example.test/lead', 'post'],
    ]) {
      assert.deepEqual(await dispatch(page, { url, method }), { kind: 'abort', code: 'blockedbyclient' }, `${method} ${url}`);
    }
    assert.deepEqual(helper.state.blockedRequests.map(({ method }) => method), ['POST', 'PUT', 'post']);
    helper.state.blockedRequests.length = 0;
    for (const [url, method] of [
      ['https://fonts.googleapis.com/css2', 'GET'],
      ['https://pf.kakao.com/_x/chat', 'HEAD'],
      ['https://hooks.owner-live.example.test/lead', 'OPTIONS'],
      [`${LOCAL}/api/office`, 'POST'],
      ['http://app.localhost:1/save', 'POST'],
    ]) {
      assert.deepEqual(await dispatch(page, { url, method }), { kind: 'network', via: 'no-route' }, `${method} ${url}`);
    }
    await page.route('https://n8n.example.test/webhook/pilot', (route) => route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));
    assert.equal((await dispatch(page, { url: 'https://n8n.example.test/webhook/pilot', method: 'POST' })).kind, 'fulfill');
    await page.context().route('https://hooks.example.test/**', (route) => route.abort('failed'));
    assert.deepEqual(await dispatch(page, { url: 'https://hooks.example.test/x', method: 'POST' }), { kind: 'abort', code: 'failed' }, '시험이 직접 막은 요청은 기록하지 않는다');
    assert.equal(helper.state.blockedRequests.length, 0);
    assert.equal(helper.isExternalHttp(new URL('https://api.web3forms.com.evil.example/submit')), true);
    for (const url of [`${LOCAL}/x`, 'http://localhost:1/x', 'http://[::1]:2/x', 'data:text/plain,x', 'blob:http://127.0.0.1/x']) assert.equal(helper.isExternalHttp(new URL(url)), false, url);
  } finally {
    helper.state.blockedRequests.length = 0;
  }
});

test('config 라우트는 닫히는 context 의 오류(fetch·text·fulfill)를 던지지 않고 abort 로 끝낸다', async () => {
  const { page } = await openPage();
  const serve = page.context().routes.find(({ handler }) => handler.name === 'serveSiteConfig').handler;
  const before = helper.state.siteConfigErrors.length;
  const disposed = () => { throw new Error('Response has been disposed'); };
  const scenarios = [
    { fetch: async () => { throw new Error('Target page, context or browser has been closed'); } },
    { fetch: async () => ({ status: () => 200, headers: () => ({}), text: async () => disposed() }) },
    { fetch: async () => ({ status: () => 200, headers: () => ({}), text: async () => repoConfigText }), fulfill: async () => { throw new Error('Target closed'); }, abortThrows: true },
  ];
  for (const scenario of scenarios) {
    const calls = [];
    const route = {
      request: () => ({ url: () => `${LOCAL}/data/config.json`, method: () => 'GET' }),
      fetch: scenario.fetch,
      fulfill: scenario.fulfill || (async (options) => { calls.push(['fulfill', options]); }),
      abort: async (code) => { calls.push(['abort', code]); if (scenario.abortThrows) throw new Error('Route is already handled!'); },
    };
    await assert.doesNotReject(() => serve(route));
    assert.deepEqual(calls, [['abort', 'failed']]);
  }
  assert.equal(helper.state.siteConfigErrors.length, before + scenarios.length);
  helper.state.siteConfigErrors.length = before;
});

test('막은 요청이 있으면 프로세스가 1 로 끝나고(node --test 가 파일을 실패로 친다), 없으면 0 이다', () => {
  const script = (blocked) => `
    const Module = require('node:module');
    const load = Module._load;
    const fakeContext = { routes: [], async route(matcher, handler) { this.routes.push(handler); } };
    const fake = { chromium: { async launch() { return { async newContext() { return fakeContext; }, async newPage() { return { context: () => fakeContext }; } }; } } };
    Module._load = function (request, ...rest) { return request === 'playwright' ? fake : load.call(this, request, ...rest); };
    const helper = require(${JSON.stringify(HELPER_PATH)});
    (async () => {
      await (await fake.chromium.launch()).newContext();
      if (${blocked}) {
        const deny = fakeContext.routes.find((handler) => handler.name === 'denyUnhandledWrite');
        await deny({ request: () => ({ method: () => 'POST', url: () => 'https://n8n.owner-live.example.test/webhook/x' }), abort: async () => {}, fallback: async () => {} });
      }
    })();`;
  const run = (blocked) => spawnSync(process.execPath, ['-e', script(blocked)], { encoding: 'utf8', env: process.env, timeout: 60000 });
  const blocked = run(true);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.match(blocked.stderr, /실제 서버로 가려던 요청 1건을 막았습니다 — 이 시험은 실패입니다/);
  assert.match(blocked.stderr, /POST https:\/\/n8n\.owner-live\.example\.test\/webhook\/x/);
  const clean = run(false);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stderr.includes('[e2e-offline]'), false, clean.stderr);
});

test('config 라우트는 로컬 서버의 …/data/config.json 만 받는다', () => {
  for (const url of [`${LOCAL}/data/config.json`, 'http://localhost:3000/manmool/data/config.json', 'http://[::1]:8080/data/config.json', 'http://app.localhost:1/data/config.json']) {
    assert.equal(helper.isSiteConfigUrl(new URL(url)), true, url);
  }
  for (const url of ['https://01023978629.github.io/manmool/data/config.json', `${LOCAL}/data/config.json.bak`, `${LOCAL}/data/site.json`, 'file:///C:/repo/data/config.json']) {
    assert.equal(helper.isSiteConfigUrl(new URL(url)), false, url);
  }
});

/* ---------- 저장소 검사(ensure-e2e-offline)가 실제로 문다 ---------- */
async function loadGuard() {
  return import(pathToFileURL(path.join(ROOT, 'scripts', 'ensure-e2e-offline.mjs')).href);
}

function copyRepoSubset() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-e2e-offline-'));
  fs.cpSync(path.join(ROOT, 'tests'), path.join(temp, 'tests'), { recursive: true });
  for (const relative of ['data/config.json', 'office-api.json', 'office-portal-api.json', '.github/workflows/deploy-pages.yml']) {
    fs.mkdirSync(path.dirname(path.join(temp, relative)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), path.join(temp, relative));
  }
  return temp;
}

function edit(root, relative, change) {
  const file = path.join(root, ...relative.split('/'));
  const before = fs.readFileSync(file, 'utf8');
  const after = change(before);
  assert.notEqual(after, before, `${relative} 변형이 적용되지 않았다`);
  fs.writeFileSync(file, after);
}

test('ensure-e2e-offline 의 주석 가리기: 문자열·템플릿·정규식 안의 /* · // 는 코드로 남기고 주석만 공백으로 바꾼다', async () => {
  const { blankComments } = await loadGuard();
  const keep = (source, ...fragments) => {
    const { code, ok, error } = blankComments(source);
    assert.equal(ok, true, `${error} — ${source}`);
    assert.equal(code.length, source.length, '길이·줄 번호는 그대로');
    for (const fragment of fragments) assert.ok(code.includes(fragment), `${fragment} 가 남아야 한다 — ${JSON.stringify(code)}`);
    return code;
  };
  // 2026-11-19 리뷰에서 실제로 놓친 모양: glob 의 '/*' 뒤 코드가 다음 '*/' 까지 지워졌다.
  let code = keep("await context.route('**/*', (r) => r.fallback());\nawait page.route('https://api.web3forms.com/**', (r) => r.continue());\n", 'r.fallback()', 'r.continue()');
  assert.equal(code.split('\n').length, 3);
  code = keep('a(); /* 주석 continue() */ b(); // 끝 continue()\nc();', 'a();', 'b();', 'c();');
  assert.equal(code.includes('continue'), false, '진짜 주석은 가린다');
  keep('const t = `x ${y.map((v) => `/*${v}*/`).join("//")} z`; route.continue();', 'route.continue();', '`/*${v}*/`');
  keep('const re = /\\/\\*[/*]/g; const d = a / b; route.continue(); // x', 'route.continue();', '/\\/\\*[/*]/g');
  keep('if (x) return /[*/]/.test(s); route.continue();', 'route.continue();');
  keep("const s = 'it\\'s /* not */ a comment'; route.continue();", 'route.continue();', '/* not */');
  for (const broken of ['a(); /* 닫히지 않음', "const s = 'x;\nroute.continue();", 'const t = `x', 'f(() => { g();']) {
    assert.equal(blankComments(broken).ok, false, broken);
  }
});

test('ensure-e2e-offline: 저장소는 통과하고, 보호를 하나씩 깨면 각각 실패한다', async () => {
  const { verifyE2eOffline } = await loadGuard();
  assert.deepEqual(verifyE2eOffline(ROOT), []);
  const helperLine = /^require\('\.\/helpers\/e2e-offline\.cjs'\);\r?\n/m;
  const liveUrl = repoConfig.inbox && repoConfig.inbox.url;
  const cases = [
    ['helper require 삭제', 'tests/inquiry-result-honesty.e2e.cjs', (s) => s.replace(helperLine, ''), /inquiry-result-honesty\.e2e\.cjs: 첫 require/],
    ['helper 를 playwright 뒤로', 'tests/inquiry-phone.e2e.cjs', (s) => s.replace(helperLine, '').replace("const { chromium } = require('playwright');", "const { chromium } = require('playwright');\nrequire('./helpers/e2e-offline.cjs');"), /inquiry-phone\.e2e\.cjs: 첫 require/],
    ['route.continue 재등장', 'tests/service-design.e2e.cjs', (s) => s.replace('return route.fallback();', 'return route.continue();'), /service-design\.e2e\.cjs:\d+: route\.continue\(\)/],
    // 2026-11-19 리뷰: 예전 주석 제거는 glob 문자열('**/*') 안의 '/*' 를 주석 시작으로 읽어 이런 자리를 통째로 지웠다.
    ['glob 문자열 줄의 route.continue', 'tests/aluminum-screen-case.e2e.cjs', (s) => s.replace("=== 'GET' ? route.fallback() : route.abort());", "=== 'GET' ? route.continue() : route.abort());"), /aluminum-screen-case\.e2e\.cjs:\d+: route\.continue\(\)/],
    ['glob 문자열 뒤의 page.request.post', 'tests/recent-cases-20261013.e2e.cjs', (s) => s.replace(/(await context\.route\('\*\*\/\*'[^\n]*\n)/, '$1    await page.request.post(`${origin}/x`);\n'), /recent-cases-20261013\.e2e\.cjs:\d+: 브라우저 밖 요청/],
    ['route.fetch 로 실서버', 'tests/inquiry-phone.e2e.cjs', (s) => s.replace("await page.route('https://api.web3forms.com/**', (route) =>", "await page.route('https://script.google.com/**', async (route) => route.fulfill({ response: await route.fetch() }));\n  await page.route('https://api.web3forms.com/**', (route) =>"), /inquiry-phone\.e2e\.cjs:\d+: 브라우저 밖 요청/],
    ['context.request.get', 'tests/leak-kakao.e2e.cjs', (s) => s.replace('return { ctx, page };', 'await ctx.request.get(`${origin}/`);\n  return { ctx, page };'), /leak-kakao\.e2e\.cjs:\d+: 브라우저 밖 요청/],
    ['닫히지 않은 블록 주석', 'tests/hero-kakao.e2e.cjs', (s) => `${s}\n/* 닫지 않은 주석\n`, /hero-kakao\.e2e\.cjs: 주석·리터럴을 끝까지 읽지 못했습니다/],
    ['playwright-core 로 우회', 'tests/hero-kakao.e2e.cjs', (s) => s.replace("require('playwright')", "require('playwright-core')"), /hero-kakao\.e2e\.cjs: playwright 는 require\('playwright'\)/],
    ['unrouteAll', 'tests/leak-kakao.e2e.cjs', (s) => s.replace('return { ctx, page };', 'await ctx.unrouteAll();\n  return { ctx, page };'), /leak-kakao\.e2e\.cjs:\d+: unrouteAll/],
    ['실서버 abort 라우트 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace(/^\s*await context\.route\(isBlockedBackend, abortBackend\);\r?\n/m, ''), /라우트 세 개/],
    ['config inbox 끄기 라우트 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace(/^\s*await context\.route\(isSiteConfigUrl, serveSiteConfig\);\r?\n/m, ''), /라우트 세 개/],
    ['마지막 그물 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace(/^\s*await context\.route\(isExternalHttp, denyUnhandledWrite\);\r?\n/m, ''), /라우트 세 개/],
    ['마지막 그물을 맨 뒤로(시험 라우트보다 먼저 돈다)', 'tests/helpers/e2e-offline.cjs', (s) => s.replace(/^(\s*await context\.route\(isExternalHttp, denyUnhandledWrite\);\r?\n)([\s\S]*?await context\.route\(isBlockedBackend, abortBackend\);\r?\n)/m, '$2$1'), /라우트 세 개/],
    ['마지막 그물이 POST 도 통과', 'tests/helpers/e2e-offline.cjs', (s) => s.replace("new Set(['GET', 'HEAD', 'OPTIONS'])", "new Set(['GET', 'HEAD', 'OPTIONS', 'POST'])"), /GET·HEAD·OPTIONS/],
    ['n8n 끄기 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace('data.n8n = { ...n8n, ...N8N_OFF };', 'data.n8n = { ...n8n };'), /n8n 을 끄지 않습니다/],
    ['막아도 초록불', 'tests/helpers/e2e-offline.cjs', (s) => s.replace('process.exitCode = 1;', ''), /종료 코드를 1 로/],
    ['주석으로만 남은 보호', 'tests/helpers/e2e-offline.cjs', (s) => s.replace('process.exitCode = 1;', '// process.exitCode = 1;'), /종료 코드를 1 로/],
    ['config 처리기 오류를 던짐', 'tests/helpers/e2e-offline.cjs', (s) => s.replace("await route.abort('failed').catch(() => {});", 'throw error;'), /try\/catch/],
    ['차단 호스트에서 Apps Script 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace("  'script.google.com',\n", '').replace("  'script.google.com',\r\n", ''), /차단 호스트에 script\.google\.com/],
    ['이름풀이 차단 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace('MAP ${host} ~NOTFOUND', 'MAP ${host} 127.0.0.1'), /host-resolver-rules/],
    ['inbox 끄기 값 변조', 'tests/helpers/e2e-offline.cjs', (s) => s.replace("Object.freeze({ enabled: false, url: '' })", "Object.freeze({ enabled: true, url: '' })"), /inbox 끄기 값/],
    ['newPage 숨은 context 감싸기 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace('await prepareContext(page.context());', ''), /숨은 context/],
    ['워크플로 선행 검사 삭제', '.github/workflows/deploy-pages.yml', (s) => s.replace('node scripts/ensure-e2e-offline.mjs', 'node scripts/ensure-e2e-offline-removed.mjs'), /ensure-e2e-offline\.mjs 를 따로 돌리는 단계가 없습니다/],
  ];
  if (liveUrl) cases.push(['시험 파일에 라이브 접수함 주소', 'tests/inquiry-receipt.e2e.cjs', (s) => `${s}\n// ${liveUrl}\n`, /inquiry-receipt\.e2e\.cjs: 라이브 서버 주소/]);
  // 대표가 n8n 이나 전용 forms 주소를 켜면 그 주소도 라이브 접수 주소다(2026-11-19 리뷰).
  const n8nUrl = 'https://n8n.owner-live.example.test/webhook/manmul-inquiry';
  cases.push(['n8n 을 켠 설정의 웹훅 주소가 시험 파일에', [
    ['data/config.json', (s) => s.replace(/("n8n": \{[\s\S]*?"inquiryWebhookUrl": )"[^"]*"/, `$1"${n8nUrl}"`)],
    ['tests/inquiry-phone.e2e.cjs', (s) => `${s}\n// ${n8nUrl}\n`],
  ], /inquiry-phone\.e2e\.cjs: 라이브 서버 주소/]);
  const hookUrl = 'https://hooks.owner-live.example.test/lead';
  cases.push(['전용 forms endpoint 가 시험 파일에', [
    ['data/config.json', (s) => s.replace(/("forms": \{[\s\S]*?"endpoint": )"[^"]*"/, `$1"${hookUrl}"`)],
    ['tests/inquiry-usability.e2e.cjs', (s) => `${s}\n// ${hookUrl}\n`],
  ], /inquiry-usability\.e2e\.cjs: 라이브 서버 주소/]);
  for (const [label, target, ...rest] of cases) {
    const edits = typeof target === 'string' ? [[target, rest.shift()]] : target;
    const [expected] = rest;
    const temp = copyRepoSubset();
    try {
      assert.deepEqual(verifyE2eOffline(temp), [], `${label}: 변형 전 사본은 통과해야 한다`);
      for (const [relative, change] of edits) edit(temp, relative, change);
      const failures = verifyE2eOffline(temp);
      assert.ok(failures.some((message) => expected.test(message)), `${label}: 실패해야 한다 — ${JSON.stringify(failures)}`);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
});

test('ensure-e2e-offline: 워크플로에서 오프라인 검사가 첫 e2e 뒤로 밀리면 실패한다', async () => {
  const { verifyE2eOffline } = await loadGuard();
  const temp = copyRepoSubset();
  try {
    edit(temp, '.github/workflows/deploy-pages.yml', (s) => s.replace('tests/lead-inbox.e2e.cjs', 'tests/lead-inbox.e2e.cjs\n          tests/e2e-offline.test.cjs').replace(/node --test tests\/e2e-offline\.test\.cjs/, 'node --test tests/lead-transport.test.cjs'));
    const failures = verifyE2eOffline(temp);
    assert.ok(failures.some((message) => /첫 e2e 보다 뒤에/.test(message)), JSON.stringify(failures));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
