/** ============================================================
 * 만물인테리어 전자계약 — 계약 살림 (contract-contracts-v1)
 * ------------------------------------------------------------
 * 이 파일이 하는 일
 *   · 계약 생성(DRAFT)과 대금 3회차(계약금·중도금·잔금) 등록
 *   · 계약 1건 조회 / 목록(요약)
 *   · 잠금 — 본문 확정 → 문서 지문(docHash) 발급 → 원본 파일 보관
 *   · 서명 링크 발급 — 원문 토큰은 응답에만, 시트에는 해시만
 *   · 취소(VOID)와 그 계약의 미사용 링크 일괄 무효화
 *   · 대금 청구·입금 표시
 *   · 전체 백업 내보내기
 *
 * 이 파일이 하지 않는 일 (하려고 들면 두 곳이 갈라진다)
 *   · 요청을 받고 응답을 만드는 일, 관리자 토큰·요청시각·중복요청(idem) 검사 → Code.gs
 *   · 동시성 잠금(LockService) → 진입점인 Code.gs. PROTOCOL.md '동시성' 항목대로
 *     create·lock·void 는 이미 스크립트 잠금 안에서 불린다. 여기서 또 잡으면
 *     같은 실행이 같은 잠금을 두 번 잡는 꼴이 되어 스스로 BUSY 로 막힐 수 있다.
 *     대신 계약번호 중복만은 잠금 없이도 안 나도록 아래에서 따로 확인한다.
 *   · 시트·드라이브를 직접 여는 일 → SheetService.gs / DriveService.gs
 *   · 해시·토큰 만들기 → AuthService.gs (여기서 Utilities.* 를 직접 부르지 않는다)
 *   · 고객 화면과 서명 접수 → Sign.gs, 알림 발송 → Notify.gs
 *   · 금액 계산·검증·상태 전이 판정 → Pure.gs (여기서 규칙을 다시 쓰지 않는다)
 *
 * 오류는 반드시 이렇게 던진다:
 *     throw new Error('CODE|사람이 읽는 한국어 설명')
 *   Code.gs 가 첫 '|' 에서 갈라 { ok:false, error:'CODE', message:'…' } 로 만든다.
 *   CODE 는 PROTOCOL.md 오류 코드표에 있는 것만 쓴다 — 없는 코드를 지어내면
 *   앱은 그 코드를 모른 채 '그 외 오류'로 뭉개고, 사장님은 무엇을 고쳐야 할지 모른다.
 *   (이 파일에서는 ctFail_ 로 만들어 던진다. 형태를 한 곳에서만 정하기 위해서다.)
 *
 * 비밀 취급
 *   · 전화번호 원문은 이 파일을 지나갈 뿐이다. 시트·사건기록·응답 어디에도 남지 않는다.
 *     남는 것은 maskPhone(마스킹본)과 hmacHex(대조용 해시)뿐이다.
 *   · 서명 링크의 원문 토큰은 issueSignLink_ 의 반환값에만 실린다.
 *     시트에는 sha256Hex 만 넣고, 사건기록 detail 에는 아예 적지 않는다.
 *     (Logger.log 도 쓰지 않는다 — 실행 기록은 나중에 누가 볼지 모른다)
 *
 * 이름 규칙: 이 파일 안에서만 쓰는 함수·상수는 ct 로 시작한다.
 *   Apps Script 는 파일들이 전역을 함께 쓴다. 다른 파일과 이름이 겹치면 경고 없이
 *   한쪽이 덮어써지고, 그날 밤 계약서 금액이 이상해진다. 겹치지 않을 이름을 먼저 고른다.
 *
 * 돌려주는 객체에는 ok:true 를 함께 담는다. Code.gs 가 이 결과를 그대로 out_ 로
 * 내보내더라도 규약('ok 를 보고 판단한다')이 지켜지도록 하기 위해서다.
 * ============================================================ */

var CONTRACTS_VERSION = 'contract-contracts-v1';

/* ---------- 이 파일의 상수 ---------- */
var CT_SIGN_TTL_HOURS = 72;               // PROTOCOL.md 기본값. SIGN_TTL_HOURS 로 덮어쓸 수 있다.
var CT_SIGN_TTL_MAX_HOURS = 24 * 30;      // 30일. 그보다 긴 링크는 사실상 상시 공개 주소다.
var CT_LIST_LIMIT = 50;                   // 목록 기본 건수
var CT_LIST_LIMIT_MAX = 200;              // 한 번에 200건. 응답이 커지면 모바일에서 끊긴다.
var CT_EVENT_LIMIT = 200;                 // 계약 1건에 딸려 보내는 사건 이력 상한(최근 것부터)
var CT_TEXT_MAX = 200;                    // 취소 사유·메모 길이 상한
var CT_BODY_JSON_MAX = 45000;             // 시트 한 칸은 5만자가 한계다. 그 앞에서 막는다.
var CT_NO_RETRY = 5;                      // 계약번호 중복 시 다시 뽑아 볼 횟수

var CT_PAYMENT_STAGES = ['down', 'mid', 'bal'];
var CT_PAYMENT_STATUS = ['PENDING', 'INVOICED', 'PAID'];
// 되돌리는 전이(PAID → PENDING 등)를 알아보기 위한 순서값. 되돌림도 허용하되 사건으로 남긴다.
var CT_PAYMENT_RANK = { PENDING: 0, INVOICED: 1, PAID: 2 };

// 서명 링크를 새로 낼 수 있는 상태. DRAFT(미잠금)와 종료상태(COMPLETED/VOID)는 제외한다.
// SIGNING 을 넣어 둔 이유: 고객이 서명 화면까지 갔다가 링크를 잃어버리는 일이 실제로 있다.
var CT_SIGNABLE = ['LOCKED', 'SENT', 'VIEWED', 'SIGNING'];

// 사업자(을) 정보 — contract-backend/src/standard-contract.mjs 와 같은 값.
// 두 곳이 다르면 예전 계약서와 새 계약서의 당사자 표기가 갈라진다.
var CT_OPERATOR = { co: '만물인테리어', rep: '전병덕', bizNo: '895-48-01132', tel: '010-2397-8629' };
var CT_WARRANTY = [{ name: '방수 관련', months: 24 }, { name: '보수 및 일반공사', months: 12 }];
var CT_WARRANTY_LABEL = '방수 관련 2년 · 보수 및 일반공사 1년';
var CT_CONSENT_WAIT_DAYS = 3;             // 공정 동의 대기일
var CT_BODY_NOTE = '본 계약서는 당사자 확인용이며 법률 자문이 아닙니다.';

/* ============================================================
 * 1) 계약 생성
 * ============================================================ */
/**
 * p = { title, amount, customer:{name, phone}, body?, site?, scope?, period?, vatIncluded?, operatorName? }
 * 검증은 Pure.gs 의 validateCreateInput 하나만 믿는다. 여기서 규칙을 또 쓰면 두 곳이 갈라진다.
 */
