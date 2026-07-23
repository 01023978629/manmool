// 범용 통지(/api/notify) 검증 — 자유문구 문자(SMS/LMS). 실제 발송 없음.
import { createApp } from '../src/server.mjs';
import { openDb } from '../src/db.mjs';
import { ContractService } from '../src/service.mjs';
import { MockKakaoMessageProvider } from '../src/providers/kakao.mjs';
import { SolapiProvider } from '../src/providers/solapi.mjs';

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

// ── 서비스 계층: Mock sendText ──
const db = openDb(':memory:');
const svc = new ContractService(db, {});
const mock = new MockKakaoMessageProvider({});
const r1 = await svc.sendNotification(mock, { toPhoneRaw: '010-5555-1234', text: '[작업지시] 갈마동 욕실 방수·타일. 완료 후 사진 부탁드립니다.', kind: 'workorder' });
ok('통지 발송 → SENT + delivery 기록', r1.status === 'SENT' && !!r1.providerMsgId);
const drow = db.prepare("SELECT template_key,status,provider FROM message_deliveries WHERE id=?").get(r1.deliveryId);
ok('발송 이력 template_key=notify:workorder', drow.template_key === 'notify:workorder' && drow.status === 'SENT');
const phoneLeak = db.prepare("SELECT COUNT(*) c FROM message_deliveries WHERE id LIKE '%5555%'").get().c
  + db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE meta_json LIKE '%5555%' OR meta_json LIKE '%1234%'").get().c;
ok('통지 이력·감사에 전화번호 원문 없음', phoneLeak === 0);

// 빈 문구·잘못된 번호 거부
let e1 = ''; try { await svc.sendNotification(mock, { toPhoneRaw: '010-5555-1234', text: '  ' }); } catch (e) { e1 = e.code; }
ok('빈 문구 거부', e1 === 'EMPTY_TEXT');
let e2 = ''; try { await svc.sendNotification(mock, { toPhoneRaw: 'abc', text: '내용' }); } catch (e) { e2 = e.code; }
ok('잘못된 번호 거부', e2 === 'BAD_PHONE');

// ── Solapi sendText: fetch 주입으로 페이로드 검증(실네트워크 없음) ──
const cap = {};
const fakeFetch = async (url, opts) => { cap.url = url; cap.body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ statusCode: '2000', messageId: 'SMS-1' }) }; };
const sol = new SolapiProvider(
  { apiKey: 'k', apiSecret: 's', pfId: 'pf', sender: '029302266', templateIds: { contract_sign: 'T' } },
  { fetchImpl: fakeFetch, clock: () => '2026-07-22T00:00:00.000Z', saltImpl: () => 'salt' }
);
const longText = '가나다라마바사아자차카타파하'.repeat(8); // >90 bytes → LMS
const sres = await sol.sendText({ toPhoneRaw: '010-5555-1234', text: longText });
ok('Solapi sendText → SENT', sres.status === 'SENT' && sres.providerMsgId === 'SMS-1');
ok('Solapi 페이로드: to·from·text·type=LMS', cap.body.message.to === '01055551234' && cap.body.message.from === '029302266' && cap.body.message.type === 'LMS' && cap.body.message.text === longText);
const short = await sol.sendText({ toPhoneRaw: '01055551234', text: '짧은 문자' });
ok('짧은 문구 → SMS', cap.body.message.type === 'SMS' && short.status === 'SENT');

// ── HTTP: /api/notify/quick-send 관리자 게이트 ──
process.env.ADMIN_TOKEN = 'notify-admin';
const { server } = createApp({});
await new Promise((res) => server.listen(0, res));
const base = `http://localhost:${server.address().port}`;
const noAuth = await fetch(base + '/api/notify/quick-send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: '01055551234', text: 'x', kind: 'workorder' }) });
ok('notify 무인증 거부(401)', noAuth.status === 401);
const authed = await fetch(base + '/api/notify/quick-send', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': 'notify-admin' }, body: JSON.stringify({ to: '010-5555-1234', text: '[작업지시] 테스트', kind: 'workorder' }) });
const aData = await authed.json();
ok('notify 관리자 발송 → SENT(Mock)', authed.status === 200 && aData.status === 'SENT');
server.close();
delete process.env.ADMIN_TOKEN;

console.log('\n===== 범용 통지(/api/notify) 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
