import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { precheck, EXPECTED_GS, EXPECTED_HTML } from '../tools/install/precheck.mjs';
import { assertNewContractProject } from '../tools/install/project-guard.mjs';

test('precheck accepts exactly 11 gs, 2 html and a valid manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-precheck-'));
  for (const f of [...EXPECTED_GS, ...EXPECTED_HTML]) writeFileSync(join(dir, f), '');
  writeFileSync(join(dir, 'appsscript.json'), '{}');
  assert.equal(precheck(dir).ok, true);
});

test('precheck rejects an extra gs file (mutation)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-precheck-mut-'));
  for (const f of [...EXPECTED_GS, ...EXPECTED_HTML, 'Accidental.gs']) writeFileSync(join(dir, f), '');
  writeFileSync(join(dir, 'appsscript.json'), '{}');
  assert.equal(precheck(dir).ok, false);
});

test('project guard accepts only a newly created correctly titled project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-guard-'));
  const cfg = join(dir, '.clasp.json');
  writeFileSync(cfg, JSON.stringify({ scriptId: 'NEW_CONTRACT_PROJECT_1234567890' }));
  const got = assertNewContractProject(cfg, '만물 전자계약 NEW_CONTRACT_PROJECT_1234567890', ['OLD_PHOTO_RELAY_1234567890123']);
  assert.equal(got.title, '만물 전자계약');
});

test('project guard stops an existing/photo relay id and wrong title (mutations)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-guard-mut-'));
  const cfg = join(dir, '.clasp.json');
  writeFileSync(cfg, JSON.stringify({ scriptId: 'OLD_PHOTO_RELAY_1234567890123' }));
  assert.throws(() => assertNewContractProject(cfg, '만물 전자계약 OLD_PHOTO_RELAY_1234567890123', ['OLD_PHOTO_RELAY_1234567890123']), /기존 프로젝트/);
  writeFileSync(cfg, JSON.stringify({ scriptId: 'NEW_CONTRACT_PROJECT_1234567890' }));
  assert.throws(() => assertNewContractProject(cfg, '사진 중계 NEW_CONTRACT_PROJECT_1234567890', []), /이름/);
});
