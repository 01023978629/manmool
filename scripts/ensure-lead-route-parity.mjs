/* ensure-lead-route-parity.mjs — 상담 접수 경로 판정 일치 검사
 *
 * 왜 필요한가:
 *   손님이 상담 폼(인테리어·누수)을 쓰면 js/lead-transport.js 의 deliver() 가 실제 전송을 맡고,
 *   대표님은 admin 화면(js/admin.js)의 상태 표시를 보고 "지금 문의가 오고 있는가"를 판단한다.
 *   이 둘의 판정 기준이 어긋나면 가장 나쁜 실패가 난다 —
 *   실제로는 전달되는데 "데모 모드"라 표시되거나(불필요한 재설정),
 *   반대로 전달이 안 되는데 "연결됨"이라 표시되면 문의가 새는 걸 모른 채 지나간다.
 *
 * 실제로 있었던 일: deliver() 는 n8n '또는' forms(무료 폼 서비스) 둘 다 지원하는데
 *   admin 은 n8n 만 봤다. 문서가 권장하는 경로가 forms 라, 그대로 설정한 대표님께는
 *   계속 "데모 모드"로 보였다.
 *
 * 검사 방법: 소스에서 각 파일이 판정에 쓰는 설정 키를 뽑아 집합이 같은지 본다.
 *   새 전송 경로를 deliver() 에 추가하면서 admin 을 안 고치면 여기서 걸린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 전송(deliver)·안내 판정(backendConfigured)은 인테리어 폼과 누수 폼이 함께 쓰는
// js/lead-transport.js 로 옮겼다. 두 폼이 같은 함수를 쓰므로 여기 한 곳만 보면 된다.
const TRANSPORT = path.join(ROOT, 'js', 'lead-transport.js');
const ADMIN = path.join(ROOT, 'js', 'admin.js');
const CONFIG = path.join(ROOT, 'data', 'config.json');

const fail = [];
const read = (p) => fs.readFileSync(p, 'utf8');

/** 함수 본문을 중괄호 균형으로 잘라낸다(정규식만으로는 중첩 때문에 부정확) */
function funcBody(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  return null;
}

/** if(...) 조건만 중첩 괄호까지 잘라낸다. deliver()의 accessKey payload ternary는
 * 전송 경로 gate가 아니므로 포함하지 않고, 조건에 accessKey가 들어오면 포함한다. */
