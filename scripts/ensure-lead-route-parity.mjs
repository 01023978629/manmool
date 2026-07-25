/* ensure-lead-route-parity.mjs — 상담 접수 경로 판정 일치 검사
 *
 * 왜 필요한가:
 *   손님이 상담 폼을 쓰면 js/inquiry.js 의 deliver() 가 실제 전송을 맡고,
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
const INQUIRY = path.join(ROOT, 'js', 'inquiry.js');
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

/** 경로를 '켤지 말지' 결정하는 게이팅 키만 뽑는다.
 *  enabled / endpoint / ...Url 만 대상 — accessKey 처럼 본문에 실어 보내는 값은
 *  전송 여부를 좌우하지 않으므로 일치 대상이 아니다(넣으면 오탐이 난다). */
const GATING = /^(enabled|endpoint)$|Url$|url$/;
function routeKeys(body) {
  const keys = new Set();
  for (const m of body.matchAll(/\b(n8n|forms)\.([A-Za-z_$][\w$]*)/g)) {
    if (GATING.test(m[2])) keys.add(m[1] + '.' + m[2]);
  }
  return keys;
}

const inquirySrc = read(INQUIRY);
const adminSrc = read(ADMIN);

const deliverBody = funcBody(inquirySrc, 'async function deliver(');
const backendBody = funcBody(inquirySrc, 'function backendConfigured(');
const routeBody = funcBody(adminSrc, 'function leadRoute(');

if (!deliverBody) fail.push('js/inquiry.js 에서 deliver() 본문을 찾지 못했습니다 (함수명이 바뀌었나요?)');
if (!backendBody) fail.push('js/inquiry.js 에서 backendConfigured() 본문을 찾지 못했습니다');
if (!routeBody) fail.push('js/admin.js 에서 leadRoute() 본문을 찾지 못했습니다 — admin 이 접수 경로 판정을 잃었습니다');

if (deliverBody && backendBody && routeBody) {
  const dk = routeKeys(deliverBody);
  const bk = routeKeys(backendBody);
  const rk = routeKeys(routeBody);

  // ① 손님 화면 안내(backendConfigured)와 실제 전송(deliver)이 같은 조건을 봐야 한다
  for (const k of dk) {
    if (!bk.has(k)) fail.push(`deliver() 는 ${k} 를 쓰는데 backendConfigured() 는 안 봅니다 — 손님에게 잘못된 안내가 나갑니다`);
  }
  // ② 대표님 화면(admin)이 실제 전송과 같은 조건을 봐야 한다
  for (const k of dk) {
    if (!rk.has(k)) fail.push(`deliver() 는 ${k} 를 쓰는데 admin 의 leadRoute() 는 안 봅니다 — 접수 상태가 거짓으로 표시됩니다`);
  }
  // ③ admin 이 실제로는 쓰이지 않는 조건을 보고 있으면 그것도 거짓 표시다
  for (const k of rk) {
    if (!dk.has(k)) fail.push(`admin 의 leadRoute() 가 ${k} 를 보는데 deliver() 는 안 씁니다 — 연결됐다고 표시해도 전송되지 않습니다`);
  }
  if (dk.size === 0) fail.push('deliver() 에서 접수 경로 설정 키를 하나도 찾지 못했습니다 — 검사가 무의미해졌습니다');
}

// ④ config.json 에 두 경로의 자리가 모두 있어야 대표님이 설정할 수 있다
try {
  const cfg = JSON.parse(read(CONFIG));
  if (!cfg.n8n || typeof cfg.n8n !== 'object') fail.push('data/config.json 에 n8n 항목이 없습니다');
  if (!cfg.forms || typeof cfg.forms !== 'object') fail.push('data/config.json 에 forms 항목이 없습니다 (무료 접수 경로를 설정할 자리)');
  if (cfg.forms && !('endpoint' in cfg.forms)) fail.push('data/config.json 의 forms 에 endpoint 키가 없습니다');
} catch (e) {
  fail.push('data/config.json 을 읽지 못했습니다: ' + e.message);
}

if (fail.length) {
  console.error('✗ 상담 접수 경로 판정 불일치 ' + fail.length + '건\n');
  fail.forEach((f) => console.error('  - ' + f));
  console.error('\n실제 전송(deliver)·손님 안내(backendConfigured)·대표 화면(leadRoute) 셋이 같은 기준을 봐야 합니다.');
  process.exit(1);
}

console.log('✓ 상담 접수 경로 판정 일치 — deliver / backendConfigured / admin leadRoute 기준 동일');
