/* ensure-og-image-dims.mjs — 공유 카드(og:image)의 선언 치수가 실제 그림 치수와 같은가
 *
 * 왜: 2026-09-26 에 세어 보니 blog.html·office.html·글 19편·시안 8장이 og:image:width/height 없이
 *   나가고 있었다. 카카오톡·페이스북은 치수가 없으면 첫 공유 때 그림을 비동기로 받아서 그 링크의
 *   첫 미리보기가 그림 없이 뜨기 쉽다. 반대로 치수를 손으로 적으면 그림을 바꿀 때 조용히 틀린다
 *   (AGENTS.md "치수를 보는 검사가 없어 조용히 틀린 채 나간다"). 그래서 선언을 실제 파일 머리
 *   (PNG IHDR·JPEG SOF·WebP VP8/VP8L/VP8X)에서 읽은 값과 대조한다.
 *   시안 8장은 og:image 가 WebP 였는데, 공유 미리보기가 WebP 를 그려 준다는 보장이 없어
 *   JPEG 사본(assets/designs/og/)으로 바꿨다 — 공유 카드 형식은 JPEG·PNG 만 허용한다.
 *
 * 대상: noindex 가 아닌 공개 HTML 전부(루트·posts/·designs/). 소유확인 파일은 뺀다.
 * 본다: ① og:image 가 있고 이 사이트 안의 파일을 가리키며 파일이 있다 ② JPEG·PNG 다
 *   ③ og:image:width/height 가 있고 실제 치수와 같다 ④ og:image:alt 가 있다 ⑤ twitter:card 가 있다
 *   ⑥ twitter:image 가 있으면 og:image 와 같은 그림이다.
 * 치수를 고치는 곳: 글은 scripts/prerender-posts.py, 시안은 scripts/prerender-designs.py 가 파일에서
 *   읽어 쓴다. 손으로 쓴 페이지(index·blog·office·leak·privacy·bathroom-check·404)는 이 검사가 알려 주는
 *   실제 값으로 고친다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://01023978629.github.io/manmool/';

export function jpegSize(data) {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let pos = 2;
  while (pos < data.length) {
    if (data[pos] !== 0xff) { pos += 1; continue; }
    while (pos < data.length && data[pos] === 0xff) pos += 1;
    if (pos >= data.length) return null;
    const marker = data[pos];
    pos += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda || pos + 2 > data.length) return null;
    const length = data.readUInt16BE(pos);
    if (length < 2) return null;
    if (sof.has(marker)) {
      if (pos + 7 > data.length) return null;
      return { width: data.readUInt16BE(pos + 5), height: data.readUInt16BE(pos + 3), type: 'jpeg' };
    }
    pos += length;
  }
  return null;
}

export function pngSize(data) {
  if (data.length < 24 || data.toString('latin1', 1, 4) !== 'PNG' || data.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), type: 'png' };
}

export function webpSize(data) {
  if (data.length < 30 || data.toString('latin1', 0, 4) !== 'RIFF' || data.toString('latin1', 8, 12) !== 'WEBP') return null;
  const kind = data.toString('latin1', 12, 16);
  if (kind === 'VP8 ' && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff, type: 'webp' };
  }
  if (kind === 'VP8L' && data[20] === 0x2f) {
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, type: 'webp' };
  }
  if (kind === 'VP8X') {
    return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1, type: 'webp' };
  }
  return null;
}

export const imageSize = (data) => jpegSize(data) || pngSize(data) || webpSize(data);

const meta = (head, attr, name) => {
  const tag = head.match(new RegExp(`<meta\\s+${attr}="${name.replace(/[.:]/g, '\\$&')}"\\s+content="([^"]*)"`, 'i'));
  return tag ? tag[1].replace(/&amp;/g, '&') : null;
};

const listHtml = (dir) => (fs.existsSync(path.join(ROOT, dir))
  ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.html')).sort().map((f) => `${dir}/${f}`)
  : []);
const pages = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(f)).sort(),
  ...listHtml('posts'),
  ...listHtml('designs'),
];

const fail = [];
const sizeCache = new Map();
let checked = 0;
for (const rel of pages) {
  const src = fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
  const head = src.split('</head>')[0] || '';
  if (/name="robots"[^>]*content="[^"]*noindex/i.test(head)) continue; // 내부 화면은 공유 카드 대상이 아니다
  checked += 1;
  const image = meta(head, 'property', 'og:image');
  if (!image) { fail.push(`${rel}: og:image 가 없다 — 링크를 보내면 그림 없는 카드가 뜬다`); continue; }
  if (!image.startsWith(BASE)) { fail.push(`${rel}: og:image 가 이 사이트 밖(${image})이다 — 절대주소 ${BASE}… 로 쓴다`); continue; }
  const relImage = decodeURIComponent(image.slice(BASE.length).split(/[?#]/)[0]);
  const file = path.join(ROOT, ...relImage.split('/'));
  if (relImage.split('/').includes('..') || !fs.existsSync(file)) { fail.push(`${rel}: og:image 파일이 없다 — ${relImage}`); continue; }
  if (!sizeCache.has(relImage)) sizeCache.set(relImage, imageSize(fs.readFileSync(file)));
  const actual = sizeCache.get(relImage);
  if (!actual) { fail.push(`${rel}: og:image(${relImage}) 의 치수를 읽을 수 없다`); continue; }
  if (actual.type === 'webp') fail.push(`${rel}: og:image 가 WebP(${relImage}) — 공유 미리보기가 못 그릴 수 있다. JPEG·PNG 사본을 쓴다(시안은 scripts/build-design-og-images.py)`);
  const width = meta(head, 'property', 'og:image:width');
  const height = meta(head, 'property', 'og:image:height');
  if (width == null || height == null) {
    fail.push(`${rel}: og:image:width/height 가 없다 — 실제 치수 ${actual.width}×${actual.height} 를 적어라`);
  } else if (Number(width) !== actual.width || Number(height) !== actual.height || !/^\d+$/.test(width) || !/^\d+$/.test(height)) {
    fail.push(`${rel}: og:image 선언 치수 ${width}×${height} ≠ 실제 ${actual.width}×${actual.height} (${relImage})`);
  }
  if (!meta(head, 'property', 'og:image:alt')) fail.push(`${rel}: og:image:alt 가 없다 — 화면 읽기 사용자에게 공유 그림 설명이 안 간다`);
  if (!meta(head, 'name', 'twitter:card')) fail.push(`${rel}: twitter:card 가 없다 — 큰 그림 카드(summary_large_image)로 안 뜬다`);
  const twitterImage = meta(head, 'name', 'twitter:image');
  if (twitterImage && twitterImage !== image) fail.push(`${rel}: twitter:image(${twitterImage}) 가 og:image 와 다른 그림이다`);
}

if (checked < 60) fail.push(`공개 페이지를 ${checked}장만 찾았다 — 대상 목록이 비었거나 noindex 판정이 틀렸다`);

if (fail.length) {
  console.error(`✗ 공유 카드 치수·형식 ${fail.length}건 문제\n`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log(`✓ 공유 카드 — 공개 페이지 ${checked}장 모두 og:image(JPEG·PNG)·선언 치수 == 실제 치수·alt·twitter:card`);
