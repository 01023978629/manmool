// 전자계약 핵심 서비스 — 모든 상태 전이·증거 생성이 여기서 일어난다(자체 서버).
// 외부(카카오)는 "메시지 배달"만 하고, 본인확인·서명·증거는 서버가 책임진다.
import {
  newId, issueToken, sha256, hmac, safeEqualHex,
  maskPhone, docHash, issueOtp,
} from './crypto.mjs';
import { audit, EVENTS, trail } from './audit.mjs';

const OTP_TTL_MS = 5 * 60 * 1000;       // 본인확인 OTP 5분
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_ISSUE = 5;                 // 당사자당 OTP 발급 상한(무제한 재발급 방지)
const SIGN_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;  // 서명 링크 72시간
const VIEW_TOKEN_TTL_MS = 15 * 60 * 1000;        // 완료본 열람 15분(장기 공개 금지)
const MIN_SIGNATURE_BYTES = 8;           // 빈/무의미 서명 거부 하한

// 동의문 "정본"은 서버가 보관한다. 클라이언트가 보낸 텍스트는 신뢰하지 않고,
// consent_key 로 서버 정본을 조회해 그 해시를 증거로 남긴다(증거 위조 방지).
const CONSENT_TEXTS = Object.freeze({
  terms: '공사 도급계약 체결 및 계약 조건에 동의합니다.',
  payment: '대금 지급 조건(계약금·중도금·잔금)에 동의합니다.',
  privacy: '개인정보 수집·이용(계약 이행 목적, 보유 5년)에 동의합니다.',
  esign: '전자문서 및 전자서명으로 계약을 체결하는 것에 동의합니다.',
});
const REQUIRED_CONSENTS = Object.freeze(['terms', 'payment', 'privacy', 'esign']);
// 서명 가능한 계약 상태(종료상태 COMPLETED/VOID 에서는 서명 링크 발급·서명 불가)
const SIGNABLE_STATUSES = Object.freeze(['LOCKED', 'SENT', 'VIEWED']);

export class ContractService {
  // clock: () => ISO8601 문자열. 테스트에서 시간 고정용.
  constructor(db, { clock, demoOtp } = {}) {
    this.db = db;
    this.clock = clock || (() => new Date().toISOString());
    this.demoOtp = demoOtp || null; // 데모: 고정 OTP. 운영에선 null.
  }

  _ctx(ctx = {}) {
    return {
      ipHash: ctx.ip ? hmac(ctx.ip) : null,
      uaHash: ctx.ua ? hmac(ctx.ua) : null,
      requestId: ctx.requestId || null,
    };
  }

  // 1) 계약 생성 (DRAFT)
  createContract({ contractNo, title, amount, body, operator, customer }) {
    const now = this.clock();
    const id = newId('ct');
    this.db.prepare(
      `INSERT INTO contracts(id,contract_no,title,status,amount,body_snapshot,created_at,updated_at)
       VALUES(?,?,?, 'DRAFT', ?, ?, ?, ?)`
    ).run(id, contractNo, title, amount | 0, JSON.stringify(body), now, now);

    const parties = {};
    for (const [role, p] of [['operator', operator], ['customer', customer]]) {
      const pid = newId('pt');
      this.db.prepare(
        `INSERT INTO contract_parties(id,contract_id,role,name,phone_masked,phone_hash,created_at)
         VALUES(?,?,?,?,?,?,?)`
      ).run(pid, id, role, p.name, maskPhone(p.phone), hmac(p.phone.replace(/\D/g, '')), now);
      parties[role] = pid;
    }
    audit(this.db, { contractId: id, event: EVENTS.CONTRACT_CREATED, at: now, meta: { contractNo } });
    return { contractId: id, parties };
  }

  // 2) 문서 잠금 + 해시 확정. 이후 본문 불변.
  lockDocument(contractId) {
    const c = this._contract(contractId);
    if (c.status !== 'DRAFT') throw new AppError('ALREADY_LOCKED', '이미 잠긴 계약입니다.');
    const body = JSON.parse(c.body_snapshot);
    const hash = docHash(body);
    const now = this.clock();
    this.db.prepare(
      `UPDATE contracts SET status='LOCKED', doc_hash=?, locked_at=?, updated_at=? WHERE id=?`
    ).run(hash, now, now, contractId);
    audit(this.db, { contractId, event: EVENTS.DOCUMENT_LOCKED, at: now, meta: { docHash: hash } });
    return { docHash: hash };
  }

