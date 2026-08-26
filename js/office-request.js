(() => {
  const SESSION_KEY = 'manmul_office_session_v1';
  const core = window.ManmulOfficeRequest, api = window.ManmulOfficeApi, photo = window.ManmulOfficePhoto;
  const byId = (id) => document.getElementById(id);
  const routeError = byId('officeRouteError'), loginView = byId('officeLoginView'), dashboardView = byId('officeDashboardView'), createView = byId('officeCreateView'), detailView = byId('officeDetailView');
  const loginForm = byId('officeLoginForm'), loginSubmit = byId('officeLoginSubmit'), pin = byId('officePin'), complex = byId('officeComplex'), loginError = byId('officeLoginError');
  const officeName = byId('officeName'), requestList = byId('officeRequestList'), syncStatus = byId('officeSyncStatus'), logout = byId('officeLogout'), newRequest = byId('officeNewRequest');
  const createForm = byId('officeCreateForm'), createTitle = byId('officeCreateTitle'), createError = byId('officeCreateError'), createProgress = byId('officeCreateProgress'), createSubmit = byId('officeCreateSubmit'), retryPhotos = byId('officeRetryPhotos'), createBack = byId('officeCreateBack'), photoField = byId('officePhotoField');
  const detailBack = byId('officeDetailBack'), detailReceipt = byId('officeDetailReceipt'), detailStatus = byId('officeDetailStatus'), detailLocation = byId('officeDetailLocation'), detailVisitRow = byId('officeDetailVisitRow'), detailVisit = byId('officeDetailVisit'), detailAmountRow = byId('officeDetailAmountRow'), detailAmount = byId('officeDetailAmount'), completionSummary = byId('officeCompletionSummary'), completionPhotoStatus = byId('officeCompletionPhotoStatus'), completionPhotos = byId('officeCompletionPhotos');
  const year = byId('requestYear'), filters = [...document.querySelectorAll('[data-office-filter]')], views = [routeError, loginView, dashboardView, createView, detailView];
  let session = null, requests = [], activeFilter = 'all', loginPending = false, formPending = false, editingRequest = null, photoGeneration = 0, detailGeneration = 0;
  let currentDraft = blankDraft();

  function blankDraft() { return { idempotencyKey: null, requestId: null, receiptNo: null, photoSlots: [], photoError: '', photoPending: false }; }
  function setView(view) { views.forEach((element) => { if (element) element.hidden = element !== view; }); }
  function safeOffice(value) { const source = value && typeof value === 'object' ? value : {}; const office = { id: String(source.id || '').trim().slice(0, 80), slug: String(source.slug || '').trim().slice(0, 80) }; const complexName = String(source.complexName || '').trim().slice(0, 160); if (complexName) { office.complexName = complexName; return office; } const name = String(source.name || '').trim().slice(0, 160); if (name) office.name = name; return office; }
  function officeLabel(office) { return office && (office.complexName || office.name) || ''; }
  function saveSession(value) { const saved = { token: String(value && value.sessionToken || '').trim(), office: safeOffice(value && value.office), expiresAt: Number(value && value.expiresAt) }; if (!saved.token || !saved.office.id || !saved.office.slug || !officeLabel(saved.office) || !Number.isFinite(saved.expiresAt)) return null; sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved)); return saved; }
  function clearCompletionPhotos() { if (!completionPhotos) return; completionPhotos.querySelectorAll('img').forEach((image) => { image.removeAttribute('src'); image.remove(); }); completionPhotos.textContent = ''; }
  function clearDetail() { detailGeneration += 1; [detailReceipt, detailStatus, detailLocation, detailVisit, detailAmount, completionSummary, completionPhotoStatus].forEach((element) => { if (element) element.textContent = ''; }); if (detailVisitRow) detailVisitRow.hidden = true; if (detailAmountRow) detailAmountRow.hidden = true; clearCompletionPhotos(); }
  function clearSession() { clearDetail(); sessionStorage.removeItem(SESSION_KEY); session = null; }
  function restoreSession(slug) { try { const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); const keys = value && typeof value === 'object' ? Object.keys(value).sort() : []; if (keys.join(',') !== 'expiresAt,office,token' || !value.token || Date.now() >= Number(value.expiresAt)) { clearSession(); return null; } const office = safeOffice(value.office); if (!office.id || !office.slug || office.slug !== slug || !officeLabel(office)) { clearSession(); return null; } return { token: String(value.token), office, expiresAt: Number(value.expiresAt) }; } catch (_) { clearSession(); return null; } }
  function focusPin() { if (pin) pin.focus(); }
  function showLogin(message) { if (loginError) loginError.textContent = message || ''; if (requestList) requestList.textContent = ''; if (syncStatus) syncStatus.textContent = ''; setView(loginView); focusPin(); }
  function errorMessage(error) { if (error && error.code === 'rate-limited') return '시도가 많습니다. 10분 후 다시 시도해 주세요.'; return error && typeof error.message === 'string' ? error.message : '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.'; }
  function mutable(item) { return !Boolean(item && item._officeUiBlocked) && ['pending_review', 'needs_info'].includes(String(item && item.status || '')); }
  function requestId(item) { return String(item && (item.requestId || item.id) || ''); }
  function photoInput() { return createForm && createForm.elements.namedItem('photos'); }
  function setPhotoControl(enabled) { const input = photoInput(); if (photoField) photoField.hidden = !enabled; if (input) { input.disabled = !enabled; input.value = ''; } }
  function resetDraft() { photoGeneration += 1; currentDraft = blankDraft(); }
  function resetCreate() { editingRequest = null; resetDraft(); if (createForm) createForm.reset(); if (createTitle) createTitle.textContent = '새 접수 등록'; if (createSubmit) { createSubmit.textContent = '접수 저장'; createSubmit.disabled = false; createSubmit.hidden = false; } setPhotoControl(true); setCreateError(''); setProgress(''); }
  function handleSessionExpired(error) { if (!error || error.code !== 'session-expired') return false; clearSession(); requests = []; resetCreate(); error.officeSessionHandled = true; showLogin(errorMessage(error)); return true; }
  async function authenticatedCall(action, payload) { try { return await api.call(action, { sessionToken: session && session.token, payload }); } catch (error) { handleSessionExpired(error); throw error; } }
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
  function renderDetail(request) {
    clearDetail();
    const item = request && typeof request === 'object' ? request : {};
    if (detailReceipt) detailReceipt.textContent = String(item.receiptNo || item.requestId || '');
    if (detailStatus) detailStatus.textContent = core.statusLabel(item.status);
    if (detailLocation) detailLocation.textContent = [item.unit, item.location].filter((value) => typeof value === 'string' && value).map((value) => value.slice(0, 140)).join(' · ');
    const visitAt = typeof item.visitAt === 'string' ? item.visitAt.trim() : '';
    if (detailVisitRow) detailVisitRow.hidden = !visitAt;
    if (visitAt && detailVisit) detailVisit.textContent = visitAt;
    const hasPublicAmount = typeof item.publicAmount === 'number' && Number.isFinite(item.publicAmount);
    if (detailAmountRow) detailAmountRow.hidden = !hasPublicAmount;
    if (hasPublicAmount && detailAmount) detailAmount.textContent = `${new Intl.NumberFormat('ko-KR').format(item.publicAmount)}원`;
    const report = item.completionReport && typeof item.completionReport === 'object' && !Array.isArray(item.completionReport) ? item.completionReport : null;
    if (!report) { if (completionSummary) completionSummary.textContent = '완료 보고서가 아직 공개되지 않았습니다.'; return; }
    if (completionSummary) completionSummary.textContent = typeof report.summary === 'string' ? report.summary.slice(0, 800) : '';
    const photoIds = publicPhotoIds(report);
    if (!photoIds.length) return;
    loadPublicPhotos(String(item.requestId || ''), photoIds, detailGeneration);
  }
  async function openDetail(id) {
    clearDetail();
    try {
      const response = await authenticatedCall('officeGet', { requestId: id });
      renderDetail(response && response.request);
      setView(detailView);
      return true;
    } catch (error) {
      if (!error.officeSessionHandled && syncStatus) syncStatus.textContent = errorMessage(error);
      return false;
    }
  }
  function matchesFilter(item) { const status = String(item && item.status || ''); if (activeFilter === 'pending') return ['pending_review', 'needs_info', 'on_hold'].includes(status); if (activeFilter === 'progress') return ['accepted', 'visit_scheduled', 'in_progress'].includes(status); if (activeFilter === 'completed') return ['completed', 'billed', 'paid', 'cancelled'].includes(status); return true; }
  function addText(parent, className, value) { const element = document.createElement('p'); element.className = className; element.textContent = String(value || ''); parent.appendChild(element); }
  function actionButton(label, attribute, id) { const button = document.createElement('button'); button.type = 'button'; button.className = 'office-action request-secondary'; button.textContent = label; button.setAttribute(attribute, id); return button; }
  function renderRequests() { if (!requestList) return; requestList.textContent = ''; const visible = requests.filter(matchesFilter); if (!visible.length) { addText(requestList, 'office-empty', '표시할 접수가 없습니다.'); return; } visible.forEach((item) => { const card = document.createElement('article'); card.className = 'office-request-card'; const title = document.createElement('h2'); title.textContent = String(item.receiptNo || requestId(item) || '접수').slice(0, 100); card.appendChild(title); addText(card, 'office-request-unit', `${String(item.unit || '').slice(0, 100)} · ${String(item.location || '').slice(0, 140)}`); addText(card, 'office-request-meta', `${core.statusLabel(item.status)} · ${String(item.issueType || '').slice(0, 30)}`); const actions = document.createElement('div'); actions.className = 'office-card-actions'; const id = requestId(item); actions.appendChild(actionButton('상세 보기', 'data-office-detail', id)); if (mutable(item)) { actions.appendChild(actionButton('수정', 'data-office-edit', id)); actions.appendChild(actionButton('취소', 'data-office-cancel', id)); } card.appendChild(actions); requestList.appendChild(card); }); }
  function setFilter(next) { activeFilter = next; filters.forEach((button) => { const selected = button.dataset.officeFilter === next; button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); }); renderRequests(); }
  function replaceRequest(next) { const id = requestId(next), index = requests.findIndex((item) => requestId(item) === id); if (index >= 0) requests[index] = next; else requests.unshift(next); renderRequests(); }
  function blockLocalRequest(id) { const index = requests.findIndex((item) => requestId(item) === id); if (index >= 0) requests[index] = { ...requests[index], _officeUiBlocked: true }; renderRequests(); }
  async function loadDashboard() { if (!session) return; if (officeName) officeName.textContent = officeLabel(session.office); setView(dashboardView); if (syncStatus) syncStatus.textContent = '접수 목록을 불러오는 중입니다.'; try { const response = await authenticatedCall('officeList', {}); requests = Array.isArray(response.requests) ? response.requests : []; renderRequests(); if (syncStatus) syncStatus.textContent = '접수 목록을 최신 상태로 불러왔습니다.'; } catch (error) { if (error.officeSessionHandled) return; if (requestList) requestList.textContent = ''; if (syncStatus) syncStatus.textContent = errorMessage(error); } }
  async function submitLogin(event, slug) { event.preventDefault(); if (loginPending) return; const validation = core.validateLogin({ pin: pin && pin.value }); if (!validation.ok) { if (loginError) loginError.textContent = validation.message; focusPin(); return; } if (loginError) loginError.textContent = ''; loginPending = true; if (loginSubmit) loginSubmit.disabled = true; try { const response = await api.call('officeLogin', { payload: { slug, pin: pin.value } }); const saved = saveSession(response); pin.value = ''; if (!saved) throw new Error('invalid-session'); session = saved; await loadDashboard(); } catch (error) { if (pin) pin.value = ''; if (loginError) loginError.textContent = errorMessage(error); focusPin(); } finally { loginPending = false; if (loginSubmit) loginSubmit.disabled = false; } }
  function dataFromForm(form) { const source = form && typeof form.elements === 'object' ? form : createForm; const get = (name) => source.elements.namedItem(name); return { unit: get('unit').value, location: get('location').value, issueType: get('issueType').value, pipeType: get('pipeType').value, urgency: get('urgency').value, description: get('description').value, officeContactName: get('officeContactName').value, officeContactPhone: get('officeContactPhone').value, residentName: get('residentName').value, residentPhone: get('residentPhone').value, preferredVisitDate: get('preferredVisitDate').value, privacyConsent: get('privacyConsent').checked }; }
  function focusField(field) { const name = field === 'residentContact' ? 'residentName' : field; const input = createForm && createForm.elements.namedItem(name); if (input && typeof input.focus === 'function') input.focus(); }
  function setCreateError(message) { if (createError) createError.textContent = message || ''; }
  function setProgress(message) { if (createProgress) createProgress.textContent = message || ''; if (retryPhotos) retryPhotos.hidden = message !== '접수 저장됨 · 사진 전송 필요'; }
  function lockCreatedRequest() { if (createSubmit) { createSubmit.disabled = true; createSubmit.hidden = true; } }
  function photosComplete() { return currentDraft.photoSlots.every((slot) => slot.state === 'sent'); }
  async function addPhotos(files) {
    if (editingRequest || currentDraft.requestId || !files.length) return;
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
  async function submitCreate(data) { if (currentDraft.requestId) throw new Error('already-created'); if (!currentDraft.idempotencyKey) currentDraft.idempotencyKey = crypto.randomUUID(); const result = await authenticatedCall('officeCreate', core.buildCreatePayload(data, currentDraft.idempotencyKey)); currentDraft.requestId = result.requestId; currentDraft.receiptNo = result.receiptNo; currentDraft.idempotencyKey = null; lockCreatedRequest(); const complete = await finishUploads(['pending']); return { request: result, photosComplete: complete }; }
  async function submitOfficeRequest(form) { const data = dataFromForm(form); const validation = core.validateRequest(data); if (!validation.ok) { setCreateError(validation.message); focusField(validation.field); throw Object.assign(new Error('invalid-input'), { code: 'invalid-input' }); } if (currentDraft.photoPending) throw Object.assign(new Error('photo-pending'), { code: 'photo-pending' }); if (currentDraft.photoError) throw Object.assign(new Error(currentDraft.photoError), { code: 'invalid-file' }); return submitCreate(data); }
  function populateCreate(item) { const set = (name, value) => { const input = createForm.elements.namedItem(name); if (input) input.value = value || ''; }; set('unit', item.unit); set('location', item.location); set('issueType', item.issueType); set('pipeType', item.pipeType || '미확정'); set('urgency', item.urgency || 'normal'); set('description', item.description); set('officeContactName', item.officeContact && item.officeContact.name); set('officeContactPhone', item.officeContact && item.officeContact.phone); set('residentName', item.residentContact && item.residentContact.name); set('residentPhone', item.residentContact && item.residentContact.phone); set('preferredVisitDate', item.preferredVisitDate); createForm.elements.namedItem('privacyConsent').checked = true; }
  async function refreshInvalidStatus(id) { try { const fresh = await authenticatedCall('officeGet', { requestId: id }); replaceRequest(fresh.request); editingRequest = null; setView(dashboardView); if (syncStatus) syncStatus.textContent = '대표 확인 후에는 전화로 변경해 주세요'; return false; } catch (error) { if (error.officeSessionHandled) return false; blockLocalRequest(id); editingRequest = null; setView(dashboardView); if (syncStatus) syncStatus.textContent = '현재 상태를 새로고침하지 못했습니다. 대표 확인 후에는 전화로 변경해 주세요'; return false; } }
  async function editOfficeRequest(id) { const item = requests.find((entry) => requestId(entry) === id); if (!mutable(item)) { if (syncStatus) syncStatus.textContent = '대표 확인 후에는 전화로 변경해 주세요'; return false; } editingRequest = item; resetDraft(); populateCreate(item); createTitle.textContent = '접수 수정'; createSubmit.textContent = '수정 저장'; createSubmit.disabled = false; createSubmit.hidden = false; setPhotoControl(false); setCreateError(''); setProgress(''); setView(createView); return true; }
  async function updateOfficeRequest(data) { if (!editingRequest || !mutable(editingRequest)) return refreshInvalidStatus(requestId(editingRequest)); const payload = core.buildCreatePayload(data, 'update'); delete payload.idempotencyKey; payload.requestId = requestId(editingRequest); try { await authenticatedCall('officeUpdate', payload); const fresh = await authenticatedCall('officeGet', { requestId: payload.requestId }); replaceRequest(fresh.request); editingRequest = null; setView(dashboardView); if (syncStatus) syncStatus.textContent = '수정 내용을 저장했습니다.'; return { request: fresh.request, photosComplete: true }; } catch (error) { if (error.officeSessionHandled) throw error; if (error.code === 'invalid-status') return refreshInvalidStatus(payload.requestId); throw error; } }
  async function cancelOfficeRequest(id) { const item = requests.find((entry) => requestId(entry) === id); if (!mutable(item)) { if (syncStatus) syncStatus.textContent = '대표 확인 후에는 전화로 변경해 주세요'; return false; } if (!window.confirm('이 접수를 취소할까요?')) return false; try { await authenticatedCall('officeCancel', { requestId: id }); const fresh = await authenticatedCall('officeGet', { requestId: id }); replaceRequest(fresh.request); if (syncStatus) syncStatus.textContent = '접수를 취소했습니다.'; return true; } catch (error) { if (error.officeSessionHandled) throw error; if (error.code === 'invalid-status') return refreshInvalidStatus(id); throw error; } }
  async function submitRequest(event) { event.preventDefault(); if (formPending || currentDraft.requestId) return; formPending = true; createSubmit.disabled = true; setCreateError(''); try { if (editingRequest) await updateOfficeRequest(dataFromForm(createForm)); else await submitOfficeRequest(createForm); } catch (error) { if (error.officeSessionHandled) return; if (error.code === 'photo-pending') setCreateError('사진을 준비하는 중입니다.'); else if (!error.code || error.code !== 'invalid-input') setCreateError(errorMessage(error)); } finally { formPending = false; if (!currentDraft.requestId && createSubmit) createSubmit.disabled = false; } }

  if (year) year.textContent = new Date().getFullYear();
  if (!core || !api || !photo || !routeError || !loginView || !dashboardView || !loginForm || !pin || !loginSubmit || !createForm) return;
  const slug = core.parseOfficeSlug(window.location.search);
  if (!slug) { setView(routeError); return; }
  if (complex) complex.value = slug;
  loginForm.addEventListener('submit', (event) => { submitLogin(event, slug); });
  if (logout) logout.addEventListener('click', () => { clearSession(); requests = []; resetCreate(); showLogin(''); });
  if (newRequest) newRequest.addEventListener('click', () => { resetCreate(); setView(createView); });
  if (createBack) createBack.addEventListener('click', () => { resetCreate(); setView(dashboardView); });
  createForm.addEventListener('submit', submitRequest);
  photoInput().addEventListener('change', (event) => { const files = [...(event.target.files || [])]; event.target.value = ''; addPhotos(files); });
  if (retryPhotos) retryPhotos.addEventListener('click', () => { retryOfficePhotos().catch((error) => { if (!error.officeSessionHandled) setCreateError(errorMessage(error)); }); });
  if (detailBack) detailBack.addEventListener('click', () => { clearDetail(); setView(dashboardView); });
  if (requestList) requestList.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.officeDetail) openDetail(button.dataset.officeDetail); if (button.dataset.officeEdit) editOfficeRequest(button.dataset.officeEdit); if (button.dataset.officeCancel) cancelOfficeRequest(button.dataset.officeCancel).catch((error) => { if (!error.officeSessionHandled && syncStatus) syncStatus.textContent = errorMessage(error); }); });
  filters.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.officeFilter || 'all')));
  window.submitOfficeRequest = submitOfficeRequest; window.retryOfficePhotos = retryOfficePhotos; window.editOfficeRequest = editOfficeRequest; window.cancelOfficeRequest = cancelOfficeRequest; window.openOfficeDetail = openDetail;
  session = restoreSession(slug);
  if (session) loadDashboard(); else showLogin('');
})();
