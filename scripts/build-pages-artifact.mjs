/* GitHub Pages 공개 허용목록을 _site/에 만든다.
 *
 * 저장소에는 Apps Script·은퇴 서버·테스트·운영 문서가 함께 있으므로 루트 전체를
 * 올리지 않는다. 손님 화면이 실제로 쓰는 정적 파일만 이름으로 허용한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const PUBLIC_DATA_FILES = ['config.json', 'material-catalog.json', 'project.json', 'site.json'];
const PUBLIC_DIR_RULES = new Map([
  ['assets', /\.(?:avif|gif|jpe?g|png|svg|webp)$/i],
  ['css', /\.css$/i],
  ['designs', /\.html$/i],
  ['js', /\.js$/i],
  ['posts', /\.html$/i],
]);
const PUBLIC_ROOT_FILES = [
  'admin.html', 'as.html', 'bathroom-check.html', 'blog.html', 'case-new.html',
  'field.html', 'index.html', 'leak.html', 'mypage.html', 'office.html', 'office-request.html', 'office-api.json', 'privacy.html',
  'google11dc37fbc3ab6e98.html', 'og-image.png', 'robots.txt', 'rss.xml', 'sitemap.xml'
];
const REQUIRED_PORTAL_FILES = [
  'office-api.json', 'office-request.html', 'css/office-request.css',
  'js/office-request-core.js', 'js/office-request-api.js', 'js/office-request-photo.js', 'js/office-request.js',
];

// 삭제 대상은 이 저장소 바로 아래의 고정 경로 한 곳뿐이다.
if (path.dirname(OUT) !== ROOT || path.basename(OUT) !== '_site') {
  throw new Error('안전하지 않은 Pages 출력 경로입니다: ' + OUT);
}
for (const name of REQUIRED_PORTAL_FILES) {
  if (!fs.existsSync(path.join(ROOT, name))) throw new Error('필수 관리사무소 포털 파일이 없습니다: ' + name);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const forbiddenName = (name) => /(?:^\.|(?:^|[-_.])(?:backup|backups|archive|archives|debug|tmp|temp)(?:[-_.]|$)|~$|\.(?:bak|backup|old|orig|tmp|temp|zip|7z|rar)$)/i.test(name);

function copyAllowedTree(sourceRoot, targetRoot, allowedFile) {
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (forbiddenName(entry.name) || entry.isSymbolicLink()) {
      throw new Error(`공개 금지 백업·임시·링크 경로가 있습니다: ${path.relative(ROOT, path.join(sourceRoot, entry.name))}`);
    }
    const src = path.join(sourceRoot, entry.name);
    const dest = path.join(targetRoot, entry.name);
    if (entry.isDirectory()) copyAllowedTree(src, dest, allowedFile);
    else if (entry.isFile() && allowedFile.test(entry.name)) fs.copyFileSync(src, dest);
    else throw new Error(`허용되지 않은 공개 파일 형식입니다: ${path.relative(ROOT, src)}`);
  }
}

for (const name of PUBLIC_ROOT_FILES) {
  const src = path.join(ROOT, name);
  if (!fs.existsSync(src)) throw new Error('필수 공개 파일이 없습니다: ' + name);
  fs.copyFileSync(src, path.join(OUT, name));
}
const dataRoot = path.join(ROOT, 'data');
const actualDataFiles = fs.readdirSync(dataRoot).sort();
if (JSON.stringify(actualDataFiles) !== JSON.stringify([...PUBLIC_DATA_FILES].sort())) {
  throw new Error(`data 공개 파일은 고정 허용목록과 정확히 같아야 합니다: ${actualDataFiles.join(', ')}`);
}
fs.mkdirSync(path.join(OUT, 'data'));
for (const name of PUBLIC_DATA_FILES) {
  fs.copyFileSync(path.join(dataRoot, name), path.join(OUT, 'data', name));
}

for (const [name, allowedFile] of PUBLIC_DIR_RULES) {
  const src = path.join(ROOT, name);
  if (!fs.existsSync(src)) throw new Error('필수 공개 폴더가 없습니다: ' + name);
  copyAllowedTree(src, path.join(OUT, name), allowedFile);
}

console.log(`✓ Pages 허용목록 생성 — 루트 파일 ${PUBLIC_ROOT_FILES.length}개 · data ${PUBLIC_DATA_FILES.length}개 · 형식 제한 폴더 ${PUBLIC_DIR_RULES.size}개`);
