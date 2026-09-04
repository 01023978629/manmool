/* Code.gs — 만물인테리어 문의 접수함 (Lead Inbox) · Apps Script 웹앱

   무엇을 하는가
   - 공개 사이트 폼(인테리어·누수·관리사무소 파일럿)이 보내는 문의를 구글 시트에 이력으로
     남긴다. 메일(Web3Forms)은 그대로 나가고, 여기는 "무엇이 들어왔고 대표가 어떻게 판정했나"의
     정본이다.
   - 대표는 lead-inbox.html 에서 관리 비밀번호로 들어와 승인·보류·거절을 남긴다. 판정마다
     이력 한 줄이 남는다.

   반드시 지킬 것
   - 이 프로젝트는 기존 사진 중계 Apps Script(apps-script/)와 **별개**다. 그쪽 속성·시트·배포 URL과
     섞지 않는다.
   - 비밀값(세션 비밀·관리 비밀번호)은 스크립트 속성에만 둔다. 코드·Git 에 적지 않는다.
   - 응답에는 비밀번호·토큰 해시·시트 ID 를 절대 싣지 않는다.

   스크립트 속성
   - LEAD_INBOX_ENABLED        운영 활성화 시 '1'
   - LEAD_INBOX_SHEET_ID       접수함 전용 스프레드시트 ID (다른 시트 재사용 금지)
   - LEAD_INBOX_SESSION_SECRET 32자 이상 무작위 (세션 토큰 HMAC)
   - LEAD_INBOX_ADMIN_CODE     관리 비밀번호 원문 (8자 이상, 공백 없음) — 대표만 아는 값
   - LEAD_INBOX_LOGIN_PEPPER   32자 이상 무작위 (비밀번호 비교용 HMAC 키)
   - LEAD_INBOX_NOTIFY_TO      (선택) 새 문의 알림 메일을 받을 주소. 비워 두면 알림 없음

   최초 설치는 README.md 순서대로: 시트 생성 → 속성 등록 → leadInboxSetupSheets_() 1회 실행 → 웹앱 배포. */

var LEAD_ACTIONS = ['leadHealth', 'leadCreate', 'leadLogin', 'leadLogout', 'leadMe', 'leadList', 'leadGet', 'leadDecide'];
var LEAD_PUBLIC_ACTIONS = ['leadHealth', 'leadCreate', 'leadLogin'];
var LEAD_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
var LEAD_LOGIN_MAX_ATTEMPTS = 5;
var LEAD_LOGIN_LOCK_SECONDS = 15 * 60;
var LEAD_CREATE_WINDOW_SECONDS = 10 * 60;
var LEAD_CREATE_WINDOW_LIMIT = 60;
var LEAD_MAX_BODY_BYTES = 64 * 1024;
var LEAD_LIST_LIMIT = 200;
var LEAD_INBOX_PAGE_URL = 'https://01023978629.github.io/manmool/lead-inbox.html';
var LEAD_HEADERS = {
  '문의': ['leadId', 'receiptNo', 'receivedAt', 'status', 'decidedAt', 'name', 'phone', 'type', 'service', 'region', 'area', 'scope',
    'works', 'budget', 'movein', 'live', 'symptoms', 'purpose', 'visit', 'memo', 'source', 'sourcePage', 'ctaId', 'utm',
    'emailDelivered', 'message', 'extra', 'updatedAt'],
  '이력': ['historyId', 'leadId', 'at', 'action', 'from', 'to', 'memo', 'actor', 'requestId'],
  '세션': ['sessionId', 'tokenHash', 'issuedAt', 'expiresAt', 'revokedAt']
};

function doGet() { return leadJson_({ ok: false, error: 'bad-request' }); }

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length < 2 || raw.length > LEAD_MAX_BODY_BYTES) throw leadError_('invalid_request');
    var request;
    try { request = JSON.parse(raw); } catch (_) { throw leadError_('invalid_request'); }
    var result = leadDispatch_(request);
    var response = { ok: true };
    Object.keys(result || {}).forEach(function (key) { response[key] = result[key]; });
    return leadJson_(response);
  } catch (err) {
    return leadJson_({ ok: false, error: leadPublicError_(err && (err.leadCode || err.message)) });
  }
}

