/** ============================================================
 * 만물인테리어 전자계약 — 고객 서명 처리 (contract-sign-v1)
 * ------------------------------------------------------------
 * 고객이 링크로 들어와 계약서를 보고 서명하고 완료본을 받는 경로.
 * Code.gs 의 **고객 경로**만 이 파일을 부른다.
 *
 * ★ 이 파일이 지키는 가장 중요한 것: **고객은 토큰만 가지고 온다.**
 *   계약 id 를 받지 않고, 응답에도 담지 않는다. 그래서 id 를 추측해도 남의 계약이 열리지 않는다.
 *   (Code.gs 가 고객 요청에 id 가 실려 오면 그 앞에서 이미 거절한다 — 여기가 두 번째 방벽이다)
 *
 * 하지 않는 것:
 *   · 관리자 기능을 열어 주지 않는다 (목록·취소·대금은 여기 없다)
 *   · 요청으로 받은 토큰 원문을 저장하거나 되돌려주지 않는다 (해시로만 찾는다)
 *     새 완료본 열람 토큰은 고객이 바로 열 수 있도록 발급 응답에 한 번만 포함한다.
 *   · 서명 이미지를 원장·응답에 싣지 않는다 (Drive 에만 둔다)
 *
 * 잠금에 대하여: signContract 는 Code.gs 가 LockService 를 잡은 채로 부른다.
 * 그래서 두 사람이 동시에 같은 링크로 제출해도 하나만 통과한다.
 * ============================================================ */

var SIGN_VERSION = 'contract-sign-v1';

var SG_VIEW_TTL_MIN = 15;          // 완료본 열람 링크의 기본 수명(분). VIEW_TTL_MINUTES 로 바꿀 수 있다.
var SG_VIEW_TTL_MIN_MAX = 60 * 24; // 하루. 그보다 길면 사실상 상시 공개 주소다.

/* ============================================================
 * 1) 토큰으로 계약 찾기 — 모든 고객 경로의 입구
 * ============================================================ */
/**
 * 원문 토큰을 해시해 SignTokens 에서 찾는다.
 * 토큰 원문은 시트에 없으므로 해시로만 대조된다.
 *
 * @return {{tok:{rowIndex:number,obj:Object}, c:{rowIndex:number,obj:Object}}}
 * @throws TOKEN_INVALID / TOKEN_EXPIRED / TOKEN_USED / TOKEN_REVOKED
 */
function sgResolve_(rawToken, purpose, ctx) {
  return sgResolveState_(rawToken, purpose, false, ctx);
}

/**
 * 멱등성 캐시 조회용 인증 범위. 원문은 되돌리지 않고 시트에 저장된 해시만 반환한다.
 * 서명 제출의 재시도에 한해 used 토큰을 캐시 조회까지 허용한다.
 */
function sgIdemScope_(rawToken, purpose, allowUsed, ctx) {
  return sgResolveState_(rawToken, purpose, allowUsed === true, ctx).tokenHash;
}

