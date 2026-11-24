import fs from 'node:fs';
import path from 'node:path';

export const PUBLIC_ROOT_FILES = Object.freeze([
  '404.html', 'as.html', 'bathroom-check.html', 'blog.html',
  'field.html', 'index.html', 'lead-inbox.html', 'leak.html', 'mypage.html', 'office.html', 'office-request.html', 'office-api.json',
  'office-login.html', 'office-portal.html', 'office-admin.html', 'office-portal-api.json', 'privacy.html', 'review.html',
  'google11dc37fbc3ab6e98.html', 'og-image.png', 'robots.txt', 'rss.xml', 'sitemap.xml',
]);
export const PUBLIC_DATA_FILES = Object.freeze(['config.json', 'leak-case-index.json', 'material-catalog.json', 'project.json', 'site.json']);
export const PUBLIC_JS_FILES = Object.freeze([
  'as.js', 'bathroom-check.js', 'blog.js', 'design-bom.js', 'estimate.js',
  'field.js', 'hj-link.js', 'inquiry.js', 'revenue-conversion.js', 'review.js', 'lead-inbox-api.js', 'lead-inbox.js', 'lead-transport.js', 'office-pilot.js', 'leak-inquiry.js', 'leak.js', 'lookbook.js', 'main.js', 'mypage.js',
  'office-request-api.js', 'office-request-core.js', 'office-request-photo.js', 'office-request.js',
  'office-frame-guard.js', 'office-portal-api.js', 'office-portal-core.js', 'office-login.js', 'office-portal.js', 'office-admin.js', 'pii-rules.js', 'project-state.js',
  'page-recovery.js', 'public-nav.js', 'service-nav.js', 'simulator.js',
]);
/* 저장소에는 남기되 Pages 공개 산출물에는 넣지 않는 내부 화면(2026-11-19).
 * admin.html(연동 상태·콘텐츠 편집기)·case-new.html(사례 등록)은 로그인 없이 공개 주소에서 열렸다(내용은 비어 있음).
 * 대표는 사례·글을 Claude PR 로만 올리므로 공개할 이유가 없다. 쓰려면 저장소를 내려받아 로컬에서 연다(README '내부 화면').
 * 이 목록의 파일은 공개 허용목록(PUBLIC_*)에 다시 넣을 수 없고, 산출물에 있으면 ensure-pages-artifact 가 막는다. */
export const LOCAL_ONLY_ROOT_FILES = Object.freeze(['admin.html', 'case-new.html']);
export const LOCAL_ONLY_JS_FILES = Object.freeze(['admin.js', 'case-new.js', 'case-store.js', 'content-editor.js']);
export const LOCAL_ONLY_TREE_FILES = Object.freeze(['css/admin.css', 'css/case-new.css']);
export const LOCAL_ONLY_FILES = Object.freeze([
  ...LOCAL_ONLY_ROOT_FILES, ...LOCAL_ONLY_JS_FILES.map((name) => `js/${name}`), ...LOCAL_ONLY_TREE_FILES,
]);

export const PUBLIC_TREE_RULES = new Map([
  // 2026-11-25: area/ = 대전 구별 현장 기록 쪽(scripts/prerender-posts.py 생성, scripts/ensure-area-pages.mjs 검사).
  ['area', /\.html$/i],
  ['assets', /\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm)$/i],
  ['css', /\.css$/i],
  ['designs', /\.html$/i],
  ['posts', /\.html$/i],
]);
export const PORTAL_PUBLIC_FILES = Object.freeze([
  'office-api.json', 'office-request.html', 'css/office-request.css',
  'js/office-request-core.js', 'js/office-request-api.js', 'js/office-request-photo.js', 'js/office-request.js',
  'office-portal-api.json', 'office-login.html', 'office-portal.html', 'office-admin.html', 'css/office-portal.css',
  'js/office-frame-guard.js', 'js/office-portal-core.js', 'js/office-portal-api.js', 'js/office-login.js', 'js/office-portal.js', 'js/office-admin.js',
  'lead-inbox.html', 'css/lead-inbox.css', 'js/lead-inbox-api.js', 'js/lead-inbox.js',
]);