function createContract_(p, ctx) {
  var input = p || {};
  var v = validateCreateInput(input);
  // 틀린 것을 모아서 한 번에 돌려준다 — 하나 고치고 다시 보내기를 반복하게 하지 않는다.
  if (!v.ok) throw ctFail_('BAD_REQUEST', v.errors.join(' / '));

  var now = ctNow_(ctx);
  var phoneRaw = (input.customer && input.customer.phone) || '';

  // 번호 해시는 PEPPER 가 있어야 만들어진다. AuthService.gs 는 PEPPER 가 없으면 멈추는데,
  // 그 실패는 '서버 오류'가 아니라 '설정이 덜 됐다'이다. 사장님이 무엇을 해야 하는지가
  // 달라지므로 코드도 달라야 한다.
  var phoneHash;
  try {
    phoneHash = hmacHex(normPhone(phoneRaw));
  } catch (e) {
    throw ctFail_('NOT_CONFIGURED', ctShortMsg_(e));
  }

  var contract = {
    id: ctNewId_('ct'),
    contractNo: ctReserveContractNo_(now),
    title: sheetSafe(v.title),
    status: STATUS.DRAFT,
    amount: v.amount,
    customerName: sheetSafe(v.customerName),
    // 원문 번호는 여기까지만 온다. 아래 두 칸을 만든 뒤로는 쓰지 않는다.
    customerPhoneMasked: maskPhone(phoneRaw),
    customerPhoneHash: phoneHash,
    operatorName: sheetSafe(String(input.operatorName || CT_OPERATOR.co).slice(0, 40)),
    bodyJson: '',
    docHash: '',                 // 잠금 때 채운다. DRAFT 에는 지문이 없다.
    lockedAt: '', sentAt: '', viewedAt: '', signedAt: '', completedAt: '', voidedAt: '',
    folderId: '', originalFileId: '', completedFileId: '', completedFileVersion: 0,
    signerName: '', signatureSha256: '', signatureFileId: '', completedSha256: '',
    createdAt: now, updatedAt: now
  };

  var body = ctBodyFor_(input, v);
  var bodyJson = JSON.stringify(body);
  if (bodyJson.length > CT_BODY_JSON_MAX) {
    throw ctFail_('BAD_REQUEST', '계약 본문이 너무 깁니다 — 시트 한 칸에 담을 수 있는 한계(5만자)를 넘습니다');
  }
  contract.bodyJson = bodyJson;

  appendRow_(SHEETS.CONTRACTS, contract);

  // 대금 3회차. 비율 계산과 나머지 처리는 Pure.gs 의 paymentPlan 이 한다
  // (잔금이 '나머지 전부'라서 셋의 합이 총액과 1원도 어긋나지 않는다).
  var plan = paymentPlan(v.amount);
  for (var i = 0; i < plan.length; i++) {
    appendRow_(SHEETS.PAYMENTS, {
      contractId: contract.id,
      stage: plan[i].stage,
      label: plan[i].label,
      seq: plan[i].seq,
      amount: plan[i].amount,
      status: 'PENDING',
      invoicedAt: '', paidAt: '', memo: '',
      updatedAt: now
    });
  }

  logEvent_(contract.id, EVENTS.CONTRACT_CREATED,
    contract.contractNo + ' · ' + formatWon(v.amount) + '원 · ' + v.customerName, ctx);

  return {
    ok: true,
    id: contract.id,
    contractNo: contract.contractNo,
    status: contract.status,
    title: v.title,
    amount: v.amount,
    customerName: v.customerName,
    customerPhoneMasked: contract.customerPhoneMasked,
    payments: ctPlanView_(plan),
    createdAt: now
  };
}

/* ============================================================
 * 2) 계약 1건 조회 (관리자)
 * ============================================================ */
function getContract_(id) {
  var hit = ctFindContract_(id);
  var c = hit.obj;

  var pays = ctPaymentsOf_(ctText_(c.id));
  var payView = [];
  for (var i = 0; i < pays.length; i++) payView.push(ctPaymentView_(pays[i].obj));

  var events = ctEventsOf_(ctText_(c.id));

  return {
    ok: true,
    contract: ctContractView_(c, true),
    payments: payView,
    // 미수금 = 아직 PAID 가 아닌 회차의 합. 계산 규칙은 Pure.gs 한 곳에만 둔다.
    outstanding: outstanding(payView),
    events: events.items,
    eventsTruncated: events.truncated
  };
}

/* ============================================================
 * 3) 계약 목록 (요약)
 * ============================================================ */
/**
 * p = { status?, limit?, offset? }
 * 본문(bodyJson)과 지문(docHash)은 빼고 준다 —
 * 목록 한 화면에 본문 수십 건이 실리면 응답이 megabyte 단위로 커지고,
 * 화면에 쓰지도 않을 지문을 굳이 브라우저까지 흘려보낼 이유도 없다.
 */
function listContracts_(p) {
  var q = p || {};
  var wantStatus = String(q.status || '').toUpperCase();
  if (wantStatus && ALL_STATUS.indexOf(wantStatus) < 0) {
    throw ctFail_('BAD_REQUEST', '그런 계약 상태는 없습니다: ' + wantStatus);
  }
  var limit = parseInt(q.limit, 10);
  if (!isFinite(limit) || limit <= 0) limit = CT_LIST_LIMIT;
  if (limit > CT_LIST_LIMIT_MAX) limit = CT_LIST_LIMIT_MAX;
  var offset = parseInt(q.offset, 10);
  if (!isFinite(offset) || offset < 0) offset = 0;

  var rows = readAll_(SHEETS.CONTRACTS) || [];
  var picked = [];
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i] || {};
    if (!ctText_(c.id)) continue;                                  // 빈 줄 방어
    if (wantStatus && ctText_(c.status) !== wantStatus) continue;
    picked.push(c);
  }
  // 최근 것이 위로. 만든 시각이 같으면 계약번호가 큰 쪽이 나중이다.
  picked.sort(function (a, b) {
    var x = ctIso_(a.createdAt), y = ctIso_(b.createdAt);
    if (x !== y) return x < y ? 1 : -1;
    return ctText_(a.contractNo) < ctText_(b.contractNo) ? 1 : -1;
  });

  // 대금은 계약마다 한 번씩 찾지 않고 한 번에 읽어 모은다.
  // 계약 50건이면 시트를 50번 여는 대신 1번 연다(6분 제한이 있는 곳이다).
  var paysByContract = ctPaymentIndex_();

  var items = [];
  for (var j = offset; j < picked.length && items.length < limit; j++) {
    var row = picked[j];
    var view = ctContractView_(row, false);
    view.payment = ctPaymentSummary_(paysByContract[ctText_(row.id)] || []);
    items.push(view);
  }

  return {
    ok: true,
    total: picked.length,
    count: items.length,
    limit: limit,
    offset: offset,
    hasMore: offset + items.length < picked.length,
    items: items
  };
}

/* ============================================================
 * 4) 잠금 — 본문 확정, 지문 발급, 원본 보관
 * ============================================================ */
