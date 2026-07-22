-- 만물인테리어 전자계약 백엔드 — 데이터 모델 (SQLite / node:sqlite)
-- 설계 원칙(스펙 준수):
--   * 전자서명·증거자료는 자체 서버에서만 생성·보관한다.
--   * 일회용 토큰은 평문 저장 금지. token_hash(SHA-256)만 저장한다.
--   * 전화번호 전체는 저장/로그 금지. phone_masked + phone_hash(HMAC)만 저장.
--   * "메시지 전달완료"와 "고객 본인열람/본인확인"은 서로 다른 사건으로 분리 기록.
--   * 링크 클릭(SIGN_LINK_OPENED)만으로 본인확인(IDENTITY_OTP_VERIFIED)을 대체하지 않는다.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 계약 본문. 잠금(lock) 이후에는 doc_hash / body_snapshot 이 불변이어야 한다.
CREATE TABLE IF NOT EXISTS contracts (
  id            TEXT PRIMARY KEY,              -- ct_<uuid-ish>
  contract_no   TEXT UNIQUE NOT NULL,          -- MM-2026-0142 형태(사람이 읽는 번호)
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | LOCKED | SENT | VIEWED | SIGNING | COMPLETED | VOID
  amount        INTEGER NOT NULL DEFAULT 0,    -- 원(정수). 부동소수 사용 금지.
  body_snapshot TEXT,                          -- 잠금 시점의 계약 본문(JSON). 잠금 후 불변.
  doc_hash      TEXT,                          -- SHA-256(body_snapshot canonical). 잠금 시 생성.
  locked_at     TEXT,                          -- ISO8601. NULL 이면 미잠금(수정 가능).
  completed_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 계약 당사자. 을(고객)·갑(사업자) 등. 전화번호 원문은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS contract_parties (
  id           TEXT PRIMARY KEY,               -- pt_<...>
  contract_id  TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,                  -- operator | customer
  name         TEXT NOT NULL,
  phone_masked TEXT,                           -- 010-****-8629 형태만
  phone_hash   TEXT,                           -- HMAC-SHA256(phone, PEPPER). 대조용, 역산 불가.
  verified_at  TEXT,                           -- 본인확인(OTP) 성공 시각
  created_at   TEXT NOT NULL
);

-- 일회용 서명/열람 링크 토큰. 평문 토큰은 절대 저장하지 않는다(해시만).
CREATE TABLE IF NOT EXISTS sign_tokens (
  id           TEXT PRIMARY KEY,               -- tk_<...>
  contract_id  TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  party_id     TEXT NOT NULL REFERENCES contract_parties(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL,                  -- sign | view(완료본 단기열람)
  token_hash   TEXT NOT NULL,                  -- SHA-256(raw token). raw 는 발급 시 1회만 노출.
  expires_at   TEXT NOT NULL,                  -- 짧은 만료(sign 72h / view 15m 권장)
  used_at      TEXT,                           -- 1회성 소진 시각(재사용 차단)
  revoked_at   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_hash ON sign_tokens(token_hash);

-- 본인확인 OTP 챌린지. code 는 해시로만 보관, 시도 횟수 제한.
CREATE TABLE IF NOT EXISTS otp_challenges (
  id          TEXT PRIMARY KEY,
  party_id    TEXT NOT NULL REFERENCES contract_parties(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,                   -- SHA-256(code + party salt)
  expires_at  TEXT NOT NULL,                   -- 3~5분 권장
  attempts    INTEGER NOT NULL DEFAULT 0,      -- 5회 초과 시 폐기
  verified_at TEXT,
  created_at  TEXT NOT NULL
);

-- 동의 항목. 각 동의문 원문 해시를 함께 남겨 "무엇에 동의했는지"를 증거화한다.
CREATE TABLE IF NOT EXISTS consents (
  id                TEXT PRIMARY KEY,
  contract_id       TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  party_id          TEXT NOT NULL REFERENCES contract_parties(id) ON DELETE CASCADE,
  consent_key       TEXT NOT NULL,             -- terms | privacy | esign | withdrawal ...
  consent_text_hash TEXT NOT NULL,             -- SHA-256(동의문 원문)
  agreed_at         TEXT NOT NULL,
  ip_hash           TEXT,                      -- HMAC(ip). 원문 IP 저장 안 함.
  ua_hash           TEXT
);

-- 전자서명. 서명 이미지 자체가 아니라 SHA-256 지문 + 파일 포인터를 남긴다.
CREATE TABLE IF NOT EXISTS signatures (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  party_id      TEXT NOT NULL REFERENCES contract_parties(id) ON DELETE CASCADE,
  image_sha256  TEXT NOT NULL,                 -- 서명 PNG 원본의 SHA-256
  image_ref     TEXT,                          -- 서버 저장 위치 포인터(공개 URL 아님)
  doc_hash_seen TEXT NOT NULL,                 -- 서명 당시 고객이 본 계약 doc_hash(위변조 대조)
  signed_at     TEXT NOT NULL,
  ip_hash       TEXT,
  ua_hash       TEXT
);

-- 감사 로그. 모든 상태 전이의 append-only 원장. 전화번호/토큰 원문 금지.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id  TEXT,
  party_id     TEXT,
  event        TEXT NOT NULL,                  -- 아래 이벤트 taxonomy 참조
  request_hash TEXT,                           -- HMAC(요청 식별자). 전화번호 대신 요청해시.
  meta_json    TEXT,                           -- 부가정보(민감정보 제외)
  at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_contract ON audit_logs(contract_id, at);

-- 메시지 템플릿. 알림톡/대체문자 본문. 승인 전에는 실제 발송 안 함.
CREATE TABLE IF NOT EXISTS message_templates (
  id            TEXT PRIMARY KEY,
  template_key  TEXT NOT NULL,                 -- contract_sign | contract_done | contract_view
  channel       TEXT NOT NULL,                 -- alimtalk | sms(fallback)
  title         TEXT,
  body_template TEXT NOT NULL,                 -- #{name} #{contractNo} 치환자
  buttons_json  TEXT,                          -- [{name,type,url}]
  version       INTEGER NOT NULL DEFAULT 1,
  UNIQUE(template_key, version)
);

-- 메시지 발송 이력. Provider(=Mock/실제)가 남기는 발송·전달 상태.
-- "전달완료(DELIVERED)"는 열람/본인확인과 분리된 별개 사건임에 유의.
CREATE TABLE IF NOT EXISTS message_deliveries (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  party_id        TEXT REFERENCES contract_parties(id) ON DELETE SET NULL,
  template_key    TEXT NOT NULL,
  provider        TEXT NOT NULL,               -- mock | solapi | nhncloud ...
  provider_msg_id TEXT,
  status          TEXT NOT NULL,               -- QUEUED | SENT | DELIVERED | FAILED
  requested_at    TEXT NOT NULL,
  sent_at         TEXT,
  delivered_at    TEXT,
  failed_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliv_contract ON message_deliveries(contract_id);
