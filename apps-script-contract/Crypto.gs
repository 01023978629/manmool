/** ============================================================
 * 만물인테리어 전자계약 — 해시·토큰 계층 (contract-crypto-v1)
 * ------------------------------------------------------------
 * 하는 일:
 *   · SHA-256 — 문자열·바이트배열·data URI
 *   · HMAC-SHA256 — PEPPER 로 전화번호와 User-Agent 를 가린다(역산 불가)
 *   · 고객 링크에 쓸 무작위 토큰 발급(base64url)
 *   · 상수시간 비교
 *
 * 하지 않는 일:
 *   · 시트·Drive 를 읽거나 쓰지 않는다 (Store.gs / Docs.gs 담당)
 *   · 토큰을 저장하지 않는다. 여기서 만든 원문은 부른 쪽이 한 번 응답에 싣고 버린다.
 *     시트에는 SHA-256 해시만 남는다(Schema.gs COLS_TOKENS.tokenHash).
 *   · 16진수 변환을 직접 하지 않는다 — Pure.gs 의 bytesToHex 를 쓴다.
 *     computeDigest 가 주는 바이트는 부호가 있어서(-128~127) & 0xff 를 빠뜨리면
 *     해시가 통째로 어긋난다. 그 실수를 두 파일에서 반복하지 않으려고 한 곳에만 둔다.
 *   · Logger.log 를 부르지 않는다. 이 파일이 다루는 값은 전부 비밀이거나 비밀의 재료다.
 *
 * ⚠ PEPPER 를 바꾸면 이미 저장된 전화번호 해시가 전부 무의미해진다(대조 불가).
 *   한 번 정하면 바꾸지 않는다. 바꿔야 한다면 그건 재계약이 아니라 데이터 이관 작업이다.
 * ============================================================ */

var CRYPTO_VERSION = 'contract-crypto-v1';

// PEPPER 를 실행 한 번 동안만 들고 있는다. Apps Script 는 실행마다 전역을 새로 만들므로
// 이 값은 실행이 끝나면 사라진다. 시트·Drive·로그 어디에도 나가지 않는다.
// (계약 목록 100건에 대해 매번 PropertiesService 를 왕복하면 6분 제한이 아깝다)
var PEPPER_CACHE_ = null;

/* ---------- SHA-256 ---------- */

/**
 * 문자열의 SHA-256 을 16진수로.
 * charset 을 UTF_8 로 **명시**한다 — 계약 제목·고객 성명에 한글이 들어가는데,
 * 인코딩이 달라지면 같은 글자라도 다른 해시가 나온다. 기본값에 기대지 않는다.
 */
function sha256Hex(str) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(str == null ? '' : str),
    Utilities.Charset.UTF_8
  );
  return bytesToHex(bytes);
}

/** 바이트 배열의 SHA-256. 서명 PNG·완료 PDF 처럼 파일 원본을 그대로 해시할 때 쓴다. */
function sha256HexOfBytes(bytes) {
  if (!bytes || typeof bytes.length !== 'number') {
    throw new Error('해시할 바이트 배열이 아닙니다');
  }
  return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
}

/**
 * 'data:image/png;base64,iVBOR...' 에서 **디코딩한 원본 바이트**의 해시.
 *
 * base64 문자열 자체를 해시하면 안 된다. 같은 이미지라도 줄바꿈이 섞이거나
 * 패딩이 빠지면 문자열이 달라져 해시가 달라진다. 그러면 나중에 파일을 다시
 * 해시해 대조할 때 "위변조"로 잘못 판정한다. 대조의 기준은 언제나 원본 바이트다.
 */
function sha256HexOfDataUri(dataUri) {
  var s = String(dataUri == null ? '' : dataUri);
  var comma = s.indexOf(',');
  if (comma < 0) throw new Error('data URI 형식이 아닙니다');
  if (s.slice(0, comma).indexOf(';base64') < 0) throw new Error('base64 data URI 가 아닙니다');

  // 메일·복사붙여넣기를 거치면 base64 중간에 줄바꿈이 끼어든다. 디코딩 전에 턴다.
  var b64 = s.slice(comma + 1).replace(/\s+/g, '');
  if (!b64) throw new Error('data URI 에 내용이 없습니다');

  var bytes;
  try {
    bytes = Utilities.base64Decode(b64);
  } catch (err) {
    // 원본 문자열을 오류에 싣지 않는다 — 서명 이미지는 고객의 자필이다.
    throw new Error('이미지 디코딩에 실패했습니다');
  }
  return sha256HexOfBytes(bytes);
}

/* ---------- HMAC ---------- */

/**
 * PEPPER 로 HMAC-SHA256. 전화번호·User-Agent 처럼 **원문을 남기면 안 되지만
 * 같은 값인지는 대조해야 하는** 것에 쓴다.
 *
 * 그냥 SHA-256 이 아니라 HMAC 인 이유: 전화번호는 경우의 수가 1억 개 남짓이라
 * 해시만으로는 전수 대입으로 되찾을 수 있다. 시트가 통째로 유출돼도 PEPPER 가
 * 없으면 못 되찾게 하려고 비밀 키를 섞는다. 그래서 PEPPER 는 시트가 아니라
 * 스크립트 속성에 둔다(Schema.gs 의 SETTINGS_FORBIDDEN 참고).
 */
