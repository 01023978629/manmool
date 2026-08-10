import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const EXPECTED_TITLE = '만물 전자계약';

export function assertNewContractProject(claspFile, scriptsText, previousIds = []) {
  const cfg = JSON.parse(readFileSync(claspFile, 'utf8'));
  const id = String(cfg.scriptId || '').trim();
  if (!id) throw new Error('새 Apps Script 프로젝트 ID를 찾지 못했습니다.');
  if (previousIds.includes(id)) throw new Error('기존 프로젝트 ID가 감지되어 중단했습니다. 사진 중계 프로젝트에는 올릴 수 없습니다.');
  const line = String(scriptsText).split(/\r?\n/).find((x) => x.includes(id)) || '';
  if (!line.includes(EXPECTED_TITLE)) throw new Error('대상 프로젝트 이름이 「만물 전자계약」이 아니어서 중단했습니다.');
  return { id, title: EXPECTED_TITLE };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const claspFile = process.argv[2];
    const listFile = process.argv[3];
    const beforeFile = process.argv[4];
    if (!claspFile || !listFile) throw new Error('검사할 파일이 없습니다.');
    const previous = beforeFile ? String(readFileSync(beforeFile, 'utf8')).match(/[-_A-Za-z0-9]{20,}/g) || [] : [];
    const r = assertNewContractProject(claspFile, readFileSync(listFile, 'utf8'), previous);
    console.log('대상 확인: ' + r.title + ' (새 프로젝트)');
  } catch (e) {
    console.error('대상 확인 실패: ' + e.message);
    process.exit(1);
  }
}
