(() => {
  const SESSION_KEY = 'manmul_office_session_v1';
  const core = window.ManmulOfficeRequest;
  const api = window.ManmulOfficeApi;
  const routeError = document.getElementById('officeRouteError');
  const loginView = document.getElementById('officeLoginView');
  const dashboardView = document.getElementById('officeDashboardView');
  const createView = document.getElementById('officeCreateView');
  const detailView = document.getElementById('officeDetailView');
  const loginForm = document.getElementById('officeLoginForm');
  const pin = document.getElementById('officePin');
  const complex = document.getElementById('officeComplex');
  const loginError = document.getElementById('officeLoginError');
  const officeName = document.getElementById('officeName');
  const requestList = document.getElementById('officeRequestList');
  const syncStatus = document.getElementById('officeSyncStatus');
  const logout = document.getElementById('officeLogout');
  const newRequest = document.getElementById('officeNewRequest');
  const year = document.getElementById('requestYear');
  const filters = [...document.querySelectorAll('[data-office-filter]')];
  const views = [routeError, loginView, dashboardView, createView, detailView];
  let session = null;
  let requests = [];
  let activeFilter = 'all';

  function setView(view) { views.forEach((element) => { if (element) element.hidden = element !== view; }); }
  function safeOffice(value) {
    const source = value && typeof value === 'object' ? value : {};
    return { id: String(source.id || '').trim().slice(0, 80), name: String(source.name || source.displayName || source.complexName || '').trim().slice(0, 160) };
  }
  function saveSession(value) {
    const saved = { token: String(value && value.sessionToken || '').trim(), office: safeOffice(value && value.office), expiresAt: Number(value && value.expiresAt) };
    if (!saved.token || !saved.office.name || !Number.isFinite(saved.expiresAt)) return null;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
    return saved;
  }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); session = null; }
  function restoreSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      const keys = value && typeof value === 'object' ? Object.keys(value).sort() : [];
      if (keys.join(',') !== 'expiresAt,office,token' || !value.token || Date.now() >= Number(value.expiresAt)) { clearSession(); return null; }
      const office = safeOffice(value.office);
      if (!office.name) { clearSession(); return null; }
      return { token: String(value.token), office, expiresAt: Number(value.expiresAt) };
    } catch (_) { clearSession(); return null; }
  }
  function focusPin() { if (pin) pin.focus(); }
  function showLogin(message) {
    if (loginError) loginError.textContent = message || '';
    if (requestList) requestList.textContent = '';
    if (syncStatus) syncStatus.textContent = '';
    setView(loginView);
    focusPin();
  }
  function errorMessage(error) {
    if (error && error.code === 'rate-limited') return '시도가 많습니다. 10분 후 다시 시도해 주세요.';
    return error && typeof error.message === 'string' ? error.message : '로그인 처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
  }
  function matchesFilter(item) {
    const status = String(item && item.status || '');
    if (activeFilter === 'pending') return ['pending_review', 'needs_info', 'on_hold'].includes(status);
    if (activeFilter === 'progress') return ['accepted', 'visit_scheduled', 'in_progress'].includes(status);
    if (activeFilter === 'completed') return ['completed', 'billed', 'paid', 'cancelled'].includes(status);
    return true;
  }
  function addText(parent, className, value) { const element = document.createElement('p'); element.className = className; element.textContent = String(value || ''); parent.appendChild(element); }
  function renderRequests() {
    if (!requestList) return;
    requestList.textContent = '';
    const visible = requests.filter(matchesFilter);
    if (!visible.length) { addText(requestList, 'office-empty', '표시할 접수가 없습니다.'); return; }
    visible.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'office-request-card';
      const title = document.createElement('h2');
      title.textContent = String(item.receiptNo || item.id || '접수').slice(0, 100);
      card.appendChild(title);
      addText(card, 'office-request-unit', `${String(item.unit || '').slice(0, 100)} · ${String(item.location || '').slice(0, 140)}`);
      addText(card, 'office-request-meta', `${core.statusLabel(item.status)} · ${String(item.issueType || '').slice(0, 30)}`);
      requestList.appendChild(card);
    });
  }
  function setFilter(next) {
    activeFilter = next;
    filters.forEach((button) => { const selected = button.dataset.officeFilter === next; button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); });
    renderRequests();
  }
  async function loadDashboard() {
    if (!session) return;
    if (officeName) officeName.textContent = session.office.name;
    setView(dashboardView);
    if (syncStatus) syncStatus.textContent = '접수 목록을 불러오는 중입니다.';
    try {
      const response = await api.call('officeList', { sessionToken: session.token, payload: {} });
      requests = Array.isArray(response.requests) ? response.requests : [];
      renderRequests();
      if (syncStatus) syncStatus.textContent = '접수 목록을 최신 상태로 불러왔습니다.';
    } catch (error) {
      if (error && error.code === 'session-expired') { clearSession(); showLogin(errorMessage(error)); return; }
      if (requestList) requestList.textContent = '';
      if (syncStatus) syncStatus.textContent = errorMessage(error);
    }
  }
  async function submitLogin(event, slug) {
    event.preventDefault();
    const validation = core.validateLogin({ pin: pin && pin.value });
    if (!validation.ok) { if (loginError) loginError.textContent = validation.message; focusPin(); return; }
    if (loginError) loginError.textContent = '';
    try {
      const response = await api.call('officeLogin', { payload: { slug, pin: pin.value } });
      const saved = saveSession(response);
      pin.value = '';
      if (!saved) throw new Error('invalid-session');
      session = saved;
      await loadDashboard();
    } catch (error) {
      if (pin) pin.value = '';
      if (loginError) loginError.textContent = errorMessage(error);
      focusPin();
    }
  }

  if (year) year.textContent = new Date().getFullYear();
  if (!core || !api || !routeError || !loginView || !dashboardView || !loginForm || !pin) return;
  const slug = core.parseOfficeSlug(window.location.search);
  if (!slug) { setView(routeError); return; }
  if (complex) complex.value = slug;
  loginForm.addEventListener('submit', (event) => { submitLogin(event, slug); });
  if (logout) logout.addEventListener('click', () => { clearSession(); showLogin(''); });
  if (newRequest) newRequest.addEventListener('click', () => { setView(createView); });
  filters.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.officeFilter || 'all')));
  session = restoreSession();
  if (session) loadDashboard(); else showLogin('');
})();
