#!/usr/bin/env node
/* 후기 수집 경로(review.html)가 '받을 수 있고, 새지 않고, 방침과 맞는' 상태인지 검사한다.
 *
 * 왜 생겼나(2026-10-23): 홈페이지 후기 섹션은 reviews:[] 로 비어 숨겨져 있었고, 고객 페이지의
 * "후기 작성" 버튼은 alert('데모') 였다 — 후기를 받을 통로 자체가 없었다. 이 검사가 막는 사고:
 *  1) 폼은 있는데 동의·허니팟·개인정보 차단 중 하나가 빠져 남의 정보가 섞인 후기가 그대로 나간다.
 *  2) 처리방침이 후기 항목을 밝히지 않는다.
 *  3) 대표가 data/site.json reviews 에 옮겨 적은 후기에 동·호수·전화가 남아 공개 페이지로 나간다.
 *  4) 고객 페이지 버튼이 다시 데모로 돌아가거나 푸터 링크·허용목록이 빠져 통로가 끊긴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const fail = [];
const ok = [];
const check = (cond, bad, good) => { if (cond) ok.push(good); else fail.push(bad); };

const html = read('review.html');
const js = read('js/review.js');
const transport = read('js/lead-transport.js');
const privacy = read('privacy.html');
const index = read('index.html');
const mypageJs = read('js/mypage.js');
const policy = read('scripts/pages-artifact-policy.mjs');
const css = read('css/review.css');
const site = JSON.parse(read('data/site.json'));

/* ① 페이지와 폼 요소 — 하나라도 빠지면 폼이 조용히 죽거나 동의 없이 나간다 */
check(/<meta name="robots" content="noindex"/.test(html), 'review.html 에 noindex 가 없다 — 고객용 후기 폼이 검색에 나간다', 'noindex');
for (const [id, what] of [
  ['reviewForm', '폼'], ['rvRating', '별점 묶음'], ['rvWorkType', '공사 종류'], ['rvSite', '현장'], ['rvText', '후기 내용'],
  ['rvName', '표시 이름'], ['rvPhone', '확인 연락처'], ['rvConsent', '개인정보 동의'], ['rvPublishConsent', '공개 동의'],
  ['rvCompanyUrl', '허니팟'], ['rvSubmit', '보내기 버튼'], ['rvStatus', '상태 표시'], ['rvDone', '결과 상자'],
]) check(new RegExp(`id="${id}"`).test(html), `review.html 에 ${what}(#${id})이 없다`, `#${id}`);
check((html.match(/name="rating"/g) || []).length === 5, '별점 라디오가 5개가 아니다', '별점 5단계');
check(/id="rvConsent"[^>]*\brequired\b/.test(html) && /id="rvPublishConsent"[^>]*\brequired\b/.test(html),
  '동의 체크박스에 required 가 없다', '동의 2종 required');
check(/id="rvCompanyUrl"[^>]*tabindex="-1"/.test(html) && /id="rvCompanyUrl"[^>]*aria-hidden="true"/.test(html),
  '허니팟이 사람에게 보이거나 탭 순서에 들어간다', '허니팟 숨김');
check(/maxlength="600"/.test(html) && /maxlength="40"/.test(html) && /maxlength="20"/.test(html),
  '후기·현장·표시 이름의 길이 상한이 없다', '입력 길이 상한');
check(/동·호수는 적지 마세요/.test(html), '현장 입력란이 동·호수를 적지 말라고 안내하지 않는다', '동·호수 안내');

/* ② 스크립트 순서 — 규칙 정본과 공용 전송 모듈이 먼저 와야 폼이 산다 */
const order = (first, second) => {
  const a = html.indexOf(first);
  const b = html.indexOf(second);
  check(a >= 0 && b >= 0 && a < b, `review.html 에서 ${first} 가 ${second} 보다 뒤에 있거나 없다 — 폼이 조용히 죽는다`, `${first} → ${second}`);
};
order('js/pii-rules.js', 'js/review.js');
order('js/lead-transport.js', 'js/review.js');

/* ③ review.js 동작 */
check(/type:\s*'후기'/.test(js), 'review.js 가 type 후기로 보내지 않는다 — 대표 메일함에서 상담과 섞인다', 'type 후기');
check(/MANMUL_PII_RULES/.test(js) && /!==\s*'고객명'/.test(js),
  'review.js 가 js/pii-rules.js 정본을 쓰지 않거나 고객명 규칙 제외가 없다(표시 이름 "김○○ 고객" 오탐)', '개인정보 규칙 정본 사용');
