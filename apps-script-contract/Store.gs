/** ============================================================
 * 만물인테리어 전자계약 — 시트 저장 계층 (contract-store-v1)
 * ------------------------------------------------------------
 * 하는 일:
 *   · 스프레드시트를 열고, Schema.gs 의 SHEET_DEFS 대로 시트와 머리행을 만든다
 *   · 줄을 **이름으로** 읽고 쓴다(열 번호를 코드에 박지 않는다)
 *   · 쓸 때 sheetSafe, 읽을 때 sheetUnsafeStrip 을 반드시 통과시킨다
 *   · ContractEvents 에 사건을 덧붙인다(원장)
 *   · 스크립트 속성을 읽는다(props_ / cfg_)
 *
 * 하지 않는 일:
 *   · 계약 규칙을 모른다. 상태 전이·금액 계산·검증은 Pure.gs 와 Contracts.gs 가 한다.
 *     여기서 status 를 판단하거나 금액을 고치지 않는다.
 *   · Drive 를 만지지 않는다(Docs.gs 담당).
 *   · 줄을 지우지 않는다. 이 파일에 deleteRow 는 없다 — 계약 기록은 지우는 물건이 아니다.
 *   · 비밀값을 시트에 쓰지 않는다. Settings 시트에 금지어 키가 들어오면 거부한다.
 *   · LockService 를 잡지 않는다. 잠금은 동작 전체를 감싸야 하므로 부르는 쪽(Contracts.gs·
 *     Sign.gs)의 몫이다. 여기서 함수마다 잠그면 잠금이 잘게 쪼개져 아무 것도 못 막는다.
 *
 * ⚠ 열은 **뒤에 추가만** 한다(Schema.gs 참고). 중간에 끼우면 이미 쌓인 줄과 어긋난다.
 * ============================================================ */

var STORE_VERSION = 'contract-store-v1';

// 시트에서 숫자로 두는 열. 나머지는 전부 '일반 텍스트'로 못박는다.
// 왜: 시트는 '2026-07-29T09:00:00.000Z' 를 날짜로, 숫자만으로 된 긴 해시를 지수 표기
// 숫자로 바꿔 버린다. 그러면 증거로 쓸 값이 훼손된다. 반대로 금액과 회차는 사장님이
// 시트에서 직접 더하거나 정렬하실 수 있어야 하므로 숫자로 남긴다.
var NUMERIC_COLS_ = { amount: true, seq: true, completedFileVersion: true };

// 실행 한 번 동안만 쓰는 캐시. 실행이 끝나면 사라진다.
// openById 와 머리행 읽기는 매번 왕복 비용이 든다 — 6분 제한 안에서 아까운 시간이다.
var SS_CACHE_ = null;
var HEADER_CACHE_ = {};

/* ---------- 스크립트 속성 ---------- */
// 이름과 모양은 기존 사진 중계 릴레이(hyeonjang/apps-script/Code.gs)와 똑같이 맞춘다.
// 두 프로젝트를 오가며 고치는 사람이 헷갈리지 않게 하기 위해서다.
function props_() { return PropertiesService.getScriptProperties(); }
function cfg_(k, d) { var v = props_().getProperty(k); return (v == null || v === '') ? d : v; }

/* ---------- 스프레드시트 ---------- */

// 컨테이너 바인딩(getActive)이 아니라 ID 로 연다.
// 웹앱은 사장님이 시트를 열어 두지 않은 상태에서도 돌아야 하고, 나중에 스크립트만
// 다른 프로젝트로 옮겨도 같은 시트를 계속 보게 하려는 것이다.
function ss_() {
  var id = cfg_('SPREADSHEET_ID', '');
  if (!id) throw new Error('SPREADSHEET_ID 가 설정되지 않았습니다 — 프로젝트 설정 ▸ 스크립트 속성');
  if (SS_CACHE_ && SS_CACHE_.id === id) return SS_CACHE_.ss;
  var ss = SpreadsheetApp.openById(id);
  SS_CACHE_ = { id: id, ss: ss };
  return ss;
}

