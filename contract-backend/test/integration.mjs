// 통합 검증 — 실제 서버 기동 + 실제 브라우저로 서명 화면을 조작하고,
// 서버가 증거를 실제로 기록했는지 증거 패키지로 대조한다. (실제 발송 없음)
//
// 요구: playwright + chromium (환경 제공).
import { createApp } from '../src/server.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PW = process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

const { server, svc } = createApp({ demoOtp: '246810', enableDemo: true });
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;

const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

let chromium;
try { ({ chromium } = require(PW)); }
catch (e) { console.log('playwright 미탑재 — 통합 테스트 건너뜀', e.message); server.close(); process.exit(0); }

// 운영자 흐름: 데모 계약 시드 → 서명 URL 확보
const seed = await (await fetch(base + '/api/demo/seed', { method: 'POST' })).json();
ok('데모 시드(계약 생성·잠금·링크)', !!seed.token && !!seed.contractId);
const signUrl = base + seed.signPath;

// 서빙되는 HTML 이 유효 문서 구조(DOCTYPE·viewport·lang)를 갖는지
const rawHtml = await (await fetch(base + '/sign')).text();
ok('서빙 HTML: DOCTYPE·viewport·lang 존재',
  /^<!DOCTYPE html>/i.test(rawHtml.trim()) && /name="viewport"/.test(rawHtml) && /<html lang="ko"/.test(rawHtml));

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
// 브라우저가 실제로 서버 엔드포인트를 호출하는지 기록
const apiCalls = [];
page.on('request', (req) => { const u = new URL(req.url()); if (u.pathname.startsWith('/api/sign')) apiCalls.push(req.method() + ' ' + u.pathname); });

await page.goto(signUrl, { waitUntil: 'networkidle' });

// intro 화면이 서버 데이터(계약번호)로 렌더되었는지
await page.waitForSelector('#screenSign:not(.hidden)', { timeout: 5000 });
const introHtml = await page.textContent('#stepBody');
ok('intro: 서버 계약번호 렌더', /MM-2026-\d{4}/.test(introHtml), (introHtml.match(/MM-2026-\d{4}/) || [''])[0]);

const clickPri = async () => { await page.click('#bar .btn.pri:not([disabled])'); await page.waitForTimeout(120); };
const clickById = async (id) => { await page.click(id); await page.waitForTimeout(100); };

// intro → verify
await clickPri();
// OTP 발송
await page.click('#otpBtn'); await page.waitForTimeout(200);
ok('OTP 발송 → 입력칸 표시', await page.$('#otpInput') !== null);
// 데모 코드 힌트 노출 확인
const hint = await page.textContent('#otpHint');
ok('데모 인증번호 힌트 표시', /246810/.test(hint));
// 오입력 → 거부
await page.fill('#otpInput', '000000'); await page.waitForTimeout(300);
const badMsg = await page.textContent('#otpMsg');
ok('OTP 오입력 거부 메시지', /일치하지 않습니다/.test(badMsg));
ok('오입력 시 다음버튼 비활성', await page.getAttribute('#nextV', 'disabled') !== null || await page.$('#nextV[disabled]') !== null);
// 정입력 → 통과
await page.fill('#otpInput', ''); await page.fill('#otpInput', '246810'); await page.waitForTimeout(400);
const okMsg = await page.textContent('#otpMsg');
ok('OTP 정입력 → 본인확인 완료', /본인확인 완료/.test(okMsg));

// verify → summary (여기서 GET /api/sign/full 호출)
await clickPri(); await page.waitForTimeout(300);
const sumHtml = await page.textContent('#stepBody');
ok('summary: 서버 전문에서 결제 분할 렌더', /4,131,000원/.test(sumHtml) && /16,524,000원/.test(sumHtml));

// summary → full
await clickPri();
ok('full: 서버 clauses 로 전문 렌더(제12조)', /제12조/.test(await page.textContent('#doc')));
// 다음 버튼은 스크롤 전 비활성
ok('full: 스크롤 전 다음버튼 비활성', await page.$('#nextF[disabled]') !== null);
// 문서 끝까지 스크롤 → viewed 기록 + 버튼 활성
await page.$eval('#doc', (d) => { d.scrollTop = d.scrollHeight; });
await page.waitForTimeout(400);
ok('full: 끝까지 스크롤 → 다음버튼 활성', await page.$('#nextF[disabled]') === null);

