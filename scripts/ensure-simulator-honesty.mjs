/* ensure-simulator-honesty.mjs — AI 인테리어 시뮬레이터가 고객을 오해시키지 않게 지킨다
 *
 * 이 도구의 이름("AI 시뮬레이터")은 고객에게 '내 사진이 리모델링된 모습으로 바뀐다'는 기대를 준다.
 * 실제로는 규칙 기반 계산이다. 그 간극을 메우는 것이 화면의 고지 문구뿐이라,
 * 문구가 조용히 사라지거나 금액이 확정값처럼 표기되는 순간 그대로 분쟁 재료가 된다.
 * 아래는 전부 '없으면 손해가 나는' 것들이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fail = [];
const ok = [];
function check(cond, bad, good) { if (cond) ok.push(good); else fail.push(bad); }

const index = read('index.html');
const sim = read('js/simulator.js');
const inquiry = read('js/inquiry.js');
const main = read('js/main.js');
const css = read('css/styles.css');
const bom = read('js/design-bom.js');

/* ① 섹션이 실제로 붙어 있고 메뉴에서 갈 수 있다 ----------------------- */
check(/id="simulator"/.test(index),
  'index.html 에 #simulator 섹션이 없다 — 시뮬레이터가 사라졌다',
  '#simulator 섹션 존재');
check(/href="#simulator"/.test(index),
  '주 메뉴에 #simulator 링크가 없다 — 섹션이 고아가 된다(폰 메뉴도 같은 엘리먼트다)',
  '메뉴에서 시뮬레이터로 갈 수 있음');
check(/js\/simulator\.js\?v=/.test(index),
  'simulator.js 스크립트 태그(캐시 버스팅 ?v=) 가 없다',
  'simulator.js 로드됨');
check(/initSimulator/.test(main),
  'main.js 가 initSimulator 를 호출하지 않는다 — 화면이 비어 있게 된다',
  'main.js 초기화 연결됨');

/* ② "사진을 합성하지 않는다"는 고지가 정적 HTML에 있다 ----------------- */
// JS 렌더 안에만 두면 스크립트 실패·크롤러에게는 이름만 남는다.
check(/사진을 합성하지 않습니다/.test(index),
  '"사진을 합성하지 않습니다" 고지가 index.html 정적 마크업에서 사라졌다 — 이름만 보고 오해한다',
  'AI 명칭 오해 차단 고지가 정적 HTML에 있음');

/* ③ 결과 화면 고지 3종이 코드에 살아 있다 ----------------------------- */
check(/참고용 구성안입니다/.test(sim),
  '결과 최상단 "참고용 구성안입니다" 고지가 없다',
  '결과 상단 고지 존재');
check(/서면 견적서로만 확정/.test(sim),
  '금액 고지("최종 금액은 방문 실측 후 서면 견적서로만 확정")가 없다 — 화면 금액이 견적서로 읽힌다',
  '금액 고지 존재');
check(/등급의 예시/.test(sim) && /동급 대체품/.test(sim),
  '자재 고지("해당 등급의 예시 · 동급 대체품")가 없다 — 표시된 제품으로 시공해 준다고 읽힌다',
  '자재 고지 존재');

/* ④ 금액은 범위로만 말한다 ------------------------------------------- */
// 단일 확정값(₩38,420,000 같은)은 "약속한 금액"으로 읽히거나 허위 정밀도가 된다.
check(/rangeLow/.test(sim) && /rangeHigh/.test(sim),
  '시뮬레이터가 범위(rangeLow~rangeHigh)를 쓰지 않는다 — 단일 금액은 확정 견적으로 읽힌다',
  '금액을 범위로 표기');
check(/roundMan/.test(sim),
  '금액 반올림(roundMan)이 없다 — 원 단위 금액은 허위 정밀도다',
  '금액을 만원 단위로 반올림');
check(!/정확도\s*\d+\s*%/.test(sim) && !/AI가 분석/.test(sim),
  '"정확도 N%" 또는 "AI가 분석" 같은 허위 정밀도 표현이 들어왔다',
  '허위 정밀도 표현 없음');
check(!/확정 견적|계약 가능/.test(sim),
  '"확정 견적"·"계약 가능" 표현이 들어왔다 — 시뮬레이터에서 계약을 유도하면 안 된다',
  '계약 유도 표현 없음');

/* ⑤ 결과를 전화번호 뒤에 숨기지 않는다 -------------------------------- */
// 결과 게이팅은 40~60대 고객에게 즉시 이탈 지점이다.
check(!/전화번호를 입력해야|번호를 입력하면 결과/.test(sim),
  '결과를 보려면 전화번호를 요구하는 문구가 생겼다 — 결과는 먼저 보여주고 예약 단계에서만 번호를 받는다',
  '결과 게이팅 없음');

