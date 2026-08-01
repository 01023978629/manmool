/** ============================================================
 * 만물인테리어 전자계약 — 순수 계층 자동 검사 실행기
 * ------------------------------------------------------------
 * 무엇을 하는가
 *   · Pure.gs 와 Schema.gs 의 **원본 파일을 그대로 읽어** node:vm 으로 평가한다.
 *   · 평가한 전역에서 PURE_EXPORTS / SCHEMA_EXPORTS 를 꺼내 pure.test.mjs 에 넘긴다.
 *   · 실패 건수를 세어 그만큼을 종료코드로 낸다(0 이면 전부 통과).
 *
 * 무엇을 하지 않는가
 *   · **원본을 복사하지 않는다.** 복사본은 언젠가 반드시 원본과 어긋나고,
 *     그때부터 이 검사는 "복사본이 맞다"만 증명하는 무의미한 초록불이 된다.
 *   · Sheets·Drive·Properties 를 흉내 내지 않는다. 그 계층은 사람이 눈으로 본다
 *     (수동검증-체크리스트.md). 여기서 가짜로 만들면 "가짜가 통과했다"만 알게 된다.
 *   · Utilities.* 가 필요한 AuthService.gs 는 다루지 않는다 — 순수하지 않다.
 *
 * 왜 vm 인가
 *   .gs 파일에는 export 가 없다(Apps Script 는 모듈이 아니다). import 하려면
 *   파일을 고쳐야 하는데, 검사 때문에 운영 코드를 고치는 것은 앞뒤가 바뀐 일이다.
 *   vm 은 파일을 한 글자도 건드리지 않고 그대로 실행해 준다.
 *
 * 왜 두 파일을 **한 전역**에 올리는가
 *   Apps Script 는 모든 .gs 가 전역 하나를 함께 쓴다. 같은 이름이 두 파일에 있으면
 *   경고 없이 한쪽이 덮어써진다. 여기서도 같은 조건으로 올려 그 사고를 재현한다.
 *   (덮어쓰기 자체는 아래 '이름 충돌' 검사가 따로 잡는다)
 *
 * 실행: node apps-script-contract/test/run.mjs
 * ============================================================ */

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import registerPure from './pure.test.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

// 검사 대상 — 순수한 파일만. 여기에 파일을 더할 때는 "바깥을 안 건드리는가"를 먼저 보라.
const GS_FILES = ['Pure.gs', 'Schema.gs'];

/* ============================================================
 * 1) .gs 를 원본 그대로 읽어 평가한다
 * ============================================================ */

function readGs(name) {
  const file = join(SRC, name);
  let src;
  try {
    src = readFileSync(file, 'utf8');
  } catch (e) {
    // 파일이 없는데 검사가 통과하면 안 된다. 여기서 멈춘다.
    console.error(`[치명] ${relative(process.cwd(), file)} 를 읽지 못했습니다: ${e.message}`);
    process.exit(255);
  }
  return { name, file, src };
}

/**
 * 새 전역(vm 컨텍스트)에 파일들을 차례로 올린다.
 * 빈 샌드박스로 시작하는 이유: Node 의 전역(process·require 등)이 보이면
 * .gs 가 실수로 그것을 쓰고 있어도 여기서는 통과해 버린다. Apps Script 에는 없는 것들이다.
 */
function loadAll(files) {
  const ctx = vm.createContext({});
  for (const f of files) {
    try {
      vm.runInContext(f.src, ctx, { filename: f.file });
    } catch (e) {
      console.error(`[치명] ${f.name} 평가 중 오류: ${e && e.message}`);
      process.exit(255);
    }
  }
  return ctx;
}

/** 파일 하나가 전역에 만드는 이름 목록. 이름 충돌 검사에 쓴다. */
function globalsOf(f) {
  const ctx = vm.createContext({});
  vm.runInContext(f.src, ctx, { filename: f.file });
  return Object.getOwnPropertyNames(ctx);
}

/* ============================================================
 * 2) 아주 작은 검사 도구
 * ============================================================ */
/**
 * 라이브러리를 쓰지 않는 이유: 이 저장소는 node_modules 없이 돌아야 한다.
 * 사장님 PC 에서 `node run.mjs` 한 줄로 끝나야 하고, 설치 단계가 하나 늘 때마다
 * "그때는 됐는데 지금은 안 된다"가 생긴다.
 */

const results = [];
let currentGroup = '(기타)';

function group(name) { currentGroup = name; }

function test(name, fn) {
  try {
    fn();
    results.push({ group: currentGroup, name, ok: true });
  } catch (e) {
    results.push({ group: currentGroup, name, ok: false, why: (e && e.message) || String(e) });
  }
}

class Failed extends Error {}
function fail(msg) { throw new Failed(msg); }

function show(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'bigint') return String(v) + 'n';
  try { return JSON.stringify(v); } catch { return String(v); }
}

