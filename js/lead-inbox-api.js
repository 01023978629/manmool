/* lead-inbox-api.js — 문의 접수함 서버(Apps Script) 호출 — lead-inbox.html 전용

   규칙(직원 포털 API 와 같다)
   - 주소는 data/config.json 의 inbox.url. script.google.com 의 /exec 만 허용.
   - 세션 토큰은 메모리·sessionStorage 에만. localStorage·IndexedDB·URL·console 금지.
   - 오류는 코드 하나로 접어 화면이 사실만 말하게 한다. */
(() => {
  'use strict';
  const ACTIONS = Object.freeze(['leadHealth', 'leadLogin', 'leadLogout', 'leadMe', 'leadList', 'leadGet', 'leadDecide']);
  const PUBLIC_ACTIONS = new Set(['leadHealth', 'leadLogin']);
  const API_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  const MESSAGES = Object.freeze({
    'not-configured': '문의 접수함 서버가 아직 연결되지 않았습니다. 상담은 메일로 계속 들어옵니다.',
    'invalid-credentials': '관리 비밀번호를 확인해 주세요.',
    'rate-limited': '비밀번호가 여러 번 틀렸습니다. 15분 뒤 다시 시도해 주세요.',
    'session-expired': '로그인이 만료되었습니다. 다시 로그인해 주세요.',
    'invalid-input': '입력 내용을 확인해 주세요.',
    'invalid-transition': '이 상태에서는 그 판정을 할 수 없습니다. 목록을 새로고침해 주세요.',
    'not-found': '문의를 찾을 수 없습니다. 목록을 새로고침해 주세요.',
    'bad-request': '요청 형식을 확인해 주세요.',
    'timeout': '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
    'network-error': '네트워크 연결을 확인해 주세요.',
    'http-error': '서버 연결에 문제가 있습니다.',
    'invalid-response': '서버 응답을 확인할 수 없습니다.',
    'server-error': '서버 처리 중 문제가 발생했습니다.',
  });

  class ManmulLeadInboxApiError extends Error {
    constructor(code) {
      const safe = Object.prototype.hasOwnProperty.call(MESSAGES, code) ? code : 'server-error';
      super(MESSAGES[safe]);
      this.name = 'ManmulLeadInboxApiError';
      this.code = safe;
    }
  }
  const apiError = (code) => new ManmulLeadInboxApiError(code);

  function isAllowedApiUrl(value) {
    if (typeof value !== 'string' || value !== value.trim() || !API_URL.test(value)) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'script.google.com' && !url.port && !url.search && !url.hash && !url.username && !url.password;
    } catch (_) { return false; }
  }

  async function fetchJson(url, options, configError) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      const response = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
      if (!response || !response.ok) throw apiError(configError || 'http-error');
      const text = await response.text();
      try { return JSON.parse(text); } catch (_) { throw apiError('invalid-response'); }
    } catch (error) {
      if (error instanceof ManmulLeadInboxApiError) throw error;
      throw apiError(error && error.name === 'AbortError' ? 'timeout' : 'network-error');
    } finally { if (timer) clearTimeout(timer); }
  }

  async function loadConfig() {
    const value = await fetchJson('data/config.json', { cache: 'no-store', credentials: 'same-origin' }, 'not-configured');
    const inbox = value && typeof value === 'object' && !Array.isArray(value) ? value.inbox : null;
    if (!inbox || typeof inbox !== 'object') return { enabled: false, apiUrl: '' };
    if (inbox.enabled !== true || !isAllowedApiUrl(inbox.url)) return { enabled: false, apiUrl: '' };
    return { enabled: true, apiUrl: inbox.url };
  }

  async function call(action, options) {
    if (!ACTIONS.includes(action)) throw apiError('bad-request');
    options = options && typeof options === 'object' ? options : {};
    const token = typeof options.sessionToken === 'string' ? options.sessionToken.trim() : '';
    if (!PUBLIC_ACTIONS.has(action) && !token) throw apiError('session-expired');
    const config = await loadConfig();
    if (!config.enabled) throw apiError('not-configured');
    const body = { action, ts: Date.now(), payload: options.payload && typeof options.payload === 'object' ? { ...options.payload } : {} };
    if (!PUBLIC_ACTIONS.has(action)) body.sessionToken = token;
    const result = await fetchJson(config.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), redirect: 'follow', credentials: 'omit',
      ...(options.keepalive === true ? { keepalive: true } : {}),
    }, 'http-error');
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.ok !== 'boolean') throw apiError('invalid-response');
    if (!result.ok) throw apiError(typeof result.error === 'string' ? result.error : 'server-error');
    return result;
  }

  window.ManmulLeadInboxApi = Object.freeze({ ACTIONS, ManmulLeadInboxApiError, isAllowedApiUrl, loadConfig, call });
})();
