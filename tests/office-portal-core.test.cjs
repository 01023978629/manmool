const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/office-portal-core.js');

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data };
}
function response(overrides = {}) {
  return {
    sessionToken: 'signed-session-token',
    user: { id: 'user-1', email: 'chief@example.com', name: '홍 소장', role: 'manager_chief', active: true, unit: '관리사무소' },
    office: { id: 'office-1', slug: 'sample-apt', complexName: '샘플아파트' },
    permissions: ['dashboard.view', 'status.view', 'logs.view'],
    expiresAt: 10_000,
    ...overrides,
  };
}

test('로그인 입력은 기존 6자리 숫자를 보존하고 단지·이메일을 검증한다', () => {
  assert.deepEqual(core.validateLogin({ officeCode: 'Sample-Apt', email: 'Chief@Example.com', loginCode: '123456' }).value, { officeCode: 'sample-apt', email: 'chief@example.com', loginCode: '123456' });
  assert.equal(core.validateLogin({ officeCode: '../apt', email: 'chief@example.com', loginCode: '123456' }).ok, false);
  assert.equal(core.validateLogin({ officeCode: 'sample-apt', email: 'bad-email', loginCode: '123456' }).ok, false);
  assert.equal(core.validateLogin({ officeCode: 'sample-apt', email: 'chief@example.com', loginCode: '12a456' }).ok, false);
});

test('관리자 비밀번호 문법은 8~64자 인쇄 ASCII를 원문 그대로 받고 조합을 강제하지 않는다', () => {
  const values = ['A'.repeat(8), '9'.repeat(8), '!'.repeat(8), 'aB8!<>[]', 'Z'.repeat(64), Array.from({ length: 64 }, (_, i) => String.fromCharCode(33 + i)).join('')];
  for (const loginCode of values) {
    const result = core.validateLogin({ officeCode: 'sample-apt', email: 'admin@example.com', loginCode });
    assert.equal(result.ok, true); assert.equal(result.value.loginCode, loginCode);
    assert.equal(core.validateUserLoginCode(loginCode, 'system_admin', { required: true }).ok, true);
    for (const role of ['manager_chief', 'facility_manager', 'resident_rep', 'resident']) assert.equal(core.validateUserLoginCode(loginCode, role, { required: true }).ok, false);
  }
  for (const role of core.ROLES) assert.equal(core.validateUserLoginCode('012345', role, { required: true }).ok, true);
});

test('비밀번호 공백·제어·비ASCII·경계·객체는 변환 없이 거부하고 끝줄바꿈도 허용하지 않는다', () => {
  let coercions = 0;
  const bad = [undefined, null, 123456, new String('123456'), { toString() { coercions++; return '123456'; } }, '', '12345', '1234567', 'A'.repeat(7), 'A'.repeat(65)];
  for (const marker of [' ', '\t', '\n', '\r', '\r\n', '\0', '\x1f', '\x7f', '\u2028', '\u2029', '가', 'é']) {
    for (const base of ['123456', 'Abc!2345']) bad.push(marker + base, base + marker, base.slice(0, 3) + marker + base.slice(3));
  }
  for (const loginCode of bad) {
    assert.equal(core.validateLogin({ officeCode: 'sample-apt', email: 'admin@example.com', loginCode }).ok, false);
    assert.equal(core.validateUserLoginCode(loginCode, 'system_admin', { required: true }).ok, false);
  }
  assert.equal(coercions, 0);
});

test('기존 비밀번호 생략은 유지하되 관리자 강등 시 새 6자리 숫자가 필요하다', () => {
  for (const role of core.ROLES) {
    assert.equal(core.validateUserLoginCode('', role).ok, true);
    assert.equal(core.validateUserLoginCode('', role, { required: true }).ok, false);
  }
  for (const role of ['manager_chief', 'facility_manager', 'resident_rep', 'resident']) {
    for (const value of ['', 'OnlyTest!8', '123456\n']) assert.equal(core.validateUserLoginCode(value, role, { previousRole: 'system_admin' }).ok, false);
    assert.equal(core.validateUserLoginCode('012345', role, { previousRole: 'system_admin' }).ok, true);
  }
  assert.equal(core.validateUserLoginCode('', 'system_admin', { previousRole: 'manager_chief' }).ok, true);
  assert.equal(core.validateUserLoginCode('OnlyTest!8', 'unknown', { required: true }).ok, false);
});

