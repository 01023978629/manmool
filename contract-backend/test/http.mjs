// HTTP 계층 스모크 테스트 — 서버를 실제 기동해 전 플로우를 호출한다.
import { createApp } from '../src/server.mjs';

process.env.ADMIN_TOKEN = 'http-admin'; // 운영자 라우트는 관리자 토큰 필요
process.env.CORS_ORIGINS = 'https://app.example';
const { server } = createApp({ demoOtp: '246810' });
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;
const ADMIN = { 'x-admin-token': 'http-admin' };

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);
// admin:true → 운영자 라우트(관리자 토큰), token → 고객 서명 토큰(x-sign-token)
async function call(method, path, { json, token, admin } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-sign-token': token } : {}), ...(admin ? ADMIN : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

// 운영자 라우트는 관리자 토큰 없으면 거부
const noAuth = await call('POST', '/api/contracts', { json: {} });
ok('운영자 라우트 무인증 거부(401)', noAuth.status === 401);

// 계약 생성 → 잠금 → 링크 → 발송 (관리자 토큰)
const c = await call('POST', '/api/contracts', { admin: true, json: {
  contractNo: 'MM-2026-0199', title: '실내건축 공사 계약', amount: 33000000,
  body: { site: '대전 탄방동 26평', scope: ['도배', '장판'], amount: 33000000 },
  operator: { name: '전병덕', phone: '010-5439-8629' },
  customer: { name: '박고객', phone: '010-1234-5678' },
} });
ok('POST /contracts', c.status === 200 && !!c.data.contractId);
const cid = c.data.contractId, pid = c.data.parties.customer;

const lock = await call('POST', `/api/contracts/${cid}/lock`, { admin: true });
ok('POST /lock', lock.status === 200 && /^[0-9a-f]{64}$/.test(lock.data.docHash));

const link = await call('POST', `/api/contracts/${cid}/parties/${pid}/sign-link`, { admin: true });
ok('POST /sign-link', link.status === 200 && !!link.data.token);
const token = link.data.token;

const send = await call('POST', `/api/contracts/${cid}/parties/${pid}/send`, { admin: true, json: { templateKey: 'contract_sign', variables: { signUrl: 'https://sign.example/#t=redacted' } } });
ok('POST /send (Mock)', send.status === 200 && send.data.status === 'SENT');
const refresh = await call('POST', `/api/deliveries/${send.data.deliveryId}/refresh`, { admin: true });
ok('POST /refresh → DELIVERED', refresh.data.status === 'DELIVERED');

// 고객 측: 토큰은 헤더로만
const open = await call('GET', '/api/sign', { token });
ok('GET /sign 본인확인 요구', open.data.needIdentityVerification === true);

const noVerify = await call('POST', '/api/sign/signature', { token, json: { imageBase64: Buffer.from('x').toString('base64') } });
ok('본인확인 전 서명 거부(400)', noVerify.status === 400 && noVerify.data.error === 'NOT_VERIFIED');

await call('POST', '/api/sign/otp', { token });
const badOtp = await call('POST', '/api/sign/verify', { token, json: { code: '000000' } });
ok('OTP 오입력 거부(400)', badOtp.status === 400);
const verify = await call('POST', '/api/sign/verify', { token, json: { code: '246810' } });
ok('본인확인 성공', verify.data.verified === true);

await call('POST', '/api/sign/viewed', { token });
await call('POST', '/api/sign/consent', { token, json: { consents: [
  { key: 'terms', text: '계약 전체 동의' }, { key: 'payment', text: '대금 동의' }, { key: 'privacy', text: '개인정보 동의' }, { key: 'esign', text: '전자서명 효력 동의' },
] } });
// 빈 서명 거부
const empty = await call('POST', '/api/sign/signature', { token, json: { imageBase64: '' } });
ok('빈 서명 거부(400)', empty.status === 400 && empty.data.error === 'EMPTY_SIGNATURE');
const sign = await call('POST', '/api/sign/signature', { token, json: { imageBase64: Buffer.from('PNG_SIGNATURE').toString('base64') } });
ok('서명 제출 → 완료', sign.status === 200 && sign.data.completed === true);

const reuse = await call('POST', '/api/sign/signature', { token, json: { imageBase64: 'AA==' } });
ok('토큰 재사용 거부(400)', reuse.status === 400 && reuse.data.error === 'USED');

const ev = await call('GET', `/api/contracts/${cid}/evidence`, { admin: true });
ok('GET /evidence 봉인 해시', ev.status === 200 && /^[0-9a-f]{64}$/.test(ev.data.packageHash));

// 원클릭 발송(현장 앱용): 생성→잠금→링크→발송 한 번에
const qs = await call('POST', '/api/contracts/quick-send', { admin: true, json: {
  title: '공사 도급계약서', amount: 41310000,
  body: { site: '대전 갈마동 34평', scope: ['철거', '욕실'], amount: 41310000 },
  operator: { name: '전병덕', phone: '010-5439-8629' },
  customer: { name: '김대전', phone: '010-2397-8629' },
  baseUrl: 'https://contract.example',
} });
ok('POST /quick-send → 발송+서명링크', qs.status === 200 && qs.data.delivery.status === 'SENT' && /^\/sign#t=/.test(qs.data.signPath));
ok('quick-send 무인증 거부', (await call('POST', '/api/contracts/quick-send', { json: {} })).status === 401);

// 대금(청구·입금·미수) HTTP 경로
const pseed = await call('POST', `/api/contracts/${cid}/payments/seed`, { admin: true, json: { installments: [
  { stage: 'down', label: '계약금', amount: 3300000 }, { stage: 'mid', label: '중도금', amount: 13200000 }, { stage: 'bal', label: '잔금', amount: 16500000 },
] } });
ok('POST /payments/seed → 3건', pseed.status === 200 && pseed.data.count === 3);
const pinv = await call('POST', `/api/contracts/${cid}/payments/down/invoice`, { admin: true, json: { rawPhone: '010-1234-5678', payInfo: '농협 123' } });
ok('POST /payments/down/invoice → 발송', pinv.status === 200 && pinv.data.delivery.status === 'SENT' && pinv.data.action === 'INVOICED');
const ppaid = await call('POST', `/api/contracts/${cid}/payments/down/paid`, { admin: true });
ok('POST /payments/down/paid → PAID', ppaid.data.status === 'PAID');
const recv = await call('GET', '/api/receivables', { admin: true });
ok('GET /receivables (미수 mid·bal)', recv.status === 200 && recv.data.count >= 2 && recv.data.total >= 13200000 + 16500000);
ok('receivables 무인증 거부', (await call('GET', '/api/receivables')).status === 401);

// 계약 목록(운영자 대시보드)
const clist = await call('GET', '/api/contracts', { admin: true });
ok('GET /api/contracts 목록 + 대금 요약', clist.status === 200 && Array.isArray(clist.data.contracts) && clist.data.contracts.some((c) => c.payment && typeof c.payment.receivable === 'number'));
ok('계약 목록 무인증 거부', (await call('GET', '/api/contracts')).status === 401);
ok('계약 목록 전화 마스킹', clist.data.contracts.every((c) => !/\d{4}-\d{4}/.test(c.customerPhone || '')));

// CORS: 허용 출처의 프리플라이트(OPTIONS) → 204 + 헤더
const pre = await fetch(base + '/api/contracts/quick-send', { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-admin-token' } });
ok('CORS 프리플라이트(허용 출처) 204', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://app.example' && /x-admin-token/.test(pre.headers.get('access-control-allow-headers') || ''));
// 미허용 출처 → CORS 헤더 없음
const pre2 = await fetch(base + '/api/contracts/quick-send', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
ok('CORS 미허용 출처 차단', !pre2.headers.get('access-control-allow-origin'));

console.log('\n===== HTTP 스모크 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
server.close();
process.exit(fails ? 1 : 0);
