// November 2026 photo case (1): Seonbi 1-danji retaining-wall plaster repair. Public case content only: no field
// database, accounts or external writes. The 76 entries before it are pinned as one object (origin/main 2e0c484 order).
// 2026-11-04: Mokhwa (10-26), Dunsan deck (10-21) and IPark City (08-30) cases were added at their date positions after
// this one (no existing entry changed). The pinned set (every entry except this case) was re-pinned 76 -> 79 and the leak
// card count 35 -> 37; recent-cases-20261104 pins the 77 entries before those three. This case stays first (newest).
// 2026-11-12: Samho/Yuwon (11-10) and Yeolmae (11-06) rain-pipe cases were added in front of it (no existing entry changed):
// pinned set 79 -> 82, leak card count 37 -> 40. It now sits at its date position after them, and the blog/leak lastmod
// follows the newest public post (2026-11-10). recent-cases-20261112 pins the 80 entries before the three new cases.
// 2026-11-13: the 11/12 Munchang/Mimade/Tanbang cases were added first: pinned set +3, leak cards 40 -> 42, lastmod 2026-11-12.
// 2026-11-17: the 11/17 Saeyeoul, 11/16 Samho, 11/14 Yeolmae (interior) and 11/10 Mokyang cases were added at their date
// positions: pinned set +4, leak cards 42 -> 45, lastmod 2026-11-17. recent-cases-20261117 pins the 86 entries before them.
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
const fixture = require('./fixtures/recent-cases-20261103.json');
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
const sitemapLastmod = slug => (read('sitemap.xml').match(new RegExp(
  `<loc>https://01023978629\\.github\\.io/manmool/posts/${slug}\\.html</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1];

test('every entry except this case keeps its object and order; mutation guards active', () => {
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
  // It was the newest real case on 11/3; since 2026-11-12 the newer cases come first and it sits at its date position.
  for (const slug of slugs) {
    const k = insights.findIndex(a => a.slug === slug), day = insights[k].date;
    assert.ok(k > 0 && insights[k - 1].date >= day, slug);
    assert.ok(insights[k + 1].date <= day, slug);
  }
});

test('Seonbi 1-danji retaining-wall plaster case: 9 photos, work date, conservative public copy and discovery links', () => {
  assert.equal(fixture.cases.length, 1);
  assert.equal(fixture.photos.length, 9);
  const leak = read('leak.html');
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.ok(a, c.slug);
    assert.equal(a.published, true);
    assert.equal(a.date, c.date);
    assert.ok(c.shootingDates.includes(a.date) && c.slug.endsWith(a.date.replaceAll('-', '')), c.slug);
    assert.equal(a.service, 'leak');
    assert.equal(a.category, '방수·설비');
    assert.equal(a.place.name, '대전 대덕구 송촌동 선비마을아파트 1단지');
    const figures = a.body.filter(b => b.img);
    assert.equal(figures.length, c.photoCount);
    assert.ok(figures.some(b => b.img === a.image) && a.imageAlt, c.slug + ' cover');
    for (const b of figures) {
      assert.ok(b.imgAlt && b.imgCaption, b.img);
      assert.ok(fixture.photos.some(p => p.file === b.img), b.img);
    }
    const text = JSON.stringify(a);
    // 협력사·작업자 이름 등은 글자로 두지 않고 sha256 으로 대조한다(scripts/lib/hidden-terms.cjs, 2026-11-25).
    { const hidden = findHidden(text, 'partners', 'people'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    // No unit numbers, customer data, local paths, drive ids, location metadata or phone/e-mail patterns.
    assert.doesNotMatch(text, /\d+\s*동\s*\d+\s*호|\d{3,4}\s*호|sourcePath|driveId|GPS|좌표|[A-Za-z]:[\\/]|file:\/\/|010[- ]?\d|@[\w.-]+\.[A-Za-z]{2,}/);
    // No cost, estimate number, client company, worker name or unverified claims.
    assert.doesNotMatch(text, /\d{1,3}(,\d{3})+\s*원|만\s*원|견적번호|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과|원인은/);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope && a.caseSummary, c.slug);
    assert.ok(a.relatedSlugs.length >= 2, c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false, r);
      assert.equal(related.service || (['방수·설비', '누수탐지·수리'].includes(related.category) ? 'leak' : 'interior'), a.service, r);
    }
    for (const file of ['blog.html', 'rss.xml', 'data/leak-case-index.json']) assert.ok(read(file).includes(c.slug), file + ' ' + c.slug);
    assert.equal(sitemapLastmod(c.slug), a.date);
    assert.ok(leak.includes(`href="posts/${c.slug}.html"`), 'leak card ' + c.slug);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    for (const b of figures) assert.ok(html.includes(b.img), b.img);
  }
  assert.match(read('blog.html'), new RegExp(`insight-featured[^>]*href="posts/${site.insights[0].slug}\\.html"`));
  // The leak landing lists cards newest first; the card count pin follows it (34 -> 35; 2026-11-04 35 -> 37; 2026-11-12 37 -> 40;
  // 2026-11-13 40 -> 42; 2026-11-17 42 -> 45).
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 50);  // 2026-11-18: 45 -> 46 (11/13 Taesan card), 2026-11-27: 46 -> 47 (11/26 Wolpyeong Town card), 2026-11-28: 47 -> 48 (the combined card replaced by the two per-home cards), 2026-11-28 (2): 48 -> 50 (11/27 Oryu-dong Samsung pipe card first, 11/25 rain-pipe card after the 11/26 cards)
  const cardSlugs = [...leak.matchAll(/<article\b[^>]*class="case-card registered-case"[^>]*>[\s\S]*?<\/article>/g)]
    .map(m => (m[0].match(/href="posts\/([^"]+)\.html"/) || [])[1]);
  const dateOf = s => (site.insights.find(a => a.slug === s) || {}).date;
  assert.equal(cardSlugs.indexOf(slugs[0]), cardSlugs.findIndex(s => dateOf(s) <= '2026-11-03'));
  // blog.html and leak.html advertise the newest public post date.
  for (const page of ['blog.html', 'leak.html']) {
    const lastmod = (read('sitemap.xml').match(new RegExp(`<loc>https://01023978629\\.github\\.io/manmool/${page}</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1];
    // 2026-11-21: blog.html follows the newest post (11/18 Heightsville, interior); leak.html keeps the newest leak case (11/17).
    // 2026-11-25: five recent posts were enriched (updated 2026-11-25), so blog.html and leak.html both follow that edit day.
    // 2026-11-27: blog.html follows the newest post (11/27 Nangwol-dong Namdaejeon e-Pyeonhan, interior); leak.html keeps 2026-11-25.
    // 2026-11-27 (2): leak.html follows the newest leak case (11/26 Wolpyeong Town); blog.html stays 2026-11-27 (11/27 Namdaejeon).
    assert.equal(lastmod, page === 'blog.html' ? '2026-11-27' : '2026-11-27', page);  // 2026-11-21: was blog 11/18, leak 11/17  // 2026-11-28 (2): leak.html follows the newest leak case (11/27 Oryu-dong Samsung pipe)
  }
});

test('public photo copies unchanged, no EXIF/XMP, small-screen variants exist', () => {
  for (const p of fixture.photos) {
    const bytes = fs.readFileSync(path.join(root, p.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), p.sha256, p.file);
    for (const file of [p.file, ...[480, 960].map(w => p.file.replace('assets/cases/', 'assets/cases/resized/').replace('.jpg', '-' + w + 'w.jpg'))]) {
      const data = fs.readFileSync(path.join(root, file));
      assert.ok(data.length < (file.includes('/resized/') ? 480 : 1024) * 1024, file);
      assert.equal(data[0], 0xff); assert.equal(data[1], 0xd8);
      let i = 2;
      while (i < data.length) {
        assert.equal(data[i++], 0xff, file);
        while (data[i] === 0xff) i++;
        const marker = data[i++];
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        const len = data.readUInt16BE(i);
        assert.ok(len >= 2 && i + len <= data.length);
        assert.notEqual(marker, 0xe1, file + ': EXIF/XMP');
        i += len;
      }
    }
  }
});
