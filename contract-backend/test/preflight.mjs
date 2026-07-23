// 배포 전 점검(preflight) 검증 — 순수 함수, 실행/발송 없음.
// 실행: node contract-backend/test/preflight.mjs
import { preflight } from '../bin/preflight.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);
const find = (r, k) => r.checks.find((c) => c.key === k);

// 1) 빈 환경 → 준비 안 됨(필수 미설정)
const empty = preflight({});
ok('빈 환경 미준비', empty.ready === false);
ok('CONTRACT_PEPPER 필수 실패', find(empty, 'CONTRACT_PEPPER').ok === false && find(empty, 'CONTRACT_PEPPER').level === 'required');
ok('ADMIN_TOKEN 필수 실패', find(empty, 'ADMIN_TOKEN').ok === false);

// 2) 필수만 채우면 준비 완료(권장 미설정은 차단 안 함)
const min = preflight({ CONTRACT_PEPPER: 'x'.repeat(40), ADMIN_TOKEN: 'y'.repeat(40) });
ok('필수 충족 → 준비 완료', min.ready === true);
ok('DB_PATH 권장(미차단)', find(min, 'DB_PATH').ok === false && find(min, 'DB_PATH').level === 'recommended');

// 3) 실발송 ON인데 SOLAPI 미설정 → 미준비
const liveBad = preflight({ CONTRACT_PEPPER: 'p', ADMIN_TOKEN: 't', ALIMTALK_LIVE: '1' });
ok('실발송 ON·키 미설정 → 미준비', liveBad.ready === false && liveBad.live === true);

// 4) 실발송 ON + SOLAPI 전부 → 준비
const liveOk = preflight({
  CONTRACT_PEPPER: 'p', ADMIN_TOKEN: 't', ALIMTALK_LIVE: '1',
  SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_PF_ID: 'pf', SOLAPI_SENDER: '01000000000', SOLAPI_TEMPLATE_SIGN: 'tpl',
});
ok('실발송 ON·키 완비 → 준비', liveOk.ready === true);

// 5) 운영에서 DEMO_OTP → 안전 실패로 미준비
const demoLeak = preflight({ CONTRACT_PEPPER: 'p', ADMIN_TOKEN: 't', DEMO_OTP: '246810', NODE_ENV: 'production' });
ok('운영 DEMO_OTP → 미준비(안전)', demoLeak.ready === false && find(demoLeak, 'DEMO_OTP').ok === false);
// 개발(비운영)에서 DEMO_OTP는 안전 위반 아님
const demoDev = preflight({ CONTRACT_PEPPER: 'p', ADMIN_TOKEN: 't', DEMO_OTP: '246810' });
ok('비운영 DEMO_OTP는 무해', demoDev.ready === true);

// 6) 비밀값이 출력 구조에 노출되지 않음(값이 아니라 상태만)
const secretDump = JSON.stringify(preflight({ CONTRACT_PEPPER: 'SUPERSECRETPEPPER', ADMIN_TOKEN: 'SUPERSECRETTOKEN' }));
ok('비밀값 원문 미노출', !secretDump.includes('SUPERSECRETPEPPER') && !secretDump.includes('SUPERSECRETTOKEN'));

console.log('\n===== 배포 전 점검(preflight) =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
