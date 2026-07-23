// 자율 루프(운영 브리핑) + 자율 등급 엔진 검증 — 발송/네트워크 없음.
// 실행: node contract-backend/test/operator.mjs
import { openDb } from '../src/db.mjs';
import { ContractService } from '../src/service.mjs';
import { MockKakaoMessageProvider } from '../src/providers/kakao.mjs';
import { classify, groupByTier, TIERS, TIER_ORDER } from '../src/autonomy.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

let t = new Date('2026-07-01T00:00:00.000Z').getTime();
const clock = () => { const s = new Date(t).toISOString(); t += 60 * 1000; return s; };
const db = openDb(':memory:');
const svc = new ContractService(db, { clock, demoOtp: '246810' });
const provider = new MockKakaoMessageProvider({ clock, deliverAfterMs: 0 });

// ── 자율 등급 엔진 단위 ──────────────────────────────────
ok('TIER_ORDER 4단계', TIER_ORDER.length === 4 && TIER_ORDER[0] === 'AUTO' && TIER_ORDER[3] === 'HUMAN');
ok('classify AUTO(브리핑) 승인불요', classify('morning_brief').tier === 'AUTO' && classify('morning_brief').needsApproval === false);
ok('classify APPROVE(대금청구) 승인필요', classify('payment_invoice').tier === 'APPROVE' && classify('payment_invoice').needsApproval === true);
ok('classify HUMAN(법적서명) 사람만', classify('legal_signature').tier === 'HUMAN' && classify('legal_signature').humanOnly === true);
ok('classify NOTIFY(진행알림=정보성)', classify('progress_notify').tier === 'NOTIFY' && classify('progress_notify').needsApproval === false);
ok('classify APPROVE(서명리마인드=고객행동요구)', classify('sign_reminder').tier === 'APPROVE' && classify('sign_reminder').needsApproval === true);
ok('미등록 유형 기본 HUMAN(가장 보수적)', classify('unknown_action_xyz').tier === 'HUMAN' && classify('unknown_action_xyz').known === false);
ok('groupByTier 분류', (() => { const g = groupByTier([{ tier: 'AUTO' }, { tier: 'APPROVE' }, { tier: 'APPROVE' }, { tier: 'HUMAN' }]); return g.AUTO.length === 1 && g.APPROVE.length === 2 && g.HUMAN.length === 1; })());
ok('groupByTier 미상 tier → HUMAN', groupByTier([{ tier: 'BOGUS' }]).HUMAN.length === 1);

// ── 상태 시드 ────────────────────────────────────────────
function mkContract(no, name, phone, amount) {
  const { contractId, parties } = svc.createContract({
    contractNo: no, title: '공사 도급계약', amount,
    body: { site: '대전 둔산동', scope: ['도배', '장판'], amount },
    operator: { name: '전병덕', phone: '010-5439-8629' },
    customer: { name, phone },
  });
  return { contractId, pid: parties.customer };
}
const setStatus = (cid, status) => db.prepare('UPDATE contracts SET status=? WHERE id=?').run(status, cid);

// 1) SENT 미서명(오래됨) → sign_reminder(NOTIFY)
const a = mkContract('MM-2026-A', '김서명', '010-1111-2222', 10000000); setStatus(a.contractId, 'SENT');
// 2) COMPLETED 인데 대금 일정 없음 → payment_invoice(APPROVE)
const b = mkContract('MM-2026-B', '박완료', '010-3333-4444', 20000000); setStatus(b.contractId, 'COMPLETED');
// 3) 미수: down 청구(INVOICED)·bal 미청구(PENDING)
const cc = mkContract('MM-2026-C', '최미수', '010-5555-6666', 30000000);
svc.seedPaymentSchedule(cc.contractId, [
  { stage: 'down', label: '계약금', amount: 3000000 },
  { stage: 'bal', label: '잔금', amount: 27000000 },
]);
await svc.invoicePayment(cc.contractId, 'down', provider, { rawPhone: '010-5555-6666', payInfo: '농협 123-45' });

// 미래 시점(5일 후)으로 브리핑 → 미서명 나이 반영
const future = new Date(t + 5 * 86400000).toISOString();
const brief = svc.operatorBrief({ now: future });

