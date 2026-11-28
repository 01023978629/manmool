// 2026-11-18 photo case (1, second batch of the day): two roof drains and one front-balcony rain-pipe base at the Taesan Green
// apartments in Yongam-dong, Sangdang-gu, Cheongju (2026-11-13, leak). On the roof the rusty cast-iron drain covers were
// removed, new white drain bodies set and the surrounds filled; on the balcony the floor tile around the rain-pipe base was cut
// out and a new white base part fitted. Public case content only: no field database, accounts or external writes.
// The 91 entries before it are pinned as one object (origin/main e3e888f, PR #236 merge). It sits at its date position: after
// the 11/14 Yeolmae entry and right before the 11/12 Munchang entry. It is older than the 11/17 Saeyeoul case, so the featured
// slot and the blog/leak lastmod stay as they are. As a leak case it gets a leak landing card (after the 11/16 Samho card,
// count 45 -> 46) and a leak index entry; the index budget went from 10KB to 16KB with this entry (ensure-leak-case-index).
// Only the complex is public: no building/unit numbers, line, client (management office), cost, workers or location metadata.
// 2026-11-21: the Gwanpyeong-dong Heightsville window-side extension floor case (11-18, interior: insulation, heating pipe and
// screed; remaining work on a later visit) was added first (no existing entry changed): pinned set +1. It is the newest real
// case, so it takes the blog featured slot and the blog.html lastmod is 2026-11-18; as an interior case it gets no leak card or
// leak index entry, so leak.html keeps 2026-11-17 (the newest leak case). recent-cases-20261121 pins the 92 entries before it.
// 2026-11-25: the five newest cases (11/18 Heightsville, 11/17 Saeyeoul, 11/16 Samho front balcony, 11/14 Yeolmae bathtub area and
// 11/13 Taesan Green) were enriched in place (docs/case-enrich-20261125.md): excerpt, longer step text, one general-guidance
// section before the closing section, updated 2026-11-25 and readMin. Photos, dates, places, order and the other 88 entries did
// not change (checked by reverting only those five objects and getting the old pin back). The pinned hash was recomputed for the
// new text, and blog.html / leak.html / the five post lastmod values follow the edit day (updated).
// 2026-11-27: the Nangwol-dong (Dong-gu) Namdaejeon e-Pyeonhan Sesang 33-pyeong remodel case (11-27, interior: two bathrooms,
// wallpaper, vinyl flooring and lights, entrance sliding door, living-room tile wall, kitchen tall units and a built-in wardrobe)
// was added first (no existing entry changed): pinned set +1. It is the newest real case, so it takes the blog featured slot and
// blog.html lastmod is 2026-11-27; as an interior case it gets no leak card or leak index entry, so leak.html keeps 2026-11-25
// (the enriched leak cases). recent-cases-20261127 pins the 93 entries before it.
// 2026-11-27 (2): the Wolpyeong-dong (Seo-gu) Wolpyeong Town case (11-26, leak: rain-pipe base fittings replaced on the front
// and back verandas of two homes, four spots on one day) was added right after the 11/27 Namdaejeon entry at its date position
// (no existing entry changed): pinned set +1. The 11/27 case keeps the blog featured slot and blog.html lastmod stays 2026-11-27;
// as a leak case it gets the first leak landing card (count 46 -> 47) and a leak index entry, so leak.html lastmod is 2026-11-26.
// recent-cases-20261127-wolpyeong pins the 94 entries before it.
// 2026-11-28: on the owner's instruction the combined 11/26 Wolpyeong Town entry was split into one entry per home (first and
// second home, both 11-26, at the same date position): the combined entry was removed and two entries added (no other entry
// changed): pinned set +1. Its leak landing card was replaced by two cards at the front (count 47 -> 48);
// blog.html (2026-11-27) and leak.html (2026-11-26) lastmods are unchanged. The old URL is a noindex redirect page
// (scripts/post-redirects.json). recent-cases-20261127-wolpyeong now pins the two entries and the 94 entries before them.
// 2026-11-28: two cases from the same home at the Samsung apartments in Oryu-dong, Jung-gu (11/27 hot/cold water pipe
// replacement, 11/25 one rain-pipe base) were added at their date positions (no other entry changed). Their leak landing
// cards make the count 48 -> 50; leak.html lastmod 2026-11-26 -> 2026-11-27 (blog.html stays 2026-11-27).
// recent-cases-20261128-samsung pins the two entries and the 96 entries before them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findHidden, describeHidden } = require('../scripts/lib/hidden-terms.cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261118-taesan.json');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const slugs = fixture.cases.map(c => c.slug);
const previous = items => items.filter(a => !slugs.includes(a.slug));
// 2026-11-28 (fee wording): one sentence in two info posts (rainy-season-waterproof-check, bathroom-waterproof-signs) changed from the
// unconditional "점검과 방문 실측은 무료이니" to the FAQ wording (first site visit free; leak detection paid from equipment start), PR #231.
// This edits pinned entries, so the count stays and only the fixture previousHash was re-pinned (the old value was first reproduced
// from origin/main 9d3cb6c with the same selection). Nothing else changed; scripts/ensure-fee-honesty.mjs now guards unconditional '무료'.
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
// Neighbours at the date position (list and leak landing cards) and the featured case that does not change.
const BEFORE = 'yeolmae-bathtub-area-waterproof-floor-screed-20261114', AFTER = 'munchang-heating-manifold-valve-replacement-20261112';
const CARD_BEFORE = 'samho-front-balcony-rain-pipe-waterproof-20261116';
const FEATURED = 'nangwol-namdaejeon-epyeonhan-33py-remodel-20261127';  // 2026-11-27: was the 11/18 Heightsville case; 2026-11-21: was the 11/17 Saeyeoul case

