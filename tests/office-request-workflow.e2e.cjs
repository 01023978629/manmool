const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://script.google.com/macros/s/test-office-portal/exec';
const SESSION_KEY = 'manmul_office_session_v1';
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
let browser;
let origin;
let server;

function serveStatic(req, res) {
  const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

function loginResult() {
  return { ok: true, sessionToken: 'session-workflow', office: { id: 'office-1', slug: 'test-complex', complexName: '테스트 한빛마을 관리사무소' }, expiresAt: Date.now() + 3600000 };
}

function request(id, status = 'pending_review') {
  return { id, requestId: id, receiptNo: `MM-20260826-000${id.slice(-1)}`, unit: '101동 1203호', location: '욕실 천장', issueType: '누수', pipeType: '미확정', urgency: 'normal', description: '천장에서 물이 떨어집니다.', officeContact: { name: '김소장', phone: '010-1234-5678' }, residentContact: null, preferredVisitDate: '', status, createdAt: '2026-08-26T09:00:00.000Z' };
}

async function openPortal(respond, options = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  page.setDefaultTimeout(1500);
  const calls = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.addInitScript(() => {
    let sequence = 0;
    crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  });
  await page.route('**/office-api.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, apiUrl: API_URL }) }));
  if (options.photoFixture) {
    const body = options.photoFixture === 'deferred'
      ? "window.__photoDeferred=[];window.ManmulOfficePhoto={compressOfficePhoto:(file)=>new Promise((resolve)=>window.__photoDeferred.push({name:file.name,resolve:()=>resolve({name:file.name.replace(/\\.[^.]*$/,'.jpg'),mimeType:'image/jpeg',dataB64:file.name,bytes:1})}))};"
      : "window.ManmulOfficePhoto={compressOfficePhoto:async(file)=>({name:file.name.replace(/\\.[^.]*$/,'.jpg'),mimeType:'image/jpeg',dataB64:'AA==',bytes:1})};";
    await page.route('**/js/office-request-photo.js**', (route) => route.fulfill({ contentType: 'text/javascript', body }));
  }
  await page.route(API_URL, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(await respond(body, calls)) });
  });
  return { calls, page, pageErrors };
}

async function login(page) {
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  await page.locator('#officePin').fill('123456');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
}

async function openCreate(page) {
  await page.getByRole('button', { name: '새 접수 등록' }).click();
  await page.locator('#officeCreateView').waitFor({ state: 'visible' });
}

async function fillRequired(page) {
  await page.locator('[name="unit"]').fill('103동 1204호');
  await page.locator('[name="location"]').fill('욕실 천장');
  await page.locator('[name="issueType"]').selectOption('누수');
  await page.locator('#officeCreateForm [name="description"]').fill('천장에서 물이 떨어집니다.');
  await page.locator('[name="officeContactName"]').fill('김소장');
  await page.locator('[name="officeContactPhone"]').fill('01012345678');
  await page.locator('[name="privacyConsent"]').check();
}

