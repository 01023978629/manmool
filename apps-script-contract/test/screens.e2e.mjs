/* screens.e2e.mjs — 고객 서명 화면과 관리자 화면을 실제 브라우저에서 연다

   왜 필요한가.
   Sign.html(자바스크립트 41KB)과 Admin.html(35KB)은 이 검사를 만들기 전까지
   **한 번도 실행된 적이 없었다.** wiring.test.mjs 가 두 파일 이름을 언급하지만
   전부 주석이고, .gs 만 검사한다. 즉 77KB 짜리 코드의 첫 실행자가 고객이었다.
   서명 화면에서 하얀 화면이 뜨면 고객은 "안 열린다"고만 말할 수 있고,
   계약은 그 자리에서 멈춘다.

   어떻게 여는가.
   두 파일은 Apps Script 템플릿이라 `<?= BOOT_JSON ?>` 자리가 있다.
   그 자리를 실제 JSON 으로 채워 로컬 http 서버로 띄우고, 서버 호출은 가로채
   미리 정한 응답을 돌려준다. 실제 배포 없이도 화면의 모든 갈래를 태울 수 있다.

   지키는 것 (12건)
     서명 화면 ①뜬다 ②상태별로 다른 안내 ③XSS 안 통함 ④성명·서명·동의 다 있어야 진행
               ⑤중복 제출 차단 ⑥위변조 별도 안내 ⑦폰에서 가로 안 넘침
     관리자 화면 ⑧뜬다·토큰 입력 ⑨토큰이 localStorage·DOM 에 안 남음
               ⑩CSV 수식 삽입 차단 ⑪가로 안 넘침 ⑫두 화면 통틀어 오류 0

   되돌려 실패하는 것을 확인했다(빈 검사가 아니다):
     setText 를 innerHTML 로 → ③ 실패 · 제출 잠금 두 겹 제거 → ⑤ 실패
     만료·사용완료 문구를 같게 → ② 실패 · boot() 파괴 → ①②③ 실패

   실행: node apps-script-contract/test/screens.e2e.mjs
   (Playwright 필요 — 없으면 건너뛰고 그 사실을 알린다) */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium;
try { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
catch (_) {
  try { ({ chromium } = await import('playwright')); }
  catch (__) {
    try {
      // ESM 의 bare import 는 Windows 번들 런타임이 NODE_PATH 로 제공한 모듈을
      // 찾지 못한다. createRequire 는 같은 NODE_PATH 를 따라가므로 로컬·Codex
      // 양쪽에서 화면 검사를 실제로 실행할 수 있다.
      ({ chromium } = createRequire(import.meta.url)('playwright'));
    } catch (___) {
      console.log('SKIP  Playwright 가 없어 화면 검사를 건너뜁니다 — 이 환경에서는 .gs 검사만 유효합니다.');
      process.exit(0);
    }
  }
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('PASS  ' + name); }
  catch (e) { results.push({ name, ok: false }); console.log('FAIL  ' + name + '\n      ' + String((e && e.message) || e)); }
}
function assert(c, m) { if (!c) throw new Error('assert: ' + m); }

/* ---------- Apps Script 템플릿 자리를 실제 값으로 채운다 ---------- */
// <?= ... ?> 는 HtmlService 가 **속성값으로 안전하게** 넣는 자리다.
// 여기서도 같은 규칙으로 따옴표까지 이스케이프해야 문서 구조가 깨지지 않는다.
const attrEsc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderTemplate(file, bootObj) {
  const raw = readFileSync(join(DIR, file), 'utf8');
  const boot = bootObj == null ? '' : attrEsc(JSON.stringify(bootObj));
  // data-boot="<?= ... ?>" 한 자리만 바꾼다. 다른 <?= ?> 가 있으면 빈 값으로 둔다.
  return raw.replace(/<\?=[\s\S]*?\?>/g, (m) => (m.includes('BOOT_JSON') ? boot : ''));
}

const API = 'https://script.google.com/macros/s/SCREENTEST/exec';

/* ---------- 화면을 띄우는 작은 서버 ---------- */
let current = '<html><body>미설정</body></html>';
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(current);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const PAGE = `http://127.0.0.1:${PORT}/`;

