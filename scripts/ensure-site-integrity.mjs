/* ensure-site-integrity.mjs — 사이트가 조용히 망가지지 않게 지킨다
 *
 * 손님이 링크를 눌렀는데 404 가 뜨거나, 검색엔진이 페이지를 제대로 못 읽는 상태는
 * 아무도 알려주지 않는다. 사람이 매번 수동으로 훑는 대신 여기서 잡는다.
 *
 * 판정 기준: 페이지를 '공개'와 '내부'로 나눈다.
 *   · 내부 화면(admin·mypage·field·as)은 <meta name="robots" content="noindex"> 가 붙어 있고
 *     검색에 안 뜨는 게 정상이다. 여기에 description·canonical 을 요구하면 오탐이 된다.
 *   · 공개 페이지만 메타·사이트맵을 갖춰야 한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
let checked = 0;

const readIf = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
const htmlFiles = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...(fs.existsSync(path.join(ROOT, 'posts'))
    ? fs.readdirSync(path.join(ROOT, 'posts')).filter((f) => f.endsWith('.html')).map((f) => 'posts/' + f)
    : []),
];

const isInternal = (src) => /name="robots"[^>]*content="[^"]*noindex/.test(src);

/* ① 내부 링크가 실제 파일을 가리키는가 (404 방지) ---------------------- */
for (const rel of htmlFiles) {
  const src = readIf(rel);
  if (src == null) continue;
  const dir = path.dirname(path.join(ROOT, rel));
  for (const href of src.match(/href="([^"]+)"/g) || []) {
    const v = href.slice(6, -1);
    if (/^(https?:|mailto:|tel:|sms:|#|data:|javascript:|\/\/)/.test(v)) continue;
    const target = v.split('#')[0].split('?')[0];
    if (!target) continue;
    checked++;
    if (!fs.existsSync(path.resolve(dir, target))) {
      fail.push(`${rel} 의 링크가 깨졌다: ${v} (손님이 누르면 404)`);
    }
  }
}

/* ② 공개 페이지에 검색용 메타가 있는가 --------------------------------- */
for (const rel of htmlFiles) {
  const src = readIf(rel);
  if (src == null || isInternal(src)) continue;   // 내부 화면은 noindex 가 정상
  const head = src.split('</head>')[0] || '';
  if (!/<title>[^<]+<\/title>/.test(head)) fail.push(`${rel}: <title> 이 비었거나 없다`);
  if (!/name="description"\s+content="[^"]{10,}"/.test(head)) fail.push(`${rel}: meta description 이 없다(검색 결과에 설명이 안 뜬다)`);
  if (!/rel="canonical"/.test(head)) fail.push(`${rel}: canonical 이 없다(중복 URL 로 색인될 수 있다)`);
}

/* ③ 내부 화면이 검색에 새지 않는가 ------------------------------------- */
// robots.txt 는 GitHub Pages 프로젝트 사이트(/manmool/)에서는 크롤러가 읽지 않는다
// (오리진 루트에서만 읽힌다). 그래서 실제 보호는 각 페이지의 noindex 가 한다 — 이게 핵심.
for (const rel of ['admin.html', 'mypage.html', 'field.html', 'as.html']) {
  const src = readIf(rel);
  if (src == null) continue;
  if (!isInternal(src)) fail.push(`${rel}: 내부 화면인데 noindex 가 없다 — 검색에 노출될 수 있다`);
}

/* ④ 공개 페이지가 sitemap 에 들어 있는가 ------------------------------- */
const sm = readIf('sitemap.xml');
if (!sm) fail.push('sitemap.xml 이 없다');
else {
  const locs = (sm.match(/<loc>([^<]+)<\/loc>/g) || []).map((m) => m.slice(5, -6));
  for (const rel of htmlFiles) {
    const src = readIf(rel);
    if (src == null || isInternal(src)) continue;
    const inMap = locs.some((u) => u.endsWith('/' + rel) || (rel === 'index.html' && /\/manmool\/?$/.test(u)));
    if (!inMap) fail.push(`${rel} 이 sitemap.xml 에 없다 — 검색엔진이 늦게 찾거나 못 찾는다`);
  }
}

/* ⑤ 혼합 콘텐츠(http://) 링크가 없는가 --------------------------------- */
// HTTPS 페이지에서 http:// 링크는 브라우저가 막거나 경고한다.
for (const rel of [...htmlFiles, 'data/config.json', 'data/site.json']) {
  const src = readIf(rel);
  if (src == null) continue;
  for (const m of src.match(/http:\/\/[a-z0-9.-]+[^"'\s<>]*/gi) || []) {
    if (/127\.0\.0\.1|localhost|w3\.org|schema\.org|purl\.org|ns\.adobe/.test(m)) continue;
    fail.push(`${rel}: http:// 링크가 남아 있다 → ${m} (HTTPS 페이지에서 차단·경고될 수 있다)`);
  }
}

if (fail.length) {
  console.error('✗ 사이트 무결성 ' + fail.length + '건 문제\n');
  fail.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`✓ 사이트 무결성 정상 — 페이지 ${htmlFiles.length}개 · 내부링크 ${checked}건 확인`);
