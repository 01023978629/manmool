/* ensure-lead-inbox.mjs — 문의 접수함(lead-inbox.html + apps-script-lead-inbox/) 안전검사

   지키는 것
   - 접수함 화면은 색인·리퍼러·프레임·CSP 로 닫혀 있고, 문의 내용을 영구 저장소에 두지 않는다.
   - 화면·전송 모듈·서버가 같은 주소 규칙(script.google.com /exec)과 같은 action·오류 코드를 쓴다.
   - 서버 코드에는 비밀값이 없고, 시트 머리글은 순수 로직이 만드는 행의 열을 모두 담는다.
   - 접수함 백엔드 폴더는 Pages 산출물에 들어가지 않고, 화면 파일 넷은 허용목록에 있다.
   - 처리방침이 접수함(Google Sheets 이력·보관기간)을 설명한다.
   - 배포 게이트가 접수함 검사 셋을 실제로 돌린다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { expectedPublicFiles } from './pages-artifact-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const files = {
  page: read('lead-inbox.html'), pageJs: read('js/lead-inbox.js'), apiJs: read('js/lead-inbox-api.js'), css: read('css/lead-inbox.css'),
  transport: read('js/lead-transport.js'), admin: read('js/admin.js'), config: read('data/config.json'),
  server: read('apps-script-lead-inbox/Code.gs'), pure: read('apps-script-lead-inbox/LeadInboxPure.gs'),
  manifest: read('apps-script-lead-inbox/appsscript.json'), readme: read('apps-script-lead-inbox/README.md'),
  privacy: read('privacy.html'), sitemap: read('sitemap.xml'), robots: read('robots.txt'), workflow: read('.github/workflows/deploy-pages.yml'),
};
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const EXEC_URL_SOURCE = String.raw`^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$`;
const PROPERTY_NAMES = ['LEAD_INBOX_ENABLED', 'LEAD_INBOX_SHEET_ID', 'LEAD_INBOX_SESSION_SECRET', 'LEAD_INBOX_ADMIN_CODE', 'LEAD_INBOX_LOGIN_PEPPER', 'LEAD_INBOX_NOTIFY_TO'];

/* ① 화면 — 색인·리퍼러·프레임·CSP */
check(/<meta name="robots" content="noindex,nofollow"/.test(files.page), '접수함 페이지가 noindex,nofollow 가 아닙니다.');
check(/<meta name="referrer" content="no-referrer"/.test(files.page), '접수함 페이지에 no-referrer 가 없습니다.');
const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(files.page) || [])[1] || '';
check(csp.includes("default-src 'self'") && csp.includes("script-src 'self'") && csp.includes("frame-src 'none'") && csp.includes("object-src 'none'"), '접수함 CSP 가 자기 출처·스크립트 제한·프레임 금지를 갖추지 못했습니다.');
const connect = (/connect-src ([^;]+)/.exec(csp) || [])[1] || '';
check(connect.split(/\s+/).filter(Boolean).sort().join(' ') === "'self' https://script.google.com https://script.googleusercontent.com", `접수함 CSP connect-src 가 Apps Script 두 호스트만이 아닙니다: ${connect}`);
check(!/\sonclick=|\sonload=|javascript:/i.test(files.page) && !/<script>/.test(files.page), '접수함 페이지에 인라인 스크립트가 있습니다.');
check(/<html lang="ko" data-office-frame-pending>/.test(files.page), '접수함 페이지가 프레임 검사 전 숨김 속성을 갖지 않습니다.');
const scriptOrder = [...files.page.matchAll(/<script src="js\/([a-z-]+\.js)/g)].map((m) => m[1]);
check(JSON.stringify(scriptOrder) === JSON.stringify(['office-frame-guard.js', 'lead-transport.js', 'lead-inbox-api.js', 'lead-inbox.js']), `접수함 스크립트 순서가 프레임 가드 → 전송 모듈 → API → 화면이 아닙니다: ${scriptOrder.join(', ')}`);
check(files.page.indexOf('office-frame-guard.js') < files.page.indexOf('<link rel="stylesheet"'), '프레임 가드가 스타일시트보다 먼저 오지 않습니다.');
check(/id="inboxAdminCode"[^>]*type="password"[^>]*autocomplete="one-time-code"/.test(files.page), '관리 비밀번호 칸이 password + one-time-code 가 아닙니다(브라우저 저장 유도).');
check(/id="inboxLoginButton"[^>]*disabled/.test(files.page), '로그인 버튼이 서버 확인 전 잠겨 있지 않습니다.');
for (const decision of ['승인', '보류', '거절']) check(files.page.includes(`data-decision="${decision}"`), `판정 버튼 ${decision} 이 없습니다.`);
check(/웹 업무 연결/.test(files.page), '현장 앱으로 옮기는 안내(웹 업무 연결)가 없습니다.');
check(!/lead-inbox\.html/.test(files.sitemap), '접수함 페이지가 sitemap 에 들어갔습니다.');
check(/^Disallow: \/lead-inbox\.html$/m.test(files.robots), 'robots.txt 가 접수함 페이지를 막지 않습니다.');

/* ② 화면 JS — 저장소·렌더링 규칙 */
// 주석은 규칙을 설명하려고 금지어를 적을 수 있으니 코드만 본다.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageSources = stripComments(files.pageJs) + stripComments(files.apiJs);
check(!/(localStorage|indexedDB|document\.cookie|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function)/.test(pageSources), '접수함 화면이 영구 저장소나 HTML 문자열 렌더링을 씁니다.');
check(!/console\.(log|info|debug|warn|error)/.test(pageSources), '접수함 화면이 console 에 무언가를 남깁니다.');
check(/sessionStorage/.test(files.pageJs) && files.pageJs.includes("const SESSION_KEY = 'manmul_lead_inbox_session'"), '세션 저장 키가 고정 이름이 아닙니다.');
check(/if \(window\.__MANMUL_OFFICE_FRAME_BLOCKED__\) return;/.test(files.pageJs), '접수함 화면이 프레임 차단 표식을 존중하지 않습니다.');
check(/raw\.token\.length < 64/.test(files.pageJs) && /token\.length < 64/.test(files.pageJs), '세션 토큰 길이 검사가 없습니다.');
check(/9 \* 60 \* 60 \* 1000/.test(files.pageJs), '세션 만료 상한(9시간) 검사가 없습니다.');
check(/keepalive: true/.test(files.pageJs) && /'leadLogout'/.test(files.pageJs), '로그아웃이 keepalive 로 서버에 알리지 않습니다.');
check(/crypto\.randomUUID\(\)/.test(files.pageJs) && /requestId/.test(files.pageJs), '판정 요청에 클라이언트 UUID(requestId) 가 없습니다.');
check(/'거절' && !memo/.test(files.pageJs), '거절 사유 필수 검사가 화면에 없습니다.');
check(new RegExp(`const API_URL = /${EXEC_URL_SOURCE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/;`).test(files.apiJs), '접수함 API 주소 규칙이 script.google.com /exec 로 고정되지 않았습니다.');
check(/url\.hostname === 'script\.google\.com'/.test(files.apiJs) && /!url\.search && !url\.hash/.test(files.apiJs), '접수함 API 주소의 host·query·hash 검사가 없습니다.');
check(/credentials: 'omit'/.test(files.apiJs) && /'Content-Type': 'text\/plain;charset=utf-8'/.test(files.apiJs), '접수함 호출이 쿠키 없이 text/plain 으로 가지 않습니다(프리플라이트 회피 규칙).');

/* ③ 전송 모듈·설정 — 폼 → 접수함 */
// 폼 페이지에 CSP 가 있으면 접수함 호스트를 허용해야 한다 — office.html 이 web3forms 만 허용해 접수함 호출이
// 브라우저에서 조용히 막혔던 사고(2026-09-03). CSP 없는 페이지(index·leak)는 해당 없음.
for (const relative of fs.readdirSync(ROOT).filter((name) => /\.html$/.test(name))) {
  const html = read(relative);
  if (!/lead-transport\.js/.test(html) || relative === 'lead-inbox.html') continue;
  const pageCsp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1];
  if (!pageCsp) continue;
  const pageConnect = ((/connect-src ([^;]+)/.exec(pageCsp) || [])[1] || '').split(/\s+/).filter(Boolean);
  check(pageConnect.includes('https://script.google.com') && pageConnect.includes('https://script.googleusercontent.com'), `${relative} 의 CSP connect-src 가 접수함(Apps Script) 호스트를 막습니다 — 이 폼의 문의가 접수함에 닿지 않습니다.`);
}
check(new RegExp(`const INBOX_URL = /${EXEC_URL_SOURCE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/;`).test(files.transport), '전송 모듈의 접수함 주소 규칙이 화면 API 와 다릅니다.');
const deliverBody = (/async function deliver\(config, payload\) \{([\s\S]*?)\n  \}/.exec(files.transport) || [])[1] || '';
check(/ensureLeadId\(payload\);/.test(deliverBody) && deliverBody.indexOf('ensureLeadId') < deliverBody.indexOf('deliverEmail'), 'deliver 가 메일 전송 전에 leadId 를 붙이지 않습니다.');
check(/deliverToInbox\(config, payload, emailDelivered\)/.test(deliverBody), 'deliver 가 메일 발송 여부를 접수함에 넘기지 않습니다.');
const inboxBody = (/async function deliverToInbox\(config, payload, emailDelivered\) \{([\s\S]*?)\n  \}/.exec(files.transport) || [])[1] || '';
check(/action: 'leadCreate'/.test(inboxBody) && /emailDelivered: emailDelivered === true/.test(inboxBody) && /message: buildLeadText\(payload\)/.test(inboxBody), '접수함 호출 본문(leadCreate·emailDelivered·message) 계약이 깨졌습니다.');
check(/responseBody\.ok !== true\) throw/.test(inboxBody), '접수함 응답의 ok:true 를 확인하지 않습니다.');
const config = JSON.parse(files.config);
check(config.inbox && Object.keys(config.inbox).sort().join(',') === '_help,enabled,url', 'config.json 의 inbox 는 enabled·url·_help 셋이어야 합니다.');
if (config.inbox) {
  check(typeof config.inbox.enabled === 'boolean' && typeof config.inbox.url === 'string', 'config.json inbox 의 enabled·url 형식이 틀립니다.');
  if (config.inbox.enabled) check(new RegExp(EXEC_URL_SOURCE).test(config.inbox.url), '접수함이 켜져 있는데 url 이 script.google.com /exec 가 아닙니다.');
  else check(config.inbox.url === '', '접수함이 꺼져 있으면 url 은 비어 있어야 합니다(반쯤 설정된 상태 금지).');
}
check(/inbox\.enabled && inbox\.url/.test(files.admin) && /문의 접수함/.test(files.admin), '관리자 화면이 접수함 연결 상태를 보여주지 않습니다.');

