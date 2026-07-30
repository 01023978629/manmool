/* wiring.test.mjs — .gs 파일들이 실제로 맞물리는지 검사한다

   Apps Script 에는 모듈이 없다. 파일 여럿이 하나의 전역 공간에 얹힌다.
   그래서 "A.gs 가 부르는 함수가 B.gs 에 정말 있는가"를 붙여넣기 전에는 아무도 모른다.
   배포한 뒤 고객이 서명 버튼을 누른 순간 ReferenceError 로 알게 되는 것이 최악이다.

   여기서 하는 것:
     ① 모든 .gs 를 하나의 vm 컨텍스트에 순서대로 올린다 (Apps Script 와 같은 방식)
     ② 각 파일이 부르는 이름 중 어디에도 정의되지 않은 것을 찾는다
     ③ Apps Script 에서 못 쓰는 문법·API 를 쓴 곳을 찾는다
     ④ 가짜 Sheets/Drive 위에서 고객 흐름을 끝까지 한 번 태운다
        (계약 생성 → 잠금 → 링크발급 → 열람 → 서명 → 완료본 열람)

   복사본을 만들지 않는다. 저장소의 .gs 원본을 그대로 읽어 돌린다. */
import { readFileSync, readdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// 서명 이미지 대역. DriveService.gs 가 PNG 매직바이트(89 50 4E 47)를 확인하고,
// Pure.gs 의 validateSignInput 이 '너무 작으면 빈 캔버스'로 보아 거절하므로 둘 다 만족시킨다.
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(1024, 0x41)
]);
const PNG_DATA_URI = 'data:image/png;base64,' + PNG_BYTES.toString('base64');

let pass = 0, fail = 0;
const check = (ok, name, detail) => {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
};
const section = (t) => console.log('\n── ' + t);

