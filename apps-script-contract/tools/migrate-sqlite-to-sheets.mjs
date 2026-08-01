#!/usr/bin/env node
/** ============================================================
 * 옛 Fly 서버(SQLite) → Sheets/Drive 이전 도구 (contract-migrate-v1)
 * ------------------------------------------------------------
 * 하는 일:
 *   · 백업 .db 를 **읽기 전용**으로 열어 계약·사건·대금·토큰을 읽는다
 *   · 원본 파일의 SHA-256 을 계산해 사장님이 알려주신 값과 대조한다
 *   · ../Schema.gs 를 그대로 읽어 열 이름을 가져온다(여기 다시 적지 않는다)
 *   · ../Pure.gs 의 sheetSafe·normalizeAmount·canonicalJson 을 그대로 빌려 쓴다
 *   · out/Contracts.csv · ContractEvents.csv · Payments.csv · SignTokens.csv · report.md 를 만든다
 *   · 만든 CSV 를 **다시 읽어** 건수·금액·문서지문이 원본과 맞는지 대조한다
 *
 * 하지 않는 일:
 *   · 원본 DB 에 한 글자도 쓰지 않는다. 이 파일에 있는 SQL 은 전부 SELECT 다.
 *     확인: grep -nE "\b(INS|UPD|DEL)[A-Z]*\b" 로 검색해도 SQL 은 나오지 않는다.
 *   · 어긋난 값을 몰래 고치지 않는다. 고치면 원본과 다른 자료가 시트에 올라간다.
 *     이상한 줄은 보고서의 '원본 이상' 목록으로만 알린다.
 *   · 옮기지 못한 줄을 조용히 버리지 않는다. 전부 이유와 함께 적는다.
 *   · 구글에 접속하지 않는다. Drive 업로드와 시트 밀어넣기는 MigrationService.gs 의 몫이다.
 *   · --write 없이는 파일을 하나도 만들지 않는다(기본이 시늉만 하기, dry-run).
 *
 * 실행:
 *   node apps-script-contract/tools/migrate-sqlite-to-sheets.mjs --db=<백업.db>            # 시늉만
 *   node apps-script-contract/tools/migrate-sqlite-to-sheets.mjs --db=<백업.db> --write    # 실제로 파일 생성
 *
 * 끝난 뒤 값: 0 = 통과 · 1 = 대조가 어긋남 · 2 = 시작도 못 함(해시 불일치·파일 없음)
 * ============================================================ */

import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const TOOL_VERSION = 'contract-migrate-v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const GS_DIR = resolve(HERE, '..');

/* 사장님이 알려주신 원본 백업의 지문.
   이 값과 다르면 다른 파일을 넣으신 것이다 — 조용히 진행하면 엉뚱한 자료가 시트로 올라간다. */
const EXPECT_SHA256 = '4fabba67249b9480da019ae998713d24a7082a67ba316aa12ccf958fb6541840';

/* 시트 한 칸의 한계는 5만 자다. ContractService.gs 의 CT_BODY_JSON_MAX 와 같은 값을 쓴다 —
   이보다 긴 본문은 시트에 넣을 수 없으므로 잘라 넣지 않고 사람에게 넘긴다. */
const BODY_JSON_MAX = 45000;

/* ============================================================
 * 0) 명령줄
 * ============================================================ */
function parseArgs(argv) {
  const a = {
    db: '', out: join(HERE, 'out'), write: false,
    allowHashMismatch: false, expectSha256: EXPECT_SHA256,
    dropDeadTokens: false, allowSourceAnomalies: false,
    now: new Date().toISOString(), help: false, bad: false
  };
  for (const raw of argv) {
    const [k, ...rest] = raw.split('=');
    const v = rest.join('=');
    if (k === '--db') a.db = v;
    else if (k === '--out') a.out = v;
    else if (k === '--write') a.write = true;
    else if (k === '--dry-run') a.write = false;              // 기본값이지만 손으로 적을 수 있게 둔다
    else if (k === '--allow-hash-mismatch') a.allowHashMismatch = true;
    else if (k === '--expect-sha256') a.expectSha256 = String(v || '').trim().toLowerCase();
    else if (k === '--drop-dead-tokens') a.dropDeadTokens = true;
    else if (k === '--allow-source-anomalies') a.allowSourceAnomalies = true;
    else if (k === '--now') a.now = v;
    else if (k === '--help' || k === '-h') a.help = true;
    else { console.error('모르는 옵션입니다: ' + raw); a.bad = true; }
  }
  return a;
}

const USAGE = `
옛 Fly 서버 백업(SQLite) → 시트용 CSV 이전 도구

  node migrate-sqlite-to-sheets.mjs --db=<백업.db> [옵션]

  --db=<경로>              옛 백업 파일. (사장님 PC: D:\\만물인테리어_백업\\contract_20260730_before_fly_delete.db)
  --write                  실제로 파일을 만든다. 없으면 시늉만 하고 보고서만 화면에 찍는다.
  --out=<폴더>             산출물 폴더(기본: tools/out)
  --expect-sha256=<지문>   기대하는 원본 지문(기본: 사장님이 알려주신 값)
  --allow-hash-mismatch    지문이 달라도 진행한다. 다른 백업인 줄 알고도 옮길 때만.
  --drop-dead-tokens       이미 죽은 링크(만료·사용됨·취소됨)는 옮기지 않는다. 기본은 전부 옮긴다.
  --allow-source-anomalies 원본 자체가 어긋난 줄이 있어도 통과로 본다. 기본은 실패다.
  --now=<ISO시각>          토큰 만료 판정 기준 시각(기본: 지금)
`;

/* ============================================================
 * 1) Schema.gs · Pure.gs 를 그대로 읽어 쓴다
 * ------------------------------------------------------------
 * 정규식으로 배열을 긁지 않는다 — 주석 안의 예시나 따옴표에 걸려 조용히 어긋난다.
 * 두 파일은 바깥(Sheets·Drive·Properties)을 건드리지 않으므로 vm 에 그대로 올려도 안전하다.
 * 그러라고 Pure.gs 머리말에 적혀 있다.
 * ============================================================ */
