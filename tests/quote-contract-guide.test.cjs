/* Local read-only checks. Image pixels/redaction and source-document accuracy need separate visual review. */
const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'interior-quote-contract-comparison', FEATURED = 'pyeonghaneul-apartment-leak-repair-20260909', DAY = '2026-09-09', CHECKED = '2026-09-08';
const OLD_HASH = '1950ce09796a06149ed1bc555ec2605f6cf834f43d88f45a0666dcfde0447762'; // 39 public objects: the 38 pinned after the Nonsan Gangsan name correction (2026-09-09) + the 평화로운아파트 leak case rewritten from the 2026-09-09 photos (insights[0]); other prose unchanged.
const IMAGE_PATHS = ['assets/insights/interior-quote-details-ai-redacted.png'];
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
function metadataStrings(bytes) {
  const strings = [], binary = { cborByteStrings: 0 }, decode = b => new TextDecoder('utf-8', { fatal: true }).decode(b), valid = ok => { if (!ok) throw Error('Unparsed metadata'); };
  function cbor(buf) {
    let p = 0;
    function item() {
      valid(p < buf.length); const h = buf[p++], major = h >> 5, ai = h & 31; let n = ai;
      if (ai >= 24 && ai <= 27) { const z = 2 ** (ai - 24); valid(p + z <= buf.length); n = z === 8 ? Number(buf.readBigUInt64BE(p)) : buf.readUIntBE(p, z); p += z; valid(major === 7 || Number.isSafeInteger(n)); }
      else { valid(ai < 28 || ai === 31); if (ai === 31) n = -1; }
      if (major <= 1 || major === 7) { valid(n >= 0); return; } if (major === 6) { valid(n >= 0); item(); return; }
      if (major === 2 || major === 3) { if (n < 0) { while (p < buf.length && buf[p] !== 255) { valid(buf[p] >> 5 === major && (buf[p] & 31) !== 31); item(); } valid(buf[p++] === 255); return; } valid(p + n <= buf.length); if (major === 3) strings.push(decode(buf.subarray(p, p + n))); else binary.cborByteStrings++; p += n; return; }
      valid(major === 4 || major === 5); if (n < 0) { let count = 0; while (p < buf.length && buf[p] !== 255) { item(); count++; } valid(buf[p++] === 255 && (major !== 5 || count % 2 === 0)); } else for (let i = 0; i < n * (major === 5 ? 2 : 1); i++) item();
    }
    item(); valid(p === buf.length); // CBOR byte strings are counted opaque binary, never coerced to text.
  }
  function jumbf(buf) {
    let p = 0, mime = '';
    while (p < buf.length) { valid(p + 8 <= buf.length); const n = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8); valid(n >= 8 && p + n <= buf.length); const d = buf.subarray(p + 8, p + n);
      if (type === 'jumb') jumbf(d); else if (type === 'cbor') cbor(d); else if (type === 'jumd') { valid(d.length >= 17); const end = d.indexOf(0, 17); valid(end >= 17); strings.push(decode(d.subarray(17, end))); }
      else if (type === 'bfdb') { const text = decode(d); strings.push(text); mime = text.includes('image/svg+xml') ? 'image/svg+xml' : ''; valid(mime); }
      else if (type === 'bidb') { valid(mime === 'image/svg+xml'); strings.push(decode(d)); } else valid(false); p += n;
    }
  }
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { strings: [decode(bytes)], binary };
  for (let p = 8; p < bytes.length;) { valid(p + 12 <= bytes.length); const n = bytes.readUInt32BE(p), type = bytes.toString('ascii', p + 4, p + 8); valid(p + n + 12 <= bytes.length); const d = bytes.subarray(p + 8, p + 8 + n); if (type === 'caBX') jumbf(d); else if (type === 'tEXt') strings.push(decode(d)); else valid(['IHDR', 'IDAT', 'IEND', 'pHYs', 'gAMA', 'cHRM', 'sRGB'].includes(type)); p += n + 12; }
  return { strings, binary };
}
function sensitiveMetadata(bytes) {
  try { return /Exif\x00\x00|GPSLatitude|GPSLongitude|exif:GPS|\b[A-Za-z]:[\\/]|file:\/\/|[\\/]Users[\\/]|[\\/]home[\\/]|\.private[\\/]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[+-]?\d{1,3}\.\d{4,}\s*[,/]\s*[+-]?\d{1,3}\.\d{4,}/i.test(metadataStrings(bytes).strings.join('\n')); } catch { return true; }
}
function inspect(s, oldHash = OLD_HASH, expectedImages = IMAGE_PATHS) {
  const fail = [], check = (ok, code) => { if (!ok) fail.push(code); }, matches = s.insights.filter(a => a.slug === SLUG), a = matches[0];
  check(matches.length === 1, 'canonical'); if (matches.length !== 1) return fail;
  check(a.date === DAY && a.category === '견적·계약 가이드' && a.service === 'interior' && a.published !== false, 'classification');
  check(s.insights[0]?.slug === FEATURED && s.insights[1]?.slug === SLUG, 'order');
  const old = s.insights.filter(x => x.slug !== SLUG); check(old.length === 39 && hash(old) === oldHash, 'preservation');
  const body = a.body || [], prose = [a.title, a.excerpt, a.imageAlt, ...body.flatMap(b => [b.h, b.p, b.imgAlt, b.imgCaption])].filter(Boolean).join('\n');
  check(/AI\s*편집/.test(prose), 'ai-disclosure');
  check(/실제\s*시공[^.!?\n]{0,90}(?:아니|아닙)/.test(prose) && /만물[^.!?\n]{0,90}작성[^.!?\n]{0,50}(?:아니|아닙)/.test(prose), 'document-disclaimer');
  check(/원본[^.!?\n]{0,60}(?:아니|아닙)/.test(prose) && /제출용[^.!?\n]{0,60}(?:아니|아닙)/.test(prose), 'document-usage');
  for (const sentence of prose.split(/[.!?\n]+/).filter(x => !/아니|아닙|않|단정.*(?:말|못|수는)/.test(x))) {
    check(!/(?:법적\s*효력.*없|불법입니다|반드시.*(?:\d+\s*%|법정)|(?:계약금|중도금|잔금)\s*\d+\s*%|보증\s*\d+\s*년|실제\s*시공\s*(?:사례|후기)입니다|계약서\s*원본입니다|만물.*작성한.*계약서입니다)/.test(sentence), 'unsupported-claim');
  }
  const safe = prose.replaceAll('010-2397-8629', '').replace(/\d{4}-\d{2}-\d{2}/g, '');
  check(!/(?:\d{1,4}\s*동\s*\d{1,4}\s*호|(?:고객명|성명|계좌|사업자번호)\s*[:：]\s*[^\s가림삭제미공개]|\d[\d,]*\s*(?:만|억)?원|01[016789][ .-]?\d{3,4}[ .-]?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(safe), 'private-prose');
  check(!/(?:\b[A-Za-z]:[\\/]|file:\/\/|\.private[\\/]|sourcePath|sourceFile|driveId|GPS\s*[:=]\s*\d|\d{1,3}\.\d{4,}\s*[,/]\s*\d{1,3}\.\d{4,})/i.test(JSON.stringify(a)), 'private-source');
  check(body.length > 0 && body.every(b => b.h && String(b.p || '').split(/\n\s*\n/).length >= 2), 'paragraphs');
  const sources = a.sources || []; check(sources.length === 2 && a.sourcesChecked === CHECKED, 'sources');
  check(['ftc.go.kr', 'kca.go.kr'].every(host => sources.some(x => { try { return new URL(x.url).protocol === 'https:' && new URL(x.url).hostname === 'www.' + host; } catch { return false; } })), 'official-hosts');
  const photos = [...new Set([a.image, ...body.map(b => b.img)].filter(Boolean))];
  check(expectedImages.length > 0 && JSON.stringify([...photos].sort()) === JSON.stringify([...expectedImages].sort()), 'image-scope');
  for (const file of photos) { const bytes = s.images[file]; check(Buffer.isBuffer(bytes) && bytes.length > 0, 'image-missing'); if (Buffer.isBuffer(bytes)) check(!sensitiveMetadata(bytes), 'image-metadata'); }
  check(s.post.includes(`<link rel="canonical" href="https://01023978629.github.io/manmool/posts/${SLUG}.html"`) && s.post.includes(esc(a.title)), 'post');
  check(/AI\s*편집/.test(s.post) && sources.every(x => s.post.includes(`href="${esc(x.url)}"`)), 'post-disclosures');
  check(photos.every(file => s.post.includes(`src="../${file}"`)), 'post-images');
  const cta = s.post.match(/<div class="post-cta">([\s\S]*?)<\/div>/)?.[1] || ''; check(cta.includes('href="../index.html#inquiry"') && !cta.includes('../leak.html'), 'interior-cta');
  const cards = [...s.blog.matchAll(/<a\b[^>]*href="posts\/([^"?#]+)\.html"[^>]*>/g)].map(m => ({ slug: m[1], tag: m[0] }));
  check(cards.filter(c => c.slug === SLUG).length === 1 && cards.some(c => c.slug === SLUG && c.tag.includes('data-group="info"')), 'info-card');
  check(cards.filter(c => c.tag.includes('insight-featured')).map(c => c.slug).join() === FEATURED, 'featured');
  check(!s.index.cases.some(c => c.slug === SLUG), 'leak-index');
  check(s.rss.includes(`/posts/${SLUG}.html`) && s.sitemap.includes(`/posts/${SLUG}.html`), 'discovery');
  return [...new Set(fail)];
}
function readActual() {
  const read = file => fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), 'utf8') : '';
  const insights = JSON.parse(read('data/site.json')).insights, a = insights.find(x => x.slug === SLUG), photos = [...new Set([a?.image, ...(a?.body || []).map(b => b.img)].filter(x => IMAGE_PATHS.includes(x)))];
  return { insights, images: Object.fromEntries(photos.filter(f => fs.existsSync(path.join(ROOT, f))).map(f => [f, fs.readFileSync(path.join(ROOT, f))])), post: read(`posts/${SLUG}.html`), blog: read('blog.html'), rss: read('rss.xml'), sitemap: read('sitemap.xml'), index: JSON.parse(read('data/leak-case-index.json')) };
}
function fixture() {
  const old = Array.from({ length: 39 }, (_, i) => ({ slug: i ? `synthetic-${i}` : FEATURED })), image = 'assets/cases/synthetic-guide.jpg';
  const a = { slug: SLUG, date: DAY, category: '견적·계약 가이드', service: 'interior', title: '견적서 비교 안내', image, imageAlt: 'AI 편집본', body: [{ h: '안내', p: '실제 시공 후기가 아니며 만물이 작성한 계약서가 아닙니다.\n\nAI 편집 참고 자료입니다. 원본이나 제출용 문서가 아닙니다.' }], sourcesChecked: CHECKED, sources: [{ url: 'https://www.ftc.go.kr/example' }, { url: 'https://www.kca.go.kr/example' }] };
  return { insights: [old[0], a, ...old.slice(1)], images: { [image]: Buffer.from('synthetic-only') }, post: `<link rel="canonical" href="https://01023978629.github.io/manmool/posts/${SLUG}.html">${a.title} AI 편집 <img src="../${image}"><div class="post-cta"><a href="../index.html#inquiry"></a></div>${a.sources.map(x => `<a href="${x.url}"></a>`).join('')}`, blog: `<a class="insight-featured" href="posts/${FEATURED}.html"></a><a href="posts/${SLUG}.html" data-group="info"></a>`, index: { cases: [] }, rss: `/posts/${SLUG}.html`, sitemap: `/posts/${SLUG}.html`, oldHash: hash(old), expectedImages: [image] };
}
test('공개 안내 글·기존 38건 보존·AI 고지·연계', () => assert.deepEqual(inspect(readActual()), []));
test('합성 fixture 정상 계약', () => { const s = fixture(); assert.deepEqual(inspect(s, s.oldHash, s.expectedImages), []); });
test('합성 PNG: C2PA 보존, eXIf·GPS 차단', () => {
  const box = (type, b) => { const n = Buffer.alloc(4); n.writeUInt32BE(b.length + 8); return Buffer.concat([n, Buffer.from(type), b]); };
  const png = (type, text = 'x:xmpmeta', major = 3) => { const raw = Buffer.from(text), cbor = Buffer.concat([Buffer.from([(major << 5) | 24, raw.length]), raw]), b = box('jumb', box('cbor', cbor)), n = Buffer.alloc(4); n.writeUInt32BE(b.length); return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), n, Buffer.from(type), b, Buffer.alloc(4)]); };
  assert.equal(sensitiveMetadata(png('caBX')), false); assert.equal(sensitiveMetadata(png('eXIf')), true); assert.equal(sensitiveMetadata(Buffer.from('exif:GPSLatitude')), true);
  for (const text of ['reviewer@example.invalid', 'C:/synthetic-only/local.png', '37.12345,127.12345']) assert.equal(sensitiveMetadata(png('caBX', text)), true);
  const opaque = png('caBX', 'synthetic@example.invalid', 2); assert.equal(sensitiveMetadata(opaque), false); assert.equal(metadataStrings(opaque).binary.cborByteStrings, 1); assert.equal(sensitiveMetadata(opaque.subarray(0, -1)), true);
});
test('합성 변이: 민감정보·AI고지·원문 보존·분류·이미지', () => {
  const cases = [
    ['private-source', s => { s.insights[1].sourcePath = 'C:/synthetic-only/private.jpg'; }],
    ['private-prose', s => { s.insights[1].body[0].p += '\n\n금액 123,456원'; }],
    ['ai-disclosure', s => { s.insights[1].imageAlt = ''; s.insights[1].body[0].p = s.insights[1].body[0].p.replace('AI 편집', '참고'); }],
    ['document-usage', s => { s.insights[1].body[0].p = s.insights[1].body[0].p.replace('원본이나 제출용 문서가 아닙니다.', '참고 자료입니다.'); }],
    ['preservation', s => { s.insights[0].title = 'changed'; }],
    ['leak-index', s => s.index.cases.push({ slug: SLUG })],
    ['image-metadata', s => { s.images[s.expectedImages[0]] = Buffer.from('Exif\0\0'); }],
    ['unsupported-claim', s => { s.insights[1].body[0].p += '\n\n실제 시공 후기입니다.'; }],
  ];
  for (const [expected, change] of cases) { const s = fixture(); change(s); assert.ok(inspect(s, s.oldHash, s.expectedImages).includes(expected), expected); }
});
