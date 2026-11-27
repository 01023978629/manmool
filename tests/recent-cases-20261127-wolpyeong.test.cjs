// 2026-11-27 photo case (second of the day), split into one post per home on 2026-11-28: rain-pipe base fittings on the front
// and back verandas of two homes at the Wolpyeong Town apartments in Wolpyeong-dong, Seo-gu, Daejeon (2026-11-26, leak). Water
// was dripping into the homes below and their paint was peeling; on one day both homes were done, front and back veranda each:
// protection, pipe taken off, floor cut square, new white base part and square base set, rain pipe reconnected, ceiling-side
// joint re-installed.
// 2026-11-27: published as one combined post (PR #246, wolpyeong-town-two-homes-veranda-rain-pipe-fitting-20261126).
// 2026-11-28: on the owner's instruction ("세대 나눠서 올려줘") the combined post was taken down and replaced by two posts, one per
// home (first home = the morning job, second home = the afternoon job), both at the same date position. Each is the owner-side
// draft in the case folder (insights-entry.json, published:false) with only published set to true, pinned whole (entryHash).
// The combined post's URL went live on 11/27, so posts/<old slug>.html stays as a small noindex page that sends readers to the
// first home's post (scripts/post-redirects.json, written by prerender-posts.py); it is in no list, RSS, sitemap or index.
// Owner rule for these posts: the word '방수' appears nowhere in their own public text — the only allowed occurrence is the site
// category name '방수·설비' (category field and the rendered category labels).
// The 94 entries before them are pinned as one object (unchanged since origin/main 25f1cd4, PR #245 merge). They sit right after
// the 11/27 Namdaejeon e-Pyeonhan entry (which keeps the blog featured slot and blog.html lastmod 2026-11-27) and before the 11/18
// Heightsville entry. As the newest leak cases they get the first two leak landing cards (count 47 -> 48: the combined card was
// replaced by two) and leak index entries; leak.html lastmod stays 2026-11-26.
// Only the dong and complex name are public: no building/unit numbers, road address, customer, cost, partner company, workers or
// location metadata. Both are registered under Seo-gu (Wolpyeong-dong) in scripts/post-areas.json, so the Seo-gu area page lists
// them (10 -> 11 cases) and its sitemap lastmod stays 2026-11-26.
// Public case content only: no field database, accounts or external writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findHidden, describeHidden } = require('../scripts/lib/hidden-terms.cjs');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/recent-cases-20261127-wolpyeong.json');
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
// Neighbours at the date position (list), the next leak landing card, and the featured case that does not change.
const BEFORE = 'nangwol-namdaejeon-epyeonhan-33py-remodel-20261127', AFTER = 'heightsville-extension-floor-heating-screed-20261118';
const CARD_AFTER = 'saeyeoul-toilet-drain-pipe-insert-20261117';
const FEATURED = BEFORE;
const LAUNDRY = 'wolpyeong-town-laundry-rain-pipe-joint-20261029';
const PLACE = '대전 서구 월평동 월평타운';
const ORDINAL = ['첫 번째', '두 번째'];
const OLD = fixture.retired.slug;
// The owner's rule for these posts: no '방수' in their own public text. The category name '방수·설비' is the only allowed form.
const HIDDEN_WORD = /방수/;
const CATEGORY_LABEL = /방수·설비/g;
const ownText = a => { const { category, ...rest } = a; return JSON.stringify(rest); };
const withoutCategory = html => html.replace(CATEGORY_LABEL, '');
// No building/unit numbers, road addresses, local paths, drive ids, location metadata or phone/e-mail patterns.
// ('번지' only with a number: the closing section says a stain '번지거나' = spreads, which is not an address.)
const LOCATION = /\d+\s*동(?![가-힣])|\d+\s*호(?![가-힣])|\d+\s*동\s*\d+\s*호|\d+\s*층|\d\s*라인|[가-힣]\d{1,3}(?:로|길)(?![가-힣])|(?:로|길)\s*\d+|번길|\d+\s*번지|sourcePath|driveId|GPS|좌표|위도|경도|\d{1,3}\.\d{4,}|[A-Za-z]:[\\/]|file:\/\/|01[016789][- .]?\d{3,4}[- .]?\d{4}|\d{2,3}-\d{3,4}-\d{4}|@[\w.-]+\.[A-Za-z]{2,}/;
// No customer names or honorifics, cost, budget, estimate numbers, client or partner companies, workers, or unverifiable claims.
const PRIVATE = /고객님|사장님|사모님|[가-힣]{2,3}\s?씨(?![가-힣])|\d[\d,.]*\s*(?:천|만|억)\s*원|\d{1,3}(?:,\d{3})+\s*원|\d+\s*원(?![가-힣])|₩|평당|예산|견적번호|견적서|발주|작업자|협력\s*업체|관리사무소|관리소|100%|평생 보증|최저가|무조건|업계 1위|완벽|원인은|누수 원인|해결|하자|완공|공사 완료|시공 완료/;

