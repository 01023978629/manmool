/** ============================================================
 * 만물인테리어 전자계약 — 드라이브 보관 계층 (contract-drive-v1)
 * ------------------------------------------------------------
 * 이 파일이 하는 일
 *   · DRIVE_FOLDER_ID 아래 '전자계약' 폴더와 계약별 폴더('<계약번호> <고객명>')를 갖춘다
 *   · 잠금 시점 본문을 PDF 로 보관        — 원본_<계약번호>.pdf
 *   · 고객 서명 이미지를 PNG 로 보관       — 서명_<계약번호>.png
 *   · 서명까지 담은 완료본을 판올림 보관    — 완료_<계약번호>_v1.pdf, _v2.pdf …
 *   · 증거 묶음을 JSON 으로 보관           — 증거_<계약번호>_v1.json
 *   · 백업 폴더('전자계약/백업')를 내어 주고, 일일 백업 트리거를 설치한다
 *
 * 이 파일이 하지 않는 일 (하려고 들면 두 곳이 갈라진다)
 *   · 시트를 읽거나 쓰지 않는다 → SheetService.gs.
 *     여기서 돌려주는 fileId·version·sha256 을 시트에 적는 것은 부르는 쪽
 *     (ContractService.gs · Sign.gs)의 몫이다. 저장과 기록의 책임을 한 함수에 섞으면
 *     '파일은 있는데 시트에 없다'와 '시트에 있는데 파일이 없다'를 구분할 수 없게 된다.
 *   · 계약 규칙(상태 전이·금액 계산·본문 검증)을 모른다 → Pure.gs / ContractService.gs
 *   · 해시를 직접 계산하지 않는다 → AuthService.gs.
 *     이 파일에서 Utilities.computeDigest 를 부르지 않는다(바이트 부호 처리를 두 곳에서
 *     반복하면 언젠가 한쪽만 틀린다 — Pure.gs bytesToHex 주석 참고).
 *   · **지우지 않는다. 옮기지 않는다.** 이 파일에는 setTrashed·removeFile·moveTo 가 없다.
 *     사장님이 손으로 정리해 둔 폴더 구조를 코드가 되돌리는 일이 없어야 하고,
 *     계약 서류는 애초에 지우는 물건이 아니다.
 *     (딱 하나 예외: installDailyBackup 이 자기가 만든 '트리거'를 지운다 — 파일이 아니다)
 *   · 덮어쓰지 않는다. 같은 이름이 이미 있으면 판을 올리거나 이름을 비켜 새 파일로 만든다.
 *
 * 저장 실패를 성공으로 기록하지 않는다
 *   createFile 이 null 을 주거나 getSize() 가 0 이면 그것도 실패다. 각 함수는 그 자리에서
 *   throw 한다. 서명 PNG 와 완료 PDF 는 **저장된 파일을 다시 읽어** 해시를 낸다 —
 *   증거가 되는 것은 우리가 메모리에서 만든 blob 이 아니라 드라이브에 실제로 남은 바이트다.
 *
 * 오류는 'CODE|한국어 메시지' 로 던진다(PROTOCOL.md 오류 코드표에 있는 코드만).
 *   ContractService.gs 가 이 오류를 감싸 다시 던지는 자리가 있어 메시지가 겹쳐 보일 수 있다.
 *   그래도 코드를 붙인다 — 이 파일의 오류가 Code.gs 까지 그대로 올라가는 경로
 *   (backupFolder_ 등)가 있고, 그때 코드가 없으면 앱은 전부 '그 외 오류'로 뭉갠다.
 *
 * 이름 규칙: 이 파일 안에서만 쓰는 것은 dv 로 시작한다.
 *   Apps Script 는 파일들이 전역을 함께 쓴다. 이름이 겹치면 경고 없이 한쪽이 덮어써진다.
 *
 * ⚠ 이 파일을 처음 실행하면 구글이 Drive 권한을 묻는다. 승인하지 않으면 저장이 전부 막힌다.
 * ============================================================ */

var DRIVE_VERSION = 'contract-drive-v1';

/* ---------- 이 파일의 상수 ---------- */
var DV_BASE_FOLDER = '전자계약';          // DRIVE_FOLDER_ID 바로 아래
var DV_BACKUP_FOLDER = '백업';            // '전자계약' 아래
var DV_NAME_MAX = 80;                     // 폴더·파일 이름에 넣는 사람 이름 길이 상한
var DV_UNIQUE_TRY = 50;                   // 같은 이름 회피 시도 횟수
var DV_VERSION_MAX = 99;                  // 완료본 판 번호 상한 — 이 이상은 사람이 볼 일이다
var DV_SIG_MAX_BYTES = 2 * 1024 * 1024;   // 서명 PNG 원본 2MB. Pure.gs validateSignInput 과 같은 뜻.
var DV_BACKUP_HANDLER = 'dailyBackupJob'; // 트리거가 부르는 함수 이름(아래에 정의되어 있다)
var DV_BACKUP_HOUR = 3;                   // 새벽 3시대. 사장님이 시트를 만지지 않는 시간.

// 고객 IP 를 남길 수 없다는 사실을 증거 파일에 그대로 적는다.
// 없는 것을 빈 문자열로 두면 나중에 "있었는데 비었다"로 오해된다(PROTOCOL.md '알아 두셔야 할 제약').
var DV_IP_NOTE = 'Apps Script 웹앱은 요청자 IP 를 제공하지 않음';

// 실행 한 번 동안만 쓰는 폴더 캐시. 실행이 끝나면 사라진다.
// getFoldersByName 왕복은 싸지 않다 — 6분 제한 안에서 아까운 시간이다.
var DV_FOLDER_CACHE_ = {};

/* ============================================================
 * 1) 폴더
 * ============================================================ */