test('서버 권한 allowlist 밖 값은 버리고 역할 기본 권한을 추론하지 않는다', () => {
  assert.deepEqual(core.normalizePermissions(['status.view', 'root.all', 'status.view', null]), ['status.view']);
  assert.equal(core.hasPermission(['status.view'], 'status.view'), true);
  assert.equal(core.hasPermission(['status.view'], 'status.manage'), false);
  assert.equal(core.hasPermission(['root.all'], 'dashboard.view'), false);
  assert.deepEqual(core.normalizePermissions(undefined), []);
});

test('세션은 token user office permissions expiresAt만 저장하고 로그인 인증번호는 저장하지 않는다', () => {
  const storage = memoryStorage();
  const session = core.storeSession(storage, response(), 1_000);
  assert.ok(session);
  const parsed = JSON.parse(storage.getItem(core.SESSION_KEY));
  assert.deepEqual(Object.keys(parsed).sort(), ['expiresAt', 'office', 'permissions', 'token', 'user']);
  assert.equal(JSON.stringify(parsed).includes('123456'), false);
  assert.equal(Object.hasOwn(parsed.user, 'loginCode'), false);
  assert.deepEqual(core.restoreSession(storage, 2_000), session);
});

test('만료·비활성·알 수 없는 역할·추가 최상위 키 세션은 fail-closed로 삭제한다', () => {
  for (const value of [
    response({ expiresAt: 500 }),
    response({ user: { ...response().user, active: false } }),
    response({ user: { ...response().user, active: 'true' } }),
    response({ user: { ...response().user, active: 1 } }),
    response({ user: { ...response().user, active: undefined } }),
    response({ user: { ...response().user, role: 'owner' } }),
  ]) assert.equal(core.normalizeSession(value, 1_000), null);

  const storage = memoryStorage();
  storage.setItem(core.SESSION_KEY, JSON.stringify({ ...core.normalizeSession(response(), 1_000), extra: true }));
  assert.equal(core.restoreSession(storage, 2_000), null);
  assert.equal(storage.getItem(core.SESSION_KEY), null);
});

test('관리자 목록용 사용자는 비활성 상태와 동호 담당구역을 안전하게 정규화한다', () => {
  assert.deepEqual(core.normalizeUser({ id: 'u2', email: 'resident@example.com', name: '김입주', role: 'resident', active: false, unit: '101동 202호' }), {
    id: 'u2', email: 'resident@example.com', name: '김입주', role: 'resident', active: false, loginCodeConfigured: false, unit: '101동 202호',
  });
  assert.equal(core.normalizeUser({ id: 'u4', email: 'chief@example.com', name: '담당', role: 'manager_chief', active: true, unit: '가'.repeat(60) }).unit.length, 40);
  assert.equal(core.normalizeUser({ id: 'u3', email: 'x@example.com', name: '무효', role: 'unknown', active: true }), null);
  assert.equal(core.normalizeUser({ id: 'u5', email: 'x@example.com', name: '무효', role: 'resident', active: 'false' }), null);
  assert.equal(core.normalizeUser({ id: 'u6', email: 'x@example.com', name: '무효', role: 'resident' }), null);
});