/* ---------- 가짜 Apps Script ---------- */
// 진짜처럼 굴되, 실패해야 할 때 실패하는 것이 중요하다.
// 예를 들어 createFile 은 0바이트를 만들지 않지만, 만들었다고 치는 순간
// DriveService.gs 의 "0바이트면 저장 실패" 방어를 검사할 수 없다.
function makeFakeGoogle(props) {
  const b64 = {
    encode: (bytes) => Buffer.from(bytes.map((b) => b & 0xff)).toString('base64'),
    decode: (s) => Array.from(Buffer.from(String(s), 'base64')).map((b) => (b > 127 ? b - 256 : b))
  };
  // ★ .digest() 를 빼먹으면 Hash 객체가 그대로 돌아와 Array.from 이 빈 배열을 준다.
  //   그러면 randomToken 이 빈 문자열이 되고, 멀쩡한 코드가 실패한 것처럼 보인다(실제로 겪었다).
  const digest = (algo, input, _cs) => {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input.map((b) => b & 0xff));
    return Array.from(createHash('sha256').update(buf).digest()).map((b) => (b > 127 ? b - 256 : b));
  };

  class Blob {
    constructor(data, type, name) { this._d = data; this._t = type; this._n = name || 'blob'; }
    setName(n) { this._n = n; return this; }
    getName() { return this._n; }
    getBytes() { return typeof this._d === 'string' ? Array.from(Buffer.from(this._d, 'utf8')).map((b) => (b > 127 ? b - 256 : b)) : this._d; }
    getAs(_mime) { return new Blob('%PDF-1.4\n' + String(this._d).slice(0, 200), 'application/pdf', this._n); }
  }
  class File {
    constructor(blob) { this._b = blob; this._id = 'file_' + (File._n = (File._n || 0) + 1); }
    getId() { return this._id; }
    getName() { return this._b.getName(); }
    getSize() { return this._b.getBytes().length; }
    getBlob() { return this._b; }
  }
  class Iter {
    constructor(a) { this._a = a.slice(); }
    hasNext() { return this._a.length > 0; }
    next() { return this._a.shift(); }
  }
  class Folder {
    constructor(name, id) { this._name = name; this._id = id || ('fold_' + (Folder._n = (Folder._n || 0) + 1)); this.files = []; this.folders = []; }
    getId() { return this._id; }
    getName() { return this._name; }
    createFile(blob) { const f = new File(blob); this.files.push(f); return f; }
    createFolder(n) { const f = new Folder(n); this.folders.push(f); return f; }
    getFoldersByName(n) { return new Iter(this.folders.filter((f) => f.getName() === n)); }
    getFilesByName(n) { return new Iter(this.files.filter((f) => f.getName() === n)); }
    isTrashed() { return false; }
  }
  const ROOT = new Folder('만물인테리어', 'ROOT_FOLDER');
  const byId = { ROOT_FOLDER: ROOT };
  const origCreate = Folder.prototype.createFolder;
  Folder.prototype.createFolder = function (n) { const f = origCreate.call(this, n); byId[f.getId()] = f; return f; };

  /* 가짜 스프레드시트 — 2차원 배열 그대로 */
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    setValues(v) {
      for (let i = 0; i < v.length; i++) for (let j = 0; j < v[i].length; j++) {
        const row = this.r - 1 + i, col = this.c - 1 + j;
        while (this.sh._d.length <= row) this.sh._d.push([]);
        this.sh._d[row][col] = v[i][j];
      }
      return this;
    }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) row.push((this.sh._d[this.r - 1 + i] || [])[this.c - 1 + j] ?? '');
        out.push(row);
      }
      return out;
    }
    setFontWeight() { return this; } setBackground() { return this; }
    setNumberFormat() { return this; } setHorizontalAlignment() { return this; }
    setValue(v) { return this.setValues([[v]]); }
  }
  class Sheet {
    constructor(n) { this._n = n; this._d = []; this._frozen = 0; }
    getName() { return this._n; }
    getSheetName() { return this._n; }
    getLastRow() { return this._d.length; }
    getLastColumn() { return this._d.reduce((m, r) => Math.max(m, r.length), 0); }
    getMaxColumns() { return Math.max(30, this.getLastColumn()); }
    getMaxRows() { return Math.max(100, this._d.length); }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
    appendRow(v) { this._d.push(v.slice()); return this; }
    setFrozenRows(n) { this._frozen = n; return this; }
    insertColumnsAfter() { return this; } deleteColumns() { return this; }
    autoResizeColumns() { return this; } setColumnWidth() { return this; }
  }
  class SS {
    constructor() { this._sheets = []; }
    getId() { return 'SHEET_ID'; }
    getSheets() { return this._sheets; }
    getSheetByName(n) { return this._sheets.find((s) => s.getName() === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this._sheets.push(s); return s; }
    getName() { return '전자계약'; }
  }
  const SHEET = new SS();

  const triggers = [];
  const cacheData = {};
  const scriptLock = {
    _held: false,
    releaseCount: 0,
    tryLock() {
      if (this._held) return false;
      this._held = true;
      return true;
    },
    releaseLock() {
      this._held = false;
      this.releaseCount++;
    }
  };
  return {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    SpreadsheetApp: { openById: (id) => { if (id !== 'SHEET_ID') throw new Error('없는 시트'); return SHEET; } },
    DriveApp: { getFolderById: (id) => { if (!byId[id]) throw new Error('없는 폴더'); return byId[id]; } },
    Utilities: {
      computeDigest: digest,
      computeHmacSha256Signature: (msg, key) => Array.from(createHmac('sha256', String(key)).update(String(msg)).digest()).map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: b64.encode, base64Decode: b64.decode,
      base64EncodeWebSafe: (b) => b64.encode(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      getUuid: () => randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
      newBlob: (d, t, n) => new Blob(d, t, n),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      formatDate: (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' '),
      sleep: () => {}
    },
    LockService: { getScriptLock: () => scriptLock },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cacheData ? cacheData[k] : null), put: (k, v) => { cacheData[k] = v; }, remove: (k) => { delete cacheData[k]; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: (fn) => ({ timeBased: () => ({ atHour: () => ({ everyDays: () => ({ create: () => { const t = { getHandlerFunction: () => fn }; triggers.push(t); return t; } }) }) }) }),
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' })
    },
    // 시간대·사용자 — ctTz_ 등이 쓴다.
    Session: { getScriptTimeZone: () => 'Asia/Seoul', getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => '' }) },
    Logger: { log: () => {} },
    UrlFetchApp: { fetch: () => { throw new Error('테스트에서 외부 발송을 시도했다 — 발송이 꺼져 있어야 한다'); } },
    HtmlService: {
      createTemplateFromFile: (n) => ({ BOOT_JSON: '', evaluate: () => ({ addMetaTag() { return this; }, setTitle() { return this; }, setXFrameOptionsMode() { return this; }, getContent: () => '<html>' + n + '</html>' }) }),
      createHtmlOutput: (h) => ({ _h: h, addMetaTag() { return this; }, setTitle() { return this; }, setXFrameOptionsMode() { return this; }, getContent: () => h }),
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' }
    },
    ContentService: {
      createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent: () => s }),
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' }
    },
    console, JSON, Math, Date, String, Number, Object, Array, Boolean, RegExp, Error, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
  };
}

