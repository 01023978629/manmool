#!/usr/bin/env node
// 본인번호 알림톡 발송 테스트 — 실제 고객이 아니라 "사장님 본인 번호"로만 쓰세요.
// 사용: ALIMTALK_LIVE=1 (+ SOLAPI_* 환경변수) 설정 후
//       node bin/selftest-send.mjs 01012345678
//
// 안전장치:
//   * ALIMTALK_LIVE=1 + 실 Provider 설정이 없으면 실행 거부(Mock 로는 실제 발송이 안 되니 혼동 방지).
//   * 서명 링크 버튼이 실제로 열리려면 BASE_URL(공개 서버 주소)이 필요.
import { openDb } from '../src/db.mjs';
import { ContractService } from '../src/service.mjs';
import { selectProvider } from '../src/providers/index.mjs';

const phone = (process.argv[2] || '').replace(/\D/g, '');
if (!/^01[016789]\d{7,8}$/.test(phone)) {
  console.error('사용법: node bin/selftest-send.mjs 01012345678  (사장님 본인 휴대폰 번호)');
  process.exit(1);
}

let sel;
try { sel = selectProvider(); } catch (e) { console.error('설정 오류:', e.message); process.exit(1); }
if (!sel.live) {
  console.error('실제 발송이 꺼져 있습니다. SETUP-ALIMTALK.md 6번대로 ALIMTALK_LIVE=1 + SOLAPI_* 를 설정하세요.');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL || '';
if (!BASE_URL) console.warn('※ BASE_URL 미설정 — 알림톡 버튼 링크가 열리지 않을 수 있습니다(공개 서버 주소를 BASE_URL 로 지정).');

const db = openDb(':memory:'); // 테스트용 임시 DB
const svc = new ContractService(db, {});

const { contractId, parties } = svc.createContract({
  contractNo: `TEST-${new Date().toISOString().slice(0, 10)}`,
  title: '전자계약 발송 테스트', amount: 0,
  body: { note: '본인번호 발송 테스트용 계약(법적 효력 없음)', clauses: [] },
  operator: { name: '전병덕', phone: '010-5439-8629' },
  customer: { name: '테스트', phone: phone },
});
svc.lockDocument(contractId);
const { token } = svc.issueSignLink(contractId, parties.customer, 'sign');
const signUrl = BASE_URL ? `${BASE_URL.replace(/\/$/, '')}/sign#t=${token}` : `(_BASE_URL_미설정_)/sign#t=${token}`;

console.log(`\n[${sel.provider.name}] 실제 알림톡을 아래 번호로 발송합니다: ${phone.slice(0, 3)}-****-${phone.slice(-4)}`);
const res = await svc.sendMessage(contractId, parties.customer, 'contract_sign', sel.provider, {
  site: '테스트 현장', amount: '0', signUrl,
}, phone);

if (res.status === 'SENT') {
  console.log('✓ 발송 접수됨(providerMsgId:', res.providerMsgId, ')');
  console.log('  카카오톡 도착 + 버튼→서명화면이 열리면 정상입니다.');
} else {
  console.error('✗ 발송 실패:', res.reason);
  console.error('  사유 코드로 SETUP-ALIMTALK.md "자주 막히는 곳" 확인.');
  process.exit(1);
}
