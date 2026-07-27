/* ensure-lookbook-honesty.mjs — '우리집 한 채로 보기'가 고객을 오해시키거나 다른 화면을 망가뜨리지 않게 지킨다
 *
 * 이 화면은 시안 사진을 공간별로 나란히 놓는다. 고객 눈에는 '우리집 완성 예상도'처럼 보이기 쉽고,
 * 금액을 여기서 또 계산하면 시뮬레이터와 숫자가 갈라진다. 아래는 전부 '없으면 손해가 나는' 것들이다.
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
const look = read('js/lookbook.js');
const inquiry = read('js/inquiry.js');
const main = read('js/main.js');
const sim = read('js/simulator.js');
const bom = read('js/design-bom.js');
const css = read('css/styles.css');
const site = JSON.parse(read('data/site.json'));

/* ① 화면이 실제로 붙어 있다 -------------------------------------------- */
check(/id="lbBoard"/.test(index) && /data-lbview="home"/.test(index),
  'index.html 에 보기 전환 탭 또는 보드(#lbBoard)가 없다 — 기능이 고아가 된다',
  '보기 전환 탭·보드 존재');
check(/js\/lookbook\.js\?v=/.test(index) && /initLookbook/.test(main),
  'lookbook.js 로드 또는 main.js 초기화 연결이 끊겼다',
  'lookbook.js 로드·초기화 연결');

/* ② 기존 사례 카탈로그를 대체하지 않는다 -------------------------------- */
// 사장님 지시: "AI 인테리어 사례는 두고" — 새 보기는 그것을 덮지 않는다.
check(/id="portfolio"/.test(index) && /AI 추천 인테리어 디자인/.test(index),
  '기존 "AI 추천 인테리어 디자인" 섹션이 사라졌다',
  '기존 사례 카탈로그 유지됨');
// 개수를 숫자로 박아두면 카탈로그를 늘릴 때마다 검증기가 거짓으로 빨간불이 된다(실제로 300 확장 때 그랬다).
// 지켜야 할 것은 '몇 개냐'가 아니라 ⑴ 줄지 않았고 ⑵ 화면에 적은 숫자가 사실이냐 두 가지다.
{
  const n = Array.isArray(site.portfolio) ? site.portfolio.length : 0;
  const FLOOR = 240; // 지금까지 공개된 최소치 — 이 아래로 내려가면 카탈로그가 잘려나간 것이다
  check(n >= FLOOR,
    `site.json portfolio 가 ${n}개로 줄었다(최소 ${FLOOR}) — 카탈로그가 파손됐다`,
    `portfolio ${n}개 (축소 없음)`);
  const claim = index.match(/총\s*([\d,]+)\s*가지/);
  const claimed = claim ? Number(claim[1].replace(/,/g, '')) : null;
  check(claimed === n,
    `화면에는 "총 ${claimed}가지"라고 적혀 있는데 실제 시안은 ${n}개다 — 고객에게 숫자를 부풀려 말하게 된다`,
    `화면 표기(총 ${claimed}가지)와 실제 시안 수 일치`);
}

/* ③ 메뉴를 늘리지 않는다 ------------------------------------------------ */
// 메뉴가 늘면 "우리집 사양서"와 "우리집 한 채"를 고객이 구분하지 못한다.
check(!/href="#lookbook"/.test(index) && !/href="#lb/.test(index),
  '주 메뉴에 새 링크가 생겼다 — 보기 모드는 #portfolio 안에서 끝낸다',
  '새 메뉴 항목 없음(보기 모드로만)');

/* ④ 고지가 정적 HTML 에 있다 -------------------------------------------- */
// JS 실패·크롤러에게 이름만 남으면 "우리집 사진"으로 오해한다.
check(/고객님 댁을 촬영하거나 합성한 것이 아닙니다/.test(index),
  '"촬영·합성이 아니다" 고지가 정적 마크업에서 사라졌다',
  '합성 아님 고지가 정적 HTML에 있음');
