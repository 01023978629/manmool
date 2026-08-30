# Manmool Public Revenue Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리사무소의 30일 시험운영 상담과 유상 누수진단 상담을 기존 공개 LeadTransport로 안전하게 전달하고, 프로그램 이용료 0원과 실제 작업 별도 견적의 경계를 공개 화면에서 명확히 한다.

**Architecture:** 공개 사이트에만 `ManmulRevenue` 순수 유틸리티를 추가해 CTA/UTM 메타데이터와 공식 네이버 예약 URL 검증을 한 곳에서 수행한다. `office.html`의 시험운영 폼과 `leak.html`의 유상 진단 문의는 기존 `ManmulLead.deliver()`만 사용하며, 서버·현장앱·직원 포털의 상태나 데이터를 만들지 않는다. 정적 검사, Playwright 회귀, Pages 허용목록과 CI가 새 파일과 문구·경계를 함께 검증한다.

**Tech Stack:** 정적 HTML/CSS, 브라우저 JavaScript IIFE, Node.js 22 `node:test`, Playwright 1.55.0, GitHub Pages 허용목록 산출물.

**Spec:** `docs/superpowers/specs/2026-08-30-revenue-operations-expansion-design.md`

## Global Constraints

- 이 계획의 수정 범위는 `manmool` 공개 사이트뿐이며 `hyeonjang`, Google Apps Script, `apps-script-contract/`, `js/office-request-*.js`, `office-api.json`은 수정하지 않는다. `office-request.html`에는 프로그램 이용료·별도 견적을 설명하는 정적 HTML만 추가할 수 있고, form field, script tag, inline script, event handler, endpoint, 포털 인증/접수 동작은 변경하지 않는다.
- 공개 루트 전체가 GitHub Pages로 제공되므로 비밀 API 키, 토큰, 고객 원문 연락처, 테스트 fixture, 내부 승인 자료를 새 파일·로그·문서에 넣지 않는다. 기존 `data/config.json`의 `forms.accessKey`는 Web3Forms 공식 FAQ가 클라이언트 공개를 전제로 한 public form identifier로 정의하므로 이 금지의 비밀값이 아니다. 현재 값은 byte-exact로 보존하고 채팅·로그·fixture·테스트 실패 메시지에 출력하지 않으며, 이 예외를 다른 provider 키나 토큰에 확대하지 않는다.
- 관리사무소 화면의 정해진 문구는 `접수 프로그램 이용료 0원`과 `실제 출동·진단·공사는 현장 확인 후 별도 견적`을 함께 사용한다. 이 문구는 무료 진단·무료 수리·무료 출동·24시간 대응·우선 출동 보장을 뜻하지 않는다.
- 공개 파일럿 신청과 누수 문의는 작업 오더, 방문확정, 작업확정, 작업중, 청구, 예약번호 또는 결제를 만들지 않는다. 누수 payload의 `bookingStatus`는 항상 `inquiry-only`다.
- 네이버 버튼은 `data/config.json`의 `naver.ready === true`이고 검증된 공식 URL이 있을 때만 보인다. 허용 host는 정확히 `booking.naver.com` 또는 `m.booking.naver.com`이고 HTTPS·기본 포트·자격정보 없음·비어 있지 않은 식별 경로만 허용하며 query는 보존하고 fragment는 제거한다.
- 공개 폼은 기존 `window.ManmulLead`의 `loadConfig()`, `backendConfigured()`, `deliver()`, `rememberFailure()`, `retryLatest()`, `clearFailure()`, `copyToClipboard()`, `buildLeadText()` 계약을 사용한다. 전송 실패 데이터는 최신 1건의 현재 탭 메모리에만 두며 `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, URL query/fragment, console에 저장·출력하지 않는다. 새로고침 뒤 실패 초안이 복원되거나 자동 재전송되어서는 안 된다.
- `sourcePage`는 query와 fragment가 없는 `location.pathname`이고, `ctaId`는 구현 코드의 고정 식별자다. `utmSource`, `utmMedium`, `utmCampaign`은 각각 최대 80자이며 영문·숫자·한글·공백·`-_.` 외 문자가 있거나 길이를 넘으면 payload에서 제외한다. sanitizer는 URL query만 입력으로 받고, 허용문자를 통과해도 국내 전화번호처럼 보이는 값은 세 UTM 필드 모두에서 제외한다. 폼의 전화번호·이름·주소·증상을 URL이나 UTM 메타데이터로 복사하지 않는다. `referenceCase`는 slug 형식만으로 허용하지 않고 `data/leak-case-index.json`에서 `version === 1`, `published === true`, `service === 'leak'`, 정확히 한 건 일치한 slug일 때만 넣는다.
- 파일럿 폼은 단지명, 관리사무소 담당자명, 회신 전화번호, 지역, 관심 업무, 개인정보 수집·이용 동의만 필수로 받고, 도입 희망 시점과 문의 내용만 선택으로 받는다. 입주민 이름·전화번호·동호수·현장사진 필드는 만들지 않는다.
- 누수 폼의 신청 목적은 `phone-consult` 또는 `paid-device-diagnosis`이며, 희망 방문일과 시간대(`morning|afternoon|any`)는 선택이다. 기존 `1차 인테리어 방문 실측 무료`, `누수 장비 탐지는 착수부터 유료` 정책과 충돌하는 카피를 추가하지 않는다.
- 예방점검 공개 안내는 점검 대상과 산출물(체크리스트·위험항목 요약·현장사진·보수 권고)만 설명하며 고정가격, 안전진단 확정, 하자 판정, 무조건 수리 표현을 쓰지 않는다.
- 외부 전송이 HTTP 성공과 provider 승인 본문을 모두 반환했을 때만 접수 완료로 표시한다. 실패하면 다시 시도·전화·문자·복사 대체수단을 표시하고, 네이버 버튼 클릭은 접수 완료로 기록하지 않는다.
- 관리사무소 문의 내용에는 `입주민 이름·전화번호·동호수·사진 링크를 적지 마세요`를 표시한다. 국내 전화번호, 숫자 동·호수, URL·사진 링크, `입주민/세대주 이름·성명`의 명시적 패턴은 전송 전 거절하고, 모든 문자열은 고정 길이 제한, 관심 업무는 정확한 네 값 allowlist를 적용한다.
- `office.html`의 CSP `connect-src`는 토큰 집합으로 파싱했을 때 정확히 `'self'`와 현재 활성 provider의 정규화된 origin만 한 번씩 포함해야 한다. 접두 유사 origin, 비활성 provider, 임의 추가 origin, 중복, scheme/path 토큰, 와일드카드는 거절한다.
- Pages 공개 허용목록은 정확한 파일명 목록이다. 새 공개 JavaScript는 `scripts/pages-artifact-policy.mjs`에 명시하고, source와 `_site` 산출물의 정확한 일치를 계속 검증한다.
- main 직접 push, PR 생성, Pages 배포, `naver.ready=true` 전환, 네이버 계정 설정은 이 구현 계획의 실행 범위가 아니다. 구현 시작 직전에 `git fetch origin`, `git status --short`, `git rev-parse origin/main`으로 기준과 작업본을 다시 확인한다.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `data/config.json` | 공개 네이버 예약 설정을 `ready: false` 기본값으로 저장한다. 예약 URL은 코드나 HTML에 하드코딩하지 않는다. |
| `js/revenue-conversion.js` | URL을 제외한 안전한 CTA/UTM 메타데이터 생성과 공식 네이버 예약 URL의 순수 검증을 제공한다. |
| `js/lead-transport.js` | 사람에게 읽히는 외부 전송 본문에 파일럿·누수 목적·희망 일정·공개 메타데이터를 보존한다. 전송 provider 계약은 바꾸지 않는다. |
| `js/office-pilot.js` | `office.html`의 30일 시험운영 폼을 검증하고 기존 LeadTransport로 전송하며, 실패 시 현재 탭 대체 경로를 렌더한다. |
| `office.html` | 0원/별도 견적 카피, 30일 시험운영 폼, 예방점검 안내, CTA를 제공한다. 기존 직원 포털 링크는 그대로 유지한다. |
| `office-request.html` | 기존 포털 UI/JS/API는 변경하지 않고 `접수 프로그램 이용료 0원` 및 `실제 작업은 별도 견적`의 정적 안내만 추가한다. |
| `css/office.css` | 시험운영 폼, 결과, 예방점검 카드의 접근 가능한 반응형 스타일을 제공한다. |
| `leak.html` | 목적·희망일·시간대 입력과 조건부 네이버 핸드오프 버튼의 DOM 앵커를 제공한다. |
| `js/leak-inquiry.js` | 누수 payload에 목적·희망 일정·고정 `inquiry-only`·정제된 공개 메타데이터를 넣고 조건부 예약 링크를 렌더한다. |
| `privacy.html` | 파일럿 신청과 누수 유상 진단 상담의 수집 목적·항목·보존·철회/삭제 경로를 기존 직원 포털과 구분해 공개한다. |
| `tests/fixtures/public-config-invariants.json` | 실제 값을 담지 않고 기존 Web3Forms public form identifier의 SHA-256만 고정해 의도치 않은 설정 교체를 차단한다. |
| `tests/revenue-metadata.test.cjs` | DOM 없이 `ManmulRevenue`의 URL·UTM 경계를 단위 검증한다. |
| `tests/revenue-conversion.e2e.cjs` | 실제 브라우저 상호작용으로 파일럿·누수 payload, 실패 폴백, 예약 링크, 개인정보 경계를 검증한다. |
| `tests/fixtures/office-request-commercial-baseline.json` | 작업 전 `office-request.html`과 포털 JS/API/CSS의 SHA-256만 보관해, 소스 복제 없이 정적 안내 외 변경을 거절한다. |
| `scripts/ensure-conversion-basics.mjs` | 기존 `500만원 이하` 판매 문구 검사를 0원/별도 견적 동시 검사로 교체하고 새 공개 리드 필드의 처리방침 공시를 확인한다. |
| `scripts/ensure-revenue-operations.mjs` | 공개 전환의 정적 계약, URL/CSP/포털 분리, 금지 카피를 실패-폐쇄로 검사한다. |
| `scripts/pages-artifact-policy.mjs` | 두 새 공개 JavaScript의 Pages 공개 허용을 명시한다. |
| `tests/pages-artifact-policy.test.cjs` | 새 JavaScript가 source와 생성 artifact에 정확히 포함되는 것을 검증한다. |
| `.github/workflows/deploy-pages.yml` | 새 단위·브라우저 전환 회귀를 기존 lead privacy 게이트에 추가한다. |

## Interfaces

```js
// js/revenue-conversion.js
window.ManmulRevenue = {
  captureLeadMetadata(locationLike, ctaId, publishedReferenceCase),
  resolvePublishedLeakCase(caseSlug, caseIndex),
  sanitizeUtmValue(value),
  validateNaverBookingUrl(rawUrl)
};

