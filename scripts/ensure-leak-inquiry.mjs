#!/usr/bin/env node
/* 누수 페이지 상담 폼이 '접수되는 상태'로 남아 있는지 검사한다.
 *
 * 여기서 막으려는 사고는 세 가지다.
 *  1) 전송·현재 탭 재시도 코드가 폼마다 갈라져 한쪽 리드만 샌다.
 *  2) 실패 안내에서 다시 시도·전화·문자·복사 중 일부가 사라진다.
 *  3) 제출 epoch/finally 또는 스크립트 순서가 깨져 폼이 조용히 죽는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const leak = read('leak.html');
const index = read('index.html');
const transport = read('js/lead-transport.js');
const leakJs = read('js/leak-inquiry.js');
const inquiryJs = read('js/inquiry.js');
const css = read('css/leak-theme.css');

const fail = [];

function functionBody(src, name) {
  const header = new RegExp(`^\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm').exec(src);
  if (!header) return null;
  const start = src.indexOf('{', header.index + header[0].length);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function blockBody(src, marker) {
  const markerAt = src.indexOf(marker);
  if (markerAt < 0) return null;
  const start = src.indexOf('{', markerAt + marker.length);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function leadExports(src) {
  const assignment = /\bwindow\.ManmulLead\s*=\s*\{([^}]*)\}\s*;/.exec(src);
  return assignment
    ? assignment[1].split(',').map((name) => name.trim()).filter(Boolean)
    : [];
}

/* ① 폼 자체와 필수 요소 */
if (!/id="leakInquiry"/.test(leak)) fail.push('leak.html 에 상담 폼 절(#leakInquiry)이 없다.');
if (!/id="leakForm"/.test(leak)) fail.push('leak.html 에 <form id="leakForm"> 이 없다.');
for (const [id, what] of [['lkPhone', '연락처'], ['lkConsent', '개인정보 동의'], ['lkSubmit', '제출 버튼'], ['lkCompanyUrl', '봇 방어 허니팟']]) {
  if (!new RegExp(`id="${id}"`).test(leak)) fail.push(`leak.html 상담 폼에 ${what}(#${id})이 없다.`);
}

/* ② 스크립트 순서 — 공용 모듈이 먼저 와야 폼이 산다 */
const order = (html, first, second, page) => {
  const a = html.indexOf(first);
  const b = html.indexOf(second);
  if (a < 0) fail.push(`${page} 가 ${first} 를 읽지 않는다.`);
  else if (b < 0) fail.push(`${page} 가 ${second} 를 읽지 않는다.`);
  else if (a > b) fail.push(`${page} 에서 ${first} 가 ${second} 보다 뒤에 있다 — 폼이 조용히 죽는다.`);
};
order(leak, 'js/lead-transport.js', 'js/leak-inquiry.js', 'leak.html');
order(index, 'js/lead-transport.js', 'js/inquiry.js', 'index.html');

