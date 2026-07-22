// 운영 배포 엔트리포인트 — 데모 없음, 영속 DB, 시크릿 필수, 0.0.0.0 바인딩.
//   * NODE_ENV=production 을 강제(데모/기본 페퍼 fail-fast 발동).
//   * DB_PATH 로 영속 저장소(디스크/볼륨) 경로 지정. 미설정 시 ./data/contract.db.
//   * CONTRACT_PEPPER 필수, ADMIN_TOKEN 미설정 시 관리자 페이지 비활성(경고).
//   * 동적 import 로 NODE_ENV·시크릿 검증을 모듈 로드보다 먼저 수행(깔끔한 실패 메시지).
process.env.NODE_ENV = 'production';

if (!process.env.CONTRACT_PEPPER) {
  console.error('배포 중단 — 필수 환경변수 누락: CONTRACT_PEPPER (해시 페퍼)');
  console.error('  설정 예: openssl rand -hex 32 → 시크릿으로 주입. 자세한 건 DEPLOY.md 참고.');
  process.exit(1);
}

const { createApp } = await import('./server.mjs');

const dbPath = process.env.DB_PATH || './data/contract.db';
const port = Number(process.env.PORT) || 8787;

let app;
try {
  app = createApp({ dbPath, enableDemo: false, demoOtp: null });
} catch (e) {
  console.error('기동 실패:', e.message);
  process.exit(1);
}

app.server.listen(port, '0.0.0.0', () => {
  const live = app.providerLive();
  console.log(`[contract] 운영 서버 기동 :${port}  (알림톡 실제발송: ${live ? 'ON' : 'OFF(설정 대기)'})`);
  console.log(`[contract] DB: ${dbPath}`);
  console.log(`[contract] 관리자: ${process.env.ADMIN_TOKEN ? '활성(/admin)' : '비활성 — ADMIN_TOKEN 설정 필요'}`);
});

// 정상 종료(컨테이너 SIGTERM)에서 DB 닫기.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { try { app.db.close(); } catch {} app.server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000); });
}
