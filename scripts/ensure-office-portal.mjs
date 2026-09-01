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
  'portalRequestCode', 'portalVerifyCode', 'portalMe', 'portalLogout', 'portalDashboard', 'portalStatusList', 'portalStatusSave',
  'portalLogList', 'portalLogSave', 'portalUserList', 'portalUserSave', 'portalPermissionSave', 'portalAuditList',
];

check((files.office.match(/href="office-login\.html"/g) || []).length >= 2, '관리사무소 영업 페이지에 새 이메일 포털 진입점 두 개가 없습니다.');
check(/href="office-request\.html"[^>]*>기존 6자리 PIN 접수/.test(files.office), '기존 PIN 접수 포털 호환 링크가 없습니다.');
for (const page of ['login', 'portal', 'admin']) check(/name="robots" content="noindex,nofollow"/.test(files[page]), `${page} 페이지가 noindex,nofollow가 아닙니다.`);
check(!/(office-login|office-portal|office-admin)\.html/.test(files.sitemap), '비공개 포털 페이지가 sitemap에 들어갔습니다.');
check(files.login.includes('type="email"') && files.login.includes('autocomplete="one-time-code"') && !files.login.includes('type="password"'), '로그인 페이지가 이메일 OTP 전용이 아닙니다.');
check(/"enabled": false[\s\S]*"apiUrl": ""/.test(files.config) && Object.keys(JSON.parse(files.config)).sort().join(',') === 'apiUrl,enabled', '포털 API 기본 설정이 exact disabled가 아닙니다.');
check(actions.every((action) => files.api.includes(`'${action}'`)), '포털 API action 계약이 불완전합니다.');
check(/sessionStorage/.test(files.loginJs + files.portalJs + files.adminJs) && !/(localStorage|indexedDB)/.test(files.core + files.api + files.loginJs + files.portalJs + files.adminJs), '포털이 허용되지 않은 영구 브라우저 저장소를 사용합니다.');
check(/token,user,office,permissions,expiresAt/.test(files.core.replace(/\s+/g, '')) || /\{ token, user, office, permissions, expiresAt \}/.test(files.core), '세션 저장 필드 allowlist가 없습니다.');
check(/portalMe/.test(files.portalJs) && /portalMe/.test(files.adminJs) && /data-requires/.test(files.portal + files.admin), '서버 권한 재확인 또는 fail-closed 화면 계약이 없습니다.');
check(/source\.active;/.test(files.core) && /typeof active !== 'boolean'/.test(files.core) && /active !== true/.test(files.core), '사용자 active 값이 exact boolean과 활성 세션으로 검증되지 않습니다.');
check(/changeAccount\.disabled\s*=\s*value/.test(files.loginJs) && /if \(busy\) return;/.test(files.loginJs), 'OTP 검증 중 로그인 reset 경로가 잠기지 않습니다.');
check([files.portalJs, files.adminJs].every((code) => /LOGOUT_TIMEOUT_MS\s*=\s*1200/.test(code) && /clearSession\(sessionStorage\)/.test(code) && /portalLogout/.test(code)), '로그아웃의 즉시 로컬 삭제 또는 짧은 서버 타임아웃이 없습니다.');
check([files.portalJs, files.adminJs].every((code) => /crypto\.randomUUID\(\)/.test(code) && /dataset\.requestId/.test(code) && /delete form\.dataset\.requestId/.test(code)), '쓰기 작업의 v4 requestId 생성·재시도·초기화 수명주기가 없습니다.');
for (const action of ['portalStatusSave', 'portalLogSave', 'portalUserSave', 'portalPermissionSave']) check(new RegExp(`${action}[\\s\\S]{0,1800}requestId|requestId[\\s\\S]{0,1800}${action}`).test(files.portalJs + files.adminJs), `${action} payload에 requestId 연결이 없습니다.`);
check(!/(mock|demo|seedUser|sampleSession|service_role|SUPABASE_SERVICE_ROLE|APP_TOKEN|OFFICE_SESSION_SECRET)/i.test(files.core + files.api + files.loginJs + files.portalJs + files.adminJs + files.config), '공개 포털에 mock/demo 또는 서버 비밀 식별자가 있습니다.');
check((files.portal.match(/name="visibility"/g) || []).length === 2 && ['internal', 'board', 'public'].every((value) => files.portal.includes(`value="${value}"`)), '시설 상태와 관리 일지 공개 범위 필드가 없습니다.');
check(/마지막 관리자/.test(files.admin) && /last-admin/.test(files.api), '마지막 관리자 보호 안내 또는 오류 계약이 없습니다.');
for (const page of ['login', 'portal', 'admin']) {
  check(/<html[^>]*data-office-frame-pending/.test(files[page]) && /js\/office-frame-guard\.js/.test(files[page]), `${page} 페이지에 fail-closed top-frame 차단이 없습니다.`);
}
check(/window\.self\s*!==\s*window\.top/.test(files.frameGuard) && /about:blank/.test(files.frameGuard) && /removeAttribute\('data-office-frame-pending'\)/.test(files.frameGuard), 'top-frame 차단이 프레임에서 fail-closed하지 않습니다.');
check(/html\[data-office-frame-pending\]\s*\{\s*display:\s*none\s*!important/.test(read('css/office-portal.css')), '프레임 검사 전 화면을 숨기는 CSS가 없습니다.');
check(/X-Frame-Options/.test(design) && /GitHub Pages/.test(design) && /동일한 보안 보장/.test(design), 'GitHub Pages 응답 헤더 한계가 설계서에 문서화되지 않았습니다.');
check(['dashboard.view', 'status.view', 'status.manage', 'logs.view', 'logs.manage', 'requests.view', 'reports.view', 'notices.view', 'costs.view', 'admin.users.view', 'admin.users.manage', 'admin.permissions.manage', 'admin.audit.view'].every((capability) => design.includes(`\`${capability}\``)), '설계서의 capability 계약이 최신 13개 이름과 일치하지 않습니다.');
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
console.log('PASS  관리사무소 이메일 OTP·역할 권한·기존 PIN 호환·Pages 경계');
