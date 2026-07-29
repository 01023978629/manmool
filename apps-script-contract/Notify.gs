/** ============================================================
 * 만물인테리어 전자계약 — 발송 어댑터 (contract-notify-v1)
 * ------------------------------------------------------------
 * ★ 이 파일의 가장 중요한 성질: **기본은 아무것도 보내지 않는다.**
 *
 * 사장님이 본인 번호로 테스트해 도착을 확인하고, 카카오 템플릿 심사를 통과하고,
 * 그러고 나서 명시적으로 켜기 전에는 고객에게 문자 한 통도 나가지 않는다.
 * 관문이 둘이고, 실제 발송 코드는 그 뒤에 있다.
 *
 *   관문 ① ALIMTALK_LIVE 가 '1' 이 아니면        → {sent:false, reason:'MOCK_OFF'}
 *   관문 ② SOLAPI_* 가 하나라도 비면              → {sent:false, reason:'NOT_CONFIGURED'}
 *   그 뒤에야 UrlFetchApp 이 나온다.
 *
 * 그리고 **안 보낸 것을 보냈다고 하지 않는다.**
 * 막힌 것은 원장에 MESSAGE_BLOCKED 로 남는다. 성공(MESSAGE_QUEUED)으로 적지 않는다.
 * 이 저장소에서 "실패했는데 성공으로 보고"가 반복해서 사고를 냈다.
 *
 * 하지 않는 것:
 *   · 계약의 상태를 바꾸지 않는다 (발송이 실패해도 서명은 유효하다)
 *   · 전화번호 원문을 원장·로그에 남기지 않는다 (마스킹본만)
 *   · 실패를 삼키지 않는다 — 이유를 그대로 돌려준다
 * ============================================================ */

var NOTIFY_VERSION = 'contract-notify-v1';

// 솔라피 알림톡·문자 발송 주소. 관문 둘을 통과하기 전에는 부르지 않는다.
var NT_SOLAPI_URL = 'https://api.solapi.com/messages/v4/send';
var NT_TEXT_MAX = 2000;          // 그 이상은 어차피 잘린다. 자르지 말고 거절해 사장님이 알게 한다.
var NT_TIMEOUT_NOTE = 'UrlFetchApp 은 시간초과를 직접 정할 수 없다 — 구글 기본값을 따른다';

// 발송 종류. 원장에 남길 때 쓴다.
var NT_KINDS = ['contract_sign', 'contract_done', 'contract_invoice', 'workorder', 'notify'];

/**
 * 발송을 시도한다. 실제로 나갔는지는 sent 로만 판단하라.
 *
 * @param {{to:string, text:string, kind:string, contractId:string=}} p
 * @param {{at:string, uaHash:string, requestHash:string, actor:string}=} ctx
 * @return {{sent:boolean, reason:string, provider:string, to:string}}
 *         to 는 **마스킹본**이다. 원문을 돌려주지 않는다.
 */