/**
 * 계약 한 건의 폴더. '<DRIVE_FOLDER_ID>/전자계약/<계약번호> <고객명>'.
 *
 * 이미 folderId 가 적힌 계약이면 **그 폴더를 그대로 쓴다.** 이름으로 다시 찾지 않는 이유:
 * 사장님이 폴더 이름을 손으로 고쳤을 수 있는데, 이름으로 찾으면 그때 빈 폴더가 하나 더 생기고
 * 계약 서류가 두 곳으로 갈라진다. id 는 이름을 바꿔도 그대로다.
 * folderId 가 가리키는 폴더를 못 열면(지워졌거나 권한이 없으면) 멈추지 않고 새로 만든다 —
 * 서명 직전에 폴더 하나 때문에 계약이 막히는 것이 더 나쁘다.
 */
function contractFolder_(contract) {
  var c = contract || {};

  var known = dvText_(c.folderId);
  if (known) {
    var found = dvFolderById_(known);
    if (found) return found;
  }

  return dvChildFolder_(dvBaseFolder_(), dvFolderName_(c));
}

/** 백업 폴더 — '전자계약/백업'. 파일 이름(날짜)은 부르는 쪽이 정한다. */
function backupFolder_() {
  return dvChildFolder_(dvBaseFolder_(), DV_BACKUP_FOLDER);
}

// DRIVE_FOLDER_ID — 없으면 '서버 오류'가 아니라 '설정이 덜 됐다'이다.
// 사장님이 무엇을 해야 하는지가 다르므로 코드도 달라야 한다.
function dvRoot_() {
  if (DV_FOLDER_CACHE_.root) return DV_FOLDER_CACHE_.root;

  var id = cfg_('DRIVE_FOLDER_ID', '');
  if (!id) {
    throw dvFail_('NOT_CONFIGURED',
      'DRIVE_FOLDER_ID 가 설정되지 않았습니다 — 프로젝트 설정 ▸ 스크립트 속성에 추가하세요');
  }
  var f;
  try {
    f = DriveApp.getFolderById(id);
  } catch (e) {
    // 폴더 ID 를 오류 메시지에 싣지 않는다. 남의 드라이브 구조를 알려 줄 이유가 없다.
    throw dvFail_('NOT_CONFIGURED',
      'DRIVE_FOLDER_ID 폴더를 열지 못했습니다 — 폴더 ID 와 이 스크립트의 접근 권한을 확인하세요');
  }
  DV_FOLDER_CACHE_.root = f;
  return f;
}

function dvBaseFolder_() {
  if (DV_FOLDER_CACHE_.base) return DV_FOLDER_CACHE_.base;
  var f = dvChildFolder_(dvRoot_(), DV_BASE_FOLDER);
  DV_FOLDER_CACHE_.base = f;
  return f;
}

/**
 * 바로 아래 자식 폴더를 이름으로 찾고, 없으면 만든다. **있으면 쓴다 — 새로 만들지 않는다.**
 *
 * 휴지통에 든 폴더는 없는 것으로 본다. 드라이브 검색은 휴지통 항목도 함께 주는 경우가 있는데,
 * 지운 폴더에 새 계약서를 넣으면 30일 뒤 구글이 통째로 비우면서 같이 사라진다.
 */
function dvChildFolder_(parent, name) {
  var wanted = dvSafeName_(name);
  if (!wanted) throw dvFail_('SERVER_ERROR', '폴더 이름이 비어 있습니다');

  var key = 'f:' + parent.getId() + '/' + wanted;
  if (DV_FOLDER_CACHE_[key]) return DV_FOLDER_CACHE_[key];

  var it = parent.getFoldersByName(wanted);
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    DV_FOLDER_CACHE_[key] = f;
    return f;
  }

  var made;
  try {
    made = parent.createFolder(wanted);
  } catch (e) {
    throw dvFail_('SERVER_ERROR', '폴더를 만들지 못했습니다(' + wanted + '): ' + dvShort_(e));
  }
  if (!made) throw dvFail_('SERVER_ERROR', '폴더를 만들지 못했습니다(' + wanted + ')');
  DV_FOLDER_CACHE_[key] = made;
  return made;
}

// id 로 폴더 열기. 못 열면 null — 여기서 멈추지 않는다(부르는 쪽이 새로 만든다).
function dvFolderById_(id) {
  try {
    var f = DriveApp.getFolderById(String(id));
    if (!f || f.isTrashed()) return null;
    return f;
  } catch (e) {
    return null;
  }
}

// '<계약번호> <고객명>'. 번호가 없으면(있을 수 없지만) 계약 id 로 대신한다 —
// 이름 없는 폴더를 만들어 나중에 어느 계약 것인지 모르게 두지 않는다.
function dvFolderName_(c) {
  var no = dvText_(c.contractNo) || dvText_(c.id) || '무번호';
  var who = dvText_(c.customerName);
  return dvSafeName_(who ? (no + ' ' + who) : no);
}

/**
 * 드라이브 이름으로 쓸 수 없거나 쓰면 곤란한 글자를 턴다.
 * '/' 는 경로 구분자로 읽히고, 제어문자가 든 이름은 목록에서 찾을 수 없게 된다.
 * 앞뒤 공백과 마침표도 턴다 — 나중에 사람이 폴더를 찾을 때 걸림돌이 된다.
 * 고객이 이름 칸에 무엇을 넣었든 폴더 이름 하나 때문에 저장이 실패해서는 안 된다.
 *
 * ⚠ 붙임표(-)와 밑줄(_)은 건드리지 않는다. 계약번호가 MM-2026-0143 이고 파일 이름이
 *   원본_MM-2026-0143.pdf 라서, 이것들을 지우면 폴더·파일 이름이 계약번호와 달라져
 *   사장님이 눈으로 대조할 수 없게 된다.
 */
function dvSafeName_(v) {
  var s = String(dvText_(v));
  s = s.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ');
  s = s.replace(/\s+/g, ' ').replace(/^[.\s]+|[.\s]+$/g, '');
  if (s.length > DV_NAME_MAX) s = s.slice(0, DV_NAME_MAX);
  return s;
}

