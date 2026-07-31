/** ============================================================
 * 만물인테리어 전자계약 — 현관 (contract-gateway-v1)
 * ------------------------------------------------------------
 * 이 파일이 하는 일
 *   · doPost 하나로 모든 동작을 받는다 — 본문 해석 · 요청시각(±10분) · 동작 허용목록 ·
 *     관리자 토큰 대조 · 고객 경로 분리 · 중복요청(idem) · 동시성 잠금 · 오류 → 규약 응답
 *   · doGet 으로 상태(JSON)와 화면(고객 서명 Sign.html · 관리자 Admin.html)을 낸다
 *   · selfTest — 배포 직후 "지금 계약을 받아도 되는가"를 한 번에 확인한다
 *   · quickSend(생성→잠금→링크) · exportCsv(목록 → CSV) 처럼 현장에서 실제로 쓰는 묶음
 *
 * 이 파일이 하지 않는 일 (하려고 들면 두 곳이 갈라진다)
 *   · 계약 규칙을 모른다. 금액·검증·상태 전이는 Pure.gs, 살림은 ContractService.gs 다.
 *     여기서 status 를 판단하거나 금액을 고치지 않는다.
 *   · 시트·드라이브를 직접 열지 않는다 → SheetService.gs / DriveService.gs
 *   · **고객 토큰을 대조하지 않는다.** 원문 토큰을 해시로 바꿔 시트에서 찾고,
 *     만료·사용·취소를 판정하는 일은 Sign.gs 의 몫이다. 여기서 또 판정하면
 *     두 곳의 답이 갈라지고, 갈라지는 순간 어느 쪽이 맞는지 아무도 모른다.
 *     이 파일은 "토큰처럼 생겼는가"만 보고 그대로 넘긴다.
 *   · 문자를 직접 보내지 않는다 → Notify.gs. 없으면 없다고 말한다(보낸 척하지 않는다).
 *
 * 비밀 취급 — 이 파일이 지키는 선
 *   · POST 로 받은 adminToken·signToken 값을 **어디에도 남기거나 되비추지 않는다.**
 *     단, 새로 발급한 고객 링크의 bearer 토큰은 그 링크를 전달하기 위한 발급 응답에 한 번 포함된다.
 *     인증 실패도 "실패했다"만 기록한다(무엇이 틀렸는지 적으면 그게 곧 힌트다).
 *   · health·selfTest 는 "설정됐는가(있음/없음)"만 답한다. 값은 한 글자도 싣지 않는다.
 *   · PEPPER 로 만든 해시도 응답에 싣지 않는다. 고정 문자열의 해시를 흘리면
 *     PEPPER 를 추측해 맞춰 볼 수 있는 대조표를 남에게 주는 셈이다.
 *
 * 오류는 'CODE|한국어 설명' 으로 던진다(PROTOCOL.md 오류 코드표에 있는 코드만).
 *   gwErrOut_ 이 첫 '|' 에서 갈라 { ok:false, error, message } 로 만든다.
 *   코드표에 없는 코드는 SERVER_ERROR 로 내린다 — 앱이 모르는 코드를 받아
 *   제 나름대로 해석하는 것보다, 모른다고 분명히 말하는 편이 낫다.
 *
 * 이름 규칙: 이 파일 안에서만 쓰는 것은 gw 로 시작한다(gateway).
 *   Apps Script 는 파일들이 전역을 함께 쓴다. Sign.gs·Notify.gs 와 이름이 겹치면
 *   경고 없이 한쪽이 덮어써지고, 그날 밤 서명이 이상하게 접수된다.
 *
 * ★ 다른 파일과의 약속 (아직 없는 파일도 있다 — 없으면 없다고 답한다)
 *   Sign.gs   signView_(signToken, ctx)            → { ok:true, … } 토큰을 소진하지 않는다
 *             signSubmit_(signToken, payload, ctx) → { ok:true, … } 서명 접수·완료본 생성
 *             doneView_(signToken, ctx)            → { ok:true, … } 완료본 열람
 *             signBoot_(signToken, mode)           → { state, message, data } (선택)
 *               ↳ doGet 이 화면을 그릴 때 왕복 한 번을 줄이려고 쓴다. 없으면 화면이 직접 묻는다.
 *   Notify.gs notifySend_({to, text, kind}, ctx)   → { sent:bool, reason:string }
 *   이 이름들을 globalThis 에서 찾아 쓴다(gwFn_). 아직 설치되지 않았으면 전체가
 *   ReferenceError 로 무너지는 대신 "그 모듈이 없습니다"라고 정확히 말한다.
 * ============================================================ */

var GATEWAY_VERSION = 'contract-gateway-v1';

/* ---------- 이 파일의 상수 ---------- */
var GW_SKEW_MS = 10 * 60 * 1000;      // 요청 시각 허용 오차 ±10분 (PROTOCOL.md)
var GW_LOCK_MS = 20000;               // 스크립트 잠금 대기 20초. 못 잡으면 기다리지 않고 BUSY.
var GW_IDEM_TTL_SEC = 21600;          // 6시간 — CacheService 가 허용하는 최댓값이기도 하다
var GW_IDEM_MAX_LEN = 200;            // 멱등 키 길이 상한
var GW_IDEM_MAX_BYTES = 90000;        // 캐시 한 칸은 100KB 가 한계다. 그 앞에서 포기한다.
var GW_MSG_MAX = 300;                 // 오류 메시지 길이 상한(스택은 절대 싣지 않는다)
var GW_CSV_PAGE = 200;                // exportCsv 가 한 번에 받아 오는 건수(listContracts_ 상한과 같다)
var GW_CSV_MAX_ROWS = 2000;           // CSV 최대 줄수 — 이보다 많으면 잘라내고 잘렸다고 말한다
var GW_SETTING_VALUE_MAX = 500;

// 고객 토큰의 생김새. base64url 43자 안팎(AuthService.gs randomToken).
// 여기서 보는 것은 **모양뿐**이다. 진짜인지·살아 있는지는 Sign.gs 가 판정한다.
var GW_TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;
var GW_SETTING_KEY_RE = /^[A-Za-z0-9_.\-]{1,40}$/;

// PROTOCOL.md 오류 코드표. 여기 없는 코드는 밖으로 내보내지 않는다.
var GW_ERROR_CODES = ['BAD_REQUEST', 'UNAUTHORIZED', 'NOT_CONFIGURED', 'CLOCK_SKEW', 'NOT_FOUND',
  'TOKEN_EXPIRED', 'TOKEN_USED', 'TOKEN_REVOKED', 'TOKEN_INVALID',
  'LOCKED', 'BAD_STATE', 'DOC_TAMPERED', 'BUSY', 'SERVER_ERROR'];

// 고객 경로가 계약 id 를 받는 길을 아예 막는다. 조용히 버리지 않고 시끄럽게 거절한다 —
// 버리기만 하면 "보냈는데 왜 안 되지"로 남고, 언젠가 누가 통하게 만들어 버린다.
var GW_ID_KEYS = ['id', 'contractId', 'contract_id', 'contractNo', 'contract_no'];

var GW_ACTIONS_ = null;               // 동작표 — 처음 쓸 때 만든다(아래 gwActions_ 주석 참고)
var GW_URL_CACHE_ = null;

/* ============================================================
 * 1) POST — 모든 동작의 유일한 입구
 * ============================================================ */
/**
 * 절대 예외를 밖으로 내보내지 않는다. Apps Script 가 예외를 잡으면 HTML 오류 화면이
 * 나가고, 앱은 JSON 대신 HTML 을 받아 "서버가 이상하다"밖에 말하지 못한다.
 * 무슨 일이 있어도 { ok:false, error, message } 로 답한다.
 */
function doPost(e) {
  try {
    return gwJson_(gwHandle_(gwParse_(e)));
  } catch (err) {
    return gwJson_(gwErrOut_(err));
  }
}

/* 요청 본문 해석. 규약은 text/plain 으로 온 **JSON 문자열**이다(PROTOCOL.md 첫 절). */
function gwParse_(e) {
  var raw = (e && e.postData && typeof e.postData.contents === 'string') ? e.postData.contents : '';
  if (!raw) {
    throw gwFail_('BAD_REQUEST',
      '요청 본문이 비어 있습니다 — JSON 을 text/plain 으로 보내 주세요');
  }
  var body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    // 원문을 오류에 싣지 않는다. 본문에는 서명 이미지와 토큰이 들어 있을 수 있다.
    throw gwFail_('BAD_REQUEST', '요청 본문을 JSON 으로 읽지 못했습니다');
  }
  if (!body || typeof body !== 'object' || gwIsArray_(body)) {
    throw gwFail_('BAD_REQUEST', '요청 본문이 JSON 객체가 아닙니다');
  }

  var idem = (body.idem == null) ? '' : String(body.idem).trim();
  if (idem.length > GW_IDEM_MAX_LEN) {
    throw gwFail_('BAD_REQUEST', '중복요청 키(idem)가 너무 깁니다');
  }

  return {
    action: String(body.action == null ? '' : body.action).trim(),
    ts: body.ts,
    // 토큰은 문자열일 때만 받는다. 이 두 값은 이 객체 밖으로 절대 나가지 않는다.
    adminToken: (typeof body.adminToken === 'string') ? body.adminToken : '',
    signToken: (typeof body.signToken === 'string') ? body.signToken.trim() : '',
    idem: idem,
    // 고객 경로에서 최상위 id 계열 열쇠도 거절하기 위한 표식.
    // payload 밖의 알 수 없는 값을 조용히 버리기 전에 존재 여부만 보존한다.
    rootContractIdPresent: gwHasContractIdKey_(body, false),
    payload: (body.payload && typeof body.payload === 'object' && !gwIsArray_(body.payload))
      ? body.payload : {},
    // 고객 기기가 스스로 알려준 User-Agent. 헤더는 Apps Script 가 주지 않으므로
    // 이것 말고는 방법이 없다. 스스로 신고한 값이라 증거로서는 약하다 —
    // 그래서 원문이 아니라 HMAC 해시만 원장에 남긴다(PROTOCOL.md '알아 두셔야 할 제약').
    ua: (typeof body.ua === 'string') ? body.ua.slice(0, 400) : ''
  };
}

