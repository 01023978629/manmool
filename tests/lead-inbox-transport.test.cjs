'use strict';
/* 공용 전송 모듈(js/lead-transport.js)의 문의 접수함 경로 검사.

   계약
   - 접수함이 켜져 있으면 메일 경로(n8n/폼 서비스) 뒤에 접수함(leadCreate)을 호출한다.
   - 하나라도 받았으면 true. 둘 다 실패해야 실패. 접수함 줄에는 메일 발송 여부가 남는다.
   - leadId 는 deliver 가 붙이고, 같은 payload 로 재시도하면 같은 leadId 가 간다(접수함 중복 방지).
   - 접수함 주소는 script.google.com 의 /exec 만 인정한다. 그 밖의 주소는 접수함이 없는 것과 같다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'lead-transport.js'), 'utf8');
const EMAIL_URL = 'https://fixture.invalid/lead';
const INBOX_URL = 'https://script.google.com/macros/s/fixture-lead-inbox/exec';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

function loadLead(fetchImpl) {
  const storageCalls = [];
  const calls = [];
  const context = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array, String, Number, Boolean, Error, TypeError, RegExp,
    AbortController: globalThis.AbortController, TextEncoder, URL,
    localStorage: { getItem: () => null, setItem: (k) => storageCalls.push(['setItem', k]), removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: (k) => storageCalls.push(['session.setItem', k]), removeItem: () => {} },
    navigator: { onLine: true, clipboard: { writeText: async () => {} } },
    document: { addEventListener() {}, createElement: () => ({ style: {}, setAttribute() {}, select() {} }), body: { appendChild() {}, removeChild() {} }, execCommand: () => false },
    location: { href: 'http://127.0.0.1/', search: '' },
    fetch: async (url, options) => {
      calls.push({ url, body: options && options.body ? JSON.parse(options.body) : null });
      return fetchImpl(url, options);
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'lead-transport.js' });
  return { lead: context.ManmulLead, calls, storageCalls };
}

const formsOnly = () => ({ forms: { enabled: true, provider: 'web3forms', endpoint: EMAIL_URL, accessKey: 'synthetic-access-key' } });
const inboxOnly = () => ({ inbox: { enabled: true, url: INBOX_URL } });
const both = () => Object.assign(formsOnly(), inboxOnly());
const payload = () => ({ name: '검사 손님', phone: '010-1234-5678', type: '아파트', privacyConsent: true, source: 'index' });

function router(emailBody, inboxBody) {
  return async (url) => {
    if (url === EMAIL_URL) return typeof emailBody === 'function' ? emailBody() : response(200, emailBody);
    if (url === INBOX_URL) return typeof inboxBody === 'function' ? inboxBody() : response(200, inboxBody);
    throw new Error(`unexpected url ${url}`);
  };
}

async function notAccepted(promise) {
  let rejected = false; let value;
  try { value = await promise; } catch (_) { rejected = true; }
  if (!rejected) assert.equal(value, false, '접수되지 않은 문의를 성공으로 처리하면 안 된다');
}

test('접수함이 꺼져 있으면(기본값) 메일 경로만 호출하고 leadId 만 붙는다', async () => {
  const loaded = loadLead(router('{"success":true}', '{"ok":true}'));
  const data = payload();
  assert.equal(await loaded.lead.deliver(formsOnly(), data), true);
  assert.deepEqual(loaded.calls.map((c) => c.url), [EMAIL_URL]);
  assert.match(data.leadId, UUID);
  assert.equal(loaded.lead.backendConfigured(inboxOnly()), true);
  assert.equal(loaded.lead.backendConfigured({ inbox: { enabled: true, url: 'https://evil.invalid/macros/s/x/exec' } }), false);
  assert.equal(loaded.lead.backendConfigured({ inbox: { enabled: false, url: INBOX_URL } }), false);
});

test('메일과 접수함이 모두 받으면 true 이고 접수함에는 메일 발송 Y 와 본문이 함께 간다', async () => {
  const loaded = loadLead(router('{"success":true}', '{"ok":true}'));
  const data = payload();
  assert.equal(await loaded.lead.deliver(both(), data), true);
  assert.deepEqual(loaded.calls.map((c) => c.url), [EMAIL_URL, INBOX_URL]);
  const inbox = loaded.calls[1].body;
  assert.equal(inbox.action, 'leadCreate');
  assert.equal(typeof inbox.ts, 'number');
  assert.equal(inbox.payload.emailDelivered, true);
  assert.equal(inbox.payload.leadId, data.leadId);
  assert.equal(inbox.payload.name, '검사 손님');
  assert.equal(inbox.payload.privacyConsent, true);
  assert.equal(typeof inbox.payload.message, 'string');
  assert.equal(inbox.payload.message.includes('010-1234-5678'), true);
  assert.equal(inbox.payload.message, loaded.lead.buildLeadText(data));
  assert.deepEqual(loaded.storageCalls, []);
});

test('메일이 실패해도 접수함이 받으면 true 이고 접수함 줄에는 메일 미발송이 남는다', async () => {
  const loaded = loadLead(router(() => response(500, '{}'), '{"ok":true}'));
  assert.equal(await loaded.lead.deliver(both(), payload()), true);
  assert.equal(loaded.calls[1].body.payload.emailDelivered, false);
});

test('메일 fetch 가 던져도 접수함이 받으면 true 다', async () => {
  const loaded = loadLead(router(() => Promise.reject(new Error('synthetic network')), '{"ok":true}'));
  assert.equal(await loaded.lead.deliver(both(), payload()), true);
  assert.deepEqual(loaded.calls.map((c) => c.url), [EMAIL_URL, INBOX_URL]);
});

test('접수함이 실패해도 메일이 갔으면 true 다', async () => {
  for (const inboxFailure of [() => response(500, '{"ok":true}'), () => Promise.reject(new Error('synthetic')), '{"ok":false,"error":"rate-limited"}', 'not json', '[]', '']) {
    const loaded = loadLead(router('{"success":true}', inboxFailure));
    assert.equal(await loaded.lead.deliver(both(), payload()), true);
    assert.deepEqual(loaded.calls.map((c) => c.url), [EMAIL_URL, INBOX_URL]);
  }
});

test('메일과 접수함이 모두 실패하면 접수되지 않은 것이다', async () => {
  const loaded = loadLead(router(() => response(500, '{}'), '{"ok":false,"error":"server-error"}'));
  await notAccepted(loaded.lead.deliver(both(), payload()));
  const thrown = loadLead(router(() => Promise.reject(new Error('email down')), () => Promise.reject(new Error('inbox down'))));
  await notAccepted(thrown.lead.deliver(both(), payload()));
});

test('접수함만 켜져 있으면 메일 없이 접수함 한 곳으로 가고, 그곳이 거부하면 접수되지 않은 것이다', async () => {
  const ok = loadLead(router('{"success":true}', '{"ok":true}'));
  assert.equal(await ok.lead.deliver(inboxOnly(), payload()), true);
  assert.deepEqual(ok.calls.map((c) => c.url), [INBOX_URL]);
  assert.equal(ok.calls[0].body.payload.emailDelivered, false);
  const bad = loadLead(router('{"success":true}', '{"ok":false,"error":"invalid-input"}'));
  await notAccepted(bad.lead.deliver(inboxOnly(), payload()));
  assert.deepEqual(bad.calls.map((c) => c.url), [INBOX_URL]);
});

test('접수함 주소가 script.google.com 의 /exec 가 아니면 접수함이 없는 것으로 보고 호출하지 않는다', async () => {
  for (const url of ['https://evil.invalid/macros/s/x/exec', 'http://script.google.com/macros/s/x/exec', 'https://script.google.com/macros/s/x/dev', 'https://script.google.com/macros/s/x/exec?x=1', '']) {
    const loaded = loadLead(router('{"success":true}', '{"ok":true}'));
    const config = Object.assign(formsOnly(), { inbox: { enabled: true, url } });
    assert.equal(await loaded.lead.deliver(config, payload()), true);
    assert.deepEqual(loaded.calls.map((c) => c.url), [EMAIL_URL], url);
  }
});

test('같은 payload 로 다시 보내거나 메모리 재시도를 거쳐도 leadId 는 그대로다', async () => {
  const loaded = loadLead(router(() => response(500, '{}'), () => response(500, '{}')));
  const data = payload();
  await notAccepted(loaded.lead.deliver(both(), data));
  const first = data.leadId;
  assert.match(first, UUID);
  await notAccepted(loaded.lead.deliver(both(), data));
  assert.equal(data.leadId, first);
  assert.equal(loaded.lead.rememberFailure(data) > 0, true);

  const retry = loadLead(router('{"success":true}', '{"ok":true}'));
  const generation = retry.lead.rememberFailure(data);
  const result = await retry.lead.retryLatest(both());
  assert.equal(result.status, 'sent');
  assert.equal(result.generation, generation);
  assert.equal(retry.calls[1].body.payload.leadId, first);

  const already = { leadId: '3f2c9b1e-6d4a-4c8b-9e1f-0a2b3c4d5e6f', name: 'x', phone: '010-1234-5678', privacyConsent: true };
  const keep = loadLead(router('{"success":true}', '{"ok":true}'));
  await keep.lead.deliver(both(), already);
  assert.equal(keep.calls[1].body.payload.leadId, '3f2c9b1e-6d4a-4c8b-9e1f-0a2b3c4d5e6f');
});

test('접수함 호출은 문의 내용을 영구 저장소·sessionStorage 에 남기지 않는다', async () => {
  const loaded = loadLead(router('{"success":true}', '{"ok":true}'));
  await loaded.lead.deliver(both(), payload());
  assert.deepEqual(loaded.storageCalls, []);
});
