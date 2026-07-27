// 서명 완료 통지 · 계약 취소(VOID) · 문서해시 금액 포함 — 3개 업그레이드 회귀 검증.
// 실행: node contract-backend/test/complete-notify-void.mjs   (실제 네트워크 없음, 전부 Mock)
//
// 고친 공백 세 가지가 여기서 지켜진다.
//  ① 완료 통지: 예전에는 고객이 서명을 마쳐도 아무 통지가 없었다 — contract_done 템플릿은
//     시드만 되고 호출부가 0건, 사장님은 /admin 을 열기 전까지 체결 사실을 몰랐다.
//  ② 계약 취소: VOID 를 읽는 코드(집계 제외)만 있고 쓰는 코드가 없어서, 금액을 잘못 넣어
//     보낸 계약서도 고객 폰에서 72시간 내내 서명 가능했다.
//  ③ 문서해시: 해시가 본문만 덮고 amount 컬럼은 밖이라, 잠금 뒤 금액만 고쳐도
//     고객이 대조한 해시가 그대로 맞았다.
import { createApp } from '../src/server.mjs';
import { MockKakaoMessageProvider } from '../src/providers/kakao.mjs';
import { ContractService } from '../src/service.mjs';
import { openDb } from '../src/db.mjs';
import { buildStandardBody } from '../src/standard-contract.mjs';
import { docHash, hmac } from '../src/crypto.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

process.env.ADMIN_TOKEN = 'cnv-admin';
const CUST_PHONE = '01000002222';

// HTTP 로 서명 플로우를 끝까지 태우는 헬퍼(데모 OTP 고정).
async function fullSignFlow(base, ADMIN, { signPhone = CUST_PHONE } = {}) {
  const qs = await (await fetch(base + '/api/contracts/quick-send', { method: 'POST', headers: ADMIN, body: JSON.stringify({
    title: '공사 도급계약서', amount: 3300000, body: { site: '대전 석교동', scope: ['욕실 방수'] },
    operator: { name: '전병덕', phone: '010-2397-8629' }, customer: { name: '홍길동', phone: CUST_PHONE } }) })).json();
  const H = { 'x-sign-token': qs.signPath.split('#t=')[1], 'content-type': 'application/json' };
  const call = (p, m = 'POST', j = {}) => fetch(base + p, { method: m, headers: H, body: m === 'GET' ? undefined : JSON.stringify(j) }).then((r) => r.json());
  await call('/api/sign', 'GET');
  await call('/api/sign/otp', 'POST', { phone: CUST_PHONE });
  await call('/api/sign/verify', 'POST', { code: '246810' });
  await call('/api/sign/viewed');
  await call('/api/sign/consent', 'POST', { consents: [{ key: 'terms' }, { key: 'payment' }, { key: 'privacy' }, { key: 'esign' }] });
  const full = await call('/api/sign/full', 'GET');
  const sig = await call('/api/sign/signature', 'POST',
    { imageBase64: Buffer.from('PNG_SIGNATURE_BYTES').toString('base64'), clientDocHash: full.docHash, phone: signPhone });
  return { qs, sig, full };
}

// ═══ ① 완료 통지 ═══════════════════════════════════════════════
{
  const provider = new MockKakaoMessageProvider();
  const app = createApp({ demoOtp: '246810', provider });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  const ADMIN = { 'x-admin-token': 'cnv-admin', 'content-type': 'application/json' };

  // 대표 수신번호를 관리자 설정으로 저장(운영과 같은 경로)
  const saved = await (await fetch(base + '/admin/settings', { method: 'POST', headers: ADMIN,
    body: JSON.stringify({ settings: { OWNER_NOTIFY_PHONE: '01023978629' } }) })).json();
  ok('OWNER_NOTIFY_PHONE 을 관리자 설정으로 저장할 수 있다', saved.saved === 1, `saved=${saved.saved}`);

  const { sig } = await fullSignFlow(base, ADMIN);
  ok('서명은 정상 완료된다', sig.completed === true, sig.error || '');
  ok('고객 완료 알림톡이 발송된다(notify.customer.sent)', !!(sig.notify && sig.notify.customer && sig.notify.customer.sent === true),
    JSON.stringify(sig.notify && sig.notify.customer));
  ok('대표 완료 문자가 발송된다(notify.owner.sent)', !!(sig.notify && sig.notify.owner && sig.notify.owner.sent === true),
    JSON.stringify(sig.notify && sig.notify.owner));
  const deliv = app.db.prepare("SELECT template_key, status FROM message_deliveries ORDER BY requested_at").all();
  ok('발송 이력에 contract_done 이 남는다', deliv.some((d) => d.template_key === 'contract_done' && d.status === 'SENT'),
    deliv.map((d) => d.template_key + ':' + d.status).join(','));
  ok('발송 이력에 대표 통지(notify:contract_done_owner)가 남는다',
    deliv.some((d) => d.template_key === 'notify:contract_done_owner' && d.status === 'SENT'), '');
  app.server.close();
}