/**
 * 검사 순서가 곧 보안이다. 앞의 것이 통과해야 뒤가 실행된다.
 *   ① 요청 시각  ② 아는 동작인가  ③ 어느 경로인가  ④ 자격 증명
 *   ⑤ 같은 요청이 이미 처리됐는가  ⑥ 잠금  ⑦ 실행  ⑧ 결과 보관
 * ④ 를 ⑤ 앞에 두는 이유: 토큰 없이 idem 만 맞히면 남의 결과를 꺼내 갈 수 있어서다.
 */
function gwHandle_(req) {
  gwCheckClock_(req.ts);

  var def = gwLookup_(req.action);
  var path = gwPath_(def, req);
  var rq, handler, idemScope = '';

  if (path === 'customer') {
    // ── 고객 경로 ──────────────────────────────────────────────
    // 관리자 토큰을 요구하지 않는다. 대신 계약 id 를 **절대 받지 않는다**.
    // id 로 열 수 있으면 id 를 바꿔 가며 남의 계약을 찾아볼 수 있다.
    if (req.rootContractIdPresent) {
      throw gwFail_('BAD_REQUEST',
        '고객 요청에는 계약 id 를 담을 수 없습니다 — 링크의 토큰만으로 처리합니다');
    }
    var token = gwCustomerToken_(req);
    handler = def.customerHandler || def.handler;
    rq = {
      action: req.action,
      signToken: token,
      payload: gwCustomerPayload_(req.payload),
      ctx: gwCtx_(req, 'customer')
    };
    // 모양만 보는 gwCustomerToken_ 으로는 인증이 아니다. 캐시를 읽기 전에
    // SignTokens 의 해시와 상태를 실제로 대조한다. 같은 idem 을 다른 고객 토큰이
    // 재사용해도 결과가 섞이지 않도록 캐시 범위도 토큰 해시로 묶는다.
    idemScope = gwCustomerIdemScope_(token, req.action, rq.ctx);
  } else if (path === 'admin') {
    // ── 관리자 경로 ────────────────────────────────────────────
    gwRequireAdmin_(req);
    idemScope = 'admin';
    handler = def.adminHandler || def.handler;
    // rq 에 adminToken 을 넣지 않는다. 핸들러가 토큰을 볼 이유가 없고,
    // 볼 수 없으면 실수로 어딘가에 적을 수도 없다.
    rq = { action: req.action, payload: req.payload, ctx: gwCtx_(req, 'admin') };
  } else {
    // ── 열린 경로 ── health 하나뿐이다. 값이 아니라 상태만 답한다.
    handler = def.handler;
    idemScope = 'public';
    rq = { action: req.action, payload: req.payload, ctx: gwCtx_(req, 'system') };
  }

  if (typeof handler !== 'function') {
    throw gwFail_('SERVER_ERROR', '동작 처리기가 준비되지 않았습니다: ' + req.action);
  }

  if (def.lock) {
    // 이중 확인(double-checked). 두 번 읽는 데는 각각 이유가 있다.
    //
    //   ① 잠금 **밖에서** 한 번 — 이미 저장된 결과가 있으면 잠금을 잡을 필요가 없다.
    //      이게 없으면, 다른 작업이 잠금을 쥐고 있는 동안 재시도한 고객이 저장된
    //      성공 결과를 못 받고 BUSY 로 튕긴다(전화가 끊겨 다시 누른 바로 그 상황이다).
    //      인증은 이미 위에서 끝났고 idemScope 가 자기 토큰으로 묶여 있으므로,
    //      여기서 읽는 것은 언제나 '자기 결과'다.
    //   ② 잠금 **안에서** 다시 — ①에서 둘 다 놓쳤을 때, 하나가 먼저 실행해 저장하면
    //      뒤따라 들어온 쪽은 여기서 적중해 두 번 실행하지 않는다.
    //      조회를 잠금 밖에만 두면 그 사이가 벌어져 같은 작업이 두 번 돈다.
    var preCached = gwIdemGet_(req.action, req.idem, idemScope);
    if (preCached) return preCached;
    return gwWithLock_(function () {
      var lockedCached = gwIdemGet_(req.action, req.idem, idemScope);
      if (lockedCached) return lockedCached;
      var lockedRes = gwOk_(handler(rq));
      gwIdemPut_(req.action, req.idem, idemScope, lockedRes);   // 저장까지 잠금 안에서
      return lockedRes;
    });
  }

  var cached = gwIdemGet_(req.action, req.idem, idemScope);
  if (cached) return cached;                 // 다시 실행하지 않는다
  var res = gwOk_(handler(rq));
  gwIdemPut_(req.action, req.idem, idemScope, res);
  return res;
}

/* ============================================================
 * 2) 동작표 — 무엇을 누가 어떤 잠금으로 부를 수 있는가
 * ============================================================ */
/**
 * 사장님이 지정한 이름이 정본이고, PROTOCOL.md 의 점 표기는 **같은 handler 로** 함께 받는다.
 * 이름이 둘이어도 처리는 하나다 — 두 벌로 만들면 언젠가 한쪽만 고쳐진다.
 *
 * admin  : ADMIN_TOKEN 대조가 필요한가
 * customer: signToken 만으로 들어오는 고객 경로인가 (계약 id 를 받지 않는다)
 * split  : 같은 이름에 두 경로가 다 있는가 (getContract 하나뿐)
 * lock   : LockService 로 감싸는가 — 시트에 쓰는 동작은 전부 건다
 *
 * 표를 함수 안에서 만드는 이유: Apps Script 는 파일을 이어 붙여 위에서부터 실행한다.
 * 파일 맨 위에서 var 로 표를 만들면 그 순간 존재하지 않는 함수를 가리킬 수 있다.
 * 처음 쓸 때 만들면 그때는 모든 파일이 이미 올라와 있다.
 */
function gwActions_() {
  if (GW_ACTIONS_) return GW_ACTIONS_;

  var defs = [
    // ── 토큰 없이 ──
    { names: ['health', 'contract.health'], handler: gwHealth_, admin: false, lock: false },

    // ── 관리자 ──
    // 'diag.selfTest' 는 관리자 화면(Admin.html)이 정본 이름을 못 알아들었을 때 되보내는 별칭이다.
    { names: ['selfTest', 'self.test', 'diag.selfTest'], handler: gwSelfTestAct_, admin: true, lock: false },
    { names: ['createContract', 'contract.create'], handler: gwCreate_, admin: true, lock: true },
    { names: ['listContracts', 'contract.list'], handler: gwList_, admin: true, lock: false },
    // 사장님 목록에는 없지만 규약(contract.lock)에 있는 동작이다. 이것이 없으면
    // createContract 로 만든 계약을 잠글 수 없고, 잠기지 않은 계약에는 서명 링크가 안 나간다.
    { names: ['lockContract', 'contract.lock'], handler: gwLock_, admin: true, lock: true },
    { names: ['issueSignLink', 'signlink.issue'], handler: gwIssueLink_, admin: true, lock: true },
    { names: ['quickSend', 'contract.quickSend'], handler: gwQuickSend_, admin: true, lock: true },
    { names: ['voidContract', 'contract.void'], handler: gwVoid_, admin: true, lock: true },
    { names: ['recordPayment', 'payment.update'], handler: gwPayment_, admin: true, lock: true },
    { names: ['backup', 'backup.export'], handler: gwBackup_, admin: true, lock: false },
    { names: ['exportCsv', 'contract.exportCsv', 'export.csv'], handler: gwExportCsv_, admin: true, lock: false },
    { names: ['notify.send', 'notifySend'], handler: gwNotify_, admin: true, lock: false },
    // AI 중계 — 키를 브라우저에서 서버로 옮기기 위한 통과창구.
    // lock:false 인 이유: 한도 계산은 AiService 안에서 자기 잠금으로 처리하고,
    // 여기서 전체 잠금을 잡으면 AI 응답을 기다리는 동안 계약 처리까지 멈춘다.
    { names: ['ai.ask', 'aiAsk'], handler: gwAiAsk_, admin: true, lock: false },
    { names: ['ai.status', 'aiStatus'], handler: gwAiStatus_, admin: true, lock: false },
    { names: ['settings.get', 'settingsGet'], handler: gwSettingsGet_, admin: true, lock: false },
    { names: ['settings.set', 'settingsSet'], handler: gwSettingsSet_, admin: true, lock: true },

    // ── 갈림길 ── 같은 이름을 관리자와 고객이 함께 쓰는 유일한 동작.
    // 자격 증명으로 갈라지고, 갈라진 뒤에는 서로 다른 함수가 처리한다(섞이지 않는다).
    {
      names: ['getContract'], split: true, admin: false, lock: false,
      adminHandler: gwGetAdmin_, customerHandler: gwSignView_
    },
    // 점 표기 별칭은 경로가 하나로 정해져 있다 — 이름만 보고도 어느 쪽인지 알 수 있게.
    { names: ['contract.get'], handler: gwGetAdmin_, admin: true, lock: false },

    // ── 고객 (signToken 만 · 계약 id 없음) ──
    { names: ['sign.view', 'viewContract'], handler: gwSignView_, admin: false, customer: true, lock: false },
    { names: ['signContract', 'sign.submit'], handler: gwSignSubmit_, admin: false, customer: true, lock: true },
    // completeContract 는 고객 전용이다. 관리자가 서명 없이 계약을 '완료 처리'하는 길은
    // 만들지 않는다 — 그 길이 있으면 전자계약의 근거가 통째로 무너진다.
    // 관리자는 getContract 로 완료본 정보(completedFileId·completedSha256)를 본다.
    { names: ['completeContract', 'done.view'], handler: gwDoneView_, admin: false, customer: true, lock: false }
  ];

  var map = {};
  for (var i = 0; i < defs.length; i++) {
    for (var j = 0; j < defs[i].names.length; j++) {
      var name = defs[i].names[j];
      // 같은 이름을 두 번 등록하면 조용히 덮어써진다. 그 사고를 배포 첫 요청에서 잡는다.
      if (gwHas_(map, name)) throw gwFail_('SERVER_ERROR', '동작 이름이 중복되었습니다: ' + name);
      map[name] = defs[i];
    }
  }
  GW_ACTIONS_ = map;
  return map;
}

