/** ============================================================
 * 만물인테리어 — AI 중계 (contract-ai-v1)
 * ------------------------------------------------------------
 * 왜 있는가.
 * 지금까지 현장 앱은 Gemini·ChatGPT 를 **브라우저에서 직접** 불렀다.
 * 그래서 AI 키가 사장님 폰·PC 안에 있었고, 거기서 네 가지가 따라왔다.
 *   ① 기기마다 키를 따로 넣어야 한다 (키는 보안상 클라우드 백업에 안 실린다)
 *   ② 사파리가 7일 미사용 시 저장소를 비우면 키가 함께 사라진다
 *   ③ **ChatGPT 키는 도메인 제한이 아예 불가능하다.** 폰을 아는 사람이면 꺼내서
 *      사장님 돈으로 쓸 수 있다. 유료 키라 곧바로 금전 피해다.
 *   ④ 사용량 보호 카운터가 기기마다 따로 돌아, PC 200 + 폰 200 = 400건이 나간다.
 *
 * 이 파일이 키를 **서버(스크립트 속성)** 로 옮긴다. 그러면 넷이 한 번에 사라진다.
 * 키는 브라우저로 내려가지 않고, 모든 기기가 같은 키를 쓰며, 한도를 한 곳에서 센다.
 *
 * 하는 일 — **얇은 통과창구다.**
 *   현장 앱이 보내던 요청 본문을 그대로 받아 키만 붙여 전달하고, 받은 답을 그대로 돌려준다.
 *   프롬프트를 여기서 다시 만들지 않는다. 그렇게 하면 앱과 서버 두 곳에서 같은 것을
 *   따로 고치게 되고, 언젠가 한쪽만 고쳐진다.
 *
 * 하지 않는 것
 *   · 아무 주소나 부르지 않는다 — 아는 두 곳(Gemini·OpenAI)만.
 *   · 키를 응답·로그·오류 문구 어디에도 싣지 않는다.
 *   · 키가 없으면 "없다"고 답한다. 있는 척하지 않는다.
 *   · 계약 자료를 건드리지 않는다. 시트·드라이브를 읽지도 쓰지도 않는다.
 * ============================================================ */

var AI_VERSION = 'contract-ai-v1';

/* 부를 수 있는 곳은 이 둘뿐이다. 주소를 요청에서 받지 않는다 —
   받으면 남의 서버로 사장님 키를 실어 보내는 길이 열린다. */
var AI_GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
var AI_OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/* 모델 이름은 주소의 일부가 된다(Gemini). 경로를 벗어나는 글자를 막는다. */
var AI_MODEL_RE = /^[A-Za-z0-9._-]{1,64}$/;

var AI_BODY_MAX = 200 * 1024;      // 요청 본문 상한. 그 이상은 프롬프트가 아니라 사고다.
var AI_RESP_MAX = 400 * 1024;      // 응답이 이보다 크면 잘라 돌려준다(잘랐다고 밝힌다).

/* 한도 — 기기별이 아니라 **여기 한 곳에서** 센다.
   현장 앱의 QUOTA_CFG(하루 200 · 분당 8)와 같은 값으로 맞춘다. */
var AI_CAP = {
  gemini: { day: 200, perMin: 8, label: 'Gemini' },
  openai: { day: 200, perMin: 8, label: 'ChatGPT' }
};
var AI_QUOTA_PROP = 'AI_QUOTA_STATE';   // 스크립트 속성에 JSON 한 덩어리로 보관

/* ============================================================
 * 1) 바깥에서 부르는 입구
 * ============================================================ */
/**
 * @param {{provider:string, model:string, body:Object}} p
 *        provider 'gemini' | 'openai'
 *        body 는 **현장 앱이 원래 그 API 에 보내던 본문 그대로**다.
 * @return {{ok:true, provider, model, status, json, truncated}}
 */
