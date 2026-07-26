// 계약번호 채번 — 재시작·동일자 반복·중복 지정 검증.
// 실행: node contract-backend/test/contract-no.mjs   (실제 네트워크 없음)
//
// 고친 결함 세 가지가 여기서 지켜진다.
//  ① 계약번호가 프로세스 메모리 카운터(let _qsSeq=0)였다. 배포·재시작하면 0으로 돌아가
//     그날 이미 보낸 건수만큼 UNIQUE 충돌 → 원인 불명 500. 앱은 "전송 실패 (서버 오류 500)"만 띄웠다.
//  ② 본인번호 테스트 발송의 계약번호가 TEST-<날짜> 로 하루 내내 고정이라
//     같은 날 두 번째 테스트는 100% 실패했다 — 알림톡 설정 작업을 정확히 막는다.
//  ③ 테스트 계약의 본문이 비어 있어(clauses:[]) 빈 계약서 잠금 차단(INCOMPLETE_BODY)에 걸렸다
//     — 잠금 검증을 넣으면서 생긴 회귀. 기존 테스트는 NOT_LIVE 게이트만 봐서 못 잡았다.
import { unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from '../src/server.mjs';
import { MockKakaoMessageProvider } from '../src/providers/kakao.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

process.env.ADMIN_TOKEN = 'cno-admin';
const ADMIN = { 'x-admin-token': 'cno-admin', 'content-type': 'application/json' };

// 이름이 'mock' 이면 본인번호 테스트가 NOT_LIVE 로 거부되므로, 실 Provider 흉내를 낸다.
function liveProvider() {
  const p = new MockKakaoMessageProvider({ deliverAfterMs: 0 });
  Object.defineProperty(p, 'name', { get: () => 'solapi-test' });
  return p;
}

const DBFILE = '/tmp/claude-0/-home-user-manmool/3e6a1eae-5aca-5ac6-8b83-9fb62257cdd5/scratchpad/contract-no-test.db';
try { unlinkSync(DBFILE); } catch {}

async function boot(dbPath) {
  const app = createApp({ dbPath, provider: liveProvider(), injectedLive: true });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  const post = async (path, json) => {
    const res = await fetch(base + path, { method: 'POST', headers: ADMIN, body: JSON.stringify(json) });
    return { status: res.status, data: await res.json() };
  };
  return { app, post };
}

const QS = (name) => ({
  title: '공사 도급계약서', amount: 3300000,
  body: { site: '대전 ' + name, scope: ['도배'] },
  operator: { name: '만물대표', phone: '010-0000-1111' },
  customer: { name, phone: '010-0000-2222' },
});
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ── ① 재시작해도 계약번호가 이어진다 ──────────────────────────────
{
  const A = await boot(DBFILE);
  // 5건을 쌓는다 — 재시작 채번 결함은 '그날 이미 보낸 건수'만큼 충돌하므로,
  // 우발적 재시도(최대 3회)로는 절대 구제될 수 없는 개수여야 한다.
  // (2건만 쌓으면 메모리 카운터 + 재시도 조합이 우연히 통과한다 — 실제로 그렇게 새는 걸 확인했다)
  const first = [];
  for (const nm of ['갑', '을', '병', '정', '무']) first.push(await A.post('/api/contracts/quick-send', QS(nm)));
  ok('발송 5건 성공', first.every((r) => r.status === 200),
    first.map((r) => r.status).join('/'));
  ok('오늘 날짜로 001~005 채번', first.map((r) => r.data.contractNo).join(',') ===
    [1, 2, 3, 4, 5].map((n) => `MM-${today}-00${n}`).join(','),
    first.map((r) => r.data.contractNo).join(' · '));
  A.app.server.close();

  // 재시작: 반드시 '진짜 별도 OS 프로세스'로 띄운다.
  // 같은 테스트 프로세스에서 createApp 을 다시 불러서는 이 결함을 못 잡는다 —
  // 예전 카운터가 모듈 스코프(let _qsSeq)라 프로세스 안에서는 유지되기 때문이다.
  // 실제로 그렇게 되돌려 확인했더니 같은-프로세스 재부팅 테스트는 통과해 버렸다(가짜 통과).
  const childSrc = `
    import { createApp } from ${JSON.stringify(join(__dir, '..', 'src', 'server.mjs'))};
    import { MockKakaoMessageProvider } from ${JSON.stringify(join(__dir, '..', 'src', 'providers', 'kakao.mjs'))};
    const p = new MockKakaoMessageProvider({ deliverAfterMs: 0 });
    const app = createApp({ dbPath: ${JSON.stringify(DBFILE)}, provider: p, injectedLive: true });
    await new Promise((r) => app.server.listen(0, r));
    const res = await fetch('http://localhost:' + app.server.address().port + '/api/contracts/quick-send', {
      method: 'POST', headers: { 'x-admin-token': 'cno-admin', 'content-type': 'application/json' },
      body: JSON.stringify(${JSON.stringify(QS('재시작'))}),
    });
    const d = await res.json();
    console.log(JSON.stringify({ status: res.status, contractNo: d.contractNo || null, error: d.error || null }));
    app.server.close();
  `;
  let child;
  try {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', childSrc],
      { env: Object.assign({}, process.env, { ADMIN_TOKEN: 'cno-admin' }), encoding: 'utf8', timeout: 30000 });
    child = JSON.parse(out.trim().split('\n').pop());
  } catch (e) {
    child = { status: 0, error: String(e.stdout || e.message).slice(0, 120) };
  }
  ok('진짜 재시작(별도 프로세스) 후에도 발송 성공(500 없음)', child.status === 200, JSON.stringify(child));
  ok('번호가 006 으로 이어진다', child.contractNo === `MM-${today}-006`, String(child.contractNo));

  // 두 인스턴스가 같은 DB 를 쓸 때(배포 겹침) 서로 다른 번호를 받는다
  const B = await boot(DBFILE);
  const C = await boot(DBFILE);
  const r4 = await B.post('/api/contracts/quick-send', QS('정'));
  const r5 = await C.post('/api/contracts/quick-send', QS('무'));
  const nos = [r4.data.contractNo, r5.data.contractNo];
  ok('인스턴스 2개 병행 발송도 전부 성공', r4.status === 200 && r5.status === 200, nos.join(' · '));
  ok('번호가 겹치지 않는다', nos[0] !== nos[1] && !nos.includes(child.contractNo), nos.join(' · '));
  B.app.server.close(); C.app.server.close();
}