  // 3) 일회용 서명 링크 발급. raw 토큰은 이 반환값에서만 노출(DB엔 해시만).
  issueSignLink(contractId, partyId, purpose = 'sign') {
    const c = this._contract(contractId);
    if (purpose === 'sign') {
      if (c.status === 'DRAFT') throw new AppError('NOT_LOCKED', '문서 잠금(해시 확정) 후에만 서명 링크를 발급할 수 있습니다.');
      // 완료·취소된 계약에는 새 서명 링크를 발급하지 않는다(완료본 변조 방지)
      if (!SIGNABLE_STATUSES.includes(c.status)) throw new AppError('NOT_SIGNABLE', '서명 링크를 발급할 수 없는 계약 상태입니다.');
    }
    if (purpose === 'view' && c.status !== 'COMPLETED') {
      throw new AppError('NOT_COMPLETED', '완료된 계약에만 열람 링크를 발급할 수 있습니다.');
    }
    const { raw, hash } = issueToken();
    const now = this.clock();
    const ttl = purpose === 'view' ? VIEW_TOKEN_TTL_MS : SIGN_TOKEN_TTL_MS;
    this.db.prepare(
      `INSERT INTO sign_tokens(id,contract_id,party_id,purpose,token_hash,expires_at,created_at)
       VALUES(?,?,?,?,?,?,?)`
    ).run(newId('tk'), contractId, partyId, purpose, hash, iso(this.clock, ttl), now);
    audit(this.db, { contractId, partyId, event: EVENTS.SIGN_LINK_ISSUED, at: now, meta: { purpose } });
    return { token: raw }; // 호출자는 이걸 URL 프래그먼트로만 전달(로그 금지)
  }

  // 4) 서명 요청 메시지 발송(Provider 경유).
  //    rawPhone: 실제 발송 시 수신번호 원문. 발송 시점 메모리로만 쓰고 로그/DB엔 남기지 않는다.
  //    (실제 발송은 승인 템플릿 + 실 Provider 설정이 있을 때만. 기본 Mock 은 rawPhone 을 무시)
  async sendMessage(contractId, partyId, templateKey, provider, extraVars = {}, rawPhone = null) {
    const c = this._contract(contractId);
    const p = this._party(partyId);
    // 원문 번호가 넘어오면 등록된 마스킹/해시와 동일인인지 대조(오발송 방지)
    if (rawPhone && hmac(String(rawPhone).replace(/\D/g, '')) !== p.phone_hash) {
      throw new AppError('PHONE_MISMATCH', '수신번호가 계약 당사자와 일치하지 않습니다.');
    }
    const tpl = this.db.prepare(
      'SELECT * FROM message_templates WHERE template_key=? ORDER BY version DESC LIMIT 1'
    ).get(templateKey);
    if (!tpl) throw new AppError('NO_TEMPLATE', '메시지 템플릿이 없습니다.');

    const deliveryId = newId('dl');
    const now = this.clock();
    this.db.prepare(
      `INSERT INTO message_deliveries(id,contract_id,party_id,template_key,provider,status,requested_at)
       VALUES(?,?,?,?,?, 'QUEUED', ?)`
    ).run(deliveryId, contractId, partyId, templateKey, provider.name, now);
    audit(this.db, { contractId, partyId, event: EVENTS.KAKAO_MESSAGE_QUEUED, at: now, meta: { templateKey, provider: provider.name } });

    const res = await provider.send({
      toPhoneMasked: p.phone_masked,
      toPhoneHash: p.phone_hash,
      toPhoneRaw: rawPhone || null, // 실 Provider 만 사용. 여기서 audit/log 하지 않음.
      templateKey,
      variables: { name: p.name, contractNo: c.contract_no, ...extraVars },
      buttons: tpl.buttons_json ? JSON.parse(tpl.buttons_json) : [],
    });

    const t2 = this.clock();
    if (res.status === 'FAILED') {
      this.db.prepare(
        `UPDATE message_deliveries SET status='FAILED', failed_reason=? WHERE id=?`
      ).run(res.failedReason || 'UNKNOWN', deliveryId);
      audit(this.db, { contractId, partyId, event: EVENTS.KAKAO_MESSAGE_FAILED, at: t2, meta: { reason: res.failedReason } });
      return { deliveryId, status: 'FAILED', reason: res.failedReason };
    }
    this.db.prepare(
      `UPDATE message_deliveries SET status='SENT', provider_msg_id=?, sent_at=? WHERE id=?`
    ).run(res.providerMsgId, t2, deliveryId);
    audit(this.db, { contractId, partyId, event: EVENTS.KAKAO_MESSAGE_SENT, at: t2, meta: { providerMsgId: res.providerMsgId } });
    if (c.status === 'LOCKED') {
      this.db.prepare(`UPDATE contracts SET status='SENT', updated_at=? WHERE id=?`).run(t2, contractId);
    }
    return { deliveryId, providerMsgId: res.providerMsgId, status: 'SENT' };
  }

