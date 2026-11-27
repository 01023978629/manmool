// 2026-11-28 photo cases: two posts from the same home at the Samsung apartments in Oryu-dong, Jung-gu, Daejeon (leak):
//  1. samsung-apt-water-pipe-full-replacement-20261127 — hot/cold water pipes replaced across the home (photos 11/24, 11/25,
//     11/27): flooring strip lifted along the walls, floor chased, old pipe exposed, new pipe laid, wall section and meter box
//     joined, faucets fitted, chase filled with mortar. Published before the remaining finishing work, on the owner's word.
//  2. oryu-samsung-apt-rain-pipe-base-fitting-20261125 — one rain pipe in the same home (11/25): the black toothed base part at
//     the floor, the pipe lifted out, a white square base set in the floor inlet, the pipe stood back in a white base part.
//     The owner asked for the rain pipe to be its own case, so the pipe post carries no rain-pipe text or photo at all, and the
//     rain-pipe post does not say where in the home it is (the owner did not say).
// Each is the owner-side draft in its case folder (insights-entry.json, published:false) with only published set to true, pinned
// whole (entryHash). The pipe post's related posts are left as drafted (they do not include the rain-pipe post); the rain-pipe
// post links to the pipe post.
// Owner rule kept from the earlier leak posts: the word '방수' appears nowhere in their own public text — only the site category
// name '방수·설비' (category field and the rendered category labels).
// The 96 entries before them are pinned as one object (unchanged since 82dc5c1, PR #247 head). The pipe post (11/27) sits right
// after the 11/27 Namdaejeon e-Pyeonhan entry (which keeps the blog featured slot and blog.html lastmod 2026-11-27) and before
// the 11/26 Wolpyeong Town posts; the rain-pipe post (11/25) sits after them and before the 11/18 Heightsville entry. As leak
// cases they get leak landing cards (count 48 -> 50: the pipe card first, the rain-pipe card after the two 11/26 cards) and
// leak index entries; leak.html lastmod 2026-11-26 -> 2026-11-27.
// Only the dong and complex name are public: no building/unit numbers, road address, customer, cost, partner company, workers or
// location metadata. Both are registered under Jung-gu (Oryu-dong) in scripts/post-areas.json, so the Jung-gu area page lists
// them (5 -> 7 cases) and its sitemap lastmod becomes 2026-11-27.
// Public case content only: no field database, accounts or external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findHidden, describeHidden } = require('../scripts/lib/hidden-terms.cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261128-samsung.json');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const slugs = fixture.cases.map(c => c.slug);
const [PIPE, RAIN] = slugs;
const previous = items => items.filter(a => !slugs.includes(a.slug));
const preserved = items => previous(items).length === fixture.previousCount && hash(previous(items)) === fixture.previousHash;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sitemapLastmod = page => (read('sitemap.xml').match(new RegExp(
  `<loc>https://01023978629\\.github\\.io/manmool/${page}</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1];
const serviceOf = a => Object.hasOwn(a, 'service')
  ? (a.service === 'leak' ? 'leak' : 'interior')
  : (['방수·설비', '누수탐지·수리'].includes(a.category) ? 'leak' : 'interior');
const leakCardSlugs = leak => {
  const start = leak.search(/<section\b[^>]*\bid="cases"/);
  const section = leak.slice(start, leak.indexOf('</section>', start));
  return [...section.matchAll(/<article\b[^>]*class="case-card registered-case"[^>]*>[\s\S]*?<\/article>/g)]
    .map(m => (m[0].match(/href="posts\/([^"]+)\.html"/) || [])[1]);
};
// Neighbours at the date positions (list) and on the leak landing page; the featured case that does not change.
const NAMDAEJEON = 'nangwol-namdaejeon-epyeonhan-33py-remodel-20261127';
const WOLPYEONG = ['wolpyeong-town-first-home-veranda-rain-pipe-fitting-20261126', 'wolpyeong-town-second-home-veranda-rain-pipe-fitting-20261126'];
const HEIGHTSVILLE = 'heightsville-extension-floor-heating-screed-20261118';
const SAEYEOUL = 'saeyeoul-toilet-drain-pipe-insert-20261117';
const FEATURED = NAMDAEJEON;
const RELATED = {
  [PIPE]: ['yongjeon-apartment-water-pipe-replacement-20261019', 'munhwa-samsung-wall-pipe-partial-replacement-20260818'],
  [RAIN]: [PIPE, 'samho-balcony-rain-pipe-base-replacement-20261110'],
};
const PLACE = '대전 중구 오류동 삼성아파트';
// The owner's rule for leak posts: no '방수' in their own public text. The category name '방수·설비' is the only allowed form.
const HIDDEN_WORD = /방수/;
const CATEGORY_LABEL = /방수·설비/g;
// The owner split the rain pipe off into its own case: no rain-pipe word in the pipe post's own text or page.
const RAIN_WORD = /우수관/;
// The owner did not say where in the home the rain pipe is: the rain-pipe post names no room.
const ROOM = /베란다|발코니|세탁실|세탁기|다용도실|욕실|주방|거실|안방/;
const ownText = a => { const { category, ...rest } = a; return JSON.stringify(rest); };
const withoutCategory = html => html.replace(CATEGORY_LABEL, '');
// No building/unit numbers, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
const LOCATION = /\d+\s*동(?![가-힣])|\d+\s*호(?![가-힣])|\d+\s*동\s*\d+\s*호|\d+\s*층|\d\s*라인|[가-힣]\d{1,3}(?:로|길)(?![가-힣])|(?:로|길)\s*\d+|번길|\d+\s*번지|sourcePath|driveId|GPS|좌표|위도|경도|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|01[016789][- .]?\d{3,4}[- .]?\d{4}|\d{2,3}-\d{3,4}-\d{4}|@[\w.-]+\.[A-Za-z]{2,}/;
// No customer names or honorifics, cost, budget, estimate numbers, client or partner companies, workers, or unverifiable claims.
const PRIVATE = /고객님|사장님|사모님|[가-힣]{2,3}\s?씨(?![가-힣])|\d[\d,.]*\s*(?:천|만|억)\s*원|\d{1,3}(?:,\d{3})+\s*원|\d+\s*원(?![가-힣])|₩|평당|예산|견적번호|견적서|발주|작업자|협력\s*업체|관리사무소|관리소|100%|평생 보증|최저가|무조건|업계 1위|완벽|원인은|누수 원인|해결|하자|완공|공사 완료|시공 완료|보증/;

test('the 96 entries before these cases keep their object and order; date positions; featured case unchanged; mutation guards active', () => {
  assert.equal(site.insights.length, fixture.previousCount + slugs.length);
  assert.ok(preserved(site.insights));
  const { insights, ...rest } = site;
  assert.equal(hash(rest), fixture.otherDataHash);
  const rss = read('rss.xml');
  assert.equal((rss.match(/<item>/g) || []).length, insights.filter(a => a.published !== false).length);
  for (const a of insights.filter(a => a.published !== false)) assert.ok(rss.includes('/posts/' + a.slug + '.html'), a.slug);
  const i = insights.findIndex((a, k) => !slugs.includes(a.slug) && insights[k + 1] && !slugs.includes(insights[k + 1].slug));
  const changed = structuredClone(insights); changed[i].body[0].p += 'mutation';
  assert.ok(!preserved(changed));
  assert.ok(!preserved(insights.filter((_, k) => k !== i)));
  const reordered = structuredClone(insights); [reordered[i], reordered[i + 1]] = [reordered[i + 1], reordered[i]];
  assert.ok(!preserved(reordered));
  assert.equal(new Set(slugs).size, 2);
  // Date positions: the list stays newest first; exact neighbours as drafted.
  for (const c of fixture.cases) {
    const at = insights.findIndex(a => a.slug === c.slug);
    assert.ok(insights.slice(0, at).every(a => a.date >= c.date), c.slug);
    assert.ok(insights.slice(at + 1).every(a => a.date <= c.date), c.slug);
  }
  const p = insights.findIndex(a => a.slug === PIPE), r = insights.findIndex(a => a.slug === RAIN);
  assert.equal(p, 1);
  assert.equal(insights[p - 1].slug, NAMDAEJEON);
  assert.deepEqual(insights.slice(p + 1, p + 3).map(a => a.slug), WOLPYEONG);
  assert.equal(r, p + 3);
  assert.equal(insights[r + 1].slug, HEIGHTSVILLE);
  // Same date as the 11/27 case but after it, so the featured (first real) case does not change.
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, FEATURED);
});

test('two cases: owner-side drafts as written, photos, leak service, place wording, split rules, no private data', () => {
  assert.equal(fixture.cases.length, 2);
  const allPhotos = fixture.cases.flatMap(c => c.photos.map(p => p.file));
  assert.equal(allPhotos.length, 12);
  assert.equal(new Set(allPhotos).size, 12);
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.ok(a, c.slug);
    assert.equal(site.insights.filter(x => x.slug === c.slug).length, 1, c.slug);
    assert.equal(a.published, true);
    // The draft with only published:true — wording, photo order and captions are exactly as written.
    assert.equal(hash(a), c.entryHash, c.slug + ' entry changed');
    assert.equal(a.date, c.date);
    assert.ok(c.slug.endsWith(a.date.replaceAll('-', '')), c.slug);
    assert.equal(a.service, c.service);
    assert.equal(a.category, c.category);
    assert.equal(serviceOf(a), 'leak');
    // Place: gu, dong and complex name only. Every mention of the complex carries the dong.
    assert.equal(a.place.name, c.placeName);
    assert.equal(c.placeName, PLACE);
    assert.match(a.place.note, /공개하지 않습니다/);
    assert.ok(a.title.startsWith(PLACE + ' ') && a.title.includes('｜') && a.title.length <= 65, c.slug);
    assert.ok(a.excerpt.startsWith(PLACE + ' '), c.slug);
    assert.ok(a.body[0].p.startsWith(PLACE + ' '), c.slug);
    const text = JSON.stringify(a);
    assert.equal((text.match(/삼성아파트/g) || []).length, (text.match(/오류동 삼성아파트/g) || []).length, c.slug);
    // Owner rule: only the category name may carry the word.
    assert.doesNotMatch(ownText(a), HIDDEN_WORD);
    assert.equal(a.category, '방수·설비');
    // Partner/contractor and worker names are matched by sha256 (scripts/lib/hidden-terms.cjs), never written as text here.
    { const hidden = findHidden(text, 'partners', 'people'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    assert.doesNotMatch(text, LOCATION);
    assert.doesNotMatch(text, PRIVATE);
    // What the records do not show is said plainly instead of guessed.
    assert.match(a.body.at(-1).p, /자료가 없어 적지 않았습니다/);
    const figures = a.body.filter(b => b.img);
    assert.equal(figures.length, c.photoCount);
    assert.ok(a.excerpt.includes('사진 ' + c.photoCount + '장'), c.slug);
    a.body.forEach((b, k) => assert.ok(b.h.startsWith((k + 1) + '. '), b.h));
    // The cover is one of the post's own photos (the pipe draft words its cover alt a little longer than the figure alt).
    assert.ok(figures.some(b => b.img === a.image) && a.imageAlt && a.imageAlt.trim(), c.slug + ' cover');
    for (const b of figures) assert.ok(b.imgAlt && b.imgCaption, b.img);
    assert.deepEqual(figures.map(b => b.img), c.photos.map(p => p.file), c.slug);
    for (const b of a.body) for (const [, k] of (b.h + b.p).matchAll(/(\d+)번 사진/g)) assert.ok(Number(k) >= 1 && Number(k) <= figures.length, b.h);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope, c.slug);
    assert.match(a.consultation.scope, /현장 확인 후/);
    for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key].trim(), c.slug + ' ' + key);
    // Related posts as drafted: published leak posts, never itself.
    assert.deepEqual(a.relatedSlugs, RELATED[c.slug], c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false && r !== a.slug, r);
      assert.equal(serviceOf(related), 'leak', r);
    }
    // Mutation guards: the patterns above really catch the hidden word, a unit number, a phone number and a price.
    { const copy = structuredClone(a); copy.body[1].p += ' 방수'; assert.match(ownText(copy), HIDDEN_WORD); assert.notEqual(hash(copy), c.entryHash); }
    for (const extra of ['101동 1203호', '15층', '010-1234-5678', '350만 원', '2,500,000원']) {
      const copy = structuredClone(a); copy.body[0].p += ' ' + extra;
      assert.ok(LOCATION.test(JSON.stringify(copy)) || PRIVATE.test(JSON.stringify(copy)), extra);
      assert.notEqual(hash(copy), c.entryHash, extra);
    }
  }
  // Split rules: the pipe post says nothing about the rain pipe; the rain-pipe post names no room.
  const pipe = site.insights.find(a => a.slug === PIPE), rain = site.insights.find(a => a.slug === RAIN);
  assert.doesNotMatch(JSON.stringify(pipe), RAIN_WORD);
  assert.ok(!pipe.relatedSlugs.includes(RAIN));
  assert.doesNotMatch(JSON.stringify(rain), ROOM);
  assert.match(rain.title, RAIN_WORD);
  { const copy = structuredClone(pipe); copy.body[6].p += ' 우수관'; assert.match(JSON.stringify(copy), RAIN_WORD); }
  { const copy = structuredClone(rain); copy.body[0].p += ' 베란다'; assert.match(JSON.stringify(copy), ROOM); }
  // The pipe post covers three photo days and says the remaining finishing is not written; the rain pipe is one afternoon.
  assert.ok(pipe.excerpt.includes('11월 24·25·27일'));
  assert.match(pipe.caseSummary.result, /적지 않음/);
  assert.match(rain.caseSummary.result, /미기재/);
  assert.ok(rain.excerpt.includes('2026년 11월 25일'));
});

test('discovery: list cards, RSS, sitemap, leak index, leak landing cards, Jung-gu area page, links between the two posts', () => {
  const leak = read('leak.html'), blog = read('blog.html'), rss = read('rss.xml');
  const index = JSON.parse(read('data/leak-case-index.json'));
  const areas = JSON.parse(read('scripts/post-areas.json'));
  const area = read('area/daejeon-jung-gu.html');
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    const listCard = (blog.match(new RegExp(`<a class="insight-card" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"[\\s\\S]*?</a>`)) || [])[0];
    assert.ok(listCard, 'blog card ' + c.slug);
    assert.doesNotMatch(withoutCategory(listCard), HIDDEN_WORD);
    const item = (rss.match(new RegExp(`<item>(?:(?!</item>)[\\s\\S])*?/posts/${c.slug}\\.html[\\s\\S]*?</item>`)) || [])[0];
    assert.ok(item, 'rss ' + c.slug);
    assert.doesNotMatch(item, HIDDEN_WORD);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.updated || a.date);
    const entries = index.cases.filter(x => x.slug === c.slug);
    assert.equal(entries.length, 1, 'leak index ' + c.slug);
    assert.doesNotMatch(JSON.stringify(entries[0]), HIDDEN_WORD);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    // Area: written as '대전 중구 오류동', registered under Jung-gu; the Jung-gu page lists it and the post links back to it.
    assert.deepEqual(areas[c.slug], { gu: c.gu, dong: c.dong });
    const areaCard = (area.match(new RegExp(`<a class="insight-card" href="\\.\\./posts/${c.slug}\\.html"[\\s\\S]*?</a>`)) || [])[0];
    assert.ok(areaCard, 'area card ' + c.slug);
    assert.doesNotMatch(withoutCategory(areaCard), HIDDEN_WORD);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes('href="../area/daejeon-jung-gu.html"'), 'area link ' + c.slug);
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    assert.ok(html.includes(`<link rel="canonical" href="https://01023978629.github.io/manmool/posts/${c.slug}.html"`));
    assert.doesNotMatch(html, /name="robots"[^>]*noindex/);
    for (const b of a.body.filter(b => b.img)) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    assert.ok(cta.includes(`href="../leak.html?case=${c.slug}#leakInquiry"`), c.slug);
    // The post page: apart from the category labels and the related-post cards (other posts' own titles), no hidden word;
    // unit-number and phone patterns nowhere in the visible text either.
    const related = html.match(/<div class="post-related">[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(related, 'related block ' + c.slug);
    for (const r of a.relatedSlugs) assert.ok(related[0].includes(`href="${r}.html"`), r);
    const own = html.replace(related[0], '');
    assert.doesNotMatch(withoutCategory(own), HIDDEN_WORD);
    assert.doesNotMatch(own.replace(/<script\b[\s\S]*?<\/script>/g, ''), /\d+\s*동\s*\d+\s*호|\d{2,4}동(?![가-힣])|\d{3,4}호(?![가-힣])/);
    if (c.slug === PIPE) assert.doesNotMatch(own, RAIN_WORD);
    if (c.slug === RAIN) assert.doesNotMatch(own.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<nav\b[\s\S]*?<\/nav>/g, ''), /세탁실|세탁기|다용도실/);
  }
  // The rain-pipe page links to the pipe page; the pipe page's drafted related posts do not include the rain-pipe page.
  assert.ok(read(`posts/${RAIN}.html`).includes(`href="${PIPE}.html"`));
  // Area page: Jung-gu now 7 cases, the two newest first; lastmod follows the newest Jung-gu case (11/27).
  const jungLinked = [...area.matchAll(/<a class="insight-card" href="\.\.\/posts\/([^"]+)\.html"/g)].map(m => m[1]);
  assert.deepEqual(jungLinked.slice(0, 2), slugs);
  assert.equal(jungLinked.length, 7);
  assert.equal(sitemapLastmod('area/daejeon-jung-gu.html'), '2026-11-27');
  // Leak landing: count 48 -> 50; pipe card first, then the two 11/26 Wolpyeong cards, then the rain-pipe card, then 11/17 Saeyeoul.
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 50);
  const cards = leakCardSlugs(leak);
  assert.deepEqual(cards.slice(0, 5), [PIPE, ...WOLPYEONG, RAIN, SAEYEOUL]);
  for (const s of slugs) {
    assert.equal(cards.filter(x => x === s).length, 1);
    const a = site.insights.find(x => x.slug === s);
    const card = leak.match(new RegExp(`<article class="case-card registered-case">\\s*<a class="case-photo-pair" href="posts/${s}\\.html"[\\s\\S]*?</article>`))[0];
    assert.ok(card.includes(`src="${a.image}"`) && card.includes(`<h3>${a.title}</h3>`) && card.includes(`alt="${a.imageAlt}"`));
    assert.ok(card.includes(`<p>${a.excerpt}</p>`));
    assert.ok(card.includes(`<small>${a.place.name} · `), s);
    assert.doesNotMatch(card, HIDDEN_WORD);
    if (s === PIPE) { assert.ok(card.includes('2026-11-24·25·27 촬영')); assert.doesNotMatch(card, RAIN_WORD); }
    if (s === RAIN) { assert.ok(card.includes('2026-11-25 촬영')); assert.doesNotMatch(card, ROOM); }
  }
  // The featured slot stays with the 11/27 Namdaejeon case. blog.html and leak.html lastmods follow the newest post / leak case.
  assert.equal((blog.match(/class="insight-featured"/g) || []).length, 1);
  assert.match(blog, new RegExp(`<a class="insight-featured" href="posts/${FEATURED}\\.html"`));
  const day = x => x.updated || x.date, newest = items => items.map(day).sort().at(-1);
  assert.equal(sitemapLastmod('blog.html'), newest(site.insights.filter(x => x.published !== false)));
  assert.equal(sitemapLastmod('leak.html'), newest(site.insights.filter(x => x.published !== false && serviceOf(x) === 'leak')));
  assert.equal(sitemapLastmod('blog.html'), '2026-11-27');
  assert.equal(sitemapLastmod('leak.html'), '2026-11-27');
  assert.ok(fs.statSync(path.join(root, 'data/leak-case-index.json')).size < 16 * 1024);
});

