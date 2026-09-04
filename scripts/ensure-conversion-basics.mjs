/* ensure-conversion-basics.mjs — 방문자를 문의로 바꾸는 기본기가 되돌아가지 않게 지킨다
 *
 * 상담 폼이 실제로 대표 메일까지 도달하는 것이 확인된 이상(2026-07-25),
 * 방문자 1명이 문의 1건이 되는 길목의 결함은 곧바로 매출 손실이다.
 * 아래는 전부 실측으로 확인해 고친 것들이라, 다시 깨지면 조용히 손해가 난다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fail = [];
const ok = [];
function check(cond, bad, good) { if (cond) ok.push(good); else fail.push(bad); }

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

function leadExports(src) {
  const assignment = /\bwindow\.ManmulLead\s*=\s*\{([^}]*)\}\s*;/.exec(src);
  if (!assignment) return [];
  return assignment[1].split(',').map((name) => name.trim()).filter(Boolean);
}

function paragraphTextById(html, id) {
  const match = new RegExp(`<p\\s+id="${id}"[^>]*>([\\s\\S]*?)<\\/p>`).exec(html);
  return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

const index = read('index.html');
const css = read('css/styles.css');
const inquiry = read('js/inquiry.js');
const transport = read('js/lead-transport.js');
const leakInquiry = read('js/leak-inquiry.js');
const adminHtml = read('admin.html');
const adminJs = read('js/admin.js');
const privacy = read('privacy.html');
const handoff = read('integrations/인수인계서.md');
const main = read('js/main.js');
const blogJs = read('js/blog.js');
const office = read('office.html');
const officePilot = read('js/office-pilot.js');
const officeRequest = read('office-request.html');

const officePackage = /<aside class="office-package-note"[\s\S]*?<\/aside>/.exec(office)?.[0] || '';
const pilotSuccessBody = functionBody(officePilot, 'showSuccess') || '';
const officeRequestNotice = /<aside id="officeRequestCommercialNotice"[\s\S]*?<\/aside>/.exec(officeRequest)?.[0] || '';
const hasCommercialBoundary = (value) => /접수 프로그램 이용료 0원/.test(value) && /실제 작업은 별도 견적/.test(value);
check(hasCommercialBoundary(officePackage),
  'office.html 패키지 안내에 접수 프로그램 이용료 0원과 실제 작업 별도 견적이 함께 없다',
  'office.html 패키지 0원·별도 견적 경계 공개');
check(hasCommercialBoundary(pilotSuccessBody),
  '파일럿 성공 결과에 접수 프로그램 이용료 0원과 실제 작업 별도 견적이 함께 없다',
  '파일럿 성공 결과 0원·별도 견적 경계 공개');
check(hasCommercialBoundary(officeRequestNotice),
  'office-request.html 정적 안내에 접수 프로그램 이용료 0원과 실제 작업 별도 견적이 함께 없다',
  'office-request.html 정적 안내 0원·별도 견적 경계 공개');

/* ① 손님에게 "데모"라고 말하지 않는다 --------------------------------- */
// 문의를 넣을지 망설이는 사람이 페이지 맨 아래에서 마지막으로 읽는 문장이었다.
check(!/데모 프로젝트/.test(index),
  'index.html 푸터에 "데모 프로젝트" 문구가 돌아왔다 — 문의 직전 손님이 읽는 마지막 문장이다',
  '푸터에 데모 문구 없음');

/* ② 사업자정보가 정적 HTML에 있다 ------------------------------------- */
// 본문이 전부 JS 렌더라, 이게 없으면 JS를 안 돌리는 크롤러에게 주소가 아예 안 보인다.
check(/895-48-01132/.test(index.split('</head>')[1] || ''),
  '사업자등록번호가 <body> 정적 HTML에 없다 — 지역 검색 기본 신호(상호·주소·전화)가 사라졌다',
  '사업자번호가 본문에 정적 노출');
check(/돌다리로19번길/.test(index.split('</head>')[1] || ''),
  '주소가 <body> 정적 HTML에 없다 (JS 렌더에만 의존하면 크롤러·로드실패 시 사라진다)',
  '주소가 본문에 정적 노출');

/* ③ 전화가 항상 걸린다 ------------------------------------------------ */
// tel: 을 채우는 건 js/main.js 인데, site.json 로드 이후라 그 전에 누르면 죽은 링크였다.
// 로드가 매달리면 영구히 죽는다 → HTML에 직접 박아 둔다.
for (const id of ['utilPhone', 'heroCall', 'inquiryCall', 'fabCall']) {
  const m = index.match(new RegExp('<a[^>]*id="' + id + '"[^>]*>'));
  check(m && /href="tel:/.test(m[0]),
    `전화 버튼 #${id} 의 href 가 tel: 이 아니다 — 데이터 로드 전에 누르면 아무 일도 안 일어난다`,
    `#${id} tel: 하드코딩됨`);
}
/* ③-1 카톡 버튼이 첫 화면에도 있다 — js/main.js 가 kakao.ready 면 #heroKakao 를 켠다(요소가 없으면 죽은 배선) */
{
  const m = index.match(/<a[^>]*id="heroKakao"[^>]*>/);
  check(m && /btn-kakao/.test(m[0]) && /\bhidden\b/.test(m[0]) && /hero-actions[\s\S]{0,600}id="heroKakao"/.test(index),
    '첫 화면(hero-actions)에 #heroKakao 카톡 버튼이 없거나 기본 숨김이 아니다 — main.js 의 카톡 배선이 죽은 채 남는다',
    '첫 화면 카톡 버튼(#heroKakao, 기본 숨김·ready 때만 표시)');
}
/* ③-2 주 버튼 글자 대비 — 흰 글자 16px 는 배경과 4.5:1 이상(WCAG AA). --brand(#b8895a)는 3.10 이라 버튼 배경으로 못 쓴다 */
{
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const hex = (name) => (css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1] || '';
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const bgVar = (css.match(/\.btn-primary \{[^}]*background:\s*var\(--([a-z-]+)\)/) || [])[1] || '';
  const bg = hex(bgVar);
  const ratio = bg ? (1.05) / (lum(bg) + 0.05) : 0;
  check(ratio >= 4.5, `.btn-primary 배경(${bgVar || '?'} ${bg || '?'})의 흰 글자 대비가 ${ratio.toFixed(2)}:1 — 4.5 미만`, `.btn-primary 흰 글자 대비 ${ratio.toFixed(2)}:1 (≥4.5)`);
}
check(/address:/.test(main.match(/const FALLBACK_CONTACT = \{[^}]*\}/)?.[0] || ''),
  'FALLBACK_CONTACT 에 address 가 없다 — site.json 로드 실패 시 주소가 통째로 사라진다',
  '로드 실패 폴백에 주소 포함');

