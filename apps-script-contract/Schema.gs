/** ============================================================
 * 만물인테리어 전자계약 — 시트 구조 정의 (contract-schema-v1)
 * ------------------------------------------------------------
 * 시트의 열 순서를 **여기 한 곳에서만** 정한다.
 * 코드가 열 번호를 직접 세면(예: row[3]) 열을 하나 끼워 넣는 순간
 * 금액 칸에 날짜가 들어가는 사고가 난다. 이름으로만 읽고 쓴다.
 *
 * 이 파일도 Pure.gs 처럼 바깥을 건드리지 않는다 —
 * 이전 스크립트(tools/migrate-sqlite-to-sheets.mjs)가 같은 정의를 읽어야
 * 시트와 이전 데이터의 열이 어긋나지 않는다.
 *
 * ⚠ 열을 바꿀 때: 뒤에 **추가만** 하라. 중간에 끼우거나 순서를 바꾸면
 *   이미 만들어진 시트와 어긋난다. 시트는 마이그레이션이 없다.
 * ============================================================ */

var SCHEMA_VERSION = 'contract-schema-v1';

var SHEETS = {
  CONTRACTS: 'Contracts',
  EVENTS: 'ContractEvents',
  PAYMENTS: 'Payments',
  TOKENS: 'SignTokens',
  SETTINGS: 'Settings'
};

/* Contracts — 계약 한 건이 한 줄.
   전화번호 원문은 없다. 마스킹본과 해시만 둔다. */
var COLS_CONTRACTS = [
  'id',                  // ct_xxxxx — 추측 불가한 무작위. 고객은 이 값으로 접근할 수 없다.
  'contractNo',          // MM-2026-0142 — 사람이 부르는 번호
  'title',
  'status',              // DRAFT | LOCKED | SENT | VIEWED | SIGNING | COMPLETED | VOID
  'amount',              // 원 단위 정수
  'customerName',
  'customerPhoneMasked', // 010-****-5678
  'customerPhoneHash',   // HMAC(번호, PEPPER) — 대조용, 역산 불가
  'operatorName',
  'bodyJson',            // 잠금 시점의 계약 본문(JSON 문자열). 잠금 후 불변.
  'docHash',             // SHA-256(canonicalJson({amount, body})) — 위변조 대조의 기준
  'lockedAt',
  'sentAt',
  'viewedAt',
  'signedAt',
  'completedAt',
  'voidedAt',
  'folderId',            // Drive 계약별 폴더 ID
  'originalFileId',      // 원본 계약서 파일 ID (잠금 시 생성, 이후 덮어쓰지 않음)
  'completedFileId',     // 완료 PDF 파일 ID (최신본)
  'completedFileVersion',// 완료본 판 번호 — 재발행 시 1씩 올리고 옛 파일은 남긴다
  'signerName',          // 고객이 직접 입력한 성명(마스킹 없음 — 계약 당사자 표기)
  'signatureSha256',     // 서명 PNG 원본의 SHA-256
  'signatureFileId',     // 서명 이미지 파일 ID
  'completedSha256',     // 완료 PDF 의 SHA-256
  'createdAt',
  'updatedAt'
];

/* ContractEvents — 덧붙이기만 하는 원장. 지우거나 고치지 않는다.
   "언제 무슨 일이 있었는가"의 증거이므로, 이 시트가 곧 감사 기록이다. */
var COLS_EVENTS = [
  'at',            // 서버 기준 시각(ISO8601) — 고객 기기 시계를 믿지 않는다
  'contractId',
  'event',         // 아래 EVENTS 참조
  'detail',        // 사람이 읽는 한 줄. 민감정보·토큰 금지.
  'uaHash',        // HMAC(User-Agent) — 원문은 남기지 않는다
  'requestHash',   // HMAC(요청 식별자) — 같은 요청의 재시도를 알아보기 위한 값
  'actor'          // admin | customer | system
];

/* Payments — 계약금·중도금·잔금 */
var COLS_PAYMENTS = [
  'contractId',
  'stage',        // down | mid | bal
  'label',        // 계약금 | 중도금 | 잔금
  'seq',          // 0 | 1 | 2
  'amount',
  'status',       // PENDING | INVOICED | PAID
  'invoicedAt',
  'paidAt',
  'memo',
  'updatedAt'
];

