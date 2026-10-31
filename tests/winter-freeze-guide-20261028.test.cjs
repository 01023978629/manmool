// 2026-10-31: 정보글 '11월 동파 예방' 1건 공개 후보. 새 사진 없이 이미 공개된 사진 4장만 다시 참조한다.
// Public content only. No customer data, field database, accounts or external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const site = JSON.parse(read('data/site.json'));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const SLUG = 'winter-pipe-freeze-prevention-november';
// origin/main(53a6bef)의 insights 65건 전체 — 이 글을 빼면 바이트 단위로 같아야 한다.
const PREVIOUS_COUNT = 65;
const PREVIOUS_HASH = 'e0c2c9abf29f5df0050263b7189dca4518608c1a0b1f276b8d9a050b9c18323c';
const REST_HASH = '5ce930bbf0be2e52959b420208146a75c42bc16e193f653b728689b6dafa5487';
// 사례 작성/정보글 폴더의 정본(insights-entry.json)에서 published 만 true 로 바꾼 객체.
const ENTRY_HASH = '32e78c0ee197e90914a1b0350629cd0acb28c7ac6eb94ed19c2b3f24f51481cc';
const PHOTOS = ['assets/cases/seonbi-20260929-08.jpg', 'assets/cases/seonbi-20260929-01.jpg',
  'assets/cases/pyeonghaneul-leak-8.jpg', 'assets/cases/pyeonghaneul-leak-cover.jpg'];
const RELATED = ['seonbi-boiler-pipe-leak-repair-20260929', 'pyeonghaneul-apartment-leak-repair-20260909', 'rainy-season-waterproof-check'];

const previous = items => items.filter(a => a.slug !== SLUG);
const preserved = items => previous(items).length === PREVIOUS_COUNT && hash(previous(items)) === PREVIOUS_HASH;
const isLeak = a => Object.hasOwn(a, 'service') ? a.service === 'leak' : ['방수·설비', '누수탐지·수리'].includes(a.category);

// 누수 랜딩(#cases)은 '실제 현장 기록' 칸이다. 이 글은 사례가 아니라 안내 글이므로
// 카드가 안내 글로 읽히는지(라벨·링크 문구)를 따로 본다.
function inspectLeakCard(leak) {
  const failures = [];
  const start = leak.search(/<section\b[^>]*\bid="cases"/);
  const section = start < 0 ? '' : leak.slice(start, leak.indexOf('</section>', start));
  const cards = [...section.matchAll(/<article\b[^>]*class="case-card registered-case"[^>]*>[\s\S]*?<\/article>/g)].map(m => m[0]);
  const mine = cards.filter(c => c.includes(`posts/${SLUG}.html`));
  if (mine.length !== 1) return [`#cases 카드 ${mine.length}장(1장이어야 함)`];
  const card = mine[0];
  if (!/<small>[^<]*동파 예방 안내<\/small>/.test(card)) failures.push('카드 라벨이 안내 글임을 밝히지 않는다');
  if (/현장 기록 보기/.test(card)) failures.push('안내 글 카드가 현장 기록 링크 문구를 쓴다');
  if (!/>동파 점검 순서 보기</.test(card)) failures.push('카드 링크 문구가 다르다');
  if (!card.includes('src="assets/cases/seonbi-20260929-08.jpg"')) failures.push('카드 사진이 정본 대표 사진이 아니다');
  return failures;
}

