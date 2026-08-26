import fs from 'node:fs';
import path from 'node:path';

export const PUBLIC_ROOT_FILES = Object.freeze([
  'admin.html', 'as.html', 'bathroom-check.html', 'blog.html', 'case-new.html',
  'field.html', 'index.html', 'leak.html', 'mypage.html', 'office.html', 'office-request.html', 'office-api.json', 'privacy.html',
  'google11dc37fbc3ab6e98.html', 'og-image.png', 'robots.txt', 'rss.xml', 'sitemap.xml',
]);
export const PUBLIC_DATA_FILES = Object.freeze(['config.json', 'material-catalog.json', 'project.json', 'site.json']);
export const PUBLIC_JS_FILES = Object.freeze([
  'admin.js', 'as.js', 'bathroom-check.js', 'blog.js', 'case-new.js', 'case-store.js', 'content-editor.js', 'design-bom.js', 'estimate.js',
  'field.js', 'hj-link.js', 'inquiry.js', 'lead-transport.js', 'leak-inquiry.js', 'leak.js', 'lookbook.js', 'main.js', 'mypage.js',
  'office-request-api.js', 'office-request-core.js', 'office-request-photo.js', 'office-request.js', 'pii-rules.js', 'project-state.js',
  'public-nav.js', 'simulator.js',
]);
export const PUBLIC_TREE_RULES = new Map([
  ['assets', /\.(?:avif|gif|jpe?g|png|svg|webp)$/i],
  ['css', /\.css$/i],
  ['designs', /\.html$/i],
  ['posts', /\.html$/i],
]);
export const PORTAL_PUBLIC_FILES = Object.freeze([
  'office-api.json', 'office-request.html', 'css/office-request.css',
  'js/office-request-core.js', 'js/office-request-api.js', 'js/office-request-photo.js', 'js/office-request.js',
]);

export function toPublicPath(value) {
  return String(value).replace(/\\/g, '/');
}

export function isForbiddenPublicName(name) {
  return /(?:^\.|(?:^|[-_.])(?:backup|backups|archive|archives|debug|tmp|temp)(?:[-_.]|$)|~$|\.(?:bak|backup|old|orig|tmp|temp|zip|7z|rar)$)/i.test(name);
}

function requireFile(fileSystem, file, description) {
  if (!fileSystem.existsSync(file)) throw new Error(`${description}: ${file}`);
}

function listAllowedTree(root, directory, allowedFile, fileSystem) {
  const sourceRoot = path.join(root, directory);
  requireFile(fileSystem, sourceRoot, '필수 공개 폴더가 없습니다');
  const found = [];
  function visit(current) {
    for (const entry of fileSystem.readdirSync(current, { withFileTypes: true })) {
      if (isForbiddenPublicName(entry.name) || entry.isSymbolicLink()) {
        throw new Error(`공개 금지 백업·임시·링크 경로가 있습니다: ${toPublicPath(path.relative(root, path.join(current, entry.name)))}`);
      }
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && allowedFile.test(entry.name)) found.push(absolute);
      else throw new Error(`허용되지 않은 공개 파일 형식입니다: ${toPublicPath(path.relative(root, absolute))}`);
    }
  }
  visit(sourceRoot);
  return found;
}

function listExplicitJavaScript(root, fileSystem) {
  const jsRoot = path.join(root, 'js');
  requireFile(fileSystem, jsRoot, '필수 공개 폴더가 없습니다');
  const actual = fileSystem.readdirSync(jsRoot, { withFileTypes: true });
  const names = actual.map((entry) => entry.name).sort();
  const expected = [...PUBLIC_JS_FILES].sort();
  if (actual.some((entry) => !entry.isFile() || isForbiddenPublicName(entry.name)) || JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`js 공개 파일은 명시적 허용목록과 정확히 같아야 합니다: ${names.join(', ')}`);
  }
  return PUBLIC_JS_FILES.map((name) => path.join(jsRoot, name));
}

export function expectedPublicFiles(root, fileSystem = fs) {
  const files = [];
  for (const name of PUBLIC_ROOT_FILES) {
    const source = path.join(root, name);
    requireFile(fileSystem, source, '필수 공개 파일이 없습니다');
    files.push(source);
  }
  const dataRoot = path.join(root, 'data');
  requireFile(fileSystem, dataRoot, '필수 공개 폴더가 없습니다');
  const actualData = fileSystem.readdirSync(dataRoot).sort();
  if (JSON.stringify(actualData) !== JSON.stringify([...PUBLIC_DATA_FILES].sort())) {
    throw new Error(`data 공개 파일은 고정 허용목록과 정확히 같아야 합니다: ${actualData.join(', ')}`);
  }
  files.push(...PUBLIC_DATA_FILES.map((name) => path.join(dataRoot, name)));
  files.push(...listExplicitJavaScript(root, fileSystem));
  for (const [directory, allowedFile] of PUBLIC_TREE_RULES) files.push(...listAllowedTree(root, directory, allowedFile, fileSystem));
  return files.map((source) => ({ source, relative: toPublicPath(path.relative(root, source)) }));
}
