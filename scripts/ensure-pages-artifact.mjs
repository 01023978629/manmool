/* build-pages-artifact.mjs가 만든 실제 GitHub Pages 산출물을 검증한다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PORTAL_PUBLIC_FILES, PUBLIC_ROOT_FILES, expectedPublicFiles, toPublicPath } from './pages-artifact-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const googleVerificationFile = 'google11dc37fbc3ab6e98.html';
const forbiddenTop = new Set(['.git', '.github', '.claude', '.codex', 'apps-script-contract', 'contract-backend', 'docs', 'integrations', 'scripts']);
const textFile = /\.(?:html|css|js|json|txt|xml)$/i;
const secretIdentifiers = [/\b(?:APP_TOKEN|OFFICE_SESSION_SECRET|pinHash|pinSalt)\b/];
const portalFixtureMarkers = [
  /\b(?:123456|session-allowlist-test|session-workflow|session-test|test-session|fixture-(?:session|contact|request))\b/i,
  /010-(?:1234|9999)-(?:5678|8888)/,
  /(?:김소장|홍길동|대표 내부 메모)/,
];

function sha256(file, fileSystem) {
  return crypto.createHash('sha256').update(fileSystem.readFileSync(file)).digest('hex');
}

function walk(directory, root, fileSystem, failures) {
  const files = [];
  const directories = [];
  function visit(current) {
    for (const entry of fileSystem.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        directories.push(absolute);
        visit(absolute);
      } else if (entry.isFile()) files.push(absolute);
      else failures.push(`산출물에 허용되지 않은 특수 경로가 있음: ${toPublicPath(path.relative(root, absolute))}`);
    }
  }
  visit(directory);
  return { files, directories };
}

function expectedDirectories(files) {
  const directories = new Set();
  for (const { relative } of files) {
    const parts = relative.split('/');
    parts.pop();
    while (parts.length) {
      directories.add(parts.join('/'));
      parts.pop();
    }
  }
  return directories;
}

export function scanArtifactText(relative, content) {
  const normalized = toPublicPath(relative);
  const failures = [];
  if (secretIdentifiers.some((marker) => marker.test(content))) failures.push(`공개 산출물에 비밀 식별자가 있음: ${normalized}`);
  if (PORTAL_PUBLIC_FILES.includes(normalized) && portalFixtureMarkers.some((marker) => marker.test(content))) {
    failures.push(`포털 산출물에 테스트·PIN·세션·연락처 fixture가 있음: ${normalized}`);
  }
  return failures;
}

function checkRef(owner, raw, site, fileSystem, failures) {
  const ref = String(raw || '').trim();
  if (!ref || /^(?:#|https?:|tel:|sms:|mailto:|data:|blob:|javascript:)/i.test(ref)) return;
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean || clean.startsWith('/')) return;
  let target = path.resolve(path.dirname(owner), decodeURIComponent(clean));
  if (clean.endsWith('/')) target = path.join(target, 'index.html');
  const relative = path.relative(site, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) failures.push(`산출물 밖을 가리키는 링크: ${toPublicPath(path.relative(site, owner))} -> ${ref}`);
  else if (!fileSystem.existsSync(target)) failures.push(`산출물에서 끊긴 링크: ${toPublicPath(path.relative(site, owner))} -> ${ref}`);
}

export function verifyPagesArtifact(root = ROOT, site = path.join(root, '_site'), fileSystem = fs) {
  const failures = [];
  if (!fileSystem.existsSync(site)) return ['_site 허용목록 산출물이 없습니다 — build-pages-artifact.mjs를 먼저 실행해야 합니다'];
  let expected = [];
  try {
    expected = expectedPublicFiles(root, fileSystem);
  } catch (error) {
    failures.push(`공개 소스 허용목록 오류: ${error.message}`);
  }
  const actual = walk(site, site, fileSystem, failures);
  const actualFiles = new Map(actual.files.map((file) => [toPublicPath(path.relative(site, file)), file]));
  const expectedFiles = new Map(expected.map((entry) => [entry.relative, entry.source]));
  for (const [relative, source] of expectedFiles) {
    const output = actualFiles.get(relative);
    if (!output) failures.push(`필수 공개 산출물 누락: ${relative}`);
    else if (sha256(source, fileSystem) !== sha256(output, fileSystem)) failures.push(`산출물이 현재 공개 소스와 다름(신선한 빌드 필요): ${relative}`);
  }
  for (const relative of actualFiles.keys()) if (!expectedFiles.has(relative)) failures.push(`허용목록 밖의 output-only 산출물이 포함됨: ${relative}`);
  const actualDirectories = new Set(actual.directories.map((directory) => toPublicPath(path.relative(site, directory))));
  const expectedDirs = expectedDirectories(expected);
  for (const relative of expectedDirs) if (!actualDirectories.has(relative)) failures.push(`필수 공개 폴더 누락: ${relative}`);
  for (const relative of actualDirectories) if (!expectedDirs.has(relative)) failures.push(`허용목록 밖의 output-only 폴더가 포함됨: ${relative}`);
  for (const entry of fileSystem.readdirSync(site, { withFileTypes: true })) if (forbiddenTop.has(entry.name)) failures.push(`비공개 소스가 Pages 산출물에 포함됨: ${entry.name}`);
  for (const [relative, file] of actualFiles) {
    if (!textFile.test(file)) continue;
    failures.push(...scanArtifactText(relative, fileSystem.readFileSync(file, 'utf8')));
  }
  const verification = path.join(site, googleVerificationFile);
  if (fileSystem.existsSync(verification) && fileSystem.readFileSync(verification, 'utf8').trim() !== `google-site-verification: ${googleVerificationFile}`) {
    failures.push('Google Search Console 소유권 확인 파일 내용이 발급값과 다름');
  }
  /* 소유확인 파일이 저장소에는 있는데 공개 허용목록에 없으면 — 배포에서 조용히 빠진다.
   * 오류도 안 나고, 검색엔진은 파일을 못 찾아 소유확인만 실패한다. 왜 안 되는지 알 길이
   * 없는 실패라서 여기서 크게 막는다. 허용목록은 계속 명시적으로 둔다(아무 파일이나
   * 공개되지 않게 하는 것이 이 목록의 존재 이유다). */
  for (const name of fileSystem.readdirSync(ROOT)) {
    if (!/^(?:google|naver)[A-Za-z0-9_-]{8,}\.html$/i.test(name)) continue;
    if (PUBLIC_ROOT_FILES.includes(name)) continue;
    failures.push(`소유확인 파일 ${name} 이 공개 허용목록에 없어 배포에서 빠진다 — `
      + `scripts/pages-artifact-policy.mjs 의 PUBLIC_ROOT_FILES 에 '${name}' 를 추가하세요`);
  }
  for (const file of actual.files) {
    if (/\.html$/i.test(file)) {
      for (const match of fileSystem.readFileSync(file, 'utf8').matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) checkRef(file, match[1], site, fileSystem, failures);
    } else if (/\.css$/i.test(file)) {
      for (const match of fileSystem.readFileSync(file, 'utf8').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) checkRef(file, match[1], site, fileSystem, failures);
    }
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = verifyPagesArtifact();
  if (failures.length) {
    console.error(`✗ Pages 허용목록 산출물 ${failures.length}건 문제\n`);
    failures.slice(0, 80).forEach((item) => console.error(`  - ${item}`));
    if (failures.length > 80) console.error(`  - 외 ${failures.length - 80}건`);
    process.exitCode = 1;
  } else {
    console.log('✓ Pages 명시 허용목록 산출물 정상 — source/output 정확 일치');
  }
}
