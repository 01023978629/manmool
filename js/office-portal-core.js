(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ManmulOfficePortalCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPortalCore() {
  'use strict';

  const SESSION_KEY = 'manmul_office_portal_session_v1';
  const OFFICE_SLUG = /^[a-z0-9][a-z0-9-]{2,63}$/;
  const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
  const LOGIN_CODE = /^\d{6}$/;
  const ROLES = Object.freeze([
    'system_admin', 'manager_chief', 'facility_manager', 'resident_rep', 'resident',
  ]);
  const ROLE_LABELS = Object.freeze({
    system_admin: '관리자', manager_chief: '관리소장', facility_manager: '관리과장',
    resident_rep: '동대표', resident: '아파트 입주민',
  });
  const PERMISSIONS = Object.freeze([
    'dashboard.view', 'status.view', 'status.manage', 'logs.view', 'logs.manage',
    'requests.view', 'reports.view',
    'notices.view', 'notices.manage', 'notices.publish',
    'costs.view', 'costs.manage', 'costs.approve',
    'workorders.view', 'workorders.manage', 'workorders.assign',
    'admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view',
  ]);
  const VIEW_PERMISSIONS = Object.freeze(PERMISSIONS.filter((value) => value.endsWith('.view')));
  const PERMISSION_LABELS = Object.freeze({
    'dashboard.view': '관리 현황', 'status.view': '시설 상태', 'status.manage': '시설 상태 수정',
    'logs.view': '관리 일지', 'logs.manage': '관리 일지 작성', 'requests.view': '기존 PIN 시설보수 접수',
    'reports.view': '운영보고', 'notices.view': '공지사항', 'costs.view': '비용·정산',
    'workorders.view': '작업지시', 'workorders.manage': '작업지시 관리', 'workorders.assign': '담당자 배정',
    'notices.manage': '공지 작성', 'notices.publish': '공지 발행', 'costs.manage': '비용 관리', 'costs.approve': '비용 승인',
    'admin.users.view': '사용자 목록', 'admin.users.manage': '사용자 관리',
    'admin.permissions.manage': '보기 권한 설정', 'admin.audit.view': '관리 감사기록',
  });
  const WORKORDER_STATUS_LABELS = Object.freeze({
    received: '접수', planned: '계획', working: '진행', blocked: '보류',
    completed: '완료', cancelled: '취소',
  });
  const WORKORDER_TRANSITIONS = Object.freeze({
    received: Object.freeze(['planned', 'cancelled']),
    planned: Object.freeze(['working', 'blocked', 'cancelled']),
    working: Object.freeze(['blocked', 'completed', 'cancelled']),
    blocked: Object.freeze(['planned', 'working', 'cancelled']),
    completed: Object.freeze([]),
    cancelled: Object.freeze([]),
  });
  const NOTICE_STATE_LABELS = Object.freeze({ draft: '초안', published: '발행', archived: '보관' });
  const COST_STATUS_LABELS = Object.freeze({
    draft: '초안', submitted: '승인 요청', approved: '승인', paid: '지급 완료', cancelled: '취소',
  });
  const COST_APPROVAL_TARGETS = Object.freeze({
    submitted: Object.freeze(['approved', 'cancelled']),
    approved: Object.freeze(['paid', 'cancelled']),
  });
  const ROLE_CEILINGS = Object.freeze({
    system_admin: Object.freeze(['admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view']),
    manager_chief: Object.freeze(PERMISSIONS.slice()),
    facility_manager: Object.freeze([
      'dashboard.view', 'status.view', 'status.manage', 'logs.view', 'logs.manage',
      'requests.view', 'reports.view', 'notices.view', 'notices.manage',
      'costs.view', 'costs.manage', 'workorders.view', 'workorders.manage',
    ]),
    resident_rep: Object.freeze(['dashboard.view', 'status.view', 'logs.view', 'reports.view', 'notices.view']),
    resident: Object.freeze(['dashboard.view', 'status.view', 'logs.view', 'notices.view']),
  });
  const PERMISSION_SET = new Set(PERMISSIONS);
  const ROLE_SET = new Set(ROLES);

  function text(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
  function normalizeEmail(value) {
    const email = text(value, 254).toLowerCase();
    return EMAIL.test(email) ? email : '';
  }
  function normalizeOfficeCode(value) {
    const code = text(value, 64).toLowerCase();
    return OFFICE_SLUG.test(code) ? code : '';
  }
  function validateLogin(data) {
    const email = normalizeEmail(data && data.email);
    const officeCode = normalizeOfficeCode(data && data.officeCode);
    if (!officeCode) return { ok: false, field: 'officeCode', message: '관리사무소 코드를 확인해 주세요.' };
    if (!email) return { ok: false, field: 'email', message: '로그인 이메일을 확인해 주세요.' };
    const loginCode = String(data && data.loginCode || '').trim();
    if (!LOGIN_CODE.test(loginCode)) return { ok: false, field: 'loginCode', message: '관리자가 발급한 6자리 인증번호를 입력해 주세요.' };
    return { ok: true, value: { officeCode, email, loginCode }, field: null, message: '' };
  }
  function normalizePermissions(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => typeof item === 'string' && PERMISSION_SET.has(item)))].sort();
  }
  function hasPermission(permissions, permission) {
    return PERMISSION_SET.has(permission) && normalizePermissions(permissions).includes(permission);
  }
  function normalizeUser(value, requireActive = false) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const role = ROLE_SET.has(source.role) ? source.role : '';
    const id = text(source.id, 120);
    const email = normalizeEmail(source.email);
    const name = text(source.name || source.displayName, 80);
    const active = source.active;
    const unit = text(source.unit, 40);
    if (!id || !email || !name || !role || typeof active !== 'boolean' || (requireActive && active !== true)) return null;
    return { id, email, name, role, active, loginCodeConfigured: source.loginCodeConfigured === true, ...(unit ? { unit } : {}) };
  }
  function safeUser(value) { return normalizeUser(value, true); }
  function safeOffice(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const id = text(source.id, 120);
    const slug = normalizeOfficeCode(source.slug);
    const complexName = text(source.complexName || source.name, 160);
    return id && slug && complexName ? { id, slug, complexName } : null;
  }
  function normalizeSession(value, now = Date.now()) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const token = text(source.sessionToken || source.token, 4096);
    const user = safeUser(source.user);
    const office = safeOffice(source.office);
    const permissions = normalizePermissions(source.permissions);
    const expiresAt = Number(source.expiresAt);
    if (!token || !user || !office || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + (24 * 60 * 60 * 1000)) return null;
    return { token, user, office, permissions, expiresAt };
  }
  function storeSession(storage, value, now = Date.now()) {
    const session = normalizeSession(value, now);
    if (!session) return null;
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }
  function restoreSession(storage, now = Date.now()) {
    try {
      const raw = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
      const keys = raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw).sort() : [];
      if (keys.join(',') !== 'expiresAt,office,permissions,token,user') throw new Error('invalid-session-shape');
      const session = normalizeSession(raw, now);
      if (!session) throw new Error('invalid-session');
      return session;
    } catch (_) {
      storage.removeItem(SESSION_KEY);
      return null;
    }
  }
  function clearSession(storage) { storage.removeItem(SESSION_KEY); }
  function roleLabel(role) { return ROLE_LABELS[role] || '권한 확인 필요'; }
  function permissionLabel(permission) { return PERMISSION_LABELS[permission] || permission; }
  function roleCeiling(role) { return ROLE_SET.has(role) ? ROLE_CEILINGS[role].slice() : []; }
  function viewPermissionsForRole(role) { return roleCeiling(role).filter((permission) => VIEW_PERMISSIONS.includes(permission)); }
  function canAssignRole(actorRole, targetRole) {
    if (!ROLE_SET.has(targetRole)) return false;
    if (actorRole === 'system_admin') return true;
    return actorRole === 'manager_chief' && targetRole !== 'system_admin';
  }
  function workOrderStatusOptions(current) {
    if (!current) return ['received', 'planned'];
    if (!Object.prototype.hasOwnProperty.call(WORKORDER_TRANSITIONS, current)) return [];
    return [current, ...WORKORDER_TRANSITIONS[current]];
  }
  function noticeStateOptions(current, canPublish) {
    if (!current) return canPublish ? ['draft', 'published'] : ['draft'];
    if (current === 'draft') return canPublish ? ['draft', 'published', 'archived'] : ['draft', 'archived'];
    if (current === 'published') return canPublish ? ['published', 'archived'] : ['published'];
    return current === 'archived' ? ['archived'] : [];
  }
  function costApprovalTargets(status) {
    return Object.prototype.hasOwnProperty.call(COST_APPROVAL_TARGETS, status)
      ? COST_APPROVAL_TARGETS[status].slice() : [];
  }

  return {
    SESSION_KEY, ROLES, ROLE_LABELS, ROLE_CEILINGS, PERMISSIONS, VIEW_PERMISSIONS, PERMISSION_LABELS,
    WORKORDER_STATUS_LABELS, NOTICE_STATE_LABELS, COST_STATUS_LABELS,
    normalizeEmail, normalizeOfficeCode, validateLogin,
    normalizePermissions, hasPermission, normalizeUser, safeUser, safeOffice, normalizeSession,
    storeSession, restoreSession, clearSession, roleLabel, permissionLabel,
    roleCeiling, viewPermissionsForRole, canAssignRole,
    workOrderStatusOptions, noticeStateOptions, costApprovalTargets,
  };
});