/* ============================================================
 * 2) 파일 저장 공통 — 여기를 지나지 않고 파일을 만들지 않는다
 * ============================================================ */

/**
 * 같은 이름이 이미 있으면 비켜 간다. '원본_MM-2026-0143.pdf' → '..._2.pdf' → '..._3.pdf'.
 *
 * 드라이브는 같은 이름의 파일을 몇 개든 허용한다. 이름이 겹치면 시트의 fileId 가 어느
 * 파일을 가리키는지 사람 눈으로는 구분할 수 없게 되고, 분쟁에서 "이게 그 파일이 맞느냐"는
 * 질문에 답하지 못한다. 겹치면 지우는 대신 비켜서 둘 다 남긴다.
 */
function dvUniqueName_(folder, wanted) {
  var name = dvSafeName_(wanted);
  if (!name) throw dvFail_('SERVER_ERROR', '파일 이름이 비어 있습니다');
  if (!dvNameTaken_(folder, name)) return name;

  var dot = name.lastIndexOf('.');
  var stem = dot > 0 ? name.slice(0, dot) : name;
  var ext = dot > 0 ? name.slice(dot) : '';

  for (var i = 2; i < DV_UNIQUE_TRY + 2; i++) {
    var cand = stem + '_' + i + ext;
    if (!dvNameTaken_(folder, cand)) return cand;
  }
  throw dvFail_('SERVER_ERROR', '같은 이름의 파일이 너무 많습니다: ' + name);
}

function dvNameTaken_(folder, name) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) {
    if (!it.next().isTrashed()) return true;   // 휴지통에 있는 것은 자리를 차지하지 않는다
  }
  return false;
}

/**
 * blob 을 폴더에 파일로 남기고, **정말 남았는지 확인한 뒤** 돌려준다.
 * createFile 이 null 을 주거나 크기가 0 이면 저장 실패로 다룬다 —
 * 0바이트 파일을 성공으로 적으면 시트에는 계약서가 있고 드라이브에는 빈 껍데기가 남는다.
 *
 * 크기가 0인 파일을 지우지 않는 이유: 이 파일에는 지우는 코드를 두지 않는다.
 * 실패한 흔적이 폴더에 남는 편이, 실패를 지워 없던 일로 만드는 것보다 낫다.
 */
function dvCreateFile_(folder, blob, wantedName) {
  var name = dvUniqueName_(folder, wantedName);
  blob.setName(name);

  var file;
  try {
    file = folder.createFile(blob);
  } catch (e) {
    throw dvFail_('SERVER_ERROR', name + ' 을(를) 저장하지 못했습니다: ' + dvShort_(e));
  }
  if (!file) throw dvFail_('SERVER_ERROR', name + ' 을(를) 저장하지 못했습니다(빈 결과)');

  var size = 0;
  try { size = Number(file.getSize()); } catch (e2) { size = 0; }
  if (!isFinite(size) || size <= 0) {
    throw dvFail_('SERVER_ERROR', name + ' 이(가) 0바이트로 저장되었습니다 — 저장 실패로 봅니다');
  }

  return { file: file, id: String(file.getId()), name: name, size: size };
}

/**
 * 저장된 파일을 **다시 읽어** 해시한다.
 * 우리가 만든 blob 을 해시하면 "만들 때 이랬다"까지만 말할 수 있다.
 * 증거로 쓸 값은 드라이브에 실제로 남은 바이트여야 한다.
 */
function dvFileSha256_(file, label) {
  var bytes;
  try {
    bytes = file.getBlob().getBytes();
  } catch (e) {
    throw dvFail_('SERVER_ERROR', label + ' 을(를) 다시 읽지 못했습니다: ' + dvShort_(e));
  }
  if (!bytes || !bytes.length) {
    throw dvFail_('SERVER_ERROR', label + ' 을(를) 다시 읽으니 비어 있습니다 — 저장 실패로 봅니다');
  }
  return sha256HexOfBytes(bytes);
}

/**
 * HTML 문자열을 PDF blob 으로.
 * 반드시 <meta charset="utf-8"> 이 든 문서를 넘겨야 한다(dvHtmlPage_ 가 넣는다).
 * 없으면 변환기가 한글을 깨뜨린 채 PDF 를 만들어 낸다 — 계약서가 통째로 못 쓰게 된다.
 */
function dvHtmlToPdf_(html, fileName) {
  try {
    return Utilities.newBlob(html, 'text/html', fileName).getAs('application/pdf');
  } catch (e) {
    throw dvFail_('SERVER_ERROR', 'PDF 로 변환하지 못했습니다: ' + dvShort_(e));
  }
}

/* ============================================================
 * 3) 원본 — 잠금 시점 본문
 * ============================================================ */
/**
 * 잠금(lockContract_) 때 한 번 만든다. contract 는 잠금 직후 모습이어야 한다
 * (status LOCKED, docHash, lockedAt, body 가 채워진 것).
 *
 * 이 파일은 **서명 전** 문서다. 나중에 완료본과 나란히 놓였을 때 어느 쪽이 무엇인지
 * 헷갈리면 안 되므로, 표지에 '서명 전 · 잠금 시점 보관본'이라고 적어 둔다.
 *
 * 돌려주는 값: { ok, fileId, fileName, folderId, sha256, bytes, at }
 *   — ContractService.gs 의 ctFileId_/ctFolderId_ 가 fileId·folderId 를 집어간다.
 */
function saveOriginal_(contract) {
  var c = contract || {};
  var body = dvBody_(c);
  if (!body) throw dvFail_('BAD_REQUEST', '계약 본문이 없어 원본을 만들 수 없습니다');

  var folder = contractFolder_(c);
  var no = dvText_(c.contractNo) || dvText_(c.id);
  var fileName = '원본_' + no + '.pdf';

  var blob = dvHtmlToPdf_(dvOriginalHtml_(c, body), fileName);
  var saved = dvCreateFile_(folder, blob, fileName);

  return {
    ok: true,
    fileId: saved.id,
    fileName: saved.name,
    folderId: String(folder.getId()),
    sha256: dvFileSha256_(saved.file, saved.name),
    bytes: saved.size,
    at: dvNow_()
  };
}

