(() => {
  'use strict';
  if (window.__MANMUL_OFFICE_FRAME_BLOCKED__) return;
  const core = window.ManmulOfficePortalCore;
  const api = window.ManmulOfficePortalApi;
  const byId = (id) => document.getElementById(id);
  const loading = byId('portalLoading'), denied = byId('portalDenied'), deniedMessage = byId('portalDeniedMessage'), app = byId('portalApp');
  const statusMessage = byId('portalStatusMessage'), nav = byId('portalNav');
  const dashboardCards = byId('portalDashboardCards'), dashboardNotices = byId('portalDashboardNotices');
  const statusList = byId('portalStatusList'), statusForm = byId('portalStatusForm'), statusError = byId('portalStatusError');
  const logList = byId('portalLogList'), logForm = byId('portalLogForm'), logError = byId('portalLogError');
  const LOGOUT_TIMEOUT_MS = 1200;
  const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let session = null;
  let statuses = [];
  let logs = [];
  let currentPanel = '';
  let logoutStarted = false;

  if (!core || !api || !loading || !denied || !app) return;

  function can(permission) { return Boolean(session && core.hasPermission(session.permissions, permission)); }
  function operationRequestId(form) {
    let requestId = String(form?.dataset.requestId || '');
    if (!REQUEST_ID.test(requestId)) { requestId = crypto.randomUUID(); form.dataset.requestId = requestId; }
    return requestId;
  }
  function clearOperationRequest(form) { if (form) delete form.dataset.requestId; }
  function showDenied(message) {
    loading.hidden = true; app.hidden = true; denied.hidden = false;
    byId('portalAccount').hidden = true;
    if (deniedMessage) deniedMessage.textContent = message || '다시 로그인해 주세요.';
  }
  function errorText(error) { return error && typeof error.message === 'string' ? error.message : '처리 중 문제가 생겼습니다.'; }
  function purgePrivateUi() {
    statusMessage.textContent = '';
    dashboardCards.textContent = ''; dashboardNotices.textContent = '';
    statusList.textContent = ''; logList.textContent = '';
    statuses = []; logs = []; currentPanel = '';
    statusForm?.reset(); logForm?.reset();
    clearOperationRequest(statusForm); clearOperationRequest(logForm);
    byId('portalUserName').textContent = ''; byId('portalUserRole').textContent = '';
  }
  function clearSessionAndDeny(message) { core.clearSession(sessionStorage); session = null; purgePrivateUi(); showDenied(message); }
  async function portalCall(action, payload) {
    if (!session) throw new api.ManmulOfficePortalApiError('session-expired');
    const expectedSession = session;
    try {
      const response = await api.call(action, { sessionToken: expectedSession.token, payload: payload || {} });
      if (session !== expectedSession) throw new api.ManmulOfficePortalApiError('session-expired');
      return response;
    }
    catch (error) {
      if (error && error.code === 'session-expired') clearSessionAndDeny(error.message);
      throw error;
    }
  }
  function requiredAllowed(element) {
    const permission = element && element.dataset && element.dataset.requires;
    return permission ? can(permission) : true;
  }
  function applyPermissions() {
    document.querySelectorAll('[data-requires]').forEach((element) => { element.hidden = !requiredAllowed(element); });
    const adminLink = byId('portalAdminLink');
    if (adminLink) adminLink.hidden = !(can('admin.users.view') || can('admin.permissions.manage') || can('admin.audit.view'));
  }
  function showPanel(name) {
    const target = document.querySelector(`[data-panel-view="${name}"]`);
    if (!target || !requiredAllowed(target)) return false;
    currentPanel = name;
    document.querySelectorAll('[data-panel-view]').forEach((panel) => { panel.hidden = panel !== target; });
    nav.querySelectorAll('[data-panel]').forEach((button) => {
      const active = button.dataset.panel === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    target.querySelector('h1')?.focus({ preventScroll: true });
    if (name === 'dashboard') loadDashboard();
    if (name === 'status') loadStatuses();
    if (name === 'logs') loadLogs();
    return true;
  }
  function addText(parent, tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(value == null ? '' : value);
    parent.appendChild(element);
    return element;
  }
  function validList(response, key) {
    return response && Array.isArray(response[key]) ? response[key].filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
  }
  function hidePrivateUiForLogout() {
    app.hidden = true; loading.hidden = true; denied.hidden = false;
    byId('portalAccount').hidden = true;
    deniedMessage.textContent = '안전하게 로그아웃하고 있습니다.';
    purgePrivateUi();
  }
  async function bestEffortServerLogout(current) {
    if (!current) return;
    await Promise.race([
      api.call('portalLogout', { sessionToken: current.token, payload: {} }).catch(() => null),
      new Promise((resolve) => window.setTimeout(resolve, LOGOUT_TIMEOUT_MS)),
    ]);
  }

  async function loadDashboard() {
    if (!can('dashboard.view')) return;
    statusMessage.textContent = '관리 현황을 불러오는 중입니다.';
    try {
      const response = await portalCall('portalDashboard', {});
      dashboardCards.textContent = '';
      const metrics = Array.isArray(response.metrics) ? response.metrics.slice(0, 8) : [];
      metrics.forEach((metric) => {
        const card = document.createElement('article'); card.className = 'portal-kpi';
        addText(card, 'span', '', String(metric && metric.label || '').slice(0, 80));
        addText(card, 'strong', '', String(metric && metric.value != null ? metric.value : '').slice(0, 40));
        dashboardCards.appendChild(card);
      });
      if (!metrics.length) addText(dashboardCards, 'p', 'portal-record-meta', '표시할 관리 현황이 없습니다.');
      dashboardNotices.textContent = '';
      const notices = Array.isArray(response.notices) ? response.notices.slice(0, 10) : [];
      notices.forEach((notice) => addText(dashboardNotices, 'li', '', String(typeof notice === 'string' ? notice : notice && notice.title || '').slice(0, 240)));
      if (!notices.length) addText(dashboardNotices, 'li', '', '최근 안내가 없습니다.');
      statusMessage.textContent = '관리 현황을 최신 상태로 불러왔습니다.';
    } catch (error) { if (session) statusMessage.textContent = errorText(error); }
  }
  function statusLabel(value) {
    return ({ normal: '정상', watch: '관찰 필요', repair: '보수 필요', working: '조치 중', complete: '조치 완료' })[value] || '확인 필요';
  }
  function visibilityLabel(value) { return ({ internal: '관리사무소 내부', board: '동대표까지', public: '입주민 공개' })[value] || '내부'; }
  function renderStatuses() {
    statusList.textContent = '';
    statuses.forEach((item) => {
      const card = document.createElement('article'); card.className = 'portal-record';
      addText(card, 'h3', '', String(item.location || '시설 위치 미정').slice(0, 120));
      addText(card, 'p', '', String(item.summary || '').slice(0, 1000));
      addText(card, 'p', 'portal-record-meta', `${statusLabel(item.state)} · ${visibilityLabel(item.visibility)}${item.updatedAt ? ` · ${String(item.updatedAt).slice(0, 40)}` : ''}`);
      if (can('status.manage')) {
        const button = addText(card, 'button', 'portal-button portal-button-secondary', '수정');
        button.type = 'button'; button.dataset.statusEdit = String(item.statusId || '');
      }
      statusList.appendChild(card);
    });
    if (!statuses.length) addText(statusList, 'p', 'portal-record-meta', '등록된 시설 상태가 없습니다.');
  }
  async function loadStatuses() {
    if (!can('status.view')) return;
    statusMessage.textContent = '시설 상태를 불러오는 중입니다.';
    try { const response = await portalCall('portalStatusList', {}); statuses = validList(response, 'statuses'); renderStatuses(); statusMessage.textContent = '시설 상태를 불러왔습니다.'; }
    catch (error) { if (session) statusMessage.textContent = errorText(error); }
  }
  function fillStatus(item) {
    clearOperationRequest(statusForm);
    const fields = statusForm.elements;
    fields.namedItem('statusId').value = item.statusId || '';
    fields.namedItem('location').value = item.location || '';
    fields.namedItem('category').value = item.category || '';
    fields.namedItem('state').value = item.state || 'normal';
    fields.namedItem('summary').value = item.summary || '';
    fields.namedItem('visibility').value = ['internal', 'board', 'public'].includes(item.visibility) ? item.visibility : 'internal';
    statusForm.dataset.revision = Number.isInteger(item.revision) ? String(item.revision) : '';
    fields.namedItem('location').focus();
  }
  function statusPayload() {
    const fields = statusForm.elements;
    const payload = {
      location: fields.namedItem('location').value.trim().slice(0, 120), category: fields.namedItem('category').value,
      state: fields.namedItem('state').value, summary: fields.namedItem('summary').value.trim().slice(0, 1000),
      visibility: ['internal', 'board', 'public'].includes(fields.namedItem('visibility').value) ? fields.namedItem('visibility').value : 'internal',
    };
    const id = fields.namedItem('statusId').value.trim(); if (id) payload.statusId = id;
    const revisionRaw = String(statusForm.dataset.revision || '');
    const revision = Number(revisionRaw); if (revisionRaw && Number.isInteger(revision) && revision >= 0) payload.revision = revision;
    return payload;
  }
  function logCategoryLabel(value) { return ({ inspection: '점검', repair: '보수', complaint: '민원', meeting: '회의', notice: '공지', other: '기타' })[value] || '기타'; }
  function renderLogs() {
    logList.textContent = '';
    logs.forEach((item) => {
      const card = document.createElement('article'); card.className = 'portal-record';
      addText(card, 'h3', '', String(item.title || '제목 없음').slice(0, 120));
      addText(card, 'p', '', String(item.content || '').slice(0, 2000));
      addText(card, 'p', 'portal-record-meta', `${String(item.workDate || '').slice(0, 10)} · ${logCategoryLabel(item.category)} · ${visibilityLabel(item.visibility)}${item.authorName ? ` · ${String(item.authorName).slice(0, 80)}` : ''}`);
      if (can('logs.manage')) {
        const button = addText(card, 'button', 'portal-button portal-button-secondary', '수정');
        button.type = 'button'; button.dataset.logEdit = String(item.logId || '');
      }
      logList.appendChild(card);
    });
    if (!logs.length) addText(logList, 'p', 'portal-record-meta', '작성된 관리 일지가 없습니다.');
  }
  async function loadLogs() {
    if (!can('logs.view')) return;
    statusMessage.textContent = '관리 일지를 불러오는 중입니다.';
    try { const response = await portalCall('portalLogList', {}); logs = validList(response, 'logs'); renderLogs(); statusMessage.textContent = '관리 일지를 불러왔습니다.'; }
    catch (error) { if (session) statusMessage.textContent = errorText(error); }
  }
  function fillLog(item) {
    clearOperationRequest(logForm);
    const fields = logForm.elements;
    fields.namedItem('logId').value = item.logId || '';
    fields.namedItem('workDate').value = item.workDate || '';
    fields.namedItem('category').value = item.category || 'other';
    fields.namedItem('title').value = item.title || '';
    fields.namedItem('content').value = item.content || '';
    fields.namedItem('visibility').value = ['internal', 'board', 'public'].includes(item.visibility) ? item.visibility : 'internal';
    logForm.dataset.revision = Number.isInteger(item.revision) ? String(item.revision) : '';
    fields.namedItem('title').focus();
  }
  function logPayload() {
    const fields = logForm.elements;
    const payload = {
      workDate: fields.namedItem('workDate').value, category: fields.namedItem('category').value,
      title: fields.namedItem('title').value.trim().slice(0, 120), content: fields.namedItem('content').value.trim().slice(0, 2000),
      visibility: ['internal', 'board', 'public'].includes(fields.namedItem('visibility').value) ? fields.namedItem('visibility').value : 'internal',
    };
    const id = fields.namedItem('logId').value.trim(); if (id) payload.logId = id;
    const revisionRaw = String(logForm.dataset.revision || '');
    const revision = Number(revisionRaw); if (revisionRaw && Number.isInteger(revision) && revision >= 0) payload.revision = revision;
    return payload;
  }

  nav.addEventListener('click', (event) => { const button = event.target.closest('[data-panel]'); if (button) showPanel(button.dataset.panel); });
  byId('portalDashboardRefresh')?.addEventListener('click', loadDashboard);
  byId('portalStatusRefresh')?.addEventListener('click', loadStatuses);
  byId('portalLogsRefresh')?.addEventListener('click', loadLogs);
  statusForm?.addEventListener('reset', () => clearOperationRequest(statusForm));
  logForm?.addEventListener('reset', () => clearOperationRequest(logForm));
  statusList?.addEventListener('click', (event) => { const button = event.target.closest('[data-status-edit]'); if (!button || !can('status.manage')) return; const item = statuses.find((row) => String(row.statusId || '') === button.dataset.statusEdit); if (item) fillStatus(item); });
  logList?.addEventListener('click', (event) => { const button = event.target.closest('[data-log-edit]'); if (!button || !can('logs.manage')) return; const item = logs.find((row) => String(row.logId || '') === button.dataset.logEdit); if (item) fillLog(item); });
  statusForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!can('status.manage')) return;
    const payload = statusPayload(); statusError.textContent = '';
    if (!payload.location || !payload.category || !payload.summary) { statusError.textContent = '시설 위치, 분류와 확인 내용을 입력해 주세요.'; return; }
    payload.requestId = operationRequestId(statusForm);
    try { await portalCall('portalStatusSave', payload); clearOperationRequest(statusForm); statusForm.reset(); statusForm.elements.namedItem('visibility').value = 'internal'; statusForm.dataset.revision = ''; await loadStatuses(); }
    catch (error) { if (session) statusError.textContent = errorText(error); }
  });
  logForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!can('logs.manage')) return;
    const payload = logPayload(); logError.textContent = '';
    if (!payload.workDate || !payload.title || !payload.content) { logError.textContent = '업무일, 제목과 내용을 입력해 주세요.'; return; }
    payload.requestId = operationRequestId(logForm);
    try { await portalCall('portalLogSave', payload); clearOperationRequest(logForm); logForm.reset(); logForm.elements.namedItem('visibility').value = 'internal'; logForm.dataset.revision = ''; await loadLogs(); }
    catch (error) { if (session) logError.textContent = errorText(error); }
  });
  byId('portalLogout')?.addEventListener('click', async () => {
    if (logoutStarted) return;
    logoutStarted = true;
    const current = session;
    core.clearSession(sessionStorage); session = null;
    hidePrivateUiForLogout();
    await bestEffortServerLogout(current);
    window.location.replace('office-login.html');
  });

  async function boot() {
    session = core.restoreSession(sessionStorage);
    if (!session) { showDenied('로그인 정보가 없거나 만료되었습니다.'); return; }
    try {
      const me = await portalCall('portalMe', {});
      const refreshed = core.storeSession(sessionStorage, {
        sessionToken: me.sessionToken || session.token, user: me.user, office: me.office,
        permissions: me.permissions, expiresAt: Number(me.expiresAt || session.expiresAt),
      });
      if (!refreshed) throw new api.ManmulOfficePortalApiError('invalid-response');
      session = refreshed;
      byId('portalOfficeName').textContent = session.office.complexName;
      byId('portalUserName').textContent = session.user.name;
      byId('portalUserRole').textContent = core.roleLabel(session.user.role);
      byId('portalAccount').hidden = false;
      loading.hidden = true; denied.hidden = true; app.hidden = false;
      applyPermissions();
      const first = [...nav.querySelectorAll('[data-panel]')].find((button) => !button.hidden);
      if (first) showPanel(first.dataset.panel);
      else byId('portalEmpty').hidden = false;
    } catch (error) { if (session) clearSessionAndDeny(errorText(error)); }
  }
  boot();
})();
