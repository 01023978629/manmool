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

test('공개 전환 스크립트는 명시 허용목록과 artifact에 정확히 한 번, byte-exact로 존재한다', () => {
  buildPagesArtifact(tempRoot, artifactRoot);
  for (const name of ['revenue-conversion.js', 'office-pilot.js']) {
    const relative = `js/${name}`;
    assert.equal(policy.PUBLIC_JS_FILES.filter(item => item === name).length, 1);
    const expected = policy.expectedPublicFiles(ROOT).filter(item => item.relative === relative);
    assert.equal(expected.length, 1);
    assert.equal(expected[0].source, path.join(ROOT, 'js', name));
    const sourceBytes = fs.readFileSync(path.join(tempRoot, 'js', name));
    const artifactBytes = fs.readFileSync(path.join(artifactRoot, 'js', name));
    assert.equal(Buffer.compare(artifactBytes, sourceBytes), 0);
  }
  assert.deepEqual(verifyPagesArtifact(tempRoot, artifactRoot), []);
});

test('공개 사례의 모든 동영상·poster는 허용목록에서 산출물까지 원본 바이트를 보존한다', () => {
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
  const media = site.insights.filter((post) => post.published !== false)
    .flatMap((post) => (post.body || []).flatMap((section) => section.video
      ? [section.video, section.videoPoster].filter(Boolean) : []));
  assert.ok(media.length > 0, '공개 동영상 회귀 대상을 찾지 못했습니다');
  buildPagesArtifact(tempRoot, artifactRoot);
  const expected = new Set(policy.expectedPublicFiles(tempRoot).map(({ relative }) => relative));
  for (const relative of new Set(media)) {
    assert.ok(expected.has(relative), `media missing from allowlist: ${relative}`);
    assert.deepEqual(fs.readFileSync(path.join(artifactRoot, relative)), fs.readFileSync(path.join(tempRoot, relative)));
  }
  assert.deepEqual(verifyPagesArtifact(tempRoot, artifactRoot), []);
});

function withReferencePage(markup, check) {
  const relative = 'posts/media-reference-check.html';
  // 양쪽 HTML을 같게 바꿔 hash 불일치가 아닌 실제 참조 검사만으로 누락을 잡게 한다.
  write(relative, markup);
  write(`_site/${relative}`, markup);
  try {
    check(verifyPagesArtifact(tempRoot, artifactRoot));
  } finally {
    fs.rmSync(path.join(tempRoot, relative));
    fs.rmSync(path.join(artifactRoot, relative));
  }
}

test('사례 미디어와 링크는 상대·프로젝트 루트·같은 호스트 URL을 해석하고 외부 URL은 제외한다', () => {
  buildPagesArtifact(tempRoot, artifactRoot);
  withReferencePage(`
    <video poster = "../assets/cases/pyeonghaneul-leak-video-4-poster.jpg">
      <source src = "/manmool/assets/cases/pyeonghaneul-leak-video-4.mp4?rev=1&amp;view=full#play">
    </video>
    <img srcset="../assets/cases/resized/pyeonghaneul-leak-cover-480w.jpg 480w,
      https://01023978629.github.io/manmool/assets/cases/resized/pyeonghaneul-leak-cover-960w.jpg 960w">
    <img srcset="data:image/gif;base64,R0lGODlhAQABAAAAACw= 1x, ../assets/cases/pyeonghaneul-leak-cover.jpg 2x">
    <a href = /manmool/blog.html>목록</a>
    <a href="//01023978629.github.io/manmool/%62log.html?q=누수#list">인코딩된 목록</a>
    <a href="https://01023978629.github.io/manmool/">홈</a>
    <a href="/manmool">홈 리디렉션</a>
    <a href="https://01023978629.github.io/hyeonjang/">현장 앱</a>
    <a href="/hyeonjang/">현장 앱</a>
    <img src="https://example.invalid/external-image.jpg">
    <a href="mailto:example@example.invalid">메일</a>
    <!-- <img src="../assets/commented-out.jpg"> -->
  `, (failures) => assert.deepEqual(failures, []));
});

test('poster·srcset·source와 프로젝트 내부 절대 링크의 누락을 각각 배포 전에 보고한다', () => {
  buildPagesArtifact(tempRoot, artifactRoot);
  const cases = [
    ['../assets/cases/missing-poster.jpg', '<video poster = "../assets/cases/missing-poster.jpg"></video>'],
    ['../assets/cases/missing-large.jpg', '<img SRCSET="../assets/cases/pyeonghaneul-leak-cover.jpg 1x, ../assets/cases/missing-large.jpg 2x">'],
    ['../assets/cases/missing-video.mp4', '<video><source src="../assets/cases/missing-video.mp4"></video>'],
    ['/manmool/posts/missing-root.html', '<a href="/manmool/posts/missing-root.html">사례</a>'],
    ['https://01023978629.github.io/manmool/posts/missing-absolute.html', '<a href="https://01023978629.github.io/manmool/posts/missing-absolute.html">사례</a>'],
    ['//01023978629.github.io/manmool/assets/cases/missing-protocol.jpg', '<video poster="//01023978629.github.io/manmool/assets/cases/missing-protocol.jpg"></video>'],
    ['missing-entity.html', '<a href="missing&#45;entity.html">사례</a>'],
    ['../../outside.html', '<a href="../../outside.html">잘못된 상대 경로</a>'],
  ];
  withReferencePage(cases.map(([, markup]) => markup).join('\n'), (failures) => {
    assert.equal(failures.length, cases.length, failures.join('\n'));
    for (const [ref] of cases) assert.ok(failures.some((message) => message.endsWith(` -> ${ref}`)), `누락을 놓침: ${ref}`);
  });
});

test('잘못 인코딩된 URI도 예외로 검사를 중단하지 않고 다른 누락과 함께 보고한다', () => {
  buildPagesArtifact(tempRoot, artifactRoot);
  withReferencePage('<video poster="../assets/cases/bad%ZZ.jpg"></video><source src="../assets/cases/missing-after-invalid.mp4">', (failures) => {
    assert.equal(failures.length, 2, failures.join('\n'));
    assert.ok(failures.some((message) => /해석할 수 없는 링크 URL.*bad%ZZ/.test(message)));
    assert.ok(failures.some((message) => /끊긴 링크.*missing-after-invalid/.test(message)));
  });
});

test('poster가 소스와 산출물 양쪽에서 빠져도 남은 공개 사례 참조로 누락을 검출한다', () => {
  buildPagesArtifact(tempRoot, artifactRoot);
  const relative = 'assets/cases/pyeonghaneul-leak-video-4-poster.jpg';
  const source = path.join(tempRoot, relative);
  const output = path.join(artifactRoot, relative);
  const bytes = fs.readFileSync(source);
  fs.rmSync(source);
  fs.rmSync(output);
  try {
    const failures = verifyPagesArtifact(tempRoot, artifactRoot);
    assert.ok(failures.some((message) => /끊긴 링크/.test(message) && message.endsWith(` -> ../${relative}`)), failures.join('\n'));
    assert.equal(failures.some((message) => /필수 공개 산출물 누락|신선한 빌드/.test(message)), false);
  } finally {
    fs.writeFileSync(source, bytes);
    fs.writeFileSync(output, bytes);
  }
});
