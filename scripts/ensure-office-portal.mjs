import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedPublicFiles } from './pages-artifact-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const files = {
  office: read('office.html'), login: read('office-login.html'), portal: read('office-portal.html'), admin: read('office-admin.html'),
  core: read('js/office-portal-core.js'), api: read('js/office-portal-api.js'), loginJs: read('js/office-login.js'),
  portalJs: read('js/office-portal.js'), adminJs: read('js/office-admin.js'), frameGuard: read('js/office-frame-guard.js'),
  config: read('office-portal-api.json'), sitemap: read('sitemap.xml'),
};
const design = read('docs/superpowers/specs/2026-09-01-office-role-portal-design.md');
const source = Object.values(files).join('\n');
const publicFiles = new Set(expectedPublicFiles(ROOT).map(({ relative }) => relative));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const actions = [
  'portalLogin', 'portalMe', 'portalLogout', 'portalDashboard', 'portalStatusList', 'portalStatusSave',
  'portalLogList', 'portalLogSave', 'portalUserList', 'portalUserSave', 'portalPermissionSave', 'portalAuditList',
  'portalWorkOrderList', 'portalWorkOrderSave', 'portalNoticeList', 'portalNoticeSave',
  'portalCostList', 'portalCostSave', 'portalCostApprove', 'portalReportSummary',
];