// full → consent
await clickPri();
// 키보드 접근성: 첫 항목을 포커스 후 Space 로 토글되는지(role=checkbox)
await page.focus('.consent >> nth=0');
await page.keyboard.press('Space'); await page.waitForTimeout(80);
ok('consent: 키보드(Space)로 토글 + aria-checked', await page.getAttribute('.consent >> nth=0', 'aria-checked') === 'true');
// 나머지 3건 체크(제자리 갱신이라 핸들 유지되지만 안전하게 nth 재조회)
for (let i = 1; i < 4; i++) { await page.click(`.consent >> nth=${i}`); await page.waitForTimeout(60); }
ok('consent: 4건 체크 → 서명 버튼 활성', await page.$('#nextC[disabled]') === null);

// consent → sign (POST /api/sign/consent)
await clickPri(); await page.waitForTimeout(200);
ok('sign: 서명 캔버스 표시', await page.$('#sig') !== null);
// 캔버스에 서명 그리기(포인터 드래그)
const box = await (await page.$('#sigwrap')).boundingBox();
await page.mouse.move(box.x + 40, box.y + 100); await page.mouse.down();
await page.mouse.move(box.x + 120, box.y + 60); await page.mouse.move(box.x + 200, box.y + 130);
await page.mouse.move(box.x + 280, box.y + 70); await page.mouse.up();
await page.waitForTimeout(200);
ok('sign: 서명 후 완료버튼 활성', await page.$('#nextS[disabled]') === null);

// sign → confirm
await clickPri();
// 최종 동의 체크
await page.click('.consent'); await page.waitForTimeout(120);
ok('confirm: 최종동의 → 체결버튼 활성', await page.$('#nextY[disabled]') === null);

// confirm → done (POST /api/sign/signature)
await page.click('#nextY'); await page.waitForTimeout(600);
const doneHtml = await page.textContent('#stepBody');
ok('done: 체결 완료 화면', /계약이 체결되었습니다/.test(doneHtml));

// done → pdf: 서버 문서해시 표시
await clickPri(); await page.waitForTimeout(200);
const pdfHtml = await page.textContent('#stepBody');
ok('pdf: 서버 문서해시(SHA-256) 표시', /문서해시\(SHA-256\)/.test(pdfHtml) && /[0-9a-f]{64}/.test(pdfHtml));
ok('pdf: 서버 서명해시 표시', /서명해시\(SHA-256\)/.test(pdfHtml));

// 브라우저가 실제 엔드포인트들을 호출했는지
const need = ['GET /api/sign', 'POST /api/sign/otp', 'POST /api/sign/verify', 'GET /api/sign/full', 'POST /api/sign/viewed', 'POST /api/sign/consent', 'POST /api/sign/signature'];
const missing = need.filter((n) => !apiCalls.includes(n));
ok('브라우저가 7개 엔드포인트 실제 호출', missing.length === 0, missing.join(','));

// 서버 증거 패키지로 최종 대조
const ev = svc.evidencePackage(seed.contractId);
const evEvents = ev.auditTrail.map((e) => e.event);
ok('증거: 서명·완료 기록됨', ev.signatures.length === 1 && ev.contract.status === 'COMPLETED');
ok('증거: 본인확인·열람·동의·서명 이벤트 분리 기록',
  ['IDENTITY_OTP_VERIFIED', 'DOCUMENT_VIEWED', 'CONSENT_AGREED', 'SIGNATURE_SUBMITTED', 'CONTRACT_COMPLETED'].every((e) => evEvents.includes(e)));
ok('증거: 서명 당시 doc_hash 가 계약 해시와 일치', ev.signatures[0].doc_hash_seen === ev.contract.docHash);
ok('pageerror 0', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
server.close();

console.log('\n===== 통합(브라우저↔서버) 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
console.log('\nAPI 호출 순서:', apiCalls.join(' → '));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