/* SignTokens — 고객 링크.
   ⚠ 토큰 원문은 이 시트 어디에도 없다. 발급 순간 한 번만 보여주고 해시만 남긴다.
   시트가 통째로 유출돼도 남의 계약을 열 수 없어야 한다. */
var COLS_TOKENS = [
  'id',
  'contractId',
  'purpose',      // sign | view
  'tokenHash',    // SHA-256(원문 토큰)
  'expiresAt',
  'usedAt',       // 1회 소진 시각 — 값이 있으면 다시 못 쓴다
  'revokedAt',
  'createdAt'
];

/* Settings — 비밀이 아닌 운영값만.
   API 키·관리자 토큰·PEPPER 는 여기 두지 않는다(스크립트 속성에 둔다).
   시트는 공유 링크 한 번이면 남이 볼 수 있는 곳이다. */
var COLS_SETTINGS = ['key', 'value', 'updatedAt'];

// 이 이름이 들어간 키는 시트에 쓰지 않고 거부한다. 실수로 붙여넣는 것을 막는 그물.
var SETTINGS_FORBIDDEN = ['TOKEN', 'SECRET', 'KEY', 'PEPPER', 'PASSWORD', 'PASSWD', 'APIKEY', 'CREDENTIAL'];

function isForbiddenSettingKey(key) {
  var k = String(key || '').toUpperCase();
  for (var i = 0; i < SETTINGS_FORBIDDEN.length; i++) {
    if (k.indexOf(SETTINGS_FORBIDDEN[i]) >= 0) return true;
  }
  return false;
}

/* 사건 이름 — contract-backend 의 audit 이벤트와 뜻을 맞춘다.
   "메시지가 전달됐다"와 "고객이 열었다"는 다른 사건이다. 섞으면 증거가 못 된다. */
var EVENTS = {
  CONTRACT_CREATED: 'CONTRACT_CREATED',
  CONTRACT_LOCKED: 'CONTRACT_LOCKED',
  SIGN_LINK_ISSUED: 'SIGN_LINK_ISSUED',
  SIGN_LINK_OPENED: 'SIGN_LINK_OPENED',
  SIGN_SUBMITTED: 'SIGN_SUBMITTED',
  CONTRACT_COMPLETED: 'CONTRACT_COMPLETED',
  CONTRACT_VOIDED: 'CONTRACT_VOIDED',
  PAYMENT_INVOICED: 'PAYMENT_INVOICED',
  PAYMENT_PAID: 'PAYMENT_PAID',
  MESSAGE_QUEUED: 'MESSAGE_QUEUED',
  MESSAGE_BLOCKED: 'MESSAGE_BLOCKED',   // 발송이 꺼져 있어 막힘 — 성공으로 기록하지 않는다
  BACKUP_EXPORTED: 'BACKUP_EXPORTED',
  ADMIN_AUTH_FAILED: 'ADMIN_AUTH_FAILED',
  TOKEN_REJECTED: 'TOKEN_REJECTED'
};

var SHEET_DEFS = [
  { name: SHEETS.CONTRACTS, cols: COLS_CONTRACTS },
  { name: SHEETS.EVENTS, cols: COLS_EVENTS },
  { name: SHEETS.PAYMENTS, cols: COLS_PAYMENTS },
  { name: SHEETS.TOKENS, cols: COLS_TOKENS },
  { name: SHEETS.SETTINGS, cols: COLS_SETTINGS }
];

var SCHEMA_EXPORTS = {
  SCHEMA_VERSION: SCHEMA_VERSION, SHEETS: SHEETS, SHEET_DEFS: SHEET_DEFS,
  COLS_CONTRACTS: COLS_CONTRACTS, COLS_EVENTS: COLS_EVENTS, COLS_PAYMENTS: COLS_PAYMENTS,
  COLS_TOKENS: COLS_TOKENS, COLS_SETTINGS: COLS_SETTINGS,
  EVENTS: EVENTS, SETTINGS_FORBIDDEN: SETTINGS_FORBIDDEN,
  isForbiddenSettingKey: isForbiddenSettingKey
};
