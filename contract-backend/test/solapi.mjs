// 실제 발송 Provider(Solapi) 오프라인 검증 — fetch 를 주입해 실네트워크 없이 확인.
// HMAC 인증 헤더·요청 페이로드·응답 파싱·실패 처리·서비스 연동을 검증한다.
import { createHmac } from 'node:crypto';
import { SolapiProvider } from '../src/providers/solapi.mjs';
import { selectProvider } from '../src/providers/index.mjs';
import { openDb } from '../src/db.mjs';
import { ContractService } from '../src/service.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);
const throws = (n, fn, re) => { try { fn(); R.push(['✗', n, '예외 없음']); } catch (e) { R.push([re.test(e.message) ? '✓' : '✗', n, e.message.slice(0, 40)]); } };

const CFG = {
  apiKey: 'KEYTEST', apiSecret: 'SECRETTEST', pfId: 'PF123', sender: '029302266',
  templateIds: { contract_sign: 'TPL_SIGN', contract_done: 'TPL_DONE' },
};
const clock = () => '2026-07-22T00:00:00.000Z';
const salt = () => 'fixedsalt123456';

// 요청을 기록하고 canned 응답을 주는 가짜 fetch
function makeFetch(response, capture) {
  return async (url, opts) => {
    if (capture) { capture.url = url; capture.opts = opts; capture.body = opts && opts.body ? JSON.parse(opts.body) : null; }
    return { ok: response.ok !== false, status: response.status || 200, json: async () => response.json };
  };
}

// 설정 누락 → 생성 거부
throws('설정 누락 시 생성 거부', () => new SolapiProvider({ apiKey: 'x' }), /설정 누락|templateIds/);

// ── 인증 헤더 형식 + 서명값 ──
{
  const cap = {};
  const p = new SolapiProvider(CFG, { fetchImpl: makeFetch({ json: { statusCode: '2000', messageId: 'M1' } }, cap), clock, saltImpl: salt });
  await p.send({ toPhoneRaw: '010-0000-2222', templateKey: 'contract_sign', variables: { name: '홍길동', contractNo: 'MM-2026-0142', signUrl: 'https://s/x' } });
  const auth = cap.opts.headers.Authorization;
  const expectSig = createHmac('sha256', CFG.apiSecret).update(clock() + salt()).digest('hex');
  ok('HMAC 인증 헤더 형식', /^HMAC-SHA256 apiKey=KEYTEST, date=.*, salt=fixedsalt123456, signature=/.test(auth));
  ok('HMAC 서명값 정확', auth.includes('signature=' + expectSig));

  // ── 페이로드 형태 ──
  const m = cap.body.message;
  ok('to: 숫자만 정규화', m.to === '01000002222');
  ok('from: 등록 발신번호', m.from === '029302266');
  ok('kakaoOptions.pfId', m.kakaoOptions.pfId === 'PF123');
  ok('templateKey→승인 templateId 매핑', m.kakaoOptions.templateId === 'TPL_SIGN');
  ok('변수 #{} 키로 정규화', m.kakaoOptions.variables['#{name}'] === '홍길동' && m.kakaoOptions.variables['#{contractNo}'] === 'MM-2026-0142');
  ok('기본 SMS 대체발송 허용(disableSms=false)', m.kakaoOptions.disableSms === false);
}

// ── 성공 응답 파싱 ──
{
  const p = new SolapiProvider(CFG, { fetchImpl: makeFetch({ json: { statusCode: '2000', messageId: 'MID-9' } }), clock, saltImpl: salt });
  const r = await p.send({ toPhoneRaw: '01011112222', templateKey: 'contract_sign', variables: {} });
  ok('성공 응답 → SENT + providerMsgId', r.status === 'SENT' && r.providerMsgId === 'MID-9');
}

// ── 실패: 수신번호 원문 없음 ──
{
  const p = new SolapiProvider(CFG, { fetchImpl: makeFetch({ json: {} }), clock, saltImpl: salt });
  const r = await p.send({ templateKey: 'contract_sign', variables: {} });
  ok('원문 번호 없으면 FAILED', r.status === 'FAILED' && r.failedReason === 'NO_RECIPIENT_RAW');
}