function lockContract_(id, ctx) {
  var hit = ctFindContract_(id);
  var c = hit.obj;
  var status = ctText_(c.status) || STATUS.DRAFT;

  // 이미 잠긴 계약은 LOCKED 로 거부한다. 잠금은 '본문이 이제부터 불변'이라는 선언이라
  // 두 번 잠그면 지문이 새로 나오고, 고객이 이미 본 지문과 어긋나 버린다.
  if (ctText_(c.lockedAt) || status !== STATUS.DRAFT) {
    if (status === STATUS.COMPLETED) throw ctFail_('LOCKED', '이미 체결이 끝난 계약입니다');
    if (status === STATUS.VOID) throw ctFail_('LOCKED', '취소된 계약입니다');
    throw ctFail_('LOCKED', '이미 잠긴 계약입니다 — 잠근 뒤에는 본문을 고칠 수 없습니다');
  }
  // 상태 전이는 Pure.gs 의 표로만 판정한다. 모르는 전이는 조용히 넘어가지 않고 거부한다.
  if (!canTransition(status, STATUS.LOCKED)) {
    throw ctFail_('BAD_STATE', status + ' 상태에서는 잠글 수 없습니다');
  }

  var amount = normalizeAmount(c.amount);
  var body = ctParseBody_(c.bodyJson);
  if (!body) throw ctFail_('BAD_REQUEST', '계약 본문을 읽을 수 없습니다 — 계약을 다시 만들어 주세요');

  // 마지막 방어선. 예전 Fly 서버에서는 이 검사가 없어서 계약금·중도금·잔금이 모두 0원으로
  // 찍힌 계약서에 고객이 서명까지 간 적이 있다. 서명 뒤에는 되돌릴 방법이 없다.
  var bad = ctValidateBody_(body, amount);
  if (bad.length) throw ctFail_('BAD_REQUEST', '계약 본문이 완성되지 않았습니다 — ' + bad.join(', '));

  // 지문의 재료에 금액을 함께 넣는 이유는 Pure.gs docHashSource 주석에 있다 —
  // 본문만 해시하면 잠근 뒤 금액 칸만 바꿔치기해도 지문이 그대로 맞는다.
  var docHash = sha256Hex(docHashSource(amount, body));
  var now = ctNow_(ctx);

  // 원본 파일을 먼저 남기고 시트를 고친다. 순서를 바꾸면 저장이 실패했을 때
  // '잠겼다고 적혀 있는데 원본이 없는' 계약이 남는다 — 분쟁에서 제일 곤란한 상태다.
  var sealed = ctCopy_(c, {
    status: STATUS.LOCKED, amount: amount, docHash: docHash, lockedAt: now, body: body
  });
  var saved;
  try {
    saved = saveOriginal_(sealed);
  } catch (e) {
    throw ctFail_('SERVER_ERROR', '원본 계약서를 저장하지 못했습니다: ' + ctShortMsg_(e));
  }

  var patch = {
    status: STATUS.LOCKED,
    docHash: docHash,
    lockedAt: now,
    updatedAt: now
  };
  var fileId = ctFileId_(saved);
  if (fileId) patch.originalFileId = fileId;
  var folderId = ctFolderId_(saved);
  if (folderId) patch.folderId = folderId;

  updateRow_(SHEETS.CONTRACTS, hit.rowIndex, patch);

  // 사건기록에는 지문 앞자리만 적는다. 전체 지문은 Contracts 시트에 있고,
  // 사건기록은 사람이 훑어보는 한 줄이라 64자를 채워 넣으면 읽히지 않는다.
  logEvent_(ctText_(c.id), EVENTS.CONTRACT_LOCKED,
    ctText_(c.contractNo) + ' 본문 확정 · 지문 ' + docHash.slice(0, 12) + '…', ctx);

  return {
    ok: true,
    id: ctText_(c.id),
    contractNo: ctText_(c.contractNo),
    status: STATUS.LOCKED,
    amount: amount,
    docHash: docHash,
    originalFileId: fileId,
    folderId: folderId || ctText_(c.folderId),
    lockedAt: now
  };
}

/* ============================================================
 * 5) 서명 링크 발급
 * ============================================================ */
/**
 * 원문 토큰은 이 함수의 반환값에만 실린다. 시트에는 sha256Hex 만 남는다.
 * 시트가 통째로 유출돼도 남의 계약을 열 수 없어야 하기 때문이다.
 */
function issueSignLink_(id, ttlHours, ctx) {
  var hit = ctFindContract_(id);
  var c = hit.obj;
  var status = ctText_(c.status) || STATUS.DRAFT;

  if (status === STATUS.DRAFT) {
    throw ctFail_('BAD_STATE', '먼저 계약을 잠가야(본문 확정) 서명 링크를 만들 수 있습니다');
  }
  if (status === STATUS.COMPLETED) {
    throw ctFail_('LOCKED', '이미 체결이 끝난 계약입니다 — 새 서명 링크를 만들지 않습니다');
  }
  if (status === STATUS.VOID) {
    throw ctFail_('LOCKED', '취소된 계약에는 서명 링크를 만들지 않습니다');
  }
  if (CT_SIGNABLE.indexOf(status) < 0) {
    throw ctFail_('BAD_STATE', status + ' 상태에서는 서명 링크를 만들 수 없습니다');
  }

  var ttl = ctTtlHours_(ttlHours);
  var now = ctNow_(ctx);
  var expiresAt = new Date(ctMs_(now) + Math.round(ttl * 3600000)).toISOString();

  var token = String(randomToken() || '');
  // 토큰이 짧으면 추측당한다. 규약은 32바이트 이상(base64url 로 43자 안팎)이다.
  // 여기서 길이를 확인하는 것은 AuthService.gs 를 고치다 실수로 짧아졌을 때 조용히 넘어가지 않기 위해서다.
  if (token.length < 32) throw ctFail_('SERVER_ERROR', '서명 토큰을 만들지 못했습니다');

  appendRow_(SHEETS.TOKENS, {
    id: ctNewId_('tk'),
    contractId: ctText_(c.id),
    purpose: 'sign',
    tokenHash: sha256Hex(token),   // ← 시트에 남는 것은 이것뿐이다
    expiresAt: expiresAt,
    usedAt: '', revokedAt: '',
    createdAt: now
  });

  // 아직 한 번도 보내지 않은 계약이면 SENT 로 넘긴다.
  // 이미 SENT/VIEWED/SIGNING 이면 상태는 그대로 둔다 — 고객이 이미 열어본 사실을
  // 링크 재발급으로 지워 버리면 이력이 거짓말이 된다.
  var patch = { updatedAt: now };
  if (canTransition(status, STATUS.SENT)) patch.status = STATUS.SENT;
  if (!ctText_(c.sentAt)) patch.sentAt = now;
  updateRow_(SHEETS.CONTRACTS, hit.rowIndex, patch);

  // 앞서 발급한 링크는 무효로 만들지 않는다(만료·사용·취소로만 죽는다).
  // 사장님이 "문자가 안 갔나" 하고 한 번 더 눌렀을 때 먼저 보낸 링크가 죽으면,
  // 마침 그 링크를 열고 있던 고객이 이유도 모른 채 막힌다.

  var base = String(cfg_('WEBAPP_URL', '') || '').trim();
  var url = '';
  if (base) {
    // 규약대로 '?page=sign&t=<토큰>'. 배포 주소에 이미 ? 가 붙어 있으면 & 로 잇는다.
    url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'page=sign&t=' + encodeURIComponent(token);
  }

  // detail 에 토큰을 적지 않는다. 사건기록은 시트에 남고, 시트는 공유 링크 한 번이면 남이 본다.
  logEvent_(ctText_(c.id), EVENTS.SIGN_LINK_ISSUED,
    ctText_(c.contractNo) + ' 서명 링크 발급 · 만료 ' + expiresAt, ctx);

  return {
    ok: true,
    id: ctText_(c.id),
    contractNo: ctText_(c.contractNo),
    token: token,                    // ← 여기서 한 번만 나간다. 어디에도 저장하지 마라.
    url: url,
    linkReady: !!base,
    expiresAt: expiresAt,
    ttlHours: ttl,
    // 주소를 지어내지 않는다. 없으면 없다고 말한다 — 틀린 주소를 문자로 보내는 것보다 낫다.
    message: base ? '' : 'WEBAPP_URL 이 설정되지 않아 링크 주소를 만들지 못했습니다. 스크립트 속성에 배포 주소를 넣고 다시 발급해 주세요(토큰은 이 응답에만 있습니다).'
  };
}

/* ============================================================
 * 6) 취소(VOID)
 * ============================================================ */
