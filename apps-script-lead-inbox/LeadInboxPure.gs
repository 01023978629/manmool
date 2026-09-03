/* LeadInboxPure.gs — 문의 접수함의 순수 로직 (Apps Script · Node 양쪽에서 같은 파일)

   여기에는 Sheets·Cache·Properties 를 만지는 코드가 없다. 검증·정규화·상태 전이처럼
   "입력을 받아 값을 돌려주는" 것만 둔다. 그래서 Node 단위 테스트가 이 파일을 그대로
   읽어 검사할 수 있고, 서버(Code.gs)는 이 결과를 저장만 한다.

   설계 요점
   - 문의 본문은 손님이 쓴 그대로 보관하되, 시트 수식이 되는 첫 글자(= + - @ 탭 줄바꿈)는
     앞에 작은따옴표를 붙여 글자로 고정한다(거부하면 "-"로 시작하는 메모를 잃는다).
   - 상태는 넷뿐이다: 신규 → (승인 | 보류 | 거절), 보류 → 승인/거절, 거절 → 보류(되살림).
     승인은 되돌리지 않는다 — 현장으로 넘어간 뒤 기록이 사라지면 안 된다.
   - 접수번호 형식 LD-YYYYMMDD-NNNN. 날짜는 서울 기준(대표가 보는 시각과 같아야 한다). */

var LEAD_STATUSES = ['신규', '승인', '보류', '거절'];
var LEAD_TRANSITIONS = {
  '신규': ['승인', '보류', '거절'],
  '보류': ['승인', '거절'],
  '거절': ['보류'],
  '승인': []
};
var LEAD_TEXT_LIMITS = {
  name: 60, phone: 40, type: 20, service: 20, region: 120, area: 10, scope: 20, works: 300,
  budget: 40, movein: 40, live: 20, symptoms: 300, purpose: 40, visit: 80, memo: 2000,
  source: 40, sourcePage: 300, ctaId: 80, utm: 200, message: 6000, extra: 4000
};
var LEAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var LEAD_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function leadPureText_(value, max) {
  if (value === undefined || value === null) return '';
  var text = String(value).replace(LEAD_CONTROL_CHARS, '').trim();
  if (text.length > max) text = text.slice(0, max);
  // 시트 수식 주입 차단 — 손님 입력을 잃지 않으려고 거부 대신 글자로 고정한다.
  if (/^[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return text;
}

function leadPureDigits_(value) {
  var digits = String(value || '').replace(/[^0-9]/g, '').replace(/^82/, '0');
  return /^0\d{8,10}$/.test(digits) ? digits : '';
}

function leadPureFormatPhone_(digits) {
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2,3})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return digits.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3');
}

function leadPureJoin_(value, max) {
  if (Array.isArray(value)) {
    return leadPureText_(value.map(function (v) { return String(v || '').trim(); }).filter(Boolean).join(', '), max);
  }
  return leadPureText_(value, max);
}

/* 폼이 보내는 payload(인테리어·누수·관리사무소 파일럿 공통)를 시트 한 줄로 정규화한다.
   돌려주는 값: { ok:true, row } 또는 { ok:false, error, field }. */
