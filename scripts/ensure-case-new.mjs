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
const store = read('js/case-store.js');
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

/* ⑥ 이 화면은 아무것도 전송하지 않는다 (보관소도 마찬가지) */
for (const [file, src] of [['js/case-new.js', js], ['js/case-store.js', store]]) {
  for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket']) {
    if (src.includes(banned)) fail.push(`${file} 이 ${banned} 를 쓴다 — 이 화면은 어디로도 전송하지 않아야 한다.`);
  }
}

/* ⑧ 저장한 현장이 사라지지 않는다 --------------------------------------
   사진까지 담아야 하므로 localStorage 로는 안 된다(문자열만 담기고 한도가 작다).
   그리고 저장이 실패했는데 입력을 비우면 사장님이 적어둔 현장이 그냥 없어진다. */
if (!/indexedDB\.open/.test(store)) {
  fail.push('js/case-store.js 가 IndexedDB 를 쓰지 않는다 — 사진을 담으면 저장이 통째로 실패한다.');
}
if (!/window\.ManmulCaseStore\b(?![A-Za-z0-9_$])/.test(store) ||
    !/\bwindow\.ManmulCaseStore\b(?![A-Za-z0-9_$])/.test(js)) {
  fail.push('사례 등록 화면과 보관소가 연결돼 있지 않다(window.ManmulCaseStore).');
}
{
  // 저장이 실패했는데 입력을 비우면 사장님이 적어둔 현장이 그냥 사라진다.
  // 그래서 두 가지를 본다 — 실패를 받는 catch 안에 return 이 있는지,
  // 그리고 입력 비우기가 그 catch 블록 '뒤'에 오는지.
  //
  // 처음엔 handler 안의 첫 return 위치만 봤다가 변이 검증에서 두 건을 놓쳤다:
  // 맨 앞의 `if (blocked(g)) return;` 이 먼저 걸려서, catch 안의 return 을
  // 통째로 지워도 통과했다.
  const save = /\$\('cfSave'\)\.addEventListener\(([\s\S]*?)\n  \}\);/.exec(js);
  if (!save) fail.push("js/case-new.js 에서 저장 버튼 처리를 찾지 못했다.");
  else {
    const body = save[1];
    const catchAt = body.indexOf('catch (');
    if (catchAt < 0) fail.push('저장에 실패를 받는 곳(catch)이 없다 — 공간이 차면 적어둔 현장이 조용히 사라진다.');
    else {
      // catch 블록의 끝을 중괄호 균형으로 찾는다(정규식만으로는 중첩 때문에 부정확).
      let i = body.indexOf('{', catchAt), depth = 0, end = -1;
      for (; i < body.length; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') { depth--; if (!depth) { end = i; break; } }
      }
      const inCatch = end > 0 ? body.slice(catchAt, end) : '';
      if (!/\breturn;/.test(inCatch)) {
        fail.push('저장 실패(catch) 안에서 되돌아가지 않는다 — 실패해도 저장된 것처럼 진행된다.');
      }
      const clear = body.indexOf("$(id).value = ''");
      if (clear >= 0 && end > 0 && clear < end) {
        fail.push('입력 비우기가 저장 실패 처리보다 앞에 있다 — 저장이 안 됐는데 적은 내용이 지워진다.');
      }
    }
  }
}
const orderStore = html.indexOf('js/case-store.js');
if (orderStore < 0) fail.push('case-new.html 이 js/case-store.js 를 읽지 않는다.');
else if (orderStore > b) fail.push('case-new.html 에서 case-store.js 가 case-new.js 보다 뒤에 있다 — 목록이 뜨지 않는다.');

/* ⑨ 여러 현장을 한 번에 내려받아도 사진 이름이 겹치지 않는다 */
if (!/photoNames/.test(js) || !/shortId\(rec\.id\)/.test(js)) {
  fail.push('현장별 사진 이름에 구분 꼬리표가 없다 — 여러 건을 내려받으면 파일이 서로 덮어쓴다.');
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