// captureLeadMetadata() returns only the defined keys:
// { sourcePage: '/office.html', ctaId: 'office-pilot-submit',
//   utmSource?: string, utmMedium?: string, utmCampaign?: string,
//   referenceCase?: string }
// resolvePublishedLeakCase() returns { slug, title } only for one exact
// published leak entry in leak-case-index.json, otherwise null.
// validateNaverBookingUrl() returns a normalized HTTPS URL without a fragment,
// or null. It never throws for untrusted input.

// js/lead-transport.js accepts these optional payload keys without changing
// provider selection: source, sourcePage, ctaId, utmSource, utmMedium,
// utmCampaign, referenceCase, inquiryPurpose, preferredVisitDate,
// preferredVisitWindow, bookingStatus, pilotInterest, desiredStart, privacyConsent.
```

### Task 1: Add a pure public-conversion boundary and default-off booking configuration

**Files:**
- Create: `js/revenue-conversion.js`
- Create: `tests/revenue-metadata.test.cjs`
- Modify: `data/config.json`
- Modify: `js/lead-transport.js`
- Modify: `scripts/pages-artifact-policy.mjs`
- Modify: `tests/lead-transport.test.cjs`
- Modify: `tests/pages-artifact-policy.test.cjs`
- Create: `tests/fixtures/public-config-invariants.json`

**Interfaces:**
- Consumes: existing `window.ManmulLead` provider-selection contract and `data/config.json`.
- Produces: `window.ManmulRevenue.captureLeadMetadata(locationLike, ctaId, publishedReferenceCase)`, `window.ManmulRevenue.resolvePublishedLeakCase(caseSlug, caseIndex)`, `window.ManmulRevenue.sanitizeUtmValue(value)`, and `window.ManmulRevenue.validateNaverBookingUrl(rawUrl)` for Tasks 2 and 3.

- [ ] **Step 1: Write the failing pure-boundary and transport tests**

Create `tests/revenue-metadata.test.cjs` with a VM loader for `js/revenue-conversion.js`; add these exact assertions before creating the module:

```js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'revenue-conversion.js'), 'utf8');

function loadRevenue() {
  const context = { URL, URLSearchParams };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'revenue-conversion.js' });
  return context.ManmulRevenue;
}

test('공식 네이버 예약 URL만 query를 보존하고 fragment를 제거한다', () => {
  const api = loadRevenue();
  assert.equal(
    api.validateNaverBookingUrl('https://booking.naver.com/booking/13/bizes/42?ref=office#ignore'),
    'https://booking.naver.com/booking/13/bizes/42?ref=office'
  );
  assert.equal(
    api.validateNaverBookingUrl('https://m.booking.naver.com/booking/13/bizes/42?ref=mobile#ignore'),
    'https://m.booking.naver.com/booking/13/bizes/42?ref=mobile'
  );
  for (const raw of [
    'http://booking.naver.com/booking/13/bizes/42',
    'https://booking.naver.com:444/booking/13/bizes/42',
    'https://user:pass@booking.naver.com/booking/13/bizes/42',
    'https://booking.naver.com.evil.example/booking/13/bizes/42',
    'https://booking.naver.com/',
    'https://m.booking.naver.com.evil.example/booking/13/bizes/42'
  ]) assert.equal(api.validateNaverBookingUrl(raw), null, raw);
});

test('CTA/UTM 메타데이터는 pathname과 허용 문자만 보존한다', () => {
  const api = loadRevenue();
  const caseIndex = { version: 1, cases: [
    { slug: 'apartment-upper-lower-rain-pipe-repair', title: '공개 누수 사례', service: 'leak', published: true },
    { slug: 'draft-leak-case', title: '비공개 초안', service: 'leak', published: false }
  ] };
  const published = api.resolvePublishedLeakCase('apartment-upper-lower-rain-pipe-repair', caseIndex);
  assert.deepEqual(published, { slug: 'apartment-upper-lower-rain-pipe-repair', title: '공개 누수 사례' });
  assert.equal(api.resolvePublishedLeakCase('draft-leak-case', caseIndex), null);
  assert.equal(api.resolvePublishedLeakCase('apartment-upper-lower-rain-pipe-repair', { version: 1, cases: [caseIndex.cases[0], caseIndex.cases[0]] }), null);
  assert.deepEqual(
    api.captureLeadMetadata(
      { pathname: '/leak.html', search: '?utm_source=Naver%20Blog&utm_medium=organic&utm_campaign=rainy-2026&x=010-1234-5678' },
      'leak-inquiry-submit', published
    ),
    { sourcePage: '/leak.html', ctaId: 'leak-inquiry-submit', utmSource: 'Naver Blog', utmMedium: 'organic', utmCampaign: 'rainy-2026', referenceCase: 'apartment-upper-lower-rain-pipe-repair' }
  );
  assert.equal(api.sanitizeUtmValue('x'.repeat(81)), null);
  assert.equal(api.sanitizeUtmValue('name@example.com'), null);
  assert.equal(api.sanitizeUtmValue('010-1234-5678'), null);
  for (const param of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const blocked = api.captureLeadMetadata(
      { pathname: '/leak.html', search: '?' + param + '=010-1234-5678' },
      'leak-inquiry-submit', null
    );
    assert.deepEqual(blocked, { sourcePage: '/leak.html', ctaId: 'leak-inquiry-submit' });
  }
});

test('네이버 예약 설정은 계정 승인 전 정확히 비활성 상태다', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'config.json'), 'utf8'));
  assert.deepEqual(Object.keys(config.naver).sort(), ['_help', 'bookingUrl', 'ready']);
  assert.equal(config.naver.ready, false);
  assert.equal(config.naver.bookingUrl, '');
  assert.equal(config.naver._help, '대표가 네이버 스마트플레이스에서 만든 공식 예약 URL을 입력하고 검증한 뒤에만 ready를 true로 바꾸세요. false이거나 URL이 유효하지 않으면 공개 예약 버튼은 숨겨지고 상담 폼과 전화만 제공됩니다.');

  // fixture에는 실제 값이 아니라 승인 기준의 SHA-256만 있다.
  // 값 자체는 assertion message, fixture 또는 console에 절대 출력하지 않는다.
  const invariant = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'public-config-invariants.json'), 'utf8'
  ));
  assert.deepEqual(Object.keys(invariant).sort(), ['formsAccessKeySha256', 'schemaVersion']);
  assert.equal(invariant.schemaVersion, 1);
  assert.match(invariant.formsAccessKeySha256, /^[a-f0-9]{64}$/);
  const baselineDigest = Buffer.from(invariant.formsAccessKeySha256, 'hex');
  assert.equal(baselineDigest.length, 32);
  const digest = value => createHash('sha256').update(String(value), 'utf8').digest();
  assert.equal(
    timingSafeEqual(digest(config.forms.accessKey), baselineDigest),
    true,
    '기존 Web3Forms public form identifier가 변경되었습니다.'
  );
});
```

The test imports `createHash`/`timingSafeEqual` from `node:crypto`. Before changing `data/config.json`, create `tests/fixtures/public-config-invariants.json` with exact keys `{ "schemaVersion":1, "formsAccessKeySha256":"<64 lowercase hex>" }`, where the digest is computed from the existing UTF-8 identifier without printing the identifier. Reject extra/missing fixture keys, a non-64-lowercase-hex digest, or a non-32-byte decoded buffer before `timingSafeEqual`. The digest is not an account credential and cannot submit a form. The comparison uses only fixed-length buffers and a constant failure message, so neither success nor failure output can disclose the identifier. The exact three-key Naver object and literal `_help` make any extra/missing/config-drift mutation fail.

Extend `tests/lead-transport.test.cjs` so both n8n JSON and Web3Forms `message` retain all new non-empty fields:

```js
const payload = {
  source: 'leak-page', sourcePage: '/leak.html', ctaId: 'leak-inquiry-submit',
  inquiryPurpose: 'paid-device-diagnosis', preferredVisitDate: '2026-09-15',
  preferredVisitWindow: 'afternoon', bookingStatus: 'inquiry-only',
  utmSource: 'naver', utmMedium: 'organic', utmCampaign: 'rainy-2026',
  referenceCase: 'apartment-upper-lower-rain-pipe-repair'
};
assert.match(formsRequest.message, /신청 목적: 유상 장비진단·방문 일정 상담/);
assert.match(formsRequest.message, /희망 일정: 2026-09-15 · 오후/);
assert.match(formsRequest.message, /예약 상태: inquiry-only/);
assert.match(formsRequest.message, /참고 사례: apartment-upper-lower-rain-pipe-repair/);
assert.deepEqual(n8nRequest, payload);
```

Keep the existing object-shaped `referenceCase:{slug,title}` message behavior for backward compatibility, and add a separate string-shaped assertion for the new public metadata contract. Web3Forms human text must include the verified slug in both cases; n8n preserves the payload value exactly.

Also extend the same transport test with a pilot payload containing `complexName`, `officeContactName`, `region`, `pilotInterest`, `desiredStart`, and `memo`. `buildLeadText()` and the Web3Forms message must render exact labels `단지명`, `관리사무소 담당자`, `지역`, `관심 업무`, `도입 희망 시점`, and `문의 내용`; the n8n JSON must remain byte-for-byte equivalent to the input payload. Map the four interest codes only for display (`leak-piping→누수·배관`, `common-repair→공용부 보수`, `preventive-inspection→예방점검`, `other→기타`) while preserving the raw array in n8n.

Before modifying `PUBLIC_JS_FILES`, extend `tests/pages-artifact-policy.test.cjs` with a RED assertion that `revenue-conversion.js` occurs exactly once, `expectedPublicFiles(ROOT)` resolves that exact source file, and an isolated build/verify round trip contains byte-identical `js/revenue-conversion.js` with no output-only file.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/revenue-metadata.test.cjs tests/lead-transport.test.cjs tests/pages-artifact-policy.test.cjs`