// 없는 시트를 여기서 몰래 만들지 않는다. 머리행 없는 시트가 생기면 그 뒤로
// 읽기·쓰기가 전부 엉뚱한 곳을 가리키기 때문이다. 없으면 멈추고 사람에게 알린다.
function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('시트가 없습니다: ' + name + ' — ensureSheets_() 를 먼저 실행하세요');
  return sh;
}

/**
 * Schema.gs 의 정의대로 시트를 갖춘다. 처음 한 번(또는 배포 후) 실행한다.
 *
 * 이미 있는 시트는 건드리지 않는다 — 사장님이 손으로 넣은 서식·메모가 날아가면 안 된다.
 * 딱 하나 예외: 정의에 열이 **뒤에 늘어난** 경우 오른쪽 끝에 이름만 덧붙인다.
 * 이건 기존 칸을 하나도 건드리지 않는 작업이고, 이게 없으면 새 열이 생겼을 때
 * appendRow_ 가 "시트에 없는 열입니다"로 멈춘 채 고칠 방법이 사라진다.
 *
 * 머리행 이름이 서로 어긋나면 **자동으로 고치지 않는다.** 여기서 순서를 맞추면
 * 이미 쌓인 줄의 값이 통째로 다른 열로 밀린다. 알리기만 하고 사람이 판단하게 둔다.
 */
function ensureSheets_() {
  var ss = ss_();
  var created = [], extended = [], mismatched = [];

  for (var i = 0; i < SHEET_DEFS.length; i++) {
    var def = SHEET_DEFS[i];
    var sh = ss.getSheetByName(def.name);

    if (!sh) {
      createSheet_(ss, def);
      created.push(def.name);
      continue;
    }

    var lastCol = sh.getLastColumn();
    var have = lastCol > 0 ? headerOf_(sh.getRange(1, 1, 1, lastCol).getValues()[0]) : [];
    var verdict = compareHeader_(have, def.cols);

    if (verdict === 'mismatch') { mismatched.push(def.name); continue; }
    if (verdict === 'extend') {
      var add = def.cols.slice(have.length);
      fitColumns_(sh, def.cols.length);
      sh.getRange(1, have.length + 1, 1, add.length).setValues([add]);
      sh.getRange(1, have.length + 1, 1, add.length).setFontWeight('bold');
      formatColumns_(sh, add, have.length + 1);
      extended.push(def.name + ' +' + add.join(','));
    }
  }

  HEADER_CACHE_ = {};   // 머리행이 바뀌었을 수 있다
  return { ok: mismatched.length === 0, created: created, extended: extended, mismatched: mismatched };
}

function createSheet_(ss, def) {
  var sh = ss.insertSheet(def.name);
  fitColumns_(sh, def.cols.length);
  sh.getRange(1, 1, 1, def.cols.length).setValues([def.cols]).setFontWeight('bold');
  sh.setFrozenRows(1);
  formatColumns_(sh, def.cols, 1);
  return sh;
}

/**
 * 시트의 열 개수를 정확히 need 개로 맞춘다.
 *
 * 새 시트는 26열로 만들어진다. Contracts 는 27열이라 이걸 안 늘리면 머리행을 쓰는
 * 순간 범위 밖이라며 멈춘다 — 첫 설치에서 바로 터지는 자리다.
 * 반대로 남는 빈 열은 지운다. 오른쪽 끝 빈 칸에 누가 실수로 무언가를 입력하면
 * getLastColumn() 이 흔들려 머리행을 잘못 읽게 되기 때문이다.
 */
function fitColumns_(sh, need) {
  var maxCol = sh.getMaxColumns();
  if (maxCol < need) sh.insertColumnsAfter(maxCol, need - maxCol);
  else if (maxCol > need) sh.deleteColumns(need + 1, maxCol - need);
}

