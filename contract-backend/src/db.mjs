// SQLite 접근 계층 (node:sqlite, 무의존성). 스키마 로드 + 마이그레이션 + 시드.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── 스키마 마이그레이션 ────────────────────────────────────────────
// schema.sql 은 CREATE TABLE IF NOT EXISTS 라서 '이미 있는 테이블'은 절대 바뀌지 않는다.
// 그래서 스키마에 컬럼을 추가하면 새 DB(로컬·CI는 전부 :memory:)만 새 모양이 되고,
// 운영 볼륨은 옛 모양 그대로 남아 — 그 컬럼을 쓰는 INSERT 가 실행되는 순간,
// 그것도 고객이 서명을 제출하는 순간에 터진다.
// (실제 전례: signatures.image_data 가 나중에 추가됐다. 그 이전에 만들어진 볼륨이라면
//  서명 제출이 "table signatures has no column named image_data" 로 실패한다.)
//
// 규칙: 기존 테이블의 모양을 바꿀 때는 schema.sql 수정 + 여기 MIGRATIONS 에 한 항목을 추가한다.
// 각 항목은 한 번만 적용되고(schema_migrations 에 id 기록), up 자체도 멱등으로 쓴다
// (ensureColumn 등) — 과거 어느 시점의 볼륨이든 같은 최종 모양으로 수렴해야 한다.
const MIGRATIONS = [
  { id: '0001_signatures_image_data', up: (db) => ensureColumn(db, 'signatures', 'image_data', 'TEXT') },
];

// 컬럼이 없을 때만 추가한다(있으면 아무것도 안 함 → 멱등).
function ensureColumn(db, table, column, ddl) {
  const cols = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table).map((r) => r.name);
  if (cols.includes(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const done = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    // 실패하면 기록 없이 그대로 던진다 — 반쯤 적용된 채 성공으로 기록되는 것이 최악이다.
    db.exec('BEGIN');
    try {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations(id, applied_at) VALUES(?,?)').run(m.id, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* 이미 롤백됨 */ }
      throw new Error(`스키마 마이그레이션 실패(${m.id}): ${e.message} — DB 를 백업한 뒤 원인을 확인하세요.`);
    }
  }
}

export function openDb(path = ':memory:') {
  // 파일 DB면 상위 디렉터리를 보장(영속 저장소 마운트 경로 등).
  if (path !== ':memory:' && path.includes('/')) {
    try { mkdirSync(dirname(path), { recursive: true }); } catch { /* 이미 있음 */ }
  }
  const db = new DatabaseSync(path);
  const schema = readFileSync(join(__dir, '..', 'schema.sql'), 'utf8');
  db.exec(schema);          // 새 테이블 생성(기존 테이블은 그대로)
  migrate(db);              // 기존 테이블의 모양을 현재 스키마로 끌어올린다
  seedTemplates(db);
  return db;
}

// 메시지 템플릿 시드. 승인 전에는 실제 발송에 쓰이지 않고, Mock 이 형태만 검증한다.
function seedTemplates(db) {
  const has = db.prepare('SELECT COUNT(*) c FROM message_templates').get().c;
  if (has) return;
  const ins = db.prepare(
    `INSERT INTO message_templates(id,template_key,channel,title,body_template,buttons_json,version)
     VALUES(?,?,?,?,?,?,1)`
  );
  ins.run('tpl_sign', 'contract_sign', 'alimtalk', '전자계약 서명 요청',
    ['[만물인테리어] #{name}님, 계약서 서명 요청드립니다.',
     '계약번호: #{contractNo}',
     '아래 버튼에서 본인확인 후 계약 내용을 확인·서명해 주세요.',
     '※ 링크는 72시간 후 만료됩니다.'].join('\n'),
    JSON.stringify([{ name: '계약서 확인·서명', type: 'WL', url: '#{signUrl}' }]));
  ins.run('tpl_done', 'contract_done', 'alimtalk', '전자계약 완료',
    ['[만물인테리어] #{name}님, 전자계약이 완료되었습니다.',
     '계약번호: #{contractNo}',
     '계약서 사본은 아래 버튼에서 15분간 확인하실 수 있습니다.'].join('\n'),
    JSON.stringify([{ name: '계약서 사본 보기', type: 'WL', url: '#{viewUrl}' }]));
  ins.run('tpl_invoice', 'contract_invoice', 'alimtalk', '공사대금 안내',
    ['[만물인테리어] #{name}님, #{stageLabel} 안내드립니다.',
     '계약번호: #{contractNo}',
     '#{stageLabel}: #{amount}원',
     '입금계좌: #{payInfo}',
     '확인 후 입금 부탁드립니다. 감사합니다.'].join('\n'), null);
}
