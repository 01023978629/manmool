/* GitHub Pages 공개 허용목록을 _site/에 만든다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedPublicFiles } from './pages-artifact-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');

if (path.dirname(OUT) !== ROOT || path.basename(OUT) !== '_site') {
  throw new Error('안전하지 않은 Pages 출력 경로입니다: ' + OUT);
}

const expected = expectedPublicFiles(ROOT);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const { source, relative } of expected) {
  const destination = path.join(OUT, ...relative.split('/'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

console.log(`✓ Pages 명시 허용목록 생성 — 파일 ${expected.length}개 · JS ${expected.filter(({ relative }) => relative.startsWith('js/')).length}개`);
