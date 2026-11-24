'use strict';
/* 문의 출처(utm_*)가 쪽 안에서 주소가 바뀌어도 남는가 (2026-11-25)

   손님이 당근·블로그 링크(…?utm_source=daangn)로 들어와 시안 창을 열고 닫으면 main.js 가 history.replaceState 로
   주소를 다시 쓰는데, 예전에는 ?검색어를 빼고 써서 꼬리표가 사라졌다. 그리고 인테리어 폼은 보낼 때의 주소를 읽었다.
   이제 ① inquiry.js 는 읽히는 순간 처음 주소에서 출처를 한 번 잡아 두고 ② main.js 는 주소를 다시 쓸 때 ?검색어를 지키며
   ③ 공사 시작 가이드의 상담 링크(index.html?type=…)는 지금 주소의 utm_* 를 이어 붙인다.
   브라우저 없이 원본 파일을 node:vm 으로 그대로 읽어 확인한다(사본 금지). 화면 흐름은 tests/inquiry-receipt.e2e.cjs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function loadMain(search) {
  const location = { origin: 'http://127.0.0.1:8000', pathname: '/index.html', search, hash: '' };
  const context = {
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    console, setTimeout, clearTimeout, URLSearchParams, location,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('js/main.js'), context, { filename: 'js/main.js' });
  return context;
}

test('주소를 다시 쓸 때(시안 창 닫기·#design=·#sim= 링크) ?utm_* 검색어를 지킨다', () => {
  const main = loadMain('?utm_source=daangn&utm_medium=profile');
  assert.equal(main.currentPageUrl([]), 'http://127.0.0.1:8000/index.html?utm_source=daangn&utm_medium=profile');
  assert.equal(main.currentPageUrl(['sim=x', 'design=d1']), 'http://127.0.0.1:8000/index.html?utm_source=daangn&utm_medium=profile#sim=x&design=d1');
  assert.equal(loadMain('').currentPageUrl(['design=d1']), 'http://127.0.0.1:8000/index.html#design=d1');
  // 시안 창 닫기와 MANMUL_HASH.build 가 이 함수를 쓴다(예전 꼴로 돌아가면 이 검사가 잡는다).
  const src = read('js/main.js');
  assert.match(src, /history\.replaceState\(null, '', currentPageUrl\(parts\)\);/);
  assert.match(src, /parts\.push\(key \+ '=' \+ encodeURIComponent\(value\)\);\s*return currentPageUrl\(parts\);/);
  assert.doesNotMatch(src, /location\.origin \+ location\.pathname \+ (?:'#'|\(parts)/);
});

test('공사 시작 가이드의 상담 링크는 지금 주소의 utm_* 를 이어 붙이고, 꼬리표가 없으면 그대로 둔다', () => {
  const main = loadMain('?utm_source=naver_blog&utm_medium=blog&utm_campaign=bath-1125&other=1');
  const carried = main.withCampaignParams('index.html?type=주거&scope=전체#inquiry');
  const url = new URL(carried, 'http://127.0.0.1:8000/');
  assert.equal(url.pathname, '/index.html');
  assert.equal(url.hash, '#inquiry');
  assert.equal(url.searchParams.get('type'), '주거');
  assert.equal(url.searchParams.get('scope'), '전체');
  assert.equal(url.searchParams.get('utm_source'), 'naver_blog');
  assert.equal(url.searchParams.get('utm_medium'), 'blog');
  assert.equal(url.searchParams.get('utm_campaign'), 'bath-1125');
  assert.equal(url.searchParams.has('other'), false, 'utm_* 밖의 값은 옮기지 않는다');
  assert.equal(new URL(main.withCampaignParams('leak.html#leakInquiry'), 'http://x/').searchParams.get('utm_source'), 'naver_blog');
  assert.equal(main.withCampaignParams('#estimator'), '#estimator', '쪽 안 해시 이동은 그대로');
  assert.equal(main.withCampaignParams('https://pf.kakao.com/_x'), 'https://pf.kakao.com/_x', '바깥 주소에는 붙이지 않는다');
  assert.equal(new URL(loadMain('?utm_source=daangn').withCampaignParams('index.html?utm_source=kakao_channel#inquiry'), 'http://x/').searchParams.get('utm_source'),
    'kakao_channel', '링크에 이미 있는 꼬리표는 덮지 않는다');
  assert.equal(loadMain('').withCampaignParams('index.html?type=주거&scope=전체#inquiry'), 'index.html?type=주거&scope=전체#inquiry');
  assert.match(read('js/main.js'), /href="\$\{escapeContent\(withCampaignParams\(item\.secondary\[1\]\)\)\}"/);
});

test('인테리어 폼은 읽히는 순간 처음 주소에서 출처를 한 번 잡고, 뒤에 주소가 바뀌어도 그 사본을 보낸다', () => {
  const location = { origin: 'http://127.0.0.1:8000', pathname: '/index.html', search: '?utm_source=daangn&utm_medium=profile&utm_campaign=interior-1125', hash: '' };
  const context = { console, URLSearchParams, URL, location, setTimeout, clearTimeout };
  context.window = context;
  context.document = { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  context.ManmulLead = { buildLeadText: () => '', copyToClipboard: async () => true, backendConfigured: () => false, deliver: async () => false };
  vm.createContext(context);
  vm.runInContext(read('js/revenue-conversion.js'), context, { filename: 'js/revenue-conversion.js' });
  const calls = [];
  const real = context.ManmulRevenue.captureLeadMetadata;
  context.ManmulRevenue.captureLeadMetadata = (where, ctaId, ref) => {
    const result = real(where, ctaId, ref);
    calls.push({ where: { pathname: where.pathname, search: where.search }, ctaId, result: JSON.parse(JSON.stringify(result)) });
    return result;
  };
  vm.runInContext(read('js/inquiry.js'), context, { filename: 'js/inquiry.js' });
  assert.equal(calls.length, 1, '읽히는 순간 한 번만 잡는다');
  assert.deepEqual(calls[0].where, { pathname: '/index.html', search: '?utm_source=daangn&utm_medium=profile&utm_campaign=interior-1125' });
  assert.equal(calls[0].ctaId, 'index-inquiry-submit');
  assert.deepEqual(calls[0].result, { sourcePage: '/index.html', ctaId: 'index-inquiry-submit', utmSource: 'daangn', utmMedium: 'profile', utmCampaign: 'interior-1125' });
  assert.equal(typeof context.initInquiry, 'function');
  // 보낼 때는 잡아 둔 사본을 쓴다(그때 주소를 다시 읽지 않는다).
  const src = read('js/inquiry.js');
  assert.match(src, /const leadMetadata = \(\) => Object\.assign\(\{\}, LANDING_SOURCE\);/);
  assert.match(src, /\.\.\.data,\s*\.\.\.leadMetadata\(\),\s*privacyConsent: data\.consent/);
  assert.equal((src.match(/captureLeadMetadata\(/g) || []).length, 1, 'captureLeadMetadata 는 처음 주소 한 곳에서만 부른다');
});
