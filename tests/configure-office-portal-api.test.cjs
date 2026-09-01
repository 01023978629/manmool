'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const script = path.join(__dirname, '..', 'scripts', 'configure-office-portal-api.mjs');

async function load() {
  return import(`${pathToFileURL(script).href}?test=${Date.now()}-${Math.random()}`);
}

test('역할 포털 설정은 exact Apps Script exec URL만 허용한다', async () => {
  const mod = await load();
  const good = 'https://script.google.com/macros/s/Abc_123-xyz/exec';
  assert.equal(mod.isExactAppsScriptUrl(good), true);
  for (const bad of [
    'http://script.google.com/macros/s/Abc/exec',
    'https://script.google.com.evil.example/macros/s/Abc/exec',
    'https://script.google.com/macros/s/Abc/exec?token=secret',
    'https://script.google.com/macros/s/Abc/exec#x',
    ' https://script.google.com/macros/s/Abc/exec',
  ]) assert.equal(mod.isExactAppsScriptUrl(bad), false, bad);
});

test('활성화·비활성화 명령만 만들고 비밀값 인자를 거부한다', async () => {
  const mod = await load();
  const url = 'https://script.google.com/macros/s/Abc_123/exec';
  assert.deepEqual(mod.parseCommand(['--url', url, '--enable']).config, { enabled: true, apiUrl: url });
  assert.deepEqual(mod.parseCommand(['--disable']).config, { enabled: false, apiUrl: '' });
  assert.match(mod.parseCommand(['--secret', 'x']).error, /비밀값/);
  assert.match(mod.parseCommand(['--url', 'https://example.com', '--enable']).error, /사용법/);
});

test('CLI는 검증된 설정만 writer에 넘긴다', async () => {
  const mod = await load();
  const written = [];
  const messages = [];
  const code = mod.runCli(['--disable'], { writer: (value) => written.push(value), stdout: (value) => messages.push(value) });
  assert.equal(code, 0);
  assert.deepEqual(written, [{ enabled: false, apiUrl: '' }]);
  assert.match(messages[0], /비활성화/);
});
