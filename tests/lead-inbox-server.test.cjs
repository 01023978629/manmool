'use strict';
/* 접수함 서버(apps-script-lead-inbox/Code.gs)를 Apps Script 없이 끝까지 돌려 본다.

   SpreadsheetApp·PropertiesService·CacheService·LockService·Utilities·MailApp·ContentService 를
   메모리 흉내로 바꿔 끼우고 doPost 를 실제 요청 모양으로 부른다. 대표가 이 코드를 배포하기 전에
   접수 → 로그인 → 목록 → 판정 → 로그아웃이 한 줄로 이어지는지, 잠금·중복·전이 규칙이 서버에서도
   지켜지는지, 응답에 비밀값이 새지 않는지를 여기서 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');

const DIR = path.join(__dirname, '..', 'apps-script-lead-inbox');
const source = fs.readFileSync(path.join(DIR, 'LeadInboxPure.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(DIR, 'Code.gs'), 'utf8');
const ADMIN_CODE = 'fixture-admin-code-2026';
const SESSION_SECRET = 's'.repeat(40);
const PEPPER = 'p'.repeat(40);
const SHEET_ID = 'fixture-sheet-id-0001';
const LEAD_A = '3f2c9b1e-6d4a-4c8b-9e1f-0a2b3c4d5e6f';
const LEAD_B = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const REQ_1 = '11111111-2222-4333-8444-555555555555';
const REQ_2 = '66666666-7777-4888-9999-aaaaaaaaaaaa';

function fakeSheet() {
  const rows = [];
  const ensure = (r, c) => { while (rows.length < r) rows.push([]); const row = rows[r - 1]; while (row.length < c) row.push(''); };
  return {
    rows,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i += 1) { ensure(r + i, c + nc - 1); out.push(rows[r + i - 1].slice(c - 1, c - 1 + nc)); }
          return out;
        },
        setValues(values) {
          values.forEach((vals, i) => { ensure(r + i, c + nc - 1); vals.forEach((v, j) => { rows[r + i - 1][c - 1 + j] = v; }); });
        },
      };
    },
    getDataRange() { return { getValues: () => rows.map((row) => row.slice()) }; },
    appendRow(values) { rows.push(values.slice()); },
    getLastRow() { return rows.length; },
    deleteRow(n) { rows.splice(n - 1, 1); },
    setFrozenRows() {},
  };
}

function makeServer(options = {}) {
  const props = Object.assign({
    LEAD_INBOX_ENABLED: '1', LEAD_INBOX_SHEET_ID: SHEET_ID, LEAD_INBOX_SESSION_SECRET: SESSION_SECRET,
    LEAD_INBOX_ADMIN_CODE: ADMIN_CODE, LEAD_INBOX_LOGIN_PEPPER: PEPPER, LEAD_INBOX_NOTIFY_TO: '',
  }, options.props || {});
  const sheets = new Map();
  const cache = new Map();
  const mails = [];
  const spreadsheet = {
    getSheetByName: (name) => sheets.get(name) || null,
    insertSheet(name) { const s = fakeSheet(); sheets.set(name, s); return s; },
  };
  const toBytes = (value) => (typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value.map((b) => (b + 256) % 256)));
  const context = {
    console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, isFinite, isNaN, parseInt, parseFloat,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null) }) },
    SpreadsheetApp: { openById: (id) => { if (id !== SHEET_ID) throw new Error('no such sheet'); return spreadsheet; } },
    CacheService: { getScriptCache: () => ({
      get: (k) => { const item = cache.get(k); if (!item) return null; if (item.until < Date.now()) { cache.delete(k); return null; } return item.value; },
      put: (k, v, ttl) => cache.set(k, { value: String(v), until: Date.now() + (ttl || 600) * 1000 }),
      remove: (k) => cache.delete(k),
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/-/g, ''),
      computeHmacSha256Signature: (value, secret) => Array.from(nodeCrypto.createHmac('sha256', secret).update(String(value)).digest()),
      base64EncodeWebSafe: (bytes) => toBytes(bytes).toString('base64url'),
      getUuid: () => nodeCrypto.randomUUID(),
    },
    MailApp: { getRemainingDailyQuota: () => (options.quota === undefined ? 100 : options.quota), sendEmail: (mail) => mails.push(mail) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({ setMimeType() { return { getContent: () => text }; } }) },
  };
  vm.runInNewContext(source, context, { filename: 'lead-inbox-server.gs' });
  const call = (body) => JSON.parse(context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return { context, call, sheets, mails, props, cache };
}

function setup(options) {
  const server = makeServer(options);
  assert.equal(server.context.leadInboxSetupSheets_(), 'ok');
  return server;
}

const lead = (extra) => ({ leadId: LEAD_A, name: '검사 손님', phone: '010-1234-5678', privacyConsent: true, type: '아파트', region: '대전 서구', emailDelivered: true, message: '[만물인테리어 상담 신청]\n이름: 검사 손님', ...extra });
const create = (server, payload) => server.call({ action: 'leadCreate', ts: Date.now(), payload });
const login = (server, adminCode = ADMIN_CODE) => server.call({ action: 'leadLogin', ts: Date.now(), payload: { adminCode } });
const authed = (server, token, action, payload) => server.call({ action, ts: Date.now(), sessionToken: token, payload: payload || {} });

test('설치 함수는 세 시트와 고정 머리글을 만들고 두 번 실행해도 안전하다', () => {
  const server = makeServer();
  assert.equal(server.context.leadInboxSetupSheets_(), 'ok');
  assert.equal(server.context.leadInboxSetupSheets_(), 'ok');
  assert.deepEqual([...server.sheets.keys()], ['문의', '이력', '세션']);
  assert.equal(server.sheets.get('문의').rows[0][0], 'leadId');
  assert.equal(server.sheets.get('문의').rows.length, 1);
  server.sheets.get('세션').rows[0][0] = 'other';
  assert.throws(() => server.context.leadInboxSetupSheets_(), /different headers/);
});

test('꺼져 있으면 health 만 답하고 접수·로그인은 not-configured 다', () => {
  const server = setup({ props: { LEAD_INBOX_ENABLED: '0' } });
  assert.deepEqual(server.call({ action: 'leadHealth' }), { ok: true, service: 'lead-inbox-v1', enabled: false });
  assert.deepEqual(create(server, lead()), { ok: false, error: 'not-configured' });
  assert.deepEqual(login(server), { ok: false, error: 'not-configured' });
  assert.deepEqual(server.call('not json'), { ok: false, error: 'bad-request' });
  assert.deepEqual(server.call({ action: 'nope' }), { ok: false, error: 'bad-request' });
  assert.equal(server.context.doGet().getContent(), '{"ok":false,"error":"bad-request"}');
});

test('접수는 접수번호를 매기고, 같은 leadId 는 새 줄 없이 같은 번호를 돌려주며, 수식 첫 글자는 글자로 고정된다', () => {
  const server = setup();
  const today = server.context.leadSeoulDateKey_(new Date());
  const first = create(server, lead({ name: '=1+1', memo: '-급해요' }));
  assert.deepEqual(first, { ok: true, receiptNo: `LD-${today}-0001` });
  const second = create(server, lead({ leadId: LEAD_B, emailDelivered: false }));
  assert.deepEqual(second, { ok: true, receiptNo: `LD-${today}-0002` });
  const again = create(server, lead({ name: '다른 이름' }));
  assert.deepEqual(again, { ok: true, receiptNo: `LD-${today}-0001`, duplicate: true });
  const rows = server.sheets.get('문의').rows;
  assert.equal(rows.length, 3, '중복 접수는 줄을 만들지 않는다');
  const header = rows[0];
  const byKey = (row) => Object.fromEntries(header.map((h, i) => [h, row[i]]));
  assert.equal(byKey(rows[1]).name, "'=1+1");
  assert.equal(byKey(rows[1]).memo, "'-급해요");
  assert.equal(byKey(rows[1]).status, '신규');
  assert.equal(byKey(rows[1]).emailDelivered, 'Y');
  assert.equal(byKey(rows[2]).emailDelivered, 'N');
  const history = server.sheets.get('이력').rows.slice(1);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((row) => row[6]), ['메일 발송됨', '메일 미발송']);
  assert.deepEqual(create(server, lead({ leadId: LEAD_B.replace('a', 'b').replace('4', '4'), phone: '12' })), { ok: false, error: 'invalid-input' });
  assert.deepEqual(create(server, { leadId: LEAD_A, phone: '010-1234-5678' }), { ok: false, error: 'invalid-input' }, '동의 없는 접수는 거부');
});

test('알림 메일은 주소가 있을 때만, 중복 접수에는 보내지 않고, 한도가 없으면 조용히 건너뛴다', () => {
  const server = setup({ props: { LEAD_INBOX_NOTIFY_TO: 'owner@example.invalid' } });
  create(server, lead());
  create(server, lead());
  assert.equal(server.mails.length, 1);
  assert.equal(server.mails[0].to, 'owner@example.invalid');
  assert.equal(server.mails[0].noReply, true);
  assert.match(server.mails[0].subject, /^\[만물 접수함\] 인테리어 문의 · 검사 손님 · 대전 서구 \(LD-\d{8}-0001\)$/);
  assert.match(server.mails[0].body, /접수번호: LD-\d{8}-0001/);
  assert.match(server.mails[0].body, /lead-inbox\.html/);
  const silent = setup();
  create(silent, lead());
  assert.equal(silent.mails.length, 0);
  const exhausted = setup({ props: { LEAD_INBOX_NOTIFY_TO: 'owner@example.invalid' }, quota: 0 });
  assert.equal(create(exhausted, lead()).ok, true);
  assert.equal(exhausted.mails.length, 0);
});

test('접수는 10분에 60건까지이고 61건째는 rate-limited 다', () => {
  const server = setup();
  for (let i = 0; i < 60; i += 1) {
    const id = `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
    assert.equal(create(server, lead({ leadId: id })).ok, true, `#${i}`);
  }
  assert.deepEqual(create(server, lead({ leadId: 'ffffffff-0000-4000-8000-000000000000' })), { ok: false, error: 'rate-limited' });
});

test('로그인은 틀리면 invalid-credentials, 5회면 15분 잠금이고, 맞으면 세션 토큰 원문은 한 번만 주고 시트에는 해시만 남는다', () => {
  const server = setup();
  assert.deepEqual(login(server, 'wrong-code-0000'), { ok: false, error: 'invalid-credentials' });
  assert.deepEqual(login(server, 'short'), { ok: false, error: 'invalid-credentials' });
  for (let i = 0; i < 3; i += 1) login(server, 'wrong-code-000' + i);
  assert.deepEqual(login(server, ADMIN_CODE), { ok: false, error: 'rate-limited' }, '5회 실패 뒤에는 맞는 비밀번호도 잠긴다');
  server.cache.delete('lead-login:fail');
  const ok = login(server);
  assert.equal(ok.ok, true);
  assert.equal(typeof ok.sessionToken, 'string');
  assert.equal(ok.sessionToken.length >= 64, true);
  assert.equal(ok.expiresAt > Date.now() + 7 * 60 * 60 * 1000 && ok.expiresAt <= Date.now() + 8 * 60 * 60 * 1000, true);
  const sessionRows = server.sheets.get('세션').rows.slice(1);
  assert.equal(sessionRows.length, 1);
  const serialized = JSON.stringify(sessionRows);
  assert.equal(serialized.includes(ok.sessionToken), false, '토큰 원문은 시트에 없다');
  assert.equal(serialized.includes(ADMIN_CODE), false);
  assert.deepEqual(authed(server, ok.sessionToken, 'leadMe'), { ok: true, expiresAt: ok.expiresAt });
});

test('세션 없이·엉뚱한 토큰으로는 관리자 action 이 전부 session-expired 다', () => {
  const server = setup();
  for (const action of ['leadMe', 'leadLogout', 'leadList', 'leadGet', 'leadDecide']) {
    assert.deepEqual(server.call({ action, payload: {} }), { ok: false, error: 'session-expired' }, action);
    assert.deepEqual(authed(server, 'x'.repeat(80), action, {}), { ok: false, error: 'session-expired' }, action + ' 위조');
  }
});

test('목록·상세·판정·로그아웃이 한 줄로 이어지고 판정은 requestId 로 멱등이며 전이 표를 지킨다', () => {
  const server = setup();
  create(server, lead());
  create(server, lead({ leadId: LEAD_B, name: '둘째 손님', type: '누수', emailDelivered: false }));
  const token = login(server).sessionToken;
  const list = authed(server, token, 'leadList', { status: '신규' });
  assert.equal(list.ok, true);
  assert.equal(list.total, 2);
  assert.deepEqual(list.counts, { '신규': 2, '승인': 0, '보류': 0, '거절': 0 });
  assert.deepEqual(list.leads.map((l) => l.leadId), [LEAD_B, LEAD_A], '최근 것이 위');
  assert.equal(list.leads[0].service, '누수');
  assert.equal(list.leads[1].emailDelivered, 'Y');
  assert.deepEqual(Object.keys(list.leads[0]).sort(), [...server.context.LEAD_HEADERS['문의']].sort());

  const detail = authed(server, token, 'leadGet', { leadId: LEAD_A.toUpperCase() });
  assert.equal(detail.ok, true);
  assert.equal(detail.lead.name, '검사 손님');
  assert.deepEqual(detail.history.map((h) => [h.action, h.from, h.to, h.actor]), [['접수', '', '신규', 'site']]);
  assert.deepEqual(authed(server, token, 'leadGet', { leadId: '00000000-0000-4000-8000-000000000000' }), { ok: false, error: 'not-found' });

  assert.deepEqual(authed(server, token, 'leadDecide', { leadId: LEAD_A, decision: '거절', requestId: REQ_1 }), { ok: false, error: 'invalid-input' }, '거절은 사유 필수');
  assert.deepEqual(authed(server, token, 'leadDecide', { leadId: LEAD_A, decision: '승인', requestId: 'not-uuid' }), { ok: false, error: 'invalid-input' });
  const approved = authed(server, token, 'leadDecide', { leadId: LEAD_A, decision: '승인', memo: '진행', requestId: REQ_1 });
  assert.equal(approved.ok, true);
  assert.equal(approved.lead.status, '승인');
  assert.notEqual(approved.lead.decidedAt, '');
  const twice = authed(server, token, 'leadDecide', { leadId: LEAD_A, decision: '승인', memo: '진행', requestId: REQ_1 });
  assert.deepEqual({ ok: twice.ok, duplicate: twice.duplicate, status: twice.lead.status }, { ok: true, duplicate: true, status: '승인' });
  assert.equal(server.sheets.get('이력').rows.slice(1).filter((row) => row[3] === '판정').length, 1, '같은 requestId 는 이력 한 줄');
  assert.deepEqual(authed(server, token, 'leadDecide', { leadId: LEAD_A, decision: '보류', requestId: REQ_2 }), { ok: false, error: 'invalid-transition' }, '승인은 종착');
  const held = authed(server, token, 'leadDecide', { leadId: LEAD_B, decision: '거절', memo: '예산 불일치', requestId: REQ_2 });
  assert.equal(held.lead.status, '거절');
  const after = authed(server, token, 'leadList', { status: '전체' });
  assert.deepEqual(after.counts, { '신규': 0, '승인': 1, '보류': 0, '거절': 1 });
  const getB = authed(server, token, 'leadGet', { leadId: LEAD_B });
  assert.deepEqual(getB.history.map((h) => [h.from, h.to, h.memo]), [['', '신규', '메일 미발송'], ['신규', '거절', '예산 불일치']]);

  assert.deepEqual(authed(server, token, 'leadLogout'), { ok: true, loggedOut: true });
  assert.deepEqual(authed(server, token, 'leadMe'), { ok: false, error: 'session-expired' }, '로그아웃한 토큰은 죽는다');
});

test('어떤 응답에도 비밀값·토큰 해시·시트 ID 가 실리지 않는다', () => {
  const server = setup({ props: { LEAD_INBOX_NOTIFY_TO: 'owner@example.invalid' } });
  create(server, lead());
  const token = login(server).sessionToken;
  const responses = [
    server.call({ action: 'leadHealth' }), login(server, 'wrong-code-0000'),
    authed(server, token, 'leadList', {}), authed(server, token, 'leadGet', { leadId: LEAD_A }),
    authed(server, token, 'leadDecide', { leadId: LEAD_A, decision: '보류', requestId: REQ_1 }), authed(server, token, 'leadMe'),
  ];
  const text = JSON.stringify(responses);
  for (const secret of [ADMIN_CODE, SESSION_SECRET, PEPPER, SHEET_ID, 'owner@example.invalid', 'tokenHash']) {
    assert.equal(text.includes(secret), false, secret);
  }
  const sessionHash = server.sheets.get('세션').rows[1][1];
  assert.equal(text.includes(sessionHash), false, '세션 해시도 응답에 없다');
});
