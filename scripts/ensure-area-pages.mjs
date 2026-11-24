#!/usr/bin/env node
/* ensure-area-pages.mjs — 대전 구별 현장 기록 쪽(area/daejeon-<구>.html)이 '사실만, 짐작 없이' 만들어졌는가 (2026-11-25)
 *
 * 정본: scripts/post-areas.json {slug: {gu, dong?}} → scripts/prerender-posts.py 가 사례 3건 이상인 구만 쪽을 만든다.
 * 이 검사가 막는 사고:
 *  ① 짐작한 구 — 글(제목·소개·장소·요약·본문)에 '○구' 글자도, 그 구의 동도 없는데 구를 붙였다. 대전 밖 글을 넣었다.
 *  ② 빠진 글 — 글에 '대전 ○구' 가 분명히 적힌 실제 사례인데 post-areas.json 에 없다(새 사례를 더하고 잊음).
 *  ③ 얇은 쪽·남은 쪽 — 사례가 3건 미만인 구에 쪽이 있거나, 3건 이상인데 쪽이 없다. 쪽에 다른 구 사례가 섞였다.
 *  ④ 지어낸 내용 — 쪽에 금액·협력사 이름·좌표·개인정보가 들어갔다(사례 글에 없는 말).
 *  ⑤ 끊긴 길 — sitemap(lastmod = 그 구 사례 최신 수정일)·블로그 목록·누수/인테리어 지역 문구·글의 '모아 보기' 링크·
 *     공개 허용목록(PUBLIC_TREE_RULES)·CI 생성물 비교가 쪽 목록과 어긋난다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_TREE_RULES } from './pages-artifact-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://01023978629.github.io/manmool';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const fail = [];
const ok = [];
const check = (cond, bad, good) => { if (cond) ok.push(good); else fail.push(bad); };

export const GU_KEYS = Object.freeze({ '중구': 'jung-gu', '서구': 'seo-gu', '유성구': 'yuseong-gu', '대덕구': 'daedeok-gu', '동구': 'dong-gu' });
export const MIN_CASES = 3;
/* 글에 구 글자가 없고 동만 있을 때 받는 대전 동→구 표(이 저장소가 실제로 쓰는 동만 적는다 — 모르는 동은 구 글자가 있어야 받는다). */
export const DONG_GU = Object.freeze({
  '관평동': '유성구', '노은동': '유성구', '교촌동': '유성구', '죽동': '유성구', '상대동': '유성구',
  '법동': '대덕구', '송촌동': '대덕구', '목상동': '대덕구',
  '문창동': '중구', '목동': '중구', '문화동': '중구',
  '탄방동': '서구', '둔산동': '서구', '월평동': '서구', '복수동': '서구', '관저동': '서구',
  '용전동': '동구',
});
const OTHER_CITY = /세종|청주|공주|논산|부여|계룡|금산|옥천|보은|영동|천안|아산|충남|충북|충청/;
/* 글에 '대전 ○구' 가 있어도 구별 쪽에 넣지 않을 글 — {slug: '이유'}. 지금은 없다. */
const EXCLUDED = Object.freeze({});
const word = (w) => new RegExp(`(?:^|[^가-힣])${w}(?![가-힣])`);

const site = JSON.parse(read('data/site.json'));
const all = Array.isArray(site.insights) ? site.insights : [];
const bySlug = new Map(all.map((a) => [a.slug, a]));
const published = all.filter((a) => a && a.published !== false);
// 생성기와 같은 순서: 날짜 내림차순(같은 날짜는 원래 순서).
const ordered = published.map((a, i) => [a, i]).sort((x, y) => (String(y[0].date || '') > String(x[0].date || '') ? 1 : String(y[0].date || '') < String(x[0].date || '') ? -1 : x[1] - y[1])).map(([a]) => a);
const isCase = (a) => !!(a && a.caseSummary && Object.keys(a.caseSummary).length);
const publicText = (a) => {
  const place = a.place || {};
  const summary = a.caseSummary || {};
  return [a.title, a.excerpt, place.name, place.address, summary.site, summary.issue, summary.work, summary.result,
    ...(a.body || []).flatMap((s) => [s.h, s.p, s.imgCaption])].filter(Boolean).join('\n');
};