/* ④ 아이폰에서 폼 입력 시 화면이 확대되지 않는다 ----------------------- */
// iOS Safari 는 16px 미만 입력에 포커스하면 확대하고 되돌리지 않는다.
// 하필 필수 입력(이름·연락처)이 걸려, 3단계까지 온 손님이 거기서 멈춘다.
// ※ 선택자 형태까지 확인한다. 원본이 input[type="text"] 처럼 속성 선택자를 쓰므로
//    `.inquiry-form input` 같은 약한 선택자로 덮으면 우선순위에서 져 15px 가 그대로 남는다
//    (실제로 그렇게 새어나가 브라우저 실측에서 잡혔다).
check(/@media \(max-width: 640px\)[\s\S]{0,700}?\.inquiry-form input\[type="text"\][\s\S]{0,400}?font-size:\s*16px/.test(css),
  '폰에서 상담 폼 입력이 16px 가 아니다(또는 선택자가 약해 원본에 밀린다) — iOS 가 자동 확대해 손님이 이탈한다',
  '폰 폼 입력 16px (선택자 우선순위까지 확인)');
check(/@media \(max-width: 640px\)[\s\S]*?\.fg-chip[^{]*\{[^}]*min-height:\s*44px/.test(css),
  '폰에서 필터 칩 터치 영역이 44px 미만이다 — 40~60대 고객이 정확히 누르기 어렵다',
  '폰 터치 영역 44px');
check(/--link-strong/.test(css) && /\.contact-list-row a \{ color: var\(--link-strong\)/.test(css),
  '연락처 링크가 대비 미달 색(--brand-dark 4.44:1)으로 돌아갔다 — 제일 중요한 번호가 제일 흐리다',
  '연락처 링크 대비 6.56:1');
check(!/:focus-visible \{ outline: 3px solid var\(--brand\); outline-offset: 2px; border-radius: 4px; \}/.test(css),
  '포커스 표시가 border-radius:4px 를 강제한다 — 알약 버튼이 포커스 순간 사각형으로 변한다',
  '포커스 표시가 버튼 모양을 망가뜨리지 않음');
check(/\.inquiry-form input:focus-visible/.test(css),
  '폼 입력에 키보드 포커스 표시가 없다 — outline:none 이 지워 어디 있는지 알 수 없다',
  '폼 입력 키보드 포커스 보임');

/* ⑤ 카탈로그 구간에서도 전화 접점이 남는다 ---------------------------- */
// 300장을 스크롤하는 가장 긴 구간에서 연락 수단이 0개가 되면 안 된다.
check(!/\.portfolio-in-view \.fab-group \{[^}]*opacity:\s*0/.test(css),
  '카탈로그를 볼 때 FAB 이 통째로 숨겨진다 — 가장 오래 머무는 구간에서 연락 접점이 0이 된다',
  '카탈로그 구간에도 전화 버튼 유지');

/* ⑥ 허니팟 오탐이 문의를 삼키지 않는다 -------------------------------- */
// 오탐 시 전송·저장 0인데 화면은 "전달됨"이라 대체 연락 버튼까지 숨었다 → 손실 100%·발견 불가.
check(!/hp\.value\)\s*\{\s*showSuccess\(collect\(\),\s*\{\s*delivered:\s*true/.test(inquiry),
  '허니팟에 걸리면 "전달됨"으로 표시된다 — 오탐 시 문의가 통째로 사라지고 아무도 모른다',
  '허니팟 오탐 시에도 전화·문자 대체 경로 노출');

/* ⑦ 첫 로딩이 무겁지 않다 --------------------------------------------- */
// 폰에서 느리면 문의를 넣기 전에 나간다. 시안 스프라이트(약 2.5MB)는 CSS 배경이라
// loading="lazy" 가 안 먹어, 지연 로딩을 빼면 곧바로 첫 로딩이 3MB대로 돌아간다.
check(/data-sheet=/.test(main) && /IntersectionObserver/.test(main.split('function observeSprites')[1] || ''),
  '시안 스프라이트 지연 로딩이 사라졌다 — 첫 로딩이 0.77MB → 3.1MB 로 돌아간다',
  '시안 지연 로딩 유지(첫 로딩 약 0.77MB)');
check(/portfolioSpriteMarkup\(item, 'scene', true\)/.test(main),
  '모달 시안이 지연 로딩으로 바뀌었다 — 누르면 빈 칸이 보인다(모달은 즉시 로딩이어야 함)',
  '모달 시안은 즉시 로딩');

/* ⑧ 실패 문의는 현재 탭 메모리에서 공용 단일-flight 경로로만 재시도한다 --- */
// 개인정보를 localStorage 큐에 쌓지 않는다. 두 폼 모두 공용 모듈의 최신 1건
// 메모리 보관·재시도 함수를 실제 실패/온라인 복귀 경로에 연결해야 한다.
const expectedLeadExports = [
  'backendConfigured', 'fetchWithTimeout', 'buildLeadText', 'deliver',
  'rememberFailure', 'retryLatest', 'clearFailure', 'copyToClipboard', 'loadConfig'
];
check(JSON.stringify(leadExports(transport)) === JSON.stringify(expectedLeadExports),
  '공용 전송 모듈의 export 계약이 달라졌다 — 메모리 재시도/삭제 함수가 빠졌거나 이름만 비슷한 decoy가 생겼다',
  '공용 전송 모듈 export 계약 정확');

for (const [file, src, rememberName] of [
  ['js/inquiry.js', inquiry, 'rememberAndRenderFailure'],
  ['js/leak-inquiry.js', leakInquiry, 'rememberAndShowFailure']
]) {
  const rememberBody = functionBody(src, rememberName) || '';
  const retryBody = functionBody(src, 'retryVisibleFailure') || '';
  check(/\bLEAD\.rememberFailure\s*\(\s*payload\s*\)/.test(rememberBody),
    `${file} 실패 처리 함수가 공용 rememberFailure(payload)를 호출하지 않는다`,
    `${file} 실패 문의를 공용 현재-탭 메모리에 보관`);
  check(/\bLEAD\.retryLatest\s*\(\s*CONFIG\s*\)/.test(retryBody),
    `${file} 재시도 함수가 공용 retryLatest(CONFIG)를 호출하지 않는다`,
    `${file} 공용 단일-flight 재시도 사용`);
  check(/window\.addEventListener\(\s*['"]online['"]\s*,\s*\(\)\s*=>\s*\{\s*retryVisibleFailure\(\);\s*\}\s*\)/.test(src),
    `${file} 온라인 복귀 이벤트가 현재 탭의 retryVisibleFailure()에 연결되지 않았다`,
    `${file} 현재 탭 온라인 복귀 재시도 연결`);
}

const inquiryResultBody = functionBody(inquiry, 'showResult') || '';
// 성공 화면에도 전화 링크가 생겼다(회신 지연 대비). 그래서 '실패 화면에 연락 경로가
// 있는가'는 showResult 전체가 아니라 **실패 분기의 .done-actions 안**에서만 봐야 한다.
// 전체를 보면 성공 분기의 tel: 하나로 정규식이 충족돼, 실패 분기의 전화·문자 버튼이
// 지워져도 이 검사가 계속 초록불을 켠다(2026-08 리드 감사에서 지적된 구멍).
const doneActionsBlock = (inquiryResultBody.match(/<div class="done-actions">[\s\S]*?<\/div>/) || [''])[0];
check(!!doneActionsBlock, '일반 상담 실패 화면의 .done-actions 블록을 찾지 못했다 — 구조가 바뀌었으면 이 검사부터 고쳐라',
  '일반 상담 실패 화면 .done-actions 블록 존재');
check(/id="doneRetry"/.test(doneActionsBlock) && /id="doneCopy"/.test(doneActionsBlock),
  '일반 상담 실패 화면에 명시적 다시 시도 또는 내용 복사 버튼이 없다',
  '일반 상담 실패 화면에 다시 시도·복사 버튼');
check(/href="tel:\$\{phone\}"/.test(doneActionsBlock) && /href="\$\{smsHref\}"/.test(doneActionsBlock),
  '일반 상담 실패 화면에 전화 또는 문자(SMS) 직접 전송 경로가 없다',
  '일반 상담 실패 화면에 전화·문자 경로');
// 전송이 안 됐으면 보낼 내용을 화면에 펼쳐 둬야 한다 — 복사가 막힌 브라우저에서
// 손님이 직접 긁을 수 있는 유일한 길이다. 누수 폼은 이미 그렇게 한다.
check(/class="done-text"/.test(inquiryResultBody) && /doneText\.textContent = text/.test(inquiryResultBody),
  '일반 상담 실패 화면이 보낼 내용을 화면에 보여주지 않는다 — 복사가 막히면 손님이 옮겨 적을 수 없다',
  '일반 상담 실패 화면에 문의 본문 노출');

/* ⑧-2 복사 결과를 사실대로 알리는가 ----------------------------------- */
// '복사했습니다'가 실패에도 뜨면 손님은 빈 카톡·문자를 보내고 회신을 기다린다.
// copyToClipboard 는 boolean 을 돌려주고, 두 폼 모두 그 값으로 분기해야 한다.
check(/function fallbackCopy[\s\S]*?return !!ok;/.test(transport),
  'fallbackCopy 가 복사 성공 여부를 돌려주지 않는다', '복사 헬퍼가 성공 여부를 반환');
check(/writeText\(text\)\.then\(\(\) => true,/.test(transport),
  'copyToClipboard 가 성공 시 true 를 돌려주지 않는다', 'copyToClipboard 가 boolean Promise 반환');
for (const [file, src] of [['js/inquiry.js', inquiry], ['js/leak-inquiry.js', read('js/leak-inquiry.js')]]) {
  const copyCalls = (src.match(/copyToClipboard\(text\)/g) || []).length;
  const branched = (src.match(/copyToClipboard\(text\)\.then\(\(ok\)/g) || []).length;
  check(copyCalls > 0 && copyCalls === branched,
    `${file} 의 복사 호출 ${copyCalls}건 중 ${branched}건만 성공 여부로 분기한다 — 실패를 '복사됨'으로 알린다`,
    `${file} 복사 성공 여부로 분기 (${branched}/${copyCalls})`);
}

/* ⑧-2b 설정을 못 읽은 것과 '접수 경로가 없는 것'을 구분하는가 ---------
   config.json 요청이 한 번 실패하면 backendConfigured() 가 false 가 되어,
   경로는 멀쩡한데 화면이 "이 업체는 온라인 접수를 안 받는다"처럼 말했다.
   다시 시도 버튼도 안 나온다. 공용 로더가 한 번 더 시도하고, 그래도 안 되면
   configLoadFailed 표시를 남겨 화면이 '새로고침하시라'고 말하게 한다. */
check(/function loadConfig/.test(transport) && /configLoadFailed/.test(transport),
  '공용 전송 모듈에 재시도·실패표시가 있는 설정 로더가 없다', '공용 설정 로더에 재시도·실패 표시');
for (const [file, src] of [['js/inquiry.js', inquiry], ['js/leak-inquiry.js', read('js/leak-inquiry.js')], ['js/main.js', main]]) {
  const ownFetch = /fetch\(\s*['"]data\/config\.json['"]/.test(src);
  const usesShared = /(?:LEAD|window\.ManmulLead)\.loadConfig\(/.test(src);
  // main.js 는 공용 모듈보다 먼저 로드되므로 폴백 fetch 를 남겨 둔다(공용 호출이 우선).
  check(file === 'js/main.js' ? usesShared : (usesShared || !ownFetch),
    `${file} 이 공용 설정 로더를 쓰지 않는다 — 설정 로드 실패가 '접수 경로 없음'으로 잘못 표시된다`,
    `${file} 공용 설정 로더 사용`);
}
check(/configLoadFailed/.test(inquiry) && /설정을 잠시 못 읽어/.test(inquiry),
  '일반 상담 실패 화면이 설정 로드 실패를 구분해 말하지 않는다', '일반 상담이 설정 로드 실패를 구분해 안내');
check(/CONFIG\.configLoadFailed/.test(read('js/leak-inquiry.js')) && /설정을 잠시 못 읽어/.test(read('js/leak-inquiry.js')),
  '누수 상담 실패 화면이 설정 로드 실패를 구분해 말하지 않는다', '누수 상담이 설정 로드 실패를 구분해 안내');

/* ⑧-3 폼이 무엇을 꼭 답해야 하는지 밝히는가 --------------------------- */
// 손님이 이탈하는 가장 흔한 이유는 '어디까지 답해야 하는지 몰라서'다.
// 실제로 막는 칸은 이름·연락처·동의 셋뿐인데 표시가 없었다.
const inquiryFormHtml = (index.split('id="inquiryForm"')[1] || '').split('</form>')[0];
for (const [id, what] of [['iName', '이름'], ['iPhone', '연락처'], ['iConsent', '개인정보 동의']]) {
  const near = id === 'iConsent'
    ? (inquiryFormHtml.split('id="iConsent"')[1] || '').slice(0, 400)
    : (inquiryFormHtml.split(`for="${id}"`)[1] || '').slice(0, 200);
  check(/class="req"/.test(near), `상담 폼의 ${what}(#${id})에 필수 표시가 없다`,
    `상담 폼 ${what} 필수 표시`);
}
// 반대쪽도 막는다 — 필수 배지가 번지면 손님은 폼 전체가 필수인 줄 알고 시작을 안 한다.
const reqBadges = (inquiryFormHtml.match(/class="req"/g) || []).length;
check(reqBadges === 3, `상담 폼 필수 표시가 ${reqBadges}개다 — 실제로 막는 칸(이름·연락처·동의) 셋뿐이어야 한다`,
  '상담 폼 필수 표시는 막는 칸 셋뿐');
check(/class="req"/.test((read('leak.html').split('id="lkConsent"')[1] || '').slice(0, 400)),
  '누수 폼의 동의(#lkConsent)에 필수 표시가 없다 — 유일하게 제출을 막는 칸인데 표시가 없다',
  '누수 폼 동의 필수 표시');

/* ⑧-4 안 고른 것을 고른 것처럼 대표에게 보내지 않는가 ------------------ */
// 라디오에 checked 가 박혀 있으면 손님이 손도 안 댄 '전체 공사 · 거주중'이
// 사실처럼 리드에 실린다. 대표는 그걸 보고 방문 준비를 한다.
for (const [name, what] of [['scope', '공사 범위'], ['live', '거주 여부']]) {
  const radios = inquiryFormHtml.match(new RegExp(`<input type="radio" name="${name}"[^>]*>`, 'g')) || [];
  check(radios.length >= 2 && !radios.some((r) => /\bchecked\b/.test(r)),
    `상담 폼 ${what}(${name})에 기본 선택이 박혀 있다 — 손님이 안 고른 값이 사실처럼 전달된다`,
    `상담 폼 ${what} 기본 선택 없음`);
}
check(/<option value="미정" selected>[^<]*<\/option>\s*<option>1개월 이내<\/option>/.test(inquiryFormHtml),
  '상담 폼 희망 시기의 기본값이 미정이 아니다 — 손님이 안 고른 시기가 사실처럼 전달된다',
  '상담 폼 희망 시기 기본값 미정');
check(/d\.scope \|\| '아직 선택 안 함'/.test(inquiry) && /d\.live \|\| '아직 선택 안 함'/.test(inquiry),
  '확인 화면이 안 고른 항목을 그대로 말하지 않는다(undefined 노출 또는 지어낸 기본값)',
  '확인 화면이 안 고른 항목을 그대로 표기');

/* ⑧-5 누수 손님이 연락처까지 가는 길이 짧은가 ------------------------- */
// 누수는 급한 일이다. 평수·범위·항목·예산·시기를 다 지나야 연락처가 나오면
// 그 전에 손님이 나간다.
check(/id="leakShortcut"/.test(inquiryFormHtml) && /id="leakShortcutGo"/.test(inquiryFormHtml),
  '상담 폼에 누수 손님용 연락처 지름길이 없다', '상담 폼 누수 지름길 존재');
check(/function syncLeakShortcut/.test(inquiry)
  && /shortcutGo\.addEventListener\('click', \(\) => \{ showStep\(3\); \}\)/.test(inquiry),
  '누수 지름길이 연락처 단계로 이어지지 않는다', '누수 지름길이 연락처 단계로 연결');

/* ⑨ 블로그 목록이 JS 없이도 보인다 ------------------------------------ */
// blog.html 은 sitemap 에 홈 다음 순위로 올라 있는데, 정적 HTML 에 h1 도 글 링크도 없으면
// 크롤러에겐 빈 페이지고 8편으로 넘어갈 경로 자체가 없다.
// 목록은 scripts/prerender-posts.py 가 만든다 — site.json insights 를 고치면 다시 돌릴 것.
try {
  const blogBody = (read('blog.html').split('<main')[1] || '');
  const links = (blogBody.match(/href="posts\/[^"]+\.html"/g) || []).length;
  check(/<h1>/.test(blogBody), 'blog.html 정적 HTML 에 h1 이 없다 — 크롤러에 빈 페이지로 보인다', 'blog.html 에 h1 정적 존재');
  check(links >= 5, `blog.html 정적 글 링크가 ${links}개뿐이다 — prerender-posts.py 를 다시 돌려야 한다`,
    `blog.html 에 글 링크 ${links}개 정적 노출`);
  check(!/불러오는 중/.test(blogBody), 'blog.html 이 아직 "불러오는 중…" 상태다(프리렌더 미적용)', 'blog.html 로딩 자리표시자 없음');
} catch (e) { fail.push('blog.html 을 읽지 못했다: ' + e.message); }

// 프리렌더 목록을 JS가 다시 그리면 로드 실패 때 정적 글까지 사라진다.
check(/if \(!slug && root && root\.querySelector\('\.insights-grid'\)\) return;/.test(blogJs),
  'blog.js 가 정적 insights-grid 를 먼저 쓰지 않는다 — 목록을 불필요하게 fetch/재렌더한다',
  '블로그 정적 목록 우선');
check(/if \(root && root\.children\.length\) return;/.test(blogJs),
  'blog.js 통신 실패가 프리렌더된 내용을 지운다',
  '블로그 통신 실패 시 정적 내용 보존');

// 누수 전용 문의도 일반 공사와 같은 works 배열을 타야 저장·전달·관리자 인계가 끊기지 않는다.
check(/const WORKS = \[[^\]]*'누수탐지·누수수리'/.test(inquiry) && /fd\.getAll\('works'\)/.test(inquiry),
  '상담 폼의 누수탐지·누수수리 항목이 없거나 공사항목 수집 경로와 분리됐다',
  '누수탐지·누수수리 상담 항목이 공통 works 경로로 전달');

// 공간 유형을 "누수"로 고른 리드가 접수→외부 전송까지 같은 값으로 가야 한다.
// 공개 관리자 화면은 개인정보 리드보드가 아니므로 문의 내용을 읽거나 현장앱으로 넘기지 않는다.
{
  check(/<option value="누수">누수탐지·누수수리<\/option>/.test(index),
    '상담 공간 유형에 누수탐지·누수수리(value="누수")가 없다',
    '상담 공간 유형에 누수 전용 선택지 존재');
  check(/type:\s*fd\.get\('type'\)/.test(inquiry) && /const payload = \{[\s\S]{0,300}?\.\.\.data/.test(inquiry),
    '선택한 누수 유형이 상담 payload 에 보존되지 않는다',
    '누수 유형이 상담 payload 에 보존');
  // 전송 본문 조립은 누수 폼과 공용인 js/lead-transport.js 가 맡는다.
  // 폼이 type 을 담고(inquiry), 전송·문자 본문이 그걸 싣는지(transport) 둘 다 본다.
  check(/JSON\.stringify\(payload\)/.test(transport) && /payload\.type/.test(transport) && /\bd\.type\b/.test(transport),
    '누수 유형이 자동 접수 본문 또는 대체 안내에 전달되지 않는다',
    '누수 유형이 자동 접수·대체 안내 경로에 전달');
  // 누수 페이지 전용 폼도 같은 유형으로 접수돼야 대표 화면에서 섞이지 않는다.
  check(/type:\s*'누수'/.test(read('js/leak-inquiry.js')),
    '누수 페이지 전용 폼이 유형을 누수로 접수하지 않는다',
    '누수 전용 폼이 누수 유형으로 접수');
}

/* ⑩ 성공한 외부 접수와 실패한 현재-탭 초안을 구분한다 ------------------- */
{
  // 동의 체크박스 옆에서 처리방침을 읽을 수 있어야 '무엇에 동의하는지'가 성립한다.
  check(/privacy\.html/.test(index.match(/id="iConsent"[\s\S]{0,300}/)?.[0] || ''),
    '동의 문구에서 개인정보처리방침 링크가 사라졌다 — 무엇에 동의하는지 읽을 수 없다',
    '동의 문구에 처리방침 링크 있음');

  const successNotice = paragraphTextById(privacy, 'privacy-success-retention');
  const failedNotice = paragraphTextById(privacy, 'privacy-failed-draft');
  const fallbackNotice = paragraphTextById(privacy, 'privacy-fallback-actions');
  check(/외부\s*접수\s*서비스/.test(successNotice) && /전달/.test(successNotice) && /1년/.test(successNotice),
    '처리방침의 성공 접수 문단이 외부 서비스 전달과 서버측 기존 1년 보유 안내를 함께 설명하지 않는다',
    '성공한 외부 접수의 서버측 보유 안내 분리');
  check(/영구\s*저장소/.test(failedNotice) && /최신\s*(문의\s*)?1건/.test(failedNotice) &&
        /현재\s*탭/.test(failedNotice) && /새로고침/.test(failedNotice) && /탭을?\s*닫/.test(failedNotice) && /사라/.test(failedNotice),
    '처리방침의 실패 초안 문단이 비영구·최신 1건·현재 탭·새로고침/탭 닫기 소멸을 명확히 설명하지 않는다',
    '실패 초안은 현재 탭 최신 1건이며 새로고침·탭 닫기 시 소멸');
  check(!/1년/.test(failedNotice),
    '실패 초안 문단에 1년 보유 문구가 섞였다 — 브라우저 초안이 장기 보관되는 것으로 오해된다',
    '실패 초안 문단에 서버 보유기간 혼입 없음');
  check(/다시\s*시도/.test(fallbackNotice) && /전화/.test(fallbackNotice) && /문자|SMS/.test(fallbackNotice) && /복사/.test(fallbackNotice),
    '처리방침의 실패 대체 경로 문단에 다시 시도·전화·문자(SMS)·복사가 모두 없다',
    '실패 대체 경로 4종 안내');
  check(/Web3Forms/.test(privacy) && /010-2397-8629/.test(privacy),
    'privacy.html 의 외부 처리 안내 또는 개인정보 문의 연락처가 빠졌다',
    '처리방침 외부 처리·연락처 유지');

  /* ⑩-2 실제로 나가는 항목이 전부 처리방침에 적혀 있는가 ---------------
     collect() 가 payload 에 싣는 값이 늘어날 때마다 처리방침이 뒤처졌다.
     '시안 담기'나 '우리집 사양서'를 쓰면 그 요약이 통째로 대표에게 가는데,
     방침의 수집 항목 목록에는 한 줄도 없었다. 여기서는 코드가 싣는 키마다
     방침에 있어야 할 말을 못 박는다 — 항목을 새로 실으면 이 목록부터 늘려라.
     (source·submittedAt·status·consent 는 전송 메타·동의 자체라 대상이 아니다) */
  const LEAD_FIELD_NOTICE = {
    type: /공간\s*종류/, region: /지역/, area: /평수/, scope: /공사\s*범위/,
    works: /희망\s*공사\s*항목/, budget: /예산/, movein: /희망\s*시기/,
    live: /거주\s*여부/, name: /성함/, phone: /연락처/, memo: /메모/,
    estimateHint: /참고\s*견적/, simSpec: /사양서/, lookSpec: /시안/,
    selectedDesign: /시안/, complexName: /단지명/,
    officeContactName: /관리사무소 담당자명/, pilotInterest: /관심 업무/,
    desiredStart: /도입 희망 시점/, inquiryPurpose: /신청 목적/,
    preferredVisitDate: /희망 방문일/, preferredVisitWindow: /희망 시간대/,
    symptoms: /증상/,
  };
  const pilotPrivacyNotice = paragraphTextById(privacy, 'privacy-office-pilot-items');
  const leakPrivacyNotice = paragraphTextById(privacy, 'privacy-leak-items');
  const PILOT_NOTICE_KEYS = new Set(['complexName', 'officeContactName', 'pilotInterest', 'desiredStart']);
  const LEAK_NOTICE_KEYS = new Set(['inquiryPurpose', 'preferredVisitDate', 'preferredVisitWindow', 'symptoms']);
  const collectBodies = [inquiry, officePilot, leakInquiry]
    .map((source) => functionBody(source, 'collect') || '');
  // 축약 속성(works,)은 콜론이 없다. 콜론만 찾으면 그 항목이 통째로 감시망 밖에 남는다.
  const sentKeys = [...new Set(collectBodies.flatMap((collectBody) =>
    (collectBody.match(/^\s{6}([A-Za-z][A-Za-z0-9_]*)\s*[:,]/gm) || [])
      .map((m) => m.trim().replace(/[:,]$/, ''))))];
  const META_KEYS = new Set(['consent', 'privacyConsent', 'source', 'sourcePage', 'ctaId', 'submittedAt', 'status', 'bookingStatus']);
  const noticeFor = (key) => PILOT_NOTICE_KEYS.has(key) ? pilotPrivacyNotice : LEAK_NOTICE_KEYS.has(key) ? leakPrivacyNotice : privacy;
  const unlisted = sentKeys.filter((k) => !META_KEYS.has(k)
    && !(LEAD_FIELD_NOTICE[k] && LEAD_FIELD_NOTICE[k].test(noticeFor(k))));
  check(sentKeys.length >= 10 && unlisted.length === 0,
    `상담에 실려 나가는 항목이 처리방침에 없다: ${unlisted.join(', ') || '(collect() 를 읽지 못했다)'}`,
    `처리방침이 전송 항목 ${sentKeys.length}개를 모두 밝힘`);
  // 누수 폼도 같은 규칙 — 증상 체크박스가 방침에 없었다.
  const leakCollect = functionBody(read('js/leak-inquiry.js'), 'collect') || '';
  const leakNotice = leakPrivacyNotice;
  check(/symptoms:/.test(leakCollect) ? /증상/.test(leakNotice) : true,
    '누수 상담이 증상 항목을 보내는데 처리방침의 누수 문단(#privacy-leak-items)에 증상 수집이 없다',
    '처리방침 누수 문단이 증상 수집을 밝힘');
  check(/bookingStatus\s*:\s*['"]inquiry-only['"]/.test(leakInquiry) && /방문이나 금액이 확정된 것은 아닙니다/.test(leakInquiry),
    '누수 문의가 inquiry-only 고정값 또는 예약 미확정 성공 안내를 잃었다',
    '누수 문의는 inquiry-only이며 예약 확정이 아님을 안내');
  const pilotPrivacy = pilotPrivacyNotice;
  check(/관리사무소 30일 파일럿 신청/.test(pilotPrivacy) && /최대 1년/.test(pilotPrivacy) &&
        /삭제 요청/.test(pilotPrivacy) && /010-2397-8629/.test(pilotPrivacy) &&
        /입주민/.test(pilotPrivacy) && /자유입력란/.test(pilotPrivacy) && /패턴/.test(pilotPrivacy) && /차단/.test(pilotPrivacy) &&
        !/(?:모든|어떠한|임의의)\s*(?:개인정보|PII).{0,20}(?:차단|포함되지)/.test(pilotPrivacy),
    '파일럿 처리방침의 명칭·1년·삭제 연락·입주민 경고·명시적 패턴 차단 경계가 정확하지 않다',
    '파일럿 처리방침 경계 공개');
  // 유선번호도 받게 됐다 — '휴대폰 번호'만 적혀 있으면 방침이 실제와 어긋난다.
  check(!/연락처\(휴대폰\s*번호\)/.test(privacy),
    '처리방침이 연락처를 휴대폰 번호로만 적고 있다 — 유선(042·02·070)도 받는다',
    '처리방침 연락처 표기가 유선까지 포함');

  const handoffPrivacySummary = handoff.split(/\r?\n/)
    .find((line) => /^\|\s*개인정보처리방침\s*\|/.test(line)) || '';
  check(/성공\s*(?:한\s*)?(?:외부\s*)?접수/.test(handoffPrivacySummary) &&
        /기존\s*(?:업무\s*)?보관\s*기준/.test(handoffPrivacySummary) &&
        /실패\s*초안/.test(handoffPrivacySummary) && /현재\s*탭/.test(handoffPrivacySummary) &&
        /새로고침/.test(handoffPrivacySummary) && /탭\s*닫/.test(handoffPrivacySummary),
    '인수인계 개인정보 요약이 성공 접수 보관 기준과 실패 초안 현재-탭 소멸을 구분하지 않는다',
    '인수인계 개인정보 요약도 성공 접수·실패 초안을 구분');
}

/* ⑩-1 문의 개인정보를 브라우저 영구 큐/공개 관리자 보드에 두지 않는다 */
{
  for (const [file, src] of [
    ['js/inquiry.js', inquiry],
    ['js/leak-inquiry.js', leakInquiry],
    ['js/admin.js', adminJs]
  ]) {
    check(!/(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem)\s*\(/.test(src),
      `${file} 가 문의 개인정보를 브라우저 영구 저장소에서 읽거나 쓴다`,
      `${file} 문의 PII 영구 저장 큐 없음`);
    check(!/^\s*(?:async\s+)?function\s+(?:saveLocal|loadLocal|seedDemo|seedInquiries|renderInquiries|renderLeadBoard)\s*\(/m.test(src),
      `${file} 에 퇴역한 로컬 문의 큐/시드/리드보드 함수가 다시 생겼다`,
      `${file} 퇴역 로컬 문의 함수 없음`);
  }

  const legacyKey = ['manmul', 'inquiries'].join('_');
  const literalHits = transport.split(legacyKey).length - 1;
  check(literalHits === 1 && /localStorage\.removeItem\(LEGACY_STORAGE_KEY\)/.test(transport) &&
        !/localStorage\.(?:getItem|setItem)\s*\(/.test(transport),
    '공용 전송 모듈의 legacy 키가 remove-only 정리 외에 읽기·쓰기 경로로 사용된다',
    'legacy 문의 키는 remove-only 정리만 허용');

  const scripts = [...adminHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]
    .map((match) => match[1].split('?')[0])
    .filter((src) => ['js/lead-transport.js', 'js/admin.js', 'js/content-editor.js'].includes(src));
  check(JSON.stringify(scripts) === JSON.stringify(['js/lead-transport.js', 'js/admin.js', 'js/content-editor.js']),
    'admin.html 의 공용 전송→관리 상태→콘텐츠 편집 스크립트 순서가 정확하지 않다',
    '관리자 스크립트 순서 정확');
  check(/id="pipelineStatus"/.test(adminHtml) && /id="connBadge"/.test(adminHtml) &&
        /id="contentEditor"[^>]*data-content-editor/.test(adminHtml) &&
        functionBody(adminJs, 'leadRoute') && functionBody(adminJs, 'renderPipeline') && functionBody(adminJs, 'renderConnection'),
    '관리자 외부 접수 경로 상태 또는 콘텐츠 편집기가 사라졌다',
    '관리자 외부 경로 상태·콘텐츠 편집기 유지');
}

/* ⑪ 상담 접수 경로가 살아 있다 ---------------------------------------- */
try {
  const cfg = JSON.parse(read('data/config.json'));
  const n8n = cfg.n8n || {}, forms = cfg.forms || {};
  check(!!((n8n.enabled && n8n.inquiryWebhookUrl) || (forms.enabled && forms.endpoint)),
    '상담 접수 경로가 꺼져 있다 — 손님 문의가 대표님께 자동으로 가지 않는다 (최우선)',
    '상담 접수 경로 연결됨');
} catch (e) { fail.push('data/config.json 을 읽지 못했다: ' + e.message); }

/* 카탈로그 이어보기 — 300장을 한 번에 DOM 에 넣으면 폰 스크롤이 무거워진다.
   실측: 통짜 렌더 시 DOM 9,866개·카탈로그 마크업 391KB → 점진 렌더 1,575개·31KB.
   손님 대부분이 폰으로 들어오므로 여기가 되돌아가면 이탈로 직결된다. */
{
  const idx = read('index.html');
  const mainJs = read('js/main.js');
  check(/id="portfolioMore"/.test(idx),
    'index.html 에 카탈로그 더 보기 버튼(#portfolioMore)이 없다',
    '카탈로그 더 보기 버튼 존재');
  check(/const PAGE = \d+/.test(mainJs) && /insertAdjacentHTML\('beforeend'/.test(mainJs),
    'renderPortfolio 가 점진 렌더를 하지 않는다 — 300장을 한 번에 그리면 폰 스크롤이 무거워진다',
    '카탈로그 점진 렌더 유지');
  check(!/grid\.innerHTML = keys\.map/.test(mainJs),
    'renderPortfolio 가 다시 통짜 렌더(grid.innerHTML = keys.map)로 돌아갔다',
    '통짜 렌더로 되돌아가지 않음');
}

/* 시안 공유 주소(#design=id) — 검색·공유로 들어올 진입점이 홈 하나뿐이던 것을 고친 것.
   id 기반이어야 카탈로그가 늘어도 같은 시안이 열리고, 공용 해시 헬퍼를 거쳐야 #sim=·#look= 과 공존한다. */
{
  const mainJs = read('js/main.js');
  check(/MANMUL_HASH\.read\('design'\)/.test(mainJs) && /p\.id === sharedDesign/.test(mainJs),
    '시안 공유 주소(#design=id) 진입이 없거나 id 기반이 아니다 — 공유 링크가 죽거나 다른 시안이 열린다',
    '시안 공유 주소 진입(id 기반) 유지');
  check(/MANMUL_HASH\.build\('design'/.test(mainJs) && !/pushState\([^)]*design/.test(mainJs),
    '시안 모달이 공용 해시 헬퍼를 안 쓰거나 pushState 를 쓴다 — 다른 해시 키를 지우거나 뒤로가기가 길어진다',
    '시안 해시가 공용 헬퍼·replaceState 사용');
}

/* 자동 접수 경로가 실제로 살아 있는가 — 켜 놓고 값이 비면 리드가 전부 손으로 떨어진다.
   실측: forms.accessKey 를 비워도 지금까지는 어떤 검사도 잡지 않았다. 그 상태에서는
   web3forms 가 요청을 거절하므로 모든 상담이 "자동 접수 다시 시도"로 떨어지고,
   손님은 전화를 걸거나 그냥 나간다. 대표는 파이프가 끊긴 줄도 모른다.
   integrations/AUTO-BACKLOG.md 도 "forms.enabled=true + endpoint·accessKey 존재"를
   유지 항목으로 적어 두었다 — 그 의도를 검사로 굳힌다. */
{
  const cfg = JSON.parse(read('data/config.json'));
  const forms = cfg.forms || {};
  const n8n = cfg.n8n || {};
  const filled = (v) => typeof v === 'string' && v.trim().length > 0 && !/^(?:여기|your|example|placeholder)/i.test(v.trim());
  const httpsUrl = (v) => filled(v) && /^https:\/\//i.test(v.trim());

  if (forms.enabled === true) {
    check(httpsUrl(forms.endpoint),
      'forms.enabled=true 인데 endpoint 가 비었거나 https 주소가 아니다 — 상담이 자동 접수되지 않는다',
      '상담 폼 전송 주소(forms.endpoint) 정상');
    check(filled(forms.accessKey),
      'forms.enabled=true 인데 accessKey 가 비었다 — 전송이 전부 거절돼 모든 상담이 손으로 떨어진다',
      '상담 폼 인증키(forms.accessKey) 존재');
  }
  if (n8n.enabled === true) {
    check(httpsUrl(n8n.inquiryWebhookUrl),
      'n8n.enabled=true 인데 inquiryWebhookUrl 이 비었거나 https 가 아니다 — 자동 접수가 끊긴다',
      'n8n 접수 주소 정상');
  }
  const formsUsable = forms.enabled === true && httpsUrl(forms.endpoint) && filled(forms.accessKey);
  const n8nUsable = n8n.enabled === true && httpsUrl(n8n.inquiryWebhookUrl);
  check(formsUsable || n8nUsable,
    '자동 접수 경로가 하나도 살아 있지 않다 — 웹 상담이 전부 전화·복사로만 남는다 (data/config.json 의 forms 또는 n8n 을 살리세요)',
    '자동 접수 경로 최소 1개 가동');
}

if (fail.length) {
  console.error('✗ 전환 기본기 ' + fail.length + '건 깨짐\n');
  fail.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('✓ 전환 기본기 ' + ok.length + '개 항목 정상');
ok.forEach((o) => console.log('  · ' + o));