test('public photo copies unchanged, long side as pinned, only a JFIF header (no EXIF/GPS/XMP), small-screen variants', () => {
  for (const p of fixture.cases.flatMap(c => c.photos)) {
    const bytes = fs.readFileSync(path.join(root, p.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), p.sha256, p.file);
    assert.doesNotMatch(p.file, /\d+동|\d{3,4}호/);
    for (const file of [p.file, ...[480, 960].map(w => p.file.replace('assets/cases/', 'assets/cases/resized/').replace('.jpg', '-' + w + 'w.jpg'))]) {
      const data = fs.readFileSync(path.join(root, file));
      const variant = file.includes('/resized/');
      assert.ok(variant ? data.length < bytes.length : data.length <= 480000, file);
      assert.equal(data[0], 0xff); assert.equal(data[1], 0xd8);
      let i = 2, size = null;
      while (i < data.length) {
        assert.equal(data[i++], 0xff, file);
        while (data[i] === 0xff) i++;
        const marker = data[i++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const len = data.readUInt16BE(i);
        assert.ok(len >= 2 && i + len <= data.length);
        // APP0 (JFIF) only: no APP1 EXIF/XMP, APP2 ICC, APP11 JUMBF/C2PA, APP13 IPTC or any other application segment; no comment.
        if (marker >= 0xe0 && marker <= 0xef) assert.equal(marker, 0xe0, file + ': APP' + (marker - 0xe0));
        assert.notEqual(marker, 0xfe, file + ': COM');
        if ([0xc0, 0xc1, 0xc2].includes(marker)) size = { h: data.readUInt16BE(i + 3), w: data.readUInt16BE(i + 5) };
        i += len;
      }
      assert.ok(size, file);
      if (!variant) assert.equal(Math.max(size.w, size.h), p.longSide, file);
      else assert.ok(size.w <= (file.endsWith('-480w.jpg') ? 480 : 960), file);
      assert.equal(data.indexOf(Buffer.from('Exif\0\0')), -1, file);
      assert.equal(data.indexOf(Buffer.from('http://ns.adobe.com/xap/')), -1, file);
    }
  }
});