/* ---------- .gs 를 Apps Script 와 같은 순서로 올린다 ---------- */
// Apps Script 는 파일 순서를 보장하지 않지만, 함수 선언은 호이스팅되므로
// 어느 순서든 서로를 부를 수 있다. 그 성질을 그대로 재현하려면 한 컨텍스트에 이어 붙이면 된다.
const GS = readdirSync(DIR).filter((f) => f.endsWith('.gs')).sort();
const sources = GS.map((f) => ({ name: f, code: readFileSync(join(DIR, f), 'utf8') }));

console.log('전자계약 .gs 맞물림 검사 — 파일 ' + GS.length + '개\n' + '─'.repeat(56));

section('1) Apps Script 에서 못 쓰는 문법·API');
const BANNED = [
  { re: /^\s*(import|export)\s/m, why: 'Apps Script 에는 모듈이 없다' },
  { re: /\brequire\s*\(/, why: 'Node API 는 Apps Script 에 없다' },
  { re: /\basync\s+function\b/, why: 'Apps Script 는 async/await 를 권하지 않는다(집안 규약)' },
  { re: /\bawait\s+/, why: 'Apps Script 는 async/await 를 권하지 않는다(집안 규약)' },
  { re: /(?<![.\w])fetch\s*\(/, why: 'fetch 대신 UrlFetchApp 을 쓴다' },
  { re: /\blocalStorage\b|\bwindow\b|\bdocument\b/, why: '서버 코드에 브라우저 전역이 있다' }
];
for (const { name, code } of sources) {
  const hits = BANNED.filter((b) => b.re.test(code));
  check(hits.length === 0, name + ' — 금지 문법 없음', hits.map((h) => h.why).join(' / '));
}

section('2) 한 컨텍스트에 전부 올라가는가 (문법 오류·중복 선언)');
const props = {
  ADMIN_TOKEN: 'a'.repeat(32), PEPPER: 'p'.repeat(32),
  SPREADSHEET_ID: 'SHEET_ID', DRIVE_FOLDER_ID: 'ROOT_FOLDER',
  WEBAPP_URL: 'https://script.google.com/macros/s/TEST/exec'
};
const g = makeFakeGoogle(props);
const ctx = createContext(g);
g.globalThis = ctx;
let loadErr = null;
try {
  for (const { name, code } of sources) runInContext(code, ctx, { filename: name });
} catch (e) { loadErr = e; }
check(!loadErr, '모든 .gs 가 오류 없이 올라간다', loadErr ? String(loadErr.message) : '');
if (loadErr) { console.log('\n검사 ' + (pass + fail) + '건 · 통과 ' + pass + ' · 실패 ' + fail); process.exit(1); }

section('3) 부르는데 없는 함수');
// 각 파일에서 호출 형태(이름( )를 뽑아, 전역에도 없고 지역 선언도 아닌 것을 찾는다.
const defined = new Set(Object.getOwnPropertyNames(ctx).filter((k) => typeof ctx[k] === 'function'));
const JS_BUILTIN = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'throw',
  'new', 'delete', 'void', 'in', 'of', 'do', 'else', 'try', 'case', 'var', 'this', 'and', 'or']);
