/* ensure-image-variants.mjs — 사진 축소본(srcset) 배선 검사

   보호하는 사고: 새 사진을 넣고 축소본 생성(scripts/build-image-variants.py)을 잊거나,
   페이지가 원본을 srcset 없이 그대로 내보내는 것. 목록 카드 한 칸은 356px 인데
   원본이 나가면 휴대폰 LTE에서 사례 페이지 LCP가 5초를 넘는다(2026-08 종합평가 ⑤).
   2026-09-26 까지는 assets/cases 만 봤다 — 그 사이 설명 글 사진(assets/insights,
   1600px JPEG 8장 + 1774px PNG 1.2MB)이 규칙 밖에 있어 blog.html 한 장의 이미지
   전송 4.5MB 중 3.0MB가 356px 카드에 원본 그대로 나갔고, 이 검사는 초록불이었다.

   검사 1  원본(assets/cases·assets/insights 의 jpg·jpeg·png, assets/site/hero-interior.jpg)
           마다 resized/<이름>-480w.jpg·-960w.jpg 가 있고, JPEG 이고, 폭이 목표 이하
           (뻥튀기 없음)·비율이 원본과 같고·용량이 원본 미만인지. 이름만 같고 확장자가
           다른 원본(축소본 이름이 겹친다)과, 원본이 사라진 고아 축소본도 잡는다.
   검사 2  공개 HTML(*.html, posts/*.html)의 <img src="…assets/(cases|insights)/…"> 가
           전부 resized/ srcset·sizes·원본과 같은 width·height 를 갖는지
           (og:image 메타는 원본이 맞다). 원본 주소의 캐시 쿼리(?v=…)는 축소본에도.
   검사 3  srcset 이 가리키는 파일이 실제로 있는지
   검사 4  대문 첫 그림(hero-interior.jpg)이 축소본 srcset 을 갖고, preload 의
           imagesrcset·imagesizes 가 <img> 와 같은지(다르면 두 장을 받는다)
   검사 5  대문 #insightsGrid 에 추천 글(data-featured-slugs) 카드가 정적으로 박혀
           있는지 — JS 없이도 보이고, 사진 치수·srcset 을 JS 에 기대지 않는다
   검사 6  js/main.js caseImgExtra·js/blog.js caseExtra 가 정적 HTML 과 같은 srcset 을
           만드는지(규칙이 세 곳에 있다 — 한쪽만 고치면 JS 가 다시 그린 카드가 원본을 받는다) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const WIDTHS = [480, 960];
const PHOTO = /\.(?:jpe?g|png)$/;
// scripts/build-image-variants.py SOURCES 와 같은 목록
const SOURCES = [
  { dir: 'assets/cases', pick: (f) => PHOTO.test(f) },
  { dir: 'assets/insights', pick: (f) => PHOTO.test(f) },
  { dir: 'assets/site', pick: (f) => f === 'hero-interior.jpg' },
];
// scripts/prerender-posts.py VARIANT_RE 와 같은 규칙(앞의 ../ 만 더 받는다)
const IMG_RE = /^((?:\.\.\/)?)assets\/(cases|insights)\/([A-Za-z0-9._-]+)\.(?:jpe?g|png)(\?[A-Za-z0-9._~=-]*)?$/;

/* JPEG SOF 마커·PNG IHDR 에서 치수를 읽는다 — 의존성 없이 충분하다 */
function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.toString('ascii', 12, 16) === 'IHDR') {
    return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { type: 'jpeg', width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    }
    i += 2 + (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) ? 0 : b.readUInt16BE(i + 2));
  }
  return null;
}
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
// 2026-09-26 까지 leak.html 진잠타운 카드 사진(1600×1200)이 1200×1600 으로 적혀 있어 여기서 '알려진 오기'로
// 허용했다. 고쳤으므로 허용 목록을 없앴다 — 모든 폴더의 <img> 비율은 ensure-img-dims.mjs 가 본다.

