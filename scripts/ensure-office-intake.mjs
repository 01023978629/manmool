import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedPublicFiles } from './pages-artifact-policy.mjs';
import { isExactOfficeApiConfig } from './configure-office-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const office = read('office.html');
const request = read('office-request.html');
const core = read('js/office-request-core.js');
const controller = read('js/office-request.js');
const apiClient = read('js/office-request-api.js');
const photoClient = read('js/office-request-photo.js');
const apiConfig = read('office-api.json');
const sitemap = read('sitemap.xml');
const publicFiles = expectedPublicFiles(ROOT).map(({ relative }) => relative);
const fail = [];
const check = (condition, message) => { if (!condition) fail.push(message); };

check(
  (office.match(/href="office-request\.html"/g) || []).length >= 1,
  '영업 페이지에 기존 시설접수 진입점이 없다'
);
check(/id="officeRequestIntro"/.test(office), '단지 전용 시설접수 소개 구역이 없다');
check(/name="robots" content="noindex,follow"/.test(request), '접수 페이지 noindex가 없다');
check(
  /office-request-api\.js/.test(request) && /office-request-photo\.js/.test(request),
  '접수 페이지에 API 또는 사진 클라이언트 스크립트가 없다'
);
check(/id="officeRefreshRequests"/.test(request) && /id="officeRecentChanges"/.test(request), '최근 변경 또는 수동 새로고침 UI가 없다');
check(!/(setInterval|visibilitychange|Notification\s*\(|serviceWorker\.register)/.test(controller), 'R1 포털에 자동 조회 또는 외부 브라우저 알림이 있다');
check(!/(?:\b(?:[\w$]+(?:\s*\.\s*[\w$]+)*)\s*\.\s*)?addEventListener\s*(?:\?\.)?\s*\(\s*['"]online['"]|(?:\b(?:[\w$]+(?:\s*\.\s*[\w$]+)*)\s*\.\s*)?ononline\s*=/.test(controller), 'R1 포털에 online 이벤트 기반 자동 재조회가 있다');
check(/js\/office-request\.js\?v=20260903-resident-consent1/.test(request), '보완 요청 사유 표시 자산 cache marker가 없다');
check(
  /id="officeDetailNeedsInfoRow"[^>]*hidden[\s\S]*?<dt>보완 요청 사유<\/dt><dd id="officeDetailNeedsInfoReason"><\/dd>/.test(request),
  '접수 상세에 보완 요청 사유 행과 제목이 없다'
);
check(
  /sessionStorage/.test(controller) && !/(localStorage|indexedDB)/.test(request + core + controller + apiClient + photoClient),
  '포털이 허용되지 않은 영구 브라우저 저장소를 사용한다'
);
check(
  !/(APP_TOKEN|OFFICE_SESSION_SECRET|pinHash|pinSalt)/.test(request + core + controller + apiClient + photoClient + apiConfig),
  '포털 공개 소스 또는 설정에 비밀 식별자가 있다'
);
let parsedApiConfig = null;
try { parsedApiConfig = JSON.parse(apiConfig); } catch (_) { /* checked below */ }
// Git이 Windows checkout에서 LF를 CRLF로 바꾸어도 JSON 내용 계약은 같다.
// 줄바꿈만 정규화하고 공백·키·값의 exact 형식은 그대로 검사한다.
const normalizedApiConfig = apiConfig.replace(/\r\n/g, '\n');
check(isExactOfficeApiConfig(parsedApiConfig) && normalizedApiConfig === `${JSON.stringify(parsedApiConfig, null, 2)}\n`, 'office-api.json은 exact disabled 형식 또는 유효한 Apps Script /exec enabled 형식이어야 한다');
check(publicFiles.includes('office-api.json'), 'Pages 공개 허용목록에 office-api.json이 없다');
check(publicFiles.includes('js/office-request-api.js') && publicFiles.includes('js/office-request-photo.js'), 'Pages 공개 허용목록에 포털 API 또는 사진 파일이 없다');
check(!/office-request\.html/.test(sitemap), 'noindex 접수 페이지가 sitemap에 들어갔다');
/* 입주민 정보는 본인이 아닌 직원이 적는 제3자 정보다(2026-08 리드 감사 개인정보 렌즈).
   동의 문구에 목적·보관기간·처리방침이 있어야 '무엇에 동의하는지'가 성립하고,
   입주민 연락처는 직원이 입주민에게 알리고 동의를 받았다는 확인이 있어야 받는다.
   그 확인은 화면에서만 막고 전송 본문에는 싣지 않는다(서버 계약 불변). */
const consentLabel = (request.match(/<label class="office-consent"><input name="privacyConsent"[\s\S]*?<\/label>/) || [''])[0];
check(/href="privacy\.html"/.test(consentLabel) && /목적/.test(consentLabel) && /보관/.test(consentLabel),
  '접수 동의 문구에 목적·보관기간·처리방침 링크가 없다 — 직원이 무엇에 동의하는지 읽을 수 없다');
const residentBlock = (request.match(/<details>[\s\S]*?residentName[\s\S]*?<\/details>/) || [''])[0];
check(/name="residentInformed" type="checkbox"/.test(residentBlock) && /입주민에게[^<]*알리고/.test(residentBlock),
  '입주민 연락처 칸에 "입주민에게 알리고 동의를 받았다" 확인이 없다 — 제3자 정보를 확인 없이 받는다');
const coreSrc = read('js/office-request-core.js');
const requestSrc = read('js/office-request.js');
check(/value\.residentContact && data\.residentInformed !== true/.test(coreSrc),
  '접수 검증이 입주민 연락처가 있을 때 residentInformed 확인을 요구하지 않는다');
const payloadBody = (coreSrc.match(/function buildCreatePayload[\s\S]*?\n  }\n/) || [''])[0];
check(payloadBody.length > 0 && !/residentInformed/.test(payloadBody),
  '전송 본문(buildCreatePayload)에 residentInformed 가 실린다 — 서버 allowlist 계약이 바뀐다');
check(/residentInformed: !!\(get\('residentInformed'\)/.test(requestSrc),
  '접수 화면이 residentInformed 체크박스를 읽지 않는다 — 검증이 항상 막힌다');

check(!/(HOME DOC|담당 문규|homedoc\.co\.kr)/.test(request + office), '별도 HOME DOC 브랜드가 공개 화면에 남았다');

if (fail.length) {
  console.error(`FAIL  관리사무소 시설접수 연동 ${fail.length}건`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}

console.log('PASS  관리사무소 포털 API·사진·세션·비밀값·Pages 공개 경계');
