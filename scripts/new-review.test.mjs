/* new-review.test.mjs — 후기 옮겨 적기 도구는 공개 페이지로 나가는 값이라 거부 조건이 핵심이다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReview, appendReview, piiFindings } from './new-review.mjs';

const GOOD = { rating: '5', name: '김○○', space: '유성구 ○○아파트 · 욕실 리모델링', text: '타일 줄눈까지 꼼꼼하게 마무리해 주셨어요. 설명도 자세했습니다.' };

test('정상 입력은 별점·이름·현장·본문·날짜만 가진 후기 한 건이 된다', () => {
  const review = buildReview(GOOD, '2026-10-23');
  assert.deepEqual(review, { rating: 5, name: '김○○', space: GOOD.space, text: GOOD.text, date: '2026-10-23' });
});

test('동·호수·전화·이메일이 섞이면 거부한다 (규칙 정본 js/pii-rules.js)', () => {
  assert.throws(() => buildReview({ ...GOOD, text: GOOD.text + ' 301동 1502호였습니다' }), /동·호수/);
  assert.throws(() => buildReview({ ...GOOD, space: '유성구 ○○아파트 1502호' }), /동·호수/);
  assert.throws(() => buildReview({ ...GOOD, text: GOOD.text + ' 010-1234-5678' }), /휴대전화/);
  assert.throws(() => buildReview({ ...GOOD, name: 'a@b.co' }), /이메일/);
  assert.deepEqual(piiFindings('깨끗한 산문'), []);
});

test('"김○○ 고객" 표시 이름은 고객명 규칙 오탐 대상이라 통과한다', () => {
  assert.equal(buildReview({ ...GOOD, name: '김○○ 고객' }, '2026-10-23').name, '김○○ 고객');
});

test('별점 범위·본문 길이·날짜 형식을 지킨다', () => {
  assert.throws(() => buildReview({ ...GOOD, rating: '6' }), /1~5/);
  assert.throws(() => buildReview({ ...GOOD, rating: '4.5' }), /1~5/);
  assert.throws(() => buildReview({ ...GOOD, text: '좋았어요' }), /최소 10자/);
  assert.throws(() => buildReview({ ...GOOD, text: 'ㅋ'.repeat(601) }), /최대 600자/);
  assert.throws(() => buildReview({ ...GOOD, date: '2026/10/23' }), /YYYY-MM-DD/);
  assert.throws(() => buildReview({ ...GOOD, name: '' }), /--name/);
});

test('reviews 맨 앞에 넣고 나머지 정본은 글자 그대로 보존하며 같은 본문은 두 번 넣지 않는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-review-'));
  const sitePath = path.join(dir, 'site.json');
  const original = { company: { name: '만물인테리어' }, reviews: [{ rating: 4, name: '이○○', space: '서구 ○○아파트 · 방수', text: '기존 후기 본문입니다 열 자 넘게', date: '2026-09-01' }], faq: [{ q: 'q', a: 'a' }] };
  fs.writeFileSync(sitePath, JSON.stringify(original, null, 2) + '\n');
  const review = buildReview(GOOD, '2026-10-23');
  assert.equal(appendReview(sitePath, review), 2);
  const after = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  assert.deepEqual(after.reviews[0], review);
  assert.deepEqual(after.reviews[1], original.reviews[0]);
  assert.deepEqual({ ...after, reviews: undefined }, { ...original, reviews: undefined });
  assert.ok(fs.readFileSync(sitePath, 'utf8').endsWith('}\n'));
  assert.throws(() => appendReview(sitePath, review), /이미 있습니다/);
  fs.rmSync(dir, { recursive: true, force: true });
});