function formatColumns_(sh, cols, startCol) {
  var rows = sh.getMaxRows();
  sh.getRange(1, startCol, rows, cols.length).setNumberFormat('@');   // 기본은 전부 텍스트
  for (var i = 0; i < cols.length; i++) {
    if (NUMERIC_COLS_[cols[i]]) sh.getRange(1, startCol + i, rows, 1).setNumberFormat('#,##0');
  }
}

// 'same/extra' → 손댈 것 없음 · 'extend' → 뒤에 추가만 · 'mismatch' → 사람이 볼 일
// have 가 want 보다 긴 경우(사장님이 메모 열을 손으로 붙인 경우)는 그대로 둔다.
// 우리는 그 열에 쓰지도 읽지도 않으므로 문제가 되지 않는다.
function compareHeader_(have, want) {
  var n = Math.min(have.length, want.length);
  for (var i = 0; i < n; i++) {
    if (String(have[i]) !== String(want[i])) return 'mismatch';
  }
  return have.length < want.length ? 'extend' : 'ok';
}

/* ---------- 머리행 ---------- */

// 머리행은 **시트에 실제로 적힌 것**을 기준으로 삼는다. Schema.gs 의 배열을 그대로
// 믿고 열 번호를 세면, 시트가 한 칸이라도 다를 때 금액 칸에 날짜가 들어간다.
function headerOf_(rowValues) {
  var out = [];
  for (var i = 0; i < rowValues.length; i++) out.push(String(rowValues[i] == null ? '' : rowValues[i]).trim());
  return out;
}

function header_(sh) {
  var key = sh.getSheetName();
  if (HEADER_CACHE_[key]) return HEADER_CACHE_[key];
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error('시트에 머리행이 없습니다: ' + key + ' — ensureSheets_() 를 실행하세요');
  var h = headerOf_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
  HEADER_CACHE_[key] = h;
  return h;
}

function colIndex_(header, key) {
  for (var i = 0; i < header.length; i++) if (header[i] === key) return i;
  return -1;
}

/* ---------- 셀 값 다듬기 ---------- */

// 시트는 값을 제 마음대로 되돌려 준다. 날짜 서식이 걸린 칸은 Date 객체로 온다.
// 코드 어디서나 같은 타입을 보게 ISO 문자열로 되돌린다.
// (형식이 텍스트로 잡혀 있으면 애초에 이 일이 없다 — formatColumns_ 참고)
function normalizeCell_(v) {
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return v;
}

/* ---------- 읽기 ---------- */

/**
 * 시트 한 장을 통째로 읽어 객체 배열로 돌려준다. 열은 **이름으로만** 찾는다.
 * 각 객체에 _rowIndex(시트 실제 행 번호, 머리행 포함 1-based)를 함께 넣는다 —
 * 읽고 고쳐서 updateRow_ 에 바로 넘길 수 있게 하기 위해서다.
 *
 * ⚠ 한계: 시트 전체를 한 번에 메모리로 올린다. 계약이 수천 건이 되면
 *   느려지고, 실행 6분 제한(PROTOCOL.md)에 걸릴 수 있다. 목록 화면처럼 자주 부르는
 *   곳에서는 그때 가서 연도별 시트 분리나 부분 읽기로 바꿔야 한다.
 *   지금 규모(1인 시공, 연 수십 건)에서는 이 단순함이 더 이롭다고 보고 둔 선택이다.
 *   한 줄만 찾을 때는 readAll_ 대신 findRow_ 를 써라 — 열 하나만 훑는다.
 */
function readAll_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  var header = header_(sh);
  if (lastRow < 2) return [];

  var values = sh.getRange(2, 1, lastRow - 1, header.length).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var o = objectFromRow_(header, values[r]);
    if (!o) continue;              // 손으로 지워 빈 껍데기만 남은 줄
    o._rowIndex = r + 2;
    out.push(o);
  }
  return out;
}

// 줄 하나를 객체로. 전부 비어 있으면 null 을 준다.
function objectFromRow_(header, row) {
  var o = {}, empty = true;
  for (var c = 0; c < header.length; c++) {
    var key = header[c];
    if (!key) continue;
    var v = normalizeCell_(row[c]);
    if (v !== '') empty = false;
    o[key] = sheetUnsafeStrip(v);   // 쓸 때 붙인 작은따옴표를 되돌린다
  }
  return empty ? null : o;
}