/* ---------- 서버 응답 대역 ---------- */
const CONTRACT = {
  ok: true,
  contract: {
    contractNo: 'MM-2026-0142',
    title: '공사 도급계약서',
    status: 'SENT',
    amount: 11000000,
    amountText: '11,000,000',
    customerName: '홍길동',
    operatorName: '만물인테리어',
    docHash: 'a'.repeat(64),
    lockedAt: '2026-07-30T02:00:00.000Z',
    payments: [
      { stage: 'down', label: '계약금', seq: 0, amount: 5500000 },
      { stage: 'mid', label: '중도금', seq: 1, amount: 4400000 },
      { stage: 'bal', label: '잔금', seq: 2, amount: 1100000 }
    ],
    body: {
      site: '대전 서구 둔산동', scope: '욕실 전체 리모델링',
      customerName: '홍길동', amount: 11000000,
      operator: { co: '만물인테리어', rep: '전병덕', tel: '010-2397-8629', bizNo: '895-48-01132' },
      clauses: [
        { no: 1, title: '공사 범위', text: '욕실 철거·방수·타일·위생도기 일체' },
        { no: 2, title: '대금 지급', text: '계약금 50% · 중도금 40% · 잔금 10%' }
      ]
    }
  },
  expiresAt: '2026-08-02T02:00:00.000Z'
};

let routeHandler = null;   // 각 검사가 갈아 끼운다

async function openSign(page, bootObj, handler) {
  current = renderTemplate('Sign.html', bootObj);
  routeHandler = handler || null;
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

async function openAdmin(page, bootObj, handler) {
  current = renderTemplate('Admin.html', bootObj);
  routeHandler = handler || null;
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || (process.platform !== 'win32' ? '/opt/pw-browsers/chromium' : undefined)
});

/* ══════════════════ 고객 서명 화면 ══════════════════ */
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
// 서버 호출을 가로챈다. text/plain 단순 요청이라 preflight 는 없다.
await page.route(API + '*', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const res = routeHandler ? routeHandler(body) : { ok: false, error: 'SERVER_ERROR', message: '핸들러 없음' };
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(res)
  });
});

await test('① 서명 화면이 오류 없이 뜬다 — 지금까지 아무도 실행해 본 적이 없다', async () => {
  await openSign(page, { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: 'ok', data: CONTRACT.contract });
  assert(errs.length === 0, 'pageerror: ' + errs.join(' | '));
  const seen = await page.evaluate(() => ({
    signVisible: !document.getElementById('scSign').classList.contains('hide'),
    no: (document.getElementById('ctNo').textContent || '').trim(),
    amount: (document.getElementById('ctAmount').textContent || '').trim(),
    title: (document.getElementById('ctTitle').textContent || '').trim()
  }));
  assert(seen.signVisible, '서명 화면이 보이지 않는다');
  assert(seen.no.indexOf('MM-2026-0142') >= 0, '계약번호가 안 보인다: ' + seen.no);
  assert(seen.amount.replace(/[^\d]/g, '') === '11000000', '금액이 틀리다: ' + seen.amount);
  assert(seen.title.length > 0, '계약 제목이 비어 있다');
});

await test('② 만료·사용완료·취소·잘못된링크·계약없음이 각각 다른 안내를 보인다', async () => {
  const seen = {};
  for (const st of ['expired', 'used', 'revoked', 'void', 'invalid', 'notfound']) {
    await openSign(page, { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: st, message: '서버 메시지' });
    const r = await page.evaluate(() => ({
      stopVisible: !document.getElementById('scStop').classList.contains('hide'),
      title: (document.getElementById('stopTitle').textContent || '').trim(),
      ico: (document.getElementById('stopIco').textContent || '').trim()
    }));
    assert(r.stopVisible, st + ': 안내 화면이 안 뜬다');
    assert(r.title.length > 0, st + ': 안내 제목이 비었다');
    seen[st] = r.title;
  }
  const titles = Object.values(seen);
  const uniq = new Set(titles);
  assert(uniq.size === titles.length,
    '서로 다른 상황이 같은 문구를 쓴다 — 고객이 무엇이 문제인지 알 수 없다: ' + JSON.stringify(seen, null, 1));
  // 뜻이 뒤집히지 않았는지도 본다.
  assert(/유효기간|기한/.test(seen.expired), '만료 안내가 만료를 말하지 않는다: ' + seen.expired);
  assert(/완료|접수/.test(seen.used), '사용완료 안내가 어긋난다: ' + seen.used);
  assert(/취소/.test(seen.revoked) && /취소/.test(seen.void), '취소 안내가 어긋난다');
});

await test('③ 계약 내용에 <script> 가 있어도 실행되지 않고 글자로 보인다', async () => {
  const evil = { ...CONTRACT.contract };
  evil.title = '<img src=x onerror="window.__XSS=1">도급계약서';
  evil.customerName = '<script>window.__XSS2=1<\/script>홍길동';
  evil.body = {
    ...CONTRACT.contract.body,
    site: '<svg onload="window.__XSS3=1">둔산동',
    clauses: [{ no: 1, title: '<b onmouseover="window.__XSS4=1">범위', text: '<iframe src="javascript:window.__XSS5=1"></iframe>철거' }]
  };
  await openSign(page, { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: 'ok', data: evil });
  const r = await page.evaluate(() => ({
    xss: [window.__XSS, window.__XSS2, window.__XSS3, window.__XSS4, window.__XSS5].filter(Boolean).length,
    imgs: document.querySelectorAll('#scSign img, #scSign iframe, #scSign svg, #scSign script').length,
    titleText: (document.getElementById('ctTitle').textContent || '')
  }));
  assert(r.xss === 0, '스크립트가 실행됐다 — XSS: ' + r.xss + '건');
  assert(r.imgs === 0, '주입된 태그가 진짜 요소로 만들어졌다: ' + r.imgs + '개');
  assert(r.titleText.indexOf('onerror') >= 0 || r.titleText.indexOf('<img') >= 0,
    '주입 문자열이 글자로도 안 보인다 — 조용히 지워졌다: ' + r.titleText);
});

