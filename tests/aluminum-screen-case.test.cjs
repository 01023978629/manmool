// Public case content only. No customer data, credentials, or external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const slug = 'daejeon-aluminum-window-screen-replacement-20261006';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const site = JSON.parse(read('data/site.json'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// 2026-10-06: 옥천 주택 실제 사진 사례 1건 추가. 이전 58건 전체는 water-outlet-case 검사로 별도 보존 대조.
// 2026-10-11: 승인된 삼호 하부 연결부 사례 1건 추가. 기존 59건 객체·순서는 origin/main과 별도 대조 완료.
const oldHash = '5374c77120808ddbad4325266106c85a8b21c835de9593f4ec26a8cd26a6db1c';
const originalRestHash = '5ce930bbf0be2e52959b420208146a75c42bc16e193f653b728689b6dafa5487';
const preserved = insights => {
  const old = insights.filter(a => a.slug !== slug);
  return old.length === 59 && hash(old) === oldHash;
};
test('방충망 외 59개 원고 객체·순서와 회사·시안 데이터가 그대로다', () => {
  assert.equal(site.insights.length, 60);
  assert.ok(preserved(site.insights));
  const { insights, ...rest } = site;
  assert.equal(hash(rest), originalRestHash);
  const changed = structuredClone(insights);
  changed.find(a => a.slug !== slug).title += '변이';
  assert.equal(preserved(changed), false);
  const removed = insights.filter(a => a.slug !== insights.find(a => a.slug !== slug).slug);
  assert.equal(preserved(removed), false);
  const reversed = structuredClone(insights);
  const oldIndices = reversed.flatMap((a, i) => a.slug !== slug ? [i] : []);
  [reversed[oldIndices[0]], reversed[oldIndices[1]]] = [reversed[oldIndices[1]], reversed[oldIndices[0]]];
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
  assert.equal(a.place.name, '대전 탄방동 한가람아파트');
  assert.match(a.place.note, /실제 작업 현장을 기준으로 확인/);
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
  // 2026-10-06: 대표가 한가람아파트로 확인. 배경 단지명이나 촬영 구간으로 현장·총 작업 시간을 추정하지 않는다.
  assert.doesNotMatch(serialized, /목련아파트|아파트명은 확인되지|둔산남로 인근 아파트|\d+\s*분\s*(?:완료|시공)/);
  assert.ok(a.relatedSlugs.every(s => site.insights.some(x => x.slug === s && x.published !== false && x.service !== 'leak')));
});
test('확인된 한가람아파트가 제목·소개·현장·대표 사진·전후 설명에 일치한다', () => {
  const a = site.insights.find(a => a.slug === slug);
  for (const value of [a.title, a.excerpt, a.place.name, a.caseSummary.site, a.body[0].p,
      a.imageAlt, a.body[0].imgAlt, a.body[0].imgCaption, a.body.at(-1).imgAlt, a.body.at(-1).imgCaption]) {
    assert.match(value, /한가람아파트/);
  }
  const post = read(`posts/${slug}.html`);
  assert.ok(post.includes('href="https://map.naver.com/p/search/' + encodeURIComponent(a.place.name) + '"'));
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
