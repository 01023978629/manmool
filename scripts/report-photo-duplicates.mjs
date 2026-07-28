/* report-photo-duplicates.mjs — 사례 사진이 손님 눈에 몇 번 겹쳐 보이는지 센다
 *
 * 손님은 시안을 '설명'이 아니라 '사진'으로 훑는다. 제목과 자재 목록이 달라도
 * 사진이 똑같으면 같은 시안 두 개를 본 것이고, 300가지라는 표기가 무색해진다.
 *
 * 화면 한 칸의 정체 = 사진 + 잘라낸 위치(photoPosition) + 배율(photoScale) + 좌우반전(photoMirror).
 * js/main.js 의 portfolioPhotoStyle() 이 실제로 이 네 가지로 그림을 만든다 — 여기 기준을 맞춘다.
 *
 * 사용:
 *   node scripts/report-photo-duplicates.mjs          목록 보기
 *   node scripts/report-photo-duplicates.mjs --ids    고쳐야 할 시안 id 만 (한 줄에 하나)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const items = Array.isArray(site.portfolio) ? site.portfolio : [];
const idsOnly = process.argv.includes('--ids');

const photoOf = (x) => String(x.photo || '').split('?')[0];   // ?v= 는 캐시용이라 그림과 무관하다
const screenOf = (x) => [photoOf(x), x.photoPosition || '', x.photoScale || '', x.photoMirror ? 'm' : ''].join('|');

const groups = new Map();
items.forEach((x) => {
  const k = screenOf(x);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(x);
});

const dupes = [...groups.values()].filter((g) => g.length > 1);
// 묶음마다 하나는 남고 나머지가 '겹치는 것'이다.
const redundant = dupes.flatMap((g) => g.slice(1));

if (idsOnly) {
  redundant.forEach((x) => console.log(x.id));
  process.exit(0);
}

const bySpace = new Map();
items.forEach((x) => {
  const s = x.spaceType || '(공간없음)';
  if (!bySpace.has(s)) bySpace.set(s, []);
  bySpace.get(s).push(x);
});

console.log('\n===== 공간별 사진 다양성 =====');
console.log('공간        시안   사진   화면   겹침   가장 많이 쓰인 사진');
[...bySpace.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([s, v]) => {
  const photos = new Map();
  const screens = new Map();
  v.forEach((x) => {
    photos.set(photoOf(x), (photos.get(photoOf(x)) || 0) + 1);
    screens.set(screenOf(x), (screens.get(screenOf(x)) || 0) + 1);
  });
  const dup = [...screens.values()].reduce((a, c) => a + (c > 1 ? c - 1 : 0), 0);
  const top = [...photos.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(
    s.padEnd(10) + String(v.length).padStart(4) + String(photos.size).padStart(7)
    + String(screens.size).padStart(7) + String(dup).padStart(7)
    + '   ' + path.basename(top[0]) + ' (' + top[1] + '회)'
  );
});

console.log('\n===== 화면이 완전히 겹치는 묶음 =====');
dupes.sort((a, b) => b.length - a.length).forEach((g) => {
  console.log(`${String(g.length).padStart(2)}개 · ${g[0].spaceType} · ${path.basename(photoOf(g[0]))}`);
  console.log(`     그대로: ${g[0].id}`);
  console.log(`     고칠 것: ${g.slice(1).map((x) => x.id).join(' · ')}`);
});

const batches = new Map();
redundant.forEach((x) => {
  const b = x.catalogBatch || '(초기)';
  batches.set(b, (batches.get(b) || 0) + 1);
});

console.log('\n===== 요약 =====');
console.log(`시안 ${items.length}개 · 서로 다른 화면 ${groups.size}개 · 겹치는 시안 ${redundant.length}개`);
console.log('겹침이 나온 배치: ' + [...batches.entries()].map(([b, n]) => `${b} ${n}건`).join(' · '));
console.log('\n고칠 시안 id 만 뽑기:  node scripts/report-photo-duplicates.mjs --ids');
