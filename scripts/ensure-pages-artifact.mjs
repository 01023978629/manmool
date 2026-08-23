/* build-pages-artifact.mjs가 만든 실제 GitHub Pages 산출물을 검증한다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, '_site');
const fail = [];
const requiredDirs = ['assets', 'css', 'data', 'designs', 'js', 'posts'];
const forbiddenTop = ['.git', '.github', '.claude', '.codex', 'apps-script-contract',
  'contract-backend', 'docs', 'integrations', 'scripts'];
const googleVerificationFile = 'google11dc37fbc3ab6e98.html';
const requiredRoot = [
  'admin.html', 'as.html', 'bathroom-check.html', 'blog.html', 'case-new.html',
  'field.html', 'index.html', 'leak.html', 'mypage.html', 'office.html', 'privacy.html',
  googleVerificationFile, 'og-image.png', 'robots.txt', 'rss.xml', 'sitemap.xml'
];
const buildSource = fs.readFileSync(path.join(ROOT, 'scripts', 'build-pages-artifact.mjs'), 'utf8');
if (/readdirSync\(ROOT[\s\S]*?endsWith\(['"]\.html['"]\)/.test(buildSource)) {
  fail.push('빌드가 루트의 모든 HTML을 자동 공개한다 — 고정 허용목록이어야 함');
}
if (!/PUBLIC_DATA_FILES\s*=/.test(buildSource)
    || /fs\.cpSync\(src,\s*path\.join\(OUT,\s*name\)[\s\S]*?recursive:\s*true/.test(buildSource)) {
  fail.push('공개 폴더를 통째로 복사한다 — data 고정 허용목록과 파일 형식 검사가 필요함');
}

if (!fs.existsSync(SITE)) {
  console.error('✗ _site 허용목록 산출물이 없습니다 — build-pages-artifact.mjs를 먼저 실행해야 합니다');
  process.exit(1);
}

for (const name of [...requiredRoot, ...requiredDirs]) {
  if (!fs.existsSync(path.join(SITE, name))) fail.push(`필수 공개 경로 누락: ${name}`);
}
for (const name of forbiddenTop) {
  if (fs.existsSync(path.join(SITE, name))) fail.push(`비공개 소스가 Pages 산출물에 포함됨: ${name}`);
}
const allowedTop = new Set([...requiredRoot, ...requiredDirs]);
for (const entry of fs.readdirSync(SITE, { withFileTypes: true })) {
  if (!allowedTop.has(entry.name)) fail.push(`허용목록 밖의 최상위 경로가 포함됨: ${entry.name}`);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

const files = walk(SITE);
const allowedByDir = new Map([
  ['assets', /\.(?:avif|gif|jpe?g|png|svg|webp)$/i],
  ['css', /\.css$/i],
  ['designs', /\.html$/i],
  ['js', /\.js$/i],
  ['posts', /\.html$/i],
]);
for (const file of files) {
  const name = path.basename(file);
  const relParts = path.relative(SITE, file).split(path.sep);
  const hasPrivateSegment = relParts.some((part) => /(?:^\.|(?:^|[-_.])(?:backup|backups|archive|archives|debug|tmp|temp)(?:[-_.]|$)|~$|\.(?:bak|backup|old|orig|tmp|temp|zip|7z|rar)$)/i.test(part));
  if (hasPrivateSegment
      || /\.(?:md|mjs|cjs|py|gs|sh|env)$/i.test(file)) {
    fail.push(`실행·문서 소스 파일이 Pages 산출물에 포함됨: ${path.relative(SITE, file)}`);
  }
  const top = relParts[0];
  if (allowedByDir.has(top) && !allowedByDir.get(top).test(name)) {
    fail.push(`공개 폴더에 허용되지 않은 파일 형식이 포함됨: ${path.relative(SITE, file)}`);
  }
}

const requiredData = ['config.json', 'material-catalog.json', 'project.json', 'site.json'];
const actualData = fs.readdirSync(path.join(SITE, 'data')).sort();
if (JSON.stringify(actualData) !== JSON.stringify(requiredData)) {
  fail.push(`data 공개 파일이 고정 허용목록과 다름: ${actualData.join(', ')}`);
}

const googleVerificationPath = path.join(SITE, googleVerificationFile);
if (fs.existsSync(googleVerificationPath)) {
  const actualVerification = fs.readFileSync(googleVerificationPath, 'utf8').trim();
  const expectedVerification = `google-site-verification: ${googleVerificationFile}`;
  if (actualVerification !== expectedVerification) {
    fail.push('Google Search Console 소유권 확인 파일 내용이 발급값과 다름');
  }
}

function checkRef(owner, raw) {
  const ref = String(raw || '').trim();
  if (!ref || /^(?:#|https?:|tel:|sms:|mailto:|data:|blob:|javascript:)/i.test(ref)) return;
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('/')) return;
  let target = path.resolve(path.dirname(owner), decodeURIComponent(clean));
  if (clean.endsWith('/')) target = path.join(target, 'index.html');
  const rel = path.relative(SITE, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    fail.push(`산출물 밖을 가리키는 링크: ${path.relative(SITE, owner)} -> ${ref}`);
  } else if (!fs.existsSync(target)) {
    fail.push(`산출물에서 끊긴 링크: ${path.relative(SITE, owner)} -> ${ref}`);
  }
}

for (const file of files) {
  if (/\.html$/i.test(file)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) checkRef(file, match[1]);
  } else if (/\.css$/i.test(file)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const match of src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) checkRef(file, match[1]);
  }
}

if (fail.length) {
  console.error(`✗ Pages 허용목록 산출물 ${fail.length}건 문제\n`);
  fail.slice(0, 80).forEach((item) => console.error(`  - ${item}`));
  if (fail.length > 80) console.error(`  - 외 ${fail.length - 80}건`);
  process.exit(1);
}

console.log(`✓ Pages 허용목록 산출물 정상 — 파일 ${files.length}개 · 서버 소스/테스트/문서 제외`);
