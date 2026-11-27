// 2026-11-17 photo cases (4): Saeyeoul toilet drain-pipe insert/sleeve (11-17, leak), Samho front-balcony rain pipe opened
// in the wall and filled with plaster (11-16, leak; painting is a separate later step), Yeolmae bathtub-area waterproof coating
// and partial floor screed (11-14, interior, work in progress) and Mokyang washbasin drain-pipe joint in the ceiling (11-10,
// leak). Public case content only: no field database, accounts or external writes. The 86 entries before them are pinned as
// one object (origin/main 4be5bf5, PR #233 merge). The three newest lead the list, so the 11/17 Saeyeoul case is the newest
// real case (blog featured slot, first leak landing card). The 11/10 Mokyang case sits at its date position after the 11/12
// cases and right before the earlier 11/10 batch (recent-cases-20261112), which stays together. The interior case gets no
// leak landing card and no leak index entry.
// 2026-11-18: the Gongju factory panel roof/wall case next to a container (11-09, interior) was added at its date position
// (no existing entry changed): pinned set +1; no leak card, leak index entry, featured or lastmod change.
// recent-cases-20261118 pins the 90 entries before it.
// 2026-11-18 (2): the Cheongju Yongam-dong Taesan Green roof-drain x2 + front-balcony rain-pipe case (11-13, leak) was added at
// its date position (no existing entry changed): pinned set +1, leak cards 45 -> 46 (its card sits after the 11/16 Samho card);
// no featured or lastmod change. recent-cases-20261118-taesan pins the 91 entries before it.
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
const fixture = require('./fixtures/recent-cases-20261117.json');
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
const leakCardSlugs = leak => {
  const start = leak.search(/<section\b[^>]*\bid="cases"/);
  const section = leak.slice(start, leak.indexOf('</section>', start));
  return [...section.matchAll(/<article\b[^>]*class="case-card registered-case"[^>]*>[\s\S]*?<\/article>/g)]
    .map(m => (m[0].match(/href="posts\/([^"]+)\.html"/) || [])[1]);
};
// The earlier 11/10 batch (recent-cases-20261112) starts with this entry; the new same-date case goes right before it.
const EARLIER_SAME_DAY = 'samho-balcony-rain-pipe-base-replacement-20261110';

test('the 86 entries before these cases keep their object and order; mutation guards active', () => {
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
  // The three newest entries lead the list in date order (each strictly newer than the next entry).
  // 2026-11-21: they now follow the 11/18 Heightsville case (recent-cases-20261121), so they start at index 1.
  // 2026-11-27: the 11/27 Nangwol-dong case (recent-cases-20261127) leads, then 11/18 Heightsville, so they start at index 2.
  // 2026-11-27 (2): the 11/26 Wolpyeong Town case (recent-cases-20261127-wolpyeong) sits after the 11/27 case, so they start at index 3.
  // 2026-11-28: that case is now two same-date entries (first and second home), so they start at index 4; the two 11/26 entries
  // share a date, every other step is strictly older.
  // 2026-11-28 (2): the 11/27 Oryu-dong Samsung pipe entry (same date as the 11/27 case) and the 11/25 rain-pipe entry come before
  // them too, so they start at index 6; the same-date pairs are the two 11/27 entries and the two 11/26 entries.
  assert.deepEqual(insights.slice(6, 9).map(a => a.slug), slugs.slice(0, 3));
  for (let k = 0; k < 9; k++) assert.ok(insights[k].date > insights[k + 1].date || ((k === 0 || k === 2) && insights[k].date === insights[k + 1].date), insights[k].slug);
  // The 11/10 case sits at its date position: after every newer entry, right before the earlier 11/10 batch.
  const m = insights.findIndex(a => a.slug === slugs[3]), day = fixture.cases[3].date;
  assert.ok(m > 6 && insights.slice(0, m).every(a => a.date > day), slugs[3]);  // 2026-11-27 (2): was m > 4; 2026-11-28: was m > 5
  assert.equal(insights[m + 1].slug, EARLIER_SAME_DAY);
  assert.equal(insights[m + 1].date, day);
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, 'nangwol-namdaejeon-epyeonhan-33py-remodel-20261127');  // 2026-11-27: was the 11/18 Heightsville case; 2026-11-21: was slugs[0] (the 11/17 Saeyeoul case)
});

