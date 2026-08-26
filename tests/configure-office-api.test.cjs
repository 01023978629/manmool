const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const script = path.join(ROOT, 'scripts', 'configure-office-api.mjs');
const DISABLED = '{\n  "enabled": false,\n  "apiUrl": ""\n}\n';
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-office-api-test-'));
const configPath = path.join(tempRoot, 'office-api.json');

function readConfig() {
  return fs.readFileSync(configPath, 'utf8');
}

async function loadApi() {
  return import(`${pathToFileURL(script).href}?test=${Date.now()}-${Math.random()}`);
}

function fakeFilesystem({ failWrite = false, failRename = false } = {}) {
  const files = new Map([['config.json', 'old-config']]);
  const steps = [];
  return {
    files,
    steps,
    fs: {
      openSync(file, flags, mode) { steps.push(`open:${file}:${flags}:${mode.toString(8)}`); files.set(file, ''); return 41; },
      writeFileSync(descriptor, content) {
        steps.push(`write:${descriptor}`);
        assert.equal(typeof descriptor, 'number', 'CONFIG_PATH를 직접 덮어쓰면 안 된다');
        if (failWrite) throw new Error('write failed');
        files.set('temp.json', content);
      },
      fsyncSync(descriptor) { steps.push(`fsync:${descriptor}`); },
      closeSync(descriptor) { steps.push(`close:${descriptor}`); },
      renameSync(from, to) { steps.push(`rename:${from}->${to}`); if (failRename) throw new Error('rename failed'); files.set(to, files.get(from)); files.delete(from); },
      existsSync(file) { return files.has(file); },
      unlinkSync(file) { steps.push(`unlink:${file}`); files.delete(file); },
    },
  };
}

after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

test('관리사무소 API CLI handler는 임시 configPath에서만 정확한 URL을 pretty JSON으로 활성화한다', async () => {
  const { runCli, writeConfigAtomically } = await loadApi();
  const url = 'https://script.google.com/macros/s/Ab_C-9/exec';
  const result = runCli(['--url', url, '--enable'], {
    stdout: () => {}, stderr: () => {},
    writer: (config) => writeConfigAtomically(config, { configPath }),
  });
  assert.equal(result, 0);
  assert.equal(readConfig(), `{\n  "enabled": true,\n  "apiUrl": "${url}"\n}\n`);
  assert.equal(fs.existsSync(path.join(ROOT, 'office-api.json')), true, 'production default path remains fixed and untouched');
});

test('관리사무소 API CLI handler는 비밀 인자·URL 우회·중복을 거절하고 임시 설정을 보존한다', async () => {
  const { runCli, writeConfigAtomically } = await loadApi();
  const safeUrl = 'https://script.google.com/macros/s/Safe_123/exec';
  const write = (config) => writeConfigAtomically(config, { configPath });
  assert.equal(runCli(['--url', safeUrl, '--enable'], { stdout: () => {}, stderr: () => {}, writer: write }), 0);
  const before = readConfig();
  for (const args of [
    ['--disable', '--disable'], ['--enable'], ['--url', safeUrl], ['--url', safeUrl, '--enable', '--url', safeUrl],
    ['--url', 'http://script.google.com/macros/s/Safe_123/exec', '--enable'], ['--url', 'https://script.google.com/macros/s/Safe_123/exec?x=1', '--enable'],
    ['--url', safeUrl, '--enable', '--token', 'x'], ['--url', safeUrl, '--enable', '--pinHash', 'x'], ['--url', safeUrl, '--enable', '--secret-value', 'x'],
  ]) {
    assert.equal(runCli(args, { stdout: () => {}, stderr: () => {}, writer: write }), 1, args.join(' '));
    assert.equal(readConfig(), before, `${args.join(' ')} changed temp config`);
  }
});

test('관리사무소 API 원자 writer는 temp 생성→write→fsync→close→rename 순서이며 CONFIG_PATH를 직접 덮어쓰지 않는다', async () => {
  const { writeConfigAtomically } = await loadApi();
  const fake = fakeFilesystem();
  writeConfigAtomically({ enabled: false, apiUrl: '' }, { fileSystem: fake.fs, configPath: 'config.json', tempPath: 'temp.json' });
  assert.deepEqual(fake.steps, ['open:temp.json:wx:600', 'write:41', 'fsync:41', 'close:41', 'rename:temp.json->config.json']);
  assert.equal(fake.files.get('config.json'), DISABLED);
  assert.equal(fake.files.has('temp.json'), false);
});

test('관리사무소 API 원자 writer는 write 또는 rename 실패 때 기존 임시 설정을 보존하고 temp를 정리한다', async () => {
  const { writeConfigAtomically } = await loadApi();
  for (const options of [{ failWrite: true }, { failRename: true }]) {
    const fake = fakeFilesystem(options);
    assert.throws(() => writeConfigAtomically({ enabled: true, apiUrl: 'https://script.google.com/macros/s/Safe_123/exec' }, { fileSystem: fake.fs, configPath: 'config.json', tempPath: 'temp.json' }), /failed/);
    assert.equal(fake.files.get('config.json'), 'old-config');
    assert.equal(fake.files.has('temp.json'), false);
    assert.equal(fake.steps.includes('unlink:temp.json'), true);
  }
});
