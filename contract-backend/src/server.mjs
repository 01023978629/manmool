// 전자계약 Mock 참조 서버 — node:http 만 사용(무의존성).
// 실제 카카오 발송 없음. 전부 MockKakaoMessageProvider 경유.
//
// 로그 정책: 서명 토큰은 URL/경로에 넣지 않는다(요청 로그에 남기지 않기 위해).
//   → 서명 플로우 토큰은 헤더 x-sign-token 으로 받는다.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.mjs';
import { ContractService, AppError } from './service.mjs';
import { MockKakaoMessageProvider } from './providers/kakao.mjs';
import { selectProvider } from './providers/index.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

// 안전한 기본값: 데모 기능은 명시적으로 켜야만 동작한다(enableDemo=false, demoOtp=null 기본).
// 운영(NODE_ENV=production)에서 데모가 켜져 있으면 기동을 거부한다(fail-fast).
export function createApp({ dbPath = ':memory:', demoOtp = null, enableDemo = false, provider = null } = {}) {
  if (process.env.NODE_ENV === 'production' && (enableDemo || demoOtp)) {
    throw new Error('보안: 운영 환경에서는 데모 모드(enableDemo/demoOtp)를 사용할 수 없습니다.');
  }
  const db = openDb(dbPath);
  const svc = new ContractService(db, { demoOtp });
  // 실제 발송 여부는 환경변수로 결정(기본 Mock). ALIMTALK_LIVE=1 + 자격증명 있을 때만 실 발송.
  const sel = provider ? { provider, live: false, reason: '주입된 Provider' } : selectProvider();
  provider = sel.provider;
  const providerLive = sel.live;

  const routes = [];
  const on = (method, re, fn) => routes.push({ method, re, fn });

  // 서명 화면(동일 출처로 서빙 → CORS 불필요, 토큰은 프래그먼트로만 전달)
  const signHtml = readFileSync(join(__dir, '..', 'public', 'sign.html'), 'utf8');
  on('GET', /^\/sign\/?$/, async (_r, _m, res) => { html(res, signHtml); return SENT; });

  // 데모 부트스트랩: 계약 생성→잠금→서명링크 발급까지 한 번에. enableDemo 일 때만.
  on('POST', /^\/api\/demo\/seed$/, async () => {
    if (!enableDemo) throw new AppError('DEMO_DISABLED', '데모가 비활성화되어 있습니다.');
    return seedDemoContract(svc, provider);
  });

  // ── 운영자(사업자) 측 ──
  on('POST', /^\/api\/contracts$/, async (req) => {
    const b = await body(req);
    return svc.createContract(b);
  });
  on('POST', /^\/api\/contracts\/([^/]+)\/lock$/, async (_r, [id]) => svc.lockDocument(id));
  on('POST', /^\/api\/contracts\/([^/]+)\/parties\/([^/]+)\/sign-link$/, async (_r, [id, pid]) =>
    svc.issueSignLink(id, pid, 'sign'));
  on('POST', /^\/api\/contracts\/([^/]+)\/parties\/([^/]+)\/send$/, async (req, [id, pid]) => {
    const b = await body(req);
    // rawPhone 은 실제 발송 시에만 넘어온다. 여기서 로그하지 않는다(민감정보).
    return svc.sendMessage(id, pid, b.templateKey || 'contract_sign', provider, b.variables || {}, b.rawPhone || null);
  });
  on('POST', /^\/api\/deliveries\/([^/]+)\/refresh$/, async (_r, [id]) => svc.refreshDelivery(id, provider));
  on('GET', /^\/api\/contracts\/([^/]+)\/evidence$/, async (_r, [id]) => svc.evidencePackage(id));

  // ── 고객(서명자) 측: 토큰은 헤더 x-sign-token 로만 ──
  const tok = (req) => req.headers['x-sign-token'] || '';
  const ctx = (req) => ({ ip: req.socket.remoteAddress, ua: req.headers['user-agent'], requestId: req.headers['x-request-id'] });
  on('GET', /^\/api\/sign$/, async (req) => svc.openLink(tok(req), ctx(req)));
  on('GET', /^\/api\/sign\/full$/, async (req) => svc.getFullContract(tok(req)));
  on('POST', /^\/api\/sign\/otp$/, async (req) => svc.requestOtp(tok(req)));
  on('POST', /^\/api\/sign\/verify$/, async (req) => { const b = await body(req); return svc.verifyOtp(tok(req), b.code, ctx(req)); });
  on('POST', /^\/api\/sign\/viewed$/, async (req) => svc.markViewed(tok(req)));
  on('POST', /^\/api\/sign\/consent$/, async (req) => { const b = await body(req); return svc.recordConsents(tok(req), b.consents || [], ctx(req)); });
  on('POST', /^\/api\/sign\/signature$/, async (req) => {
    const b = await body(req);
    const bytes = b.imageBase64 ? Buffer.from(b.imageBase64, 'base64') : Buffer.from('');
    return svc.submitSignature(tok(req), { imageBytes: bytes, clientDocHash: b.clientDocHash }, ctx(req));
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (m) {
          const out = await r.fn(req, m.slice(1), res);
          if (out === SENT) return; // 핸들러가 응답을 직접 처리함(예: 정적 HTML)
          return json(res, 200, out);
        }
      }
      json(res, 404, { error: 'NOT_FOUND' });
    } catch (e) {
      if (e instanceof AppError) { json(res, e.httpStatus, { error: e.code, message: e.message }); return; }
      // 비-AppError(예상치 못한 500)는 내부 메시지/스택을 노출하지 않는다.
      console.error('[contract] 내부 오류:', e && e.stack ? e.stack : e);
      json(res, 500, { error: 'INTERNAL', message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  });
  return { server, db, svc, provider, providerLive };
}

const SENT = Symbol('response-sent');

function json(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}
function html(res, s) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

// 데모용 계약 시드: 실제 만물 계약 형태의 본문으로 생성→잠금→서명링크.
let _seedSeq = 0;
function seedDemoContract(svc, provider) {
  const contractNo = _seedSeq === 0 ? 'MM-2026-0142' : `MM-2026-${String(142 + _seedSeq).padStart(4, '0')}`;
  _seedSeq += 1;
  const body = {
    contractNo,
    site: '대전 서구 갈마동 (갈마아이파크 3동 1204호)',
    scope: '주거 전체 리모델링', area: '34평', amount: 41310000,
    payment: { down: 4131000, mid: 16524000, bal: 20655000 },
    period: '2026-08-04 ~ 2026-09-05 (약 4주)', warranty: '방수 2년 · 기타 마감 1년',
    operator: { co: '만물인테리어', rep: '전병덕', bizNo: '895-48-01132' },
    customerName: '김대전',
    clauses: [
      { no: 1, title: '공사의 내용', text: '도급인(이하 "갑")과 수급인 만물인테리어(이하 "을")은 표기 현장의 주거 전체 리모델링 공사에 관하여 다음과 같이 계약을 체결한다.' },
      { no: 2, title: '계약금액', text: '총 계약금액은 금 41,310,000원(부가세 포함)으로 한다. 계약금 4,131,000원(10%), 중도금 16,524,000원(40%), 잔금 20,655,000원(50%)으로 분할 지급한다.' },
      { no: 3, title: '공사기간', text: '공사기간은 2026-08-04 ~ 2026-09-05로 한다. 천재지변·민원 등 을의 책임 없는 사유로 인한 지연은 협의하여 연장할 수 있다.' },
      { no: 4, title: '대금 지급', text: '갑은 각 공정 확인 후 해당 대금을 을이 지정한 계좌로 지급한다. 모든 대금은 확인·기록 후 처리된다.' },
      { no: 5, title: '추가·변경 공사', text: '공사 중 추가·변경이 필요한 경우 을은 사진과 함께 내용·금액을 갑에게 통지하고, 갑의 서면(전자적 방법 포함) 동의를 받은 경우에 한하여 시공하며 그 내역을 기록한다. 갑의 동의 없이 추가 비용을 청구하지 아니한다.' },
      { no: 6, title: '하자보증', text: '을은 준공일로부터 방수 2년·기타 마감 1년 동안 하자보수 책임을 진다(건설산업기본법 하자담보책임기간 기준). 준공 시 보증서를 발급한다.' },
      { no: 7, title: '안전 및 관리', text: '을은 공사 중 안전관리 및 현장 청결을 유지하며, 인접 세대·이웃에 대한 민원 예방에 협조한다.' },
      { no: 8, title: '지체상금', text: '을의 귀책으로 준공이 지연된 경우 지연 1일당 계약금액의 0.1%를 지체상금으로 한다.' },
      { no: 9, title: '전자서명', text: '본 계약은 전자문서로 작성되며, 갑의 전자서명·동의기록·문서해시로 성립을 증명한다. 양 당사자는 전자적 방법에 의한 계약 체결에 동의한다.' },
      { no: 10, title: '계약의 해제', text: '당사자 일방이 계약상 의무를 이행하지 아니하는 경우 상당한 기간을 정하여 이행을 최고하고, 그 기간 내 이행이 없으면 계약을 해제할 수 있다.' },
      { no: 11, title: '분쟁 해결', text: '본 계약과 관련한 분쟁은 상호 협의로 해결하되, 협의가 이루어지지 않을 경우 관할 법원에 소를 제기할 수 있다.' },
      { no: 12, title: '특약사항', text: '① 자재 등급은 별첨 견적서를 따른다. ② 공사 진행 사진은 고객 전용 링크로 공유한다. ③ 본 요약과 계약서 내용이 다를 경우 계약서 전문을 우선한다.' },
    ],
  };
  const { contractId, parties } = svc.createContract({
    contractNo, title: '공사 도급계약서', amount: 41310000, body,
    operator: { name: '전병덕', phone: '010-5439-8629' },
    customer: { name: '김대전', phone: '010-2397-8629' },
  });
  svc.lockDocument(contractId);
  const { token } = svc.issueSignLink(contractId, parties.customer, 'sign');
  return { contractId, partyId: parties.customer, token, signPath: `/sign#t=${token}` };
}
function body(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', (c) => { d += c; if (d.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new AppError('BAD_JSON', 'JSON 파싱 실패')); } });
    req.on('error', reject);
  });
}

// 직접 실행 시 8787 포트로 기동 + 데모 계약 1건 자동 시드.
// 데모 모드는 여기서 "명시적으로" 켠다(라이브러리 기본값은 안전한 off).
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.NODE_ENV === 'production') { console.error('운영 환경에서는 이 데모 서버를 직접 실행할 수 없습니다.'); process.exit(1); }
  const demoOtp = process.env.DEMO_OTP || '246810';
  const { server, svc, provider, providerLive } = createApp({ enableDemo: true, demoOtp });
  const port = process.env.PORT || 8787;
  server.listen(port, () => {
    const seed = seedDemoContract(svc, provider);
    const mode = providerLive ? `⚠️ 실제 발송(${provider.name}) 활성` : '실제 발송 없음 · 전부 Mock';
    console.log(`\n전자계약 서버 http://localhost:${port}  (${mode} · 데모 모드)`);
    console.log(`서명 화면 열기 →  http://localhost:${port}${seed.signPath}`);
    console.log(`(데모 본인확인 번호: ${demoOtp} · 로컬 데모 전용)\n`);
  });
}
