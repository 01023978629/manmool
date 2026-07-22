// SQLite 접근 계층 (node:sqlite, 무의존성). 스키마 로드 + 시드.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  const schema = readFileSync(join(__dir, '..', 'schema.sql'), 'utf8');
  db.exec(schema);
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
}
