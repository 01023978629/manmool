/* Read-only publication contract. No browser, network, live data or file writes.
 * Hard-mask placement still needs visual review; metadata/hash checks cannot
 * establish that a number plate is unreadable in the image pixels.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SLUG = 'buyeo-buyeong-balcony-waterproofing';
const DAY = '2026-09-08';
const UPDATED = '2026-09-09';
const PUBLIC_PLACE = '논산 강산부영아파트';
const wrongPlace = value => /부여|(?<!강산)부영아파트/.test(value);
const URL = `https://01023978629.github.io/manmool/posts/${SLUG}.html`;
const PHOTOS = Array.from({ length: 6 }, (_, i) => `assets/cases/${SLUG}-${i + 1}.jpg`);
const COVER = PHOTOS[4];
const piiContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pii-rules.js'), 'utf8'), piiContext);
const PII_RULES = piiContext.window.MANMUL_PII_RULES;
const PRIVATE_KEYS = new Set(['gps', 'coordinates', 'latitude', 'longitude', 'unit', 'unitNo',
  'customerName', 'customerPhone', 'sourcePath', 'sourceFile', 'fileId', 'driveId']);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const paragraphs = value => String(value ?? '').replace(/\r\n?/g, '\n').trim()
  .split(/\n[\t ]*\n+/).map(p => p.trim()).filter(Boolean);
const renderParagraphs = value => paragraphs(value).map(p => `<p>${esc(p).replaceAll('\n', '<br>')}</p>`).join('');
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`))?.[1] || '';

function elementContents(source, startPattern, tagName) {
  const start = source.search(startPattern);
  if (start < 0) return '';
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 0, innerStart = -1;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    if (match[0].startsWith('</')) depth--;
    else { depth++; if (innerStart < 0) innerStart = tags.lastIndex; }
    if (depth === 0) return source.slice(innerStart, match.index);
  }
  return '';
}

function jpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  for (let offset = 2; offset + 3 < buffer.length;) {
    if (buffer[offset++] !== 0xff) continue;
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 7) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function privacyIssues(value) {
  const failures = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      for (const [key, entry] of Object.entries(node)) {
        if (PRIVATE_KEYS.has(key)) failures.push('privacy:private-key');
        walk(entry);
      }
      return;
    }
    if (typeof node !== 'string') return;
    // Only the approved public business number is exempted. Never echo matches.
    const publicText = node.replaceAll('010-2397-8629', '사업자 연락처');
    if (PII_RULES.some(([, rule]) => rule.test(publicText))) failures.push('privacy:customer-data');
    if (/(?:[A-Za-z]:[\\/]|file:\/\/|(?:sourcePath|driveId)\s*[:=])/i.test(node)) failures.push('privacy:source-path');
    if (/(?:GPS|위도|경도|좌표|latitude|longitude)\s*[:=]?\s*[+-]?\d/i.test(node)
      || /[+-]?\d{1,3}\.\d{4,}\s*[,/]\s*[+-]?\d{1,3}\.\d{4,}/.test(node)) failures.push('privacy:coordinates');
  }
  walk(value);
  return [...new Set(failures)];
}

function unsupportedClaims(value) {
  const failures = [];
  for (const text of strings(value)) {
    for (const sentence of text.split(/[.!?\n]+/)) {
      const denied = /미확인|미실시|미진행|확인되지|확인하지|진행하지|실시하지|단정하지|완료하지|하지 않았|알 수 없/.test(sentence);
      if (denied) continue;
      if (/(?:담수|통수|압력)\s*(?:시험|테스트|검사)[^.!?\n]{0,30}(?:완료|통과|정상|이상\s*없|마쳤|마무리)/.test(sentence)) failures.push('claim:unverified-test');
      if (/(?:최종\s*마감|전체\s*공사|모든\s*공정)[^.!?\n]{0,20}(?:완료|마쳤|마무리)/.test(sentence)) failures.push('claim:final-finish');
      if (/(?:누수\s*원인)[^.!?\n]{0,25}(?:확정|찾았|밝혔|해결|제거|확인했)/.test(sentence)) failures.push('claim:leak-cause');
      if (/(?:\d+\s*(?:분|시간|일)\s*(?:만에|소요|걸렸)|소요\s*시간\s*[:：]?\s*\d+)/.test(sentence)) failures.push('claim:exact-duration');
      if (/100\s*%|평생\s*보증|완벽한\s*방수|재발\s*(?:없|안)/.test(sentence)) failures.push('claim:guarantee');
    }
  }
  return [...new Set(failures)];
}

function validateCase(snapshot) {
  const failures = [];
  const check = (condition, code) => { if (!condition) failures.push(code); };
  const matches = snapshot.insights.filter(item => item?.slug === SLUG);
  check(matches.length === 1, 'canonical:exactly-one');
  if (matches.length !== 1) return failures;
  const item = matches[0];
  check(item.published !== false, 'canonical:published');
  check(item.date === DAY, 'canonical:date');
  check(item.updated === UPDATED, 'canonical:updated');
  check(item.service === 'leak' && item.category === '방수·설비', 'canonical:classification');
  check(item.title.includes(PUBLIC_PLACE) && /베란다/.test(item.title) && /방수/.test(item.title), 'canonical:title');
  check(item.place?.name === PUBLIC_PLACE && item.caseSummary?.site === `${PUBLIC_PLACE} 베란다`
    && !strings(item).some(wrongPlace), 'canonical:location');
  check(item.image === COVER && !!item.imageAlt?.trim(), 'canonical:cover');
  const body = Array.isArray(item.body) ? item.body : [];
  check(body.length >= 6, 'canonical:sections');
  check(JSON.stringify(body.filter(section => section.img).map(section => section.img)) === JSON.stringify(PHOTOS), 'canonical:photo-order');
  check(body.every(section => section.h?.trim() && paragraphs(section.p).length >= 2), 'canonical:short-paragraphs');
  check(body.filter(section => section.img).every(section => section.imgAlt?.trim() && section.imgCaption?.trim()), 'canonical:photo-descriptions');
  const narrative = strings(item).join('\n');
  check(/1차[\s\S]{0,30}(?:몰탈|모르타르)|(?:몰탈|모르타르)[\s\S]{0,30}1차/.test(narrative), 'canonical:first-stage');
  check(/2차[\s\S]{0,30}도막|도막[\s\S]{0,30}2차/.test(narrative), 'canonical:second-stage');
  failures.push(...privacyIssues(item), ...unsupportedClaims(item));

  const hashes = new Set();
  for (const photo of PHOTOS) {
    const buffer = snapshot.images[photo];
    check(Buffer.isBuffer(buffer), 'image:missing');
    if (!Buffer.isBuffer(buffer)) continue;
    check(JSON.stringify(jpegDimensions(buffer)) === JSON.stringify({ width: 1350, height: 1800 }), 'image:dimensions');
    check(!buffer.includes(Buffer.from('Exif\0\0', 'binary')) && !/GPSLatitude|GPSLongitude|exif:GPS/i.test(buffer.toString('latin1')), 'image:metadata');
    hashes.add(crypto.createHash('sha256').update(buffer).digest('hex'));
  }
  check(hashes.size === 6, 'image:unique');

  const post = snapshot.post || '';
  check(!wrongPlace(post), 'post:location');
  check(post.includes(`<link rel="canonical" href="${URL}"`), 'post:canonical');
  check(post.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] === esc(item.title), 'post:title');
  const coverTag = post.match(/<img\b[^>]*class="post-cover-image"[^>]*>/)?.[0] || '';
  check(attribute(coverTag, 'src') === `../${COVER}` && attribute(coverTag, 'alt') === esc(item.imageAlt), 'post:cover');
  // post-place includes a nested div. Balance tags rather than stopping there.
  const markup = elementContents(post, /<div\b[^>]*\bclass="post-body"[^>]*>/, 'div');
  const headings = [...markup.matchAll(/<h2>.*?<\/h2>/gs)];
  check(headings.length === body.length, 'post:section-count');
  const shownImages = [];
  body.forEach((section, index) => {
    const heading = headings[index];
    if (!heading) return;
    check(heading[0] === `<h2>${esc(section.h)}</h2>`, 'post:heading');
    const sectionMarkup = markup.slice(heading.index + heading[0].length, headings[index + 1]?.index ?? markup.length).trim();
    check(sectionMarkup.split('<figure class="post-figure">')[0].trim() === renderParagraphs(section.p), 'post:paragraphs');
    const figures = [...sectionMarkup.matchAll(/<figure class="post-figure">([\s\S]*?)<\/figure>/g)];
    check(figures.length === (section.img ? 1 : 0), 'post:figure-count');
    if (!section.img || figures.length !== 1) return;
    const tag = figures[0][1].match(/<img\b[^>]*>/)?.[0] || '';
    shownImages.push(attribute(tag, 'src').replace(/^\.\.\//, ''));
    check(attribute(tag, 'src') === `../${section.img}` && attribute(tag, 'alt') === esc(section.imgAlt), 'post:image');
    check(figures[0][1].includes(`<figcaption>${esc(section.imgCaption)}</figcaption>`), 'post:caption');
    check(attribute(tag, 'width') === '1350' && attribute(tag, 'height') === '1800', 'post:dimensions');
    check(attribute(tag, 'srcset').includes('-480w.jpg 480w') && attribute(tag, 'srcset').includes('-960w.jpg 960w') && !!attribute(tag, 'sizes'), 'post:responsive-image');
  });
  check(JSON.stringify(shownImages) === JSON.stringify(PHOTOS), 'post:photo-order');
  // The fixed location privacy notice itself says "동·호수와 고객 정보".
  // Check the article sections, not this safety notice, as customer prose.
  failures.push(...privacyIssues(markup.slice(headings[0]?.index ?? markup.length).replace(/<[^>]*>/g, ' ')));

  const blogCards = [...(snapshot.blog || '').matchAll(/<a\b[^>]*class="[^"]*\binsight-(?:card|featured)\b[^"]*"[^>]*>[\s\S]*?<\/a>/g)]
    .map(match => match[0]).filter(card => card.includes(`href="posts/${SLUG}.html"`));
  check(blogCards.length === 1, 'blog:card');
  if (blogCards.length === 1) {
    check(!wrongPlace(blogCards[0]), 'blog:location');
    check(blogCards[0].includes('data-group="leak"') && blogCards[0].includes(esc(item.title)) && blogCards[0].includes(COVER), 'blog:projection');
  }
  const feedItems = [...(snapshot.rss || '').matchAll(/<item>[\s\S]*?<\/item>/g)].map(match => match[0]).filter(entry => entry.includes(`<link>${URL}</link>`));
  check(feedItems.length === 1 && feedItems[0].includes(`<title>${esc(item.title)}</title>`), 'rss:entry');
  check(!feedItems.some(wrongPlace), 'rss:location');
  const indexCases = (snapshot.index?.cases || []).filter(entry => entry.slug === SLUG);
  check(indexCases.length === 1 && indexCases[0].title === item.title && indexCases[0].service === 'leak' && indexCases[0].published === true, 'index:entry');
  const sitemapEntries = [...(snapshot.sitemap || '').matchAll(/<url>[\s\S]*?<\/url>/g)].map(match => match[0]).filter(entry => entry.includes(`<loc>${URL}</loc>`));
  check(sitemapEntries.length === 1 && sitemapEntries[0].includes(`<lastmod>${item.updated || DAY}</lastmod>`), 'sitemap:entry');
  const leakSection = elementContents(snapshot.leak || '', /<section\b[^>]*\bid="cases"[^>]*>/, 'section');
  const leakCards = [...leakSection.matchAll(/<article\b[^>]*class="[^"]*case-card[^"]*"[^>]*>[\s\S]*?<\/article>/g)]
    .map(match => match[0]).filter(card => card.includes(`href="posts/${SLUG}.html"`));
  check(leakCards.length === 1, 'leak:latest-card');
  if (leakCards.length === 1) {
    const card = leakCards[0];
    check(!wrongPlace(card), 'leak:location');
    check(card.includes(`<h3>${esc(item.title)}</h3>`), 'leak:title');
    const images = [...card.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
    check(images.length > 0, 'leak:images');
    for (const tag of images) {
      const src = attribute(tag, 'src');
      const alts = [item.image === src ? item.imageAlt : '', ...body.filter(section => section.img === src).map(section => section.imgAlt)].filter(Boolean).map(esc);
      check(PHOTOS.includes(src) && alts.includes(attribute(tag, 'alt')), 'leak:image-projection');
    }
    failures.push(...privacyIssues(card), ...unsupportedClaims(card.replace(/<[^>]*>/g, ' ')));
  }
  return [...new Set(failures)];
}

function readSnapshot() {
  const read = relative => fs.existsSync(path.join(ROOT, relative)) ? fs.readFileSync(path.join(ROOT, relative), 'utf8') : '';
  return {
    insights: JSON.parse(read('data/site.json')).insights,
    images: Object.fromEntries(PHOTOS.filter(photo => fs.existsSync(path.join(ROOT, photo))).map(photo => [photo, fs.readFileSync(path.join(ROOT, photo))])),
    post: read(`posts/${SLUG}.html`), blog: read('blog.html'), rss: read('rss.xml'),
    index: JSON.parse(read('data/leak-case-index.json') || '{}'), sitemap: read('sitemap.xml'), leak: read('leak.html'),
  };
}

// Synthetic local fixture, not a generated case or a publishable photo.
function syntheticSnapshot() {
  const item = { slug: SLUG, date: DAY, updated: UPDATED, published: true, service: 'leak', category: '방수·설비',
    title: `${PUBLIC_PLACE} 베란다 방수`, place: { name: PUBLIC_PLACE }, caseSummary: { site: `${PUBLIC_PLACE} 베란다` }, image: COVER, imageAlt: '2차 도막 단계 표면',
    body: PHOTOS.map((img, i) => ({ h: `사진 ${i + 1} 작업 단계`,
      p: '1차 몰탈 방수 후 표면입니다.\n\n2차 도막 단계이며 최종 마감은 미확인입니다.',
      img, imgAlt: `방수 작업 단계 ${i + 1}`, imgCaption: `단계별 표면 ${i + 1}` })),
  };
  const imgTag = (src, alt, cover = false) => `<img${cover ? ' class="post-cover-image"' : ''} src="${src}" alt="${esc(alt)}" width="1350" height="1800" srcset="${src.replace('.jpg', '-480w.jpg')} 480w, ${src.replace('.jpg', '-960w.jpg')} 960w" sizes="94vw">`;
  const body = item.body.map(section => `<h2>${esc(section.h)}</h2>${renderParagraphs(section.p)}<figure class="post-figure">${imgTag('../' + section.img, section.imgAlt)}<figcaption>${esc(section.imgCaption)}</figcaption></figure>`).join('');
  return {
    insights: [item], images: Object.fromEntries(PHOTOS.map((photo, i) => [photo, Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 7, 8, 7, 8, 5, 70, 0xff, 0xd9, i])])),
    post: `<link rel="canonical" href="${URL}"><h1>${esc(item.title)}</h1>${imgTag('../' + COVER, item.imageAlt, true)}<div class="post-body">${body}</div>`,
    blog: `<a class="insight-card" href="posts/${SLUG}.html" data-group="leak">${esc(item.title)}${imgTag(COVER, item.imageAlt)}</a>`,
    rss: `<item><title>${esc(item.title)}</title><link>${URL}</link></item>`,
    index: { cases: [{ slug: SLUG, title: item.title, service: 'leak', published: true }] },
    sitemap: `<url><loc>${URL}</loc><lastmod>${UPDATED}</lastmod></url>`,
    leak: `<section id="cases"><article class="case-card registered-case"><a href="posts/${SLUG}.html">${imgTag(COVER, item.imageAlt)}</a><h3>${esc(item.title)}</h3></article></section>`,
  };
}

test('논산 강산부영 베란다 공개 정본·6장·짧은 문단·배포 연결 계약', () => {
  assert.deepEqual(validateCase(readSnapshot()), []);
});

test('변이: 잘못된 부여 표기·모호한 단지명·수정일 누락을 차단한다', () => {
  for (const change of [
    item => { item.title = item.title.replace(PUBLIC_PLACE, '부여 부영아파트'); },
    item => { item.place.name = '부여 부영아파트'; },
    item => { item.caseSummary.site = '부영아파트 베란다'; },
    item => { item.imageAlt = '부여 부영아파트 베란다 바닥'; },
    item => { item.body[0].imgCaption = '부여 부영아파트 공정 사진'; },
  ]) {
    const changed = syntheticSnapshot(); change(changed.insights[0]);
    assert.ok(validateCase(changed).includes('canonical:location'));
  }
  const actual = readSnapshot();
  const wrong = { ...actual, insights: structuredClone(actual.insights) };
  wrong.insights.find(item => item.slug === SLUG).place.name = '부여 부영아파트';
  assert.ok(validateCase(wrong).includes('canonical:location'));
  const stale = syntheticSnapshot(); delete stale.insights[0].updated;
  assert.ok(validateCase(stale).includes('canonical:updated'));
  const post = syntheticSnapshot(); post.post += '<span>부여 부영아파트</span>';
  assert.ok(validateCase(post).includes('post:location'));
  const card = syntheticSnapshot(); card.leak = card.leak.replace('</h3>', '</h3><p>부여 부영아파트</p>');
  assert.ok(validateCase(card).includes('leak:location'));
});

test('독립 검사 정상 fixture와 미확인 범위 표현을 허용한다', () => {
  assert.deepEqual(validateCase(syntheticSnapshot()), []);
  assert.deepEqual(unsupportedClaims('담수시험은 진행하지 않았습니다. 최종 마감은 미확인입니다. 누수 원인은 확인하지 않았습니다.'), []);
  assert.ok(unsupportedClaims('담수시험 완료했습니다.').includes('claim:unverified-test'));
  assert.ok(unsupportedClaims('최종 마감 완료했습니다.').includes('claim:final-finish'));
});

test('변이: 사진 누락·중복·EXIF를 메모리 fixture에서 차단한다', () => {
  const missing = syntheticSnapshot(); delete missing.images[PHOTOS[1]];
  assert.ok(validateCase(missing).includes('image:missing'));
  const duplicate = syntheticSnapshot(); duplicate.images[PHOTOS[1]] = duplicate.images[PHOTOS[0]];
  assert.ok(validateCase(duplicate).includes('image:unique'));
  const metadata = syntheticSnapshot(); metadata.images[PHOTOS[0]] = Buffer.concat([metadata.images[PHOTOS[0]], Buffer.from('Exif\0\0', 'binary')]);
  assert.ok(validateCase(metadata).includes('image:metadata'));
});

test('변이: 공개 원고의 민감 좌표·동호수·미검증 시험 완료를 차단한다', () => {
  const coordinates = syntheticSnapshot(); coordinates.insights[0].body[0].p += '\n\nGPS: 35.123456, 126.123456';
  assert.ok(validateCase(coordinates).includes('privacy:coordinates'));
  const unit = syntheticSnapshot(); unit.insights[0].body[0].p += '\n\n999동 9999호';
  assert.ok(validateCase(unit).includes('privacy:customer-data'));
  const claim = syntheticSnapshot(); claim.insights[0].body[0].p += '\n\n담수시험을 통과했습니다.';
  assert.ok(validateCase(claim).includes('claim:unverified-test'));
});

test('변이: 공개 정본 누락·사진 순서 변경·랜딩 카드 누락을 차단한다', () => {
  const orphan = syntheticSnapshot(); orphan.insights = [];
  assert.ok(validateCase(orphan).includes('canonical:exactly-one'));
  const order = syntheticSnapshot(); [order.insights[0].body[0], order.insights[0].body[1]] = [order.insights[0].body[1], order.insights[0].body[0]];
  assert.ok(validateCase(order).includes('canonical:photo-order'));
  const card = syntheticSnapshot(); card.leak = '<section id="cases"></section>';
  assert.ok(validateCase(card).includes('leak:latest-card'));
});

test('실제 공개 정본의 메모리 변이: 사진 누락·민감 좌표·정본 제거를 차단한다', () => {
  const actual = readSnapshot();
  assert.deepEqual(validateCase(actual), [], '변이 전에 실제 정본이 먼저 통과해야 한다');
  const missing = { ...actual, images: { ...actual.images } };
  delete missing.images[PHOTOS[2]];
  assert.ok(validateCase(missing).includes('image:missing'));
  const coordinates = { ...actual, insights: structuredClone(actual.insights) };
  coordinates.insights.find(item => item.slug === SLUG).body[0].p += '\n\nGPS: 35.123456, 126.123456';
  assert.ok(validateCase(coordinates).includes('privacy:coordinates'));
  const orphan = { ...actual, insights: actual.insights.filter(item => item.slug !== SLUG) };
  assert.ok(validateCase(orphan).includes('canonical:exactly-one'));
  assert.deepEqual(validateCase(actual), [], '메모리 변이가 실제 정본을 바꾸지 않아야 한다');
});
