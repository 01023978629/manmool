/* ensure-image-variants.mjs — 사례 사진 축소본(srcset) 배선 검사

   보호하는 사고: 새 사례 사진을 assets/cases/ 에 넣고 축소본 생성
   (scripts/build-image-variants.py)을 잊거나, 페이지가 원본(최대 1800px·480KB)을
   srcset 없이 그대로 내보내는 것. 목록 카드 한 칸은 356px 인데 원본이 나가면
   휴대폰 LTE에서 사례 페이지 LCP가 5초를 넘는다(2026-08 종합평가 ⑤).

   검사 1  assets/cases/*.jpg 마다 resized/<이름>-480w.jpg·-960w.jpg 가 있고,
           폭이 목표 이하(뻥튀기 없음)·용량이 원본 미만인지
   검사 2  공개 HTML(*.html, posts/*.html)의 <img src="…assets/cases/*.jpg"> 가
           전부 resized/ srcset 과 sizes 를 갖는지 (og:image 메타는 원본이 맞다)
   검사 3  srcset 이 가리키는 파일이 실제로 있는지 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = path.join(root, 'assets', 'cases');
const RESIZED = path.join(CASES, 'resized');
const fail = [];

/* JPEG SOF 마커에서 폭을 읽는다 — 의존성 없이 충분하다 */
function jpegWidth(file) {
  const b = fs.readFileSync(file);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return b.readUInt16BE(i + 7);
    }
    i += 2 + (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9) ? 0 : b.readUInt16BE(i + 2));
  }
  return null;
}

// 검사 1 — 원본마다 두 축소본
const originals = fs.readdirSync(CASES).filter(f => f.endsWith('.jpg'));
for (const f of originals) {
  const stem = f.replace(/\.jpg$/, '');
  const ow = jpegWidth(path.join(CASES, f));
  const ob = fs.statSync(path.join(CASES, f)).size;
  for (const w of [480, 960]) {
    const v = path.join(RESIZED, `${stem}-${w}w.jpg`);
    if (!fs.existsSync(v)) {
      fail.push(`축소본 없음: assets/cases/resized/${stem}-${w}w.jpg — python3 scripts/build-image-variants.py 를 돌려라`);
      continue;
    }
    const vw = jpegWidth(v);
    if (vw && ow && vw > Math.min(w, ow)) fail.push(`축소본이 목표보다 크다(${vw}px): ${stem}-${w}w.jpg`);
    if (fs.statSync(v).size >= ob) fail.push(`축소본이 원본보다 무겁다: ${stem}-${w}w.jpg`);
  }
}

// 검사 2·3 — 공개 HTML 의 사례 <img> 전부 srcset·sizes
const pages = [
  ...fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => f),
  ...fs.readdirSync(path.join(root, 'posts')).filter(f => f.endsWith('.html')).map(f => path.join('posts', f)),
];
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  for (const m of html.matchAll(/<img [^>]*>/g)) {
    const tag = m[0];
    const src = (tag.match(/src="((?:\.\.\/)?assets\/cases\/[^"]+\.jpg)"/) || [])[1];
    if (!src) continue;
    if (src.includes('/resized/')) { fail.push(`${page}: src 가 축소본을 직접 가리킨다(원본+srcset 이 규칙): ${src}`); continue; }
    if (!/srcset="[^"]*\/resized\/[^"]+"/.test(tag)) { fail.push(`${page}: 사례 <img> 에 resized srcset 이 없다: ${src}`); continue; }
    if (!/sizes="/.test(tag)) fail.push(`${page}: srcset 은 있는데 sizes 가 없다(그럼 100vw 로 계산해 큰 쪽만 받는다): ${src}`);
    for (const c of tag.match(/srcset="([^"]+)"/)[1].split(',')) {
      const rel = c.trim().split(/\s+/)[0].replace(/^\.\.\//, '');
      if (!fs.existsSync(path.join(root, rel))) fail.push(`${page}: srcset 이 없는 파일을 가리킨다: ${rel}`);
    }
  }
}

if (fail.length) {
  for (const f of fail) console.error('FAIL  ' + f);
  process.exit(1);
}
console.log(`PASS  사례 원본 ${originals.length}장 모두 480w·960w 축소본 보유(뻥튀기·비대 없음)`);
console.log('PASS  공개 HTML 의 사례 <img> 전부 resized srcset + sizes');
console.log('PASS  srcset 대상 파일 실재');
