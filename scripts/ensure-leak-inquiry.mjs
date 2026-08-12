#!/usr/bin/env node
/* 누수 페이지 상담 폼이 '접수되는 상태'로 남아 있는지 검사한다.
 *
 * 여기서 막으려는 사고는 세 가지다.
 *  1) 전송·보관 코드가 폼마다 갈라져서, 나중에 한쪽만 고쳐지고 다른 쪽 리드가 샌다.
 *  2) 화면의 보유기간 안내와 실제 삭제 시점이 어긋난다.
 *  3) 스크립트 순서가 뒤집혀 폼이 조용히 죽는다(제출해도 아무 일도 안 일어난다).
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

/* ③ 전송·보관은 공용 모듈 한 곳에만 — 폼별 자체 구현이 생기면 경로가 갈라진다 */
if (!/window\.ManmulLead\s*=/.test(transport)) fail.push('js/lead-transport.js 가 window.ManmulLead 를 내보내지 않는다.');
for (const [file, src] of [['js/inquiry.js', inquiryJs], ['js/leak-inquiry.js', leakJs]]) {
  // 이름 끝을 막는다. 처음엔 /ManmulLead/ 로 짰다가 변이 검증에서 걸렸다 —
  // window.ManmulLeadX 로 바꿔도 부분문자열이라 그대로 통과했다.
  if (!/\bwindow\.ManmulLead\b(?![A-Za-z0-9_$])/.test(src)) {
    fail.push(`${file} 가 공용 전송 모듈(window.ManmulLead)을 쓰지 않는다.`);
  }
  // 자체 구현 여부는 '함수 선언'으로만 본다. 호출(LEAD.deliver(...))은 정상이다.
  for (const fn of ['deliver', 'saveLocal', 'backendConfigured', 'pruneExpired']) {
    if (new RegExp(`(?:async\\s+)?function\\s+${fn}\\s*\\(`).test(src)) {
      fail.push(`${file} 안에 ${fn}() 자체 구현이 있다 — 공용 모듈과 갈라져 한쪽 리드가 샌다.`);
    }
  }
}

/* ④ 화면의 보유기간 안내 == 코드의 실제 삭제 기간 */
const days = /RETENTION_DAYS\s*=\s*(\d+)/.exec(transport);
if (!days) fail.push('js/lead-transport.js 에서 RETENTION_DAYS 를 찾지 못했다.');
else {
  const years = Number(days[1]) / 365;
  for (const [page, html] of [['leak.html', leak], ['index.html', index]]) {
    const notice = /보유기간\s*(\d+)\s*년/.exec(html);
    if (!notice) fail.push(`${page} 동의 문구에 보유기간 안내가 없다.`);
    else if (Number(notice[1]) !== years) {
      fail.push(`${page} 는 보유기간 ${notice[1]}년이라 안내하는데 코드는 ${days[1]}일(${years}년)이다.`);
    }
  }
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
