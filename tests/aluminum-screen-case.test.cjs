// Public case content only. No customer data, credentials, or external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const slug = 'daejeon-aluminum-window-screen-replacement-20261006';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const site = JSON.parse(read('data/site.json'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const oldHash = 'f4748a29bf35e615ab0a19fb81bf75e3b93671d2b76d7b1ab077b39c0a103294';
const originalRestHash = '5ce930bbf0be2e52959b420208146a75c42bc16e193f653b728689b6dafa5487';
const preserved = insights => {
  const old = insights.filter(a => a.slug !== slug);
  return old.length === 57 && hash(old) === oldHash;
};
test('추가 전 57개 원고 객체·순서와 회사·시안 데이터가 그대로다', () => {
  assert.equal(site.insights.length, 58);
  assert.ok(preserved(site.insights));
  const { insights, ...rest } = site;
  assert.equal(hash(rest), originalRestHash);
  const changed = structuredClone(insights);
  changed.find(a => a.slug !== slug).title += '변이';
  assert.equal(preserved(changed), false);
  const removed = insights.filter(a => a.slug !== insights.find(a => a.slug !== slug).slug);
  assert.equal(preserved(removed), false);
  const reversed = structuredClone(insights);
  [reversed[1], reversed[2]] = [reversed[2], reversed[1]];
  assert.equal(preserved(reversed), false);
});
test('실제 인테리어 사례 1건·6단계 사진·문단·상담·개인정보 경계', () => {
  const matches = site.insights.filter(a => a.slug === slug);
  assert.equal(matches.length, 1);
  const a = matches[0];
  assert.equal(a.service, 'interior');
  assert.equal(a.category, '방충망·부분 인테리어');
  assert.equal(a.date, '2026-10-06');
  assert.equal(a.published, true);
  assert.equal(a.place.name, '대전 서구 둔산남로 인근 아파트');
  assert.match(a.place.note, /아파트명은 확인되지/);
  assert.equal(a.body.length, 6);
  assert.equal(a.image, 'assets/cases/aluminum-screen-20261006-06.jpg');
  const photos = a.body.map(b => b.img);
  assert.deepEqual(photos, Array.from({ length: 6 }, (_, i) => `assets/cases/aluminum-screen-20261006-${String(i + 1).padStart(2, '0')}.jpg`));
  assert.equal(new Set(photos).size, 6);
  for (const [i, section] of a.body.entries()) {
    assert.ok(section.h.startsWith(`${i + 1}. `));
    assert.ok(section.imgAlt && section.imgCaption);
    assert.equal(section.p.split('\n\n').length, 2);
    assert.ok(section.p.split('\n\n').every(p => p.length <= 140));
  }
  for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key]);
  assert.ok(a.consultation.photos.length > 20 && a.consultation.scope.length > 20);
  const serialized = JSON.stringify(a);
  assert.doesNotMatch(serialized, /sourcePath|driveId|GPS|36\.34|127\.39|\d+\s*동\s*\d+\s*호|010[- ]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|최저가|100%|평생 보증|고객님께서.*만족/);
  // 배경의 단지명을 촬영 장소로 단정하지 않는다.
  assert.doesNotMatch(serialized, /목련아파트|한가람아파트|\d+\s*분\s*(?:완료|시공)/);
  assert.ok(a.relatedSlugs.every(s => site.insights.some(x => x.slug === s && x.published !== false && x.service !== 'leak')));
});
test('사진 6장과 12개 축소본: JPEG 실재·EXIF 제거·망 교체 전후 캡션', () => {
  const a = site.insights.find(a => a.slug === slug);
  for (const section of a.body) {
    for (const file of [section.img, ...[480, 960].map(w => section.img.replace('cases/', 'cases/resized/').replace('.jpg', `-${w}w.jpg`))]) {
      const bytes = fs.readFileSync(path.join(root, file));
      assert.ok(bytes.length > 1000 && bytes.length < 900000, file);
      assert.equal(bytes.readUInt16BE(0), 0xffd8);
      assert.equal(bytes.indexOf(Buffer.from('Exif\0\0')), -1);
      assert.equal(bytes.indexOf(Buffer.from('http://ns.adobe.com/xap/')), -1);
    }
  }
  assert.match(a.body[0].imgAlt, /찢어진/);
  assert.match(a.body.at(-1).imgCaption, /교체 후/);
});
test('목록·인테리어 필터·RSS·사이트맵·정적 글의 사진과 상담이 연결된다', () => {
  const a = site.insights.find(a => a.slug === slug), post = read(`posts/${slug}.html`), blog = read('blog.html');
  assert.match(blog, new RegExp(`href="posts/${slug}\\.html"[^>]*data-group="interior"`));
  assert.ok(blog.includes(a.title));
  assert.ok(post.includes(a.title));
  assert.ok(post.includes(a.place.note));
  assert.ok(post.includes(`href="https://01023978629.github.io/manmool/posts/${slug}.html"`));
  a.body.forEach(b => { assert.ok(post.includes(`src="../${b.img}"`)); assert.ok(post.includes(`<figcaption>${b.imgCaption}</figcaption>`)); });
  assert.match(post, /data-service="interior"/);
  assert.match(post, /href="\.\.\/index\.html#inquiry"/);
  for (const file of ['rss.xml', 'sitemap.xml']) assert.ok(read(file).includes(`/posts/${slug}.html`));
  assert.ok(!JSON.parse(read('data/leak-case-index.json')).cases.some(c => c.slug === slug));
});
