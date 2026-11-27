// 2026-11-12 photo cases (3): Samho balcony rain-pipe base (11-10), Yuwon balcony rain-pipe base + floor plate (11-10) and
// Yeolmae rain-pipe box (11-06). Public case content only: no field database, accounts or external writes. The 80 entries
// before them are pinned as one object (origin/main 4a50d2f, PR #228 merge) and the three new entries lead the list in date
// order, so the 11/10 Samho case is the newest real case (blog featured slot, first leak landing card).
// 2026-11-13: Munchang manifold/valve (leak), Gyochon Mimade hot-water pipe (leak) and Tanbang floor screed (interior) cases
// (11-12) were added first (no existing entry changed): pinned set +3, leak card count 40 -> 42, the 11/12 Munchang case is now
// the newest/featured case and blog/leak lastmod is 2026-11-12. recent-cases-20261113 pins the 83 entries before them.
// 2026-11-17: Saeyeoul (11-17), Samho front balcony (11-16), Yeolmae bathtub area (11-14, interior) and Mokyang washbasin
// (11-10) cases were added at their date positions (no existing entry changed): pinned set +4, leak card count 42 -> 45, the
// 11/17 Saeyeoul case is now the newest/featured case and blog/leak lastmod is 2026-11-17. The 11/10 Mokyang case sits right
// before these three (same date) so they stay together. recent-cases-20261117 pins the 86 entries before the four new cases.
// 2026-11-18: the Gongju factory panel roof/wall case (11-09, interior) was added at its date position, between the 11/10
// pair and the 11/06 Yeolmae case (no existing entry changed): pinned set +1. The three keep their order and only that
// later-added, in-between-dated case may sit among them. recent-cases-20261118 pins the 90 entries before it.
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
const fixture = require('./fixtures/recent-cases-20261112.json');
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

test('the 80 entries before these cases keep their object and order; mutation guards active', () => {
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
  // The three entries stay together in date order right after the newer 11/12 cases (same date keeps the listed order).
  // 2026-11-13: the 11/12 batch (recent-cases-20261113) now leads the list and holds the featured slot.
  // 2026-11-18: the later-added 11/9 case (recent-cases-20261118) sits at its date position inside this run.
  const LATER = ['gongju-factory-container-panel-roof-wall-20261109'], span = 3 + LATER.length;
  const at = insights.findIndex(a => a.slug === slugs[0]);
  assert.deepEqual(insights.slice(at, at + span).map(a => a.slug).filter(s => !LATER.includes(s)), slugs);
  for (const s of LATER) { const d = insights.find(a => a.slug === s).date; assert.ok(d < fixture.cases[1].date && d > fixture.cases[2].date, s); }
  // 2026-11-17: the same-date 11/10 Mokyang case now sits right before them, so earlier entries are newer or the same date.
  assert.ok(at > 0 && insights.slice(0, at).every(a => a.date >= insights[at].date));
  for (let k = at; k < at + span; k++) assert.ok(insights[k].date >= insights[k + 1].date, insights[k].slug);
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, 'nangwol-namdaejeon-epyeonhan-33py-remodel-20261127');  // 2026-11-27: was the 11/18 Heightsville case; 2026-11-21: was the 11/17 Saeyeoul case
});

