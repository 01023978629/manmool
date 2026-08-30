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
    expectedUploadIds: [],
  });
});

test('접수 생성은 순서가 보존된 고유 canonical 사진 UUID를 최대 다섯 개만 선언한다', () => {
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const payload = api.buildCreatePayload(valid, 'create-key', ids);
  assert.deepEqual(payload.expectedUploadIds, ids);
  assert.notEqual(payload.expectedUploadIds, ids);
  for (const invalid of [
    'not-an-array',
    ['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'],
    ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'],
    ['11111111-1111-1111-8111-111111111111'],
    Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
  ]) assert.throws(() => api.buildCreatePayload(valid, 'create-key', invalid), /expectedUploadIds/);
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

const RECENT_NOW = Date.parse('2026-08-30T12:00:00.000Z');
const recentRow = (requestId, status, updatedAt, extra = {}) => ({
  requestId, receiptNo: `MM-${requestId}`, unit: '101동 1203호', location: '공용 배관실',
  status, updatedAt, ...extra,
});

test('최초 목록은 비교 기준만 만들 수 있는 최소 스냅샷으로 정규화한다', () => {
  const row = recentRow('req-1', 'pending_review', '2026-08-30T09:00:00.000Z', {
    description: '스냅샷에 들어가면 안 되는 설명', officeContact: { phone: '010-1111-2222' },
  });
  const result = api.normalizeRecentList([row], RECENT_NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot, [{ requestId: 'req-1', status: 'pending_review', updatedAtMs: Date.parse(row.updatedAt) }]);
  assert.equal('description' in result.snapshot[0], false);
  assert.equal('officeContact' in result.snapshot[0], false);
  assert.equal(api.diffRecentSnapshots(null, result.snapshot).total, 0);
});

test('새 ID와 상태 변경 및 유효한 시각 증가만 최근 변경으로 판정한다', () => {
  const previous = [
    { requestId: 'req-1', status: 'pending_review', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    { requestId: 'req-2', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T09:30:00.000Z') },
    { requestId: 'req-3', status: 'in_progress', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
  ];
  const current = [
    { requestId: 'req-4', status: 'pending_review', updatedAtMs: Date.parse('2026-08-30T11:00:00.000Z') },
    { requestId: 'req-1', status: 'needs_info', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    { requestId: 'req-2', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:30:00.000Z') },
    { requestId: 'req-3', status: 'in_progress', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
  ];
  assert.deepEqual(api.diffRecentSnapshots(previous, current), {
    total: 3,
    changes: [
      { requestId: 'req-4', kind: 'appeared', status: 'pending_review', updatedAtMs: Date.parse('2026-08-30T11:00:00.000Z') },
      { requestId: 'req-2', kind: 'updated', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:30:00.000Z') },
      { requestId: 'req-1', kind: 'status', status: 'needs_info', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    ],
  });
});

test('사라진 ID와 과거 시각 및 무효와 유효 사이 전환은 변경으로 추론하지 않는다', () => {
  const previous = [
    { requestId: 'gone', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
    { requestId: 'older', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
    { requestId: 'invalid-transition', status: 'accepted', updatedAtMs: null },
  ];
  const current = [
    { requestId: 'older', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T09:00:00.000Z') },
    { requestId: 'invalid-transition', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T11:00:00.000Z') },
  ];
  assert.deepEqual(api.diffRecentSnapshots(previous, current), { total: 0, changes: [] });
});

test('중복 ID는 유효한 최신 행 하나를 선택하고 입력을 수정하지 않는다', () => {
  const rows = [
    recentRow('duplicate', 'accepted', 'not-a-time', { marker: 'first' }),
    recentRow('duplicate', 'visit_scheduled', '2026-08-30T10:00:00.000Z', { marker: 'second' }),
    recentRow('duplicate', 'completed', '2026-08-30T09:00:00.000Z', { marker: 'third' }),
  ];
  const before = JSON.stringify(rows);
  const result = api.normalizeRecentList(rows, RECENT_NOW);
  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].marker, 'second');
  assert.deepEqual(result.snapshot, [{ requestId: 'duplicate', status: 'visit_scheduled', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') }]);
  assert.equal(JSON.stringify(rows), before);
  const allInvalid = api.normalizeRecentList([
    recentRow('invalid-duplicate', 'accepted', 'bad-time', { marker: 'keep-first' }),
    recentRow('invalid-duplicate', 'completed', 'also-bad', { marker: 'drop-second' }),
  ], RECENT_NOW);
  assert.equal(allInvalid.rows[0].marker, 'keep-first');
});

test('legacy id는 canonical requestId로만 정규화하고 잘못된 행은 안전하게 거른다', () => {
  const result = api.normalizeRecentList([
    { id: 'legacy-1', status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: '   ', id: 'legacy-blank-primary', status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: '', status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: 'x'.repeat(121), status: 'accepted', updatedAt: '2026-08-30T10:00:00.000Z' },
    { requestId: 'bad-status', status: 'not-contracted', updatedAt: '2026-08-30T10:00:00.000Z' },
  ], RECENT_NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot, [
    { requestId: 'legacy-1', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
    { requestId: 'legacy-blank-primary', status: 'accepted', updatedAtMs: Date.parse('2026-08-30T10:00:00.000Z') },
  ]);
  assert.equal(result.rows[0].id, 'legacy-1');
});

test('비어 있지 않은 전부 무효 응답은 실패하고 진짜 빈 배열은 유효하다', () => {
  assert.deepEqual(api.normalizeRecentList([], RECENT_NOW), { ok: true, rows: [], snapshot: [] });
  assert.deepEqual(api.normalizeRecentList([{ requestId: '', status: '' }], RECENT_NOW), { ok: false, rows: [], snapshot: [] });
  assert.deepEqual(api.normalizeRecentList(null, RECENT_NOW), { ok: false, rows: [], snapshot: [] });
});

test('시간대 없는 ISO와 미래 시각은 무효이며 상태 변경 시에도 시각은 null이다', () => {
  const result = api.normalizeRecentList([
    recentRow('no-zone', 'accepted', '2026-08-30T10:00:00'),
    recentRow('future', 'needs_info', '2026-08-30T12:00:00.001Z'),
  ], RECENT_NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.map((entry) => entry.updatedAtMs), [null, null]);
});

test('최근 변경은 최신순 최대 10건과 전체 건수를 반환한다', () => {
  const current = Array.from({ length: 12 }, (_, index) => ({
    requestId: `req-${index}`, status: 'accepted', updatedAtMs: RECENT_NOW - (index * 1000),
  }));
  const result = api.diffRecentSnapshots([], current);
  assert.equal(result.total, 12);
  assert.equal(result.changes.length, 10);
  assert.deepEqual(result.changes.map((entry) => entry.requestId), current.slice(0, 10).map((entry) => entry.requestId));
  const tied = api.diffRecentSnapshots([], [
    { requestId: 'first-tie', status: 'accepted', updatedAtMs: RECENT_NOW },
    { requestId: 'second-tie', status: 'accepted', updatedAtMs: RECENT_NOW },
  ]);
  assert.deepEqual(tied.changes.map((entry) => entry.requestId), ['first-tie', 'second-tie']);
});

test('업무 상태와 변경 종류를 승인된 문구로 표현한다', () => {
  assert.equal(api.recentChangeLabel({ kind: 'appeared', status: 'pending_review' }), '이번 새로고침에서 새로 확인');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'needs_info' }), '자료 보완 필요');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'visit_scheduled' }), '방문 예정');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'completed' }), '작업 완료');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'billed' }), '청구 완료');
  assert.equal(api.recentChangeLabel({ kind: 'status', status: 'paid' }), '입금 완료');
  assert.equal(api.recentChangeLabel({ kind: 'updated', status: 'accepted' }), '내용 갱신');
});