/* ============================================================
 * 4) 서명 이미지
 * ============================================================ */
/**
 * data URI(서명 캔버스가 만든 PNG)를 파일로 남긴다.
 *
 * 해시는 AuthService.gs 의 sha256HexOfDataUri 로 낸다 — base64 문자열이 아니라
 * **디코딩한 원본 바이트**의 해시다(그 파일 주석 참고). 저장한 뒤 파일을 다시 읽어
 * 같은 해시가 나오는지 대조한다. 다르면 저장이 어긋난 것이므로 실패로 다룬다.
 *
 * 오류 메시지에 이미지 내용을 절대 싣지 않는다. 고객의 자필이다.
 *
 * 돌려주는 값: { ok, fileId, fileName, folderId, sha256, bytes, at }
 */
function saveSignature_(contract, dataUri) {
  var c = contract || {};
  var s = String(dataUri == null ? '' : dataUri);

  // 형식을 여기서 다시 본다. Pure.gs 의 validateSignInput 이 이미 보지만, 저장 계층이
  // 검증을 남에게만 맡기면 다른 경로(재발행·이관 스크립트)로 들어온 값이 그대로 파일이 된다.
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(s)) {
    throw dvFail_('BAD_REQUEST', '서명 이미지 형식이 올바르지 않습니다(PNG data URI 가 아닙니다)');
  }

  var sha = sha256HexOfDataUri(s);   // 시트에 남길 값 — 고객이 제출한 그 이미지의 지문

  // 메일·복사붙여넣기를 거치면 base64 중간에 줄바꿈이 낀다. 디코딩 전에 턴다.
  var b64 = s.slice(s.indexOf(',') + 1).replace(/\s+/g, '');
  var bytes;
  try {
    bytes = Utilities.base64Decode(b64);
  } catch (e) {
    throw dvFail_('BAD_REQUEST', '서명 이미지를 디코딩하지 못했습니다');
  }
  if (!bytes || !bytes.length) throw dvFail_('BAD_REQUEST', '서명 이미지가 비어 있습니다');
  if (bytes.length > DV_SIG_MAX_BYTES) throw dvFail_('BAD_REQUEST', '서명 이미지가 너무 큽니다');

  // PNG 인지 앞 4바이트로 확인한다(89 50 4E 47). 확장자만 믿고 저장하면 내용이 다른 파일이
  // '.png' 이름을 달고 남아, 몇 달 뒤 열리지 않는 증거가 된다.
  if (!dvIsPng_(bytes)) {
    throw dvFail_('BAD_REQUEST', '서명 이미지가 PNG 가 아닙니다');
  }

  var folder = contractFolder_(c);
  var no = dvText_(c.contractNo) || dvText_(c.id);
  var fileName = '서명_' + no + '.png';

  var saved = dvCreateFile_(folder, Utilities.newBlob(bytes, 'image/png', fileName), fileName);

  var stored = dvFileSha256_(saved.file, saved.name);
  if (stored !== sha) {
    // 여기까지 왔다면 드라이브에 남은 것이 고객이 제출한 이미지가 아니다.
    // 그대로 두면 시트의 해시와 파일이 어긋난 채 '완료'로 적힌다.
    throw dvFail_('SERVER_ERROR', '서명 이미지가 저장 도중 어긋났습니다 — 다시 시도해 주세요');
  }

  return {
    ok: true,
    fileId: saved.id,
    fileName: saved.name,
    folderId: String(folder.getId()),
    sha256: sha,
    bytes: saved.size,
    at: dvNow_()
  };
}

function dvIsPng_(bytes) {
  if (!bytes || bytes.length < 8) return false;
  return (bytes[0] & 0xff) === 0x89 && (bytes[1] & 0xff) === 0x50
      && (bytes[2] & 0xff) === 0x4e && (bytes[3] & 0xff) === 0x47;
}

/* ============================================================
 * 5) 완료본 — 계약 원문 + 고객 정보 + 서명 + 해시
 * ============================================================ */
/**
 * sig 는 서명 한 건의 내용이다. Sign.gs 가 무엇을 넘기든 받아 적도록 이름을 여럿 인정한다
 * (두 파일을 각자 쓰다 보면 이름이 어긋나기 쉬운데, 그 때문에 완료 처리가 실패하면 안 된다):
 *   { signatureImage | dataUri | image, sha256 | signatureSha256, signedAt | at, signerName }
 *
 * **덮어쓰지 않는다.** 판을 올려 새 파일로 만들고 이전 판은 그대로 둔다.
 * 재발행은 "고쳐서 다시 준다"가 아니라 "그때 것도 남기고 새로 준다"여야 한다 —
 * 분쟁에서 고객이 들고 있는 것이 v1 일 수 있고, 그 v1 이 없으면 대조할 방법이 사라진다.
 *
 * 판 번호는 Contracts 시트의 completedFileVersion 이 정본이다. 여기서는 그 값 + 1 을 쓰되,
 * 같은 이름의 파일이 이미 있으면(앞선 실행이 시트를 고치기 전에 끊긴 경우) 더 올린다.
 * 시트에 적는 것은 부르는 쪽 몫이다 — 돌려주는 version 을 그대로 넣으면 된다.
 *
 * 돌려주는 값: { ok, fileId, fileName, folderId, version, sha256, bytes, at }
 */
