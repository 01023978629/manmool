import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('index.html');
const leak = read('leak.html');
const main = read('js/main.js');
const inquiry = read('js/inquiry.js');
const site = JSON.parse(read('data/site.json'));
const fail = [];
const check = (condition, message) => { if (!condition) fail.push(message); };

const indexHead = index.split('</head>')[0] || '';
const indexBody = index.split('</head>')[1] || '';
const leakHead = leak.split('</head>')[0] || '';

check(/<title>[^<]*대전 인테리어·리모델링/.test(indexHead), 'index.html 검색 제목이 인테리어 중심이 아니다');
check(!/<title>[^<]*누수탐지/.test(indexHead), 'index.html 검색 제목에 누수탐지가 주업종처럼 남아 있다');
check(/id="realWork"/.test(index) && (index.match(/class="real-work-card"/g) || []).length >= 3,
  'index.html 에 실제 현장 공정 카드 3개가 없다');
check((index.match(/class="real-work-photo"/g) || []).length === (index.match(/실제 (?:현장|공정) ·/g) || []).length,
  '실제 현장 사진의 출처 구분 라벨이 빠졌다');
check(/완공 사례가 아닌 <b>자체 제작 AI 참고 시안/.test(index), 'AI 디자인을 완공 사례와 구분하는 고지가 없다');
check(/data-featured-slugs="apt-office-construction-notice,budget-guide-34py,partial-vs-full-remodel"/.test(index),
  '인테리어 대문 추천 글이 누수 최신글과 분리되지 않았다');
check(/dataset\.featuredSlugs/.test(main), '추천 인테리어 글 순서를 읽는 렌더 로직이 없다');
check(/id="reviews" hidden/.test(index) && /reviews\.length === 0[\s\S]{0,100}section\.hidden = true/.test(main),
  '실제 후기가 없을 때 빈 리뷰 섹션을 숨기는 장치가 없다');
check(!/href="admin\.html"/.test(indexBody) && !/현장관리\(데모\)|웹 리드 관리|연동 가이드/.test(indexBody),
  '공개 인테리어 대문에 운영자·데모 메뉴가 노출된다');
check(site.company.tagline.includes('견적부터 보증까지') && site.services[0]?.title.includes('전체 리모델링'),
  'data/site.json 의 첫 화면·서비스 정본이 아직 누수 중심이다');
check(/data-surface="leak-only"/.test(index) && /section\.dataset\.surface === 'leak-only'/.test(main),
  '누수 요금표가 인테리어 대문에서 다시 열릴 수 있다');

check(/"@type": "HomeAndConstructionBusiness"/.test(leakHead), 'leak.html 지역 업체 구조화 데이터가 없다');
check(/"@type": "FAQPage"/.test(leakHead), 'leak.html FAQ 구조화 데이터가 없다');
check(/og:image/.test(leakHead) && /case-hanbat-drain\.jpg/.test(leakHead), 'leak.html 공유용 실제 현장 이미지가 없다');
check((leak.match(/class="case-card registered-case"/g) || []).length === 3,
  'leak.html 실제 사례·공정 카드가 3개가 아니다');
check((leak.match(/assets\/cases\/case-(?:hanbat-drain|blue-floor|blue-mesh)\.jpg/g) || []).length >= 4,
  'leak.html 사례 카드가 검증한 실제 공정 사진을 사용하지 않는다');
check(/index\.html\?type=누수#inquiry/.test(leak), '누수 페이지에서 온라인 상담으로 이어지는 링크가 없다');
check(/(?:new URLSearchParams\(location\.search\)\.get|params\.get)\('type'\)/.test(inquiry),
  '누수 온라인 상담 링크의 유형을 폼에 자동 반영하지 않는다');
check(!/무조건|최저가|100%/.test(leak), '누수 홍보 문구에 과장 표현이 남아 있다');

if (fail.length) {
  console.error(`FAIL  홍보 페이지 분리·전환 ${fail.length}건`);
  fail.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}

console.log('PASS  누수 실제 사례·SEO·온라인 상담 + 인테리어 전용 대문·현장 증거·전환 동선');
