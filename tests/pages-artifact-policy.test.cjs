const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const policyPath = path.join(ROOT, 'scripts', 'pages-artifact-policy.mjs');
const buildPath = path.join(ROOT, 'scripts', 'build-pages-artifact.mjs');
const ensurePath = path.join(ROOT, 'scripts', 'ensure-pages-artifact.mjs');
let tempRoot;
let artifactRoot;
let policy;
let buildPagesArtifact;
let verifyPagesArtifact;
let scanArtifactText;

function write(relative, content = '') {
  const target = path.join(tempRoot, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

before(async () => {
  [policy, { buildPagesArtifact }, { verifyPagesArtifact, scanArtifactText }] = await Promise.all([
    import(`${pathToFileURL(policyPath).href}?test=${Date.now()}`),
    import(`${pathToFileURL(buildPath).href}?test=${Date.now()}`),
    import(`${pathToFileURL(ensurePath).href}?test=${Date.now()}`),
  ]);
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-artifact-source-'));
  artifactRoot = path.join(tempRoot, '_site');
  for (const { source, relative } of policy.expectedPublicFiles(ROOT)) {
    const target = path.join(tempRoot, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
});

after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

test('모든 공개 경로 후보는 root·css·posts·assets의 test/fixture/history 토큰을 거절하고 output에 남기지 않는다', () => {
  for (const relative of ['test-fixture.html', 'css/test-fixture.css', 'posts/command-history.html', 'assets/nested/fixture-image.jpg']) {
    assert.throws(() => policy.assertAllowedPublicPath(relative), /금지/);
  }
  buildPagesArtifact(tempRoot, artifactRoot);
  for (const relative of [
    'css/test-fixture.css',
    'posts/command-history.html',
    'assets/nested/test-fixture.jpg',
    'posts/nested/command-history.html',
  ]) {
    write(relative, 'mutation');
    assert.throws(() => buildPagesArtifact(tempRoot, artifactRoot), /금지/);
    assert.equal(fs.existsSync(path.join(artifactRoot, ...relative.split('/'))), false);
    fs.rmSync(path.join(tempRoot, ...relative.split('/')));
  }
});

test('scanner는 Windows 경로를 정규화하고 hash 비교 없이 모든 PIN·세션·연락처·비밀 marker를 직접 거절한다', () => {
  const markers = ['123456', 'session-allowlist-test', 'session-workflow', '010-1234-5678', '010-9999-8888', '김소장', '홍길동', '대표 내부 메모', 'APP_TOKEN', 'OFFICE_SESSION_SECRET', 'pinHash', 'pinSalt'];
  for (const marker of markers) {
    const sourceErrors = scanArtifactText('js\\office-request.js', marker);
    const outputErrors = scanArtifactText('js/office-request.js', marker);
    assert.equal(sourceErrors.length > 0, true, `source marker missed: ${marker}`);
    assert.equal(outputErrors.length > 0, true, `output marker missed: ${marker}`);
  }
});

test('isolated artifact 검증은 stale output-only 파일을 거절하고 source/output이 정확히 같을 때만 통과한다', () => {
  buildPagesArtifact(tempRoot, artifactRoot);
  assert.deepEqual(verifyPagesArtifact(tempRoot, artifactRoot), []);
  write('_site/js/stale-extra.js', 'stale');
  const failures = verifyPagesArtifact(tempRoot, artifactRoot);
  assert.equal(failures.some((item) => /output-only/.test(item)), true);
});
