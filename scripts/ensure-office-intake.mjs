import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const office = read('office.html');
const request = read('office-request.html');
const core = read('js/office-request-core.js');
const controller = read('js/office-request.js');
const privacy = read('privacy.html');
const build = read('scripts/build-pages-artifact.mjs');
const sitemap = read('sitemap.xml');
const fail = [];
const check = (condition, message) => { if (!condition) fail.push(message); };

check(
  (office.match(/href="office-request\.html"/g) || []).length >= 2,
  '영업 페이지에 시설접수 진입점 2개가 없다'
);
check(/id="officeRequestIntro"/.test(office), '단지 전용 시설접수 소개 구역이 없다');
check(/name="robots" content="noindex,follow"/.test(request), '접수 페이지 noindex가 없다');
check(/01023978629/.test(core) && /010-2397-8629/.test(request), '대표번호가 일치하지 않는다');
check(
  !/(localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|Web3Forms)/.test(request + core + controller),
  '접수 화면이 저장소나 네트워크 전송을 사용한다'
);
check(/문자 앱에서 전송 버튼/.test(request), '전송 전 확인 안내가 없다');
check(
  /문자 접수[\s\S]*1년/.test(privacy) && /브라우저에는[^<]*저장하지/.test(privacy),
  '문자 접수 개인정보 고지가 불완전하다'
);
check(/'office-request\.html'/.test(build), 'Pages 공개 허용목록에 접수 페이지가 없다');
check(!/office-request\.html/.test(sitemap), 'noindex 접수 페이지가 sitemap에 들어갔다');
check(!/(HOME DOC|담당 문규|homedoc\.co\.kr)/.test(request + office), '별도 HOME DOC 브랜드가 공개 화면에 남았다');

if (fail.length) {
  console.error(`FAIL  관리사무소 시설접수 연동 ${fail.length}건`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}

console.log('PASS  관리사무소 시설접수 링크·개인정보·저장금지·Pages 허용목록');