function voidContract_(id, reason, ctx) {
  var hit = ctFindContract_(id);
  var c = hit.obj;
  var status = ctText_(c.status) || STATUS.DRAFT;

  // 완료된 계약은 봉인이다. 합의해제는 별도 서면으로 할 일이지, 시스템이 지울 일이 아니다.
  if (status === STATUS.COMPLETED) {
    throw ctFail_('LOCKED', '체결이 끝난 계약은 취소할 수 없습니다 — 해제는 별도 합의서로 진행하세요');
  }
  // 이미 취소된 계약을 또 취소하는 것은 실패가 아니다(문자가 두 번 눌린 경우). 그대로 알려준다.
  if (status === STATUS.VOID) {
    return { ok: true, id: ctText_(c.id), status: STATUS.VOID, already: true, revokedTokens: 0,
             voidedAt: ctIso_(c.voidedAt) };
  }
  if (!canTransition(status, STATUS.VOID)) {
    throw ctFail_('BAD_STATE', status + ' 상태에서는 취소할 수 없습니다');
  }

  var now = ctNow_(ctx);

  // 링크부터 죽이고 상태를 바꾼다. 순서를 바꾸면 '취소된 계약인데 링크는 살아 있는' 틈이 생긴다.
  // 이미 서명에 쓰인 토큰(usedAt)은 건드리지 않는다 — 그것은 증거다.
  var revoked = 0;
  var toks = ctRowsWithIndex_(SHEETS.TOKENS);
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i].obj;
    if (ctText_(t.contractId) !== ctText_(c.id)) continue;
    if (ctText_(t.usedAt) || ctText_(t.revokedAt)) continue;
    updateRow_(SHEETS.TOKENS, toks[i].rowIndex, { revokedAt: now });
    revoked++;
  }

  // 링크를 죽이는 사이 고객이 서명을 끝냈을 수 있다. 그 경우 되돌리지 않는다.
  // (LockService 는 Code.gs 가 잡지만, 잠금 밖에서 불릴 가능성까지 여기서 한 번 더 막는다)
  var again = findRow_(SHEETS.CONTRACTS, 'id', ctText_(c.id));
  var nowStatus = again ? (ctText_(again.obj.status) || STATUS.DRAFT) : status;
  if (nowStatus === STATUS.COMPLETED) {
    throw ctFail_('LOCKED', '방금 서명이 완료되어 취소할 수 없습니다 — 해제는 별도 합의서로 진행하세요');
  }

  updateRow_(SHEETS.CONTRACTS, hit.rowIndex, {
    status: STATUS.VOID, voidedAt: now, updatedAt: now
  });

  var why = String(reason == null ? '' : reason).slice(0, CT_TEXT_MAX).trim();
  logEvent_(ctText_(c.id), EVENTS.CONTRACT_VOIDED,
    ctText_(c.contractNo) + ' 취소 · 링크 ' + revoked + '건 무효화' + (why ? ' · 사유: ' + sheetSafe(why) : ''), ctx);

  return {
    ok: true,
    id: ctText_(c.id),
    contractNo: ctText_(c.contractNo),
    status: STATUS.VOID,
    revokedTokens: revoked,
    reason: why,
    voidedAt: now
  };
}

/* ============================================================
 * 7) 대금 청구·입금 표시
 * ============================================================ */
/**
 * p = { id, stage, status, memo? }
 * PENDING / INVOICED / PAID 만 허용한다.
 * 되돌리는 전이(잘못 눌러 PAID 로 표시한 경우)도 허용하되, 반드시 사건으로 남긴다 —
 * 돈에 관한 표시가 소리 없이 바뀌면 나중에 무엇이 맞는지 아무도 모른다.
 */
function updatePayment_(p, ctx) {
  var q = p || {};
  var contractId = String(q.id || '').trim();
  var stage = String(q.stage || '').trim().toLowerCase();
  var next = String(q.status || '').trim().toUpperCase();

  if (!contractId) throw ctFail_('BAD_REQUEST', '계약 id 가 없습니다');
  // 목록으로 확인한다. PAYMENT_LABEL[stage] 로 확인하면 stage 가 'toString' 처럼
  // 모든 객체가 물려받는 이름일 때 통과해 버리고, 그 뒤 오류 문구에 자바스크립트 내부가 새어 나온다.
  if (CT_PAYMENT_STAGES.indexOf(stage) < 0) {
    throw ctFail_('BAD_REQUEST', '대금 회차는 down·mid·bal 중 하나여야 합니다');
  }
  if (CT_PAYMENT_STATUS.indexOf(next) < 0) {
    throw ctFail_('BAD_REQUEST', '대금 상태는 PENDING·INVOICED·PAID 중 하나여야 합니다');
  }

  var hit = ctFindContract_(contractId);
  var c = hit.obj;

  var found = null;
  var pays = ctPaymentsOf_(ctText_(c.id));
  for (var i = 0; i < pays.length; i++) {
    if (ctText_(pays[i].obj.stage).toLowerCase() === stage) { found = pays[i]; break; }
  }
  if (!found) throw ctFail_('NOT_FOUND', '그 계약에 ' + PAYMENT_LABEL[stage] + ' 항목이 없습니다');

  var row = found.obj;
  var cur = ctText_(row.status).toUpperCase() || 'PENDING';
  var memo = String(q.memo == null ? '' : q.memo).slice(0, CT_TEXT_MAX).trim();
  var now = ctNow_(ctx);

  if (cur === next && !memo) {
    return { ok: true, id: ctText_(c.id), stage: stage, label: ctText_(row.label),
             amount: normalizeAmount(row.amount), status: cur, already: true };
  }

  var patch = { status: next, updatedAt: now };
  if (memo) patch.memo = sheetSafe(memo);

  // 시각 칸을 상태와 함께 맞춘다. 상태는 PENDING 인데 paidAt 이 남아 있으면
  // 나중에 어느 쪽이 사실인지 판단할 수 없다.
  if (next === 'PAID') {
    patch.paidAt = ctText_(row.paidAt) || now;
  } else if (next === 'INVOICED') {
    patch.invoicedAt = ctText_(row.invoicedAt) || now;
    patch.paidAt = '';
  } else {
    patch.invoicedAt = '';
    patch.paidAt = '';
  }

  updateRow_(SHEETS.PAYMENTS, found.rowIndex, patch);

  var reverted = CT_PAYMENT_RANK[next] < CT_PAYMENT_RANK[cur];
  var amount = normalizeAmount(row.amount);
  var label = ctText_(row.label) || PAYMENT_LABEL[stage];
  var detail = ctText_(c.contractNo) + ' ' + label + ' ' + formatWon(amount) + '원 · '
    + cur + ' → ' + next + (reverted ? ' (되돌림)' : '')
    + (ctText_(c.status) === STATUS.VOID ? ' · 취소된 계약' : '')
    + (memo ? ' · ' + sheetSafe(memo) : '');

  logEvent_(ctText_(c.id), ctPaymentEvent_(next, reverted), detail, ctx);

  // 바뀐 뒤의 미수금을 함께 준다. 앱이 다시 물어보지 않아도 되게.
  var after = [];
  for (var j = 0; j < pays.length; j++) {
    var view = ctPaymentView_(pays[j].obj);
    if (pays[j].rowIndex === found.rowIndex) view.status = next;
    after.push(view);
  }

  return {
    ok: true,
    id: ctText_(c.id),
    contractNo: ctText_(c.contractNo),
    stage: stage,
    label: label,
    amount: amount,
    from: cur,
    status: next,
    reverted: reverted,
    memo: memo,
    outstanding: outstanding(after),
    updatedAt: now
  };
}

/* ============================================================
 * 8) 전체 백업 내보내기
 * ============================================================ */