  // 5) 전달상태 갱신. "전달완료"는 열람/본인확인과 분리된 별개 사건으로 기록.
  async refreshDelivery(deliveryId, provider) {
    const d = this.db.prepare('SELECT * FROM message_deliveries WHERE id=?').get(deliveryId);
    if (!d || !d.provider_msg_id) throw new AppError('NO_DELIVERY', '발송 이력이 없습니다.');
    const st = await provider.queryStatus(d.provider_msg_id);
    if (st.status === 'DELIVERED' && d.status !== 'DELIVERED') {
      const now = this.clock();
      this.db.prepare(`UPDATE message_deliveries SET status='DELIVERED', delivered_at=? WHERE id=?`)
        .run(st.deliveredAt || now, deliveryId);
      audit(this.db, {
        contractId: d.contract_id, partyId: d.party_id,
        event: EVENTS.KAKAO_MESSAGE_DELIVERED, at: st.deliveredAt || now,
        meta: { note: '단말 전달완료 — 본인열람/본인확인과 별개' },
      });
    }
    return { status: st.status };
  }

  // 6) 링크 열람(페이지 진입). 본인확인 아님. 토큰 소진하지 않음.
  openLink(rawToken, ctx = {}) {
    const tk = this._validToken(rawToken, 'sign');
    const c = this._contract(tk.contract_id);
    const { requestId } = this._ctx(ctx);
    audit(this.db, {
      contractId: c.id, partyId: tk.party_id, event: EVENTS.SIGN_LINK_OPENED,
      at: this.clock(), requestId, meta: { note: '페이지 열림 — 본인확인 전' },
    });
    // 본인확인 전에는 금액 등 최소 요약만 노출.
    return {
      contractNo: c.contract_no, title: c.title, amount: c.amount,
      docHash: c.doc_hash, needIdentityVerification: true,
    };
  }

  // 7) 본인확인 OTP 발급. 당사자당 발급 상한으로 무제한 재발급(무차별 대입 창 확장)을 막는다.
  requestOtp(rawToken) {
    const tk = this._validToken(rawToken, 'sign');
    const issued = this.db.prepare('SELECT COUNT(*) c FROM otp_challenges WHERE party_id=?').get(tk.party_id).c;
    if (issued >= OTP_MAX_ISSUE) throw new AppError('OTP_TOO_MANY', '인증번호 발급 횟수를 초과했습니다. 담당자에게 문의해 주세요.');
    // 재발급 시 이전 미검증 챌린지는 만료 처리(동시 유효 코드 최소화)
    this.db.prepare("UPDATE otp_challenges SET expires_at=? WHERE party_id=? AND verified_at IS NULL").run(this.clock(), tk.party_id);
    const { code, hash } = issueOtp(this.demoOtp);
    const now = this.clock();
    this.db.prepare(
      `INSERT INTO otp_challenges(id,party_id,code_hash,expires_at,created_at)
       VALUES(?,?,?,?,?)`
    ).run(newId('otp'), tk.party_id, hash, iso(this.clock, OTP_TTL_MS), now);
    audit(this.db, { contractId: tk.contract_id, partyId: tk.party_id, event: EVENTS.IDENTITY_OTP_ISSUED, at: now });
    // 데모에서만 code 를 반환. 운영에서는 절대 반환하지 않고 메시지 채널로만 전달.
    return this.demoOtp ? { demoCode: code } : { sent: true };
  }

