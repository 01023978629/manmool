(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ManmulOfficePortalApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPortalApi() {
  'use strict';

  const CONFIG_PATH = 'office-portal-api.json';
  const API_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  const ACTIONS = Object.freeze([
    'portalLogin', 'portalMe', 'portalLogout', 'portalDashboard',
    'portalStatusList', 'portalStatusSave', 'portalLogList', 'portalLogSave',
    'portalUserList', 'portalUserSave', 'portalPermissionSave', 'portalAuditList',
    'portalWorkOrderList', 'portalWorkOrderSave', 'portalNoticeList', 'portalNoticeSave',
    'portalCostList', 'portalCostSave', 'portalCostApprove', 'portalReportSummary',
  ]);
  const PUBLIC_ACTIONS = new Set(['portalLogin']);
  const ACTION_SET = new Set(ACTIONS);
  const MESSAGES = Object.freeze({
    'not-configured': '직원 포털 서버 연결을 준비하고 있습니다. 기존 6자리 비밀번호 접수 포털을 이용해 주세요. 비밀번호가 없으면 010-2397-8629 로 전화 주세요.',
    'invalid-input': '입력 내용을 확인해 주세요.', 'invalid-credentials': '관리사무소 코드, 이메일 또는 비밀번호를 확인해 주세요. 계속 안 되면 010-2397-8629 로 전화 주세요.',
    'rate-limited': '비밀번호 입력이 여러 번 틀렸거나 요청이 많습니다. 15분 뒤 다시 시도해 주세요. 급하면 010-2397-8629 로 전화 주세요.',
    'session-expired': '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.', 'forbidden': '이 기능을 볼 수 있는 권한이 없습니다.',
    'last-admin': '마지막 관리자는 비활성화하거나 관리자 권한을 해제할 수 없습니다.',
    'not-found': '요청한 정보를 찾을 수 없습니다.', 'bad-request': '요청 형식을 확인해 주세요.',
    'timeout': '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.', 'network-error': '네트워크 연결을 확인해 주세요.',
    'http-error': '서버 연결에 문제가 있습니다.', 'invalid-response': '서버 응답을 확인할 수 없습니다.', 'server-error': '서버 처리 중 문제가 발생했습니다.',
  });
  const RETRYABLE = new Set(['timeout', 'network-error', 'http-error', 'server-error']);

  class ManmulOfficePortalApiError extends Error {
    constructor(code) {
      const safe = Object.prototype.hasOwnProperty.call(MESSAGES, code) ? code : 'server-error';
      super(MESSAGES[safe]);
      this.name = 'ManmulOfficePortalApiError';
      this.code = safe;
      this.retryable = RETRYABLE.has(safe);
    }
  }
  function apiError(code) { return new ManmulOfficePortalApiError(code); }
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
      if (error instanceof ManmulOfficePortalApiError) throw error;
      throw apiError(error && error.name === 'AbortError' ? 'timeout' : 'network-error');
    } finally { if (timer) clearTimeout(timer); }
  }
  async function loadConfig() {
    const value = await fetchJson(CONFIG_PATH, { cache: 'no-store', credentials: 'same-origin' }, 'not-configured');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw apiError('not-configured');
    if (value.enabled === false && value.apiUrl === '') return { enabled: false, apiUrl: '' };
    if (value.enabled !== true || !isAllowedApiUrl(value.apiUrl) || Object.keys(value).sort().join(',') !== 'apiUrl,enabled') throw apiError('not-configured');
    return { enabled: true, apiUrl: value.apiUrl };
  }
  function exactPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...value };
  }
  async function call(action, options) {
    if (!ACTION_SET.has(action)) throw apiError('bad-request');
    options = options && typeof options === 'object' ? options : {};
    const token = typeof options.sessionToken === 'string' ? options.sessionToken.trim() : '';
    if (!PUBLIC_ACTIONS.has(action) && !token) throw apiError('session-expired');
    const config = await loadConfig();
    if (!config.enabled) throw apiError('not-configured');
    const body = { action, ts: Date.now(), payload: exactPayload(options.payload) };
    if (!PUBLIC_ACTIONS.has(action)) body.sessionToken = token;
    // keepalive: 로그아웃처럼 바로 화면을 떠나는 요청은 이동이 fetch 를 끊지 않게 한다.
    // 이게 없으면 Apps Script 콜드스타트(흔히 1.2초 초과) 중 페이지가 바뀌어 서버 세션이
    // 폐기되지 않고 8시간 유효로 남는다.
    const result = await fetchJson(config.apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), redirect: 'follow', credentials: 'omit',
      ...(options.keepalive === true ? { keepalive: true } : {}),
    }, 'http-error');
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.ok !== 'boolean') throw apiError('invalid-response');
    if (!result.ok) throw apiError(typeof result.error === 'string' ? result.error : 'server-error');
    return result;
  }

  return { ACTIONS, ManmulOfficePortalApiError, isAllowedApiUrl, loadConfig, call };
});