test('the 94 entries before these cases keep their object and order; date position; combined entry gone; mutation guards active', () => {
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
  // The combined entry is gone; the two per-home entries take its place (first home, then second home).
  assert.equal(insights.filter(a => a.slug === OLD).length, 0);
  assert.equal(new Set(slugs).size, 2);
  assert.ok(!slugs.includes(OLD));
  // Date position: everything before them is newer, everything after them is older; exact neighbours as at origin/main.
  const at = insights.findIndex(a => a.slug === slugs[0]), day = fixture.cases[0].date;
  assert.equal(at, 1, slugs[0]);
  assert.equal(insights[at + 1].slug, slugs[1]);
  assert.ok(fixture.cases.every(c => c.date === day));
  assert.ok(insights.slice(0, at).every(a => a.date > day), slugs[0]);
  assert.ok(insights.slice(at + 2).every(a => a.date < day), slugs[1]);
  assert.equal(insights[at - 1].slug, BEFORE);
  assert.equal(insights[at + 2].slug, AFTER);
  // Older than the 11/27 case, so the featured (first real) case does not change.
  const firstCase = insights.find(a => a.published !== false && Object.keys(a.caseSummary || {}).length);
  assert.equal(firstCase.slug, FEATURED);
});

test('two cases: owner-side drafts as written, 6 photos each, leak service, place wording, no waterproofing word, no private data', () => {
  assert.equal(fixture.cases.length, 2);
  const allPhotos = fixture.cases.flatMap(c => c.photos.map(p => p.file));
  assert.equal(allPhotos.length, 12);
  assert.equal(new Set(allPhotos).size, 12);
  fixture.cases.forEach((c, n) => {
    const a = site.insights.find(a => a.slug === c.slug);
    assert.ok(a, c.slug);
    assert.equal(site.insights.filter(x => x.slug === c.slug).length, 1, c.slug);
    assert.equal(a.published, true);
    // The draft with only published:true — wording, photo order and captions are exactly as written.
    assert.equal(hash(a), c.entryHash, c.slug + ' entry changed');
    assert.equal(a.date, c.date);
    assert.ok(c.slug.endsWith(a.date.replaceAll('-', '')), c.slug);
    assert.ok(c.slug.startsWith('wolpyeong-town-' + ['first', 'second'][n] + '-home-'), c.slug);
    assert.equal(a.service, c.service);
    assert.equal(a.category, c.category);
    assert.equal(serviceOf(a), c.service);
    // Place: dong and complex name only. The title names the dong and complex; the excerpt and first section name the gu too.
    // Which home it is reads only as '첫 번째 세대' / '두 번째 세대' (no building or unit number).
    assert.equal(a.place.name, c.placeName);
    assert.equal(c.placeName, PLACE);
    assert.match(a.place.note, /공개하지 않습니다/);
    assert.ok(a.title.startsWith('대전 월평동 월평타운 ') && a.title.includes('｜') && a.title.length <= 65, c.slug);
    assert.ok(a.title.endsWith(ORDINAL[n] + ' 세대'), c.slug);
    assert.ok(a.caseSummary.site.startsWith('월평타운 ' + ORDINAL[n] + ' 세대 '), c.slug);
    assert.ok(a.excerpt.startsWith(PLACE + ' ') && a.excerpt.includes(ORDINAL[n] + ' 집'), c.slug);
    assert.ok(a.body[0].p.startsWith(PLACE + ' ') && a.body[0].p.includes(ORDINAL[n] + ' 세대'), c.slug);
    const text = JSON.stringify(a);
    assert.equal((text.match(/월평동/g) || []).length, (text.match(/월평동 월평타운/g) || []).length);
    // Owner rule: the waterproofing part of this job is not public. Only the category name may carry the word.
    assert.doesNotMatch(ownText(a), HIDDEN_WORD);
    assert.equal(a.category, '방수·설비');
    // Partner/contractor and worker names are matched by sha256 (scripts/lib/hidden-terms.cjs), never written as text here.
    { const hidden = findHidden(text, 'partners', 'people'); assert.equal(hidden, null, `${a.slug} ${describeHidden(hidden)}`); }
    assert.doesNotMatch(text, LOCATION);
    assert.doesNotMatch(text, PRIVATE);
    // What the records do not show is said plainly instead of guessed.
    assert.match(a.caseSummary.result, /통수 결과·작업 시간은 미기재/);
    assert.match(a.body.at(-1).p, /자료가 없어 적지 않았습니다/);
    const figures = a.body.filter(b => b.img);
    assert.equal(figures.length, c.photoCount);
    assert.equal(c.photoCount, 6);
    assert.ok(a.excerpt.includes('실제 사진 ' + c.photoCount + '장'), c.slug);
    assert.ok(a.body.at(-1).h.endsWith('확인한 범위와 상담 안내') && !a.body.at(-1).img, c.slug);
    a.body.forEach((b, k) => assert.ok(b.h.startsWith((k + 1) + '. '), b.h));
    assert.ok(figures.some(b => b.img === a.image) && a.imageAlt === figures.find(b => b.img === a.image).imgAlt, c.slug + ' cover');
    for (const b of figures) assert.ok(b.imgAlt && b.imgCaption, b.img);
    assert.deepEqual(figures.map(b => b.img), c.photos.map(p => p.file), c.slug);
    // Same-spot before/after pairs are named in the text ('N번 사진과 같은 자리').
    for (const b of a.body) for (const [, k] of (b.h + b.p).matchAll(/(\d)번 사진/g)) assert.ok(Number(k) >= 1 && Number(k) <= figures.length, b.h);
    assert.ok(a.consultation && a.consultation.photos && a.consultation.scope && a.caseSummary, c.slug);
    assert.match(a.consultation.scope, /최종 범위와 금액은 현장 확인 후 안내합니다/);
    for (const key of ['site', 'issue', 'work', 'result']) assert.ok(a.caseSummary[key].trim(), c.slug + ' ' + key);
    // Related: the other home's post first, then the earlier laundry case in the same complex; never the retired URL.
    assert.deepEqual(a.relatedSlugs, [slugs[1 - n], LAUNDRY], c.slug);
    for (const r of a.relatedSlugs) {
      const related = site.insights.find(b => b.slug === r);
      assert.ok(related && related.published !== false && r !== a.slug, r);
      assert.equal(serviceOf(related), a.service, r);
      assert.doesNotMatch(related.title, HIDDEN_WORD, r);
    }
    // Mutation guards: the patterns above really catch the hidden word, a unit number, a phone number and a price.
    { const copy = structuredClone(a); copy.body[3].p += ' 방수'; assert.match(ownText(copy), HIDDEN_WORD); assert.notEqual(hash(copy), c.entryHash); }
    { const copy = structuredClone(a); copy.caseSummary.work += ' · 방수 마감'; assert.match(ownText(copy), HIDDEN_WORD); }
    for (const extra of ['101동 1203호', '010-1234-5678', '350만 원', '2,500,000원']) {
      const copy = structuredClone(a); copy.body[0].p += ' ' + extra;
      assert.ok(LOCATION.test(JSON.stringify(copy)) || PRIVATE.test(JSON.stringify(copy)), extra);
      assert.notEqual(hash(copy), c.entryHash, extra);
    }
  });
});

