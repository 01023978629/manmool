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

const index = read('index.html');
const css = read('css/styles.css');
const inquiry = read('js/inquiry.js');
const transport = read('js/lead-transport.js');
const main = read('js/main.js');
const blogJs = read('js/blog.js');
const office = read('office.html');

check(/표준 패키지 500만원 이하/.test(office) && /초과분은 별도 견적과 관리사무소 승인 후 진행/.test(office),
  '관리사무소 표준 500만원 이하 정책이 office.html에 정확히 안내되지 않는다',
  '관리사무소 표준 500만원 이하 정책 공개');

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

/* ⑧ 못 보낸 문의를 자동으로 다시 보낸다 -------------------------------- */
// 전파가 끊긴 곳에서 전송이 실패하면 손님이 [다시 시도]를 직접 눌러야 했다.
// 그대로 이탈하면 문의가 사라진다. 성공 시 로컬 사본을 지우므로 개인정보도 함께 준다.
check(/function retryPending/.test(inquiry) && /window\.addEventListener\('online'/.test(inquiry),
  '못 보낸 문의 자동 재전송이 사라졌다 — 전파 끊긴 곳에서 넣은 문의가 그대로 묻힌다',
  '못 보낸 문의 자동 재전송(다음 방문·온라인 복귀)');
check(/RETRY_MAX/.test(inquiry),
  '재전송 횟수 상한이 없다 — 실패가 반복되면 무한 재시도로 발송 한도를 태운다',
  '재전송 횟수 상한 있음');

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

// 공간 유형을 "누수"로 고른 리드가 접수→전송→관리자 표시→현장앱 인계까지 같은 값으로 가야 한다.
// 항목만 화면에 추가하고 downstream 배선을 놓치면 대표님은 일반 리드와 구분할 수 없다.
{
  const admin = read('js/admin.js');
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
  check(/escapeHtml\(d\.type \|\| ''\)/.test(admin),
    '관리자 문의 카드가 누수 유형을 표시하지 않는다',
    '관리자 문의 카드에 누수 유형 표시');
  check(/type:\s*d\.type/.test(admin) && /#lead=/.test(admin),
    '관리자에서 현장앱으로 넘기는 리드에 누수 유형이 빠졌다',
    '현장앱 인계 리드에 누수 유형 보존');
}

/* ⑩ 개인정보 보유기간이 손님에게 약속한 것과 같다 ---------------------- */
// 화면은 "보유기간 1년"이라 동의를 받아 놓고 코드가 90일이면, 약속과 다른 시점에 자료가 사라진다.
// 반대로 코드가 더 길면 약속보다 오래 갖고 있는 것이 된다. 둘 다 문제라 한 숫자로 묶는다.
{
  const admin = read('js/admin.js');
  const promise = index.match(/보유기간\s*(\d+)\s*년/);
  const leakPromise = read('leak.html').match(/보유기간\s*(\d+)\s*년/);
  const days = (src, f) => { const m = src.match(/RETENTION_DAYS\s*=\s*(\d+)/); return m ? +m[1] : null; };
  // 상수의 정본은 공용 전송 모듈이다(두 폼이 같은 값을 쓰게 하려고 옮겼다).
  const dInq = days(transport), dAdm = days(admin);
  const wantDays = promise ? +promise[1] * 365 : null;
  check(promise, '상담 폼 동의 문구에서 보유기간을 찾지 못했다 — 손님이 무엇에 동의하는지 알 수 없다',
    `동의 문구에 보유기간 ${promise ? promise[1] + '년' : '?'} 명시`);
  check(dInq != null && dAdm != null, 'RETENTION_DAYS 가 js/lead-transport.js 또는 js/admin.js 에 없다 — 보관기간이 코드에 없다',
    '보유기간이 코드에 상수로 있다');
  check(dInq === dAdm, `보유기간이 파일마다 다르다 — inquiry ${dInq}일 vs admin ${dAdm}일`,
    '문의 저장·관리 화면의 보유기간이 같다');
  check(leakPromise && promise && leakPromise[1] === promise[1],
    `두 상담 폼의 보유기간 안내가 다르다 — 인테리어 ${promise ? promise[1] : '?'}년 vs 누수 ${leakPromise ? leakPromise[1] : '없음'}년`,
    '인테리어·누수 폼의 보유기간 안내가 같다');
  check(wantDays == null || dInq === wantDays,
    `코드 보유기간(${dInq}일)이 손님에게 약속한 기간(${wantDays}일)과 다르다 — 안내와 다른 시점에 지워진다`,
    `보유기간이 약속(${wantDays}일)과 일치`);
  check(/function pruneExpired/.test(transport) && /pruneExpired\(list\)/.test(inquiry.split('function loadLocal')[1] || ''),
    '만료 문의 정리가 읽는 경로에서 안 돈다 — 전송이 잘 되는 동안 만료 항목이 영원히 남는다',
    '만료 문의가 읽을 때마다 실제로 삭제됨');
  // 동의 체크박스 옆에서 처리방침을 읽을 수 있어야 '무엇에 동의하는지'가 성립한다.
  // 문의 데이터가 국외(Web3Forms·미국)로 나가는데 방침 문서가 없으면 안내 자체가 거짓이 된다.
  check(/privacy\.html/.test(index.match(/id="iConsent"[\s\S]{0,300}/)?.[0] || ''),
    '동의 문구에서 개인정보처리방침 링크가 사라졌다 — 무엇에 동의하는지 읽을 수 없다',
    '동의 문구에 처리방침 링크 있음');
  const privacy = read('privacy.html');
  check(/1년/.test(privacy) && /Web3Forms/.test(privacy) && /010-2397-8629/.test(privacy),
    'privacy.html 의 핵심 내용(보유 1년·국외 이전·연락처)이 빠졌다 — 안내와 실제가 어긋난다',
    '처리방침에 보유기간·국외 이전·연락처 명시');
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

if (fail.length) {
  console.error('✗ 전환 기본기 ' + fail.length + '건 깨짐\n');
  fail.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('✓ 전환 기본기 ' + ok.length + '개 항목 정상');
ok.forEach((o) => console.log('  · ' + o));
