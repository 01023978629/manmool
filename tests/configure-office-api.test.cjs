const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

function fakeFilesystem({ failWrite = false, failRename = false } = {}) {
  const files = new Map([['config.json', 'old-config']]);
  const steps = [];
  return {
    files,
    steps,
    fs: {
      openSync(file, flags, mode) {
        steps.push(`open:${file}:${flags}:${mode.toString(8)}`);
        files.set(file, '');
        return 41;
      },
      writeFileSync(descriptor, content) {
        steps.push(`write:${descriptor}`);
        assert.equal(typeof descriptor, 'number', 'CONFIG_PATH를 직접 덮어쓰면 안 된다');
        if (failWrite) throw new Error('write failed');
        files.set('temp.json', content);
      },
      fsyncSync(descriptor) { steps.push(`fsync:${descriptor}`); },
      closeSync(descriptor) { steps.push(`close:${descriptor}`); },
      renameSync(from, to) {
        steps.push(`rename:${from}->${to}`);
        if (failRename) throw new Error('rename failed');
        files.set(to, files.get(from));
        files.delete(from);
      },
      existsSync(file) { return files.has(file); },
      unlinkSync(file) { steps.push(`unlink:${file}`); files.delete(file); },
    },
  };
}

async function loadWriter() {
  return import(`${pathToFileURL(script).href}?atomic=${Date.now()}-${Math.random()}`);
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

test('관리사무소 API 설정 원자 writer는 temp 생성부터 rename까지 순서대로 실행하고 CONFIG_PATH를 직접 덮어쓰지 않는다', async () => {
  const { writeConfigAtomically } = await loadWriter();
  const fake = fakeFilesystem();
  writeConfigAtomically({ enabled: false, apiUrl: '' }, { fileSystem: fake.fs, configPath: 'config.json', tempPath: 'temp.json' });
  assert.deepEqual(fake.steps, ['open:temp.json:wx:600', 'write:41', 'fsync:41', 'close:41', 'rename:temp.json->config.json']);
  assert.equal(fake.files.get('config.json'), DISABLED);
  assert.equal(fake.files.has('temp.json'), false);
});

test('관리사무소 API 설정 원자 writer는 write 또는 rename 실패 때 기존 설정을 보존하고 temp를 정리한다', async () => {
  const { writeConfigAtomically } = await loadWriter();
  for (const options of [{ failWrite: true }, { failRename: true }]) {
    const fake = fakeFilesystem(options);
    assert.throws(
      () => writeConfigAtomically({ enabled: true, apiUrl: 'https://script.google.com/macros/s/Safe_123/exec' }, { fileSystem: fake.fs, configPath: 'config.json', tempPath: 'temp.json' }),
      /failed/
    );
    assert.equal(fake.files.get('config.json'), 'old-config');
    assert.equal(fake.files.has('temp.json'), false);
    assert.equal(fake.steps.includes('unlink:temp.json'), true);
  }
});
