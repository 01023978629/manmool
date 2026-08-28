/* GitHub Pages 공개 허용목록을 _site/에 만든다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedPublicFiles } from './pages-artifact-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildPagesArtifact(root = ROOT, output = path.join(root, '_site'), fileSystem = fs) {
  if (path.dirname(output) !== root || path.basename(output) !== '_site') {
    throw new Error('안전하지 않은 Pages 출력 경로입니다: ' + output);
  }
  const expected = expectedPublicFiles(root, fileSystem);
  fileSystem.rmSync(output, { recursive: true, force: true });
  fileSystem.mkdirSync(output, { recursive: true });
  for (const { source, relative } of expected) {
    const destination = path.join(output, ...relative.split('/'));
    fileSystem.mkdirSync(path.dirname(destination), { recursive: true });
    fileSystem.copyFileSync(source, destination);
  }
  return expected;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected = buildPagesArtifact();
  console.log(`✓ Pages 명시 허용목록 생성 — 파일 ${expected.length}개 · JS ${expected.filter(({ relative }) => relative.startsWith('js/')).length}개`);
}