function ifConditions(body) {
  const conditions = [];
  const pattern = /\bif\s*\(/g;
  let match;
  while ((match = pattern.exec(body))) {
    const start = body.indexOf('(', match.index);
    let depth = 0;
    for (let i = start; i < body.length; i++) {
      if (body[i] === '(') depth += 1;
      if (body[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          conditions.push(body.slice(start + 1, i));
          pattern.lastIndex = i + 1;
          break;
        }
      }
    }
  }
  return conditions;
}

function configKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/\b(n8n|forms|inbox)\.([A-Za-z_$][\w$]*)/g)) {
    keys.add(match[1] + '.' + match[2]);
  }
  for (const match of source.matchAll(/\b(?:config|CONFIG)\.([A-Za-z_$][\w$]*)/g)) {
    if (match[1] !== 'n8n' && match[1] !== 'forms' && match[1] !== 'inbox') keys.add('config.' + match[1]);
  }
  return keys;
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function providerList(src, file) {
  const match = /^\s*const\s+SUPPORTED_FORM_PROVIDERS\s*=\s*\[([^\]]*)\]\s*;/m.exec(src);
  if (!match) {
    fail.push(`${file} 에 명시적 SUPPORTED_FORM_PROVIDERS 배열이 없습니다`);
    return [];
  }
  const values = [...match[1].matchAll(/(['"])([a-z0-9-]+)\1/g)].map((item) => item[2]);
  const residue = match[1].replace(/(['"])[a-z0-9-]+\1/g, '').replace(/[\s,]/g, '');
  if (residue) fail.push(`${file} 의 provider 배열에 정적 문자열 외 값이 섞였습니다`);
  return values;
}

const inquirySrc = read(TRANSPORT);
const adminSrc = read(ADMIN);
const expectedProviders = ['web3forms', 'generic', 'formspree'];
const transportProviders = providerList(inquirySrc, 'js/lead-transport.js');
const adminProviders = providerList(adminSrc, 'js/admin.js');
const expectedProviderSet = new Set(expectedProviders);
const transportProviderSet = new Set(transportProviders);
const adminProviderSet = new Set(adminProviders);

if (transportProviders.length !== expectedProviders.length ||
    transportProviderSet.size !== expectedProviderSet.size ||
    !sameSet(transportProviderSet, expectedProviderSet)) {
  fail.push('js/lead-transport.js 의 지원 폼 provider 집합이 계약과 다릅니다');
}
if (adminProviders.length !== expectedProviders.length ||
    adminProviderSet.size !== expectedProviderSet.size ||
    !sameSet(adminProviderSet, expectedProviderSet)) {
  fail.push('js/admin.js 의 지원 폼 provider 집합이 계약과 다릅니다');
}
if (!sameSet(transportProviderSet, adminProviderSet)) {
  fail.push('전송 모듈과 관리자 화면의 지원 폼 provider 집합이 서로 다릅니다');
}

// 2026-09-03 부터 deliver() 는 메일 경로(deliverEmail)와 문의 접수함(deliverToInbox·
// inboxConfigured)으로 나뉜다. gate 키는 그 셋을 합쳐 본다 — deliver 본문만 보면
// n8n·forms 키가 사라져 검사가 무의미해진다.
const deliverBody = funcBody(inquirySrc, 'async function deliver(');
const emailBody = funcBody(inquirySrc, 'async function deliverEmail(');
const inboxBody = funcBody(inquirySrc, 'function inboxConfigured(');
const backendBody = funcBody(inquirySrc, 'function backendConfigured(');
const routeBody = funcBody(adminSrc, 'function leadRoute(');

if (!deliverBody) fail.push('js/lead-transport.js 에서 deliver() 본문을 찾지 못했습니다 (함수명이 바뀌었나요?)');
if (!emailBody) fail.push('js/lead-transport.js 에서 deliverEmail() 본문을 찾지 못했습니다');
if (!inboxBody) fail.push('js/lead-transport.js 에서 inboxConfigured() 본문을 찾지 못했습니다');
if (!backendBody) fail.push('js/lead-transport.js 에서 backendConfigured() 본문을 찾지 못했습니다');
if (!routeBody) fail.push('js/admin.js 에서 leadRoute() 본문을 찾지 못했습니다 — admin 이 접수 경로 판정을 잃었습니다');

if (deliverBody && emailBody && inboxBody && backendBody && routeBody) {
  const dk = configKeys(ifConditions(emailBody).join('\n') + '\n' + inboxBody);
  // backendConfigured()는 전체 함수가 순수 route predicate라 모든 설정 참조가 gate다.
  // inboxConfigured() 를 호출하므로 그 본문의 키도 합친다.
  const bk = configKeys(backendBody + '\n' + inboxBody);
  const rk = configKeys(ifConditions(routeBody).join('\n'));

  const compareGates = (name, keys) => {
    for (const key of dk) {
      if (!keys.has(key)) fail.push(`deliver() 는 ${key} 로 gate하지만 ${name}은 보지 않습니다`);
    }
    for (const key of keys) {
      if (!dk.has(key)) fail.push(`${name}은 ${key} 로 추가 gate하지만 deliver() 는 사용하지 않습니다`);
    }
  };
  compareGates('backendConfigured()', bk);
  compareGates('admin leadRoute()', rk);
  if (dk.size === 0) fail.push('deliver() 에서 접수 경로 설정 키를 하나도 찾지 못했습니다 — 검사가 무의미해졌습니다');

  // provider 배열을 선언만 해두고 우회 전송하는 decoy를 막는다. n8n이 먼저이며,
  // 폼은 enabled+endpoint를 만족한 뒤 명시 지원 provider만 허용해야 한다.
  if (!/n8n\.enabled\s*&&\s*n8n\.inquiryWebhookUrl/.test(emailBody) ||
      !/forms\.enabled\s*&&\s*forms\.endpoint/.test(emailBody) ||
      !/SUPPORTED_FORM_PROVIDERS\.includes\(provider\)/.test(emailBody) ||
      !/throw\s+new\s+Error\(['"]unsupported-form-provider['"]\)/.test(emailBody) ||
      emailBody.indexOf('n8n.enabled') > emailBody.indexOf('forms.enabled')) {
    fail.push('deliverEmail() 가 n8n 우선 또는 지원된 enabled 폼만 전송하는 계약을 지키지 않습니다');
  }
  // 접수함 계약: deliver 는 메일 → 접수함 순서로 둘 다 시도하고, 접수함이 켜져 있으면
  // 메일 성공 여부(emailDelivered)를 접수함 줄에 남긴다. 둘 다 실패해야 실패다.
  if (!/await deliverEmail\(config, payload\)/.test(deliverBody) ||
      !/await deliverToInbox\(config, payload, emailDelivered\)/.test(deliverBody) ||
      !/if \(emailDelivered\) return true;/.test(deliverBody) ||
      !/ensureLeadId\(payload\)/.test(deliverBody)) {
    fail.push('deliver() 가 메일→접수함 이중 전송·문의 ID·메일 성공 시 통과 계약을 지키지 않습니다');
  }
  if (!/inbox\.enabled\s*&&\s*typeof inbox\.url === 'string'\s*&&\s*INBOX_URL\.test\(inbox\.url\)/.test(inboxBody)) {
    fail.push('inboxConfigured() 가 script.google.com /exec 주소만 허용하지 않습니다');
  }
  if (!/inbox\.enabled\s*&&\s*inbox\.url/.test(routeBody) || routeBody.indexOf('forms.enabled') > routeBody.indexOf('inbox.enabled')) {
    fail.push('admin leadRoute() 가 접수함 경로를 메일 경로 다음 순서로 판정하지 않습니다');
  }
  if (!/n8n\.enabled\s*&&\s*n8n\.inquiryWebhookUrl/.test(backendBody) ||
      !/forms\.enabled\s*&&\s*forms\.endpoint\s*&&\s*SUPPORTED_FORM_PROVIDERS\.includes\(formProvider\(forms\)\)/.test(backendBody)) {
    fail.push('backendConfigured() 가 n8n 또는 지원된 enabled 폼만 준비 상태로 판정하지 않습니다');
  }
  if (!/n8n\.enabled\s*&&\s*n8n\.inquiryWebhookUrl/.test(routeBody) ||
      !/forms\.enabled\s*&&\s*forms\.endpoint\s*&&\s*SUPPORTED_FORM_PROVIDERS\.includes\(provider\)/.test(routeBody) ||
      routeBody.indexOf('n8n.enabled') > routeBody.indexOf('forms.enabled')) {
    fail.push('admin leadRoute() 가 n8n 우선 또는 지원된 enabled 폼만 표시하는 계약을 지키지 않습니다');
  }
}

// ④ config.json 에 두 경로의 자리가 모두 있어야 대표님이 설정할 수 있다
try {
  const cfg = JSON.parse(read(CONFIG));
  if (!cfg.n8n || typeof cfg.n8n !== 'object') fail.push('data/config.json 에 n8n 항목이 없습니다');
  if (!cfg.forms || typeof cfg.forms !== 'object') fail.push('data/config.json 에 forms 항목이 없습니다 (무료 접수 경로를 설정할 자리)');
  if (cfg.forms && !('endpoint' in cfg.forms)) fail.push('data/config.json 의 forms 에 endpoint 키가 없습니다');
  if (!cfg.inbox || typeof cfg.inbox !== 'object' || !('enabled' in cfg.inbox) || !('url' in cfg.inbox)) fail.push('data/config.json 에 inbox(문의 접수함) 항목이 없습니다');
  if (cfg.inbox && cfg.inbox.enabled && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(cfg.inbox.url || ''))) {
    fail.push('data/config.json 의 inbox.url 이 script.google.com /exec 형식이 아닌데 enabled 입니다');
  }
  if (cfg.forms && cfg.forms.enabled && !expectedProviders.includes(String(cfg.forms.provider || '').trim().toLowerCase())) {
    fail.push('data/config.json 에 활성화된 폼 provider가 명시 지원 집합 밖입니다');
  }
} catch (e) {
  fail.push('data/config.json 을 읽지 못했습니다: ' + e.message);
}

// ⑤ 문서가 없는 기능을 있는 것처럼 말하지 않는다 --------------------------
// 관리자 화면의 '🏗 현장 앱으로 보내기'(#lead= 딥링크)는 리드를 브라우저에
// 보관하지 않도록 바꾸면서 내려갔는데, README 와 config 의 _help 는 계속
// "이 주소로 리드를 실은 딥링크를 엽니다"라고 적혀 있었다. 대표가 없는 버튼을
// 찾게 되고, 리드가 운영 앱으로 자동으로 넘어간다고 오해한다.
{
  const adminHasLeadHandoff = /#lead=/.test(read(ADMIN));
  const goneWords = /(지금\s*)?없습니다|내렸습니다|제거/;
  for (const [file, text] of [['README.md', read(path.join(ROOT, 'README.md'))], ['data/config.json', read(CONFIG)]]) {
    for (const line of text.split(/\r?\n/)) {
      if (!/현장 앱으로 보내기/.test(line)) continue;
      if (adminHasLeadHandoff || goneWords.test(line)) continue;
      fail.push(`${file} 이 '현장 앱으로 보내기'(#lead= 딥링크)를 있는 기능처럼 설명하는데 js/admin.js 에 그 코드가 없습니다 — 대표가 없는 버튼을 찾게 됩니다`);
    }
  }
  // 반대 방향: 기능이 돌아왔는데 문서가 "지금 없습니다"로 남아 있으면 그것도 거짓말이다.
  if (adminHasLeadHandoff) {
    const readme = read(path.join(ROOT, 'README.md'));
    if (/현장 앱으로 보내기[^\n]*지금\s*없습니다/.test(readme)) {
      fail.push("js/admin.js 에 #lead= 인계 코드가 생겼는데 README 는 아직 '지금 없습니다'라고 적혀 있습니다");
    }
  }
}

if (fail.length) {
  console.error('✗ 상담 접수 경로 판정 불일치 ' + fail.length + '건\n');
  fail.forEach((f) => console.error('  - ' + f));
  console.error('\n실제 전송(deliver)·손님 안내(backendConfigured)·대표 화면(leadRoute) 셋이 같은 기준을 봐야 합니다.');
  process.exit(1);
}

console.log('✓ 상담 접수 경로 판정 일치 — deliver / backendConfigured / admin leadRoute 기준 동일');