check((files.office.match(/href="office-login\.html"/g) || []).length >= 2, '관리사무소 영업 페이지에 직원 포털 진입점 두 개가 없습니다.');
check(/href="office-request\.html"[^>]*>기존 6자리 PIN 접수/.test(files.office), '기존 PIN 접수 포털 호환 링크가 없습니다.');
for (const page of ['login', 'portal', 'admin']) check(/name="robots" content="noindex,nofollow"/.test(files[page]), `${page} 페이지가 noindex,nofollow가 아닙니다.`);
check(!/(office-login|office-portal|office-admin)\.html/.test(files.sitemap), '비공개 포털 페이지가 sitemap에 들어갔습니다.');
// 인증번호 칸은 one-time-code 여야 한다 — current/new-password 면 브라우저가 '비밀번호 저장?'을 띄워
// 관리자 PC 의 비밀번호 관리자에 직원·입주민 인증번호가 평문으로 남는다(화면 문구 '브라우저에 저장하지 않습니다'와 어긋남).
check(files.login.includes('type="email"') && files.login.includes('name="loginCode"') && files.login.includes('autocomplete="one-time-code"'), '로그인 페이지가 관리자 발급 인증번호 방식이 아닙니다.');
check(/"enabled": false[\s\S]*"apiUrl": ""/.test(files.config) && Object.keys(JSON.parse(files.config)).sort().join(',') === 'apiUrl,enabled', '포털 API 기본 설정이 exact disabled가 아닙니다.');
check(actions.every((action) => files.api.includes(`'${action}'`)), '포털 API action 계약이 불완전합니다.');
check(/sessionStorage/.test(files.loginJs + files.portalJs + files.adminJs) && !/(localStorage|indexedDB)/.test(files.core + files.api + files.loginJs + files.portalJs + files.adminJs), '포털이 허용되지 않은 영구 브라우저 저장소를 사용합니다.');
check(/token,user,office,permissions,expiresAt/.test(files.core.replace(/\s+/g, '')) || /\{ token, user, office, permissions, expiresAt \}/.test(files.core), '세션 저장 필드 allowlist가 없습니다.');
check(/portalMe/.test(files.portalJs) && /portalMe/.test(files.adminJs) && /data-requires/.test(files.portal + files.admin), '서버 권한 재확인 또는 fail-closed 화면 계약이 없습니다.');
check(/source\.active;/.test(files.core) && /typeof active !== 'boolean'/.test(files.core) && /active !== true/.test(files.core), '사용자 active 값이 exact boolean과 활성 세션으로 검증되지 않습니다.');
check(/loginButton\.disabled\s*=\s*value/.test(files.loginJs) && /if \(busy\s*\|\|/.test(files.loginJs), '로그인 처리 중 중복 제출이 차단되지 않습니다.');
check(/name="loginCode"[^>]*autocomplete="one-time-code"/.test(files.admin) && /loginCodeConfigured/.test(files.adminJs), '관리자 인증번호 발급·설정 상태 화면이 없습니다.');
// 로그인 실패 뒤 포커스는 인증번호 칸으로 돌아와야 한다(제출 버튼 disabled 로 포커스 소실).
check(/loginError\.textContent = loginMessage\(error\);\s*\n[^\n]*\n\s*focusField\('loginCode'\)/.test(files.loginJs), '로그인 실패 뒤 포커스가 인증번호 칸으로 돌아오지 않습니다.');
// 실패·잠금·미설정 문구에 전화 안내 — 재시도만 말하면 직원은 갈 곳이 없다.
for (const code of ['invalid-credentials', 'rate-limited', 'not-configured']) check(new RegExp(`'${code}': '[^']*010-2397-8629`).test(files.api), `${code} 문구에 전화 안내가 없습니다.`);
// 세션 만료 10분 전 경고 — 작성 중 내용을 잃기 전에 보여야 한다.
check(/SESSION_NOTICE_LEAD_MS = 10 \* 60 \* 1000/.test(files.portalJs) && /scheduleSessionNotice\(session\.expiresAt\)/.test(files.portalJs) && /id="portalSessionNotice"[^>]*role="status"/.test(files.portal), '세션 만료 임박 안내가 없습니다.');
// 로그아웃 요청은 keepalive 여야 한다 — 화면 이동이 진행 중 fetch 를 끊으면 서버 세션이 8시간 살아남는다(2026-09-03 보안 검토).
check(/options\.keepalive === true \? \{ keepalive: true \}/.test(files.api) && [files.portalJs, files.adminJs].every((code) => /api\.call\('portalLogout', \{[\s\S]{0,120}?keepalive: true/.test(code)), '로그아웃 요청이 keepalive 가 아닙니다 — 화면 이동이 서버 세션 폐기를 끊습니다.');
// 로그인 실패는 한 문구로 접는다 — 코드별 문구를 그대로 내면 등록된 이메일인지 화면이 알려 준다.
check(/LOGIN_PASSTHROUGH/.test(files.loginJs) && /loginError\.textContent = loginMessage\(error\)/.test(files.loginJs) && !/loginError\.textContent = apiMessage\(error\)/.test(files.loginJs), '로그인 실패 문구가 코드별로 갈립니다 — 사용자 존재 여부가 드러납니다.');
// 세션 만료 상한은 설계 8시간에 시계 오차만 더한 값이어야 한다.
check(/MAX_SESSION_MS = 9 \* 60 \* 60 \* 1000/.test(files.core) && /expiresAt > now \+ MAX_SESSION_MS/.test(files.core), '세션 만료 상한이 설계(8시간)에서 벗어납니다.');
check([files.portalJs, files.adminJs].every((code) => /LOGOUT_TIMEOUT_MS\s*=\s*1200/.test(code) && /clearSession\(sessionStorage\)/.test(code) && /portalLogout/.test(code)), '로그아웃의 즉시 로컬 삭제 또는 짧은 서버 타임아웃이 없습니다.');
check([files.portalJs, files.adminJs].every((code) => /crypto\.randomUUID\(\)/.test(code) && /dataset\.requestId/.test(code) && /delete form\.dataset\.requestId/.test(code)), '쓰기 작업의 v4 requestId 생성·재시도·초기화 수명주기가 없습니다.');
check(/addEventListener\('input',\s*\(\)\s*=>\s*clearOperationRequest\(form\)\)/.test(files.portalJs) && /addEventListener\('change',\s*\(\)\s*=>\s*clearOperationRequest\(form\)\)/.test(files.portalJs), '포털 저장 폼의 입력 변경 시 requestId가 새로 발급되지 않습니다.');
for (const action of ['portalStatusSave', 'portalLogSave', 'portalWorkOrderSave', 'portalNoticeSave', 'portalCostSave', 'portalCostApprove', 'portalUserSave', 'portalPermissionSave']) check(new RegExp(`${action}[\\s\\S]{0,2600}requestId|requestId[\\s\\S]{0,2600}${action}`).test(files.portalJs + files.adminJs), `${action} payload에 requestId 연결이 없습니다.`);
for (const [key, idKey] of [['status', 'statusId'], ['log', 'logId'], ['workOrder', 'workOrderId'], ['notice', 'noticeId'], ['cost', 'costId']]) check(files.portalJs.includes(`committedEntity(response, '${key}', '${idKey}')`) && files.portalJs.includes(`upsertRecord(`), `${key} 저장 성공 응답을 로컬 목록에 즉시 반영하지 않습니다.`);
check(!/(mock|demo|seedUser|sampleSession|service_role|SUPABASE_SERVICE_ROLE|APP_TOKEN|OFFICE_SESSION_SECRET)/i.test(files.core + files.api + files.loginJs + files.portalJs + files.adminJs + files.config), '공개 포털에 mock/demo 또는 서버 비밀 식별자가 있습니다.');
check((files.portal.match(/name="visibility"/g) || []).length >= 4 && ['internal', 'board', 'public'].every((value) => files.portal.includes(`value="${value}"`)), '운영 기록 공개 범위 필드가 없습니다.');
check(['received', 'planned', 'working', 'blocked', 'completed', 'cancelled'].every((value) => files.portal.includes(`value="${value}"`)) && !/(value="requested"|value="assigned"|value="in_progress")/.test(files.portal), '작업지시 상태 표시가 서버 계약과 다릅니다.');
check(/<select name="assigneeUserId">/.test(files.portal) && /workOrderStatusOptions/.test(files.portalJs) && /costApprovalTargets/.test(files.portalJs), '담당자 선택 또는 상태 전이 화면 보호가 없습니다.');
check(/value="archived"/.test(files.portal) && /noticeStateOptions/.test(files.portalJs), '공지 보관 상태와 전이 보호가 없습니다.');
check(/name="amountKrw"[^>]*min="1"[^>]*max="1000000000"/.test(files.portal) && ['included', 'excluded', 'exempt'].every((value) => files.portal.includes(`value="${value}"`)) && !/(value="inclusive"|value="exclusive")/.test(files.portal), '비용 금액·세금 값이 서버 계약과 다릅니다.');
check(/can\('costs\.manage'\)\s*&&\s*row\.status\s*===\s*'draft'/.test(files.portalJs) && !/\['draft',\s*'submitted'\]\.includes\(row\.status\)/.test(files.portalJs), '승인 요청 이후 비용 수정 버튼이 노출됩니다.');
check(/costApprovalRequestIds\s*=\s*new Map\(\)/.test(files.portalJs) && /JSON\.stringify\(\[String\(row\.costId/.test(files.portalJs) && /costApprovalRequestIds\.delete\(operationKey\)/.test(files.portalJs), '비용 승인 재시도 requestId가 DOM 재렌더링을 견디지 못합니다.');
check(/loadGeneration\s*=\s*\{\s*dashboard:/.test(files.portalJs) && /Object\.keys\(loadGeneration\)/.test(files.portalJs), '대시보드 중복 요청 또는 로그아웃 후 늦은 응답 폐기가 없습니다.');
check(files.portalJs.indexOf('const g = ++loadGeneration.reports') >= 0 && files.portalJs.indexOf('const g = ++loadGeneration.reports') < files.portalJs.indexOf('if (!startDate'), '유효하지 않은 보고 기간이 이전 집계 응답을 무효화하지 않습니다.');
check(!/(can\('admin\.users'\)|can\('admin\.permissions'\))/.test(files.portalJs) && /admin\.users\.view/.test(files.portalJs) && /portalEmptyAdmin/.test(files.portalJs), 'system_admin 빈 화면의 권한 관리 진입 경로가 잘못되었습니다.');
check(/reportLabel/.test(files.portalJs) && ['pendingAmountKrw', 'approvedUnpaidAmountKrw', 'paidAmountKrw'].every((key) => files.portalJs.includes(key)) && /운영보고/.test(files.core) && /기존 PIN 시설보수 접수/.test(files.core), '운영보고 금액·메뉴 표시명이 불명확합니다.');
check(/마지막 관리자/.test(files.admin) && /last-admin/.test(files.api), '마지막 관리자 보호 안내 또는 오류 계약이 없습니다.');
for (const page of ['login', 'portal', 'admin']) {
  check(/<html[^>]*data-office-frame-pending/.test(files[page]) && /js\/office-frame-guard\.js/.test(files[page]), `${page} 페이지에 fail-closed top-frame 차단이 없습니다.`);
}
check(/window\.self\s*!==\s*window\.top/.test(files.frameGuard) && /about:blank/.test(files.frameGuard) && /removeAttribute\('data-office-frame-pending'\)/.test(files.frameGuard), 'top-frame 차단이 프레임에서 fail-closed하지 않습니다.');
check(/html\[data-office-frame-pending\]\s*\{\s*display:\s*none\s*!important/.test(read('css/office-portal.css')), '프레임 검사 전 화면을 숨기는 CSS가 없습니다.');
check(/X-Frame-Options/.test(design) && /GitHub Pages/.test(design) && /동일한 보안 보장/.test(design), 'GitHub Pages 응답 헤더 한계가 설계서에 문서화되지 않았습니다.');
check(['dashboard.view', 'status.view', 'status.manage', 'logs.view', 'logs.manage', 'requests.view', 'reports.view', 'notices.view', 'costs.view', 'workorders.view', 'workorders.manage', 'workorders.assign', 'notices.manage', 'notices.publish', 'costs.manage', 'costs.approve', 'admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view'].every((capability) => design.includes(`\`${capability}\``)), '설계서의 capability 계약이 최신 이름과 일치하지 않습니다.');
for (const action of ['portalWorkOrderList', 'portalWorkOrderSave', 'portalNoticeList', 'portalNoticeSave', 'portalCostList', 'portalCostSave', 'portalCostApprove', 'portalReportSummary']) check(design.includes(action), `설계서에 ${action} 계약이 없습니다.`);
check(!/(dashboard\.read|status\.read|status\.write|log\.read|log\.write|request\.read|request\.create|users\.read|audit\.read)/.test(design), '설계서에 폐기된 capability 이름이 남아 있습니다.');
check(/portalBootstrapFromProperties_/.test(design) && /최초 단지와 `system_admin` 등록/.test(design), '설계서의 초기 관리자 bootstrap 설명이 실제 구현과 다릅니다.');
check(['portalStatusSave', 'portalLogSave', 'portalUserSave', 'portalPermissionSave', 'v4 UUID', '`requestId`'].every((value) => design.includes(value)), '설계서에 쓰기 idempotency requestId 계약이 없습니다.');
for (const relative of [
  'office-login.html', 'office-portal.html', 'office-admin.html', 'office-portal-api.json', 'css/office-portal.css',
  'js/office-frame-guard.js', 'js/office-portal-core.js', 'js/office-portal-api.js', 'js/office-login.js', 'js/office-portal.js', 'js/office-admin.js',
]) check(publicFiles.has(relative), `Pages 공개 허용목록에 ${relative}가 없습니다.`);

if (failures.length) {
  console.error(`FAIL  관리사무소 역할 포털 안전검사 ${failures.length}건`);
  failures.forEach((message) => console.error(`  - ${message}`));
  process.exit(1);
}
console.log('PASS  관리자 발급 인증번호·역할 권한·기존 PIN 호환·Pages 경계');
