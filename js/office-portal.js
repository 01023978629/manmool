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
  const workorderList = byId('portalWorkorderList'), workorderForm = byId('portalWorkorderForm'), workorderError = byId('portalWorkorderError');
  const noticeList = byId('portalNoticeList'), noticeForm = byId('portalNoticeForm'), noticeError = byId('portalNoticeError');
  const costList = byId('portalCostList'), costForm = byId('portalCostForm'), costError = byId('portalCostError');
  const LOGOUT_TIMEOUT_MS = 1200;
  const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let session = null;
  let statuses = [];
  let logs = [];
  let workorders = [], assignees = [], notices = [], costs = [], reportAggregate = null;
  const costApprovalRequestIds = new Map();
  const loadGeneration = { dashboard: 0, status: 0, logs: 0, workorders: 0, notices: 0, costs: 0, reports: 0 };
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
    Object.keys(loadGeneration).forEach((key) => { loadGeneration[key] += 1; });
    statusMessage.textContent = '';
    dashboardCards.textContent = ''; dashboardNotices.textContent = '';
    statusList.textContent = ''; logList.textContent = '';
    workorderList.textContent = ''; noticeList.textContent = ''; costList.textContent = ''; byId('portalReportCards').textContent = '';
    statuses = []; logs = []; workorders = []; assignees = []; notices = []; costs = []; reportAggregate = null; currentPanel = '';
    costApprovalRequestIds.clear();
    [statusForm, logForm, workorderForm, noticeForm, costForm].forEach((form) => { form?.reset(); clearOperationRequest(form); });
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
      if (error && error.code === 'session-expired' && session === expectedSession) clearSessionAndDeny(error.message);
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
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    target.querySelector('h1')?.focus({ preventScroll: true });
    if (name === 'dashboard') loadDashboard();
    if (name === 'status') loadStatuses();
    if (name === 'logs') loadLogs();
    if (name === 'workorders') loadWorkorders();
    if (name === 'notices') loadNotices();
    if (name === 'costs') loadCosts();
    if (name === 'reports') loadReport();
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    nav.querySelector('.is-active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
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
  function committedEntity(response, key, idKey) {
    const entity = response && response[key];
    if (!entity || typeof entity !== 'object' || Array.isArray(entity) || !String(entity[idKey] || '')) throw new api.ManmulOfficePortalApiError('invalid-response');
    return entity;
  }
  function upsertRecord(list, entity, idKey) {
    const id = String(entity[idKey]);
    return [entity, ...list.filter((item) => String(item && item[idKey] || '') !== id)];
  }
  function searchable(value) { return String(value == null ? '' : value).toLocaleLowerCase('ko-KR'); }
  function setPending(button, pending) { if (button) { button.disabled = pending; button.setAttribute('aria-busy', String(pending)); } }
  function resetEditor(form, title, text) { clearOperationRequest(form); form?.reset(); if (form) { form.dataset.revision = ''; const error = form.querySelector('.portal-error'); if (error) error.textContent = ''; } if (title) title.textContent = text; }
  function replaceOptions(select, values, labels, selected) {
    if (!select) return;
    select.textContent = '';
    values.forEach((value) => {
      const option = document.createElement('option'); option.value = value; option.textContent = labels[value] || value;
      select.appendChild(option);
    });
    if (values.includes(selected)) select.value = selected;
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
      api.call('portalLogout', { sessionToken: current.token, payload: {}, keepalive: true }).catch(() => null),
      new Promise((resolve) => window.setTimeout(resolve, LOGOUT_TIMEOUT_MS)),
    ]);
  }

  async function loadDashboard() {
    if (!can('dashboard.view')) return;
    const generation = ++loadGeneration.dashboard; const button = byId('portalDashboardRefresh'); setPending(button, true);
    statusMessage.textContent = '관리 현황을 불러오는 중입니다.';
    try {
      const response = await portalCall('portalDashboard', {});
      if (generation !== loadGeneration.dashboard) return;
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
      if (can('notices.view')) {
        const recent = Array.isArray(response.notices) ? response.notices.slice(0, 10) : [];
        recent.forEach((notice) => addText(dashboardNotices, 'li', '', String(typeof notice === 'string' ? notice : notice && notice.title || '').slice(0, 240)));
        if (!recent.length) addText(dashboardNotices, 'li', '', '최근 안내가 없습니다.');
      }
      statusMessage.textContent = '관리 현황을 최신 상태로 불러왔습니다.';
    } catch (error) { if (session && generation === loadGeneration.dashboard) statusMessage.textContent = errorText(error); }
    finally { if (generation === loadGeneration.dashboard) setPending(button, false); }
  }
  function statusLabel(value) {
    return ({ normal: '정상', watch: '관찰 필요', repair: '보수 필요', working: '조치 중', complete: '조치 완료' })[value] || '확인 필요';
  }
  function visibilityLabel(value) { return ({ internal: '관리사무소 내부', board: '동대표까지', public: '입주민 공개' })[value] || '내부'; }
  function renderStatuses() {
    statusList.textContent = '';
    const query = searchable(byId('portalStatusSearch')?.value); const filter = byId('portalStatusFilter')?.value || '';
    const shown = statuses.filter((item) => (!filter || item.state === filter) && (!query || searchable(`${item.location} ${item.summary}`).includes(query)));
    shown.forEach((item) => {
      const card = document.createElement('article'); card.className = 'portal-record';
      addText(card, 'h3', '', String(item.location || '시설 위치 미정').slice(0, 120));
      addText(card, 'p', '', String(item.summary || '').slice(0, 1000));
      addText(card, 'p', 'portal-record-meta', `${statusLabel(item.state)} · ${visibilityLabel(item.visibility)}${item.updatedAt ? ` · ${String(item.updatedAt).slice(0, 40)}` : ''}`);
      if (can('status.manage')) {
        const button = addText(card, 'button', 'portal-button portal-button-secondary', `${String(item.location || '시설').slice(0, 40)} 수정`);
        button.type = 'button'; button.dataset.statusEdit = String(item.statusId || '');
      }
      statusList.appendChild(card);
    });
    byId('portalStatusCount').textContent = `${shown.length}건`; if (!shown.length) addText(statusList, 'p', 'portal-record-meta', '조건에 맞는 시설 상태가 없습니다.');
  }
  async function loadStatuses() {
    if (!can('status.view')) return;
    const generation = ++loadGeneration.status; const button = byId('portalStatusRefresh'); setPending(button, true);
    statusMessage.textContent = '시설 상태를 불러오는 중입니다.';
    try { const response = await portalCall('portalStatusList', {}); if (generation !== loadGeneration.status) return; statuses = validList(response, 'statuses'); renderStatuses(); statusMessage.textContent = '시설 상태를 불러왔습니다.'; }
    catch (error) { if (session && generation === loadGeneration.status) statusMessage.textContent = errorText(error); }
    finally { if (generation === loadGeneration.status) setPending(button, false); }
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
    byId('portalStatusFormTitle').textContent = '시설 상태 수정';
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
    const query = searchable(byId('portalLogSearch')?.value); const filter = byId('portalLogFilter')?.value || '';
    const shown = logs.filter((item) => (!filter || item.category === filter) && (!query || searchable(`${item.title} ${item.content}`).includes(query)));
    shown.forEach((item) => {
      const card = document.createElement('article'); card.className = 'portal-record';
      addText(card, 'h3', '', String(item.title || '제목 없음').slice(0, 120));
      addText(card, 'p', '', String(item.content || '').slice(0, 2000));
      addText(card, 'p', 'portal-record-meta', `${String(item.workDate || '').slice(0, 10)} · ${logCategoryLabel(item.category)} · ${visibilityLabel(item.visibility)}${item.authorName ? ` · ${String(item.authorName).slice(0, 80)}` : ''}`);
      if (can('logs.manage')) {
        const button = addText(card, 'button', 'portal-button portal-button-secondary', `${String(item.title || '관리 일지').slice(0, 40)} 수정`);
        button.type = 'button'; button.dataset.logEdit = String(item.logId || '');
      }
      logList.appendChild(card);
    });
    byId('portalLogCount').textContent = `${shown.length}건`; if (!shown.length) addText(logList, 'p', 'portal-record-meta', '조건에 맞는 관리 일지가 없습니다.');
  }
  async function loadLogs() {
    if (!can('logs.view')) return;
    const generation = ++loadGeneration.logs; const button = byId('portalLogsRefresh'); setPending(button, true);
    statusMessage.textContent = '관리 일지를 불러오는 중입니다.';
    try { const response = await portalCall('portalLogList', {}); if (generation !== loadGeneration.logs) return; logs = validList(response, 'logs'); renderLogs(); statusMessage.textContent = '관리 일지를 불러왔습니다.'; }
    catch (error) { if (session && generation === loadGeneration.logs) statusMessage.textContent = errorText(error); }
    finally { if (generation === loadGeneration.logs) setPending(button, false); }
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
    byId('portalLogFormTitle').textContent = '관리 일지 수정';
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

  function visibility(value) { return ['internal', 'board', 'public'].includes(value) ? value : 'internal'; }
  function revisionFrom(form, payload) { const raw = String(form.dataset.revision || ''); const value = Number(raw); if (raw && Number.isInteger(value) && value >= 0) payload.revision = value; }
  function workorderPriorityLabel(value) { return ({ low: '낮음', normal: '일반', high: '높음', urgent: '긴급' })[value] || '일반'; }
  function workorderStatusLabel(value) { return core.WORKORDER_STATUS_LABELS[value] || '확인 필요'; }
  function configureWorkorderStatuses(current) {
    replaceOptions(workorderForm?.elements.namedItem('status'), core.workOrderStatusOptions(current), core.WORKORDER_STATUS_LABELS, current || 'received');
  }
  function renderWorkorders() {
    workorderList.textContent = ''; const q = searchable(byId('portalWorkorderSearch').value), filter = byId('portalWorkorderFilter').value;
    const shown = workorders.filter((row) => (!filter || row.status === filter) && (!q || searchable(`${row.receiptNo} ${row.title} ${row.location} ${row.category} ${row.assigneeName}`).includes(q)));
    const receipts = byId('portalReceiptOptions'); receipts.textContent = ''; [...new Set(workorders.map((row) => row.receiptNo).filter(Boolean))].forEach((value) => { const option = document.createElement('option'); option.value = value; receipts.appendChild(option); });
    shown.forEach((row) => {
      const card = document.createElement('article'); card.className = 'portal-record';
      addText(card, 'h3', '', row.title || '작업지시'); addText(card, 'p', '', row.instructions || '');
      addText(card, 'p', 'portal-record-meta', `${row.receiptNo || '접수번호 없음'} · ${row.location || '위치 없음'} · ${workorderPriorityLabel(row.priority)} · ${workorderStatusLabel(row.status)}${row.assigneeName ? ` · 담당 ${row.assigneeName}` : ' · 미배정'}${row.dueDate ? ` · 기한 ${row.dueDate}` : ''} · ${visibilityLabel(row.visibility)}`);
      if (can('workorders.manage') && !['completed', 'cancelled'].includes(row.status)) {
        const button = addText(card, 'button', 'portal-button portal-button-secondary', '수정'); button.type = 'button'; button.dataset.workorderEdit = row.workOrderId || ''; button.setAttribute('aria-label', `${row.title || '작업지시'} 수정`);
      }
      workorderList.appendChild(card);
    });
    byId('portalWorkorderCount').textContent = `${shown.length}건`; if (!shown.length) addText(workorderList, 'p', 'portal-record-meta', '조건에 맞는 작업지시가 없습니다.');
  }
  function renderAssignees(rows) {
    if (!can('workorders.assign')) return;
    assignees = rows.slice();
    const select = workorderForm.elements.namedItem('assigneeUserId');
    if (!select) return;
    const selected = select.value; select.textContent = '';
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = '미배정'; select.appendChild(empty);
    rows.forEach((row) => { const option = document.createElement('option'); option.value = String(row.id || ''); option.textContent = `${String(row.name || '').slice(0, 80)}${row.role ? ` (${core.roleLabel(row.role)})` : ''}`; if (option.value) select.appendChild(option); });
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }
  async function loadWorkorders() {
    if (!can('workorders.view')) return;
    const g = ++loadGeneration.workorders, button = byId('portalWorkorderRefresh'); setPending(button, true); statusMessage.textContent = '작업지시를 불러오는 중입니다.';
    try {
      const response = await portalCall('portalWorkOrderList', {}); if (g !== loadGeneration.workorders) return;
      workorders = validList(response, 'workOrders'); renderAssignees(validList(response, 'assignees')); renderWorkorders(); statusMessage.textContent = '작업지시를 불러왔습니다.';
    } catch (error) { if (session && g === loadGeneration.workorders) statusMessage.textContent = errorText(error); }
    finally { if (g === loadGeneration.workorders) setPending(button, false); }
  }
  function fillWorkorder(row) {
    resetEditor(workorderForm, byId('portalWorkorderFormTitle'), '작업지시 수정'); configureWorkorderStatuses(row.status);
    const f = workorderForm.elements;
    ['workOrderId','receiptNo','title','location','category','priority','dueDate','instructions','visibility'].forEach((key) => { if (f.namedItem(key)) f.namedItem(key).value = row[key] || (key === 'visibility' ? 'internal' : ''); });
    if (can('workorders.assign')) {
      const select = f.namedItem('assigneeUserId');
      if (row.assigneeUserId && ![...select.options].some((option) => option.value === row.assigneeUserId)) {
        const option = document.createElement('option'); option.value = row.assigneeUserId; option.textContent = `${row.assigneeName || '현재 담당자'} (상태 확인)`; select.appendChild(option);
      }
      select.value = row.assigneeUserId || '';
    }
    workorderForm.dataset.revision = Number.isInteger(row.revision) ? String(row.revision) : ''; f.namedItem('title').focus();
  }
  function resetWorkorderEditor() { resetEditor(workorderForm, byId('portalWorkorderFormTitle'), '새 작업지시'); configureWorkorderStatuses(''); renderAssignees(assignees); }
  async function saveWorkorder(event) {
    event.preventDefault(); if (!can('workorders.manage')) return;
    const f = workorderForm.elements, payload = {
      receiptNo: f.namedItem('receiptNo').value.trim().slice(0, 80), title: f.namedItem('title').value.trim().slice(0, 120),
      location: f.namedItem('location').value.trim().slice(0, 120), category: f.namedItem('category').value.trim().slice(0, 48),
      priority: f.namedItem('priority').value, status: f.namedItem('status').value, dueDate: f.namedItem('dueDate').value,
      instructions: f.namedItem('instructions').value.trim().slice(0, 3000), visibility: visibility(f.namedItem('visibility').value),
    };
    const id = f.namedItem('workOrderId').value.trim(); if (id) payload.workOrderId = id;
    if (can('workorders.assign')) payload.assigneeUserId = f.namedItem('assigneeUserId').value.trim().slice(0, 120);
    revisionFrom(workorderForm, payload); workorderError.textContent = '';
    if (!payload.title || !payload.location || !payload.category || !payload.instructions) { workorderError.textContent = '제목, 위치, 구분과 지시내용을 입력해 주세요.'; return; }
    if (!core.workOrderStatusOptions(id ? workorders.find((row) => row.workOrderId === id)?.status : '').includes(payload.status)) { workorderError.textContent = '현재 상태에서 변경할 수 없는 작업 상태입니다.'; return; }
    payload.requestId = operationRequestId(workorderForm); const button = workorderForm.querySelector('[type="submit"]'); setPending(button, true);
    try { const response = await portalCall('portalWorkOrderSave', payload); const committed = committedEntity(response, 'workOrder', 'workOrderId'); workorders = upsertRecord(workorders, committed, 'workOrderId'); renderWorkorders(); resetWorkorderEditor(); void loadWorkorders(); }
    catch (error) { if (session) workorderError.textContent = errorText(error); }
    finally { setPending(button, false); }
  }

  function noticeStateLabel(value) { return core.NOTICE_STATE_LABELS[value] || '확인 필요'; }
  function configureNoticeStates(current) {
    replaceOptions(noticeForm?.elements.namedItem('state'), core.noticeStateOptions(current, can('notices.publish')), core.NOTICE_STATE_LABELS, current || 'draft');
  }
  function renderNotices() {
    noticeList.textContent = ''; const q = searchable(byId('portalNoticeSearch').value), filter = byId('portalNoticeFilter').value;
    const shown = notices.filter((row) => (!filter || row.state === filter) && (!q || searchable(`${row.title} ${row.content}`).includes(q)));
    shown.forEach((row) => {
      const card = document.createElement('article'); card.className = 'portal-record'; addText(card, 'h3', '', row.title || '공지'); addText(card, 'p', '', row.content || '');
      const period = [row.publishDate ? `발행 ${row.publishDate}` : '', row.expiresDate ? `종료 ${row.expiresDate}` : ''].filter(Boolean).join(' ~ ');
      addText(card, 'p', 'portal-record-meta', `${visibilityLabel(row.visibility)} · ${noticeStateLabel(row.state)}${period ? ` · ${period}` : ''}`);
      const editable = can('notices.manage') && row.state !== 'archived' && (row.state !== 'published' || can('notices.publish'));
      if (editable) { const button = addText(card, 'button', 'portal-button portal-button-secondary', '수정'); button.type = 'button'; button.dataset.noticeEdit = row.noticeId || ''; button.setAttribute('aria-label', `${row.title || '공지'} 수정`); }
      noticeList.appendChild(card);
    });
    byId('portalNoticeCount').textContent = `${shown.length}건`; if (!shown.length) addText(noticeList, 'p', 'portal-record-meta', '조건에 맞는 공지가 없습니다.');
  }
  async function loadNotices() {
    if (!can('notices.view')) return;
    const g = ++loadGeneration.notices, button = byId('portalNoticeRefresh'); setPending(button, true); statusMessage.textContent = '공지사항을 불러오는 중입니다.';
    try { const response = await portalCall('portalNoticeList', {}); if (g !== loadGeneration.notices) return; notices = validList(response, 'notices'); renderNotices(); statusMessage.textContent = '공지사항을 불러왔습니다.'; }
    catch (error) { if (session && g === loadGeneration.notices) statusMessage.textContent = errorText(error); }
    finally { if (g === loadGeneration.notices) setPending(button, false); }
  }
  function fillNotice(row) {
    resetEditor(noticeForm, byId('portalNoticeFormTitle'), '공지 수정'); configureNoticeStates(row.state); const f = noticeForm.elements;
    ['noticeId','title','content','visibility','publishDate','expiresDate'].forEach((key) => { f.namedItem(key).value = row[key] || (key === 'visibility' ? 'internal' : ''); });
    noticeForm.dataset.revision = Number.isInteger(row.revision) ? String(row.revision) : ''; f.namedItem('title').focus();
  }
  function resetNoticeEditor() { resetEditor(noticeForm, byId('portalNoticeFormTitle'), '새 공지'); configureNoticeStates(''); }
  async function saveNotice(event) {
    event.preventDefault(); if (!can('notices.manage')) return;
    const f = noticeForm.elements, payload = {
      title: f.namedItem('title').value.trim().slice(0, 160), content: f.namedItem('content').value.trim().slice(0, 5000),
      visibility: visibility(f.namedItem('visibility').value), state: f.namedItem('state').value,
      publishDate: f.namedItem('publishDate').value, expiresDate: f.namedItem('expiresDate').value,
    };
    const id = f.namedItem('noticeId').value.trim(); if (id) payload.noticeId = id; revisionFrom(noticeForm, payload); noticeError.textContent = '';
    const current = id ? notices.find((row) => row.noticeId === id)?.state : '';
    if (!payload.title || !payload.content) { noticeError.textContent = '제목과 내용을 입력해 주세요.'; return; }
    if (!core.noticeStateOptions(current, can('notices.publish')).includes(payload.state)) { noticeError.textContent = '현재 권한과 공지 상태에서 선택할 수 없는 변경입니다.'; return; }
    if (payload.publishDate && payload.expiresDate && payload.publishDate > payload.expiresDate) { noticeError.textContent = '종료일은 발행일보다 빠를 수 없습니다.'; return; }
    payload.requestId = operationRequestId(noticeForm); const button = noticeForm.querySelector('[type="submit"]'); setPending(button, true);
    try { const response = await portalCall('portalNoticeSave', payload); const committed = committedEntity(response, 'notice', 'noticeId'); notices = upsertRecord(notices, committed, 'noticeId'); renderNotices(); resetNoticeEditor(); void loadNotices(); }
    catch (error) { if (session) noticeError.textContent = errorText(error); }
    finally { setPending(button, false); }
  }

  function money(value) { const amount = Number(value); return Number.isSafeInteger(amount) && amount >= 0 ? `${amount.toLocaleString('ko-KR')}원` : '금액 확인 필요'; }
  function costStatusLabel(value) { return core.COST_STATUS_LABELS[value] || '확인 필요'; }
  function costTaxLabel(value) { return ({ included: '부가세 포함', excluded: '부가세 별도', exempt: '면세' })[value] || '세금 확인 필요'; }
  function renderCosts() {
    costList.textContent = ''; const q = searchable(byId('portalCostSearch').value), filter = byId('portalCostFilter').value;
    const shown = costs.filter((row) => (!filter || row.status === filter) && (!q || searchable(`${row.workOrderId} ${row.description} ${row.category}`).includes(q)));
    shown.forEach((row) => {
      const card = document.createElement('article'); card.className = 'portal-record'; addText(card, 'h3', '', `${row.category || '비용'} · ${money(row.amountKrw)}`); addText(card, 'p', '', row.description || '');
      addText(card, 'p', 'portal-record-meta', `${costStatusLabel(row.status)} · ${costTaxLabel(row.taxMode)}${row.workOrderId ? ` · 작업지시 ${row.workOrderId}` : ''}${row.approvedAt ? ` · 승인 ${String(row.approvedAt).slice(0, 40)}` : ''}`);
      if (can('costs.manage') && row.status === 'draft') { const button = addText(card, 'button', 'portal-button portal-button-secondary', '수정'); button.type = 'button'; button.dataset.costEdit = row.costId || ''; button.setAttribute('aria-label', `${row.description || '비용'} 수정`); }
      if (can('costs.approve')) core.costApprovalTargets(row.status).forEach((state) => { const button = addText(card, 'button', 'portal-button portal-button-secondary', costStatusLabel(state)); button.type = 'button'; button.dataset.costApprove = row.costId || ''; button.dataset.nextState = state; button.setAttribute('aria-label', `${row.description || '비용'} ${costStatusLabel(state)} 처리`); });
      costList.appendChild(card);
    });
    byId('portalCostCount').textContent = `${shown.length}건`; if (!shown.length) addText(costList, 'p', 'portal-record-meta', '조건에 맞는 비용이 없습니다.');
  }
  async function loadCosts() {
    if (!can('costs.view')) return;
    const g = ++loadGeneration.costs, button = byId('portalCostRefresh'); setPending(button, true); statusMessage.textContent = '비용 내역을 불러오는 중입니다.';
    try { const response = await portalCall('portalCostList', {}); if (g !== loadGeneration.costs) return; costs = validList(response, 'costs'); renderCosts(); statusMessage.textContent = '비용 내역을 불러왔습니다.'; }
    catch (error) { if (session && g === loadGeneration.costs) statusMessage.textContent = errorText(error); }
    finally { if (g === loadGeneration.costs) setPending(button, false); }
  }
  function fillCost(row) { resetEditor(costForm, byId('portalCostFormTitle'), '비용 수정'); const f = costForm.elements; ['costId','workOrderId','category','description','amountKrw','taxMode','status'].forEach((key) => { f.namedItem(key).value = row[key] || (key === 'taxMode' ? 'excluded' : key === 'status' ? 'draft' : ''); }); costForm.dataset.revision = Number.isInteger(row.revision) ? String(row.revision) : ''; f.namedItem('description').focus(); }
  function resetCostEditor() { resetEditor(costForm, byId('portalCostFormTitle'), '새 비용'); costForm.elements.namedItem('taxMode').value = 'excluded'; }
  async function saveCost(event) {
    event.preventDefault(); if (!can('costs.manage')) return;
    const f = costForm.elements, payload = { workOrderId: f.namedItem('workOrderId').value.trim().slice(0, 96), category: f.namedItem('category').value.trim().slice(0, 48), description: f.namedItem('description').value.trim().slice(0, 1000), amountKrw: Number(f.namedItem('amountKrw').value), taxMode: f.namedItem('taxMode').value, status: f.namedItem('status').value };
    const id = f.namedItem('costId').value.trim(); if (id) payload.costId = id; revisionFrom(costForm, payload); costError.textContent = '';
    if (!payload.category || !payload.description || !Number.isSafeInteger(payload.amountKrw) || payload.amountKrw < 1 || payload.amountKrw > 1000000000) { costError.textContent = '구분, 설명과 1원 이상의 원 단위 금액을 확인해 주세요.'; return; }
    payload.requestId = operationRequestId(costForm); const button = costForm.querySelector('[type="submit"]'); setPending(button, true);
    try { const response = await portalCall('portalCostSave', payload); const committed = committedEntity(response, 'cost', 'costId'); costs = upsertRecord(costs, committed, 'costId'); renderCosts(); resetCostEditor(); void loadCosts(); }
    catch (error) { if (session) costError.textContent = errorText(error); }
    finally { setPending(button, false); }
  }

  function reportLabel(key) {
    const exact = {
      'counts.statuses': '시설 상태 기록', 'counts.logs': '관리 일지', 'counts.workOrders': '작업지시', 'counts.notices': '공지', 'counts.costs': '비용 항목',
      totalAmountKrw: '비용 등록액(부가세 반영·취소 제외)', pendingAmountKrw: '승인 전 금액(초안+승인 요청)',
      approvedUnpaidAmountKrw: '승인 후 미지급액', paidAmountKrw: '지급 완료액',
    };
    if (exact[key]) return exact[key];
    const [group, state] = key.split('.');
    if (group === 'statusByState') return `시설 상태 · ${statusLabel(state)}`;
    if (group === 'workOrdersByStatus') return `작업지시 · ${workorderStatusLabel(state)}`;
    if (group === 'noticesByState') return `공지 · ${noticeStateLabel(state)}`;
    if (group === 'amountKrwByStatus') return `비용 · ${costStatusLabel(state)}`;
    return key;
  }
  function reportRows(report) {
    const rows = [];
    Object.entries(report || {}).forEach(([key, value]) => {
      if (['startDate', 'endDate'].includes(key)) return;
      if (value && typeof value === 'object' && !Array.isArray(value)) Object.entries(value).forEach(([child, amount]) => { if (typeof amount === 'number') rows.push([`${key}.${child}`, reportLabel(`${key}.${child}`), amount, key === 'amountKrwByStatus']); });
      else if (typeof value === 'number') rows.push([key, reportLabel(key), value, /AmountKrw$/.test(key)]);
    });
    return rows;
  }
  function renderReport(response) {
    const report = response && response.report && typeof response.report === 'object' ? response.report : {}; reportAggregate = report;
    byId('portalReportPeriod').textContent = `${report.startDate || ''} ~ ${report.endDate || ''}`; const cards = byId('portalReportCards'); cards.textContent = '';
    const rows = reportRows(report); rows.forEach(([, label, value, isMoney]) => { const card = document.createElement('article'); card.className = 'portal-kpi'; addText(card, 'span', '', label); addText(card, 'strong', '', isMoney ? money(value) : value); cards.appendChild(card); });
    if (!rows.length) addText(cards, 'p', 'portal-record-meta', '표시할 집계가 없습니다.'); byId('portalReportCsv').disabled = !rows.length;
  }
  async function loadReport() {
    if (!can('reports.view')) return;
    const g = ++loadGeneration.reports, button = byId('portalReportLoad');
    const startDate = byId('portalReportFrom').value, endDate = byId('portalReportTo').value;
    if (!startDate || !endDate || startDate > endDate || (new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) > 365 * 86400000) { reportAggregate = null; byId('portalReportCards').textContent = ''; byId('portalReportCsv').disabled = true; setPending(button, false); byId('portalReportPeriod').textContent = '시작일부터 종료일까지 366일 이내로 선택해 주세요.'; statusMessage.textContent = '운영보고 기간을 확인해 주세요.'; return; }
    reportAggregate = null; byId('portalReportCards').textContent = ''; setPending(button, true); byId('portalReportCsv').disabled = true; statusMessage.textContent = '운영보고를 집계하는 중입니다.';
    try { const response = await portalCall('portalReportSummary', { startDate, endDate }); if (g !== loadGeneration.reports) return; renderReport(response); statusMessage.textContent = '운영보고를 집계했습니다.'; }
    catch (error) { if (session && g === loadGeneration.reports) statusMessage.textContent = errorText(error); }
    finally { if (g === loadGeneration.reports) setPending(button, false); }
  }
  function downloadReport() {
    if (!reportAggregate) return;
    const rows = [['기간', `${reportAggregate.startDate || ''} ~ ${reportAggregate.endDate || ''}`], ['항목', '값'], ...reportRows(reportAggregate).map(([, label, value]) => [label, value])];
    const csv = '\ufeff' + rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a');
    link.href = url; link.download = `관리사무소_운영보고_${reportAggregate.startDate || '기간'}_${reportAggregate.endDate || ''}.csv`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  nav.addEventListener('click', (event) => { const button = event.target.closest('[data-panel]'); if (button) showPanel(button.dataset.panel); });
  byId('portalDashboardRefresh')?.addEventListener('click', loadDashboard);
  byId('portalStatusRefresh')?.addEventListener('click', loadStatuses);
  byId('portalLogsRefresh')?.addEventListener('click', loadLogs);
  byId('portalStatusSearch')?.addEventListener('input', renderStatuses); byId('portalStatusFilter')?.addEventListener('change', renderStatuses);
  byId('portalLogSearch')?.addEventListener('input', renderLogs); byId('portalLogFilter')?.addEventListener('change', renderLogs);
  [statusForm, logForm, workorderForm, noticeForm, costForm].forEach((form) => {
    form?.addEventListener('reset', () => clearOperationRequest(form));
    form?.addEventListener('input', () => clearOperationRequest(form));
    form?.addEventListener('change', () => clearOperationRequest(form));
  });
  statusList?.addEventListener('click', (event) => { const button = event.target.closest('[data-status-edit]'); if (!button || !can('status.manage')) return; const item = statuses.find((row) => String(row.statusId || '') === button.dataset.statusEdit); if (item) fillStatus(item); });
  logList?.addEventListener('click', (event) => { const button = event.target.closest('[data-log-edit]'); if (!button || !can('logs.manage')) return; const item = logs.find((row) => String(row.logId || '') === button.dataset.logEdit); if (item) fillLog(item); });
  byId('portalStatusCancel')?.addEventListener('click', () => resetEditor(statusForm, byId('portalStatusFormTitle'), '새 시설 상태'));
  byId('portalLogCancel')?.addEventListener('click', () => resetEditor(logForm, byId('portalLogFormTitle'), '새 관리 일지'));
  byId('portalWorkorderRefresh')?.addEventListener('click', loadWorkorders); byId('portalWorkorderSearch')?.addEventListener('input', renderWorkorders); byId('portalWorkorderFilter')?.addEventListener('change', renderWorkorders);
  workorderList?.addEventListener('click',(event)=>{const button=event.target.closest('[data-workorder-edit]');const row=workorders.find((item)=>String(item.workOrderId||'')===button?.dataset.workorderEdit);if(row&&can('workorders.manage'))fillWorkorder(row);});
  workorderForm?.addEventListener('submit', saveWorkorder); byId('portalWorkorderCancel')?.addEventListener('click', resetWorkorderEditor);
  byId('portalNoticeRefresh')?.addEventListener('click',loadNotices); byId('portalNoticeSearch')?.addEventListener('input',renderNotices); byId('portalNoticeFilter')?.addEventListener('change',renderNotices);
  noticeList?.addEventListener('click',(event)=>{const button=event.target.closest('[data-notice-edit]');const row=notices.find((item)=>String(item.noticeId||'')===button?.dataset.noticeEdit);if(row&&can('notices.manage'))fillNotice(row);});
  noticeForm?.addEventListener('submit', saveNotice); byId('portalNoticeCancel')?.addEventListener('click', resetNoticeEditor);
  byId('portalCostRefresh')?.addEventListener('click', loadCosts); byId('portalCostSearch')?.addEventListener('input', renderCosts); byId('portalCostFilter')?.addEventListener('change', renderCosts);
  costList?.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-cost-edit]');
    if (edit) { const row = costs.find((item) => String(item.costId || '') === edit.dataset.costEdit); if (row && can('costs.manage')) fillCost(row); return; }
    const button = event.target.closest('[data-cost-approve]'); if (!button || !can('costs.approve')) return;
    const row = costs.find((item) => String(item.costId || '') === button.dataset.costApprove); if (!row || !core.costApprovalTargets(row.status).includes(button.dataset.nextState)) return;
    const targetLabel = costStatusLabel(button.dataset.nextState); if (!window.confirm(`${row.description || '선택한 비용'}을(를) '${targetLabel}' 상태로 변경할까요?`)) return;
    const operationKey = JSON.stringify([String(row.costId || ''), String(button.dataset.nextState || ''), Number(row.revision)]);
    let requestId = costApprovalRequestIds.get(operationKey);
    if (!REQUEST_ID.test(requestId || '')) { requestId = crypto.randomUUID(); costApprovalRequestIds.set(operationKey, requestId); }
    setPending(button, true); costError.textContent = '';
    try { const response = await portalCall('portalCostApprove', { requestId, costId: row.costId, targetState: button.dataset.nextState, revision: row.revision }); const committed = committedEntity(response, 'cost', 'costId'); costs = upsertRecord(costs, committed, 'costId'); renderCosts(); costApprovalRequestIds.delete(operationKey); void loadCosts(); }
    catch (error) { if (session) costError.textContent = errorText(error); }
    finally { setPending(button, false); }
  });
  costForm?.addEventListener('submit', saveCost); byId('portalCostCancel')?.addEventListener('click', resetCostEditor);
  byId('portalReportLoad')?.addEventListener('click',loadReport); byId('portalReportCsv')?.addEventListener('click',downloadReport); byId('portalReportPrint')?.addEventListener('click',()=>window.print());
  [byId('portalReportFrom'), byId('portalReportTo')].forEach((input) => input?.addEventListener('input', () => {
    loadGeneration.reports += 1; reportAggregate = null; byId('portalReportCards').textContent = ''; byId('portalReportCsv').disabled = true;
    byId('portalReportPeriod').textContent = '기간을 선택한 뒤 조회해 주세요.'; setPending(byId('portalReportLoad'), false);
  }));
  statusForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!can('status.manage')) return;
    const payload = statusPayload(); statusError.textContent = '';
    if (!payload.location || !payload.category || !payload.summary) { statusError.textContent = '시설 위치, 분류와 확인 내용을 입력해 주세요.'; return; }
    payload.requestId = operationRequestId(statusForm);
    const button=statusForm.querySelector('[type="submit"]');setPending(button,true);
    try { const response = await portalCall('portalStatusSave', payload); const committed = committedEntity(response, 'status', 'statusId'); statuses = upsertRecord(statuses, committed, 'statusId'); renderStatuses(); clearOperationRequest(statusForm); statusForm.reset(); statusForm.elements.namedItem('visibility').value = 'internal'; statusForm.dataset.revision = ''; byId('portalStatusFormTitle').textContent='새 시설 상태'; void loadStatuses(); }
    catch (error) { if (session) statusError.textContent = errorText(error); }
    finally { setPending(button,false); }
  });
  logForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!can('logs.manage')) return;
    const payload = logPayload(); logError.textContent = '';
    if (!payload.workDate || !payload.title || !payload.content) { logError.textContent = '업무일, 제목과 내용을 입력해 주세요.'; return; }
    payload.requestId = operationRequestId(logForm);
    const button=logForm.querySelector('[type="submit"]');setPending(button,true);
    try { const response = await portalCall('portalLogSave', payload); const committed = committedEntity(response, 'log', 'logId'); logs = upsertRecord(logs, committed, 'logId'); renderLogs(); clearOperationRequest(logForm); logForm.reset(); logForm.elements.namedItem('visibility').value = 'internal'; logForm.dataset.revision = ''; byId('portalLogFormTitle').textContent='새 관리 일지'; void loadLogs(); }
    catch (error) { if (session) logError.textContent = errorText(error); }
    finally { setPending(button,false); }
  });
  byId('portalLogout')?.addEventListener('click', async () => {
    if (logoutStarted) return;
    logoutStarted = true;
    const current = session;
    core.clearSession(sessionStorage); session = null;
    scheduleSessionNotice(NaN);
    hidePrivateUiForLogout();
    await bestEffortServerLogout(current);
    window.location.replace('office-login.html');
  });

  // 세션은 8시간 뒤 만료되고, 만료 뒤 저장은 실패하며 편집 중이던 내용은 화면에서 지워진다.
  // 10분 전에 미리 알려 직원이 작성 중인 일지를 잃지 않게 한다. 저장하지 않고 화면에만 띄운다.
  const SESSION_NOTICE_LEAD_MS = 10 * 60 * 1000;
  let sessionNoticeTimer = null;
  function scheduleSessionNotice(expiresAt) {
    const notice = byId('portalSessionNotice');
    if (sessionNoticeTimer) { window.clearTimeout(sessionNoticeTimer); sessionNoticeTimer = null; }
    if (!notice || !Number.isFinite(expiresAt)) return;
    notice.hidden = true; notice.textContent = '';
    const delay = Math.max(0, expiresAt - Date.now() - SESSION_NOTICE_LEAD_MS);
    sessionNoticeTimer = window.setTimeout(() => {
      if (!session) return;
      notice.textContent = '로그인이 10분 안에 만료됩니다. 작성 중인 내용은 지금 저장해 주세요. 만료 뒤에는 다시 로그인해야 하고 입력 중이던 내용은 남지 않습니다.';
      notice.hidden = false;
    }, Math.min(delay, 2_147_000_000));
  }

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
      scheduleSessionNotice(session.expiresAt);
      const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const today = new Date(), from = new Date(today); from.setDate(from.getDate() - 29); byId('portalReportTo').value = localDate(today); byId('portalReportFrom').value = localDate(from);
      configureWorkorderStatuses(''); configureNoticeStates(''); resetCostEditor();
      const first = [...nav.querySelectorAll('[data-panel]')].find((button) => !button.hidden);
      if (first) showPanel(first.dataset.panel);
      else {
        byId('portalEmpty').hidden = false;
        if (can('admin.users.view') || can('admin.permissions.manage') || can('admin.audit.view')) byId('portalEmptyAdmin').hidden = false;
      }
    } catch (error) { if (session) clearSessionAndDeny(errorText(error)); }
  }
  boot();
})();
