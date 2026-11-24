/* new-review.test.mjs — 후기 옮겨 적기 도구는 공개 페이지로 나가는 값이라 거부 조건이 핵심이다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReview, appendReview, piiFindings, maskDisplayName, isMaskedDisplayName, seoulToday } from './new-review.mjs';

const GOOD = { rating: '5', name: '김○○', service: 'interior', space: '유성구 ○○아파트 · 욕실 리모델링', text: '타일 줄눈까지 꼼꼼하게 마무리해 주셨어요. 설명도 자세했습니다.' };

test('정상 입력은 별점·이름·현장·본문·분야·날짜만 가진 후기 한 건이 된다', () => {
  const review = buildReview(GOOD, '2026-10-23');
  assert.deepEqual(review, { rating: 5, name: '김○○', space: GOOD.space, text: GOOD.text, service: 'interior', date: '2026-10-23' });
});

/* 2026-11-25 — 표시 이름 칸은 자유 글이라 손님이 실명을 적는다. 공개 전에 성만 남긴다(가상 이름만 씀). */
test('표시 이름은 성+○ 로 가린다: 세 글자·두 글자·네 글자·호칭', () => {
  for (const [input, expected] of [
    ['홍길동', '홍○○'], ['김민', '김○'], ['남궁가상', '남○○○'],
    ['홍길동 고객', '홍○○ 고객'], ['홍길동 고객님', '홍○○ 고객님'], ['홍길동님', '홍○○님'], ['  홍길동  ', '홍○○'],
  ]) {
    assert.equal(maskDisplayName(input).name, expected, input);
    assert.equal(buildReview({ ...GOOD, name: input }, '2026-11-25').name, expected, input);
    assert.ok(isMaskedDisplayName(expected), expected);
  }
});

test('이미 가린 이름과 "고객" 은 그대로 두고, 가릴 수 없는 닉네임·영문은 거부한다', () => {
  for (const kept of ['김○○', '김○', '김○○ 고객', '김○○님', '고객', '고객님']) {
    assert.equal(buildReview({ ...GOOD, name: kept }, '2026-11-25').name, kept);
  }
  for (const bad of ['가상닉네임입니다', 'Hong', 'ㅎㅎ', '김 민수', '홍길동씨네집']) {
    assert.throws(() => buildReview({ ...GOOD, name: bad }), /--name/, bad);
  }
  for (const unmasked of ['홍길동', '김민', '홍길동 고객', 'Hong', '고객 홍길동', '김○○○○']) assert.equal(isMaskedDisplayName(unmasked), false, unmasked);
});

test('같은 실명이 현장·본문에 있으면 거기서도 가린다', () => {
  const review = buildReview({ ...GOOD, name: '홍길동', space: '홍길동 고객님 댁 · 욕실', text: '홍길동입니다. 줄눈까지 꼼꼼하게 마무리해 주셨어요.' }, '2026-11-25');
  assert.equal(review.name, '홍○○');
  assert.equal(review.space, '홍○○ 고객님 댁 · 욕실');
  assert.equal(review.text, '홍○○입니다. 줄눈까지 꼼꼼하게 마무리해 주셨어요.');
  assert.doesNotMatch(JSON.stringify(review), /홍길동/);
});

test('--date 를 안 주면 한국 시각(Asia/Seoul) 오늘 — UTC 로 하루 밀리지 않는다', () => {
  assert.equal(seoulToday(new Date('2026-11-24T15:00:00Z')), '2026-11-25', '한국 0시(UTC 15시)부터는 한국 날짜');
  assert.equal(seoulToday(new Date('2026-11-24T14:59:59Z')), '2026-11-24');
  assert.equal(seoulToday(new Date('2026-12-31T23:30:00Z')), '2027-01-01', '연말에도 한국 날짜');
  assert.match(seoulToday(), /^\d{4}-\d{2}-\d{2}$/);
  const before = seoulToday();
  const review = buildReview(GOOD);
  const after = seoulToday();
  assert.ok(review.date === before || review.date === after, `날짜를 안 주면 한국 오늘(${before})이어야 하는데 ${review.date}`);
  assert.equal(buildReview({ ...GOOD, date: '2026-10-23' }).date, '2026-10-23', '--date 를 주면 그 값');
});

test('분야(--service)는 leak·interior 둘 중 하나만 받는다 — 누수 페이지 후기 칸이 이 값으로 고른다', () => {
  assert.equal(buildReview({ ...GOOD, service: 'leak' }, '2026-11-25').service, 'leak');
  for (const bad of [undefined, '', '누수', 'Leak', 'other']) {
    assert.throws(() => buildReview({ ...GOOD, service: bad }), /--service/, String(bad));
  }
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

test('윈도우 작업본(CRLF) site.json 은 CRLF 그대로, LF 는 LF 그대로 다시 쓴다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-review-eol-'));
  const sitePath = path.join(dir, 'site.json');
  const original = { company: { name: '만물인테리어' }, reviews: [] };
  fs.writeFileSync(sitePath, (JSON.stringify(original, null, 2) + '\n').replace(/\n/g, '\r\n'));
  appendReview(sitePath, buildReview(GOOD, '2026-11-25'));
  const crlf = fs.readFileSync(sitePath, 'utf8');
  assert.ok(crlf.endsWith('}\r\n'));
  assert.equal(crlf.replace(/\r\n/g, '').includes('\n'), false, 'CRLF 파일에 LF 줄끝이 섞였다');
  fs.writeFileSync(sitePath, JSON.stringify(original, null, 2) + '\n');
  appendReview(sitePath, buildReview(GOOD, '2026-11-25'));
  assert.equal(fs.readFileSync(sitePath, 'utf8').includes('\r'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
