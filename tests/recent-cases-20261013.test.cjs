// Owner-approved publication of five existing private drafts. No field database or accounts are modified.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261013.json');
const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const slugs = fixture.cases.map(c => c.slug);
const previous = items => items.filter(a => !slugs.includes(a.slug));
const preserved = items => previous(items).length === fixture.previousCount && hash(previous(items)) === fixture.previousHash;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// 2026-10-31: 정보글 '11월 동파 예방' 1건이 맨 앞에 추가돼(기존 글 수정 없음) 고정값을 61건으로 다시 잡고,
// 변이 위치를 5개 사례가 아닌 글(6·7번)로 옮겼다. 기존 65건 전체는 winter-freeze-guide-20261028 검사가 따로 고정.
test('previous 61 complete entries and ordering, company/catalog preserved; mutation guards active', () => {
  assert.equal(site.insights.length, 66);
  assert.ok(preserved(site.insights));
  const { insights, ...rest } = site;
  assert.equal(hash(rest), fixture.otherDataHash);
  const rss = read('rss.xml');
  assert.equal((rss.match(/<item>/g) || []).length, insights.filter(a => a.published !== false).length);
  for (const a of insights.filter(a => a.published !== false)) assert.ok(rss.includes('/posts/' + a.slug + '.html'), a.slug);
  const changed = structuredClone(insights); changed[6].body[0].p += 'mutation';
  assert.ok(!preserved(changed));
  assert.ok(!preserved(insights.filter((_, i) => i !== 6)));
  const reordered = structuredClone(insights); [reordered[6], reordered[7]] = [reordered[7], reordered[6]];
  assert.ok(!preserved(reordered));
});

test('five published cases with 21 photos, conservative copy, phone and discovery links', () => {
  assert.equal(fixture.photos.length, 21);
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.equal(a.published, true);
    assert.equal(a.date, '2026-10-13');
    assert.equal(a.service, c.service);
    assert.equal(a.body.filter(b => b.img).length, c.photoCount);
    for (const b of a.body.filter(b => b.img)) {
      assert.ok(b.imgAlt && b.imgCaption);
      assert.ok(fixture.photos.some(p => p.file === b.img));
    }
    assert.match(JSON.stringify(a.body), /010-2397-8629/);
    assert.doesNotMatch(JSON.stringify(a).replaceAll('010-2397-8629', ''), /\d+\s*동\s*\d+\s*호|sourcePath|driveId|GPS|[A-Z]:\\|010[- ]|100%|평생 보증|최저가/);
    assert.ok(a.consultation && a.caseSummary);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false);
      assert.equal(related.service || (['방수·설비', '누수탐지·수리'].includes(related.category) ? 'leak' : 'interior'), a.service);
    }
    for (const file of ['blog.html', 'sitemap.xml', 'rss.xml']) assert.ok(read(file).includes(c.slug), file + c.slug);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes(a.title));
    for (const b of a.body.filter(b => b.img)) assert.ok(html.includes(b.img), b.img);
  }
  const samsung = site.insights.find(a => a.slug.startsWith('munhwa-samsung'));
  assert.equal(samsung.place, undefined);
  assert.doesNotMatch(samsung.title, /문화동/);
  assert.ok(read('leak.html').includes(samsung.slug));
  assert.equal(site.insights.find(a => a.slug.startsWith('hyosung-')).place, undefined);
  const geumho = site.insights.find(a => a.slug === 'geumho-hansarang-bathroom-coating-threshold-20260828');
  assert.match(JSON.stringify(geumho.body), /8월 23일/);
  assert.match(JSON.stringify(geumho.body), /8월 28일/);
});

test('approved public copies unchanged, no EXIF/XMP and all small-screen variants exist', () => {
  for (const p of fixture.photos) {
    const bytes = fs.readFileSync(path.join(root, p.file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), p.sha256);
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
