/* e2e-offline.cjs — 브라우저 e2e 를 실제 서버(접수함·메일 접수)와 끊는다 (2026-11-19)

   왜 필요한가.
   e2e 는 저마다 저장소 루트를 정적 서버로 띄우므로 페이지가 진짜 data/config.json 을 읽는다.
   PR #238 로 config.json 의 inbox 가 켜지자(대표의 라이브 문의 접수함 주소), js/lead-transport.js 의
   deliver() 가 시험 문의를 라이브 접수함에도 POST 했다. 배포 검사 한 번에 대표 시트에 시험 행 16개가
   생겼고, '저장소 기본값 = 접수함 꺼짐'을 전제로 쓴 검사 9건이 깨졌다.
   저장소 값은 운영 값이 맞다(그대로 둔다). 고칠 것은 검사가 저장소의 라이브 값에 기대는 구조다.

   어떻게 막는가 — tests/*.cjs 가 playwright 보다 먼저 이 파일을 require 하면:
     ① chromium.launch(·launchPersistentContext·connect) 를 감싸, 모든 BrowserContext 에
        (browser.newContext 로 만든 것과 browser.newPage 뒤에 숨은 것 모두) 시험 코드보다 먼저
        context 라우트 세 개를 건다.
          a) 로컬 서버의 …/data/config.json — 서버가 준 응답을 그대로 받아 "inbox" 를
             { enabled: false, url: '' } 로, "n8n" 의 enabled·inquiryWebhookUrl 을 false·'' 로 바꿔 돌려준다.
             나머지 키·순서·들여쓰기·줄끝은 그대로, 404·503 같은 응답도 그대로다.
             → 시험 안의 기본값은 '접수함·n8n 꺼짐, 메일은 forms(Web3Forms)'. 시험은 Web3Forms 를 가짜로 받는다.
          b) script.google.com · *script.googleusercontent.com · api.web3forms.com · formspree.io
             로 가는 요청은 abort 하고 주소를 blockedRequests 에 남긴다.
          c) (마지막 그물) 위 둘과 시험 라우트가 처리하지 않은, 로컬이 아닌 곳으로 가는 GET·HEAD·OPTIONS 밖의
             요청(POST 등 — 문의가 나가는 모양)도 abort·기록한다. config.json 이 앞으로 다른 접수 주소
             (n8n 웹훅, forms 의 generic endpoint 등)를 갖게 돼도 시험 문의가 실서버에 닿지 않는다.
        막은 요청이 하나라도 있으면 프로세스 종료 코드를 1 로 만든다 — node --test 가 그 파일을 실패로 친다.
        막혔는데 초록불이면 '다른 이유로 통과'한 것이라(예: 메일 성공·접수함 abort → 성공 화면) 숨기지 않는다.
        일부러 막히는 요청을 보려는 시험은 그 주소를 자기 라우트로 먼저 받는다.
     ② chromium 실행 인자에 --host-resolver-rules 로 b) 의 호스트를 '이름 없음'으로 만든다.
        라우트를 건너뛴 요청(route.continue, 라우트 밖 요청)이 생겨도 실제 서버에는 닿지 않는다.
        route.fulfill 로 꾸민 가짜 응답은 이름풀이를 하지 않으므로 그대로 동작한다.

   우선순위(Playwright 1.55): page 라우트가 context 라우트보다 먼저, 같은 층에서는 나중에 건 것이 먼저다.
   이 파일의 라우트는 context 를 만든 직후 가장 먼저 걸리므로, 시험이 건 page·context 라우트가 언제나 먼저 돈다
   (c 를 맨 먼저 걸어 맨 마지막에 돈다).
   시험 라우트가 config.json 을 직접 fulfill 하면 그 값이 쓰인다(접수함을 시험하는 검사는 가짜 주소로 켠다).
   시험 라우트가 그 요청을 직접 처리하지 않을 때는 route.fallback() 으로 넘겨야 이 파일의 라우트에 닿는다.
   route.continue() 는 남은 라우트를 건너뛰고 바로 네트워크로 가므로 tests/ 에서 쓰지 않는다.
   브라우저 밖 요청(page.request·route.fetch())도 라우트를 거치지 않으므로 쓰지 않는다
   (scripts/ensure-e2e-offline.mjs 가 막는다. 이 파일의 config 라우트만 로컬 서버에 route.fetch() 를 쓴다).

   tests/e2e-offline.test.cjs 가 브라우저 없이 이 동작(순서·인자·config 변환)을 고정한다. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE_CONFIG = path.join(ROOT, 'data', 'config.json');

// 시험 중에는 절대 닿으면 안 되는 실제 접수 경로(라이브 접수함 Apps Script, 메일 접수 서비스).
const BLOCKED_HOSTS = Object.freeze([
  'script.google.com',
  'script.googleusercontent.com',
  '*-script.googleusercontent.com',
  'api.web3forms.com',
  'formspree.io',
]);
const INBOX_OFF = Object.freeze({ enabled: false, url: '' });
const N8N_OFF = Object.freeze({ enabled: false, inquiryWebhookUrl: '' });
const HOST_RESOLVER_RULES = BLOCKED_HOSTS.map((host) => `MAP ${host} ~NOTFOUND`).join(', ');
const HOST_RESOLVER_FLAG = '--host-resolver-rules=';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
// 값을 보내지 않는 요청. 이 밖의 요청이 로컬 밖으로 가면(문의 POST 등) 마지막 그물이 막는다.
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const state = { blockedRequests: [], siteConfigRewrites: 0, siteConfigErrors: [] };
const prepared = new WeakSet();
const WRAPPED = Symbol.for('manmool.e2eOffline.wrapped');

const hostPatterns = BLOCKED_HOSTS.map((host) => new RegExp(`^${host.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]*')}$`));

function toUrl(value) {
  if (value instanceof URL) return value;
  try { return new URL(String(value)); } catch (_) { return null; }
}

function isBlockedBackend(value) {
  const url = toUrl(value);
  if (!url || !/^(?:https?|wss?):$/.test(url.protocol)) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return hostPatterns.some((pattern) => pattern.test(host));
}

function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost');
}

function isSiteConfigUrl(value) {
  const url = toUrl(value);
  if (!url || !/^https?:$/.test(url.protocol)) return false;
  return isLoopbackHost(url.hostname.toLowerCase()) && url.pathname.endsWith('/data/config.json');
}

/* 로컬 서버(127.0.0.1·localhost·[::1]·*.localhost)가 아닌 http(s) 주소 — 마지막 그물이 본다. */
function isExternalHttp(value) {
  const url = toUrl(value);
  if (!url || !/^https?:$/.test(url.protocol)) return false;
  return !isLoopbackHost(url.hostname.toLowerCase().replace(/\.$/, ''));
}

