# Management Office Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 관리사무소 영업 페이지를 유지하면서, 입주민이 시설보수 내용을 확인한 뒤 대표번호 문자 앱으로 직접 전송하는 안전한 모바일 접수 화면을 추가한다.

**Architecture:** `office.html`은 검색·영업 랜딩으로 유지하고 `office-request.html`을 거래 화면으로 분리한다. 순수 데이터 처리 함수는 `js/office-request-core.js`, DOM 연결은 `js/office-request.js`, 화면 스타일은 `css/office-request.css`가 담당한다. 입력값은 브라우저 저장소나 네트워크에 저장하지 않고, 사용자 확인 후 `sms:01023978629` 링크만 생성한다.

**Tech Stack:** 정적 HTML5, CSS3, 브라우저 JavaScript, Node.js `node:test`, Playwright, GitHub Pages allowlist 빌드

**Spec:** `docs/superpowers/specs/2026-08-26-office-intake-design.md`

## Global Constraints

- 공개 브랜드는 `만물인테리어 관리사무소 시설접수`이며 `HOME DOC`, `담당 문규`, `homedoc.co.kr`을 사용하지 않는다.
- 공개 전화번호는 `010-2397-8629`, URI 수신번호는 `01023978629`다.
- 입력값을 `localStorage`, `sessionStorage`, IndexedDB, 외부 폼, 분석 픽셀 또는 API로 보내지 않는다.
- 문자 앱을 연 것만으로 접수 완료라고 표시하지 않는다. 실제 전송은 사용자가 문자 앱에서 수행한다.
- 사진 파일 입력을 만들지 않고, 문자 전송 후 동일 번호로 사진을 추가 전송하도록 안내한다.
- `office-request.html`은 `noindex,follow`이며 sitemap에는 넣지 않는다.
- 내부 운영관리·대시보드·기사용·영업키트 ZIP 화면과 샘플 접수 데이터는 공개하지 않는다.
- 이번 계획은 `manmool`만 변경하며 `hyeonjang` 자동 동기화는 만들지 않는다.
- 구현 브랜치는 `feat/office-intake`; 배포는 별도 사용자 승인 후 진행한다.

---

### Task 1: 문자 접수 순수 로직

**Files:**
- Create: `js/office-request-core.js`
- Create: `tests/office-request.logic.test.cjs`

**Interfaces:**
- Consumes: `{ complex, dong, ho, issueType, location, description, name, phone, privacyConsent }` 문자열·불리언 객체
- Produces: `ManmulOfficeRequest.normalizePhone(value)`, `validateRequest(data)`, `formatRequestMessage(data)`, `buildSmsHref(body, userAgent)`

- [ ] **Step 1: 순수 로직 실패 테스트 작성**

`tests/office-request.logic.test.cjs`에 다음 계약을 작성한다.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/office-request-core.js');

const valid = {
  complex: '열매마을 7단지', dong: '704', ho: '1102',
  issueType: '누수', location: '욕실 천장',
  description: '천장에서 물방울이 떨어집니다',
  name: '홍길동', phone: '010-1234-5678', privacyConsent: true,
};

test('전화번호를 010-1234-5678 형식으로 정규화한다', () => {
  assert.equal(api.normalizePhone('01012345678'), '010-1234-5678');
  assert.equal(api.normalizePhone('0111234567'), '011-123-4567');
});

test('첫 번째 누락 필드와 개인정보 동의를 검증한다', () => {
  assert.deepEqual(api.validateRequest({ ...valid, complex: '' }), {
    ok: false, field: 'complex', message: '단지명을 입력해 주세요.',
  });
  assert.deepEqual(api.validateRequest({ ...valid, privacyConsent: false }), {
    ok: false, field: 'privacyConsent', message: '개인정보 수집·이용에 동의해 주세요.',
  });
});

test('휴대전화는 숫자 10~11자리만 허용한다', () => {
  assert.equal(api.validateRequest({ ...valid, phone: '042-123-4567' }).field, 'phone');
  assert.equal(api.validateRequest(valid).ok, true);
});