/**
 * key 열의 값이 value 인 **첫 줄**을 찾는다. 없으면 null.
 * 열 하나만 읽어 훑으므로 readAll_ 보다 훨씬 가볍다(id·tokenHash 조회용).
 *
 * 같은 값이 두 줄에 있으면 첫 줄만 준다. 그런 일이 생겼다면 데이터가 이미 깨진 것이므로
 * 조용히 합치거나 골라 주지 않는다. 뒤에서 사람이 알아볼 수 있게 그대로 둔다.
 *
 * 비교는 문자열로 한다(시트가 숫자로 되돌려 주는 경우가 있어서다).
 * ⚠ 토큰 대조는 이 함수로 해시를 찾은 뒤, 최종 확인은 Crypto.gs 의 constantTimeEq 로 하라.
 */
function findRow_(name, key, value) {
  var sh = sheet_(name);
  var header = header_(sh);
  var ci = colIndex_(header, key);
  if (ci < 0) throw new Error(name + ' 시트에 없는 열입니다: ' + key);

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  var col = sh.getRange(2, ci + 1, lastRow - 1, 1).getValues();
  var want = String(value == null ? '' : value);
  for (var i = 0; i < col.length; i++) {
    var cell = String(sheetUnsafeStrip(normalizeCell_(col[i][0])));
    if (cell !== want) continue;
    var rowIndex = i + 2;
    var obj = objectFromRow_(header, sh.getRange(rowIndex, 1, 1, header.length).getValues()[0]);
    if (!obj) return null;
    obj._rowIndex = rowIndex;
    return { rowIndex: rowIndex, obj: obj };
  }
  return null;
}

/* ---------- 쓰기 ---------- */

/**
 * 줄 하나를 맨 아래에 붙인다. 돌려주는 값은 그 줄의 시트 행 번호.
 * obj 에 시트에 없는 열이 있으면 **멈춘다.** 조용히 버리면 저장된 줄 알았던 값이
 * 사라져 나중에 계약서와 기록이 어긋난다. 시끄럽게 실패하는 편이 낫다.
 * '_' 로 시작하는 키(readAll_ 이 붙인 _rowIndex 등)는 시트 밖 정보라 그냥 지나친다.
 */
function appendRow_(name, obj) {
  var sh = sheet_(name);
  var header = header_(sh);
  if (name === SHEETS.SETTINGS) assertSettingKeyAllowed_((obj || {}).key);
  var row = rowFromObject_(header, obj, name);
  sh.appendRow(row);   // 마지막 줄 뒤에 붙인다 — 기존 줄을 덮어쓸 일이 없다
  return sh.getLastRow();
}

function rowFromObject_(header, obj, name) {
  var src = obj || {};
  var known = {};
  for (var i = 0; i < header.length; i++) if (header[i]) known[header[i]] = true;

  var keys = Object.keys(src);
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].charAt(0) === '_') continue;
    if (!known[keys[k]]) {
      throw new Error(name + ' 시트에 없는 열입니다: ' + keys[k] +
        ' — Schema.gs 에 열을 뒤에 추가하고 ensureSheets_() 를 다시 실행하세요');
    }
  }

  var row = [];
  for (var c = 0; c < header.length; c++) {
    var col = header[c];
    var has = col && Object.prototype.hasOwnProperty.call(src, col);
    row.push(has ? sheetSafe(src[col]) : '');   // 수식 삽입 방지는 여기 한 곳에서
  }
  return row;
}

/**
 * 이미 있는 줄에서 patch 에 담긴 열**만** 고친다. 돌려주는 값은 고친 칸 수.
 *
 * 줄 전체를 다시 쓰지 않는 이유: 읽은 뒤 쓰기 전 사이에 다른 실행이 같은 줄의 다른 열을
 * 바꿨다면, 통째로 쓰는 순간 그 값이 되돌아간다(lost update). 칸 단위로 쓰면 그 일이 없다.
 * 대신 칸마다 왕복이 생기므로 patch 는 작게 유지하라.
 */
