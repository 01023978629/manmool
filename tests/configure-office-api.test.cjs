const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const node = process.execPath;
const script = path.join(ROOT, 'scripts', 'configure-office-api.mjs');
const configPath = path.join(ROOT, 'office-api.json');
const DISABLED = '{\n  "enabled": false,\n  "apiUrl": ""\n}\n';

function run(...args) {
  return childProcess.spawnSync(node, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function readConfig() {
  return fs.readFileSync(configPath, 'utf8');
}

after(() => {
  const result = run('--disable');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readConfig(), DISABLED);
});

test('관리사무소 API 설정 CLI는 정확한 URL만 예쁜 JSON으로 원자적으로 활성화한다', () => {
  const url = 'https://script.google.com/macros/s/Ab_C-9/exec';
  const result = run('--url', url, '--enable');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readConfig(), `{\n  "enabled": true,\n  "apiUrl": "${url}"\n}\n`);
});

test('관리사무소 API 설정 CLI는 --disable만 허용하고 항상 fail-closed 설정으로 복원한다', () => {
  const result = run('--disable');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readConfig(), DISABLED);
  assert.equal(run('--disable', '--disable').status, 1);
  assert.equal(readConfig(), DISABLED);
});

test('관리사무소 API 설정 CLI는 경로 우회와 비밀 인자 및 잘못된 조합을 거절하고 기존 설정을 보존한다', () => {
  const safeUrl = 'https://script.google.com/macros/s/Safe_123/exec';
  assert.equal(run('--url', safeUrl, '--enable').status, 0);
  const before = readConfig();
  const invalidArgs = [
    ['--url', 'http://script.google.com/macros/s/Safe_123/exec', '--enable'],
    ['--url', 'https://script.googleusercontent.com/macros/s/Safe_123/exec', '--enable'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/dev', '--enable'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/exec?next=1', '--enable'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/exec#hash', '--enable'],
    ['--url', 'https://script.google.com:443/macros/s/Safe_123/exec', '--enable'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/exec/', '--enable'],
    ['--url', ' https://script.google.com/macros/s/Safe_123/exec', '--enable'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/exec', '--enable', '--token', 'x'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/exec', '--enable', '--pinHash', 'x'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/exec', '--enable', '--secret-value', 'x'],
    ['--url', 'https://script.google.com/macros/s/Safe_123/exec'],
    ['--enable'],
    ['--url', safeUrl, '--enable', '--url', safeUrl],
    ['--disable', '--url', safeUrl],
    ['--unknown'],
  ];
  for (const args of invalidArgs) {
    const result = run(...args);
    assert.notEqual(result.status, 0, `${args.join(' ')} should fail`);
    assert.equal(readConfig(), before, `${args.join(' ')} changed the current config`);
  }
});