check(/금액을 계산하지 않습니다/.test(index),
  '"금액을 계산하지 않습니다" 고지가 사라졌다 — 화면 금액이 합계로 읽힌다',
  '금액 미계산 고지 존재');

/* ⑤ 허위 정밀도·계약 유도 표현 없음 ------------------------------------- */
check(!/정확도\s*\d+\s*%/.test(look) && !/AI가 분석/.test(look) && !/확정 견적|계약 가능/.test(look),
  'lookbook.js 에 허위 정밀도 또는 계약 유도 표현이 들어왔다',
  '허위 정밀도·계약 유도 표현 없음');

/* ⑥ 금액을 두 번 계산하지 않는다 ---------------------------------------- */
// 시안마다 기준 평형이 18~52평으로 달라 합계가 의미를 잃고, 시뮬레이터와도 갈라진다.
check(/formatCompactRange/.test(look),
  'lookbook.js 가 DesignBom.formatCompactRange 를 쓰지 않는다 — 금액 표기가 카탈로그와 갈라진다',
  '금액 표기를 엔진 포맷에 위임');
check(!/rangeLow\s*\+[^)]|low\s*\+=/.test(look),
  'lookbook.js 에 금액 합산 코드가 있다 — 합계는 시뮬레이터 한 곳에서만 낸다',
  '금액 합산 없음');

/* ⑦ 데이터에 없는 판정을 하지 않는다 ------------------------------------ */
// 거실 30개 중 마루 표기 17개·6종. "바닥이 이어집니다" 류는 대부분 거짓이 된다.
{
  // 주석에는 "'바닥이 이어집니다' 류 판정은 하지 않는다"처럼 금지어가 설명으로 들어간다.
  // 검사 대상은 '고객 화면에 나가는 문장'이므로 주석을 걷어내고 본다.
  const code = look.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const judging = /이어집니다|잘 어울립니다|어울리지 않|조화도|어울림 점수/;
  check(!judging.test(code),
    'lookbook.js 가 조합을 판정하는 문장을 만든다 — 데이터에 없는 주장을 사실처럼 말하게 된다',
    '조합 판정·점수 표현 없음');
}

