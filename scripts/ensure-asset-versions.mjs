/* ensure-asset-versions.mjs — 같은 CSS·JS 는 어느 페이지에서나 같은 ?v= 토큰으로 부른다
 *
 * 왜: 2026-09-26 에 세어 보니 css/brand-system.css 를 7가지, css/styles.css 를 7가지,
 *   js/lead-transport.js 를 3가지 다른 ?v= 로 부르고 있었다. 브라우저는 주소가 다르면 다른
 *   파일로 보므로 손님이 페이지를 옮길 때마다 같은 CSS 를 다시 받았다(휴대폰 데이터·첫 화면
 *   시간). 토큰을 손으로 올리다 보니 고친 페이지만 올라가고 나머지가 옛 토큰에 남은 결과다.
 *   지금은 토큰이 파일 내용의 해시다(scripts/stamp-asset-versions.mjs). 이 검사는
 *   ① 같은 자산을 두 가지 이상 토큰으로(또는 토큰 없이) 부르는 페이지가 없는지
 *   ② 토큰이 지금 파일 내용의 해시인지(CSS 를 고치고 도장을 안 찍으면 옛 화면이 남는다)
 *   ③ 생성기(prerender-posts.py·prerender-designs.py)가 토큰을 글자로 박아 두지 않았는지 본다.
 *
 * 고치는 법: node scripts/stamp-asset-versions.mjs  (손으로 쓴 페이지·posts/·designs/ 를 한 번에)
 * 제외: office-request.html(SHA-256 고정 직원 포털)과 그 고정 목록의 파일.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ASSET_REF, assetToken, publicPages } from './stamp-asset-versions.mjs';

const fail = [];
const pages = publicPages(ROOT);
const uses = new Map(); // asset -> Map(token -> [pages])
const addUse = (asset, token, page) => {
  if (!uses.has(asset)) uses.set(asset, new Map());
  const byToken = uses.get(asset);
  if (!byToken.has(token)) byToken.set(token, []);
  byToken.get(token).push(page);
};

let refs = 0;
for (const page of pages) {
  const html = fs.readFileSync(path.join(ROOT, ...page.split('/')), 'utf8');
  for (const match of html.matchAll(ASSET_REF)) {
    const asset = match[3];
    refs += 1;
    if (!fs.existsSync(path.join(ROOT, ...asset.split('/')))) {
      fail.push(`${page} 이 없는 자산을 부른다: ${asset}`);
      continue;
    }
    addUse(asset, match[4], page);
  }
  // 같은 자산을 토큰 없이 부르면 그것도 다른 주소다 — 토큰이 붙은 쪽과 따로 내려받는다.
  for (const match of html.matchAll(/(?:href|src)="(?:\.\.\/|\/manmool\/)?((?:css|js)\/[A-Za-z0-9._-]+\.(?:css|js))"/g)) {
    addUse(match[1], '(토큰 없음)', page);
  }
}

const sample = (list) => list.slice(0, 3).join(', ') + (list.length > 3 ? ` 외 ${list.length - 3}장` : '');
for (const [asset, byToken] of [...uses].sort(([a], [b]) => a.localeCompare(b))) {
  const tokens = [...byToken.keys()];
  if (tokens.length === 1 && tokens[0] === '(토큰 없음)') continue; // 한 페이지 전용·토큰 없는 자산(404 복구 화면)은 주소가 하나뿐이다
  if (tokens.length > 1) {
    fail.push(`${asset} 를 ${tokens.length}가지 주소로 부른다 — ${tokens.map((t) => `?v=${t} (${sample(byToken.get(t))})`).join(' · ')}`);
    continue;
  }
  const expected = assetToken(ROOT, asset);
  if (tokens[0] !== expected) {
    fail.push(`${asset} 내용이 바뀌었는데 토큰이 옛 해시다(?v=${tokens[0]} → ${expected}) — 방문자에게 옛 화면이 남는다`);
  }
}

/* 생성기가 토큰을 글자로 박으면 posts/·designs/ 만 옛 토큰에 남는다(예전 V = '20260907-…' 가 그랬다). */
for (const generator of ['scripts/prerender-posts.py', 'scripts/prerender-designs.py']) {
  const source = fs.readFileSync(path.join(ROOT, generator), 'utf8');
  const literal = source.match(/\.(?:css|js)\?v=[A-Za-z0-9]/);
  if (literal) fail.push(`${generator} 가 캐시 토큰을 글자로 박았다(${literal[0]}…) — asset_token() 으로 내용 해시를 쓰게 하라`);
  if (!/asset_token\(/.test(source)) fail.push(`${generator} 가 asset_token() 을 쓰지 않는다 — 생성물 토큰이 손으로 쓴 페이지와 갈린다`);
}

if (fail.length) {
  console.error(`✗ 자산 캐시 토큰 ${fail.length}건 문제 — node scripts/stamp-asset-versions.mjs 를 돌린 뒤 prerender 결과와 함께 커밋하라\n`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log(`✓ 자산 캐시 토큰 — 페이지 ${pages.length}장 · 참조 ${refs}건 · 자산 ${uses.size}개가 각각 한 주소, 전부 지금 내용의 해시`);