function loadGs(file, exportName) {
  const src = readFileSync(file, 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(src, ctx, { filename: file });
  const out = ctx[exportName];
  if (!out) throw new Error(basename(file) + ' 에서 ' + exportName + ' 를 찾지 못했습니다');
  return out;
}

/* ============================================================
 * 2) CSV — 만들기와 되읽기
 * ------------------------------------------------------------
 * 되읽기가 있는 이유: 시트에 실제로 올라가는 것은 이 CSV 다.
 * 메모리 안의 객체를 대조해 봐야 CSV 를 잘못 만든 것은 못 잡는다.
 * ============================================================ */

// 값 안의 줄바꿈은 공백으로 바꾼다. Utilities.parseCsv 로 되읽을 때 줄이 쪼개지는 사고를 막는다.
// (bodyJson·detail 은 JSON.stringify 를 거친 값이라 실제 줄바꿈이 들어 있지 않다)
function csvCell(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return '"' + s.replace(/[\r\n]+/g, ' ').replace(/"/g, '""') + '"';
}

function toCsv(cols, rows) {
  const lines = [cols.map(csvCell).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

// BOM 을 붙이지 않는다. 이 CSV 는 사람이 엑셀로 여는 물건이 아니라
// Apps Script(Utilities.parseCsv)가 읽는 물건이고, BOM 이 붙으면 첫 열 이름이 깨진다.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; });
    return o;
  });
}

/* ============================================================
 * 3) 사건 이름·행위자
 * ------------------------------------------------------------
 * 옛 서버와 새 시트는 사건 이름 체계가 다르다(contract-backend/src/audit.mjs ↔ Schema.gs EVENTS).
 * **뜻이 똑같은 것만** 새 이름으로 바꾸고, 나머지는 옛 이름 그대로 옮긴다.
 * 비슷해 보인다고 묶으면 원장이 증거로서의 값을 잃는다.
 * (예: KAKAO_MESSAGE_FAILED 는 '발송이 꺼져 막힘'인 MESSAGE_BLOCKED 와 다른 사건이다)
 * ============================================================ */
const EVENT_RENAME = {
  DOCUMENT_LOCKED: 'CONTRACT_LOCKED',
  SIGNATURE_SUBMITTED: 'SIGN_SUBMITTED',
  KAKAO_MESSAGE_QUEUED: 'MESSAGE_QUEUED'
};

/* 옛 audit_logs 에는 '누가' 칸이 없다. 사건 이름으로 가른다 —
   비워 두면 시트에서 고객 행위와 사장님 행위를 구분할 수 없다. 가른 근거는 보고서에 적는다. */
const EVENT_ACTOR = {
  CONTRACT_CREATED: 'admin', DOCUMENT_LOCKED: 'admin', SIGN_LINK_ISSUED: 'admin',
  CONTRACT_VOIDED: 'admin', PAYMENT_SCHEDULE_SET: 'admin', PAYMENT_INVOICED: 'admin',
  PAYMENT_PAID: 'admin', PAYMENT_REMINDED: 'admin',
  SIGN_LINK_OPENED: 'customer', DOCUMENT_VIEWED: 'customer', CONSENT_AGREED: 'customer',
  SIGNATURE_SUBMITTED: 'customer', IDENTITY_OTP_VERIFIED: 'customer',
  IDENTITY_OTP_FAILED: 'customer', COMPLETED_DOC_ACCESSED: 'customer'
};

/* 사건 한 줄(detail)에 실릴 수 있는 것들을 가린다.
   SheetService.gs 의 scrubDetail_ 과 같은 뜻이지만, 그 함수는 Apps Script 안에 있어
   여기서 부를 수 없다. 규칙이 두 곳에 있다는 것은 알고 있다 — 바꿀 때 둘 다 고쳐야 한다. */
function scrubDetail(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/(^|[^0-9])(01[016789])[-. ]?(\d{3,4})[-. ]?(\d{4})(?![0-9])/g,
    (m, pre, a, b, c) => pre + a + '-****-' + c);
  t = t.replace(/\d{12,}/g, '***');
  t = t.replace(/[A-Za-z0-9_-]{24,}/g, (m) => (/^[0-9a-f]{32,64}$/.test(m) ? m : '***'));
  return t.slice(0, 300);
}

/* ============================================================
 * 4) 본체
 * ============================================================ */
