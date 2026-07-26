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
const main = read('js/main.js');

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
check(/@media \(max-width: 640px\)[\s\S]{0,400}?\.inquiry-form input[^{]*\{[^}]*font-size:\s*16px/.test(css),
  '폰에서 상담 폼 입력 글씨가 16px 미만이다 — iOS 가 자동 확대해 손님이 이탈한다',
  '폰 폼 입력 16px (iOS 자동확대 없음)');

/* ⑤ 카탈로그 구간에서도 전화 접점이 남는다 ---------------------------- */
// 240장을 스크롤하는 가장 긴 구간에서 연락 수단이 0개가 되면 안 된다.
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

/* ⑧ 블로그 목록이 JS 없이도 보인다 ------------------------------------ */
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

/* ⑨ 상담 접수 경로가 살아 있다 ---------------------------------------- */
try {
  const cfg = JSON.parse(read('data/config.json'));
  const n8n = cfg.n8n || {}, forms = cfg.forms || {};
  check(!!((n8n.enabled && n8n.inquiryWebhookUrl) || (forms.enabled && forms.endpoint)),
    '상담 접수 경로가 꺼져 있다 — 손님 문의가 대표님께 자동으로 가지 않는다 (최우선)',
    '상담 접수 경로 연결됨');
} catch (e) { fail.push('data/config.json 을 읽지 못했다: ' + e.message); }

if (fail.length) {
  console.error('✗ 전환 기본기 ' + fail.length + '건 깨짐\n');
  fail.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('✓ 전환 기본기 ' + ok.length + '개 항목 정상');
ok.forEach((o) => console.log('  · ' + o));
