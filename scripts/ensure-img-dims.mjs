/* ensure-img-dims.mjs — 공개 HTML 의 <img width height> 가 실제 사진 비율과 같은가

   왜: 2026-09-26 에 leak.html 사례 구역의 진잠타운 카드 사진(assets/cases/jinjam-rain-pipe-202609-10.jpg)이
   실제로는 1600×1200 가로 사진인데 <img width="1200" height="1600"> 로 적혀 있었다. 옆 카드(삼호아파트,
   1200×1600 세로 사진)의 줄을 베껴 쓴 손 작업이었다 — 이 페이지를 쓰는 생성기는 없다. 브라우저는 그림이
   오기 전에 width·height 비율(aspect-ratio)로 자리를 잡으므로, 비율이 틀리면 CSS 가 높이를 고정하지 않는
   자리에서는 그림을 받은 뒤 칸이 튄다(CLS). 그 전에는 ensure-image-variants 가 assets/cases·insights 만
   보면서 이 줄을 '알려진 오기'로 허용하고 있었고, 다른 폴더(assets/designs·assets/site 등)는 아무도
   치수를 보지 않았다.

   대상: noindex 가 아닌 공개 HTML 전부(루트·posts/·designs/). 소유확인 파일(google*.html)과 해시 고정 파일
   (tests/fixtures/office-request-commercial-baseline.json 의 목록 — office-request.html 등)은 뺀다.
   본다: 이 사이트 안 파일을 가리키는 <img> 중 width·height 를 가진 것마다
     ① 파일이 있고 JPEG·PNG·WebP 치수를 머리에서 읽을 수 있다(SVG·GIF 는 비율 검사 대상이 아니다)
     ② width·height 가 양의 정수다
     ③ 선언 비율 == 실제 비율(±1%). JPEG 의 EXIF 방향이 5~8(90° 돌림)이면 브라우저처럼 가로·세로를 바꿔 본다.
     width 나 height 한쪽만 있는 <img> 도 잡는다 — 비율을 못 잡아 자리 잡힘이 없는 것과 같다.
   치수를 고치는 곳: 글·목록은 scripts/prerender-posts.py(파일에서 읽어 쓴다), 시안은 prerender-designs.py,
   손으로 쓴 페이지(index·leak·office…)는 이 검사가 알려 주는 실제 값으로.
   읽개는 scripts/ensure-og-image-dims.mjs 와 같은 방식이다 — 그 파일은 불러오는 순간 자기 검사를 돌리고
   실패하면 process.exit 하므로 여기 따로 둔다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOLERANCE = 0.01;

function jpegInfo(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let orientation = 1;
  let pos = 2;
  while (pos < data.length) {
    if (data[pos] !== 0xff) { pos += 1; continue; }
    while (pos < data.length && data[pos] === 0xff) pos += 1;
    if (pos >= data.length) return null;
    const marker = data[pos];
    pos += 1;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda || pos + 2 > data.length) return null;
    const length = data.readUInt16BE(pos);
    if (length < 2 || pos + length > data.length) return null;
    if (marker === 0xe1 && data.toString('latin1', pos + 2, pos + 8) === 'Exif\0\0') {
      orientation = exifOrientation(data.subarray(pos + 8, pos + length)) || 1;
    }
    if (sof.has(marker)) {
      if (length < 7) return null;
      return { width: data.readUInt16BE(pos + 5), height: data.readUInt16BE(pos + 3), type: 'jpeg', orientation };
    }
    pos += length;
  }
  return null;
}

function exifOrientation(tiff) {
  if (tiff.length < 8) return null;
  const order = tiff.toString('latin1', 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return null;
}

function pngInfo(data) {
  if (data.length < 24 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || data.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), type: 'png', orientation: 1 };
}

function webpInfo(data) {
  if (data.length < 30 || data.toString('latin1', 0, 4) !== 'RIFF' || data.toString('latin1', 8, 12) !== 'WEBP') return null;
  const kind = data.toString('latin1', 12, 16);
  if (kind === 'VP8 ' && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff, type: 'webp', orientation: 1 };
  }
  if (kind === 'VP8L' && data[20] === 0x2f) {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, type: 'webp', orientation: 1 };
  }
  if (kind === 'VP8X') {
    return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1, type: 'webp', orientation: 1 };
  }
  return null;
}

/* 브라우저가 화면에 놓는 치수(image-orientation: from-image 기본값) */
export function displaySize(data) {
  const info = jpegInfo(data) || pngInfo(data) || webpInfo(data);
  if (!info) return null;
  const swap = info.orientation >= 5 && info.orientation <= 8;
  return { width: swap ? info.height : info.width, height: swap ? info.width : info.height, type: info.type, rotated: swap };
}

