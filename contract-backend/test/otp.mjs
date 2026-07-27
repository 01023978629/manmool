// 본인확인 OTP — 실제 발송 · 재발송 안정성 · 번호 대조 검증.
// 실행: node contract-backend/test/otp.mjs   (실제 네트워크 없음. Mock provider)
//
// 고친 결함 두 가지가 여기서 지켜진다.
//  ① requestOtp 에 발송 호출이 한 줄도 없어 운영에서 아무도 서명을 완료할 수 없었다.
//     화면은 "문자로 발송했습니다"라고 말하는데 문자는 오지 않았다.
//  ② verifyOtp 가 ORDER BY id DESC 로 골랐는데 그 id 가 난수라 시간순이 아니었다.
//     재발급하면 옛(만료된) 챌린지를 집어 정확한 번호인데도 OTP_EXPIRED 가 났다.
//     실측: 다시받기 1회 47% · 2회 35% · 4회 21% 로 성공률이 떨어졌다.
import { openDb } from '../src/db.mjs';
import { ContractService } from '../src/service.mjs';
import { MockKakaoMessageProvider } from '../src/providers/kakao.mjs';
import { buildStandardBody } from '../src/standard-contract.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);
const throws = async (n, fn, code) => {
  try { await fn(); R.push(['✗', n, '예외가 발생하지 않음']); }
  catch (e) { R.push([e.code === code ? '✓' : '✗', n, e.code || e.message]); }
};

let t = new Date('2026-07-26T00:00:00.000Z').getTime();
const clock = () => { const s = new Date(t).toISOString(); t += 1000; return s; };
const PHONE = '010-2397-8629';

function fresh(opts = {}) {
  const db = openDb(':memory:');
  const svc = new ContractService(db, Object.assign({ clock }, opts));
  const body = buildStandardBody({ site: '대전', scope: ['도배'], amount: 1000000, customerName: '홍길동' });
  const { contractId, parties } = svc.createContract({
    contractNo: 'C' + Math.random().toString(36).slice(2, 9), title: '계약', amount: 1000000, body,
    operator: { name: '대표', phone: '010-0000-1111' }, customer: { name: '홍길동', phone: PHONE },
  });
  svc.lockDocument(contractId);
  const { token } = svc.issueSignLink(contractId, parties.customer, 'sign');
  svc.openLink(token, {});
  return { db, svc, token, contractId, parties };
}
function spyProvider() {
  const p = new MockKakaoMessageProvider({ clock, deliverAfterMs: 0 });
  const calls = [];
  const orig = p.sendText.bind(p);
  p.sendText = async (r) => { calls.push(r); return orig(r); };
  return { p, calls };
}

// ── ① 실제로 문자가 나가는가 (운영과 동일: demoOtp 없음) ──────────
{
  const { svc, token } = fresh();
  const { p, calls } = spyProvider();
  const r = await svc.requestOtp(token, p, PHONE);
  ok('운영 설정에서 문자가 실제로 발송된다', r.sent === true && calls.length === 1, JSON.stringify(r));
  ok('문자 본문에 6자리 인증번호가 들어간다', /\d{6}/.test(calls[0].text || ''));
  ok('문자에 상호가 표기된다', /만물인테리어/.test(calls[0].text || ''));
  const code = (calls[0].text.match(/(\d{6})/) || [])[1];
  const v = svc.verifyOtp(token, code, {});
  ok('발송된 번호로 본인확인 성공', v.verified === true);
}

// ── ② 다른 번호로는 발송되지 않는다 ──────────────────────────────
{
  const { svc, token } = fresh();
  const { p, calls } = spyProvider();
  await throws('등록되지 않은 번호는 거부(PHONE_MISMATCH)', () => svc.requestOtp(token, p, '010-9999-0000'), 'PHONE_MISMATCH');
  ok('거부 시 발송 시도조차 하지 않는다', calls.length === 0, String(calls.length));
}

// ── ③ 보낼 수단이 없으면 보냈다고 하지 않는다 ────────────────────
{
  const { svc, token } = fresh();
  const r = await svc.requestOtp(token, null, null);
  ok('발송 수단 없으면 sent:false', r.sent === false && r.reason === 'NO_CHANNEL', JSON.stringify(r));
}
{
  const { svc, token } = fresh();
  const { p } = spyProvider();
  p.sendText = async () => ({ providerMsgId: null, status: 'FAILED', failedReason: 'BLOCKED' });
  const r = await svc.requestOtp(token, p, PHONE);
  ok('발송 실패면 sent:false + 사유', r.sent === false && r.reason === 'BLOCKED', JSON.stringify(r));
}
{
  const { svc, token } = fresh();
  const { p } = spyProvider();
  p.sendText = async () => { throw new Error('network down'); };
  const r = await svc.requestOtp(token, p, PHONE);
  ok('발송이 예외를 던져도 죽지 않고 sent:false', r.sent === false && r.reason === 'SEND_ERROR', JSON.stringify(r));
}

