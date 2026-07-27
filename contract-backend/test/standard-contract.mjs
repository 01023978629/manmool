// 표준 도급계약 조항·지급조건 검증 — 사장님(전병덕)이 확정한 조건이 그대로 반영되는지.
// 실행: node contract-backend/test/standard-contract.mjs
import { createApp } from '../src/server.mjs';
import { buildStandardBody, validateBody, splitPayment, PAYMENT_RATIO, WARRANTY_LABEL } from '../src/standard-contract.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

// ── 지급 비율: 계약금 50 / 중도금 40 / 잔금 10 ──────────────
ok('지급 비율 50/40/10', PAYMENT_RATIO.down === 0.5 && PAYMENT_RATIO.mid === 0.4 && PAYMENT_RATIO.bal === 0.1);
{
  const p = splitPayment(41310000);
  ok('계약금 50%', p.down === 20655000, String(p.down));
  ok('중도금 40%', p.mid === 16524000, String(p.mid));
  ok('잔금 10%', p.bal === 4131000, String(p.bal));
  ok('합계가 계약금액과 정확히 일치', p.down + p.mid + p.bal === 41310000);
}
{
  // 반올림이 생기는 금액에서도 합계가 어긋나면 안 된다(잔금이 나머지를 흡수)
  const odd = 10000001;
  const p = splitPayment(odd);
  ok('반올림 금액도 합계 일치', p.down + p.mid + p.bal === odd, `${p.down}+${p.mid}+${p.bal}`);
}

// ── 본문 내용 ────────────────────────────────────────────
const body = buildStandardBody({
  site: '대전 중구 석교동 ○○아파트 101동 101호', scope: ['철거', '욕실', '도배'],
  amount: 41310000, customerName: '홍길동', period: '2026-08-04 ~ 2026-09-05',
});
const text = body.clauses.map((c) => c.title + ' ' + c.text).join('\n');

ok('조항 12개', body.clauses.length === 12, String(body.clauses.length));
ok('모든 조항에 번호·제목·본문', body.clauses.every((c) => c.no && c.title && c.text.trim()));
ok('하자보증 방수 2년 · 일반 1년', WARRANTY_LABEL.includes('방수') && /방수 관련 공사는 2년/.test(text) && /일반공사는 1년/.test(text));
ok('계약금은 자재 구매 자금임을 명시', /자재를 구매하기 위한 대금/.test(text));
ok('잔금은 하자 마무리 확인 후', /준공 및 하자 마무리 확인 후/.test(text));
ok('추가공사는 별도 계약서 작성 후 시공', /별도의 추가공사 계약서를 작성한 후 시공/.test(text));
ok('서비스 작업은 하자보증 제외', /서비스로 시공한 작업은[^]*하자보증 대상에서 제외/.test(text));
ok('공정 동의 대기 3일', /3일 이내에 동의 여부를 회신/.test(text));
ok('무회신 시 유선 재확인 절차', /유선으로 연락하여 동의 여부를 다시 확인/.test(text));
ok('사진 전송 후 이의 없으면 동의 간주', /작업 사진을 갑에게 전송하고[^]*이의를 제기하지 아니하면/.test(text));
ok('통지 기록 보관 의무', /통지·연락·사진 전송 기록을 보관/.test(text));
ok('갑 이의 시 즉시 중단', /즉시 중단하고 갑과 협의/.test(text));
ok('잔금 유보는 하자 관련에 한정', /하자보수가 완료되지 아니한 경우에 한하여/.test(text));
ok('그 밖의 지연은 법정이율', /법정이율에 따른 지연이자/.test(text));
ok('법률 자문 아님 고지', /법률 자문이 아닙니다/.test(body.note));

// 포괄 면책·일방 유리 문구가 섞이지 않았는지(계약서 안전수칙)
ok('포괄 면책 문구 없음', !/어떠한 경우에도 책임지지 (아니한다|않는다)/.test(text));

// 부가세 표기: 포함/별도 둘 다 지원해야 한다(개인 고객은 부가세 미포함으로 진행하는 경우가 있음)
{
  const inc = buildStandardBody({ amount: 11000000, customerName: '가', vatIncluded: true });
  const exc = buildStandardBody({ amount: 10000000, customerName: '가', vatIncluded: false });
  ok('부가세 포함 표기', /\(부가세 포함\)/.test(inc.clauses[1].text));
  ok('부가세 별도 표기', /\(부가세 별도\)/.test(exc.clauses[1].text));
}