const missing = [];
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')      // 블록 주석
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')      // 줄 주석 (http:// 는 남긴다)
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")   // 작은따옴표 문자열
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');  // 큰따옴표 문자열
for (const { name, code: rawCode } of sources) {
  const code = stripComments(rawCode);
  // 지역 이름: var 선언 전부 · function 선언 · 함수 매개변수.
  // 이 셋을 다 모아야 'var handler = ...; handler()' 같은 정상 호출을 오탐하지 않는다.
  const local = new Set();
  // var a, b, c; 처럼 한 줄에 여럿 선언하는 것도 전부 잡는다.
  for (const m of code.matchAll(/\bvar\s+([^;\n]+)/g)) {
    for (const part of m[1].split(',')) {
      const n = (part.split('=')[0] || '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) local.add(n);
    }
  }
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
  for (const m of code.matchAll(/\bfunction\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
    for (const a of m[1].split(',')) { const n = a.trim(); if (n) local.add(n); }
  }
  for (const m of code.matchAll(/(?<![.\w$])([a-z][A-Za-z0-9_$]*_?)\s*\(/g)) {
    const fn = m[1];
    if (JS_BUILTIN.has(fn) || local.has(fn) || defined.has(fn)) continue;
    // 지역 변수에 담긴 함수(var f = gwFn_(...); f(...))는 걸러낸다.
    if (new RegExp('\\bvar\\s+' + fn + '\\b').test(code)) continue;
    missing.push(name + ' → ' + fn + '()');
  }
}
const uniq = [...new Set(missing)];
check(uniq.length === 0, '없는 함수를 부르는 곳이 없다', uniq.slice(0, 12).join('\n      '));

section('4) 규약이 요구하는 이름이 실제로 있는가');
for (const fn of ['doGet', 'doPost', 'createContract_', 'getContract_', 'listContracts_', 'lockContract_',
  'issueSignLink_', 'voidContract_', 'updatePayment_', 'exportBackup_',
  'signView_', 'signSubmit_', 'doneView_', 'signBoot_', 'notifySend_',
  'contractFolder_', 'saveOriginal_', 'saveSignature_', 'saveCompletedPdf_', 'saveEvidenceJson_',
  'sha256Hex', 'hmacHex', 'randomToken', 'constantTimeEq',
  'ensureSheets_', 'readAll_', 'appendRow_', 'findRow_', 'updateRow_', 'logEvent_']) {
  check(typeof ctx[fn] === 'function', fn + ' 존재');
}

section('5) 고객 흐름을 끝까지 한 번 태운다');
let flow = null, flowErr = null;
try {
  ctx.ensureSheets_();
  const ctxObj = { at: new Date().toISOString(), uaHash: 'ua', requestHash: 'rq', actor: 'admin' };
  const made = ctx.createContract_({
    title: '공사 도급계약서', amount: 11000000,
    customer: { name: '홍길동', phone: '010-1234-5678' },
    body: { site: '둔산동', scope: ['욕실'] }
  }, ctxObj);
  const locked = ctx.lockContract_(made.contractId || made.id, ctxObj);
  const link = ctx.issueSignLink_(made.contractId || made.id, 72, ctxObj);
  const view = ctx.signView_(link.token, { at: new Date().toISOString(), actor: 'customer' });
  const sub = ctx.signSubmit_(link.token, {
    signerName: '홍길동',
    signatureImage: PNG_DATA_URI,
    agreed: true, docHashSeen: view.contract.docHash
  }, { at: new Date().toISOString(), actor: 'customer', uaHash: 'ua' });
  const done = ctx.doneView_(sub.doneToken, { at: new Date().toISOString(), actor: 'customer' });
  flow = { made, locked, link, view, sub, done };
} catch (e) { flowErr = e; }
check(!flowErr, '계약 생성 → 잠금 → 링크 → 열람 → 서명 → 완료본 열람', flowErr ? String(flowErr.message) : '');

if (flow) {
  check(!!flow.link.token && flow.link.token.length >= 20, '서명 토큰이 충분히 길다');
  check(JSON.stringify(flow.view).indexOf(flow.made.contractId || flow.made.id) < 0,
    '고객 응답에 계약 id 가 없다 — id 를 알려주면 추측의 실마리가 된다');
  check(flow.sub.completedSha256 && flow.sub.completedSha256.length === 64, '완료본 SHA-256 이 남는다');
  check(flow.sub.notify && flow.sub.notify.sent === false, '발송은 꺼져 있다 — 보냈다고 하지 않는다');
  check(flow.done.contractNo === flow.made.contractNo, '완료본 열람이 같은 계약을 가리킨다');

  // 같은 토큰으로 두 번 서명할 수 없다
  let twice = null;
  try { ctx.signSubmit_(flow.link.token, { signerName: '홍길동', signatureImage: PNG_DATA_URI, agreed: true, docHashSeen: flow.view.contract.docHash }, { at: new Date().toISOString() }); }
  catch (e) { twice = String(e.message); }
  check(twice && twice.indexOf('TOKEN_USED') === 0, '같은 링크로 두 번 서명할 수 없다', twice || '두 번째도 통과함');

  // 지문이 다르면 거절 — 완료된 계약에는 새 링크를 못 내므로(그것도 올바른 동작이다)
  // 새 계약을 하나 더 만들어 검사한다.
  const c2ctx = { at: new Date().toISOString(), actor: 'admin' };
  const c2 = ctx.createContract_({ title: '공사 도급계약서', amount: 3000000,
    customer: { name: '김둔산', phone: '010-9999-8888' }, body: { site: '유천동', scope: ['주방'] } }, c2ctx);
  ctx.lockContract_(c2.contractId || c2.id, c2ctx);
  const link2 = ctx.issueSignLink_(c2.contractId || c2.id, 72, c2ctx);
  let tampered = null;
  try { ctx.signSubmit_(link2.token, { signerName: '홍', signatureImage: PNG_DATA_URI, agreed: true, docHashSeen: 'deadbeef' }, { at: new Date().toISOString() }); }
  catch (e) { tampered = String(e.message); }
  check(tampered && tampered.indexOf('DOC_TAMPERED') === 0, '고객이 본 지문이 다르면 서명을 거절한다', tampered || '통과해 버림');

  // 없는 토큰
  let bogus = null;
  try { ctx.signView_('z'.repeat(43), { at: new Date().toISOString() }); } catch (e) { bogus = String(e.message); }
  check(bogus && bogus.indexOf('TOKEN_INVALID') === 0, '모르는 토큰은 거절한다', bogus || '통과해 버림');

  // 시트에 토큰 원문이 없다
  const tokRows = JSON.stringify(ctx.readAll_(ctx.SHEETS.TOKENS));
  check(tokRows.indexOf(flow.link.token) < 0, '시트 어디에도 토큰 원문이 없다 — 해시만 남는다');

  // 완료된 계약은 다시 잠글 수 없고, 새 서명 링크도 낼 수 없다(봉인)
  let relock = null;
  try { ctx.lockContract_(flow.made.contractId || flow.made.id, { at: new Date().toISOString() }); } catch (e) { relock = String(e.message); }
  check(!!relock, '완료된 계약을 다시 잠글 수 없다', relock ? '' : '다시 잠겼다');
  let relink = null;
  try { ctx.issueSignLink_(flow.made.contractId || flow.made.id, 72, { at: new Date().toISOString() }); } catch (e) { relink = String(e.message); }
  check(relink && relink.indexOf('LOCKED') === 0, '완료된 계약에 새 서명 링크를 낼 수 없다', relink || '링크가 나왔다');
}

section('6) 보안 경계와 실패 순서');
const postReq = (body) => {
  const req = { ...body, ts: Date.now() };
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(req) } }).getContent());
};
const makeLinked = (name, amount) => {
  const opCtx = { at: new Date().toISOString(), actor: 'admin' };
  const made = ctx.createContract_({
    title: '인테리어 공사 계약서',
    amount,
    customer: { name, phone: '010-1111-2222' },
    body: { site: '테스트 현장', scope: ['욕실'] }
  }, opCtx);
  ctx.lockContract_(made.contractId || made.id, opCtx);
  const link = ctx.issueSignLink_(made.contractId || made.id, 72, opCtx);
  return { made, link };
};