function leadDispatch_(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw leadError_('invalid_request');
  var action = String(request.action || '');
  if (LEAD_ACTIONS.indexOf(action) < 0) throw leadError_('invalid_action');
  var payload = request.payload && typeof request.payload === 'object' && !Array.isArray(request.payload) ? request.payload : {};
  if (action === 'leadHealth') return { service: 'lead-inbox-v1', enabled: leadEnabled_() };
  if (!leadEnabled_()) throw leadError_('service_disabled');
  if (action === 'leadCreate') return leadCreate_(payload);
  if (action === 'leadLogin') return leadLogin_(payload);
  var session = leadAuthenticate_(request.sessionToken);
  if (action === 'leadMe') return { expiresAt: leadTime_(session.expiresAt) };
  if (action === 'leadLogout') return leadLogout_(session);
  if (action === 'leadList') return leadList_(payload);
  if (action === 'leadGet') return leadGet_(payload);
  if (action === 'leadDecide') return leadDecide_(session, payload);
  throw leadError_('invalid_action');
}

/* ── 오류·응답 ─────────────────────────────────────────────── */
function leadError_(code) { var err = new Error(code); err.leadCode = code; return err; }
function leadPublicError_(code) {
  code = String(code || '');
  if (code === 'server_not_configured' || code === 'server_schema_error' || code === 'service_disabled') return 'not-configured';
  if (code === 'invalid_credentials') return 'invalid-credentials';
  if (code === 'rate_limited') return 'rate-limited';
  if (code === 'authentication_required' || code === 'session_expired' || code === 'session_invalid') return 'session-expired';
  if (code === 'not_found') return 'not-found';
  if (code === 'invalid_request' || code === 'invalid_action') return 'bad-request';
  if (code === 'invalid_transition') return 'invalid-transition';
  if (code.indexOf('invalid_') === 0 || code === 'consent_required' || code === 'memo_required') return 'invalid-input';
  return 'server-error';
}
function leadJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/* ── 속성·시트·잠금 ─────────────────────────────────────────── */
function leadProps_() { return PropertiesService.getScriptProperties(); }
function leadEnabled_() { return leadProps_().getProperty('LEAD_INBOX_ENABLED') === '1'; }
function leadRequiredProperty_(name, minimumLength) {
  var value = leadProps_().getProperty(name) || '';
  if (value.length < minimumLength) throw leadError_('server_not_configured');
  return value;
}
function leadSpreadsheet_() { return SpreadsheetApp.openById(leadRequiredProperty_('LEAD_INBOX_SHEET_ID', 5)); }
function leadSheet_(name) {
  var headers = LEAD_HEADERS[name];
  if (!headers) throw leadError_('server_schema_error');
  var sheet = leadSpreadsheet_().getSheetByName(name);
  if (!sheet) throw leadError_('server_schema_error');
  var actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (actual.join('') !== headers.join('')) throw leadError_('server_schema_error');
  return sheet;
}
function leadRows_(name) {
  var headers = LEAD_HEADERS[name];
  var values = leadSheet_(name).getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).map(function (row, index) {
    var item = { _row: index + 2 };
    headers.forEach(function (header, column) { item[header] = row[column]; });
    return item;
  });
}
function leadSaveRow_(name, item) {
  var headers = LEAD_HEADERS[name];
  var sheet = leadSheet_(name);
  var values = headers.map(function (header) { return item[header] === undefined || item[header] === null ? '' : item[header]; });
  if (item._row) sheet.getRange(item._row, 1, 1, headers.length).setValues([values]);
  else { sheet.appendRow(values); item._row = sheet.getLastRow(); }
  return item;
}
function leadWithLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return callback(); } finally { lock.releaseLock(); }
}
function leadNow_() { return new Date().toISOString(); }
function leadTime_(iso) { var t = Date.parse(String(iso || '')); return isFinite(t) ? t : NaN; }
function leadSeoulDateKey_(date) { return Utilities.formatDate(date || new Date(), 'Asia/Seoul', 'yyyyMMdd'); }

