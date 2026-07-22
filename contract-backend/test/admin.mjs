// 관리자 설정 API 검증 — 인증 게이트·저장·마스킹·DB설정 반영·본인테스트 게이트.
import { createApp } from '../src/server.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

// ADMIN_TOKEN 을 이 프로세스에 설정(관리자 활성)
process.env.ADMIN_TOKEN = 'adm-secret';
delete process.env.ALIMTALK_LIVE; delete process.env.SOLAPI_API_KEY; // env 오염 제거

const { server } = createApp({});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

async function call(method, path, { json, token } = {}) {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token !== undefined ? { 'x-admin-token': token } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// 인증 게이트
ok('토큰 없이 status → 401', (await call('GET', '/admin/status')).status === 401);
ok('틀린 토큰 → 401', (await call('GET', '/admin/status', { token: 'nope' })).status === 401);
const st0 = await call('GET', '/admin/status', { token: 'adm-secret' });
ok('정상 토큰 → 200 + 필드', st0.status === 200 && Array.isArray(st0.data.fields));
ok('초기: 실제 발송 OFF', st0.data.live === false && st0.data.liveReady === false);

// 저장
const save = await call('POST', '/admin/settings', { token: 'adm-secret', json: { settings: {
  ALIMTALK_LIVE: '1', SOLAPI_API_KEY: 'KEY123', SOLAPI_API_SECRET: 'SECRET-abcd-9999',
  SOLAPI_PF_ID: 'PF1', SOLAPI_SENDER: '029302266', SOLAPI_TEMPLATE_SIGN: 'T-SIGN',
  BOGUS_KEY: 'x', // 허용되지 않은 키는 무시돼야 함
} } });
ok('설정 저장 성공', save.status === 200 && save.data.saved === 6);
ok('저장 후 liveReady=true', save.data.status.liveReady === true && save.data.status.live === true);

// 시크릿 마스킹: secret 필드는 원문 반환 금지, 끝 4자리만
const secretField = save.data.status.fields.find((f) => f.key === 'SOLAPI_API_SECRET');
ok('시크릿 원문 미노출(마스킹)', secretField.set === true && !/SECRET-abcd/.test(secretField.hint) && /9999$/.test(secretField.hint));
const keyField = save.data.status.fields.find((f) => f.key === 'SOLAPI_API_KEY');
ok('비시크릿은 값 노출(source=db)', keyField.hint === 'KEY123' && keyField.source === 'db');

// 어떤 응답에도 API secret 원문이 새지 않는지(전체 직렬화 스캔)
ok('전체 응답에 secret 원문 없음', !JSON.stringify(save.data).includes('SECRET-abcd-9999'));

// 본인테스트: 실 발송 켜졌지만 Solapi 실제 호출은 네트워크 → NOT_LIVE 아님, 발송 시도.
// (실제 네트워크로 나가지 않도록, 여기서는 NOT_LIVE 게이트만 확인: 설정 지우면 막혀야 함)
await call('POST', '/admin/settings', { token: 'adm-secret', json: { settings: { ALIMTALK_LIVE: '0' } } });
const t2 = await call('POST', '/admin/selftest', { token: 'adm-secret', json: { phone: '01012345678' } });
ok('실제 발송 OFF면 본인테스트 차단(NOT_LIVE)', t2.status === 400 && t2.data.error === 'NOT_LIVE');
const t3 = await call('POST', '/admin/selftest', { token: 'adm-secret', json: { phone: '123' } });
ok('잘못된 번호 거부', t3.status === 400 && t3.data.error === 'BAD_PHONE');

// 저장된 설정이 Provider 해석에 반영되는지(재조회)
const st1 = await call('GET', '/admin/status', { token: 'adm-secret' });
ok('ALIMTALK_LIVE=0 저장 반영', st1.data.live === false);

server.close();
delete process.env.ADMIN_TOKEN;
console.log('\n===== 관리자 설정 API 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
