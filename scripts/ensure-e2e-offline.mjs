/* ensure-e2e-offline.mjs — 브라우저 e2e 가 실제 접수함·메일 접수 서버에 닿지 못하게 지킨다 (2026-11-19)

   사고: PR #238 로 data/config.json 의 inbox 가 라이브 접수함 주소로 켜진 뒤, 배포 검사의 e2e 가 저장소 루트를
   그대로 띄워 시험 문의를 라이브 접수함에 보냈다(대표 시트에 시험 행 16개). 검사 9건도 깨졌다.
   해결은 tests/helpers/e2e-offline.cjs — 모든 BrowserContext 에 'config.json 의 inbox 끄기'와
   'Apps Script·메일 접수 호스트 abort' 라우트를 먼저 걸고, 브라우저 이름풀이에서도 그 호스트를 지운다.

   이 검사가 지키는 것
     ① playwright 를 쓰는 tests/*.cjs 는 첫 require 가 './helpers/e2e-offline.cjs' 다(playwright 보다 먼저).
        playwright 는 require('playwright') 로만 쓴다(playwright-core·@playwright/test·import() 는 helper 를 비켜 간다).
     ② 그 파일들에 route.continue() 가 없다 — continue 는 남은 라우트(helper)를 건너뛰고 바로 네트워크로 간다.
        직접 처리하지 않는 요청은 route.fallback() 으로 넘긴다. unrouteAll()·APIRequestContext(브라우저 밖 요청)도 금지.
     ③ helper 가 두 보호(config inbox 끄기·실서버 abort)와 이름풀이 차단, newContext·newPage 감싸기를 유지한다.
     ④ tests/ 어디에도 라이브 Apps Script 배포 주소·실제 Web3Forms 키가 글자로 들어가지 않는다.
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

/* 블록 주석과 줄 전체 주석만 지운다(문자열 안의 // 는 건드리지 않는다). */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function requireSpecifiers(source) {
  return [...stripComments(source).matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map((match) => match[2]);
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
  addJson('data/config.json', (config) => [config.inbox && config.inbox.url, config.forms && config.forms.accessKey]);
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
    const code = stripComments(source);
    if (!USES_PLAYWRIGHT.test(code)) continue;
    playwrightFiles.push(relative);
    const specifiers = requireSpecifiers(source);
    if (specifiers[0] !== HELPER_SPECIFIER) {
      fail(`${relative}: 첫 require 가 '${HELPER_SPECIFIER}' 가 아닙니다(지금: '${specifiers[0] || '없음'}') — playwright 보다 먼저 불러야 모든 브라우저가 실서버와 끊깁니다.`);
    }
    if (/\bimport\s*\(\s*['"](?:playwright|playwright-core|@playwright\/test)['"]|\bfrom\s+['"](?:playwright|playwright-core|@playwright\/test)['"]|\brequire\s*\(\s*['"](?:playwright-core|@playwright\/test)['"]/.test(code)) {
      fail(`${relative}: playwright 는 require('playwright') 로만 불러야 합니다 — 다른 경로는 helper 가 감싸지 못합니다.`);
    }
    if (/\.continue\s*\(/.test(code)) {
      fail(`${relative}: route.continue() 가 있습니다 — helper 의 config·차단 라우트를 건너뛰고 바로 네트워크로 갑니다. route.fallback() 을 쓰세요.`);
    }
    if (/\bunrouteAll\s*\(/.test(code)) fail(`${relative}: unrouteAll() 은 helper 라우트까지 지웁니다.`);
    if (/\brequest\s*\.\s*newContext\s*\(|\.request\s*\.\s*(?:get|post|put|patch|delete|head|fetch)\s*\(/.test(code)) {
      fail(`${relative}: APIRequestContext(브라우저 밖 요청)는 helper 라우트·이름풀이 차단을 비켜 갑니다.`);
    }
  }
  if (!playwrightFiles.length) fail('playwright 를 쓰는 tests/*.cjs 를 하나도 찾지 못했습니다 — 검사 패턴이 깨졌습니다.');

  /* ③ helper */
  if (!exists(root, HELPER, fileSystem)) {
    fail(`${HELPER} 가 없습니다.`);
  } else {
    const helper = read(root, HELPER, fileSystem);
    const blocked = (/const BLOCKED_HOSTS = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(helper) || [])[1] || '';
    const prepare = functionBody(helper, 'prepareContext');
    const abort = functionBody(helper, 'abortBackend');
    const serve = functionBody(helper, 'serveSiteConfig');
    const wrap = functionBody(helper, 'wrapBrowser');
    const wrapType = functionBody(helper, 'wrapBrowserType');
    if (!/^\s*install\(require\('playwright'\)\);/m.test(helper)) fail(`${HELPER}: install(require('playwright')) 가 없습니다 — 불러도 아무것도 감싸지 않습니다.`);
    for (const host of ['script.google.com', 'script.googleusercontent.com', 'api.web3forms.com']) {
      if (!blocked.includes(`'${host}'`)) fail(`${HELPER}: 차단 호스트에 ${host} 가 없습니다.`);
    }
    if (!/const INBOX_OFF = Object\.freeze\(\{ enabled: false, url: '' \}\);/.test(helper)) fail(`${HELPER}: inbox 끄기 값이 { enabled: false, url: '' } 가 아닙니다.`);
    if (!/await context\.route\(isSiteConfigUrl, serveSiteConfig\);/.test(prepare)) fail(`${HELPER}: prepareContext 가 config.json(inbox 끄기) 라우트를 걸지 않습니다.`);
    if (!/await context\.route\(isBlockedBackend, abortBackend\);/.test(prepare)) fail(`${HELPER}: prepareContext 가 실서버 abort 라우트를 걸지 않습니다.`);
    if (!/route\.abort\(/.test(abort) || !/blockedRequests\.push\(/.test(abort)) fail(`${HELPER}: abortBackend 가 요청을 abort·기록하지 않습니다.`);
    if (!/offlineSiteConfigText\(text\)/.test(serve) || !/route\.fulfill\(/.test(serve)) fail(`${HELPER}: serveSiteConfig 가 inbox 를 끈 설정으로 응답하지 않습니다.`);
    if (!/data\.inbox = \{ \.\.\.INBOX_OFF \};/.test(functionBody(helper, 'offlineSiteConfigText'))) fail(`${HELPER}: offlineSiteConfigText 가 inbox 를 INBOX_OFF 로 바꾸지 않습니다.`);
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
  console.log('PASS  e2e 오프라인 — helper 선로딩·route.continue 금지·config inbox 끄기·실서버 차단·라이브 주소 없음·워크플로 순서');
}