function notifySend_(p, ctx) {
  var o = p || {};
  var toRaw = String(o.to == null ? '' : o.to);
  var digits = normPhone(toRaw);
  var masked = maskPhone(digits);
  var kind = String(o.kind || 'notify');
  if (NT_KINDS.indexOf(kind) < 0) kind = 'notify';
  var text = String(o.text == null ? '' : o.text);
  var contractId = o.contractId ? String(o.contractId) : null;

  // 받는 번호와 본문 검사는 관문보다 먼저 한다.
  // 잘못된 입력이 '발송 꺼짐' 때문에 조용히 묻히면, 나중에 켰을 때 그제서야 터진다.
  if (!isValidMobile(digits)) {
    return ntResult_(false, 'BAD_PHONE', masked, kind, contractId, ctx, '휴대폰 번호 형식이 올바르지 않습니다');
  }
  if (!text.trim()) {
    return ntResult_(false, 'EMPTY_TEXT', masked, kind, contractId, ctx, '보낼 내용이 비어 있습니다');
  }
  if (text.length > NT_TEXT_MAX) {
    return ntResult_(false, 'TEXT_TOO_LONG', masked, kind, contractId, ctx,
      '내용이 너무 깁니다(' + text.length + '자 / ' + NT_TEXT_MAX + '자)');
  }

  /* ---------- 관문 ① 실발송 스위치 ---------- */
  // cfg_ 는 SheetService.gs 의 스크립트 속성 읽기다. 미설정이면 빈 값 → 꺼짐.
  if (String(cfg_('ALIMTALK_LIVE', '')) !== '1') {
    return ntResult_(false, 'MOCK_OFF', masked, kind, contractId, ctx,
      '실제 발송이 꺼져 있습니다(ALIMTALK_LIVE 미설정). 링크를 직접 보내 주세요.');
  }

  /* ---------- 관문 ② 자격증명 ---------- */
  var missing = ntMissingCreds_();
  if (missing.length) {
    // **무엇이 빠졌는지만** 알린다. 값은 절대 싣지 않는다.
    return ntResult_(false, 'NOT_CONFIGURED', masked, kind, contractId, ctx,
      '솔라피 설정이 덜 되었습니다: ' + missing.join(', '));
  }

  /* ---------- 여기서부터가 실제 발송 ----------
     현재 운영에서는 위 두 관문에 막혀 이 아래로 내려오지 않는다.
     사장님이 (1) 솔라피 가입·발신번호 등록 (2) 본인 번호 테스트 도착 확인
     (3) ALIMTALK_LIVE=1 저장을 마친 뒤에야 처음 실행된다. */
  try {
    var res = ntPostSolapi_(digits, text, kind);
    if (res.ok) {
      return ntResult_(true, '', masked, kind, contractId, ctx, '발송 요청됨(msgId ' + res.msgId + ')');
    }
    // 솔라피가 거절했다. 실패다. 성공으로 적지 않는다.
    return ntResult_(false, 'PROVIDER_REJECTED', masked, kind, contractId, ctx, res.message);
  } catch (e) {
    // 네트워크·시간초과. 나갔는지 안 나갔는지 모른다 — 모를 때는 실패로 본다.
    // (안 나갔는데 나갔다고 하면 사장님이 링크를 안 보내신다. 그 편이 더 나쁘다)
    return ntResult_(false, 'SEND_ERROR', masked, kind, contractId, ctx, ntShort_(e));
  }
}

/** 빠진 자격증명의 **이름만** 모은다. 값은 다루지 않는다. */
function ntMissingCreds_() {
  var need = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_SENDER'];
  var out = [];
  for (var i = 0; i < need.length; i++) {
    if (!cfg_(need[i], '')) out.push(need[i]);
  }
  return out;
}

/**
 * 결과를 만들고 원장에 남긴다.
 * 성공은 MESSAGE_QUEUED, 그 외는 전부 MESSAGE_BLOCKED 다 —
 * '보내려다 막혔다'와 '보냈다'를 같은 이름으로 적으면 나중에 구분할 방법이 없다.
 */
function ntResult_(sent, reason, maskedTo, kind, contractId, ctx, detail) {
  var line = kind + ' → ' + maskedTo + (detail ? ' · ' + detail : '');
  try {
    logEvent_(contractId, sent ? EVENTS.MESSAGE_QUEUED : EVENTS.MESSAGE_BLOCKED, line, ctx);
  } catch (e) {
    // 원장에 못 남겼다고 발송 결과를 뒤집지는 않는다. 다만 삼키지도 않는다.
    // (여기서 throw 하면 서명 완료가 통째로 실패한다 — 그것이 더 나쁘다)
  }
  return { sent: !!sent, reason: reason || '', provider: sent ? 'solapi' : 'none', to: maskedTo };
}

/**
 * 솔라피 호출. 지금은 실행되지 않는다(위 두 관문).
 * 알림톡 템플릿이 준비돼 있으면 그것으로, 아니면 문자로 나간다.
 */
