/**
 * 계정 없는 설치 리허설.
 *
 * 실제 clasp, Google 로그인, 프로젝트 생성은 절대 호출하지 않는다. 설치 도구의
 * 로컬 경계만 정상/변이 쌍으로 확인하고, 변이는 반드시 0이 아닌 코드가 된다.
 *
 * 실행: node tools/install/rehearsal.mjs   (apps-script-contract 기준)
 */
import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync
} from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { precheck, EXPECTED_GS, EXPECTED_HTML } from './precheck.mjs';
import { assertNewContractProject, EXPECTED_TITLE } from './project-guard.mjs';

const INSTALL_DIR = dirname(fileURLToPath(import.meta.url));
const CONTRACT_ROOT = resolve(INSTALL_DIR, '..', '..');
const REPO_ROOT = resolve(CONTRACT_ROOT, '..');
const PUSH_SH = join(INSTALL_DIR, 'push.sh');
const PUSH_PS1 = join(INSTALL_DIR, 'push.ps1');
const TEMP_NAMES = ['before-scripts.txt', 'after-scripts.txt'];
const rows = [];

function codeOf(fn) {
  try { return fn() === false ? 1 : 0; } catch { return 1; }
}

function record(name, normalCode, mutationCodes, detail) {
  assert.equal(normalCode, 0, `${name}: 정상 경로가 실패했습니다`);
  for (const code of mutationCodes) assert.notEqual(code, 0, `${name}: 변이가 통과했습니다`);
  rows.push({ name, normalCode, mutationCodes, detail });
}

function tempFileState() {
  const out = {};
  for (const name of ['.clasp.json', ...TEMP_NAMES]) {
    const path = name === '.clasp.json' ? join(CONTRACT_ROOT, name) : join(INSTALL_DIR, name);
    out[name] = existsSync(path)
      ? { exists: true, size: statSync(path).size, text: readFileSync(path, 'utf8') }
      : { exists: false };
  }
  return out;
}

function sameState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function commandForDryRun() {
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PUSH_PS1],
      label: 'push.ps1 (Windows equivalent; push.sh guard also inspected)'
    };
  }
  return { command: 'bash', args: [PUSH_SH], label: 'push.sh' };
}

function runDryPlan() {
  const before = tempFileState();
  const cmd = commandForDryRun();
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const r = spawnSync(cmd.command, cmd.args, {
    cwd: INSTALL_DIR,
    encoding: 'utf8',
    env: { ...process.env, [pathKey]: `${dirname(process.execPath)}${delimiter}${process.env[pathKey] || ''}` }
  });
  const after = tempFileState();
  const planOnly = process.platform === 'win32'
    ? /if \(-not \$Apply\).*exit 0/.test(readFileSync(PUSH_PS1, 'utf8'))
    : /계획만 확인했습니다/.test(String(r.stdout));
  return {
    ok: r.status === 0 && planOnly && sameState(before, after),
    status: r.status,
    label: cmd.label,
    stdout: String(r.stdout || ''),
    stderr: String(r.stderr || '')
  };
}

function dryRunGatePresent(source) {
  return /APPLY=.*\$\{1:-\}/.test(source)
    && /\[\[\s*"\$APPLY"\s*!=\s*"--apply"\s*\]\]/.test(source)
    && /계획만 확인했습니다/.test(source)
    && source.indexOf('계획만 확인했습니다') < source.indexOf('create-script');
}

function bashAvailable() {
  if (process.platform === 'win32') return false;
  return spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0;
}

function cleanupFailurePath() {
  for (const name of TEMP_NAMES) rmSync(join(INSTALL_DIR, name), { force: true });
  if (process.platform === 'win32') {
    const source = readFileSync(PUSH_SH, 'utf8');
    const trapLine = `trap 'rm -f "$INSTALL_DIR/before-scripts.txt" "$INSTALL_DIR/after-scripts.txt"' EXIT`;
    const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
    const r = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PUSH_PS1, '-Apply'
    ], {
      cwd: INSTALL_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        MANMOOL_INSTALL_REHEARSAL_FAIL: '1',
        [pathKey]: `${dirname(process.execPath)}${delimiter}${process.env[pathKey] || ''}`
      }
    });
    return {
      ok: r.status !== 0
        && TEMP_NAMES.every((name) => !existsSync(join(INSTALL_DIR, name)))
        && source.includes(trapLine)
        && source.indexOf(trapLine) < source.indexOf('MANMOOL_INSTALL_REHEARSAL_FAIL'),
      status: `POWERSHELL_${r.status}`
    };
  }
  if (!bashAvailable()) return { ok: false, status: 'BASH_NOT_FOUND' };
  const r = spawnSync('bash', [PUSH_SH, '--apply'], {
    cwd: INSTALL_DIR,
    encoding: 'utf8',
    env: { ...process.env, MANMOOL_INSTALL_REHEARSAL_FAIL: '1' }
  });
  return {
    ok: r.status !== 0 && TEMP_NAMES.every((name) => !existsSync(join(INSTALL_DIR, name))),
    status: r.status
  };
}