// 검사 1 — 원본마다 두 축소본, 이름 겹침, 고아
let originalCount = 0;
const originalSize = new Map(); // 'assets/insights/a.png' → {width,height}
for (const { dir, pick } of SOURCES) {
  const abs = path.join(root, dir);
  const originals = fs.readdirSync(abs).filter((f) => fs.statSync(path.join(abs, f)).isFile() && pick(f));
  const stems = new Map();
  for (const f of originals) {
    const stem = f.replace(PHOTO, '');
    if (stems.has(stem)) fail.push(`축소본 이름이 겹친다: ${dir}/${stems.get(stem)} 와 ${f} — 둘 다 resized/${stem}-480w.jpg 가 된다`);
    stems.set(stem, f);
    const o = imageSize(path.join(abs, f));
    const ob = fs.statSync(path.join(abs, f)).size;
    if (!o) { fail.push(`원본 치수를 읽지 못했다: ${dir}/${f}`); continue; }
    originalSize.set(`${dir}/${f}`, o);
    originalCount++;
    for (const w of WIDTHS) {
      const rel = `${dir}/resized/${stem}-${w}w.jpg`;
      const v = path.join(root, rel);
      if (!fs.existsSync(v)) {
        fail.push(`축소본 없음: ${rel} — python3 scripts/build-image-variants.py 를 돌려라`);
        continue;
      }
      const vs = imageSize(v);
      if (!vs || vs.type !== 'jpeg') { fail.push(`축소본이 JPEG 가 아니다: ${rel}`); continue; }
      if (vs.width > Math.min(w, o.width)) fail.push(`축소본이 목표보다 크다(${vs.width}px): ${rel}`);
      const expectH = o.height * vs.width / o.width;
      if (Math.abs(vs.height - expectH) > 1) fail.push(`축소본 비율이 원본과 다르다(${vs.width}×${vs.height}, 원본 ${o.width}×${o.height}) — 원본을 바꾼 뒤 다시 굽지 않았다: ${rel}`);
      if (fs.statSync(v).size >= ob) fail.push(`축소본이 원본보다 무겁다: ${rel}`);
    }
  }
  const resized = path.join(abs, 'resized');
  if (fs.existsSync(resized)) {
    for (const f of fs.readdirSync(resized)) {
      const m = f.match(/^(.+)-(480|960)w\.jpg$/);
      if (!m || !stems.has(m[1])) fail.push(`고아 축소본(원본이 없다 — 지우거나 원본을 되살려라): ${dir}/resized/${f}`);
    }
  }
}

