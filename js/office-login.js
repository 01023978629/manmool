(() => {
  'use strict';
  if (window.__MANMUL_OFFICE_FRAME_BLOCKED__) return;
  const core = window.ManmulOfficePortalCore;
  const api = window.ManmulOfficePortalApi;
  const requestForm = document.getElementById('portalCodeRequestForm');
  const verifyForm = document.getElementById('portalCodeVerifyForm');
  const officeCode = document.getElementById('portalOfficeCode');
  const email = document.getElementById('portalEmail');
  const code = document.getElementById('portalCode');
  const configNotice = document.getElementById('portalConfigNotice');
  const requestError = document.getElementById('portalRequestError');
  const verifyError = document.getElementById('portalVerifyError');
  const destination = document.getElementById('portalCodeDestination');
  const requestButton = document.getElementById('portalRequestCode');
  const verifyButton = document.getElementById('portalVerifyCode');
  const changeAccount = document.getElementById('portalChangeAccount');
  let pendingLogin = null;
  let busy = false;

  if (!core || !api || !requestForm || !verifyForm) return;

  function setBusy(value) {
    busy = value;
    if (requestButton) requestButton.disabled = value || requestButton.dataset.configured !== 'true';
    if (verifyButton) verifyButton.disabled = value;
    if (changeAccount) changeAccount.disabled = value;
  }
  function focusField(name) {
    const target = name === 'officeCode' ? officeCode : name === 'email' ? email : code;
    if (target) target.focus();
  }
  function maskEmail(value) {
    const parts = String(value).split('@');
    if (parts.length !== 2) return '등록 이메일';
    const lead = parts[0].slice(0, 2);
    return `${lead}${'*'.repeat(Math.max(2, Math.min(8, parts[0].length - lead.length)))}@${parts[1]}`;
  }
  function resetVerify() {
    if (busy) return;
    pendingLogin = null;
    if (code) code.value = '';
    if (verifyError) verifyError.textContent = '';
    verifyForm.hidden = true;
    requestForm.hidden = false;
    if (email) email.focus();
  }
  function apiMessage(error) {
    return error && typeof error.message === 'string' ? error.message : '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
  }

  async function checkConfiguration() {
    requestButton.disabled = true;
    requestButton.dataset.configured = 'false';
    try {
      const config = await api.loadConfig();
      if (!config.enabled) throw new api.ManmulOfficePortalApiError('not-configured');
      configNotice.textContent = '등록된 이메일로만 인증번호가 발송됩니다.';
      configNotice.classList.remove('is-off');
      requestButton.dataset.configured = 'true';
      requestButton.disabled = false;
    } catch (error) {
      configNotice.textContent = apiMessage(error);
      configNotice.classList.add('is-off');
      requestButton.disabled = true;
    }
  }

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || requestButton.dataset.configured !== 'true') return;
    const validation = core.validateRequestCode({ officeCode: officeCode.value, email: email.value });
    requestError.textContent = validation.message || '';
    if (!validation.ok) { focusField(validation.field); return; }
    setBusy(true);
    try {
      const response = await api.call('portalRequestCode', { payload: validation.value });
      const challengeId = core.normalizeChallengeId(response.challengeId);
      if (!challengeId) throw new api.ManmulOfficePortalApiError('invalid-response');
      pendingLogin = { ...validation.value, challengeId };
      destination.textContent = `${maskEmail(validation.value.email)}로 보낸 인증번호를 입력해 주세요.`;
      requestForm.hidden = true;
      verifyForm.hidden = false;
      code.value = '';
      code.focus();
    } catch (error) {
      requestError.textContent = apiMessage(error);
    } finally { setBusy(false); }
  });

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !pendingLogin) return;
    const validation = core.validateVerifyCode({ ...pendingLogin, code: code.value });
    verifyError.textContent = validation.message || '';
    if (!validation.ok) { focusField(validation.field); return; }
    setBusy(true);
    try {
      const response = await api.call('portalVerifyCode', { payload: validation.value });
      const session = core.storeSession(sessionStorage, response);
      if (!session) throw new api.ManmulOfficePortalApiError('invalid-response');
      pendingLogin = null;
      code.value = '';
      window.location.replace('office-portal.html');
    } catch (error) {
      verifyError.textContent = apiMessage(error);
    } finally {
      code.value = '';
      setBusy(false);
    }
  });

  changeAccount.addEventListener('click', resetVerify);
  const existing = core.restoreSession(sessionStorage);
  if (existing) window.location.replace('office-portal.html');
  else checkConfiguration();
})();
