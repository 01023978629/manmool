#!/usr/bin/env node
/* ensure-lead-attribution.mjs — 문의 출처(쪽·단추·UTM)가 세 상담 폼 모두에 실리는가 (2026-11-25)
 *
 * 왜: 대표는 계정형 통계 도구(GA4 등) 없이 "어느 채널에서 문의가 오나"를 알고 싶다. 누수 폼(leak.html)은
 * js/revenue-conversion.js captureLeadMetadata 로 유입 페이지·신청 단추·utm_* 를 실어 보냈지만, 인테리어 폼(index.html)은
 * source:'website' 만 보내 당근·블로그 링크에 꼬리표를 붙여도 셀 수 없었다. 이 검사가 막는 사고:
 *  ① index.html 이 revenue-conversion.js 를 inquiry.js 보다 먼저 읽지 않아 출처가 조용히 빠진다.
 *  ② inquiry.js·leak-inquiry.js·office-pilot.js 중 하나가 captureLeadMetadata 를 payload 에 싣지 않는다.
 *  ③ 메일 본문(buildLeadText)·접수함 시트 열(Code.gs)에서 그 항목이 사라진다.
 *  ④ 대표용 안내(docs/운영/문의-출처-링크.md)의 링크 예시가 실제로는 버려지는 값이다 — js/revenue-conversion.js 를 그대로 돌려 확인.
 *  ⑤ 처리방침이 유입 표시 기록을 밝히지 않는다.
 *  ⑥ 계정이 필요한 통계·광고 추적 도구(GA4·네이버 애널리틱스 등)가 대표 결정 없이 공개 페이지에 들어온다.
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

const index = read('index.html');
const inquiry = read('js/inquiry.js');
const leakInquiry = read('js/leak-inquiry.js');
const pilot = read('js/office-pilot.js');
const transport = read('js/lead-transport.js');
const revenueSrc = read('js/revenue-conversion.js');
const inboxCode = read('apps-script-lead-inbox/Code.gs');
const privacy = read('privacy.html');
const GUIDE = 'docs/운영/문의-출처-링크.md';
const guide = fs.existsSync(path.join(ROOT, GUIDE)) ? read(GUIDE) : '';

/* ① index.html 스크립트 순서 — 정확히 한 번씩, revenue-conversion → lead-transport → inquiry */
const scriptSrcs = [...index.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]);
const pos = (name) => scriptSrcs.indexOf(name);
check(['js/revenue-conversion.js', 'js/lead-transport.js', 'js/inquiry.js'].every((name) => scriptSrcs.filter((s) => s === name).length === 1)
  && pos('js/revenue-conversion.js') < pos('js/lead-transport.js') && pos('js/lead-transport.js') < pos('js/inquiry.js'),
  'index.html 이 js/revenue-conversion.js → lead-transport.js → inquiry.js 순서로 한 번씩 읽지 않는다 — 인테리어 문의 출처가 빠진다',
  'index.html 스크립트 순서');

/* ② 세 폼의 배선 */
check(/const REVENUE = window\.ManmulRevenue;/.test(inquiry) && /const INQUIRY_CTA_ID = 'index-inquiry-submit';/.test(inquiry)
  && /REVENUE\.captureLeadMetadata\(window\.location, INQUIRY_CTA_ID\)/.test(inquiry),
  'js/inquiry.js 가 captureLeadMetadata(window.location, "index-inquiry-submit") 를 부르지 않는다', '인테리어 폼 출처 수집');
const indexPayload = (inquiry.match(/const payload = \{([\s\S]*?)\};/) || [])[1] || '';
check(/\.\.\.data,\s*\.\.\.leadMetadata\(\),\s*privacyConsent: data\.consent/.test(indexPayload),
  'js/inquiry.js 상담 payload 에 출처(leadMetadata())가 실리지 않는다', '인테리어 payload 출처');
check(/REVENUE\.captureLeadMetadata\(window\.location, 'leak-inquiry-submit', referenceCase\)/.test(leakInquiry),
  'js/leak-inquiry.js 가 누수 문의 출처를 싣지 않는다', '누수 폼 출처 수집');
check(/REVENUE\.captureLeadMetadata\(window\.location,\s*'office-pilot-submit'\)/.test(pilot),
  'js/office-pilot.js 가 관리사무소 파일럿 문의 출처를 싣지 않는다', '파일럿 폼 출처 수집');

/* ③ 메일 본문·접수함 열 */
for (const [key, label] of [['sourcePage', '유입 페이지'], ['ctaId', '신청 진입점'], ['utmSource', 'UTM Source'], ['utmMedium', 'UTM Medium'], ['utmCampaign', 'UTM Campaign']]) {
  check(new RegExp(`if \\(d\\.${key}\\) L\\.push\\('${label}: ' \\+ d\\.${key}\\)`).test(transport), `메일 본문(buildLeadText)에 ${label} 줄이 없다`, `메일 ${label}`);
}
check(/'sourcePage', 'ctaId', 'utm'/.test(inboxCode), '접수함 시트 열(Code.gs LEAD_HEADERS)에 sourcePage·ctaId·utm 이 없다', '접수함 열');