// 검사 2·3 — 공개 HTML 의 사진 <img> 전부 srcset·sizes·치수
const pages = [
  ...fs.readdirSync(root).filter((f) => f.endsWith('.html')),
  ...fs.readdirSync(path.join(root, 'posts')).filter((f) => f.endsWith('.html')).map((f) => path.join('posts', f)),
];
let photoImgs = 0;
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  for (const m of html.matchAll(/<img [^>]*>/g)) {
    const tag = m[0];
    const src = attr(tag, 'src') || '';
    if (/(?:^|\/)assets\/(?:cases|insights)\/resized\//.test(src)) { fail.push(`${page}: src 가 축소본을 직접 가리킨다(원본+srcset 이 규칙): ${src}`); continue; }
    if (!/^(?:\.\.\/)?assets\/(?:cases|insights)\//.test(src)) continue;
    photoImgs++;
    const sm = src.match(IMG_RE);
    if (!sm) { fail.push(`${page}: 축소본 규칙에 안 맞는 사진 주소(이름·확장자·쿼리 문자): ${src}`); continue; }
    const [, prefix, folder, stem, query = ''] = sm;
    const srcset = attr(tag, 'srcset');
    if (!srcset || !/\/resized\//.test(srcset)) { fail.push(`${page}: 사진 <img> 에 resized srcset 이 없다: ${src}`); continue; }
    if (!attr(tag, 'sizes')) fail.push(`${page}: srcset 은 있는데 sizes 가 없다(그럼 100vw 로 계산해 큰 쪽만 받는다): ${src}`);
    const expected = `${prefix}assets/${folder}/resized/${stem}-480w.jpg${query} 480w, ${prefix}assets/${folder}/resized/${stem}-960w.jpg${query} 960w`;
    if (srcset !== expected) fail.push(`${page}: srcset 이 규칙과 다르다(캐시 쿼리 포함) — 기대 "${expected}", 실제 "${srcset}"`);
    const o = originalSize.get(src.slice(prefix.length).split('?')[0]);
    if (!o) fail.push(`${page}: 사진 원본이 없다: ${src}`);
    else if (attr(tag, 'width') !== String(o.width) || attr(tag, 'height') !== String(o.height)) {
      fail.push(`${page}: width·height 가 원본(${o.width}×${o.height})과 다르거나 없다 — 칸이 그림을 받은 뒤 밀린다: ${src}`);
    }
    for (const c of srcset.split(',')) {
      const rel = c.trim().split(/\s+/)[0].replace(/^\.\.\//, '').split('?')[0];
      if (!fs.existsSync(path.join(root, rel))) fail.push(`${page}: srcset 이 없는 파일을 가리킨다: ${rel}`);
    }
  }
}

// 검사 4 — 대문 첫 그림
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const heroTags = [...index.matchAll(/<img [^>]*src="assets\/site\/hero-interior\.jpg"[^>]*>/g)].map((m) => m[0]);
if (heroTags.length !== 1) fail.push(`index.html: 대문 첫 그림 <img> 가 ${heroTags.length}개다(1개여야)`);
else {
  const hero = heroTags[0], srcset = attr(hero, 'srcset') || '', sizes = attr(hero, 'sizes') || '';
  for (const w of WIDTHS) {
    if (!srcset.includes(`assets/site/resized/hero-interior-${w}w.jpg ${w}w`)) fail.push(`index.html: 대문 첫 그림 srcset 에 ${w}w 축소본이 없다`);
  }
  if (!sizes) fail.push('index.html: 대문 첫 그림에 sizes 가 없다');
  const preload = (index.match(/<link rel="preload" as="image" href="assets\/site\/hero-interior\.jpg"[^>]*>/) || [])[0];
  if (preload && (attr(preload, 'imagesrcset') !== srcset || attr(preload, 'imagesizes') !== sizes)) {
    fail.push('index.html: 첫 그림 preload 의 imagesrcset·imagesizes 가 <img> 의 srcset·sizes 와 다르다 — 폰이 미리 받은 원본을 버리고 한 장을 더 받는다');
  }
}

// 검사 5 — 대문 인사이트 카드가 정적으로
const site = JSON.parse(fs.readFileSync(path.join(root, 'data', 'site.json'), 'utf8'));
const published = (site.insights || []).filter((a) => a && a.published !== false);
const gridOpen = index.match(/<div class="insights-grid" id="insightsGrid"[^>]*>/);
let staticCards = [];
if (!gridOpen) fail.push('index.html: #insightsGrid 가 없다');
else {
  const start = gridOpen.index + gridOpen[0].length;
  const inner = index.slice(start, index.indexOf('</div>', start));
  const slugs = (attr(gridOpen[0], 'data-featured-slugs') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const bySlug = new Map(published.map((a) => [a.slug, a]));
  const want = (slugs.length ? slugs.filter((s) => bySlug.has(s)) : published.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map((a) => a.slug)).slice(0, 3);
  staticCards = [...inner.matchAll(/<a class="insight-card" href="posts\/([^"]+)\.html">([\s\S]*?)<\/a>/g)];
  const got = staticCards.map((m) => decodeURIComponent(m[1]));
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`index.html: #insightsGrid 정적 카드가 추천 글과 다르다 — 기대 [${want.join(', ')}], 실제 [${got.join(', ')}]. python3 scripts/prerender-posts.py 를 돌려라`);
  }
  for (const m of staticCards) {
    const a = bySlug.get(decodeURIComponent(m[1]));
    if (a && a.image && !m[2].includes(`src="${a.image.replace(/&/g, '&amp;')}"`)) fail.push(`index.html: ${m[1]} 정적 카드에 표지 사진이 없다`);
  }
  if (/class="insight-card[^"]*\breveal\b/.test(inner)) fail.push('index.html: 정적 카드에 .reveal 이 붙었다 — JS 없이는 투명해서 안 보인다');
}

// 검사 6 — JS 규칙이 정적 HTML 과 같은 srcset 을 만드는지
const mainSrc = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
const blogSrc = fs.readFileSync(path.join(root, 'js', 'blog.js'), 'utf8');
const mainFn = (mainSrc.match(/function caseImgExtra\(src, sizes\) \{[\s\S]*?\n\}/) || [])[0];
const blogFn = (blogSrc.match(/const caseExtra = (\(src, wide\) => \{[\s\S]*?\n {2}\});/) || [])[1];
if (!mainFn) fail.push('js/main.js: caseImgExtra(src, sizes) 를 찾지 못했다');
if (!blogFn) fail.push('js/blog.js: caseExtra(src, wide) 를 찾지 못했다');
const extraOf = (tag) => ` srcset="${attr(tag, 'srcset')}" sizes="${attr(tag, 'sizes')}"`;
if (mainFn && blogFn) {
  const caseImgExtra = new Function(`${mainFn}; return caseImgExtra;`)();
  const caseExtra = new Function(`return ${blogFn};`)();
  const samples = [];
  for (const m of staticCards) for (const t of m[2].match(/<img [^>]*>/g) || []) samples.push(['index.html', t, false]);
  const blog = fs.readFileSync(path.join(root, 'blog.html'), 'utf8');
  for (const m of blog.matchAll(/<a class="(insight-featured|insight-card)"[\s\S]*?<\/a>/g)) {
    for (const t of m[0].match(/<img [^>]*>/g) || []) samples.push(['blog.html', t, m[1] === 'insight-featured']);
  }
  let compared = 0;
  for (const [page, tag, wide] of samples) {
    const src = attr(tag, 'src').replace(/&amp;/g, '&');
    if (!IMG_RE.test(src)) continue;
    compared++;
    const want = extraOf(tag);
    if (page === 'index.html' && caseImgExtra(src, attr(tag, 'sizes')) !== want) fail.push(`js/main.js caseImgExtra 가 정적 카드와 다른 srcset 을 만든다: ${src}`);
    if (page === 'blog.html' && caseExtra(src, wide) !== want) fail.push(`js/blog.js caseExtra 가 정적 목록과 다른 srcset 을 만든다: ${src}`);
  }
  if (!samples.some(([, t]) => /assets\/insights\//.test(t))) fail.push('검사 6 표본에 설명 글 사진(assets/insights)이 하나도 없다 — 검사가 눈이 멀었다');
  if (!compared) fail.push('검사 6 에서 비교한 사진이 0장이다');
}

if (fail.length) {
  for (const f of fail) console.error('FAIL  ' + f);
  process.exit(1);
}
console.log(`PASS  원본 ${originalCount}장(사례·설명 글·대문) 모두 480w·960w 축소본 보유(뻥튀기·비율·비대·고아 없음)`);
console.log(`PASS  공개 HTML 의 사진 <img> ${photoImgs}개 전부 resized srcset + sizes + 원본 치수`);
console.log('PASS  srcset 대상 파일 실재');
console.log('PASS  대문 첫 그림 srcset·preload 일치');
console.log(`PASS  대문 인사이트 카드 ${staticCards.length}장 정적`);
console.log('PASS  main.js·blog.js 축소본 규칙이 정적 HTML 과 같다');