/* ── 암호 도우미 ─────────────────────────────────────────────── */
function leadHmac_(propertyName, value) {
  var secret = leadRequiredProperty_(propertyName, 32);
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(value), secret)).replace(/=+$/g, '');
}
function leadConstantTimeEqual_(left, right) {
  left = String(left || ''); right = String(right || '');
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i % (left.length || 1)) || 0) ^ (right.charCodeAt(i % (right.length || 1)) || 0);
  }
  return mismatch === 0;
}
function leadRandomToken_() {
  var bytes = [];
  for (var i = 0; i < 48; i += 1) bytes.push(Math.floor(Math.random() * 256));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '') + '.' + Utilities.getUuid().replace(/-/g, '');
}
function leadCounter_(cache, key, ttlSeconds) {
  var next = (Number(cache.get(key) || 0) || 0) + 1;
  cache.put(key, String(next), ttlSeconds);
  return next;
}

/* ── 접수(공개) ─────────────────────────────────────────────── */
function leadCreate_(payload) {
  var cache = CacheService.getScriptCache();
  if ((Number(cache.get('lead-create:global') || 0) || 0) >= LEAD_CREATE_WINDOW_LIMIT) throw leadError_('rate_limited');
  var normalized = leadPureNormalizeCreate_(payload);
  if (!normalized.ok) throw leadError_(normalized.error);
  var row = normalized.row;
  var result = leadWithLock_(function () {
    // 같은 leadId 가 이미 있으면 그대로 돌려준다 — 폼의 재시도가 두 줄을 만들지 않게.
    var existing = leadRows_('문의').filter(function (item) { return String(item.leadId) === row.leadId; })[0];
    if (existing) return { receiptNo: existing.receiptNo, duplicate: true };
    leadCounter_(cache, 'lead-create:global', LEAD_CREATE_WINDOW_SECONDS);
    var now = leadNow_();
    var dateKey = leadSeoulDateKey_(new Date());
    var todayCount = leadRows_('문의').filter(function (item) { return String(item.receiptNo || '').indexOf('LD-' + dateKey + '-') === 0; }).length;
    row.receiptNo = leadPureReceiptNo_(dateKey, todayCount + 1);
    row.receivedAt = now;
    row.status = '신규';
    row.decidedAt = '';
    row.updatedAt = now;
    leadSaveRow_('문의', row);
    leadHistory_(row.leadId, '접수', '', '신규', row.emailDelivered === 'Y' ? '메일 발송됨' : '메일 미발송', 'site', '');
    return { receiptNo: row.receiptNo };
  });
  // 알림은 저장 뒤·잠금 밖에서. 실패해도 접수는 이미 끝났으므로 손님에게 오류를 돌려주지 않는다.
  if (!result.duplicate) leadNotify_(row);
  return result;
}

/* 새 문의 알림 메일(선택). LEAD_INBOX_NOTIFY_TO 가 비어 있으면 아무것도 하지 않는다.
   MailApp 은 배포 계정의 하루 발송 한도를 쓰므로, 한도가 차면 조용히 건너뛴다(접수는 이미 시트에 있다). */
