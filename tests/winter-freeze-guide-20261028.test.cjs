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
// origin/main(1f1dfe2, 10월 사례 10건 공개 후)의 insights 75건 전체 — 이 글을 빼면 바이트 단위로 같아야 한다.
// 2026-11-03: 선비마을 1단지 외벽(옹벽) 미장 보수 사례 1건 추가(기존 글 수정 없음). 그 전 76건 전체 객체·순서는 recent-cases-20261103 검사가 따로 고정한다.
// 2026-11-04: 목화아파트·둔산동 데크·아이파크시티 사례 3건 추가(기존 글 수정 없음). 그 전 77건 전체 객체·순서는 recent-cases-20261104 검사가 따로 고정한다.
// 2026-11-12: 삼호아파트·유원아파트 베란다 우수관 하부(11/10)·열매마을 우수관 박스(11/6) 사례 3건 추가(기존 글 수정 없음). 그 전 80건 전체 객체·순서는 recent-cases-20261112 검사가 따로 고정한다.
// 2026-11-13: 문창동 난방 분배기·밸브 교체·교촌동 미메이드아파트 온수 배관 보수·탄방동 바닥 미장(11/12) 사례 3건을 맨 앞에 추가(기존 글 수정 없음). 그 전 83건 전체 객체·순서는 recent-cases-20261113 검사가 따로 고정한다.
// 2026-11-17: 새여울아파트 양변기 배관 삽입(11/17)·삼호아파트 앞베란다 우수관 방수(11/16)·열매마을 욕조 자리 방수·바닥 미장(11/14)·목양마을아파트 세면대 배관(11/10) 사례 4건을 날짜 자리에 추가(기존 글 수정 없음). 그 전 86건 전체 객체·순서는 recent-cases-20261117 검사가 따로 고정한다.
// 2026-11-18: 충남 공주 공장 컨테이너 옆 판넬 지붕·벽체(11/9, 인테리어) 사례 1건을 날짜 자리에 추가(기존 글 수정 없음). 그 전 90건 전체 객체·순서는 recent-cases-20261118 검사가 따로 고정한다.
// 2026-11-18: 청주 용암동 태산그린아파트 옥상 배수구 2곳·앞베란다 우수관(11/13) 사례 1건을 날짜 자리에 추가(기존 글 수정 없음). 그 전 91건 전체 객체·순서는 recent-cases-20261118-taesan 검사가 따로 고정한다.
// 2026-11-21: 대전 유성구 관평동 하이츠빌아파트 확장부 난방 배관·미장(11/18, 인테리어) 사례 1건을 맨 앞에 추가(기존 글 수정 없음). 그 전 92건 전체 객체·순서는 recent-cases-20261121 검사가 따로 고정한다.
// 2026-11-25: 최근 사례 5편(11/18 하이츠빌·11/17 새여울·11/16 삼호 앞베란다·11/14 열매마을 욕조 자리·11/13 태산그린)의 글을 보강했다(docs/case-enrich-20261125.md — 소개문·단계 설명·'알아 두면 좋은 점' 한 칸·updated·readMin). 사진·날짜·장소·순서와 나머지 88건은 그대로이고, 이 고정값은 그 5편의 새 글로 다시 계산했다.
// 2026-11-27: 대전 동구 낭월동 남대전 이편한세상아파트 33평 리모델링(11/27, 인테리어) 사례 1건을 맨 앞에 추가(기존 글 수정 없음). 그 전 93건 전체 객체·순서는 recent-cases-20261127 검사가 따로 고정한다.
// 2026-11-27: 대전 서구 월평동 월평타운 두 세대 앞·뒤 베란다 우수관 하부 부속 교체(11/26, 누수) 사례 1건을 11/27 남대전 글 바로 뒤(날짜 자리)에 추가(기존 글 수정 없음). 그 전 94건 전체 객체·순서는 recent-cases-20261127-wolpyeong 검사가 따로 고정한다.
// 2026-11-28: 대표 지시로 11/26 월평타운 두 세대 합친 글을 세대별 두 글(첫 번째·두 번째 세대, 같은 날짜 자리)로 나눴다 — 합친 글 1건을 빼고 2건을 넣어 글이 1건 늘었다(다른 글 수정 없음). 그 전 94건 전체 객체·순서는 recent-cases-20261127-wolpyeong 검사가 따로 고정한다.
const PREVIOUS_COUNT = 95;
const PREVIOUS_HASH = 'c20cdd55a1c2e993137eb8227c1d5464934489a7466460385fa5bbd820457b51';
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
  // 10월 29일 사례 3건이 더 최근이라 날짜 순서 자리(앞 글 날짜 ≥ 이 글 ≥ 뒤 글)에 있는지 본다.
  const k = site.insights.indexOf(a);
  assert.ok(k > 0 && site.insights[k - 1].date >= a.date && site.insights[k + 1].date <= a.date, '날짜 내림차순 자리');
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