/* 허용목록에 없으면 거부한다. 비슷한 이름을 추측해 골라 주지 않는다. */
function gwLookup_(action) {
  if (!action) throw gwFail_('BAD_REQUEST', 'action 이 없습니다');
  var map = gwActions_();
  // hasOwnProperty 로 찾는다. action 이 'constructor' 나 'toString' 이면
  // 물려받은 값이 잡혀 정의되지 않은 동작이 통과해 버린다.
  if (!gwHas_(map, action)) {
    throw gwFail_('BAD_REQUEST', '알 수 없는 동작입니다: ' + gwSafeEcho_(action));
  }
  return map[action];
}

/* 어느 경로로 처리할지 정한다. 자격 증명이 섞여 오면 거절한다 — 섞인 요청은
   둘 중 무엇으로 처리하든 한쪽 규칙을 어기게 된다. */
function gwPath_(def, req) {
  var hasSign = !!req.signToken;
  var hasAdmin = !!req.adminToken;

  if (def.split) {
    if (hasSign && hasAdmin) {
      throw gwFail_('BAD_REQUEST', '관리자 토큰과 서명 토큰을 함께 보낼 수 없습니다 — 둘 중 하나만 보내 주세요');
    }
    if (hasSign) return 'customer';
    if (hasAdmin) return 'admin';
    throw gwFail_('BAD_REQUEST', 'adminToken(관리자) 또는 signToken(고객) 중 하나가 필요합니다');
  }
  if (def.customer) return 'customer';
  if (def.admin) return 'admin';
  return 'open';
}

/* ============================================================
 * 3) 자격 증명
 * ============================================================ */
/**
 * 관리자 토큰 대조. 상수시간 비교(AuthService.gs)를 쓴다 —
 * 문자열 == 로 비교하면 몇 글자까지 맞았는지가 응답 시간으로 새어 나간다.
 *
 * 실패해도 **입력된 토큰 값은 어디에도 남기지 않는다.** 원장에 남는 것은
 * "어떤 동작에서, 토큰이 없었는지 틀렸는지"뿐이다.
 */
function gwRequireAdmin_(req) {
  var want = cfg_('ADMIN_TOKEN', '');
  if (!want) {
    // 설정이 덜 된 것과 토큰이 틀린 것은 사장님이 할 일이 다르다. 코드도 달라야 한다.
    throw gwFail_('NOT_CONFIGURED',
      'ADMIN_TOKEN 이 설정되지 않았습니다 — 프로젝트 설정 ▸ 스크립트 속성에 추가하세요');
  }
  var got = req.adminToken;
  if (!got) {
    gwAuthFailed_(req.action, '토큰 없음');
    throw gwFail_('UNAUTHORIZED', '관리자 토큰이 필요한 동작입니다');
  }
  if (!constantTimeEq(got, want)) {
    gwAuthFailed_(req.action, '토큰 불일치');
    throw gwFail_('UNAUTHORIZED', '관리자 토큰이 올바르지 않습니다');
  }
}

/* 인증 실패는 반드시 원장에 남긴다. 다만 기록에 실패했다고 해서 거절을 무르지는 않는다 —
   기록보다 거절이 먼저다. (원장 쓰기가 막히는 상황: 시트 미설정·권한 없음) */
function gwAuthFailed_(action, why) {
  try {
    logEvent_('', EVENTS.ADMIN_AUTH_FAILED, '관리자 인증 실패 · ' + gwSafeEcho_(action) + ' · ' + why, {
      at: new Date().toISOString(), actor: 'system'
    });
  } catch (e) { /* 기록 실패가 거절을 막지 못하게 한다 */ }
}

/* 고객 토큰의 모양을 먼저 본다. 실제 해시·상태 대조는 캐시 전에 gwCustomerIdemScope_ 가 한다. */
function gwCustomerToken_(req) {
  if (req.adminToken) {
    throw gwFail_('BAD_REQUEST', '고객 요청에는 관리자 토큰을 함께 보낼 수 없습니다');
  }
  var t = req.signToken;
  if (!t) {
    throw gwFail_('TOKEN_INVALID', '서명 링크의 토큰이 없습니다 — 문자로 받으신 링크를 다시 열어 주세요');
  }
  if (!GW_TOKEN_RE.test(t)) {
    // 토큰 값을 메시지에 되돌려 주지 않는다(주소창·화면 캡처로 남는다).
    throw gwFail_('TOKEN_INVALID', '서명 링크가 올바르지 않습니다 — 문자로 받으신 링크를 다시 열어 주세요');
  }
  return t;
}

/**
 * 고객이 보낸 payload 에서 계약 id 계열 열쇠를 **거절**한다.
 * 조용히 지우지 않는 이유: 지우기만 하면 "보냈는데 왜 안 되지"로 남고,
 * 언젠가 누군가 친절하게 통하도록 고쳐 버린다. 통하지 않는다는 사실이 보여야 한다.
 */
function gwCustomerPayload_(payload) {
  var p = payload || {};
  if (gwHasContractIdKey_(p, true)) {
    throw gwFail_('BAD_REQUEST',
      '고객 요청에는 계약 id 를 담을 수 없습니다 — 링크의 토큰만으로 처리합니다');
  }
  return p;
}

/* 계약 id 계열 열쇠의 '존재'를 본다. 빈 문자열이나 null 도 조용히 허용하지 않는다.
 *
 * ★ 깊이와 노드 수에 한도를 둔다. 이 검사는 **토큰을 대조하기 전에** 돈다
 *   (gwCustomerPayload_ → 여기 → 그 뒤에야 gwCustomerIdemScope_ 가 진짜 토큰을 본다).
 *   한도가 없으면 토큰 모양만 맞춘 아무나 40000겹짜리 payload 로 스택을 터뜨릴 수 있고,
 *   그 'Maximum call stack size exceeded' 라는 영문 엔진 문구가 고객 화면에 그대로 나간다
 *   (실측: depth 20000 에서 재현). Apps Script V8 스택은 Node 보다 얕아 임계는 더 낮다.
 *
 *   한도를 넘으면 '못 봤다'가 아니라 **거절**한다. 다 뒤지지 못한 payload 를 통과시키면
 *   깊이만 늘려 검사를 우회할 수 있기 때문이다. 정상 요청은 두 겹을 넘지 않는다
 *   (sign.submit 의 payload 는 {signerName, signatureImage, agreed, docHashSeen} 평면이다). */
var GW_ID_SCAN_MAX_DEPTH = 12;
var GW_ID_SCAN_MAX_NODES = 2000;

function gwHasContractIdKey_(value, recursive) {
  if (!value || typeof value !== 'object') return false;
  // 얕은 검사(recursive=false)는 '이 층에 id 열쇠가 있나'만 본다.
  // 여기에 깊이 한도를 적용하면 payload 를 가진 **모든 정상 요청**이 거절된다
  // (실제로 그렇게 만들었다가 테스트가 잡았다 — quickSend 까지 전부 막혔다).
  if (!recursive) return gwHasOwnIdKey_(value);
  return gwScanIdKey_(value, GW_ID_SCAN_MAX_DEPTH, { nodes: GW_ID_SCAN_MAX_NODES });
}

function gwHasOwnIdKey_(value) {
  for (var i = 0; i < GW_ID_KEYS.length; i++) {
    if (gwHas_(value, GW_ID_KEYS[i])) return true;
  }
  return false;
}

