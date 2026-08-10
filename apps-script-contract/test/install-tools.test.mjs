import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { precheck, EXPECTED_GS, EXPECTED_HTML } from '../tools/install/precheck.mjs';
import { assertNewContractProject } from '../tools/install/project-guard.mjs';

test('precheck accepts exactly 11 gs, 2 html and a valid manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-precheck-'));
  for (const f of [...EXPECTED_GS, ...EXPECTED_HTML]) writeFileSync(join(dir, f), '');
  writeFileSync(join(dir, 'appsscript.json'), '{}');
  assert.equal(precheck(dir).ok, true);
});

test('Apps Script upload names are unique even without extensions', () => {
  const baseNames = [...EXPECTED_GS, ...EXPECTED_HTML].map((name) => name.replace(/\.(?:gs|html)$/, ''));
  assert.equal(new Set(baseNames).size, baseNames.length,
    'Apps Script forbids Sign.gs and Sign.html style duplicate base names');
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

test('configure-project keeps clasp root and push order on the same path base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-config-'));
  const cfg = join(dir, '.clasp.json');
  writeFileSync(cfg, JSON.stringify({ scriptId: 'NEW_CONTRACT_PROJECT_1234567890', rootDir: 'wrong' }));
  const script = resolve('apps-script-contract/tools/install/configure-project.mjs');
  const r = spawnSync(process.execPath, [script, cfg], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(readFileSync(cfg, 'utf8'));
  assert.equal(out.rootDir, '.');
  assert.deepEqual(out.filePushOrder, [...EXPECTED_GS, ...EXPECTED_HTML, 'appsscript.json']);
});
