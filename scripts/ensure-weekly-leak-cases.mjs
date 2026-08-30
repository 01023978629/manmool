import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEEKLY_CASES = [
  { slug: 'apartment-basement-cast-iron-pipe-repair', images: [
    'assets/cases/apartment-basement-cast-iron-pipe-repair-cover.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-1.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-2.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-3.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-4.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-5.jpg'
  ]},
  { slug: 'apartment-balcony-rain-pipe-replacement', images: [
    'assets/cases/apartment-balcony-rain-pipe-replacement-cover.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-1.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-2.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-3.jpg'
  ]},
  { slug: 'apartment-upper-lower-rain-pipe-repair', images: [
    'assets/cases/apartment-upper-lower-rain-pipe-repair-cover.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-1.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-2.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-3.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-4.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-5.jpg'
  ]}
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const allImages = WEEKLY_CASES.flatMap((item) => item.images);

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (sof.has(marker) && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

if (WEEKLY_CASES.map((item) => item.images.length).join(',') !== '6,4,6') failures.push('사례별 사진 수는 6,4,6이어야 한다');
if (allImages.length !== 16) failures.push(`전체 사진 수가 ${allImages.length}장이다`);
if (new Set(allImages).size !== allImages.length) failures.push('새 사례 사진 경로가 중복된다');
for (const relative of allImages) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) { failures.push(`사진 없음: ${relative}`); continue; }
  const buffer = fs.readFileSync(absolute);
  if (buffer.length > 500000) failures.push(`사진이 500KB를 넘음: ${relative}`);
  if (buffer.includes(Buffer.from('Exif\0\0', 'binary'))) failures.push(`EXIF가 남음: ${relative}`);
  const size = jpegSize(buffer);
  if (!size) failures.push(`JPEG 치수를 읽을 수 없음: ${relative}`);
  else if (size.width > 1600 || size.height > 1600) failures.push(`1600px를 넘음: ${relative} ${size.width}x${size.height}`);
}