let boundaryErr = null;
try {
  const a = makeLinked('고객가', 4100000);
  const b = makeLinked('고객나', 4200000);
  const idem = 'customer-cache-scope-test';
  const aView = postReq({ action: 'sign.view', signToken: a.link.token, idem, payload: {} });
  const bView = postReq({ action: 'sign.view', signToken: b.link.token, idem, payload: {} });
  check(aView.ok === true && bView.ok === true
    && aView.contract.contractNo !== bView.contract.contractNo,
  '같은 idem 을 다른 고객 토큰이 써도 캐시 결과가 섞이지 않는다');

  const bogus = postReq({ action: 'sign.view', signToken: 'z'.repeat(43), idem, payload: {} });
  check(bogus.ok === false && bogus.error === 'TOKEN_INVALID',
    '실제 고객 토큰 인증이 멱등성 캐시 조회보다 먼저다', JSON.stringify(bogus));

  const rootId = postReq({
    action: 'sign.view', signToken: b.link.token, idem: 'root-id',
    contractId: a.made.contractId || a.made.id, payload: {}
  });
  check(rootId.ok === false && rootId.error === 'BAD_REQUEST',
    '고객 요청 최상위 계약 id 를 거절한다', JSON.stringify(rootId));

  const nestedId = postReq({
    action: 'sign.view', signToken: b.link.token, idem: 'nested-id',
    payload: { meta: { contractId: a.made.contractId || a.made.id } }
  });
  check(nestedId.ok === false && nestedId.error === 'BAD_REQUEST',
    '고객 요청 중첩 계약 id 를 거절한다', JSON.stringify(nestedId));

  ctx.gwIdemPut_('selfTest', 'admin-auth-first', 'admin',
    { ok: true, marker: 'cached-admin-result' });
  const unauth = postReq({ action: 'selfTest', idem: 'admin-auth-first', payload: {} });
  check(unauth.ok === false && unauth.error === 'UNAUTHORIZED'
    && JSON.stringify(unauth).indexOf('cached-admin-result') < 0,
  '관리자 인증이 멱등성 캐시 조회보다 먼저다', JSON.stringify(unauth));

  const originalIdemPut = ctx.gwIdemPut_;
  let heldWhileCaching = false;
  ctx.gwIdemPut_ = function (action, idemKey, scope, result) {
    heldWhileCaching = g.LockService.getScriptLock()._held;
    return originalIdemPut(action, idemKey, scope, result);
  };
  let firstQuick, secondQuick, countAfterFirst, countAfterSecond;
  try {
    const quickBody = {
      action: 'quickSend',
      adminToken: props.ADMIN_TOKEN,
      idem: 'atomic-quick-send',
      payload: {
        title: '원자성 검사 계약서',
        amount: 4500000,
        customer: { name: '원자성검사', phone: '010-3333-4444' },
        body: { site: '원자성 현장', scope: ['주방'] }
      }
    };
    firstQuick = postReq(quickBody);
    countAfterFirst = ctx.readAll_(ctx.SHEETS.CONTRACTS).length;
    secondQuick = postReq(quickBody);
    countAfterSecond = ctx.readAll_(ctx.SHEETS.CONTRACTS).length;
  } finally {
    ctx.gwIdemPut_ = originalIdemPut;
  }
  check(heldWhileCaching === true,
    '잠금 작업의 멱등성 결과를 LockService 해제 전에 저장한다');
  check(firstQuick.ok === true && secondQuick.ok === true
    && firstQuick.contractId === secondQuick.contractId
    && countAfterFirst === countAfterSecond,
  '같은 quickSend idem 재시도는 계약을 한 건만 만든다',
  JSON.stringify({ firstQuick, secondQuick, countAfterFirst, countAfterSecond }));
} catch (e) {
  boundaryErr = e;
}
check(!boundaryErr, '고객·관리자 보안 경계 검사가 끝까지 실행된다',
  boundaryErr ? String(boundaryErr.stack || boundaryErr.message) : '');