test('문자 본문에 접수 항목을 빠짐없이 넣는다', () => {
  const body = api.formatRequestMessage(valid);
  for (const text of [
    '[만물인테리어 관리사무소 시설접수]', '열매마을 7단지',
    '704동 1102호', '누수', '욕실 천장',
    '천장에서 물방울이 떨어집니다', '홍길동', '010-1234-5678',
  ]) assert.match(body, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('운영체제에 맞는 SMS 링크를 만든다', () => {
  assert.match(api.buildSmsHref('접수 내용', 'Android'), /^sms:01023978629\?body=/);
  assert.match(api.buildSmsHref('접수 내용', 'iPhone'), /^sms:01023978629&body=/);
});
```

- [ ] **Step 2: 테스트가 구현 부재로 실패하는지 확인**

Run:

```powershell
$node='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node --test tests\office-request.logic.test.cjs
```

Expected: `Cannot find module '../js/office-request-core.js'`로 FAIL.

- [ ] **Step 3: 최소 순수 로직 구현**

`js/office-request-core.js`를 CommonJS와 브라우저 양쪽에서 쓸 수 있는 UMD 형태로 만든다.

```js
(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ManmulOfficeRequest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const required = [
    ['complex', '단지명을 입력해 주세요.'], ['dong', '동을 입력해 주세요.'],
    ['ho', '호수를 입력해 주세요.'], ['issueType', '문제 유형을 선택해 주세요.'],
    ['location', '발생 위치를 입력해 주세요.'], ['description', '증상을 입력해 주세요.'],
    ['name', '신청자 이름을 입력해 주세요.'], ['phone', '회신 전화번호를 입력해 주세요.'],
  ];
  const digits = (value) => String(value || '').replace(/\D/g, '');
  function normalizePhone(value) {
    const number = digits(value);
    if (number.length === 11) return `${number.slice(0, 3)}-${number.slice(3, 7)}-${number.slice(7)}`;
    if (number.length === 10) return `${number.slice(0, 3)}-${number.slice(3, 6)}-${number.slice(6)}`;
    return String(value || '').trim();
  }
  function validateRequest(data) {
    for (const [field, message] of required) {
      if (!String(data[field] || '').trim()) return { ok: false, field, message };
    }
    if (!/^01\d{8,9}$/.test(digits(data.phone))) {
      return { ok: false, field: 'phone', message: '휴대전화 번호 10~11자리를 확인해 주세요.' };
    }
    if (!data.privacyConsent) {
      return { ok: false, field: 'privacyConsent', message: '개인정보 수집·이용에 동의해 주세요.' };
    }
    return { ok: true, field: null, message: '' };
  }
  function formatRequestMessage(data) {
    return [
      '[만물인테리어 관리사무소 시설접수]',
      `단지: ${data.complex.trim()}`,
      `동·호수: ${data.dong.trim()}동 ${data.ho.trim()}호`,
      `문제 유형: ${data.issueType.trim()}`,
      `발생 위치: ${data.location.trim()}`,
      `증상: ${data.description.trim()}`,
      `신청자: ${data.name.trim()}`,
      `연락처: ${normalizePhone(data.phone)}`,
    ].join('\n');
  }
  function buildSmsHref(body, userAgent) {
    const separator = /iPad|iPhone|iPod/i.test(userAgent || '') ? '&' : '?';
    return `sms:01023978629${separator}body=${encodeURIComponent(body)}`;
  }
  return { normalizePhone, validateRequest, formatRequestMessage, buildSmsHref };
});
```

- [ ] **Step 4: 순수 로직 테스트 통과 확인**

Run: `& $node --test tests\office-request.logic.test.cjs`

Expected: 5 tests, 0 failures.

- [ ] **Step 5: 로직 단위 커밋**

```powershell
git add js/office-request-core.js tests/office-request.logic.test.cjs
git commit -m "feat: add safe office intake message logic"
```

---

### Task 2: 모바일 입주민 접수 화면

**Files:**
- Create: `office-request.html`
- Create: `css/office-request.css`
- Create: `js/office-request.js`
- Create: `tests/office-intake.e2e.cjs`

**Interfaces:**
- Consumes: Task 1의 `window.ManmulOfficeRequest` API와 `#officeRequestForm`의 named controls
- Produces: `#requestReview` 검토 화면, `#smsLaunch` SMS 링크, `#copyRequest` 복사 대체 행동, `#requestStatus` 상태 안내

- [ ] **Step 1: 접수 화면 브라우저 실패 테스트 작성**

`tests/office-intake.e2e.cjs`에 기존 정적 서버와 Playwright 생명주기를 독립적으로 구성한다.

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
let server, browser, origin;
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };

before(async () => {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, rel);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end('not found'); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('필수 동의 전에는 문자 검토 화면을 열지 않는다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${origin}/office-request.html`);
  await page.getByRole('button', { name: '문자 내용 확인' }).click();
  assert.equal(await page.locator('#requestReview').isHidden(), true);
  assert.match(await page.locator('#requestError').innerText(), /단지명/);
  await page.close();
});

test('정상 입력은 전송 전 검토와 SMS 링크를 만든다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${origin}/office-request.html`);
  await page.locator('[name="complex"]').fill('열매마을 7단지');
  await page.locator('[name="dong"]').fill('704');
  await page.locator('[name="ho"]').fill('1102');
  await page.locator('[name="issueType"]').selectOption('누수');
  await page.locator('[name="location"]').fill('욕실 천장');
  await page.locator('[name="description"]').fill('천장에서 물방울이 떨어집니다');
  await page.locator('[name="name"]').fill('홍길동');
  await page.locator('[name="phone"]').fill('01012345678');
  await page.locator('[name="privacyConsent"]').check();
  await page.getByRole('button', { name: '문자 내용 확인' }).click();
  assert.equal(await page.locator('#requestReview').isVisible(), true);
  assert.match(await page.locator('#requestPreview').inputValue(), /열매마을 7단지[\s\S]*704동 1102호/);
  assert.match(await page.locator('#smsLaunch').getAttribute('href'), /^sms:01023978629(?:\?|&)body=/);
  assert.match(await page.locator('#requestStatus').innerText(), /문자 앱에서 전송 버튼/);
  await page.close();
});

