// Public case only. No customer identifiers, original paths, or precise coordinates.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), slug = 'water-outlet-wall-repair-20261006';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const site = JSON.parse(read('data/site.json'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// 2026-10-11: 승인 원고 그대로 삼호 하부 연결부 사례 1건 추가. origin/main의 기존 59건 전체 객체·순서 별도 대조 완료.
const baseline = 'f3889484035bde00f50f3aaa0fb3727fb962e426c42de7fb6153ebf7a962c454';
function preserved(items) {
  const old = items.filter(a => a.slug !== slug);
  return old.length === 59 && hash(old) === baseline;
}
test('옥천 외 59개 글 객체·사진 설명·순서와 회사 데이터 보존, 변이 검출', () => {
  assert.equal(site.insights.length, 60);
  assert.ok(preserved(site.insights));
  const { insights, ...rest } = site;
  assert.equal(hash(rest), '5ce930bbf0be2e52959b420208146a75c42bc16e193f653b728689b6dafa5487');
  const changed = structuredClone(insights);
  changed[1].title += '변이';
  assert.equal(preserved(changed), false);
  assert.equal(preserved(insights.filter(a => a.slug !== insights[1].slug)), false);
  const reversed = structuredClone(insights);
  [reversed[1], reversed[2]] = [reversed[2], reversed[1]];
  assert.equal(preserved(reversed), false);
});
function privateSafe(a) {
  const text = JSON.stringify(a);
  return a.place?.name === '충청북도 옥천군'
    && !/sourcePath|sourcePlace|driveId|file:\/\/|[A-Za-z]:[\\/]|GPS|좌표|\d{1,3}\.\d{3,}|\d+\s*동\s*\d+\s*호|(?:읍|면|로|길)\s*\d+|010[- ]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text);
}
test('옥천군 주택만 공개, 4개 소제목과 사진 2장, 몰탈 보수 단계로 구분', () => {
  const matches = site.insights.filter(a => a.slug === slug), a = matches[0];
  assert.equal(matches.length, 1);
  assert.equal(a.published, true);
  assert.equal(a.service, 'leak');
  assert.equal(a.category, '급수배관·벽체 보수');
  assert.equal(a.date, '2026-10-06');
  assert.ok(privateSafe(a));
  assert.match(a.place.note, /군 단위/);
  assert.match(a.place.note, /현장 주소가 아닌/);
  assert.match(a.title, /옥천 주택/);
  assert.match(a.body[0].p, /10월 5일 촬영/);
  assert.equal(a.body.length, 4);
  a.body.forEach((b, i) => {
    assert.ok(b.h.startsWith((i + 1) + '. '));
    assert.equal(b.p.split('\n\n').length, 2);
    assert.ok(b.p.split('\n\n').every(p => p.length <= 140));
  });
  const sections = a.body.filter(b => b.img);
  assert.deepEqual(sections.map(b => b.img), [1, 2].map(i => 'assets/cases/' + slug + '-0' + i + '.jpg'));
  assert.ok(sections.every(b => b.imgAlt && b.imgCaption));
  assert.match(sections[1].imgCaption, /중간 단계/);
  assert.match(sections[1].p, /타일 마감이나 수전 설치가 끝난 모습은 아닙니다/);
  assert.doesNotMatch(JSON.stringify(a), /누수 원인을 확정|누수 없음 확인|압력시험 통과|최저가|평생 보증|고객님께서.*만족/);
  const exposed = structuredClone(a);
  exposed.place.name = '합성 읍 상세 주소';
  assert.equal(privateSafe(exposed), false);
  const coordinate = structuredClone(a);
  coordinate.latitude = 37.12345;
  assert.equal(privateSafe(coordinate), false);
  const service = x => x.service || (['방수·설비', '누수탐지·수리'].includes(x.category) ? 'leak' : 'interior');
  assert.ok(a.relatedSlugs.every(s => site.insights.some(x => x.slug === s && x.published !== false && service(x) === 'leak')));
});
const fingerprints = {
  'water-outlet-wall-repair-20261006-01.jpg': '4f6702b019748dae279b4ad57ac6ad6e3361fbb718051d893aabf83a8a0e76c8',
  'water-outlet-wall-repair-20261006-02.jpg': '901a12ebb0b98f1f7d1b23734970193065b5a189a66e221e6b5724434d55badf',
  'resized/water-outlet-wall-repair-20261006-01-480w.jpg': '5d377808a41e2c658a3eb67847dde959bb979355fbed4d2a8be639f96fba73ea',
  'resized/water-outlet-wall-repair-20261006-01-960w.jpg': 'a59c5e63b584cb78de72b58cb0a51d4d7a2b4006df6a4b5a79d6cc6a5139a34f',
  'resized/water-outlet-wall-repair-20261006-02-480w.jpg': '5e0189c574444d87d3491592e18f497281befbdd4c686330aeb9c6dc98c4b67c',
  'resized/water-outlet-wall-repair-20261006-02-960w.jpg': 'f1b4f5037ecd6efefc15d0326ad71ab829233cc0835f87c5bb85e27de0f96659'
};
test('원본을 변경하지 않은 공개 JPEG 2장·축소본 4개: 지문·메타데이터·용량', () => {
  for (const [file, expected] of Object.entries(fingerprints)) {
    const bytes = fs.readFileSync(path.join(root, 'assets/cases', file));
    assert.ok(bytes.length > 1000 && bytes.length < 480 * 1024, file);
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.equal(bytes.indexOf(Buffer.from('Exif\0\0')), -1);
    assert.equal(bytes.indexOf(Buffer.from('http://ns.adobe.com/xap/')), -1);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected);
  }
});
test('글·목록·배관 분야·지도·RSS·사이트맵·상담 경로 연결', () => {
  const a = site.insights.find(a => a.slug === slug), post = read('posts/' + slug + '.html');
  assert.ok(post.includes(a.title));
  assert.ok(post.includes('href="https://map.naver.com/p/search/' + encodeURIComponent('충청북도 옥천군') + '"'));
  assert.ok(post.includes('href="../leak.html?case=' + slug + '#leakInquiry"'));
  for (const b of a.body.filter(b => b.img)) {
    assert.ok(post.includes('src="../' + b.img + '"'));
    assert.ok(post.includes('<figcaption>' + b.imgCaption + '</figcaption>'));
  }
  assert.match(read('blog.html'), new RegExp('href="posts/' + slug + '\\.html"[^>]*data-group="leak"'));
  for (const file of ['leak.html', 'rss.xml', 'sitemap.xml']) assert.ok(read(file).includes('/' + slug + '.html'), file);
  assert.equal(JSON.parse(read('data/leak-case-index.json')).cases.filter(a => a.slug === slug).length, 1);
});
