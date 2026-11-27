// 2026-11-21 photo case (1): window-side extension floors at the Heightsville apartments in Gwanpyeong-dong, Yuseong-gu,
// Daejeon (2026-11-18, interior). The stripped extension floors got insulation boards and heating pipes and were covered with
// screed; one room rain pipe and small screed patches by a door were done the same day. Remaining work follows on a later
// visit, so this is written as work in progress. Public case content only: no field database, accounts or external writes.
// The 92 entries before it are pinned as one object (origin/main 520dc41, PR #239 merge). It is the newest entry, so it leads
// the list and takes the blog featured slot (in the interior group); blog.html lastmod is 2026-11-18. As an interior case it
// gets no leak landing card and no leak index entry, and leak.html keeps the newest leak case date (2026-11-17).
// Only the dong and complex name are public (the owner confirmed Gwanpyeong-dong on 2026-11-21): no building/unit numbers,
// road address, customer, cost, partner company, workers or location metadata.
// 2026-11-25: the five newest cases (11/18 Heightsville, 11/17 Saeyeoul, 11/16 Samho front balcony, 11/14 Yeolmae bathtub area and
// 11/13 Taesan Green) were enriched in place (docs/case-enrich-20261125.md): excerpt, longer step text, one general-guidance
// section before the closing section, updated 2026-11-25 and readMin. Photos, dates, places, order and the other 88 entries did
// not change (checked by reverting only those five objects and getting the old pin back). The pinned hash was recomputed for the
// new text, and blog.html / leak.html / the five post lastmod values follow the edit day (updated).
// 2026-11-27: the Nangwol-dong (Dong-gu) Namdaejeon e-Pyeonhan Sesang 33-pyeong remodel case (11-27, interior) was added first
// (no existing entry changed): the pinned set is now 93 entries, this case sits second (right after it, before 11/17 Saeyeoul),
// and the 11/27 case takes the featured slot, so this case is a normal interior card. blog.html lastmod follows it (2026-11-27);
// leak.html keeps 2026-11-25. recent-cases-20261127 pins the 93 entries before that case.
// 2026-11-27 (2): the Wolpyeong-dong (Seo-gu) Wolpyeong Town case (11-26, leak: rain-pipe base fittings on the front and back
// verandas of two homes) was added right after the 11/27 case at its date position (no existing entry changed): the pinned set
// is now 94 entries and this case sits third (before 11/17 Saeyeoul). The featured slot and blog.html lastmod (2026-11-27) stay
// with the 11/27 case; the new leak landing card makes the count 47 and leak.html lastmod 2026-11-26.
// recent-cases-20261127-wolpyeong pins the 94 entries before that case.
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
const fixture = require('./fixtures/recent-cases-20261121.json');
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
// The entry that led the list before this case (and held the featured slot).
const NEXT = 'saeyeoul-toilet-drain-pipe-insert-20261117';
// 2026-11-27: the entry that leads the list now (and holds the featured slot) — recent-cases-20261127.
const NEWER = 'nangwol-namdaejeon-epyeonhan-33py-remodel-20261127';
// 2026-11-27 (2): the 11/26 Wolpyeong Town leak case sits between the 11/27 case and this one — recent-cases-20261127-wolpyeong.
// 2026-11-28: that case is now two same-date entries, one per home (first, then second) — recent-cases-20261127-wolpyeong.
const NEWER_LEAK = ['wolpyeong-town-first-home-veranda-rain-pipe-fitting-20261126', 'wolpyeong-town-second-home-veranda-rain-pipe-fitting-20261126'];
const PLACE = '대전 유성구 관평동 하이츠빌아파트';

test('the 94 entries outside this case keep their object and order; third newest; mutation guards active', () => {
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
  // 2026-11-27: second, right after the 11/27 case (was first); every entry after it is older.
  assert.equal(insights[0].slug, NEWER);
  assert.ok(insights[0].date > fixture.cases[0].date);
  // 2026-11-27 (2): third, after the 11/27 case and the 11/26 Wolpyeong Town case (was second).
  // 2026-11-28: fourth, after the 11/27 case and the two per-home 11/26 entries (was third).
  // 2026-11-28 (2): sixth, after the 11/27 case, the 11/27 Oryu-dong Samsung pipe entry, the two 11/26 entries and the 11/25
  // Oryu-dong Samsung rain-pipe entry (was fourth).
  assert.equal(insights[1].slug, 'samsung-apt-water-pipe-full-replacement-20261127');
  assert.deepEqual(insights.slice(2, 4).map(a => a.slug), NEWER_LEAK);
  assert.equal(insights[4].slug, 'oryu-samsung-apt-rain-pipe-base-fitting-20261125');
  assert.ok(insights.slice(1, 5).every(a => a.date > fixture.cases[0].date));
  assert.equal(insights[5].slug, slugs[0]);
  assert.ok(insights.slice(6).every(a => a.date < fixture.cases[0].date));
  assert.equal(insights[6].slug, NEXT);
  // It is the newest real case (caseSummary), so it is the featured case.
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, NEWER);  // 2026-11-27: was slugs[0] (this case)
});