function leadNotify_(row) {
  try {
    var to = String(leadProps_().getProperty('LEAD_INBOX_NOTIFY_TO') || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
    if (MailApp.getRemainingDailyQuota() < 1) return;
    var mail = leadPureNotifyMail_(row, LEAD_INBOX_PAGE_URL);
    MailApp.sendEmail({ to: to, subject: mail.subject, body: mail.body, name: '만물인테리어 문의 접수함', noReply: true });
  } catch (_) { /* 알림 실패는 접수 실패가 아니다 */ }
}

function leadHistory_(leadId, action, from, to, memo, actor, requestId) {
  leadSaveRow_('이력', {
    historyId: 'h_' + Utilities.getUuid(), leadId: leadId, at: leadNow_(), action: action,
    from: from || '', to: to || '', memo: memo || '', actor: actor || '', requestId: requestId || ''
  });
}

/* ── 로그인·세션 ─────────────────────────────────────────────── */
function leadLogin_(payload) {
  var code = String(payload.adminCode == null ? '' : payload.adminCode);
  var cache = CacheService.getScriptCache();
  var failKey = 'lead-login:fail';
  if ((Number(cache.get(failKey) || 0) || 0) >= LEAD_LOGIN_MAX_ATTEMPTS) throw leadError_('rate_limited');
  var expected = leadRequiredProperty_('LEAD_INBOX_ADMIN_CODE', 8);
  var shapeOk = leadPureAdminCodeShape_(code);
  // 형식이 틀려도 같은 HMAC 을 돌린다 — 응답 시간으로 형식 여부를 알 수 없게.
  var candidate = leadHmac_('LEAD_INBOX_LOGIN_PEPPER', shapeOk ? code : 'invalid');
  var reference = leadHmac_('LEAD_INBOX_LOGIN_PEPPER', expected);
  if (!shapeOk || !leadConstantTimeEqual_(candidate, reference)) {
    var failures = leadCounter_(cache, failKey, LEAD_LOGIN_LOCK_SECONDS);
    throw leadError_(failures >= LEAD_LOGIN_MAX_ATTEMPTS ? 'rate_limited' : 'invalid_credentials');
  }
  cache.remove(failKey);
  return leadWithLock_(function () {
    var nowMs = Date.now();
    var rawToken = leadRandomToken_();
    var session = {
      sessionId: 's_' + Utilities.getUuid(),
      tokenHash: leadHmac_('LEAD_INBOX_SESSION_SECRET', rawToken),
      issuedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + LEAD_SESSION_TTL_MS).toISOString(),
      revokedAt: ''
    };
    leadSaveRow_('세션', session);
    leadPruneSessions_();
    leadPruneLeads_();
    return { sessionToken: rawToken, expiresAt: nowMs + LEAD_SESSION_TTL_MS };
  });
}
function leadAuthenticate_(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length < 64 || rawToken.length > 256 || !/^[A-Za-z0-9_.-]+$/.test(rawToken)) throw leadError_('authentication_required');
  var tokenHash = leadHmac_('LEAD_INBOX_SESSION_SECRET', rawToken);
  var session = leadRows_('세션').filter(function (row) { return row.tokenHash === tokenHash && !row.revokedAt; })[0];
  if (!session || !(leadTime_(session.expiresAt) > Date.now())) throw leadError_('session_expired');
  return session;
}
function leadLogout_(session) {
  return leadWithLock_(function () {
    session.revokedAt = leadNow_();
    leadSaveRow_('세션', session);
    return { loggedOut: true };
  });
}
function leadPruneSessions_() {
  // 만료된 지 30일 지난 세션 행은 지운다 — 시트가 끝없이 자라지 않게.
  var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  var sheet = leadSheet_('세션');
  var rows = leadRows_('세션').filter(function (row) { return leadTime_(row.expiresAt) < cutoff; });
  rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (row) { sheet.deleteRow(row._row); });
}

/* ── 보관 기한(처리방침 privacy.html #privacy-lead-inbox-retention 과 같은 숫자) ──────────────
   거절된 문의는 판정일로부터 90일, 승인된 문의는 1년 뒤 문의·이력을 지운다. 신규·보류는 판정이 없으니 남긴다.
   로그인할 때마다 한 번, 그리고 leadInboxInstallTrigger_ 를 한 번 실행해 두면 매일 새벽에도 돈다. */
var LEAD_RETAIN_REJECTED_MS = 90 * 24 * 60 * 60 * 1000;
var LEAD_RETAIN_APPROVED_MS = 365 * 24 * 60 * 60 * 1000;
function leadPruneLeads_() {
  var now = Date.now();
  var gone = {};
  leadRows_('문의').forEach(function (row) {
    var decided = leadTime_(row.decidedAt);
    if (!isFinite(decided)) return;
    var status = String(row.status);
    var limit = status === '거절' ? LEAD_RETAIN_REJECTED_MS : (status === '승인' ? LEAD_RETAIN_APPROVED_MS : 0);
    if (limit && now - decided > limit) gone[String(row.leadId)] = row;
  });
  var ids = Object.keys(gone);
  if (!ids.length) return 0;
  var inquiry = leadSheet_('문의'), history = leadSheet_('이력');
  leadRows_('이력').filter(function (row) { return !!gone[String(row.leadId)]; })
    .sort(function (a, b) { return b._row - a._row; }).forEach(function (row) { history.deleteRow(row._row); });
  ids.map(function (id) { return gone[id]; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (row) { inquiry.deleteRow(row._row); });
  return ids.length;
}
function leadInboxDailyPrune() {
  return leadWithLock_(function () { return leadPruneLeads_(); });
}
function leadInboxInstallTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'leadInboxDailyPrune') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('leadInboxDailyPrune').timeBased().everyDays(1).atHour(4).create();
  return 'ok';
}