/* 사이트 설정 원문에서 접수 경로만 끈다 — "inbox" 는 INBOX_OFF 로, "n8n" 은 enabled·inquiryWebhookUrl 만 끈다
   (n8n 의 다른 키는 그대로라, 이미 꺼진 저장소 값은 바이트까지 같다). 바꿀 것이 없으면(JSON 아님·둘 다 없음) null.
   forms 는 바꾸지 않는다 — 시험은 Web3Forms 를 가짜로 받고, 다른 곳으로 가는 POST 는 마지막 그물이 막는다. */
function offlineSiteConfigText(text) {
  let data;
  try { data = JSON.parse(text); } catch (_) { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
  if (!has('inbox') && !has('n8n')) return null;
  if (has('inbox')) data.inbox = { ...INBOX_OFF };
  if (has('n8n')) {
    const n8n = data.n8n && typeof data.n8n === 'object' && !Array.isArray(data.n8n) ? data.n8n : {};
    data.n8n = { ...n8n, ...N8N_OFF };
  }
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const body = JSON.stringify(data, null, 2).replace(/\n/g, eol);
  return /\r?\n$/.test(text) ? body + eol : body;
}

/* 저장소 data/config.json 에서 접수 경로(inbox·n8n)를 끈 객체 — 페이지에 설정을 직접 넣는 검사가 쓴다. */
function siteConfigWithInboxOff() {
  return JSON.parse(offlineSiteConfigText(fs.readFileSync(SITE_CONFIG, 'utf8')));
}

function record(route) {
  const request = route.request();
  state.blockedRequests.push({ method: request.method(), url: request.url() });
}

async function serveSiteConfig(route) {
  // 처리기 전체를 감싼다. context·page 가 닫히는 도중이면 fetch·text()('Response has been disposed')·fulfill 이 던질 수 있는데,
  // Playwright 는 라우트 처리기를 기다려 주지 않으므로 그대로 두면 unhandled rejection 으로 엉뚱한 시험이 실패한다.
  // 실패하면 설정을 내보내지 않는다(abort) — 원본(라이브 접수함이 켜진 값)이 페이지에 가는 일은 없다.
  try {
    const response = await route.fetch();
    const text = await response.text();
    const rewritten = offlineSiteConfigText(text);
    if (rewritten != null) state.siteConfigRewrites += 1;
    const headers = {};
    for (const [name, value] of Object.entries(response.headers())) {
      if (!/^(?:content-length|content-encoding|transfer-encoding)$/i.test(name)) headers[name] = value;
    }
    await route.fulfill({ status: response.status(), headers, body: rewritten == null ? text : rewritten });
  } catch (error) {
    state.siteConfigErrors.push(String((error && error.message) || error));
    await route.abort('failed').catch(() => {});
  }
}

async function abortBackend(route) {
  record(route);
  await route.abort('blockedbyclient').catch(() => {});
}

/* 마지막 그물 — 시험 라우트·위 두 라우트가 처리하지 않은 로컬 밖 요청 중 값을 보내는 것(POST 등)을 막는다. */
async function denyUnhandledWrite(route) {
  if (READ_ONLY_METHODS.has(String(route.request().method()).toUpperCase())) return route.fallback();
  record(route);
  await route.abort('blockedbyclient').catch(() => {});
}

/* 시험 코드가 라우트를 걸기 전에 불린다 — 그래서 시험 라우트가 항상 먼저 돈다. 한 context 에 한 번만.
   같은 층에서는 나중에 건 것이 먼저 돌므로, 마지막 그물을 맨 먼저 걸어 맨 마지막에 돌게 한다. */
async function prepareContext(context) {
  if (!context || prepared.has(context)) return context;
  prepared.add(context);
  await context.route(isExternalHttp, denyUnhandledWrite);
  await context.route(isSiteConfigUrl, serveSiteConfig);
  await context.route(isBlockedBackend, abortBackend);
  return context;
}

function withOfflineArgs(options) {
  const source = options || {};
  const args = Array.isArray(source.args) ? [...source.args] : [];
  const index = args.findIndex((arg) => typeof arg === 'string' && arg.startsWith(HOST_RESOLVER_FLAG));
  // 규칙은 앞에 있는 것이 먼저 맞으므로 차단 규칙을 맨 앞에 둔다.
  if (index >= 0) args[index] = `${HOST_RESOLVER_FLAG}${HOST_RESOLVER_RULES}, ${args[index].slice(HOST_RESOLVER_FLAG.length)}`;
  else args.push(`${HOST_RESOLVER_FLAG}${HOST_RESOLVER_RULES}`);
  return { ...source, args };
}

function wrapBrowser(browser) {
  if (!browser || browser[WRAPPED]) return browser;
  Object.defineProperty(browser, WRAPPED, { value: true });
  const newContext = browser.newContext;
  const newPage = browser.newPage;
  browser.newContext = async function offlineNewContext(...args) {
    return prepareContext(await newContext.apply(this, args));
  };
  browser.newPage = async function offlineNewPage(...args) {
    // Playwright 의 newPage 는 this.newContext 를 거치므로 보통 이미 준비돼 있다. 아니어도 여기서 건다.
    const page = await newPage.apply(this, args);
    await prepareContext(page.context());
    return page;
  };
  return browser;
}

async function wrapConnected(browser) {
  wrapBrowser(browser);
  for (const context of typeof browser.contexts === 'function' ? browser.contexts() : []) await prepareContext(context);
  return browser;
}

function wrapBrowserType(browserType, chromiumArgs) {
  if (!browserType || browserType[WRAPPED]) return;
  Object.defineProperty(browserType, WRAPPED, { value: true });
  const argsFor = (options) => (chromiumArgs ? withOfflineArgs(options) : options);
  const launch = browserType.launch;
  if (typeof launch === 'function') {
    browserType.launch = async function offlineLaunch(options) {
      return wrapBrowser(await launch.call(this, argsFor(options)));
    };
  }
  const launchPersistentContext = browserType.launchPersistentContext;
  if (typeof launchPersistentContext === 'function') {
    browserType.launchPersistentContext = async function offlineLaunchPersistentContext(userDataDir, options) {
      return prepareContext(await launchPersistentContext.call(this, userDataDir, argsFor(options)));
    };
  }
  for (const name of ['connect', 'connectOverCDP']) {
    const original = browserType[name];
    if (typeof original === 'function') {
      browserType[name] = async function offlineConnect(...args) {
        return wrapConnected(await original.apply(this, args));
      };
    }
  }
}

function install(playwright) {
  for (const name of ['chromium', 'firefox', 'webkit']) wrapBrowserType(playwright && playwright[name], name === 'chromium');
  return playwright;
}

install(require('playwright'));

/* 프로세스가 끝날 때: 막은 요청이 있으면 알리고 종료 코드를 1 로 만든다(node --test 가 이 파일을 실패로 친다). */
function reportOnExit() {
  if (state.siteConfigErrors.length) {
    process.stderr.write(`[e2e-offline] config.json 을 고쳐 주지 못하고 abort 한 요청 ${state.siteConfigErrors.length}건(보통 닫히는 중인 context): ${state.siteConfigErrors.slice(0, 3).join(' | ')}\n`);
  }
  if (!state.blockedRequests.length) return;
  const lines = state.blockedRequests.map(({ method, url }) => `  - ${method} ${url}`);
  process.stderr.write(`[e2e-offline] 실제 서버로 가려던 요청 ${lines.length}건을 막았습니다 — 이 시험은 실패입니다. 가짜로 받을 주소면 시험 라우트에서 route.fulfill 로 받으세요:\n${lines.join('\n')}\n`);
  process.exitCode = 1;
}
process.on('exit', reportOnExit);

module.exports = {
  BLOCKED_HOSTS,
  INBOX_OFF,
  N8N_OFF,
  HOST_RESOLVER_RULES,
  state,
  blockedRequests: state.blockedRequests,
  isBlockedBackend,
  isSiteConfigUrl,
  isExternalHttp,
  offlineSiteConfigText,
  siteConfigWithInboxOff,
  prepareContext,
  withOfflineArgs,
  install,
};