function leadPureNormalizeCreate_(payload) {
  payload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  var leadId = String(payload.leadId || '').trim();
  if (!LEAD_ID_PATTERN.test(leadId)) return { ok: false, error: 'invalid_lead_id', field: 'leadId' };
  var phone = leadPureDigits_(payload.phone);
  if (!phone) return { ok: false, error: 'invalid_phone', field: 'phone' };
  if (payload.privacyConsent !== true && payload.consent !== true) return { ok: false, error: 'consent_required', field: 'privacyConsent' };
  var name = leadPureText_(payload.name, LEAD_TEXT_LIMITS.name);
  var type = leadPureText_(payload.type, LEAD_TEXT_LIMITS.type);
  var service = (type === '누수' || payload.source === 'leak-page') ? '누수'
    : (payload.source === 'office-pilot' ? '관리사무소' : '인테리어');
  var row = {
    leadId: leadId.toLowerCase(),
    name: name || '(이름 없음)',
    phone: leadPureFormatPhone_(phone),
    type: type,
    service: service,
    region: leadPureText_(payload.region, LEAD_TEXT_LIMITS.region),
    area: leadPureText_(payload.area, LEAD_TEXT_LIMITS.area),
    scope: leadPureText_(payload.scope, LEAD_TEXT_LIMITS.scope),
    works: leadPureJoin_(payload.works, LEAD_TEXT_LIMITS.works),
    budget: leadPureText_(payload.budget, LEAD_TEXT_LIMITS.budget),
    movein: leadPureText_(payload.movein, LEAD_TEXT_LIMITS.movein),
    live: leadPureText_(payload.live, LEAD_TEXT_LIMITS.live),
    symptoms: leadPureJoin_(payload.symptoms, LEAD_TEXT_LIMITS.symptoms),
    purpose: leadPureText_(payload.inquiryPurpose, LEAD_TEXT_LIMITS.purpose),
    visit: leadPureText_([payload.preferredVisitDate, payload.preferredVisitWindow].filter(Boolean).join(' · '), LEAD_TEXT_LIMITS.visit),
    memo: leadPureText_(payload.memo, LEAD_TEXT_LIMITS.memo),
    source: leadPureText_(payload.source, LEAD_TEXT_LIMITS.source),
    sourcePage: leadPureText_(payload.sourcePage, LEAD_TEXT_LIMITS.sourcePage),
    ctaId: leadPureText_(payload.ctaId, LEAD_TEXT_LIMITS.ctaId),
    utm: leadPureText_([payload.utmSource, payload.utmMedium, payload.utmCampaign].filter(Boolean).join(' / '), LEAD_TEXT_LIMITS.utm),
    emailDelivered: payload.emailDelivered === true ? 'Y' : 'N',
    message: leadPureText_(payload.message, LEAD_TEXT_LIMITS.message)
  };
  // 위에서 이름 붙이지 않은 나머지는 JSON 한 칸에 — 폼 항목이 늘어도 잃지 않는다.
  var consumed = ['leadId', 'name', 'phone', 'type', 'region', 'area', 'scope', 'works', 'budget', 'movein', 'live', 'symptoms',
    'inquiryPurpose', 'preferredVisitDate', 'preferredVisitWindow', 'memo', 'source', 'sourcePage', 'ctaId', 'utmSource', 'utmMedium',
    'utmCampaign', 'emailDelivered', 'message', 'privacyConsent', 'consent', 'status', 'submittedAt'];
  var extra = {};
  Object.keys(payload).forEach(function (key) {
    if (consumed.indexOf(key) >= 0) return;
    var v = payload[key];
    if (v === undefined || v === null || v === '' || typeof v === 'function') return;
    extra[key] = typeof v === 'string' ? v.slice(0, 500) : v;
  });
  var extraText = Object.keys(extra).length ? JSON.stringify(extra) : '';
  if (extraText.length > LEAD_TEXT_LIMITS.extra) extraText = extraText.slice(0, LEAD_TEXT_LIMITS.extra);
  row.extra = leadPureText_(extraText, LEAD_TEXT_LIMITS.extra);
  return { ok: true, row: row };
}

function leadPureReceiptNo_(dateKey, sequence) {
  var n = Math.max(1, Math.floor(Number(sequence) || 1));
  var pad = n < 10000 ? ('0000' + n).slice(-4) : String(n);
  return 'LD-' + String(dateKey) + '-' + pad;
}

/* 판정 요청 검증. decision 은 새 상태, memo 는 선택(거절은 사유 필수). */
function leadPureNormalizeDecision_(payload) {
  payload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  var leadId = String(payload.leadId || '').trim();
  if (!LEAD_ID_PATTERN.test(leadId)) return { ok: false, error: 'invalid_lead_id', field: 'leadId' };
  var requestId = String(payload.requestId || '').trim();
  if (!LEAD_ID_PATTERN.test(requestId)) return { ok: false, error: 'invalid_request_id', field: 'requestId' };
  var decision = String(payload.decision || '').trim();
  if (LEAD_STATUSES.indexOf(decision) < 0 || decision === '신규') return { ok: false, error: 'invalid_decision', field: 'decision' };
  var memo = leadPureText_(payload.memo, 500);
  if (decision === '거절' && !memo) return { ok: false, error: 'memo_required', field: 'memo' };
  return { ok: true, value: { leadId: leadId.toLowerCase(), requestId: requestId.toLowerCase(), decision: decision, memo: memo } };
}

function leadPureCanTransition_(from, to) {
  var allowed = LEAD_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.indexOf(to) >= 0;
}

/* 관리자 비밀번호 형식 — 8자 이상 64자 이하, 공백 없음. 서버는 이 뒤에 HMAC 으로만 비교한다. */
function leadPureAdminCodeShape_(code) {
  var value = String(code == null ? '' : code);
  return value.length >= 8 && value.length <= 64 && !/\s/.test(value);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LEAD_STATUSES: LEAD_STATUSES, LEAD_TRANSITIONS: LEAD_TRANSITIONS, LEAD_TEXT_LIMITS: LEAD_TEXT_LIMITS,
    leadPureText_: leadPureText_, leadPureDigits_: leadPureDigits_, leadPureFormatPhone_: leadPureFormatPhone_,
    leadPureNormalizeCreate_: leadPureNormalizeCreate_, leadPureReceiptNo_: leadPureReceiptNo_,
    leadPureNormalizeDecision_: leadPureNormalizeDecision_, leadPureCanTransition_: leadPureCanTransition_,
    leadPureAdminCodeShape_: leadPureAdminCodeShape_
  };
}