function gwScanIdKey_(value, depthLeft, budget) {
  if (!value || typeof value !== 'object') return false;
  if (--budget.nodes < 0) {
    throw gwFail_('BAD_REQUEST', '요청 내용이 너무 복잡합니다 — 값을 줄여 다시 보내 주세요');
  }
  if (gwHasOwnIdKey_(value)) return true;
  if (depthLeft <= 0) {
    // 더 들어갈 수 없다. 안 본 곳을 '없다'로 넘기면 깊이로 검사를 피할 수 있다.
    return gwHasNestedObject_(value)
      ? (function () { throw gwFail_('BAD_REQUEST', '요청 내용이 너무 깊습니다 — 값을 줄여 다시 보내 주세요'); }())
      : false;
  }
  if (gwIsArray_(value)) {
    for (var a = 0; a < value.length; a++) {
      if (gwScanIdKey_(value[a], depthLeft - 1, budget)) return true;
    }
    return false;
  }
  for (var k in value) {
    if (gwHas_(value, k) && gwScanIdKey_(value[k], depthLeft - 1, budget)) return true;
  }
  return false;
}

/* 이 값 바로 아래에 더 들어갈 객체가 남아 있는가 — 깊이 한도에 걸렸을 때만 쓴다. */
function gwHasNestedObject_(value) {
  if (gwIsArray_(value)) {
    for (var a = 0; a < value.length; a++) {
      if (value[a] && typeof value[a] === 'object') return true;
    }
    return false;
  }
  for (var k in value) {
    if (gwHas_(value, k) && value[k] && typeof value[k] === 'object') return true;
  }
  return false;
}

/**
 * 고객 자격 증명을 멱등성 캐시보다 먼저 실제 대조한다.
 * sign.submit 재시도는 첫 응답을 잃었을 수 있으므로 이미 소진된 정확한 토큰도
 * 캐시 조회까지만 허용한다. 캐시가 없으면 실제 처리기가 TOKEN_USED 로 거절한다.
 */
function gwCustomerIdemScope_(token, action, ctx) {
  var purpose = (action === 'completeContract' || action === 'done.view') ? 'view' : 'sign';
  var allowUsed = (action === 'signContract' || action === 'sign.submit');
  var f = gwFn_(['sgIdemScope_']);
  if (!f) throw gwFail_('SERVER_ERROR', '고객 토큰 인증 모듈이 준비되지 않았습니다');
  return f(token, purpose, allowUsed, ctx);
}

/* ============================================================
 * 4) 요청 시각 · 잠금 · 중복요청
 * ============================================================ */
function gwCheckClock_(ts) {
  var ms = gwTsMs_(ts);
  if (ms == null) {
    throw gwFail_('BAD_REQUEST', 'ts(요청 시각)가 없습니다 — 보내는 쪽에서 Date.now() 를 함께 실어 주세요');
  }
  var diff = Math.abs(Date.now() - ms);
  if (diff > GW_SKEW_MS) {
    throw gwFail_('CLOCK_SKEW',
      '기기 시각이 서버와 약 ' + Math.round(diff / 60000) + '분 어긋나 있습니다 — '
      + '휴대폰의 날짜·시간을 자동으로 맞춘 뒤 다시 시도해 주세요');
  }
}

// 밀리초·초·ISO 문자열을 모두 받아 준다. 보내는 쪽이 여럿이라 형태가 갈릴 수 있고,
// 형태 때문에 계약이 막히는 것보다 받아 주는 편이 낫다(허용 오차 자체는 그대로 엄격하다).
// 1e11ms 는 1973년이다 — 그보다 작은 값은 초 단위로 본다.
function gwTsMs_(ts) {
  if (typeof ts === 'number' && isFinite(ts)) {
    var n = ts;
    if (n > 0 && n < 1e11) n = n * 1000;
    return Math.round(n);
  }
  if (typeof ts === 'string' && ts) {
    var s = ts.trim();
    if (/^\d+$/.test(s)) return gwTsMs_(Number(s));
    var p = Date.parse(s);
    if (isFinite(p)) return p;
  }
  return null;
}

/**
 * 스크립트 잠금. 못 잡으면 **기다리지 않고 실패**한다(PROTOCOL.md 동시성).
 * 기다렸다가 실행하면 사장님이 두 번 누른 것이 계약 두 건이 된다.
 *
 * ⚠ try/finally 로 반드시 놓는다. 안 놓으면 20초 동안 전체가 막힌다 —
 *   그 사이 고객의 서명 제출까지 BUSY 로 튕긴다.
 */
function gwWithLock_(fn) {
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(GW_LOCK_MS);
  } catch (e) {
    got = false;
  }
  if (!got) {
    throw gwFail_('BUSY', '다른 작업이 진행 중입니다 — 잠시 후 다시 시도해 주세요');
  }
  try {
    return fn();
  } finally {
    // releaseLock 이 던지더라도 원래 오류를 덮지 않게 감싼다.
    try { lock.releaseLock(); } catch (e2) { /* 실행이 끝나면 잠금은 어차피 풀린다 */ }
  }
}

/**
 * 중복요청(idem) — 같은 열쇠로 다시 오면 **저장된 결과를 그대로** 돌려주고 다시 실행하지 않는다.
 *
 * 정직한 한계: CacheService 는 보관을 **약속하지 않는다.** 6시간을 걸어 두어도 구글이
 * 용량 압박이나 서버 교체로 언제든 비울 수 있다. 캐시가 비면 같은 idem 이 다시 실행된다.
 * 즉 이것은 "대개 막아 준다"이지 보장이 아니다. 진짜로 두 번 만들어지면 안 되는 것은
 * 잠금(LockService)과 계약번호 중복 확인(ContractService.gs ctReserveContractNo_)이 막는다.
 *
 * 실패한 결과는 보관하지 않는다. 첫 시도가 일시적인 이유로 실패했다면 다시 해 볼 수 있어야 한다.
 */
function gwIdemKey_(action, idem, scope) {
  // 동작과 인증 범위를 함께 넣는다. 같은 idem 을 다른 동작이나 다른 고객이
  // 재사용해도 남의 결과가 나오지 않게 한다.
  // 해시로 접는 이유: idem 원문 길이·문자에 상관없이 캐시 열쇠 규격에 맞추기 위해서다.
  return 'ctidem:' + sha256Hex(action + '|' + String(scope || '') + '|' + idem).slice(0, 40);
}

function gwIdemGet_(action, idem, scope) {
  if (!idem) return null;
  try {
    var raw = CacheService.getScriptCache().get(gwIdemKey_(action, idem, scope));
    if (!raw) return null;
    var o = JSON.parse(raw);
    return (o && typeof o === 'object') ? o : null;
  } catch (e) {
    return null;   // 캐시를 못 읽는 것은 실패가 아니다. 그냥 처음처럼 실행한다.
  }
}

function gwIdemPut_(action, idem, scope, res) {
  if (!idem || !res || res.ok === false) return;
  try {
    var json = JSON.stringify(res);
    // 캐시 한 칸은 100KB 가 한계다. 넘치면 저장하지 않는다(넘긴 채로 넣으면 통째로 실패한다).
    if (json.length > GW_IDEM_MAX_BYTES) return;
    CacheService.getScriptCache().put(gwIdemKey_(action, idem, scope), json, GW_IDEM_TTL_SEC);
  } catch (e) { /* 보관 실패는 응답을 막지 않는다 */ }
}

/* ============================================================
 * 5) 관리자 동작 — 얇은 껍데기. 규칙은 ContractService.gs 에 있다.
 * ============================================================ */
function gwCreate_(rq) { return createContract_(rq.payload, rq.ctx); }
function gwGetAdmin_(rq) { return getContract_(gwId_(rq.payload)); }
function gwList_(rq) { return listContracts_(rq.payload); }
function gwLock_(rq) { return lockContract_(gwId_(rq.payload), rq.ctx); }
function gwVoid_(rq) { return voidContract_(gwId_(rq.payload), (rq.payload || {}).reason, rq.ctx); }
function gwPayment_(rq) { return updatePayment_(rq.payload, rq.ctx); }
function gwBackup_(rq) { return exportBackup_(rq.ctx); }
function gwIssueLink_(rq) {
  var p = rq.payload || {};
  return issueSignLink_(gwId_(p), p.ttlHours, rq.ctx);
}

function gwId_(payload) {
  var p = payload || {};
  var id = String(p.id == null ? (p.contractId == null ? '' : p.contractId) : p.id).trim();
  if (!id) throw gwFail_('BAD_REQUEST', '계약 id 가 없습니다');
  return id;
}

/* ---------- AI 중계 ---------- */
/* AiService.gs 가 없으면 없다고 답한다. 있는 척하지 않는다 —
   앱이 이 답을 보고 기기에 넣어 둔 키로 되돌아갈 수 있어야 한다. */
function gwAiAsk_(rq) {
  var f = gwFn_(['aiAsk_']);
  if (!f) throw gwFail_('AI_NOT_CONFIGURED', 'AI 중계 모듈(AiService.gs)이 설치되지 않았습니다');
  return f(rq.payload, rq.ctx);
}
function gwAiStatus_(rq) {
  var f = gwFn_(['aiStatus_']);
  if (!f) return { ok: true, available: false, providers: {}, note: 'AI 중계 모듈이 설치되지 않았습니다' };
  var st = f();
  st.ok = true;
  return st;
}

/* ============================================================
 * 6) 고객 동작 — Sign.gs 로 넘긴다. 처리기는 잠금 안에서 토큰 상태를 다시 판정한다.
 * ============================================================ */