/* ── 조회·판정(관리자) ────────────────────────────────────────── */
function leadPresent_(row) {
  var out = {};
  LEAD_HEADERS['문의'].forEach(function (key) { out[key] = row[key] === undefined || row[key] === null ? '' : String(row[key]); });
  return out;
}
function leadList_(payload) {
  var status = String(payload.status || '전체');
  var rows = leadRows_('문의').filter(function (row) { return status === '전체' || String(row.status) === status; });
  // 같은 밀리초에 접수된 두 건은 시각으로 갈리지 않는다 — 나중에 붙은 행(행 번호 큰 쪽)이 위. 배포 게이트에서 실제로 걸렸다(2026-09-04).
  rows.sort(function (a, b) { var d = leadTime_(b.receivedAt) - leadTime_(a.receivedAt); return d || (b._row - a._row); });
  var counts = {};
  LEAD_STATUSES.forEach(function (s) { counts[s] = 0; });
  leadRows_('문의').forEach(function (row) { if (counts[String(row.status)] !== undefined) counts[String(row.status)] += 1; });
  return { leads: rows.slice(0, LEAD_LIST_LIMIT).map(leadPresent_), total: rows.length, counts: counts };
}
function leadGet_(payload) {
  var leadId = String(payload.leadId || '').toLowerCase();
  var row = leadRows_('문의').filter(function (item) { return String(item.leadId) === leadId; })[0];
  if (!row) throw leadError_('not_found');
  var history = leadRows_('이력').filter(function (item) { return String(item.leadId) === leadId; })
    .sort(function (a, b) { return leadTime_(a.at) - leadTime_(b.at); })
    .map(function (item) { return { at: String(item.at), action: String(item.action), from: String(item.from), to: String(item.to), memo: String(item.memo), actor: String(item.actor) }; });
  return { lead: leadPresent_(row), history: history };
}
function leadDecide_(session, payload) {
  var normalized = leadPureNormalizeDecision_(payload);
  if (!normalized.ok) throw leadError_(normalized.error);
  var value = normalized.value;
  return leadWithLock_(function () {
    // 같은 requestId 는 한 번만 — 두 번 눌러도 이력이 두 줄 생기지 않는다.
    var done = leadRows_('이력').filter(function (item) { return String(item.requestId) === value.requestId; })[0];
    var row = leadRows_('문의').filter(function (item) { return String(item.leadId) === value.leadId; })[0];
    if (!row) throw leadError_('not_found');
    if (done) return { lead: leadPresent_(row), duplicate: true };
    var from = String(row.status || '신규');
    if (!leadPureCanTransition_(from, value.decision)) throw leadError_('invalid_transition');
    var now = leadNow_();
    row.status = value.decision;
    row.decidedAt = now;
    row.updatedAt = now;
    leadSaveRow_('문의', row);
    leadHistory_(value.leadId, '판정', from, value.decision, value.memo, 'admin', value.requestId);
    return { lead: leadPresent_(row) };
  });
}

/* ── 최초 설치 (편집기에서 직접 1회 실행) ───────────────────────── */
function leadInboxSetupSheets_() {
  var ss = leadSpreadsheet_();
  Object.keys(LEAD_HEADERS).forEach(function (name) {
    var headers = LEAD_HEADERS[name];
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var actual = sheet.getLastRow() >= 1 ? sheet.getRange(1, 1, 1, headers.length).getValues()[0] : [];
    if (actual.join('') !== headers.join('')) {
      if (sheet.getLastRow() > 0 && actual.some(function (v) { return v !== ''; })) throw new Error('sheet ' + name + ' already has different headers');
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
  return 'ok';
}