function aiAsk_(p, ctx) {
  var o = p || {};
  var provider = String(o.provider || '').toLowerCase();
  if (provider !== 'gemini' && provider !== 'openai') {
    throw aiFail_('BAD_REQUEST', '알 수 없는 AI 제공자입니다: ' + provider);
  }

  var key = aiKeyOf_(provider);
  if (!key) {
    // 키가 없는 것은 오류가 아니라 상태다. 앱이 이걸 보고 기기 키로 되돌아갈 수 있어야 한다.
    throw aiFail_('AI_NOT_CONFIGURED',
      AI_CAP[provider].label + ' 키가 서버에 없습니다. 스크립트 속성에 넣어 주세요.');
  }

  var model = String(o.model || '').trim();
  if (!AI_MODEL_RE.test(model)) {
    throw aiFail_('BAD_REQUEST', '모델 이름이 올바르지 않습니다');
  }

  var body = o.body;
  if (!body || typeof body !== 'object' || aiIsArray_(body)) {
    throw aiFail_('BAD_REQUEST', '보낼 내용이 없습니다');
  }
  var payload = JSON.stringify(body);
  if (payload.length > AI_BODY_MAX) {
    throw aiFail_('BAD_REQUEST', '보낼 내용이 너무 큽니다(' + Math.round(payload.length / 1024) + 'KB)');
  }

  // 한도를 **먼저 잡는다**. 부르고 나서 세면 초과분이 이미 나간 뒤다.
  var slot = aiReserve_(provider);
  if (!slot.ok) throw aiFail_('AI_QUOTA', slot.message);

  var res;
  try {
    res = (provider === 'gemini') ? aiCallGemini_(key, model, payload) : aiCallOpenai_(key, model, payload);
  } catch (e) {
    aiRelease_(provider);        // 못 나갔으면 되돌린다 — 한도를 억울하게 깎지 않는다
    throw aiFail_('AI_CALL_FAILED', aiShort_(e));
  }

  if (res.status < 200 || res.status >= 300) {
    // 제공자가 거절했다. 4xx 는 우리 잘못이므로 한도를 되돌리지 않는다(같은 요청이 또 나가면 또 막힌다).
    // 5xx·429 는 상대 사정이라 되돌린다.
    if (res.status >= 500 || res.status === 429) aiRelease_(provider);
    throw aiFail_('AI_REJECTED', AI_CAP[provider].label + ' 가 거절했습니다 (' + res.status + ') ' + res.brief);
  }

  aiLog_(provider, model, ctx);
  return {
    ok: true, provider: provider, model: model,
    status: res.status, json: res.json, truncated: res.truncated
  };
}

/** 서버에 어떤 AI 가 준비됐는지. **값은 절대 싣지 않는다** — 있음/없음과 남은 횟수만. */
function aiStatus_() {
  var q = aiQuotaRead_();
  var out = { available: false, providers: {}, day: q.day };
  for (var k in AI_CAP) {
    if (!Object.prototype.hasOwnProperty.call(AI_CAP, k)) continue;
    var has = !!aiKeyOf_(k);
    if (has) out.available = true;
    out.providers[k] = {
      configured: has,
      label: AI_CAP[k].label,
      usedToday: (q.count && q.count[k]) || 0,
      dayCap: AI_CAP[k].day
    };
  }
  return out;
}

/* ============================================================
 * 2) 실제 호출 — 아는 두 곳만
 * ============================================================ */
function aiCallGemini_(key, model, payload) {
  // 키를 주소에 붙이지 않고 헤더로 보낸다. 주소는 오류 로그·중계 기록에 남기 쉽다.
  return aiFetch_(AI_GEMINI_BASE + encodeURIComponent(model) + ':generateContent', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: payload, muteHttpExceptions: true
  });
}

function aiCallOpenai_(key, model, payload) {
  // OpenAI 는 본문 안에 model 을 담는다. 앱이 이미 담아 보내지만, 어긋나면 여기 것을 따른다.
  var b;
  try { b = JSON.parse(payload); } catch (e) { b = {}; }
  b.model = model;
  return aiFetch_(AI_OPENAI_URL, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(b), muteHttpExceptions: true
  });
}

function aiFetch_(url, opt) {
  var resp = UrlFetchApp.fetch(url, opt);
  var status = resp.getResponseCode();
  var text = String(resp.getContentText() || '');
  var truncated = false;
  if (text.length > AI_RESP_MAX) { text = text.slice(0, AI_RESP_MAX); truncated = true; }
  var json = null;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  // 오류 본문에 키가 되비쳐 오는 제공자가 있다. 짧게 자르고 그마저도 훑어 지운다.
  var brief = aiScrub_(text).slice(0, 160);
  return { status: status, json: json, text: truncated ? null : text, brief: brief, truncated: truncated };
}

/* 혹시라도 응답에 키가 섞여 오면 지운다. 사장님 화면·로그로 흘러가는 마지막 관문이다. */
function aiScrub_(s) {
  var out = String(s == null ? '' : s);
  var keys = [aiKeyOf_('gemini'), aiKeyOf_('openai')];
  for (var i = 0; i < keys.length; i++) {
    if (keys[i]) out = out.split(keys[i]).join('***');
  }
  return out;
}

