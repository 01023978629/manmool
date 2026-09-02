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

test('이메일 OTP 로그인 입력은 관리사무소 코드·이메일·6자리 번호만 허용한다', () => {
  assert.deepEqual(core.validateRequestCode({ officeCode: 'Sample-Apt', email: 'Chief@Example.com' }).value, { officeCode: 'sample-apt', email: 'chief@example.com' });
  assert.equal(core.validateRequestCode({ officeCode: '../apt', email: 'chief@example.com' }).ok, false);
  assert.equal(core.validateRequestCode({ officeCode: 'sample-apt', email: 'bad-email' }).ok, false);
  const challengeId = '123e4567-e89b-42d3-a456-426614174000';
  assert.deepEqual(core.validateVerifyCode({ officeCode: 'sample-apt', email: 'chief@example.com', code: '123456', challengeId }).value, { officeCode: 'sample-apt', email: 'chief@example.com', code: '123456', challengeId });
  assert.equal(core.validateVerifyCode({ officeCode: 'sample-apt', email: 'chief@example.com', code: '12a456', challengeId }).ok, false);
  assert.equal(core.validateVerifyCode({ officeCode: 'sample-apt', email: 'chief@example.com', code: '123456', challengeId: 'guessable' }).ok, false);
});

test('서버 권한 allowlist 밖 값은 버리고 역할 기본 권한을 추론하지 않는다', () => {
  assert.deepEqual(core.normalizePermissions(['status.view', 'root.all', 'status.view', null]), ['status.view']);
  assert.equal(core.hasPermission(['status.view'], 'status.view'), true);
  assert.equal(core.hasPermission(['status.view'], 'status.manage'), false);
  assert.equal(core.hasPermission(['root.all'], 'dashboard.view'), false);
  assert.deepEqual(core.normalizePermissions(undefined), []);
});

test('세션은 token user office permissions expiresAt만 저장하고 OTP·비밀번호는 저장하지 않는다', () => {
  const storage = memoryStorage();
  const session = core.storeSession(storage, response(), 1_000);
  assert.ok(session);
  const parsed = JSON.parse(storage.getItem(core.SESSION_KEY));
  assert.deepEqual(Object.keys(parsed).sort(), ['expiresAt', 'office', 'permissions', 'token', 'user']);
  assert.equal(JSON.stringify(parsed).includes('123456'), false);
  assert.equal(JSON.stringify(parsed).toLowerCase().includes('password'), false);
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
    id: 'u2', email: 'resident@example.com', name: '김입주', role: 'resident', active: false, unit: '101동 202호',
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
  assert.equal(core.permissionLabel('requests.view'), '기존 PIN 시설보수 접수');
  assert.equal(core.WORKORDER_STATUS_LABELS.working, '진행');
  assert.equal(core.NOTICE_STATE_LABELS.archived, '보관');
  assert.equal(core.COST_STATUS_LABELS.submitted, '승인 요청');
});