function updateRow_(name, rowIndex, patch) {
  var sh = sheet_(name);
  var header = header_(sh);
  var r = parseInt(rowIndex, 10);

  if (!isFinite(r) || r < 2) throw new Error('고칠 수 없는 행 번호입니다: ' + rowIndex + ' (머리행은 1행)');
  if (r > sh.getLastRow()) throw new Error('없는 행입니다: ' + r);

  if (name === SHEETS.SETTINGS) {
    // patch 에 key 가 없으면 그 줄에 이미 적힌 key 로 검사한다.
    var kIdx = colIndex_(header, 'key');
    var effectiveKey = (patch && patch.key != null)
      ? patch.key
      : (kIdx >= 0 ? sh.getRange(r, kIdx + 1).getValue() : '');
    assertSettingKeyAllowed_(effectiveKey);
  }

  var p = patch || {};
  var keys = Object.keys(p);
  var changed = 0;
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.charAt(0) === '_') continue;
    var ci = colIndex_(header, key);
    if (ci < 0) {
      throw new Error(name + ' 시트에 없는 열입니다: ' + key +
        ' — Schema.gs 에 열을 뒤에 추가하고 ensureSheets_() 를 다시 실행하세요');
    }
    sh.getRange(r, ci + 1).setValue(sheetSafe(p[key]));
    changed++;
  }
  return changed;
}

// 비밀값이 시트로 새는 마지막 그물. Code.gs 의 settings.set 에서도 막지만,
// 막는 곳이 한 곳뿐이면 언젠가 그 한 곳을 지나치는 경로가 생긴다.
function assertSettingKeyAllowed_(key) {
  if (isForbiddenSettingKey(key)) {
    throw new Error('이 이름의 설정은 시트에 저장할 수 없습니다 — 스크립트 속성에 두세요');
  }
}

/* ---------- 사건 원장 ---------- */

/**
 * ContractEvents 에 한 줄 덧붙인다. **덧붙이기만 한다** — 이 파일 어디에도 이 시트를
 * 고치거나 지우는 코드는 없다. 이 시트가 곧 "언제 무슨 일이 있었는가"의 증거다.
 *
 * 실패하면 예외를 그대로 올린다(삼키지 않는다). 기록을 못 남긴 동작은 증거가 없는
 * 동작이고, 전자계약에서 증거 없는 완료 처리는 안 한 것만 못하다. 부르는 쪽이
 * 잠금 안에서 함께 실패하고 SERVER_ERROR 로 돌려주는 편이 맞다.
 *
 * ctx = { at, uaHash, requestHash, actor } — 시각은 서버에서 만든 것을 그대로 쓴다.
 * ctx.at 이 없을 때만 여기서 만든다. 고객 기기 시계는 절대 쓰지 않는다.
 */
function logEvent_(contractId, event, detail, ctx) {
  var c = ctx || {};
  var ev = String(event == null ? '' : event).trim();
  if (!ev) throw new Error('사건 이름이 비어 있습니다(Schema.gs 의 EVENTS 를 쓰세요)');

  appendRow_(SHEETS.EVENTS, {
    at: c.at || new Date().toISOString(),
    contractId: contractId == null ? '' : String(contractId),
    event: ev,
    detail: scrubDetail_(detail),
    uaHash: c.uaHash || '',
    requestHash: c.requestHash || '',
    actor: c.actor || 'system'
  });
}

/**
 * detail 은 사람이 읽는 한 줄이다. 여기에 토큰이나 전화번호 원문이 실려 들어오는 것을
 * 막는다. 부르는 쪽이 조심하는 것만으로는 부족하다 — 조심은 언젠가 빠뜨린다.
 *
 * 가리는 것과 남기는 것을 일부러 갈랐다:
 *   · 전화번호 꼴 → maskPhone (010-****-5678). 누구인지 알아볼 수는 있게 남긴다.
 *   · 24자 이상의 base64url 덩어리 → *** (토큰·Drive 파일 ID). 다만 16진수 해시는
 *     그대로 둔다 — docHash 는 원장에 남아야 나중에 대조할 수 있다.
 *   · 12자리 이상 숫자 → ***. 9자리로 자르지 않는 이유는 계약금액이 최대 11자리(100억)라
 *     금액과 구분이 안 되기 때문이다. 그래서 10~11자리 계좌번호는 못 거른다. 완벽하지 않다.
 */