function sgResolveState_(rawToken, purpose, allowUsed, ctx) {
  var raw = String(rawToken == null ? '' : rawToken).trim();
  // 모양이 아예 아니면 시트를 뒤지지도 않는다. 무작위 대입에 시트 조회를 태우지 않기 위해서다.
  if (raw.length < 20 || raw.length > 200) {
    sgReject_(ctx, 'bad-shape');
    throw sgFail_('TOKEN_INVALID', '링크가 올바르지 않습니다. 받으신 링크를 다시 눌러 주세요.');
  }

  var tokenHash = sha256Hex(raw);
  var hit = findRow_(SHEETS.TOKENS, 'tokenHash', tokenHash);
  if (!hit || !hit.obj) {
    sgReject_(ctx, 'not-found');
    throw sgFail_('TOKEN_INVALID', '링크가 올바르지 않거나 이미 정리된 링크입니다.');
  }
  var t = hit.obj;

  // 쓰임새가 다른 토큰을 서로 못 쓰게 한다.
  // 완료본 열람용(view)으로 서명을 제출하거나 그 반대가 되면 안 된다.
  if (purpose && String(t.purpose || '') !== purpose) {
    sgReject_(ctx, 'wrong-purpose');
    throw sgFail_('TOKEN_INVALID', '이 링크로는 할 수 없는 요청입니다.');
  }

  var now = sgNow_(ctx);
  var state = tokenState(t, now);   // Pure.gs — revoked > used > expired 순으로 판정
  if (state === 'revoked') { sgReject_(ctx, 'revoked'); throw sgFail_('TOKEN_REVOKED', '취소된 계약의 링크입니다. 담당자에게 문의해 주세요.'); }
  if (state === 'used' && !allowUsed) { sgReject_(ctx, 'used'); throw sgFail_('TOKEN_USED', '이미 서명이 끝난 링크입니다. 완료본은 담당자가 보내 드립니다.'); }
  if (state === 'expired') { sgReject_(ctx, 'expired'); throw sgFail_('TOKEN_EXPIRED', '링크 사용 기한이 지났습니다. 담당자에게 새 링크를 요청해 주세요.'); }
  if (state !== 'ok' && !(allowUsed && state === 'used')) {
    sgReject_(ctx, state);
    throw sgFail_('TOKEN_INVALID', '링크를 확인할 수 없습니다.');
  }

  var c = ctFindContract_(String(t.contractId || ''));
  if (isTerminal(c.obj.status) && String(c.obj.status) === STATUS.VOID) {
    throw sgFail_('TOKEN_REVOKED', '취소된 계약입니다. 담당자에게 문의해 주세요.');
  }
  return { tok: hit, c: c, tokenHash: tokenHash };
}

/** 거절을 원장에 남긴다. **입력된 토큰은 절대 남기지 않는다** — 사유만. */
function sgReject_(ctx, why) {
  try { logEvent_(null, EVENTS.TOKEN_REJECTED, '고객 링크 거절 · ' + why, ctx); } catch (e) {}
}

/* ============================================================
 * 2) 계약서 열람 — 토큰을 소진하지 않는다
 * ============================================================ */
/**
 * 고객이 링크를 열었을 때. 여러 번 열어볼 수 있어야 하므로 **소진하지 않는다.**
 * 처음 열렸을 때만 SIGN_LINK_OPENED 를 남기고 상태를 VIEWED 로 올린다.
 *
 * ★ 링크를 열었다는 것과 본인이 확인했다는 것은 다른 사건이다.
 *   이 시스템에는 휴대폰 본인확인이 없다. VIEWED 를 본인확인으로 읽으면 안 된다.
 */
function signView_(signToken, ctx) {
  var r = sgResolve_(signToken, 'sign', ctx);
  var c = r.c.obj;
  var now = sgNow_(ctx);

  if (!c.viewedAt) {
    var patch = { viewedAt: now, updatedAt: now };
    // 상태는 허용된 전이일 때만 올린다. 이미 SIGNING 인 것을 VIEWED 로 되돌리지 않는다.
    if (canTransition(c.status, STATUS.VIEWED)) patch.status = STATUS.VIEWED;
    updateRow_(SHEETS.CONTRACTS, r.c.rowIndex, patch);
    c = ctCopy_(c, patch);
    logEvent_(c.id, EVENTS.SIGN_LINK_OPENED, '고객이 계약서를 열었습니다(본인확인 아님)', ctx);
  }

  return { ok: true, contract: sgCustomerView_(c), expiresAt: ctText_(r.tok.obj.expiresAt) };
}

/**
 * 고객에게 보여줄 계약 내용.
 * **계약 id 를 담지 않는다.** 고객은 id 를 알 필요가 없고, 알면 안 된다.
 */
function sgCustomerView_(c) {
  var body = ctParseBody_(c.bodyJson);
  return {
    contractNo: ctText_(c.contractNo),
    title: ctText_(c.title),
    status: ctText_(c.status),
    amount: normalizeAmount(c.amount),
    amountText: formatWon(c.amount),
    customerName: ctText_(c.customerName),
    operatorName: ctText_(c.operatorName) || CT_OPERATOR.co,
    docHash: ctText_(c.docHash),          // 화면이 그대로 되돌려 보내 위변조를 대조한다
    lockedAt: ctText_(c.lockedAt),
    payments: ctPlanView_(paymentPlan(c.amount)),
    body: body,
    warranty: CT_WARRANTY_LABEL,
    note: CT_BODY_NOTE
  };
}