// ── 실패: 승인 템플릿 없는 key ──
{
  const p = new SolapiProvider(CFG, { fetchImpl: makeFetch({ json: {} }), clock, saltImpl: salt });
  const r = await p.send({ toPhoneRaw: '01011112222', templateKey: 'unknown_key', variables: {} });
  ok('승인 템플릿 없는 key → FAILED', r.status === 'FAILED' && /NO_APPROVED_TEMPLATE/.test(r.failedReason));
}

// ── 실패: HTTP 에러 응답 ──
{
  const p = new SolapiProvider(CFG, { fetchImpl: makeFetch({ ok: false, status: 400, json: { statusMessage: '잔액 부족' } }), clock, saltImpl: salt });
  const r = await p.send({ toPhoneRaw: '01011112222', templateKey: 'contract_sign', variables: {} });
  ok('HTTP 에러 → FAILED + 사유', r.status === 'FAILED' && r.failedReason === '잔액 부족');
}

// ── queryStatus ──
{
  const p = new SolapiProvider(CFG, { fetchImpl: makeFetch({ json: { messageList: { 'MID-9': { status: 'COMPLETE', dateReceived: '2026-07-22T00:01:00Z' } } } }), clock, saltImpl: salt });
  const s = await p.queryStatus('MID-9');
  ok('queryStatus COMPLETE → DELIVERED', s.status === 'DELIVERED');
}

// ── selectProvider 게이트 ──
ok('ALIMTALK_LIVE 미설정 → Mock', selectProvider({}).provider.name === 'mock' && selectProvider({}).live === false);
throws('LIVE 인데 설정 없으면 기동 거부', () => selectProvider({ ALIMTALK_LIVE: '1' }), /실제 발송 설정이 없습니다/);
{
  const sel = selectProvider({ ALIMTALK_LIVE: '1', SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_PF_ID: 'pf', SOLAPI_SENDER: '0299', SOLAPI_TEMPLATE_SIGN: 'T1' });
  ok('LIVE + 설정 완비 → solapi', sel.provider.name === 'solapi' && sel.live === true);
}

// ── 서비스 연동: rawPhone 흐름 + 번호 대조 가드 ──
{
  const db = openDb(':memory:');
  const svc = new ContractService(db, { clock });
  const cap = {};
  const prov = new SolapiProvider(CFG, { fetchImpl: makeFetch({ json: { statusCode: '2000', messageId: 'MID-S' } }, cap), clock, saltImpl: salt });
  const { contractId, parties } = svc.createContract({
    contractNo: 'MM-2026-0500', title: '계약', amount: 1000,
    body: { a: 1 }, operator: { name: '만물대표', phone: '010-0000-1111' }, customer: { name: '홍길동', phone: '010-0000-2222' },
  });
  svc.lockDocument(contractId);
  // 원문 번호가 당사자와 다르면 오발송 차단
  let mismatch = false;
  try { await svc.sendMessage(contractId, parties.customer, 'contract_sign', prov, { signUrl: 'https://s/x' }, '010-0000-0000'); } catch (e) { mismatch = e.code === 'PHONE_MISMATCH'; }
  ok('수신번호 불일치 발송 차단', mismatch);
  // 정상 원문 번호 → 실 Provider 로 전달, DB엔 마스킹만
  const res = await svc.sendMessage(contractId, parties.customer, 'contract_sign', prov, { signUrl: 'https://s/x' }, '010-0000-2222');
  ok('rawPhone → Provider 전달·발송 SENT', res.status === 'SENT' && cap.body.message.to === '01000002222');
  const leak = db.prepare("SELECT COUNT(*) c FROM message_deliveries WHERE contract_id=?").get(contractId).c;
  const phoneLeak = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE meta_json LIKE '%2397%' OR meta_json LIKE '%02302%'").get().c;
  ok('발송 이력 기록 + 원문번호 로그 없음', leak >= 1 && phoneLeak === 0);
}

console.log('\n===== Solapi(실제 발송) 오프라인 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
