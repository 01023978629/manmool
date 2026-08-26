const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/office-request-core.js');

const valid = {
  complex: '열매마을 7단지',
  dong: '704',
  ho: '1102',
  issueType: '누수',
  location: '욕실 천장',
  description: '천장에서 물방울이 떨어집니다',
  name: '홍길동',
  phone: '010-1234-5678',
  privacyConsent: true,
};

test('전화번호를 읽기 쉬운 휴대전화 형식으로 정규화한다', () => {
  assert.equal(api.normalizePhone('01012345678'), '010-1234-5678');
  assert.equal(api.normalizePhone('0111234567'), '011-123-4567');
});

test('첫 번째 누락 필드와 개인정보 동의를 검증한다', () => {
  assert.deepEqual(api.validateRequest({ ...valid, complex: '' }), {
    ok: false,
    field: 'complex',
    message: '단지명을 입력해 주세요.',
  });
  assert.deepEqual(api.validateRequest({ ...valid, privacyConsent: false }), {
    ok: false,
    field: 'privacyConsent',
    message: '개인정보 수집·이용에 동의해 주세요.',
  });
});

test('휴대전화는 01로 시작하는 숫자 10~11자리만 허용한다', () => {
  assert.equal(api.validateRequest({ ...valid, phone: '042-123-4567' }).field, 'phone');
  assert.equal(api.validateRequest(valid).ok, true);
});

test('문자 본문에 접수 항목을 빠짐없이 넣는다', () => {
  const body = api.formatRequestMessage(valid);
  for (const text of [
    '[만물인테리어 관리사무소 시설접수]',
    '열매마을 7단지',
    '704동 1102호',
    '누수',
    '욕실 천장',
    '천장에서 물방울이 떨어집니다',
    '홍길동',
    '010-1234-5678',
  ]) {
    assert.equal(body.includes(text), true, `문자 본문에 '${text}'가 없습니다.`);
  }
});

test('운영체제에 맞는 SMS 링크를 만든다', () => {
  assert.match(api.buildSmsHref('접수 내용', 'Android'), /^sms:01023978629\?body=/);
  assert.match(api.buildSmsHref('접수 내용', 'iPhone'), /^sms:01023978629&body=/);
});
