/* ensure-e2e-offline.mjs — 브라우저 e2e 가 실제 접수함·메일 접수 서버에 닿지 못하게 지킨다 (2026-11-19)

   사고: PR #238 로 data/config.json 의 inbox 가 라이브 접수함 주소로 켜진 뒤, 배포 검사의 e2e 가 저장소 루트를
   그대로 띄워 시험 문의를 라이브 접수함에 보냈다(대표 시트에 시험 행 16개). 검사 9건도 깨졌다.
   해결은 tests/helpers/e2e-offline.cjs — 모든 BrowserContext 에 'config.json 의 inbox·n8n 끄기',
   'Apps Script·메일 접수 호스트 abort', '로컬 밖 쓰기 요청 abort(마지막 그물)' 라우트를 먼저 걸고,
   브라우저 이름풀이에서도 그 호스트를 지운다. 막은 요청이 있으면 그 시험 파일은 실패한다.

   이 검사가 지키는 것
     ① playwright 를 쓰는 tests/*.cjs 는 첫 require 가 './helpers/e2e-offline.cjs' 다(playwright 보다 먼저).
        playwright 는 require('playwright') 로만 쓴다(playwright-core·@playwright/test·import() 는 helper 를 비켜 간다).
     ② 그 파일들에 route.continue() 가 없다 — continue 는 남은 라우트(helper)를 건너뛰고 바로 네트워크로 간다.
        직접 처리하지 않는 요청은 route.fallback() 으로 넘긴다. unrouteAll()·브라우저 밖 요청(APIRequestContext·
        route.fetch())도 금지. 주석만 지우고 본다(문자열·정규식 안의 '/*'·'//' 는 주석이 아니다 — blankComments).
     ③ helper 가 세 보호(config inbox·n8n 끄기·실서버 abort·마지막 그물)와 순서, 막으면 실패, 이름풀이 차단,
        newContext·newPage 감싸기를 유지한다.
     ④ tests/ 어디에도 라이브 접수 주소(접수함·n8n·전용 forms endpoint·관리사무소 API)·실제 Web3Forms 키가 글자로 들어가지 않는다.
     ⑤ 배포 워크플로가 첫 e2e 보다 먼저 이 검사와 tests/e2e-offline.test.cjs(동작 고정)를 돌리고,
        워크플로가 부르는 tests/*.e2e.cjs 는 모두 ①을 지킨다.

   실행: node scripts/ensure-e2e-offline.mjs [저장소 루트]  (tests/e2e-offline.test.cjs 가 임시 사본을 망가뜨려 이 검사가 실패하는지 확인한다) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HELPER = 'tests/helpers/e2e-offline.cjs';
export const HELPER_SPECIFIER = './helpers/e2e-offline.cjs';
export const SELF_TEST = 'tests/e2e-offline.test.cjs';
const WORKFLOW = '.github/workflows/deploy-pages.yml';
const PLAYWRIGHT_MODULE = String.raw`(?:playwright|playwright-core|@playwright\/test)`;
const USES_PLAYWRIGHT = new RegExp(String.raw`\brequire\s*\(\s*(['"])${PLAYWRIGHT_MODULE}\1\s*\)|\bimport\s*\(\s*(['"])${PLAYWRIGHT_MODULE}\2\s*\)|\bfrom\s+(['"])${PLAYWRIGHT_MODULE}\3`);
const APPS_SCRIPT_URL = /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g;

const read = (root, relative, fileSystem) => fileSystem.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
const exists = (root, relative, fileSystem) => fileSystem.existsSync(path.join(root, ...relative.split('/')));

const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const CLOSERS = { ')': '(', ']': '[', '}': '{' };
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/* 주석만 같은 길이의 공백으로 바꾼다(줄바꿈은 남겨 줄 번호를 지킨다). 문자열·템플릿·정규식 리터럴은 그대로 둔다.
   2026-11-19 리뷰: 예전 정규식 방식(/\/\*[\s\S]*?\*\// 로 지우기)은 '**\/*'·'https://api.web3forms.com/**' 같은 glob 문자열 안의
   '/*' 를 주석 시작으로 읽어 다음 '*\/' 까지 진짜 코드를 지웠다. 그래서 그 사이의 route.continue()·page.request.get() 을 못 봤다
   (fallback 을 continue 로 되돌린 20곳 중 8곳이 통과했다).
   리터럴 판단이 어긋나도 코드를 덜 지우는 쪽(검사가 더 엄격해지는 쪽)으로 읽고, 끝에서 앞뒤가 안 맞으면
   (닫히지 않은 주석·문자열·템플릿, 괄호 짝) ok:false 로 알려 검사가 실패하게 한다 — 저장소의 시험 파일은 문법이 맞는 JS 다. */