/**
 * 전 시트를 JSON 한 덩어리로 만들어 DriveService.gs 의 backupFolder_ 에 저장한다.
 *
 * ⚠ 실행 1회당 6분(PROTOCOL.md '알아 두셔야 할 제약'). 시트를 통째로 읽어 문자열로 만드는
 *   일이라, 계약이 수천 건으로 늘면 이 함수 하나로 6분을 넘겨 구글이 중간에 끊는다.
 *   그때는 시트별로 나눠 내보내고(예: backup.export {sheet:'Contracts'}) 이어붙이도록
 *   고쳐야 한다. 지금 규모(1인 사업장·연 수십 건)에서는 한 번에 끝난다.
 *
 * ⚠ 스크립트 속성(ADMIN_TOKEN·PEPPER 등)은 이 백업에 들어가지 않는다. 넣으면 안 된다.
 *   대신 PEPPER 를 잃어버리면 전화번호 해시를 다시 맞춰볼 수 없으니,
 *   그 값은 사장님이 따로(비밀번호 관리앱 등) 보관해야 한다.
 */
function exportBackup_(ctx) {
  var now = ctNow_(ctx);

  var sheetsDump = {};
  var counts = {};
  for (var i = 0; i < SHEET_DEFS.length; i++) {
    var name = SHEET_DEFS[i].name;
    var rows = readAll_(name) || [];
    sheetsDump[name] = rows;
    counts[name] = rows.length;
  }

  // 건수와 금액 합계를 함께 담는다. 반년 뒤 이 파일을 열었을 때
  // "그때 계약이 몇 건이고 얼마였는지"를 시트와 대조할 수 있어야 한다.
  var summary = ctBackupSummary_(sheetsDump);

  var payload = {
    app: '만물인테리어 전자계약',
    kind: 'backup',
    at: now,
    versions: { contracts: CONTRACTS_VERSION, schema: SCHEMA_VERSION, pure: PURE_VERSION },
    counts: counts,
    summary: summary,
    sheets: sheetsDump
  };
  var json = JSON.stringify(payload);
  // 파일 자체의 지문. 나중에 이 파일이 손대지 않은 그대로인지 확인하는 근거가 된다.
  var sha = sha256Hex(json);

  var folder = backupFolder_();
  if (!folder || typeof folder.createFile !== 'function') {
    throw ctFail_('SERVER_ERROR', '백업 폴더를 열지 못했습니다 — DRIVE_FOLDER_ID 설정을 확인하세요');
  }
  var fileName = '계약백업_' + ctStamp_(now) + '.json';
  var file;
  try {
    file = folder.createFile(fileName, json, 'application/json');
  } catch (e) {
    throw ctFail_('SERVER_ERROR', '백업 파일을 저장하지 못했습니다: ' + ctShortMsg_(e));
  }

  logEvent_('', EVENTS.BACKUP_EXPORTED,
    fileName + ' · 계약 ' + summary.contracts.count + '건 · 계약금액 합계 '
      + formatWon(summary.contracts.amountTotal) + '원 · 지문 ' + sha.slice(0, 12) + '…', ctx);

  return {
    ok: true,
    fileId: file.getId(),
    fileName: fileName,
    bytes: json.length,
    sha256: sha,
    counts: counts,
    summary: summary,
    at: now
  };
}

/* ============================================================
 * 여기서부터는 이 파일 안에서만 쓰는 도구들
 * ============================================================ */

/* ---------- 오류 ---------- */
// 오류의 생김새를 한 곳에서만 정한다. 'CODE|한국어 설명' — Code.gs 가 첫 '|' 로 가른다.
function ctFail_(code, msg) {
  return new Error(String(code) + '|' + String(msg));
}
// 바깥(Drive 등)에서 올라온 오류 원문을 그대로 실어 보내지 않는다. 짧게 자르고 스택은 버린다.
function ctShortMsg_(err) {
  return String((err && err.message) || err).slice(0, 140);
}

/* ---------- 시각 ---------- */
// 시각은 언제나 서버가 만든 ctx.at 을 쓴다. 고객 기기의 시계는 믿지 않는다.
// ctx 가 없는 경우는 내부 호출·수동 실행뿐이라, 그때만 여기서 만든다.
function ctNow_(ctx) {
  var at = ctx && ctx.at;
  if (at && isFinite(Date.parse(at))) return String(at);
  return new Date().toISOString();
}
function ctMs_(iso) {
  var ms = Date.parse(iso);
  return isFinite(ms) ? ms : Date.now();
}
// 시트가 ISO 문자열을 날짜 값으로 바꿔 저장하는 경우가 있어, 읽을 때 되돌린다.
function ctIso_(v) {
  if (v instanceof Date) return v.toISOString();
  return ctText_(v);
}
function ctTz_() {
  return Session.getScriptTimeZone() || 'Asia/Seoul';
}
// 계약번호의 연도는 한국 시간 기준이다. UTC 로 세면 1월 1일 오전에 만든 계약이
// 작년 번호를 받는다 — 사장님이 전화로 부르는 번호가 하루치 어긋난다.
function ctYear_(iso) {
  var y = parseInt(Utilities.formatDate(new Date(ctMs_(iso)), ctTz_(), 'yyyy'), 10);
  return isFinite(y) ? y : new Date().getFullYear();
}
function ctStamp_(iso) {
  return Utilities.formatDate(new Date(ctMs_(iso)), ctTz_(), 'yyyy-MM-dd_HHmm');
}

/* ---------- 값 다루기 ---------- */
// 시트에서 읽은 값은 sheetSafe 가 붙여 둔 작은따옴표를 떼고 문자열로 만든다.
function ctText_(v) {
  var s = sheetUnsafeStrip(v);
  return s == null ? '' : String(s);
}
// 두 객체를 얕게 합친다(뒤엣것이 이긴다). Object.assign 을 쓰지 않는 이유는 이 파일의
// 다른 코드와 문법을 맞추기 위해서다 — 편집기에서 읽는 사람이 한 가지 방식만 보게 한다.
function ctCopy_(a, b) {
  var o = {}, k;
  for (k in (a || {})) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
  for (k in (b || {})) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k];
  return o;
}
// id 는 추측 불가해야 한다. AuthService.gs 의 randomToken() 앞 16글자만 잘라도 90비트가 넘어
// 남의 계약 id 를 맞혀 들어오는 일은 없다. 짧아야 화면과 파일 이름에 얹기 좋다.
function ctNewId_(prefix) {
  var t = String(randomToken() || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (t.length < 16) throw ctFail_('SERVER_ERROR', '무작위 값을 만들지 못했습니다');
  return prefix + '_' + t.slice(0, 16);
}
// DriveService.gs 가 파일 객체를 주든 id 문자열을 주든 받아 적는다.
// 두 파일을 각자 쓰다 보면 반환 형태가 어긋나기 쉬운데, 그 때문에 잠금이 실패하면 안 된다.
function ctFileId_(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v.getId === 'function') { try { return String(v.getId()); } catch (e) { return ''; } }
  return String(v.fileId || v.id || '');
}
function ctFolderId_(v) {
  if (!v || typeof v === 'string') return '';
  return String(v.folderId || '');
}
function ctParseBody_(json) {
  if (!json) return null;
  if (typeof json === 'object') return json;
  try {
    var b = JSON.parse(String(json));
    return (b && typeof b === 'object') ? b : null;
  } catch (e) { return null; }
}