/* ============================================================
 * 3) 서명 제출 — 여기서만 토큰이 소진된다
 * ============================================================ */
/**
 * 순서를 이렇게 둔 이유:
 *   ① 검증 → ② Drive 에 서명·완료본·증거 저장 → ③ 시트에 완료 기록 + 토큰 소진 → ④ 발송 시도
 *
 * Drive 저장을 먼저 하는 이유: 시트에 '완료'라고 적어 놓고 Drive 가 실패하면
 * **문서 없는 완료 계약**이 남는다. 그건 증거가 없는 계약이라 최악이다.
 * 반대로 Drive 는 됐는데 시트가 실패하면 고객이 다시 눌러 재시도할 수 있고,
 * Drive 에는 판이 하나 더 쌓일 뿐이다(덮어쓰지 않으므로 이전 판도 남는다).
 *
 * 발송을 마지막에 두고 실패해도 되돌리지 않는 이유: 문자가 안 갔다고 서명을 무효로 만들면
 * 고객은 다 해놓고 다시 해야 한다. 옛 Fly 서버도 같은 판단이었다.
 */
function signSubmit_(signToken, payload, ctx) {
  var r = sgResolve_(signToken, 'sign', ctx);
  var c = r.c.obj;
  var now = sgNow_(ctx);
  var p = payload || {};

  /* ---------- ① 검증 ---------- */
  if (!c.lockedAt || !c.docHash) {
    throw sgFail_('BAD_STATE', '아직 서명할 수 있는 상태가 아닙니다. 담당자에게 문의해 주세요.');
  }
  if (CT_SIGNABLE.indexOf(String(c.status)) < 0) {
    // ★ 상태별로 다른 코드를 던진다. 한 코드로 뭉뚱그리면 고객에게 거짓말을 하게 된다.
    //
    // 실제로 겪은 경로: 서명 완료 처리 중 Contracts 는 써졌는데 SignTokens 쓰기만 실패하면
    // 계약은 COMPLETED 인데 토큰이 살아 있다. 고객이 다시 누르면 여기 걸리는데,
    // BAD_STATE 를 Sign.html 이 'voided' 로 매핑해 **"🚫 취소된 계약입니다"** 를 띄웠다.
    // 정상 체결된 계약을 취소됐다고 말하는 것이라, 고객은 완료본도 못 받고 사장님께
    // "계약이 취소됐다는데요" 로 전화가 온다.
    if (String(c.status) === STATUS.COMPLETED) {
      throw sgFail_('TOKEN_USED', '이미 서명이 끝난 계약입니다. 완료본은 담당자가 보내 드립니다.');
    }
    if (String(c.status) === STATUS.VOID) {
      throw sgFail_('TOKEN_REVOKED', '취소된 계약입니다. 담당자에게 문의해 주세요.');
    }
    throw sgFail_('BAD_STATE', '아직 서명할 수 있는 상태가 아닙니다. 담당자에게 문의해 주세요.');
  }
  var v = validateSignInput(p);      // Pure.gs — 성명·서명이미지·동의·지문
  if (!v.ok) throw sgFail_('BAD_REQUEST', v.errors.join(' · '));

  // 고객이 본 지문과 서버의 지문이 다르면 중간에 내용이 바뀐 것이다.
  // 이건 절대 통과시키지 않는다 — 다른 계약서에 서명한 것이 되기 때문이다.
  if (String(p.docHashSeen) !== String(c.docHash)) {
    logEvent_(c.id, EVENTS.TOKEN_REJECTED, '고객이 본 지문과 서버 지문이 다릅니다 — 서명 거부', ctx);
    throw sgFail_('DOC_TAMPERED', '계약 내용이 바뀌었습니다. 링크를 다시 받아 확인해 주세요.');
  }

  /* ---------- ② Drive 저장 (실패하면 여기서 멈춘다) ---------- */
  var sigFile = saveSignature_(c, p.signatureImage);
  var completed = saveCompletedPdf_(c, {
    signatureImage: p.signatureImage,
    sha256: sigFile.sha256,
    signedAt: now,
    signerName: v.signerName
  });
  var evidence = saveEvidenceJson_(c, {
    contractNo: c.contractNo,
    docHash: c.docHash,
    createdAt: c.createdAt,
    lockedAt: c.lockedAt,
    linkIssuedAt: ctText_(r.tok.obj.createdAt),
    viewedAt: ctText_(c.viewedAt),
    signedAt: now,
    signerName: v.signerName,
    signatureSha256: sigFile.sha256,
    signatureFileId: sigFile.fileId,
    completedSha256: completed.sha256,
    completedFileId: completed.fileId,
    completedVersion: completed.version,
    uaHash: ctText_(ctx && ctx.uaHash),
    serverTime: now,
    statusHistory: ctEventsOf_(c.id)
  });

  /* ---------- ③ 시트 완료 기록 → 토큰 소진 ---------- */
  // 완료 기록이 실패하면 토큰은 살아 있어 고객이 다시 제출할 수 있어야 한다.
  // 잠금 안에서 도므로 완료 기록과 토큰 소진 사이에 다른 제출이 끼어들 수 없다.
  updateRow_(SHEETS.CONTRACTS, r.c.rowIndex, {
    status: STATUS.COMPLETED,
    signedAt: now,
    completedAt: now,
    signerName: v.signerName,
    signatureSha256: sigFile.sha256,
    signatureFileId: sigFile.fileId,
    completedFileId: completed.fileId,
    completedFileVersion: completed.version,
    completedSha256: completed.sha256,
    updatedAt: now
  });
  updateRow_(SHEETS.TOKENS, r.tok.rowIndex, { usedAt: now });
  logEvent_(c.id, EVENTS.SIGN_SUBMITTED, '고객 서명 접수 · ' + v.signerName, ctx);
  logEvent_(c.id, EVENTS.CONTRACT_COMPLETED,
    '완료본 v' + completed.version + ' · 증거 ' + evidence.fileName, ctx);

  /* ---------- ④ 완료본 열람 링크 + 발송 시도 ---------- */
  // 완료본을 볼 수 있는 짧은 링크를 하나 낸다. 서명용 토큰은 이미 죽었다.
  var view = sgIssueViewToken_(c, now, ctx);

  var notify = { sent: false, reason: 'NO_MODULE' };
  var f = (typeof notifySend_ === 'function') ? notifySend_ : null;
  if (f) {
    notify = f({
      to: '',   // 원문 번호가 시트에 없다 — 마스킹본과 해시만 있다. 아래 주석 참조.
      text: '', kind: 'contract_done', contractId: c.id
    }, ctx);
  }
  // ※ 고객 번호 원문을 저장하지 않기로 한 설계의 대가다.
  //   완료 문자를 서버가 자동으로 보내려면 번호 원문이 필요한데, 그것을 두지 않기로 했으므로
  //   완료 통지는 사장님이 현장 앱에서 보내신다. 지금은 발송이 꺼져 있어 어차피 나가지 않는다.
  //   "보냈다"고 쓰지 않는 것이 중요하다.

  return {
    ok: true,
    contractNo: ctText_(c.contractNo),
    signedAt: now,
    completedVersion: completed.version,
    completedSha256: completed.sha256,
    doneToken: view.token,          // 화면이 완료본을 바로 열 수 있게
    doneExpiresAt: view.expiresAt,
    notify: notify
  };
}

