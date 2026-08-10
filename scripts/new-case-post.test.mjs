import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeDraft, parseMaterial, piiFindings } from './new-case-post.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS  ' + name); };

const safe = {
  place: '서구 시험단지', symptom: '천장 물자국', method: '압력 검사와 청음 탐지',
  cause: '세대 전용 급수관 연결부', work: '연결부 교체 후 압력 재검사', duration: '약 두 시간',
};

test('6항목으로 비공개 초안을 만든다', () => {
  const draft = makeDraft(safe, new Date('2026-08-10T00:00:00Z'));
  assert.equal(draft.published, false);
  assert.equal(draft.body.length, 5);
  assert.match(draft.slug, /^case-draft-20260810-[a-f0-9]{10}$/);
});
test('현장앱 후기 재료 1~6번 형식을 읽는다', () => {
  const text = '[현장 후기 재료]\n1. 동네+단지: 서구 시험단지   ← 동·호수는 절대 넣지 마라\n2. 어떤 연락: 천장 물자국\n3. 탐지 방법: 압력 검사\n4. 원인+전유/공용: 전용 급수관\n5. 공사 내용: 연결부 교체\n6. 걸린 시간: 약 두 시간';
  assert.deepEqual(parseMaterial(text), {
    place: '서구 시험단지', symptom: '천장 물자국', method: '압력 검사',
    cause: '전용 급수관', work: '연결부 교체', duration: '약 두 시간',
  });
});
for (const [label, value] of [
  ['동', '101동'], ['호', '202호'], ['휴대전화', '010-1234-5678'],
  ['고객명 표기', '고객명: 김철수'], ['고객 호칭', '김철수 고객님'],
]) {
  test('개인정보 거부: ' + label, () => assert.throws(() => makeDraft({ ...safe, symptom: value }), /개인정보/));
}
test('PII 탐지기는 안전한 동네 이름을 막지 않는다', () => assert.deepEqual(piiFindings('월평동 누수 현장'), []));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-case-post-'));
try {
  fs.mkdirSync(path.join(temp, 'data'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'posts'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'data', 'site.json'), path.join(temp, 'data', 'site.json'));
  fs.copyFileSync(path.join(ROOT, 'blog.html'), path.join(temp, 'blog.html'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'prerender-posts.py'), path.join(temp, 'scripts', 'prerender-posts.py'));
  for (const file of fs.readdirSync(path.join(ROOT, 'posts'))) {
    if (file.endsWith('.html')) fs.copyFileSync(path.join(ROOT, 'posts', file), path.join(temp, 'posts', file));
  }
  const argv = Object.entries(safe).flatMap(([key, value]) => ['--' + key, value]);
  const result = spawnSync(NODE, [path.join(ROOT, 'scripts', 'new-case-post.mjs'), ...argv], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, MANMOOL_CASE_ROOT: temp },
  });
  test('CLI가 PC 전용 폴더에 초안을 저장한다', () => assert.equal(result.status, 0, result.stderr || result.stdout));
  const site = JSON.parse(fs.readFileSync(path.join(temp, 'data', 'site.json'), 'utf8'));
  const draftDir = path.join(temp, '.private', 'case-drafts');
  const draftFiles = fs.readdirSync(draftDir).filter((file) => file.endsWith('.json'));
  const draft = JSON.parse(fs.readFileSync(path.join(draftDir, draftFiles[0]), 'utf8'));
  test('초안 파일이 하나 생성된다', () => assert.equal(draftFiles.length, 1));
  test('CLI 결과는 published:false 다', () => assert.equal(draft.published, false));
  test('공개 site.json에는 초안이 들어가지 않는다', () => assert.equal(site.insights.some((x) => x && x.slug === draft.slug), false));
  test('초안 정적 HTML은 생성되지 않는다', () => assert.equal(fs.existsSync(path.join(temp, 'posts', draft.slug + '.html')), false));
  test('초안은 blog.html 목록에 노출되지 않는다', () => assert.equal(fs.readFileSync(path.join(temp, 'blog.html'), 'utf8').includes(draft.slug), false));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(`\n전부 통과 (${passed}건)`);