/* ③ 전송·현재 탭 재시도는 공용 모듈 한 곳에만 둔다 --------------------- */
const expectedExports = [
  'backendConfigured', 'fetchWithTimeout', 'buildLeadText', 'deliver',
  'rememberFailure', 'retryLatest', 'clearFailure', 'copyToClipboard'
];
if (JSON.stringify(leadExports(transport)) !== JSON.stringify(expectedExports)) {
  fail.push('js/lead-transport.js 의 공용 export 계약이 정확하지 않다.');
}
for (const [file, src] of [['js/inquiry.js', inquiryJs], ['js/leak-inquiry.js', leakJs]]) {
  // 이름 끝을 막는다. 처음엔 /ManmulLead/ 로 짰다가 변이 검증에서 걸렸다 —
  // window.ManmulLeadX 로 바꿔도 부분문자열이라 그대로 통과했다.
  if (!/\bwindow\.ManmulLead\b(?![A-Za-z0-9_$])/.test(src)) {
    fail.push(`${file} 가 공용 전송 모듈(window.ManmulLead)을 쓰지 않는다.`);
  }
  // 자체 구현 여부는 '함수 선언'으로만 본다. 호출(LEAD.deliver(...))은 정상이다.
  for (const fn of ['deliver', 'backendConfigured', 'rememberFailure', 'retryLatest', 'clearFailure']) {
    if (new RegExp(`(?:async\\s+)?function\\s+${fn}\\s*\\(`).test(src)) {
      fail.push(`${file} 안에 ${fn}() 자체 구현이 있다 — 공용 모듈과 갈라져 한쪽 리드가 샌다.`);
    }
  }
  if (/^\s*(?:async\s+)?function\s+(?:saveLocal|loadLocal)\s*\(/m.test(src) ||
      /\b(?:saveLocal|loadLocal)\s*\(/.test(src) ||
      /(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem)\s*\(/.test(src)) {
    fail.push(`${file} 에 퇴역한 브라우저 영구 문의 큐가 있다.`);
  }
}

/* ④ 누수 폼이 메모리 실패 보관·재시도·대체 연락에 실제 연결된다 -------- */
const rememberBody = functionBody(leakJs, 'rememberAndShowFailure') || '';
const retryBody = functionBody(leakJs, 'retryVisibleFailure') || '';
const doneBody = functionBody(leakJs, 'showDone') || '';
const submitBody = blockBody(leakJs, "form.addEventListener('submit', async") || '';

if (!/\bLEAD\.rememberFailure\s*\(\s*payload\s*\)/.test(rememberBody)) {
  fail.push('누수 실패 처리 함수가 공용 rememberFailure(payload)를 호출하지 않는다.');
}
if (!/\bLEAD\.retryLatest\s*\(\s*CONFIG\s*\)/.test(retryBody)) {
  fail.push('누수 재시도 함수가 공용 retryLatest(CONFIG)를 호출하지 않는다.');
}
if (!/id="lkRetry"/.test(doneBody) || !/id="lkCopy"/.test(doneBody) ||
    !/href="tel:'\s*\+\s*PHONE/.test(doneBody) || !/sms:/.test(doneBody)) {
  fail.push('누수 실패 화면에 다시 시도·복사·전화·문자(SMS) 경로가 모두 연결되지 않았다.');
}
if (!/최신\s*문의\s*1건/.test(doneBody) || !/현재\s*탭\s*메모리/.test(doneBody) ||
    !/새로고침/.test(doneBody) || !/탭을\s*닫으면\s*사라/.test(doneBody)) {
  fail.push('누수 실패 안내에 현재 탭 최신 1건·새로고침/탭 닫기 소멸 설명이 없다.');
}
// 버튼 복구는 '최신 시도만' 이어야 하고(지난 시도가 끝나며 버튼을 되살리면 중복 접수),
// 누른 표시로 바꾼 글자도 같이 되돌려야 한다 — 안 되돌리면 버튼이 '접수 중입니다…'에
// 굳은 채로 다시 눌리게 된다.
if (!/const\s+attempt\s*=\s*\+\+leakSubmitAttemptEpoch/.test(submitBody) ||
    !/if\s*\(attempt\s*!==\s*leakSubmitAttemptEpoch\)\s*return/.test(submitBody) ||
    !/finally\s*\{\s*if\s*\(attempt\s*===\s*leakSubmitAttemptEpoch\)\s*\{[\s\S]{0,200}?submitBtn\.disabled\s*=\s*false;[\s\S]{0,200}?submitBtn\.textContent\s*=\s*submitLabel;/.test(submitBody)) {
  fail.push('누수 제출의 attempt epoch 또는 최신 시도만 버튼을 복구하는 finally 가드가 없다.');
}
// 눌렸다는 표시를 버튼 자체에 남기는가 — status 문구만으로는 화면 밖이라 안 보인다.
if (!/submitBtn\.textContent\s*=\s*'접수 중입니다…'/.test(submitBody)) {
  fail.push('누수 제출 버튼이 전송 중에도 원래 글자 그대로다 — 손님이 안 눌린 줄 알고 다시 누른다.');
}
if (!/window\.addEventListener\(\s*['"]online['"]\s*,\s*\(\)\s*=>\s*\{\s*retryVisibleFailure\(\);\s*\}\s*\)/.test(leakJs)) {
  fail.push('누수 온라인 복귀 이벤트가 현재 탭 재시도 함수에 연결되지 않았다.');
}

/* ⑤ 접수 뒤 폼이 실제로 사라지는지 — display 를 준 요소는 hidden 속성만으로 안 사라진다 */
if (!/\.leak-form\[hidden\][^{]*\{[^}]*display:\s*none/.test(css)) {
  fail.push('css/leak-theme.css 에 .leak-form[hidden]{display:none} 이 없다 — 접수 뒤에도 폼이 남아 중복 접수가 된다.');
}

/* ⑥ 모바일 헤더 전화 버튼 손가락 크기(44px) */
const headerCall = /@media \(max-width: 640px\)[\s\S]*?\.header-call\s*\{([^}]*)\}/.exec(css);
if (!headerCall) fail.push('css/leak-theme.css 좁은 화면 규칙에 .header-call 이 없다.');
else {
  const w = /min-width:\s*(\d+)px/.exec(headerCall[1]);
  const h = /min-height:\s*(\d+)px/.exec(headerCall[1]);
  if (!w || !h || Number(w[1]) < 44 || Number(h[1]) < 44) {
    fail.push('좁은 화면 .header-call 의 누를 수 있는 면적이 44px 미만이다 — 급한 사람이 눌러도 안 걸린다.');
  }
}

/* ⑦ 누수 페이지 상담 버튼이 다른 페이지로 튕기지 않는지 */
if (/index\.html\?type=누수#inquiry/.test(leak)) {
  fail.push('leak.html 에 인테리어 폼으로 보내는 링크가 남아 있다 — 같은 페이지 폼(#leakInquiry)으로 보내야 한다.');
}

if (fail.length) {
  console.error('누수 상담 폼 검사 실패:');
  for (const f of fail) console.error('  - ' + f);
  process.exit(1);
}
console.log('누수 상담 폼 검사 통과');