  // 8) 본인확인 OTP 검증. 성공해야만 전체 열람/동의/서명이 가능.
  verifyOtp(rawToken, code, ctx = {}) {
    const tk = this._validToken(rawToken, 'sign');
    const ch = this.db.prepare(
      'SELECT * FROM otp_challenges WHERE party_id=? AND verified_at IS NULL ORDER BY id DESC LIMIT 1'
    ).get(tk.party_id);
    const now = this.clock();
    if (!ch) throw new AppError('NO_OTP', '발급된 인증코드가 없습니다.');
    if (now > ch.expires_at) throw new AppError('OTP_EXPIRED', '인증코드가 만료되었습니다.');
    if (ch.attempts >= OTP_MAX_ATTEMPTS) throw new AppError('OTP_LOCKED', '시도 횟수를 초과했습니다.');

    const ok = safeEqualHex(sha256(String(code) + (process.env.CONTRACT_PEPPER || 'DEMO_PEPPER_do_not_use_in_prod')), ch.code_hash);
    if (!ok) {
      this.db.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?').run(ch.id);
      audit(this.db, { contractId: tk.contract_id, partyId: tk.party_id, event: EVENTS.IDENTITY_OTP_FAILED, at: now });
      throw new AppError('OTP_MISMATCH', '인증코드가 일치하지 않습니다.');
    }
    this.db.prepare('UPDATE otp_challenges SET verified_at=? WHERE id=?').run(now, ch.id);
    this.db.prepare('UPDATE contract_parties SET verified_at=? WHERE id=?').run(now, tk.party_id);
    audit(this.db, { contractId: tk.contract_id, partyId: tk.party_id, event: EVENTS.IDENTITY_OTP_VERIFIED, at: now });
    return { verified: true };
  }

  // 8-b) 전체 계약 본문 반환. 본인확인 이후에만 전문을 노출(열람 전에는 요약만).
  getFullContract(rawToken) {
    const tk = this._validToken(rawToken, 'sign');
    this._requireVerified(tk.party_id);
    const c = this._contract(tk.contract_id);
    return { contractNo: c.contract_no, title: c.title, amount: c.amount, docHash: c.doc_hash, body: JSON.parse(c.body_snapshot) };
  }

  // 9) 전체 계약서 열람 완료(스크롤 끝까지). 본인확인 필수.
  markViewed(rawToken) {
    const tk = this._validToken(rawToken, 'sign');
    this._requireVerified(tk.party_id);
    const now = this.clock();
    this.db.prepare(`UPDATE contracts SET status='VIEWED', updated_at=? WHERE id=? AND status IN('SENT','LOCKED')`)
      .run(now, tk.contract_id);
    audit(this.db, { contractId: tk.contract_id, partyId: tk.party_id, event: EVENTS.DOCUMENT_VIEWED, at: now });
    return { viewed: true };
  }

  // 10) 동의 기록. 동의문 "정본"은 서버가 보관하고, 그 원문 해시를 증거로 남긴다.
  //     (클라이언트가 보낸 텍스트는 신뢰하지 않는다 — 증거 위조 방지)
  recordConsents(rawToken, consents, ctx = {}) {
    const tk = this._validToken(rawToken, 'sign');
    this._requireVerified(tk.party_id);
    // 열람 선행 강제: viewed → consent → signature 순서를 서버가 보장.
    if (!this._hasViewed(tk.party_id)) throw new AppError('NOT_VIEWED', '전체 계약서 열람 후 동의할 수 있습니다.');
    const { ipHash, uaHash } = this._ctx(ctx);
    const now = this.clock();
    const keys = [];
    for (const c of consents) {
      const canonical = CONSENT_TEXTS[c.key];
      if (!canonical) throw new AppError('BAD_CONSENT', `알 수 없는 동의 항목: ${c.key}`);
      this.db.prepare(
        `INSERT INTO consents(id,contract_id,party_id,consent_key,consent_text_hash,agreed_at,ip_hash,ua_hash)
         VALUES(?,?,?,?,?,?,?,?)`
      ).run(newId('cs'), tk.contract_id, tk.party_id, c.key, sha256(canonical), now, ipHash, uaHash);
      keys.push(c.key);
    }
    audit(this.db, { contractId: tk.contract_id, partyId: tk.party_id, event: EVENTS.CONSENT_AGREED, at: now, meta: { keys } });
    return { count: keys.length };
  }