// ── 잠그기 전 검증 ───────────────────────────────────────
ok('완성된 본문은 통과', validateBody(body, 41310000).length === 0);
ok('조항 없으면 거부', validateBody({ customerName: '가', payment: { down: 1 } }, 1).some((m) => /조항/.test(m)));
ok('고객명 없으면 거부', validateBody(Object.assign({}, body, { customerName: '' }), 41310000).some((m) => /성명/.test(m)));
ok('지급조건 0원이면 거부', validateBody(Object.assign({}, body, { payment: {} }), 41310000).some((m) => /지급 조건/.test(m)));
ok('지급조건 합계가 계약금액과 다르면 거부',
  validateBody(Object.assign({}, body, { payment: { down: 1, mid: 1, bal: 1 } }), 41310000).some((m) => /합계/.test(m)));
ok('문자열 조항도 인정(구 본문 호환)', validateBody({ clauses: ['제1조 …'], customerName: '가', payment: { down: 100 } }, 100).length === 0);
ok('빈 문자열 조항은 거부', validateBody({ clauses: ['  '], customerName: '가', payment: { down: 100 } }, 100).some((m) => /빈 조항/.test(m)));

// ── 서버 경로: 앱이 본문 없이 보내도 서버가 표준안을 채운다 ──
{
  process.env.ADMIN_TOKEN = 'std-admin';
  const app = createApp({ demoOtp: '135790' });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://localhost:${app.server.address().port}`;
  const post = async (p, json) => {
    const res = await fetch(base + p, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': 'std-admin' },
      body: JSON.stringify(json) });
    return { status: res.status, data: await res.json() };
  };

  // 현장 앱이 실제로 보내는 형태 — body 에 조항·지급조건·고객명이 없다
  const qs = await post('/api/contracts/quick-send', {
    title: '공사 도급계약서', amount: 41310000,
    body: { site: '대전 갈마동 34평', scope: ['철거', '욕실'] },
    operator: { name: '만물대표', phone: '010-0000-1111' },
    customer: { name: '홍길동', phone: '010-0000-2222' },
    baseUrl: 'https://contract.example',
  });
  ok('quick-send 성공', qs.status === 200 && !!qs.data.contractId, qs.data.error || '');

  // 고객이 실제로 보게 될 본문을 확인한다. 전문 열람은 본인확인 후에만 가능하므로 OTP 를 먼저 통과한다.
  const token = String(qs.data.signPath || '').split('#t=')[1];
  const sign = (p, json) => fetch(base + p, { method: json ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-sign-token': token },
    body: json ? JSON.stringify(json) : undefined }).then((r) => r.json());
  await sign('/api/sign');
  await sign('/api/sign/otp', {});
  await sign('/api/sign/verify', { code: '135790' });
  const full = await sign('/api/sign/full');
  const fb = (full && full.body) || {};
  ok('앱이 본문을 안 보내도 조항이 채워진다', Array.isArray(fb.clauses) && fb.clauses.length === 12, String(fb.clauses && fb.clauses.length));
  ok('지급조건이 0원이 아니다', fb.payment && fb.payment.down === 20655000 && fb.payment.bal === 4131000,
    JSON.stringify(fb.payment));
  ok('고객명이 계약서에 들어간다', fb.customerName === '홍길동', String(fb.customerName));
  ok('지급 비율이 본문에 실려 화면이 되계산 없이 맞는다', fb.paymentRatio && fb.paymentRatio.down === 0.5);

  // 조항 없는 본문은 잠글 수 없어야 한다(앱이 아닌 관리자 API 로 직접 넣는 경로)
  const c = await post('/api/contracts', {
    contractNo: 'MM-STD-0001', title: '빈 계약', amount: 1000000,
    body: { site: '대전', clauses: [] },
    operator: { name: '만물대표', phone: '010-0000-1111' },
    customer: { name: '박고객', phone: '010-1234-5678' },
  });
  const lock = await post(`/api/contracts/${c.data.contractId}/lock`, {});
  ok('빈 계약서는 잠금 거부(INCOMPLETE_BODY)', lock.status === 400 && lock.data.error === 'INCOMPLETE_BODY',
    lock.data.error || String(lock.status));

  app.server.close();
}

console.log('\n===== 표준 도급계약 조항 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