Expected: FAIL because `js/revenue-conversion.js` does not exist, the Pages allowlist does not contain it, `data/config.json` has no default-off `naver` object, and `buildLeadText()` does not emit the new purpose, date/window, booking status, or string attribution fields.

- [ ] **Step 3: Implement the smallest pure interface and default-off config**

Create `js/revenue-conversion.js` as an IIFE with no storage, network, DOM write, or logging behavior. Use the following implementation shape:

```js
(function () {
  const UTM_VALUE = /^[A-Za-z0-9가-힣 ._-]{1,80}$/;
  const PHONE_LIKE = /(?:^|[^0-9])0(?:1[016789]|2|[3-6][1-5]|70)[ ._-]?\d{3,4}[ ._-]?\d{4}(?:$|[^0-9])/;
  const CTA_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const CASE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const NAVER_HOSTS = new Set(['booking.naver.com', 'm.booking.naver.com']);

  function sanitizeUtmValue(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return UTM_VALUE.test(text) && !PHONE_LIKE.test(text) ? text : null;
  }

  function validateNaverBookingUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
    try {
      const url = new URL(rawUrl.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !NAVER_HOSTS.has(url.hostname) || !url.pathname || url.pathname === '/') return null;
      url.hash = '';
      return url.href;
    } catch (_) { return null; }
  }

  function resolvePublishedLeakCase(caseSlug, caseIndex) {
    if (!CASE_SLUG.test(typeof caseSlug === 'string' ? caseSlug : '') || !caseIndex ||
        caseIndex.version !== 1 || !Array.isArray(caseIndex.cases)) return null;
    var matches = caseIndex.cases.filter(function(item) {
      return item && item.slug === caseSlug && item.published === true && item.service === 'leak' &&
        typeof item.title === 'string' && item.title.trim();
    });
    return matches.length === 1 ? { slug: matches[0].slug, title: matches[0].title.trim() } : null;
  }

  function captureLeadMetadata(locationLike, ctaId, publishedReferenceCase) {
    const pathname = typeof locationLike?.pathname === 'string' && locationLike.pathname.startsWith('/')
      ? locationLike.pathname : '/';
    const result = { sourcePage: pathname, ctaId: CTA_ID.test(ctaId) ? ctaId : 'unknown-cta' };
    const query = new URLSearchParams(typeof locationLike?.search === 'string' ? locationLike.search : '');
    for (const [param, key] of [['utm_source', 'utmSource'], ['utm_medium', 'utmMedium'], ['utm_campaign', 'utmCampaign']]) {
      const value = sanitizeUtmValue(query.get(param));
      if (value) result[key] = value;
    }
    if (publishedReferenceCase && CASE_SLUG.test(publishedReferenceCase.slug) &&
        typeof publishedReferenceCase.title === 'string' && publishedReferenceCase.title.trim()) {
      result.referenceCase = publishedReferenceCase.slug;
    }
    return result;
  }

  window.ManmulRevenue = { captureLeadMetadata, resolvePublishedLeakCase, sanitizeUtmValue, validateNaverBookingUrl };
})();
```

Add this public, inert configuration next to the existing top-level integrations in `data/config.json`; do not copy any account URL or credentials into a test fixture:

```json
"naver": {
  "ready": false,
  "bookingUrl": "",
  "_help": "대표가 네이버 스마트플레이스에서 만든 공식 예약 URL을 입력하고 검증한 뒤에만 ready를 true로 바꾸세요. false이거나 URL이 유효하지 않으면 공개 예약 버튼은 숨겨지고 상담 폼과 전화만 제공됩니다."
}
```

Extend `buildLeadText(d)` with explicit labels only when values are present. Map `phone-consult` to `전화로 증상 상담`, `paid-device-diagnosis` to `유상 장비진단·방문 일정 상담`, and `morning|afternoon|any` to `오전|오후|시간 협의`; emit `예약 상태: inquiry-only` literally. Treat a string `referenceCase` as the verified slug and retain the existing `{slug,title}` rendering for backward compatibility. Render all pilot labels and display-only interest mappings described in Step 1 so Web3Forms, SMS, and copy fallbacks cannot lose the business context. Preserve existing n8n payload passthrough and provider response checks.

Add `revenue-conversion.js` to `PUBLIC_JS_FILES` in `scripts/pages-artifact-policy.mjs` immediately before `lead-transport.js`; do not broaden directory scanning.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `node --test tests/revenue-metadata.test.cjs tests/lead-transport.test.cjs tests/pages-artifact-policy.test.cjs`

Expected: PASS. The URL test accepts both exact Naver hosts, strips only fragments, all three phone-shaped UTM values are omitted, the config is default-off without printing the existing public form identifier, every provider preserves the string/object reference contracts, and the isolated Pages artifact contains the new script byte-exactly.

- [ ] **Step 5: Commit the independent conversion boundary**

```bash
git add data/config.json js/revenue-conversion.js js/lead-transport.js scripts/pages-artifact-policy.mjs tests/fixtures/public-config-invariants.json tests/revenue-metadata.test.cjs tests/lead-transport.test.cjs tests/pages-artifact-policy.test.cjs
git commit -m "feat: add public conversion metadata boundary"
```

### Task 2: Build the management-office 30-day pilot conversion path

**Files:**
- Create: `js/office-pilot.js`
- Modify: `office.html`
- Modify: `office-request.html` (정적 안내 문구만)
- Modify: `css/office.css`
- Modify: `privacy.html`
- Modify: `scripts/pages-artifact-policy.mjs`
- Create: `tests/revenue-conversion.e2e.cjs`
- Create: `tests/fixtures/office-request-commercial-baseline.json`

**Interfaces:**
- Consumes: `window.ManmulRevenue.captureLeadMetadata(window.location, 'office-pilot-submit')`, `window.ManmulLead`, and `data/config.json` from Task 1.
- Produces: an external payload with `source: 'office-pilot'`, `sourcePage`, `ctaId`, `complexName`, `officeContactName`, `phone`, `region`, `pilotInterest`, `privacyConsent`, plus optional `desiredStart` and `memo`; no portal/API state, hyeonjang deep link, lead fragment, auto-import, or resident fields.
- Enforces: exact pilot-interest allowlist, per-field maximum lengths, and a fail-closed resident-PII pattern check on `memo` before `rememberFailure()` or any provider call.

- [ ] **Step 1: Write the failing pilot browser test**

Create the test server and Playwright setup in `tests/revenue-conversion.e2e.cjs` using the existing `tests/inquiry-phone.e2e.cjs` static-file pattern. Add this browser-level test before adding the pilot form:

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
let server, browser, origin;

before(async () => {
  server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function waitFor(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('timed out waiting for browser submission');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

test('30일 시험운영 신청은 최소 정보와 0원/별도 견적 경계를 기존 LeadTransport로 보낸다', async () => {
  const page = await browser.newPage();
  const posted = [];
  await page.route('https://api.web3forms.com/**', async route => {
    posted.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.goto(`${origin}/office.html?utm_source=naver&utm_medium=organic&utm_campaign=pilot-2026`);
  await page.fill('#pilotComplexName', '테스트 단지');
  await page.fill('#pilotOfficeContactName', '테스트 담당자');
  await page.fill('#pilotPhone', '042-123-4567');
  await page.fill('#pilotRegion', '대전 중구');
  await page.check('input[name="pilotInterest"][value="preventive-inspection"]');
  await page.fill('#pilotDesiredStart', '2026년 9월');
  await page.fill('#pilotMemo', '공용부 우수관 상담');
  await page.check('#pilotPrivacyConsent');
  await page.click('#officePilotSubmit');
  await waitFor(() => posted.length === 1);
  assert.equal(posted[0].source, 'office-pilot');
  assert.equal(posted[0].sourcePage, '/office.html');
  assert.equal(posted[0].ctaId, 'office-pilot-submit');
  assert.equal(posted[0].utmCampaign, 'pilot-2026');
  assert.equal(posted[0].privacyConsent, true);
  assert.equal(posted[0].complexName, '테스트 단지');
  assert.equal(posted[0].officeContactName, '테스트 담당자');
  assert.deepEqual(posted[0].pilotInterest, ['preventive-inspection']);
  for (const expected of ['단지명: 테스트 단지', '관리사무소 담당자: 테스트 담당자', '지역: 대전 중구', '관심 업무: 예방점검', '도입 희망 시점: 2026년 9월', '문의 내용: 공용부 우수관 상담']) {
    assert.match(posted[0].message, new RegExp(expected));
  }
  for (const forbidden of ['residentName', 'residentPhone', 'unit', 'photo', 'bookingStatus']) assert.equal(Object.hasOwn(posted[0], forbidden), false);
  assert.match(await page.locator('#officePilotDone').innerText(), /접수됐습니다/);
  assert.match(await page.locator('#officePilotDone').innerText(), /접수 프로그램 이용료 0원/);
  assert.match(await page.locator('#officePilotDone').innerText(), /실제 작업은 별도 견적/);
  assert.match(await page.locator('#officePilotStaticNotice').innerText(), /접수 프로그램 이용료 0원/);
  const portalPage = await browser.newPage();
  await portalPage.goto(`${origin}/office-request.html`, { waitUntil: 'networkidle' });
  assert.match(await portalPage.locator('#officeRequestCommercialNotice').innerText(), /접수 프로그램 이용료 0원/);
  assert.match(await portalPage.locator('#officeRequestCommercialNotice').innerText(), /실제 작업은 별도 견적/);
  await portalPage.close();
  await page.close();
});
```

In the same file add an explicit failed-delivery check:

```js
test('파일럿 폼은 필수값·동의 없이 전송하지 않고 실패 시 영구 저장 없이 대체 경로를 보인다', async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__pilotCopied = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__pilotCopied.push(String(text)) } });
  });
  await page.route('https://api.web3forms.com/**', route => route.fulfill({ status: 500, body: '{}' }));
  await page.goto(`${origin}/office.html`);
  await page.click('#officePilotSubmit');
  assert.match(await page.locator('#officePilotStatus').innerText(), /단지명/);
  await page.fill('#pilotComplexName', '실패 테스트 단지');
  await page.fill('#pilotOfficeContactName', '시설 담당자');
  await page.fill('#pilotPhone', '042-123-4567');
  await page.fill('#pilotRegion', '대전 중구');
  await page.check('input[name="pilotInterest"][value="common-repair"]');
  await page.fill('#pilotDesiredStart', '다음 달');
  await page.fill('#pilotMemo', '지하 공용배관 상담');
  await page.check('#pilotPrivacyConsent');
  await page.click('#officePilotSubmit');
  await page.locator('#officePilotCopy').click();
  const fallback = (await page.evaluate(() => window.__pilotCopied.join('\n'))) + '\n' + decodeURIComponent(await page.locator('#officePilotSms').getAttribute('href'));
  for (const expected of ['실패 테스트 단지', '시설 담당자', '대전 중구', '공용부 보수', '다음 달', '지하 공용배관 상담']) assert.match(fallback, new RegExp(expected));
  assert.equal(await page.evaluate(() => localStorage.getItem('manmul_inquiries')), null);
  await page.close();
});