test('역할별 화면 권한 상한과 역할 지정 범위는 백엔드 계약과 정확히 같다', () => {
  assert.deepEqual(core.PERMISSIONS, [
    'dashboard.view', 'status.view', 'status.manage', 'logs.view', 'logs.manage',
    'requests.view', 'reports.view', 'notices.view', 'notices.manage', 'notices.publish',
    'costs.view', 'costs.manage', 'costs.approve', 'workorders.view', 'workorders.manage',
    'workorders.assign', 'admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view',
  ]);
  assert.deepEqual(core.roleCeiling('system_admin'), ['admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view']);
  assert.deepEqual(core.roleCeiling('facility_manager'), [
    'dashboard.view', 'status.view', 'status.manage', 'logs.view', 'logs.manage',
    'requests.view', 'reports.view', 'notices.view', 'notices.manage', 'costs.view',
    'costs.manage', 'workorders.view', 'workorders.manage',
  ]);
  assert.deepEqual(core.viewPermissionsForRole('resident'), ['dashboard.view', 'status.view', 'logs.view', 'notices.view']);
  assert.deepEqual(core.roleCeiling('unknown'), []);
  assert.equal(core.canAssignRole('system_admin', 'system_admin'), true);
  assert.equal(core.canAssignRole('manager_chief', 'manager_chief'), true);
  assert.equal(core.canAssignRole('manager_chief', 'system_admin'), false);
  assert.equal(core.canAssignRole('facility_manager', 'resident'), false);
});

test('작업지시·공지·비용 상태 선택은 서버 전이 규칙보다 넓어지지 않는다', () => {
  assert.deepEqual(core.workOrderStatusOptions(''), ['received', 'planned']);
  assert.deepEqual(core.workOrderStatusOptions('received'), ['received', 'planned', 'cancelled']);
  assert.deepEqual(core.workOrderStatusOptions('planned'), ['planned', 'working', 'blocked', 'cancelled']);
  assert.deepEqual(core.workOrderStatusOptions('working'), ['working', 'blocked', 'completed', 'cancelled']);
  assert.deepEqual(core.workOrderStatusOptions('blocked'), ['blocked', 'planned', 'working', 'cancelled']);
  assert.deepEqual(core.workOrderStatusOptions('completed'), ['completed']);
  assert.deepEqual(core.workOrderStatusOptions('unknown'), []);

  assert.deepEqual(core.noticeStateOptions('', false), ['draft']);
  assert.deepEqual(core.noticeStateOptions('draft', false), ['draft', 'archived']);
  assert.deepEqual(core.noticeStateOptions('draft', true), ['draft', 'published', 'archived']);
  assert.deepEqual(core.noticeStateOptions('published', true), ['published', 'archived']);
  assert.deepEqual(core.noticeStateOptions('archived', true), ['archived']);

  assert.deepEqual(core.costApprovalTargets('draft'), []);
  assert.deepEqual(core.costApprovalTargets('submitted'), ['approved', 'cancelled']);
  assert.deepEqual(core.costApprovalTargets('approved'), ['paid', 'cancelled']);
  assert.deepEqual(core.costApprovalTargets('paid'), []);
});

test('운영 메뉴 표시명은 실제 기능과 기존 PIN 경계를 명확히 구분한다', () => {
  assert.equal(core.permissionLabel('reports.view'), '운영보고');
  assert.equal(core.permissionLabel('requests.view'), '기존 비밀번호 시설보수 접수');
  assert.equal(core.WORKORDER_STATUS_LABELS.working, '진행');
  assert.equal(core.NOTICE_STATE_LABELS.archived, '보관');
  assert.equal(core.COST_STATUS_LABELS.submitted, '승인 요청');
});

test('세션 만료 상한은 설계 8시간에 시계 오차 1시간만 더한 값이다', () => {
  // 24시간짜리를 받아들이면 서버가 잘못 내려도 화면이 하루 종일 열려 있다.
  const H = 60 * 60 * 1000;
  assert.ok(core.normalizeSession(response({ expiresAt: 1_000 + 8 * H }), 1_000), '8시간 세션을 거부했다');
  assert.ok(core.normalizeSession(response({ expiresAt: 1_000 + 9 * H }), 1_000), '시계 오차 여유(9시간)를 거부했다');
  assert.equal(core.normalizeSession(response({ expiresAt: 1_000 + 10 * H }), 1_000), null, '10시간 세션을 받아들였다');
  assert.equal(core.normalizeSession(response({ expiresAt: 1_000 + 24 * H }), 1_000), null, '24시간 세션을 받아들였다');
});