function gwSignView_(rq) {
  return gwCallSign_(['signView_', 'viewContract_'], [rq.signToken, rq.ctx], '계약서 열람');
}
function gwSignSubmit_(rq) {
  return gwCallSign_(['signSubmit_', 'submitSign_', 'signContract_'],
    [rq.signToken, rq.payload, rq.ctx], '서명 접수');
}
function gwDoneView_(rq) {
  return gwCallSign_(['doneView_', 'viewCompleted_', 'completeContract_'],
    [rq.signToken, rq.ctx], '완료본 열람');
}

/**
 * Sign.gs 의 함수를 이름으로 찾아 부른다.
 * 아직 설치되지 않았으면 ReferenceError 로 전체가 무너지는 대신,
 * 무엇이 없어서 안 되는지 정확히 말한다. 고객 화면은 이 문구를 그대로 보여 준다.
 */
function gwCallSign_(names, args, what) {
  var f = gwFn_(names);
  if (!f) {
    throw gwFail_('SERVER_ERROR',
      '서명 처리 모듈(Sign.gs)이 설치되지 않아 ' + what + '을(를) 처리할 수 없습니다 — 담당자에게 알려 주세요');
  }
  return f.apply(null, args);
}

/* ============================================================
 * 7) quickSend — 생성 → 잠금 → 링크발급을 한 잠금 안에서
 * ============================================================ */
/**
 * 현장에서 폰으로 계약을 보낼 때 쓰는 동작(PROTOCOL.md). 세 번 왕복하면 신호가 나쁜
 * 현장에서 두 번째가 끊겨 '잠기지 않은 계약'이 남는다. 그래서 셋을 하나로 묶는다.
 * 동작표에서 lock:true 이므로 이 함수 전체가 이미 스크립트 잠금 안이다.
 *
 * ⚠ 정직한 한계 — 되돌리기(rollback)는 없다.
 *   시트에는 트랜잭션이 없고, 이 시스템은 계약 기록을 지우지 않는다(SheetService.gs 에
 *   deleteRow 가 없는 것도 같은 이유다). 그래서 중간에 실패하면 계약은 남는다.
 *   남는다면 **그 사실을 응답에 정직히 담는다** — 계약번호를 오류 메시지에 실어,
 *   사장님이 목록에서 찾아 잠그거나 취소할 수 있게 한다. 조용히 실패하면
 *   빈 계약이 쌓이고 계약번호만 축난다.
 */
function gwQuickSend_(rq) {
  var p = rq.payload || {};
  var ctx = rq.ctx;

  var created = createContract_(p, ctx);

  var locked;
  try {
    locked = lockContract_(created.id, ctx);
  } catch (e) {
    throw gwPartial_(e, created, '계약 잠금');
  }

  var link;
  try {
    link = issueSignLink_(created.id, p.ttlHours, ctx);
  } catch (e2) {
    throw gwPartial_(e2, created, '서명 링크 발급');
  }

  return {
    ok: true,
    contractId: created.id,
    contractNo: created.contractNo,
    status: STATUS.SENT,
    title: created.title,
    amount: created.amount,
    customerName: created.customerName,
    docHash: locked.docHash,
    signUrl: link.url,                  // ← 원문 토큰이 실린 완성 링크. 이 응답에서만 볼 수 있다.
    linkReady: link.linkReady,          // WEBAPP_URL 이 없으면 false — 주소를 지어내지 않는다
    expiresAt: link.expiresAt,
    ttlHours: link.ttlHours,
    notify: gwNotifyFor_(p, link, ctx), // 기본은 { sent:false, reason:'MOCK_OFF' }
    message: link.message || ''
  };
}

/**
 * 만들어진 계약이 남았다는 사실을 오류 메시지에 담는다.
 * 코드는 원래 실패한 것을 그대로 쓴다 — 여기서 코드를 바꾸면 앱이 원인을 잘못 안내한다.
 *
 * 사건기록을 여기서 따로 남기지 않는 이유: Schema.gs 의 EVENTS 에는 '부분 실패' 이름이 없고,
 * 가까운 이름(CONTRACT_CREATED)을 빌려 쓰면 나중에 계약 건수를 셀 때 한 건이 두 번 세어진다.
 * 원장에는 이미 CONTRACT_CREATED 만 있고 그 뒤에 CONTRACT_LOCKED 가 없다 —
 * **뒤따라야 할 사건이 없다는 것**이 곧 여기서 멈췄다는 기록이다.
 */
function gwPartial_(err, created, step) {
  var out = gwErrOut_(err);
  return gwFail_(out.error,
    '계약 ' + created.contractNo + ' 은(는) 만들어졌지만 ' + step + '에서 멈췄습니다: '
    + out.message + ' — 계약 목록에서 찾아 잠그거나 취소해 주세요(자동으로 지우지 않습니다).');
}

/* ============================================================
 * 8) 알림 — 기본은 꺼짐. 보내지 않았으면 보내지 않았다고 말한다.
 * ============================================================ */
/**
 * ALIMTALK_LIVE 가 분명히 켜져 있을 때만 실제 발송을 시도한다.
 * 설정이 없거나 모르는 값이면 꺼진 것으로 본다 — 발송은 "켰다고 분명히 말했을 때만" 켠다.
 */
function gwLive_() {
  var v = String(cfg_('ALIMTALK_LIVE', '') || '').trim().toLowerCase();
  return (v === '1' || v === 'true' || v === 'on' || v === 'yes' || v === 'live');
}

/* quickSend 에 딸린 발송. 실패해도 계약과 링크는 정상이므로 여기서 계약을 무르지 않는다.
   대신 sent:false 와 이유를 그대로 담는다 —
   앱이 notify.sent 를 보지 않고 "보냈습니다"라고 띄우면 그건 앱의 잘못이다(PROTOCOL.md). */
function gwNotifyFor_(p, link, ctx) {
  if (!gwLive_()) return { sent: false, reason: 'MOCK_OFF' };

  var f = gwFn_(['notifySend_', 'sendNotify_']);
  if (!f) return { sent: false, reason: 'NOT_INSTALLED' };

  var to = (p && p.customer && p.customer.phone) || '';
  if (!to || !link.url) return { sent: false, reason: 'NO_TARGET' };

  try {
    var r = f({ to: to, text: '계약서 서명 링크입니다: ' + link.url, kind: 'contract_sign' }, ctx) || {};
    return { sent: r.sent === true, reason: String(r.reason || (r.sent === true ? 'SENT' : 'FAILED')) };
  } catch (e) {
    return { sent: false, reason: 'SEND_FAILED' };
  }
}

/* notify.send — 임의 문자 발송 시도(관리자). 꺼져 있으면 막혔다고 원장에 남긴다. */
function gwNotify_(rq) {
  var p = rq.payload || {};
  var kind = String(p.kind || 'manual').slice(0, 40);

  if (!gwLive_()) {
    try {
      logEvent_('', EVENTS.MESSAGE_BLOCKED, '발송 꺼짐(ALIMTALK_LIVE) · 종류 ' + kind, rq.ctx);
    } catch (e) { /* 기록 실패가 응답을 막지 않는다 */ }
    return { ok: true, sent: false, reason: 'MOCK_OFF', message: '발송이 꺼져 있어 보내지 않았습니다' };
  }

  var f = gwFn_(['notifySend_', 'sendNotify_']);
  if (!f) {
    return { ok: true, sent: false, reason: 'NOT_INSTALLED', message: '발송 모듈(Notify.gs)이 설치되어 있지 않습니다' };
  }
  var r = f({ to: p.to, text: p.text, kind: kind }, rq.ctx) || {};
  return { ok: true, sent: r.sent === true, reason: String(r.reason || ''), message: String(r.message || '') };
}

/* ============================================================
 * 9) health — 버전과 '무엇이 설정됐는지'만. 값은 절대 담지 않는다.
 * ============================================================ */
function gwHealth_() {
  return {
    ok: true,
    app: '만물인테리어 전자계약',
    version: GATEWAY_VERSION,
    // typeof 로 확인하고 읽는다. 파일 하나가 빠진 채로 배포되어도 health 는 답해야 한다 —
    // 선언되지 않은 이름을 그냥 부르면 그 자리에서 ReferenceError 로 멈춘다.
    versions: {
      gateway: GATEWAY_VERSION,
      protocol: 'contract-api-v1',
      schema: (typeof SCHEMA_VERSION === 'string') ? SCHEMA_VERSION : '',
      pure: (typeof PURE_VERSION === 'string') ? PURE_VERSION : '',
      store: (typeof STORE_VERSION === 'string') ? STORE_VERSION : '',
      crypto: (typeof CRYPTO_VERSION === 'string') ? CRYPTO_VERSION : '',
      contracts: (typeof CONTRACTS_VERSION === 'string') ? CONTRACTS_VERSION : '',
      drive: (typeof DRIVE_VERSION === 'string') ? DRIVE_VERSION : ''
    },
    // 있음/없음만. 값은 한 글자도 싣지 않는다.
    configured: {
      adminToken: gwHasProp_('ADMIN_TOKEN'),
      pepper: gwHasProp_('PEPPER'),
      spreadsheetId: gwHasProp_('SPREADSHEET_ID'),
      driveFolderId: gwHasProp_('DRIVE_FOLDER_ID'),
      webappUrl: gwHasProp_('WEBAPP_URL'),
      signTtlHours: gwHasProp_('SIGN_TTL_HOURS'),
      viewTtlMinutes: gwHasProp_('VIEW_TTL_MINUTES'),
      // SOLAPI_* 는 이름이 여럿이라(키·시크릿·발신번호) 하나씩 세지 않고 '있는가'만 본다.
      solapi: gwHasPropPrefix_('SOLAPI_')
    },
    modules: {
      sign: !!gwFn_(['signView_', 'viewContract_']),
      notify: !!gwFn_(['notifySend_', 'sendNotify_']),
      ai: !!gwFn_(['aiAsk_'])
    },
    // 앱이 'AI 를 서버로 보낼까 기기 키로 부를까'를 정하는 데 쓴다. 키 값은 싣지 않는다.
    ai: {
      gemini: gwHasProp_('GEMINI_API_KEY'),
      openai: gwHasProp_('OPENAI_API_KEY')
    },
    notify: { live: gwLive_() },     // 기본은 false(꺼짐)
    serverTime: new Date().toISOString(),
    timeZone: gwTz_()
  };
}