test('파일럿 unknown 관심 업무·각 주민정보 패턴·각 길이 초과는 독립적으로 0 POST다', async () => {
  const residentCases = [
    ['전화번호', '입주민 전화 010-1234-5678'],
    ['동', '입주민 위치 101동'],
    ['호', '입주민 위치 1002호'],
    ['URL', '참고 https://example.test/a'],
    ['사진 링크', '사진 링크를 확인해 주세요'],
    ['입주민 이름', '입주민 이름 홍길동'],
    ['세대주 성명', '세대주 성명 홍길동']
  ];
  const lengthCases = [
    ['pilotComplexName', 81], ['pilotOfficeContactName', 51], ['pilotPhone', 31],
    ['pilotRegion', 81], ['pilotDesiredStart', 81], ['pilotMemo', 501]
  ];
  const cases = residentCases.map(([label, memo]) => ({ label, memo, error:/입주민 정보/ }))
    .concat(lengthCases.map(([id, length]) => ({ label:id, id, value:'가'.repeat(length), error:/길이/ })))
    .concat([{ label:'unknown-interest', unknownInterest:true, error:/관심 업무/ }]);

  for (const item of cases) {
    const page = await browser.newPage();
    let posts = 0;
    await page.route('https://api.web3forms.com/**', route => { posts += 1; return route.fulfill({ status: 200, body: '{"success":true}' }); });
    await page.goto(`${origin}/office.html`);
    await page.fill('#pilotComplexName', '테스트 단지');
    await page.fill('#pilotOfficeContactName', '시설 담당자');
    await page.fill('#pilotPhone', '042-123-4567');
    await page.fill('#pilotRegion', '대전');
    await page.check('input[name="pilotInterest"][value="common-repair"]');
    await page.check('#pilotPrivacyConsent');
    if (item.memo) await page.fill('#pilotMemo', item.memo);
    if (item.id) await page.evaluate(({ id, value }) => { document.getElementById(id).value = value; }, item);
    if (item.unknownInterest) await page.evaluate(() => {
      const injected = document.createElement('input');
      injected.type = 'checkbox'; injected.name = 'pilotInterest'; injected.value = 'resident-contact'; injected.checked = true;
      document.querySelector('#officePilotForm').append(injected);
    });
    await page.click('#officePilotSubmit');
    assert.equal(posts, 0, item.label);
    assert.match(await page.locator('#officePilotStatus').innerText(), item.error, item.label);
    await page.close();
  }
});

test('파일럿 전송 실패 PII는 모든 영구 sink·URL·console에 남지 않고 새로고침 뒤 재전송되지 않는다', async () => {
  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', message => consoleMessages.push(message.text()));
  await page.addInitScript(() => {
    const writes = [];
    window.__pilotPiiWrites = writes;
    for (const storage of [window.localStorage, window.sessionStorage]) {
      const original = storage.setItem.bind(storage);
      storage.setItem = (key, value) => { writes.push(['storage', String(key), String(value)]); return original(key, value); };
    }
    const open = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = (...args) => { writes.push(['idb', String(args[0] || '')]); return open(...args); };
    const cacheOpen = window.caches.open.bind(window.caches);
    window.caches.open = (...args) => { writes.push(['cache', String(args[0] || '')]); return cacheOpen(...args); };
  });
  let posts = 0;
  await page.route('https://api.web3forms.com/**', route => { posts += 1; return route.fulfill({ status: 500, body: '{}' }); });
  await page.goto(`${origin}/office.html`);
  await page.fill('#pilotComplexName', 'PII_테스트단지');
  await page.fill('#pilotOfficeContactName', 'PII_담당자');
  await page.fill('#pilotPhone', '010-1234-5678');
  await page.fill('#pilotRegion', 'PII_대전');
  await page.check('input[name="pilotInterest"][value="common-repair"]');
  await page.check('#pilotPrivacyConsent');
  await page.click('#officePilotSubmit');
  await waitFor(() => posts === 1);
  const text = 'PII_테스트단지|PII_담당자|010-1234-5678|PII_대전';
  assert.equal((await page.evaluate(() => window.__pilotPiiWrites)).some(row => text.split('|').some(value => row.join(' ').includes(value))), false);
  assert.equal(text.split('|').some(value => page.url().includes(value)), false);
  assert.equal(consoleMessages.some(message => text.split('|').some(value => message.includes(value))), false);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(posts, 1);
  assert.equal(await page.locator('#officePilotForm').isVisible(), true);
  assert.equal(await page.inputValue('#pilotComplexName'), '');
  await page.close();
});

test('office-request 포털은 정적 상업 안내 외의 source bytes와 기존 회귀 계약을 보존한다', () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'office-request-commercial-baseline.json'), 'utf8'));
  const after = fs.readFileSync(path.join(ROOT, 'office-request.html'), 'utf8');
  const notice = /\s*<aside id="officeRequestCommercialNotice"[\s\S]*?<\/aside>\s*/.exec(after);
  assert.ok(notice, '정적 상업 안내가 없다');
  assert.equal(sha256(after.replace(notice[0], '\n')), baseline['office-request.html']);
  for (const file of ['office-api.json', 'js/office-request-core.js', 'js/office-request-api.js', 'js/office-request-photo.js', 'js/office-request.js', 'css/office-request.css']) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, file))), baseline[file], file);
  }
});
```

Before editing `office-request.html`, create `tests/fixtures/office-request-commercial-baseline.json` with these exact lowercase SHA-256 values; do not copy source files into fixtures:

```json
{
  "office-request.html": "1f812bc121738f01249f82f2dbf24b9a6da97d3a215cef33e3d6944bcaf673b0",
  "office-api.json": "fe29ecec88363e3ecb6ef5ccd648abe4e60c2a00805488d9a3e15288621552a8",
  "js/office-request-core.js": "66b623e00320cd8a1d2088642c07d5b24fae6a27d40af42f46106ccc27f4a5e7",
  "js/office-request-api.js": "d20c6074a209fe1807b75eaf35769ed431edcc4d4ab53c919a92654612c527be",
  "js/office-request-photo.js": "a1d2070d546f5937009b336a42390957aeb2bfae6ea17dda8332b40208b0635d",
  "js/office-request.js": "758af097d211e81d660c17f620bc8367f49ffc8336c0b9281837f5e25192f1ee",
  "css/office-request.css": "4324d87291abc39a90e8e5d83bfc904ce518087fedcc1e95d82953793dadd00a"
}
```

Define `sha256(value)` in the test with `node:crypto`. After removing exactly the named notice element, `office-request.html` must match its baseline hash; the six support files must match their recorded hashes. The fixture remains under `tests/` and must not enter `PUBLIC_*` allowlists or `_site`.

- [ ] **Step 2: Run the pilot browser test to verify it fails**

Run: `node --test --test-concurrency=1 tests/revenue-conversion.e2e.cjs`

Expected: FAIL because `#officePilotSubmit`, the pilot fields, and `js/office-pilot.js` do not exist.

- [ ] **Step 3: Add the pilot section, client controller, and scoped styling**

In `office.html`, replace the current `표준 패키지 500만원 이하` aside with this two-part boundary and point the hero CTA at the new form:

```html
<aside class="office-package-note" aria-label="프로그램 이용료와 실제 작업 견적 안내">
  <span>관리사무소 시험운영</span>
  <div><h3>접수 프로그램 이용료 0원</h3><p>첫 1건의 접수·진행 현황 확인 흐름을 30일 동안 함께 확인합니다.</p></div>
  <small>실제 출동·진단·공사는 현장 확인 후 별도 견적</small>
</aside>
```