test('접수 페이지는 저장·자동 전송 없이 모바일에서 안전하게 보인다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const requests = [];
  page.on('request', (req) => { if (req.resourceType() === 'fetch' || req.resourceType() === 'xhr') requests.push(req.url()); });
  await page.goto(`${origin}/office-request.html`);
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    stored: localStorage.length + sessionStorage.length,
    short: [...document.querySelectorAll('button, a.request-button')]
      .filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44).length,
  }));
  assert.equal(metrics.scrollWidth, metrics.width);
  assert.equal(metrics.stored, 0);
  assert.equal(metrics.short, 0);
  assert.deepEqual(requests, []);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,follow');
  await page.close();
});
```

- [ ] **Step 2: 새 페이지 부재로 브라우저 테스트가 실패하는지 확인**

Run:

```powershell
$env:NODE_PATH='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& $node --test tests\office-intake.e2e.cjs
```

Expected: `office-request.html`이 404이므로 FAIL.

- [ ] **Step 3: 접수 문서 구조 작성**

`office-request.html`은 기존 `brand-system.css`와 새 CSS를 로드하고, 다음 ID와 name을 정확히 사용한다.

```html
<meta name="robots" content="noindex,follow" />
<link rel="stylesheet" href="css/styles.css?v=20260826-office-request1" />
<link rel="stylesheet" href="css/brand-system.css?v=20260826-office-request1" />
<link rel="stylesheet" href="css/office-request.css?v=20260826-office-request1" />
<main class="request-main">
  <section class="request-shell" aria-labelledby="requestTitle">
    <header class="request-heading">
      <span>관리사무소 시설보수 접수</span>
      <h1 id="requestTitle">현장 위치와 증상을 알려 주세요</h1>
      <p>내용을 확인한 뒤 대표번호 문자 앱으로 이동합니다. 문자 앱에서 전송 버튼을 눌러야 접수됩니다.</p>
    </header>
    <form id="officeRequestForm" novalidate>
      <div class="request-grid">
        <label>단지명<input name="complex" autocomplete="organization" required /></label>
        <label>동<input name="dong" inputmode="numeric" required /></label>
        <label>호수<input name="ho" inputmode="numeric" required /></label>
        <label>문제 유형<select name="issueType" required><option value="">선택</option><option>누수</option><option>배관·배수</option><option>욕실·방수</option><option>공용부 보수</option><option>기타</option></select></label>
        <label>발생 위치<input name="location" placeholder="예: 욕실 천장" required /></label>
        <label class="request-wide">증상 설명<textarea name="description" rows="4" required></textarea></label>
        <label>신청자 이름<input name="name" autocomplete="name" required /></label>
        <label>회신 전화번호<input name="phone" inputmode="tel" autocomplete="tel" required /></label>
      </div>
      <label class="request-consent"><input type="checkbox" name="privacyConsent" /> 개인정보 수집·이용에 동의합니다. <a href="privacy.html">내용 보기</a></label>
      <p id="requestError" class="request-error" role="alert" aria-live="polite"></p>
      <button type="submit" class="request-button request-primary">문자 내용 확인</button>
    </form>
    <section id="requestReview" class="request-review" hidden aria-labelledby="reviewTitle">
      <h2 id="reviewTitle">전송할 내용을 확인해 주세요</h2>
      <textarea id="requestPreview" readonly rows="10"></textarea>
      <p id="requestStatus">아직 접수되지 않았습니다. 문자 앱에서 전송 버튼을 눌러야 접수됩니다.</p>
      <div class="request-actions"><a id="smsLaunch" class="request-button request-primary">문자 앱 열기</a><button id="copyRequest" type="button" class="request-button request-secondary">접수 내용 복사</button></div>
      <p>현장 사진은 문자 전송 후 같은 번호로 추가해 주세요.</p>
    </section>
  </section>