/* ============================================================
 * 10) selfTest — "지금 계약을 받아도 되는가"
 * ============================================================ */
/**
 * 현장 앱은 **allOk 하나만 보고** 계약 버튼을 연다.
 * 그래서 allOk 는 모든 항목이 통과했을 때만 true 다. 하나라도 실패하면 false —
 * '대체로 괜찮음' 같은 중간값을 만들지 않는다. 중간값이 있으면 언젠가 그것을 통과로 읽는다.
 *
 * 값은 확인하지 않는다(무엇이 설정됐는지만). PEPPER 로 만든 해시도 응답에 싣지 않는다 —
 * 고정 문자열의 해시를 흘리면 PEPPER 를 맞춰 볼 수 있는 대조표를 넘겨주는 셈이다.
 */
function gwSelfTest_() {
  var items = [];

  // ① 스크립트 속성 4개 — 있음/없음만
  var need = ['ADMIN_TOKEN', 'PEPPER', 'SPREADSHEET_ID', 'DRIVE_FOLDER_ID'];
  for (var i = 0; i < need.length; i++) {
    var has = gwHasProp_(need[i]);
    items.push({
      name: '스크립트 속성 ' + need[i],
      ok: has,
      detail: has ? '설정됨' : '없음 — 프로젝트 설정 ▸ 스크립트 속성에 추가하세요'
    });
  }

  // ② 스프레드시트가 열리는가
  var ss = null;
  try {
    ss = ss_();
    items.push({ name: '스프레드시트 열림', ok: true, detail: '시트 ' + ss.getSheets().length + '장' });
  } catch (e) {
    // 스프레드시트 ID 는 메시지에 싣지 않는다(ss_ 도 싣지 않는다).
    items.push({ name: '스프레드시트 열림', ok: false, detail: gwShort_(e) });
  }

  // ③ 시트 5장이 다 있는가 — 하나라도 없으면 읽기·쓰기가 통째로 어긋난다
  if (!ss) {
    items.push({ name: '시트 5개 존재', ok: false, detail: '스프레드시트를 열지 못해 확인하지 못했습니다' });
  } else {
    var missing = [];
    for (var s = 0; s < SHEET_DEFS.length; s++) {
      if (!ss.getSheetByName(SHEET_DEFS[s].name)) missing.push(SHEET_DEFS[s].name);
    }
    items.push({
      name: '시트 ' + SHEET_DEFS.length + '개 존재',
      ok: missing.length === 0,
      detail: missing.length === 0
        ? '모두 있음'
        : '없는 시트: ' + missing.join(', ') + ' — setupSheets() 를 한 번 실행하세요'
    });
  }

  // ④ Drive 폴더가 열리는가 (폴더를 새로 만들지 않는 dvRoot_ 로 확인한다)
  try {
    var f = gwFn_(['dvRoot_']);
    if (!f) {
      items.push({ name: 'Drive 폴더 열림', ok: false, detail: 'DriveService.gs 가 설치되어 있지 않습니다' });
    } else {
      var folder = f();
      // 폴더 ID 는 남기지 않는다. 이름만으로 사장님이 알아보실 수 있다.
      items.push({ name: 'Drive 폴더 열림', ok: true, detail: '폴더 「' + folder.getName() + '」' });
    }
  } catch (e2) {
    items.push({ name: 'Drive 폴더 열림', ok: false, detail: gwShort_(e2) });
  }

  // ⑤ PEPPER 로 해시가 만들어지는가 — 만들어졌다는 사실만 확인한다
  try {
    var h = hmacHex('selftest');
    var good = /^[0-9a-f]{64}$/.test(String(h));
    items.push({
      name: 'PEPPER 해시 생성',
      ok: good,
      detail: good ? '정상(해시 값은 남기지 않습니다)' : '해시 모양이 올바르지 않습니다'
    });
  } catch (e3) {
    items.push({ name: 'PEPPER 해시 생성', ok: false, detail: gwShort_(e3) });
  }

  // ⑥ 발송이 꺼져 있는가 — 지금 단계에서는 꺼져 있어야 통과다.
  //    켠 채로 현장에 나가면 시험 삼아 만든 계약이 고객에게 실제로 날아간다.
  var live = gwLive_();
  items.push({
    name: '문자 발송 꺼짐',
    ok: !live,
    detail: live
      ? '실제 발송이 켜져 있습니다(ALIMTALK_LIVE) — 지금 단계에서는 꺼 두세요'
      : '꺼져 있음(MOCK_OFF)'
  });

  var allOk = true;
  for (var k = 0; k < items.length; k++) if (!items[k].ok) allOk = false;

  return {
    ok: true,
    at: new Date().toISOString(),
    version: GATEWAY_VERSION,
    checks: { allOk: allOk, items: items },
    // 링크 주소가 없으면 quickSend 가 signUrl 을 만들지 못한다(계약과 토큰은 정상이다).
    // 통과/실패로 세지는 않되, 알고는 계셔야 하는 값이라 따로 담는다.
    webapp: { configured: gwHasProp_('WEBAPP_URL') }
  };
}
function gwSelfTestAct_() { return gwSelfTest_(); }

/* ============================================================
 * 11) exportCsv — 목록을 CSV 문자열로
 * ============================================================ */
/**
 * listContracts_ 의 결과를 그대로 쓴다. 여기서 계약을 다시 읽거나 걸러내지 않는다 —
 * 화면과 CSV 가 다른 목록을 보여 주면 대조가 안 된다.
 *
 * ⚠ CSV 수식 삽입: CSV 도 결국 엑셀·구글시트에서 열린다. 고객 성명에 =IMPORTXML(...) 이
 *   들어 있으면 파일을 여는 순간 실행된다. 그래서 = + - @ 와 제어문자로 시작하는 칸은
 *   Pure.gs 의 sheetSafe 로 작은따옴표를 앞에 붙여 '글자'로 못박는다(규칙을 두 번 쓰지 않는다).
 */
function gwExportCsv_(rq) {
  var p = rq.payload || {};
  var rows = [];
  var total = 0;
  var offset = 0;
  var truncated = false;

  // listContracts_ 는 한 번에 200건까지만 준다. 나눠서 이어 받는다.
  for (var page = 0; page < Math.ceil(GW_CSV_MAX_ROWS / GW_CSV_PAGE) + 1; page++) {
    var res = listContracts_({ status: p.status, limit: GW_CSV_PAGE, offset: offset });
    total = res.total;
    for (var i = 0; i < res.items.length; i++) {
      if (rows.length >= GW_CSV_MAX_ROWS) { truncated = true; break; }
      rows.push(res.items[i]);
    }
    if (truncated || !res.hasMore || res.count === 0) break;
    offset += res.count;
  }

  var head = ['계약번호', '상태', '제목', '계약금액', '고객명', '연락처(마스킹)', '담당',
    '생성', '잠금', '발송', '열람', '서명', '완료', '취소',
    '대금합계', '입금액', '미수금', '계약ID'];

  var lines = [gwCsvRow_(head)];
  for (var r = 0; r < rows.length; r++) {
    var c = rows[r];
    var pay = c.payment || {};
    lines.push(gwCsvRow_([
      c.contractNo, c.status, c.title, c.amount, c.customerName, c.customerPhoneMasked, c.operatorName,
      gwWhen_(c.createdAt), gwWhen_(c.lockedAt), gwWhen_(c.sentAt), gwWhen_(c.viewedAt),
      gwWhen_(c.signedAt), gwWhen_(c.completedAt), gwWhen_(c.voidedAt),
      pay.total || 0, pay.paid || 0, pay.receivable || 0, c.id
    ]));
  }

  // 맨 앞의 BOM 은 엑셀이 UTF-8 로 읽게 하는 표식이다. 없으면 한글이 깨져 나온다.
  // 눈에 보이지 않는 글자라 소스에 직접 넣지 않고 이스케이프로 적는다(복사·편집 중에 사라진다).
  // 줄바꿈은 CRLF(RFC 4180) — 옛 엑셀에서 한 줄로 붙어 나오는 것을 막는다.
  var csv = '\uFEFF' + lines.join('\r\n') + '\r\n';

  return {
    ok: true,
    csv: csv,
    fileName: '계약목록_' + gwStamp_() + '.csv',
    rows: rows.length,
    total: total,
    truncated: truncated,
    note: truncated ? ('최근 ' + GW_CSV_MAX_ROWS + '건까지만 담았습니다') : '',
    encoding: 'UTF-8 (BOM 포함)',
    at: new Date().toISOString()
  };
}