// 값 비교 — Object.is 로 본다. NaN 을 NaN 과 같다고 보고, 0 과 -0 을 구분한다.
function eq(actual, expected, msg) {
  if (!Object.is(actual, expected)) {
    fail(`${msg || '값이 다릅니다'} — 기대 ${show(expected)} · 실제 ${show(actual)}`);
  }
}

function notEq(actual, unexpected, msg) {
  if (Object.is(actual, unexpected)) {
    fail(`${msg || '값이 같으면 안 됩니다'} — 둘 다 ${show(actual)}`);
  }
}

function ok(cond, msg) { if (!cond) fail(msg || '참이어야 합니다'); }
function no(cond, msg) { if (cond) fail(msg || '거짓이어야 합니다'); }

/**
 * 구조 비교. node:assert 의 deepStrictEqual 을 쓰지 않는 이유:
 * vm 안에서 만들어진 객체는 프로토타입이 이쪽 realm 과 달라서, 내용이 같아도
 * deepStrictEqual 이 "타입이 다르다"로 실패한다. 그 함정을 피해 직접 훑는다.
 */
function deepEq(actual, expected, msg) {
  const why = diff(actual, expected, '');
  if (why) fail(`${msg || '구조가 다릅니다'} — ${why}`);
}

function kindOf(v) { return Object.prototype.toString.call(v); }

function diff(a, b, path) {
  const at = path || '(뿌리)';
  if (kindOf(a) === '[object Array]' || kindOf(b) === '[object Array]') {
    if (kindOf(a) !== kindOf(b)) return `${at}: 한쪽만 배열입니다`;
    if (a.length !== b.length) return `${at}: 길이 ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return '';
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join(',') !== kb.join(',')) return `${at}: 키 [${ka}] ≠ [${kb}]`;
    for (const k of ka) {
      const d = diff(a[k], b[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
    return '';
  }
  if (!Object.is(a, b)) return `${at}: ${show(a)} ≠ ${show(b)}`;
  return '';
}

/** fn 이 던지는가. 던지지 않으면 실패. re 를 주면 메시지도 본다. */
function throws(fn, re, msg) {
  let thrown = null;
  try { fn(); } catch (e) { thrown = e; }
  if (!thrown) fail(`${msg || '오류가 나야 합니다'} — 그냥 통과했습니다`);
  if (re && !re.test(String(thrown.message || thrown))) {
    fail(`${msg || '오류 메시지가 다릅니다'} — 실제 "${thrown.message}"`);
  }
}

/** fn 이 던지지 않는가. 정상 입력이 막히는 '과잉 방어'를 잡는 데 쓴다. */
function noThrow(fn, msg) {
  try { fn(); } catch (e) {
    fail(`${msg || '오류가 나면 안 됩니다'} — ${(e && e.message) || e}`);
  }
}

/* ============================================================
 * 3) 실행
 * ============================================================ */

const files = GS_FILES.map(readGs);
const ctx = loadAll(files);

// 꺼내기 전에 있는지부터 본다. 없는 채로 아래를 돌면 전부 "undefined 라서 실패"가 되어
// 무엇이 잘못됐는지 안 보인다.
const P = ctx.PURE_EXPORTS;
const S = ctx.SCHEMA_EXPORTS;
if (!P || typeof P !== 'object') {
  console.error('[치명] Pure.gs 에서 PURE_EXPORTS 를 찾지 못했습니다.');
  process.exit(255);
}
if (!S || typeof S !== 'object') {
  console.error('[치명] Schema.gs 에서 SCHEMA_EXPORTS 를 찾지 못했습니다.');
  process.exit(255);
}

const T = { P, S, ctx, files, globalsOf, group, test, eq, notEq, ok, no, deepEq, throws, noThrow };

registerPure(T);

/* ---------- 결과 ---------- */

let failed = 0;
let lastGroup = null;
for (const r of results) {
  if (r.group !== lastGroup) {
    console.log(`\n── ${r.group}`);
    lastGroup = r.group;
  }
  if (r.ok) {
    console.log(`  ✓ ${r.name}`);
  } else {
    failed++;
    console.log(`  ✗ ${r.name}`);
    console.log(`      ${r.why}`);
  }
}

const total = results.length;
console.log(`\n${'─'.repeat(56)}`);
console.log(`검사 ${total}건 · 통과 ${total - failed}건 · 실패 ${failed}건`);
if (failed === 0) {
  console.log('전부 통과했습니다.');
} else {
  console.log('실패한 항목을 먼저 보세요. 종료코드는 실패 건수입니다.');
}

// 종료코드는 0~255 만 쓸 수 있다. 256 이 되면 셸이 0(성공)으로 읽어 실패가 성공이 된다.
// 그래서 255 에서 멈추고, 멈췄다는 사실을 말한다.
if (failed > 255) console.log(`(실패가 ${failed}건이라 종료코드는 255 로 자릅니다)`);
process.exit(Math.min(failed, 255));