// ── ④ 재발송해도 마지막 코드로 반드시 성공한다 ───────────────────
for (const resend of [1, 2, 4]) {
  let pass = 0;
  const N = 120;
  for (let i = 0; i < N; i++) {
    const { svc, token } = fresh();
    const { p, calls } = spyProvider();
    await svc.requestOtp(token, p, PHONE);
    for (let k = 0; k < resend; k++) await svc.requestOtp(token, p, PHONE);
    const last = calls[calls.length - 1].text.match(/(\d{6})/)[1];
    try { svc.verifyOtp(token, last, {}); pass++; } catch (e) { /* 실패 집계 */ }
  }
  ok(`다시받기 ${resend}회 후 마지막 코드로 100% 성공`, pass === N, `${pass}/${N}`);
}

// ── ⑤ 옛 코드는 재발송 뒤 통하지 않는다(동시 유효 코드 최소화) ────
{
  const { svc, token } = fresh();
  const { p, calls } = spyProvider();
  await svc.requestOtp(token, p, PHONE);
  const first = calls[0].text.match(/(\d{6})/)[1];
  await svc.requestOtp(token, p, PHONE);
  const second = calls[1].text.match(/(\d{6})/)[1];
  if (first === second) { ok('옛 코드 무효화 검증(코드가 같아 건너뜀)', true, 'skip'); }
  else await throws('재발송 후 옛 코드는 거부', () => svc.verifyOtp(token, first, {}), 'OTP_MISMATCH');
  ok('재발송 후 새 코드는 통과', svc.verifyOtp(token, second, {}).verified === true);
}

// ── ⑥ 발급 상한은 '평생'이 아니라 '시간창' ──────────────────────
{
  const { svc, token } = fresh();
  const { p } = spyProvider();
  for (let i = 0; i < 5; i++) await svc.requestOtp(token, p, PHONE);
  await throws('30분 안에 6번째는 거부', () => svc.requestOtp(token, p, PHONE), 'OTP_TOO_MANY');
  // 시계를 31분 앞으로 → 다시 가능해야 한다(평생 상한이면 여기서도 막힌다)
  t += 31 * 60 * 1000;
  const r = await svc.requestOtp(token, p, PHONE);
  ok('31분 뒤에는 다시 발급된다(평생 상한 아님)', r.sent === true, JSON.stringify(r));
}

// ── ⑦ 전화번호 원문이 DB·감사로그에 남지 않는다 ─────────────────
{
  const { db, svc, token } = fresh();
  const { p } = spyProvider();
  await svc.requestOtp(token, p, PHONE);
  const leak = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE meta_json LIKE '%23978629%'").get().c
             + db.prepare("SELECT COUNT(*) c FROM contract_parties WHERE phone_masked LIKE '%23978629%'").get().c
             + db.prepare("SELECT COUNT(*) c FROM otp_challenges WHERE code_hash LIKE '%23978629%'").get().c;
  ok('전화번호 원문이 어디에도 저장되지 않는다', leak === 0, String(leak));
}

// ── ⑧ 데모 모드는 그대로 동작한다(회귀 방지) ─────────────────────
{
  const { svc, token } = fresh({ demoOtp: '246810' });
  const r = await svc.requestOtp(token);
  ok('데모 모드는 코드를 그대로 반환', r.demoCode === '246810', JSON.stringify(r));
  ok('데모 코드로 본인확인 성공', svc.verifyOtp(token, '246810', {}).verified === true);
}

// ── ⑨ 발급이 없으면 NO_OTP, 만료면 OTP_EXPIRED 로 구분된다 ───────
{
  const { svc, token } = fresh();
  await throws('발급 전 검증은 NO_OTP', () => svc.verifyOtp(token, '123456', {}), 'NO_OTP');
}
{
  const { svc, token } = fresh();
  const { p } = spyProvider();
  await svc.requestOtp(token, p, PHONE);
  t += 6 * 60 * 1000;                       // TTL 5분 초과
  await throws('만료 후 검증은 OTP_EXPIRED', () => svc.verifyOtp(token, '123456', {}), 'OTP_EXPIRED');
}

console.log('\n===== 본인확인 OTP 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
