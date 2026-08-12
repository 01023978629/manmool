#!/usr/bin/env node
/* 준공 처리가 '말한 대로' 동작하는지 검사한다.
 *
 * 막으려는 사고:
 *  1) 화면은 "체크리스트와 사진이 모두 있어야 완료 처리됩니다"라고 적어 놓고
 *     아무 때나 눌리는 것 — 그 문장이 거짓말이 된다.
 *  2) 보증기간이 법정 기준과 어긋나는 것(방수 3년·급배수 등 설비 2년·마감 1년).
 *  3) 아직 오지 않은 날짜로 준공해 보증이 미래에 시작되는 것.
 *  4) 이 처리가 이 브라우저에만 있다는 사실을 감추는 것 — 대표가 고객도 본 줄 안다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const fieldHtml = read('field.html');
const fieldJs = read('js/field.js');
const state = read('js/project-state.js');
const mypageHtml = read('mypage.html');
const mypageJs = read('js/mypage.js');
const project = JSON.parse(read('data/project.json'));

const fail = [];

/* ① 준공 처리 자리와 되돌리기 */
for (const [id, what] of [['donePanel', '준공 처리 절'], ['doneBtn', '준공 처리 버튼'],
  ['reopenBtn', '준공 취소 버튼'], ['doneDate', '준공일 입력']]) {
  if (!new RegExp(`id="${id}"`).test(fieldHtml)) fail.push(`field.html 에 ${what}(#${id})이 없다.`);
}

/* ② 두 화면이 같은 덮어쓰기를 쓴다 — 안 그러면 현장관리만 준공이고 고객은 시공 중이다 */
if (!/window\.ManmulProjectState\s*=/.test(state)) fail.push('js/project-state.js 가 공용 상태를 내보내지 않는다.');
for (const [file, html, js] of [['field', fieldHtml, fieldJs], ['mypage', mypageHtml, mypageJs]]) {
  if (!/\bwindow\.ManmulProjectState\b(?![A-Za-z0-9_$])/.test(js)) {
    fail.push(`js/${file}.js 가 공용 상태(window.ManmulProjectState)를 쓰지 않는다.`);
  }
  const a = html.indexOf('js/project-state.js');
  const b = html.indexOf(`js/${file}.js`);
  if (a < 0) fail.push(`${file}.html 이 js/project-state.js 를 읽지 않는다.`);
  else if (a > b) fail.push(`${file}.html 에서 project-state.js 가 뒤에 있다 — 준공 상태가 반영되지 않는다.`);
}

/* ③ 조건을 채우기 전에는 누를 수 없다 */
{
  const gate = /function doneGateReasons\(\)([\s\S]*?)\n  \}/.exec(fieldJs);
  if (!gate) fail.push('js/field.js 에 준공 조건 판단(doneGateReasons)이 없다.');
  else {
    // '값을 읽는지'가 아니라 '못 채웠을 때 이유를 내놓는지'를 본다. 처음엔 checkState 가
    // 본문에 있는지만 봤다가 변이 검증에서 걸렸다 — 이유를 담는 줄을 통째로 지워도
    // 남은 `const left = CHECK_ITEMS.filter(… !checkState[i])` 가 검사를 통과시켰다.
    if (!/checkState/.test(gate[1]) || !/reasons\.push\([^;]*left/.test(gate[1])) {
      fail.push('작업 완료 체크가 남아도 준공을 막는 이유를 내놓지 않는다.');
    }
    if (!/photos\.length/.test(gate[1]) || !/reasons\.push\([^;]*사진/.test(gate[1])) {
      fail.push('사진이 없어도 준공을 막는 이유를 내놓지 않는다.');
    }
    // 모아 둔 이유를 그대로 돌려줘야 한다. `return [];` 로 바꿔치기하면 위의 두 검사는
    // 그대로 통과하면서 조건이 통째로 무력해진다(변이 검증에서 걸렸다).
    if (!/\breturn reasons;/.test(gate[1])) {
      fail.push('준공 조건이 모아 둔 이유를 돌려주지 않는다 — 조건이 있으나 마나가 된다.');
    }
  }
  if (!/\$\('doneBtn'\)\.disabled\s*=/.test(fieldJs)) fail.push('조건을 못 채웠을 때 준공 버튼을 잠그지 않는다.');
  // 체크·사진이 바뀌면 다시 판단해야 한다. 안 그러면 다 채워도 버튼이 잠긴 채다.
  // 개수만 세면 안 된다 — 다른 자리에 남아 있는 호출이 수를 채워 버린다(변이 검증에서 걸렸다).
  // 바뀌는 자리 두 곳을 각각 확인한다.
  const checkHandler = /checkState\[el\.dataset\.i\][^\n]*/.exec(fieldJs);
  if (!checkHandler || !/renderDone\(\)/.test(checkHandler[0])) {
    fail.push('작업 완료 체크를 바꿔도 준공 조건을 다시 보지 않는다 — 다 채워도 버튼이 잠긴 채로 남는다.');
  }
  const photoSave = /\$\('phStatus'\)[^\n]*renderPhotos\(\)[^\n]*/.exec(fieldJs);
  if (!photoSave || !/renderDone\(\)/.test(photoSave[0])) {
    fail.push('사진을 등록해도 준공 조건을 다시 보지 않는다 — 사진을 넣어도 버튼이 잠긴 채로 남는다.');
  }
}

/* ④ 아직 오지 않은 날짜로 보증을 시작시키지 않는다 */
if (!/\$\('doneDate'\)\.max\s*=/.test(fieldJs)) fail.push('준공일에 상한(오늘)이 없다 — 미래 날짜로 보증이 시작될 수 있다.');
if (!/day > today/.test(fieldJs)) fail.push('준공일이 오늘보다 뒤인지 확인하지 않는다.');

/* ⑤ 보증기간이 법정 기준과 같다 (건설산업기본법 하자담보책임기간) */
{
  const want = [[/방수/, 3], [/급배수|설비/, 2]];
  for (const [re, years] of want) {
    const item = (project.warranty.items || []).find((x) => re.test(x.work));
    if (!item) fail.push(`data/project.json 보증 항목에 ${re.source} 가 없다.`);
    else if (Number(item.years) !== years) {
      fail.push(`${item.work} 보증이 ${item.years}년이다 — 법정 기준은 ${years}년이다.`);
    }
  }
  for (const it of project.warranty.items || []) {
    if (Number(it.years) < 1) fail.push(`${it.work} 보증이 1년 미만이다.`);
  }
}

/* ⑥ 만료일은 준공일 + 공종별 연수 */
if (!/setFullYear\(d\.getFullYear\(\) \+ Number/.test(state)) {
  fail.push('js/project-state.js 가 보증 만료일을 준공일 + 연수로 계산하지 않는다.');
}

/* ⑦ 이 브라우저에만 있다는 사실을 감추지 않는다 */
if (!/이 브라우저에만/.test(fieldHtml)) {
  fail.push('field.html 이 "이 처리는 이 브라우저에만 기록된다"는 사실을 밝히지 않는다 — 대표가 고객도 본 줄 안다.');
}

if (fail.length) {
  console.error('준공 처리 검사 실패:');
  for (const f of fail) console.error('  - ' + f);
  process.exit(1);
}
console.log('준공 처리 검사 통과');