  // 11) 서명 제출 → 계약 완료. 본인확인+열람+동의 선행 필수.
  //     clientDocHash: 고객 화면이 표시했던 문서해시. 서버 doc_hash 와 대조해 위·변조 차단.
  submitSignature(rawToken, { imageBytes, clientDocHash }, ctx = {}) {
    const tk = this._validToken(rawToken, 'sign');
    this._requireVerified(tk.party_id);
    const c = this._contract(tk.contract_id);
    // 종료상태 봉인: 이미 완료된 계약은 재서명 불가(완료본 변조 방지)
    if (c.status === 'COMPLETED') throw new AppError('ALREADY_COMPLETED', '이미 체결이 완료된 계약입니다.');
    if (!SIGNABLE_STATUSES.includes(c.status)) throw new AppError('NOT_SIGNABLE', '서명할 수 없는 계약 상태입니다.');

    // 빈/무의미 서명 거부
    const buf = Buffer.isBuffer(imageBytes) ? imageBytes : Buffer.from(String(imageBytes || ''));
    if (buf.length < MIN_SIGNATURE_BYTES) throw new AppError('EMPTY_SIGNATURE', '서명이 비어 있습니다.');

    // 서버가 요구하는 필수 동의(정본 기준). 클라이언트 입력이 아니라 서버 상수로 확정.
    const agreed = new Set(this.db.prepare('SELECT consent_key FROM consents WHERE party_id=?')
      .all(tk.party_id).map((r) => r.consent_key));
    for (const k of REQUIRED_CONSENTS) {
      if (!agreed.has(k)) throw new AppError('CONSENT_MISSING', `필수 동의 누락: ${k}`);
    }
    // 전체 열람 확인
    if (!this._hasViewed(tk.party_id)) throw new AppError('NOT_VIEWED', '전체 계약서 열람 후 서명할 수 있습니다.');

    // 문서 위·변조 대조: 고객이 본 해시가 서버 정본과 일치해야 서명 유효.
    if (clientDocHash && !safeEqualHex(clientDocHash, c.doc_hash)) {
      audit(this.db, { contractId: tk.contract_id, partyId: tk.party_id, event: EVENTS.SIGNATURE_SUBMITTED, at: this.clock(), meta: { rejected: 'DOC_HASH_MISMATCH', clientDocHash } });
      throw new AppError('DOC_HASH_MISMATCH', '계약서 내용이 변경되었습니다. 처음부터 다시 진행해 주세요.');
    }

    const { ipHash, uaHash } = this._ctx(ctx);
    const imgHash = sha256(buf);
    const now = this.clock();
    this.db.prepare(
      `INSERT INTO signatures(id,contract_id,party_id,image_sha256,image_ref,doc_hash_seen,signed_at,ip_hash,ua_hash)
       VALUES(?,?,?,?,?,?,?,?,?)`
    ).run(newId('sg'), tk.contract_id, tk.party_id, imgHash, `server://sig/${tk.contract_id}/${tk.party_id}`, c.doc_hash, now, ipHash, uaHash);
    // 서명 토큰 1회성 소진
    this.db.prepare('UPDATE sign_tokens SET used_at=? WHERE id=?').run(now, tk.id);
    // 종료상태로만 전이(경합 방지: 서명 가능 상태에서만 COMPLETED 로)
    const upd = this.db.prepare(`UPDATE contracts SET status='COMPLETED', completed_at=?, updated_at=? WHERE id=? AND status IN('LOCKED','SENT','VIEWED')`).run(now, now, tk.contract_id);
    if (upd.changes === 0) throw new AppError('ALREADY_COMPLETED', '이미 체결이 완료된 계약입니다.');
    audit(this.db, { contractId: tk.contract_id, partyId: tk.party_id, event: EVENTS.SIGNATURE_SUBMITTED, at: now, meta: { imageSha256: imgHash, docHashSeen: c.doc_hash } });
    audit(this.db, { contractId: tk.contract_id, event: EVENTS.CONTRACT_COMPLETED, at: now });
    return { completed: true, imageSha256: imgHash, docHash: c.doc_hash };
  }

  _hasViewed(partyId) {
    return !!this.db.prepare("SELECT 1 FROM audit_logs WHERE party_id=? AND event='DOCUMENT_VIEWED' LIMIT 1").get(partyId);
  }