function main() {
  const args = parseArgs(process.argv.slice(2));
  // --help 만 물어본 경우에만 0. 옵션을 잘못 적었거나 --db 가 없으면 실패(2)로 끝낸다 —
  // 사용법만 찍고 0 으로 끝나면, 자동으로 돌리는 쪽에서 '이전이 끝났다'로 잘못 읽는다.
  if (args.bad || args.help || !args.db) {
    console.log(USAGE);
    process.exit(args.help && !args.bad ? 0 : 2);
  }

  const dbPath = resolve(args.db);
  if (!existsSync(dbPath)) {
    console.error('✗ 백업 파일이 없습니다: ' + dbPath);
    process.exit(2);
  }

  /* --- 4-1) 원본 지문 대조 --- */
  const fileBytes = readFileSync(dbPath);                 // 지문 계산 — 여는 것과 별개다
  const actualSha = createHash('sha256').update(fileBytes).digest('hex');
  const hashOk = actualSha === String(args.expectSha256 || '').toLowerCase();

  console.log('원본 : ' + dbPath + ' (' + statSync(dbPath).size.toLocaleString('ko-KR') + ' 바이트)');
  console.log('지문 : ' + actualSha);
  console.log('기대 : ' + args.expectSha256);

  if (!hashOk) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠ 원본 지문이 기대값과 다릅니다.                              ║');
    console.error('║  다른 백업 파일일 수 있습니다. 그대로 옮기면 엉뚱한 자료가      ║');
    console.error('║  시트에 올라가고, 시트에는 되돌리기가 없습니다.                 ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    if (!args.allowHashMismatch) {
      console.error('중단합니다. 이 파일이 맞다고 확신하시면 --allow-hash-mismatch 를 붙여 다시 실행하세요.');
      process.exit(2);
    }
    console.error('→ --allow-hash-mismatch 가 있어 그대로 진행합니다. 보고서 첫 줄에 남습니다.');
  }

  /* --- 4-2) 열 이름·순수 함수 빌려오기 --- */
  const S = loadGs(join(GS_DIR, 'Schema.gs'), 'SCHEMA_EXPORTS');
  const P = loadGs(join(GS_DIR, 'Pure.gs'), 'PURE_EXPORTS');
  const sheetSafe = P.sheetSafe, normalizeAmount = P.normalizeAmount;

  /* --- 4-3) 읽기 전용으로 연다 --- */
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (e) {
    console.error('✗ 백업을 읽기 전용으로 열지 못했습니다: ' + e.message);
    console.error('  WAL 로그(-wal / -shm)가 함께 있어야 하는 파일일 수 있습니다.');
    console.error('  백업 폴더의 .db · .db-wal · .db-shm 세 파일을 같은 폴더로 복사한 뒤 다시 실행하세요.');
    process.exit(2);
  }

  const all = (sql) => db.prepare(sql).all();
  const src = {
    contracts: all('SELECT * FROM contracts ORDER BY created_at, id'),
    parties: all('SELECT * FROM contract_parties ORDER BY created_at, id'),
    payments: all('SELECT * FROM payments ORDER BY contract_id, seq'),
    tokens: all('SELECT * FROM sign_tokens ORDER BY created_at, id'),
    audit: all('SELECT * FROM audit_logs ORDER BY at, id'),
    signatures: all('SELECT id, contract_id, party_id, image_sha256, image_ref, doc_hash_seen, signed_at, ua_hash, length(image_data) AS image_len FROM signatures ORDER BY signed_at, id'),
    consents: all('SELECT COUNT(*) AS n FROM consents')[0].n,
    otp: all('SELECT COUNT(*) AS n FROM otp_challenges')[0].n,
    deliveries: all('SELECT COUNT(*) AS n FROM message_deliveries')[0].n,
    templates: all('SELECT COUNT(*) AS n FROM message_templates')[0].n,
    settings: all('SELECT key FROM app_settings ORDER BY key').map((r) => r.key)
  };
  db.close();

  const skipped = [];    // 옮기지 못한 줄 — 조용히 버리지 않는다
  const anomalies = [];  // 원본 자체가 어긋난 줄 — 고치지 않고 알리기만 한다

  /* --- 4-4) 계약 --- */
  const partyOf = {};    // contractId → { customer, operator }
  for (const p of src.parties) {
    const slot = partyOf[p.contract_id] || (partyOf[p.contract_id] = {});
    if (!slot[p.role]) slot[p.role] = p;      // 같은 역할이 둘이면 첫 줄만 쓰고 아래에서 알린다
    else anomalies.push(['contract_parties', p.contract_id, p.role + ' 당사자가 둘 이상입니다(첫 줄만 옮김): ' + p.id]);
  }

  // 옛 DB 에는 sentAt·viewedAt·voidedAt 칸이 없다. 감사 로그에서 끌어온다.
  const firstAt = {}, lastAt = {};
  for (const a of src.audit) {
    if (!a.contract_id) continue;
    const k = a.contract_id + '|' + a.event;
    if (!firstAt[k]) firstAt[k] = a.at;
    lastAt[k] = a.at;
  }
  const sigOf = {};
  for (const s of src.signatures) if (!sigOf[s.contract_id]) sigOf[s.contract_id] = s;

  // seenId 는 '원본에 나온 id'(같은 id 가 두 번 나오는지 보는 용도),
  // migratedId 는 '실제로 CSV 에 들어간 id' 다. 둘을 한 통에 담으면
  // 본문이 길어 못 옮긴 계약의 대금·링크가 주인 없이 시트로 따라 들어간다.
  const seenId = {}, migratedId = {}, seenNo = {};
  const contractRows = [];
  let derivedSent = 0, derivedViewed = 0, derivedVoided = 0;

  for (const c of src.contracts) {
    const id = String(c.id || '');
    if (!id) { skipped.push(['contracts', '(id 없음)', 'id 칸이 비어 있어 시트에서 다시 찾을 수 없습니다']); continue; }
    if (seenId[id]) { skipped.push(['contracts', id, '같은 id 가 두 번 나옵니다 — 뒤엣것을 옮기지 않았습니다']); continue; }
    seenId[id] = true;

    const bodyJson = c.body_snapshot == null ? '' : String(c.body_snapshot);
    if (bodyJson.length > BODY_JSON_MAX) {
      skipped.push(['contracts', id, '계약 본문이 ' + bodyJson.length + '자로 시트 한 칸 한계를 넘습니다 — 잘라 넣으면 문서 지문이 깨집니다']);
      continue;
    }

    const no = String(c.contract_no || '');
    if (!no) anomalies.push(['contracts', id, '계약번호가 비어 있습니다']);
    else if (seenNo[no]) anomalies.push(['contracts', id, '계약번호가 겹칩니다: ' + no]);
    else seenNo[no] = true;

    const status = String(c.status || '');
    if (P.ALL_STATUS.indexOf(status) < 0) anomalies.push(['contracts', id, '모르는 계약 상태입니다: ' + status]);

    const amount = normalizeAmount(c.amount);
    if (Number(c.amount) !== amount) anomalies.push(['contracts', id, '계약금액이 정수가 아니거나 음수입니다: ' + c.amount]);

    // 문서 지문 재계산 — 옛 서버 crypto.mjs 의 docHash({amount, body}) 와 같은 규칙(Pure.gs docHashSource)
    if (c.doc_hash) {
      let recomputed = '';
      try { recomputed = createHash('sha256').update(P.docHashSource(amount, JSON.parse(bodyJson))).digest('hex'); }
      catch (e) { recomputed = ''; }
      if (!recomputed) anomalies.push(['contracts', id, '지문은 있는데 본문(JSON)을 읽을 수 없어 다시 계산하지 못했습니다']);
      else if (recomputed !== String(c.doc_hash)) {
        anomalies.push(['contracts', id, '본문으로 다시 계산한 지문이 저장된 지문과 다릅니다(잠금 후 변조 의심) — 고치지 않고 그대로 옮겼습니다']);
      }
    }

    migratedId[id] = true;   // 여기까지 왔으면 CSV 에 들어간다

    const cust = (partyOf[id] || {}).customer || {};
    const oper = (partyOf[id] || {}).operator || {};
    if (!cust.name) anomalies.push(['contracts', id, '고객 당사자 줄이 없습니다 — 고객 성명·번호 칸이 빕니다']);

    const sig = sigOf[id];
    // 고객이 서명하며 본 지문과 계약에 저장된 지문이 다르면, 서명한 문서와 남아 있는 문서가
    // 다르다는 뜻이다. 분쟁이 나면 가장 먼저 문제가 되는 자리라 반드시 알린다.
    if (sig && sig.doc_hash_seen && String(sig.doc_hash_seen) !== String(c.doc_hash || '')) {
      anomalies.push(['signatures', id, '고객이 서명할 때 본 지문과 계약에 저장된 지문이 다릅니다']);
    }
    const sentAt = firstAt[id + '|SIGN_LINK_ISSUED'] || '';
    const viewedAt = firstAt[id + '|SIGN_LINK_OPENED'] || firstAt[id + '|DOCUMENT_VIEWED'] || '';
    const voidedAt = status === 'VOID' ? (lastAt[id + '|CONTRACT_VOIDED'] || '') : '';
    if (sentAt) derivedSent++;
    if (viewedAt) derivedViewed++;
    if (voidedAt) derivedVoided++;

    contractRows.push({
      id: id,
      contractNo: no,
      title: String(c.title || ''),
      status: status,
      amount: amount,
      customerName: String(cust.name || ''),
      customerPhoneMasked: String(cust.phone_masked || ''),
      customerPhoneHash: String(cust.phone_hash || ''),
      operatorName: String(oper.name || ''),
      bodyJson: bodyJson,
      docHash: String(c.doc_hash || ''),
      lockedAt: String(c.locked_at || ''),
      sentAt: sentAt,
      viewedAt: viewedAt,
      signedAt: sig ? String(sig.signed_at || '') : '',
      completedAt: String(c.completed_at || ''),
      voidedAt: voidedAt,
      folderId: '', originalFileId: '', completedFileId: '', completedFileVersion: 0,
      // 옛 화면은 서명자 이름을 따로 받지 않았다. 당사자 이름이 곧 서명자 이름이다.
      signerName: sig ? String(cust.name || '') : '',
      signatureSha256: sig ? String(sig.image_sha256 || '') : '',
      signatureFileId: '',
      completedSha256: '',
      createdAt: String(c.created_at || ''),
      updatedAt: String(c.updated_at || '')
    });
  }

  /* --- 4-5) 사건(원장) --- */
  const knownIds = migratedId;
  const eventRows = [];
  const renameCount = {}, keptNames = {}, orphanEvents = [];
  for (const a of src.audit) {
    const oldName = String(a.event || '');
    if (!oldName) { skipped.push(['audit_logs', String(a.id), '사건 이름이 비어 있습니다']); continue; }
    const newName = EVENT_RENAME[oldName] || oldName;
    if (EVENT_RENAME[oldName]) renameCount[oldName] = (renameCount[oldName] || 0) + 1;
    else if (!S.EVENTS[oldName]) keptNames[oldName] = (keptNames[oldName] || 0) + 1;

    const cid = String(a.contract_id || '');
    if (cid && !knownIds[cid]) orphanEvents.push([String(a.id), cid]);

    // meta_json 은 옛 서버가 남긴 부가정보다. 그대로 한 줄로 옮기되 가릴 것은 가린다.
    let detail = '';
    if (a.meta_json) {
      try { detail = JSON.stringify(JSON.parse(a.meta_json)); }
      catch (e) { detail = String(a.meta_json); }
    }

    eventRows.push({
      at: String(a.at || ''),
      contractId: cid,
      event: newName,
      detail: scrubDetail(detail),
      uaHash: '',                                   // 옛 audit_logs 에는 없는 칸이다
      requestHash: String(a.request_hash || ''),
      actor: EVENT_ACTOR[oldName] || 'system'
    });
  }

  /* --- 4-6) 대금 --- */
  const payRows = [];
  const paySumOf = {};
  let remindedDropped = 0;
  for (const p of src.payments) {
    const cid = String(p.contract_id || '');
    if (cid && !knownIds[cid]) {
      skipped.push(['payments', p.id, '이 대금이 딸린 계약(' + cid + ')이 옮겨지지 않았습니다']);
      continue;
    }
    const stage = String(p.stage || '');
    if (['down', 'mid', 'bal'].indexOf(stage) < 0) anomalies.push(['payments', p.id, '모르는 회차 이름입니다: ' + stage]);
    const amount = normalizeAmount(p.amount);
    paySumOf[cid] = (paySumOf[cid] || 0) + amount;
    if (p.reminded_at) remindedDropped++;
    const status = String(p.status || '');
    if (['PENDING', 'INVOICED', 'PAID'].indexOf(status) < 0) anomalies.push(['payments', p.id, '모르는 대금 상태입니다: ' + status]);

    payRows.push({
      contractId: cid,
      stage: stage,
      label: String(p.label || ''),
      seq: normalizeAmount(p.seq),
      amount: amount,
      status: status,
      invoicedAt: String(p.invoiced_at || ''),
      paidAt: String(p.paid_at || ''),
      memo: '',   // 옛 DB 에 메모 칸이 없다. reminded_at 을 여기 적어 넣지 않는다(없던 글이 생긴다).
      updatedAt: String(p.paid_at || p.invoiced_at || p.created_at || '')
    });
  }
  // 회차 합이 계약금액과 다른 계약 — 고치지 않는다. 어느 쪽이 맞는지는 사장님만 아신다.
  for (const c of contractRows) {
    const sum = paySumOf[c.id];
    if (sum === undefined) { anomalies.push(['payments', c.id, '이 계약에 대금 회차가 하나도 없습니다']); continue; }
    if (sum !== c.amount) {
      anomalies.push(['payments', c.id, '회차 합계(' + sum.toLocaleString('ko-KR') + ')와 계약금액(' + c.amount.toLocaleString('ko-KR') + ')이 다릅니다']);
    }
  }

  /* --- 4-7) 서명 링크 --- */
  const nowIso = args.now;
  const tokenRows = [];
  const tokenState = { ok: 0, used: 0, expired: 0, revoked: 0 };
  let deadDropped = 0;
  for (const t of src.tokens) {
    const cid = String(t.contract_id || '');
    if (cid && !knownIds[cid]) {
      skipped.push(['sign_tokens', t.id, '이 링크가 딸린 계약(' + cid + ')이 옮겨지지 않았습니다']);
      continue;
    }
    const row = {
      id: String(t.id || ''),
      contractId: cid,
      purpose: String(t.purpose || ''),
      tokenHash: String(t.token_hash || ''),
      expiresAt: String(t.expires_at || ''),
      usedAt: String(t.used_at || ''),
      revokedAt: String(t.revoked_at || ''),
      createdAt: String(t.created_at || '')
    };
    if (['sign', 'view'].indexOf(row.purpose) < 0) anomalies.push(['sign_tokens', row.id, '모르는 링크 용도입니다: ' + row.purpose]);

    const state = P.tokenState(row, nowIso);
    if (tokenState[state] === undefined) tokenState[state] = 0;
    tokenState[state]++;

    // 죽은 링크도 기본은 옮긴다. "링크를 언제 몇 번 보냈는가"가 원장의 일부이고,
    // Pure.gs 의 tokenState 가 만료·사용됨을 알아서 막아 준다(다시 열리지 않는다).
    if (args.dropDeadTokens && state !== 'ok') { deadDropped++; continue; }
    tokenRows.push(row);
  }

  /* --- 4-8) CSV 만들고 되읽어 대조 --- */
  const files = [
    { name: 'Contracts.csv', sheet: S.SHEETS.CONTRACTS, cols: S.COLS_CONTRACTS, rows: contractRows },
    { name: 'ContractEvents.csv', sheet: S.SHEETS.EVENTS, cols: S.COLS_EVENTS, rows: eventRows },
    { name: 'Payments.csv', sheet: S.SHEETS.PAYMENTS, cols: S.COLS_PAYMENTS, rows: payRows },
    { name: 'SignTokens.csv', sheet: S.SHEETS.TOKENS, cols: S.COLS_TOKENS, rows: tokenRows }
  ];

  for (const f of files) {
    // 시트에 넣을 때와 같은 그물을 여기서도 친다(=SUM(...) 같은 이름이 수식이 되는 것을 막는다).
    // sheetSafe 는 두 번 걸어도 같은 값이다 — MigrationService.gs 가 한 번 더 걸어도 탈이 없다.
    const safe = f.rows.map((r) => {
      const o = {};
      for (const c of f.cols) o[c] = sheetSafe(r[c]);
      return o;
    });
    f.text = toCsv(f.cols, safe);
    f.back = csvToObjects(f.text);
  }

  const byName = {};
  for (const f of files) byName[f.name] = f;

  const backContracts = byName['Contracts.csv'].back;
  const backPayments = byName['Payments.csv'].back;

  const sumSrcAmount = src.contracts.reduce((s, c) => s + normalizeAmount(c.amount), 0);
  const sumOutAmount = backContracts.reduce((s, r) => s + normalizeAmount(r.amount), 0);
  const sumSrcPay = src.payments.reduce((s, p) => s + normalizeAmount(p.amount), 0);
  const sumOutPay = backPayments.reduce((s, r) => s + normalizeAmount(r.amount), 0);

  const statusSrc = countBy(src.contracts, (c) => String(c.status || '(빈칸)'));
  const statusOut = countBy(backContracts, (r) => String(r.status || '(빈칸)'));

  // 문서 지문 — 되읽은 CSV 값이 원본과 글자 하나까지 같은가
  const srcHashOf = {};
  let srcHashCount = 0;
  for (const c of src.contracts) if (c.doc_hash) { srcHashOf[String(c.id)] = String(c.doc_hash); srcHashCount++; }
  let hashKept = 0, hashBroken = [];
  for (const r of backContracts) {
    const want = srcHashOf[r.id];
    if (!want) continue;
    if (r.docHash === want) hashKept++;
    else hashBroken.push([r.id, want, r.docHash]);
  }

  /* --- 4-9) 판정 --- */
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });

  check('계약 건수', backContracts.length === src.contracts.length - countSkipped(skipped, 'contracts'),
    '원본 ' + src.contracts.length + '건 → 옮김 ' + backContracts.length + '건 (못 옮김 ' + countSkipped(skipped, 'contracts') + '건)');
  check('옮기지 못한 계약 없음', countSkipped(skipped, 'contracts') === 0,
    countSkipped(skipped, 'contracts') + '건');
  check('상태별 건수', sameCounts(statusSrc, statusOut), fmtCounts(statusSrc) + ' → ' + fmtCounts(statusOut));
  check('계약금액 합계', sumSrcAmount === sumOutAmount,
    sumSrcAmount.toLocaleString('ko-KR') + '원 → ' + sumOutAmount.toLocaleString('ko-KR') + '원');
  check('대금 회차 수', backPayments.length === src.payments.length - countSkipped(skipped, 'payments'),
    '원본 ' + src.payments.length + '회차 → 옮김 ' + backPayments.length + '회차');
  check('대금 합계', sumSrcPay === sumOutPay, sumSrcPay.toLocaleString('ko-KR') + '원 → ' + sumOutPay.toLocaleString('ko-KR') + '원');
  check('문서 지문(doc_hash) 보존', hashKept === srcHashCount && hashBroken.length === 0,
    '지문 있는 계약 ' + srcHashCount + '건 중 ' + hashKept + '건 그대로');
  check('사건(원장) 건수', byName['ContractEvents.csv'].back.length === src.audit.length - countSkipped(skipped, 'audit_logs'),
    '원본 ' + src.audit.length + '건 → 옮김 ' + byName['ContractEvents.csv'].back.length + '건');
  check('서명 링크 건수', byName['SignTokens.csv'].back.length === src.tokens.length - countSkipped(skipped, 'sign_tokens') - deadDropped,
    '원본 ' + src.tokens.length + '건 → 옮김 ' + byName['SignTokens.csv'].back.length + '건' + (deadDropped ? ' (죽은 링크 ' + deadDropped + '건 일부러 뺌)' : ''));
  check('옮기지 못한 줄 없음', skipped.length === 0, skipped.length + '줄');
  check('원본 이상 없음', anomalies.length === 0 || args.allowSourceAnomalies,
    anomalies.length + '건' + (anomalies.length && args.allowSourceAnomalies ? ' (--allow-source-anomalies 로 통과 처리)' : ''));
  check('원본 지문 일치', hashOk || args.allowHashMismatch,
    hashOk ? '일치' : '불일치 (--allow-hash-mismatch 로 진행함)');

  const pass = checks.every((c) => c.ok);

  /* --- 4-10) 보고서 --- */
  // WAL 로그가 곁에 있으면 보고서 머리에 알린다(본 파일만 옮기면 최근 기록이 빠진다).
  const walFiles = ['-wal', '-shm'].map((s) => dbPath + s).filter((f) => existsSync(f)).map((f) => basename(f));

  const report = buildReport({
    args, dbPath, actualSha, hashOk, pass, checks, files, walFiles,
    src, contractRows, eventRows, payRows, tokenRows,
    statusSrc, statusOut, sumSrcAmount, sumOutAmount, sumSrcPay, sumOutPay,
    srcHashCount, hashKept, hashBroken, skipped, anomalies,
    tokenState, deadDropped, renameCount, keptNames, orphanEvents,
    derivedSent, derivedViewed, derivedVoided, remindedDropped, nowIso
  });

  if (args.write) {
    mkdirSync(args.out, { recursive: true });
    for (const f of files) writeFileSync(join(args.out, f.name), f.text, 'utf8');
    writeFileSync(join(args.out, 'report.md'), report, 'utf8');
    console.log('\n산출물: ' + args.out);
    for (const f of files) console.log('  · ' + f.name + '  ' + f.back.length + '줄');
    console.log('  · report.md');
    // 판정이 실패여도 파일은 만든다. 계약 한 건을 못 옮겼다고 나머지 마흔 건까지 막으면,
    // 사장님은 결국 이 도구를 우회하시게 된다. 대신 여기서 크게 알린다.
    if (!pass) {
      console.log('');
      console.log('⚠ 파일은 만들었지만 **판정은 실패**입니다. 그대로 올리지 마시고 report.md 를 먼저 읽으십시오.');
    }
  } else {
    console.log('\n──── 시늉만 했습니다(dry-run). 파일을 만들려면 --write 를 붙이세요. ────');
    console.log(report);
  }

  console.log('');
  for (const c of checks) console.log((c.ok ? '  ✓ ' : '  ✗ ') + c.name + ' — ' + c.detail);
  console.log('');
  console.log(pass ? '판정: 통과 — 옮겨도 됩니다.' : '판정: 실패 — 위 ✗ 를 먼저 보십시오. 시트에 올리지 마세요.');
  process.exit(pass ? 0 : 1);
}

