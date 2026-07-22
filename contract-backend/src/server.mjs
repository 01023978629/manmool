// 전자계약 Mock 참조 서버 — node:http 만 사용(무의존성).
// 실제 카카오 발송 없음. 전부 MockKakaoMessageProvider 경유.
//
// 로그 정책: 서명 토큰은 URL/경로에 넣지 않는다(요청 로그에 남기지 않기 위해).
//   → 서명 플로우 토큰은 헤더 x-sign-token 으로 받는다.
import { createServer } from 'node:http';
import { openDb } from './db.mjs';
import { ContractService, AppError } from './service.mjs';
import { MockKakaoMessageProvider } from './providers/kakao.mjs';

export function createApp({ dbPath = ':memory:', demoOtp = '246810' } = {}) {
  const db = openDb(dbPath);
  const svc = new ContractService(db, { demoOtp });
  const provider = new MockKakaoMessageProvider({ deliverAfterMs: 0 });

  const routes = [];
  const on = (method, re, fn) => routes.push({ method, re, fn });

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
    return svc.sendMessage(id, pid, b.templateKey || 'contract_sign', provider, b.variables || {});
  });
  on('POST', /^\/api\/deliveries\/([^/]+)\/refresh$/, async (_r, [id]) => svc.refreshDelivery(id, provider));
  on('GET', /^\/api\/contracts\/([^/]+)\/evidence$/, async (_r, [id]) => svc.evidencePackage(id));

  // ── 고객(서명자) 측: 토큰은 헤더 x-sign-token 로만 ──
  const tok = (req) => req.headers['x-sign-token'] || '';
  const ctx = (req) => ({ ip: req.socket.remoteAddress, ua: req.headers['user-agent'], requestId: req.headers['x-request-id'] });
  on('GET', /^\/api\/sign$/, async (req) => svc.openLink(tok(req), ctx(req)));
  on('POST', /^\/api\/sign\/otp$/, async (req) => svc.requestOtp(tok(req)));
  on('POST', /^\/api\/sign\/verify$/, async (req) => { const b = await body(req); return svc.verifyOtp(tok(req), b.code, ctx(req)); });
  on('POST', /^\/api\/sign\/viewed$/, async (req) => svc.markViewed(tok(req)));
  on('POST', /^\/api\/sign\/consent$/, async (req) => { const b = await body(req); return svc.recordConsents(tok(req), b.consents || [], ctx(req)); });
  on('POST', /^\/api\/sign\/signature$/, async (req) => {
    const b = await body(req);
    const bytes = b.imageBase64 ? Buffer.from(b.imageBase64, 'base64') : Buffer.from('');
    return svc.submitSignature(tok(req), { imageBytes: bytes }, ctx(req));
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (m) {
          const out = await r.fn(req, m.slice(1));
          return json(res, 200, out);
        }
      }
      json(res, 404, { error: 'NOT_FOUND' });
    } catch (e) {
      const status = e instanceof AppError ? e.httpStatus : 500;
      json(res, status, { error: e.code || 'INTERNAL', message: e.message });
    }
  });
  return { server, db, svc, provider };
}

function json(res, status, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', (c) => { d += c; if (d.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new AppError('BAD_JSON', 'JSON 파싱 실패')); } });
    req.on('error', reject);
  });
}

// 직접 실행 시 8787 포트로 기동.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { server } = createApp();
  const port = process.env.PORT || 8787;
  server.listen(port, () => console.log(`전자계약 Mock 서버 http://localhost:${port} (실제 발송 없음)`));
}
