/*
 * Public leak-case cards must remain a faithful, publishable projection of
 * data/site.json.  This intentionally reads leak.html (the visitor-facing
 * artifact), not a generator source, so a skipped render is caught too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const site = JSON.parse(read('data/site.json'));
const failures = [];
const passes = [];

function check(condition, failure, pass) {
  if (condition) passes.push(pass);
  else failures.push(failure);
}

function normalizeText(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(
      code[0].toLowerCase() === 'x' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10),
    ))
    .replace(/\s+/g, ' ')
    .trim();
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? normalizeText(match[2]) : '';
}

function elementBlock(source, marker, tagName) {
  const start = source.search(marker);
  if (start < 0) return '';

  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(start, tags.lastIndex);
  }
  return '';
}

function isLeakService(item) {
  if (Object.hasOwn(item, 'service')) return item.service === 'leak';
  return item.category === '방수·설비' || item.category === '누수탐지·수리';
}

function latestPublicLeakSlugs(insights, limit = 3) {
  return (Array.isArray(insights) ? insights : [])
    .filter((item) => item && item.published !== false && isLeakService(item))
    .sort((left, right) => {
      const leftDate = String(left.date ?? '');
      const rightDate = String(right.date ?? '');
      if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;
      const leftSlug = String(left.slug ?? '');
      const rightSlug = String(right.slug ?? '');
      return leftSlug === rightSlug ? 0 : leftSlug < rightSlug ? -1 : 1;
    })
    .slice(0, limit)
    .map((item) => String(item.slug ?? ''));
}

function canonicalImageAlts(item, source) {
  const alts = [];
  if (item.image === source && typeof item.imageAlt === 'string') alts.push(normalizeText(item.imageAlt));
  for (const block of Array.isArray(item.body) ? item.body : []) {
    if (block && block.img === source && typeof block.imgAlt === 'string') alts.push(normalizeText(block.imgAlt));
  }
  return [...new Set(alts.filter(Boolean))];
}

const leak = read('leak.html');
const cases = elementBlock(leak, /<section\b[^>]*\bid=["']cases["']/i, 'section');
const cards = [...cases.matchAll(/<article\b[^>]*\bclass=["'][^"']*\bcase-card\b[^"']*["'][^>]*>[\s\S]*?<\/article>/gi)]
  .map((match) => match[0]);

check(cases.length > 0, 'leak.html에 #cases 섹션이 없다', '#cases 섹션 존재');
check(cards.length > 0, '#cases 안에 .case-card가 없다', `#cases 카드 ${cards.length}개 발견`);

const cardSlugs = new Set();
for (const [index, card] of cards.entries()) {
  const links = [...card.matchAll(/\bhref=["']posts\/([^"'/?#]+)\.html(?:[?#][^"']*)?["']/gi)]
    .map((match) => match[1]);
  const slugs = [...new Set(links)];
  const cardName = `#cases 카드 ${index + 1}`;

  check(slugs.length === 1,
    `${cardName}: posts/<slug>.html 링크가 정확히 하나의 slug를 가리키지 않는다 (${slugs.join(', ') || '없음'})`,
    `${cardName}: ${slugs[0]} 링크 확인`);
  if (slugs.length !== 1) continue;

  const slug = slugs[0];
  cardSlugs.add(slug);
  const matches = (site.insights || []).filter((item) => item && item.slug === slug);
  check(matches.length === 1,
    `${slug}: data/site.json insights에서 정확히 1건이어야 하나 ${matches.length}건이다`,
    `${slug}: 정본 1건 확인`);
  if (matches.length !== 1) continue;

  const item = matches[0];
  check(item.published !== false,
    `${slug}: published:false 항목이 공개 누수 사례 카드에 노출된다`,
    `${slug}: 공개 가능 상태`);
  check(isLeakService(item),
    `${slug}: 명시 service 또는 허용된 category 폴백 기준에서 누수 서비스가 아닌 항목이 노출된다`,
    `${slug}: 누수 서비스 분류 확인`);
  check(fs.existsSync(path.join(ROOT, 'posts', `${slug}.html`)),
    `${slug}: 연결된 posts/${slug}.html 파일이 없다`,
    `${slug}: 공개 글 파일 존재`);

  const h3 = card.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '';
  const shownTitle = normalizeText(h3);
  const canonicalTitle = normalizeText(item.title || '');
  const allowedTitle = canonicalTitle.startsWith('대전 ')
    ? canonicalTitle.slice('대전 '.length)
    : canonicalTitle;
  check(shownTitle === canonicalTitle || shownTitle === allowedTitle,
    `${slug}: 카드 h3(${shownTitle || '없음'})가 정본 title(${canonicalTitle || '없음'})과 다르다`,
    `${slug}: 카드 h3가 정본 title과 일치`);

  const images = [...card.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  check(images.length > 0,
    `${slug}: 카드에 검증할 img가 없다`,
    `${slug}: 카드 이미지 ${images.length}개 발견`);
  for (const image of images) {
    const source = attribute(image, 'src');
    const alt = attribute(image, 'alt');
    const allowedAlts = canonicalImageAlts(item, source);
    check(allowedAlts.length > 0,
      `${slug}: 카드 img src(${source || '없음'})와 일치하는 정본 이미지가 없다`,
      `${slug}: 카드 img src가 정본 이미지와 일치`);
    check(allowedAlts.includes(alt),
      `${slug}: 카드 img alt(${alt || '없음'})가 해당 정본 이미지 설명(${allowedAlts.join(' | ') || '없음'})과 다르다`,
      `${slug}: 카드 img alt가 해당 정본 이미지 설명과 일치`);
  }
}

const latestRuleFixture = latestPublicLeakSlugs([
  { slug: 'older', date: '2026-08-01', category: '방수·설비' },
  { slug: 'same-b', date: '2026-08-03', service: 'leak' },
  { slug: 'same-a', date: '2026-08-03', service: 'leak' },
  { slug: 'draft', date: '2026-08-04', service: 'leak', published: false },
  { slug: 'invalid-explicit', date: '2026-08-05', service: '', category: '방수·설비' },
]);
check(JSON.stringify(latestRuleFixture) === JSON.stringify(['same-a', 'same-b', 'older']),
  `최신 공개 누수 정렬·필터 규칙이 어괋났다 (${latestRuleFixture.join(', ')})`,
  '최신 공개 누수 정렬·필터 규칙 확인');

const requiredSlugs = latestPublicLeakSlugs(site.insights, 3);
check(requiredSlugs.length === 3,
  `data/site.json에 최신 공개 누수 사례가 ${requiredSlugs.length}건뿐이다`,
  '최신 공개 누수 사례 3건 선정');
for (const slug of requiredSlugs) {
  check(cardSlugs.has(slug),
    `${slug}: 최근 공개 누수 사례가 #cases 랜딩 카드에 없다`,
    `${slug}: 최근 공개 누수 사례 랜딩 카드 존재`);
}
check(!cardSlugs.has('yeolmae-waterproof-screed'),
  'yeolmae-waterproof-screed: service="interior" 항목이 누수 랜딩 카드에 포함된다',
  'service="interior" 열매마을 항목은 누수 랜딩에서 제외');

if (failures.length) {
  console.error(`FAIL public leak case parity (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`OK public leak case parity (${passes.length} checks)`);
}