</main>
<script src="js/office-request-core.js?v=20260826-office-request1"></script>
<script src="js/office-request.js?v=20260826-office-request1"></script>
```

공통 헤더에는 `office.html`로 돌아가는 링크와 브랜드 로고를, 푸터에는 대표·사업자 정보와 개인정보처리방침 링크를 넣는다.

- [ ] **Step 4: 접수 전용 스타일 구현**

`css/office-request.css`에 다음 레이아웃 계약을 구현하고 기존 CSS 변수를 재사용한다.

```css
.request-main { padding: 56px 20px 96px; background: #f4f8f7; }
.request-shell { width: min(760px, 100%); margin: 0 auto; padding: 36px; background: #fff; border: 1px solid #dbe5e3; border-radius: 24px; box-shadow: 0 20px 55px rgba(16,59,77,.08); }
.request-heading h1 { margin: 10px 0 14px; color: #103b4d; font-size: clamp(30px,5vw,46px); line-height: 1.2; }
.request-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.request-grid label, .request-consent { display: grid; gap: 8px; color: #183f4c; font-weight: 750; }
.request-wide { grid-column: 1 / -1; }
.request-grid input, .request-grid select, .request-grid textarea, #requestPreview { width: 100%; min-height: 48px; padding: 12px 14px; border: 1px solid #bdceca; border-radius: 12px; font: inherit; }
.request-button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; padding: 12px 18px; border: 0; border-radius: 12px; font-weight: 850; text-decoration: none; cursor: pointer; }
.request-primary { color: #fff; background: #087f88; }
.request-secondary { color: #103b4d; background: #e7f1ef; }
.request-review { margin-top: 28px; padding: 24px; background: #eef7f5; border-radius: 18px; }
.request-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.request-error { min-height: 24px; color: #b42318; }
@media (max-width: 640px) {
  .request-main { padding: 28px 12px 80px; }
  .request-shell { padding: 24px 16px; border-radius: 18px; }
  .request-grid { grid-template-columns: 1fr; }
  .request-wide { grid-column: auto; }
  .request-actions { display: grid; grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: DOM 연결과 복사 대체 동작 구현**

`js/office-request.js`에서 form 데이터를 읽고 Task 1 API를 사용한다. `navigator.clipboard.writeText` 실패 시 `#requestPreview`를 선택하고 `document.execCommand('copy')`를 한 번 시도한다.

```js
(() => {
  const form = document.getElementById('officeRequestForm');
  const review = document.getElementById('requestReview');
  const preview = document.getElementById('requestPreview');
  const launch = document.getElementById('smsLaunch');
  const error = document.getElementById('requestError');
  const copyButton = document.getElementById('copyRequest');
  const api = window.ManmulOfficeRequest;
  const collect = () => {
    const values = Object.fromEntries(new FormData(form).entries());
    values.privacyConsent = form.elements.privacyConsent.checked;
    return values;
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = collect();
    const result = api.validateRequest(data);
    error.textContent = result.message;
    if (!result.ok) {
      const target = form.elements[result.field];
      if (target) target.focus();
      review.hidden = true;
      return;
    }
    const body = api.formatRequestMessage(data);
    preview.value = body;
    launch.href = api.buildSmsHref(body, navigator.userAgent);
    review.hidden = false;
    review.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(preview.value); }
    catch (_) { preview.focus(); preview.select(); document.execCommand('copy'); }
  });
})();
```

- [ ] **Step 6: 접수 화면 브라우저 테스트 통과 확인**

Run: `& $node --test tests\office-intake.e2e.cjs`

Expected: 3 tests, 0 failures.

- [ ] **Step 7: 접수 화면 단위 커밋**

```powershell
git add office-request.html css/office-request.css js/office-request.js tests/office-intake.e2e.cjs
git commit -m "feat: add mobile management office intake page"
```

---

### Task 3: 영업 페이지·개인정보·Pages 연동

**Files:**
- Modify: `office.html:71-73,138`
- Modify: `css/office.css:110,328,535-602`
- Modify: `privacy.html:43-62`
- Modify: `scripts/build-pages-artifact.mjs:20-25`
- Create: `scripts/ensure-office-intake.mjs`

**Interfaces:**
- Consumes: Task 2의 `office-request.html`
- Produces: `office.html#officeRequestIntro` 공개 진입점, 개인정보 고지, Pages 배포 허용목록, 정적 안전검사

- [ ] **Step 1: 연동 안전검사 작성**

`scripts/ensure-office-intake.mjs`에 다음 검사를 작성한다.

```js
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
check((office.match(/href="office-request\.html"/g) || []).length >= 2, '영업 페이지에 시설접수 진입점 2개가 없다');
check(/id="officeRequestIntro"/.test(office), '단지 전용 시설접수 소개 구역이 없다');
check(/name="robots" content="noindex,follow"/.test(request), '접수 페이지 noindex가 없다');
check(/01023978629/.test(core) && /010-2397-8629/.test(request), '대표번호가 일치하지 않는다');
check(!/(localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest|Web3Forms)/.test(request + core + controller), '접수 화면이 저장소나 네트워크 전송을 사용한다');
check(/문자 앱에서 전송 버튼/.test(request), '전송 전 확인 안내가 없다');
check(/문자 접수[\s\S]*1년/.test(privacy) && /브라우저에는.*저장하지/.test(privacy), '문자 접수 개인정보 고지가 불완전하다');
check(/'office-request\.html'/.test(build), 'Pages 공개 허용목록에 접수 페이지가 없다');
check(!/office-request\.html/.test(sitemap), 'noindex 접수 페이지가 sitemap에 들어갔다');
check(!/(HOME DOC|담당 문규|homedoc\.co\.kr)/.test(request + office), '별도 HOME DOC 브랜드가 공개 화면에 남았다');
if (fail.length) {
  console.error(`FAIL  관리사무소 시설접수 연동 ${fail.length}건`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log('PASS  관리사무소 시설접수 링크·개인정보·저장금지·Pages 허용목록');
```

- [ ] **Step 2: 연동 전 검사 실패 확인**

Run: `& $node scripts\ensure-office-intake.mjs`

Expected: `officeRequestIntro`, 개인정보 고지, Pages 허용목록이 없어 FAIL.

- [ ] **Step 3: 영업 페이지에 두 진입점과 소개 구역 추가**

`office.html`의 `.office-hero-actions`에 다음 보조 행동을 추가한다.

```html
<a href="office-request.html" class="office-button office-button-ghost">입주민 시설보수 접수</a>
```

`#officeServices` 뒤, `.office-report-section` 앞에 다음 구역을 추가한다.

```html
<section class="office-section office-request-intro" id="officeRequestIntro" aria-labelledby="officeRequestIntroTitle">
  <div class="container office-request-intro-grid">
    <div>
      <span class="office-eyebrow">입주민 접수 창구</span>
      <h2 id="officeRequestIntroTitle">단지명·동호수·증상을 한 번에 정리해 전달합니다</h2>
      <p>입주민이 내용을 확인한 뒤 대표번호 문자로 직접 전송합니다. 웹에는 연락처나 접수 내용을 저장하지 않습니다.</p>
    </div>
    <div class="office-request-intro-actions">
      <a href="office-request.html" class="office-button office-button-primary">시설보수 접수 화면 열기</a>
      <a href="#officeInquiry" class="office-text-link">관리사무소 제휴 문의 →</a>
    </div>
  </div>
</section>
```

`css/office.css`에는 데스크톱 2열, 640px 이하 1열인 `.office-request-intro-grid`와 버튼 영역 스타일을 추가한다. 기존 `.office-button`의 44px 이상 높이를 재사용한다.

- [ ] **Step 4: 개인정보처리방침에 문자 접수 경로 구분 추가**

`privacy.html`의 수집 항목 뒤에 다음 문단을 추가한다.

```html
<p><b>관리사무소 시설보수 문자 접수</b>에서는 성명, 연락처, 단지명, 동·호수, 문제 유형, 발생 위치와 증상 내용을 상담 회신과 현장 확인 목적으로 받습니다. 입력 내용은 접수 페이지 브라우저에 저장되지 않으며, 이용자가 문자 앱에서 직접 전송하면 대표 휴대전화로 전달됩니다. 이 경로는 Web3Forms를 거치지 않습니다.</p>
```

보관기간 문단에는 문자 접수도 일반 상담과 같은 `수집일로부터 1년` 기준이며 계약으로 이어지면 계약·세무 관련 법정기간을 따른다고 명시한다.

- [ ] **Step 5: Pages 허용목록에 접수 페이지 추가**

`scripts/build-pages-artifact.mjs`의 `PUBLIC_ROOT_FILES`에서 `office.html` 바로 뒤에 `'office-request.html'`을 추가한다. `sitemap.xml`은 변경하지 않는다.

- [ ] **Step 6: 정적 연동검사와 Pages 산출물 검사 통과 확인**

```powershell
& $node scripts\ensure-office-intake.mjs
& $node scripts\build-pages-artifact.mjs
& $node scripts\ensure-pages-artifact.mjs
Test-Path .\_site\office-request.html
```

Expected: 두 Node 검사 모두 PASS, `Test-Path`는 `True`.

- [ ] **Step 7: 연동 단위 커밋**

```powershell
git add office.html css/office.css privacy.html scripts/build-pages-artifact.mjs scripts/ensure-office-intake.mjs
git commit -m "feat: link office landing to resident intake"
```

---

### Task 4: 전체 회귀·모바일 시각 검증

**Files:**
- Modify only if a failing assertion identifies a defect in Task 1-3 files
- Test: `tests/office-request.logic.test.cjs`
- Test: `tests/office-intake.e2e.cjs`
- Test: `tests/unified-brand-design.e2e.cjs`

**Interfaces:**
- Consumes: Tasks 1-3의 공개 페이지, 로직, 스타일, 배포 허용목록
- Produces: 배포 전 검증 결과와 깨끗한 기능 브랜치

- [ ] **Step 1: 전체 정적 검사 실행**

```powershell
$fails=@()
Get-ChildItem scripts -Filter 'ensure-*.mjs' | Sort-Object Name | ForEach-Object {
  & $node $_.FullName
  if($LASTEXITCODE -ne 0){$fails += $_.Name}
}
if($fails.Count){throw ('실패한 정적 검사: '+($fails -join ', '))}
```

Expected: 모든 `ensure-*.mjs`가 exit 0.

- [ ] **Step 2: 로직·신규 화면·기존 브랜드 브라우저 회귀 실행**

```powershell
$env:NODE_PATH='C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& $node --test tests\office-request.logic.test.cjs tests\office-intake.e2e.cjs tests\unified-brand-design.e2e.cjs
```

Expected: 전체 tests 0 failures.

- [ ] **Step 3: 로컬 서버에서 데스크톱과 모바일 화면 확인**

```powershell
python -m http.server 8891 --bind 127.0.0.1
```

브라우저에서 `http://127.0.0.1:8891/office.html`과 `office-request.html`을 열어 1280×900 및 390×844로 확인한다. 확인 항목은 영업 페이지의 두 접수 링크, 폼 레이블, 오류 포커스, 검토 화면, 가로 넘침, 44px 버튼, 개인정보 링크다.

- [ ] **Step 4: 변경 범위·공개 파일·비밀값 검사**

```powershell
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
rg -n "HOME DOC|담당 문규|homedoc\.co\.kr|ADMIN_TOKEN|API_KEY" office.html office-request.html css/office*.css js/office-request*.js privacy.html
git status --short --branch
```

Expected: 공백 오류 없음, ZIP 브랜드·비밀값 없음, 의도한 파일만 변경됨.

- [ ] **Step 5: 검증 중 수정이 있었다면 단일 보정 커밋**

```powershell
git add office.html office-request.html privacy.html css/office.css css/office-request.css js/office-request-core.js js/office-request.js scripts/build-pages-artifact.mjs scripts/ensure-office-intake.mjs tests/office-request.logic.test.cjs tests/office-intake.e2e.cjs
git diff --cached --quiet || git commit -m "fix: complete office intake regression"
```

- [ ] **Step 6: 배포 전 사용자 보고**

커밋 목록, 변경 파일, 정적 검사 수, 브라우저 검사 수, 로컬 미리보기 주소를 보고한다. 원격 push·PR·main 병합·GitHub Pages 공개는 사용자의 별도 배포 승인을 받은 뒤에만 실행한다.