/* ① post-areas.json — 글자로 확인되는 구만 */
let areas = {};
try {
  areas = JSON.parse(read('scripts/post-areas.json'));
  check(areas && typeof areas === 'object' && !Array.isArray(areas), 'scripts/post-areas.json 이 {slug: {gu, dong?}} 객체가 아니다', 'post-areas.json 꼴');
} catch (e) { fail.push('scripts/post-areas.json 을 읽지 못했다: ' + e.message); areas = {}; }
for (const [slug, entry] of Object.entries(areas)) {
  const a = bySlug.get(slug);
  const where = `post-areas.json "${slug}"`;
  if (!a) { fail.push(`${where}: data/site.json insights 에 없는 글이다`); continue; }
  const keys = Object.keys(entry || {});
  check(keys.every((k) => k === 'gu' || k === 'dong') && Object.hasOwn(GU_KEYS, entry.gu),
    `${where}: gu 가 대전 5개 구(${Object.keys(GU_KEYS).join('·')}) 중 하나가 아니거나 모르는 칸이 있다`, `${where} 꼴`);
  check(a.published !== false && isCase(a), `${where}: 공개된 실제 사례(caseSummary)가 아니다`, `${where} 실제 사례`);
  const text = publicText(a);
  const head = [a.title, (a.place || {}).name].filter(Boolean).join('\n');
  check(/대전/.test(head) && !OTHER_CITY.test(head), `${where}: 제목·장소가 대전 현장으로 적혀 있지 않거나 다른 시·도가 적혀 있다 — 대전 밖·불확실은 넣지 않는다`, `${where} 대전`);
  const dong = entry.dong;
  if (dong !== undefined) {
    check(typeof dong === 'string' && /^[가-힣0-9]{1,6}동$/.test(dong) && word(dong).test(text),
      `${where}: dong "${dong}" 이 글에 글자로 없다 — 글에 적힌 동만 쓴다`, `${where} 동 글자`);
    if (Object.hasOwn(DONG_GU, dong)) check(DONG_GU[dong] === entry.gu, `${where}: ${dong} 은 대전 ${DONG_GU[dong]} 인데 ${entry.gu} 로 적었다`, `${where} 동-구 일치`);
  }
  const guWritten = word(entry.gu).test(text);
  const dongProves = typeof dong === 'string' && DONG_GU[dong] === entry.gu && word(dong).test(text);
  check(guWritten || dongProves, `${where}: 글에 "${entry.gu}" 글자도, 그 구의 동(표에 있는 것)도 없다 — 짐작으로 구를 붙이지 않는다`, `${where} 구 근거`);
  for (const [otherGu] of Object.entries(GU_KEYS)) {
    if (otherGu !== entry.gu) check(!new RegExp(`대전\\s*${otherGu}(?![가-힣])`).test(text), `${where}: 글에 "대전 ${otherGu}" 가 적혀 있는데 ${entry.gu} 로 넣었다`, `${where} 다른 구 없음`);
  }
}

/* ② 글에 '대전 ○구' 가 적힌 실제 사례는 빠짐없이 */
for (const a of published.filter(isCase)) {
  const m = publicText(a).match(/대전\s*(동구|중구|서구|유성구|대덕구)(?![가-힣])/);
  if (!m || Object.hasOwn(EXCLUDED, a.slug)) continue;
  check(Object.hasOwn(areas, a.slug), `"${a.slug}" 글에 "${m[0]}" 가 적혀 있는데 scripts/post-areas.json 에 없다 — 넣거나 EXCLUDED 에 이유를 적어라`, `${a.slug} 구 등록`);
}