/** 완료본 열람용 짧은 토큰. 서명용과 쓰임새(purpose)가 달라 서로 못 쓴다. */
function sgIssueViewToken_(c, nowIso, ctx) {
  var mins = parseInt(cfg_('VIEW_TTL_MINUTES', String(SG_VIEW_TTL_MIN)), 10);
  if (!isFinite(mins) || mins <= 0) mins = SG_VIEW_TTL_MIN;
  if (mins > SG_VIEW_TTL_MIN_MAX) mins = SG_VIEW_TTL_MIN_MAX;

  var token = randomToken();
  var expiresAt = new Date(ctMs_(nowIso) + mins * 60000).toISOString();
  appendRow_(SHEETS.TOKENS, {
    id: ctNewId_('tk'),
    contractId: c.id,
    purpose: 'view',
    tokenHash: sha256Hex(token),    // 시트에 남는 것은 이것뿐이다
    expiresAt: expiresAt,
    usedAt: '',
    revokedAt: '',
    createdAt: nowIso
  });
  logEvent_(c.id, EVENTS.SIGN_LINK_ISSUED, '완료본 열람 링크 발급 · ' + mins + '분', ctx);
  return { token: token, expiresAt: expiresAt };
}

/* ============================================================
 * 4) 완료본 열람
 * ============================================================ */