const expectedContent = [
  // 제목 정정(2026-08-29): 사진 4장 전부 수직관은 기존 관이고 새것은 하부 연결
  // 부속뿐이다 — "우수관 교체"는 사진이 뒷받침하지 않아 "보수·부속 교체"로 내렸다.
  { slug: 'apartment-balcony-rain-pipe-replacement', date: '2026-08-28', title: '대전 아파트 베란다 우수관 보수 — 바닥 배수구와 하부 연결 부속 교체', coverAlt: '수직 우수관 하부 연결부와 바닥 마감 상태' },
  {
    slug: 'apartment-upper-lower-rain-pipe-repair',
    date: '2026-08-28',
    title: '대전 목양마을아파트 상·하층 우수관 보수 — 우수 배수부품 교체',
    excerpt: '대전 목양마을아파트에서 바닥 배수구와 위·아래층을 잇는 우수관 관통부를 차례로 확인한 현장입니다. 기존 마감과 원형 부속을 살핀 뒤, 우수관 연결 부품을 교체하고 배수구 그릴을 설치해 마무리했습니다.',
    publicApartmentName: '목양마을아파트',
    coverAlt: '수직 우수관과 천장 관통부 현장 상태',
    finalHeading: '우수 배수부품 교체를 마쳤습니다',
    finalText: '우수관 하부 연결 부품을 교체하고 배수구 그릴을 설치한 뒤의 모습입니다. 수직관과 하부 연결 부품, 배수구 그릴이 함께 보이도록 마무리 상태를 기록했습니다.',
    finalImage: 'assets/cases/apartment-upper-lower-rain-pipe-repair-5.jpg',
    finalAlt: '우수관 하부 연결 부속과 원형 배수구 그릴 설치 상태',
    finalCaption: '우수관 하부 연결 부속과 바닥 배수구 그릴을 설치한 모습'
  },
  { slug: 'apartment-basement-cast-iron-pipe-repair', date: '2026-08-26', title: '대전 아파트 지하실 주철관 보수 — 부식 구간부터 슬리브 마감까지', coverAlt: '지하실 주철관 두 라인에 슬리브 보수를 마친 상태' }
];
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const blog = fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8');
const rss = fs.readFileSync(path.join(ROOT, 'rss.xml'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const forbiddenPrivacyFields = new Set(['place', 'address', 'location', 'source', 'sourcePath', 'project', 'apartment', 'building', 'unit', 'unitNo']);
const absolutePathPattern = /(?:\b[A-Za-z]:[\\/]|^\\\\|\bfile:\/\/)/i;
const phonePattern = /01[016789](?:[ .-]?\d){7,8}\b/;
const unitPattern = /(?:\d{1,4}\s*(?:동|호)|\d{1,3}\s*[-/]\s*\d{3,4})/;
const detailedAddressPattern = /(?:[가-힣]+(?:로|길)\s*\d+(?:-\d+)?|[가-힣]+(?:동|리|읍|면)\s*\d+(?:-\d+)?|\d+(?:-\d+)?번지)/;
const namedBuildingPattern = /[가-힣]{2,}(?:아파트|빌딩)/;

function hasAllowedBuildingBoundaryViolation(value, allowedName, allowedSuffixes = []) {
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const index = value.indexOf(allowedName, searchFrom);
    if (index < 0) return false;
    const previous = index > 0 ? value[index - 1] : '';
    if (previous && /[\p{L}\p{N}]/u.test(previous)) return true;

    const suffix = value.slice(index + allowedName.length);
    const isApprovedSuffix = !suffix || allowedSuffixes.includes(suffix) || /^[.!?…]+\s*$/u.test(suffix);
    if (!isApprovedSuffix) return true;
    searchFrom = index + allowedName.length;
  }
  return false;
}

function privacyViolations(value, { allowedBuildingNames = [], allowedBuildingSuffixes = {} } = {}) {
  const violations = [];
  const allowedBuildingNameSet = new Set(
    allowedBuildingNames.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim())
  );
  function walk(node, keyPath = '') {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${keyPath}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, entry] of Object.entries(node)) {
        const nextPath = keyPath ? `${keyPath}.${key}` : key;
        if (forbiddenPrivacyFields.has(key)) violations.push(`${nextPath}: 비공개 필드`);
        walk(entry, nextPath);
      }
      return;
    }
    if (typeof node !== 'string') return;
    if (absolutePathPattern.test(node)) violations.push(`${keyPath}: 절대 경로`);
    if (phonePattern.test(node)) violations.push(`${keyPath}: 전화번호`);
    if (unitPattern.test(node)) violations.push(`${keyPath}: 동호수`);
    if (detailedAddressPattern.test(node)) violations.push(`${keyPath}: 상세 주소`);
    const buildingNames = node.match(new RegExp(namedBuildingPattern.source, 'g')) || [];
    const hasUnknownBuilding = buildingNames.some((name) => !allowedBuildingNameSet.has(name));
    const hasExtendedAllowedBuilding = [...allowedBuildingNameSet].some((name) => (
      hasAllowedBuildingBoundaryViolation(node, name, allowedBuildingSuffixes[name] || [])
    ));
    if (hasUnknownBuilding || hasExtendedAllowedBuilding) violations.push(`${keyPath}: 단지·건물 고유명`);
  }
  walk(value);
  return violations;
}

