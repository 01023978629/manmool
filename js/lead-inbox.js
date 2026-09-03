/* lead-inbox.js — 문의 접수함 화면 (대표 전용)

   화면이 하는 일
   1. 관리 비밀번호로 로그인 → 세션 토큰은 sessionStorage 에만(탭 닫으면 사라짐)
   2. 상태별 목록(신규·보류·승인·거절·전체)과 건별 내용·이력
   3. 승인·보류·거절 판정 + 메모. 판정마다 클라이언트 UUID(requestId)로 멱등
   4. 본문 복사 — 현장 앱 「📥 웹 업무 연결」에 붙여 넣을 메일 형식 그대로

   규칙
   - 서버 응답은 전부 textContent 로만 그린다(innerHTML 금지). 손님 이름·메모가 HTML 이어도 안전.
   - localStorage·IndexedDB·URL·console 에 문의 내용을 두지 않는다. */
(() => {
  'use strict';
  if (window.__MANMUL_OFFICE_FRAME_BLOCKED__) return;
  const api = window.ManmulLeadInboxApi;
  const byId = (id) => document.getElementById(id);
  const loginView = byId('inboxLoginView'), loginForm = byId('inboxLoginForm'), adminCode = byId('inboxAdminCode');
  const loginError = byId('inboxLoginError'), loginButton = byId('inboxLoginButton'), configNotice = byId('inboxConfigNotice');
  const app = byId('inboxApp'), account = byId('inboxAccount'), status = byId('inboxStatus'), list = byId('inboxList'), empty = byId('inboxEmpty');
  const detail = byId('inboxDetail'), denied = byId('inboxDenied'), deniedMessage = byId('inboxDeniedMessage');
  const SESSION_KEY = 'manmul_lead_inbox_session';
  const SESSION_NOTICE_LEAD_MS = 10 * 60 * 1000;
  const LOGOUT_TIMEOUT_MS = 1200;
  const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let session = null;
  let busy = false;
  let currentStatus = '신규';
  let currentLead = null;
  let listGeneration = 0;
  let sessionNoticeTimer = null;
  let logoutStarted = false;
  if (!api || !loginForm || !app) return;

  /* ── 세션 ── */
  function readSession() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!raw || typeof raw !== 'object' || Object.keys(raw).sort().join(',') !== 'expiresAt,token') return null;
      if (typeof raw.token !== 'string' || raw.token.length < 64 || !Number.isFinite(raw.expiresAt) || raw.expiresAt <= Date.now()) return null;
      return raw;
    } catch (_) { return null; }
  }
  function writeSession(value) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: value.token, expiresAt: value.expiresAt })); } catch (_) { /* 저장 못 해도 이 탭에서는 동작 */ }
  }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {} session = null; }
  function apiMessage(error) { return error && typeof error.message === 'string' ? error.message : '처리 중 문제가 생겼습니다.'; }
  function isSessionError(error) { return error && error.code === 'session-expired'; }

  function showDenied(text) {
    loginView.hidden = true; app.hidden = true; account.hidden = true; denied.hidden = false;
    deniedMessage.textContent = text || '';
    purgePrivateUi();
    const h1 = byId('inboxDeniedTitle'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus(); }
  }
  function purgePrivateUi() {
    list.textContent = ''; byId('inboxHistory').textContent = ''; byId('inboxDetailFields').textContent = '';
    byId('inboxMessage').textContent = ''; byId('inboxDetailTitle').textContent = ''; byId('inboxDetailMeta').textContent = '';
    byId('inboxDecisionMemo').value = ''; currentLead = null; detail.hidden = true;
  }
  function scheduleSessionNotice(expiresAt) {
    const notice = byId('inboxSessionNotice');
    if (sessionNoticeTimer) { window.clearTimeout(sessionNoticeTimer); sessionNoticeTimer = null; }
    if (!notice || !Number.isFinite(expiresAt)) return;
    notice.hidden = true; notice.textContent = '';
    const delay = Math.max(0, expiresAt - Date.now() - SESSION_NOTICE_LEAD_MS);
    sessionNoticeTimer = window.setTimeout(() => {
      if (!session) return;
      notice.textContent = '로그인이 10분 안에 만료됩니다. 작성 중인 메모는 지금 저장해 주세요.';
      notice.hidden = false;
    }, Math.min(delay, 2_147_000_000));
  }

  /* ── 로그인 ── */
  function setBusy(value) { busy = value; loginButton.disabled = value || loginButton.dataset.configured !== 'true'; }
  async function checkConfiguration() {
    loginButton.disabled = true; loginButton.dataset.configured = 'false';
    try {
      const config = await api.loadConfig();
      if (!config.enabled) throw new api.ManmulLeadInboxApiError('not-configured');
      configNotice.textContent = '서버가 연결되어 있습니다. 관리 비밀번호를 입력하세요.';
      configNotice.classList.remove('is-off');
      loginButton.dataset.configured = 'true'; loginButton.disabled = false;
    } catch (error) {
      configNotice.textContent = apiMessage(error);
      configNotice.classList.add('is-off');
      loginButton.disabled = true;
    }
  }
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || loginButton.dataset.configured !== 'true') return;
    const code = adminCode.value;
    if (code.length < 8 || /\s/.test(code)) { loginError.textContent = '관리 비밀번호를 확인해 주세요.'; adminCode.focus(); return; }
    loginError.textContent = '';
    setBusy(true);
    try {
      const response = await api.call('leadLogin', { payload: { adminCode: code } });
      const token = typeof response.sessionToken === 'string' ? response.sessionToken : '';
      const expiresAt = Number(response.expiresAt);
      if (token.length < 64 || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 9 * 60 * 60 * 1000) {
        throw new api.ManmulLeadInboxApiError('invalid-response');
      }
      session = { token, expiresAt };
      writeSession(session);
      adminCode.value = '';
      await enterApp();
    } catch (error) {
      loginError.textContent = apiMessage(error);
      adminCode.focus();
    } finally {
      adminCode.value = '';
      setBusy(false);
    }
  });

  /* ── 접수함 ── */
  async function authenticatedCall(action, payload, options) {
    if (!session) throw new api.ManmulLeadInboxApiError('session-expired');
    try {
      return await api.call(action, { sessionToken: session.token, payload: payload || {}, ...(options || {}) });
    } catch (error) {
      if (isSessionError(error)) { clearSession(); showDenied(apiMessage(error)); }
      throw error;
    }
  }
  async function enterApp() {
    loginView.hidden = true; denied.hidden = true; app.hidden = false; account.hidden = false;
    byId('inboxSessionUntil').textContent = '세션 ' + new Date(session.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) + ' 까지';
    scheduleSessionNotice(session.expiresAt);
    await loadList();
    const h1 = byId('inboxListTitle'); if (h1) h1.focus();
  }

  function setStatusText(text) { status.textContent = text || ''; }
  function fmtTime(iso) {
    const t = Date.parse(String(iso || ''));
    if (!Number.isFinite(t)) return '';
    return new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function pill(statusText) { const p = el('span', 'inbox-status-pill', statusText); p.dataset.status = statusText; return p; }

  async function loadList() {
    const generation = ++listGeneration;
    const refresh = byId('inboxRefresh');
    refresh.disabled = true; refresh.setAttribute('aria-busy', 'true');
    setStatusText('목록을 불러오는 중…');
    try {
      const result = await authenticatedCall('leadList', { status: currentStatus });
      if (generation !== listGeneration) return;
      renderList(Array.isArray(result.leads) ? result.leads : []);
      renderCounts(result.counts || {});
      setStatusText('마지막 확인 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      if (generation !== listGeneration) return;
      if (!isSessionError(error)) setStatusText(apiMessage(error));
    } finally {
      if (generation === listGeneration) { refresh.disabled = false; refresh.setAttribute('aria-busy', 'false'); }
    }
  }
  function renderCounts(counts) {
    document.querySelectorAll('.portal-nav [data-count]').forEach((node) => {
      const n = Number(counts[node.dataset.count]);
      node.textContent = Number.isFinite(n) && n > 0 ? String(n) : '';
    });
  }
  function renderList(leads) {
    list.textContent = '';
    empty.hidden = leads.length > 0;
    leads.forEach((lead) => {
      const card = el('button', 'inbox-record');
      card.type = 'button';
      card.setAttribute('aria-label', `${lead.name} · ${lead.service} · ${fmtTime(lead.receivedAt)} 문의 열기`);
      const top = el('div', 'inbox-record-top');
      top.appendChild(pill(lead.status));
      top.appendChild(el('span', 'inbox-service-pill', lead.service));
      top.appendChild(el('b', '', lead.name));
      top.appendChild(el('span', 'inbox-record-meta', lead.phone));
      if (lead.emailDelivered !== 'Y') top.appendChild(el('span', 'inbox-mail-flag', '메일 미발송'));
      card.appendChild(top);
      const meta = [lead.receiptNo, fmtTime(lead.receivedAt), lead.region, lead.type].filter(Boolean).join(' · ');
      card.appendChild(el('div', 'inbox-record-meta', meta));
      const summary = [lead.symptoms, lead.works, lead.memo].filter(Boolean).join(' / ');
      if (summary) card.appendChild(el('div', 'inbox-record-memo', summary.length > 140 ? summary.slice(0, 140) + '…' : summary));
      card.addEventListener('click', () => { openDetail(lead.leadId); });
      list.appendChild(card);
    });
  }

  const FIELD_LABELS = [['phone', '연락처'], ['type', '유형'], ['region', '지역'], ['area', '평수'], ['scope', '범위'], ['works', '희망 항목'],
    ['symptoms', '증상'], ['budget', '예산'], ['movein', '시기'], ['live', '거주'], ['purpose', '목적'], ['visit', '희망 방문'],
    ['memo', '메모'], ['source', '접수 경로'], ['sourcePage', '유입 페이지'], ['ctaId', '진입점'], ['utm', 'UTM'], ['emailDelivered', '메일 발송']];
  async function openDetail(leadId) {
    setStatusText('문의를 여는 중…');
    try {
      const result = await authenticatedCall('leadGet', { leadId });
      renderDetail(result.lead || {}, Array.isArray(result.history) ? result.history : []);
      setStatusText('');
    } catch (error) {
      if (!isSessionError(error)) setStatusText(apiMessage(error));
    }
  }
  function renderDetail(lead, history) {
    currentLead = lead;
    byId('inboxDetailTitle').textContent = `${lead.name} · ${lead.service}`;
    byId('inboxDetailMeta').textContent = [lead.receiptNo, '접수 ' + fmtTime(lead.receivedAt), lead.decidedAt ? '판정 ' + fmtTime(lead.decidedAt) : ''].filter(Boolean).join(' · ');
    const statusPill = byId('inboxDetailStatus'); statusPill.textContent = lead.status; statusPill.dataset.status = lead.status;
    const fields = byId('inboxDetailFields'); fields.textContent = '';
    FIELD_LABELS.forEach(([key, label]) => {
      const value = lead[key];
      if (!value) return;
      fields.appendChild(el('dt', '', label));
      const dd = el('dd', '');
      if (key === 'phone') {
        const a = el('a', '', value); a.href = 'tel:' + String(value).replace(/[^0-9]/g, ''); dd.appendChild(a);
      } else if (key === 'emailDelivered') {
        dd.textContent = value === 'Y' ? '발송됨' : '미발송 — 접수함에만 남은 문의입니다';
      } else dd.textContent = value;
      fields.appendChild(dd);
    });
    byId('inboxMessage').textContent = lead.message || '';
    const hist = byId('inboxHistory'); hist.textContent = '';
    history.forEach((item) => {
      const li = el('li', '');
      const head = item.action === '판정' ? `${item.from} → ${item.to}` : `${item.action} → ${item.to}`;
      li.appendChild(el('b', '', head));
      if (item.memo) li.appendChild(document.createTextNode(' · ' + item.memo));
      li.appendChild(el('small', '', ' (' + fmtTime(item.at) + (item.actor === 'admin' ? ', 대표' : '') + ')'));
      hist.appendChild(li);
    });
    const allowed = { '신규': ['승인', '보류', '거절'], '보류': ['승인', '거절'], '거절': ['보류'], '승인': [] }[lead.status] || [];
    document.querySelectorAll('#inboxDecisionForm [data-decision]').forEach((button) => { button.disabled = !allowed.includes(button.dataset.decision); });
    byId('inboxDecisionError').textContent = '';
    byId('inboxDecisionMemo').value = '';
    delete byId('inboxDecisionForm').dataset.requestId;
    detail.hidden = false;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    byId('inboxDetailTitle').focus({ preventScroll: true });
  }

  /* ── 판정 ── */
  function operationRequestId(form) {
    let requestId = String(form.dataset.requestId || '');
    if (!REQUEST_ID.test(requestId)) { requestId = crypto.randomUUID(); form.dataset.requestId = requestId; }
    return requestId;
  }
  const decisionForm = byId('inboxDecisionForm');
  decisionForm.addEventListener('input', () => { delete decisionForm.dataset.requestId; });
  decisionForm.querySelectorAll('[data-decision]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!currentLead || busy) return;
      const decision = button.dataset.decision;
      const memo = byId('inboxDecisionMemo').value.trim();
      const errorBox = byId('inboxDecisionError');
      if (decision === '거절' && !memo) { errorBox.textContent = '거절 사유를 메모에 적어 주세요.'; byId('inboxDecisionMemo').focus(); return; }
      errorBox.textContent = '';
      busy = true;
      const buttons = decisionForm.querySelectorAll('[data-decision]');
      buttons.forEach((b) => { b.disabled = true; });
      try {
        const result = await authenticatedCall('leadDecide', { leadId: currentLead.leadId, decision, memo, requestId: operationRequestId(decisionForm) });
        delete decisionForm.dataset.requestId;
        const recorded = `${currentLead.name} 건을 ${decision}(으)로 기록했습니다.`;
        await openDetail(currentLead.leadId);
        await loadList();
        setStatusText(recorded);
      } catch (error) {
        if (!isSessionError(error)) errorBox.textContent = apiMessage(error);
        if (currentLead) {
          const allowed = { '신규': ['승인', '보류', '거절'], '보류': ['승인', '거절'], '거절': ['보류'], '승인': [] }[currentLead.status] || [];
          buttons.forEach((b) => { b.disabled = !allowed.includes(b.dataset.decision); });
        }
      } finally { busy = false; }
    });
  });

  /* ── 본문 복사 ── */
  byId('inboxCopyMessage').addEventListener('click', async () => {
    const text = byId('inboxMessage').textContent || '';
    const button = byId('inboxCopyMessage');
    let ok = false;
    try {
      if (window.ManmulLead && typeof window.ManmulLead.copyToClipboard === 'function') ok = await window.ManmulLead.copyToClipboard(text);
      else if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
    } catch (_) { ok = false; }
    button.textContent = ok ? '✓ 복사했습니다 — 앱에 붙여 넣으세요' : '복사가 막혔습니다 — 본문을 직접 선택해 주세요';
    window.setTimeout(() => { button.textContent = '앱에 붙여넣을 본문 복사'; }, 4000);
  });

  /* ── 탭·새로고침·닫기·로그아웃 ── */
  document.querySelectorAll('.portal-nav [data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      currentStatus = button.dataset.status;
      document.querySelectorAll('.portal-nav [data-status]').forEach((b) => b.classList.toggle('is-active', b === button));
      byId('inboxListTitle').textContent = (currentStatus === '전체' ? '전체' : currentStatus) + ' 문의';
      detail.hidden = true; currentLead = null;
      loadList();
    });
  });
  byId('inboxRefresh').addEventListener('click', () => { loadList(); });
  byId('inboxDetailClose').addEventListener('click', () => { detail.hidden = true; currentLead = null; byId('inboxListTitle').focus(); });
  byId('inboxLogout').addEventListener('click', async () => {
    if (logoutStarted) return;
    logoutStarted = true;
    const current = session;
    clearSession();
    scheduleSessionNotice(NaN);
    app.hidden = true; account.hidden = true; denied.hidden = false; deniedMessage.textContent = '안전하게 로그아웃하고 있습니다.';
    purgePrivateUi();
    if (current) await Promise.race([
      api.call('leadLogout', { sessionToken: current.token, payload: {}, keepalive: true }).catch(() => null),
      new Promise((resolve) => window.setTimeout(resolve, LOGOUT_TIMEOUT_MS)),
    ]);
    window.location.replace('lead-inbox.html');
  });

  /* ── 부팅 ── */
  (async () => {
    const restored = readSession();
    if (restored) {
      session = restored;
      try {
        const me = await authenticatedCall('leadMe', {});
        if (Number.isFinite(Number(me.expiresAt))) { session.expiresAt = Number(me.expiresAt); writeSession(session); }
        await enterApp();
        return;
      } catch (_) { /* 로그인 화면으로 */ }
    }
    clearSession();
    denied.hidden = true; app.hidden = true; account.hidden = true;
    loginView.hidden = false;
    await checkConfiguration();
  })();
})();