function saveCompletedPdf_(contract, sig) {
  var c = contract || {};
  var g = sig || {};
  var body = dvBody_(c);
  if (!body) throw dvFail_('BAD_REQUEST', '계약 본문이 없어 완료본을 만들 수 없습니다');

  var folder = contractFolder_(c);
  var no = dvText_(c.contractNo) || dvText_(c.id);

  var prev = dvInt_(c.completedFileVersion, 0);
  if (prev < 0) prev = 0;
  var version = dvNextVersion_(folder, '완료_' + no + '_v', '.pdf', prev + 1);
  var fileName = '완료_' + no + '_v' + version + '.pdf';

  var blob = dvHtmlToPdf_(dvCompletedHtml_(c, body, g, version), fileName);
  var saved = dvCreateFile_(folder, blob, fileName);

  return {
    ok: true,
    fileId: saved.id,
    fileName: saved.name,
    folderId: String(folder.getId()),
    version: version,
    sha256: dvFileSha256_(saved.file, saved.name),
    bytes: saved.size,
    at: dvNow_()
  };
}

// 비어 있는 판 번호를 찾는다. 이름이 겹치면 파일을 지우는 대신 번호를 올린다.
function dvNextVersion_(folder, prefix, ext, start) {
  var n = dvInt_(start, 1);
  if (n < 1) n = 1;
  while (n <= DV_VERSION_MAX) {
    if (!dvNameTaken_(folder, prefix + n + ext)) return n;
    n++;
  }
  throw dvFail_('SERVER_ERROR', '완료본 판 번호가 ' + DV_VERSION_MAX + '을 넘었습니다 — 폴더를 확인해 주세요');
}

/* ============================================================
 * 6) 증거 묶음 JSON
 * ============================================================ */
/**
 * 각 시각·해시·uaHash·상태 이력을 한 파일에 모은다. 분쟁 시 이 파일 하나로 설명이 되어야 한다.
 *
 * ev 는 부르는 쪽이 아는 것을 담아 넘긴다(전부 선택):
 *   { events|history: [{at,event,detail,actor}…], uaHash, docHashSeen, signedAt,
 *     completedFileVersion|version, body, payments }
 *
 * 담지 않는 것과 그 이유:
 *   · 전화번호 원문 — 애초에 시스템 어디에도 없다(마스킹본만 담는다)
 *   · customerPhoneHash — 대조는 시트에서 한다. 밖으로 나가는 파일에 대조용 값을 늘리지 않는다.
 *   · 서명 이미지 base64 — 같은 폴더에 PNG 로 이미 있고 해시로 이어져 있다.
 *     여기에 또 넣으면 파일만 두 배가 되고, 증거의 강도는 그대로다.
 *
 * ★ 고객 IP 는 Apps Script 에서 얻을 수 없다. 그 사실을 필드로 적는다 —
 *   clientIp: null / clientIpNote. 빈 문자열로 두면 "있었는데 비었다"로 오해된다.
 *
 * 돌려주는 값: { ok, fileId, fileName, folderId, sha256, bytes, at }
 *   sha256 은 저장한 JSON 문자열의 지문이다. 나중에 이 파일이 손대지 않은 그대로인지 보는 근거.
 */
function saveEvidenceJson_(contract, ev) {
  var c = contract || {};
  var e = ev || {};

  var folder = contractFolder_(c);
  var no = dvText_(c.contractNo) || dvText_(c.id);
  var version = dvInt_(e.version, dvInt_(e.completedFileVersion, dvInt_(c.completedFileVersion, 1)));
  if (version < 1) version = 1;
  var fileName = '증거_' + no + '_v' + version + '.json';

  var pack = {
    kind: 'evidence',
    app: '만물인테리어 전자계약',
    versions: { drive: DRIVE_VERSION, schema: SCHEMA_VERSION, pure: PURE_VERSION },
    generatedAt: dvNow_(),

    contract: {
      id: dvText_(c.id),
      contractNo: dvText_(c.contractNo),
      title: dvText_(c.title),
      status: dvText_(c.status),
      amount: normalizeAmount(c.amount),
      customerName: dvText_(c.customerName),
      customerPhoneMasked: dvText_(c.customerPhoneMasked),
      operatorName: dvText_(c.operatorName),
      signerName: dvText_(e.signerName) || dvText_(c.signerName)
    },

    // 시각은 전부 서버(구글) 기준이다. 고객 기기의 시계는 어디에도 들어가지 않는다.
    times: {
      createdAt: dvText_(c.createdAt),
      lockedAt: dvText_(c.lockedAt),
      sentAt: dvText_(c.sentAt),
      viewedAt: dvText_(c.viewedAt),
      signedAt: dvText_(e.signedAt) || dvText_(c.signedAt),
      completedAt: dvText_(c.completedAt),
      voidedAt: dvText_(c.voidedAt)
    },

    hashes: {
      docHash: dvText_(c.docHash),                      // 잠금 때 발급한 문서 지문
      docHashSeen: dvText_(e.docHashSeen),              // 고객 화면이 들고 있던 지문 — 위와 같아야 한다
      signatureSha256: dvText_(c.signatureSha256),
      completedSha256: dvText_(e.completedSha256) || dvText_(c.completedSha256)
    },

    files: {
      folderId: String(folder.getId()),
      originalFileId: dvText_(c.originalFileId),
      signatureFileId: dvText_(c.signatureFileId),
      completedFileId: dvText_(e.completedFileId) || dvText_(c.completedFileId),
      completedFileVersion: version
    },

    body: dvBody_(c) || (e.body || null),
    payments: dvIsArray_(e.payments) ? e.payments : null,
    history: dvHistory_(e),

    uaHash: dvText_(e.uaHash),
    // ★ 없는 것은 없다고 적는다.
    clientIp: null,
    clientIpNote: DV_IP_NOTE,

    limits: [
      DV_IP_NOTE + ' — 예전 Fly 서버에서는 남기던 항목이다',
      '휴대폰 본인확인 절차는 이 계약 흐름에 포함되어 있지 않다 — 링크를 받은 사람이 서명했다는 것까지가 이 기록의 범위다',
      '모든 시각은 서버 기준이며 고객 기기의 시계가 아니다'
    ]
  };

  var json = JSON.stringify(pack);
  var saved = dvCreateFile_(folder, Utilities.newBlob(json, 'application/json', fileName), fileName);

  return {
    ok: true,
    fileId: saved.id,
    fileName: saved.name,
    folderId: String(folder.getId()),
    sha256: sha256Hex(json),
    bytes: saved.size,
    at: dvNow_()
  };
}

