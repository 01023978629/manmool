/* 브랜드 아이콘 — 탭 아이콘·홈 화면 아이콘·카톡 공유 카드가 제자리에 있는가.
 *
 * 왜 이 검사가 있나: 2026-09-19 이전에는 이 셋 중 어느 것도 지켜 주는 검사가 없었고,
 * 실제로 세 가지가 동시에 틀려 있었다.
 *  ① 공개 페이지 20장에 탭 아이콘이 아예 없었다(광고로 들어오는 leak.html 포함).
 *  ② 아이콘 파일이 0개라 아이폰 '홈 화면에 추가' 가 스크린샷을 박았고,
 *     구글 검색결과 파비콘은 data: URI 를 못 가져가 기본 지구본이 떴다.
 *  ③ 탭 아이콘 글자는 万(간체)인데 화면 로고는 萬(정자)이라 서로 다른 글자였다.
 * 셋 다 눈으로만 알 수 있어서, 눈으로 안 보면 영영 안 고쳐진다.
 *
 * 루트에 아이콘을 두지 마라 — PUBLIC_ROOT_FILES 이름 목록에 없으면 조용히 배포에서 빠지고
 * ensure-pages-artifact 는 그래도 통과한다. assets/ 아래 png·svg 는 자동으로 나간다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const fail = [];
const check = (condition, message) => { if (!condition) fail.push(message); };

/* 손대면 안 되는 두 장 — office-request.html 은 SHA-256 으로 고정된 직원 포털이고
   (ensure-revenue-operations), 구글 소유확인 파일은 한 줄짜리 증명이라 아무것도 넣지 않는다. */
const EXEMPT = new Set(['office-request.html', 'google11dc37fbc3ab6e98.html']);
const ICON_DIR = 'assets/site';
const REQUIRED = {
  'favicon.svg': [1_000, 20_000],
  'favicon-32.png': [200, 8_000],
  'favicon-16.png': [100, 4_000],
  'apple-touch-icon.png': [800, 30_000],
};

for (const [name, [min, max]] of Object.entries(REQUIRED)) {
  const rel = `${ICON_DIR}/${name}`;
  if (!exists(rel)) { fail.push(`아이콘 파일이 없다: ${rel}`); continue; }
  const size = fs.statSync(path.join(ROOT, rel)).size;
  check(size >= min && size <= max, `${rel} 크기가 이상하다 (${size}B, 기대 ${min}~${max}B)`);
}

/* SVG 아이콘이 글꼴에 기대면 한중일 글꼴이 없는 기기에서 네모(두부)가 된다 — path 로만 그린다. */
for (const name of fs.existsSync(path.join(ROOT, ICON_DIR)) ? fs.readdirSync(path.join(ROOT, ICON_DIR)) : []) {
  if (!name.endsWith('.svg')) continue;
  const svg = read(`${ICON_DIR}/${name}`);
  check(!/<text[\s>]/.test(svg), `${ICON_DIR}/${name} 이 <text> 로 글자를 그린다 — 글꼴 없는 기기에서 네모가 된다`);
  check(/<path[\s>]/.test(svg), `${ICON_DIR}/${name} 에 path 가 없다`);
  // xmlns 는 이름공간 선언이라 네트워크로 나가지 않는다 — 그것만 뺀 나머지 주소를 본다.
  check(!/(?:href|src|url\()\s*=?\s*["'(]?\s*(?:https?:|\/\/)/i.test(svg),
    `${ICON_DIR}/${name} 이 바깥 자원(이미지·글꼴)을 참조한다 — 오프라인·차단 환경에서 깨진다`);
  check(!/<(?:image|script|foreignObject)[\s>]|@font-face/i.test(svg),
    `${ICON_DIR}/${name} 에 이미지·스크립트·글꼴이 들어 있다 — 아이콘은 도형만으로 그린다`);
}

/* 공유 카드는 카카오톡·페이스북 권장 1.91:1 이어야 하고, index·bathroom-check 가 그 숫자를 선언한다. */
if (!exists('og-image.png')) fail.push('공유 카드 og-image.png 가 없다');
else {
  const png = fs.readFileSync(path.join(ROOT, 'og-image.png'));
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  check(w === 1200 && h === 630, `og-image.png 가 1200x630 이 아니다 (${w}x${h}) — index.html·bathroom-check.html 의 og:image:width/height 선언과 어긋난다`);
  check(png.length <= 400_000, `og-image.png 가 너무 무겁다 (${Math.round(png.length / 1024)}KB)`);
}

/* 모든 공개 페이지가 아이콘을 선언하는가. <link> 가 없으면 경로 오타를 잡아 주는 장치가 0 이 된다. */
const pages = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...fs.readdirSync(path.join(ROOT, 'posts')).filter((f) => f.endsWith('.html')).map((f) => `posts/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'designs')).filter((f) => f.endsWith('.html')).map((f) => `designs/${f}`),
].filter((f) => !EXEMPT.has(f));

let withApple = 0;
for (const page of pages) {
  const html = read(page);
  const links = [...html.matchAll(/<link\s+rel="(icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)];
  if (!links.length) { fail.push(`${page} 에 탭 아이콘(<link rel="icon">)이 없다`); continue; }
  check(!/rel="icon"[^>]*href="data:/.test(html),
    `${page} 이 아직 인라인 data: 아이콘을 쓴다 — 구글이 가져갈 주소가 없어 검색결과에 기본 아이콘이 뜬다`);
  if (links.some(([, rel]) => rel === 'apple-touch-icon')) withApple += 1;
  for (const [, , href] of links) {
    const resolved = path.normalize(path.join(path.dirname(page), href));
    check(exists(resolved), `${page} 의 아이콘 경로가 깨졌다: ${href}`);
  }
}
check(withApple >= pages.length - 3,
  `apple-touch-icon 이 ${withApple}/${pages.length} 장에만 있다 — 없으면 아이폰 홈 화면에 스크린샷이 박힌다`);

/* 탭 아이콘 글자와 화면 로고 글자가 같아야 한다. 이게 어긋나 있었다(万 vs 萬). */
const logoGlyphs = new Set();
for (const page of pages) {
  for (const [, g] of read(page).matchAll(/<span class="logo-mark">(.)<\/span>/g)) logoGlyphs.add(g);
}
check(logoGlyphs.size === 1, `화면 로고 글자가 여러 가지다: ${[...logoGlyphs].join(' ')}`);

if (fail.length) {
  console.error(`FAIL  브랜드 아이콘 ${fail.length}건`);
  fail.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log(`PASS  브랜드 아이콘 — 공개 ${pages.length}장 전부 탭 아이콘 · apple-touch-icon ${withApple}장 · 공유 카드 1200x630 · SVG 글꼴 의존 0`);