ok('sense 계약/서명중/완료 집계', brief.sense.contracts === 3 && brief.sense.signing === 1 && brief.sense.completed === 1);
ok('sense 미수 집계(down+bal)', brief.sense.receivableCount >= 2 && brief.sense.receivableTotal >= 27000000 + 3000000);
ok('SENT 오래됨 → sign_reminder(APPROVE·고객행동요구)', brief.decisions.some((d) => d.action === 'sign_reminder' && d.tier === 'APPROVE' && d.contractNo === 'MM-2026-A'));
ok('COMPLETED 대금없음 → payment_invoice(APPROVE)', brief.decisions.some((d) => d.action === 'payment_invoice' && d.contractNo === 'MM-2026-B' && d.tier === 'APPROVE'));
ok('INVOICED 미수 → payment_remind(APPROVE)', brief.decisions.some((d) => d.action === 'payment_remind' && d.tier === 'APPROVE' && d.stage === 'down'));
ok('PENDING 미수 → payment_invoice(APPROVE)', brief.decisions.some((d) => d.action === 'payment_invoice' && d.stage === 'bal'));
ok('등급별 그룹 합 = 결정 수', brief.decisions.length === TIER_ORDER.reduce((s, k) => s + brief.byTier[k].length, 0));
ok('counts = byTier 길이', TIER_ORDER.every((k) => brief.counts[k] === brief.byTier[k].length));
ok('승인대기 = APPROVE+HUMAN', brief.needsApprovalCount === brief.byTier.APPROVE.length + brief.byTier.HUMAN.length);
ok('모든 결정에 등급 부여', brief.decisions.every((d) => TIERS[d.tier]));

// 프라이버시: 전화 원문 미포함(마스킹조차 응답에서 제거 — 노출면 축소)
const dump = JSON.stringify(brief);
ok('브리핑에 전화 원문 없음', !dump.includes('5555-6666') && !dump.includes('1111-2222'));
ok('결정에 전화번호(마스킹 포함) 필드 없음', brief.decisions.every((d) => !('customerPhone' in d)));

// VOID(취소) 계약의 대금은 미수·독촉·재무에서 제외되어야 한다(취소 고객 독촉 방지)
const v = mkContract('MM-2026-V', '한취소', '010-7777-8888', 15000000);
svc.seedPaymentSchedule(v.contractId, [{ stage: 'down', label: '계약금', amount: 1500000 }]);
await svc.invoicePayment(v.contractId, 'down', provider, { rawPhone: '010-7777-8888', payInfo: '농협' });
const recvBeforeVoid = svc.listReceivables().total;
const finBeforeVoid = svc.financeSummary().receivable;
setStatus(v.contractId, 'VOID');
const brief2 = svc.operatorBrief({ now: future });
ok('VOID 계약 미수에서 제외', svc.listReceivables().total === recvBeforeVoid - 1500000);
ok('VOID 계약 독촉 결정 미생성', !brief2.decisions.some((d) => d.contractNo === 'MM-2026-V'));
ok('VOID 계약 재무 미수 합산 제외', svc.financeSummary().receivable === finBeforeVoid - 1500000);

// 나이 기준이 발송/열람(updated_at)인지 검증: createdAt은 오래됐어도 updatedAt이 최근이면 리마인드 안 함
const rc = mkContract('MM-2026-R', '새발송', '010-9999-0000', 5000000);
db.prepare('UPDATE contracts SET status=?, updated_at=? WHERE id=?').run('SENT', new Date(Date.parse(future) - 43200000).toISOString(), rc.contractId); // future-0.5일
const brief3 = svc.operatorBrief({ now: future });
ok('updated_at 최근이면 서명 리마인드 안 함(createdAt 오래됐어도)', !brief3.decisions.some((d) => d.action === 'sign_reminder' && d.contractNo === 'MM-2026-R'));

// now 잘못된 값이면 서버 시계로 폴백(무증상 억제 방지) — 예외 없이 형태 유지
const briefBad = svc.operatorBrief({ now: 'not-a-date' });
ok('잘못된 now → 폴백(정상 브리핑)', briefBad && briefBad.sense && Array.isArray(briefBad.decisions));

// 읽기전용: 브리핑 호출이 상태를 바꾸지 않음
const before = svc.listContracts().map((c) => c.status).sort().join(',');
svc.operatorBrief({ now: future });
const after = svc.listContracts().map((c) => c.status).sort().join(',');
ok('브리핑은 읽기전용(상태 불변)', before === after);

// 빈 상태: 결정 없을 때도 형태 유지
const emptyDb = openDb(':memory:');
const emptySvc = new ContractService(emptyDb, { clock: () => new Date('2026-07-10T00:00:00Z').toISOString() });
const eb = emptySvc.operatorBrief({});
ok('빈 상태 브리핑 형태 유지', eb.sense.contracts === 0 && Array.isArray(eb.decisions) && eb.decisions.length === 0 && eb.needsApprovalCount === 0);

console.log('\n===== 운영 브리핑(자율 루프) =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
