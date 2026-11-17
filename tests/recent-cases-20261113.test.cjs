// 2026-11-13 photo cases (3), all shot 2026-11-12: Munchang heating manifold + valve replacement (leak), Gyochon Mimade
// boiler hot-water pipe repair (leak) and Tanbang house floor screed before wallpaper/flooring (interior, work in progress).
// Public case content only: no field database, accounts or external writes. The 83 entries before them are pinned as one
// object (origin/main 8b9786c) and the three new entries lead the list, so the 11/12 Munchang case is the newest real case
// (blog featured slot, first leak landing card). The interior case gets no leak landing card and no leak index entry.
// 2026-11-17: Saeyeoul (11-17), Samho front balcony (11-16), Yeolmae bathtub area (11-14, interior) and Mokyang washbasin
// (11-10) cases were added at their date positions (no existing entry changed): pinned set +4, leak card count 42 -> 45, the
// 11/17 Saeyeoul case is now the newest/featured case and blog/leak lastmod is 2026-11-17. The three 11/12 entries stay
// together right after the newer cases. recent-cases-20261117 pins the 86 entries before the four new cases.
// 2026-11-18: the Gongju factory panel roof/wall case next to a container (11-09, interior) was added at its date position
// (no existing entry changed): pinned set +1; no leak card, leak index entry, featured or lastmod change.
// recent-cases-20261118 pins the 90 entries before it.
// 2026-11-18 (2): the Cheongju Yongam-dong Taesan Green roof-drain x2 + front-balcony rain-pipe case (11-13, leak) was added at
// its date position (no existing entry changed): pinned set +1, leak cards 45 -> 46 (its card sits after the 11/16 Samho card);
// no featured or lastmod change. recent-cases-20261118-taesan pins the 91 entries before it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261113.json');
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

test('the 83 entries before these cases keep their object and order; mutation guards active', () => {
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
  // The three entries stay together in date order (same date keeps the listed order).
  // 2026-11-17: the newer 11/14–11/17 cases (recent-cases-20261117) now lead the list and hold the featured slot.
  const at = insights.findIndex(a => a.slug === slugs[0]);
  assert.deepEqual(insights.slice(at, at + 3).map(a => a.slug), slugs);
  assert.ok(at > 0 && insights.slice(0, at).every(a => a.date > insights[at].date));
  for (let k = at; k < at + 3; k++) assert.ok(insights[k].date >= insights[k + 1].date, insights[k].slug);
  assert.ok(insights[at + 3].date < '2026-11-12');
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, 'saeyeoul-toilet-drain-pipe-insert-20261117');
});

test('three cases: 17 photos, work date, service split, conservative public copy and discovery links', () => {
  assert.equal(fixture.cases.length, 3);
  assert.equal(fixture.photos.length, 17);
  assert.equal(new Set(fixture.photos.map(p => p.file)).size, 17);
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
    // No unit numbers, customer data, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
    assert.doesNotMatch(text, /\d+\s*동\s*\d+\s*호|\d{3,4}\s*호|(?:로|길)\s*\d+|번길|sourcePath|driveId|GPS|좌표|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|010[- ]?\d|@[\w.-]+\.[A-Za-z]{2,}/);
    // No cost, estimate number, client company, worker name, product brand or unverified cause/performance claims.
    assert.doesNotMatch(text, /\d{1,3}(,\d{3})+\s*원|만\s*원|견적번호|발주|누수나라|우철|서비스점|나비엔|경동|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과|원인은|누수 원인|해결/);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope && a.caseSummary, c.slug);
    assert.match(a.consultation.scope, /최종 범위와 금액은 현장 확인 후 안내합니다/);
    for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key].trim(), c.slug + ' ' + key);
    if (c.service === 'leak') assert.match(a.caseSummary.result, /압력시험 수치/);
    else {
      // Work in progress: wallpaper and flooring come later, so the case must not read as a finished job.
      assert.match(a.caseSummary.result, /도배·마루는 이후 공정\(진행 중\)/);
      assert.match(a.body.at(-1).p, /진행 전이라 완료로 적지 않았습니다/);
      assert.doesNotMatch(text, /완공|공사 완료|마감 완료|시공 완료/);
    }
    assert.ok(a.relatedSlugs.length >= 2 && new Set(a.relatedSlugs).size === a.relatedSlugs.length, c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false && r !== a.slug, r);
      assert.equal(serviceOf(related), a.service, r);
    }
    // Discovery: list card in the right group, RSS, sitemap (lastmod = work date), leak index and landing card only for leak.
    const listClass = 'insight-card';  // 2026-11-17: the featured slot moved to the 11/17 Saeyeoul case
    assert.match(blog, new RegExp(`<a class="${listClass}" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"`));
    assert.ok(rss.includes(`/posts/${c.slug}.html`), 'rss ' + c.slug);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.date);
    assert.equal(index.cases.some(x => x.slug === c.slug), c.service === 'leak', 'leak index ' + c.slug);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    for (const b of figures) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    if (c.service === 'leak') assert.ok(cta.includes(`href="../leak.html?case=${c.slug}#leakInquiry"`), c.slug);
    else assert.ok(cta.includes('href="../index.html#estimator"') && cta.includes('href="../index.html#inquiry"') && !cta.includes('leak.html'), c.slug);
  }
  // The newest case takes the blog featured slot (2026-11-17: now the 11/17 Saeyeoul case).
  assert.match(blog, new RegExp(`insight-featured[^>]*href="posts/saeyeoul-toilet-drain-pipe-insert-20261117\\.html"`));
  // Leak landing: card count pin 40 -> 42 (2026-11-17: 42 -> 45), the two leak cards in listed order right after the 11/17
  // Saeyeoul and 11/16 Samho cards; no card for the interior case.
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 46);  // 2026-11-18: 45 -> 46 (11/13 Taesan card)
  const cards = leakCardSlugs(leak), leakSlugs = fixture.cases.filter(c => c.leakCard).map(c => c.slug);
  // 2026-11-18: the 11/13 Taesan card sits between the 11/16 Samho card and these two, so they move one place down.
  assert.deepEqual(cards.slice(3, 5), leakSlugs);
  for (const s of leakSlugs) assert.equal(cards.filter(x => x === s).length, 1, s);
  // blog.html and leak.html advertise the newest public post date.
  for (const page of ['blog.html', 'leak.html']) assert.equal(sitemapLastmod(page), '2026-11-17', page);  // 2026-11-17
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
