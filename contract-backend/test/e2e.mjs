// 전자계약 Mock 참조구현 — 엔드투엔드 검증. 실제 발송/네트워크 없음.
// 실행: node contract-backend/test/e2e.mjs
import { openDb } from '../src/db.mjs';
import { ContractService, AppError } from '../src/service.mjs';
import { MockKakaoMessageProvider } from '../src/providers/kakao.mjs';

const R = [];
const ok = (n, cond, x) => R.push([cond ? '✓' : '✗', n, x || '']);
const throws = async (n, fn, code) => {
  try { await fn(); R.push(['✗', n, '예외가 발생하지 않음']); }
  catch (e) { R.push([e.code === code ? '✓' : '✗', n, e.code || e.message]); }
};

// 결정적 시계: 호출 때마다 1분씩 진행.
let t = new Date('2026-07-22T00:00:00.000Z').getTime();
const clock = () => { const s = new Date(t).toISOString(); t += 60 * 1000; return s; };

const db = openDb(':memory:');
const svc = new ContractService(db, { clock, demoOtp: '246810' });
const provider = new MockKakaoMessageProvider({ clock, deliverAfterMs: 0 });

// ── 1) 계약 생성 ──────────────────────────────────────────
const body = {
  contractNo: 'MM-2026-0142',
  site: '대전 서구 갈마동 34평',
  scope: ['철거', '욕실', '주방', '도배'],
  amount: 41310000,
  clauses: ['제1조 목적 …', '제2조 공사대금 …', '제12조 분쟁해결 …'],
};
const { contractId, parties } = svc.createContract({
  contractNo: 'MM-2026-0142', title: '실내건축 공사 계약', amount: 41310000, body,
  operator: { name: '전병덕', phone: '010-5439-8629' },
  customer: { name: '김대전', phone: '010-2397-8629' },
});
ok('계약 생성', !!contractId && !!parties.customer);

// 전화번호 원문이 어디에도 저장되지 않았는지 확인
const rawPhoneLeak = db.prepare("SELECT COUNT(*) c FROM contract_parties WHERE phone_masked LIKE '%2397%' OR phone_masked LIKE '%5439%'").get().c;
ok('전화번호 원문 미저장(마스킹만)', rawPhoneLeak === 0);

// ── 2) 잠금 전 서명링크 발급 시도 → 거부 ─────────────────
await throws('잠금 전 서명링크 발급 거부', () => svc.issueSignLink(contractId, parties.customer, 'sign'), 'NOT_LOCKED');

// ── 3) 문서 잠금 + 해시 ────────────────────────────────
const { docHash } = svc.lockDocument(contractId);
ok('문서 잠금·해시 생성', /^[0-9a-f]{64}$/.test(docHash));
await throws('이중 잠금 거부', () => svc.lockDocument(contractId), 'ALREADY_LOCKED');

// ── 4) 서명 링크 발급 (raw 토큰은 여기서만 노출) ──────────
const { token } = svc.issueSignLink(contractId, parties.customer, 'sign');
ok('서명 토큰 발급(≥128bit)', typeof token === 'string' && token.length >= 22);
// DB에 평문 토큰이 없어야 함(해시만)
const plainLeak = db.prepare('SELECT COUNT(*) c FROM sign_tokens WHERE token_hash=?').get(token).c;
ok('토큰 평문 미저장(해시만)', plainLeak === 0);

// ── 5) 메시지 발송(Mock) — 실제 발송 아님 ────────────────
const send = await svc.sendMessage(contractId, parties.customer, 'contract_sign', provider, { signUrl: 'https://sign.example/#t=<token>' });
ok('Mock 메시지 발송(SENT)', send.status === 'SENT' && !!send.providerMsgId);
const del = await svc.refreshDelivery(send.deliveryId, provider);
ok('전달완료(DELIVERED) — 열람과 별개 사건', del.status === 'DELIVERED');

// ── 6) 링크 열람 = 본인확인 아님 ─────────────────────────
const opened = svc.openLink(token, { requestId: 'req-1' });
ok('링크 열람 시 본인확인 요구', opened.needIdentityVerification === true);

// 본인확인 없이 서명 시도 → 거부
await throws('본인확인 없이 서명 거부', () => svc.submitSignature(token, { imageBytes: 'PNGDATA' }), 'NOT_VERIFIED');