function escapeMarkup(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function artifactParityViolations({ item, expected, post, blog, rss }) {
  const violations = [];
  const title = escapeMarkup(item.title);
  const excerpt = escapeMarkup(item.excerpt);
  const coverAlt = escapeMarkup(item.imageAlt);
  const postTitle = `<h1 class="post-title">${title}</h1>`;
  const postExcerpt = `<p class="post-excerpt">${excerpt}</p>`;

  if (!post.includes(postTitle)) violations.push('정적 글 제목 불일치');
  if (!post.includes(postExcerpt)) violations.push('정적 글 요약 불일치');

  const coverStart = post.indexOf('<div class="post-cover"');
  const coverEnd = coverStart < 0 ? -1 : post.indexOf('</div>', coverStart);
  const cover = coverStart < 0 || coverEnd < 0 ? '' : post.slice(coverStart, coverEnd + 6);
  if (!cover.includes(`alt="${coverAlt}"`)) violations.push('정적 글 표지 설명 불일치');

  if (expected.finalImage) {
    const bodyMarker = '<div class="post-body">';
    const bodyStart = post.indexOf(bodyMarker);
    const bodyContentStart = bodyStart < 0 ? -1 : bodyStart + bodyMarker.length;
    const bodyEnd = bodyContentStart < 0 ? -1 : post.indexOf('</div>', bodyContentStart);
    const postBody = bodyContentStart < 0 || bodyEnd < 0 ? '' : post.slice(bodyContentStart, bodyEnd);
    if (!postBody) violations.push('정적 글 본문 영역 없음');

    const heading = `<h2>${escapeMarkup(expected.finalHeading)}</h2>`;
    const paragraph = `<p>${escapeMarkup(expected.finalText)}</p>`;
    const headings = [...postBody.matchAll(/<h2>[\s\S]*?<\/h2>/g)];
    const lastHeading = headings.at(-1);
    if (!lastHeading || lastHeading[0] !== heading) violations.push('정적 글 마지막 소제목 불일치');
    const headingEnd = lastHeading ? lastHeading.index + lastHeading[0].length : -1;
    const paragraphStart = headingEnd < 0 ? -1 : postBody.indexOf(paragraph, headingEnd);
    if (paragraphStart !== headingEnd) violations.push('정적 글 마지막 설명 불일치');

    const figureStart = postBody.lastIndexOf('<figure class="post-figure">');
    const figureEnd = figureStart < 0 ? -1 : postBody.indexOf('</figure>', figureStart);
    const finalFigure = figureStart < 0 || figureEnd < 0 ? '' : postBody.slice(figureStart, figureEnd + 9);
    const expectedImage = `../${expected.finalImage}`;
    if (!finalFigure.includes(`src="${expectedImage}"`)) violations.push('정적 글 마지막 사진 불일치');
    if (!finalFigure.includes(`alt="${escapeMarkup(expected.finalAlt)}"`)) violations.push('정적 글 마지막 사진 설명 불일치');
    if (!finalFigure.includes(`<figcaption>${escapeMarkup(expected.finalCaption)}</figcaption>`)) violations.push('정적 글 마지막 사진 캡션 불일치');
    const paragraphEnd = paragraphStart < 0 ? -1 : paragraphStart + paragraph.length;
    if (paragraphEnd < 0 || figureStart !== paragraphEnd) violations.push('정적 글 마지막 소제목·설명·사진 순서 불일치');
    if (figureEnd < 0 || postBody.slice(figureEnd + 9).trim()) violations.push('정적 글 마지막 사진 뒤에 본문이 남아 있음');

    const expectedImageMarker = `src="${expectedImage}"`;
    const globalExpectedImageStart = post.lastIndexOf(expectedImageMarker);
    if (globalExpectedImageStart >= 0 && (bodyContentStart < 0 || globalExpectedImageStart < bodyContentStart || globalExpectedImageStart >= bodyEnd)) {
      violations.push('정적 글 마지막 사진이 본문 밖에 있음');
    }
    const absoluteFigureStart = figureStart < 0 || bodyContentStart < 0 ? -1 : bodyContentStart + figureStart;
    if (absoluteFigureStart < 0 || post.lastIndexOf('<figure class="post-figure">') !== absoluteFigureStart) {
      violations.push('정적 글 마지막 사진이 본문 마지막이 아님');
    }
  }

  const cardMarker = `href="posts/${expected.slug}.html"`;
  const cardLinkStart = blog.indexOf(cardMarker);
  const cardStart = cardLinkStart < 0 ? -1 : blog.lastIndexOf('<a ', cardLinkStart);
  const cardEnd = cardStart < 0 ? -1 : blog.indexOf('</a>', cardStart);
  const card = cardStart < 0 || cardEnd < 0 ? '' : blog.slice(cardStart, cardEnd + 4);
  if (!card.includes(`<b>${title}</b>`)) violations.push('블로그 카드 제목 불일치');
  if (!card.includes(`<span class="ic-excerpt">${excerpt}</span>`)) violations.push('블로그 카드 요약 불일치');
  if (!card.includes(`alt="${coverAlt}"`)) violations.push('블로그 카드 표지 설명 불일치');

  const canonical = `https://01023978629.github.io/manmool/posts/${expected.slug}.html`;
  const rssLink = `<link>${canonical}</link>`;
  const rssLinkStart = rss.indexOf(rssLink);
  const rssItemStart = rssLinkStart < 0 ? -1 : rss.lastIndexOf('<item>', rssLinkStart);
  const rssItemEnd = rssLinkStart < 0 ? -1 : rss.indexOf('</item>', rssLinkStart);
  const rssItem = rssItemStart < 0 || rssItemEnd < 0 ? '' : rss.slice(rssItemStart, rssItemEnd + 7);
  if (!rssItem.includes(`<title>${title}</title>`)) violations.push('RSS 제목 불일치');
  if (!rssItem.includes(`<description>${excerpt}</description>`)) violations.push('RSS 요약 불일치');

  return violations;
}

const privacyFixtures = [
  ...Array.from(forbiddenPrivacyFields, (field) => [`빈 ${field} 필드`, { [field]: '' }]),
  ['Windows 절대 경로', { note: 'C:\\fixtures\\private.jpg' }],
  ['UNC 경로', { note: '\\\\server\\share\\private.jpg' }],
  ['file 경로', { note: 'file:///fixtures/private.jpg' }],
  ['공백 전화번호', { note: '010 1234 5678' }],
  ['점 전화번호', { note: '010.1234.5678' }],
  ['하이픈 전화번호', { note: '010-1234-5678' }],
  ['동호수', { note: '101동 1203호' }],
  ['동호수 조합', { note: '101-1203' }],
  ['도로명 주소', { note: '가람로 12-3' }],
  ['지번 주소', { note: '푸른동 123-4' }],
  ['단지 고유명', { note: '가람아파트' }],
  ['건물 고유명', { note: '푸른빌딩' }]
];
for (const [label, fixture] of privacyFixtures) {
  if (!privacyViolations(fixture).length) failures.push(`개인정보 차단 fixture가 통과했다: ${label}`);
}
if (privacyViolations({ title: '대전 아파트 배관 보수' }).length) failures.push('개인정보 차단 fixture가 일반적인 대전 아파트 표현을 막는다');
const allowedApartment = {
  allowedBuildingNames: ['목양마을아파트'],
  allowedBuildingSuffixes: {
    목양마을아파트: [' 상·하층 배관 보수', '에서 배관을 확인했다', '의 배관을 확인했다']
  }
};
if (privacyViolations({ title: '목양마을아파트 상·하층 배관 보수' }, allowedApartment).length) failures.push('정확히 허용한 아파트명과 승인 문맥이 차단된다');
if (privacyViolations({ title: '목양마을아파트에서 배관을 확인했다' }, allowedApartment).length) failures.push('허용 아파트명 뒤 조사 "에서"가 차단된다');
if (privacyViolations({ title: '목양마을아파트의 배관을 확인했다' }, allowedApartment).length) failures.push('허용 아파트명 뒤 조사 "의"가 차단된다');
if (privacyViolations({ title: '목양마을아파트.' }, allowedApartment).length) failures.push('허용 아파트명 뒤 문장 종료가 차단된다');
if (!privacyViolations({ title: '새목양마을아파트 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 접두 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트2단지 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 숫자 접미 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 2단지 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 공백 숫자 접미 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 제2단지 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 제2단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 제이단지 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 한글 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트별관 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 별관 접미 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트동관 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 동관 접미 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 동관 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 공백 동관 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트타워 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 타워 접미 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 타워 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명의 공백 타워 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트(제2단지)' }, allowedApartment).length) failures.push('허용 아파트명의 괄호 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트·제2단지' }, allowedApartment).length) failures.push('허용 아파트명의 가운뎃점 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트-제2단지' }, allowedApartment).length) failures.push('허용 아파트명의 하이픈 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트, 제2단지' }, allowedApartment).length) failures.push('허용 아파트명의 쉼표 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 (제2단지)' }, allowedApartment).length) failures.push('허용 아파트명의 공백 괄호 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 , 제2단지' }, allowedApartment).length) failures.push('허용 아파트명의 공백 쉼표 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 — 제2단지' }, allowedApartment).length) failures.push('허용 아파트명의 공백 대시 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트에서(제2단지)' }, allowedApartment).length) failures.push('허용 아파트명의 조사 뒤 괄호 단지 변형이 통과한다');
if (!privacyViolations({ title: '목양마을아파트 가람아파트 배관 보수' }, allowedApartment).length) failures.push('허용 아파트명과 다른 단지명이 함께 통과한다');

