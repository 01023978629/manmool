// 2026-11-27 photo case (1): a 33-pyeong apartment remodel at the Namdaejeon e-Pyeonhan Sesang apartments in Nangwol-dong,
// Dong-gu, Daejeon (2026-11-27, interior). Master bathroom: bathtub removed, wavy (aqua) glass partition, bathroom heater;
// second bathroom tiles, wall-hung basin, lit mirror cabinet and partition; wallpaper, vinyl flooring and lights; a three-panel
// entrance sliding door with frosted glass, entrance floor tiles and shoe-cabinet wrapping; a 600x1200 tile feature wall; kitchen
// tall units and a built-in wardrobe. Public case content only: no field database, accounts or external writes.
// The owner approved the draft in the case folder (insights-entry.json, published:false); only published was set to true, and the
// whole entry is pinned (entryHash) so the approved wording cannot drift. The brand names '한샘' and '휴젠트' are owner-approved;
// the floor is vinyl (장판, not wood 마루), and wallpaper and lights are owner-confirmed.
// The 93 entries before it are pinned as one object (origin/main 4fdd80c, PR #244 merge). It is the newest entry, so it leads the
// list and takes the blog featured slot (interior group); blog.html lastmod is 2026-11-27. As an interior case it gets no leak
// landing card and no leak index entry, and leak.html keeps 2026-11-25 (the enriched leak cases).
// Only the dong and complex name are public: no building/unit numbers, road address, customer, cost, partner company, workers or
// location metadata. It is registered under Dong-gu in scripts/post-areas.json; Dong-gu has fewer than 3 cases, so no area page.
// 2026-11-27 (2): the Wolpyeong-dong (Seo-gu) Wolpyeong Town case (11-26, leak: rain-pipe base fittings on the front and back
// verandas of two homes) was added right after this case at its date position (no existing entry changed): pinned set +1
// (94). This case still leads the list and keeps the featured slot and blog.html lastmod 2026-11-27; the new leak landing card
// makes the count 47 and leak.html lastmod 2026-11-26. recent-cases-20261127-wolpyeong pins the 94 entries before that case.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findHidden, describeHidden } = require('../scripts/lib/hidden-terms.cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261127.json');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const slugs = fixture.cases.map(c => c.slug);
const previous = items => items.filter(a => !slugs.includes(a.slug));
const preserved = items => previous(items).length === fixture.previousCount && hash(previous(items)) === fixture.previousHash;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sitemapLastmod = page => (read('sitemap.xml').match(new RegExp(
  `<loc>https://01023978629\\.github\\.io/manmool/${page}</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1];
const serviceOf = a => Object.hasOwn(a, 'service')
  ? (a.service === 'leak' ? 'leak' : 'interior')
  : (['방수·설비', '누수탐지·수리'].includes(a.category) ? 'leak' : 'interior');
// The entry that led the list before this case (it held the featured slot until now).
const NEXT = 'heightsville-extension-floor-heating-screed-20261118';
// 2026-11-27 (2): the 11/26 Wolpyeong Town leak case now sits right after this case, before NEXT — recent-cases-20261127-wolpyeong.
const OLDER_LEAK = 'wolpyeong-town-two-homes-veranda-rain-pipe-fitting-20261126';
const PLACE = '대전 동구 낭월동 남대전 이편한세상아파트';
// No building/unit numbers, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
const LOCATION = /\d+\s*동(?![가-힣])|\d+\s*호(?![가-힣])|\d+\s*동\s*\d+\s*호|\d+\s*층|[가-힣]\d{1,3}(?:로|길)(?![가-힣])|(?:로|길)\s*\d+|번길|번지|sourcePath|driveId|GPS|좌표|위도|경도|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|01[016789][- .]?\d{3,4}[- .]?\d{4}|\d{2,3}-\d{3,4}-\d{4}|@[\w.-]+\.[A-Za-z]{2,}/;
// No customer names or honorifics, cost, budget, estimate numbers, client or partner companies, workers, or unverifiable claims.
const PRIVATE = /고객님|사장님|사모님|[가-힣]{2,3}\s?씨(?![가-힣])|\d[\d,.]*\s*(?:천|만|억)\s*원|\d{1,3}(?:,\d{3})+\s*원|\d+\s*원(?![가-힣])|₩|평당|예산|견적번호|견적서|발주|작업자|협력\s*업체|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과/;
const textOf = a => JSON.stringify(a);

test('the 94 entries outside this case keep their object and order; newest first; mutation guards active', () => {
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
  // Newest entry: first in the list, every other entry is older, and the previous first entry follows it.
  assert.equal(insights[0].slug, slugs[0]);
  assert.ok(insights.slice(1).every(a => a.date < fixture.cases[0].date));
  assert.equal(insights[1].slug, OLDER_LEAK);  // 2026-11-27 (2): was NEXT
  assert.equal(insights[2].slug, NEXT);
  // It is the newest real case (caseSummary), so it is the featured case.
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, slugs[0]);
});

test('one case: owner-approved entry as written, 12 photos, interior service, place wording and no private data', () => {
  assert.equal(fixture.cases.length, 1);
  assert.equal(fixture.photos.length, 12);
  assert.equal(new Set(fixture.photos.map(p => p.file)).size, 12);
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.ok(a, c.slug);
    assert.equal(site.insights.filter(x => x.slug === c.slug).length, 1, c.slug);
    assert.equal(a.published, true);
    // The approved draft with only published:true — wording, photo order and captions are exactly as approved.
    assert.equal(hash(a), fixture.entryHash, c.slug + ' approved entry changed');
    assert.equal(a.date, c.date);
    assert.ok(c.slug.endsWith(a.date.replaceAll('-', '')), c.slug);
    assert.equal(a.service, c.service);
    assert.equal(a.category, c.category);
    assert.equal(serviceOf(a), c.service);
    // Place: dong and complex name only, at the start of the title, excerpt and first section.
    assert.equal(a.place.name, c.placeName);
    assert.equal(c.placeName, PLACE);
    assert.match(a.place.note, /공개하지 않습니다/);
    assert.ok(a.title.startsWith(PLACE + ' ') && a.title.includes('｜') && a.title.length <= 65, c.slug);
    assert.ok(a.excerpt.startsWith(PLACE + ' '), c.slug);
    assert.ok(a.body[0].p.startsWith(PLACE + ' '), c.slug);
    assert.ok(a.caseSummary.site.startsWith('남대전 이편한세상아파트 '), c.slug);
    const text = textOf(a);
    assert.equal((text.match(/이편한세상/g) || []).length, (text.match(/남대전 이편한세상아파트/g) || []).length);
    assert.equal((text.match(/낭월동/g) || []).length, (text.match(/대전 동구 낭월동 남대전 이편한세상아파트/g) || []).length);
    // Partner/contractor and worker names are matched by sha256 (scripts/lib/hidden-terms.cjs), never written as text here.
    { const hidden = findHidden(text, 'partners', 'people'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    assert.doesNotMatch(text, LOCATION);
    assert.doesNotMatch(text, PRIVATE);
    // Owner-confirmed facts: the floor is vinyl (장판), not wood flooring (마루); wallpaper and lights were redone.
    assert.match(a.title, /장판/);
    assert.doesNotMatch(text, /마루/);
    assert.match(a.caseSummary.work, /도배/);
    assert.match(a.caseSummary.work, /전등/);
    // Owner-approved brands only where the draft names them (kitchen units, built-in wardrobe, bathroom heater).
    assert.match(a.caseSummary.work, /주방 한샘 키친장/);
    assert.match(a.caseSummary.work, /안방 한샘 붙박이장/);
    assert.match(a.caseSummary.work, /욕실 온풍기\(휴젠트\)/);
    // Cost and duration are left out on purpose.
    assert.match(a.caseSummary.result, /공사 기간·금액은 적지 않음/);
    const figures = a.body.filter(b => b.img);
    assert.equal(figures.length, c.photoCount);
    a.body.forEach((b, n) => assert.ok(b.h.startsWith((n + 1) + '. '), b.h));
    assert.ok(figures.some(b => b.img === a.image) && a.imageAlt, c.slug + ' cover');
    for (const b of figures) {
      assert.ok(b.imgAlt && b.imgCaption, b.img);
      assert.ok(fixture.photos.some(p => p.file === b.img), b.img);
    }
    assert.deepEqual(figures.map(b => b.img), fixture.photos.map(p => p.file), c.slug);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope && a.caseSummary, c.slug);
    assert.match(a.consultation.scope, /현장 확인 후 범위와 금액을 안내합니다/);
    for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key].trim(), c.slug + ' ' + key);
    assert.ok(a.relatedSlugs.length >= 2 && new Set(a.relatedSlugs).size === a.relatedSlugs.length, c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false && r !== a.slug, r);
      assert.equal(serviceOf(related), a.service, r);
    }
    // Mutation guards: the patterns above really catch a unit number, a phone number and a price.
    for (const extra of ['101동 1203호', '010-1234-5678', '350만 원', '2,500,000원']) {
      const copy = structuredClone(a); copy.body[0].p += ' ' + extra;
      assert.ok(LOCATION.test(textOf(copy)) || PRIVATE.test(textOf(copy)), extra);
      assert.notEqual(hash(copy), fixture.entryHash, extra);
    }
  }
});

test('discovery: featured interior card, RSS, sitemap, Dong-gu area entry without a page, no leak card or index entry', () => {
  const leak = read('leak.html'), blog = read('blog.html'), rss = read('rss.xml');
  const index = JSON.parse(read('data/leak-case-index.json'));
  const areas = JSON.parse(read('scripts/post-areas.json'));
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.match(blog, new RegExp(`<a class="insight-featured" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"`));
    assert.ok(rss.includes(`/posts/${c.slug}.html`), 'rss ' + c.slug);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.updated || a.date);
    assert.equal(index.cases.some(x => x.slug === c.slug), false, 'leak index ' + c.slug);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    // Area: written as '대전 동구 … 낭월동', so it is registered; Dong-gu has fewer than 3 cases, so no area page or link.
    assert.deepEqual(areas[c.slug], { gu: c.gu, dong: c.dong });
    assert.ok(Object.values(areas).filter(x => x.gu === c.gu).length < 3);
    assert.equal(fs.existsSync(path.join(root, 'area/daejeon-dong-gu.html')), false);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(!html.includes('../area/'), 'no area link ' + c.slug);
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    assert.ok(html.includes(`<link rel="canonical" href="https://01023978629.github.io/manmool/posts/${c.slug}.html"`));
    for (const b of a.body.filter(b => b.img)) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    assert.ok(cta.includes('href="../index.html#estimator"') && cta.includes('href="../index.html#inquiry"') && !cta.includes('leak.html'), c.slug);
  }
  // Exactly one featured card; the previous featured case is a normal card now. The leak landing card count stays 46.
  // 2026-11-27 (2): 46 -> 47 — the 11/26 Wolpyeong Town leak case adds the first landing card (this case still has none).
  assert.equal((blog.match(/class="insight-featured"/g) || []).length, 1);
  assert.match(blog, new RegExp(`<a class="insight-card" href="posts/${NEXT}\\.html"`));
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 47);  // 2026-11-27: 46 -> 47 (11/26 Wolpyeong Town card)
  // blog.html follows the newest post (this case); leak.html keeps the newest leak case edit day (2026-11-25).
  const day = a => a.updated || a.date, newest = items => items.map(day).sort().at(-1);
  assert.equal(sitemapLastmod('blog.html'), newest(site.insights.filter(a => a.published !== false)));
  assert.equal(sitemapLastmod('leak.html'), newest(site.insights.filter(a => a.published !== false && serviceOf(a) === 'leak')));
  assert.equal(sitemapLastmod('blog.html'), '2026-11-27');
  assert.equal(sitemapLastmod('leak.html'), '2026-11-26');  // 2026-11-27 (2): the 11/26 Wolpyeong Town leak case (was 2026-11-25)
  assert.ok(fs.statSync(path.join(root, 'data/leak-case-index.json')).size < 16 * 1024);
});

test('public photo copies unchanged, long side as pinned, only a JFIF header (no EXIF/GPS/XMP), small-screen variants', () => {
  for (const p of fixture.photos) {
    const bytes = fs.readFileSync(path.join(root, p.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), p.sha256, p.file);
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
