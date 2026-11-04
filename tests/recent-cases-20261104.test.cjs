// 2026-11-04 photo cases (3): Mokhwa toilet reset + ceiling drain pipe (10-26), Dunsan shop-front deck repair (10-21,
// interior) and IPark City bathroom waterproofing (08-30). Public case content only: no field database, accounts or
// external writes. The 77 entries before them are pinned as one object (origin/claude/seonbi-wall-plaster-20261103,
// PR #227 head b6a32c3) and the new entries sit at their date positions, so the 11/3 Seonbi case stays newest/featured.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261104.json');
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

test('the 77 entries before these cases keep their object and order; mutation guards active', () => {
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
  // Each new entry sits at its date position; the older entries keep their historical order (pinned above).
  for (const slug of slugs) {
    const k = insights.findIndex(a => a.slug === slug), day = insights[k].date;
    assert.ok(k > 0 && insights[k - 1].date >= day && insights[k + 1].date <= day, slug);
  }
  // None of them is newer than the 11/3 Seonbi case, so it stays the first real case (blog featured slot).
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, 'seonbi-1danji-retaining-wall-plaster-repair-20261103');
  for (const c of fixture.cases) assert.ok(firstCase.date > c.date, c.slug);
});

test('three cases: 30 photos, work dates, service split, conservative public copy and discovery links', () => {
  assert.equal(fixture.cases.length, 3);
  assert.equal(fixture.photos.length, 30);
  assert.equal(new Set(fixture.photos.map(p => p.file)).size, 30);
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
    // No cost, estimate number, client company, worker name, wrong folder label or unverified cause/performance claims.
    assert.doesNotMatch(text, /\d{1,3}(,\d{3})+\s*원|만\s*원|견적번호|발주|누수나라|우철|저수조|100%|평생 보증|최저가|무조건|업계 1위|완벽|방수 효과|원인은|누수 원인/);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope && a.caseSummary, c.slug);
    assert.match(a.consultation.scope, /최종 범위와 금액은 현장 확인 후 안내합니다/);
    for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key].trim(), c.slug + ' ' + key);
    assert.ok(a.relatedSlugs.length >= 2 && new Set(a.relatedSlugs).size === a.relatedSlugs.length, c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false && r !== a.slug, r);
      assert.equal(serviceOf(related), a.service, r);
    }
    // Discovery: list card in the right group, RSS, sitemap (lastmod = work date), leak index only for leak cases.
    assert.match(blog, new RegExp(`<a class="insight-card" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"`));
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
  assert.match(blog, new RegExp(`insight-featured[^>]*href="posts/${site.insights[0].slug}\\.html"`));
  assert.equal(site.insights[0].slug, 'seonbi-1danji-retaining-wall-plaster-repair-20261103');
  // Leak landing: card count pin 35 -> 37 (the interior deck case has no leak card), cards at their date positions.
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 37);
  const cards = leakCardSlugs(leak), dateOf = slug => site.insights.find(a => a.slug === slug).date;
  assert.equal(cards[0], 'seonbi-1danji-retaining-wall-plaster-repair-20261103');
  for (const c of fixture.cases.filter(c => c.leakCard)) {
    const k = cards.indexOf(c.slug);
    assert.equal(cards.filter(s => s === c.slug).length, 1, c.slug);
    assert.ok(k > 0 && dateOf(cards[k - 1]) >= c.date && dateOf(cards[k + 1]) <= c.date, c.slug);
  }
  // blog.html and leak.html keep advertising the newest public post date (still the 11/3 case).
  for (const page of ['blog.html', 'leak.html']) assert.equal(sitemapLastmod(page), '2026-11-03', page);
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
