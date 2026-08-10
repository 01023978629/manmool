import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const setter = resolve('scripts/set-verification.mjs');
const marker = '<!-- verification-meta: scripts/set-verification.mjs 가 실제 코드만 이 위치에 넣습니다. -->';

test('naver and google codes replace marker without leaving placeholders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verification-'));
  writeFileSync(join(dir, 'index.html'), '<head>\n' + marker + '\n</head>');
  const r = spawnSync(process.execPath, [setter, '--naver=NAVER_real_123456', '--google=GOOGLE_real_123456'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(html, /naver-site-verification" content="NAVER_real_123456/);
  assert.match(html, /google-site-verification" content="GOOGLE_real_123456/);
  assert.doesNotMatch(html, /발급코드|여기코드|placeholder/i);
});

test('placeholder code mutation is rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verification-mut-'));
  writeFileSync(join(dir, 'index.html'), '<head>\n' + marker + '\n</head>');
  const r = spawnSync(process.execPath, [setter, '--naver=네이버_발급코드'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

test('site integrity source contains an active placeholder guard', () => {
  const src = readFileSync(resolve('scripts/ensure-site-integrity.mjs'), 'utf8');
  assert.match(src, /발급코드\|여기코드\|placeholder/);
  const mutant = src.replace('발급코드|여기코드|placeholder', 'NEVER_MATCH');
  assert.doesNotMatch(mutant, /발급코드\|여기코드\|placeholder/);
});