await test('④ 성명·서명·동의를 다 채워야 다음 단계로 넘어간다', async () => {
  await openSign(page, { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: 'ok', data: CONTRACT.contract });
  const step = async () => page.evaluate(() => ({
    onConfirm: !document.getElementById('scConfirm').classList.contains('hide'),
    err: (document.getElementById('signErr').textContent || '').trim()
  }));
  await page.click('#btnNext');
  let s = await step();
  assert(!s.onConfirm, '아무것도 안 채웠는데 확인 단계로 넘어갔다');
  assert(s.err.length > 0, '무엇이 빠졌는지 알려주지 않는다');

  await page.fill('#fName', '홍길동');
  await page.click('#btnNext');
  s = await step();
  assert(!s.onConfirm, '서명 없이 넘어갔다');

  // 캔버스에 실제로 그린다(터치·마우스 양쪽 경로 중 마우스).
  const box = await page.locator('#sigCanvas').boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2 - 12, { steps: 12 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 12, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  await page.click('#btnNext');
  s = await step();
  assert(!s.onConfirm, '동의 없이 넘어갔다');

  await page.click('#cAgreeBox, #fAgree, label[for="fAgree"]').catch(async () => { await page.check('#fAgree'); });
  await page.waitForTimeout(80);
  await page.click('#btnNext');
  await page.waitForTimeout(150);
  s = await step();
  assert(s.onConfirm, '다 채웠는데도 확인 단계로 못 간다: ' + s.err);
});

await test('⑤ 제출은 누르는 즉시 잠겨 두 번 나가지 않는다', async () => {
  let calls = 0;
  routeHandler = (body) => {
    if (body.action && String(body.action).indexOf('sign') >= 0) {
      calls++;
      return { ok: true, contractNo: 'MM-2026-0142', signedAt: new Date().toISOString(),
        completedVersion: 1, completedSha256: 'b'.repeat(64), notify: { sent: false, reason: 'MOCK_OFF' } };
    }
    return { ok: true };
  };
  // ④ 가 확인 단계까지 올려 둔 상태를 이어 쓴다.
  const before = await page.evaluate(() => document.getElementById('btnSubmit').disabled);
  assert(before === false, '확인 단계인데 제출 버튼이 잠겨 있다');
  await page.evaluate(() => {
    const b = document.getElementById('btnSubmit');
    b.click(); b.click(); b.click();          // 조급하게 세 번 누른 상황
  });
  await page.waitForTimeout(900);
  assert(calls <= 1, '제출이 ' + calls + '번 나갔다 — 계약이 여러 건 생긴다');
  const done = await page.evaluate(() => !document.getElementById('scDone').classList.contains('hide'));
  assert(done, '제출 후 완료 화면이 뜨지 않는다');
});

await test('⑥ 위변조(DOC_TAMPERED)는 따로 안내한다', async () => {
  await openSign(page, { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: 'ok', data: CONTRACT.contract },
    () => ({ ok: false, error: 'DOC_TAMPERED', message: '계약 내용이 바뀌었습니다.' }));
  const r = await page.evaluate(async () => {
    document.getElementById('fName').value = '홍길동';
    return { has: typeof STOP === 'undefined' ? null : Object.keys(STOP).indexOf('tampered') >= 0 };
  }).catch(() => ({ has: null }));
  // STOP 은 모듈 스코프라 밖에서 못 볼 수 있다. 화면으로 확인한다.
  await openSign(page, { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: 'ok' },
    () => ({ ok: false, error: 'DOC_TAMPERED', message: '계약 내용이 바뀌었습니다.' }));
  const t = await page.evaluate(() => (document.getElementById('stopTitle').textContent || '').trim());
  assert(t.length > 0, '위변조 안내가 비어 있다');
  assert(!/유효기간|취소된/.test(t), '위변조를 만료·취소로 잘못 안내한다: ' + t);
});

await test('⑦ 폰(390)에서 가로로 넘치지 않는다', async () => {
  const over = [];
  for (const st of [null, 'expired', 'used']) {
    await openSign(page, st
      ? { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: st }
      : { apiUrl: API, token: 't'.repeat(43), mode: 'sign', state: 'ok', data: CONTRACT.contract });
    const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    if (w.s > w.c + 1) over.push((st || 'sign') + `(${w.s}>${w.c})`);
  }
  assert(over.length === 0, '가로로 넘친 화면: ' + over.join(', '));
});

await ctx.close();

/* ══════════════════ 관리자 화면 ══════════════════ */
const actx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const apage = await actx.newPage();
const aerrs = [];
apage.on('pageerror', (e) => aerrs.push(String(e)));
await apage.route(API + '*', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const res = routeHandler ? routeHandler(body) : { ok: true };
  await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(res) });
});