/* ④ 서버 — action·오류 코드·비밀값·시트 머리글 */
const serverActions = (/var LEAD_ACTIONS = \[([^\]]+)\]/.exec(files.server) || [])[1] || '';
const serverActionList = serverActions.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
const clientActions = ((/const ACTIONS = Object\.freeze\(\[([^\]]+)\]\)/.exec(files.apiJs) || [])[1] || '').split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
check(JSON.stringify(serverActionList) === JSON.stringify(['leadHealth', 'leadCreate', 'leadLogin', 'leadLogout', 'leadMe', 'leadList', 'leadGet', 'leadDecide']), `서버 action 목록이 계약과 다릅니다: ${serverActionList.join(', ')}`);
check(JSON.stringify(clientActions) === JSON.stringify(serverActionList.filter((a) => a !== 'leadCreate')), `화면 API action 목록이 서버와 다릅니다(leadCreate 는 폼 전용): ${clientActions.join(', ')}`);
check(/var LEAD_PUBLIC_ACTIONS = \['leadHealth', 'leadCreate', 'leadLogin'\];/.test(files.server), '서버의 비로그인 action 이 health·create·login 셋이 아닙니다.');
check(/const PUBLIC_ACTIONS = new Set\(\['leadHealth', 'leadLogin'\]\);/.test(files.apiJs), '화면 API 의 비로그인 action 이 health·login 둘이 아닙니다.');
const publicErrorBody = (/function leadPublicError_\(code\) \{([\s\S]*?)\n\}/.exec(files.server) || [])[1] || '';
const serverErrorCodes = [...new Set([...publicErrorBody.matchAll(/return '([a-z-]+)'/g)].map((m) => m[1]))];
const clientMessages = [...files.apiJs.matchAll(/^\s+'([a-z-]+)': '/gm)].map((m) => m[1]);
for (const code of serverErrorCodes) check(clientMessages.includes(code), `서버 오류 코드 ${code} 에 대한 화면 문구가 없습니다.`);
check(serverErrorCodes.includes('invalid-transition') && serverErrorCodes.includes('rate-limited') && serverErrorCodes.includes('session-expired'), '서버 오류 접기에 전이·잠금·세션 코드가 없습니다.');
check(!/AKfycb|[0-9a-f]{32,}/.test(files.server + files.pure), '서버 코드에 배포 URL 이나 긴 16진 비밀값이 박혀 있습니다.');
for (const name of PROPERTY_NAMES) {
  check(files.server.includes(`'${name}'`), `서버가 스크립트 속성 ${name} 을 읽지 않습니다.`);
  check(files.readme.includes(name), `README 에 스크립트 속성 ${name} 설명이 없습니다.`);
}
check(!/PropertiesService\.getScriptProperties\(\)\.setPropert/.test(files.server), '서버 코드가 스크립트 속성을 코드로 씁니다(비밀값은 콘솔에서만).');
// 알림 메일은 접수를 실패시키면 안 된다 — MailApp 호출은 leadNotify_ 안, try 안에만 있고 잠금 밖에서 부른다.
const notifyBody = (/function leadNotify_\(row\) \{([\s\S]*?)\n\}/.exec(files.server) || [])[1] || '';
check((files.server.match(/MailApp\./g) || []).length === (notifyBody.match(/MailApp\./g) || []).length && /^\s*try \{/.test(notifyBody) && /catch \(_\)/.test(notifyBody), '알림 메일(MailApp)이 leadNotify_ 의 try 밖에서 쓰입니다 — 알림 실패가 접수 실패가 됩니다.');
check(/getProperty\('LEAD_INBOX_NOTIFY_TO'\)/.test(notifyBody) && /if \(!to \|\| /.test(notifyBody), '알림 메일이 LEAD_INBOX_NOTIFY_TO 가 비어 있을 때도 나갑니다.');
check(/if \(!result\.duplicate\) leadNotify_\(row\);/.test(files.server) && files.server.indexOf('if (!result.duplicate) leadNotify_(row);') > files.server.indexOf('var result = leadWithLock_'), '알림이 잠금 안에서 나가거나 중복 접수에도 나갑니다.');
check((files.server.match(/leadNotify_\(/g) || []).length === 2, '알림 호출이 잠금 밖 한 곳(정의 포함 2회)이어야 합니다 — 잠금 안이나 다른 곳에서 또 부릅니다.');
check(/LEAD_INBOX_PAGE_URL = 'https:\/\/01023978629\.github\.io\/manmool\/lead-inbox\.html'/.test(files.server), '알림 메일의 접수함 링크가 실제 페이지 주소가 아닙니다.');
check(!/(SpreadsheetApp|PropertiesService|CacheService|LockService)/.test(files.pure), '순수 로직 파일이 Apps Script 서비스를 부릅니다.');
check(/computeHmacSha256Signature/.test(files.server) && /leadConstantTimeEqual_|constantTime/.test(files.server), '서버가 HMAC·상수시간 비교로 비밀번호·토큰을 다루지 않습니다.');
check(/LEAD_LOGIN_MAX_ATTEMPTS = 5;/.test(files.server) && /LEAD_LOGIN_LOCK_SECONDS = 15 \* 60;/.test(files.server), '로그인 5회·15분 잠금 상수가 바뀌었습니다.');
check(/LEAD_RETAIN_REJECTED_MS = 90 \* 24 \* 60 \* 60 \* 1000;/.test(files.server) && /LEAD_RETAIN_APPROVED_MS = 365 \* 24 \* 60 \* 60 \* 1000;/.test(files.server), '보관 기한 상수(거절 90일·승인 1년)가 처리방침과 다릅니다.');
check(/leadPruneSessions_\(\);\s*leadPruneLeads_\(\);/.test(files.server), '로그인 때 보관 기한 지난 문의를 지우는 호출(leadPruneLeads_)이 없습니다.');
check(/function leadInboxDailyPrune\(\)/.test(files.server) && /newTrigger\('leadInboxDailyPrune'\)\.timeBased\(\)\.everyDays\(1\)/.test(files.server), '매일 정리 트리거(leadInboxDailyPrune)와 설치 함수가 없습니다.');
const pureContext = { module: { exports: {} } };
pureContext.exports = pureContext.module.exports;
vm.runInNewContext(files.pure, pureContext, { filename: 'LeadInboxPure.gs' });
const pure = pureContext.module.exports;
const sampleRow = pure.leadPureNormalizeCreate_({ leadId: '3f2c9b1e-6d4a-4c8b-9e1f-0a2b3c4d5e6f', phone: '010-0000-0000', privacyConsent: true });
const sheetHeaders = ((/'문의': \[([\s\S]*?)\]/.exec(files.server) || [])[1] || '').split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
check(sampleRow.ok === true, '순수 로직이 최소 payload 를 정규화하지 못합니다.');
for (const key of Object.keys(sampleRow.row || {})) check(sheetHeaders.includes(key), `문의 시트 머리글에 ${key} 열이 없습니다.`);
for (const key of ['receiptNo', 'receivedAt', 'status', 'decidedAt', 'updatedAt']) check(sheetHeaders.includes(key), `문의 시트 머리글에 ${key} 열이 없습니다.`);
check(JSON.stringify(JSON.parse(JSON.stringify(pure.LEAD_TRANSITIONS))) === JSON.stringify({ '신규': ['승인', '보류', '거절'], '보류': ['승인', '거절'], '거절': ['보류'], '승인': [] }), '상태 전이 표가 바뀌었습니다(승인은 종착, 거절→보류만 되살림).');
check(files.pageJs.includes("{ '신규': ['승인', '보류', '거절'], '보류': ['승인', '거절'], '거절': ['보류'], '승인': [] }"), '화면의 전이 표가 서버 순수 로직과 다릅니다.');
const manifest = JSON.parse(files.manifest);
check(manifest.timeZone === 'Asia/Seoul' && manifest.webapp && manifest.webapp.access === 'ANYONE_ANONYMOUS' && manifest.webapp.executeAs === 'USER_DEPLOYING', 'appsscript.json 이 서울 시간대·익명 접근·배포자 실행이 아닙니다.');
check(!/DriveApp|APP_TOKEN|OFFICE_SESSION_SECRET|PHOTO_/.test(files.server + files.pure), '접수함 서버가 기존 사진 중계·직원 포털 Apps Script 의 속성이나 Drive 를 건드립니다(별개 프로젝트여야 함).');

/* ⑤ Pages 경계·처리방침·배포 게이트 */
const publicFiles = new Set(expectedPublicFiles(ROOT).map(({ relative }) => relative));
for (const relative of ['lead-inbox.html', 'css/lead-inbox.css', 'js/lead-inbox-api.js', 'js/lead-inbox.js']) check(publicFiles.has(relative), `Pages 공개 허용목록에 ${relative} 가 없습니다.`);
check(![...publicFiles].some((relative) => relative.startsWith('apps-script-lead-inbox/')), '접수함 백엔드 폴더가 Pages 산출물에 들어갑니다.');
check(/'apps-script-lead-inbox'/.test(read('scripts/ensure-pages-artifact.mjs')), '산출물 검사의 금지 최상위 폴더에 apps-script-lead-inbox 가 없습니다.');
const retention = (/<p id="privacy-lead-inbox-retention">([\s\S]*?)<\/p>/.exec(files.privacy) || [])[1] || '';
check(/Google Sheets/.test(retention) && /90일/.test(retention) && /1년/.test(retention) && /승인·보류·거절/.test(retention) && /자동으로 삭제/.test(retention), '처리방침에 접수함 보관 기준 문단(#privacy-lead-inbox-retention)이 불완전합니다.');
check(/문의 접수함이 켜져 있으면[\s\S]*Google Apps Script 및 Google Sheets/.test(files.privacy), '처리방침 3절이 접수함 경유를 설명하지 않습니다.');
for (const suite of ['tests/lead-inbox-pure.test.cjs', 'tests/lead-inbox-transport.test.cjs', 'tests/lead-inbox-server.test.cjs', 'tests/lead-inbox.e2e.cjs', 'tests/inquiry-receipt.e2e.cjs']) {
  check(fs.existsSync(path.join(ROOT, suite)), `${suite} 가 없습니다.`);
  check(files.workflow.includes(suite), `배포 게이트가 ${suite} 를 돌리지 않습니다.`);
}

if (failures.length) {
  console.error(`FAIL  문의 접수함 안전검사 ${failures.length}건`);
  failures.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}
console.log('PASS  문의 접수함 — 닫힌 화면·주소 규칙·action/오류 계약·비밀값 없음·Pages 경계·처리방침·게이트');
