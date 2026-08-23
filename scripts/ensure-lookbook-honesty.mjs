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
// 디자인 참고 카탈로그는 유지하되 운영기술 설명 없이 고객용 이름으로 보여 준다.
check(/id="portfolio"/.test(index) && /인테리어 디자인 참고 시안/.test(index),
  '기존 디자인 참고 시안 섹션이 사라졌다',
  '기존 사례 카탈로그 유지됨');
// 개수를 숫자로 박아두면 카탈로그를 늘릴 때마다 검증기가 거짓으로 빨간불이 된다(실제로 300 확장 때 그랬다).
// 지켜야 할 것은 '몇 개냐'가 아니라 ⑴ 줄지 않았고 ⑵ 화면에 적은 숫자가 사실이냐 두 가지다.
{
  const n = Array.isArray(site.portfolio) ? site.portfolio.length : 0;
  const FLOOR = 240; // 지금까지 공개된 최소치 — 이 아래로 내려가면 카탈로그가 잘려나간 것이다
  check(n >= FLOOR,
    `site.json portfolio 가 ${n}개로 줄었다(최소 ${FLOOR}) — 카탈로그가 파손됐다`,
    `portfolio ${n}개 (축소 없음)`);
  const claim = index.match(/총\s*([\d,]+)\s*(?:가지|개)\s*(?:디자인|시안)?/);
  const claimed = claim ? Number(claim[1].replace(/,/g, '')) : null;
  check((claimed == null || claimed === n) && /총 \$\{list\.length\}개 디자인/.test(main),
    `정적 화면 수(${claimed}) 또는 동적 카운트가 실제 시안 ${n}개와 일치하지 않는다`,
    `화면 카운트가 실제 목록 길이(${n}개)를 사용`);

  // "총 N가지"가 사실이려면 개수만 맞아선 부족하다 — 손님은 설명이 아니라 사진으로 훑는다.
  // 사진·자른위치·배율·좌우반전이 전부 같으면 손님 눈에는 같은 시안 두 개다(js/main.js portfolioPhotoStyle 기준).
  // 지금 59건이 겹쳐 있다(전부 2026-07-23 배치). 자세한 목록은 scripts/report-photo-duplicates.mjs.
  // 여기서는 '더 나빠지지 않는다'만 지킨다 — 고칠 때마다 이 숫자를 내려 잡는다.
  const DUP_CEILING = 59;
  const seen = new Map();
  (site.portfolio || []).forEach((x) => {
    const k = [String(x.photo || '').split('?')[0], x.photoPosition || '', x.photoScale || '', x.photoMirror ? 'm' : ''].join('|');
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  const dup = [...seen.values()].reduce((a, c) => a + (c > 1 ? c - 1 : 0), 0);
  check(dup <= DUP_CEILING,
    `사진이 완전히 겹치는 시안이 ${dup}건으로 늘었다(허용 ${DUP_CEILING}) — 새 시안이 기존 사진을 그대로 재사용했다. node scripts/report-photo-duplicates.mjs 로 확인해라`,
    `사진 겹침 ${dup}건 (한도 ${DUP_CEILING} 이하)`);
  if (dup < DUP_CEILING) {
    ok.push(`↓ 겹침이 ${DUP_CEILING} → ${dup} 로 줄었다 — 이 파일의 DUP_CEILING 을 ${dup} 로 내려 잡아라`);
  }
}

/* ②-2 사진 설명(imageAlt)이 스크린리더·검색엔진에 제대로 나간다 ---------- */
// "라인리스 화이트 현관 현관 인테리어"처럼 낱말이 겹치면 낭독기가 그대로 두 번 읽고
// 검색엔진도 그대로 색인한다. 231건을 접고 39건을 채운 상태(2026-07-29)를 지킨다.
{
  const port = site.portfolio || [];
  const noAlt = port.filter((x) => !x.imageAlt).length;
  check(noAlt === 0,
    `imageAlt 없는 시안이 ${noAlt}건 생겼다 — 낭독기·검색엔진에 제목만 나간다`,
    'imageAlt 전 시안 존재');
  const dup = port.filter((x) => {
    const w = String(x.imageAlt || '').split(' ');
    return w.some((t, i) => i > 0 && t === w[i - 1]);
  });
  check(dup.length === 0,
    `imageAlt 에 같은 낱말이 붙어 반복되는 시안 ${dup.length}건 — 예: ${dup[0] ? dup[0].imageAlt : ''}`,
    'imageAlt 연속 중복 낱말 없음');
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
// 리드 본문을 만드는 buildLeadText 는 누수 폼과 공용인 js/lead-transport.js 로 옮겼다.
// 그래서 두 곳을 같이 본다 — 폼이 lookSpec 을 담고(inquiry), 본문이 그걸 싣는지(transport).
// 한쪽만 보면, 담기만 하고 안 실리거나 실을 준비만 하고 안 담는 상태를 놓친다.
const transport = read('js/lead-transport.js');
check(/lookSpec/.test(inquiry) && /d\.lookSpec/.test(transport),
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
// 모든 시안에 스프라이트 시트가 배정되는 것은 아니다(300 확장 배치 60개는 일부러 제외).
// 폴백 없이 스프라이트로 그리면 data-sheet="undefined" → 회색 빈칸이 된다. 실제로 214칸 중 39칸이 그랬다.
check(/if \(!item\.__designSheet\)/.test(main),
  'portfolioSpriteMarkup 에 __designSheet 없는 시안 폴백이 없다 — 시트 미배정 시안이 회색 빈칸으로 나간다',
  '스프라이트 미배정 시안 사진 폴백 존재');
check(/url === 'undefined'/.test(main),
  "fillSprite 가 문자열 'undefined' 를 걸러내지 않는다 — url('undefined') 배경과 404 요청이 남는다",
  "fillSprite 가 'undefined' 문자열을 막음");

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