function hmacHex(str) {
  var sig = Utilities.computeHmacSha256Signature(
    String(str == null ? '' : str),
    pepperOrThrow_(),
    Utilities.Charset.UTF_8
  );
  return bytesToHex(sig);
}

// PEPPER 가 없으면 **조용히 넘어가지 않고 멈춘다.**
// 없는 채로 돌면 빈 문자열을 키로 쓴 해시가 시트에 쌓이는데, 그건 가린 것이 아니라
// 가린 척한 것이다. 나중에 PEPPER 를 넣는 순간 앞뒤 값이 어긋나 대조도 안 된다.
// Store.gs 의 cfg_ 를 쓰지 않는 이유: 비밀값은 일반 설정 통로를 타지 않게 하고,
// 이 파일 하나만 봐도 어디서 오는 값인지 보이게 하려는 것이다.
function pepperOrThrow_() {
  if (PEPPER_CACHE_) return PEPPER_CACHE_;
  var v = PropertiesService.getScriptProperties().getProperty('PEPPER');
  if (!v) {
    throw new Error('PEPPER 가 설정되지 않았습니다 — 프로젝트 설정 ▸ 스크립트 속성에 추가하세요');
  }
  PEPPER_CACHE_ = v;
  return v;
}

/* ---------- 무작위 토큰 ---------- */

/**
 * 고객 링크용 무작위 토큰. 32바이트(256비트)를 base64url 43자로 돌려준다.
 *
 * 정직한 한계 — Apps Script 에는 crypto.getRandomValues 같은 CSPRNG 가 없다.
 *   · Utilities.getUuid() 는 Java 의 UUID.randomUUID(), 즉 SecureRandom 기반이지만
 *     버전·변형 비트 6개가 고정이라 한 개당 122비트다. 그래서 하나만 쓰지 않고 넷을 잇는다.
 *   · Math.random() 은 **암호학적으로 안전하지 않다.** 출력 몇 개만 보면 내부 상태를
 *     복원할 수 있다. 그래서 주 재료로 쓰지 않고 보조로만 섞는다. 이걸 섞어서 더
 *     안전해지는 게 아니라, getUuid 구현이 언젠가 약해져도 최악은 면하자는 보험이다.
 *   · SHA-256 으로 접는 것은 **엔트로피를 늘리지 않는다.** 재료의 엔트로피가 상한이다.
 *     여기서는 길이를 32바이트로 맞추고 재료를 고르게 섞는 역할만 한다.
 * 결론: 실질 엔트로피는 넉넉히 122비트를 넘고, 72시간짜리 1회용 링크에는 충분하다.
 * 다만 "국가 표준 난수 생성기를 썼다"고 말할 수는 없다. 분쟁 시 그렇게 주장하지 마라.
 */
function randomToken() {
  var material = [
    Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(),
    String(Date.now()), String(Math.random()), String(Math.random())
  ].join('|');
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, material, Utilities.Charset.UTF_8
  );
  return toBase64Url_(bytes);
}

// base64url — '+' '/' 없이, 끝의 '=' 도 뗀다.
// 토큰은 ?t=... 로 주소창에 그대로 들어간다. '+' 는 주소에서 공백으로 바뀌고
// '=' 는 카톡·문자에서 링크 끝을 잘리게 만드는 원인이 된다.
function toBase64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/* ---------- 상수시간 비교 ---------- */

/**
 * 두 값이 같은지, 걸리는 시간으로 답을 흘리지 않고 비교한다.
 *
 * 흔한 실수 두 가지를 둘 다 피한다:
 *   1) 길이를 먼저 비교하고 다르면 즉시 false — "길이는 맞다"가 시간으로 샌다.
 *   2) 앞에서부터 비교하다 다르면 즉시 false — 몇 글자까지 맞았는지가 시간으로 샌다.
 * 그래서 두 값을 먼저 SHA-256(항상 32바이트)으로 접고, 32바이트를 **끝까지 전부** 훑는다.
 * 입력 길이와 내용에 상관없이 비교 구간이 항상 같다.
 *
 * 정직한 한계: 자바스크립트에서 완전한 상수시간은 보장할 수 없다(엔진 최적화·GC·
 * 문자열 처리). 이 함수는 쉽게 새지 않게 하는 것이지 수학적 보장이 아니다.
 */
function constantTimeEq(a, b) {
  var da = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(a == null ? '' : a), Utilities.Charset.UTF_8);
  var db = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(b == null ? '' : b), Utilities.Charset.UTF_8);

  var diff = 0;
  for (var i = 0; i < da.length; i++) {
    diff |= (da[i] ^ db[i]) & 0xff;   // 다른 비트가 하나라도 있으면 끝까지 남는다
  }
  return diff === 0;
}

/* Node 테스트에서 집어갈 수 있게 이름을 모아 둔다(Pure.gs 와 같은 방식).
   다만 이 파일은 순수하지 않다 — 테스트하려면 Utilities 와 PropertiesService 를
   가짜로 만들어 넣어야 한다. Apps Script 에서는 아무도 이 변수를 읽지 않는다. */
var CRYPTO_EXPORTS = {
  CRYPTO_VERSION: CRYPTO_VERSION,
  sha256Hex: sha256Hex, sha256HexOfBytes: sha256HexOfBytes,
  sha256HexOfDataUri: sha256HexOfDataUri, hmacHex: hmacHex,
  randomToken: randomToken, constantTimeEq: constantTimeEq
};