// ── 7) 본인확인 OTP ──────────────────────────────────────
const otp = svc.requestOtp(token);
ok('OTP 발급', otp.demoCode === '246810');
await throws('OTP 오입력 거부', () => svc.verifyOtp(token, '000000'), 'OTP_MISMATCH');
const ver = svc.verifyOtp(token, '246810', { ip: '1.2.3.4', ua: 'iPhone' });
ok('본인확인 성공', ver.verified === true);

// ── 8) 전체 열람 → 동의 → 서명 순서 강제 ──────────────────
await throws('열람 없이 서명 거부', () => svc.submitSignature(token, { imageBytes: 'PNGDATA' }), 'CONSENT_MISSING');
svc.markViewed(token);
svc.recordConsents(token, [
  { key: 'terms', text: '계약 조항 전체에 동의합니다.' },
  { key: 'privacy', text: '개인정보 수집·이용에 동의합니다.' },
  { key: 'esign', text: '전자서명의 법적 효력에 동의합니다.' },
], { ip: '1.2.3.4', ua: 'iPhone' });

// ── 9) 서명 제출 → 완료 ──────────────────────────────────
const sig = svc.submitSignature(token, { imageBytes: Buffer.from('PNG_SIGNATURE_BYTES') }, { ip: '1.2.3.4', ua: 'iPhone' });
ok('서명 제출·계약 완료', sig.completed === true && /^[0-9a-f]{64}$/.test(sig.imageSha256));

// 토큰 1회성 — 재사용 거부
await throws('서명 토큰 재사용 거부', () => svc.submitSignature(token, { imageBytes: 'X' }), 'USED');

// ── 10) 완료본 단기열람(15분 view 토큰) ──────────────────
const view = svc.issueViewLink(contractId, parties.customer);
const acc = svc.accessCompleted(view.token, { requestId: 'req-view-1' });
ok('완료본 단기열람', acc.contractNo === 'MM-2026-0142' && acc.docHash === docHash);

// ── 11) 증거 패키지 ──────────────────────────────────────
const pkg = svc.evidencePackage(contractId);
ok('증거 패키지 서명 지문 = 계약 해시 대조', pkg.signatures[0].doc_hash_seen === docHash);
ok('증거 패키지 봉인 해시', /^[0-9a-f]{64}$/.test(pkg.packageHash));

// 감사추적: 전달완료 ≠ 열람 ≠ 본인확인이 각각 별개 이벤트로 남았는지
const events = pkg.auditTrail.map((e) => e.event);
const need = ['CONTRACT_CREATED', 'DOCUMENT_LOCKED', 'SIGN_LINK_ISSUED', 'KAKAO_MESSAGE_SENT',
  'KAKAO_MESSAGE_DELIVERED', 'SIGN_LINK_OPENED', 'IDENTITY_OTP_VERIFIED', 'DOCUMENT_VIEWED',
  'CONSENT_AGREED', 'SIGNATURE_SUBMITTED', 'CONTRACT_COMPLETED', 'COMPLETED_DOC_ACCESSED'];
const missing = need.filter((e) => !events.includes(e));
ok('감사추적: 12개 핵심 이벤트 분리 기록', missing.length === 0, missing.join(','));
ok('전달완료와 본인확인이 별개 이벤트', events.includes('KAKAO_MESSAGE_DELIVERED') && events.includes('IDENTITY_OTP_VERIFIED'));

// 감사 로그에 전화번호 원문이 없는지
const logLeak = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE meta_json LIKE '%2397%' OR meta_json LIKE '%5439%' OR request_hash LIKE '%2397%'").get().c;
ok('감사 로그에 전화번호 원문 없음', logLeak === 0);

// ── 12) 실패 시나리오: 차단된 수신자 ─────────────────────
const failProv = new MockKakaoMessageProvider({ clock, failPhoneHashes: [db.prepare('SELECT phone_hash h FROM contract_parties WHERE id=?').get(parties.customer).h] });
const failSend = await svc.sendMessage(contractId, parties.customer, 'contract_sign', failProv);
ok('발송 실패 시 FAILED 기록', failSend.status === 'FAILED');

// ── 결과 ─────────────────────────────────────────────────
console.log('\n===== 전자계약 Mock E2E =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