// ── ② 같은 프로세스 연속 발송: 번호 유일성 ───────────────────────
{
  const { app, post } = await boot(':memory:');
  const rs = [];
  for (let i = 0; i < 20; i++) rs.push(await post('/api/contracts/quick-send', QS('연속' + i)));
  const okAll = rs.every((r) => r.status === 200);
  const nos = rs.map((r) => r.data.contractNo);
  ok('연속 20건 전부 성공', okAll, rs.filter(r => r.status !== 200).map(r => r.data.error).join(','));
  ok('계약번호 20개 전부 유일', new Set(nos).size === 20, `유일 ${new Set(nos).size}/20`);
  app.server.close();
}

// ── ③ 본인번호 테스트: 같은 날 여러 번 + 빈 본문 회귀 ────────────
{
  const { app, post } = await boot(':memory:');
  const t1 = await post('/admin/selftest', { phone: '010-2397-8629' });
  ok('테스트 발송 1회차 성공(INCOMPLETE_BODY 회귀 없음)', t1.status === 200 && t1.data.status === 'SENT',
    `${t1.status} ${t1.data.error || t1.data.status}`);
  const t2 = await post('/admin/selftest', { phone: '010-2397-8629' });
  ok('같은 날 2회차도 성공(TEST- 번호 고정 아님)', t2.status === 200 && t2.data.status === 'SENT',
    `${t2.status} ${t2.data.error || t2.data.status}`);
  const t3 = await post('/admin/selftest', { phone: '010-2397-8629' });
  ok('같은 날 3회차도 성공', t3.status === 200, `${t3.status}`);
  app.server.close();
}

// ── ④ 번호를 직접 지정해 중복이면: 500 이 아니라 읽을 수 있는 400 ──
{
  const { app, post } = await boot(':memory:');
  const j = Object.assign({}, QS('직접'), { contractNo: 'MM-CUSTOM-1' });
  const a = await post('/api/contracts/quick-send', j);
  const b = await post('/api/contracts/quick-send', j);
  ok('직접 지정 1회차 성공', a.status === 200, String(a.status));
  ok('중복 지정은 400 + DUP_CONTRACT_NO', b.status === 400 && b.data.error === 'DUP_CONTRACT_NO',
    `${b.status} ${b.data.error || ''}`);
  ok('오류 문구에 계약번호가 들어 있다(사람이 읽고 조치 가능)', /MM-CUSTOM-1/.test(b.data.message || ''),
    (b.data.message || '').slice(0, 60));
  app.server.close();
}

try { unlinkSync(DBFILE); } catch {}

console.log('\n===== 계약번호 채번 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