export function blankComments(source) {
  const out = source.split('');
  const length = source.length;
  const brackets = [];
  const templates = []; // `${` 를 연 시점의 brackets 길이
  let index = 0;
  let previous = { kind: 'start', value: '' };
  let error = '';
  const blank = (from, to) => { for (let at = from; at < to; at += 1) if (out[at] !== '\n' && out[at] !== '\r') out[at] = ' '; };
  const isNewline = (char) => char === '\n' || char === '\r' || char === LINE_SEPARATOR || char === PARAGRAPH_SEPARATOR;
  const regexAllowed = () => {
    if (previous.kind === 'start') return true;
    if (previous.kind === 'word') return REGEX_AFTER_WORD.has(previous.value);
    if (previous.kind === 'punct') return !/^[)\]]$/.test(previous.value);
    return false; // 문자열·템플릿·정규식 바로 뒤의 / 는 나눗셈
  };
  const scanTemplate = () => { // index 는 ` 바로 뒤 또는 ${ } 의 } 바로 뒤
    while (index < length) {
      const char = source[index];
      if (char === '\\') { index += 2; continue; }
      if (char === '`') { index += 1; previous = { kind: 'literal', value: '`' }; return; }
      if (char === '$' && source[index + 1] === '{') {
        index += 2;
        templates.push(brackets.length);
        brackets.push('{');
        previous = { kind: 'punct', value: '{' };
        return;
      }
      index += 1;
    }
    error ||= '닫히지 않은 템플릿 문자열';
  };
  while (index < length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) { error ||= `닫히지 않은 블록 주석(${index})`; break; }
      blank(index, end + 2);
      index = end + 2;
      continue;
    }
    if (char === '/' && next === '/') {
      let end = index;
      while (end < length && !isNewline(source[end])) end += 1;
      blank(index, end);
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      let end = index + 1;
      while (end < length && source[end] !== char) {
        if (source[end] === '\\') end += source[end + 1] === '\r' && source[end + 2] === '\n' ? 2 : 1;
        else if (source[end] === '\n' || source[end] === '\r') break; // U+2028·U+2029 는 문자열 안에서 허용된다(ES2019)
        end += 1;
      }
      if (source[end] !== char) { error ||= `닫히지 않은 문자열(${index})`; break; }
      index = end + 1;
      previous = { kind: 'literal', value: char };
      continue;
    }
    if (char === '`') { index += 1; scanTemplate(); continue; }
    if (char === '/' && regexAllowed()) {
      let end = index + 1;
      let inClass = false;
      while (end < length && !isNewline(source[end])) {
        const current = source[end];
        if (current === '\\') { end += 2; continue; }
        if (current === '[') inClass = true;
        else if (current === ']') inClass = false;
        else if (current === '/' && !inClass) break;
        end += 1;
      }
      if (end < length && source[end] === '/') {
        end += 1;
        while (end < length && /[a-z]/i.test(source[end])) end += 1;
        index = end;
        previous = { kind: 'literal', value: '/' };
        continue;
      }
      // 같은 줄에서 닫히지 않으면 정규식이 아니다 — 나눗셈으로 읽는다.
    }
    if (/\s/.test(char)) { index += 1; continue; } // \s 는 U+FEFF 도 포함한다
    if (/[\w$]/.test(char)) {
      let end = index + 1;
      while (end < length && /[\w$]/.test(source[end])) end += 1;
      previous = { kind: 'word', value: source.slice(index, end) };
      index = end;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') brackets.push(char);
    else if (CLOSERS[char]) {
      if (brackets.pop() !== CLOSERS[char]) { error ||= `괄호 짝이 맞지 않음(${index})`; break; }
      if (char === '}' && templates.length && templates[templates.length - 1] === brackets.length) {
        templates.pop();
        index += 1;
        scanTemplate();
        continue;
      }
    }
    previous = { kind: 'punct', value: char };
    index += 1;
  }
  if (!error && (brackets.length || templates.length)) error = '괄호·템플릿이 닫히지 않음';
  return { code: out.join(''), ok: !error, error };
}