test('discovery: leak list cards, RSS, sitemap, leak index, first two leak landing cards, Seo-gu area page — none with the hidden word', () => {
  const leak = read('leak.html'), blog = read('blog.html'), rss = read('rss.xml');
  const index = JSON.parse(read('data/leak-case-index.json'));
  const areas = JSON.parse(read('scripts/post-areas.json'));
  const area = read('area/daejeon-seo-gu.html');
  for (const c of fixture.cases) {
    const a = site.insights.find(a => a.slug === c.slug);
    // List: a normal card in the leak group (the featured slot stays with the 11/27 case).
    const listCard = (blog.match(new RegExp(`<a class="insight-card" href="posts/${c.slug}\\.html" data-group="${c.service}" data-date="${c.date}"[\\s\\S]*?</a>`)) || [])[0];
    assert.ok(listCard, 'blog card ' + c.slug);
    assert.doesNotMatch(withoutCategory(listCard), HIDDEN_WORD);
    const item = (rss.match(new RegExp(`<item>(?:(?!</item>)[\\s\\S])*?/posts/${c.slug}\\.html[\\s\\S]*?</item>`)) || [])[0];
    assert.ok(item, 'rss ' + c.slug);
    assert.doesNotMatch(item, HIDDEN_WORD);
    assert.equal(sitemapLastmod(`posts/${c.slug}.html`), a.updated || a.date);
    const entries = index.cases.filter(x => x.slug === c.slug);
    assert.equal(entries.length, 1, 'leak index ' + c.slug);
    assert.doesNotMatch(JSON.stringify(entries[0]), HIDDEN_WORD);
    assert.equal(leak.includes(`href="posts/${c.slug}.html"`), c.leakCard, 'leak card ' + c.slug);
    // Area: written as '대전 서구 월평동', registered under Seo-gu; the Seo-gu page lists it and the post links back to it.
    assert.deepEqual(areas[c.slug], { gu: c.gu, dong: c.dong });
    const areaCard = (area.match(new RegExp(`<a class="insight-card" href="\\.\\./posts/${c.slug}\\.html"[\\s\\S]*?</a>`)) || [])[0];
    assert.ok(areaCard, 'area card ' + c.slug);
    assert.doesNotMatch(withoutCategory(areaCard), HIDDEN_WORD);
    assert.equal(sitemapLastmod('area/daejeon-seo-gu.html'), c.date);
    const html = read('posts/' + c.slug + '.html');
    assert.ok(html.includes('href="../area/daejeon-seo-gu.html"'), 'area link ' + c.slug);
    assert.ok(html.includes(a.title.replaceAll('&', '&amp;')));
    assert.ok(html.includes(`<link rel="canonical" href="https://01023978629.github.io/manmool/posts/${c.slug}.html"`));
    assert.doesNotMatch(html, /name="robots"[^>]*noindex/);
    for (const b of a.body.filter(b => b.img)) assert.ok(html.includes(`src="../${b.img}"`), b.img);
    const cta = html.match(/<div class="post-cta">[\s\S]*?<\/div>/)[0];
    assert.ok(cta.includes(`href="../leak.html?case=${c.slug}#leakInquiry"`), c.slug);
    // The post page: apart from the category labels and the related-post cards (other posts' own titles), no hidden word.
    const related = html.match(/<div class="post-related">[\s\S]*?<\/div>\s*<\/div>/);
    assert.ok(related, 'related block ' + c.slug);
    for (const r of a.relatedSlugs) assert.ok(related[0].includes(`href="${r}.html"`), r);
    assert.ok(!related[0].includes(`href="${OLD}.html"`));
    assert.doesNotMatch(withoutCategory(html.replace(related[0], '')), HIDDEN_WORD);
  }
  // Leak landing: count 47 -> 48 (the combined card replaced by two); the two cards lead (first home, then second home), right
  // before the 11/17 Saeyeoul card, each once, with its own cover photo, alt, title, excerpt and place.
  assert.equal((leak.match(/class="case-card registered-case"/g) || []).length, 48);
  const cards = leakCardSlugs(leak);
  assert.deepEqual(cards.slice(0, 2), slugs);
  assert.equal(cards[2], CARD_AFTER);
  for (const s of slugs) {
    assert.equal(cards.filter(x => x === s).length, 1);
    const a = site.insights.find(x => x.slug === s);
    const card = leak.match(new RegExp(`<article class="case-card registered-case">\\s*<a class="case-photo-pair" href="posts/${s}\\.html"[\\s\\S]*?</article>`))[0];
    assert.ok(card.includes(`src="${a.image}"`) && card.includes(`<h3>${a.title}</h3>`) && card.includes(`alt="${a.imageAlt}"`));
    assert.ok(card.includes(`<p>${a.excerpt}</p>`));
    assert.ok(card.includes(`${a.place.name} · ${a.date} 촬영`));
    assert.doesNotMatch(card, HIDDEN_WORD);
  }
  // The featured slot stays with the 11/27 case. blog.html follows the newest post (11/27); leak.html the newest leak case (11/26).
  assert.equal((blog.match(/class="insight-featured"/g) || []).length, 1);
  assert.match(blog, new RegExp(`<a class="insight-featured" href="posts/${FEATURED}\\.html"`));
  const day = x => x.updated || x.date, newest = items => items.map(day).sort().at(-1);
  assert.equal(sitemapLastmod('blog.html'), newest(site.insights.filter(x => x.published !== false)));
  assert.equal(sitemapLastmod('leak.html'), newest(site.insights.filter(x => x.published !== false && serviceOf(x) === 'leak')));
  assert.equal(sitemapLastmod('blog.html'), '2026-11-27');
  assert.equal(sitemapLastmod('leak.html'), '2026-11-26');
  assert.ok(fs.statSync(path.join(root, 'data/leak-case-index.json')).size < 16 * 1024);
});