test('four cases: 18 photos, work dates, service split, conservative public copy and discovery links', () => {
  assert.equal(fixture.cases.length, 4);
  assert.equal(fixture.photos.length, 18);
  assert.equal(new Set(fixture.photos.map(p => p.file)).size, 18);
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
    assert.ok(a.title.startsWith('대전 ') && a.title.includes('｜') && a.title.length <= 65, c.slug);
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
    // Photos appear in the fixture's (shooting) order.
    const own = fixture.photos.filter(p => figures.some(b => b.img === p.file)).map(p => p.file);
    assert.deepEqual(figures.map(b => b.img), own, c.slug);
    const text = JSON.stringify(a);
    // 협력사·작업자 이름 등은 글자로 두지 않고 sha256 으로 대조한다(scripts/lib/hidden-terms.cjs, 2026-11-25).
    { const hidden = findHidden(text, 'partners', 'people'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    // No unit numbers, customer data, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
    assert.doesNotMatch(text, /\d+\s*동\s*\d+\s*호|\d{3,4}\s*호|(?:로|길)\s*\d+|번길|sourcePath|driveId|GPS|좌표|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|010[- ]?\d|@[\w.-]+\.[A-Za-z]{2,}/);
    // No cost, estimate number, client or partner company, worker name, product brand or unverified cause/performance claims.
    assert.doesNotMatch(text, /\d{1,3}(,\d{3})+\s*원|만\s*원|견적번호|발주|서비스점|나비엔|경동|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과|원인은|누수 원인|해결/);
    // Not written as a finished job, and what the photos and notes do not show is said plainly instead of guessed.
    assert.doesNotMatch(text, /완공|공사 완료|마감 완료|시공 완료/);
    assert.match(a.caseSummary.result, /미기재/);
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
    // Discovery: list card in the right group, RSS, sitemap (lastmod = work date), leak index and landing card only for leak.
    const listClass = 'insight-card';  // 2026-11-21: slugs[0] was the featured card until the 11/18 Heightsville case
    assert.match(blog, new RegExp(`<a class="${listClass}" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"`));
    assert.ok(rss.includes(`/posts/${c.slug}.html`), 'rss ' + c.slug);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.updated || a.date);  // 2026-11-25: enriched posts carry updated (docs/case-enrich-20261125.md)
    assert.equal(index.cases.some(x => x.slug === c.slug), c.service === 'leak', 'leak index ' + c.slug);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    for (const b of figures) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    if (c.service === 'leak') assert.ok(cta.includes(`href="../leak.html?case=${c.slug}#leakInquiry"`), c.slug);
    else assert.ok(cta.includes('href="../index.html#estimator"') && cta.includes('href="../index.html#inquiry"') && !cta.includes('leak.html'), c.slug);
  }
  // Points the owner asked for in the 2026-11-17 review.
  const bySlug = s => site.insights.find(a => a.slug === s);
  // Saeyeoul: the pipe-insert (sleeve) step is written out; it has no photo, and the post says so instead of borrowing one.
  const saeyeoul = bySlug(slugs[0]), insert = saeyeoul.body.find(b => /배관 삽입/.test(b.h));
  assert.ok(insert && !insert.img && /삽입\(슬리브\)/.test(insert.p) && /사진을 남기지 못해 글로만 적습니다/.test(insert.p));
  assert.match(saeyeoul.caseSummary.work, /삽입\(슬리브\)/);
  // Samho: the last two photos show the plaster fill; painting is a separate later step and is never written as done.
  const samho = bySlug(slugs[1]), samhoText = JSON.stringify(samho);
  assert.ok(samho.body.filter(b => b.img).slice(-2).every(b => /미장/.test(b.imgAlt)));
  assert.match(samhoText, /페인트 마감은 따로 진행합니다/);
  assert.doesNotMatch(samhoText, /페인트[^.]{0,20}(?:칠했|칠을 마쳤|마감했|완료)/);
  // Yeolmae (interior): the screed dries before the next process, so the case reads as work in progress.
  // 2026-11-25: the general-guidance section now sits between the last photo section and the closing section, so this looks at the
  // last photo section instead of body.at(-2).
  assert.match(bySlug(slugs[2]).body.filter(b => b.img).at(-1).p, /다음 공정을 이어 갑니다/);
  // 2026-11-25 enrichment (docs/case-enrich-20261125.md): the three newest cases got one general-guidance section right before the
  // closing section. It has no photo and says in its first sentence that it is not a record of this site. The 11/10 Mokyang case
  // was not touched.
  for (const s of slugs.slice(0, 3)) {
    const a = bySlug(s), guide = a.body.at(-2);
    assert.equal(a.updated, '2026-11-25', s);
    assert.ok(/^\d+\. 알아 두면 좋은 점/.test(guide.h) && !guide.img, s);
    assert.ok(guide.p.startsWith('아래는 이 현장에서 확인한 내용이 아니라, ') && /일반적으로 정리한 것입니다/.test(guide.p), s);
    assert.equal(a.body.filter(b => /알아 두면 좋은 점/.test(b.h)).length, 1, s);
  }
  assert.ok(!Object.hasOwn(bySlug(slugs[3]), 'updated') && !bySlug(slugs[3]).body.some(b => /알아 두면 좋은 점/.test(b.h)));
  // The newest case takes the blog featured slot (2026-11-21: the 11/18 Heightsville case, no longer slugs[0]).
  assert.match(blog, new RegExp(`insight-featured[^>]*href="posts/nangwol-namdaejeon-epyeonhan-33py-remodel-20261127\\.html"`));  // 2026-11-27: was the 11/18 Heightsville case
  // Leak landing: card count pin 42 -> 45. The 11/17 and 11/16 cards come first; the 11/10 card sits at its date position,
  // right before the earlier 11/10 batch. No card for the interior case.
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 50);  // 2026-11-18: 45 -> 46 (11/13 Taesan card), 2026-11-27: 46 -> 47 (11/26 Wolpyeong Town card), 2026-11-28: 47 -> 48 (the combined card replaced by the two per-home cards), 2026-11-28 (2): 48 -> 50 (11/27 Oryu-dong Samsung pipe card first, 11/25 rain-pipe card after the 11/26 cards)
  const cards = leakCardSlugs(leak), dateOf = s => site.insights.find(a => a.slug === s).date;
  // 2026-11-27 (2): the 11/26 Wolpyeong Town card comes first now, so the 11/17 and 11/16 cards are second and third.
  // 2026-11-28: that card is now the two per-home 11/26 cards, so the 11/17 and 11/16 cards are third and fourth.
  // 2026-11-28 (2): the 11/27 Oryu-dong Samsung pipe card leads and the 11/25 rain-pipe card follows the 11/26 cards, so the 11/17
  // and 11/16 cards are fifth and sixth.
  assert.equal(cards[0], 'samsung-apt-water-pipe-full-replacement-20261127');
  assert.deepEqual(cards.slice(1, 3), ['wolpyeong-town-first-home-veranda-rain-pipe-fitting-20261126', 'wolpyeong-town-second-home-veranda-rain-pipe-fitting-20261126']);
  assert.equal(cards[3], 'oryu-samsung-apt-rain-pipe-base-fitting-20261125');
  assert.deepEqual(cards.slice(4, 6), slugs.slice(0, 2));
  const k = cards.indexOf(slugs[3]);
  assert.ok(k > 6 && cards.slice(0, k).every(s => dateOf(s) > fixture.cases[3].date), slugs[3]);  // 2026-11-27 (2): was k > 2; 2026-11-28: was k > 3; 2026-11-28 (2): was k > 4
  assert.equal(cards[k + 1], EARLIER_SAME_DAY);
  for (const c of fixture.cases.filter(c => c.leakCard)) assert.equal(cards.filter(x => x === c.slug).length, 1, c.slug);
  // blog.html and leak.html advertise the newest public post date.
  // 2026-11-21: blog.html follows the newest post (11/18 Heightsville, interior); leak.html keeps the newest leak case (11/17).
  // 2026-11-25: five recent posts were enriched (updated 2026-11-25), so blog.html and leak.html both follow that edit day.
  // 2026-11-27: blog.html follows the newest post (11/27 Nangwol-dong Namdaejeon e-Pyeonhan, interior); leak.html keeps 2026-11-25.
  // 2026-11-27 (2): leak.html follows the newest leak case (11/26 Wolpyeong Town); blog.html stays 2026-11-27 (11/27 Namdaejeon).
  for (const page of ['blog.html', 'leak.html']) assert.equal(sitemapLastmod(page), page === 'blog.html' ? '2026-11-27' : '2026-11-27', page);  // 2026-11-28 (2): leak.html follows the newest leak case (11/27 Oryu-dong Samsung pipe)
  // The small leak index stays under the inquiry-form budget after these entries.
  assert.ok(fs.statSync(path.join(root, 'data/leak-case-index.json')).size < 16 * 1024);  // 2026-11-18: budget 10KB -> 16KB (ensure-leak-case-index)
});

test('public photo copies unchanged, long side 1600px, only a JFIF header (no EXIF/GPS/XMP), small-screen variants', () => {
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
        // APP0 (JFIF) only: no APP1 EXIF/XMP, APP2 ICC, APP11 JUMBF/C2PA, APP13 IPTC or any other application segment.
        if (marker >= 0xe0 && marker <= 0xef) assert.equal(marker, 0xe0, file + ': APP' + (marker - 0xe0));
        if ([0xc0, 0xc1, 0xc2].includes(marker)) size = { h: data.readUInt16BE(i + 3), w: data.readUInt16BE(i + 5) };
        i += len;
      }
      assert.ok(size, file);
      if (!variant) assert.equal(Math.max(size.w, size.h), 1600, file);
      else assert.ok(size.w <= (file.endsWith('-480w.jpg') ? 480 : 960), file);
      assert.equal(data.indexOf(Buffer.from('Exif\0\0')), -1, file);
      assert.equal(data.indexOf(Buffer.from('http://ns.adobe.com/xap/')), -1, file);
    }
  }
});