Add `<section id="officePilot">` after the service section. Its `<form id="officePilotForm" novalidate>` must use field names `complexName`, `officeContactName`, `phone`, `region`, `pilotInterest`, `desiredStart`, `memo`, and `privacyConsent`, plus IDs `pilotComplexName`, `pilotOfficeContactName`, `pilotPhone`, `pilotRegion`, `pilotPrivacyConsent`, `officePilotSubmit`, `officePilotStatus`, and `officePilotDone`; use checkbox values `leak-piping`, `common-repair`, `preventive-inspection`, `other`. Set exact maxlengths: complex name 80, office contact 50, phone 30, region 80, desired start 80, memo 500. Include only one field for each optional `pilotDesiredStart` and `pilotMemo`, and put this literal text next to the memo: `입주민 이름·전화번호·동호수·현장사진 또는 사진 링크는 적지 마세요.` Add `<p id="officePilotStaticNotice">접수 프로그램 이용료 0원 · 실제 작업은 별도 견적</p>` immediately beside the submit control, followed by this exact explanation: `30일은 접수·현황 확인 흐름을 시험하는 기간이며, 무제한 보수계약이나 무료 출동·공사를 뜻하지 않습니다.` The failure renderer uses exact control IDs `officePilotRetry`, `officePilotSms`, and `officePilotCopy`; the success renderer must place the same exact two phrases in `#officePilotDone` before any retry/phone/SMS controls. Keep every existing `office-request.html` link and portal section unchanged.

In `office-request.html`, add this static, non-interactive markup adjacent to the existing portal introduction and before the portal form:

```html
<aside id="officeRequestCommercialNotice" class="office-request-commercial-notice" role="note">
  <strong>접수 프로그램 이용료 0원</strong>
  <p>실제 작업은 별도 견적입니다. 출동·진단·공사 범위와 일정은 현장 확인 후 안내드립니다.</p>
</aside>
```

Do not add a field, button, `onclick`, `data-*` workflow attribute, `<script>`, external request, or CSS/JS import to `office-request.html`; do not modify any `js/office-request-*.js` file, `office-api.json`, or `css/office-request.css`.

Add a preventive-inspection section with the following fixed cards and no price/guarantee claim:

```html
<li><b>우기 전</b><span>옥상·외벽 접합부·우수관·트렌치·배수구</span></li>
<li><b>동절기 전</b><span>급수·난방 배관·밸브·보온 상태</span></li>
<li><b>반기 공용부</b><span>지하 배관·펌프 주변·공용 화장실·누수 흔적</span></li>
<p>점검 결과는 체크리스트, 위험항목 요약, 현장사진, 보수 권고로 정리하며 실제 범위는 현장 확인 후 정합니다.</p>
```

Load scripts in this exact order at the bottom of `office.html`:

```html
<script src="js/revenue-conversion.js?v=20260831-revenue1"></script>
<script src="js/lead-transport.js?v=20260831-revenue1"></script>
<script src="js/office-pilot.js?v=20260831-revenue1"></script>
```

Replace `office.html`'s CSP `connect-src 'self'` with an explicit source list made from the enabled, valid current endpoints in `data/config.json` (currently `https://api.web3forms.com` plus `'self'`). Keep `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-src 'none'`, and no wildcard. Task 4 will make configuration/CSP drift fail CI.

Implement `js/office-pilot.js` as an IIFE. It must validate a 10–11 digit Korean phone after stripping punctuation, require every required field and consent, add `submittedAt` and `status: '신규'`, call `LEAD.deliver(CONFIG, payload)`, and only show the success state when it returns `true`. Its important collection boundary is:

```js
const LEAD = window.ManmulLead;
const REVENUE = window.ManmulRevenue;
const form = document.getElementById('officePilotForm');
if (!LEAD || !REVENUE || !form) return;

function collect() {
  const fd = new FormData(form);
  const data = {
    type: '관리사무소 30일 시험운영',
    complexName: String(fd.get('complexName') || '').trim(),
    officeContactName: String(fd.get('officeContactName') || '').trim(),
    phone: String(fd.get('phone') || '').trim(),
    region: String(fd.get('region') || '').trim(),
    pilotInterest: fd.getAll('pilotInterest'),
    desiredStart: String(fd.get('desiredStart') || '').trim(),
    memo: String(fd.get('memo') || '').trim(),
    privacyConsent: fd.get('privacyConsent') === 'on'
  };
  return data;
}

const payload = Object.assign({}, collect(),
  REVENUE.captureLeadMetadata(window.location, 'office-pilot-submit'),
  { phone: normalizedPhone, source: 'office-pilot', submittedAt: new Date().toISOString(), status: '신규' });
```

Before building `payload`, reject any field over its HTML maximum, require one to four unique `pilotInterest` values all drawn from exact `['leak-piping','common-repair','preventive-inspection','other']`, and reject `memo` when it matches a deterministic `RESIDENT_PII` expression covering: a domestic telephone number, `\d{1,4}\s*(동|호)`, `https?://`, `사진\s*링크`, `입주민\s*(이름|성명)`, or `세대주\s*(이름|성명)`. This validation happens before `LEAD.rememberFailure`, `LEAD.deliver`, retry generation, or any status that says the lead was accepted. Never attempt generic Korean-name inference outside those explicit phrases.

Use the same latest-failure generation rules as `js/leak-inquiry.js`: call `LEAD.rememberFailure(payload)` only after delivery fails; use `LEAD.retryLatest(CONFIG)` for the retry button; call `LEAD.clearFailure(generation)` after a current successful submission; expose no `window` API; never persist or `console.*` the payload, and never change `location.href`, `location.search`, or `location.hash`. In failure rendering use `LEAD.buildLeadText(payload)` for the visible copy/SMS content and include retry, `tel:01023978629`, SMS, and copy controls. It must not create a hyeonjang URL, `#lead=`/`#hjreq=` fragment, auto-import request, or network request other than `data/config.json` and the existing selected LeadTransport endpoint.

Add scoped `office.css` rules for `.office-pilot-form`, `.office-pilot-grid`, `.office-pilot-status.err`, `.office-pilot-done`, `.office-pilot-done[hidden]`, `.office-preventive-grid`, and a mobile single-column breakpoint. Inputs and submit controls must have a minimum 44px target and `:focus-visible` outline. Do not edit shared portal CSS.

In `privacy.html`, add `<p id="privacy-office-pilot-items">` directly after the existing office-portal paragraph. Its literal opening must be `<b>관리사무소 30일 파일럿 신청</b>` and it must state: the pilot collects complex name, office contact name, reply telephone, region, requested work category, optional desired start and inquiry content, and consent for partnership consultation/reply; the form does not request resident identity, unit number, resident telephone, photo, or photo link and blocks the explicit patterns described above; users must not enter those items in free text; successful lead handling uses the existing one-year general consultation rule; contact the displayed phone for access/correction/deletion. Do not claim that arbitrary free text can never contain PII, and do not call the pilot a portal account, contract, dispatch, or repair order.

Add `office-pilot.js` to `PUBLIC_JS_FILES` immediately after `lead-transport.js`.

- [ ] **Step 4: Run the pilot browser test to verify it passes**

Run: `node --test --test-concurrency=1 tests/revenue-conversion.e2e.cjs`

Expected: PASS for the complete pilot payload and human-readable provider/SMS/copy content, mandatory consent, length/interest/explicit resident-PII rejection, all three exact commercial-copy locations, successful-delivery state, no persistent/browser sink, no post-reload restoration/auto-send, and no hyeonjang deep link/import. No request reaches a real provider because the test route intercepts it.

- [ ] **Step 5: Commit the pilot conversion path**

```bash
git add office.html office-request.html css/office.css privacy.html js/office-pilot.js scripts/pages-artifact-policy.mjs tests/revenue-conversion.e2e.cjs tests/fixtures/office-request-commercial-baseline.json
git commit -m "feat: add management office pilot intake"
```

The Task 2 commit must include `office-request.html` only as a portal file; it must not stage `office-api.json`, `css/office-request.css`, or any `js/office-request-*.js` file.

### Task 3: Add inquiry-only paid leak diagnosis and strict Naver handoff

**Files:**
- Modify: `leak.html`
- Modify: `css/leak-theme.css`
- Modify: `js/leak-inquiry.js`
- Modify: `tests/revenue-conversion.e2e.cjs`
- Modify: `tests/unified-brand-design.e2e.cjs`
- Modify: `tests/revenue-metadata.test.cjs`
- Modify: `tests/lead-privacy.e2e.cjs`

**Interfaces:**
- Consumes: `window.ManmulRevenue.validateNaverBookingUrl(rawUrl)`, `resolvePublishedLeakCase(caseSlug, caseIndex)`, and `captureLeadMetadata(window.location, 'leak-inquiry-submit', publishedReferenceCase)` from Task 1, plus the existing `window.ManmulLead` failure contract.
- Produces: a payload with `source: 'leak-page'`, `inquiryPurpose: 'phone-consult'|'paid-device-diagnosis'`, optional `preferredVisitDate`, `preferredVisitWindow: 'morning'|'afternoon'|'any'`, immutable `bookingStatus: 'inquiry-only'`, and `referenceCase` only after published-index allowlist resolution; it has no hyeonjang deep link, import request, or lead fragment.

- [ ] **Step 1: Extend the failing browser tests for leak purpose and booking handoff**

Add these tests to `tests/revenue-conversion.e2e.cjs` before adding fields or booking code:

