import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const site = JSON.parse(read('data/site.json'));
const index = read('index.html');
const leak = read('leak.html');
const admin = read('admin.html');
const editor = read('js/content-editor.js');
const main = read('js/main.js');
const inquiry = read('js/inquiry.js');
const leakJs = read('js/leak.js');
const adminJs = read('js/admin.js');
const fail = [];
const check = (condition, message) => { if (!condition) fail.push(message); };

check(/id="contentEditor"[^>]*data-content-editor/.test(admin), '관리자 콘텐츠 편집기 영역이 없습니다.');
check(/js\/content-editor\.js/.test(admin), '관리자 콘텐츠 편집기 스크립트가 연결되지 않았습니다.');
for (const id of ['contentSave', 'contentPreview', 'contentDownload', 'contentImport', 'contentRequestCopy', 'contentClear']) {
  check(admin.includes(`id="${id}"`), `관리자 편집 도구 ${id} 버튼이 없습니다.`);
}
check(editor.includes("const DRAFT_KEY = 'manmul_site_content_draft_v1'"), '관리자 초안 키가 없습니다.');
check(main.includes("const CONTENT_DRAFT_KEY = 'manmul_site_content_draft_v1'"), '공개 미리보기와 관리자 초안 키가 다릅니다.');
check(/get\('preview'\) === '1'/.test(main), 'preview=1일 때만 초안을 읽는 안전 경계가 없습니다.');
check(/portfolio\.length >= 300/.test(main) && /MIN_PORTFOLIO = 300/.test(editor), '300개 디자인 보존 검사가 없습니다.');
check(/new Blob/.test(editor) && /site-수정본/.test(editor), '수정 site.json 내보내기가 없습니다.');
check(/JSON\.parse\(await file\.text\(\)\)/.test(editor), '기존 JSON 가져오기 기능이 없습니다.');
check(!/(?:api\.github\.com|Authorization|Bearer\s)/i.test(editor), '공개 관리자 편집기가 GitHub 자격증명을 직접 다루고 있습니다.');
check(/sensitiveKeyFound/.test(editor) && /HTML 기호/.test(editor), '가져온 콘텐츠의 비밀값·HTML 검사가 없습니다.');

check(Array.isArray(site.actualWork) && site.actualWork.length >= 3, 'data/site.json에 실제 현장 카드 3개가 없습니다.');
for (const [indexNo, item] of (site.actualWork || []).entries()) {
  check(item.title && item.desc && item.image && item.href, `실제 현장 ${indexNo + 1}번 필수값이 없습니다.`);
  check(fs.existsSync(path.join(ROOT, item.image || 'missing')), `실제 현장 ${indexNo + 1}번 사진 파일이 없습니다: ${item.image}`);
}
check(/id="actualWorkGrid"/.test(index) && /renderActualWork\(data\.actualWork\)/.test(main), '실제 현장 데이터가 공개 대문에 연결되지 않았습니다.');
check(!/href="admin\.html"/.test(index), '공개 대문에 관리자 링크가 다시 노출됐습니다.');

check(/id="projectGuide"/.test(index), '공사 시작 가이드가 없습니다.');
for (const key of ['full', 'partial', 'commercial', 'leak']) {
  check(index.includes(`data-project-guide="${key}"`) && main.includes(`${key}: {`), `공사 시작 가이드 ${key} 경로가 없습니다.`);
}
check(/params\.get\('scope'\)/.test(inquiry), '가이드에서 상담 범위를 자동 선택하지 못합니다.');

check(/id="firstResponse"/.test(leak) && /js\/leak\.js/.test(leak), '누수 첫 대응 체크리스트가 연결되지 않았습니다.');
check((leak.match(/responseChecks[\s\S]*?input type="checkbox"/g) || []).length >= 1, '누수 체크 항목이 없습니다.');
check((leak.match(/input type="checkbox" value=/g) || []).length === 4, '누수 첫 대응 체크 항목은 4개여야 합니다.');
check(/navigator\.clipboard/.test(leakJs) && !/localStorage|sessionStorage|fetch\(/.test(leakJs), '누수 체크 내용이 저장·전송되거나 복사 기능이 없습니다.');

check(/const live = route\.on;/.test(adminJs), '관리자 접수 상태가 실제 전달 경로 대신 demoMode를 보고 있습니다.');
check(/폼 설정 확인/.test(adminJs), '무료 폼 경로의 비파괴 설정 확인 안내가 없습니다.');

if (fail.length) {
  console.error('FAIL  관리자 편집기·방문자 도구 검증 실패');
  fail.forEach((message) => console.error(' - ' + message));
  process.exit(1);
}
console.log('PASS  관리자 콘텐츠 편집·미리보기·백업 + 공사 시작 가이드 + 누수 첫 대응 도구');