/**
 * purpose 가 'view' 인 토큰으로만 연다. 이것도 소진하지 않는다 —
 * 고객이 새로고침 한 번에 완료본을 못 보게 되면 안 된다. 대신 수명이 짧다(기본 15분).
 */
function doneView_(signToken, ctx) {
  var r = sgResolve_(signToken, 'view', ctx);
  var c = r.c.obj;
  if (String(c.status) !== STATUS.COMPLETED) {
    throw sgFail_('BAD_STATE', '아직 완료되지 않은 계약입니다.');
  }
  return {
    ok: true,
    contractNo: ctText_(c.contractNo),
    title: ctText_(c.title),
    amountText: formatWon(c.amount),
    signerName: ctText_(c.signerName),
    signedAt: ctText_(c.signedAt),
    completedSha256: ctText_(c.completedSha256),
    completedVersion: normalizeAmount(c.completedFileVersion) || 1,
    // 파일 자체는 Drive 에 있고 공개하지 않는다. 사장님이 보내 주시는 것이 원칙이다.
    note: '완료본 파일은 담당자가 보내 드립니다. 이 화면의 계약번호와 지문으로 대조하실 수 있습니다.',
    expiresAt: ctText_(r.tok.obj.expiresAt)
  };
}

/* ============================================================
 * 5) 화면 첫 렌더용 — 왕복 한 번 줄이기 (선택)
 * ============================================================ */
/**
 * Code.gs 의 doGet 이 화면을 그리기 전에 한 번 물어본다.
 * 실패해도 화면은 뜬다(Code.gs 가 null 로 받아 넘긴다) — 화면이 떠야 고객이
 * 안내 문구와 연락처라도 볼 수 있다.
 *
 * @return {{state:string, message:string, data:Object}}
 */
function signBoot_(signToken, mode) {
  var m = (String(mode) === 'done') ? 'done' : 'sign';
  try {
    var data = (m === 'done') ? doneView_(signToken, null) : signView_(signToken, null);
    return { state: 'ok', message: '', data: data };
  } catch (e) {
    var parts = String((e && e.message) || e).split('|');
    var code = parts.length > 1 ? parts[0] : 'TOKEN_INVALID';
    var msg = parts.length > 1 ? parts.slice(1).join('|') : '링크를 확인할 수 없습니다.';
    // 화면이 상태별로 다른 안내를 보여줄 수 있게 코드를 그대로 넘긴다.
    var map = { TOKEN_EXPIRED: 'expired', TOKEN_USED: 'used', TOKEN_REVOKED: 'revoked',
                TOKEN_INVALID: 'invalid', NOT_FOUND: 'notfound', BAD_STATE: 'void' };
    return { state: map[code] || 'invalid', message: msg, data: null };
  }
}

/* ---------- 잔심부름 ---------- */
// Code.gs 가 'CODE|메시지' 로 갈라 읽는다. ContractService.gs 의 ctFail_ 과 같은 규약.
function sgFail_(code, msg) {
  return new Error(String(code) + '|' + String(msg));
}
function sgNow_(ctx) {
  return (ctx && ctx.at) ? String(ctx.at) : new Date().toISOString();
}
