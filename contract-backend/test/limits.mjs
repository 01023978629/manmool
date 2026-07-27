// 요청 본문 상한·토큰 선검증·관리자 잠금 IP 판별 — 서버가 조용히 죽는 경로를 막는다.
// 실행: node contract-backend/test/limits.mjs   (실제 네트워크 없음)
//
// 고친 결함 세 가지가 여기서 지켜진다.
//  ① 상한이 바이트가 아니라 '글자 수'였다 — 한글은 UTF-8 3바이트/1글자라 5MB 상한을
//     14.7MB 가 통과했다(실측 RSS +72MB). 게다가 서명 라우트는 토큰 검증 '전에' 본문을
//     통째로 버퍼링해서, 무인증 대용량 요청만으로 메모리가 부풀었다.
//  ② 초과 시 소켓을 즉시 끊어 클라이언트가 413 대신 ECONNRESET 만 봤다(실측).
//  ③ 관리자 잠금이 X-Forwarded-For '맨 앞'(클라이언트가 위조 가능)을 IP 로 써서,
//     헤더만 바꾸면 백오프가 매번 초기화됐다.
import net from 'node:net';
import { createApp } from '../src/server.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

process.env.ADMIN_TOKEN = 'lim-admin';
const app = createApp({ demoOtp: '246810' });
await new Promise((r) => app.server.listen(0, r));
const port = app.server.address().port;
const base = `http://localhost:${port}`;

// ── ① 무효 토큰이면 본문을 다 받기 전에 응답한다 ─────────────────
// content-length 1MB 를 선언하고 10바이트만 보낸다. 본문을 기다리는 예전 코드라면 타임아웃.
{
  const r = await new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    let buf = '';
    const t0 = Date.now();
    const timer = setTimeout(() => { s.destroy(); resolve({ timedOut: true }); }, 3000);
    s.on('data', (d) => { buf += d; if (/\r\n\r\n/.test(buf) && /}/.test(buf)) { clearTimeout(timer); s.destroy(); resolve({ ms: Date.now() - t0, buf }); } });
    s.write('POST /api/sign/signature HTTP/1.1\r\nHost: x\r\nx-sign-token: bogus\r\ncontent-type: application/json\r\ncontent-length: 1000000\r\n\r\n{"imageBas');
  });
  ok('무효 토큰: 본문을 기다리지 않고 즉시 거부', !r.timedOut && /BAD_TOKEN/.test(r.buf || ''),
    r.timedOut ? '타임아웃(본문 대기 = 예전 동작)' : r.ms + 'ms');
}

// ── ② 초과 요청은 끊기지 않고 413 을 '받는다' ────────────────────
{
  const r = await fetch(base + '/api/sign/otp', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sign-token': 'bogus' },
    body: JSON.stringify({ phone: '0'.repeat(299980) }) })
    .then((res) => res.json().then((j) => ({ s: res.status, e: j.error })))
    .catch((e) => ({ s: 0, e: String(e.cause && e.cause.code || e.message) }));
  ok('작은 라우트 300KB → 413 수신(ECONNRESET 아님)', r.s === 413 && r.e === 'PAYLOAD_TOO_LARGE', `${r.s} ${r.e}`);
}

// ── ③ 상한은 글자 수가 아니라 바이트다 ───────────────────────────
{
  // 한글 25만 글자 = 750KB. 글자 수 상한(예전)이면 통과, 바이트 상한이면 413.
  const r = await fetch(base + '/api/sign/otp', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sign-token': 'bogus' },
    body: JSON.stringify({ x: '한'.repeat(250000) }) })
    .then((res) => res.json().then((j) => ({ s: res.status, e: j.error })))
    .catch((e) => ({ s: 0, e: String(e.message) }));
  ok('한글 750KB(25만 글자) → 413 (바이트 기준)', r.s === 413, `${r.s} ${r.e || ''}`);
}

// ── ④ 정상 서명(대용량 이미지)은 그대로 된다 — 회귀 방지 ─────────
{
  const ADMIN = { 'x-admin-token': 'lim-admin', 'content-type': 'application/json' };
  const qs = await (await fetch(base + '/api/contracts/quick-send', { method: 'POST', headers: ADMIN, body: JSON.stringify({
    title: '공사 도급계약서', amount: 1000000, body: { site: '대전', scope: ['도배'] },
    operator: { name: '대표', phone: '010-0000-1111' }, customer: { name: '가', phone: '010-0000-2222' } }) })).json();
  const H = { 'x-sign-token': qs.signPath.split('#t=')[1], 'content-type': 'application/json' };
  const call = (p, m = 'POST', j = {}) => fetch(base + p, { method: m, headers: H, body: m === 'GET' ? undefined : JSON.stringify(j) }).then((r) => r.json());
  await call('/api/sign', 'GET'); await call('/api/sign/otp'); await call('/api/sign/verify', 'POST', { code: '246810' });
  await call('/api/sign/viewed'); await call('/api/sign/consent', 'POST', { consents: [{ key: 'terms' }, { key: 'payment' }, { key: 'privacy' }, { key: 'esign' }] });
  const full = await call('/api/sign/full', 'GET');
  const sig = await call('/api/sign/signature', 'POST',
    { imageBase64: Buffer.alloc(600000, 7).toString('base64'), clientDocHash: full.docHash });
  ok('정상 서명(이미지 800KB)은 통과 — 서명 라우트는 5MB 상한', sig.completed === true, sig.error || '');
}

// ── ⑤ 관리자 잠금: XFF 맨 앞을 바꿔도 잠금이 풀리지 않는다 ────────
{
  // 오추측 8회 — 매번 XFF '맨 앞'을 다르게(위조), '마지막'은 프록시가 붙인 값으로 고정.
  // IP 판별이 맨 앞이면 매번 새 IP 로 보여 잠금(429)이 영영 안 걸린다.
  let saw429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await fetch(base + '/admin/status', { headers: {
      'x-admin-token': 'wrong-' + i,
      'x-forwarded-for': `10.0.${i}.${i}, 203.0.113.7`,
    } });
    if (r.status === 429) { saw429 = true; break; }
  }
  ok('XFF 맨 앞을 바꿔도 잠금이 걸린다(429)', saw429);
}
{
  // fly-client-ip 가 있으면 XFF 를 아예 무시한다
  let saw429 = false;
  for (let i = 0; i < 8; i++) {
    const r = await fetch(base + '/admin/status', { headers: {
      'x-admin-token': 'nope-' + i,
      'fly-client-ip': '198.51.100.9',
      'x-forwarded-for': `10.1.${i}.${i}`,
    } });
    if (r.status === 429) { saw429 = true; break; }
  }
  ok('fly-client-ip 기준으로도 잠금이 걸린다', saw429);
}

app.server.close();

console.log('\n===== 본문 상한·IP 판별 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
