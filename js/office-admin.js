(() => {
  'use strict';
  if (window.__MANMUL_OFFICE_FRAME_BLOCKED__) return;
  const core = window.ManmulOfficePortalCore;
  const api = window.ManmulOfficePortalApi;
  const byId = (id) => document.getElementById(id);
  const loading = byId('portalAdminLoading'), denied = byId('portalAdminDenied'), deniedMessage = byId('portalAdminDeniedMessage'), app = byId('portalAdminApp');
  const status = byId('portalAdminStatus'), userList = byId('portalUserList'), userForm = byId('portalUserForm'), userError = byId('portalUserError');
  const permissionForm = byId('portalPermissionForm'), permissionFields = byId('portalPermissionFields'), permissionChecks = byId('portalPermissionChecks'), permissionUser = byId('portalPermissionUser'), permissionError = byId('portalPermissionError'), permissionSave = byId('portalPermissionSave');
  const auditList = byId('portalAuditList');
  const LOGOUT_TIMEOUT_MS = 1200;
  const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let session = null;
  let users = [];
  let permissionTarget = null;
  let logoutStarted = false;
  const toggleRequestIds = new Map();

  if (!core || !api || !loading || !denied || !app) return;

  function can(permission) { return Boolean(session && core.hasPermission(session.permissions, permission)); }
  function operationRequestId(form) {
    let requestId = String(form?.dataset.requestId || '');
    if (!REQUEST_ID.test(requestId)) { requestId = crypto.randomUUID(); form.dataset.requestId = requestId; }
    return requestId;
  }
  function clearOperationRequest(form) { if (form) delete form.dataset.requestId; }
  function message(error) { return error && typeof error.message === 'string' ? error.message : '처리 중 문제가 생겼습니다.'; }
  function showDenied(text) { loading.hidden = true; app.hidden = true; denied.hidden = false; byId('portalAdminAccount').hidden = true; deniedMessage.textContent = text || '관리 권한이 없습니다.'; }
  function purgePrivateUi() {
    status.textContent = ''; userList.textContent = ''; auditList.textContent = ''; users = [];
    resetPermissionForm(); userForm?.reset();
    clearOperationRequest(userForm); toggleRequestIds.clear();
    byId('portalAdminUserName').textContent = ''; byId('portalAdminUserRole').textContent = '';
  }
  function endSession(text) { core.clearSession(sessionStorage); session = null; purgePrivateUi(); showDenied(text); }
  async function portalCall(action, payload) {
    if (!session) throw new api.ManmulOfficePortalApiError('session-expired');
    const expectedSession = session;
    try {
      const response = await api.call(action, { sessionToken: expectedSession.token, payload: payload || {} });
      if (session !== expectedSession) throw new api.ManmulOfficePortalApiError('session-expired');
      return response;
    }
    catch (error) { if (error && error.code === 'session-expired') endSession(error.message); throw error; }
  }
  function addText(parent, tag, className, value) { const element = document.createElement(tag); if (className) element.className = className; element.textContent = String(value == null ? '' : value); parent.appendChild(element); return element; }
  function applyPermissions() { document.querySelectorAll('[data-requires]').forEach((element) => { element.hidden = !can(element.dataset.requires); }); }
  function applyAssignableRoleOptions() {
    const role = userForm?.elements.namedItem('role');
    if (!role) return;
    [...role.options].forEach((option) => {
      const allowed = !option.value || Boolean(session && core.canAssignRole(session.user.role, option.value));
      option.disabled = !allowed; option.hidden = !allowed;
    });
  }
  function canManageUser(user) {
    return can('admin.users.manage') && Boolean(user) && (session.user.role === 'system_admin' || user.role !== 'system_admin');
  }
  function canChangePermissions(user) {
    if (!can('admin.permissions.manage') || !user || user.id === session.user.id) return false;
    if (session.user.role === 'system_admin') return true;
    return user.role !== 'system_admin' && user.role !== 'manager_chief';
  }
  function resetPermissionForm() {
    permissionTarget = null;
    clearOperationRequest(permissionForm);
    if (permissionForm) permissionForm.elements.namedItem('userId').value = '';
    if (permissionFields) permissionFields.disabled = true;
    if (permissionSave) permissionSave.disabled = true;
    if (permissionUser) permissionUser.textContent = '사용자 목록에서 권한 설정을 선택해 주세요.';
    permissionChecks?.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = false; input.disabled = true; input.closest('label').hidden = true;
    });
  }
  function resetUserForm() {
    clearOperationRequest(userForm);
    userForm?.reset();
    if (userForm) {
      const fields = userForm.elements;
      fields.namedItem('userId').value = ''; fields.namedItem('active').checked = true;
      fields.namedItem('email').readOnly = false; fields.namedItem('role').disabled = false; fields.namedItem('active').disabled = false;
      applyAssignableRoleOptions();
    }
    if (userError) userError.textContent = '';
  }
  function selectPermissions(user) {
    if (!canChangePermissions(user) || !permissionForm) return;
    clearOperationRequest(permissionForm);
    permissionTarget = user;
    permissionForm.elements.namedItem('userId').value = user.id;
    permissionUser.textContent = `${user.name} (${core.roleLabel(user.role)})의 보기 권한`;
    permissionFields.disabled = false;
    permissionSave.disabled = false;
    const checked = new Set(core.normalizePermissions(user.permissions));
    const ceiling = new Set(core.viewPermissionsForRole(user.role));
    permissionChecks.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const allowed = ceiling.has(input.value);
      input.disabled = !allowed; input.closest('label').hidden = !allowed; input.checked = allowed && checked.has(input.value);
    });
    permissionFields.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function editUser(user) {
    if (!canManageUser(user) || !userForm) return;
    clearOperationRequest(userForm);
    const fields = userForm.elements;
    fields.namedItem('email').readOnly = false; fields.namedItem('role').disabled = false; fields.namedItem('active').disabled = false;
    applyAssignableRoleOptions();
    fields.namedItem('userId').value = user.id;
    fields.namedItem('name').value = user.name;
    fields.namedItem('email').value = user.email;
    fields.namedItem('unit').value = user.unit || '';
    fields.namedItem('role').value = user.role;
    fields.namedItem('active').checked = user.active === true;
    if (user.id === session.user.id) {
      fields.namedItem('email').readOnly = true; fields.namedItem('role').disabled = true; fields.namedItem('active').disabled = true;
    }
    fields.namedItem('name').focus();
  }
  function renderUsers() {
    userList.textContent = '';
    users.forEach((user) => {
      const card = document.createElement('article'); card.className = 'portal-user-card';
      addText(card, 'h3', '', `${user.name} · ${core.roleLabel(user.role)}`);
      addText(card, 'p', '', user.email);
      addText(card, 'p', 'portal-record-meta', `${user.active === false ? '비활성' : '활성'}${user.unit ? ` · ${user.unit}` : ''} · 보기 권한 ${core.normalizePermissions(user.permissions).filter((permission) => core.VIEW_PERMISSIONS.includes(permission)).length}개`);
      const actions = document.createElement('div'); actions.className = 'portal-user-actions';
      if (canManageUser(user)) {
        const edit = addText(actions, 'button', 'portal-button portal-button-secondary', '사용자 수정'); edit.type = 'button'; edit.dataset.userEdit = user.id;
        if (user.id !== session.user.id) { const toggle = addText(actions, 'button', 'portal-button portal-button-secondary', user.active === false ? '계정 활성화' : '계정 비활성화'); toggle.type = 'button'; toggle.dataset.userToggle = user.id; }
      }
      if (canChangePermissions(user)) { const permission = addText(actions, 'button', 'portal-button portal-button-secondary', '보기 권한'); permission.type = 'button'; permission.dataset.userPermission = user.id; }
      card.appendChild(actions); userList.appendChild(card);
    });
    if (!users.length) addText(userList, 'p', 'portal-record-meta', '등록된 사용자가 없습니다.');
  }
  async function loadUsers() {
    if (!can('admin.users.view')) return;
    status.textContent = '사용자 목록을 불러오는 중입니다.';
    try {
      const response = await portalCall('portalUserList', {});
      users = (Array.isArray(response.users) ? response.users : []).map((row) => {
        const user = core.normalizeUser(row, false);
        return user ? { ...user, permissions: core.normalizePermissions(row.permissions) } : null;
      }).filter(Boolean);
      resetPermissionForm(); renderUsers(); status.textContent = '사용자 목록을 불러왔습니다.';
    } catch (error) { if (session) status.textContent = message(error); }
  }
  function userPayload() {
    const fields = userForm.elements;
    const payload = {
      email: core.normalizeEmail(fields.namedItem('email').value), name: fields.namedItem('name').value.trim().slice(0, 80),
      role: fields.namedItem('role').value, active: fields.namedItem('active').checked,
      unit: fields.namedItem('unit').value.trim().slice(0, 40),
    };
    const userId = fields.namedItem('userId').value.trim(); if (userId) payload.userId = userId;
    return payload;
  }
  async function loadAudit() {
    if (!can('admin.audit.view')) return;
    try {
      const response = await portalCall('portalAuditList', {});
      auditList.textContent = '';
      const rows = Array.isArray(response.audit) ? response.audit.slice(0, 100) : [];
      rows.forEach((row) => {
        const card = document.createElement('article'); card.className = 'portal-record';
        addText(card, 'h3', '', String(row.action || '관리 변경').slice(0, 100));
        addText(card, 'p', '', String(row.summary || row.result || '').slice(0, 500));
        addText(card, 'p', 'portal-record-meta', `${String(row.actorName || '').slice(0, 80)}${row.createdAt ? ` · ${String(row.createdAt).slice(0, 40)}` : ''}`);
        auditList.appendChild(card);
      });
      if (!rows.length) addText(auditList, 'p', 'portal-record-meta', '표시할 감사기록이 없습니다.');
    } catch (error) { if (session) status.textContent = message(error); }
  }

  core.VIEW_PERMISSIONS.forEach((permission) => {
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'permissions'; input.value = permission;
    label.appendChild(input); label.appendChild(document.createTextNode(core.permissionLabel(permission))); permissionChecks?.appendChild(label);
  });
  userList?.addEventListener('click', async (event) => {
    const button = event.target.closest('button'); if (!button) return;
    const id = button.dataset.userEdit || button.dataset.userToggle || button.dataset.userPermission;
    const user = users.find((row) => row.id === id); if (!user) return;
    if (button.dataset.userEdit) editUser(user);
    if (button.dataset.userPermission) selectPermissions(user);
    if (button.dataset.userToggle && can('admin.users.manage')) {
      const nextActive = user.active === false;
      if (!nextActive && !window.confirm(`${user.name} 계정을 비활성화할까요? 마지막 관리자는 서버가 차단합니다.`)) return;
      const operationKey = `${user.id}:${nextActive ? 'active' : 'inactive'}`;
      const requestId = toggleRequestIds.get(operationKey) || crypto.randomUUID();
      toggleRequestIds.set(operationKey, requestId);
      try { await portalCall('portalUserSave', { requestId, userId: user.id, email: user.email, name: user.name, role: user.role, active: nextActive, unit: String(user.unit || '').slice(0, 40) }); toggleRequestIds.delete(operationKey); await loadUsers(); }
      catch (error) { if (session) status.textContent = message(error); }
    }
  });
  userForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!can('admin.users.manage')) return;
    const payload = userPayload(); userError.textContent = '';
    if (!payload.email || !payload.name || !core.canAssignRole(session.user.role, payload.role)) { userError.textContent = '이름, 이메일과 지정할 수 있는 역할을 확인해 주세요.'; return; }
    payload.requestId = operationRequestId(userForm);
    try { await portalCall('portalUserSave', payload); clearOperationRequest(userForm); resetUserForm(); await loadUsers(); }
    catch (error) { if (session) userError.textContent = message(error); }
  });
  userForm?.addEventListener('reset', () => clearOperationRequest(userForm));
  permissionForm?.addEventListener('reset', () => clearOperationRequest(permissionForm));
  byId('portalUserReset')?.addEventListener('click', resetUserForm);
  permissionForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!can('admin.permissions.manage')) return;
    const userId = permissionForm.elements.namedItem('userId').value.trim();
    const ceiling = new Set(permissionTarget ? core.viewPermissionsForRole(permissionTarget.role) : []);
    const permissions = [...permissionChecks.querySelectorAll('input:checked:not(:disabled)')].map((input) => input.value).filter((permission) => ceiling.has(permission));
    permissionError.textContent = '';
    if (!userId || !permissionTarget || permissionTarget.id !== userId || !canChangePermissions(permissionTarget)) { permissionError.textContent = '권한을 설정할 수 있는 사용자를 다시 선택해 주세요.'; return; }
    const requestId = operationRequestId(permissionForm);
    try { await portalCall('portalPermissionSave', { requestId, userId, permissions }); clearOperationRequest(permissionForm); await loadUsers(); status.textContent = '보기 권한을 저장했습니다.'; }
    catch (error) { if (session) permissionError.textContent = message(error); }
  });
  byId('portalUserRefresh')?.addEventListener('click', loadUsers);
  byId('portalAuditRefresh')?.addEventListener('click', loadAudit);
  byId('portalAdminLogout')?.addEventListener('click', async () => {
    if (logoutStarted) return;
    logoutStarted = true;
    const current = session; core.clearSession(sessionStorage); session = null;
    app.hidden = true; loading.hidden = true; denied.hidden = false; byId('portalAdminAccount').hidden = true;
    deniedMessage.textContent = '안전하게 로그아웃하고 있습니다.';
    purgePrivateUi();
    if (current) await Promise.race([
      api.call('portalLogout', { sessionToken: current.token, payload: {} }).catch(() => null),
      new Promise((resolve) => window.setTimeout(resolve, LOGOUT_TIMEOUT_MS)),
    ]);
    window.location.replace('office-login.html');
  });

  async function boot() {
    session = core.restoreSession(sessionStorage);
    if (!session) { showDenied('로그인 정보가 없거나 만료되었습니다.'); return; }
    try {
      const me = await portalCall('portalMe', {});
      const refreshed = core.storeSession(sessionStorage, { sessionToken: me.sessionToken || session.token, user: me.user, office: me.office, permissions: me.permissions, expiresAt: Number(me.expiresAt || session.expiresAt) });
      if (!refreshed) throw new api.ManmulOfficePortalApiError('invalid-response');
      session = refreshed;
      const hasAdminView = can('admin.users.view') || can('admin.permissions.manage') || can('admin.audit.view');
      if (!hasAdminView) { showDenied('이 계정에는 사용자·권한 관리 화면을 볼 권한이 없습니다.'); return; }
      byId('portalAdminOfficeName').textContent = session.office.complexName;
      byId('portalAdminUserName').textContent = session.user.name;
      byId('portalAdminUserRole').textContent = core.roleLabel(session.user.role);
      byId('portalAdminAccount').hidden = false;
      loading.hidden = true; denied.hidden = true; app.hidden = false; applyPermissions(); applyAssignableRoleOptions(); resetPermissionForm();
      await Promise.all([loadUsers(), loadAudit()]);
    } catch (error) { if (session) endSession(message(error)); }
  }
  boot();
})();