const listHtml = (dir) => (fs.existsSync(path.join(ROOT, dir))
  ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.html')).sort().map((f) => `${dir}/${f}`)
  : []);
const pinned = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'office-request-commercial-baseline.json'), 'utf8'))));
const pages = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(f)).sort(),
  ...listHtml('posts'),
  ...listHtml('designs'),
].filter((rel) => !pinned.has(rel));

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>/]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};
const RASTER = /\.(?:jpe?g|png|webp)$/i;

const fail = [];
const sizeCache = new Map();
let pageCount = 0;
let checked = 0;
let rotated = 0;
for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
  const head = html.split('</head>')[0] || '';
  if (/name="robots"[^>]*content="[^"]*noindex/i.test(head)) continue; // 내부 화면은 대상이 아니다
  pageCount += 1;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = (attr(tag, 'src') || '').replace(/&amp;/g, '&');
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) continue; // 바깥 주소·data: 는 대상 밖
    const w = attr(tag, 'width');
    const h = attr(tag, 'height');
    if (w == null && h == null) continue;
    const relFile = path.posix.normalize(path.posix.join(path.posix.dirname(rel), decodeURIComponent(src.split(/[?#]/)[0])));
    if (relFile.startsWith('..')) { fail.push(`${rel}: 사이트 밖을 가리키는 <img>: ${src}`); continue; }
    if (!RASTER.test(relFile)) continue;
    if (w == null || h == null) { fail.push(`${rel}: width·height 중 한쪽만 있다(width=${w}, height=${h}) — 비율을 못 잡아 자리 잡힘이 없다: ${src}`); continue; }
    const file = path.join(ROOT, ...relFile.split('/'));
    if (!fs.existsSync(file)) { fail.push(`${rel}: <img> 파일이 없다: ${relFile}`); continue; }
    if (!sizeCache.has(relFile)) sizeCache.set(relFile, displaySize(fs.readFileSync(file)));
    const actual = sizeCache.get(relFile);
    if (!actual) { fail.push(`${rel}: 치수를 읽을 수 없는 그림(${relFile}) — JPEG·PNG·WebP 머리가 아니다`); continue; }
    checked += 1;
    if (actual.rotated) rotated += 1;
    if (!/^\d+$/.test(w) || !/^\d+$/.test(h) || Number(w) === 0 || Number(h) === 0) {
      fail.push(`${rel}: width·height 가 양의 정수가 아니다(${w}×${h}): ${src}`);
      continue;
    }
    const declared = Number(w) / Number(h);
    const real = actual.width / actual.height;
    if (Math.abs(declared / real - 1) > TOLERANCE) {
      fail.push(`${rel}: <img> 선언 ${w}×${h} 의 비율이 실제 ${actual.width}×${actual.height}${actual.rotated ? '(EXIF 방향 반영)' : ''} 와 다르다 — 그림을 받은 뒤 칸이 튄다: ${relFile}`);
    }
  }
}

// 눈이 멀지 않았는지 — 대상 페이지·사진이 비면 이 검사는 통과하고도 아무것도 지키지 않는다
if (pageCount < 60) fail.push(`공개 페이지를 ${pageCount}장만 찾았다 — 대상 목록이나 noindex 판정이 틀렸다`);
if (checked < 250) fail.push(`치수를 대조한 <img> 가 ${checked}개뿐이다 — 속성 읽기가 틀렸거나 페이지를 못 읽었다`);
if (!pages.includes('leak.html')) fail.push('leak.html 이 대상 목록에 없다');

if (fail.length) {
  console.error(`✗ <img> 선언 비율 ${fail.length}건 문제\n`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log(`✓ <img> 치수 — 공개 페이지 ${pageCount}장의 사진 ${checked}개(EXIF 돌림 ${rotated}) 선언 비율 == 실제 비율(±${TOLERANCE * 100}%)`);
