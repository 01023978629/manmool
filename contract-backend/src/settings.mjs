// 운영자 연결 설정 저장소 + 상태(마스킹).
//   * 저장 키는 환경변수와 같은 이름(ALIMTALK_LIVE, SOLAPI_* )을 써서 env 위에 병합만 하면 된다.
//   * 시크릿(API secret 등)은 응답으로 원문 반환 금지 — set/unset + 끝 4자리만 노출.
//   * CONTRACT_PEPPER 등 서버 시크릿은 여기서 다루지 않는다(환경변수 전용).
import { safeEqualHex } from './crypto.mjs';

// 관리 가능한 설정 키. secret=true 는 응답 마스킹 대상.
export const SETTING_KEYS = [
  { key: 'ALIMTALK_LIVE', label: '실제 발송 켜기(1/0)', secret: false },
  { key: 'SOLAPI_API_KEY', label: '솔라피 API Key', secret: false },
  { key: 'SOLAPI_API_SECRET', label: '솔라피 API Secret', secret: true },
  { key: 'SOLAPI_PF_ID', label: '발신프로필 pfId', secret: false },
  { key: 'SOLAPI_SENDER', label: '발신번호(숫자만)', secret: false },
  { key: 'SOLAPI_TEMPLATE_SIGN', label: '서명요청 템플릿 ID', secret: false },
  { key: 'SOLAPI_TEMPLATE_DONE', label: '완료 템플릿 ID', secret: false },
  { key: 'SOLAPI_DISABLE_SMS', label: '문자 대체발송 끄기(1/0)', secret: false },
];
const KEYSET = new Set(SETTING_KEYS.map((k) => k.key));

export function readSettings(db) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM app_settings').all()) out[r.key] = r.value;
  return out;
}

export function writeSettings(db, obj, now) {
  const up = db.prepare('INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at');
  let n = 0;
  for (const [k, v] of Object.entries(obj || {})) {
    if (!KEYSET.has(k)) continue;               // 허용된 키만
    if (v == null || v === '') continue;         // 빈 값은 무시(기존값 유지)
    up.run(k, String(v), now);
    n += 1;
  }
  return n;
}

// env + DB 병합(DB 우선). selectProvider 에 그대로 넘길 수 있는 형태.
export function mergedSource(env, db) {
  return { ...env, ...readSettings(db) };
}

// 상태 요약: 원문 시크릿 없이 set/unset + 끝 4자리만.
export function settingsStatus(env, db) {
  const merged = mergedSource(env, db);
  const dbKeys = new Set(Object.keys(readSettings(db)));
  const fields = SETTING_KEYS.map((s) => {
    const v = merged[s.key];
    const set = v != null && v !== '';
    return {
      key: s.key, label: s.label, secret: s.secret, set,
      source: set ? (dbKeys.has(s.key) ? 'db' : 'env') : null,
      hint: set ? (s.secret ? maskTail(v) : String(v)) : null,
    };
  });
  const liveReady = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PF_ID', 'SOLAPI_SENDER', 'SOLAPI_TEMPLATE_SIGN']
    .every((k) => merged[k]);
  return { fields, live: merged.ALIMTALK_LIVE === '1', liveReady, pepperSet: !!env.CONTRACT_PEPPER };
}

function maskTail(v) {
  const s = String(v);
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}

// 관리자 인증: ADMIN_TOKEN 미설정이면 관리자 기능 비활성. 상수시간 비교.
export function checkAdmin(env, token) {
  const admin = env.ADMIN_TOKEN;
  if (!admin) return { ok: false, code: 'ADMIN_DISABLED' };
  if (!token || !safeEqualHex(token, admin)) return { ok: false, code: 'ADMIN_UNAUTHORIZED' };
  return { ok: true };
}
