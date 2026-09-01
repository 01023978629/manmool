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
  (office.match(/href="office-request\.html"/g) || []).length >= 2,
  '영업 페이지에 시설접수 진입점 2개가 없다'
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
check(/20260901-office-entry1/.test(request), '직원 포털 진입 변경 자산 cache marker가 없다');
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
check(!/(HOME DOC|담당 문규|homedoc\.co\.kr)/.test(request + office), '별도 HOME DOC 브랜드가 공개 화면에 남았다');

if (fail.length) {
  console.error(`FAIL  관리사무소 시설접수 연동 ${fail.length}건`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}

console.log('PASS  관리사무소 포털 API·사진·세션·비밀값·Pages 공개 경계');