/* ⑥ 계산은 기존 엔진을 쓴다 ------------------------------------------- */
// 따로 계산하면 같은 조건인데 사례 상세와 시뮬레이터 금액이 갈라진다.
check(/DesignBom/.test(sim) && /\.build\(/.test(sim),
  '시뮬레이터가 DesignBom 엔진을 쓰지 않는다 — 사례 카탈로그와 금액이 갈라진다',
  '기존 견적 엔진(DesignBom) 재사용');

/* ⑦ 저장 이미지에 고지·연락처가 굽혀 있다 ----------------------------- */
// 밖으로 나가는 유일한 물체라, 여기에 고지가 없으면 맥락 없이 금액만 돌아다닌다.
check(/참고용 구성안/.test(sim) && /010-2397-8629/.test(sim),
  '저장 이미지 워터마크에 고지 또는 대표 연락처가 없다',
  '저장 이미지에 고지·연락처 워터마크');

/* ⑧ 결과 → 상담 전환이 연결돼 있다 ------------------------------------ */
check(/manmul:sim/.test(sim) && /manmul:sim/.test(inquiry),
  '시뮬레이터 결과가 상담 폼으로 넘어가지 않는다(manmul:sim 이벤트 끊김)',
  '결과 → 상담 폼 연동됨');
check(/simSpec/.test(inquiry),
  '문의 본문에 사양서 요약(simSpec)이 실리지 않는다 — 사장님이 방문 전에 범위를 모른다',
  '문의에 사양서 요약 포함');

/* ⑨ 폰에서 쓸 수 있다 ------------------------------------------------- */
check(/\.sim-chip[^{]*\{[^}]*min-height:\s*44px/.test(css.replace(/\n/g, '')) || /\.sim-chip, \.sim-trim, \.sim-back \{ min-height: 44px/.test(css),
  '시뮬레이터 터치 대상에 min-height:44px 규칙이 없다 — 폰에서 누르기 어렵다',
  '폰 터치 대상 44px 확보');
check(/sim-/.test(css),
  'styles.css 에 sim- 접두사 스타일이 없다',
  'sim- 접두사 스타일 존재');

/* ⑩ 공간 사진과 세부 작업 핫스팟 ---------------------------------------- */
check(/SPACE_VIEW/.test(sim) && /sim-photo/.test(sim),
  '공간 사진(SPACE_VIEW)이 없다 — 고객이 무엇을 고르는지 볼 수 없다',
  '공간 사진 표시');
check(/data-simwork=/.test(sim),
  '사진 위 세부 작업 버튼(data-simwork)이 없다 — 작업을 골라 예산에 더할 수 없다',
  '세부 작업 선택 가능');
check(/시공 예시/.test(sim),
  '사진 캡션의 "시공 예시" 고지가 없다 — 고객이 자기 집 사진으로 오해한다',
  '사진이 시공 예시임을 명시');
check(/aria-pressed/.test(sim) && /aria-label/.test(sim),
  '핫스팟에 aria-pressed/aria-label 이 없다 — 스크린리더로는 무슨 작업인지 알 수 없다',
  '핫스팟 접근성 속성 존재');
// 사진 경로가 실제 파일을 가리키는가 — 오타 하나면 고객 화면이 빈 칸이 된다
{
  const photos = [...sim.matchAll(/photo:\s*'([^']+)'/g)].map((m) => m[1]);
  const missing = photos.filter((p) => !fs.existsSync(path.join(ROOT, p)));
  check(photos.length >= 3 && missing.length === 0,
    `시뮬레이터 사진 파일이 없다: ${missing.join(', ') || '(경로 자체가 없음)'}`,
    `공간 사진 ${photos.length}장 모두 실제 파일 존재`);
}

/* ⑪ 옵션 작업은 기본 견적을 건드리지 않는다 ---------------------------- */
// OPTION_DEFS 가 build() 안으로 새어 들어가면 240개 시안의 예상비용이 통째로 올라간다.
check(/OPTION_DEFS/.test(bom) && /function options\(/.test(bom),
  'design-bom.js 에 옵션 작업(OPTION_DEFS/options)이 없다 — TV장 같은 추가 작업을 고를 수 없다',
  '옵션 작업 정의 존재');
{
  const buildBody = (bom.split('function build(item, catalog)')[1] || '').split('function ')[0];
  check(!/OPTION_DEFS|options\(/.test(buildBody),
    'build() 가 옵션 작업을 포함한다 — 240개 시안 예상비용이 함께 올라간다',
    '옵션 작업이 기본 견적에 섞이지 않음');
}
check(/function totalsFrom\(/.test(bom) && /totalsFrom/.test(sim),
  '부분 합계 계산(totalsFrom)이 한 곳에 있지 않다 — 화면마다 금액이 갈라진다',
  '부분 합계 계산이 엔진에 일원화됨');

/* ⑫ 기존 사례 카탈로그를 지우지 않았다 --------------------------------- */
// 사장님 지시: "AI 인테리어 사례는 두고" — 시뮬레이터가 그것을 대체하면 안 된다.
check(/id="portfolio"/.test(index) && /AI 추천 인테리어 디자인/.test(index),
  '기존 "AI 추천 인테리어 디자인"(240 사례) 섹션이 사라졌다 — 시뮬레이터는 그것을 대체하지 않는다',
  '기존 사례 카탈로그 유지됨');

console.log('\n===== AI 시뮬레이터 정직성 검증 =====');
ok.forEach((m) => console.log('  ✓', m));
fail.forEach((m) => console.log('  ✗', m));
if (fail.length) {
  console.log(`\n${fail.length}건 실패 — 고객이 오해할 수 있는 상태입니다.`);
  process.exit(1);
}
console.log(`\n전부 통과 (${ok.length}건) · 시뮬레이터 고지·전환·계산 연결 정상`);