```js
test('유상 장비진단 문의는 목적·희망일·시간대와 inquiry-only 상태만 전달한다', async () => {
  const page = await browser.newPage();
  const posted = [];
  await page.route('https://api.web3forms.com/**', async route => {
    posted.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.goto(`${origin}/leak.html?utm_source=naver`);
  await page.check('input[name="inquiryPurpose"][value="paid-device-diagnosis"]');
  await page.fill('#lkPreferredVisitDate', '2026-09-15');
  await page.selectOption('#lkPreferredVisitWindow', 'afternoon');
  await page.fill('#lkPhone', '010-1234-5678');
  await page.check('#lkConsent');
  await page.click('#lkSubmit');
  await waitFor(() => posted.length === 1);
  assert.equal(posted[0].inquiryPurpose, 'paid-device-diagnosis');
  assert.equal(posted[0].preferredVisitDate, '2026-09-15');
  assert.equal(posted[0].preferredVisitWindow, 'afternoon');
  assert.equal(posted[0].bookingStatus, 'inquiry-only');
  assert.equal(posted[0].ctaId, 'leak-inquiry-submit');
  assert.match(await page.locator('#lkDone').innerText(), /방문이나 금액이 확정된 것은 아닙니다/);
  await page.close();
});

test('ready=false 또는 유사 네이버 도메인은 예약 버튼을 보이지 않게 한다', async () => {
  const page = await browser.newPage();
  await page.route('**/data/config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    naver: { ready: false, bookingUrl: 'https://booking.naver.com/booking/13/bizes/42' }
  }) }));
  await page.goto(`${origin}/leak.html`);
  assert.equal(await page.locator('#lkNaverBooking').count(), 0);
  await page.close();
});

test('referenceCase는 공개 leak-case-index allowlist의 정확한 published slug일 때만 전달한다', async () => {
  const page = await browser.newPage();
  const posted = [];
  await page.route('https://api.web3forms.com/**', async route => {
    posted.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await page.route('**/data/leak-case-index.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    version: 1,
    cases: [{ slug: 'published-leak-case', title: '공개 사례', service: 'leak', published: true }, { slug: 'draft-leak-case', title: '초안', service: 'leak', published: false }]
  }) }));
  await page.goto(`${origin}/leak.html?case=draft-leak-case`);
  await page.fill('#lkPhone', '010-1234-5678'); await page.check('#lkConsent'); await page.click('#lkSubmit');
  await waitFor(() => posted.length === 1);
  assert.equal(Object.hasOwn(posted[0], 'referenceCase'), false);
  await page.close();

  const published = await browser.newPage();
  const publishedPosts = [];
  await published.route('https://api.web3forms.com/**', async route => {
    publishedPosts.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  await published.route('**/data/leak-case-index.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    version: 1, cases: [{ slug: 'published-leak-case', title: '공개 사례', service: 'leak', published: true }]
  }) }));
  await published.goto(`${origin}/leak.html?case=published-leak-case`);
  await published.fill('#lkPhone', '010-1234-5678'); await published.check('#lkConsent'); await published.click('#lkSubmit');
  await waitFor(() => publishedPosts.length === 1);
  assert.equal(publishedPosts[0].referenceCase, 'published-leak-case');
  assert.match(publishedPosts[0].message, /참고 사례: published-leak-case/);
  await published.close();
});

test('office-pilot와 leak의 실제 외부 요청 목적지는 활성 provider exact origin뿐이다', async () => {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.route('https://api.web3forms.com/**', route => route.fulfill({ status: 500, body: '{}' }));
  await page.goto(`${origin}/office.html`);
  await page.fill('#pilotComplexName', '외부경계 테스트 단지');
  await page.fill('#pilotOfficeContactName', '시설 담당자');
  await page.fill('#pilotPhone', '042-123-4567');
  await page.fill('#pilotRegion', '대전');
  await page.check('input[name="pilotInterest"][value="preventive-inspection"]');
  await page.check('#pilotPrivacyConsent');
  await page.click('#officePilotSubmit');
  await waitFor(() => requests.filter(url => url.startsWith('https://api.web3forms.com/')).length === 1);
  const pilotExternal = requests.filter(url => /^https?:/.test(url) && new URL(url).origin !== origin).map(url => new URL(url).origin);
  assert.deepEqual([...new Set(pilotExternal)], ['https://api.web3forms.com']);
  assert.equal(requests.some(url => /hyeonjang|#(?:hjreq|lead)=|importLead|autoImport|booking|reservation|order|payment/i.test(url) && !url.startsWith('https://api.web3forms.com/')), false);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(requests.filter(url => url.startsWith('https://api.web3forms.com/')).length, 1, 'failed pilot does not auto-retry');
  await page.goto(`${origin}/leak.html`);
  await page.fill('#lkPhone', '010-1234-5678'); await page.check('#lkConsent'); await page.click('#lkSubmit');
  await new Promise(resolve => setTimeout(resolve, 100));
  const external = requests.filter(url => /^https?:/.test(url) && new URL(url).origin !== origin).map(url => new URL(url).origin);
  assert.deepEqual([...new Set(external)], ['https://api.web3forms.com']);
  assert.equal(requests.filter(url => url.startsWith('https://api.web3forms.com/')).length, 2, 'pilot and leak each submit once');
  assert.equal(requests.some(url => /hyeonjang|#(?:hjreq|lead)=|importLead|autoImport|booking|reservation|order|payment/i.test(url) && !url.startsWith('https://api.web3forms.com/')), false);
  assert.equal(/#(?:hjreq|lead)=/i.test(page.url()), false);
  await page.close();
});
```

Add a second route fixture with `ready: true` and an exact allowed URL containing `?from=site#fragment`; assert that `#lkNaverBooking` has an `href` retaining `?from=site`, omitting `#fragment`, and `target="_blank" rel="noopener noreferrer"`. Add malicious URL cases for credentials, custom port, and `booking.naver.com.evil.example`, each expecting no button.

For that allowed-link fixture, intercept the exact Naver origin at the browser-context level and actually click the link. Before clicking, install write spies for `localStorage`, `sessionStorage`, IndexedDB, and Cache Storage and snapshot the form page URL plus all storage keys. Assert the popup navigates only to the normalized exact Naver URL, then close it, submit the original leak form, and assert: the provider payload still has exact `bookingStatus:'inquiry-only'`; the form page URL and storage snapshots are unchanged; all write-spy arrays are empty; and there was no request whose path or origin represents an internal booking, reservation, order, payment, or hyeonjang record. The Naver navigation itself is the only additional allowed external origin in this explicit-click test and is intercepted so no live request occurs.

Update the existing published-reference browser contract in `tests/lead-privacy.e2e.cjs`: the on-page reference may still use the verified `{slug,title}` object for display, but n8n JSON and Web3Forms `referenceCase` must equal the slug string. Web3Forms message and failure copy must contain that slug; they need not duplicate the title because the new transport contract is string-only. Keep the Task 1 unit test that proves legacy object-shaped `buildLeadText()` input still renders both title and slug.

- [ ] **Step 2: Run the leak tests to verify they fail**

Run: `node --test --test-concurrency=1 tests/revenue-conversion.e2e.cjs`

Expected: FAIL because the purpose/date/window inputs and `#lkNaverBooking` do not exist, and the existing payload has none of the new fields.

- [ ] **Step 3: Implement only the inquiry and handoff behavior**

Load `js/revenue-conversion.js` before `js/lead-transport.js` in `leak.html`. Add this accessible purpose fieldset before the symptom fields, then a date/select row after the contact fields:

```html
<fieldset class="leak-field" id="lkPurposeField">
  <legend>신청 목적 <em class="req" aria-hidden="true">필수</em></legend>
  <label class="leak-choice"><input type="radio" name="inquiryPurpose" value="phone-consult" checked /> 전화로 증상 상담</label>
  <label class="leak-choice"><input type="radio" name="inquiryPurpose" value="paid-device-diagnosis" /> 유상 장비진단·방문 일정 상담</label>
  <small>유상 장비진단은 현장 확인과 별도 견적·승인 전에는 방문, 금액, 작업이 확정되지 않습니다.</small>
</fieldset>
<div class="leak-row" id="lkVisitPreference">
  <div class="leak-field"><label for="lkPreferredVisitDate">희망 방문일 <small>선택</small></label><input id="lkPreferredVisitDate" name="preferredVisitDate" type="date" /></div>
  <div class="leak-field"><label for="lkPreferredVisitWindow">희망 시간대 <small>선택</small></label><select id="lkPreferredVisitWindow" name="preferredVisitWindow"><option value="any">시간 협의</option><option value="morning">오전</option><option value="afternoon">오후</option></select></div>
</div>
<div id="lkNaverBookingHost" hidden></div>
```

Do not disable date/time fields based on the radio choice: the optional preference can be communicated for either inquiry purpose, but never implies confirmation. Add the date/select controls to the existing mobile input-size and focus-visible rules in `css/leak-theme.css` only if their selectors are absent.

Replace the current inline slug filtering inside `resolveReferenceCase()` with the Task 1 interface; a query string never directly becomes a payload value:

```js
const index = await Promise.race([lookup, timeout]);
const published = REVENUE.resolvePublishedLeakCase(requestedSlug, index);
if (!published) return null;
referenceCase = Object.freeze(published);
```

Retain the current index fetch timeout and fail-open-to-general-inquiry behavior. Do not use a slug-format regex as an authorization decision, and do not add an alternate referenceCase source.

Update `collect()` and its submit payload exactly at the current `Object.assign` boundary:

```js
const data = {
  type: '누수',
  region: (fd.get('region') || '').trim(),
  name: (fd.get('name') || '').trim(),
  phone: (fd.get('phone') || '').trim(),
  symptoms: fd.getAll('symptoms'),
  memo: (fd.get('memo') || '').trim(),
  inquiryPurpose: fd.get('inquiryPurpose') === 'paid-device-diagnosis' ? 'paid-device-diagnosis' : 'phone-consult',
  preferredVisitDate: /^\d{4}-\d{2}-\d{2}$/.test(fd.get('preferredVisitDate') || '') ? fd.get('preferredVisitDate') : '',
  preferredVisitWindow: ['morning', 'afternoon', 'any'].includes(fd.get('preferredVisitWindow')) ? fd.get('preferredVisitWindow') : 'any',
  consent: fd.get('consent') === 'on'
};

const payload = Object.assign({}, data,
  REVENUE.captureLeadMetadata(window.location, 'leak-inquiry-submit', referenceCase),
  { phone, source: 'leak-page', bookingStatus: 'inquiry-only', submittedAt: new Date().toISOString(), status: '신규' });
```