test('기존 65건 객체·순서와 회사·시안 데이터는 origin/main 그대로, 변이 검출', () => {
  assert.equal(site.insights.length, PREVIOUS_COUNT + 1);
  assert.ok(preserved(site.insights));
  const { insights, ...rest } = site;
  assert.equal(hash(rest), REST_HASH);
  const changed = structuredClone(insights); changed.find(a => a.slug !== SLUG).title += '변이';
  assert.ok(!preserved(changed));
  assert.ok(!preserved(insights.filter((a, i) => i !== insights.findIndex(x => x.slug !== SLUG))));
  const reordered = structuredClone(insights); [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  assert.ok(!preserved(reordered));
});

test('정본 그대로·공개·누수 분야·사진 4장 재사용·단정/수치/개인정보 없음', () => {
  const matches = site.insights.filter(a => a.slug === SLUG);
  assert.equal(matches.length, 1);
  const a = matches[0];
  assert.equal(site.insights.indexOf(a), 0, '날짜 내림차순 맨 앞');
  assert.equal(hash(a), ENTRY_HASH);
  assert.equal(a.published, true);
  assert.equal(a.date, '2026-10-28');
  assert.ok(isLeak(a));
  assert.equal(a.caseSummary, undefined, '안내 글은 사례 요약이 없다');
  assert.equal(a.place, undefined, '안내 글은 장소 칸이 없다');
  assert.deepEqual([a.image, ...a.body.filter(b => b.img).map(b => b.img)], PHOTOS);
  for (const b of a.body.filter(b => b.img)) assert.ok(b.imgAlt && b.imgCaption, b.img);
  const text = JSON.stringify(a);
  assert.doesNotMatch(text, /\d+\s*동\s*\d+\s*호|재발|100%|최저가|평생 보증|무료|℃|°C|\d\s*만\s*원|\d\s*원[^가-힣]|sourcePath|driveId|GPS|[A-Z]:\\/);
  assert.deepEqual(a.relatedSlugs, RELATED);
  for (const slug of RELATED) {
    const r = site.insights.find(x => x.slug === slug);
    assert.ok(r && r.published !== false && isLeak(r), slug);
  }
  for (const photo of PHOTOS) {
    for (const file of [photo, ...[480, 960].map(w => photo.replace('assets/cases/', 'assets/cases/resized/').replace('.jpg', `-${w}w.jpg`))]) {
      const data = fs.readFileSync(path.join(root, file));
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

test('생성 글·목록·RSS·사이트맵·누수 색인 연결, 관련 글 3개 순서', () => {
  const a = site.insights.find(x => x.slug === SLUG);
  const post = read(`posts/${SLUG}.html`);
  assert.ok(post.includes(`<h1 class="post-title">${a.title}</h1>`) || post.includes(a.title));
  for (const photo of PHOTOS) assert.ok(post.includes('../' + photo), photo);
  assert.ok(post.includes(`href="../leak.html?case=${SLUG}#leakInquiry"`));
  assert.ok(post.includes('class="post-cta-prep"') && post.includes('class="post-cta-scope"'));
  const relatedBlock = post.slice(post.indexOf('class="post-related"'));
  const related = [...relatedBlock.matchAll(/class="insight-card" href="([^"]+)\.html"/g)].map(m => m[1]);
  assert.deepEqual(related, RELATED);
  const blog = read('blog.html');
  assert.match(blog, new RegExp(`<a class="insight-card" href="posts/${SLUG}\\.html" data-group="leak" data-date="2026-10-28"`));
  assert.doesNotMatch(blog, new RegExp(`insight-featured[^>]*href="posts/${SLUG}\\.html"`), '안내 글은 대표 사례 칸에 오지 않는다');
  assert.ok(read('rss.xml').includes(`/posts/${SLUG}.html`));
  assert.match(read('sitemap.xml'), new RegExp(`posts/${SLUG}\\.html</loc>\\s*<lastmod>2026-10-28</lastmod>`));
  assert.ok(JSON.parse(read('data/leak-case-index.json')).cases.some(c => c.slug === SLUG));
});

test('누수 랜딩 카드는 안내 글로 표시, 변이 검출', () => {
  const leak = read('leak.html');
  assert.deepEqual(inspectLeakCard(leak), []);
  const mutations = [
    ['카드 라벨이 안내 글임을 밝히지 않는다', s => s.replace('실제 보온 작업 사진 · 동파 예방 안내', '법동 · 2026-10-28 촬영')],
    ['안내 글 카드가 현장 기록 링크 문구를 쓴다', s => s.replace('>동파 점검 순서 보기<', '>현장 기록 보기<')],
    ['#cases 카드 0장(1장이어야 함)', s => s.replaceAll(`posts/${SLUG}.html`, 'posts/removed.html')],
  ];
  for (const [expected, change] of mutations) assert.ok(inspectLeakCard(change(leak)).includes(expected), expected);
});