function gwCsvRow_(cells) {
  var out = [];
  for (var i = 0; i < cells.length; i++) out.push(gwCsvCell_(cells[i]));
  return out.join(',');
}
function gwCsvCell_(v) {
  var s = sheetSafe(v == null ? '' : v);     // = + - @ 로 시작하면 작은따옴표를 앞에 붙인다
  s = String(s == null ? '' : s);
  // 쉼표·줄바꿈이 없어도 **항상** 큰따옴표로 감싼다. 조건을 두면 언젠가 그 조건을 빠뜨린다.
  return '"' + s.replace(/"/g, '""') + '"';
}

/* ============================================================
 * 12) settings — 비밀이 아닌 운영값만
 * ============================================================ */
/* 금지어가 든 열쇠는 거절한다(Schema.gs isForbiddenSettingKey). 시트는 공유 링크 한 번이면
   남이 볼 수 있는 곳이다. 토큰·PEPPER 같은 값은 스크립트 속성에 둔다.
   SheetService.gs 도 같은 검사를 한 번 더 한다 — 막는 곳이 하나뿐이면 언젠가 그 하나를 지나친다. */
function gwSettingsGet_(rq) {
  var key = String((rq.payload || {}).key || '').trim();
  var rows = readAll_(SHEETS.SETTINGS) || [];
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i].key == null ? '' : rows[i].key);
    if (!k) continue;
    if (isForbiddenSettingKey(k)) continue;         // 어쩌다 들어간 값이 있어도 내보내지 않는다
    if (key && k !== key) continue;
    items.push({ key: k, value: String(rows[i].value == null ? '' : rows[i].value), updatedAt: String(rows[i].updatedAt || '') });
  }
  return { ok: true, count: items.length, items: items };
}

function gwSettingsSet_(rq) {
  var p = rq.payload || {};
  var key = String(p.key == null ? '' : p.key).trim();
  var value = String(p.value == null ? '' : p.value);

  if (!GW_SETTING_KEY_RE.test(key)) {
    throw gwFail_('BAD_REQUEST', '설정 이름은 영문·숫자·_.- 로 40자 이내여야 합니다');
  }
  if (isForbiddenSettingKey(key)) {
    throw gwFail_('BAD_REQUEST', '비밀값으로 보이는 이름은 시트에 저장하지 않습니다 — 스크립트 속성에 두세요');
  }
  if (value.length > GW_SETTING_VALUE_MAX) {
    throw gwFail_('BAD_REQUEST', '설정 값이 너무 깁니다(' + GW_SETTING_VALUE_MAX + '자 이내)');
  }

  var now = rq.ctx.at;
  var hit = findRow_(SHEETS.SETTINGS, 'key', key);
  if (hit) updateRow_(SHEETS.SETTINGS, hit.rowIndex, { value: value, updatedAt: now });
  else appendRow_(SHEETS.SETTINGS, { key: key, value: value, updatedAt: now });

  return { ok: true, key: key, value: value, updatedAt: now };
}

/* ============================================================
 * 13) GET — 상태 확인과 화면
 * ============================================================ */
/**
 * **관리자 동작을 GET 으로 열지 않는다.** 주소창에 남고, 브라우저 기록·서버 로그·
 * 카톡 미리보기에 그대로 남는 것이 GET 이다. 여기서 되는 것은
 *   · ?action=health            상태 JSON(값 없음)
 *   · ?page=sign&t=…            고객 서명 화면
 *   · ?page=done&t=…            완료본 확인 화면
 *   · ?page=admin               관리자 화면(토큰은 화면에서 입력받는다)
 * 그 외에는 짧은 안내를 보여 준다.
 */
function doGet(e) {
  try {
    var q = (e && e.parameter) || {};
    var action = String(q.action || '').trim();
    var page = String(q.page || '').trim().toLowerCase();

    if (action === 'health' || page === 'health') return gwJson_(gwHealth_());
    if (action) {
      return gwJson_({
        ok: false, error: 'BAD_REQUEST',
        message: 'GET 으로는 상태 확인(?action=health)만 할 수 있습니다 — 나머지 동작은 POST 로 보내 주세요'
      });
    }
    if (page === 'sign') return gwSignPage_(q.t, 'sign');
    if (page === 'done') return gwSignPage_(q.t, 'done');
    if (page === 'admin') return gwAdminPage_();
    return gwGuidePage_('');
  } catch (err) {
    // 화면 요청에 JSON 오류를 돌려주면 고객은 흰 화면에 영어 덩어리를 본다.
    return gwGuidePage_('화면을 여는 중 문제가 발생했습니다: ' + gwShort_(err));
  }
}

/**
 * 고객 화면. Sign.html 이 기다리는 BOOT_JSON 을 심어 준다.
 * 토큰 판정은 하지 않는다 — signBoot_(Sign.gs)이 있으면 미리 물어 왕복 한 번을 줄이고,
 * 없으면 state:'ok' 로 두어 화면이 직접 묻게 한다. 화면이 물으면 진짜 사유
 * (만료·사용됨·취소)를 그때 정확히 듣는다. 여기서 지어내지 않는다.
 */
function gwSignPage_(t, mode) {
  var token = String(t == null ? '' : t).trim();
  var boot = {
    apiUrl: gwWebappUrl_(),
    token: token,
    mode: (mode === 'done') ? 'done' : 'sign',
    state: 'ok',
    message: '',
    data: null
  };

  if (!token || !GW_TOKEN_RE.test(token)) {
    boot.token = '';
    boot.state = 'invalid';
    boot.message = '링크 주소가 올바르지 않습니다 — 문자로 받으신 링크를 그대로 눌러 주세요.';
  } else {
    var pre = gwSignBoot_(token, boot.mode);
    if (pre) {
      if (pre.state) boot.state = String(pre.state);
      if (pre.message) boot.message = String(pre.message);
      if (pre.data) boot.data = pre.data;
    }
  }

  var page;
  try {
    var tpl = HtmlService.createTemplateFromFile('Sign');
    tpl.BOOT_JSON = JSON.stringify(boot);
    page = tpl.evaluate();
  } catch (e) {
    return gwGuidePage_('서명 화면 파일(Sign.html)을 열지 못했습니다.');
  }

  // ★ addMetaTag 가 없으면 폰에서 글자가 개미만 하게 나온다.
  //   HtmlService 는 이 문서를 iframe 에 넣고 바깥 문서를 따로 만드는데,
  //   바깥 문서의 viewport 는 이 방법으로만 붙는다(Sign.html 머리말 참고).
  return page
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle(boot.mode === 'done' ? '계약 완료본 · 만물인테리어' : '계약서 서명 · 만물인테리어');
}

/* Sign.gs 가 미리 봐 줄 수 있으면 봐 준다. 실패해도 화면은 뜬다 —
   화면이 뜨면 고객은 최소한 안내 문구와 연락처를 볼 수 있다. */
function gwSignBoot_(token, mode) {
  var f = gwFn_(['signBoot_']);
  if (!f) return null;
  try {
    var r = f(token, mode);
    return (r && typeof r === 'object') ? r : null;
  } catch (e) {
    return null;
  }
}

/* 관리자 화면. **토큰을 여기서 심지 않는다** — 화면이 사람에게 입력받는다.
   HTML 에 토큰을 박아 두면 그 주소를 아는 누구나 관리자가 된다. */
function gwAdminPage_() {
  try {
    var tpl = HtmlService.createTemplateFromFile('Admin');
    tpl.BOOT_JSON = JSON.stringify({ apiUrl: gwWebappUrl_(), page: 'admin', version: GATEWAY_VERSION });
    return tpl.evaluate()
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setTitle('전자계약 관리 · 만물인테리어');
  } catch (e) {
    return gwGuidePage_('관리자 화면(Admin.html)이 아직 설치되지 않았습니다.');
  }
}

/* 그 외 주소를 열었을 때. 무엇이 있는지 알려 주지 않는다(동작 목록·설정 상태 없음). */
function gwGuidePage_(note) {
  var tel = gwOperatorTel_();
  var html = ''
    + '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex, nofollow"><title>만물인테리어 전자계약</title>'
    + '<style>body{margin:0;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'
    + '"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f6f6f4;color:#1c1c1a;'
    + 'line-height:1.7;-webkit-text-size-adjust:100%}'
    + '.box{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e2dd;'
    + 'border-radius:16px;padding:28px}h1{font-size:20px;margin:0 0 12px}'
    + 'p{margin:0 0 10px;font-size:15px;color:#4a4a44}a{color:#1c1c1a}</style></head><body>'
    + '<div class="box"><h1>만물인테리어 전자계약</h1>'
    + '<p>이 주소는 계약 시스템의 창구입니다.</p>'
    + '<p>고객님께서는 <strong>문자로 받으신 링크</strong>를 눌러 주세요. '
    + '이 화면에서는 계약서를 여실 수 없습니다.</p>'
    + (note ? '<p>' + escHtml(note) + '</p>' : '')
    + '<p>문의 · 만물인테리어 <a href="tel:' + escHtml(tel.replace(/[^0-9+]/g, '')) + '">' + escHtml(tel) + '</a></p>'
    + '</div></body></html>';

  return HtmlService.createHtmlOutput(html)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('만물인테리어 전자계약');
}