/* ⑧ 상담 폼의 '관심 디자인'을 가짜로 덮지 않는다 ------------------------ */
check(/selectDesign\(/.test(look) && /budget:\s*null/.test(look),
  'lookbook.js 가 selectDesign 을 호출하지 않거나 budget 을 null 로 넘기지 않는다 — 자재 등급 문자열이 고객 예산 칸을 오염시킨다',
  '관심 디자인 전달 시 예산 칸 오염 방지');
check(!/id:\s*['"]lookbook/.test(look),
  '가짜 시안 id(lookbook-…)를 만들어 넘긴다 — 고객이 고른 실제 시안을 덮어쓴다',
  '실제 시안만 상담 폼에 전달');

/* ⑨ 대표 메일에 구성이 실린다 ------------------------------------------- */
check(/manmul:lookbook/.test(look) && /manmul:lookbook/.test(inquiry),
  '조합이 상담 폼으로 넘어가지 않는다(manmul:lookbook 끊김)',
  '조합 → 상담 폼 연동됨');
check(/lookSpec/.test(inquiry) && /d\.lookSpec/.test(inquiry),
  '문의 본문(buildLeadText)에 lookSpec 이 실리지 않는다 — 대표가 방문 전에 구성을 모른다',
  '문의 본문에 구성 요약 포함');

/* ⑩ 사양서 요약과 슬롯이 분리돼 있다 ------------------------------------ */
check(/SIM_SPEC/.test(inquiry) && /LOOK_SPEC/.test(inquiry),
  'SIM_SPEC 과 LOOK_SPEC 이 슬롯을 공유한다 — 나중에 쓴 쪽이 앞의 요약을 지운다',
  '사양서·조합 요약 슬롯 분리');

/* ⑪ 재현 링크가 id 기반이다 --------------------------------------------- */
// portfolio 배열은 공간별로 뭉쳐 있지 않다. 인덱스 링크는 시안이 하나만 늘어도 '다른 시안이 조용히 열리는' 오답이 된다.
check(/p\.id === seg\[1\]|p\.id === id/.test(look),
  '재현 링크가 시안 id 로 조회하지 않는다 — 카탈로그가 늘면 다른 시안이 열린다',
  '재현 링크가 id 기반');

/* ⑫ 두 해시가 서로를 지우지 않는다 -------------------------------------- */
check(/MANMUL_HASH/.test(main) && /MANMUL_HASH/.test(look) && /MANMUL_HASH/.test(sim),
  '#sim= 과 #look= 이 공용 해시 헬퍼를 쓰지 않는다 — 한쪽이 다른 쪽을 지운다',
  '해시 공용 헬퍼로 공존');
check(!/location\.hash\s*=\s*['"]/.test(sim) && !/location\.hash\s*=\s*['"]/.test(look),
  'location.hash 에 직접 대입하는 코드가 있다 — 같이 있던 다른 키가 사라진다',
  'location.hash 직접 대입 없음');

/* ⑬ 사진을 미리 다 받지 않는다 ------------------------------------------ */
// 스프라이트 시트를 즉시 로드하면 첫 화면이 느려진다(지연 로딩 상속).
check(/portfolioSpriteMarkup\(/.test(look) && !/portfolioSpriteMarkup\([^)]*,\s*true\)/.test(look),
  'lookbook.js 가 스프라이트를 eager 로 강제 로드한다 — 첫 로딩이 무거워진다',
  '사진 지연 로딩 유지');
check(/observeSprites\(\)/.test(look),
  '렌더 후 observeSprites() 호출이 없다 — 사진이 빈 칸으로 남는다',
  '렌더 후 사진 관찰자 재부착');

/* ⑭ 스코프 이탈 없음 ---------------------------------------------------- */
// 이미지 저장·업로드·네트워크는 이 화면의 일이 아니다(시뮬레이터가 이미 갖고 있다).
check(!/createElement\('canvas'\)|toBlob|getImageData|fetch\(/.test(look),
  'lookbook.js 에 캔버스·업로드·네트워크 코드가 들어왔다 — 스코프 이탈이며 저사양 기기에서 위험하다',
  '캔버스·업로드·네트워크 없음');

/* ⑮ 문구 데이터가 살아 있다 --------------------------------------------- */
{
  const lb = site.lookbook || {};
  const n = lb.notices || {};
  const need = ['top', 'money', 'palette', 'material', 'facts'];
  const missing = need.filter((k) => !n[k]);
  check(missing.length === 0,
    `site.json lookbook.notices 에 ${missing.join(', ')} 고지가 없다`,
    'lookbook 고지 문구 5종 존재');
}

/* ⑯ 폰에서 누를 수 있다 -------------------------------------------------- */
check(/\.lb-/.test(css) && /\.lb-space, \.lb-chip, \.lb-back, \.lb-swap, \.lb-detail \{ min-height: 44px/.test(css),
  'lb- 스타일이 없거나 폰 터치 대상 44px 규칙이 없다',
  'lb- 스타일·폰 44px 터치 대상');

/* ⑰ 견적 엔진을 건드리지 않았다 ----------------------------------------- */
// verify-space-cost-estimates.mjs 가 vm 에서 {window:{}} 로 실행한다 — DOM 코드가 들어가면 크래시한다.
check(/root\.DesignBom = \{ build, render, formatWon, formatCompactRange, totalsFrom, options, PRICE_BASIS \}/.test(bom),
  'design-bom.js 의 공개 API 가 바뀌었다 — 240개 예상비용 검증기가 깨질 수 있다',
  '견적 엔진 공개 API 불변');

console.log('\n===== 우리집 한 채로 보기 검증 =====');
ok.forEach((m) => console.log('  ✓', m));
fail.forEach((m) => console.log('  ✗', m));
if (fail.length) {
  console.log(`\n${fail.length}건 실패 — 고객이 오해하거나 다른 화면이 깨질 수 있는 상태입니다.`);
  process.exit(1);
}
console.log(`\n전부 통과 (${ok.length}건) · 보기 모드 고지·연동·경계 정상`);
