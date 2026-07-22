// 감사 로그 — append-only. 상태 전이는 반드시 이 함수를 거친다.
import { hmac } from './crypto.mjs';

// 이벤트 taxonomy. "전달완료"와 "본인열람/본인확인"을 서로 다른 이벤트로 분리한다.
export const EVENTS = Object.freeze({
  CONTRACT_CREATED: 'CONTRACT_CREATED',
  DOCUMENT_LOCKED: 'DOCUMENT_LOCKED',            // doc_hash 확정
  SIGN_LINK_ISSUED: 'SIGN_LINK_ISSUED',
  // --- 카카오/메시지 채널 (KAKAO_*) ---
  KAKAO_MESSAGE_QUEUED: 'KAKAO_MESSAGE_QUEUED',
  KAKAO_MESSAGE_SENT: 'KAKAO_MESSAGE_SENT',
  KAKAO_MESSAGE_DELIVERED: 'KAKAO_MESSAGE_DELIVERED', // 단말 전달완료 ≠ 본인열람
  KAKAO_MESSAGE_FAILED: 'KAKAO_MESSAGE_FAILED',
  // --- 고객 행위 ---
  SIGN_LINK_OPENED: 'SIGN_LINK_OPENED',          // 페이지 열림. 본인확인 아님.
  IDENTITY_OTP_ISSUED: 'IDENTITY_OTP_ISSUED',
  IDENTITY_OTP_VERIFIED: 'IDENTITY_OTP_VERIFIED', // 본인확인 성립 지점
  IDENTITY_OTP_FAILED: 'IDENTITY_OTP_FAILED',
  DOCUMENT_VIEWED: 'DOCUMENT_VIEWED',            // 전체 계약서 열람 완료(스크롤 끝)
  CONSENT_AGREED: 'CONSENT_AGREED',
  SIGNATURE_SUBMITTED: 'SIGNATURE_SUBMITTED',
  CONTRACT_COMPLETED: 'CONTRACT_COMPLETED',
  EVIDENCE_PACKAGE_GENERATED: 'EVIDENCE_PACKAGE_GENERATED',
  COMPLETED_DOC_ACCESSED: 'COMPLETED_DOC_ACCESSED',
});

export function audit(db, { contractId = null, partyId = null, event, requestId = null, meta = null, at }) {
  db.prepare(
    `INSERT INTO audit_logs(contract_id,party_id,event,request_hash,meta_json,at) VALUES(?,?,?,?,?,?)`
  ).run(
    contractId, partyId, event,
    requestId ? hmac(requestId) : null,   // 전화번호 대신 요청해시만
    meta ? JSON.stringify(meta) : null,
    at
  );
}

export function trail(db, contractId) {
  return db.prepare(
    'SELECT event, at, meta_json FROM audit_logs WHERE contract_id=? ORDER BY id'
  ).all(contractId).map((r) => ({ event: r.event, at: r.at, meta: r.meta_json ? JSON.parse(r.meta_json) : null }));
}
