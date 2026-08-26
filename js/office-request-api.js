(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ManmulOfficeApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const CONFIG_PATH = 'office-api.json';
  const API_URL = /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/;
  const PUBLIC_ACTIONS = new Set(['officeLogin', 'officeList', 'officeGet', 'officeCreate', 'officeUpdate', 'officeCancel', 'officeUpload']);
  const SESSION_ACTIONS = new Set(['officeList', 'officeGet', 'officeCreate', 'officeUpdate', 'officeCancel', 'officeUpload']);
  const MESSAGES = {
    'not-configured': '관리사무소 접수 서비스가 아직 설정되지 않았습니다.', 'office-disabled': '관리사무소 접수가 현재 비활성화되어 있습니다.',
    'invalid-credentials': '관리사무소 코드 또는 비밀번호를 확인해 주세요.', 'rate-limited': '시도가 많습니다. 잠시 후 다시 시도해 주세요.',
    'session-expired': '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.', 'invalid-input': '입력 내용을 확인해 주세요.',
    'consent-required': '개인정보 수집·이용 동의가 필요합니다.', 'invalid-status': '현재 상태에서는 요청을 변경할 수 없습니다.',
    'not-found': '요청을 찾을 수 없습니다.', 'unsupported-type': '지원하지 않는 파일 형식입니다.', 'invalid-file': '파일을 확인할 수 없습니다.',
    'too-large': '파일 또는 요청 크기가 너무 큽니다.', 'too-many-files': '사진은 최대 5장까지 올릴 수 있습니다.',
    'bad-request': '요청 형식을 확인해 주세요.', 'timeout': '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
    'network-error': '네트워크 연결을 확인한 뒤 다시 시도해 주세요.', 'http-error': '서버 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.',
    'invalid-response': '서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'server-error': '서버 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  };
  const RETRYABLE = new Set(['timeout', 'network-error', 'http-error', 'invalid-response', 'server-error']);
  class ManmulOfficeApiError extends Error {
    constructor(code) { super(MESSAGES[code] || MESSAGES['server-error']); this.name = 'ManmulOfficeApiError'; this.code = MESSAGES[code] ? code : 'server-error'; this.retryable = RETRYABLE.has(this.code); }
  }
  function error(code) { return new ManmulOfficeApiError(code); }
  async function readJson(response) {
    let raw;
    try {
      if (response && typeof response.text === 'function') raw = await response.text();
      else if (response && typeof response.json === 'function') return await response.json();
      else throw new Error('response-unreadable');
      return JSON.parse(String(raw));
    } catch (_) { throw error('invalid-response'); }
  }
  async function loadConfig() {
    let response;
    try { response = await fetch(CONFIG_PATH, { cache: 'no-store', credentials: 'same-origin' }); } catch (_) { throw error('network-error'); }
    if (!response || !response.ok) throw error('not-configured');
    const config = await readJson(response);
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw error('not-configured');
    if (config.enabled === false && config.apiUrl === '') return { enabled: false, apiUrl: '' };
    if (config.enabled !== true || typeof config.apiUrl !== 'string' || !API_URL.test(config.apiUrl)) throw error('not-configured');
    return { enabled: true, apiUrl: config.apiUrl };
  }
  async function call(action, options) {
    if (!PUBLIC_ACTIONS.has(action)) throw error('bad-request');
    const config = await loadConfig();
    if (!config.enabled) throw error('not-configured');
    options = options && typeof options === 'object' ? options : {};
    const body = { action, ts: Date.now(), payload: options.payload && typeof options.payload === 'object' ? options.payload : {} };
    if (SESSION_ACTIONS.has(action) && options.sessionToken) body.sessionToken = String(options.sessionToken);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 15000) : null;
    let response;
    try {
      response = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', ...(controller ? { signal: controller.signal } : {}) });
    } catch (caught) {
      if (timeout) clearTimeout(timeout);
      throw error(caught && caught.name === 'AbortError' ? 'timeout' : 'network-error');
    }
    if (timeout) clearTimeout(timeout);
    if (!response || !response.ok) throw error('http-error');
    const result = await readJson(response);
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.ok !== 'boolean') throw error('invalid-response');
    if (!result.ok) throw error(result.error);
    return result;
  }
  return { ManmulOfficeApiError, loadConfig, call };
});
