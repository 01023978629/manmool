/** ============================================================
 * 만물인테리어 전자계약 — 옛 자료 들여오기 (contract-migration-v1)
 * ------------------------------------------------------------
 * 하는 일:
 *   · Drive 에 올려 둔 CSV 한 장을 읽어 같은 이름의 시트에 **덧붙인다**
 *     (tools/migrate-sqlite-to-sheets.mjs 가 만든 Contracts.csv 등)
 *   · 이미 있는 줄은 건너뛴다. 그래서 **몇 번을 실행해도 두 번 들어가지 않는다**
 *   · 넣기 전 건수와 넣은 뒤 건수를 Logger 에 찍는다 — 사람이 눈으로 대조하라고 남기는 것이다
 *   · 쓰기 전에 Pure.gs 의 sheetSafe 를 통과시킨다(고객 이름의 =IMPORTXML 이 수식이 되는 것을 막는다)
 *
 * 하지 않는 일:
 *   · 값을 고치지 않는다. CSV 에 든 그대로 넣는다. 이상한 값은 이전 보고서(report.md)에 적혀 있고,
 *     그것을 어떻게 할지는 사장님이 정한다. 여기서 조용히 바로잡으면 원본과 어긋난 자료가 된다.
 *   · 이미 있는 줄을 **덮어쓰지 않는다.** 시트에는 되돌리기가 없다.
 *   · 줄을 지우지 않는다. 이 파일에 삭제는 없다.
 *   · Settings 시트에는 넣지 않는다. 비밀값이 섞여 들어올 자리를 아예 만들지 않는다.
 *   · 시트를 만들지 않는다. 없으면 멈춘다 — ensureSheets_() 를 먼저 실행하라는 뜻이다.
 *   · CSV 를 만들지 않는다. 그건 Node 도구(tools/)의 몫이다.
 *
 * 실행 방법(Apps Script 편집기에서):
 *   1) ensureSheets_()                       ← 시트와 머리행을 먼저 갖춘다
 *   2) importFromDriveFolder_('<폴더 id>')   ← out/ 의 CSV 4개를 올려 둔 Drive 폴더
 *      또는 importFromDriveCsv_('<파일 id>', 'Contracts')   ← 한 장씩
 *   3) 실행 기록(Logger)에서 '넣기 전 / 넣은 뒤' 건수를 report.md 의 표와 대조한다
 *
 * ⚠ 실행 1회에 6분 제한이 있다(PROTOCOL.md). 줄이 많으면 한 번에 다 못 넣는다.
 *   그때는 그냥 **다시 실행**하면 된다 — 이미 넣은 줄은 건너뛰고 남은 줄부터 이어 넣는다.
 * ============================================================ */

var MIGRATION_VERSION = 'contract-migration-v1';

// 한 번에 이만큼씩 붙인다. appendRow_ 로 한 줄씩 넣으면 왕복이 줄 수만큼 생겨
// 6분 제한 안에 몇백 줄도 못 넣는다. 한꺼번에 너무 크게 잡으면 한 번 실패할 때 손해가 크다.
var MIG_BATCH_ = 100;

// 실행 한 번에 넣을 최대 줄 수. 6분 제한에 걸려 도중에 끊기는 것보다,
// 정해진 만큼만 넣고 "다시 실행하세요"라고 말하는 편이 낫다.
var MIG_MAX_ROWS_ = 3000;

/* 시트마다 '같은 줄인지' 가르는 열.
   Payments 와 ContractEvents 에는 id 열이 없다 — 옛 DB 의 id 를 넣을 자리가 시트에 없기 때문이다.
   그래서 그 두 시트는 자연스러운 열쇠를 쓴다:
     · Payments      : 계약 하나에 회차 이름은 하나뿐이다(옛 DB 도 UNIQUE(contract_id,stage) 였다)
     · ContractEvents: 같은 시각·같은 계약·같은 사건·같은 내용이면 같은 줄로 본다 */
var MIG_KEYS_ = {
  Contracts: ['id'],
  Payments: ['contractId', 'stage'],
  SignTokens: ['id'],
  ContractEvents: ['at', 'contractId', 'event', 'detail']
};

// 시트에서 숫자로 두어야 하는 열. CSV 는 전부 글자로 오므로 여기서 되돌린다.
// 안 하면 금액이 글자로 들어가 시트에서 더하기가 안 된다.
var MIG_NUMBER_COLS_ = ['amount', 'seq', 'completedFileVersion'];

/* ============================================================
 * 1) CSV 한 장 → 시트 한 장
 * ------------------------------------------------------------
 * fileId    : Drive 파일 id
 * sheetName : Schema.gs 의 SHEETS 값 중 하나(Settings 제외)
 * ============================================================ */