function lineAt(text, offset) {
  let line = 1;
  for (let at = 0; at < offset; at += 1) if (text[at] === '\n') line += 1;
  return line;
}

function requireSpecifiers(code) {
  return [...code.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map((match) => match[2]);
}

/* 브라우저 밖(Node)에서 나가는 요청. 이런 요청은 context 라우트(helper 포함)도 chromium 이름풀이 차단도 거치지 않는다.
   - APIRequestContext: page.request.get(…)·context.request.post(…)·request.newContext()
   - route.fetch(): 라우트 처리기 안에서 원래 요청을 Node 쪽에서 대신 보낸다(helper 의 config 라우트만 로컬 주소에 쓴다).
   브라우저 안의 fetch(…)·window.fetch(…) 는 라우트를 거치므로 괜찮다. */
const NODE_SIDE_REQUEST = /\brequest\s*\.\s*newContext\s*\(|\.\s*request\s*\.\s*(?:get|post|put|patch|delete|head|fetch)\s*\(/g;
const BROWSER_FETCH_RECEIVERS = new Set(['window', 'globalThis', 'self']);

function nodeSideRequests(code) {
  const found = [];
  for (const match of code.matchAll(NODE_SIDE_REQUEST)) found.push(match.index);
  for (const match of code.matchAll(/\.\s*fetch\s*\(/g)) {
    const receiver = (/([\w$]+)\s*\??$/.exec(code.slice(Math.max(0, match.index - 64), match.index)) || [])[1];
    if (!BROWSER_FETCH_RECEIVERS.has(receiver) && !found.includes(match.index)) found.push(match.index);
  }
  return found.sort((a, b) => a - b);
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(open, index + 1);
  }
  return '';
}

function liveSecrets(root, fileSystem) {
  const values = new Set();
  const addJson = (relative, pick) => {
    if (!exists(root, relative, fileSystem)) return;
    try { for (const value of pick(JSON.parse(read(root, relative, fileSystem)))) if (typeof value === 'string' && value.trim()) values.add(value.trim()); } catch (_) { /* 형식 검사는 다른 ensure 가 한다 */ }
  };
  // 사이트 설정의 접수 경로 전부: 접수함, n8n 웹훅, 메일 접수 키, 그리고 시험이 가짜로 받는 공용 주소(Web3Forms·Formspree)가
  // 아닌 forms endpoint(provider 'generic' 등 — 대표 전용 주소일 수 있다).
  const formsEndpoint = (forms) => {
    const endpoint = forms && typeof forms.endpoint === 'string' ? forms.endpoint.trim() : '';
    try { return ['api.web3forms.com', 'formspree.io'].includes(new URL(endpoint).hostname.toLowerCase()) ? '' : endpoint; } catch (_) { return endpoint; }
  };
  addJson('data/config.json', (config) => [
    config.inbox && config.inbox.url,
    config.n8n && config.n8n.inquiryWebhookUrl,
    config.forms && config.forms.accessKey,
    formsEndpoint(config.forms),
  ]);
  addJson('office-api.json', (config) => [config.apiUrl]);
  addJson('office-portal-api.json', (config) => [config.apiUrl]);
  if (exists(root, WORKFLOW, fileSystem)) for (const match of read(root, WORKFLOW, fileSystem).matchAll(APPS_SCRIPT_URL)) values.add(match[0]);
  return [...values];
}

function listFiles(root, relative, fileSystem, pattern) {
  const directory = path.join(root, ...relative.split('/'));
  if (!fileSystem.existsSync(directory)) return [];
  return fileSystem.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => `${relative}/${entry.name}`)
    .sort();
}

function walkTests(root, fileSystem) {
  const out = [];
  const walk = (relative) => {
    for (const entry of fileSystem.readdirSync(path.join(root, ...relative.split('/')), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (/\.(?:c?js|mjs|json|py)$/.test(entry.name)) out.push(child);
    }
  };
  if (exists(root, 'tests', fileSystem)) walk('tests');
  return out;
}

export function verifyE2eOffline(root = ROOT, fileSystem = fs) {
  const failures = [];
  const fail = (message) => failures.push(message);

  /* ① ② playwright 를 쓰는 검사 파일 */
  const playwrightFiles = [];
  for (const relative of listFiles(root, 'tests', fileSystem, /\.(?:c?js|mjs)$/)) {
    // 동작 고정 검사는 이 검사를 망가뜨려 보는 변형 재료로 그 문자열들(require('playwright')·route.continue() 등)을 담고 있다.
    // 브라우저를 띄우지 않고 playwright 를 흉내로 바꿔 끼우므로 대상에서 뺀다.
    if (relative === SELF_TEST) continue;
    const source = read(root, relative, fileSystem);
    const scanned = blankComments(source);
    // 주석을 정확히 가려내지 못하면 아래 규칙이 코드를 놓칠 수 있다. 원문 전체를 코드로 보고 검사하되, 고장으로 알린다.
    const code = scanned.ok ? scanned.code : source;
    if (!scanned.ok && USES_PLAYWRIGHT.test(source)) fail(`${relative}: 주석·리터럴을 끝까지 읽지 못했습니다(${scanned.error}) — 검사가 코드를 놓치지 않게 원인을 고치세요.`);
    if (!USES_PLAYWRIGHT.test(code)) continue;
    playwrightFiles.push(relative);
    const lines = (pattern) => [...new Set([...code.matchAll(pattern)].map((match) => lineAt(code, match.index)))].join(', ');
    const specifiers = requireSpecifiers(code);
    if (specifiers[0] !== HELPER_SPECIFIER) {
      fail(`${relative}: 첫 require 가 '${HELPER_SPECIFIER}' 가 아닙니다(지금: '${specifiers[0] || '없음'}') — playwright 보다 먼저 불러야 모든 브라우저가 실서버와 끊깁니다.`);
    }
    if (/\bimport\s*\(\s*['"](?:playwright|playwright-core|@playwright\/test)['"]|\bfrom\s+['"](?:playwright|playwright-core|@playwright\/test)['"]|\brequire\s*\(\s*['"](?:playwright-core|@playwright\/test)['"]/.test(code)) {
      fail(`${relative}: playwright 는 require('playwright') 로만 불러야 합니다 — 다른 경로는 helper 가 감싸지 못합니다.`);
    }
    if (/\.continue\s*\(/.test(code)) {
      fail(`${relative}:${lines(/\.continue\s*\(/g)}: route.continue() 가 있습니다 — helper 의 config·차단 라우트를 건너뛰고 바로 네트워크로 갑니다. route.fallback() 을 쓰세요.`);
    }
    if (/\bunrouteAll\s*\(/.test(code)) fail(`${relative}:${lines(/\bunrouteAll\s*\(/g)}: unrouteAll() 은 helper 라우트까지 지웁니다.`);
    const nodeSide = nodeSideRequests(code);
    if (nodeSide.length) {
      const at = [...new Set(nodeSide.map((offset) => lineAt(code, offset)))].join(', ');
      fail(`${relative}:${at}: 브라우저 밖 요청(APIRequestContext·route.fetch())은 helper 라우트·이름풀이 차단을 비켜 갑니다 — 로컬 서버 확인은 node:http 로, 가짜 응답은 route.fulfill 로 하세요.`);
    }
  }
  if (!playwrightFiles.length) fail('playwright 를 쓰는 tests/*.cjs 를 하나도 찾지 못했습니다 — 검사 패턴이 깨졌습니다.');

  /* ③ helper */
  if (!exists(root, HELPER, fileSystem)) {
    fail(`${HELPER} 가 없습니다.`);
  } else {
    const source = read(root, HELPER, fileSystem);
    const scanned = blankComments(source);
    if (!scanned.ok) fail(`${HELPER}: 주석·리터럴을 끝까지 읽지 못했습니다(${scanned.error}).`);
    const helper = scanned.code; // 주석에 남은 옛 코드·설명 글로는 통과하지 못하게 코드만 본다
    const blocked = (/const BLOCKED_HOSTS = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(helper) || [])[1] || '';
    const prepare = functionBody(helper, 'prepareContext');
    const abort = functionBody(helper, 'abortBackend');
    const deny = functionBody(helper, 'denyUnhandledWrite');
    const recordBody = functionBody(helper, 'record');
    const serve = functionBody(helper, 'serveSiteConfig');
    const offline = functionBody(helper, 'offlineSiteConfigText');
    const report = functionBody(helper, 'reportOnExit');
    const wrap = functionBody(helper, 'wrapBrowser');
    const wrapType = functionBody(helper, 'wrapBrowserType');
    if (!/^\s*install\(require\('playwright'\)\);/m.test(helper)) fail(`${HELPER}: install(require('playwright')) 가 없습니다 — 불러도 아무것도 감싸지 않습니다.`);
    for (const host of ['script.google.com', 'script.googleusercontent.com', 'api.web3forms.com']) {
      if (!blocked.includes(`'${host}'`)) fail(`${HELPER}: 차단 호스트에 ${host} 가 없습니다.`);
    }
    if (!/const INBOX_OFF = Object\.freeze\(\{ enabled: false, url: '' \}\);/.test(helper)) fail(`${HELPER}: inbox 끄기 값이 { enabled: false, url: '' } 가 아닙니다.`);
    if (!/const N8N_OFF = Object\.freeze\(\{ enabled: false, inquiryWebhookUrl: '' \}\);/.test(helper)) fail(`${HELPER}: n8n 끄기 값이 { enabled: false, inquiryWebhookUrl: '' } 가 아닙니다.`);
    // 순서까지 본다: 마지막 그물(denyUnhandledWrite)을 맨 먼저 걸어야 시험 라우트·config·차단 라우트 다음, 맨 마지막에 돈다.
    if (!/^\{\s*if \(!context \|\| prepared\.has\(context\)\) return context;\s*prepared\.add\(context\);\s*await context\.route\(isExternalHttp, denyUnhandledWrite\);\s*await context\.route\(isSiteConfigUrl, serveSiteConfig\);\s*await context\.route\(isBlockedBackend, abortBackend\);\s*return context;\s*\}$/.test(prepare)) {
      fail(`${HELPER}: prepareContext 가 라우트 세 개(마지막 그물 → config.json 끄기 → 실서버 abort)를 이 순서로 걸지 않습니다.`);
    }
    if (!/blockedRequests\.push\(/.test(recordBody)) fail(`${HELPER}: record 가 막은 요청을 blockedRequests 에 남기지 않습니다.`);
    if (!/\brecord\(route\);/.test(abort) || !/route\.abort\(/.test(abort)) fail(`${HELPER}: abortBackend 가 요청을 abort·기록하지 않습니다.`);
    if (!/READ_ONLY_METHODS\.has\(/.test(deny) || !/\brecord\(route\);/.test(deny) || !/route\.abort\(/.test(deny)) fail(`${HELPER}: denyUnhandledWrite(마지막 그물)가 로컬 밖 쓰기 요청을 abort·기록하지 않습니다.`);
    if (!/const READ_ONLY_METHODS = new Set\(\['GET', 'HEAD', 'OPTIONS'\]\);/.test(helper)) fail(`${HELPER}: 마지막 그물이 통과시키는 메서드가 GET·HEAD·OPTIONS 가 아닙니다.`);
    if (!/^\{\s*try \{[\s\S]*\} catch \(error\) \{[\s\S]*route\.abort\('failed'\)\.catch\(/.test(serve) || !/offlineSiteConfigText\(text\)/.test(serve) || !/route\.fulfill\(/.test(serve)) {
      fail(`${HELPER}: serveSiteConfig 가 처리기 전체를 try/catch 로 감싸 접수 경로를 끈 설정으로 응답하지 않습니다(실패하면 abort).`);
    }
    if (!/data\.inbox = \{ \.\.\.INBOX_OFF \};/.test(offline)) fail(`${HELPER}: offlineSiteConfigText 가 inbox 를 INBOX_OFF 로 바꾸지 않습니다.`);
    if (!/data\.n8n = \{ \.\.\.n8n, \.\.\.N8N_OFF \};/.test(offline)) fail(`${HELPER}: offlineSiteConfigText 가 n8n 을 끄지 않습니다(N8N_OFF).`);
    if (!/process\.exitCode = 1;/.test(report) || !/^process\.on\('exit', reportOnExit\);/m.test(helper)) fail(`${HELPER}: 막은 요청이 있을 때 종료 코드를 1 로 만들지 않습니다 — 막혔는데 초록불이 됩니다.`);
    if (!/browser\.newContext = async function/.test(wrap) || !/browser\.newPage = async function/.test(wrap) || !/prepareContext\(page\.context\(\)\)/.test(wrap)) fail(`${HELPER}: browser.newContext·browser.newPage(숨은 context) 감싸기가 빠졌습니다.`);
    if (!/browserType\.launch = async function/.test(wrapType) || !/argsFor\(options\)/.test(wrapType)) fail(`${HELPER}: chromium.launch 감싸기(실행 인자 포함)가 빠졌습니다.`);
    if (!/HOST_RESOLVER_FLAG = '--host-resolver-rules='/.test(helper) || !/MAP \$\{host\} ~NOTFOUND/.test(helper)) fail(`${HELPER}: --host-resolver-rules 이름풀이 차단이 빠졌습니다.`);
  }
  if (!exists(root, SELF_TEST, fileSystem)) fail(`${SELF_TEST}(helper 동작 고정 검사)가 없습니다.`);

  /* ④ 라이브 주소·키가 tests/ 에 글자로 들어가지 않는다 */
  const secrets = liveSecrets(root, fileSystem);
  for (const relative of walkTests(root, fileSystem)) {
    const source = read(root, relative, fileSystem);
    for (const secret of secrets) if (source.includes(secret)) fail(`${relative}: 라이브 서버 주소 또는 실제 접수 키(${secret.slice(0, 48)}…)가 들어 있습니다 — 가짜 주소를 쓰세요.`);
  }

  /* ⑤ 워크플로 */
  if (!exists(root, WORKFLOW, fileSystem)) {
    fail(`${WORKFLOW} 가 없습니다.`);
  } else {
    const workflow = read(root, WORKFLOW, fileSystem);
    const guardAt = workflow.indexOf('node scripts/ensure-e2e-offline.mjs');
    const selfTestAt = workflow.indexOf(SELF_TEST);
    const firstE2eAt = workflow.search(/tests\/[\w.-]+\.e2e\.cjs/);
    if (guardAt < 0) fail(`${WORKFLOW}: node scripts/ensure-e2e-offline.mjs 를 따로 돌리는 단계가 없습니다.`);
    if (selfTestAt < 0) fail(`${WORKFLOW}: ${SELF_TEST} 를 돌리지 않습니다.`);
    if (firstE2eAt >= 0 && (guardAt > firstE2eAt || selfTestAt > firstE2eAt)) fail(`${WORKFLOW}: 오프라인 검사가 첫 e2e 보다 뒤에 있습니다 — 고장 난 e2e 가 먼저 실서버에 닿을 수 있습니다.`);
    const covered = new Set(playwrightFiles);
    for (const match of new Set(workflow.match(/tests\/[\w.-]+\.(?:e2e\.cjs|test\.cjs)/g) || [])) {
      if (!exists(root, match, fileSystem)) { fail(`${WORKFLOW}: ${match} 가 없습니다.`); continue; }
      if (/\.e2e\.cjs$/.test(match) && !covered.has(match)) fail(`${WORKFLOW}: ${match} 가 playwright·helper 검사 대상이 아닙니다.`);
    }
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : ROOT;
  const failures = verifyE2eOffline(root);
  if (failures.length) {
    console.error(`FAIL  e2e 오프라인 검사 ${failures.length}건`);
    failures.forEach((message) => console.error(`  - ${message}`));
    process.exit(1);
  }
  console.log('PASS  e2e 오프라인 — helper 선로딩·route.continue·브라우저 밖 요청 금지·config inbox·n8n 끄기·실서버 차단·마지막 그물·막으면 실패·라이브 주소 없음·워크플로 순서');
}