// 통지 실패는 서명 완료를 깨지 않는다 — 고객 번호가 수신거부(발송 실패)여도 계약은 성립.
{
  const provider = new MockKakaoMessageProvider({ failPhoneHashes: [hmac(CUST_PHONE)] });
  const app = createApp({ demoOtp: '246810', provider });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  const ADMIN = { 'x-admin-token': 'cnv-admin', 'content-type': 'application/json' };
  const { sig } = await fullSignFlow(base, ADMIN);
  ok('발송 실패여도 서명은 완료된다', sig.completed === true, sig.error || '');
  ok('통지 상태는 정직하게 실패로 보고된다', !!(sig.notify && sig.notify.customer && sig.notify.customer.sent === false),
    JSON.stringify(sig.notify && sig.notify.customer));
  app.server.close();
}

// 다른 사람 번호로는 완료 알림톡이 나가지 않는다(당사자 해시 대조).
{
  const provider = new MockKakaoMessageProvider();
  const app = createApp({ demoOtp: '246810', provider });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  const ADMIN = { 'x-admin-token': 'cnv-admin', 'content-type': 'application/json' };
  const { sig } = await fullSignFlow(base, ADMIN, { signPhone: '01099998888' });
  ok('타인 번호: 서명은 완료되지만', sig.completed === true, sig.error || '');
  ok('타인 번호로는 알림톡이 발송되지 않는다(PHONE_MISMATCH)',
    !!(sig.notify && sig.notify.customer && sig.notify.customer.sent === false && sig.notify.customer.reason === 'PHONE_MISMATCH'),
    JSON.stringify(sig.notify && sig.notify.customer));
  const done = app.db.prepare("SELECT COUNT(*) c FROM message_deliveries WHERE template_key='contract_done' AND status='SENT'").get().c;
  ok('발송 이력에도 contract_done 성공이 없다', done === 0, `sent=${done}`);
  app.server.close();
}

// ═══ ② 계약 취소(VOID) ═════════════════════════════════════════
{
  const app = createApp({ demoOtp: '246810' });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  const ADMIN = { 'x-admin-token': 'cnv-admin', 'content-type': 'application/json' };

  // 잘못 보낸 계약서 시나리오: 발송까지 끝난 계약을 취소한다
  const qs = await (await fetch(base + '/api/contracts/quick-send', { method: 'POST', headers: ADMIN, body: JSON.stringify({
    title: '공사 도급계약서', amount: 9999999, body: { site: '대전(금액 오기)', scope: ['도배'] },
    operator: { name: '전병덕', phone: '010-2397-8629' }, customer: { name: '홍길동', phone: CUST_PHONE } }) })).json();
  const tokenH = { 'x-sign-token': qs.signPath.split('#t=')[1] };
  // 취소 전에는 링크가 살아 있다
  const before = await (await fetch(base + '/api/sign', { headers: tokenH })).json();
  ok('취소 전: 보낸 링크는 열린다', before.contractNo === qs.contractNo, before.error || '');

  const vd = await (await fetch(base + `/api/contracts/${qs.contractId}/void`, { method: 'POST', headers: ADMIN,
    body: JSON.stringify({ reason: '금액 오기' }) })).json();
  ok('취소가 성공하고 미사용 토큰이 무효화된다', vd.status === 'VOID' && vd.revokedTokens >= 1, JSON.stringify(vd));

  const after = await (await fetch(base + '/api/sign', { headers: tokenH })).json();
  ok('취소 후: 이미 보낸 링크는 그 자리에서 죽는다(REVOKED)', after.error === 'REVOKED', after.error || '열림');

  const again = await (await fetch(base + `/api/contracts/${qs.contractId}/void`, { method: 'POST', headers: ADMIN, body: '{}' })).json();
  ok('재취소는 멱등이다', again.status === 'VOID' && again.already === true, JSON.stringify(again));

  // 취소된 계약: 새 서명 링크 발급도 막힌다
  const svc2 = app.svc;
  const party = app.db.prepare("SELECT id FROM contract_parties WHERE contract_id=? AND role='customer'").get(qs.contractId);
  let linkErr = null;
  try { svc2.issueSignLink(qs.contractId, party.id, 'sign'); } catch (e) { linkErr = e.code; }
  ok('취소된 계약에는 새 서명 링크를 발급할 수 없다', linkErr === 'NOT_SIGNABLE', linkErr || '발급됨');

  // 집계 제외: 미수·재무에서 사라진다 (payments 시드가 있는 계약으로 확인)
  const recv = await (await fetch(base + '/api/receivables', { headers: ADMIN })).json();
  ok('취소된 계약은 미수 집계에서 제외된다', !(recv.items || []).some((i) => i.contract_no === qs.contractNo), `count=${recv.count}`);

  // 완료된 계약은 취소할 수 없다(봉인)
  const done = await fullSignFlow(base, ADMIN);
  const vdone = await fetch(base + `/api/contracts/${done.sig.contractId}/void`, { method: 'POST', headers: ADMIN, body: '{}' });
  const vdoneJ = await vdone.json();
  ok('체결 완료 계약은 취소 불가(봉인)', vdone.status === 400 && vdoneJ.error === 'ALREADY_COMPLETED', `${vdone.status} ${vdoneJ.error}`);
  app.server.close();
}

