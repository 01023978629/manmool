// 배포 전 설정 점검(preflight) — 사장님이 서버를 올리기 전에 무엇을 설정해야 하는지 검증·안내한다.
// 아무것도 발송·기동하지 않는다. process.env 만 읽어 '배포 준비 상태'를 보고한다(읽기전용).
// 실행: node bin/preflight.mjs   (또는  npm run preflight)

export function preflight(env = {}) {
  const has = (k) => typeof env[k] === 'string' && env[k].trim() !== '';
  const checks = [];
  const add = (key, ok, level, msg) => checks.push({ key, ok, level, msg });

  add('CONTRACT_PEPPER', has('CONTRACT_PEPPER'), 'required',
    has('CONTRACT_PEPPER') ? '해시 페퍼 설정됨' : '전화번호 해시용 비밀값. 32자 이상 랜덤 문자열 필요(운영 fail-fast).');
  add('ADMIN_TOKEN', has('ADMIN_TOKEN'), 'required',
    has('ADMIN_TOKEN') ? '관리자 토큰 설정됨' : '운영자 라우트(계약·대금·운영판단)·/admin 보호에 필요. 긴 랜덤 토큰 설정.');
  add('DB_PATH', has('DB_PATH'), 'recommended',
    has('DB_PATH') ? ('영속 저장소 ' + env.DB_PATH) : '미설정 시 재시작에 데이터 소실 위험. 볼륨 경로 지정(SQLite 1인스턴스 전제).');
  add('CORS_ORIGINS', has('CORS_ORIGINS'), 'recommended',
    has('CORS_ORIGINS') ? '교차출처 허용 설정됨' : '현장앱·홈페이지(github.io 등)에서 호출하면 허용 출처 지정.');

  // 실제 알림톡 발송(선택) — ALIMTALK_LIVE=1 이면 SOLAPI_* 모두 필요
  const solapiKeys = ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PF_ID', 'SOLAPI_SENDER', 'SOLAPI_TEMPLATE_SIGN'];
  const live = env.ALIMTALK_LIVE === '1';
  const solapiReady = solapiKeys.every(has);
  if (live) {
    add('ALIMTALK(실발송)', solapiReady, 'required-if-live',
      solapiReady ? '실발송 ON · SOLAPI 설정 완료' : ('실발송 ON인데 미설정: ' + solapiKeys.filter((k) => !has(k)).join(', ') + ' (카카오 템플릿 승인 후 채우기).'));
  } else {
    add('ALIMTALK(실발송)', true, 'optional', '실발송 OFF(Mock). 실제 고객 발송은 카카오 템플릿 승인 + ALIMTALK_LIVE=1 + SOLAPI_* 후.');
  }

  // 안전: 운영에서 고정 데모 OTP 금지
  const demoLeak = has('DEMO_OTP') && env.NODE_ENV === 'production';
  add('DEMO_OTP', !demoLeak, 'safety',
    demoLeak ? '운영에 DEMO_OTP 설정됨 — 제거 필요(고정 OTP 위험).' : '데모 OTP 없음(안전).');

  const requiredOk = checks.filter((c) => c.level === 'required').every((c) => c.ok);
  const ready = requiredOk && (!live || solapiReady) && !demoLeak;
  return {
    ready,
    live,
    checks,
    summary: ready
      ? '배포 준비 완료 — 필수 설정이 모두 채워졌습니다.'
      : '배포 전 필수/안전 항목을 채우세요(아래 ✗).',
  };
}

// CLI — 직접 실행 시에만 출력·종료코드
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = preflight(process.env);
  const icon = (c) => (c.ok ? '✓' : c.level === 'recommended' ? '·' : '✗');
  console.log('\n=== 전자계약 서버 배포 전 점검 ===');
  r.checks.forEach((c) => console.log(' ' + icon(c), c.key.padEnd(18), c.msg));
  console.log('\n' + (r.ready ? '✅ ' : '⚠️  ') + r.summary + '\n');
  process.exit(r.ready ? 0 : 1);
}