check(/piiKinds\(data\[key\]\)/.test(js) && /\['site'/.test(js) && /\['reviewText'/.test(js) && /\['displayName'/.test(js),
  '현장·후기·표시 이름 세 곳을 모두 전송 전에 검사하지 않는다', '세 입력란 전송 전 검사');
check(/publishConsent/.test(js) && /공개에 동의해 주세요/.test(js), '공개 동의가 없어도 전송된다', '공개 동의 없으면 전송 안 함');
check(/data\.consent\b/.test(js) && /개인정보 수집·이용에 동의해 주세요/.test(js), '개인정보 동의가 없어도 전송된다', '개인정보 동의 없으면 전송 안 함');
check(/LEAD\.deliver\(/.test(js) && !/fetch\(\s*['"`]https?:/.test(js), '전송이 공용 모듈(lead-transport)을 거치지 않는다', '공용 전송 모듈');
check(!/(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem)\s*\(/.test(js), 'review.js 가 후기 개인정보를 브라우저 영구 저장소에 둔다', '영구 저장소 미사용');
check(/rvCompanyUrl/.test(js) && /honeypot:\s*true/.test(js), '허니팟 처리가 없다', '허니팟 처리');
check(/대표가 확인한 뒤/.test(js), '접수 안내가 "대표 확인 후 게시"를 말하지 않는다', '게시 전 확인 안내');
check(/rvRetry/.test(js) && /LEAD\.retryLatest\(/.test(js) && /'sms:'/.test(js) && /copyToClipboard/.test(js),
  '실패 화면에 다시 시도·문자·복사가 없다', '실패 대안 경로');
check(/delete payload\.consent/.test(js) && /privacyConsent:\s*true/.test(js), '동의가 privacyConsent 로 메일에 실리지 않는다', 'privacyConsent 기록');

/* ④ 전송 모듈 — 후기는 상담 본문이 아니라 후기 본문으로 나가고 제목이 다르다 */
check(/function buildReviewText/.test(transport) && /d\.type === '후기'/.test(transport),
  'lead-transport 가 후기 본문을 따로 만들지 않는다(공간: 후기 같은 상담 줄이 나간다)', '후기 본문');
check(/\[만물인테리어 고객 후기\]/.test(transport) && /홈페이지 공개 동의/.test(transport) && /확인 연락처\(비공개\)/.test(transport),
  '후기 본문에 머리글·공개 동의·비공개 연락처 표시가 없다', '후기 본문 항목');
check(/\[홈페이지 후기\]/.test(transport) && /\[홈페이지 상담\]/.test(transport), '메일 제목이 후기와 상담을 구분하지 않는다', '메일 제목 구분');

/* ⑤ 처리방침 — 받는 항목·공개 범위·차단·삭제 창구 */
const notice = (privacy.match(/<p id="privacy-review-items">([\s\S]*?)<\/p>/) || [])[1] || '';
for (const word of ['별점', '공사 종류', '현장', '후기 내용', '표시 이름', '확인 연락처', '공개 동의', '대표가 확인', '동·호수', '차단', '지우', '010-2397-8629']) {
  check(notice.includes(word), `처리방침 후기 문단(#privacy-review-items)에 "${word}" 가 없다`, `방침: ${word}`);
}
check(/privacy\.html#privacy-review-items/.test(html), 'review.html 이 처리방침 후기 문단으로 연결되지 않는다', '방침 링크');

/* ⑥ 통로 — 손님이 폼에 닿는 길과 배포 허용목록 */
check(/href="review\.html"/.test(index.split('<footer')[1] || ''), 'index.html 푸터에 후기 남기기 링크가 없다', '푸터 링크');
check(/href="review\.html"/.test(mypageJs) && !/alert\([^)]*후기/.test(mypageJs),
  'mypage 의 후기 작성 버튼이 데모 alert 거나 review.html 로 가지 않는다', 'mypage 실연결');
check(/'review\.html'/.test(policy) && /'review\.js'/.test(policy),
  'review.html/review.js 가 공개 허용목록(scripts/pages-artifact-policy.mjs)에 없다 — 배포에서 조용히 빠진다', '허용목록');
check(/\.app-form\[hidden\][^{]*\{\s*display:\s*none/.test(css),
  '전송 뒤 폼을 숨기는 CSS 가 없다(.app-form 은 flex 라 hidden 속성만으로는 안 숨는다)', '폼 숨김 CSS');

/* ⑦ 공개 후기 데이터 — 대표가 site.json 에 옮겨 적은 뒤에도 남의 정보가 공개 페이지로 나가지 않게.
   규칙 정본은 js/pii-rules.js (사본 금지). 고객명 규칙은 산문 오탐이라 배포 검사(site-integrity)와 같이 뺀다. */
const PII_RULES = (() => {
  const sandbox = { window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(read('js/pii-rules.js') + '\n;MANMUL_PII_RULES;', sandbox, { filename: 'js/pii-rules.js' });
  const rules = sandbox.MANMUL_PII_RULES;
  if (!Array.isArray(rules) || !rules.length) { fail.push('js/pii-rules.js 에서 규칙을 읽지 못했다'); return []; }
  return Array.from(rules, (r) => [String(r[0]), r[1]]).filter((r) => r[0] !== '고객명');
})();
const reviews = Array.isArray(site.reviews) ? site.reviews : [];
reviews.forEach((r, i) => {
  const where = `data/site.json reviews[${i}]`;
  check(r && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5, `${where} 별점이 1~5 정수가 아니다`, `${where} 별점`);
  check(typeof r?.text === 'string' && r.text.trim().length >= 10, `${where} 후기 본문이 10자 미만이다`, `${where} 본문`);
  check(typeof r?.name === 'string' && r.name.trim() && typeof r?.space === 'string' && r.space.trim(), `${where} 에 표시 이름·현장이 없다`, `${where} 이름·현장`);
  const hit = PII_RULES.find(([, re]) => re.test([r?.name, r?.space, r?.text].join('\n')));
  check(!hit, `${where} 에 ${hit && hit[0]}로 보이는 값이 있다 — 공개 페이지에 그대로 나간다`, `${where} 개인정보 없음`);
});

if (fail.length) {
  console.error(`✗ 후기 수집 경로 ${fail.length}건 문제`);
  fail.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log(`✓ 후기 수집 경로 정상 — 확인 ${ok.length}건 · 공개 후기 ${reviews.length}건 개인정보 검사`);
