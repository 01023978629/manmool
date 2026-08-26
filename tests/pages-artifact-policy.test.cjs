const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const node = process.execPath;
const build = path.join(ROOT, 'scripts', 'build-pages-artifact.mjs');
const ensure = path.join(ROOT, 'scripts', 'ensure-pages-artifact.mjs');
const fixtureSource = path.join(ROOT, 'js', 'test-fixture.js');

function run(script) {
  return childProcess.spawnSync(node, [script], { cwd: ROOT, encoding: 'utf8' });
}

function buildAndEnsure() {
  let failure = '';
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const buildResult = run(build);
    assert.equal(buildResult.status, 0, buildResult.stderr);
    const ensureResult = run(ensure);
    if (ensureResult.status === 0) return;
    failure = ensureResult.stderr;
  }
  assert.fail(failure);
}

afterEach(() => {
  fs.rmSync(fixtureSource, { force: true });
  const result = run(build);
  assert.equal(result.status, 0, result.stderr);
});

test('Pages 검증은 정규화된 중첩 포털 JS fixture와 상단 PIN·세션 fixture를 거절한다', () => {
  buildAndEnsure();
  fs.appendFileSync(path.join(ROOT, '_site', 'js', 'office-request.js'), '\n// session-workflow\n', 'utf8');
  let result = run(ensure);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /office-request\.js/);
  buildAndEnsure();
  fs.writeFileSync(path.join(ROOT, '_site', 'office-api.json'), '{"enabled":false,"apiUrl":"123456 session-allowlist-test"}\n', 'utf8');
  result = run(ensure);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fixture|비밀 식별자|신선한 빌드/i);
  buildAndEnsure();
  fs.writeFileSync(path.join(ROOT, '_site', 'js', 'stale-extra.js'), 'stale output', 'utf8');
  result = run(ensure);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /허용목록|산출물.*다름|예상/i);
  buildAndEnsure();
  fs.writeFileSync(fixtureSource, 'window.__testFixture = true;\n', 'utf8');
  result = run(build);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JS|허용|fixture/i);
  result = run(ensure);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JS|허용|fixture/i);
});