// 상태 이력. 이름이 events 든 history 든 받아 적고, 화면용 군더더기는 떼어 낸다.
function dvHistory_(e) {
  var src = dvIsArray_(e.events) ? e.events : (dvIsArray_(e.history) ? e.history : []);
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var r = src[i] || {};
    out.push({
      at: dvText_(r.at),
      event: dvText_(r.event),
      detail: dvText_(r.detail),
      actor: dvText_(r.actor)
    });
  }
  return out;
}

/* ============================================================
 * 7) 문서 그리기 — 본문은 반드시 escHtml 을 지난다
 * ============================================================ */

/**
 * 계약 본문에는 고객이 넣은 글자가 섞여 있다(현장 주소·성명·공사 범위).
 * PDF 로 변환하기 전 HTML 단계에서 <script> 나 태그가 살아 있으면
 * 변환기가 그것을 문서 구조로 읽어 계약서 모양이 통째로 무너진다.
 * 그래서 값은 **하나도 빠짐없이** Pure.gs 의 escHtml 을 지난 뒤에만 문자열에 붙인다.
 */
function dvEsc_(v) { return escHtml(v == null ? '' : v); }

// 줄바꿈을 살린다. escHtml 을 **먼저** 지난 뒤에 <br> 로 바꾼다(순서를 바꾸면 br 이 이스케이프된다).
function dvEscLines_(v) { return dvEsc_(v).replace(/\n/g, '<br>'); }

var DV_CSS = ''
  + '@page{size:A4;margin:18mm 15mm}'
  // 글꼴 이름을 여럿 적어 둔다. 변환기가 무엇을 쓰든 한글이 네모로 나오지 않게 하려는 것이다.
  + 'body{font-family:"Noto Sans KR","Nanum Gothic","Malgun Gothic",sans-serif;'
  + 'font-size:10.5pt;line-height:1.65;color:#1b1b1b;margin:0}'
  + 'h1{font-size:19pt;text-align:center;letter-spacing:6px;margin:0 0 6px}'
  + '.sub{text-align:center;font-size:9pt;color:#666;margin:0 0 6px}'
  + '.tag{text-align:center;font-size:9pt;color:#8a6b2f;margin:0 0 14px}'
  + 'table{width:100%;border-collapse:collapse;margin:0 0 12px}'
  + 'th{width:26%;text-align:left;background:#f5f3ef;border:1px solid #dcd7cd;padding:5px 8px;font-size:9.5pt;font-weight:bold}'
  + 'td{border:1px solid #dcd7cd;padding:5px 8px;font-size:9.5pt}'
  + 'td.num{text-align:right}'
  + 'h2{font-size:11pt;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #dcd7cd}'
  + 'h3{font-size:10pt;margin:10px 0 2px}'
  + 'p{margin:0 0 6px}'
  + '.hash{font-family:"Courier New",monospace;font-size:8pt;color:#444;word-break:break-all}'
  + '.sigbox{border:1px solid #dcd7cd;padding:8px;margin:10px 0}'
  + '.sigbox img{height:80px}'
  + '.foot{margin-top:14px;font-size:8.5pt;color:#777;line-height:1.5}';

function dvHtmlPage_(title, inner) {
  // charset 을 반드시 밝힌다 — 없으면 변환기가 한글을 깨뜨린다.
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">'
    + '<title>' + dvEsc_(title) + '</title><style>' + DV_CSS + '</style></head><body>'
    + inner + '</body></html>';
}

function dvRow_(k, v, num) {
  return '<tr><th>' + dvEsc_(k) + '</th><td' + (num ? ' class="num"' : '') + '>' + v + '</td></tr>';
}

// 계약 조항. {no,title,text} 가 표준이지만 문자열 한 줄로 오는 본문도 있어 둘 다 받는다
// (contract-backend/public/sign.html 이 같은 규칙으로 그린다 — 두 화면이 다르게 보이면 안 된다).
function dvClausesHtml_(body) {
  var cl = dvIsArray_(body.clauses) ? body.clauses : [];
  if (!cl.length) return '<p>— 계약 조항이 등록되지 않았습니다 —</p>';

  var h = '';
  for (var i = 0; i < cl.length; i++) {
    var c = cl[i];
    if (typeof c === 'string') { h += '<p>' + dvEscLines_(c) + '</p>'; continue; }
    var head = ((c && c.no != null) ? '제' + dvEsc_(c.no) + '조' : '')
      + ((c && c.title) ? ' (' + dvEsc_(c.title) + ')' : '');
    if (head.replace(/\s/g, '')) h += '<h3>' + head + '</h3>';
    h += '<p>' + dvEscLines_((c && c.text) || '') + '</p>';
  }
  return h;
}