function ntPostSolapi_(digits, text, kind) {
  var key = cfg_('SOLAPI_API_KEY', '');
  var secret = cfg_('SOLAPI_API_SECRET', '');
  var sender = normPhone(cfg_('SOLAPI_SENDER', ''));
  var pfId = cfg_('SOLAPI_PF_ID', '');
  var tplId = ntTemplateFor_(kind);

  var msg = { to: digits, from: sender, text: text };
  if (pfId && tplId) {
    msg.type = 'ATA';
    msg.kakaoOptions = { pfId: pfId, templateId: tplId, disableSms: String(cfg_('SOLAPI_DISABLE_SMS', '')) === '1' };
  } else {
    msg.type = text.length > 45 ? 'LMS' : 'SMS';   // 45자를 넘으면 장문이다
  }

  // HMAC 서명 — 솔라피 규격(date + salt).
  var date = new Date().toISOString();
  var salt = randomToken().slice(0, 32);
  var sig = ntHmacHex_(date + salt, secret);
  var auth = 'HMAC-SHA256 apiKey=' + key + ', date=' + date + ', salt=' + salt + ', signature=' + sig;

  var resp = UrlFetchApp.fetch(NT_SOLAPI_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: auth },
    payload: JSON.stringify({ message: msg }),
    muteHttpExceptions: true          // 상태코드를 직접 보고 판단한다
  });

  var code = resp.getResponseCode();
  var bodyText = String(resp.getContentText() || '');
  var parsed = null;
  try { parsed = JSON.parse(bodyText); } catch (e) { parsed = null; }

  if (code >= 200 && code < 300 && parsed && !parsed.errorCode) {
    return { ok: true, msgId: String(parsed.messageId || parsed.groupId || '') };
  }
  // 오류 본문에 자격증명이 실려 올 수 있다. 코드와 짧은 메시지만 남긴다.
  var em = parsed ? String(parsed.errorMessage || parsed.errorCode || '') : ('HTTP ' + code);
  return { ok: false, message: em.slice(0, 120) };
}

/** 종류별 알림톡 템플릿 id. 없으면 문자로 나간다. */
function ntTemplateFor_(kind) {
  if (kind === 'contract_sign') return cfg_('SOLAPI_TEMPLATE_SIGN', '');
  if (kind === 'contract_done') return cfg_('SOLAPI_TEMPLATE_DONE', '');
  if (kind === 'contract_invoice') return cfg_('SOLAPI_TEMPLATE_INVOICE', '');
  return '';
}

/**
 * 솔라피 서명용 HMAC. AuthService.gs 의 hmacHex 는 PEPPER 로 서명하므로 여기서는 못 쓴다
 * (열쇠가 다르다). 계약 해시에 쓰는 열쇠와 외부 API 열쇠를 섞지 않는다.
 */
function ntHmacHex_(msg, secret) {
  return bytesToHex(Utilities.computeHmacSha256Signature(msg, secret));
}

function ntShort_(err) {
  return String((err && err.message) || err).slice(0, 120);
}

/**
 * 발송 상태를 사람이 읽는 한 줄로. selfTest 와 health 가 쓴다.
 * **값은 절대 담지 않는다** — 켜졌는지 꺼졌는지, 무엇이 빠졌는지만.
 */
function notifyStatus_() {
  var live = String(cfg_('ALIMTALK_LIVE', '')) === '1';
  var missing = ntMissingCreds_();
  if (!live) return { live: false, ready: false, note: '실제 발송 꺼짐(ALIMTALK_LIVE 미설정) — 고객에게 나가지 않습니다' };
  if (missing.length) return { live: true, ready: false, note: '실발송이 켜져 있으나 설정이 덜 됐습니다: ' + missing.join(', ') };
  return { live: true, ready: true, note: '⚠️ 실제 발송이 켜져 있습니다 — 고객에게 문자가 나갑니다' };
}
