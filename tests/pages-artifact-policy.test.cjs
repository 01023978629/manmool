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

test('공개 경로는 테스트 구조·명명된 command/shell history만 거절하고 output에 남기지 않는다', () => {
  for (const relative of [
    'test-fixture.html', 'css/test-fixture.css', 'posts/command-history.html',
    'assets/test/normal.jpg', 'assets/nested/__fixtures__/normal.jpg',
    'posts/example.fixture.html', 'posts/.bash_history', 'posts/ConsoleHost_history.txt',
    'assets/test-fixture/image.jpg', 'posts/command-history/page.html', 'assets/cases/fixture-test.jpg',
  ]) {
    assert.throws(() => policy.assertAllowedPublicPath(relative), /금지/);
  }
  buildPagesArtifact(tempRoot, artifactRoot);
  for (const relative of [
    'css/test-fixture.css',
    'posts/command-history.html',
    'assets/nested/test-fixture.jpg',
    'posts/nested/command-history.html',
    'assets/test/normal.jpg',
    'posts/nested/__fixtures__/normal.html',
    'assets/test-fixture/image.jpg',
    'posts/command-history/page.html',
    'assets/cases/fixture-test.jpg',
  ]) {
    write(relative, 'mutation');
    assert.throws(() => buildPagesArtifact(tempRoot, artifactRoot), /금지/);
    assert.equal(fs.existsSync(path.join(artifactRoot, ...relative.split('/'))), false);
    fs.rmSync(path.join(tempRoot, ...relative.split('/')));
    if (relative.startsWith('assets/test/')) fs.rmSync(path.join(tempRoot, 'assets', 'test'), { recursive: true, force: true });
    if (relative.startsWith('assets/test-fixture/')) fs.rmSync(path.join(tempRoot, 'assets', 'test-fixture'), { recursive: true, force: true });
    if (relative.startsWith('assets/nested/')) fs.rmSync(path.join(tempRoot, 'assets', 'nested'), { recursive: true, force: true });
    if (relative.startsWith('posts/nested/')) fs.rmSync(path.join(tempRoot, 'posts', 'nested'), { recursive: true, force: true });
    if (relative.startsWith('posts/command-history/')) fs.rmSync(path.join(tempRoot, 'posts', 'command-history'), { recursive: true, force: true });
  }
});

test('기존 bathroom-fixtures 공개 URL·이미지는 허용되고 source와 artifact에 정확히 존재한다', () => {
  const post = 'posts/daejayeon-bathroom-fixtures.html';
  const cover = 'assets/cases/daejayeon-bathroom-fixtures-cover.jpg';
  const image = 'assets/cases/daejayeon-bathroom-fixtures-1.jpg';
  for (const relative of [post, cover, image]) assert.doesNotThrow(() => policy.assertAllowedPublicPath(relative));
  assert.doesNotThrow(() => policy.assertAllowedPublicPath('posts/company-history.html'));
  for (const relative of [post, cover, image]) assert.equal(fs.existsSync(path.join(ROOT, ...relative.split('/'))), true, `missing source: ${relative}`);
  const rss = fs.readFileSync(path.join(ROOT, 'rss.xml'), 'utf8');
  assert.match(rss, /<guid isPermaLink="true">https:\/\/01023978629\.github\.io\/manmool\/posts\/daejayeon-bathroom-fixtures\.html<\/guid>/);
  assert.doesNotMatch(rss, /daejayeon-bathroom-install/);
  buildPagesArtifact(tempRoot, artifactRoot);
  for (const relative of [post, cover, image]) assert.equal(fs.existsSync(path.join(artifactRoot, ...relative.split('/'))), true, `missing artifact: ${relative}`);
  assert.equal(fs.existsSync(path.join(artifactRoot, 'posts', 'daejayeon-bathroom-install.html')), false);
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