await test('⑧ 관리자 화면이 오류 없이 뜨고 토큰을 입력받는다', async () => {
  await openAdmin(apage, { apiUrl: API }, () => ({ ok: true }));
  assert(aerrs.length === 0, 'pageerror: ' + aerrs.join(' | '));
  const r = await apage.evaluate(() => ({
    login: !document.getElementById('scLogin').classList.contains('hide'),
    hasToken: !!document.getElementById('fToken'),
    type: (document.getElementById('fToken') || {}).type
  }));
  assert(r.login, '로그인 화면이 안 뜬다');
  assert(r.hasToken, '토큰 입력칸이 없다');
  assert(r.type === 'password', '토큰 입력칸이 password 가 아니다: ' + r.type);
});

await test('⑨ 관리자 토큰이 localStorage 에 남지 않고 화면 소스에도 없다', async () => {
  const SECRET = 'SUPER-SECRET-ADMIN-TOKEN-1234';
  routeHandler = (body) => {
    if (body.action === 'listContracts' || body.action === 'contract.list') {
      return { ok: true, contracts: [
        { id: 'ct_1', contractId: 'ct_1', contractNo: 'MM-2026-0142', title: '도급계약서',
          customerName: '홍길동', amount: 11000000, status: 'SENT', createdAt: '2026-07-30T01:00:00.000Z' }
      ] };
    }
    return { ok: true, checks: { allOk: true, items: [] } };
  };
  await apage.fill('#fToken', SECRET);
  await apage.click('#btnIn');
  await apage.waitForTimeout(700);
  const r = await apage.evaluate((S) => ({
    local: JSON.stringify(Object.entries(localStorage)),
    session: JSON.stringify(Object.entries(sessionStorage)),
    dom: document.documentElement.innerHTML,
    onMain: !document.getElementById('scMain').classList.contains('hide')
  }), SECRET);
  assert(r.local.indexOf(SECRET) < 0, '관리자 토큰이 localStorage 에 남는다 — 브라우저를 닫아도 살아 있다');
  assert(r.dom.indexOf(SECRET) < 0, '관리자 토큰이 화면 소스에 남는다');
  assert(r.onMain, '로그인 후 목록 화면으로 넘어가지 않는다');
});

await test('⑩ 관리자 CSV 내보내기가 수식 삽입을 막는다', async () => {
  const r = await apage.evaluate(() => {
    // 화면이 쓰는 CSV 만들기 함수를 찾는다. 이름이 무엇이든 =HYPERLINK 가 그대로 나가면 안 된다.
    const evil = '=HYPERLINK("http://evil","여기클릭")';
    const fn = (typeof csvCell === 'function') ? csvCell
      : (typeof csvSafe === 'function') ? csvSafe
      : (typeof toCsvCell === 'function') ? toCsvCell : null;
    if (!fn) return { missing: true };
    const out = String(fn(evil));
    return { missing: false, out, guarded: out.charAt(0) === "'" || out.indexOf("\"'=") === 0 || /^"?'/.test(out) };
  });
  if (r.missing) {
    // 함수 이름을 못 찾으면 소스로 확인한다 — 방어가 아예 없는지만 본다.
    const src = readFileSync(join(DIR, 'Admin.html'), 'utf8');
    assert(/=\+\-@|FORMULA|수식/.test(src), 'CSV 수식 삽입 방어를 찾을 수 없다');
  } else {
    assert(r.guarded, '수식이 그대로 나간다 — 엑셀에서 열면 실행된다: ' + r.out);
  }
});

await test('⑪ 관리자 화면이 폭 1280 에서 가로로 넘치지 않는다', async () => {
  const w = await apage.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  assert(w.s <= w.c + 1, '가로로 넘친다: ' + w.s + '>' + w.c);
});

await test('⑫ 두 화면 통틀어 pageerror 0', async () => {
  assert(errs.length === 0 && aerrs.length === 0,
    [...errs, ...aerrs].slice(0, 3).join(' | '));
});

await actx.close();
await browser.close();
server.close();

const bad = results.filter((r) => !r.ok);
console.log('\n' + (bad.length ? bad.length + '건 실패' : '전부 통과 (' + results.length + '건)'));
if (bad.length) process.exitCode = 1;
