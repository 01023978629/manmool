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
    'assets/cases/apartment-upper-lower-rain-pipe-repair-4.jpg'
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

if (WEEKLY_CASES.map((item) => item.images.length).join(',') !== '6,4,5') failures.push('사례별 사진 수는 6,4,5여야 한다');
if (allImages.length !== 15) failures.push(`전체 사진 수가 ${allImages.length}장이다`);
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
  { slug: 'apartment-balcony-rain-pipe-replacement', date: '2026-08-28', title: '대전 아파트 베란다 우수관 교체 — 바닥 배수구와 연결부 작업', coverAlt: '수직 우수관 하부 연결부와 바닥 마감 상태' },
  { slug: 'apartment-upper-lower-rain-pipe-repair', date: '2026-08-28', title: '대전 아파트 상·하층 우수관 보수 — 배수구 테두리와 관통부 마감', coverAlt: '보수 후 수직 우수관과 천장 관통부 전경' },
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

function privacyViolations(value) {
  const violations = [];
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
    if (namedBuildingPattern.test(node)) violations.push(`${keyPath}: 단지·건물 고유명`);
  }
  walk(value);
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

for (const expected of expectedContent) {
  const matches = (site.insights || []).filter((item) => item && item.slug === expected.slug);
  if (matches.length !== 1) { failures.push(`${expected.slug}: insight가 ${matches.length}건이다`); continue; }
  const item = matches[0];
  const media = [item.image, ...(item.body || []).filter((section) => section.img).map((section) => section.img)];
  const wantedMedia = WEEKLY_CASES.find((entry) => entry.slug === expected.slug).images;
  if (item.title !== expected.title || item.date !== expected.date) failures.push(`${expected.slug}: 제목 또는 날짜가 다르다`);
  if (item.imageAlt !== expected.coverAlt) failures.push(`${expected.slug}: 표지 사진 설명이 다르다`);
  if (item.category !== '방수·설비' || item.service !== 'leak') failures.push(`${expected.slug}: 누수 서비스 분류가 아니다`);
  if ((item.body || []).length < 4 || item.body.length > 6) failures.push(`${expected.slug}: 본문 소제목이 4~6개가 아니다`);
  if (JSON.stringify(media) !== JSON.stringify(wantedMedia)) failures.push(`${expected.slug}: 사진 순서 또는 수가 다르다`);
  const publicPrivacy = privacyViolations(item);
  if (publicPrivacy.length) failures.push(`${expected.slug}: 공개 데이터에 개인정보가 있다 (${publicPrivacy.join(', ')})`);
  const postPath = path.join(ROOT, 'posts', `${expected.slug}.html`);
  if (!fs.existsSync(postPath)) { failures.push(`${expected.slug}: 정적 글이 없다`); continue; }
  const post = fs.readFileSync(postPath, 'utf8');
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
console.log('PASS 최근 누수 사례 3건 · 사진 15장');