let lockThrown = false;
try {
  ctx.gwWithLock_(() => { throw new Error('injected-handler-failure'); });
} catch (e) {
  lockThrown = String(e.message).indexOf('injected-handler-failure') >= 0;
}
const sharedLock = g.LockService.getScriptLock();
check(lockThrown && sharedLock._held === false && sharedLock.releaseCount > 0,
  '처리기가 실패해도 LockService 를 finally 에서 해제한다');

let orderErr = null;
try {
  const ordered = makeLinked('순서검사', 4300000);
  const orderedView = ctx.signView_(ordered.link.token, { at: new Date().toISOString(), actor: 'customer' });
  const originalUpdate = ctx.updateRow_;
  const writes = [];
  ctx.updateRow_ = function (sheetName, rowIndex, patch) {
    if (patch && (patch.status === ctx.STATUS.COMPLETED
      || Object.prototype.hasOwnProperty.call(patch, 'usedAt'))) {
      writes.push(sheetName);
    }
    return originalUpdate(sheetName, rowIndex, patch);
  };
  try {
    ctx.signSubmit_(ordered.link.token, {
      signerName: '순서검사',
      signatureImage: PNG_DATA_URI,
      agreed: true,
      docHashSeen: orderedView.contract.docHash
    }, { at: new Date().toISOString(), actor: 'customer' });
  } finally {
    ctx.updateRow_ = originalUpdate;
  }
  check(writes[0] === ctx.SHEETS.CONTRACTS && writes[1] === ctx.SHEETS.TOKENS,
    '서명 저장 순서는 Drive 뒤 시트 완료 기록, 그 다음 토큰 소진이다', JSON.stringify(writes));

  const failed = makeLinked('실패주입', 4400000);
  const failedView = ctx.signView_(failed.link.token, { at: new Date().toISOString(), actor: 'customer' });
  const originalUpdate2 = ctx.updateRow_;
  ctx.updateRow_ = function (sheetName, rowIndex, patch) {
    if (sheetName === ctx.SHEETS.CONTRACTS && patch && patch.status === ctx.STATUS.COMPLETED) {
      throw new Error('injected-contract-sheet-failure');
    }
    return originalUpdate2(sheetName, rowIndex, patch);
  };
  let injected = null;
  try {
    ctx.signSubmit_(failed.link.token, {
      signerName: '실패주입',
      signatureImage: PNG_DATA_URI,
      agreed: true,
      docHashSeen: failedView.contract.docHash
    }, { at: new Date().toISOString(), actor: 'customer' });
  } catch (e) {
    injected = String(e.message);
  } finally {
    ctx.updateRow_ = originalUpdate2;
  }
  const tokenAfterFailure = ctx.findRow_(ctx.SHEETS.TOKENS, 'tokenHash', ctx.sha256Hex(failed.link.token));
  check(injected && injected.indexOf('injected-contract-sheet-failure') >= 0
    && tokenAfterFailure && !tokenAfterFailure.obj.usedAt,
  '시트 완료 기록 실패 시 토큰을 소진하지 않아 재시도할 수 있다',
  injected || '실패가 주입되지 않음');
} catch (e) {
  orderErr = e;
}
check(!orderErr, '서명 저장 순서 검사가 끝까지 실행된다',
  orderErr ? String(orderErr.stack || orderErr.message) : '');

