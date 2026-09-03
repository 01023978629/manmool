(() => {
  'use strict';
  if (window.__MANMUL_OFFICE_FRAME_BLOCKED__) return;
  const core = window.ManmulOfficePortalCore;
  const api = window.ManmulOfficePortalApi;
  const loginForm = document.getElementById('portalLoginForm');
  const officeCode = document.getElementById('portalOfficeCode');
  const email = document.getElementById('portalEmail');
  const loginCode = document.getElementById('portalLoginCode');
  const configNotice = document.getElementById('portalConfigNotice');
  const loginError = document.getElementById('portalLoginError');
  const loginButton = document.getElementById('portalLoginButton');
  let busy = false;

  if (!core || !api || !loginForm) return;

  function setBusy(value) {
    busy = value;
    if (loginButton) loginButton.disabled = value || loginButton.dataset.configured !== 'true';
  }
  function focusField(name) {
    const target = name === 'officeCode' ? officeCode : name === 'email' ? email : loginCode;
    if (target) target.focus();
  }
  function apiMessage(error) {
    return error && typeof error.message === 'string' ? error.message : '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
  }
  // 로그인 단계에서는 '누가 틀렸는지'를 말하지 않는다. 서버가 not-found·forbidden 처럼
  // 코드별로 다르게 답하더라도 화면은 한 문구로 접어, 등록된 이메일인지 알아내는
  // 시도(사용자 존재 오라클)에 화면이 협조하지 않게 한다. 연결·설정·잠금 안내는 그대로 —
  // 손님이 다음에 무엇을 하면 되는지는 알아야 한다.
  const LOGIN_PASSTHROUGH = new Set(['not-configured', 'timeout', 'network-error', 'http-error', 'invalid-response', 'server-error', 'rate-limited']);
  function loginMessage(error) {
    const code = error && typeof error.code === 'string' ? error.code : '';
    if (code && !LOGIN_PASSTHROUGH.has(code)) return new api.ManmulOfficePortalApiError('invalid-credentials').message;
    return apiMessage(error);
  }

  async function checkConfiguration() {
    loginButton.disabled = true;
    loginButton.dataset.configured = 'false';
    try {
      const config = await api.loadConfig();
      if (!config.enabled) throw new api.ManmulOfficePortalApiError('not-configured');
      configNotice.textContent = '관리자가 등록한 계정과 인증번호만 사용할 수 있습니다.';
      configNotice.classList.remove('is-off');
      loginButton.dataset.configured = 'true';
      loginButton.disabled = false;
    } catch (error) {
      configNotice.textContent = apiMessage(error);
      configNotice.classList.add('is-off');
      loginButton.disabled = true;
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || loginButton.dataset.configured !== 'true') return;
    const validation = core.validateLogin({ officeCode: officeCode.value, email: email.value, loginCode: loginCode.value });
    loginError.textContent = validation.message || '';
    if (!validation.ok) { focusField(validation.field); return; }
    setBusy(true);
    try {
      const response = await api.call('portalLogin', { payload: validation.value });
      const session = core.storeSession(sessionStorage, response);
      if (!session) throw new api.ManmulOfficePortalApiError('invalid-response');
      loginCode.value = '';
      window.location.replace('office-portal.html');
    } catch (error) {
      loginError.textContent = loginMessage(error);
      // 제출 버튼이 잠기며 포커스가 body 로 떨어진다 — 키보드 사용자가 Tab 을 처음부터 다시 하지 않게 인증번호 칸으로
      focusField('loginCode');
    } finally {
      loginCode.value = '';
      setBusy(false);
    }
  });

  const existing = core.restoreSession(sessionStorage);
  if (existing) window.location.replace('office-portal.html');
  else checkConfiguration();
})();
