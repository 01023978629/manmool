#!/usr/bin/env node
/* 사례 등록 화면(case-new.html)이 '안전하고 정직한 상태'인지 검사한다.
 *
 * 막으려는 사고:
 *  1) 개인정보 규칙이 화면과 생성기에서 갈라진다 → 화면은 통과시켰는데 글에 동·호수가 남는다
 *  2) 화면이 만든 재료를 생성기가 못 읽는다 → 사장님이 정리한 게 헛일이 된다
 *  3) 미리보기 제목과 실제 글 제목이 달라진다 → 보고 승인한 것과 다른 게 올라간다
 *  4) 내부 업무 화면이 검색에 잡힌다
 *  5) 이 화면이 어딘가로 내용을 전송한다 (사진·현장 정보가 밖으로 나간다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const html = read('case-new.html');
const js = read('js/case-new.js');
const rules = read('js/pii-rules.js');
const maker = read('scripts/new-case-post.mjs');
const admin = read('admin.html');
const robots = read('robots.txt');

const fail = [];

/* ① 개인정보 규칙은 js/pii-rules.js 한 곳에만 있다 */
if (!/window\.MANMUL_PII_RULES\s*=/.test(rules)) fail.push('js/pii-rules.js 가 브라우저용 규칙을 내보내지 않는다.');
if (!/\bwindow\.MANMUL_PII_RULES\b(?![A-Za-z0-9_$])/.test(js)) {
  fail.push('js/case-new.js 가 공용 개인정보 규칙(window.MANMUL_PII_RULES)을 쓰지 않는다.');
}
// 파일 이름이 '어딘가에 나오는지'가 아니라 '실제로 읽어서 쓰는지'를 본다.
// 처음엔 /pii-rules\.js/ 로 짰다가 변이 검증에서 걸렸다 — 설명 주석에만 이름이
// 남아 있어도 통과했다.
if (!/readFileSync\([^)]*'pii-rules\.js'\)/.test(maker) || !/MANMUL_PII_RULES/.test(maker)) {
  fail.push('scripts/new-case-post.mjs 가 js/pii-rules.js 를 실제로 읽어 쓰지 않는다 — 규칙이 갈라진다.');
}
// 두 곳 중 어디든 정규식을 새로 적어두면 사본이 생긴 것이다. 정본 파일에만 있어야 한다.
const ruleCount = (rules.match(/\[\s*'[^']+',\s*\//g) || []).length;
if (ruleCount < 5) fail.push(`js/pii-rules.js 의 규칙이 ${ruleCount}개뿐이다 — 정본이 비었거나 형식이 바뀌었다.`);
for (const [file, src] of [['js/case-new.js', js], ['scripts/new-case-post.mjs', maker]]) {
  if (/(?:동|호)\)\(\?=\$\|/.test(src) || /01\[016789\]/.test(src)) {
    fail.push(`${file} 안에 개인정보 정규식 사본이 있다 — js/pii-rules.js 하나만 써야 한다.`);
  }
}

/* ② 스크립트 순서 — 규칙이 먼저 와야 화면이 산다 */
const a = html.indexOf('js/pii-rules.js');
const b = html.indexOf('js/case-new.js');
if (a < 0 || b < 0) fail.push('case-new.html 이 규칙 파일 또는 화면 스크립트를 읽지 않는다.');
else if (a > b) fail.push('case-new.html 에서 pii-rules.js 가 case-new.js 보다 뒤에 있다 — 검사 없이 통과된다.');

/* ③ 화면이 만든 재료를 생성기가 읽을 수 있다 (라벨이 같아야 한다) */
for (const label of ['동네+단지', '탐지 방법', '원인+전유/공용', '공사 내용', '걸린 시간']) {
  if (!js.includes(label)) fail.push(`js/case-new.js 의 재료 형식에 '${label}' 라벨이 없다 — 생성기가 못 읽는다.`);
  if (!maker.includes(label)) fail.push(`scripts/new-case-post.mjs 가 '${label}' 라벨을 읽지 않는다.`);
}

/* ④ 미리보기 제목·요약이 실제 글과 같은 틀을 쓴다 */
for (const [what, needle] of [['제목', '— 탐지부터 보수까지'], ['요약', '실제 현장 기록으로 정리했습니다']]) {
  if (!js.includes(needle) || !maker.includes(needle)) {
    fail.push(`미리보기와 실제 글의 ${what} 틀이 다르다 — 보고 승인한 것과 다른 글이 올라간다.`);
  }
}

/* ⑤ 내부 업무 화면이라 검색에서 빠져야 한다 */
if (!/<meta name="robots" content="noindex,nofollow"/.test(html)) fail.push('case-new.html 에 noindex 가 없다.');
if (!/^Disallow: \/case-new\.html$/m.test(robots)) fail.push('robots.txt 가 /case-new.html 을 막지 않는다.');
if (!/href="case-new\.html"/.test(admin)) fail.push('admin.html 에서 사례 등록 화면으로 가는 길이 없다.');

/* ⑥ 이 화면은 아무것도 전송하지 않는다 */
for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket']) {
  if (js.includes(banned)) fail.push(`js/case-new.js 가 ${banned} 를 쓴다 — 이 화면은 어디로도 전송하지 않아야 한다.`);
}
if (/<form[^>]+action=/.test(html)) fail.push('case-new.html 의 폼에 action 이 있다 — 눌리면 내용이 전송된다.');

/* ⑦ 사이트를 바꾸지 않는다고 화면에 밝힌다 */
if (!/사이트를 바꾸지 않습니다/.test(html)) {
  fail.push('case-new.html 이 "여기서 등록해도 사이트는 바뀌지 않는다"는 사실을 밝히지 않는다.');
}

if (fail.length) {
  console.error('사례 등록 화면 검사 실패:');
  for (const f of fail) console.error('  - ' + f);
  process.exit(1);
}
console.log('사례 등록 화면 검사 통과');
