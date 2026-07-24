// 대금(청구·입금·미수) 검증 — 서비스 계층. 실제 발송 없음(Mock).
import { openDb } from '../src/db.mjs';
import { ContractService } from '../src/service.mjs';
import { MockKakaoMessageProvider } from '../src/providers/kakao.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);
const throws = async (n, fn, code) => { try { await fn(); R.push(['✗', n, '예외 없음']); } catch (e) { R.push([e.code === code ? '✓' : '✗', n, e.code || e.message]); } };

let t = new Date('2026-07-22T00:00:00.000Z').getTime();
const clock = () => { const s = new Date(t).toISOString(); t += 60000; return s; };
const db = openDb(':memory:');
const svc = new ContractService(db, { clock });
const provider = new MockKakaoMessageProvider({ clock });

// 계약 생성(결제 분할 포함) → 잠금 → 스케줄 시드
const { contractId, parties } = svc.createContract({
  contractNo: 'MM-2026-0777', title: '공사 도급계약서', amount: 41310000,
  body: { site: '대전 갈마동 34평', payment: { down: 4131000, mid: 16524000, bal: 20655000 } },
  operator: { name: '만물대표', phone: '010-0000-1111' },
  customer: { name: '홍길동', phone: '010-0000-2222' },
});
svc.lockDocument(contractId);
const seed = svc.seedPaymentSchedule(contractId);
ok('스케줄 시드(계약금·중도금·잔금 3건)', seed.count === 3);

const pays = svc.listPayments(contractId);
ok('스케줄 정렬·금액 정확', pays[0].stage === 'down' && pays[0].amount === 4131000 && pays[2].stage === 'bal' && pays[2].amount === 20655000);
ok('초기 상태 PENDING', pays.every((p) => p.status === 'PENDING'));

// 계약금 청구 → INVOICED + 발송
const inv = await svc.invoicePayment(contractId, 'down', provider, { rawPhone: '010-0000-2222', payInfo: '농협 123-456' });
ok('계약금 청구 → INVOICED + 발송', inv.action === 'INVOICED' && inv.delivery.status === 'SENT');
ok('청구 후 상태 INVOICED', svc.listPayments(contractId).find((p) => p.stage === 'down').status === 'INVOICED');

// 재청구 → 독촉(REMINDED)
const rem = await svc.invoicePayment(contractId, 'down', provider, { rawPhone: '010-0000-2222' });
ok('재청구 → 독촉(REMINDED)', rem.action === 'REMINDED');

// 수신번호 불일치 → 차단
await throws('청구 수신번호 불일치 차단', () => svc.invoicePayment(contractId, 'mid', provider, { rawPhone: '010-0000-0000' }), 'PHONE_MISMATCH');

// 입금 확인
const paid = svc.markPaid(contractId, 'down');
ok('입금 확인 → PAID', paid.status === 'PAID');
await throws('입금 완료건 재청구 거부', () => svc.invoicePayment(contractId, 'down', provider, {}), 'ALREADY_PAID');

// 미수 목록: down 은 PAID 빠지고 mid/bal 남음(마스킹)
const recv = svc.listReceivables();
ok('미수 목록 2건(mid·bal)', recv.count === 2 && recv.total === 16524000 + 20655000);
ok('미수 목록 전화번호 마스킹만', recv.items.every((i) => !/2397/.test(i.customer_phone || '') && /\*\*\*\*/.test(i.customer_phone || '')));

// 감사에 대금 이벤트 분리 기록 + 전화번호 원문 없음
const events = svc.evidencePackage(contractId).auditTrail.map((e) => e.event);
ok('대금 이벤트(청구·독촉·입금) 기록', ['PAYMENT_INVOICED', 'PAYMENT_REMINDED', 'PAYMENT_PAID', 'PAYMENT_SCHEDULE_SET'].every((e) => events.includes(e)));
const leak = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE meta_json LIKE '%2397%'").get().c;
ok('감사 로그에 전화번호 원문 없음', leak === 0);

// body.payment 없으면 스케줄 0
const c2 = svc.createContract({ contractNo: 'MM-2026-0778', title: '계약', amount: 1000, body: { site: 'x' }, operator: { name: '만물대표', phone: '010-0000-1111' }, customer: { name: '박', phone: '010-1111-2222' } });
ok('결제 분할 없으면 스케줄 0', svc.seedPaymentSchedule(c2.contractId).count === 0);

console.log('\n===== 대금(청구·입금·미수) 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