function importFromDriveCsv_(fileId, sheetName) {
  var name = String(sheetName || '').trim();
  var keys = MIG_KEYS_[name];
  if (!keys) {
    throw new Error('여기로는 들여올 수 없는 시트입니다: ' + name +
      ' — 넣을 수 있는 곳: ' + Object.keys(MIG_KEYS_).join(', '));
  }

  var file = DriveApp.getFileById(String(fileId || '').trim());
  // 글자표를 UTF-8 로 못박는다. 안 하면 서버 기본값에 따라 한글 이름이 통째로 깨진다.
  var text = file.getBlob().getDataAsString('UTF-8');
  var table = Utilities.parseCsv(text);
  if (!table || table.length < 1) throw new Error('CSV 가 비어 있습니다: ' + file.getName());

  var sh = sheet_(name);                 // 없으면 여기서 멈춘다(ensureSheets_ 를 먼저 하라는 뜻)
  var header = header_(sh);
  var csvHead = table[0];

  // 열 이름이 시트에 없으면 멈춘다. 조용히 버리면 옮긴 줄 알았던 칸이 통째로 비어 있게 된다.
  var known = {};
  for (var h = 0; h < header.length; h++) if (header[h]) known[header[h]] = true;
  for (var c = 0; c < csvHead.length; c++) {
    var col = String(csvHead[c] || '').trim();
    if (!col) continue;
    if (!known[col]) {
      throw new Error(name + ' 시트에 없는 열이 CSV 에 있습니다: ' + col +
        ' — CSV 를 만든 Schema.gs 와 지금 시트의 머리행이 어긋납니다. ensureSheets_() 를 실행해 보세요');
    }
  }

  // 이미 있는 줄의 열쇠를 한 번에 모은다. 줄마다 시트를 뒤지면 왕복이 줄 수만큼 생긴다.
  var existing = migExistingKeys_(name, keys);
  var before = existing.count;

  var rows = [];            // 실제로 붙일 줄(시트 열 순서대로)
  var seenInFile = {};      // CSV 안에서 같은 줄이 두 번 나오는 경우
  var skippedExisting = 0, skippedDupInFile = 0, skippedEmpty = 0;
  var remaining = 0;

  for (var r = 1; r < table.length; r++) {
    if (rows.length >= MIG_MAX_ROWS_) { remaining++; continue; }   // 남은 줄은 다음 실행에서

    var obj = migRowObject_(csvHead, table[r]);
    if (!obj) { skippedEmpty++; continue; }

    var key = migKeyOf_(obj, keys);
    if (key === null) { skippedEmpty++; continue; }                // 열쇠 칸이 통째로 빈 줄
    if (existing.set[key]) { skippedExisting++; continue; }
    if (seenInFile[key]) { skippedDupInFile++; continue; }
    seenInFile[key] = true;

    // 수식 삽입 방지는 SheetService.gs 의 rowFromObject_ 안에서 sheetSafe 로 이뤄진다.
    // 여기서 따로 문자열을 만지지 않는 이유: 그물은 한 곳에만 있어야 새지 않는다.
    rows.push(rowFromObject_(header, obj, name));
  }

  /* 붙이기 — 뭉치로 쓴다. 맨 아래에만 붙이므로 이미 있는 줄을 건드릴 일이 없다.
     잠금을 잡는 이유: '마지막 줄이 몇 번인지 보고 그 다음 줄에 쓴다' 사이에 다른 실행이
     한 줄 붙이면, 우리가 그 줄을 덮어쓴다(고객 서명이 그 순간 들어올 수 있다).
     기다리지 않고 실패한다 — 기다렸다가 두 번 쓰는 것보다 낫다(PROTOCOL.md 동시성). */
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('BUSY|지금 다른 작업이 진행 중입니다 — 잠시 뒤 다시 실행하세요');
  }

  var written = 0;
  try {
    for (var i = 0; i < rows.length; i += MIG_BATCH_) {
      var chunk = rows.slice(i, i + MIG_BATCH_);
      var at = sh.getLastRow() + 1;                 // 뭉치마다 다시 본다
      sh.getRange(at, 1, chunk.length, header.length).setValues(chunk);
      written += chunk.length;
      SpreadsheetApp.flush();   // 도중에 6분 제한으로 끊겨도 여기까지는 남는다
    }
  } finally {
    lock.releaseLock();
  }

  var after = before + written;

  // 사람이 눈으로 대조할 자리. 이름·금액은 찍지 않는다 — 실행 기록도 남이 볼 수 있는 곳이다.
  Logger.log('[이전] ' + name + ' ← ' + file.getName());
  Logger.log('[이전] 넣기 전 ' + before + '줄 → 넣은 뒤 ' + after + '줄 (새로 넣음 ' + written + '줄)');
  Logger.log('[이전] 건너뜀: 이미 있음 ' + skippedExisting + ' · CSV 안 중복 ' + skippedDupInFile +
    ' · 빈 줄 ' + skippedEmpty + (remaining ? ' · 이번에 못 넣음 ' + remaining + '(다시 실행하세요)' : ''));

  return {
    ok: true,
    sheet: name,
    file: file.getName(),
    before: before,
    after: after,
    inserted: written,
    skippedExisting: skippedExisting,
    skippedDupInFile: skippedDupInFile,
    skippedEmpty: skippedEmpty,
    remaining: remaining     // 0 이 아니면 한 번 더 실행하라는 뜻
  };
}