/* ④ 대표용 링크 안내 — 예시 링크가 실제로 기록되는 값인지 정본 코드로 확인 */
const revenue = (() => {
  const sandbox = { window: {}, URL, URLSearchParams };
  vm.createContext(sandbox);
  vm.runInContext(revenueSrc, sandbox, { filename: 'js/revenue-conversion.js' });
  return sandbox.window.ManmulRevenue;
})();
check(!!guide, `${GUIDE} 가 없다 — 대표가 어떤 링크를 붙일지 모른다`, '링크 안내 문서');
const links = [...guide.matchAll(/https:\/\/01023978629\.github\.io\/manmool\/[^\s`)|]*/g)].map((m) => m[0]);
const utmLinks = links.filter((href) => /[?&]utm_source=/.test(href));
check(utmLinks.length >= 6, `${GUIDE} 의 UTM 링크 예시가 ${utmLinks.length}개뿐이다(인테리어·누수 × 당근·네이버 블로그·카카오 채널)`, `링크 예시 ${utmLinks.length}개`);
for (const channel of ['daangn', 'naver_blog', 'kakao_channel']) {
  for (const page of ['/manmool/', '/manmool/leak.html']) {
    check(utmLinks.some((href) => { const u = new URL(href); return u.pathname === page && u.searchParams.get('utm_source') === channel; }),
      `${GUIDE} 에 ${page} ${channel} 링크가 없다`, `안내 ${page} ${channel}`);
  }
}
for (const href of utmLinks) {
  const u = new URL(href);
  const file = u.pathname === '/manmool/' ? 'index.html' : u.pathname.replace(/^\/manmool\//, '');
  check(fs.existsSync(path.join(ROOT, file)) && /(?:^|\/)(?:index|leak|office)\.html$/.test(file),
    `${GUIDE} 링크가 상담 폼이 있는 쪽이 아니다: ${href}`, `안내 링크 쪽 ${file}`);
  const meta = revenue && revenue.captureLeadMetadata({ pathname: u.pathname, search: u.search }, 'guide-check');
  for (const [param, key] of [['utm_source', 'utmSource'], ['utm_medium', 'utmMedium'], ['utm_campaign', 'utmCampaign']]) {
    const value = u.searchParams.get(param);
    if (value === null) continue;
    check(!!meta && meta[key] === value, `${GUIDE} 링크의 ${param}=${value} 는 실제로 기록되지 않는다(revenue-conversion 이 버림): ${href}`, `안내 ${param}=${value}`);
  }
}
check(!!revenue && !revenue.sanitizeUtmValue('01012345678') && !revenue.sanitizeUtmValue('010-0000-0000'),
  'revenue-conversion.js 가 전화번호 모양 UTM 을 기록한다', 'UTM 전화 모양 거름');

/* ⑤ 처리방침 */
const notice = (privacy.match(/<p id="privacy-lead-source">([\s\S]*?)<\/p>/) || [])[1] || '';
check(['페이지 경로', '신청 버튼', 'utm_source', '전화번호처럼 보이는'].every((word) => notice.includes(word)),
  '처리방침(#privacy-lead-source)이 유입 페이지·신청 버튼·UTM 기록과 전화 모양 거름을 밝히지 않는다', '처리방침 유입 표시');

/* ⑥ 계정형 통계·광고 추적 도구는 대표 결정 없이 넣지 않는다(2026-11-25 지시: 계정 없이만) */
const TRACKERS = /googletagmanager\.com|google-analytics\.com|gtag\(|wcs\.naver\.net|wcslog|wcs_add|clarity\.ms|plausible\.io|goatcounter|connect\.facebook\.net|fbq\(/i;
const publicHtml = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...['posts', 'designs', 'area'].flatMap((dir) => fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.html')).map((f) => `${dir}/${f}`) : []),
];
const tracked = publicHtml.filter((rel) => TRACKERS.test(read(rel)));
const trackedJs = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && TRACKERS.test(read(`js/${f}`)));
check(!tracked.length && !trackedJs.length, `계정형 통계·추적 도구가 들어왔다: ${[...tracked, ...trackedJs.map((f) => 'js/' + f)].join(', ')} — 대표 결정·처리방침 갱신이 먼저다`,
  `공개 HTML ${publicHtml.length}장·js 추적 도구 없음`);

if (fail.length) {
  console.error(`✗ 문의 출처 기록 ${fail.length}건 문제`);
  fail.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log(`✓ 문의 출처 기록 정상 — 확인 ${ok.length}건 · 대표용 링크 예시 ${utmLinks.length}개`);
