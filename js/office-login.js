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
      loginError.textContent = apiMessage(error);
    } finally {
      loginCode.value = '';
      setBusy(false);
    }
  });

  const existing = core.restoreSession(sessionStorage);
  if (existing) window.location.replace('office-portal.html');
  else checkConfiguration();
})();