test('three cases: 24 photos, work dates, leak service, conservative public copy and discovery links', () => {
  assert.equal(fixture.cases.length, 3);
  assert.equal(fixture.photos.length, 24);
  assert.equal(new Set(fixture.photos.map(p => p.file)).size, 24);
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
    const text = JSON.stringify(a);
    // 협력사·작업자 이름 등은 글자로 두지 않고 sha256 으로 대조한다(scripts/lib/hidden-terms.cjs, 2026-11-25).
    { const hidden = findHidden(text, 'partners', 'people'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    // No unit numbers, customer data, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
    assert.doesNotMatch(text, /\d+\s*동\s*\d+\s*호|\d{3,4}\s*호|(?:로|길)\s*\d+|번길|sourcePath|driveId|GPS|좌표|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|010[- ]?\d|@[\w.-]+\.[A-Za-z]{2,}/);
    // No cost, estimate number, client company, worker name or unverified cause/performance claims.
    assert.doesNotMatch(text, /\d{1,3}(,\d{3})+\s*원|만\s*원|견적번호|발주|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과|원인은|누수 원인|해결/);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope && a.caseSummary, c.slug);
    assert.match(a.consultation.scope, /최종 범위와 금액은 현장 확인 후 안내합니다/);
    for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key].trim(), c.slug + ' ' + key);
    assert.match(a.caseSummary.result, /통수시험 수치/);
    assert.ok(a.relatedSlugs.length >= 2 && new Set(a.relatedSlugs).size === a.relatedSlugs.length, c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false && r !== a.slug, r);
      assert.equal(serviceOf(related), a.service, r);
    }
    // Discovery: list card in the leak group, RSS, sitemap (lastmod = work date), leak index and landing card.
    // The newest case is listed once, in the featured slot; the others as normal list cards.
    const listClass = 'insight-card';  // 2026-11-13: the featured slot moved to the 11/12 Munchang case (2026-11-17: 11/17 Saeyeoul)
    assert.match(blog, new RegExp(`<a class="${listClass}" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"`));
    assert.ok(rss.includes(`/posts/${c.slug}.html`), 'rss ' + c.slug);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.date);
    assert.equal(index.cases.some(x => x.slug === c.slug), true, 'leak index ' + c.slug);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    for (const b of figures) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    assert.ok(cta.includes(`href="../leak.html?case=${c.slug}#leakInquiry"`), c.slug);
  }
  // The newest case takes the blog featured slot (2026-11-21: now the 11/18 Heightsville case, interior group).
  assert.match(blog, new RegExp(`insight-featured[^>]*href="posts/nangwol-namdaejeon-epyeonhan-33py-remodel-20261127\\.html"`));  // 2026-11-27: was the 11/18 Heightsville case
  // Leak landing: card count pin 37 -> 40 (2026-11-13: 40 -> 42; 2026-11-17: 42 -> 45), the three cards in date order after the
  // newer cards.
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 50);  // 2026-11-18: 45 -> 46 (11/13 Taesan card), 2026-11-27: 46 -> 47 (11/26 Wolpyeong Town card), 2026-11-28: 47 -> 48 (the combined card replaced by the two per-home cards), 2026-11-28 (2): 48 -> 50 (11/27 Oryu-dong Samsung pipe card first, 11/25 rain-pipe card after the 11/26 cards)
  const cards = leakCardSlugs(leak);
  // 2026-11-13: after the two 11/12 leak cards. 2026-11-17: also after the 11/17 Saeyeoul, 11/16 Samho and same-date 11/10
  // Mokyang cards. 2026-11-18: also after the 11/13 Taesan card. 2026-11-27 (2): also after the 11/26 Wolpyeong Town card (first).
  // 2026-11-28: that card became two per-home cards, so they move one more place down.
  // 2026-11-28 (2): the 11/27 Oryu-dong Samsung pipe card and the 11/25 rain-pipe card come before them, two more places down.
  assert.deepEqual(cards.slice(10, 13), slugs);
  for (const c of fixture.cases) assert.equal(cards.filter(s => s === c.slug).length, 1, c.slug);
  // blog.html and leak.html advertise the newest public post date.
  // 2026-11-21: blog.html follows the newest post (11/18 Heightsville, interior); leak.html keeps the newest leak case (11/17).
  // 2026-11-25: five recent posts were enriched (updated 2026-11-25), so blog.html and leak.html both follow that edit day.
  // 2026-11-27: blog.html follows the newest post (11/27 Nangwol-dong Namdaejeon e-Pyeonhan, interior); leak.html keeps 2026-11-25.
  // 2026-11-27 (2): leak.html follows the newest leak case (11/26 Wolpyeong Town); blog.html stays 2026-11-27 (11/27 Namdaejeon).
  for (const page of ['blog.html', 'leak.html']) assert.equal(sitemapLastmod(page), page === 'blog.html' ? '2026-11-27' : '2026-11-27', page);  // 2026-11-17  // 2026-11-28 (2): leak.html follows the newest leak case (11/27 Oryu-dong Samsung pipe)
  // The small leak index stays under the inquiry-form budget after these three entries.
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
        // APP0 (JFIF) only: no APP1 EXIF/XMP, APP2 ICC, APP11 JUMBF, APP13 IPTC or any other application segment.
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