function pngFile() { return { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JZ9cAAAAASUVORK5CYII=', 'base64') }; }

before(async () => {
  server = http.createServer(serveStatic);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('새 접수 양식은 필수 항목과 개인정보 동의를 첫 오류로 안내하고 단지 자유입력은 제공하지 않는다', async () => {
  const { page, pageErrors } = await openPortal(async (body) => body.action === 'officeLogin' ? loginResult() : { ok: true, requests: [] });
  await login(page);
  await openCreate(page);
  await page.getByRole('button', { name: '접수 저장' }).click();
  assert.match(await page.locator('#officeCreateError').innerText(), /동·호수/);
  assert.equal(await page.evaluate(() => document.activeElement.name), 'unit');
  assert.equal(await page.locator('#officeCreateForm input[name="complex"], #officeCreateForm textarea[name="complex"]').count(), 0);
  await fillRequired(page);
  await page.locator('[name="privacyConsent"]').uncheck();
  await page.getByRole('button', { name: '접수 저장' }).click();
  assert.match(await page.locator('#officeCreateError').innerText(), /개인정보/);
  assert.equal(await page.evaluate(() => document.activeElement.name), 'privacyConsent');
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('생성 재시도는 한 idempotency UUID와 같은 영수번호를 사용하고 브라우저 저장소에 접수 데이터를 남기지 않는다', async () => {
  let createAttempts = 0;
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    if (body.action === 'officeCreate') {
      createAttempts += 1;
      return createAttempts === 1 ? { ok: false, error: 'network-error' } : { ok: true, requestId: 'req-1', receiptNo: 'MM-20260826-0001', status: 'pending_review', createdAt: '2026-08-26T09:00:00.000Z' };
    }
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page); await openCreate(page); await fillRequired(page);
  await page.getByRole('button', { name: '접수 저장' }).click();
  await page.locator('#officeCreateError').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '접수 저장' }).click();
  await page.getByText('접수 완료 · MM-20260826-0001').waitFor();
  const creates = calls.filter((call) => call.action === 'officeCreate');
  assert.equal(creates.length, 2);
  assert.match(creates[0].payload.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(creates[0].payload.idempotencyKey, creates[1].payload.idempotencyKey);
  const storage = await page.evaluate(() => `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}`);
  assert.equal(storage.includes('천장에서 물이 떨어집니다.'), false);
  assert.equal(storage.includes(creates[0].payload.idempotencyKey), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('사진은 생성 뒤 순서대로 별도 UUID로 전송하며 실패한 슬롯만 같은 UUID로 재전송한다', async () => {
  let failedOnce = false;
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    if (body.action === 'officeCreate') return { ok: true, requestId: 'req-2', receiptNo: 'MM-20260826-0002', status: 'pending_review', createdAt: '2026-08-26T09:00:00.000Z' };
    if (body.action === 'officeUpload' && !failedOnce && body.payload.uploadId.endsWith('000000000002')) { failedOnce = true; return { ok: false, error: 'network-error' }; }
    if (body.action === 'officeUpload') return { ok: true, fileId: `file-${body.payload.uploadId.slice(-1)}`, name: 'server-name.jpg', mimeType: 'image/jpeg', size: 100, createdAt: '2026-08-26T09:00:00.000Z', uploadId: body.payload.uploadId };
    throw new Error(`unexpected ${body.action}`);
  }, { photoFixture: true });
  await login(page); await openCreate(page); await fillRequired(page);
  await page.locator('[name="photos"]').setInputFiles([pngFile(), { ...pngFile(), name: 'fixture-2.png' }]);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#officeCreateError').innerText(), '');
  await page.getByText('사진 준비 완료').waitFor();
  await page.getByRole('button', { name: '접수 저장' }).click();
  await page.getByText('접수 저장됨 · 사진 전송 필요').waitFor();
  const firstUploads = calls.filter((call) => call.action === 'officeUpload');
  assert.equal(calls.findIndex((call) => call.action === 'officeCreate') < calls.findIndex((call) => call.action === 'officeUpload'), true);
  assert.equal(firstUploads.length, 2);
  assert.deepEqual(firstUploads.map((call) => Object.keys(call.payload).sort()), [['dataB64', 'mimeType', 'requestId', 'uploadId'], ['dataB64', 'mimeType', 'requestId', 'uploadId']]);
  assert.notEqual(firstUploads[0].payload.uploadId, firstUploads[1].payload.uploadId);
  await page.getByRole('button', { name: '사진 다시 보내기' }).click();
  await page.getByText('접수 완료 · MM-20260826-0002').waitFor();
  const uploads = calls.filter((call) => call.action === 'officeUpload');
  assert.equal(uploads.length, 3);
  assert.equal(uploads[2].payload.uploadId, firstUploads[1].payload.uploadId);
  assert.equal(uploads[2].payload.requestId, 'req-2');
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('여섯 장의 사진은 서버 호출 전 거부한다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => body.action === 'officeLogin' ? loginResult() : { ok: true, requests: [] });
  await login(page); await openCreate(page); await fillRequired(page);
  await page.locator('[name="photos"]').setInputFiles(Array.from({ length: 6 }, (_, index) => ({ ...pngFile(), name: `fixture-${index}.png` })));
  await page.getByRole('button', { name: '접수 저장' }).click();
  assert.match(await page.locator('#officeCreateError').innerText(), /최대 5장/);
  assert.equal(calls.filter((call) => call.action !== 'officeLogin' && call.action !== 'officeList').length, 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('사진 압축은 GIF와 압축 뒤 2MiB 초과를 거부하고 1600px 및 JPEG 0.82를 사용한다', async () => {
  const { page, pageErrors } = await openPortal(async () => ({ ok: true, requests: [] }));
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  const result = await page.evaluate(async () => {
    const photo = window.ManmulOfficePhoto;
    const gif = await photo.compressOfficePhoto(new File(['gif'], 'x.gif', { type: 'image/gif' })).then(() => 'allowed', (error) => error.code);
    let canvas;
    const deps = {
      createImageBitmap: async () => ({ width: 3200, height: 800, close() {} }),
      document: { createElement() { canvas = { width: 0, height: 0, getContext() { return { drawImage() {} }; }, toBlob(callback, type, quality) { callback(new Blob([new Uint8Array(12)], { type: 'image/jpeg' })); this.type = type; this.quality = quality; } }; return canvas; } },
      FileReader,
    };
    const compressed = await photo.compressOfficePhoto(new File(['png'], 'x.png', { type: 'image/png' }), deps);
    const tooLarge = await photo.compressOfficePhoto(new File(['png'], 'x.png', { type: 'image/png' }), { ...deps, document: { createElement() { return { width: 0, height: 0, getContext() { return { drawImage() {} }; }, toBlob(callback) { callback(new Blob([new Uint8Array((2 * 1024 * 1024) + 1)], { type: 'image/jpeg' })); } }; } } }).then(() => 'allowed', (error) => error.code);
    return { gif, compressed, width: canvas.width, height: canvas.height, type: canvas.type, quality: canvas.quality, tooLarge };
  });
  assert.deepEqual({ gif: result.gif, width: result.width, height: result.height, type: result.type, quality: result.quality, tooLarge: result.tooLarge }, { gif: 'unsupported-type', width: 1600, height: 400, type: 'image/jpeg', quality: 0.82, tooLarge: 'too-large' });
  assert.equal(result.compressed.mimeType, 'image/jpeg');
  assert.equal(result.compressed.dataB64.startsWith('data:'), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('수정과 취소는 pending_review 또는 needs_info에만 노출되고 성공 뒤 officeGet으로 갱신한다', async () => {
  let latest = request('req-1', 'pending_review');
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [latest, request('req-accepted', 'accepted')] };
    if (body.action === 'officeUpdate') return { ok: true, requestId: 'req-1', status: 'pending_review', updatedAt: '2026-08-26T10:00:00.000Z' };
    if (body.action === 'officeCancel') return { ok: true, requestId: 'req-1', status: 'cancelled', updatedAt: '2026-08-26T11:00:00.000Z' };
    if (body.action === 'officeGet') { latest = body.payload.requestId === 'req-1' && calls.some((call) => call.action === 'officeCancel') ? request('req-1', 'cancelled') : request('req-1', 'pending_review'); return { ok: true, request: latest }; }
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  assert.equal(await page.locator('[data-office-edit="req-1"]').count(), 1);
  assert.equal(await page.locator('[data-office-cancel="req-1"]').count(), 1);
  assert.equal(await page.locator('[data-office-edit="req-accepted"], [data-office-cancel="req-accepted"]').count(), 0);
  await page.locator('[data-office-edit="req-1"]').click();
  assert.equal(await page.locator('#officePhotoField').isHidden(), true);
  assert.equal(await page.locator('[name="photos"]').isDisabled(), true);
  await page.locator('#officeCreateForm [name="description"]').fill('수정된 증상');
  await page.getByRole('button', { name: '수정 저장' }).click();
  await page.getByText('수정 내용을 저장했습니다.').waitFor();
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('[data-office-cancel="req-1"]').click();
  await page.getByText('취소됨').waitFor();
  assert.deepEqual(calls.filter((call) => ['officeUpdate', 'officeCancel', 'officeGet'].includes(call.action)).map((call) => call.action), ['officeUpdate', 'officeGet', 'officeCancel', 'officeGet']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('accepted 접수는 UI에서 수정 또는 취소 API를 호출할 수 없다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => body.action === 'officeLogin' ? loginResult() : { ok: true, requests: [request('req-accepted', 'accepted')] });
  await login(page);
  assert.equal(await page.locator('[data-office-edit="req-accepted"], [data-office-cancel="req-accepted"]').count(), 0);
  assert.equal(calls.some((call) => call.action === 'officeUpdate' || call.action === 'officeCancel'), false);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('업로드 세션 만료는 사진 재시도가 아니라 로그인 복귀와 민감한 초안 제거로 처리한다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    if (body.action === 'officeCreate') return { ok: true, requestId: 'req-expired', receiptNo: 'MM-20260826-0091', status: 'pending_review', createdAt: '2026-08-26T09:00:00.000Z' };
    if (body.action === 'officeUpload') return { ok: false, error: 'session-expired' };
    throw new Error(`unexpected ${body.action}`);
  }, { photoFixture: true });
  await login(page); await openCreate(page); await fillRequired(page);
  await page.locator('[name="photos"]').setInputFiles(pngFile());
  await page.getByText('사진 준비 완료').waitFor();
  await page.getByRole('button', { name: '접수 저장' }).click();
  await page.locator('#officeLoginView').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: '사진 다시 보내기' }).isHidden(), true);
  assert.equal(await page.locator('[name="photos"]').evaluate((input) => input.files.length), 0);
  assert.equal(await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY), null);
  assert.equal(calls.some((call) => call.action === 'officeUpload'), true);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('create 성공 뒤 submitOfficeRequest는 결과 객체를 반환하고 일반 저장을 잠근다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    if (body.action === 'officeCreate') return { ok: true, requestId: 'req-locked', receiptNo: 'MM-20260826-0092', status: 'pending_review', createdAt: '2026-08-26T09:00:00.000Z' };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page); await openCreate(page); await fillRequired(page);
  const result = await page.evaluate(async () => {
    const form = document.getElementById('officeCreateForm');
    const saved = await window.submitOfficeRequest(form);
    return { saved, disabled: document.getElementById('officeCreateSubmit').disabled, hidden: document.getElementById('officeCreateSubmit').hidden };
  });
  assert.equal(result.saved.request.requestId, 'req-locked');
  assert.equal(result.saved.photosComplete, true);
  assert.equal(result.disabled || result.hidden, true);
  await page.evaluate(() => document.getElementById('officeCreateForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await page.waitForTimeout(50);
  assert.equal(calls.filter((call) => call.action === 'officeCreate').length, 1);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('새 사진 선택은 이전 슬롯을 교체하고 늦게 끝난 이전 압축 결과를 전송하지 않는다', async () => {
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    if (body.action === 'officeCreate') return { ok: true, requestId: 'req-reselect', receiptNo: 'MM-20260826-0093', status: 'pending_review', createdAt: '2026-08-26T09:00:00.000Z' };
    if (body.action === 'officeUpload') return { ok: true, fileId: 'f', name: 'server.jpg', mimeType: 'image/jpeg', size: 1, createdAt: '2026-08-26T09:00:00.000Z', uploadId: body.payload.uploadId };
    throw new Error(`unexpected ${body.action}`);
  }, { photoFixture: 'deferred' });
  await login(page); await openCreate(page); await fillRequired(page);
  await page.locator('[name="photos"]').setInputFiles({ ...pngFile(), name: 'first.png' });
  await page.waitForFunction(() => window.__photoDeferred.length === 1);
  await page.locator('[name="photos"]').setInputFiles({ ...pngFile(), name: 'second.png' });
  await page.waitForFunction(() => window.__photoDeferred.length === 2);
  await page.evaluate(() => window.__photoDeferred[1].resolve());
  await page.getByText('사진 준비 완료').waitFor();
  await page.evaluate(() => window.__photoDeferred[0].resolve());
  await page.waitForTimeout(50);
  await page.getByRole('button', { name: '접수 저장' }).click();
  await page.getByText('접수 완료 · MM-20260826-0093').waitFor();
  const uploads = calls.filter((call) => call.action === 'officeUpload');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].payload.dataB64, 'second.png');
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('사진 업로드는 앞 슬롯 응답 전 다음 슬롯을 시작하지 않는다', async () => {
  let inFlight = 0, maxInFlight = 0, releaseFirst, releaseSecond, startedFirst, startedSecond;
  const firstStarted = new Promise((resolve) => { startedFirst = resolve; });
  const secondStarted = new Promise((resolve) => { startedSecond = resolve; });
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    if (body.action === 'officeCreate') return { ok: true, requestId: 'req-sequence', receiptNo: 'MM-20260826-0094', status: 'pending_review', createdAt: '2026-08-26T09:00:00.000Z' };
    if (body.action === 'officeUpload') {
      inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
      const isFirst = !releaseFirst;
      const pending = new Promise((resolve) => { if (isFirst) { releaseFirst = resolve; startedFirst(); } else { releaseSecond = resolve; startedSecond(); } });
      await pending; inFlight -= 1;
      return { ok: true, fileId: 'f', name: 'server.jpg', mimeType: 'image/jpeg', size: 1, createdAt: '2026-08-26T09:00:00.000Z', uploadId: body.payload.uploadId };
    }
    throw new Error(`unexpected ${body.action}`);
  }, { photoFixture: true });
  await login(page); await openCreate(page); await fillRequired(page);
  await page.locator('[name="photos"]').setInputFiles([pngFile(), { ...pngFile(), name: 'two.png' }]);
  await page.getByText('사진 준비 완료').waitFor();
  await page.getByRole('button', { name: '접수 저장' }).click();
  await firstStarted;
  await page.waitForTimeout(100);
  assert.equal(maxInFlight, 1);
  releaseFirst();
  await secondStarted;
  assert.equal(maxInFlight, 1);
  releaseSecond();
  await page.getByText('접수 완료 · MM-20260826-0094').waitFor();
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('실제 Chromium PNG는 createImageBitmap과 Image fallback에서 JPEG로 압축되고 object URL을 해제한다', async () => {
  const { page, pageErrors } = await openPortal(async () => ({ ok: true, requests: [] }));
  await page.goto(`${origin}/office-request.html?office=test-complex`);
  const result = await page.evaluate(async () => {
    const makeFile = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = 1000;
      canvas.getContext('2d').fillRect(0, 0, 2000, 1000);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return new File([blob], 'real.png', { type: 'image/png' });
    };
    const decodeOutput = async (compressed) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.width, height: image.height }); image.onerror = reject; image.src = `data:image/jpeg;base64,${compressed.dataB64}`; });
    const nativeBitmap = window.createImageBitmap; let bitmapCalls = 0;
    window.createImageBitmap = (...args) => { bitmapCalls += 1; return nativeBitmap(...args); };
    const bitmap = await window.ManmulOfficePhoto.compressOfficePhoto(await makeFile());
    window.createImageBitmap = undefined;
    const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL; let revoked = 0;
    URL.createObjectURL = (...args) => createUrl(...args); URL.revokeObjectURL = (...args) => { revoked += 1; return revokeUrl(...args); };
    const fallback = await window.ManmulOfficePhoto.compressOfficePhoto(await makeFile());
    URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl; window.createImageBitmap = nativeBitmap;
    return { bitmapCalls, bitmap: { mimeType: bitmap.mimeType, ...(await decodeOutput(bitmap)) }, fallback: { mimeType: fallback.mimeType, ...(await decodeOutput(fallback)) }, revoked };
  });
  assert.deepEqual(result.bitmap, { mimeType: 'image/jpeg', width: 1600, height: 800 });
  assert.deepEqual(result.fallback, { mimeType: 'image/jpeg', width: 1600, height: 800 });
  assert.equal(result.bitmapCalls > 0, true);
  assert.equal(result.revoked, 1);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('서버 invalid-status는 officeGet으로 실제 상태를 반영하고 대표 전화 안내로 돌아간다', async () => {
  const latest = request('req-stale', 'pending_review');
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [latest] };
    if (body.action === 'officeUpdate') return { ok: false, error: 'invalid-status' };
    if (body.action === 'officeGet') return { ok: true, request: request('req-stale', 'accepted') };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page); await page.locator('[data-office-edit="req-stale"]').click();
  await page.getByRole('button', { name: '수정 저장' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  assert.match(await page.locator('#officeSyncStatus').innerText(), /대표 확인 후에는 전화/);
  assert.equal(await page.locator('[data-office-edit="req-stale"], [data-office-cancel="req-stale"]').count(), 0);
  assert.deepEqual(calls.filter((call) => ['officeUpdate', 'officeGet'].includes(call.action)).map((call) => call.action), ['officeUpdate', 'officeGet']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('취소의 stale invalid-status도 officeGet으로 실제 상태를 반영한다', async () => {
  const latest = request('req-cancel-stale', 'needs_info');
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [latest] };
    if (body.action === 'officeCancel') return { ok: false, error: 'invalid-status' };
    if (body.action === 'officeGet') return { ok: true, request: request('req-cancel-stale', 'accepted') };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page); await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('[data-office-cancel="req-cancel-stale"]').click();
  await page.getByText('대표 확인 후에는 전화로 변경해 주세요').waitFor();
  assert.match(await page.locator('#officeSyncStatus').innerText(), /대표 확인 후에는 전화/);
  assert.equal(await page.locator('[data-office-edit="req-cancel-stale"], [data-office-cancel="req-cancel-stale"]').count(), 0);
  assert.deepEqual(calls.filter((call) => ['officeCancel', 'officeGet'].includes(call.action)).map((call) => call.action), ['officeCancel', 'officeGet']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('일시적인 수정 오류 뒤에는 입력을 보존하고 수정 저장을 다시 눌러 성공할 수 있다', async () => {
  let updateAttempts = 0;
  const latest = request('req-edit-retry', 'pending_review');
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [latest] };
    if (body.action === 'officeUpdate') { updateAttempts += 1; return updateAttempts === 1 ? { ok: false, error: 'network-error' } : { ok: true, requestId: 'req-edit-retry', status: 'pending_review', updatedAt: '2026-08-26T10:00:00.000Z' }; }
    if (body.action === 'officeGet') return { ok: true, request: { ...latest, description: '다시 저장할 증상' } };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page); await page.locator('[data-office-edit="req-edit-retry"]').click();
  await page.locator('#officeCreateForm [name="description"]').fill('다시 저장할 증상');
  await page.getByRole('button', { name: '수정 저장' }).click();
  await page.locator('#officeCreateError').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#officeCreateForm [name="description"]').inputValue(), '다시 저장할 증상');
  assert.equal(await page.getByRole('button', { name: '수정 저장' }).isEnabled(), true);
  assert.equal(await page.locator('#officeCreateView').isVisible(), true);
  await page.getByRole('button', { name: '수정 저장' }).click();
  await page.getByText('수정 내용을 저장했습니다.').waitFor();
  assert.equal(calls.filter((call) => call.action === 'officeUpdate').length, 2);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('retryOfficePhotos는 실패 시 false, 모든 사진 전송 뒤 true boolean을 반환한다', async () => {
  let uploadAttempts = 0;
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [] };
    if (body.action === 'officeCreate') return { ok: true, requestId: 'req-retry-bool', receiptNo: 'MM-20260826-0095', status: 'pending_review', createdAt: '2026-08-26T09:00:00.000Z' };
    if (body.action === 'officeUpload') { uploadAttempts += 1; return uploadAttempts < 3 ? { ok: false, error: 'network-error' } : { ok: true, fileId: 'f', name: 'server.jpg', mimeType: 'image/jpeg', size: 1, createdAt: '2026-08-26T09:00:00.000Z', uploadId: body.payload.uploadId }; }
    throw new Error(`unexpected ${body.action}`);
  }, { photoFixture: true });
  await login(page); await openCreate(page); await fillRequired(page);
  await page.locator('[name="photos"]').setInputFiles(pngFile());
  await page.getByText('사진 준비 완료').waitFor();
  await page.getByRole('button', { name: '접수 저장' }).click();
  await page.getByText('접수 저장됨 · 사진 전송 필요').waitFor();
  const result = await page.evaluate(async () => ({ first: await window.retryOfficePhotos(), second: await window.retryOfficePhotos() }));
  assert.deepEqual(result, { first: false, second: true });
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('invalid-status 뒤 officeGet 재조회도 실패하면 해당 로컬 행의 수정과 취소를 잠근다', async () => {
  const latest = request('req-refresh-fail', 'pending_review');
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [latest] };
    if (body.action === 'officeUpdate') return { ok: false, error: 'invalid-status' };
    if (body.action === 'officeGet') return { ok: false, error: 'network-error' };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page); await page.locator('[data-office-edit="req-refresh-fail"]').click();
  await page.getByRole('button', { name: '수정 저장' }).click();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  await page.getByText('현재 상태를 새로고침하지 못했습니다. 대표 확인 후에는 전화로 변경해 주세요').waitFor();
  assert.equal(await page.locator('[data-office-edit="req-refresh-fail"], [data-office-cancel="req-refresh-fail"]').count(), 0);
  assert.deepEqual(calls.filter((call) => ['officeUpdate', 'officeGet'].includes(call.action)).map((call) => call.action), ['officeUpdate', 'officeGet']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('officeGet 재조회 실패 차단은 대상 행에만 적용되고 다음 officeList는 서버 상태로 임시 차단을 대체한다', async () => {
  const target = request('req-target-refresh', 'pending_review');
  const other = request('req-other-refresh', 'needs_info');
  let listCalls = 0;
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') {
      listCalls += 1;
      return { ok: true, requests: listCalls === 1 ? [target, other] : [{ ...target, status: 'needs_info' }, other] };
    }
    if (body.action === 'officeUpdate') return { ok: false, error: 'invalid-status' };
    if (body.action === 'officeGet') return { ok: false, error: 'network-error' };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  await page.locator('[data-office-edit="req-target-refresh"]').click();
  await page.getByRole('button', { name: '수정 저장' }).click();
  await page.getByText('현재 상태를 새로고침하지 못했습니다. 대표 확인 후에는 전화로 변경해 주세요').waitFor();
  assert.equal(await page.locator('[data-office-edit="req-target-refresh"], [data-office-cancel="req-target-refresh"]').count(), 0);
  assert.equal(await page.locator('[data-office-edit="req-other-refresh"]').count(), 1);
  assert.equal(await page.locator('[data-office-cancel="req-other-refresh"]').count(), 1);
  await page.reload();
  await page.locator('#officeDashboardView').waitFor({ state: 'visible' });
  await page.locator('[data-office-edit="req-target-refresh"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-office-cancel="req-target-refresh"]').count(), 1);
  assert.match(await page.locator('#officeRequestList').innerText(), /내용 확인 필요/);
  assert.equal(calls.filter((call) => call.action === 'officeList').length, 2);
  assert.deepEqual(calls.filter((call) => ['officeUpdate', 'officeGet'].includes(call.action)).map((call) => call.action), ['officeUpdate', 'officeGet']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('상세 화면은 officeGet의 공개 상태와 완료 보고만 textContent로 표시하고 공개 사진만 요청한다', async () => {
  const listed = request('req-public-report', 'completed');
  const detail = {
    ...listed,
    visitAt: '2026-08-28T10:30:00+09:00',
    publicAmount: 0,
    completionReport: {
      summary: '완료 <img src=x onerror="window.__portalXss=true">',
      publicPhotoIds: ['public-photo'],
      photoIds: ['internal-photo'],
      privateNote: '대표 내부 메모',
    },
    internalCost: 150000,
    margin: 70000,
    officeContact: { name: '김소장', phone: '010-1234-5678' },
    residentContact: { name: '입주민', phone: '010-9999-8888' },
    unrelatedPhotoId: 'unrelated-photo',
  };
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [listed] };
    if (body.action === 'officeGet') return { ok: true, request: detail };
    if (body.action === 'officePhoto') {
      assert.deepEqual(body.payload, { requestId: 'req-public-report', photoId: 'public-photo' });
      return { ok: true, photoId: 'public-photo', mimeType: 'image/png', dataB64: 'iVBORw0KGgo=' };
    }
    throw new Error(`unexpected ${body.action}`);
  });
  await page.addInitScript(() => { window.__portalXss = false; });
  await login(page);
  await page.getByRole('button', { name: '상세 보기' }).click();
  await page.locator('#officeDetailView').waitFor({ state: 'visible' });
  const text = await page.locator('#officeDetailView').innerText();
  assert.match(text, /작업 완료/);
  assert.match(text, /방문 예정\s*2026-08-28T10:30:00\+09:00/);
  assert.match(text, /공개 금액\s*0원/);
  assert.match(text, /완료 <img src=x onerror=/);
  for (const privateValue of ['010-1234-5678', '010-9999-8888', '150000', '70000', 'internal-photo', 'unrelated-photo', '대표 내부 메모']) {
    assert.equal(text.includes(privateValue), false, `비공개 값 노출: ${privateValue}`);
  }
  assert.equal(await page.locator('#officeCompletionSummary img').count(), 0);
  assert.equal(await page.locator('#officeCompletionPhotos img').count(), 1);
  assert.equal(await page.evaluate(() => window.__portalXss), false);
  assert.deepEqual(calls.filter((call) => call.action === 'officePhoto').map((call) => call.payload.photoId), ['public-photo']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('상세 화면은 보고서 없음과 유효하지 않은 사진을 안전하게 처리하고 이미지 DOM을 지운다', async () => {
  const withPhoto = request('req-photo-cleanup', 'paid');
  const noReport = request('req-no-report', 'on_hold');
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [withPhoto, noReport] };
    if (body.action === 'officeGet' && body.payload.requestId === 'req-photo-cleanup') return { ok: true, request: { ...withPhoto, completionReport: { summary: '공개 완료', publicPhotoIds: ['published'] } } };
    if (body.action === 'officeGet' && body.payload.requestId === 'req-no-report') return { ok: true, request: { ...noReport, visitAt: '', publicAmount: '10000', completionReport: null } };
    if (body.action === 'officePhoto') return { ok: true, photoId: 'other-photo', mimeType: 'image/png', dataB64: 'iVBORw0KGgo=' };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  await page.locator('[data-office-detail="req-photo-cleanup"]').click();
  await page.locator('#officeDetailView').waitFor({ state: 'visible' });
  await page.getByText('완료 사진을 불러오지 못했습니다.').waitFor();
  assert.equal(await page.locator('#officeCompletionPhotos img').count(), 0);
  await page.getByRole('button', { name: '목록으로' }).click();
  await page.locator('[data-office-detail="req-no-report"]').click();
  await page.getByText('완료 보고서가 아직 공개되지 않았습니다.').waitFor();
  assert.equal(await page.locator('#officeDetailVisitRow').isHidden(), true);
  assert.equal(await page.locator('#officeDetailAmountRow').isHidden(), true);
  assert.equal(await page.locator('#officeCompletionPhotos img').count(), 0);
  assert.deepEqual(calls.filter((call) => call.action === 'officePhoto').map((call) => call.payload.photoId), ['published']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('대시보드는 계약된 열 가지 상태를 고정된 한국어 라벨로 표시한다', async () => {
  const statuses = [
    ['pending_review', '접수됨'], ['needs_info', '내용 확인 필요'], ['accepted', '확인 완료'], ['visit_scheduled', '방문 예정'], ['in_progress', '작업 중'],
    ['completed', '작업 완료'], ['billed', '청구 완료'], ['paid', '처리 완료'], ['on_hold', '확인 중'], ['cancelled', '취소됨'],
  ];
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: statuses.map(([status], index) => request(`req-status-${index}`, status)) };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  const text = await page.locator('#officeRequestList').innerText();
  for (const [, label] of statuses) assert.equal(text.includes(label), true, `상태 라벨 누락: ${label}`);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('상세 상태 타임라인은 정상 단계와 보완·보류·취소 분기를 구분해 현재 상태를 표시한다', async () => {
  const cases = [
    ['pending_review', '접수됨', [], '접수됨'], ['accepted', '확인 완료', [0], '확인 완료'], ['visit_scheduled', '방문 예정', [0, 1], '방문 예정'],
    ['in_progress', '작업 중', [0, 1, 2], '작업 중'], ['completed', '작업 완료', [0, 1, 2, 3], '작업 완료'], ['billed', '청구 완료', [0, 1, 2, 3, 4], '청구 완료'],
    ['paid', '처리 완료', [0, 1, 2, 3, 4, 5], '처리 완료'], ['needs_info', '내용 확인 필요', [], '내용 확인 필요'], ['on_hold', '확인 중', [], '확인 중'], ['cancelled', '취소됨', [], '취소됨'],
    ['unknown-status', '상태 확인 중', [], '상태 확인 중'],
  ];
  const items = cases.map(([status], index) => request(`req-timeline-${index}`, status));
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: items };
    if (body.action === 'officeGet') return { ok: true, request: items.find((item) => item.requestId === body.payload.requestId) };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  for (const [status, currentLabel, completed, expectedCurrent] of cases) {
    const item = items.find((entry) => entry.status === status);
    await page.locator(`[data-office-detail="${item.requestId}"]`).click();
    await page.locator('#officeDetailView').waitFor({ state: 'visible' });
    const timeline = await page.locator('#officeStatusTimeline > li').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent.trim(), completed: node.classList.contains('is-complete'), current: node.classList.contains('is-current'), ariaCurrent: node.getAttribute('aria-current') })));
    const current = timeline.filter((entry) => entry.current);
    assert.deepEqual(current, [{ text: currentLabel, completed: false, current: true, ariaCurrent: 'step' }], `${status} 현재 단계`);
    assert.deepEqual(timeline.slice(0, 7).map((entry, index) => entry.completed ? index : -1).filter((index) => index >= 0), completed, `${status} 완료 단계`);
    assert.equal(timeline.some((entry) => entry.text === expectedCurrent), true);
    await page.getByRole('button', { name: '목록으로' }).click();
  }
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('완료 사진은 검증된 data URL만 표시하고 뒤로가기·로그아웃·세션 만료에서 src와 DOM을 제거한다', async () => {
  const valid = request('req-valid-photo', 'completed');
  const expired = request('req-expired-detail', 'completed');
  let expiredGet = false;
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [valid, expired] };
    if (body.action === 'officeGet' && body.payload.requestId === 'req-valid-photo') return { ok: true, request: { ...valid, completionReport: { summary: '공개 완료', publicPhotoIds: ['public-image'] } } };
    if (body.action === 'officeGet' && body.payload.requestId === 'req-expired-detail') { expiredGet = true; return { ok: false, error: 'session-expired' }; }
    if (body.action === 'officePhoto') return { ok: true, photoId: 'public-image', mimeType: 'image/png', dataB64: 'iVBORw0KGgo=' };
    throw new Error(`unexpected ${body.action}`);
  });
  async function openValid() {
    await page.locator('[data-office-detail="req-valid-photo"]').click();
    await page.locator('#officeCompletionPhotos img').waitFor();
    await page.evaluate(() => { window.__observedOfficeImage = document.querySelector('#officeCompletionPhotos img'); });
    assert.match(await page.locator('#officeCompletionPhotos img').getAttribute('src'), /^data:image\/png;base64,iVBORw0KGgo=$/);
  }
  await login(page);
  await openValid();
  await page.getByRole('button', { name: '목록으로' }).click();
  assert.deepEqual(await page.evaluate(() => ({ connected: document.body.contains(window.__observedOfficeImage), src: window.__observedOfficeImage.getAttribute('src') })), { connected: false, src: null });
  await openValid();
  await page.evaluate(() => document.getElementById('officeLogout').click());
  await page.locator('#officeLoginView').waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => ({ connected: document.body.contains(window.__observedOfficeImage), src: window.__observedOfficeImage.getAttribute('src') })), { connected: false, src: null });
  await login(page);
  await openValid();
  await page.evaluate(() => window.openOfficeDetail('req-expired-detail'));
  await page.locator('#officeLoginView').waitFor({ state: 'visible' });
  assert.equal(expiredGet, true);
  assert.deepEqual(await page.evaluate(() => ({ connected: document.body.contains(window.__observedOfficeImage), src: window.__observedOfficeImage.getAttribute('src'), active: document.activeElement.id })), { connected: false, src: null, active: 'officePin' });
  assert.deepEqual(calls.filter((call) => call.action === 'officePhoto').map((call) => call.payload.photoId), ['public-image', 'public-image', 'public-image']);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('완료 사진은 SVG MIME, 빈값, 비표준 base64, 초과 base64와 다른 photoId를 이미지로 만들지 않는다', async () => {
  const invalid = [
    ['svg', { photoId: 'svg-photo', mimeType: 'image/svg+xml', dataB64: 'PHN2Zy8+' }],
    ['empty', { photoId: 'empty-photo', mimeType: 'image/png', dataB64: '' }],
    ['invalid', { photoId: 'invalid-photo', mimeType: 'image/png', dataB64: 'not*base64' }],
    ['nonstandard', { photoId: 'nonstandard-photo', mimeType: 'image/png', dataB64: 'YWJj\n' }],
    ['oversized', { photoId: 'oversized-photo', mimeType: 'image/png', dataB64: 'A'.repeat((4 * Math.ceil((2 * 1024 * 1024) / 3)) + 4) }],
    ['mismatch', { photoId: 'other-photo', mimeType: 'image/png', dataB64: 'iVBORw0KGgo=' }],
  ];
  const items = invalid.map(([kind]) => request(`req-invalid-${kind}`, 'completed'));
  const { calls, page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: items };
    if (body.action === 'officeGet') {
      const item = items.find((entry) => entry.requestId === body.payload.requestId);
      return { ok: true, request: { ...item, completionReport: { summary: '공개 완료', publicPhotoIds: [`${item.requestId.slice('req-invalid-'.length)}-photo`] } } };
    }
    if (body.action === 'officePhoto') return { ok: true, ...invalid.find(([kind]) => body.payload.photoId === `${kind}-photo`)[1] };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  for (const [kind] of invalid) {
    await page.locator(`[data-office-detail="req-invalid-${kind}"]`).click();
    await page.getByText('완료 사진을 불러오지 못했습니다.').waitFor();
    assert.equal(await page.locator('#officeCompletionPhotos img').count(), 0, `${kind} 이미지가 생성됨`);
    await page.getByRole('button', { name: '목록으로' }).click();
  }
  assert.deepEqual(calls.filter((call) => call.action === 'officePhoto').map((call) => call.payload.photoId), invalid.map(([kind]) => `${kind}-photo`));
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('완료 사진은 검증된 JPEG와 WebP 응답도 각각 data URL 이미지로 표시한다', async () => {
  const fixtures = [
    ['jpeg', 'image/jpeg', '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z'],
    ['webp', 'image/webp', 'UklGRiIAAABXRUJQVlA4ICAAAAAwAQCdASoBAAEALmk0mk0iIiIiIhYA'],
  ];
  const items = fixtures.map(([kind]) => request(`req-${kind}-photo`, 'completed'));
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: items };
    if (body.action === 'officeGet') {
      const item = items.find((entry) => entry.requestId === body.payload.requestId);
      return { ok: true, request: { ...item, completionReport: { summary: '공개 완료', publicPhotoIds: [`${item.requestId.slice(4, -6)}-photo`] } } };
    }
    if (body.action === 'officePhoto') {
      const [kind, mimeType, dataB64] = fixtures.find(([name]) => body.payload.photoId === `${name}-photo`);
      return { ok: true, photoId: `${kind}-photo`, mimeType, dataB64 };
    }
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  for (const [kind, mimeType] of fixtures) {
    await page.locator(`[data-office-detail="req-${kind}-photo"]`).click();
    const image = page.locator('#officeCompletionPhotos img');
    await image.waitFor();
    assert.match(await image.getAttribute('src'), new RegExp(`^data:${mimeType};base64,`));
    await page.getByRole('button', { name: '목록으로' }).click();
  }
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('상세 응답 경합에서는 늦은 A가 빠른 B 상세 화면을 덮어쓰지 않는다', async () => {
  const a = request('req-race-a', 'accepted');
  const b = request('req-race-b', 'paid');
  let releaseA;
  const aPending = new Promise((resolve) => { releaseA = resolve; });
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [a, b] };
    if (body.action === 'officeGet' && body.payload.requestId === a.requestId) return aPending;
    if (body.action === 'officeGet' && body.payload.requestId === b.requestId) return { ok: true, request: b };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  await page.locator('[data-office-detail="req-race-a"]').click();
  await page.locator('[data-office-detail="req-race-b"]').click();
  await page.getByText(b.receiptNo).waitFor();
  releaseA({ ok: true, request: a });
  await page.waitForTimeout(100);
  assert.equal((await page.locator('#officeDetailReceipt').innerText()), b.receiptNo);
  assert.match(await page.locator('#officeDetailStatus').innerText(), /처리 완료/);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test('상세 진입은 제목에 초점을 옮기고 뒤로가기는 원래 버튼에 복원하며 영수번호 없이는 requestId를 표시하지 않는다', async () => {
  const hiddenReceipt = { ...request('req-internal-only', 'pending_review'), receiptNo: '' };
  const { page, pageErrors } = await openPortal(async (body) => {
    if (body.action === 'officeLogin') return loginResult();
    if (body.action === 'officeList') return { ok: true, requests: [hiddenReceipt] };
    if (body.action === 'officeGet') return { ok: true, request: hiddenReceipt };
    throw new Error(`unexpected ${body.action}`);
  });
  await login(page);
  assert.equal((await page.locator('#officeRequestList').innerText()).includes('req-internal-only'), false);
  await page.locator('[data-office-detail="req-internal-only"]').click();
  await page.locator('#officeDetailView').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'officeDetailTitle');
  const detailText = await page.locator('#officeDetailView').innerText();
  assert.equal(detailText.includes('req-internal-only'), false);
  assert.match(detailText, /접수번호 확인 불가/);
  await page.getByRole('button', { name: '목록으로' }).click();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-office-detail')), 'req-internal-only');
  assert.deepEqual(pageErrors, []);
  await page.close();
});
