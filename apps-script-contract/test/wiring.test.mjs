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
  const fetchLog = [];
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
    __fetchLog: fetchLog,
    Session: { getScriptTimeZone: () => 'Asia/Seoul', getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => '' }) },
    Logger: { log: () => {} },
    // 외부 호출은 기본적으로 막는다(발송이 꺼져 있어야 하므로).
    // 다만 AI 중계 검사를 하려면 아는 두 곳은 흉내낼 수 있어야 한다.
    // fetchLog 에 남겨 '무엇을 어디로 보냈는지'를 검사에서 확인한다.
    UrlFetchApp: {
      fetch: (url, opt) => {
        const u = String(url);
        fetchLog.push({ url: u, headers: (opt && opt.headers) || {}, payload: (opt && opt.payload) || '' });
        if (/generativelanguage\.googleapis\.com/.test(u)) {
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '가짜 제미나이 답' }] } }] }) };
        }
        if (/api\.openai\.com/.test(u)) {
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ choices: [{ message: { content: '가짜 지피티 답' } }] }) };
        }
        throw new Error('테스트에서 모르는 곳으로 외부 호출을 시도했다: ' + u);
      }
    },
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

  // ★ 이 검사는 '캐시를 열기 전에 진짜 토큰을 대조하는가'를 재야 한다.
  //   그냥 위조 토큰이 TOKEN_INVALID 를 받는지만 보면, 사전 인증을 통째로 들어내도
  //   초록으로 남는다 — 캐시가 빗나가면 어차피 처리기가 거절하기 때문이다.
  //   그래서 **사전 인증이 없을 때 쓰였을 캐시 열쇠**(scope = 토큰의 단순 해시)에
  //   미끼를 심어 두고, 그 미끼가 나오지 않는지 본다.
  //   사전 인증을 제거하면 scope 가 정확히 이 값이 되어 미끼가 튀어나온다.
  const forgedToken = 'z'.repeat(43);
  const naiveScope = ctx.sha256Hex(forgedToken);
  ctx.gwIdemPut_('sign.view', 'preauth-bait', naiveScope,
    { ok: true, marker: 'LEAKED-VIA-UNAUTHENTICATED-CACHE' });
  const bogus = postReq({ action: 'sign.view', signToken: forgedToken, idem: 'preauth-bait', payload: {} });
  check(bogus.ok === false && bogus.error === 'TOKEN_INVALID',
    '실제 고객 토큰 인증이 멱등성 캐시 조회보다 먼저다', JSON.stringify(bogus));
  check(JSON.stringify(bogus).indexOf('LEAKED-VIA-UNAUTHENTICATED-CACHE') < 0,
    '인증 전에는 멱등성 캐시를 읽지 않는다 — 위조 토큰이 남의 캐시를 못 연다', JSON.stringify(bogus));

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

  // 값이 아니라 **존재**로 거절하는가. 빈 문자열·null 을 통과시키던 옛 동작으로
  // 되돌리면 여기서 잡힌다(값을 실어 보내는 위 두 검사로는 못 잡는다).
  const emptyId = postReq({
    action: 'sign.view', signToken: b.link.token, idem: 'empty-id', payload: { contractId: '' }
  });
  check(emptyId.ok === false && emptyId.error === 'BAD_REQUEST',
    '빈 문자열 계약 id 도 거절한다 — 값이 아니라 존재로 막는다', JSON.stringify(emptyId));
  const nullId = postReq({
    action: 'sign.view', signToken: b.link.token, idem: 'null-id', id: null, payload: {}
  });
  check(nullId.ok === false && nullId.error === 'BAD_REQUEST',
    'null 계약 id 도 거절한다', JSON.stringify(nullId));

  // 인증 전에 도는 검사라 깊이·크기에 한도가 있어야 한다. 없으면 토큰 모양만 맞춘
  // 아무나 스택을 터뜨리고 영문 엔진 오류가 고객 화면에 나간다(실측으로 겪었다).
  // 깊이는 한도(GW_ID_SCAN_MAX_DEPTH=12)를 넉넉히 넘되, 테스트 하네스의 JSON.stringify
  // 자체가 터지지 않을 만큼만 잡는다. 40000 겹으로 하면 요청을 만들다가 하네스가 죽는다.
  let deep = {}; const deepRoot = deep;
  for (let i = 0; i < 200; i++) { deep.a = {}; deep = deep.a; }
  const deepRes = postReq({ action: 'sign.view', signToken: forgedToken, payload: deepRoot });
  check(deepRes.ok === false && deepRes.error === 'BAD_REQUEST',
    '아주 깊게 중첩된 payload 를 스택이 터지기 전에 거절한다', JSON.stringify(deepRes).slice(0, 160));
  check(String(deepRes.message || '').indexOf('call stack') < 0,
    '내부 엔진 오류 문구를 고객에게 내보내지 않는다', String(deepRes.message || ''));

  ctx.gwIdemPut_('selfTest', 'admin-auth-first', 'admin',
    { ok: true, marker: 'cached-admin-result' });
  const unauth = postReq({ action: 'selfTest', idem: 'admin-auth-first', payload: {} });
  check(unauth.ok === false && unauth.error === 'UNAUTHORIZED'
    && JSON.stringify(unauth).indexOf('cached-admin-result') < 0,
  '관리자 인증이 멱등성 캐시 조회보다 먼저다', JSON.stringify(unauth));

  const originalIdemPut = ctx.gwIdemPut_;
  const originalIdemGet = ctx.gwIdemGet_;
  let heldWhileCaching = false;
  // ★ 저장(put)만 감시하면 E 의 위험한 절반이 비어 있다.
  //   사고는 '조회가 잠금 밖이라 둘 다 빗나가고 같은 작업이 두 번 도는 것'이다.
  //   그래서 **마지막 조회**가 잠금 안에서 일어났는지를 본다.
  //   잠금 밖 선(先)조회는 일부러 둔 빠른 길이므로(캐시 적중 시 BUSY 회피),
  //   '한 번이라도 잠금 안에서 조회했는가'로 재야 한다.
  let getInsideLock = false;
  ctx.gwIdemGet_ = function (action, idemKey, scope) {
    if (g.LockService.getScriptLock()._held) getInsideLock = true;
    return originalIdemGet(action, idemKey, scope);
  };
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
    ctx.gwIdemGet_ = originalIdemGet;
  }
  check(heldWhileCaching === true,
    '잠금 작업의 멱등성 결과를 LockService 해제 전에 저장한다');
  check(getInsideLock === true,
    '잠금 작업의 멱등성 캐시를 잠금 안에서도 다시 조회한다 — 조회가 잠금 밖에만 있으면 두 번 실행된다');
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