/* ---------- 시트 읽기 ---------- */
// 줄을 고치려면 시트의 몇 번째 줄인지가 필요하다. SheetService.gs 의 readAll_ 이 각 줄에
// _rowIndex 를 붙여 주므로 그것을 쓴다. 직접 세지 않는 이유: readAll_ 은 빈 줄을 건너뛰어
// 돌려주기 때문에, 배열 순서로 i+2 를 계산하면 손으로 한 줄 지운 시트에서 **엉뚱한 줄**을
// 고치게 된다. (_rowIndex 가 없는 경우에만 마지막 수단으로 센다)
function ctRowsWithIndex_(name) {
  var rows = readAll_(name) || [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var idx = parseInt(r._rowIndex, 10);
    if (!isFinite(idx) || idx < 2) idx = parseInt(r.rowIndex, 10);
    if (!isFinite(idx) || idx < 2) idx = i + 2;
    out.push({ rowIndex: idx, obj: r });
  }
  return out;
}
function ctFindContract_(id) {
  var key = String(id == null ? '' : id).trim();
  if (!key) throw ctFail_('BAD_REQUEST', '계약 id 가 없습니다');
  var hit = findRow_(SHEETS.CONTRACTS, 'id', key);
  // 없는 계약과 권한 없는 계약을 같은 말로 답한다 — 어느 id 가 실재하는지 알려주지 않는다.
  if (!hit || !hit.obj) throw ctFail_('NOT_FOUND', '그런 계약이 없습니다');
  return hit;
}
// 한 계약의 대금 회차를 seq 순서로.
function ctPaymentsOf_(contractId) {
  var all = ctRowsWithIndex_(SHEETS.PAYMENTS);
  var out = [];
  for (var i = 0; i < all.length; i++) {
    if (ctText_(all[i].obj.contractId) === contractId) out.push(all[i]);
  }
  out.sort(function (a, b) { return (parseInt(a.obj.seq, 10) || 0) - (parseInt(b.obj.seq, 10) || 0); });
  return out;
}
// 목록 화면용 — 계약별 대금을 한 번에 모아 둔다(시트를 계약 수만큼 열지 않기 위해).
function ctPaymentIndex_() {
  var rows = readAll_(SHEETS.PAYMENTS) || [];
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var key = ctText_(rows[i].contractId);
    if (!key) continue;
    // hasOwnProperty 로 확인한다. 시트 값이 'constructor' 같은 이름이면
    // map[key] 가 물려받은 함수라 참으로 보이고, 그 자리에서 push 가 터진다.
    if (!ctHas_(map, key)) map[key] = [];
    map[key].push(rows[i]);
  }
  return map;
}
function ctHas_(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// 한 계약의 사건 이력(최근 CT_EVENT_LIMIT 건).
// 사건 시트는 지우지 않는 원장이라 계속 길어진다. 지금은 전부 읽어 걸러내지만,
// 수만 줄이 되면 SheetService.gs 에 계약별 조회를 따로 만들어야 한다.
function ctEventsOf_(contractId) {
  var rows = readAll_(SHEETS.EVENTS) || [];
  var mine = [];
  for (var i = 0; i < rows.length; i++) {
    if (ctText_(rows[i].contractId) !== contractId) continue;
    mine.push({
      at: ctIso_(rows[i].at),
      event: ctText_(rows[i].event),
      detail: ctText_(rows[i].detail),
      actor: ctText_(rows[i].actor)
      // uaHash·requestHash 는 내보내지 않는다. 시트에는 증거로 남기되,
      // 화면에서 쓸 일이 없는 값을 브라우저까지 흘려보낼 이유가 없다.
    });
  }
  mine.sort(function (a, b) { return a.at < b.at ? -1 : (a.at > b.at ? 1 : 0); });
  var truncated = mine.length > CT_EVENT_LIMIT;
  if (truncated) mine = mine.slice(mine.length - CT_EVENT_LIMIT);
  return { items: mine, truncated: truncated };
}

/* ---------- 응답 만들기 ---------- */
// withBody=false 면 본문·지문을 뺀다(목록용).
function ctContractView_(c, withBody) {
  var view = {
    id: ctText_(c.id),
    contractNo: ctText_(c.contractNo),
    title: ctText_(c.title),
    status: ctText_(c.status) || STATUS.DRAFT,
    amount: normalizeAmount(c.amount),
    customerName: ctText_(c.customerName),
    customerPhoneMasked: ctText_(c.customerPhoneMasked),
    // customerPhoneHash 는 내보내지 않는다. 대조용 값일 뿐 화면에 쓸 데가 없다.
    operatorName: ctText_(c.operatorName),
    lockedAt: ctIso_(c.lockedAt),
    sentAt: ctIso_(c.sentAt),
    viewedAt: ctIso_(c.viewedAt),
    signedAt: ctIso_(c.signedAt),
    completedAt: ctIso_(c.completedAt),
    voidedAt: ctIso_(c.voidedAt),
    createdAt: ctIso_(c.createdAt),
    updatedAt: ctIso_(c.updatedAt)
  };
  if (withBody) {
    view.body = ctParseBody_(c.bodyJson);
    view.docHash = ctText_(c.docHash);
    view.folderId = ctText_(c.folderId);
    view.originalFileId = ctText_(c.originalFileId);
    view.completedFileId = ctText_(c.completedFileId);
    view.completedFileVersion = parseInt(c.completedFileVersion, 10) || 0;
    view.signerName = ctText_(c.signerName);
    view.signatureSha256 = ctText_(c.signatureSha256);
    view.signatureFileId = ctText_(c.signatureFileId);
    view.completedSha256 = ctText_(c.completedSha256);
  }
  return view;
}
function ctPaymentView_(p) {
  return {
    stage: ctText_(p.stage),
    label: ctText_(p.label),
    seq: parseInt(p.seq, 10) || 0,
    amount: normalizeAmount(p.amount),
    status: ctText_(p.status).toUpperCase() || 'PENDING',
    invoicedAt: ctIso_(p.invoicedAt),
    paidAt: ctIso_(p.paidAt),
    memo: ctText_(p.memo),
    updatedAt: ctIso_(p.updatedAt)
  };
}
function ctPaymentSummary_(rows) {
  var sum = { total: 0, paid: 0, invoiced: 0, pending: 0, receivable: 0, stages: 0 };
  for (var i = 0; i < (rows || []).length; i++) {
    var amount = normalizeAmount(rows[i].amount);
    var st = ctText_(rows[i].status).toUpperCase() || 'PENDING';
    sum.total += amount;
    sum.stages++;
    if (st === 'PAID') sum.paid += amount;
    else if (st === 'INVOICED') sum.invoiced += amount;
    else sum.pending += amount;
  }
  sum.receivable = sum.total - sum.paid;
  return sum;
}
function ctPlanView_(plan) {
  var out = [];
  for (var i = 0; i < plan.length; i++) {
    out.push({ stage: plan[i].stage, label: plan[i].label, seq: plan[i].seq,
               amount: plan[i].amount, status: 'PENDING' });
  }
  return out;
}

/* ---------- 계약번호 ---------- */
// 계약번호는 사장님이 전화로 부르는 이름이다. 두 계약이 같은 번호를 갖는 순간
// 통화로 계약을 특정할 방법이 사라지고, 그 순간 두 장 다 증거로 쓰기 어려워진다.
//
// SheetService.gs 의 nextContractSeq_ 는 '그 해 마지막 번호 + 1'을 계산할 뿐, 그 번호를 잡아 두지
// 않는다(그 파일 주석에도 적혀 있다 — 잠금은 부르는 쪽 몫이다). 잠금은 Code.gs 가 잡지만,
// 여기서 한 번 더 그물을 친다: 받은 번호가 이미 시트에 있으면 다음 번호로 옮겨 간다.
// nextContractSeq_ 를 다시 부르는 것은 소용이 없다 — 아직 줄을 안 썼으니 같은 값이 또 나온다.
function ctReserveContractNo_(nowIso) {
  var year = ctYear_(nowIso);
  var seq;
  try {
    seq = nextContractSeq_(year);
  } catch (e) {
    // SheetService.gs·Pure.gs 는 코드 없이 한국어 메시지만 던진다. 여기서 규약 형태로 바꿔 준다.
    throw ctFail_('SERVER_ERROR', ctShortMsg_(e));
  }
  for (var i = 0; i < CT_NO_RETRY; i++) {
    var no;
    try {
      no = makeContractNo(year, seq + i);
    } catch (e2) {
      throw ctFail_('SERVER_ERROR', ctShortMsg_(e2));
    }
    if (!findRow_(SHEETS.CONTRACTS, 'contractNo', no)) return no;
  }
  throw ctFail_('SERVER_ERROR', '계약번호를 발급하지 못했습니다 — 잠시 후 다시 시도해 주세요');
}

/* ---------- 대금 사건 이름 ---------- */
// Schema.gs 의 EVENTS 에는 '되돌림' 전용 이름이 없다. 여기서 새 이름을 지어내면
// Schema.gs 와 어긋나므로, 가장 가까운 이름으로 남기고 detail 에 '(되돌림)'을 분명히 적는다.
// 집계할 때는 detail 을 함께 보아야 한다는 뜻이다.
function ctPaymentEvent_(next) {
  if (next === 'PAID') return EVENTS.PAYMENT_PAID;
  return EVENTS.PAYMENT_INVOICED;
}

/* ---------- 본문 ---------- */
// 앱이 본문을 직접 보내면 그 내용을 그대로 쓴다. 안 보내면 표준 본문을 만들어 넣는다.
function ctBodyFor_(input, v) {
  var body = (input.body && typeof input.body === 'object' && !Array.isArray(input.body)) ? input.body : null;
  if (!body) {
    return ctStandardBody_({
      site: input.site || input.address || '',
      scope: input.scope || input.title || '',
      amount: v.amount,
      vatIncluded: input.vatIncluded,
      customerName: v.customerName,
      period: input.period || '',
      operator: input.operator
    });
  }
  // 보내온 본문은 고치지 않되, 잠금 검사에 꼭 필요한데 비어 있는 칸만 채운다.
  // 채우지 않으면 lockContract_ 에서 막히는데, 본문을 고치는 동작이 규약에 없어서
  // 그 계약은 취소 말고는 길이 없어진다.
  if (!String(body.customerName || '').trim()) body.customerName = v.customerName;
  if (body.amount == null) body.amount = v.amount;
  var pay = body.payment || {};
  var sum = normalizeAmount(pay.down) + normalizeAmount(pay.mid) + normalizeAmount(pay.bal);
  if (sum <= 0) {
    var plan = paymentPlan(v.amount);
    body.payment = { down: plan[0].amount, mid: plan[1].amount, bal: plan[2].amount };
  }
  return body;
}

// 잠그기 전 '이것을 계약서라 부를 수 있는가'를 본다.
// contract-backend/src/standard-contract.mjs 의 validateBody 와 같은 규칙이다.
function ctValidateBody_(body, amount) {
  var b = body || {};
  var bad = [];
  // 조항은 {no,title,text} 가 표준이지만 문자열 한 줄로 들어오는 본문도 있어 둘 다 인정한다.
  // 막으려는 것은 '조항이 아예 없는 계약서'다.
  if (!ctIsArray_(b.clauses) || b.clauses.length === 0) {
    bad.push('계약 조항이 없습니다');
  } else {
    for (var i = 0; i < b.clauses.length; i++) {
      var c = b.clauses[i];
      var text = (typeof c === 'string') ? c : String((c && c.text) || '');
      if (!text.trim()) { bad.push('내용이 빈 조항이 있습니다'); break; }
    }
  }
  if (!String(b.customerName || '').trim()) bad.push('고객(갑) 성명이 없습니다');

  var p = b.payment || {};
  var sum = normalizeAmount(p.down) + normalizeAmount(p.mid) + normalizeAmount(p.bal);
  var total = normalizeAmount(amount);
  if (sum <= 0) bad.push('대금 지급 조건이 없습니다');
  else if (total > 0 && sum !== total) {
    bad.push('지급 조건 합계(' + formatWon(sum) + '원)가 계약금액(' + formatWon(total) + '원)과 다릅니다');
  }
  return bad;
}
function ctIsArray_(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

/* ---------- 표준 계약 본문 ---------- */
// contract-backend/src/standard-contract.mjs 의 buildStandardBody 와 같은 내용이다.
// 조항 번호·문구·지급 비율을 바꾸면 예전에 서명받은 계약서와 갈라진다 —
// 고칠 일이 생기면 저쪽 파일과 이 함수를 같이 고쳐야 한다.
//
// 값의 출처는 사장님(전병덕)이 확정한 조건이다:
//   지급 50/40/10 · 하자보증 방수 2년/일반 1년 · 추가공사는 별도 계약 · 공정 동의 3일
// ※ 법률 자문이 아니다. 제5조·제8조는 고객에게 불리하게 읽힐 수 있어 실제 사용 전 검토를 권한다.
function ctStandardBody_(o) {
  var opt = o || {};
  var site = String(opt.site || '').trim();
  var scope = ctJoinScope_(opt.scope);
  var amount = normalizeAmount(opt.amount);
  var vatIncluded = opt.vatIncluded !== false;   // 말이 없으면 '포함'으로 본다(고객이 낼 총액)
  var customerName = String(opt.customerName || '').trim();
  var period = String(opt.period || '').trim();
  var vatLabel = vatIncluded ? '부가세 포함' : '부가세 별도';
  var opr = ctCopy_(CT_OPERATOR, opt.operator || {});

  var plan = paymentPlan(amount);
  var down = plan[0].amount, mid = plan[1].amount, bal = plan[2].amount;

  var clauses = [
    { no: 1, title: '공사의 내용',
      text: '도급인(이하 "갑")과 수급인 ' + opr.co + '(이하 "을")은 표기 현장('
        + (site || '별첨 견적서 기재 현장') + ')의 '
        + (scope || '별첨 견적서 기재 공사') + '에 관하여 아래와 같이 공사도급계약을 체결한다. '
        + '공사의 구체적 범위·자재 사양·수량은 별첨 견적서에 따른다.' },

    { no: 2, title: '계약금액',
      text: '총 계약금액은 금 ' + formatWon(amount) + '원(' + vatLabel + ')으로 한다.' },

    { no: 3, title: '대금의 지급',
      text: '갑은 다음과 같이 을에게 지급한다.\n'
        + '① 계약금 ' + formatWon(down) + '원(' + ctPct_(PAYMENT_RATIO.down) + '%) — 계약 체결로 공사금액을 확정하고 자재를 구매하기 위한 대금으로, 계약 체결 시 지급한다.\n'
        + '② 중도금 ' + formatWon(mid) + '원(' + ctPct_(PAYMENT_RATIO.mid) + '%) — 주요 공정 완료를 갑이 확인한 때 지급한다.\n'
        + '③ 잔금 ' + formatWon(bal) + '원(' + ctPct_(PAYMENT_RATIO.bal) + '%) — 준공 및 하자 마무리 확인 후 지급한다.\n'
        + '지급 계좌는 을이 지정하여 갑에게 통지한 계좌로 한다.' },

    { no: 4, title: '공사기간',
      text: '공사기간은 ' + (period || '별도 협의하여 정한다') + '. 천재지변, 민원, 갑의 자재 선정 지연 또는 '
        + '현장 출입 불가 등 을의 책임 없는 사유로 공사가 지연된 경우 그 기간만큼 공사기간은 연장된다.' },

    // [검토요망] 회신이 없을 때 승인으로 보는 조항이다. '절차별 3일·무회신 시 자동 승인'을
    // 그대로 두면 고객에게 일방적으로 불리하게 읽힐 수 있어, 통지 → 유선 재확인 → 기록 보관 →
    // 간주 순서로 다듬었다. 분쟁에서 힘을 갖는 것은 '자동 승인'이라는 문구가 아니라 통지한 기록이다.
    { no: 5, title: '공정별 확인과 동의',
      text: '① 을은 각 공정을 진행하기 전 그 내용을 갑에게 서면(문자·카카오톡 등 전자적 방법을 포함한다)으로 통지한다.\n'
        + '② 갑은 통지를 받은 날부터 ' + CT_CONSENT_WAIT_DAYS + '일 이내에 동의 여부를 회신한다.\n'
        + '③ 위 기간 내 회신이 없는 경우 을은 갑에게 유선으로 연락하여 동의 여부를 다시 확인하며, 이때의 구두 동의는 서면 동의와 같은 효력을 가진다.\n'
        + '④ 유선 연락으로도 회신을 받지 못한 경우, 을은 해당 공정의 작업 사진을 갑에게 전송하고 갑이 이에 대하여 이의를 제기하지 아니하면 그 공정에 동의한 것으로 본다.\n'
        + '⑤ 을은 위 각 단계의 통지·연락·사진 전송 기록을 보관하며, 갑이 이의를 제기하는 경우 을은 해당 공정을 즉시 중단하고 갑과 협의한다.' },

    { no: 6, title: '추가·변경 공사',
      text: '① 공사 중 추가 또는 변경이 필요한 경우 을은 그 내용과 금액을 갑에게 통지하고, 갑과 별도의 추가공사 계약서를 작성한 후 시공한다.\n'
        + '② 갑의 동의 없이 추가 비용을 청구하지 아니한다.\n'
        + '③ 별도 계약 없이 갑의 요청에 따라 을이 서비스로 시공한 작업은 제7조의 하자보증 대상에서 제외한다.' },

    { no: 7, title: '하자보증',
      text: '① 을은 준공일부터 방수 관련 공사는 2년, 보수 및 일반공사는 1년 동안 하자보수 책임을 진다.\n'
        + '② 통상의 마모, 갑 또는 제3자의 사용상 과실, 갑이 지급한 자재의 하자, 타 업체가 시공한 부분, 제6조 제3항의 서비스 작업은 보증 범위에서 제외한다.\n'
        + '③ 갑은 하자를 발견한 때 을에게 통지하고, 을은 통지를 받은 후 지체 없이 보수한다.' },

    // [검토요망] 잔금 유보 사유를 하자보증 관련으로 한정하는 조항이다.
    { no: 8, title: '잔금과 하자보수의 관계',
      text: '① 갑은 제7조의 하자보수가 완료되지 아니한 경우에 한하여 그 하자에 상응하는 범위에서 잔금의 지급을 유보할 수 있다.\n'
        + '② 그 밖의 사유로 대금 지급이 지연된 경우 갑은 지연된 금액에 대하여 지급기일 다음 날부터 완제일까지 법정이율에 따른 지연이자를 지급한다.' },

    { no: 9, title: '지체상금',
      text: '을의 귀책사유로 준공이 지연된 경우 을은 지연 1일당 계약금액의 0.1%를 지체상금으로 갑에게 지급한다. '
        + '다만 제4조 단서에 해당하는 기간은 지연일수에서 제외한다.' },

    { no: 10, title: '안전 및 민원',
      text: '을은 공사 중 안전관리와 현장 청결을 유지하고, 해당 건물의 관리규약을 준수하며, '
        + '인접 세대의 민원이 발생한 경우 갑과 협의하여 대응한다.' },

    { no: 11, title: '전자계약의 성립',
      text: '본 계약은 전자문서로 작성되며, 갑의 전자서명·동의기록 및 문서해시로 그 성립과 내용을 증명한다. '
        + '양 당사자는 전자적 방법에 의한 계약 체결에 동의한다.' },

    { no: 12, title: '계약의 해제와 분쟁',
      text: '① 당사자 일방이 계약상 의무를 이행하지 아니하는 경우 상대방은 상당한 기간을 정하여 이행을 최고하고, 그 기간 내에 이행이 없으면 계약을 해제할 수 있다.\n'
        + '② 본 계약과 관련한 분쟁은 본 계약서의 내용을 기준으로 상호 협의하여 해결하되, 협의가 이루어지지 아니한 경우 관할 법원에 소를 제기할 수 있다.\n'
        + '③ 본 계약에 정하지 아니한 사항은 관련 법령과 거래 관행에 따른다.' }
  ];

  return {
    site: site, scope: scope, amount: amount, vatIncluded: vatIncluded,
    customerName: customerName, period: period,
    payment: { down: down, mid: mid, bal: bal },
    paymentRatio: { down: PAYMENT_RATIO.down, mid: PAYMENT_RATIO.mid, bal: PAYMENT_RATIO.bal },
    warranty: CT_WARRANTY_LABEL, warrantyItems: CT_WARRANTY,
    operator: opr, clauses: clauses, note: CT_BODY_NOTE
  };
}
function ctPct_(r) { return Math.round(r * 100); }
function ctJoinScope_(v) {
  if (ctIsArray_(v)) {
    var parts = [];
    for (var i = 0; i < v.length; i++) if (v[i]) parts.push(String(v[i]).trim());
    return parts.join(' · ');
  }
  return String(v == null ? '' : v).trim();
}

/* ---------- 서명 링크 만료 ---------- */
function ctTtlHours_(given) {
  var ttl = Number(given);
  if (!isFinite(ttl) || ttl <= 0) ttl = Number(cfg_('SIGN_TTL_HOURS', CT_SIGN_TTL_HOURS));
  if (!isFinite(ttl) || ttl <= 0) ttl = CT_SIGN_TTL_HOURS;
  // 상한을 두는 이유: 만료가 아주 먼 링크는 사실상 상시 공개 주소다.
  // 고객 문자함에 반년 전 링크가 남아 있어도 열리면 안 된다.
  if (ttl > CT_SIGN_TTL_MAX_HOURS) ttl = CT_SIGN_TTL_MAX_HOURS;
  return ttl;
}

/* ---------- 백업 요약 ---------- */
function ctBackupSummary_(dump) {
  var cs = dump[SHEETS.CONTRACTS] || [];
  var byStatus = {}, amountTotal = 0, amountLive = 0;
  for (var i = 0; i < cs.length; i++) {
    var st = ctText_(cs[i].status) || STATUS.DRAFT;
    byStatus[st] = (ctHas_(byStatus, st) ? byStatus[st] : 0) + 1;
    var a = normalizeAmount(cs[i].amount);
    amountTotal += a;
    if (st !== STATUS.VOID) amountLive += a;   // 취소분을 뺀 합계도 함께 둔다
  }

  var ps = dump[SHEETS.PAYMENTS] || [];
  var pay = { count: ps.length, total: 0, paid: 0, invoiced: 0, pending: 0, receivable: 0 };
  for (var j = 0; j < ps.length; j++) {
    var amount = normalizeAmount(ps[j].amount);
    var status = ctText_(ps[j].status).toUpperCase() || 'PENDING';
    pay.total += amount;
    if (status === 'PAID') pay.paid += amount;
    else if (status === 'INVOICED') pay.invoiced += amount;
    else pay.pending += amount;
  }
  pay.receivable = pay.total - pay.paid;

  var toks = dump[SHEETS.TOKENS] || [];
  var live = 0;
  for (var k = 0; k < toks.length; k++) {
    if (!ctText_(toks[k].usedAt) && !ctText_(toks[k].revokedAt)) live++;
  }

  return {
    contracts: { count: cs.length, byStatus: byStatus, amountTotal: amountTotal, amountExcludingVoid: amountLive },
    payments: pay,
    tokens: { count: toks.length, unusedOrLive: live },
    events: (dump[SHEETS.EVENTS] || []).length
  };
}
