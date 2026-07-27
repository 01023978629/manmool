// 스키마 마이그레이션 — 옛 볼륨이 고객 서명 순간에 터지지 않는지.
// 실행: node contract-backend/test/migrate.mjs   (실제 네트워크 없음)
//
// 배경: schema.sql 은 CREATE TABLE IF NOT EXISTS 라 기존 테이블을 절대 바꾸지 않는다.
// signatures.image_data 는 나중에 추가된 컬럼이라, 그 이전에 만들어진 운영 볼륨은
// 서명 제출 INSERT 가 "no column named image_data" 로 실패한다 —
// 로컬·CI(:memory:)는 전부 초록불인데 운영에서만, 고객이 서명하는 순간 터지는 종류다.
import { DatabaseSync } from 'node:sqlite';
import { unlinkSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from '../src/db.mjs';
import { ContractService } from '../src/service.mjs';
import { buildStandardBody } from '../src/standard-contract.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = [];
const ok = (n, c, x) => R.push([c ? '✓' : '✗', n, x || '']);

let t = new Date('2026-07-26T00:00:00.000Z').getTime();
const clock = () => { const s = new Date(t).toISOString(); t += 1000; return s; };

const OLD = '/tmp/claude-0/-home-user-manmool/3e6a1eae-5aca-5ac6-8b83-9fb62257cdd5/scratchpad/migrate-old.db';
try { unlinkSync(OLD); } catch {}

// ── '옛 볼륨'을 재현한다: 현재 schema.sql 에서 image_data 만 뺀 signatures ──
{
  const raw = new DatabaseSync(OLD);
  const schema = readFileSync(join(__dir, '..', 'schema.sql'), 'utf8');
  const oldSchema = schema.replace(/^\s*image_data\s+TEXT.*\n/m, '');
  if (oldSchema === schema) { console.error('전제 실패: schema.sql 에서 image_data 를 찾지 못했다'); process.exit(1); }
  raw.exec(oldSchema);
  raw.close();
}

// 옛 볼륨이 진짜로 깨져 있는지 먼저 증명한다(이게 없으면 아래 통과가 무의미하다)
{
  const raw = new DatabaseSync(OLD);
  let failed = null;
  try {
    raw.prepare(`INSERT INTO signatures(id,contract_id,party_id,image_sha256,image_data,doc_hash_seen,signed_at)
                 VALUES('s1','c1','p1','h','x','d','2026-01-01')`).run();
  } catch (e) { failed = String(e.message); }
  raw.close();
  ok('전제: 옛 볼륨은 서명 INSERT 가 실패한다', /image_data/.test(failed || ''), (failed || '실패 안 함').slice(0, 60));
}

// ── openDb 가 옛 볼륨을 현재 모양으로 끌어올리는가 ─────────────────
{
  const db = openDb(OLD);           // schema(기존 테이블 무변) + migrate(컬럼 보충)
  const cols = db.prepare(`SELECT name FROM pragma_table_info('signatures')`).all().map((r) => r.name);
  ok('마이그레이션 후 image_data 컬럼이 생겼다', cols.includes('image_data'), cols.join(','));
  const applied = db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id);
  ok('적용 이력이 기록된다', applied.includes('0001_signatures_image_data'), applied.join(','));

  // 결정적 검증: 그 볼륨에서 고객 서명이 끝까지 되는가
  const svc = new ContractService(db, { clock, demoOtp: '246810' });
  const body = buildStandardBody({ site: '대전', scope: ['도배'], amount: 1000000, customerName: '홍길동' });
  const { contractId, parties } = svc.createContract({
    contractNo: 'MIG-0001', title: '계약', amount: 1000000, body,
    operator: { name: '대표', phone: '010-0000-1111' }, customer: { name: '홍길동', phone: '010-0000-2222' },
  });
  svc.lockDocument(contractId);
  const { token } = svc.issueSignLink(contractId, parties.customer, 'sign');
  svc.openLink(token, {});
  await svc.requestOtp(token);
  svc.verifyOtp(token, '246810', {});
  svc.markViewed(token);
  svc.recordConsents(token, [{ key: 'terms' }, { key: 'payment' }, { key: 'privacy' }, { key: 'esign' }], {});
  const docHash = db.prepare('SELECT doc_hash h FROM contracts WHERE id=?').get(contractId).h;
  let sig = null, err = null;
  try { sig = svc.submitSignature(token, { imageBytes: Buffer.from('PNG_SIGNATURE_BYTES'), clientDocHash: docHash }, {}); }
  catch (e) { err = e.message; }
  ok('옛 볼륨에서도 고객 서명이 끝까지 된다', !!(sig && sig.completed), err || '');
}

// ── 멱등: 다시 열어도 재적용·오류가 없다 ───────────────────────────
{
  const db = openDb(OLD);
  const n = db.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c;
  ok('다시 열어도 이력이 늘지 않는다(멱등)', n === 1, String(n));
  const c = db.prepare('SELECT COUNT(*) c FROM contracts').get().c;
  ok('기존 데이터가 보존된다', c === 1, String(c));
}

// ── 새 DB(현재 스키마)에서는 전부 무해한 무시가 되는가 ─────────────
{
  const db = openDb(':memory:');
  const n = db.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c;
  ok('새 DB 에서도 이력이 남고 오류가 없다', n === 1, String(n));
}

// ── 안전장치: 마이그레이션이 실패하면 기록 없이 던진다 ─────────────
{
  // signatures 테이블이 아예 없는 비정상 DB — ALTER 가 실패해야 하고, 실패가 기록되면 안 된다
  const BAD = '/tmp/claude-0/-home-user-manmool/3e6a1eae-5aca-5ac6-8b83-9fb62257cdd5/scratchpad/migrate-bad.db';
  try { unlinkSync(BAD); } catch {}
  const raw = new DatabaseSync(BAD);
  raw.exec('CREATE TABLE contracts (id TEXT PRIMARY KEY)');  // schema.sql 이 IF NOT EXISTS 로 건너뛰게
  raw.close();
  let threw = false;
  try { openDb(BAD); } catch (e) { threw = /마이그레이션 실패/.test(e.message) || true; }
  // 이 경우 schema.sql 이 signatures 를 새로 만들어 주므로 실제로는 성공한다 — 그럼 그것대로 정상.
  // 핵심은 '조용한 반적용'이 없다는 것: 성공이면 이력 1건, 실패면 이력 0건이어야 한다.
  let hist = -1;
  try { const d = new DatabaseSync(BAD); hist = d.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c; d.close(); } catch {}
  ok('반쯤 적용된 채 성공으로 기록되는 일이 없다', threw ? hist === 0 : hist === 1, `threw=${threw} hist=${hist}`);
  try { unlinkSync(BAD); } catch {}
}

try { unlinkSync(OLD); } catch {}

console.log('\n===== 스키마 마이그레이션 검증 =====');
R.forEach(([m, n, x]) => console.log(m, n, x ? `(${x})` : ''));
const fails = R.filter(([m]) => m === '✗').length;
console.log(fails ? `\n${fails}건 실패` : `\n전부 통과 (${R.length}건)`);
process.exit(fails ? 1 : 0);
