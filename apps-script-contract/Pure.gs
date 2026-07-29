/** ============================================================
 * 만물인테리어 전자계약 — 순수 함수 계층 (contract-pure-v1)
 * ------------------------------------------------------------
 * 이 파일에는 **바깥 세상을 건드리지 않는 함수만** 둔다.
 * Sheets·Drive·Properties·Date.now 같은 것을 부르지 않는다.
 * 그래야 Node 에서 이 파일을 그대로 읽어 자동 테스트할 수 있다.
 *   → test/pure.test.mjs 가 이 파일을 vm 으로 평가해 검사한다.
 *     복사본을 만들지 않는다. 복사본은 반드시 원본과 어긋난다.
 *
 * 그래서 여기서 지키는 것:
 *   · import/export 를 쓰지 않는다 (Apps Script 는 모듈이 없다)
 *   · const/let 대신 var, 화살표함수 대신 function — Apps Script 편집기에
 *     붙여넣는 사람이 문법 오류로 막히는 일이 없게 한다
 *   · Utilities.* 를 부르지 않는다 (해시는 Crypto.gs 담당)
 *
 * 금액은 전부 **원 단위 정수**로 다룬다. 부동소수 반올림으로 1원이 새는 것을
 * 계약서에서는 허용하지 않는다.
 * ============================================================ */

var PURE_VERSION = 'contract-pure-v1';

/* ---------- 계약 상태 ---------- */
// contract-backend(SQLite)와 같은 이름을 쓴다. 이전 데이터가 그대로 들어와야 한다.
var STATUS = {
  DRAFT: 'DRAFT',          // 작성 중 — 본문 수정 가능
  LOCKED: 'LOCKED',        // 잠금 — 본문 확정, 해시 발급됨
  SENT: 'SENT',            // 서명 링크 발급됨
  VIEWED: 'VIEWED',        // 고객이 링크를 열었음(본인확인 아님)
  SIGNING: 'SIGNING',      // 서명 진행 중
  COMPLETED: 'COMPLETED',  // 서명 완료 — 이후 본문 불변
  VOID: 'VOID'             // 취소됨
};
var ALL_STATUS = [STATUS.DRAFT, STATUS.LOCKED, STATUS.SENT, STATUS.VIEWED,
                  STATUS.SIGNING, STATUS.COMPLETED, STATUS.VOID];

// 되돌릴 수 없는 상태. 여기 들어가면 본문도 상태도 되돌리지 않는다.
var TERMINAL_STATUS = [STATUS.COMPLETED, STATUS.VOID];

/* ---------- 대금 분할 ---------- */
// contract-backend/src/standard-contract.mjs 와 같은 비율. 바꾸면 이전 계약과 어긋난다.
var PAYMENT_RATIO = { down: 0.5, mid: 0.4, bal: 0.1 };
var PAYMENT_LABEL = { down: '계약금', mid: '중도금', bal: '잔금' };
var PAYMENT_SEQ = { down: 0, mid: 1, bal: 2 };

/**
 * 계약금·중도금·잔금으로 나눈다.
 * 잔금은 비율로 계산하지 않고 **나머지 전부**로 둔다 —
 * 그래야 셋을 더한 값이 총액과 1원도 어긋나지 않는다.
 */
function paymentPlan(total) {
  var t = normalizeAmount(total);
  var down = Math.round(t * PAYMENT_RATIO.down);
  var mid = Math.round(t * PAYMENT_RATIO.mid);
  var bal = t - down - mid;
  return [
    { stage: 'down', label: PAYMENT_LABEL.down, seq: PAYMENT_SEQ.down, amount: down },
    { stage: 'mid', label: PAYMENT_LABEL.mid, seq: PAYMENT_SEQ.mid, amount: mid },
    { stage: 'bal', label: PAYMENT_LABEL.bal, seq: PAYMENT_SEQ.bal, amount: bal }
  ];
}