/* ============================================================
 * 5) 잔심부름
 * ============================================================ */
function countBy(arr, fn) {
  const o = {};
  for (const x of arr) { const k = fn(x); o[k] = (o[k] || 0) + 1; }
  return o;
}
function fmtCounts(o) {
  const keys = Object.keys(o).sort();
  return keys.length ? keys.map((k) => k + ' ' + o[k]).join(' · ') : '(없음)';
}
function sameCounts(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] || 0) !== (b[k] || 0)) return false;
  return true;
}
function countSkipped(skipped, table) {
  return skipped.filter((s) => s[0] === table).length;
}
function mdTable(head, rows) {
  if (!rows.length) return '(없음)\n';
  const esc = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|');
  let out = '| ' + head.join(' | ') + ' |\n| ' + head.map(() => '---').join(' | ') + ' |\n';
  for (const r of rows) out += '| ' + r.map(esc).join(' | ') + ' |\n';
  return out;
}

function buildReport(x) {
  const L = [];
  const won = (n) => n.toLocaleString('ko-KR') + '원';

  L.push('# 옛 서버(SQLite) → 시트 이전 보고서');
  L.push('');
  L.push('**판정: ' + (x.pass ? '통과 — 이대로 시트에 올리셔도 됩니다.' : '실패 — 아래 ✗ 항목을 해결하기 전에는 올리지 마십시오.') + '**');
  L.push('');
  L.push('- 만든 때: ' + new Date().toISOString());
  L.push('- 도구: ' + TOOL_VERSION + ' · 열 정의: ' + '`Schema.gs`(' + '실행 시점에 읽음' + ')');
  L.push('- 원본: `' + x.dbPath + '`');
  L.push('- 원본 지문(SHA-256): `' + x.actualSha + '` — ' +
    (x.hashOk ? '기대값과 **일치**' : '기대값과 **불일치**(--allow-hash-mismatch 로 진행함)'));
  if (x.walFiles.length) {
    // WAL 은 '아직 본 파일에 옮겨 적지 않은 최근 기록'이다. 지문은 본 파일만 보므로
    // 이 파일들이 빠지면 최근 계약 몇 건이 통째로 사라진 채 '지문 일치'로 보일 수 있다.
    L.push('- ⚠ 곁딸린 파일이 있습니다: `' + x.walFiles.join('`, `') + '` — **이 파일들도 같은 폴더에 함께 두셔야 합니다.**');
    L.push('  최근 기록이 여기 남아 있을 수 있고, SHA-256 지문은 본 파일(.db)만 보기 때문입니다.');
  }
  L.push('- 모드: ' + (x.args.write ? '**--write** (파일을 만들었습니다)' : 'dry-run (파일을 만들지 않았습니다)'));
  L.push('- 토큰 만료 판정 기준 시각: ' + x.nowIso);
  L.push('');

  L.push('## 1. 대조표');
  L.push('');
  L.push(mdTable(['검사', '결과', '내용'], x.checks.map((c) => [c.name, c.ok ? '✓' : '✗', c.detail])));

  L.push('## 2. 건수 — 이전 전 / 후');
  L.push('');
  L.push(mdTable(['자료', '이전 전(옛 DB)', '이전 후(CSV)'], [
    ['계약(contracts → Contracts)', x.src.contracts.length, x.contractRows.length],
    ['사건(audit_logs → ContractEvents)', x.src.audit.length, x.eventRows.length],
    ['대금(payments → Payments)', x.src.payments.length, x.payRows.length],
    ['서명링크(sign_tokens → SignTokens)', x.src.tokens.length, x.tokenRows.length]
  ]));

  L.push('### 상태별 계약 건수');
  L.push('');
  const statusKeys = Array.from(new Set([...Object.keys(x.statusSrc), ...Object.keys(x.statusOut)])).sort();
  L.push(mdTable(['상태', '전', '후'], statusKeys.map((k) => [k, x.statusSrc[k] || 0, x.statusOut[k] || 0])));

  L.push('## 3. 금액');
  L.push('');
  L.push(mdTable(['항목', '전', '후', '일치'], [
    ['계약금액 합계', won(x.sumSrcAmount), won(x.sumOutAmount), x.sumSrcAmount === x.sumOutAmount ? '✓' : '✗'],
    ['대금 회차 합계', won(x.sumSrcPay), won(x.sumOutPay), x.sumSrcPay === x.sumOutPay ? '✓' : '✗']
  ]));
  L.push('금액은 전부 원 단위 정수로 다룹니다. 소수점·쉼표가 있었다면 `Pure.gs` 의 `normalizeAmount` 가 정수로 만들고,');
  L.push('그 때문에 값이 달라진 줄은 아래 "원본 이상" 목록에 적혀 있습니다.');
  L.push('');

  L.push('## 4. 문서 지문(doc_hash)');
  L.push('');
  L.push('- 지문이 있는 계약: **' + x.srcHashCount + '건**');
  L.push('- CSV 에 글자 그대로 보존된 것: **' + x.hashKept + '건**');
  L.push('- 값이 달라진 것: **' + x.hashBroken.length + '건**');
  L.push('- 계약을 못 옮겨 CSV 에 아예 없는 것: **' + (x.srcHashCount - x.hashKept - x.hashBroken.length) + '건** (6번 항목 참고)');
  L.push('');
  if (x.hashBroken.length) L.push(mdTable(['계약 id', '원본 지문', 'CSV 지문'], x.hashBroken));
  L.push('본문(`bodyJson`)도 그대로 옮기므로, 시트에 올린 뒤에도 `Pure.gs` 의 `docHashSource` 로 다시 계산해 대조할 수 있습니다.');
  L.push('다시 계산한 값이 저장된 지문과 다른 계약이 있으면 "원본 이상" 목록에 적혀 있습니다(고치지 않았습니다).');
  L.push('');

  L.push('## 5. 서명 링크(sign_tokens) — 만료된 것을 어떻게 했는가');
  L.push('');
  L.push(mdTable(['상태(기준 시각 ' + x.nowIso + ')', '건수'], Object.keys(x.tokenState).map((k) => [
    ({ ok: '아직 살아 있음', used: '이미 사용됨', expired: '기한 지남', revoked: '취소됨', unknown: '알 수 없음' })[k] || k,
    x.tokenState[k]
  ])));
  if (x.args.dropDeadTokens) {
    L.push('`--drop-dead-tokens` 를 주셨으므로 **죽은 링크 ' + x.deadDropped + '건은 옮기지 않았습니다.**');
    L.push('링크를 언제 보냈는지는 `ContractEvents` 의 `SIGN_LINK_ISSUED` 로 남아 있습니다.');
  } else {
    L.push('**기한이 지난 링크도 전부 옮겼습니다.** 두 가지 이유입니다.');
    L.push('');
    L.push('1. 언제 몇 번 링크를 보냈는지가 원장의 일부입니다. 지우면 그 기록이 사라집니다.');
    L.push('2. 옮겨도 열리지 않습니다 — `Pure.gs` 의 `tokenState` 가 `expires_at` 을 보고 만료로 판정하고,');
    L.push('   `used_at`·`revoked_at` 이 찍힌 링크도 마찬가지로 막힙니다. 토큰 원문은 애초에 어디에도 없습니다(해시만).');
    L.push('');
    L.push('죽은 링크를 굳이 빼고 싶으시면 `--drop-dead-tokens` 를 붙여 다시 실행하세요.');
  }
  L.push('');

  L.push('## 6. 옮기지 못한 줄');
  L.push('');
  if (!x.skipped.length) L.push('없습니다. 원본의 모든 줄이 CSV 로 갔습니다.');
  else {
    L.push('**아래 줄은 CSV 에 없습니다.** 조용히 버린 것이 아니라, 넣을 수 없어서 남긴 것입니다.');
    L.push('');
    L.push(mdTable(['옛 표', '식별자', '이유'], x.skipped));
  }
  L.push('');

  L.push('## 7. 원본 자체가 어긋난 줄 (고치지 않았습니다)');
  L.push('');
  if (!x.anomalies.length) L.push('없습니다.');
  else {
    L.push('아래는 **옛 DB 안에서 이미 어긋나 있던** 값입니다. 이 도구는 값을 고치지 않고 그대로 옮겼습니다.');
    L.push('어느 쪽이 맞는지는 사장님만 아십니다 — 시트에 올린 뒤 손으로 바로잡으시고, 그 사실을 `ContractEvents` 에 한 줄 남기세요.');
    L.push('');
    L.push(mdTable(['옛 표', '식별자', '무엇이 어긋났는가'], x.anomalies));
  }
  L.push('');

  L.push('## 8. 옮기지 않은 표·칸');
  L.push('');
  L.push('새 시트(`Schema.gs`)에 자리가 없는 것들입니다. **옛 백업 파일은 지우지 마십시오.** 여기 적힌 것은 그 파일에만 남습니다.');
  L.push('');
  L.push(mdTable(['옛 자료', '건수', '왜 안 옮겼는가'], [
    ['signatures.image_data (서명 그림)', x.src.signatures.length, '시트 칸에 넣을 수 없는 크기입니다. 지문(image_sha256)만 Contracts.signatureSha256 로 옮겼습니다.'],
    ['consents (동의 항목)', x.src.consents, '새 시트에 동의 표가 없습니다. 동의 사실은 ContractEvents 의 CONSENT_AGREED 로 남습니다.'],
    ['otp_challenges (본인확인)', x.src.otp, 'Apps Script 판에는 OTP 본인확인이 없습니다.'],
    ['message_deliveries (발송 이력)', x.src.deliveries, '발송 결과는 ContractEvents 의 메시지 사건으로만 남습니다.'],
    ['message_templates (문구)', x.src.templates, '문구는 코드에 있습니다.'],
    ['app_settings (운영 설정)', x.src.settings.length, '비밀값이 섞여 있을 수 있어 옮기지 않습니다. 시트는 링크 하나면 남이 볼 수 있는 곳입니다.'],
    ['payments.reminded_at (독촉 시각)', x.remindedDropped, 'Payments 시트에 그 칸이 없습니다. 없던 글을 memo 에 지어 넣지 않았습니다.'],
    ['audit_logs.party_id · contract_parties.verified_at', '—', '새 구조는 계약 한 건에 고객 한 명이라 당사자 id 가 필요 없습니다.'],
    ['ip_hash (접속지 해시)', '—', 'Apps Script 는 요청자 IP 를 주지 않습니다(PROTOCOL.md 참고). 새 원장에는 그 칸이 없습니다.']
  ]));
  L.push('옛 `app_settings` 에 있던 키 이름만 참고로 적습니다(값은 읽지도, 적지도 않았습니다): `' +
    (x.src.settings.length ? x.src.settings.join('`, `') : '없음') + '`');
  L.push('');

  L.push('## 9. 비어 있던 칸을 어디서 끌어왔는가');
  L.push('');
  L.push(mdTable(['시트 칸', '어디서', '건수'], [
    ['Contracts.sentAt', 'audit_logs 의 첫 SIGN_LINK_ISSUED', x.derivedSent],
    ['Contracts.viewedAt', 'audit_logs 의 첫 SIGN_LINK_OPENED (없으면 DOCUMENT_VIEWED)', x.derivedViewed],
    ['Contracts.voidedAt', 'audit_logs 의 마지막 CONTRACT_VOIDED (status=VOID 인 계약만)', x.derivedVoided],
    ['Contracts.signedAt · signatureSha256', 'signatures 표', x.src.signatures.length],
    ['Contracts.signerName', '고객 당사자 이름 — 옛 화면은 서명자 이름을 따로 받지 않았습니다', x.src.signatures.length],
    ['ContractEvents.actor', '사건 이름으로 갈랐습니다(옛 표에 그 칸이 없습니다)', x.eventRows.length]
  ]));
  L.push('`folderId` · `originalFileId` · `completedFileId` · `completedSha256` 은 **빈칸**입니다.');
  L.push('옛 서버는 계약서 파일을 제 디스크에 두었고 Drive 에 올린 적이 없어, 채울 값 자체가 없습니다.');
  L.push('');

  L.push('## 10. 사건 이름 대응');
  L.push('');
  L.push('뜻이 똑같은 것만 새 이름으로 바꿨습니다.');
  L.push('');
  const renameRows = Object.keys(x.renameCount).sort().map((k) => [k, EVENT_RENAME[k], x.renameCount[k]]);
  L.push(mdTable(['옛 이름', '새 이름', '건수'], renameRows));
  L.push('아래는 새 이름 체계(`Schema.gs` 의 EVENTS)에 없는 사건입니다. **옛 이름 그대로** 옮겼습니다 —');
  L.push('비슷해 보인다고 다른 사건에 묶으면 원장이 증거로서의 값을 잃습니다.');
  L.push('');
  L.push(mdTable(['그대로 둔 이름', '건수'], Object.keys(x.keptNames).sort().map((k) => [k, x.keptNames[k]])));
  if (x.orphanEvents.length) {
    L.push('원본에 없는 계약을 가리키는 사건 ' + x.orphanEvents.length + '건도 그대로 옮겼습니다(기록을 지우지 않습니다).');
    L.push('');
    L.push(mdTable(['audit id', '가리키는 계약 id'], x.orphanEvents.slice(0, 50)));
  }
  L.push('');

  L.push('## 11. 다음에 할 일');
  L.push('');
  L.push('1. `out/` 의 CSV 4개를 Drive 의 아무 폴더에나 올립니다(공유하지 마세요 — 고객 자료입니다).');
  L.push('2. Apps Script 편집기에서 `ensureSheets_()` 를 먼저 한 번 실행해 시트를 갖춥니다.');
  L.push('3. `MigrationService.gs` 의 `importFromDriveFolder_(<폴더 id>)` 를 실행합니다.');
  L.push('   같은 id 의 줄은 건너뛰므로 **여러 번 실행해도 두 번 들어가지 않습니다**(6분 제한에 걸리면 그냥 다시 실행하세요).');
  L.push('4. 실행 기록(Logger)의 "넣기 전 / 넣은 뒤" 건수가 이 보고서의 표와 같은지 보십시오.');
  L.push('5. 끝난 뒤 `out/` 폴더를 지우십시오. 고객 이름과 금액이 든 파일입니다. (git 에는 올라가지 않습니다 — `.gitignore`)');
  L.push('');
  L.push('> 전화번호 해시(`customerPhoneHash`)는 옛 서버의 `CONTRACT_PEPPER` 로 만든 값입니다.');
  L.push('> Apps Script 의 `PEPPER` 를 **같은 값으로** 두셔야 앞으로 만드는 해시와 대조가 됩니다.');
  L.push('> 다른 값을 쓰시면 옛 계약의 번호 해시는 영영 대조할 수 없습니다(마스킹본 010-****-5678 은 그대로 보입니다).');
  L.push('');

  return L.join('\n');
}

/* 예상 못 한 오류로 죽으면 그냥 두지 않는다.
   그대로 두면 끝난 뒤 값이 1 로 나가 '대조가 어긋났다'와 구별되지 않는다.
   여기서 2(시작도 못 함)로 갈라 준다 — 사장님이 무엇을 해야 할지가 다르다. */
try {
  main();
} catch (e) {
  console.error('');
  console.error('✗ 이전 도구가 예상 못 한 곳에서 멈췄습니다: ' + (e && e.message ? e.message : e));
  console.error('  원본 백업은 그대로입니다(읽기만 합니다). 이 메시지를 그대로 전해 주세요.');
  if (e && e.stack) console.error(e.stack);
  process.exit(2);
}
