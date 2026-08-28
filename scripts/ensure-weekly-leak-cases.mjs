import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEEKLY_CASES = [
  { slug: 'apartment-basement-cast-iron-pipe-repair', images: [
    'assets/cases/apartment-basement-cast-iron-pipe-repair-cover.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-1.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-2.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-3.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-4.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-5.jpg'
  ]},
  { slug: 'apartment-balcony-rain-pipe-replacement', images: [
    'assets/cases/apartment-balcony-rain-pipe-replacement-cover.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-1.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-2.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-3.jpg'
  ]},
  { slug: 'apartment-upper-lower-rain-pipe-repair', images: [
    'assets/cases/apartment-upper-lower-rain-pipe-repair-cover.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-1.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-2.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-3.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-4.jpg'
  ]}
];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const allImages = WEEKLY_CASES.flatMap((item) => item.images);

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (sof.has(marker) && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

if (WEEKLY_CASES.map((item) => item.images.length).join(',') !== '6,4,5') failures.push('사례별 사진 수는 6,4,5여야 한다');
if (allImages.length !== 15) failures.push(`전체 사진 수가 ${allImages.length}장이다`);
if (new Set(allImages).size !== allImages.length) failures.push('새 사례 사진 경로가 중복된다');
for (const relative of allImages) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) { failures.push(`사진 없음: ${relative}`); continue; }
  const buffer = fs.readFileSync(absolute);
  if (buffer.length > 500000) failures.push(`사진이 500KB를 넘음: ${relative}`);
  if (buffer.includes(Buffer.from('Exif\0\0', 'binary'))) failures.push(`EXIF가 남음: ${relative}`);
  const size = jpegSize(buffer);
  if (!size) failures.push(`JPEG 치수를 읽을 수 없음: ${relative}`);
  else if (size.width > 1600 || size.height > 1600) failures.push(`1600px를 넘음: ${relative} ${size.width}x${size.height}`);
}

if (failures.length) {
  console.error(`최근 누수 사례 검사 실패 ${failures.length}건`);
  failures.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log('PASS 최근 누수 사례 3건 · 사진 15장');