// 계약 개요 표. 원본과 완료본이 같은 표를 쓴다 — 두 문서의 숫자가 달라 보이면 안 된다.
function dvSummaryTable_(c, body) {
  var op = body.operator || {};
  var pay = body.payment || {};
  var vatLabel = (body.vatIncluded === false) ? '부가세 별도' : '부가세 포함';

  return '<table>'
    + dvRow_('계약번호', dvEsc_(c.contractNo))
    + dvRow_('도급인(갑)', dvEsc_(body.customerName || c.customerName) + ' · ' + dvEsc_(c.customerPhoneMasked))
    + dvRow_('수급인(을)', dvEsc_(op.co || c.operatorName) + (op.rep ? ' (' + dvEsc_(op.rep) + ')' : '')
        + (op.bizNo ? ' · 사업자 ' + dvEsc_(op.bizNo) : ''))
    + dvRow_('현장', dvEsc_(body.site))
    + dvRow_('공사 범위', dvEsc_(body.scope))
    + dvRow_('계약금액', formatWon(c.amount) + '원 (' + vatLabel + ')', true)
    + dvRow_('계약금', formatWon(pay.down) + '원', true)
    + dvRow_('중도금', formatWon(pay.mid) + '원', true)
    + dvRow_('잔금', formatWon(pay.bal) + '원', true)
    + dvRow_('공사기간', dvEsc_(body.period))
    + dvRow_('하자보증', dvEsc_(body.warranty))
    + '</table>';
}

/** 원본(서명 전) 문서 */
function dvOriginalHtml_(c, body) {
  var inner = '<h1>공사 도급계약서</h1>'
    + '<p class="sub">' + dvEsc_(c.operatorName || '만물인테리어') + ' · 계약번호 ' + dvEsc_(c.contractNo) + '</p>'
    // 이 문서가 무엇인지 표지에 못박는다. 완료본과 나란히 놓였을 때 헷갈리면 안 된다.
    + '<p class="tag">[원본] 서명 전 · 잠금 시점 보관본</p>'
    + dvSummaryTable_(c, body)
    + '<h2>계약 전문</h2>'
    + dvClausesHtml_(body)
    + '<h2>문서 지문</h2>'
    + '<p class="hash">문서해시(SHA-256): ' + dvEsc_(c.docHash) + '</p>'
    + '<p class="foot">잠금 시각: ' + dvEsc_(dvWhen_(c.lockedAt)) + '<br>'
    + '이 문서는 잠금 시점의 계약 본문을 그대로 보관한 것입니다. 이후 본문은 변경되지 않습니다.<br>'
    + dvEsc_(body.note || '') + '</p>';

  return dvHtmlPage_('원본 ' + dvText_(c.contractNo), inner);
}

/** 완료본(서명 포함) 문서 */
function dvCompletedHtml_(c, body, sig, version) {
  var img = dvSigDataUri_(sig);
  var signedAt = dvText_(sig.signedAt) || dvText_(sig.at) || dvText_(c.signedAt);
  var signerName = dvText_(sig.signerName) || dvText_(c.signerName) || dvText_(body.customerName);
  var sigHash = dvText_(sig.sha256) || dvText_(sig.signatureSha256) || dvText_(c.signatureSha256);

  // 서명 이미지는 data URI 로 문서 안에 심는다. 바깥 파일을 참조하면 그 파일이 옮겨지거나
  // 권한이 바뀌는 순간 완료본에서 서명이 사라진다 — 계약서가 스스로 완결되어야 한다.
  // (변환기가 이미지를 그리지 못하는 경우에도 서명 PNG 원본과 해시는 같은 폴더에 따로 남는다)
  var sigHtml = img
    ? '<img src="' + img + '" alt="서명">'
    : '<span class="hash">[서명 이미지를 문서에 담지 못했습니다 — 같은 폴더의 서명 PNG 파일을 확인하세요]</span>';

  var inner = '<h1>공사 도급계약서</h1>'
    + '<p class="sub">' + dvEsc_(c.operatorName || '만물인테리어') + ' · 계약번호 ' + dvEsc_(c.contractNo) + '</p>'
    + '<p class="tag">[완료본 v' + dvEsc_(version) + '] 전자서명 체결본</p>'
    + dvSummaryTable_(c, body)
    + '<h2>계약 전문</h2>'
    + dvClausesHtml_(body)
    + '<h2>전자서명</h2>'
    + '<table>'
    + dvRow_('서명자', dvEsc_(signerName))
    + dvRow_('서명 시각', dvEsc_(dvWhen_(signedAt)))
    + dvRow_('체결 시각', dvEsc_(dvWhen_(c.completedAt || signedAt)))
    + '</table>'
    + '<div class="sigbox">' + sigHtml + '</div>'
    + '<h2>문서 지문</h2>'
    + '<p class="hash">문서해시(SHA-256): ' + dvEsc_(c.docHash) + '</p>'
    + (sigHash ? '<p class="hash">서명해시(SHA-256): ' + dvEsc_(sigHash) + '</p>' : '')
    + '<p class="foot">이 문서는 위 문서해시가 가리키는 계약 본문에 대하여 전자적으로 서명된 완료본입니다(제' + dvEsc_(version) + '판).<br>'
    // 이 문서가 증명하지 못하는 것을 문서 안에 적어 둔다. 나중에 과장된 주장에 쓰이지 않게 한다.
    + '기록된 모든 시각은 서버(구글) 기준입니다. 요청자 IP 는 ' + dvEsc_(DV_IP_NOTE) + '.<br>'
    + dvEsc_(body.note || '') + '</p>';

  return dvHtmlPage_('완료 ' + dvText_(c.contractNo) + ' v' + version, inner);
}

/**
 * 문서에 심어도 되는 서명 data URI 인지 확인한다.
 * 형식이 조금이라도 어긋나면 심지 않는다 — src 속성 안으로 따옴표가 섞여 들어가면
 * 그 순간부터 문서 구조가 우리 손을 떠난다.
 */
function dvSigDataUri_(sig) {
  var raw = String((sig && (sig.signatureImage || sig.dataUri || sig.image)) || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(raw)) return '';
  return raw.replace(/\s+/g, '');
}

/* ============================================================
 * 8) 일일 백업 트리거
 * ============================================================ */
