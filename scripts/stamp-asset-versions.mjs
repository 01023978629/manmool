/* stamp-asset-versions.mjs — CSS·JS 캐시 토큰(?v=)을 '내용 해시' 하나로 맞춘다
 *
 * 왜: 같은 css/styles.css 를 페이지마다 다른 ?v= 로 불러 왔다(2026-09-26 실측 —
 *   brand-system.css 7종, styles.css 7종, lead-transport.js 3종 …). 브라우저는 주소가
 *   다르면 다른 파일로 보므로, 손님이 홈 → 사례 글 → 누수 페이지로 넘어갈 때마다 같은
 *   CSS 를 새로 받았다. 토큰을 손으로 올리다 보니 고친 페이지만 올라가고 나머지는 옛 토큰에
 *   남은 것이다. 토큰을 사람이 정하지 않고 파일 내용에서 뽑으면 '같은 자산 = 같은 토큰'이
 *   저절로 맞고, 내용이 바뀌면 토큰도 저절로 바뀐다.
 *
 * 토큰: 파일 내용(CRLF 는 LF 로 맞춘 뒤)의 SHA-256 앞 10자리. 윈도에서 CRLF 로 체크아웃해도
 *   같은 토큰이 나오게 줄바꿈을 맞춘다. prerender-posts.py·prerender-designs.py 가 같은 규칙으로
 *   직접 계산한다(asset_token) — 규칙을 바꾸면 세 곳을 같이 고쳐라.
 *
 * 제외: office-request.html 은 SHA-256 으로 고정된 직원 포털 페이지다
 *   (tests/fixtures/office-request-commercial-baseline.json) — 한 글자도 고치지 않는다.
 *   그 고정 목록에 든 파일도 이 스크립트는 읽기만 한다(HTML 의 ?v= 만 고친다).
 *
 * 사용: CSS·JS 를 고친 뒤  node scripts/stamp-asset-versions.mjs
 *   손으로 쓴 페이지와 posts/·designs/ 생성물의 ?v= 를 한 번에 바꾼다. 생성기도 같은 해시를
 *   계산하므로 그 뒤 prerender 를 다시 돌려도 결과가 같다.
 * 검사: scripts/ensure-asset-versions.mjs
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOKEN_LENGTH = 10;

/* 고치면 안 되는 페이지. 소유확인 파일은 참조가 없지만 한 줄짜리 증명이라 아예 열지 않는다. */
export const EXEMPT_PAGES = new Set(['office-request.html', 'google11dc37fbc3ab6e98.html']);

/* href/src="(../ | /manmool/)?(css|js)/이름.(css|js)?v=토큰" — 경로·토큰을 따로 잡는다. */
export const ASSET_REF = /((?:href|src)=")((?:\.\.\/|\/manmool\/)?)((?:css|js)\/[A-Za-z0-9._-]+\.(?:css|js))\?v=([^"&#]*)(")/g;

export function hashFixedFiles(root = ROOT) {
  const fixture = path.join(root, 'tests', 'fixtures', 'office-request-commercial-baseline.json');
  return fs.existsSync(fixture) ? new Set(Object.keys(JSON.parse(fs.readFileSync(fixture, 'utf8')))) : new Set();
}

export function assetToken(root, asset) {
  const file = path.join(root, ...asset.split('/'));
  const bytes = fs.readFileSync(file);
  const normalized = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, TOKEN_LENGTH);
}

export function publicPages(root = ROOT) {
  const hashFixed = hashFixedFiles(root);
  const list = (dir) => (fs.existsSync(path.join(root, dir))
    ? fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.html')).sort().map((f) => `${dir}/${f}`)
    : []);
  return [
    ...fs.readdirSync(root).filter((f) => f.endsWith('.html')).sort(),
    ...list('posts'),
    ...list('designs'),
  ].filter((rel) => !EXEMPT_PAGES.has(rel) && !hashFixed.has(rel));
}

export function assetRefs(html) {
  return [...html.matchAll(ASSET_REF)].map((m) => ({ asset: m[3], token: m[4], text: m[0] }));
}

export function stamp(root = ROOT) {
  const tokens = new Map();
  const tokenOf = (asset) => {
    if (!tokens.has(asset)) tokens.set(asset, assetToken(root, asset));
    return tokens.get(asset);
  };
  const changed = [];
  for (const rel of publicPages(root)) {
    const file = path.join(root, ...rel.split('/'));
    const html = fs.readFileSync(file, 'utf8');
    const next = html.replace(ASSET_REF, (all, open, prefix, asset, _old, close) => {
      if (!fs.existsSync(path.join(root, ...asset.split('/')))) return all; // 깨진 참조는 무결성 검사가 따로 잡는다
      return `${open}${prefix}${asset}?v=${tokenOf(asset)}${close}`;
    });
    if (next !== html) {
      fs.writeFileSync(file, next, 'utf8');
      changed.push(rel);
    }
  }
  return { changed, tokens };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { changed, tokens } = stamp();
  for (const [asset, token] of [...tokens].sort()) console.log(`  ${asset}?v=${token}`);
  console.log(`✓ 자산 ${tokens.size}개 토큰을 내용 해시로 맞춤 — 바뀐 페이지 ${changed.length}장`);
}