test('the 91 entries before this case keep their object and order; date position; mutation guards active', () => {
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
  // Date position: every entry before it is newer, every entry after it is older; exact neighbours as at origin/main.
  const at = insights.findIndex(a => a.slug === slugs[0]), day = fixture.cases[0].date;
  assert.ok(at > 0 && insights.slice(0, at).every(a => a.date > day), slugs[0]);
  assert.ok(insights.slice(at + 1).every(a => a.date < day), slugs[0]);
  assert.equal(insights[at - 1].slug, BEFORE);
  assert.equal(insights[at + 1].slug, AFTER);
  // Older than the 11/17 case, so the featured (first real) case does not change.
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, FEATURED);
});

test('one case: 9 photos, work date, leak service, conservative public copy and discovery links', () => {
  assert.equal(fixture.cases.length, 1);
  assert.equal(fixture.photos.length, 9);
  assert.equal(new Set(fixture.photos.map(p => p.file)).size, 9);
  const leak = read('leak.html'), blog = read('blog.html'), rss = read('rss.xml');
  const index = JSON.parse(read('data/leak-case-index.json'));
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.ok(a, c.slug);
    assert.equal(site.insights.filter(x => x.slug === c.slug).length, 1, c.slug);
    assert.equal(a.published, true);
    assert.equal(a.date, c.date);
    assert.ok(c.shootingDates.includes(a.date) && c.slug.endsWith(a.date.replaceAll('-', '')), c.slug);
    assert.equal(a.service, c.service);
    assert.equal(a.category, c.category);
    assert.equal(serviceOf(a), c.service);
    assert.ok(a.title.startsWith('청주 용암동 태산그린아파트 ') && a.title.includes('｜') && a.title.length <= 65, c.slug);
    assert.equal(a.place.name, c.placeName);
    assert.match(a.place.note, /공개하지 않습니다/);
    const figures = a.body.filter(b => b.img);
    assert.equal(figures.length, c.photoCount);
    assert.ok(a.excerpt.includes('실제 사진 ' + c.photoCount + '장'), c.slug);
    assert.ok(a.body.at(-1).h.endsWith('확인한 범위와 상담 안내') && !a.body.at(-1).img, c.slug);
    a.body.forEach((b, n) => assert.ok(b.h.startsWith((n + 1) + '. '), b.h));
    assert.ok(figures.some(b => b.img === a.image) && a.imageAlt === figures.find(b => b.img === a.image).imgAlt, c.slug + ' cover');
    for (const b of figures) {
      assert.ok(b.imgAlt && b.imgCaption, b.img);
      assert.ok(fixture.photos.some(p => p.file === b.img), b.img);
    }
    // Photos appear in the fixture order: roof drain 1 (before, during, after), roof drain 2, front-balcony rain pipe.
    assert.deepEqual(figures.map(b => b.img), fixture.photos.map(p => p.file), c.slug);
    const text = JSON.stringify(a);
    // 협력사·작업자 이름 등은 글자로 두지 않고 sha256 으로 대조한다(scripts/lib/hidden-terms.cjs, 2026-11-25).
    { const hidden = findHidden(text, 'partners', 'people', 'taesanUnit'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    // No unit numbers, customer data, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
    assert.doesNotMatch(text, /\d+\s*동\s*\d+\s*호|\d{3,4}\s*호|(?:로|길)\s*\d+|번길|sourcePath|driveId|GPS|좌표|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|010[- ]?\d|@[\w.-]+\.[A-Za-z]{2,}/);
    // No building number, line or unit from the work notes (the numbers are matched by hash above), and no client (management office).
    assert.doesNotMatch(text, /\d\s*라인|라인|관리사무소|관리소|입주자/);
    // No cost, estimate, client or partner company, worker, product brand or unverified cause/performance claims.
    assert.doesNotMatch(text, /\d{1,3}(,\d{3})+\s*원|만\s*원|견적번호|견적서|발주|작업자|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과|원인은|누수 원인|해결|하자/i);
    // The complex is in Cheongju; no other city name.
    assert.doesNotMatch(text, /대전|세종|공주|천안|논산/);
    // Not written as a finished building project, and what the photos do not show is said plainly instead of guessed.
    assert.doesNotMatch(text, /완공|공사 완료|마감 완료|시공 완료/);
    assert.match(a.caseSummary.result, /미기재/);
    // 2026-11-25 enrichment (docs/case-enrich-20261125.md): one general-guidance section sits right before the closing section.
    // It has no photo and says in its first sentence that it is not a record of this site; the entry carries the edit day.
    { const guide = a.body.at(-2);
      assert.equal(a.updated, '2026-11-25', c.slug);
      assert.ok(/^\d+\. 알아 두면 좋은 점/.test(guide.h) && !guide.img, c.slug);
      assert.ok(guide.p.startsWith('아래는 이 현장에서 확인한 내용이 아니라, ') && /일반적으로 정리한 것입니다/.test(guide.p), c.slug);
      assert.equal(a.body.filter(b => /알아 두면 좋은 점/.test(b.h)).length, 1, c.slug); }
    assert.match(a.body.at(-1).p, /자료가 없어 적지 않았습니다/);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope && a.caseSummary, c.slug);
    assert.match(a.consultation.scope, /최종 범위와 금액은 현장 확인 후 안내합니다/);
    for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key].trim(), c.slug + ' ' + key);
    assert.ok(a.relatedSlugs.length >= 2 && new Set(a.relatedSlugs).size === a.relatedSlugs.length, c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false && r !== a.slug, r);
      assert.equal(serviceOf(related), a.service, r);
    }
    // Discovery: list card in the leak group, RSS, sitemap (lastmod = work date), leak index entry and one landing card.
    assert.match(blog, new RegExp(`<a class="insight-card" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"`));
    assert.ok(rss.includes(`/posts/${c.slug}.html`), 'rss ' + c.slug);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.updated || a.date);  // 2026-11-25: enriched posts carry updated (docs/case-enrich-20261125.md)
    assert.equal(index.cases.filter(x => x.slug === c.slug).length, 1, 'leak index ' + c.slug);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    for (const b of figures) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    assert.ok(cta.includes(`href="../leak.html?case=${c.slug}#leakInquiry"`), c.slug);
  }
  // Leak landing: count 45 -> 46; the card sits at its date position, right after the 11/16 Samho card and before the 11/12
  // Munchang card, and appears once. It uses this case's own cover photo and title.
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 50);  // 2026-11-27: 46 -> 47 (11/26 Wolpyeong Town card), 2026-11-28: 47 -> 48 (the combined card replaced by the two per-home cards), 2026-11-28 (2): 48 -> 50 (11/27 Oryu-dong Samsung pipe card first, 11/25 rain-pipe card after the 11/26 cards)
  const cards = leakCardSlugs(leak), k = cards.indexOf(slugs[0]);
  assert.equal(cards.filter(s => s === slugs[0]).length, 1);
  assert.equal(cards[k - 1], CARD_BEFORE);
  assert.equal(cards[k + 1], AFTER);
  const a = site.insights.find(x => x.slug === slugs[0]);
  const card = leak.match(new RegExp(`<article class="case-card registered-case">\\s*<a class="case-photo-pair" href="posts/${slugs[0]}\\.html"[\\s\\S]*?</article>`))[0];
  assert.ok(card.includes(`src="${a.image}"`) && card.includes(`<h3>${a.title}</h3>`) && card.includes(`alt="${a.imageAlt}"`));
  assert.ok(card.includes(`${a.place.name} · ${a.date} 촬영`));
  // The featured slot stays with the 11/17 case; blog/leak lastmod stays at the newest public post date.
  assert.match(blog, new RegExp(`insight-featured[^>]*href="posts/${FEATURED}\\.html"`));
  // 2026-11-21: blog.html follows the newest post (11/18 Heightsville, interior); leak.html keeps the newest leak case (11/17).
  // 2026-11-25: five recent posts were enriched (updated 2026-11-25), so blog.html and leak.html both follow that edit day.
  // 2026-11-27: blog.html follows the newest post (11/27 Nangwol-dong Namdaejeon e-Pyeonhan, interior); leak.html keeps 2026-11-25.
  // 2026-11-27 (2): leak.html follows the newest leak case (11/26 Wolpyeong Town); blog.html stays 2026-11-27 (11/27 Namdaejeon).
  for (const page of ['blog.html', 'leak.html']) assert.equal(sitemapLastmod(page), page === 'blog.html' ? '2026-11-27' : '2026-11-27', page);  // 2026-11-28 (2): leak.html follows the newest leak case (11/27 Oryu-dong Samsung pipe)
  // The leak index stays under the inquiry-form budget (10KB -> 16KB with this entry).
  assert.ok(fs.statSync(path.join(root, 'data/leak-case-index.json')).size < 16 * 1024);
});

test('public photo copies unchanged, long side as pinned (≤1600px), only a JFIF header (no EXIF/GPS/XMP), small-screen variants', () => {
  for (const p of fixture.photos) {
    const bytes = fs.readFileSync(path.join(root, p.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), p.sha256, p.file);
    assert.ok(p.longSide <= 1600, p.file);
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
        // APP0 (JFIF) only: no APP1 EXIF/XMP, APP2 ICC, APP11 JUMBF/C2PA, APP13 IPTC or any other application segment.
        if (marker >= 0xe0 && marker <= 0xef) assert.equal(marker, 0xe0, file + ': APP' + (marker - 0xe0));
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