export function toPublicPath(value) {
  return String(value).replace(/\\/g, '/');
}

const PROHIBITED_DIRECTORY_SEGMENT = /^(?:test|tests|fixture|fixtures|__tests__|__fixtures__)$/i;
const PROHIBITED_TEST_SEGMENT_PATTERN = /(?:^|[._-])(?:test-fixture|fixture-test|command-history)(?:[._-]|$)/i;
const PROHIBITED_FILE_PATTERN = /(?:\.test\.|\.spec\.|\.fixture\.|^(?:\.bash_history|\.zsh_history|ConsoleHost_history\.txt|PowerShell_history\.txt)$)/i;

export function assertAllowedPublicPath(relative) {
  const normalized = toPublicPath(relative);
  const segments = normalized.split('/');
  const name = segments.at(-1) || '';
  if (!normalized || normalized.startsWith('/') || segments.some((segment) => PROHIBITED_DIRECTORY_SEGMENT.test(segment) || PROHIBITED_TEST_SEGMENT_PATTERN.test(segment)) || PROHIBITED_FILE_PATTERN.test(name)) {
    throw new Error(`공개 경로에 금지된 테스트·fixture·history 구조가 있습니다: ${normalized}`);
  }
  return normalized;
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
      assertAllowedPublicPath(path.relative(root, absolute));
      if (entry.isFile() && LOCAL_ONLY_TREE_FILES.includes(toPublicPath(path.relative(root, absolute)))) continue;
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
  // js/ 의 모든 파일은 공개(PUBLIC_JS_FILES) 아니면 로컬 전용(LOCAL_ONLY_JS_FILES) 중 하나로 이름이 적혀 있어야 한다.
  // 로컬 전용은 저장소에 없어도 되지만(허용목록만 복사한 사본), 공개 목록은 빠짐없이 있어야 한다.
  const names = actual.map((entry) => entry.name).filter((name) => !LOCAL_ONLY_JS_FILES.includes(name)).sort();
  const expected = [...PUBLIC_JS_FILES].sort();
  if (actual.some((entry) => !entry.isFile() || isForbiddenPublicName(entry.name)) || JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`js 공개 파일은 명시적 허용목록과 정확히 같아야 합니다: ${names.join(', ')}`);
  }
  return PUBLIC_JS_FILES.map((name) => {
    assertAllowedPublicPath(`js/${name}`);
    return path.join(jsRoot, name);
  });
}

export function assertNoLocalOnlyInPublicLists() {
  const leaked = [
    ...PUBLIC_ROOT_FILES.filter((name) => LOCAL_ONLY_ROOT_FILES.includes(name)),
    ...PUBLIC_JS_FILES.filter((name) => LOCAL_ONLY_JS_FILES.includes(name)).map((name) => `js/${name}`),
    ...PORTAL_PUBLIC_FILES.filter((name) => LOCAL_ONLY_FILES.includes(name)),
  ];
  if (leaked.length) throw new Error(`로컬 전용 내부 화면이 공개 허용목록에 들어 있습니다: ${leaked.join(', ')}`);
}

export function expectedPublicFiles(root, fileSystem = fs) {
  assertNoLocalOnlyInPublicLists();
  const files = [];
  for (const name of PUBLIC_ROOT_FILES) {
    assertAllowedPublicPath(name);
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
  files.push(...PUBLIC_DATA_FILES.map((name) => {
    assertAllowedPublicPath(`data/${name}`);
    return path.join(dataRoot, name);
  }));
  files.push(...listExplicitJavaScript(root, fileSystem));
  for (const [directory, allowedFile] of PUBLIC_TREE_RULES) files.push(...listAllowedTree(root, directory, allowedFile, fileSystem));
  return files.map((source) => ({ source, relative: toPublicPath(path.relative(root, source)) }));
}