function aiKeyOf_(provider) {
  // cfg_ 는 SheetService.gs 의 스크립트 속성 읽기다.
  if (provider === 'gemini') return cfg_('GEMINI_API_KEY', '');
  if (provider === 'openai') return cfg_('OPENAI_API_KEY', '');
  return '';
}

/* ============================================================
 * 3) 한도 — 기기가 아니라 여기서 센다
 * ============================================================ */
/**
 * 한 번 쓸 자리를 잡는다. 하루 상한과 분당 상한을 함께 본다.
 * 잠금 안에서 읽고 쓴다 — 두 기기가 동시에 부르면 둘 다 통과하는 일이 없어야 한다.
 */
function aiReserve_(provider) {
  var cap = AI_CAP[provider];
  var lock = LockService.getScriptLock();
  var got = false;
  try { got = lock.tryLock(10000); } catch (e) { got = false; }
  if (!got) return { ok: false, message: '잠시 붐빕니다. 몇 초 뒤 다시 시도해 주세요.' };
  try {
    var q = aiQuotaRead_();
    var used = (q.count[provider] || 0);
    if (used >= cap.day) {
      return { ok: false, message: cap.label + ' 하루 한도(' + cap.day + '건)를 다 썼습니다. 내일 다시 쓰실 수 있습니다.' };
    }
    var now = Date.now();
    var recent = (q.min[provider] || []).filter(function (t) { return now - t < 60000; });
    if (recent.length >= cap.perMin) {
      return { ok: false, message: cap.label + ' 가 잠깐 붐빕니다(분당 ' + cap.perMin + '건). 잠시 뒤 다시 눌러 주세요.' };
    }
    recent.push(now);
    q.count[provider] = used + 1;
    q.min[provider] = recent;
    aiQuotaWrite_(q);
    return { ok: true };
  } finally {
    try { lock.releaseLock(); } catch (e) { /* 이미 풀림 */ }
  }
}

/** 못 나갔을 때 되돌린다. 실패한 요청이 사장님 한도를 깎으면 안 된다. */
function aiRelease_(provider) {
  var lock = LockService.getScriptLock();
  var got = false;
  try { got = lock.tryLock(5000); } catch (e) { got = false; }
  if (!got) return;              // 못 잡으면 그냥 둔다 — 한 건 손해가 잠금 대기보다 낫다
  try {
    var q = aiQuotaRead_();
    if (q.count[provider] > 0) q.count[provider] -= 1;
    var arr = q.min[provider] || [];
    if (arr.length) arr.pop();
    q.min[provider] = arr;
    aiQuotaWrite_(q);
  } catch (e) { /* 되돌리기 실패는 조용히 — 이미 답은 못 받았다 */ }
  finally { try { lock.releaseLock(); } catch (e) {} }
}

function aiQuotaRead_() {
  var raw = '';
  try { raw = props_().getProperty(AI_QUOTA_PROP) || ''; } catch (e) { raw = ''; }
  var q = null;
  try { q = JSON.parse(raw); } catch (e) { q = null; }
  var today = aiToday_();
  if (!q || typeof q !== 'object' || q.day !== today) {
    q = { day: today, count: {}, min: {} };   // 날이 바뀌면 처음부터
  }
  if (!q.count || typeof q.count !== 'object') q.count = {};
  if (!q.min || typeof q.min !== 'object') q.min = {};
  return q;
}

function aiQuotaWrite_(q) {
  try { props_().setProperty(AI_QUOTA_PROP, JSON.stringify(q)); } catch (e) { /* 못 적어도 호출은 이미 셌다 */ }
}

/* 서버 시간대 기준의 '오늘'. 사장님 폰 시계를 믿지 않는다. */
function aiToday_() {
  var tz = 'Asia/Seoul';
  try { tz = Session.getScriptTimeZone() || tz; } catch (e) { /* 기본값 */ }
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

/* ============================================================
 * 4) 잔심부름
 * ============================================================ */
/* 원장에 남긴다. **프롬프트도 답도 남기지 않는다** — 견적·고객 이야기가 들어 있다. */
function aiLog_(provider, model, ctx) {
  try { logEvent_(null, 'AI_CALLED', provider + ' · ' + model, ctx); } catch (e) { /* 기록 실패가 답을 막지 않게 */ }
}

function aiFail_(code, msg) {
  return new Error(String(code) + '|' + aiScrub_(String(msg)));
}
function aiShort_(err) {
  return aiScrub_(String((err && err.message) || err)).slice(0, 140);
}
function aiIsArray_(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
