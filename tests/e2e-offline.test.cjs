/* e2e-offline.test.cjs — tests/helpers/e2e-offline.cjs 의 동작을 브라우저 없이 고정한다 (2026-11-19)

   지키는 것
     ① 모든 BrowserContext(newContext·newPage 뒤의 숨은 context)에 helper 라우트가 시험 라우트보다 먼저, 한 번만 걸린다.
     ② Playwright 1.55 의 라우트 순서(page → context, 같은 층은 나중 것 먼저, fallback 은 다음 라우트로, continue 는 네트워크로)
        에서: 기본값은 config.json 의 inbox 꺼짐, 시험이 직접 준 설정은 그대로, 실서버 요청은 abort·기록.
     ③ config 변환은 inbox 만 바꾸고 나머지는 바이트까지 그대로(키 순서·들여쓰기·줄끝·마지막 줄바꿈).
     ④ chromium 실행 인자에 이름풀이 차단(--host-resolver-rules)이 들어간다.
     ⑤ scripts/ensure-e2e-offline.mjs 가 고장(helper 빠짐·순서 뒤집힘·route.continue·보호 삭제·라이브 주소·워크플로 순서)을 잡는다.
   실제 브라우저 동작은 CI 의 Playwright e2e 가 본다. 여기서는 실제 네트워크를 쓰지 않는다. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
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
  assert.equal(context.routes.length, 2, 'newContext 직후 helper 라우트 두 개');
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
    assert.equal(page.context().routes.length, 2, `newPageSkipsNewContext=${newPageSkipsNewContext}`);
    assert.equal(page.routes.length, 0);
  }
});

test('시험 라우트가 없으면 config.json 은 서버 원문에서 inbox 만 꺼서 돌려준다', async () => {
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
  for (const key of Object.keys(repoConfig)) if (key !== 'inbox') assert.deepEqual(served[key], repoConfig[key], key);
  if (repoConfig.inbox && repoConfig.inbox.url) assert.equal(outcome.body.includes(repoConfig.inbox.url), false, '라이브 접수함 주소가 페이지로 가면 안 된다');
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

test('config 변환은 inbox 만 바꾸고 나머지는 바이트까지 그대로다(LF·CRLF·마지막 줄바꿈)', () => {
  const lf = repoConfigText.replace(/\r\n/g, '\n');
  assert.equal(`${JSON.stringify(JSON.parse(lf), null, 2)}\n`, lf, '저장소 config.json 은 2칸 들여쓰기 표준 JSON 이어야 한다');
  for (const eol of ['\n', '\r\n']) {
    const original = lf.replace(/\n/g, eol);
    const result = helper.offlineSiteConfigText(original);
    const before = original.split(eol);
    const after = result.split(eol);
    const start = before.indexOf('  "inbox": {');
    assert.ok(start > 0, 'inbox 블록');
    let end = start + 1;
    while (before[end] !== '  },' && before[end] !== '  }') end += 1;
    assert.deepEqual(after.slice(0, start), before.slice(0, start));
    assert.deepEqual(after.slice(start, start + 4), ['  "inbox": {', '    "enabled": false,', '    "url": ""', before[end]]);
    assert.deepEqual(after.slice(start + 4), before.slice(end + 1));
    assert.equal(result.endsWith(eol), true);
  }
  assert.equal(helper.offlineSiteConfigText('{"inbox":{"enabled":true,"url":"x"}}'), '{\n  "inbox": {\n    "enabled": false,\n    "url": ""\n  }\n}');
  assert.equal(helper.offlineSiteConfigText('not json'), null);
  assert.equal(helper.offlineSiteConfigText('[1]'), null);
  assert.deepEqual(helper.siteConfigWithInboxOff(), { ...repoConfig, inbox: { enabled: false, url: '' } });
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

test('ensure-e2e-offline: 저장소는 통과하고, 보호를 하나씩 깨면 각각 실패한다', async () => {
  const { verifyE2eOffline } = await loadGuard();
  assert.deepEqual(verifyE2eOffline(ROOT), []);
  const helperLine = /^require\('\.\/helpers\/e2e-offline\.cjs'\);\r?\n/m;
  const liveUrl = repoConfig.inbox && repoConfig.inbox.url;
  const cases = [
    ['helper require 삭제', 'tests/inquiry-result-honesty.e2e.cjs', (s) => s.replace(helperLine, ''), /inquiry-result-honesty\.e2e\.cjs: 첫 require/],
    ['helper 를 playwright 뒤로', 'tests/inquiry-phone.e2e.cjs', (s) => s.replace(helperLine, '').replace("const { chromium } = require('playwright');", "const { chromium } = require('playwright');\nrequire('./helpers/e2e-offline.cjs');"), /inquiry-phone\.e2e\.cjs: 첫 require/],
    ['route.continue 재등장', 'tests/service-design.e2e.cjs', (s) => s.replace('return route.fallback();', 'return route.continue();'), /service-design\.e2e\.cjs: route\.continue\(\)/],
    ['playwright-core 로 우회', 'tests/hero-kakao.e2e.cjs', (s) => s.replace("require('playwright')", "require('playwright-core')"), /hero-kakao\.e2e\.cjs: playwright 는 require\('playwright'\)/],
    ['unrouteAll', 'tests/leak-kakao.e2e.cjs', (s) => s.replace('return { ctx, page };', 'await ctx.unrouteAll();\n  return { ctx, page };'), /leak-kakao\.e2e\.cjs: unrouteAll/],
    ['실서버 abort 라우트 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace(/^\s*await context\.route\(isBlockedBackend, abortBackend\);\r?\n/m, ''), /실서버 abort 라우트/],
    ['config inbox 끄기 라우트 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace(/^\s*await context\.route\(isSiteConfigUrl, serveSiteConfig\);\r?\n/m, ''), /config\.json\(inbox 끄기\) 라우트/],
    ['차단 호스트에서 Apps Script 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace("  'script.google.com',\n", '').replace("  'script.google.com',\r\n", ''), /차단 호스트에 script\.google\.com/],
    ['이름풀이 차단 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace('MAP ${host} ~NOTFOUND', 'MAP ${host} 127.0.0.1'), /host-resolver-rules/],
    ['inbox 끄기 값 변조', 'tests/helpers/e2e-offline.cjs', (s) => s.replace("Object.freeze({ enabled: false, url: '' })", "Object.freeze({ enabled: true, url: '' })"), /inbox 끄기 값/],
    ['newPage 숨은 context 감싸기 삭제', 'tests/helpers/e2e-offline.cjs', (s) => s.replace('await prepareContext(page.context());', ''), /숨은 context/],
    ['워크플로 선행 검사 삭제', '.github/workflows/deploy-pages.yml', (s) => s.replace('node scripts/ensure-e2e-offline.mjs', 'node scripts/ensure-e2e-offline-removed.mjs'), /ensure-e2e-offline\.mjs 를 따로 돌리는 단계가 없습니다/],
  ];
  if (liveUrl) cases.push(['시험 파일에 라이브 접수함 주소', 'tests/inquiry-receipt.e2e.cjs', (s) => `${s}\n// ${liveUrl}\n`, /inquiry-receipt\.e2e\.cjs: 라이브 서버 주소/]);
  for (const [label, relative, change, expected] of cases) {
    const temp = copyRepoSubset();
    try {
      assert.deepEqual(verifyE2eOffline(temp), [], `${label}: 변형 전 사본은 통과해야 한다`);
      edit(temp, relative, change);
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