/**
 * 트리거가 부르는 함수. ContractService.gs 의 exportBackup_ 을 하루 한 번 돌린다.
 *
 * 왜 exportBackup_ 을 직접 걸지 않는가: 이름이 밑줄로 끝나는 함수는 Apps Script 에서
 * '이 스크립트 안에서만 쓰는 것'이라는 뜻이라, 편집기의 실행 목록과 트리거 화면에 뜨지 않는다.
 * 사장님이 화면에서 트리거를 확인하거나 손으로 한 번 돌려 보려면 밑줄 없는 이름이 필요하다.
 *
 * ⚠ 실행 1회당 6분(PROTOCOL.md '알아 두셔야 할 제약'). exportBackup_ 은 시트를 통째로 읽어
 *   문자열로 만드는 일이라, 계약이 수천 건으로 늘면 이 한 번으로 6분을 넘겨 구글이 끊는다.
 *   그때는 시트별로 나눠 내보내도록 exportBackup_ 을 고쳐야 한다(그 함수 주석에 적혀 있다).
 *
 * 실패를 삼키지 않는다. 여기서 try/catch 로 감싸면 백업이 몇 달 동안 안 돌아도 아무도 모른다.
 * 그대로 던지면 구글이 사장님 계정으로 '실행 실패' 메일을 보낸다 — 그게 유일한 알림이다.
 */
function dailyBackupJob() {
  return exportBackup_({ at: new Date().toISOString(), actor: 'system' });
}

/**
 * 일일 백업 트리거를 설치한다. 손으로 한 번 실행하면 된다.
 *
 * 같은 함수의 트리거가 이미 있으면 지우고 다시 만든다. 지우지 않으면 실행할 때마다
 * 트리거가 하나씩 늘어 백업 파일이 하루 열 개씩 쌓인다.
 * (여기서 지우는 것은 '트리거'다. 파일과 폴더는 이 파일 어디서도 지우지 않는다)
 *
 * atHour 는 0~23. 구글은 정확히 그 시각이 아니라 그 시간대 안에서 알아서 돌린다.
 */
function installDailyBackup(atHour) {
  var hour = dvInt_(atHour, DV_BACKUP_HOUR);
  if (hour < 0 || hour > 23) hour = DV_BACKUP_HOUR;

  var removed = dvRemoveTriggers_(DV_BACKUP_HANDLER);

  var t = ScriptApp.newTrigger(DV_BACKUP_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .create();

  return {
    ok: true,
    handler: DV_BACKUP_HANDLER,
    hour: hour,
    removed: removed,
    triggerId: t ? String(t.getUniqueId()) : '',
    note: '실행 1회당 6분 제한이 있습니다 — 계약이 크게 늘면 백업을 나눠 돌리도록 고쳐야 합니다'
  };
}

function dvRemoveTriggers_(handler) {
  var all = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === handler) { ScriptApp.deleteTrigger(all[i]); n++; }
  }
  return n;
}

/* ============================================================
 * 9) 이 파일 안에서만 쓰는 잔손질
 * ============================================================ */

// 오류의 생김새를 한 곳에서만 정한다. 'CODE|한국어 설명' — Code.gs 가 첫 '|' 로 가른다.
function dvFail_(code, msg) {
  return new Error(String(code) + '|' + String(msg));
}
// 구글이 올려 준 오류 원문을 그대로 싣지 않는다. 짧게 자르고 스택은 버린다.
function dvShort_(err) {
  return String((err && err.message) || err).slice(0, 140);
}

// 시트에서 읽은 값은 sheetSafe 가 붙인 작은따옴표를 떼고 문자열로 만든다(Pure.gs).
function dvText_(v) {
  if (v instanceof Date) return v.toISOString();
  var s = sheetUnsafeStrip(v);
  return s == null ? '' : String(s);
}
function dvInt_(v, d) {
  var n = parseInt(v, 10);
  return isFinite(n) ? n : d;
}
function dvIsArray_(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

// 본문은 객체로 들어오기도(잠금 직후) 문자열로 들어오기도(시트에서 읽은 그대로) 한다.
function dvBody_(c) {
  if (c && c.body && typeof c.body === 'object') return c.body;
  var json = c && c.bodyJson;
  if (!json) return null;
  if (typeof json === 'object') return json;
  try {
    var b = JSON.parse(String(json));
    return (b && typeof b === 'object') ? b : null;
  } catch (e) { return null; }
}

function dvNow_() { return new Date().toISOString(); }
function dvTz_() { return Session.getScriptTimeZone() || 'Asia/Seoul'; }

// 문서에 찍는 시각은 사람이 읽는 형태로 바꾼다. ISO 문자열은 계약서에서 읽히지 않는다.
// 어느 시간대인지 함께 적는다 — 시각만 적힌 계약서는 분쟁에서 몇 시인지 다투게 된다.
function dvWhen_(iso) {
  var s = dvText_(iso);
  if (!s) return '';
  var ms = Date.parse(s);
  if (!isFinite(ms)) return s;
  return Utilities.formatDate(new Date(ms), dvTz_(), 'yyyy-MM-dd HH:mm:ss') + ' (' + dvTz_() + ')';
}

/* Node 테스트에서 집어갈 수 있게 이름을 모아 둔다(다른 파일과 같은 방식).
   이 파일은 순수하지 않다 — 테스트하려면 DriveApp·Utilities·ScriptApp 을 가짜로 넣어야 한다. */
var DRIVE_EXPORTS = {
  DRIVE_VERSION: DRIVE_VERSION,
  contractFolder_: contractFolder_, backupFolder_: backupFolder_,
  saveOriginal_: saveOriginal_, saveSignature_: saveSignature_,
  saveCompletedPdf_: saveCompletedPdf_, saveEvidenceJson_: saveEvidenceJson_,
  installDailyBackup: installDailyBackup, dailyBackupJob: dailyBackupJob,
  dvSafeName_: dvSafeName_, dvUniqueName_: dvUniqueName_, dvIsPng_: dvIsPng_,
  dvOriginalHtml_: dvOriginalHtml_, dvCompletedHtml_: dvCompletedHtml_,
  dvSigDataUri_: dvSigDataUri_, dvClausesHtml_: dvClausesHtml_
};