function scrubDetail_(detail) {
  if (detail == null) return '';
  var s = (typeof detail === 'object') ? canonicalJson(detail) : String(detail);

  s = s.replace(/(^|[^0-9])(01[016789])[-. ]?(\d{3,4})[-. ]?(\d{4})(?![0-9])/g,
    function (m, pre, a, b, c) { return pre + maskPhone(a + b + c); });
  s = s.replace(/\d{12,}/g, '***');
  s = s.replace(/[A-Za-z0-9_-]{24,}/g,
    function (m) { return /^[0-9a-f]{32,64}$/.test(m) ? m : '***'; });

  return s.slice(0, 300);   // 원장은 한 줄이다. 길면 읽지 않게 되고, 읽지 않으면 증거가 아니다.
}

/* ---------- 계약번호 ---------- */

/**
 * 그 해의 **마지막 번호 + 1**. 개수를 세지 않는다 —
 * 취소(VOID)된 계약이 있어도 그 번호를 다시 쓰면 안 되기 때문이다.
 * 같은 번호의 계약서가 둘 있으면 그 순간 두 장 다 증거로 못 쓴다.
 *
 * ⚠ 이 함수는 **읽고 나서 그 번호로 줄을 쓰기까지의 사이가 비어 있다.**
 *   그래서 부르는 쪽(Contracts.gs 의 createContract_)은 반드시
 *   LockService.getScriptLock() 을 잡은 상태여야 한다(PROTOCOL.md 동시성 항목).
 *   잠금 없이 두 요청이 겹치면 같은 번호를 두 번 돌려준다. 이 함수는 그것을 막지 못한다.
 */
function nextContractSeq_(year) {
  var y = parseInt(year, 10);
  if (!isFinite(y) || y < 2000 || y > 9999) throw new Error('계약번호 연도가 올바르지 않습니다: ' + year);

  var sh = sheet_(SHEETS.CONTRACTS);
  var header = header_(sh);
  var ci = colIndex_(header, 'contractNo');
  if (ci < 0) throw new Error('Contracts 시트에 contractNo 열이 없습니다');

  var lastRow = sh.getLastRow();
  var max = 0;
  if (lastRow >= 2) {
    var col = sh.getRange(2, ci + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      var parsed = parseContractNo(String(sheetUnsafeStrip(normalizeCell_(col[i][0]))));
      if (parsed && parsed.year === y && parsed.seq > max) max = parsed.seq;
    }
  }

  var next = max + 1;
  // makeContractNo 가 4자리까지만 만든다. 한 해 9999건을 넘길 일은 없지만,
  // 넘겼는데 조용히 5자리로 늘어나면 이전 번호 체계와 어긋난다.
  if (next > 9999) throw new Error(y + '년 계약번호를 모두 사용했습니다(9999)');
  return next;
}

/* Node 테스트용 이름 모음. 이 파일은 순수하지 않다 —
   테스트하려면 SpreadsheetApp 과 PropertiesService 를 가짜로 만들어 넣어야 한다. */
var STORE_EXPORTS = {
  STORE_VERSION: STORE_VERSION,
  ss_: ss_, sheet_: sheet_, ensureSheets_: ensureSheets_, readAll_: readAll_,
  appendRow_: appendRow_, findRow_: findRow_, updateRow_: updateRow_,
  logEvent_: logEvent_, nextContractSeq_: nextContractSeq_, cfg_: cfg_, props_: props_,
  scrubDetail_: scrubDetail_, compareHeader_: compareHeader_, headerOf_: headerOf_
};
