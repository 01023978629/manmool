(() => {
  const SESSION_KEY = 'manmul_office_session_v1';
  const core = window.ManmulOfficeRequest, api = window.ManmulOfficeApi, photo = window.ManmulOfficePhoto;
  const byId = (id) => document.getElementById(id);
  const routeError = byId('officeRouteError'), loginView = byId('officeLoginView'), dashboardView = byId('officeDashboardView'), createView = byId('officeCreateView'), detailView = byId('officeDetailView');
  const routeForm = byId('officeRouteForm'), officeEntry = byId('officeEntry'), officeEntryError = byId('officeEntryError');
  const loginForm = byId('officeLoginForm'), loginSubmit = byId('officeLoginSubmit'), pin = byId('officePin'), complex = byId('officeComplex'), loginError = byId('officeLoginError');
  const officeName = byId('officeName'), requestList = byId('officeRequestList'), syncStatus = byId('officeSyncStatus'), logout = byId('officeLogout'), newRequest = byId('officeNewRequest');
  const refreshRequests = byId('officeRefreshRequests'), recentSummary = byId('officeRecentSummary');
  const recentList = byId('officeRecentList'), recentOverflow = byId('officeRecentOverflow');
  const lastChecked = byId('officeLastChecked');
  const createForm = byId('officeCreateForm'), createTitle = byId('officeCreateTitle'), createError = byId('officeCreateError'), createProgress = byId('officeCreateProgress'), createSubmit = byId('officeCreateSubmit'), retryPhotos = byId('officeRetryPhotos'), createBack = byId('officeCreateBack'), photoField = byId('officePhotoField');
  const detailBack = byId('officeDetailBack'), detailReceipt = byId('officeDetailReceipt'), detailStatus = byId('officeDetailStatus'), detailLocation = byId('officeDetailLocation'), detailNeedsInfoRow = byId('officeDetailNeedsInfoRow'), detailNeedsInfoReason = byId('officeDetailNeedsInfoReason'), detailVisitRow = byId('officeDetailVisitRow'), detailVisit = byId('officeDetailVisit'), detailAmountRow = byId('officeDetailAmountRow'), detailAmount = byId('officeDetailAmount'), detailTimeline = byId('officeStatusTimeline'), completionSummary = byId('officeCompletionSummary'), completionPhotoStatus = byId('officeCompletionPhotoStatus'), completionPhotos = byId('officeCompletionPhotos');
  const year = byId('requestYear'), filters = [...document.querySelectorAll('[data-office-filter]')], views = [routeError, loginView, dashboardView, createView, detailView];
  let session = null, requests = [], activeFilter = 'all', loginPending = false, formPending = false, editingRequest = null, photoGeneration = 0, detailGeneration = 0, detailActivator = null, createActivator = null, sessionGeneration = 0;
  let listSnapshot = null, recentChanges = [], recentTotal = 0, lastSuccessfulRefreshAt = null, refreshPending = false, listGeneration = 0;
  let currentDraft = blankDraft();

  function blankDraft() { return { idempotencyKey: null, createPayload: null, requestId: null, receiptNo: null, photoSlots: [], photoError: '', photoPending: false }; }
  function setView(view) { views.forEach((element) => { if (element) element.hidden = element !== view; }); }
  function safeOffice(value) { const source = value && typeof value === 'object' ? value : {}; const office = { id: String(source.id || '').trim().slice(0, 80), slug: String(source.slug || '').trim().slice(0, 80) }; const complexName = String(source.complexName || '').trim().slice(0, 160); if (complexName) { office.complexName = complexName; return office; } const name = String(source.name || '').trim().slice(0, 160); if (name) office.name = name; return office; }
  function officeLabel(office) { return office && (office.complexName || office.name) || ''; }
  function saveSession(value, expectedSlug) { const saved = { token: String(value && value.sessionToken || '').trim(), office: safeOffice(value && value.office), expiresAt: Number(value && value.expiresAt) }; if (!saved.token || !saved.office.id || !saved.office.slug || saved.office.slug !== expectedSlug || !officeLabel(saved.office) || !Number.isFinite(saved.expiresAt)) return null; sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved)); return saved; }
  function clearCompletionPhotos() { if (!completionPhotos) return; completionPhotos.querySelectorAll('img').forEach((image) => { image.removeAttribute('src'); image.remove(); }); completionPhotos.textContent = ''; }
  function clearDetail() { detailGeneration += 1; [detailReceipt, detailStatus, detailLocation, detailNeedsInfoReason, detailVisit, detailAmount, completionSummary, completionPhotoStatus, detailTimeline].forEach((element) => { if (element) element.textContent = ''; }); if (detailNeedsInfoRow) detailNeedsInfoRow.hidden = true; if (detailVisitRow) detailVisitRow.hidden = true; if (detailAmountRow) detailAmountRow.hidden = true; clearCompletionPhotos(); }
  function clearSession() { sessionGeneration += 1; clearDetail(); clearRecentState(); sessionStorage.removeItem(SESSION_KEY); session = null; }
  function restoreSession(slug) { try { const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); const keys = value && typeof value === 'object' ? Object.keys(value).sort() : []; if (keys.join(',') !== 'expiresAt,office,token' || !value.token || Date.now() >= Number(value.expiresAt)) { clearSession(); return null; } const office = safeOffice(value.office); if (!office.id || !office.slug || office.slug !== slug || !officeLabel(office)) { clearSession(); return null; } return { token: String(value.token), office, expiresAt: Number(value.expiresAt) }; } catch (_) { clearSession(); return null; } }
  function focusPin() { if (pin) pin.focus(); }
  function focusOfficeEntry() { if (officeEntry) officeEntry.focus(); }
  function focusTitle(id) { const title = byId(id); if (!title) return; title.setAttribute('tabindex', '-1'); try { title.focus({ preventScroll: true }); } catch (_) { title.focus(); } }
  function showLogin(message) { if (loginError) loginError.textContent = message || ''; if (requestList) requestList.textContent = ''; if (syncStatus) syncStatus.textContent = ''; setView(loginView); focusPin(); }
  function errorMessage(error) { if (error && error.code === 'rate-limited') return '시도가 많습니다. 10분 후 다시 시도해 주세요.'; if (error instanceof api.ManmulOfficeApiError) return error.message; if (error && ['invalid-session', 'invalid-response', 'stale-session'].includes(error.code || error.message)) return '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.'; return error && typeof error.message === 'string' ? error.message : '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.'; }
  function focusControl(target) { if (!target || typeof target.focus !== 'function') return false; try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); } return true; }
  function mutable(item) { return !Boolean(item && item._officeUiBlocked) && ['pending_review', 'needs_info'].includes(String(item && item.status || '')); }
  function requestId(item) {
    const primary = item && typeof item.requestId === 'string' ? item.requestId.trim() : '';
    const fallback = item && typeof item.id === 'string' ? item.id.trim() : '';
    return primary || fallback;
  }
  function formatCheckedTime(value) {
    return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }
  function refreshFailureMessage(error) {
    const message = errorMessage(error);
    return lastSuccessfulRefreshAt ? `${message} · 마지막 성공 ${formatCheckedTime(lastSuccessfulRefreshAt)}` : message;
  }
  function formatChangedTime(value) {
    return value === null ? '시간 확인 필요' : new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  }
  function displayRecentReceipt(item) {
    const receipt = typeof item.receiptNo === 'string' ? item.receiptNo.trim().slice(0, 100) : '';
    return receipt || '접수번호 확인 필요';
  }
  function displayRecentLocation(item) {
    const parts = [item && item.unit, item && item.location]
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim().slice(0, 140));
    return parts.join(' · ') || '위치 확인 필요';
  }
  function clearRecentState() {
    listGeneration += 1;
    listSnapshot = null; recentChanges = []; recentTotal = 0; lastSuccessfulRefreshAt = null;
    if (recentList) recentList.textContent = '';
    if (recentOverflow) recentOverflow.textContent = '';
    if (recentSummary) recentSummary.textContent = '첫 목록을 기준으로 준비합니다.';
    if (lastChecked) lastChecked.textContent = '';
    setRefreshBusy(false);
  }
  function setRefreshBusy(value) {
    refreshPending = value;
    if (refreshRequests) {
      refreshRequests.disabled = value;
      refreshRequests.setAttribute('aria-busy', String(value));
      refreshRequests.textContent = value ? '목록 확인 중' : '목록 새로고침';
    }
  }
  function photoInput() { return createForm && createForm.elements.namedItem('photos'); }
  function setCreateFieldsLocked(locked) { if (!createForm) return; createForm.querySelectorAll('input, select, textarea').forEach((field) => { field.disabled = locked; }); }
  function setPhotoControl(enabled) { const input = photoInput(); if (photoField) photoField.hidden = !enabled; if (input) { input.disabled = !enabled; input.value = ''; } }
  function resetDraft() { photoGeneration += 1; currentDraft = blankDraft(); }
  function resetCreate() { editingRequest = null; resetDraft(); if (createForm) { createForm.reset(); setCreateFieldsLocked(false); } if (createTitle) createTitle.textContent = '새 접수 등록'; if (createSubmit) { createSubmit.textContent = '접수 저장'; createSubmit.disabled = false; createSubmit.hidden = false; } setPhotoControl(true); setCreateError(''); setProgress(''); }
  function handleSessionExpired(error) { if (!error || error.code !== 'session-expired') return false; clearSession(); requests = []; resetCreate(); error.officeSessionHandled = true; showLogin(errorMessage(error)); return true; }
  function staleSessionError() { return Object.assign(new Error('stale-session'), { code: 'stale-session' }); }
  function isCurrentSession(candidate, generation) { return Boolean(candidate && session === candidate && sessionGeneration === generation); }
  async function authenticatedCall(action, payload) { const candidate = session, generation = sessionGeneration; if (!candidate) throw staleSessionError(); try { const response = await api.call(action, { sessionToken: candidate.token, payload }); if (!isCurrentSession(candidate, generation)) throw staleSessionError(); return response; } catch (error) { if (!isCurrentSession(candidate, generation)) throw staleSessionError(); handleSessionExpired(error); throw error; } }
  function publicPhotoIds(report) { return report && typeof report === 'object' && !Array.isArray(report) && Array.isArray(report.publicPhotoIds) ? report.publicPhotoIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 200) : []; }
  function validPhotoResponse(response, expectedId) {
    const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const maxB64Length = 4 * Math.ceil((2 * 1024 * 1024) / 3);
    const b64 = response && typeof response.dataB64 === 'string' ? response.dataB64 : '';
    return Boolean(response && response.photoId === expectedId && allowedMime.has(response.mimeType) && b64.length > 0 && b64.length <= maxB64Length && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64));
  }
  async function loadPublicPhotos(id, photoIds, generation) {
    if (!completionPhotos || !photoIds.length) return;
    let unavailable = false;
    for (const photoId of photoIds) {
      if (generation !== detailGeneration) return;
      try {
        const response = await authenticatedCall('officePhoto', { requestId: id, photoId });
        if (generation !== detailGeneration) return;
        if (!validPhotoResponse(response, photoId)) { unavailable = true; continue; }
        const image = document.createElement('img');
        image.alt = '완료 사진';
        image.src = `data:${response.mimeType};base64,${response.dataB64}`;
        completionPhotos.appendChild(image);
      } catch (error) {
        if (error.officeSessionHandled || generation !== detailGeneration) return;
        unavailable = true;
      }
    }
    if (unavailable && generation === detailGeneration && completionPhotoStatus) completionPhotoStatus.textContent = '완료 사진을 불러오지 못했습니다.';
  }
  function displayReceipt(item) { const receipt = typeof item.receiptNo === 'string' ? item.receiptNo.trim() : ''; return receipt || '접수번호 확인 불가'; }
  function renderTimeline(status) {
    if (!detailTimeline) return;
    const steps = ['접수됨', '확인 완료', '방문 예정', '작업 중', '작업 완료', '청구 완료', '처리 완료'];
    const indices = { pending_review: 0, accepted: 1, visit_scheduled: 2, in_progress: 3, completed: 4, billed: 5, paid: 6 };
    const branches = new Set(['needs_info', 'on_hold', 'cancelled']);
    const current = Object.prototype.hasOwnProperty.call(indices, status) ? indices[status] : -1;
    steps.forEach((label, index) => {
      const item = document.createElement('li');
      item.textContent = label;
      if (index < current) item.classList.add('is-complete');
      if (index === current) { item.classList.add('is-current'); item.setAttribute('aria-current', 'step'); }
      detailTimeline.appendChild(item);
    });
    if (current >= 0) return;
    const branch = document.createElement('li');
    branch.className = 'office-status-branch is-current';
    branch.textContent = branches.has(status) ? core.statusLabel(status) : '상태 확인 중';
    branch.setAttribute('aria-current', 'step');
    detailTimeline.appendChild(branch);
  }
  function renderDetail(request, generation) {
    if (generation !== detailGeneration) return false;
    const item = request && typeof request === 'object' ? request : {};
    if (detailReceipt) detailReceipt.textContent = displayReceipt(item);
    if (detailStatus) detailStatus.textContent = core.statusLabel(item.status);
    renderTimeline(String(item.status || ''));
    if (detailLocation) detailLocation.textContent = [item.unit, item.location].filter((value) => typeof value === 'string' && value).map((value) => value.slice(0, 140)).join(' · ');
    const needsInfoReason = item.status === 'needs_info' ? core.needsInfoLabel(item.needsInfoReason) : '';
    if (detailNeedsInfoRow) detailNeedsInfoRow.hidden = !needsInfoReason;
    if (detailNeedsInfoReason) detailNeedsInfoReason.textContent = needsInfoReason;
    const visitAt = typeof item.visitAt === 'string' ? item.visitAt.trim() : '';
    if (detailVisitRow) detailVisitRow.hidden = !visitAt;
    if (visitAt && detailVisit) detailVisit.textContent = visitAt;
    const hasPublicAmount = typeof item.publicAmount === 'number' && Number.isFinite(item.publicAmount);
    if (detailAmountRow) detailAmountRow.hidden = !hasPublicAmount;
    if (hasPublicAmount && detailAmount) detailAmount.textContent = `${new Intl.NumberFormat('ko-KR').format(item.publicAmount)}원`;
    const report = item.completionReport && typeof item.completionReport === 'object' && !Array.isArray(item.completionReport) ? item.completionReport : null;
    if (!report) { if (completionSummary) completionSummary.textContent = '완료 보고서가 아직 공개되지 않았습니다.'; return true; }
    if (completionSummary) completionSummary.textContent = typeof report.summary === 'string' ? report.summary.slice(0, 800) : '';
    const photoIds = publicPhotoIds(report);
    if (!photoIds.length) return true;
    loadPublicPhotos(String(item.requestId || ''), photoIds, generation);
    return true;
  }
  async function openDetail(id, activator) {
    clearDetail();
    const generation = detailGeneration;
    if (activator && typeof activator.focus === 'function') detailActivator = activator;
    try {
      const response = await authenticatedCall('officeGet', { requestId: id });
      if (generation !== detailGeneration) return false;
      renderDetail(response && response.request, generation);
      setView(detailView);
      const title = byId('officeDetailTitle');
      if (title) title.focus();
      return true;
    } catch (error) {
      if (!error.officeSessionHandled && syncStatus) syncStatus.textContent = errorMessage(error);
      return false;
    }
  }
  function matchesFilter(item) { const status = String(item && item.status || ''); if (activeFilter === 'pending') return ['pending_review', 'needs_info', 'on_hold'].includes(status); if (activeFilter === 'progress') return ['accepted', 'visit_scheduled', 'in_progress'].includes(status); if (activeFilter === 'completed') return ['completed', 'billed', 'paid', 'cancelled'].includes(status); return true; }
  function addText(parent, className, value) { const element = document.createElement('p'); element.className = className; element.textContent = String(value || ''); parent.appendChild(element); }
  function actionButton(label, attribute, id) { const button = document.createElement('button'); button.type = 'button'; button.className = 'office-action request-secondary'; button.textContent = label; button.setAttribute(attribute, id); return button; }
  function renderRecentChanges(displayRows) {
    if (!recentList || !recentSummary || !recentOverflow) return;
    recentList.textContent = '';
    const byRequestId = new Map(displayRows.map((item) => [requestId(item), item]));
    recentChanges.forEach((change) => {
      const item = byRequestId.get(change.requestId);
      if (!item) return;
      const li = document.createElement('li');
      li.className = 'office-recent-item';
      const button = actionButton(displayRecentReceipt(item), 'data-office-recent-detail', change.requestId);
      li.appendChild(button);
      addText(li, 'office-recent-meta', displayRecentLocation(item));
      addText(li, 'office-recent-meta', `${core.recentChangeLabel(change)} · ${formatChangedTime(change.updatedAtMs)}`);
      recentList.appendChild(li);
    });
    recentSummary.textContent = recentTotal ? `최근 변경 ${recentTotal}건` : '이번 새로고침에서 확인된 변경이 없습니다.';
    recentOverflow.textContent = recentTotal > recentChanges.length ? `외 ${recentTotal - recentChanges.length}건의 변경이 있습니다.` : '';
    lastChecked.textContent = lastSuccessfulRefreshAt ? `마지막 확인 ${formatCheckedTime(lastSuccessfulRefreshAt)}` : '';
  }
  function renderRequests() { if (!requestList) return; requestList.textContent = ''; const visible = requests.filter(matchesFilter); if (!visible.length) { addText(requestList, 'office-empty', '표시할 접수가 없습니다.'); return; } visible.forEach((item) => { const card = document.createElement('article'); card.className = 'office-request-card'; const title = document.createElement('h2'); title.textContent = displayReceipt(item).slice(0, 100); card.appendChild(title); addText(card, 'office-request-unit', `${String(item.unit || '').slice(0, 100)} · ${String(item.location || '').slice(0, 140)}`); addText(card, 'office-request-meta', `${core.statusLabel(item.status)} · ${String(item.issueType || '').slice(0, 30)}`); const actions = document.createElement('div'); actions.className = 'office-card-actions'; const id = requestId(item); actions.appendChild(actionButton('상세 보기', 'data-office-detail', id)); if (mutable(item)) { actions.appendChild(actionButton('수정', 'data-office-edit', id)); actions.appendChild(actionButton('취소', 'data-office-cancel', id)); } card.appendChild(actions); requestList.appendChild(card); }); }
  function setFilter(next) { activeFilter = next; filters.forEach((button) => { const selected = button.dataset.officeFilter === next; button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); }); renderRequests(); }
  function replaceRequest(next) { const id = requestId(next), index = requests.findIndex((item) => requestId(item) === id); if (index >= 0) requests[index] = next; else requests.unshift(next); renderRequests(); }
  function blockLocalRequest(id) { const index = requests.findIndex((item) => requestId(item) === id); if (index >= 0) requests[index] = { ...requests[index], _officeUiBlocked: true }; renderRequests(); }
  function focusRequestAction(id) { const target = requestList && [...requestList.querySelectorAll('button')].find((button) => button.dataset.officeEdit === id) || requestList && [...requestList.querySelectorAll('button')].find((button) => button.dataset.officeDetail === id); if (!focusControl(target)) focusTitle('officeDashboardTitle'); }
  async function loadDashboard({ focus = false, manual = false } = {}) {
    const candidate = session, generation = sessionGeneration;
    if (!candidate || refreshPending) return;
    const listAttempt = ++listGeneration;
    if (officeName) officeName.textContent = officeLabel(candidate.office);
    setView(dashboardView);
    if (focus) focusTitle('officeDashboardTitle');
    setRefreshBusy(true);
    if (syncStatus) syncStatus.textContent = manual ? '접수 목록을 새로고침하는 중입니다.' : '접수 목록을 불러오는 중입니다.';
    try {
      const response = await authenticatedCall('officeList', {});
      if (!isCurrentSession(candidate, generation) || listAttempt !== listGeneration) return;
      const validationNow = Date.now();
      const normalized = core.normalizeRecentList(response.requests, validationNow);
      if (!normalized.ok) throw new api.ManmulOfficeApiError('invalid-response');
      const compared = listSnapshot === null ? { total: 0, changes: [] } : core.diffRecentSnapshots(listSnapshot, normalized.snapshot);
      requests = response.requests.filter((item) => item && typeof item === 'object' && !Array.isArray(item) && requestId(item));
      recentChanges = compared.changes;
      recentTotal = compared.total;
      listSnapshot = normalized.snapshot;
      lastSuccessfulRefreshAt = validationNow;
      renderRequests();
      renderRecentChanges(normalized.rows);
      if (recentSummary && compared.total === 0 && !manual) recentSummary.textContent = '다음 새로고침부터 변경을 확인합니다.';
      if (syncStatus) syncStatus.textContent = manual ? '접수 목록을 새로고침했습니다.' : '접수 목록을 최신 상태로 불러왔습니다.';
    } catch (error) {
      if (error.code === 'stale-session' || error.officeSessionHandled) return;
      if (!isCurrentSession(candidate, generation) || listAttempt !== listGeneration) return;
      if (listSnapshot === null) {
        requests = [];
        renderRequests();
      }
      if (syncStatus) syncStatus.textContent = refreshFailureMessage(error);
    } finally {
      if (isCurrentSession(candidate, generation) && listAttempt === listGeneration) {
        setRefreshBusy(false);
      }
    }
  }
  async function submitLogin(event, slug) { event.preventDefault(); if (loginPending) return; const validation = core.validateLogin({ pin: pin && pin.value }); if (!validation.ok) { if (loginError) loginError.textContent = validation.message; focusPin(); return; } if (loginError) loginError.textContent = ''; loginPending = true; if (loginSubmit) loginSubmit.disabled = true; try { const response = await api.call('officeLogin', { payload: { slug, pin: pin.value } }); const saved = saveSession(response, slug); pin.value = ''; if (!saved) { clearSession(); throw new Error('invalid-session'); } clearRecentState(); session = saved; await loadDashboard({ focus: true }); } catch (error) { if (pin) pin.value = ''; if (loginError) loginError.textContent = errorMessage(error); focusPin(); } finally { loginPending = false; if (loginSubmit) loginSubmit.disabled = false; } }
  function dataFromForm(form) { const source = form && typeof form.elements === 'object' ? form : createForm; const get = (name) => source.elements.namedItem(name); return { unit: get('unit').value, location: get('location').value, issueType: get('issueType').value, pipeType: get('pipeType').value, urgency: get('urgency').value, description: get('description').value, officeContactName: get('officeContactName').value, officeContactPhone: get('officeContactPhone').value, residentName: get('residentName').value, residentPhone: get('residentPhone').value, preferredVisitDate: get('preferredVisitDate').value, privacyConsent: get('privacyConsent').checked }; }
  function focusField(field) { const name = field === 'residentContact' ? 'residentName' : field; const input = createForm && createForm.elements.namedItem(name); if (input && typeof input.focus === 'function') input.focus(); }
  function setCreateError(message) { if (createError) createError.textContent = message || ''; }
  function setProgress(message) { if (createProgress) createProgress.textContent = message || ''; if (retryPhotos) retryPhotos.hidden = message !== '접수 저장됨 · 사진 전송 필요'; }
  function lockCreatedRequest() { if (createSubmit) { createSubmit.disabled = true; createSubmit.hidden = true; } }
  function immutableCreatePayload(payload) { return Object.freeze({ ...payload, officeContact: Object.freeze({ ...payload.officeContact }), residentContact: payload.residentContact ? Object.freeze({ ...payload.residentContact }) : null, expectedUploadIds: Object.freeze([...payload.expectedUploadIds]) }); }
  function createFailureIsUncertain(error) { return Boolean(error && (error.retryable === true || ['timeout', 'network-error', 'http-error', 'invalid-response', 'server-error'].includes(error.code))); }
  function releaseFrozenCreate(draft) { if (currentDraft !== draft || draft.requestId) return; draft.createPayload = null; draft.idempotencyKey = null; setCreateFieldsLocked(false); setPhotoControl(true); }
  function photosComplete() { return currentDraft.photoSlots.every((slot) => slot.state === 'sent'); }
  async function addPhotos(files) {
    if (editingRequest || currentDraft.requestId || !files.length) return;
    if (currentDraft.createPayload) { setCreateError('접수 결과 확인 중에는 사진을 변경할 수 없습니다.'); return; }
    const generation = ++photoGeneration;
    currentDraft.photoSlots = []; currentDraft.photoError = ''; currentDraft.photoPending = false;
    if (files.length > 5) { currentDraft.photoError = '사진은 최대 5장까지 올릴 수 있습니다.'; setCreateError(currentDraft.photoError); return; }
    currentDraft.photoPending = true; setCreateError(''); setProgress('사진을 준비하는 중입니다.');
    try {
      const compressed = await Promise.all([...files].map((file) => photo.compressOfficePhoto(file)));
      if (generation !== photoGeneration || editingRequest || currentDraft.requestId) return;
      currentDraft.photoSlots = compressed.map((value) => ({ uploadId: crypto.randomUUID(), compressed: value, state: 'pending' }));
      setProgress('사진 준비 완료');
    } catch (error) {
      if (generation !== photoGeneration) return;
      currentDraft.photoError = errorMessage(error); setCreateError(currentDraft.photoError); setProgress('');
    } finally { if (generation === photoGeneration) currentDraft.photoPending = false; }
  }
  async function uploadSlots(states) { for (const slot of currentDraft.photoSlots) { if (!states.includes(slot.state)) continue; try { await authenticatedCall('officeUpload', { requestId: currentDraft.requestId, uploadId: slot.uploadId, mimeType: slot.compressed.mimeType, dataB64: slot.compressed.dataB64 }); slot.state = 'sent'; slot.compressed = null; } catch (error) { if (error.officeSessionHandled || error.code === 'session-expired') throw error; slot.state = 'failed'; } } }
  async function finishUploads(states) { if (!currentDraft.photoSlots.some((slot) => states.includes(slot.state))) { const complete = photosComplete(); setProgress(complete ? `접수 완료 · ${currentDraft.receiptNo}` : '접수 저장됨 · 사진 전송 필요'); return complete; } setProgress('접수 저장됨 · 사진 전송 중'); await uploadSlots(states); const complete = photosComplete(); setProgress(complete ? `접수 완료 · ${currentDraft.receiptNo}` : '접수 저장됨 · 사진 전송 필요'); return complete; }
  async function retryOfficePhotos() { if (!currentDraft.requestId || !session) return false; return finishUploads(['failed']); }
  function validCreateResponse(result) { return Boolean(result && typeof result === 'object' && typeof result.requestId === 'string' && result.requestId.trim().length > 0 && result.requestId.length <= 120 && typeof result.receiptNo === 'string' && result.receiptNo.trim().length > 0 && result.receiptNo.length <= 120 && result.status === 'pending_review' && typeof result.createdAt === 'string' && result.createdAt.length <= 80 && Number.isFinite(Date.parse(result.createdAt))); }
  async function submitCreate(data) { const draft = currentDraft; if (draft.requestId) throw new Error('already-created'); if (!draft.idempotencyKey) draft.idempotencyKey = crypto.randomUUID(); if (!draft.createPayload) { const expectedUploadIds = draft.photoSlots.map((slot) => slot.uploadId); draft.createPayload = immutableCreatePayload(core.buildCreatePayload(data, draft.idempotencyKey, expectedUploadIds)); setCreateFieldsLocked(true); setPhotoControl(false); } try { const result = await authenticatedCall('officeCreate', draft.createPayload); if (!validCreateResponse(result)) throw Object.assign(new Error('invalid-response'), { code: 'invalid-response' }); draft.requestId = result.requestId; draft.receiptNo = result.receiptNo; draft.idempotencyKey = null; lockCreatedRequest(); const complete = await finishUploads(['pending']); return { request: result, photosComplete: complete }; } catch (error) { if (!createFailureIsUncertain(error)) releaseFrozenCreate(draft); throw error; } }
  async function submitOfficeRequest(form) { if (currentDraft.createPayload) return submitCreate(null); const data = dataFromForm(form); const validation = core.validateRequest(data); if (!validation.ok) { setCreateError(validation.message); focusField(validation.field); throw Object.assign(new Error('invalid-input'), { code: 'invalid-input' }); } if (currentDraft.photoPending) throw Object.assign(new Error('photo-pending'), { code: 'photo-pending' }); if (currentDraft.photoError) throw Object.assign(new Error(currentDraft.photoError), { code: 'invalid-file' }); return submitCreate(data); }
  function populateCreate(item) { const set = (name, value) => { const input = createForm.elements.namedItem(name); if (input) input.value = value || ''; }; set('unit', item.unit); set('location', item.location); set('issueType', item.issueType); set('pipeType', item.pipeType || '미확정'); set('urgency', item.urgency || 'normal'); set('description', item.description); set('officeContactName', item.officeContact && item.officeContact.name); set('officeContactPhone', item.officeContact && item.officeContact.phone); set('residentName', item.residentContact && item.residentContact.name); set('residentPhone', item.residentContact && item.residentContact.phone); set('preferredVisitDate', item.preferredVisitDate); createForm.elements.namedItem('privacyConsent').checked = true; }
  async function refreshInvalidStatus(id) { try { const fresh = await authenticatedCall('officeGet', { requestId: id }); replaceRequest(fresh.request); editingRequest = null; setView(dashboardView); if (syncStatus) syncStatus.textContent = '대표 확인 후에는 전화로 변경해 주세요'; focusRequestAction(id); return false; } catch (error) { if (error.officeSessionHandled) return false; blockLocalRequest(id); editingRequest = null; setView(dashboardView); if (syncStatus) syncStatus.textContent = '현재 상태를 새로고침하지 못했습니다. 대표 확인 후에는 전화로 변경해 주세요'; focusRequestAction(id); return false; } }
  async function editOfficeRequest(id, activator) { const item = requests.find((entry) => requestId(entry) === id); if (!mutable(item)) { if (syncStatus) syncStatus.textContent = '대표 확인 후에는 전화로 변경해 주세요'; return false; } if (activator && typeof activator.focus === 'function') createActivator = activator; editingRequest = item; resetDraft(); populateCreate(item); createTitle.textContent = '접수 수정'; createSubmit.textContent = '수정 저장'; createSubmit.disabled = false; createSubmit.hidden = false; setPhotoControl(false); setCreateError(''); setProgress(''); setView(createView); focusTitle('officeCreateTitle'); return true; }
  async function updateOfficeRequest(data) { if (!editingRequest || !mutable(editingRequest)) return refreshInvalidStatus(requestId(editingRequest)); const payload = core.buildCreatePayload(data, 'update'); delete payload.idempotencyKey; delete payload.expectedUploadIds; payload.requestId = requestId(editingRequest); try { await authenticatedCall('officeUpdate', payload); const fresh = await authenticatedCall('officeGet', { requestId: payload.requestId }); replaceRequest(fresh.request); editingRequest = null; setView(dashboardView); if (syncStatus) syncStatus.textContent = '수정 내용을 저장했습니다.'; focusRequestAction(payload.requestId); return { request: fresh.request, photosComplete: true }; } catch (error) { if (error.officeSessionHandled) throw error; if (error.code === 'invalid-status') return refreshInvalidStatus(payload.requestId); throw error; } }
  async function cancelOfficeRequest(id) { const item = requests.find((entry) => requestId(entry) === id); if (!mutable(item)) { if (syncStatus) syncStatus.textContent = '대표 확인 후에는 전화로 변경해 주세요'; return false; } if (!window.confirm('이 접수를 취소할까요?')) return false; try { await authenticatedCall('officeCancel', { requestId: id }); const fresh = await authenticatedCall('officeGet', { requestId: id }); replaceRequest(fresh.request); if (syncStatus) syncStatus.textContent = '접수를 취소했습니다.'; focusRequestAction(id); return true; } catch (error) { if (error.officeSessionHandled) throw error; if (error.code === 'invalid-status') return refreshInvalidStatus(id); throw error; } }
  function submitOfficeEntry(event) {
    event.preventDefault();
    const slug = core.parseOfficeEntry(officeEntry && officeEntry.value, window.location.href);
    if (!slug) {
      if (officeEntryError) officeEntryError.textContent = '관리사무소 코드 또는 전용 주소를 확인해 주세요.';
      focusOfficeEntry();
      return;
    }
    if (officeEntryError) officeEntryError.textContent = '';
    const target = new URL(window.location.href);
    target.search = '';
    target.hash = '';
    target.searchParams.set('office', slug);
    window.location.assign(target.href);
  }
  async function submitRequest(event) { event.preventDefault(); if (formPending || currentDraft.requestId) return; formPending = true; createSubmit.disabled = true; setCreateError(''); try { if (editingRequest) await updateOfficeRequest(dataFromForm(createForm)); else await submitOfficeRequest(createForm); } catch (error) { if (error.officeSessionHandled) return; if (error.code === 'photo-pending') setCreateError('사진을 준비하는 중입니다.'); else if (!error.code || error.code !== 'invalid-input') setCreateError(errorMessage(error)); } finally { formPending = false; if (!currentDraft.requestId && createSubmit) createSubmit.disabled = false; } }

  if (year) year.textContent = new Date().getFullYear();
  if (!core || !api || !photo || !routeError || !routeForm || !officeEntry || !loginView || !dashboardView || !loginForm || !pin || !loginSubmit || !createForm) return;
  const slug = core.parseOfficeSlug(window.location.search);
  if (!slug) {
    setView(routeError);
    routeForm.addEventListener('submit', submitOfficeEntry);
    officeEntry.addEventListener('input', () => { if (officeEntryError) officeEntryError.textContent = ''; });
    if (new URLSearchParams(window.location.search).has('office') && officeEntryError) officeEntryError.textContent = '전용 주소의 관리사무소 코드 형식을 확인해 주세요.';
    focusOfficeEntry();
    return;
  }
  if (complex) complex.value = slug;
  loginForm.addEventListener('submit', (event) => { submitLogin(event, slug); });
  if (logout) logout.addEventListener('click', () => { clearSession(); requests = []; resetCreate(); showLogin(''); });
  if (newRequest) newRequest.addEventListener('click', () => { createActivator = newRequest; resetCreate(); setView(createView); focusTitle('officeCreateTitle'); });
  if (createBack) createBack.addEventListener('click', () => { if (currentDraft.createPayload && !currentDraft.requestId && !window.confirm('접수 결과를 아직 확인하지 못했습니다. 이 초안을 닫고 새로 시작할까요?')) return; const activator = createActivator; resetCreate(); setView(dashboardView); if (!focusControl(activator && activator.isConnected ? activator : null)) focusTitle('officeDashboardTitle'); });
  createForm.addEventListener('submit', submitRequest);
  photoInput().addEventListener('change', (event) => { const files = [...(event.target.files || [])]; event.target.value = ''; addPhotos(files); });
  if (retryPhotos) retryPhotos.addEventListener('click', () => { retryOfficePhotos().catch((error) => { if (!error.officeSessionHandled) setCreateError(errorMessage(error)); }); });
  if (detailBack) detailBack.addEventListener('click', () => { const activator = detailActivator; clearDetail(); setView(dashboardView); if (!focusControl(activator && activator.isConnected ? activator : null)) focusTitle('officeDashboardTitle'); });
  if (requestList) requestList.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.officeDetail) openDetail(button.dataset.officeDetail, button); if (button.dataset.officeEdit) editOfficeRequest(button.dataset.officeEdit, button); if (button.dataset.officeCancel) cancelOfficeRequest(button.dataset.officeCancel).catch((error) => { if (!error.officeSessionHandled && error.code !== 'stale-session' && syncStatus) syncStatus.textContent = errorMessage(error); }); });
  if (refreshRequests) refreshRequests.addEventListener('click', () => { loadDashboard({ manual: true }); });
  if (recentList) recentList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-office-recent-detail]');
    if (!button) return;
    const item = requests.find((entry) => requestId(entry) === button.dataset.officeRecentDetail);
    if (!item) { if (syncStatus) syncStatus.textContent = '현재 목록에서 접수를 찾을 수 없습니다. 목록을 새로고침해 주세요.'; return; }
    openDetail(button.dataset.officeRecentDetail, button);
  });
  filters.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.officeFilter || 'all')));
  window.submitOfficeRequest = submitOfficeRequest; window.retryOfficePhotos = retryOfficePhotos; window.editOfficeRequest = editOfficeRequest; window.cancelOfficeRequest = cancelOfficeRequest; window.openOfficeDetail = openDetail;
  session = restoreSession(slug);
  if (session) loadDashboard(); else showLogin('');
})();