section('6-2) 부분 실패 뒤 고객에게 하는 말이 사실과 맞는가');
{
  // 서명 완료는 ① Drive → ② Contracts → ③ SignTokens 순으로 쓴다.
  // ③만 실패하면 계약은 COMPLETED 인데 토큰이 살아 있다. 고객이 다시 누르면
  // 예전에는 BAD_STATE 가 나갔고, Sign.html 이 그것을 'voided' 로 매핑해
  // **"🚫 취소된 계약입니다"** 를 띄웠다 — 정상 체결된 계약을 두고 하는 거짓말이다.
  const pctx = { at: new Date().toISOString(), actor: 'admin' };
  const made = ctx.createContract_({
    title: '부분실패 검사', amount: 2000000,
    customer: { name: '박고객', phone: '010-4444-5555' }, body: { site: '탄방동', scope: ['도배'] }
  }, pctx);
  const cid = made.contractId || made.id;
  ctx.lockContract_(cid, pctx);
  const lk = ctx.issueSignLink_(cid, 72, pctx);
  const docHash = ctx.getContract_(cid).contract.docHash;

  // SignTokens 의 usedAt 쓰기만 실패시킨다.
  const realUpdate = ctx.updateRow_;
  ctx.updateRow_ = function (name, rowIndex, patch) {
    if (name === ctx.SHEETS.TOKENS && patch && Object.prototype.hasOwnProperty.call(patch, 'usedAt')) {
      throw new Error('SERVER_ERROR|토큰 소진 쓰기 실패(주입)');
    }
    return realUpdate(name, rowIndex, patch);
  };
  try {
    ctx.signSubmit_(lk.token, { signerName: '박고객', signatureImage: PNG_DATA_URI, agreed: true,
      docHashSeen: docHash }, { at: new Date().toISOString(), actor: 'customer' });
  } catch (e) { /* 주입한 실패 */ }
  ctx.updateRow_ = realUpdate;

  const after = ctx.getContract_(cid).contract;
  check(after.status === 'COMPLETED', '부분 실패해도 계약 자체는 완료로 기록된다', after.status);

  let again = null;
  try {
    ctx.signSubmit_(lk.token, { signerName: '박고객', signatureImage: PNG_DATA_URI, agreed: true,
      docHashSeen: docHash }, { at: new Date().toISOString(), actor: 'customer' });
  } catch (e) { again = String(e.message); }
  check(!!again, '완료된 계약에 다시 서명할 수 없다', again || '통과해 버렸다');
  check(again && again.indexOf('TOKEN_USED') === 0,
    '이미 체결된 계약을 "취소됐다"고 말하지 않는다 — TOKEN_USED 로 답한다', again);
  check(again && again.indexOf('BAD_STATE') !== 0,
    'BAD_STATE 를 쓰지 않는다 — Sign.html 이 그것을 "취소된 계약" 화면으로 매핑한다', again);
}