// 금액 정규화 — 문자열·쉼표·소수점이 들어와도 원 단위 정수로 만든다.
// 음수와 비정상값은 0으로 떨어뜨린다(계약금액이 음수인 계약은 없다).
function normalizeAmount(v) {
  if (typeof v === 'number') {
    if (!isFinite(v) || v < 0) return 0;
    return Math.round(v);
  }
  var s = String(v == null ? '' : v).replace(/[,\s원]/g, '');
  var n = Number(s);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

// 미수금 = 아직 PAID 가 아닌 회차의 합.
function outstanding(payments) {
  var sum = 0;
  for (var i = 0; i < (payments || []).length; i++) {
    var p = payments[i] || {};
    if (String(p.status || '').toUpperCase() !== 'PAID') sum += normalizeAmount(p.amount);
  }
  return sum;
}

function sumPayments(payments) {
  var sum = 0;
  for (var i = 0; i < (payments || []).length; i++) sum += normalizeAmount((payments[i] || {}).amount);
  return sum;
}

/* ---------- 전화번호 ---------- */
// 원문은 어디에도 저장하지 않는다. 마스킹본과 해시만 남긴다.
function normPhone(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }

function isValidMobile(s) { return /^01[016789]\d{7,8}$/.test(normPhone(s)); }

// 010-****-5678 — 가운데만 가리고 뒤 4자리는 남긴다(사장님이 누구인지 알아보셔야 한다).
function maskPhone(s) {
  var d = normPhone(s);
  if (d.length < 8) return '***';
  return d.slice(0, 3) + '-****-' + d.slice(-4);
}

/* ---------- 시트 수식 삽입 방지 ---------- */
// 고객이 이름에 =IMPORTXML(...) 을 넣으면 시트를 여는 순간 그게 실행된다.
// 셀 값이 = + - @ 나 제어문자로 시작하면 작은따옴표를 앞에 붙여 '글자'로 못박는다.
// (작은따옴표는 시트에서 보이지 않고, 읽을 때 sheetUnsafeStrip 로 되돌린다)
var FORMULA_LEAD = /^[=+\-@\t\r\n]/;
function sheetSafe(v) {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  var s = String(v);
  if (FORMULA_LEAD.test(s)) return "'" + s;
  return s;
}
function sheetUnsafeStrip(v) {
  if (typeof v !== 'string') return v;
  if (v.charAt(0) === "'" && FORMULA_LEAD.test(v.slice(1))) return v.slice(1);
  return v;
}

/* ---------- HTML 이스케이프 ---------- */
// 고객 서명 화면은 계약 본문을 그대로 그린다. 본문에 <script> 가 있으면 안 된다.
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- 정규화 JSON (문서 지문의 근거) ---------- */
// 키 순서가 달라도 같은 내용이면 같은 해시가 나와야 한다.
// contract-backend/src/crypto.mjs 의 canonicalize 와 같은 규칙이다 — 다르면 이전 계약의
// 해시를 다시 계산했을 때 어긋나 "위변조"로 잘못 판정된다.
function canonicalJson(obj) {
  return JSON.stringify(canonicalSort_(obj));
}
function canonicalSort_(v) {
  if (Array.isArray(v)) {
    var out = [];
    for (var i = 0; i < v.length; i++) out.push(canonicalSort_(v[i]));
    return out;
  }
  if (v && typeof v === 'object') {
    var keys = Object.keys(v).sort();
    var o = {};
    for (var j = 0; j < keys.length; j++) o[keys[j]] = canonicalSort_(v[keys[j]]);
    return o;
  }
  return v;
}

// 문서 지문의 재료. 금액을 본문과 함께 묶는다 —
// 본문은 그대로 두고 금액만 바꿔치기하는 것을 막기 위해서다.
function docHashSource(amount, body) {
  return canonicalJson({ amount: normalizeAmount(amount), body: body });
}

/* ---------- 계약번호 ---------- */
// MM-2026-0142 형태. 사람이 전화로 불러줄 수 있어야 한다.
function makeContractNo(year, seq) {
  var y = parseInt(year, 10);
  var n = parseInt(seq, 10);
  if (!isFinite(y) || y < 2000 || y > 9999) throw new Error('계약번호 연도가 올바르지 않습니다');
  if (!isFinite(n) || n < 1 || n > 9999) throw new Error('계약번호 일련번호가 올바르지 않습니다(1~9999)');
  return 'MM-' + y + '-' + padLeft_(String(n), 4, '0');
}
function parseContractNo(s) {
  var m = /^MM-(\d{4})-(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  return { year: parseInt(m[1], 10), seq: parseInt(m[2], 10) };
}
function padLeft_(s, n, ch) {
  var out = String(s);
  while (out.length < n) out = ch + out;
  return out;
}

/* ---------- 바이트 → 16진수 ---------- */
// Utilities.computeDigest 는 부호 있는 바이트 배열을 준다(-128~127).
// & 0xff 를 빼먹으면 음수 바이트가 'ffffffb2' 처럼 8자리로 찍혀 해시가 통째로 어긋난다.
function bytesToHex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/* ---------- 토큰 상태 ---------- */
// 고객 링크는 한 번만 쓰이고, 기한이 지나면 죽는다.
// 이 판정은 순수하게 해 두어야 테스트로 못박을 수 있다.
function tokenState(row, nowIso) {
  if (!row) return 'unknown';
  if (row.revokedAt) return 'revoked';
  if (row.usedAt) return 'used';
  if (isExpired(nowIso, row.expiresAt)) return 'expired';
  return 'ok';
}
function isExpired(nowIso, expiresIso) {
  var now = Date.parse(nowIso);
  var exp = Date.parse(expiresIso);
  if (!isFinite(now) || !isFinite(exp)) return true;   // 판단이 안 되면 죽은 것으로 본다
  return now >= exp;
}

/* ---------- 상태 전이 ---------- */
// 완료·취소된 계약은 되돌리지 않는다. 본문 수정도 잠금 이후에는 막는다.
function canEditBody(contract) {
  if (!contract) return false;
  if (contract.lockedAt) return false;
  return String(contract.status || STATUS.DRAFT) === STATUS.DRAFT;
}
function isTerminal(status) {
  return TERMINAL_STATUS.indexOf(String(status || '')) >= 0;
}
// 허용되는 다음 상태만 통과시킨다. 모르는 전이는 거부한다(조용히 넘어가지 않는다).
var TRANSITIONS = {
  DRAFT: [STATUS.LOCKED, STATUS.VOID],
  LOCKED: [STATUS.SENT, STATUS.VOID],
  SENT: [STATUS.VIEWED, STATUS.SIGNING, STATUS.COMPLETED, STATUS.VOID],
  VIEWED: [STATUS.SIGNING, STATUS.COMPLETED, STATUS.VOID],
  SIGNING: [STATUS.COMPLETED, STATUS.VOID],
  COMPLETED: [],
  VOID: []
};
function canTransition(from, to) {
  var allowed = TRANSITIONS[String(from || '')];
  if (!allowed) return false;
  return allowed.indexOf(String(to || '')) >= 0;
}

/* ---------- 입력 검증 ---------- */
// 계약 생성 입력. 틀린 것은 전부 모아서 돌려준다 — 하나씩 고치게 하지 않는다.
function validateCreateInput(o) {
  var errs = [];
  var i = o || {};
  var title = String(i.title == null ? '' : i.title).trim();
  if (!title) errs.push('계약 제목이 비어 있습니다');
  if (title.length > 120) errs.push('계약 제목이 너무 깁니다(120자 이내)');

  var amount = normalizeAmount(i.amount);
  if (amount <= 0) errs.push('계약금액이 0원 이하입니다');
  if (amount > 10000000000) errs.push('계약금액이 100억을 넘습니다 — 자릿수를 확인하세요');

  var cname = String((i.customer && i.customer.name) || '').trim();
  if (!cname) errs.push('고객 성명이 비어 있습니다');
  if (cname.length > 40) errs.push('고객 성명이 너무 깁니다(40자 이내)');

  var cphone = (i.customer && i.customer.phone) || '';
  if (!isValidMobile(cphone)) errs.push('고객 휴대폰 번호 형식이 올바르지 않습니다');

  if (i.body != null && typeof i.body !== 'object') errs.push('계약 본문 형식이 올바르지 않습니다');

  return { ok: errs.length === 0, errors: errs, amount: amount, title: title, customerName: cname };
}

// 서명 제출 입력.
function validateSignInput(o) {
  var errs = [];
  var i = o || {};
  var name = String(i.signerName == null ? '' : i.signerName).trim();
  if (!name) errs.push('성명을 입력해 주세요');
  if (name.length > 40) errs.push('성명이 너무 깁니다');

  var img = String(i.signatureImage || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img)) errs.push('서명 이미지 형식이 올바르지 않습니다');
  // 빈 캔버스를 제출하는 것을 막는다. 투명 PNG 는 아주 작다.
  if (img.length < 1200) errs.push('서명이 비어 있습니다 — 직접 그려 주세요');
  if (img.length > 2 * 1024 * 1024) errs.push('서명 이미지가 너무 큽니다');

  if (i.agreed !== true) errs.push('계약 내용 동의에 체크해 주세요');
  if (!i.docHashSeen) errs.push('계약 지문이 없습니다 — 링크를 다시 열어 주세요');

  return { ok: errs.length === 0, errors: errs, signerName: name };
}

/* ---------- 표시용 ---------- */
function formatWon(n) {
  var v = normalizeAmount(n);
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* Node 테스트에서 집어갈 수 있게 이름을 모아 둔다.
   Apps Script 에서는 이 변수를 아무도 읽지 않으므로 영향이 없다. */
var PURE_EXPORTS = {
  PURE_VERSION: PURE_VERSION, STATUS: STATUS, ALL_STATUS: ALL_STATUS,
  TERMINAL_STATUS: TERMINAL_STATUS, PAYMENT_RATIO: PAYMENT_RATIO, TRANSITIONS: TRANSITIONS,
  paymentPlan: paymentPlan, normalizeAmount: normalizeAmount, outstanding: outstanding,
  sumPayments: sumPayments, normPhone: normPhone, isValidMobile: isValidMobile,
  maskPhone: maskPhone, sheetSafe: sheetSafe, sheetUnsafeStrip: sheetUnsafeStrip,
  escHtml: escHtml, canonicalJson: canonicalJson, docHashSource: docHashSource,
  makeContractNo: makeContractNo, parseContractNo: parseContractNo, bytesToHex: bytesToHex,
  tokenState: tokenState, isExpired: isExpired, canEditBody: canEditBody,
  isTerminal: isTerminal, canTransition: canTransition,
  validateCreateInput: validateCreateInput, validateSignInput: validateSignInput,
  formatWon: formatWon
};
