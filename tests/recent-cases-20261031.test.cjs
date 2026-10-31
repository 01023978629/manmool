// October 2026 photo cases (10). Public case content only: no field database, accounts or external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261031.json');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const slugs = fixture.cases.map(c => c.slug);
const previous = items => items.filter(a => !slugs.includes(a.slug));
const preserved = items => previous(items).length === fixture.previousCount && hash(previous(items)) === fixture.previousHash;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sitemapLastmod = slug => (read('sitemap.xml').match(new RegExp(
  `<loc>https://01023978629\\.github\\.io/manmool/posts/${slug}\\.html</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1];

test('the 65 entries published before this batch keep their objects and order; mutation guards active', () => {
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
  // New entries sit at their date position; older entries keep their historical order.
  for (const slug of slugs) {
    const k = insights.findIndex(a => a.slug === slug), day = insights[k].date;
    assert.ok((k === 0 || insights[k - 1].date >= day) && (k === insights.length - 1 || insights[k + 1].date <= day), slug);
  }
});

test('ten October cases: 78 photos, work dates, conservative public copy and discovery links', () => {
  assert.equal(fixture.cases.length, 10);
  assert.equal(fixture.photos.length, 78);
  const leak = read('leak.html');
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.ok(a, c.slug);
    assert.equal(a.published, true);
    assert.equal(a.date, c.date);
    assert.ok(c.shootingDates.includes(a.date) && c.slug.endsWith(a.date.replaceAll('-', '')), c.slug);
    assert.equal(a.service, 'leak');
    assert.equal(a.category, '방수·설비');
    const figures = a.body.filter(b => b.img);
    assert.equal(figures.length, c.photoCount);
    assert.ok(figures.some(b => b.img === a.image) && a.imageAlt, c.slug + ' cover');
    for (const b of figures) {
      assert.ok(b.imgAlt && b.imgCaption, b.img);
      assert.ok(fixture.photos.some(p => p.file === b.img), b.img);
    }
    const text = JSON.stringify(a);
    assert.doesNotMatch(text, /\d+\s*동\s*\d+\s*호|\d{3,4}\s*호|sourcePath|driveId|GPS|좌표|[A-Za-z]:[\\/]|file:\/\/|010[- ]?\d|@[\w.-]+\.[A-Za-z]{2,}/);
    assert.doesNotMatch(text, /100%|평생 보증|최저가|무조건|업계 1위|완벽/);
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
  // The Yongjeon complex name is not owner-confirmed yet: no map search, no name in public copy.
  const yongjeon = site.insights.find(a => a.slug.startsWith('yongjeon-'));
  assert.equal(yongjeon.place, undefined);
  assert.doesNotMatch(JSON.stringify(yongjeon), /신동아/);
  // Same complex, separate jobs and dates: two Sujeong Town records must stay distinct.
  const sujeong = site.insights.filter(a => a.slug.startsWith('sujeong-town-'));
  assert.deepEqual(sujeong.map(a => a.date).sort(), ['2026-10-14', '2026-10-29']);
  assert.match(read('blog.html'), new RegExp(`insight-featured[^>]*href="posts/${site.insights[0].slug}\\.html"`));
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