/* ============================================================
 * 14) 도구들
 * ============================================================ */

/* ---------- 응답 ---------- */
// HTTP 상태는 언제나 200 이다(Apps Script 제약). 성공·실패는 ok 로 말한다.
function gwJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 서비스가 ok 를 빠뜨렸더라도 규약을 지킨 응답이 나가게 한다.
function gwOk_(res) {
  if (res == null) return { ok: true };
  if (typeof res !== 'object' || gwIsArray_(res)) return { ok: true, result: res };
  if (res.ok === false) return res;      // 스스로 실패라고 말한 것은 그대로 둔다
  if (res.ok !== true) res.ok = true;
  return res;
}

/* ---------- 오류 ---------- */
// 'CODE|한국어 설명' 한 가지 모양만 만든다.
function gwFail_(code, msg) {
  return new Error(String(code) + '|' + String(msg));
}

/**
 * 던져진 오류를 규약 응답으로 바꾼다.
 * 스택은 절대 싣지 않고, 길이는 잘라 낸다 — 오류 문구는 고객 화면에도 그대로 나간다.
 * 코드표에 없는 코드는 SERVER_ERROR 로 내린다(앱이 모르는 코드를 제멋대로 해석하지 않게).
 */
function gwErrOut_(err) {
  var raw = String((err && err.message) || err || '');
  var code = 'SERVER_ERROR';
  var msg = raw;

  var bar = raw.indexOf('|');
  if (bar > 0) {
    var head = raw.slice(0, bar);
    if (/^[A-Z][A-Z_]{2,29}$/.test(head)) {
      msg = raw.slice(bar + 1);
      code = (GW_ERROR_CODES.indexOf(head) >= 0) ? head : 'SERVER_ERROR';
    }
  }
  msg = String(msg || '').replace(/\s+/g, ' ').trim().slice(0, GW_MSG_MAX);
  if (!msg) msg = '처리 중 문제가 발생했습니다';

  return { ok: false, error: code, message: msg };
}

function gwShort_(err) {
  return String((err && err.message) || err || '').replace(/^[A-Z_]+\|/, '').slice(0, 140);
}

// 받은 값을 오류 메시지에 되비출 때는 길이와 문자를 제한한다.
// 그대로 되돌리면 화면에 그리는 쪽에서 그 값이 무엇이든 다루어야 한다.
function gwSafeEcho_(v) {
  return String(v == null ? '' : v).replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 40);
}

/* ---------- 사건 기록에 딸려 가는 것 ---------- */
/**
 * ctx = { at, actor, uaHash, requestHash } — 시각은 **서버 것만** 쓴다.
 * 고객 기기의 시계는 계약 시각의 근거가 될 수 없다(맞춰 놓을 수 있으므로).
 */
function gwCtx_(req, actor) {
  return {
    at: new Date().toISOString(),
    actor: actor,
    uaHash: gwHmacQuiet_(req.ua),
    // 같은 요청의 재시도를 알아보기 위한 값. idem 이 있으면 그것이 곧 요청의 이름이다.
    requestHash: gwHmacQuiet_(req.idem ? ('idem:' + req.idem) : (req.action + '@' + String(req.ts)))
  };
}

// PEPPER 가 없으면 해시를 못 만든다. 그때 계약 전체가 멈추면 안 되므로 빈 값으로 둔다 —
// 정말 필요한 곳(전화번호 해시)은 ContractService.gs 가 NOT_CONFIGURED 로 분명히 막는다.
function gwHmacQuiet_(v) {
  if (!v) return '';
  try { return hmacHex(String(v)); } catch (e) { return ''; }
}

/* ---------- 설정·전역 ---------- */
// 값을 읽어 오지 않는다. 있는지 없는지만 본다.
function gwHasProp_(key) {
  try {
    var v = props_().getProperty(key);
    return !!(v && String(v).length);
  } catch (e) {
    return false;
  }
}

// 이 접두사로 시작하는 속성이 하나라도 있는가. **이름만 본다 — 값은 읽지 않는다.**
function gwHasPropPrefix_(prefix) {
  try {
    var keys = props_().getKeys() || [];
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).indexOf(prefix) === 0) return true;
    }
  } catch (e) { /* 못 읽으면 없는 것으로 본다 */ }
  return false;
}

/**
 * 다른 파일의 함수·상수를 **이름으로** 찾는다.
 * Sign.gs·Notify.gs 는 이 파일과 따로 만들어진다. 아직 없을 때 이름을 그냥 부르면
 * ReferenceError 로 요청 전체가 무너지고, 앱은 원인을 알 수 없는 SERVER_ERROR 만 본다.
 * 이름 후보를 목록으로 다루려면 typeof 로는 안 되므로 globalThis 를 쓴다.
 */
function gwGlobal_() {
  try { if (typeof globalThis !== 'undefined') return globalThis; } catch (e) { /* 아래로 */ }
  // globalThis 가 없는 환경(구형 런타임)을 대비한 뒷문. 보통 함수 안의 this 가 전역이다.
  try { if (this) return this; } catch (e2) { /* 아래로 */ }
  return null;
}
function gwFn_(names) {
  var g = gwGlobal_();
  if (!g) return null;
  for (var i = 0; i < names.length; i++) {
    var f = null;
    try { f = g[names[i]]; } catch (e) { f = null; }
    if (typeof f === 'function') return f;
  }
  return null;
}
/**
 * 배포 주소. WEBAPP_URL 이 정본이다 — 사장님이 넣은 값이 항상 이긴다.
 * 없을 때만 ScriptApp 에게 물어본다(개발 중 배포에서는 이쪽이 맞는 경우가 많다).
 * 둘 다 없으면 빈 문자열. **주소를 지어내지 않는다** —
 * 틀린 주소가 실린 링크를 문자로 보내는 것이 링크가 없는 것보다 나쁘다.
 */
function gwWebappUrl_() {
  if (GW_URL_CACHE_ != null) return GW_URL_CACHE_;
  var url = String(cfg_('WEBAPP_URL', '') || '').trim();
  if (!url) {
    try {
      url = String(ScriptApp.getService().getUrl() || '').trim();
    } catch (e) {
      url = '';
    }
  }
  if (!/^https?:\/\//i.test(url)) url = '';
  GW_URL_CACHE_ = url;
  return url;
}

function gwOperatorTel_() {
  // 공개된 사업자 연락처다(비밀값이 아니다). ContractService.gs 의 CT_OPERATOR 가 정본이고,
  // 그 파일이 없더라도 안내 화면은 떠야 하므로 typeof 로 확인하고 읽는다.
  try {
    if (typeof CT_OPERATOR === 'object' && CT_OPERATOR && CT_OPERATOR.tel) return String(CT_OPERATOR.tel);
  } catch (e) { /* 아래 기본값 */ }
  return '010-2397-8629';
}

/* ---------- 잡다한 것 ---------- */
function gwHas_(o, k) { return Object.prototype.hasOwnProperty.call(o || {}, k); }
function gwIsArray_(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
function gwTz_() { return Session.getScriptTimeZone() || 'Asia/Seoul'; }

// CSV 는 사장님이 엑셀에서 여신다. ISO 문자열보다 '2026-07-29 14:30' 이 읽기 쉽다.
// 시각은 한국 시간으로 적는다(스크립트 표준시간대 = Asia/Seoul).
function gwWhen_(iso) {
  var ms = Date.parse(iso);
  if (!isFinite(ms)) return '';
  return Utilities.formatDate(new Date(ms), gwTz_(), 'yyyy-MM-dd HH:mm');
}
function gwStamp_() {
  return Utilities.formatDate(new Date(), gwTz_(), 'yyyy-MM-dd_HHmm');
}

/* ============================================================
 * 15) 편집기에서 손으로 돌리는 함수 (웹앱 경로가 아니다)
 * ============================================================ */
/**
 * 처음 설치할 때 한 번 실행한다. Schema.gs 정의대로 시트 5장과 머리행을 갖춘다.
 * 이미 있는 시트는 건드리지 않는다(SheetService.gs ensureSheets_ 주석 참고).
 */
function setupSheets() {
  var r = ensureSheets_();
  Logger.log('시트 준비: 만듦=' + (r.created.join(',') || '없음')
    + ' · 열추가=' + (r.extended.join(' / ') || '없음')
    + ' · 어긋남=' + (r.mismatched.join(',') || '없음'));
  return r;
}

/**
 * 관리자 토큰 없이 확인하고 싶을 때 편집기에서 직접 실행한다.
 * (웹앱으로 부르는 selfTest 는 ADMIN_TOKEN 대조를 거친다. ADMIN_TOKEN 이 아직 없으면
 *  그쪽은 NOT_CONFIGURED 로 막히므로, 설치 중에는 이 함수를 쓰는 편이 빠르다.)
 * 기록에 남는 것은 항목 이름과 통과 여부뿐이다 — 값은 한 글자도 찍지 않는다.
 */
function runSelfTest() {
  var r = gwSelfTest_();
  Logger.log('selfTest allOk = ' + r.checks.allOk);
  for (var i = 0; i < r.checks.items.length; i++) {
    var it = r.checks.items[i];
    Logger.log((it.ok ? '  [통과] ' : '  [실패] ') + it.name + ' — ' + it.detail);
  }
  return r;
}
