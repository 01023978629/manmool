// 암호·해시 유틸 — 스펙의 토큰/해시/마스킹 요구사항을 한 곳에 모은다.
//  * 일회용 토큰: 128bit 이상 CSPRNG, DB엔 해시만 저장.
//  * 전화번호: 원문 저장/로그 금지 → 마스킹 + HMAC 해시.
//  * 문서 지문: 정규화(canonical) 후 SHA-256.
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

// 운영에서는 반드시 환경변수/시크릿 매니저로 주입. 데모는 고정 페퍼로 재현성 확보.
// 운영(NODE_ENV=production)에서 PEPPER 미설정이면 기동을 거부한다(fail-fast).
if (process.env.NODE_ENV === 'production' && !process.env.CONTRACT_PEPPER) {
  throw new Error('보안: 운영 환경에서는 CONTRACT_PEPPER 를 반드시 설정해야 합니다.');
}
const PEPPER = process.env.CONTRACT_PEPPER || 'DEMO_PEPPER_do_not_use_in_prod';

export function newId(prefix) {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

// 일회용 토큰: 32바이트(256bit) CSPRNG. raw 는 호출자에게 1회만 반환된다.
export function issueToken() {
  const raw = randomBytes(32).toString('base64url'); // >128bit
  return { raw, hash: sha256(raw) };
}

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function hmac(input) {
  return createHmac('sha256', PEPPER).update(String(input)).digest('hex');
}

// 상수시간 비교(타이밍 공격 방지). 해시 문자열 대조에 사용.
export function safeEqualHex(aHex, bHex) {
  const a = Buffer.from(String(aHex), 'utf8');
  const b = Buffer.from(String(bHex), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 전화번호 마스킹: 010-****-8629 (가운데만 가림, 뒤 4자리는 식별 편의상 노출).
export function maskPhone(phone) {
  const d = String(phone).replace(/\D/g, '');
  if (d.length < 8) return '***';
  const head = d.slice(0, 3);
  const tail = d.slice(-4);
  return `${head}-****-${tail}`;
}

// 계약 본문 정규화: 키 정렬 후 JSON 직렬화 → 동일 내용은 항상 동일 해시.
export function canonicalize(obj) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((o, k) => { o[k] = sort(v[k]); return o; }, {});
    }
    return v;
  };
  return JSON.stringify(sort(obj));
}

export function docHash(body) {
  return sha256(canonicalize(body));
}

// 6자리 OTP (본인확인용). 데모에서는 고정값을 쓰지만 API 는 동일.
export function issueOtp(demoCode) {
  const code = demoCode || String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
  return { code, hash: sha256(code + PEPPER) };
}