// ═══ ③ 문서해시가 계약금액을 덮는다 ═══════════════════════════
{
  let t = new Date('2026-07-26T00:00:00.000Z').getTime();
  const clock = () => { const s = new Date(t).toISOString(); t += 1000; return s; };
  const db = openDb(':memory:');
  const svc = new ContractService(db, { clock, demoOtp: '246810' });
  let seq = 0;
  const mkContract = () => {
    const body = buildStandardBody({ site: '대전', scope: ['도배'], amount: 5000000, customerName: '홍길동' });
    const { contractId, parties } = svc.createContract({
      contractNo: 'DH-' + (++seq), title: '계약', amount: 5000000, body,
      operator: { name: '전병덕', phone: '010-2397-8629' }, customer: { name: '홍길동', phone: CUST_PHONE },
    });
    svc.lockDocument(contractId);
    return { contractId, parties };
  };
  const signUpTo = (contractId, partyId) => {
    const { token } = svc.issueSignLink(contractId, partyId, 'sign');
    svc.openLink(token, {});
    svc.requestOtp(token);
    svc.verifyOtp(token, '246810', {});
    svc.markViewed(token);
    svc.recordConsents(token, [{ key: 'terms' }, { key: 'payment' }, { key: 'privacy' }, { key: 'esign' }], {});
    return token;
  };

  // 정상 계약: 재계산 대조 통과 + 증거에 docHashVerified=true
  {
    const { contractId, parties } = mkContract();
    const token = signUpTo(contractId, parties.customer);
    const hash = db.prepare('SELECT doc_hash h FROM contracts WHERE id=?').get(contractId).h;
    const sig = svc.submitSignature(token, { imageBytes: Buffer.from('PNG_SIGNATURE_BYTES'), clientDocHash: hash }, {});
    ok('정상 계약은 그대로 서명된다', sig.completed === true);
    ok('증거 패키지에 docHashVerified=true', svc.evidencePackage(contractId).docHashVerified === true);
  }

  // 금액 변조: 잠금 뒤 amount 컬럼만 바꾸면 — 열람·서명이 모두 거부된다
  {
    const { contractId, parties } = mkContract();
    const token = signUpTo(contractId, parties.customer);
    const hash = db.prepare('SELECT doc_hash h FROM contracts WHERE id=?').get(contractId).h;
    db.prepare('UPDATE contracts SET amount=1 WHERE id=?').run(contractId); // 변조 시뮬레이션
    let readErr = null;
    try { svc.getFullContract(token); } catch (e) { readErr = e.code; }
    ok('금액 변조: 전문 열람이 거부된다(DOC_TAMPERED)', readErr === 'DOC_TAMPERED', readErr || '열람됨');
    let signErr = null;
    try { svc.submitSignature(token, { imageBytes: Buffer.from('PNG_SIGNATURE_BYTES'), clientDocHash: hash }, {}); }
    catch (e) { signErr = e.code; }
    ok('금액 변조: 서명 제출이 거부된다(DOC_TAMPERED)', signErr === 'DOC_TAMPERED', signErr || '서명됨');
    ok('증거 패키지가 손상을 표시한다(docHashVerified=false)', svc.evidencePackage(contractId).docHashVerified === false);
  }

  // 본문 변조도 물론 잡힌다
  {
    const { contractId } = mkContract();
    const body = JSON.parse(db.prepare('SELECT body_snapshot b FROM contracts WHERE id=?').get(contractId).b);
    body.clauses[1].text = '총 계약금액은 금 1원으로 한다.';
    db.prepare('UPDATE contracts SET body_snapshot=? WHERE id=?').run(JSON.stringify(body), contractId);
    ok('본문 변조도 docHashVerified=false', svc.evidencePackage(contractId).docHashVerified === false);
  }

  // 구스킴 호환: 금액 포함 이전(본문만 해시)에 잠근 계약도 그대로 서명된다
  {
    const { contractId, parties } = mkContract();
    const body = JSON.parse(db.prepare('SELECT body_snapshot b FROM contracts WHERE id=?').get(contractId).b);
    db.prepare('UPDATE contracts SET doc_hash=? WHERE id=?').run(docHash(body), contractId); // 구스킴 해시로 되돌림
    const token = signUpTo(contractId, parties.customer);
    const hash = db.prepare('SELECT doc_hash h FROM contracts WHERE id=?').get(contractId).h;
    const sig = svc.submitSignature(token, { imageBytes: Buffer.from('PNG_SIGNATURE_BYTES'), clientDocHash: hash }, {});
    ok('구스킴(금액 미포함) 계약도 계속 서명된다(호환)', sig.completed === true);
    ok('구스킴 계약도 증거 대조는 통과로 본다', svc.evidencePackage(contractId).docHashVerified === true);
  }
}

console.log('\n===== 완료 통지 · 계약 취소 · 해시 금액 포함 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