test('retired combined URL: a small noindex page that sends readers to the first home, listed nowhere', () => {
  const redirects = JSON.parse(read('scripts/post-redirects.json'));
  assert.deepEqual(redirects[OLD], { to: fixture.retired.redirectTo, also: fixture.retired.also, since: '2026-11-28' });
  assert.equal(fixture.retired.redirectTo, slugs[0]);
  assert.deepEqual(fixture.retired.also, [slugs[1]]);
  const page = read(`posts/${OLD}.html`);
  assert.match(page, /<meta name="robots" content="noindex, follow" \/>/);
  assert.ok(page.includes(`<link rel="canonical" href="https://01023978629.github.io/manmool/posts/${slugs[0]}.html" />`));
  assert.ok(page.includes(`<meta http-equiv="refresh" content="0; url=${slugs[0]}.html" />`));
  for (const s of slugs) {
    const a = site.insights.find(x => x.slug === s);
    assert.ok(page.includes(`<a href="${s}.html">${a.title}</a>`), s);
  }
  // Nothing of the old post is left on it: no photos, no body text, no script, no hidden word.
  assert.doesNotMatch(page, /<img|<script|assets\/cases|두 세대|네 곳/);
  assert.doesNotMatch(page, HIDDEN_WORD);
  // Listed nowhere: no list card, RSS item, sitemap URL, leak index entry, landing card, area registration or area card.
  for (const file of ['blog.html', 'rss.xml', 'sitemap.xml', 'data/leak-case-index.json', 'leak.html', 'scripts/post-areas.json',
    'area/daejeon-seo-gu.html', 'area/daejeon-jung-gu.html', 'area/daejeon-yuseong-gu.html', 'area/daejeon-daedeok-gu.html']) {
    assert.ok(!read(file).includes(OLD), file);
  }
  // No published post links to it either.
  for (const a of site.insights.filter(x => x.published !== false)) assert.ok(!read(`posts/${a.slug}.html`).includes(`${OLD}.html`), a.slug);
});

test('public photo copies unchanged, long side as pinned, only a JFIF header (no EXIF/GPS/XMP), small-screen variants', () => {
  for (const p of fixture.cases.flatMap(c => c.photos)) {
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
        // APP0 (JFIF) only: no APP1 EXIF/XMP, APP2 ICC, APP11 JUMBF/C2PA, APP13 IPTC or any other application segment; no comment.
        if (marker >= 0xe0 && marker <= 0xef) assert.equal(marker, 0xe0, file + ': APP' + (marker - 0xe0));
        assert.notEqual(marker, 0xfe, file + ': COM');
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
