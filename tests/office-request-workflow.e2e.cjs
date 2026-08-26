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
  if (options.photoFixture) await page.route('**/js/office-request-photo.js**', (route) => route.fulfill({ contentType: 'text/javascript', body: "window.ManmulOfficePhoto={compressOfficePhoto:async(file)=>({name:file.name.replace(/\\.[^.]*$/,'.jpg'),mimeType:'image/jpeg',dataB64:'AA==',bytes:1})};" }));
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