section('6-3) AI 중계 — 키를 서버에 두고 브라우저로 내려보내지 않는다');
{
  const GK = 'AIza-SERVER-GEMINI-KEY-9999';
  const OK_ = 'sk-SERVER-OPENAI-KEY-8888';
  const aiCtx = { at: new Date().toISOString(), actor: 'admin' };

  // 키가 없으면 '없다'고 답해야 한다 — 있는 척하면 앱이 기기 키로 못 되돌아간다.
  let noKey = null;
  try { ctx.aiAsk_({ provider: 'gemini', model: 'gemini-2.0-flash', body: { contents: [] } }, aiCtx); }
  catch (e) { noKey = String(e.message); }
  check(noKey && noKey.indexOf('AI_NOT_CONFIGURED') === 0,
    '서버에 AI 키가 없으면 없다고 답한다', noKey || '통과해 버렸다');

  props.GEMINI_API_KEY = GK;
  props.OPENAI_API_KEY = OK_;
  g.__fetchLog.length = 0;

  const r1 = ctx.aiAsk_({ provider: 'gemini', model: 'gemini-2.0-flash', body: { contents: [{ parts: [{ text: '견적 항목 제안' }] }] } }, aiCtx);
  check(r1 && r1.ok === true && r1.json && r1.json.candidates, 'Gemini 중계가 답을 돌려준다', JSON.stringify(r1).slice(0, 120));

  const r2 = ctx.aiAsk_({ provider: 'openai', model: 'gpt-4o-mini', body: { messages: [{ role: 'user', content: '요약' }] } }, aiCtx);
  check(r2 && r2.ok === true && r2.json && r2.json.choices, 'ChatGPT 중계가 답을 돌려준다', JSON.stringify(r2).slice(0, 120));

  // ★ 키가 응답에 실려 브라우저로 내려가면 안 된다 — 이 중계의 존재 이유다.
  const both = JSON.stringify([r1, r2]);
  check(both.indexOf(GK) < 0 && both.indexOf(OK_) < 0,
    '응답에 AI 키가 실리지 않는다 — 브라우저로 내려가지 않는다');

  // 키는 헤더로만 나가야 한다(주소에 붙이면 오류 로그·중계 기록에 남는다).
  const gemCall = g.__fetchLog.find((f) => /generativelanguage/.test(f.url));
  check(gemCall && gemCall.url.indexOf(GK) < 0, 'Gemini 키를 주소에 붙이지 않는다', gemCall && gemCall.url);
  check(gemCall && String(gemCall.headers['x-goog-api-key']) === GK, 'Gemini 키를 헤더로 보낸다');
  const oaCall = g.__fetchLog.find((f) => /api\.openai\.com/.test(f.url));
  check(oaCall && String(oaCall.headers.Authorization || '').indexOf(OK_) >= 0, 'ChatGPT 키를 헤더로 보낸다');

  // 아는 두 곳 말고는 못 부른다.
  let evil = null;
  try { ctx.aiAsk_({ provider: 'http://evil.example/steal', model: 'x', body: {} }, aiCtx); }
  catch (e) { evil = String(e.message); }
  check(evil && evil.indexOf('BAD_REQUEST') === 0, '모르는 제공자는 거절한다', evil || '통과해 버렸다');

  // 모델 이름으로 주소를 벗어날 수 없다.
  let esc = null;
  try { ctx.aiAsk_({ provider: 'gemini', model: '../../../v1/steal', body: { contents: [] } }, aiCtx); }
  catch (e) { esc = String(e.message); }
  check(esc && esc.indexOf('BAD_REQUEST') === 0, '모델 이름으로 주소를 벗어날 수 없다', esc || '통과해 버렸다');

  // 한도를 한 곳에서 센다 — 기기가 몇 대든 합쳐서 센다.
  const before = ctx.aiStatus_().providers.gemini.usedToday;
  ctx.aiAsk_({ provider: 'gemini', model: 'gemini-2.0-flash', body: { contents: [] } }, aiCtx);
  const after = ctx.aiStatus_().providers.gemini.usedToday;
  check(after === before + 1, '사용량을 서버 한 곳에서 센다', before + ' → ' + after);

  // 분당 한도에 걸리면 막는다(같은 분 안에 8건을 넘겨 본다).
  let blocked = null;
  for (let i = 0; i < 12 && !blocked; i++) {
    try { ctx.aiAsk_({ provider: 'gemini', model: 'gemini-2.0-flash', body: { contents: [] } }, aiCtx); }
    catch (e) { blocked = String(e.message); }
  }
  check(blocked && blocked.indexOf('AI_QUOTA') === 0, '분당 한도를 넘기면 막는다', blocked || '안 막혔다');

  // 상태 응답에도 키가 없어야 한다.
  const st = JSON.stringify(ctx.aiStatus_());
  check(st.indexOf(GK) < 0 && st.indexOf(OK_) < 0, 'AI 상태 응답에 키가 없다', st.slice(0, 120));
  check(/"configured":true/.test(st), 'AI 상태가 설정됨을 알려준다');

  // health 도 값이 아니라 있음/없음만.
  const h = JSON.stringify(ctx.gwHealth_ ? ctx.gwHealth_() : {});
  check(h.indexOf(GK) < 0 && h.indexOf(OK_) < 0, 'health 응답에 AI 키가 없다');

  delete props.GEMINI_API_KEY; delete props.OPENAI_API_KEY;
}

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