section('7) 발송은 꺼져 있다');
const n1 = ctx.notifySend_({ to: '010-1234-5678', text: '테스트', kind: 'notify' }, { at: new Date().toISOString() });
check(n1.sent === false && n1.reason === 'MOCK_OFF', '기본 상태에서 발송은 MOCK_OFF', JSON.stringify(n1));
check(n1.to.indexOf('****') > 0 && n1.to.indexOf('1234') < 0, '결과에 번호 원문이 없다(마스킹본만)', n1.to);
props.ALIMTALK_LIVE = '1';
const n2 = ctx.notifySend_({ to: '010-1234-5678', text: '테스트', kind: 'notify' }, { at: new Date().toISOString() });
check(n2.sent === false && n2.reason === 'NOT_CONFIGURED', '켜져 있어도 자격증명이 없으면 안 나간다', JSON.stringify(n2));
check(String(JSON.stringify(n2)).indexOf(props.PEPPER) < 0, '응답에 비밀값이 없다');
delete props.ALIMTALK_LIVE;

console.log('\n' + '─'.repeat(56));
console.log('검사 ' + (pass + fail) + '건 · 통과 ' + pass + ' · 실패 ' + fail);
if (fail) { console.log('\n' + fail + '건 실패 — 붙여넣기 전에 고쳐야 합니다.'); process.exit(1); }
console.log('전부 통과했습니다.');
