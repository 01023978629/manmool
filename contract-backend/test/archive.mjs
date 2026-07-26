// 완료 계약서 보관·재열람·백업 — "반년 뒤 사본 요청"에 대응할 수 있는지.
// 실행: node contract-backend/test/archive.mjs   (실제 네트워크 없음)
//
// 고친 공백 세 가지가 여기서 지켜진다.
//  ① 고객 열람 링크가 15분 만료뿐이고 재발급 라우트가 없었다(issueViewLink 가 정의만 있고 미호출).
//     반년 뒤 고객이 사본을 요청하면 서버에 SSH 로 들어가 sqlite 를 직접 열어야 했다.
//  ② 증거 패키지에 해시만 있고 정작 '무엇에 서명했는지'(본문)와 서명 이미지가 빠져 있었다.
//  ③ 계약 데이터 백업 수단이 코드에 없었다 — 사본이 서버 볼륨 하나뿐.
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.mjs';
import { openDb } from '../src/db.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

process.env.ADMIN_TOKEN = 'arc-admin';
const ADMIN = { 'x-admin-token': 'arc-admin', 'content-type': 'application/json' };

const app = createApp({ demoOtp: '246810' });
await new Promise((r) => app.server.listen(0, r));
const base = `http://localhost:${app.server.address().port}`;
const call = async (method, path, { json, token, admin } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-sign-token': token } : {}), ...(admin ? ADMIN : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

// ── 준비: 계약 하나를 끝까지 체결한다 ─────────────────────────────
const qs = await call('POST', '/api/contracts/quick-send', { admin: true, json: {
  title: '공사 도급계약서', amount: 3300000,
  body: { site: '대전 석교동', scope: ['도배'] },
  operator: { name: '만물대표', phone: '010-0000-1111' },
  customer: { name: '홍길동', phone: '010-0000-2222' },
} });
const cid = qs.data.contractId;
const signTok = qs.data.signPath.split('#t=')[1];
await call('GET', '/api/sign', { token: signTok });
await call('POST', '/api/sign/otp', { token: signTok });
await call('POST', '/api/sign/verify', { token: signTok, json: { code: '246810' } });
await call('POST', '/api/sign/viewed', { token: signTok });
await call('POST', '/api/sign/consent', { token: signTok, json: { consents: [
  { key: 'terms' }, { key: 'payment' }, { key: 'privacy' }, { key: 'esign' },
] } });
const lock = await call('GET', '/api/sign/full', { token: signTok });
const sig = await call('POST', '/api/sign/signature', { token: signTok,
  json: { imageBase64: Buffer.from('PNG_SIGNATURE_BYTES').toString('base64'), clientDocHash: lock.data.docHash } });
ok('준비: 계약 체결 완료', sig.status === 200 && sig.data.completed === true,
  `${sig.status} ${sig.data.error || ''}`);

// ── ① 운영자용 완료본 사본 ───────────────────────────────────────
{
  const r = await call('GET', `/api/contracts/${cid}/completed`, { admin: true });
  ok('운영자가 토큰 없이 완료본을 꺼낼 수 있다', r.status === 200, String(r.status));
  ok('완료본에 계약 조항이 들어 있다', Array.isArray(r.data.body && r.data.body.clauses) && r.data.body.clauses.length === 12,
    String(r.data.body && r.data.body.clauses && r.data.body.clauses.length));
  ok('완료본에 서명 이미지가 들어 있다', /^data:image\/png;base64,/.test(r.data.signatureImage || ''));
  ok('완료본 해시가 계약 해시와 일치', r.data.docHash === lock.data.docHash);
  ok('무인증 거부(401)', (await call('GET', `/api/contracts/${cid}/completed`)).status === 401);
}

// ── ② 고객 열람 링크 재발급 ──────────────────────────────────────
{
  const r = await call('POST', `/api/contracts/${cid}/view-link`, { admin: true });
  ok('열람 링크 재발급 성공', r.status === 200 && /^\/sign#v=/.test(r.data.viewPath || ''),
    JSON.stringify(r.data).slice(0, 60));
  const vt = r.data.viewPath.split('#v=')[1];
  const doc = await call('GET', '/api/sign/completed', { token: vt });
  ok('재발급 링크로 고객이 완료본을 본다', doc.status === 200 && doc.data.contractNo === qs.data.contractNo,
    `${doc.status} ${doc.data.contractNo || doc.data.error || ''}`);
  ok('무인증 재발급 거부(401)', (await call('POST', `/api/contracts/${cid}/view-link`)).status === 401);

  // 서명 화면이 #v= 링크를 실제로 처리하는지(정적 확인 — 열람 모드 진입 코드가 서빙본에 있어야 한다)
  const html = await (await fetch(base + '/sign')).text();
  ok('서명 화면에 #v= 열람 모드 진입 코드가 있다', /VIEWTOKEN/.test(html) && /enterViewMode/.test(html));
}

// ── ③ 미완료 계약에는 열람 링크가 안 나간다 ──────────────────────
{
  const draft = await call('POST', '/api/contracts', { admin: true, json: {
    contractNo: 'ARC-DRAFT-1', title: '미완료', amount: 1000,
    body: { clauses: ['제1조'], customerName: '가', payment: { down: 1000 } },
    operator: { name: '대표', phone: '010-0000-1111' }, customer: { name: '가', phone: '010-0000-3333' },
  } });
  const r = await call('POST', `/api/contracts/${draft.data.contractId}/view-link`, { admin: true });
  ok('미완료 계약 열람 링크 거부(NOT_COMPLETED)', r.status === 400 && r.data.error === 'NOT_COMPLETED',
    `${r.status} ${r.data.error || ''}`);
}

// ── ④ 증거 패키지가 자체 완결적이다 ──────────────────────────────
{
  const r = await call('GET', `/api/contracts/${cid}/evidence`, { admin: true });
  ok('증거 패키지에 계약 본문(조항)이 들어 있다',
    Array.isArray(r.data.body && r.data.body.clauses) && r.data.body.clauses.length === 12);
  ok('증거 패키지에 서명 이미지가 들어 있다',
    (r.data.signatures || []).some((s) => /^data:image\/png;base64,/.test(s.signatureImage || '')));
  ok('봉인 해시 유지', /^[0-9a-f]{64}$/.test(r.data.packageHash || ''));
}

// ── ⑤ 계약 데이터 백업 — 내려받은 파일이 진짜 열리는 DB 인가 ─────
{
  const res = await fetch(base + '/admin/backup', { headers: { 'x-admin-token': 'arc-admin' } });
  const buf = Buffer.from(await res.arrayBuffer());
  ok('백업 다운로드 성공', res.status === 200 && buf.length > 0, `${res.status} · ${buf.length}B`);
  ok('파일명에 날짜가 들어 있다', /manmool-contracts-\d{8}\.db/.test(res.headers.get('content-disposition') || ''),
    res.headers.get('content-disposition') || '');
  ok('SQLite 파일 시그니처', buf.slice(0, 15).toString() === 'SQLite format 3');
  // 복원 가능성: 내려받은 파일을 실제로 열어 계약이 그대로 있는지 센다
  const tmp = join(tmpdir(), `arc-restore-${Date.now()}.db`);
  writeFileSync(tmp, buf);
  try {
    const restored = openDb(tmp);
    const n = restored.prepare('SELECT COUNT(*) c FROM contracts').get().c;
    const found = restored.prepare('SELECT contract_no FROM contracts WHERE id=?').get(cid);
    ok('백업을 열어 계약을 복원할 수 있다', n >= 2 && found && found.contract_no === qs.data.contractNo,
      `계약 ${n}건 · ${found && found.contract_no}`);
    const sigRow = restored.prepare('SELECT image_data FROM signatures WHERE contract_id=?').get(cid);
    ok('백업에 서명 이미지까지 들어 있다', !!(sigRow && sigRow.image_data));
  } finally { try { unlinkSync(tmp); } catch {} }
  ok('무인증 백업 거부(401)', (await fetch(base + '/admin/backup')).status === 401);
}

app.server.close();

console.log('\n===== 완료본 보관·재열람·백업 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