After `waitForConfig()` resolves, render the booking anchor only through this narrow function. Do not call a Naver API, alter payload state, or infer booking success from a click:

```js
function renderNaverBooking(config) {
  const host = $('lkNaverBookingHost');
  if (!host) return;
  const naver = config && config.naver || {};
  const href = naver.ready === true ? REVENUE.validateNaverBookingUrl(naver.bookingUrl) : null;
  host.replaceChildren();
  host.hidden = !href;
  if (!href) return;
  const link = document.createElement('a');
  link.id = 'lkNaverBooking';
  link.className = 'outline-case-button';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = '네이버 예약 화면 열기';
  host.append(link);
}
```

Invoke `renderNaverBooking(CONFIG)` once after configuration load and when a configuration retry completes. In `showDone()`, add `방문이나 금액이 확정된 것은 아닙니다. 대표 확인 후 별도 견적과 일정 협의를 진행합니다.` for `paid-device-diagnosis`; keep the existing phone/SMS/retry/copy controls.

- [ ] **Step 4: Run the leak conversion tests to verify they pass**

Run: `node --test --test-concurrency=1 tests/revenue-conversion.e2e.cjs && node --test tests/revenue-metadata.test.cjs tests/lead-transport.test.cjs`

Expected: PASS. The valid official link is the only one rendered; an intercepted real click followed by submit preserves `bookingStatus:'inquiry-only'`, URL and every browser store, and creates no internal booking/order request. Published reference payloads are slug strings while legacy object rendering remains covered by the Task 1 unit suite.

- [ ] **Step 5: Commit the leak inquiry-only handoff**

```bash
git add leak.html css/leak-theme.css js/leak-inquiry.js tests/revenue-conversion.e2e.cjs tests/revenue-metadata.test.cjs tests/lead-privacy.e2e.cjs
git commit -m "feat: add inquiry-only leak diagnosis handoff"
```

### Task 4: Lock the public copy, privacy, artifact, and CI contracts

**Files:**
- Create: `scripts/ensure-revenue-operations.mjs`
- Modify: `scripts/ensure-conversion-basics.mjs`
- Modify: `privacy.html`
- Modify: `tests/pages-artifact-policy.test.cjs`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `tests/revenue-conversion.e2e.cjs`

**Interfaces:**
- Consumes: the exact DOM IDs and `ManmulRevenue`/`ManmulLead` payload contracts established in Tasks 1–3, `PUBLIC_JS_FILES`, and the current `data/config.json` endpoint configuration.
- Produces: a failure-closed static gate that exits nonzero on copy, public-file, CSP, privacy, portal-coupling, payload, or Naver URL regression; a CI job that runs the new unit and Playwright coverage.

- [ ] **Step 1: Write the failing static and artifact assertions**

Add these assertions to `tests/pages-artifact-policy.test.cjs` before changing the allowlist-dependent expectation:

```js
test('공개 전환 JavaScript는 명시 허용목록과 artifact에 함께 있다', () => {
  for (const relative of ['js/revenue-conversion.js', 'js/office-pilot.js']) {
    assert.equal(policy.PUBLIC_JS_FILES.includes(path.basename(relative)), true, relative);
  }
  buildPagesArtifact(tempRoot, artifactRoot);
  for (const relative of ['js/revenue-conversion.js', 'js/office-pilot.js']) {
    assert.equal(fs.existsSync(path.join(artifactRoot, ...relative.split('/'))), true, relative);
  }
});
```

Create `scripts/ensure-revenue-operations.mjs` first with failing checks for these non-negotiable conditions:

```js
check(/접수 프로그램 이용료 0원/.test(office) && /실제 작업은 별도 견적/.test(office), 'office.html에 0원 프로그램과 실제 작업 별도 견적 문구가 함께 없다');
check(/접수 프로그램 이용료 0원/.test(officeRequest) && /실제 작업은 별도 견적/.test(officeRequest), 'office-request.html 정적 안내에 0원 프로그램과 별도 견적 문구가 함께 없다');
check(/접수 프로그램 이용료 0원/.test(pilotSuccessBody) && /실제 작업은 별도 견적/.test(pilotSuccessBody), '파일럿 성공 결과에 0원 프로그램과 별도 견적 문구가 함께 없다');
check(!/표준 패키지 500만원 이하/.test(publicText), '공개 판매 문구에 제거 대상 500만원 이하 표준 패키지가 남아 있다');
check(/id="officePilotForm"/.test(office) && /source:\s*'office-pilot'/.test(pilot), '30일 파일럿 폼 또는 office-pilot 전송 계약이 없다');
check(/bookingStatus:\s*'inquiry-only'/.test(leakJs), '누수 문의의 inquiry-only 고정값이 없다');
check(!/office-request/.test(pilot) && !/office-api/.test(pilot), '공개 파일럿 코드가 기존 직원 포털/API에 결합됐다');
check(!/(?:residentName|residentPhone|\bunit\b|photo)/.test(pilotCollect), '파일럿 collect가 금지된 입주민 정보 또는 사진을 받는다');
check(!/(?:hyeonjang|#hjreq=|#lead=|autoImport|importLead)/i.test(pilot + '\n' + leakJs), '공개 파일럿 또는 누수 코드에 hyeonjang deep link·자동 import·lead fragment가 있다');
check(/resolvePublishedLeakCase\(requestedSlug, index\)/.test(leakJs) && !/CASE_SLUG\.test\(requestedSlug\)/.test(leakJs), '누수 referenceCase가 published index allowlist 대신 slug 형식만으로 허용된다');
check(/officeRequestCommercialNotice/.test(officeRequest) && !/<script\b|\bonclick\s*=|\bdata-(?:action|endpoint|workflow)\s*=/.test(officeRequestNotice), 'office-request 정적 안내가 포털 동작을 추가했다');
```

Export the static validator and add mutation coverage in `tests/revenue-conversion.e2e.cjs` using a disposable copy of the public files. The script entry point and test must use these exact shapes:

```js
// scripts/ensure-revenue-operations.mjs
export function verifyRevenueOperations(root = ROOT, fileSystem = fs) {
  // return an array of Korean failure strings; do not call process.exit here
}

// tests/revenue-conversion.e2e.cjs
test('정적 전환 게이트는 카피·포털 결합·PII·CSP·privacy·artifact 변이를 각각 거절한다', async () => {
  const { verifyRevenueOperations } = await import(`${pathToFileURL(path.join(ROOT, 'scripts', 'ensure-revenue-operations.mjs')).href}?mutation=${Date.now()}`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-revenue-mutation-'));
  fs.cpSync(ROOT, temp, { recursive: true, filter: source => !source.includes(`${path.sep}.git`) && !source.includes(`${path.sep}_site`) });
  try {
    assert.deepEqual(verifyRevenueOperations(temp), [], 'mutation baseline must be clean');
    const expectFailure = (relative, from, to, pattern) => {
      const file = path.join(temp, ...relative.split('/'));
      const original = fs.readFileSync(file, 'utf8');
      assert.equal(original.includes(from), true, `mutation source missing: ${relative}`);
      try {
        fs.writeFileSync(file, original.replace(from, to));
        assert.match(verifyRevenueOperations(temp).join('\n'), pattern);
      } finally {
        fs.writeFileSync(file, original);
      }
      assert.deepEqual(verifyRevenueOperations(temp), [], `mutation restore failed: ${relative}`);
    };
    expectFailure('office.html', '접수 프로그램 이용료 0원', '접수 프로그램 이용료', /0원 프로그램/);
    expectFailure('js/office-pilot.js', "source: 'office-pilot'", "source: 'office-pilot', portal: 'office-request'", /직원 포털/);
    expectFailure('js/office-pilot.js', 'privacyConsent:', 'residentPhone:', /금지된 입주민 정보/);
    expectFailure('office.html', "connect-src 'self' https://api.web3forms.com", "connect-src *", /와일드카드/);
    expectFailure('office.html', "connect-src 'self' https://api.web3forms.com", "connect-src 'self' https://api.web3forms.com.evil.example", /정확한 활성 provider origin/);
    expectFailure('office.html', "connect-src 'self' https://api.web3forms.com", "connect-src 'self' https://api.web3forms.com https://extra.example", /정확한 활성 provider origin/);
    expectFailure('privacy.html', '파일럿 신청', '시험운영 신청', /파일럿/);
    expectFailure('js/leak-inquiry.js', "naver.ready === true", "naver.ready !== true", /ready/);
    expectFailure('js/revenue-conversion.js', "NAVER_HOSTS.has(url.hostname)", "url.hostname.endsWith('naver.com')", /공식 네이버 host/);
    expectFailure('scripts/pages-artifact-policy.mjs', "'office-pilot.js',", '', /artifact allowlist/);
    expectFailure('posts/apartment-upper-lower-rain-pipe-repair.html', '<main', '<p>500만원 이하 표준 패키지</p><main', /공개 artifact 판매 문구/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
```

The Task 1 unit tests remain the behavioral proof that `booking.naver.com.evil.example` returns `null` and an unpublished/duplicate/mismatched leak-case index entry returns `null`; the static mutation proof ensures the strict conditions and every required public boundary cannot be silently removed.

- [ ] **Step 2: Run the new static gate before implementation wiring to verify it fails**

Run: `node scripts/ensure-revenue-operations.mjs`

Expected: FAIL until the new script, exact copy checks, strict-Naver mutation tests, and artifact assertions are all present.

- [ ] **Step 3: Implement the permanent regression gates and CI registration**

