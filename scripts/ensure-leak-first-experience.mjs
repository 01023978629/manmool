/* 공개 홈페이지의 누수 우선 진입·서비스별 상담 경로·이미지 로딩 품질을 지킨다.
 *
 * 이 검사는 data/site.json 정본과 실제 배포 산출물(blog.html, posts/*.html)을
 * 함께 읽는다. 생성기 소스의 문자열이 아니라 손님이 받는 HTML의 링크와 이미지
 * 속성을 검증하므로, 생성기를 바꾸고 프리렌더를 빼먹는 회귀도 잡는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const site = JSON.parse(read('data/site.json'));
const published = (site.insights || []).filter((item) => item && item.published !== false);
const fail = [];
const pass = [];

function check(condition, bad, good) {
  if (condition) pass.push(good);
  else fail.push(bad);
}

function elementBlock(source, marker, tagName) {
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    if (/^<\//.test(match[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) return source.slice(start, tags.lastIndex);
  }
  return '';
}

const index = read('index.html');
const blog = read('blog.html');
const css = read('css/styles.css');
const leak = read('leak.html');
const blogJs = read('js/blog.js');
const mainJs = read('js/main.js');
const workflow = read('.github/workflows/deploy-pages.yml');
const articleService = (item) => item.service === 'leak'
  ? 'leak'
  : item.service === 'interior'
    ? 'interior'
    : (item.category === '방수·설비' || item.category === '누수탐지·수리') ? 'leak' : 'interior';

// 1. 옛 일반 문의의 type=누수 프리필은 누수 전용 폼과 질문이 달라 고객을 되돌린다.
const publicRouteSources = [index, blog, mainJs, blogJs, ...published.map((item) => read(`posts/${item.slug}.html`))];
check(!publicRouteSources.some((source) => source.includes('?type=누수')),
  '공개 HTML/JS에 ?type=누수 일반 문의 경로가 남아 있다 — leak.html#leakInquiry로 통일해야 한다',
  '누수 상담 경로가 전용 폼으로 통일됨');

// 2. 홈·블로그·글에서 폰 방문자가 메뉴를 열지 않아도 누수와 전화를 바로 누를 수 있어야 한다.
const homeDock = elementBlock(index, '<div class="fab-group"', 'div');
const blogDock = elementBlock(blog, '<nav class="mobile-service-dock"', 'nav');
check(/href="leak\.html#leakInquiry"/.test(homeDock) && /href="tel:01023978629"/.test(homeDock),
  '홈 모바일 고정 영역에 누수 전용 문의와 전화가 함께 없다',
  '홈 모바일 고정 영역에 누수·전화 진입 존재');
check(/href="leak\.html#leakInquiry"/.test(blogDock) && /href="tel:01023978629"/.test(blogDock),
  '블로그 모바일 고정 영역에 누수 전용 문의와 전화가 함께 없다',
  '블로그 모바일 고정 영역에 누수·전화 진입 존재');
check(/\.mobile-service-dock\s*\{[\s\S]*?min-height:\s*44px/.test(css),
  '모바일 서비스 고정 영역의 버튼 높이 44px 보장이 없다',
  '모바일 서비스 고정 영역 터치 높이 44px 보장');
check(/@media \(max-width: 640px\)[\s\S]*?\.fab-group \.fab-kakao\s*\{[^}]*display:\s*none\s*!important/.test(css),
  '홈 모바일 고정 영역에서 카카오까지 4개가 동시에 보여 320px에서 100px 넘게 커진다',
  '홈 모바일 고정 영역은 전화·누수·인테리어 3개 우선');

// 3. 방수·설비 글은 누수 전용 폼, 나머지는 인테리어 문의로 가야 한다.
for (const item of published) {
  const post = read(`posts/${item.slug}.html`);
  const cta = post.match(/<div class="post-cta"[\s\S]*?<\/div>/)?.[0] || '';
  const dock = elementBlock(post, '<nav class="mobile-service-dock"', 'nav');
  const mainNav = elementBlock(post, '<nav class="main-nav"', 'nav');
  const expectedService = articleService(item);
  const expectedHref = expectedService === 'leak' ? '../leak.html#leakInquiry' : '../index.html#inquiry';
  check(cta.includes(`data-service="${expectedService}"`) && cta.includes(`href="${expectedHref}"`),
    `${item.slug}: ${item.category} 글의 본문 CTA가 ${expectedService} 상담 경로가 아니다`,
    `${item.slug}: 본문 CTA 서비스 경로 정상`);
  check(/href="\.\.\/leak\.html#leakInquiry"/.test(dock) && /href="tel:01023978629"/.test(dock),
    `${item.slug}: 모바일 고정 영역에 누수 전용 문의와 전화가 함께 없다`,
    `${item.slug}: 모바일 누수·전화 진입 정상`);
  check(/href="\.\.\/leak\.html"/.test(mainNav),
    `${item.slug}: 글 상단 주요 메뉴에 누수 전용 진입이 없다`,
    `${item.slug}: 글 상단 누수 전용 진입 정상`);
}

// 4. 목록 첫 핵심 이미지만 우선 로딩하고 나머지는 스크롤 시점에 받는다.
const blogRoot = elementBlock(blog, '<div class="container" id="blogRoot"', 'div');
const listImages = [...blogRoot.matchAll(/<img class="ic-image"[^>]*>/g)].map((m) => m[0]);
check(/<title>누수·배관 사례와 인테리어 기록/.test(blog) && /<h1>누수·배관 사례부터 인테리어까지<\/h1>/.test(blogRoot),
  '블로그 제목이 누수 우선 서비스와 인테리어 보조 범위를 함께 설명하지 않는다',
  '블로그 제목이 누수 우선·인테리어 보조 범위를 설명');
check(listImages.length === published.filter((item) => item.image).length,
  `블로그 정적 목록 이미지 수(${listImages.length})가 공개 글 이미지 수와 다르다`,
  '블로그 정적 목록 이미지 수 일치');
check(listImages.length > 0 && /loading="eager"/.test(listImages[0]) && /fetchpriority="high"/.test(listImages[0]),
  '블로그 첫 핵심 이미지가 eager/high 우선순위가 아니다',
  '블로그 첫 핵심 이미지 eager/high');
check(listImages.slice(1).every((tag) => /loading="lazy"/.test(tag) && !/fetchpriority="high"/.test(tag)),
  '블로그 두 번째 이후 이미지 중 eager/high가 남아 있다',
  '블로그 후속 이미지 lazy 로딩');
check(/image\(a, 'ic-image', idx === 0\)/.test(blogJs),
  'blog.js 동적 목록이 첫 이미지만 우선 로딩하는 정적 목록 규칙과 다르다',
  'blog.js 목록 이미지 우선순위가 프리렌더와 일치');
check(/const articleService\s*=\s*\(a\)[\s\S]*?a\.service\s*===\s*'leak'[\s\S]*?a\.service\s*===\s*'interior'/.test(blogJs)
    && /articleService\(a\)\s*===\s*'leak'/.test(blogJs),
  'blog.js가 명시적 service: interior를 category보다 우선하지 않는다',
  'blog.js 서비스 판정이 프리렌더의 명시적 override와 일치');

for (const item of published) {
  const post = read(`posts/${item.slug}.html`);
  const cover = post.match(/<img class="post-cover-image"[^>]*>/)?.[0] || '';
  const bodyImages = [...post.matchAll(/<figure class="post-figure"><img[^>]*>/g)].map((m) => m[0]);
  check(!item.image || (/loading="eager"/.test(cover) && /fetchpriority="high"/.test(cover)),
    `${item.slug}: 글 표지 이미지가 eager/high가 아니다`,
    `${item.slug}: 표지 이미지 eager/high`);
  check(bodyImages.every((tag) => /loading="lazy"/.test(tag) && /decoding="async"/.test(tag)),
    `${item.slug}: 본문 증거 사진 중 lazy/async가 아닌 이미지가 있다`,
    `${item.slug}: 본문 사진 lazy/async`);
}

// 5. 장식 화면은 실제 실시간 진단 결과로 오인되지 않게 명시한다.
check(/누수 탐지 진단 화면 예시/.test(leak) && /진단 화면 예시/.test(leak) && !/실시간 진단 중/.test(leak),
  '누수 히어로의 장식 화면이 실시간 진단처럼 보인다 — 화면 예시임을 명시해야 한다',
  '누수 진단 장식 화면을 예시로 명시');
check(/누수 지점 미확인 시 탐지비/.test(leak),
  '탐지비 0원 조건이 "누수 지점 미확인 시"로 함께 표시되지 않는다',
  '탐지비 안내가 조건형으로 표시됨');

// 6. 보험 안내는 계약별 심사임을 분명히 하고 공식 출처·확인일을 글에 표시한다.
const insurance = published.find((item) => item.slug === 'leak-insurance-guide');
const insurancePost = read('posts/leak-insurance-guide.html');
const insuranceText = JSON.stringify(insurance || {});
const sitemap = read('sitemap.xml');
const contractScreenTest = read('apps-script-contract/test/screens.e2e.mjs');
const sourceUrls = [
  'https://kiri.or.kr/PDF/weeklytrend/20240603/trend20240603_10.pdf',
  'https://kiri.or.kr/PDF/weeklytrend/20251222/trend20251222_6.pdf',
  'https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1017094811',
  'https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1019669891',
  'https://www.law.go.kr/LSW/precInfoP.do?mode=0&precSeq=227257',
  'https://cont.insure.or.kr/cont_web/information/information.do',
];
const plannedInteriorCases = [
  'eunhasu-bathroom-waterproof', 'yeolmae-waterproof-screed',
  'gaon-bathroom-waterproof', 'doram-waterproof-heating', 'sejong-cafe-waterproof',
];
check(plannedInteriorCases.every((slug) => published.find((item) => item.slug === slug)?.service === 'interior'),
  '일반 욕실·확장·상가 공정 사례가 누수 증상 접수로 잘못 연결된다',
  '일반 방수·난방 공정 사례는 인테리어 접수로 분리');
check(insurance && insurance.service === 'leak'
    && insurance.sourcesChecked === '2026-08-23'
    && insurance.updated === '2026-08-23'
    && Array.isArray(insurance.sources) && insurance.sources.length === sourceUrls.length
    && sourceUrls.every((url) => insurance.sources.some((source) => source.url === url))
    && insurance.sources.slice(0, 2).every((source) => /금융감독원/.test(source.title))
    && !/보험연구원 주간보험동향/.test(insuranceText),
  '누수 보험 글 정본에 서비스·금융감독원 출처·확인일/수정일 2026-08-23이 완전하지 않다',
  '누수 보험 글 정본의 공식 출처·확인일·수정일 완전');
check(!/2020년 이후|5분이면|가족까지 보장/.test(insuranceText)
    && /대법원 2022\.3\.31\. 선고 2021다201085·2021다201092/.test(insuranceText)
    && /실제 보상 여부는 가입한 계약의 약관과 사고별 사실관계/.test(insuranceText),
  '누수 보험 글에 연도·조회시간·가족보장 단정이 남았거나 판결·최종 고지가 부정확하다',
  '누수 보험 글의 계약별 조건·판결·최종 고지 안전');
const sourceBlock = elementBlock(insurancePost, '<aside class="post-sources"', 'aside');
check(/확인일\s*2026-08-23/.test(sourceBlock) && sourceUrls.every((url) => sourceBlock.includes(`href="${url.replaceAll('&', '&amp;')}"`)),
  '누수 보험 정적 글에 공식 출처 링크 6개와 확인일이 렌더되지 않았다',
  '누수 보험 정적 글에 공식 출처·확인일 렌더');
check(/"datePublished":\s*"2026-08-09"/.test(insurancePost)
    && /"dateModified":\s*"2026-08-23"/.test(insurancePost)
    && /<loc>https:\/\/01023978629\.github\.io\/manmool\/posts\/leak-insurance-guide\.html<\/loc>\s*<lastmod>2026-08-23<\/lastmod>/.test(sitemap),
  '누수 보험 글의 구조화 수정일 또는 sitemap lastmod가 2026-08-23으로 갱신되지 않았다',
  '누수 보험 글의 구조화 수정일·sitemap 갱신일 일치');
check(/styles\.css\?v=20260823-leak/.test(index)
    && /main\.js\?v=20260823-leak/.test(index)
    && /styles\.css\?v=20260823-leak/.test(blog)
    && /blog\.js\?v=20260823-leak/.test(blog)
    && /styles\.css\?v=20260823-leak/.test(insurancePost),
  '변경된 CSS/JS의 캐시 버전이 갱신되지 않아 기존 방문자에게 이전 화면이 남을 수 있다',
  '누수 우선 CSS/JS 캐시 버전 갱신');

// 7. 공개 업로드 전에 콘텐츠·생성·전자계약 계약 검사가 모두 끝나야 한다.
const uploadAt = workflow.indexOf('actions/upload-pages-artifact');
const buildAt = workflow.indexOf('node scripts/build-pages-artifact.mjs');
const sourceCheckAt = workflow.indexOf('for check in scripts/ensure-*.mjs');
const sourceCleanAt = workflow.lastIndexOf('git diff --exit-code');
const artifactCheckAt = workflow.indexOf('node scripts/ensure-pages-artifact.mjs');
const gates = ['python3 scripts/prerender-posts.py', 'node --test scripts/new-case-post.test.mjs',
  'node --test apps-script-contract/test/*.mjs'];
check(uploadAt > 0 && gates.every((gate) => workflow.indexOf(gate) >= 0 && workflow.indexOf(gate) < buildAt)
    && /playwright@1\.55\.0/.test(workflow) && /playwright[^\n]*install[^\n]*chromium/.test(workflow)
    && /NODE_PATH:/.test(workflow) && /CI:\s*["']?true["']?/.test(workflow)
    && !/\/opt\/pw-browsers\/chromium/.test(contractScreenTest)
    && /process\.env\.CI[\s\S]*?throw new Error/.test(contractScreenTest)
    && sourceCheckAt >= 0 && sourceCheckAt < sourceCleanAt && sourceCleanAt < buildAt
    && buildAt < artifactCheckAt && artifactCheckAt < uploadAt,
  'GitHub Pages 업로드 전에 Playwright/Chromium을 포함한 실제 화면 품질 게이트가 모두 실행되지 않는다',
  'Pages 업로드 전 Playwright 화면 검사를 포함한 전체 품질 게이트 실행');
check(buildAt > 0
    && buildAt < uploadAt
    && /path:\s*['"]?_site['"]?/.test(workflow)
    && !/path:\s*['"]?\.['"]?\s*$/m.test(workflow),
  'Pages가 허용목록 _site 대신 저장소 루트를 공개한다 — 서버 소스·테스트·문서가 노출될 수 있다',
  'Pages는 허용목록 _site만 업로드');

if (fail.length) {
  console.error(`✗ 누수 우선 공개 경험 ${fail.length}건 깨짐\n`);
  for (const item of fail) console.error(`  - ${item}`);
  process.exit(1);
}

console.log(`✓ 누수 우선 공개 경험 ${pass.length}개 항목 정상`);
