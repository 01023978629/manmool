const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/office-request-core.js');

const valid = {
  unit: '103동 1204호',
  location: '욕실 천장',
  issueType: '누수',
  pipeType: '미확정',
  urgency: 'normal',
  description: '천장에서 물이 떨어집니다.',
  officeContactName: '김소장',
  officeContactPhone: '01012345678',
  residentName: '',
  residentPhone: '',
  preferredVisitDate: '2026-08-27',
  privacyConsent: true,
};

test('공개 URL에서 안전한 관리사무소 slug만 읽는다', () => {
  assert.equal(api.parseOfficeSlug('?office=sample-apt'), 'sample-apt');
  assert.equal(api.parseOfficeSlug('?office=%3Cscript%3E'), '');
  assert.equal(api.parseOfficeSlug('?office=-sample'), '');
});

test('로그인 PIN은 숫자 여섯 자리만 허용한다', () => {
  assert.equal(api.validateLogin({ pin: '123456' }).ok, true);
  assert.equal(api.validateLogin({ pin: '12345' }).field, 'pin');
});

test('서버 create 계약에 맞는 접수 입력을 검증하고 정규화한다', () => {
  assert.equal(api.validateRequest(valid).ok, true);
  const payload = api.buildCreatePayload(valid, 'b7c9b8af-16f4-4db2-a7e4-f1a8c780b881');
  assert.deepEqual(payload, {
    idempotencyKey: 'b7c9b8af-16f4-4db2-a7e4-f1a8c780b881',
    unit: '103동 1204호',
    location: '욕실 천장',
    issueType: '누수',
    pipeType: '미확정',
    urgency: 'normal',
    description: '천장에서 물이 떨어집니다.',
    officeContact: { name: '김소장', phone: '010-1234-5678' },
    residentContact: null,
    preferredVisitDate: '2026-08-27',
    privacyConsent: true,
  });
});

test('입주민 연락처는 이름과 전화번호를 함께 받거나 null로 보낸다', () => {
  assert.equal(api.validateRequest({ ...valid, residentName: '홍길동' }).field, 'residentContact');
  assert.equal(api.validateRequest({ ...valid, residentPhone: '01098765432' }).field, 'residentContact');
  const payload = api.buildCreatePayload({ ...valid, residentName: '홍길동', residentPhone: '01098765432' }, 'key');
  assert.deepEqual(payload.residentContact, { name: '홍길동', phone: '010-9876-5432' });
});

test('서버와 같은 필드 상한과 허용값으로 전송 값을 제한한다', () => {
  const payload = api.buildCreatePayload({
    ...valid,
    unit: `  ${'u'.repeat(100)}  `,
    location: 'l'.repeat(130),
    issueType: '기타'.repeat(20),
    pipeType: '',
    urgency: 'unexpected',
    description: 'd'.repeat(1300),
    officeContactName: 'n'.repeat(70),
    preferredVisitDate: '2026-08-27-extra',
  }, 'k'.repeat(90));
  assert.equal(payload.idempotencyKey.length, 80);
  assert.equal(payload.unit.length, 80);
  assert.equal(payload.location.length, 120);
  assert.equal(payload.issueType.length, 20);
  assert.equal(payload.pipeType, '미확정');
  assert.equal(payload.urgency, 'normal');
  assert.equal(payload.description.length, 1200);
  assert.equal(payload.officeContact.name.length, 60);
  assert.equal(payload.preferredVisitDate.length, 10);
});

test('개인정보 동의와 서버 허용 선택값을 확인한다', () => {
  assert.equal(api.validateRequest({ ...valid, privacyConsent: false }).field, 'privacyConsent');
  assert.equal(api.validateRequest({ ...valid, issueType: '전기' }).field, 'issueType');
  assert.equal(api.validateRequest({ ...valid, pipeType: '가스' }).field, 'pipeType');
  assert.equal(api.validateRequest({ ...valid, officeContactPhone: '042-123-456' }).field, 'officeContactPhone');
});

test('상태와 보완 사유 표시 계약을 제공하고 SMS helpers는 노출하지 않는다', () => {
  assert.equal(api.statusLabel('visit_scheduled'), '방문 예정');
  assert.equal(api.statusLabel('needs_info'), '내용 확인 필요');
  assert.equal(api.statusLabel('unknown'), '확인 중');
  assert.equal(api.needsInfoLabel('사진을 다시 올려주세요'), '사진을 다시 올려주세요');
  assert.equal(api.needsInfoLabel('x'.repeat(301)), '');
  assert.equal('buildSmsHref' in api, false);
  assert.equal('formatRequestMessage' in api, false);
});