  // 12) 완료본 단기 열람 링크(장기 공개 URL 금지 → 15분 view 토큰)
  issueViewLink(contractId, partyId) {
    return this.issueSignLink(contractId, partyId, 'view');
  }

  // 13) 완료본 접근
  accessCompleted(rawViewToken, ctx = {}) {
    const tk = this._validToken(rawViewToken, 'view');
    const c = this._contract(tk.contract_id);
    if (c.status !== 'COMPLETED') throw new AppError('NOT_COMPLETED', '완료된 계약이 아닙니다.');
    const { requestId } = this._ctx(ctx);
    audit(this.db, { contractId: c.id, partyId: tk.party_id, event: EVENTS.COMPLETED_DOC_ACCESSED, at: this.clock(), requestId });
    return { contractNo: c.contract_no, title: c.title, amount: c.amount, docHash: c.doc_hash, completedAt: c.completed_at };
  }

  // 14) 증거 패키지 — 계약·당사자·해시·동의·서명·전체 감사추적을 한 번에 봉인.
  evidencePackage(contractId) {
    const c = this._contract(contractId);
    const parties = this.db.prepare('SELECT role,name,phone_masked,verified_at FROM contract_parties WHERE contract_id=?').all(contractId);
    const consents = this.db.prepare('SELECT party_id,consent_key,consent_text_hash,agreed_at FROM consents WHERE contract_id=?').all(contractId);
    const signatures = this.db.prepare('SELECT party_id,image_sha256,doc_hash_seen,signed_at FROM signatures WHERE contract_id=?').all(contractId);
    const deliveries = this.db.prepare('SELECT template_key,provider,status,sent_at,delivered_at FROM message_deliveries WHERE contract_id=?').all(contractId);
    const auditTrail = trail(this.db, contractId);
    const pkg = {
      contract: { contractNo: c.contract_no, title: c.title, amount: c.amount, docHash: c.doc_hash, status: c.status, lockedAt: c.locked_at, completedAt: c.completed_at },
      parties, consents, signatures, deliveries, auditTrail,
      generatedAt: this.clock(),
    };
    // 증거 패키지 자체의 봉인 해시(무결성 대조용)
    pkg.packageHash = sha256(JSON.stringify(pkg));
    audit(this.db, { contractId, event: EVENTS.EVIDENCE_PACKAGE_GENERATED, at: this.clock(), meta: { packageHash: pkg.packageHash } });
    return pkg;
  }

  // ---- 내부 헬퍼 ----
  _contract(id) {
    const c = this.db.prepare('SELECT * FROM contracts WHERE id=?').get(id);
    if (!c) throw new AppError('NO_CONTRACT', '계약을 찾을 수 없습니다.');
    return c;
  }
  _party(id) {
    const p = this.db.prepare('SELECT * FROM contract_parties WHERE id=?').get(id);
    if (!p) throw new AppError('NO_PARTY', '당사자를 찾을 수 없습니다.');
    return p;
  }
  _requireVerified(partyId) {
    const p = this._party(partyId);
    if (!p.verified_at) throw new AppError('NOT_VERIFIED', '본인확인 후 진행할 수 있습니다.');
  }
  // 토큰 검증: 해시 대조 + 만료 + 소진/폐기 확인. 평문은 비교 즉시 버린다.
  _validToken(rawToken, purpose) {
    const hash = sha256(String(rawToken));
    const tk = this.db.prepare('SELECT * FROM sign_tokens WHERE token_hash=?').get(hash);
    if (!tk || tk.purpose !== purpose) throw new AppError('BAD_TOKEN', '유효하지 않은 링크입니다.');
    if (tk.revoked_at) throw new AppError('REVOKED', '취소된 링크입니다.');
    if (tk.used_at) throw new AppError('USED', '이미 사용된 링크입니다.');
    if (this.clock() > tk.expires_at) throw new AppError('EXPIRED', '만료된 링크입니다.');
    return tk;
  }
}

export class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; this.httpStatus = 400; }
}

// 현재 시각 + offset(ms) → ISO8601. clock 주입으로 테스트 결정성 확보.
function iso(clock, offsetMs) {
  return new Date(new Date(clock()).getTime() + offsetMs).toISOString();
}