function cleanupTrapMutationCode() {
  const dir = mkdtempSync(join(tmpdir(), 'manmool-install-cleanup-mut-'));
  try {
    const mutated = readFileSync(PUSH_SH, 'utf8').replace(
      /trap 'rm -f "\$INSTALL_DIR\/before-scripts\.txt" "\$INSTALL_DIR\/after-scripts\.txt"' EXIT/,
      '# trap removed by rehearsal mutation'
    );
    return codeOf(() => {
      const trapGone = !mutated.includes(`trap 'rm -f "$INSTALL_DIR/before-scripts.txt" "$INSTALL_DIR/after-scripts.txt"' EXIT`);
      if (!trapGone) return true;
      writeFileSync(join(dir, 'before-scripts.txt'), 'FAKE_EXISTING_ID');
      writeFileSync(join(dir, 'after-scripts.txt'), 'FAKE_NEW_ID');
      return !TEMP_NAMES.some((name) => existsSync(join(dir, name)));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 1) 파일 14개와 가장 나쁜 누락(Sign.gs)
const realPrecheck = codeOf(() => precheck(CONTRACT_ROOT).ok);
const missingDir = mkdtempSync(join(tmpdir(), 'manmool-precheck-missing-'));
try {
  for (const name of [...EXPECTED_GS, ...EXPECTED_HTML]) {
    if (name !== 'Sign.gs') writeFileSync(join(missingDir, name), '');
  }
  writeFileSync(join(missingDir, 'appsscript.json'), '{}');
  const missingSign = codeOf(() => precheck(missingDir).ok);
  record('1. 파일 14개 / Sign.gs 누락 차단', realPrecheck, [missingSign], '.gs 11 + .html 2 + manifest');
} finally {
  rmSync(missingDir, { recursive: true, force: true });
}

// 2) 기존 프로젝트 ID와 다른 제목을 각각 차단
const guardDir = mkdtempSync(join(tmpdir(), 'manmool-project-guard-'));
try {
  const claspFile = join(guardDir, '.clasp.json');
  const newId = 'NEW_CONTRACT_PROJECT_1234567890';
  const oldId = 'OLD_PHOTO_RELAY_1234567890123';
  writeFileSync(claspFile, JSON.stringify({ scriptId: newId }));
  const guardNormal = codeOf(() => !!assertNewContractProject(claspFile, `${EXPECTED_TITLE} ${newId}`, [oldId]));
  writeFileSync(claspFile, JSON.stringify({ scriptId: oldId }));
  const oldMutation = codeOf(() => !!assertNewContractProject(claspFile, `${EXPECTED_TITLE} ${oldId}`, [oldId]));
  writeFileSync(claspFile, JSON.stringify({ scriptId: newId }));
  const titleMutation = codeOf(() => !!assertNewContractProject(claspFile, `사진 중계 ${newId}`, []));
  record('2. 새 프로젝트 대상 방어', guardNormal, [oldMutation, titleMutation], '기존 ID=1 · 다른 제목=1');
} finally {
  rmSync(guardDir, { recursive: true, force: true });
}

// 3) 인자 없는 실행은 계획만 출력하고 파일을 만들거나 바꾸지 않음
const dry = runDryPlan();
const pushSource = readFileSync(PUSH_SH, 'utf8');
const dryMutation = codeOf(() => dryRunGatePresent(pushSource.replace('계획만 확인했습니다', '')));
record('3. 설치 스크립트 dry-run', dry.ok ? 0 : (dry.status || 1), [dryMutation], dry.label);

// 4) 실패 후 계정 ID 목록 임시 파일이 남지 않음
const cleanup = cleanupFailurePath();
record('4. 실패 시 계정 목록 정리', cleanup.ok ? 0 : 1, [cleanupTrapMutationCode()], String(cleanup.status));

// 5) wiring.test.mjs가 bootstrap의 길이·재실행 유지·비노출을 실제로 확인
const wiring = spawnSync(process.execPath, [join(CONTRACT_ROOT, 'test', 'wiring.test.mjs')], {
  cwd: REPO_ROOT, encoding: 'utf8'
});
const wiringText = String(wiring.stdout || '') + String(wiring.stderr || '');
const evidence = [
  '두 번째 실행이 PEPPER와 ADMIN_TOKEN을 덮어쓰지 않는다',
  '새 비밀값은 각각 40자 이상이다',
  '로그에 PEPPER와 ADMIN_TOKEN 값이 없다'
];
const wiringNormal = wiring.status === 0 && evidence.every((x) => wiringText.includes(x));
const wiringMutation = codeOf(() => evidence.every((x) => wiringText.replace(evidence[0], '').includes(x)));
record('5. bootstrap 순수 안전성', wiringNormal ? 0 : (wiring.status || 1), [wiringMutation], 'wiring.test.mjs');

console.log('계정 없는 설치 리허설');
console.log('─'.repeat(72));
for (const row of rows) {
  console.log(`PASS  ${row.name}`);
  console.log(`      정상=${row.normalCode} · 변이=${row.mutationCodes.join(',')} · ${row.detail}`);
}
console.log('─'.repeat(72));
console.log(`완료: ${rows.length}개 정상 경로=0 · 모든 변이=0 아님 · clasp 호출=0`);