/* ③ 기대하는 쪽 = 사례 3건 이상인 구 */
const expected = [];
for (const [gu, key] of Object.entries(GU_KEYS)) {
  const items = ordered.filter((a) => isCase(a) && areas[a.slug] && areas[a.slug].gu === gu);
  if (items.length >= MIN_CASES) expected.push({ gu, slug: `daejeon-${key}`, file: `area/daejeon-${key}.html`, items });
}
const latest = (items) => items.map((a) => String(a.updated || a.date || '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const actualFiles = exists('area') ? fs.readdirSync(path.join(ROOT, 'area')).filter((f) => f.endsWith('.html')).map((f) => 'area/' + f).sort() : [];
check(JSON.stringify(actualFiles) === JSON.stringify(expected.map((p) => p.file).sort()),
  `area/ 쪽 목록 [${actualFiles.join(', ')}] 이 사례 ${MIN_CASES}건 이상인 구 [${expected.map((p) => p.file).join(', ')}] 와 다르다 — python3 scripts/prerender-posts.py (남은 쪽은 대표 확인 뒤 정리)`,
  `area 쪽 ${expected.length}장 = 사례 ${MIN_CASES}건 이상인 구`);

/* ④ 쪽 내용 — 그 구 사례만, 사실만 */
const MONEY = /\d[\d,.]*\s*(?:천|만|억)\s*원|\d{1,3}(?:,\d{3})+\s*원|₩/;
const PARTNERS = /누수나라|더케이|집담/;
const COORD = /\b\d{2,3}\.\d{5,}\b|위도|경도/;
const visibleText = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
for (const page of expected) {
  if (!exists(page.file)) continue;
  const html = read(page.file);
  const where = page.file;
  const n = page.items.length;
  const linked = [...html.matchAll(/<a class="insight-card" href="\.\.\/posts\/([^"]+)\.html"/g)].map((m) => m[1]);
  check(JSON.stringify(linked) === JSON.stringify(page.items.map((a) => a.slug)),
    `${where}: 사례 카드가 대전 ${page.gu} 사례 ${n}건(최신순)과 다르다`, `${where} 사례 ${n}건`);
  check(html.includes(`<title>대전 ${page.gu} 현장 기록 ${n}건 · 만물인테리어</title>`) && (html.match(/<h1>/g) || []).length === 1 && html.includes(`<h1>대전 ${page.gu} 현장 기록</h1>`),
    `${where}: 제목·h1 이 "대전 ${page.gu} 현장 기록" 이 아니다`, `${where} 제목`);
  check(html.includes(`<link rel="canonical" href="${BASE}/${page.file}" />`), `${where}: canonical 이 자기 주소가 아니다`, `${where} canonical`);
  check(/href="tel:01023978629"/.test(html) && html.includes('href="../leak.html#leakInquiry"') && html.includes('href="../index.html#inquiry"'),
    `${where}: 전화·누수 상담·인테리어 상담 링크가 다 있지 않다`, `${where} 연락·서비스 링크`);
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return null; } });
  const collection = lds.find((o) => o && o['@type'] === 'CollectionPage');
  check(lds.length === 2 && lds.every(Boolean) && lds.some((o) => o['@type'] === 'BreadcrumbList') && collection && collection.mainEntity && collection.mainEntity.numberOfItems === n,
    `${where}: 구조화 데이터(BreadcrumbList·CollectionPage ${n}건)가 맞지 않다`, `${where} 구조화 데이터`);
  const text = visibleText(html) + '\n' + [...html.matchAll(/\b(?:alt|content)="([^"]*)"/g)].map((m) => m[1]).join('\n');
  for (const [name, re] of [['금액', MONEY], ['협력사 이름', PARTNERS], ['좌표', COORD]]) {
    const hit = text.match(re);
    check(!hit, `${where}: ${name}로 보이는 "${hit && hit[0]}" 가 있다 — 구별 쪽은 사례 글의 사실만`, `${where} ${name} 없음`);
  }
  const dongs = [...new Set(page.items.map((a) => areas[a.slug].dong).filter(Boolean))];
  check(dongs.every((d) => html.includes(d)), `${where}: 동별 건수 줄(글에 동 이름이 적힌 기록)이 post-areas.json 의 동과 다르다`, `${where} 동별 건수 줄`);
}