for (const expected of expectedContent) {
  const matches = (site.insights || []).filter((item) => item && item.slug === expected.slug);
  if (matches.length !== 1) { failures.push(`${expected.slug}: insight가 ${matches.length}건이다`); continue; }
  const item = matches[0];
  const media = [item.image, ...(item.body || []).filter((section) => section.img).map((section) => section.img)];
  const wantedMedia = WEEKLY_CASES.find((entry) => entry.slug === expected.slug).images;
  if (item.title !== expected.title || item.date !== expected.date) failures.push(`${expected.slug}: 제목 또는 날짜가 다르다`);
  if (expected.excerpt && item.excerpt !== expected.excerpt) failures.push(`${expected.slug}: 첫 설명이 다르다`);
  if (expected.publicApartmentName && !item.excerpt.startsWith(`대전 ${expected.publicApartmentName}에서`)) failures.push(`${expected.slug}: 첫 설명에 공개 아파트명이 없다`);
  if (item.imageAlt !== expected.coverAlt) failures.push(`${expected.slug}: 표지 사진 설명이 다르다`);
  if (expected.finalImage) {
    const finalSection = (item.body || []).at(-1);
    if (!finalSection || finalSection.h !== expected.finalHeading || finalSection.img !== expected.finalImage) failures.push(`${expected.slug}: 완료 사진이 본문 마지막에 없다`);
    if (finalSection?.p !== expected.finalText) failures.push(`${expected.slug}: 완료 작업 설명이 다르다`);
    if (finalSection?.imgAlt !== expected.finalAlt) failures.push(`${expected.slug}: 완료 사진 alt가 다르다`);
    if (finalSection?.imgCaption !== expected.finalCaption) failures.push(`${expected.slug}: 완료 사진 캡션이 다르다`);
  }
  if (item.category !== '방수·설비' || item.service !== 'leak') failures.push(`${expected.slug}: 누수 서비스 분류가 아니다`);
  if ((item.body || []).length < 4 || item.body.length > 6) failures.push(`${expected.slug}: 본문 소제목이 4~6개가 아니다`);
  if (JSON.stringify(media) !== JSON.stringify(wantedMedia)) failures.push(`${expected.slug}: 사진 순서 또는 수가 다르다`);
  const approvedApartmentSuffixes = expected.publicApartmentName
    ? [expected.title, expected.excerpt]
        .filter((value) => typeof value === 'string' && value.includes(expected.publicApartmentName))
        .map((value) => value.slice(value.indexOf(expected.publicApartmentName) + expected.publicApartmentName.length))
    : [];
  const publicPrivacy = privacyViolations(item, {
    allowedBuildingNames: expected.publicApartmentName ? [expected.publicApartmentName] : [],
    allowedBuildingSuffixes: expected.publicApartmentName
      ? { [expected.publicApartmentName]: approvedApartmentSuffixes }
      : {}
  });
  if (publicPrivacy.length) failures.push(`${expected.slug}: 공개 데이터에 개인정보가 있다 (${publicPrivacy.join(', ')})`);
  const postPath = path.join(ROOT, 'posts', `${expected.slug}.html`);
  if (!fs.existsSync(postPath)) { failures.push(`${expected.slug}: 정적 글이 없다`); continue; }
  const post = fs.readFileSync(postPath, 'utf8');
  for (const violation of artifactParityViolations({ item, expected, post, blog, rss })) {
    failures.push(`${expected.slug}: ${violation}`);
  }

  if (expected.finalImage) {
    const titleMarkup = `<h1 class="post-title">${escapeMarkup(item.title)}</h1>`;
    const excerptMarkup = `<p class="post-excerpt">${escapeMarkup(item.excerpt)}</p>`;
    const headingMarkup = `<h2>${escapeMarkup(expected.finalHeading)}</h2>`;
    const paragraphMarkup = `<p>${escapeMarkup(expected.finalText)}</p>`;
    const blogTitleMarkup = `<b>${escapeMarkup(item.title)}</b>`;
    const blogExcerptMarkup = `<span class="ic-excerpt">${escapeMarkup(item.excerpt)}</span>`;
    const rssTitleMarkup = `<title>${escapeMarkup(item.title)}</title>`;
    const rssExcerptMarkup = `<description>${escapeMarkup(item.excerpt)}</description>`;
    const finalFigureStart = post.lastIndexOf('<figure class="post-figure">');
    const finalFigureEnd = finalFigureStart < 0 ? -1 : post.indexOf('</figure>', finalFigureStart);
    const finalFigureMarkup = finalFigureStart < 0 || finalFigureEnd < 0 ? '' : post.slice(finalFigureStart, finalFigureEnd + 9);
    const postWithoutFinalFigure = finalFigureMarkup ? post.slice(0, finalFigureStart) + post.slice(finalFigureEnd + 9) : post;
    const ctaStart = postWithoutFinalFigure.indexOf('<div class="post-cta">');
    const figureOutsideBody = !finalFigureMarkup || ctaStart < 0
      ? post
      : postWithoutFinalFigure.slice(0, ctaStart) + finalFigureMarkup + '\n          ' + postWithoutFinalFigure.slice(ctaStart);
    const mutationFixtures = [
      { label: '정적 글 제목', source: 'post', original: post, mutated: post.replace(titleMarkup, '<h1 class="post-title">오염된 사례 제목</h1>'), expectedViolation: '정적 글 제목 불일치' },
      { label: '정적 글 요약', source: 'post', original: post, mutated: post.replace(excerptMarkup, '<p class="post-excerpt">오염된 사례 요약</p>'), expectedViolation: '정적 글 요약 불일치' },
      { label: '정적 글 마지막 소제목', source: 'post', original: post, mutated: post.replace(headingMarkup, '<h2>오염된 마지막 소제목</h2>'), expectedViolation: '정적 글 마지막 소제목 불일치' },
      { label: '정적 글 마지막 설명', source: 'post', original: post, mutated: post.replace(paragraphMarkup, '<p>오염된 마지막 작업 설명</p>'), expectedViolation: '정적 글 마지막 설명 불일치' },
      { label: '정적 글 본문 밖 마지막 사진', source: 'post', original: post, mutated: figureOutsideBody, expectedViolation: '정적 글 마지막 사진이 본문 밖에 있음' },
      { label: '블로그 카드 제목', source: 'blog', original: blog, mutated: blog.replace(blogTitleMarkup, '<b>오염된 블로그 카드 제목</b>'), expectedViolation: '블로그 카드 제목 불일치' },
      { label: '블로그 카드 요약', source: 'blog', original: blog, mutated: blog.replace(blogExcerptMarkup, '<span class="ic-excerpt">오염된 블로그 카드 요약</span>'), expectedViolation: '블로그 카드 요약 불일치' },
      { label: 'RSS 제목', source: 'rss', original: rss, mutated: rss.replace(rssTitleMarkup, '<title>오염된 RSS 제목</title>'), expectedViolation: 'RSS 제목 불일치' },
      { label: 'RSS 요약', source: 'rss', original: rss, mutated: rss.replace(rssExcerptMarkup, '<description>오염된 RSS 요약</description>'), expectedViolation: 'RSS 요약 불일치' }
    ];
    for (const fixture of mutationFixtures) {
      if (fixture.mutated === fixture.original) {
        failures.push(`${expected.slug}: 생성물 오염 fixture 대상을 찾지 못했다 (${fixture.label})`);
        continue;
      }
      const artifacts = { item, expected, post, blog, rss, [fixture.source]: fixture.mutated };
      const mutationViolations = artifactParityViolations(artifacts);
      if (!mutationViolations.includes(fixture.expectedViolation)) {
        failures.push(`${expected.slug}: 생성물 오염 fixture가 통과했다 (${fixture.label})`);
      }
    }
  }

  const canonical = `https://01023978629.github.io/manmool/posts/${expected.slug}.html`;
  if (!post.includes(`<link rel="canonical" href="${canonical}"`)) failures.push(`${expected.slug}: canonical이 없다`);
  if (!post.includes('data-service="leak"')) failures.push(`${expected.slug}: 누수 상담 CTA가 없다`);
  for (const image of wantedMedia) if (!post.includes(`../${image}`)) failures.push(`${expected.slug}: 정적 글에 사진 누락 ${image}`);
  for (const section of (item.body || []).filter((entry) => entry.img)) {
    if (typeof section.imgAlt !== 'string' || !section.imgAlt.trim()) failures.push(`${expected.slug}: 본문 사진 alt가 비어 있다 ${section.img}`);
    if (typeof section.imgCaption !== 'string' || !section.imgCaption.trim()) failures.push(`${expected.slug}: 본문 사진 캡션이 비어 있다 ${section.img}`);
    if (typeof section.imgAlt === 'string' && section.imgAlt.trim() && !post.includes(`alt="${section.imgAlt}"`)) failures.push(`${expected.slug}: 정적 글에 사진 alt가 없다 ${section.img}`);
    if (typeof section.imgCaption === 'string' && section.imgCaption.trim() && !post.includes(`<figcaption>${section.imgCaption}</figcaption>`)) failures.push(`${expected.slug}: 정적 글에 사진 캡션이 없다 ${section.img}`);
  }
  if (!blog.includes(expected.slug) || !rss.includes(expected.slug) || !sitemap.includes(expected.slug)) failures.push(`${expected.slug}: 목록·RSS·sitemap 연결이 빠졌다`);
}

if (failures.length) {
  console.error(`최근 누수 사례 검사 실패 ${failures.length}건`);
  failures.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log('PASS 최근 누수 사례 3건 · 사진 16장');