/* ============================================================
 * 2) 폴더 하나 → 네 시트 한꺼번에
 * ------------------------------------------------------------
 * 순서가 중요하다. 계약을 먼저 넣어야 대금·링크·사건이 가리킬 계약이 시트에 있다.
 * (시트에 외래키는 없지만, 중간에 멈췄을 때 남는 모양이 덜 이상하다)
 * ============================================================ */
function importFromDriveFolder_(folderId) {
  var order = [
    { file: 'Contracts.csv', sheet: SHEETS.CONTRACTS },
    { file: 'Payments.csv', sheet: SHEETS.PAYMENTS },
    { file: 'SignTokens.csv', sheet: SHEETS.TOKENS },
    { file: 'ContractEvents.csv', sheet: SHEETS.EVENTS }
  ];

  var folder = DriveApp.getFolderById(String(folderId || '').trim());
  var out = [], missing = [], remaining = 0;

  for (var i = 0; i < order.length; i++) {
    var it = folder.getFilesByName(order[i].file);
    if (!it.hasNext()) { missing.push(order[i].file); continue; }
    var f = it.next();
    if (it.hasNext()) {
      // 같은 이름이 둘이면 어느 것을 넣었는지 알 수 없게 된다. 고르지 말고 멈춘다.
      throw new Error('폴더에 ' + order[i].file + ' 이(가) 두 개 이상 있습니다 — 하나만 남기고 다시 실행하세요');
    }
    var res = importFromDriveCsv_(f.getId(), order[i].sheet);
    remaining += res.remaining;
    out.push(res);
  }

  if (missing.length) Logger.log('[이전] 폴더에 없는 파일: ' + missing.join(', '));
  if (remaining) Logger.log('[이전] 아직 ' + remaining + '줄이 남았습니다 — 같은 명령을 한 번 더 실행하세요.');
  else Logger.log('[이전] 남은 줄 없음. 이전이 끝났습니다.');

  return { ok: missing.length === 0, results: out, missing: missing, remaining: remaining };
}

/* ============================================================
 * 3) 잔심부름
 * ============================================================ */

// 시트에 이미 있는 줄의 열쇠를 모은다. 시트를 한 번만 읽는다.
function migExistingKeys_(name, keys) {
  var rows = readAll_(name);
  var set = {};
  for (var i = 0; i < rows.length; i++) {
    var k = migKeyOf_(rows[i], keys);
    if (k !== null) set[k] = true;
  }
  return { set: set, count: rows.length };
}

// 열쇠 문자열. 값 안에 쉼표가 있어도 섞이지 않게 글자로 안 쓰이는 것으로 잇는다.
// 열쇠 칸이 전부 비어 있으면 null — 그런 줄은 같은 줄인지 가릴 수가 없다.
function migKeyOf_(obj, keys) {
  var parts = [], any = false;
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    v = (v == null) ? '' : String(v);
    if (v !== '') any = true;
    parts.push(v);
  }
  return any ? parts.join(' ') : null;
}

// CSV 한 줄 → 객체. 전부 비어 있으면 null.
// 숫자여야 하는 칸은 숫자로 되돌린다(금액이 글자로 들어가면 시트에서 더할 수 없다).
function migRowObject_(head, cells) {
  var o = {}, empty = true;
  for (var c = 0; c < head.length; c++) {
    var col = String(head[c] || '').trim();
    if (!col) continue;
    var v = cells[c] == null ? '' : cells[c];
    // 이전 도구가 붙여 둔 수식 방지 따옴표를 여기서 벗긴다.
    // 벗기지 않으면 rowFromObject_ 의 sheetSafe 를 지나 시트에 따옴표째 남고,
    // 읽을 때 sheetUnsafeStrip 이 한 겹만 벗겨 값이 어긋난다.
    v = sheetUnsafeStrip(v);
    if (String(v) !== '') empty = false;
    o[col] = (MIG_NUMBER_COLS_.indexOf(col) >= 0) ? migNumber_(v) : v;
  }
  return empty ? null : o;
}

// 빈칸은 빈칸으로 둔다(0 으로 만들지 않는다 — '아직 없음'과 '0원'은 다른 뜻이다).
function migNumber_(v) {
  var s = String(v == null ? '' : v).trim();
  if (s === '') return '';
  return normalizeAmount(s);   // 규칙은 Pure.gs 한 곳에만 둔다
}

/* Node 테스트용 이름 모음(Apps Script 에서는 아무도 읽지 않는다). */
var MIGRATION_EXPORTS = {
  MIGRATION_VERSION: MIGRATION_VERSION,
  MIG_KEYS_: MIG_KEYS_,
  importFromDriveCsv_: importFromDriveCsv_,
  importFromDriveFolder_: importFromDriveFolder_,
  migKeyOf_: migKeyOf_, migRowObject_: migRowObject_, migNumber_: migNumber_,
  migExistingKeys_: migExistingKeys_
};