/* ⑤ 길 — sitemap·블로그 목록·지역 문구·글의 모아 보기 링크·허용목록·CI */
const sitemap = read('sitemap.xml');
const sitemapAreas = [...sitemap.matchAll(/<loc>https:\/\/01023978629\.github\.io\/manmool\/(area\/[^<]+)<\/loc>/g)].map((m) => m[1]).sort();
check(JSON.stringify(sitemapAreas) === JSON.stringify(expected.map((p) => p.file).sort()), `sitemap.xml 의 area 주소 [${sitemapAreas.join(', ')}] 가 쪽 목록과 다르다`, 'sitemap area 목록');
for (const page of expected) {
  const lastmod = (sitemap.match(new RegExp(`<loc>${BASE.replace(/[./]/g, '\\$&')}/${page.file.replace(/[./]/g, '\\$&')}</loc>\\s*<lastmod>([^<]+)</lastmod>`)) || [])[1];
  check(lastmod === latest(page.items), `sitemap.xml ${page.file} lastmod "${lastmod}" ≠ 대전 ${page.gu} 사례 최신 수정일 ${latest(page.items)}`, `${page.file} lastmod`);
}
const hrefSet = (src, prefix) => [...new Set([...src.matchAll(new RegExp(`href="${prefix}(daejeon-[a-z-]+)\\.html"`, 'g'))].map((m) => m[1]))].sort();
const want = expected.map((p) => p.slug).sort();
const blog = read('blog.html');
const blogNav = (blog.match(/<nav class="case-area-links"[\s\S]*?<\/nav>/) || [''])[0];
check(JSON.stringify(hrefSet(blogNav, 'area/')) === JSON.stringify(want) && expected.every((p) => blogNav.includes(`대전 ${p.gu} <small>${p.items.length}건</small>`)),
  'blog.html 대전 구별 기록 링크가 쪽 목록·건수와 다르다 — python3 scripts/prerender-posts.py', 'blog 구별 링크');
for (const file of ['leak.html', 'index.html']) {
  check(JSON.stringify(hrefSet(read(file), 'area/')) === JSON.stringify(want), `${file} 지역 문구의 구별 기록 링크가 쪽 목록 [${want.join(', ')}] 과 다르다`, `${file} 구별 링크`);
}
for (const a of published) {
  const postFile = `posts/${a.slug}.html`;
  if (!exists(postFile)) continue;
  const page = expected.find((p) => p.items.includes(a));
  const links = hrefSet(read(postFile), '\\.\\./area/');
  check(page ? JSON.stringify(links) === JSON.stringify([page.slug]) : links.length === 0,
    `${postFile}: 구별 기록 '모아 보기' 링크가 ${page ? page.file : '없어야 하는데'} 와 다르다 — python3 scripts/prerender-posts.py`, `${a.slug} 모아 보기`);
}
check(PUBLIC_TREE_RULES.has('area') && PUBLIC_TREE_RULES.get('area').test('x.html') && !PUBLIC_TREE_RULES.get('area').test('x.json'),
  'scripts/pages-artifact-policy.mjs PUBLIC_TREE_RULES 에 area(.html 만)가 없다 — 쪽이 배포에서 조용히 빠진다', '공개 허용목록 area');
const workflow = read('.github/workflows/deploy-pages.yml');
check(/git diff --exit-code -- [^\n]*\barea\b/.test(workflow) && /git status --porcelain -- area/.test(workflow),
  'deploy-pages.yml 생성물 비교에 area/ 가 없다 — 생성기를 안 돌린 쪽이 그대로 나간다', 'CI 생성물 비교 area');

if (fail.length) {
  console.error(`✗ 대전 구별 현장 기록 ${fail.length}건 문제`);
  fail.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log(`✓ 대전 구별 현장 기록 정상 — 쪽 ${expected.length}장(${expected.map((p) => `${p.gu} ${p.items.length}`).join(' · ')}) · 구 등록 ${Object.keys(areas).length}건 · 확인 ${ok.length}건`);