In `scripts/ensure-conversion-basics.mjs`, replace only the existing lines that require `표준 패키지 500만원 이하` and `초과분은 별도 견적과 관리사무소 승인 후 진행` with three exact location checks: `office.html` and its pilot success renderer each contain `접수 프로그램 이용료 0원` plus `실제 작업은 별도 견적`; `office-request.html` contains the same pair inside `#officeRequestCommercialNotice`. Extend its `LEAD_FIELD_NOTICE` mapping for the new transmitted fields using these required privacy wording checks:

```js
complexName: /단지명/, officeContactName: /관리사무소 담당자명/,
pilotInterest: /관심 업무/, desiredStart: /도입 희망 시점/,
inquiryPurpose: /신청 목적/, preferredVisitDate: /희망 방문일/,
preferredVisitWindow: /희망 시간대/
```

The current `privacy.html` predates those exact field labels. Make one narrow disclosure correction in the same task: inside `#privacy-office-pilot-items`, change `관리사무소 담당자` to `관리사무소 담당자명` and `요청 업무 분류` to `관심 업무`; inside `#privacy-leak-items`, explicitly add `신청 목적`, `희망 방문일`, and `희망 시간대`. Do not change retention, consent, provider, portal, or collection behavior.

The existing unified brand regression still expects the former hero inquiry anchor even though Task 2 intentionally changed the management-office hero CTA to the 30-day pilot. Update only that assertion in `tests/unified-brand-design.e2e.cjs` from `.office-hero a[href="#officeInquiry"]` to `.office-hero a[href="#officePilot"]`; retain the exact-one count and every other design assertion.

Make the dynamic collect-key audit read both `js/office-pilot.js` and `js/leak-inquiry.js`; define `META_KEYS` as `consent`, `privacyConsent`, `source`, `sourcePage`, `ctaId`, `submittedAt`, `status`, and `bookingStatus` so the policy checks user-information disclosure but does not mistake routing state for collected personal information. `bookingStatus` is therefore deliberately absent from `LEAD_FIELD_NOTICE`; add a separate non-privacy assertion that it remains the exact literal `inquiry-only` and that the success copy says it is not a reservation confirmation. Add separate assertions that `#privacy-office-pilot-items` contains the literal `관리사무소 30일 파일럿 신청`, the one-year rule, deletion-contact route, the resident-data warning, and the explicit-pattern rejection statement without claiming arbitrary free text can never contain PII.

Implement `scripts/ensure-revenue-operations.mjs` with `read()` from the repository root and direct regular-expression checks only. Read `office.html`, `office-request.html`, `privacy.html`, `js/office-pilot.js`, `js/leak-inquiry.js`, `js/revenue-conversion.js`, and `scripts/pages-artifact-policy.mjs`; derive `pilotCollect`, `pilotSuccessBody`, and `officeRequestNotice` with balanced function/element extraction before applying the checks above. Require `PUBLIC_JS_FILES` to include exactly one `office-pilot.js` and exactly one `revenue-conversion.js`, otherwise return an `artifact allowlist` failure. It must also:

```js
check(/NAVER_HOSTS\.has\(url\.hostname\)/.test(revenue), '공식 네이버 host 허용목록 검사가 느슨해졌거나 사라졌다');
check(/naver\.ready\s*===\s*true/.test(leakJs), 'ready=true일 때만 네이버 링크를 렌더하는 조건이 없다');
const config = JSON.parse(read('data/config.json'));
const csp = /Content-Security-Policy" content="([^"]+)"/.exec(office)?.[1] || '';
const connectDirectives = csp.split(';').map(part => part.trim()).filter(part => /^connect-src(?:\s|$)/.test(part));
check(connectDirectives.length === 1, 'office.html CSP connect-src 지시문은 정확히 하나여야 한다');
const connectTokens = (connectDirectives[0] || '').split(/\s+/).slice(1);
const configuredEndpoints = [config.forms?.enabled ? config.forms.endpoint : '', config.n8n?.enabled ? config.n8n.inquiryWebhookUrl : ''].filter(Boolean);
const endpoints = [];
for (const value of configuredEndpoints) {
  try {
    const url = new URL(value);
    check(url.protocol === 'https:' && !url.username && !url.password, '활성 provider endpoint가 안전한 HTTPS URL이 아니다');
    if (url.protocol === 'https:' && !url.username && !url.password) endpoints.push(url.origin);
  } catch (_) { check(false, '활성 provider endpoint가 유효한 URL이 아니다'); }
}
const expectedConnectTokens = ["'self'"].concat([...new Set(endpoints)]);
check(connectTokens.length === new Set(connectTokens).size && connectTokens.length === expectedConnectTokens.length &&
  expectedConnectTokens.every(token => connectTokens.includes(token)),
  'office.html CSP connect-src가 정확한 활성 provider origin 집합과 다르다');
check(!connectTokens.some(token => token.includes('*') || (/^https?:/.test(token) && new URL(token).origin !== token)),
  'office.html CSP connect-src에 와일드카드 또는 origin 이외 토큰이 있다');
```

Also require `data/config.json` to have a boolean `naver.ready` and a string `bookingUrl`; when `ready` is `false`, the string must be empty, and when `ready` is `true`, `validateNaverBookingUrl(bookingUrl)` must be non-null. This preserves the default-off setting without preventing the separately approved account configuration later. Require `leak.html` to load `revenue-conversion.js` before `lead-transport.js` and `leak-inquiry.js`; require `office.html` to load `revenue-conversion.js`, `lead-transport.js`, then `office-pilot.js`; require `privacy.html` to contain the 1-year pilot retention and deletion-contact statements.

For the removed `500만원 이하 표준 패키지` sales claim, do not omit generated posts. Inside `verifyRevenueOperations`, use `expectedPublicFiles(root)` to copy the exact allowlisted public sources into a disposable temporary source root, call `buildPagesArtifact(tempRoot, tempRoot/_site)`, then recursively scan every generated text-like artifact (`.html`, `.json`, `.xml`, `.txt`, `.js`, `.css`, `.webmanifest`, `.svg`) for both word orders with whitespace tolerance: `표준 패키지 … 500만원 이하` and `500만원 이하 … 표준 패키지`. Return a fixed `공개 artifact 판매 문구` failure naming only the relative file, and remove the temporary root in `finally`. This includes generated posts and embedded JSON-LD while excluding tests, private drafts, server source, and binary assets by construction. Separately scan only `README.md`, `CODEX-인수인계.md`, `CODEX-인수인계-20260812.md`, and `integrations/` text files for the same operational sales claim; do not exclude a public file merely because it is generated. The `office-request.html` assertion is limited to `#officeRequestCommercialNotice`: remove exactly that element, hash the normalized source, and compare it with `tests/fixtures/office-request-commercial-baseline.json`; compare the six untouched support-file hashes from the same fixture. Fail if any other byte differs.

Require `js/office-pilot.js` to contain no `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `console.`, `location.href`, `location.search`, `location.hash`, `hyeonjang`, `#hjreq=`, `#lead=`, `autoImport`, or `importLead` token. Require `js/leak-inquiry.js` to contain none of the hyeonjang/deep-link/import tokens. These source checks supplement, rather than replace, the browser sink and reload checks in Task 2.

Register `tests/revenue-metadata.test.cjs` and `tests/revenue-conversion.e2e.cjs` in the `Verify lead privacy` command of `.github/workflows/deploy-pages.yml`, retaining `NODE_PATH` and `--test-concurrency=1`. The exact insertion is:

```yaml
          tests/revenue-metadata.test.cjs
          tests/revenue-conversion.e2e.cjs
```

The existing `for check in scripts/ensure-*.mjs` loop will run `ensure-revenue-operations.mjs`; do not create a second uninvoked CI path.

- [ ] **Step 4: Run static, artifact, and browser gates to verify they pass**

Run:

```bash
node scripts/ensure-conversion-basics.mjs
node scripts/ensure-revenue-operations.mjs
node --test tests/pages-artifact-policy.test.cjs tests/revenue-metadata.test.cjs tests/lead-transport.test.cjs
node scripts/build-pages-artifact.mjs
node scripts/ensure-pages-artifact.mjs
node --test --test-concurrency=1 tests/revenue-conversion.e2e.cjs
python3 scripts/prerender-posts.py
git diff --exit-code -- blog.html posts rss.xml data/leak-case-index.json
node --test --test-concurrency=1 tests/lead-privacy.e2e.cjs tests/inquiry-phone.e2e.cjs tests/inquiry-result-honesty.e2e.cjs tests/inquiry-usability.e2e.cjs
node --test --test-concurrency=1 tests/configure-office-api.test.cjs tests/office-request.logic.test.cjs tests/office-request-api.test.cjs tests/office-request-auth.e2e.cjs tests/office-request-workflow.e2e.cjs tests/office-request-recent-changes.e2e.cjs tests/office-intake.e2e.cjs
for check in scripts/ensure-*.mjs; do if [ "$(basename "$check")" != "ensure-pages-artifact.mjs" ]; then node "$check"; fi; done
python3 -m unittest tests/test_prerender_posts.py
node --test tests/unified-brand-design.e2e.cjs
node --test scripts/new-case-post.test.mjs
node --test apps-script-contract/test/*.mjs
git diff --check
```

Expected: PASS. The artifact contains the two named scripts and no unlisted output; every guard fails on its corresponding local mutation; the portal regression still passes; `office-request.html` differs from its baseline only by the named static notice, while office API/CSS/JavaScript, hyeonjang source, and Apps Script source remain unchanged. Do not push, deploy Pages, change `naver.ready`, or send a real request as part of this verification.

- [ ] **Step 5: Commit the public-operation release gates**

```bash
git add scripts/ensure-conversion-basics.mjs scripts/ensure-revenue-operations.mjs privacy.html tests/pages-artifact-policy.test.cjs tests/revenue-conversion.e2e.cjs tests/unified-brand-design.e2e.cjs .github/workflows/deploy-pages.yml
git commit -m "test: gate public revenue conversion contracts"
```

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-31-revenue-public-web.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