test('one case: 9 photos, work date, interior service, owner-confirmed place, conservative copy and discovery links', () => {
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
    // Place wording confirmed by the owner on 2026-11-21: '관평동' sits before the complex name everywhere it appears.
    assert.equal(a.place.name, c.placeName);
    assert.equal(c.placeName, PLACE);
    assert.ok(a.title.startsWith(PLACE + ' ') && a.title.includes('｜') && a.title.length <= 65, c.slug);
    assert.ok(a.excerpt.startsWith(PLACE + ' '), c.slug);
    assert.ok(a.caseSummary.site.startsWith('유성구 관평동 하이츠빌아파트 · '), c.slug);
    assert.ok(a.body[0].p.startsWith(PLACE + ' '), c.slug);
    const text = JSON.stringify(a);
    // 협력사·작업자 이름 등은 글자로 두지 않고 sha256 으로 대조한다(scripts/lib/hidden-terms.cjs, 2026-11-25).
    { const hidden = findHidden(text, 'partners', 'people'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    assert.equal((text.match(/하이츠빌/g) || []).length, (text.match(/유성구 관평동 하이츠빌아파트/g) || []).length);
    assert.match(a.place.note, /공개하지 않습니다/);
    const figures = a.body.filter(b => b.img);
    assert.equal(figures.length, c.photoCount);
    assert.ok(a.excerpt.includes('실제 사진 ' + c.photoCount + '장'), c.slug);
    assert.ok(a.body.at(-1).h.endsWith('확인한 범위') && !a.body.at(-1).img, c.slug);
    a.body.forEach((b, n) => assert.ok(b.h.startsWith((n + 1) + '. '), b.h));
    assert.ok(figures.some(b => b.img === a.image) && a.imageAlt === figures.find(b => b.img === a.image).imgAlt, c.slug + ' cover');
    for (const b of figures) {
      assert.ok(b.imgAlt && b.imgCaption, b.img);
      assert.ok(fixture.photos.some(p => p.file === b.img), b.img);
    }
    // Photos appear in the fixture's (shooting) order.
    assert.deepEqual(figures.map(b => b.img), fixture.photos.map(p => p.file), c.slug);
    // No building/unit numbers, customer data, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
    assert.doesNotMatch(text, /\d+\s*동(?![가-힣])|\d+\s*호(?![가-힣])|\d+\s*동\s*\d+\s*호|[가-힣]\d{1,3}(?:로|길)(?![가-힣])|(?:로|길)\s*\d+|번길|sourcePath|driveId|GPS|좌표|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|010[- ]?\d|@[\w.-]+\.[A-Za-z]{2,}/);
    // No cost, estimate number, client or partner company, worker name, product brand or unverified cause/performance claims.
    assert.doesNotMatch(text, /\d{1,3}(,\d{3})+\s*원|만\s*원|견적번호|견적서|발주|작업자|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과|원인은|누수 원인|해결/);
    // Work in progress: not written as finished, the remaining work is said plainly, and what is missing is not guessed.
    assert.doesNotMatch(text, /완공|공사 완료|마감 완료|시공 완료/);
    assert.match(a.body.at(-1).p, /남은 작업은 다음 방문 때 이어서 진행할 예정입니다/);
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
    // Discovery: featured card in the interior group, RSS, sitemap (lastmod = work date); no leak index entry or landing card.
    // 2026-11-27: a normal interior card now (the 11/27 case took the featured slot).
    assert.match(blog, new RegExp(`<a class="insight-card" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"`));
    assert.ok(rss.includes(`/posts/${c.slug}.html`), 'rss ' + c.slug);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.updated || a.date);  // 2026-11-25: enriched posts carry updated (docs/case-enrich-20261125.md)
    assert.equal(index.cases.some(x => x.slug === c.slug), false, 'leak index ' + c.slug);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    for (const b of figures) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    assert.ok(cta.includes('href="../index.html#estimator"') && cta.includes('href="../index.html#inquiry"') && !cta.includes('leak.html'), c.slug);
  }
  // Exactly one featured card; the previous featured case is a normal card now. The leak landing card count stays 46.
  // 2026-11-27 (2): 46 -> 47 — the 11/26 Wolpyeong Town leak case adds the first landing card.
  assert.equal((blog.match(/class="insight-featured"/g) || []).length, 1);
  assert.match(blog, new RegExp(`<a class="insight-card" href="posts/${NEXT}\\.html"`));
  assert.match(blog, new RegExp(`<a class="insight-featured" href="posts/${NEWER}\\.html" data-group="interior"`));  // 2026-11-27
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 50);  // 2026-11-27: 46 -> 47 (11/26 Wolpyeong Town card), 2026-11-28: 47 -> 48 (the combined card replaced by the two per-home cards), 2026-11-28 (2): 48 -> 50 (11/27 Oryu-dong Samsung pipe card first, 11/25 rain-pipe card after the 11/26 cards)
  // blog.html follows the newest post; leak.html keeps the newest leak case date.
  // 2026-11-25: five recent posts were enriched (updated 2026-11-25), so both pages follow that edit day
  // (blog: newest updated-or-date of all public posts; leak: of the leak cases — it was blog 11/18, leak 11/17).
  const day = a => a.updated || a.date, newest = items => items.map(day).sort().at(-1);
  assert.equal(sitemapLastmod('blog.html'), newest(site.insights.filter(a => a.published !== false)));
  assert.equal(sitemapLastmod('leak.html'), newest(site.insights.filter(a => a.published !== false && serviceOf(a) === 'leak')));
  assert.equal(sitemapLastmod('blog.html'), '2026-11-27');  // 2026-11-27: the 11/27 Nangwol-dong case (was 2026-11-25)
  assert.equal(sitemapLastmod('leak.html'), '2026-11-27');  // 2026-11-27 (2): the 11/26 Wolpyeong Town leak case (was 2026-11-25); 2026-11-28 (2): the 11/27 Oryu-dong Samsung pipe case
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
