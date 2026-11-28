#!/usr/bin/env node
/* 공개 직전 머리 확인이 살아 있는지 검사한다 (2026-11-28).
 *
 * 막으려는 사고: 11/28 PR #231(7194e19)·#242(32013b7)가 6초 사이에 병합됐는데 GitHub 이 두 push 의 배포 실행을 10분 늦게, 거꾸로(32013b7 먼저)
 * 만들었다. 'pages' 묶음은 만들어진 순서대로 하나씩 돌리므로 32013b7 이 먼저 공개되고(10:45), 기다리던 7194e19 실행이 그 뒤 옛 트리를 덮어
 * 공개했다(11:01) — #242 내용이 수동 실행 전까지 사이트에서 빠졌다. 이제 공개 직전에 이 커밋이 아직 main 머리인지 보고(scripts/pages-head-guard.mjs),
 * 넘어갔으면 산출물 올리기와 deploy job 을 건너뛴다.
 *
 *  ① 판단 — 머리 그대로면 공개 · 넘어갔으면 건너뜀(로그 'main moved on to <sha> — newer run will publish') · 머리·커밋을 모르면 예전처럼 공개
 *  ② 머리 읽기 — API commits/main 세 번(사이에 쉼) → 안 되면 git ls-remote → 둘 다 안 되면 모름 · 엉뚱한 답(짧은 값·다른 ref)은 믿지 않음 · 던지지 않음
 *  ③ 실제 명령 — 127.0.0.1 가짜 API + 임시 저장소(origin = 로컬 bare): 출력 publish/head · Bearer 토큰 · API 꺼지면 ls-remote · 둘 다 안 되면 공개 · 늘 0
 *  ④ 워크플로 — main 배포는 'pages' 묶음·끊지 않음(cancel-in-progress 를 켜면 오히려 옛 커밋이 남고 공개 중인 실행도 끊긴다) · push main · workflow_dispatch ·
 *     머리 확인(id: head)은 마지막 화면 검사 뒤 · 산출물 올리기 바로 앞 · main 배포 실행에서만(조건 그대로) · continue-on-error 없음 ·
 *     이름에 'Deploy to GitHub Pages' 없음(카톡봇은 그 이름의 실패를 GitHub 쪽 실패로 본다) · verify outputs.publish ·
 *     올리기는 steps.head.outputs.publish != 'false', deploy job 은 needs.verify.outputs.publish != 'false'('true' 와 같다고 쓰면 확인 못 할 때 공개가 빠진다)
 *  변이(MUT)를 이 파일 안에서 같은 검사로 돌려 전부 잡히는지 확인한다(①② 는 스크립트 사본을 바꿔 불러 보고, ④ 는 워크플로 글을 바꿔 본다).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nl = (s) => s.replace(/\r\n/g, '\n');
const SRC = {
  script: nl(fs.readFileSync(path.join(ROOT, 'scripts/pages-head-guard.mjs'), 'utf8')),
  workflow: nl(fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-pages.yml'), 'utf8')),
};
const MAIN_RUN = "github.event_name != 'pull_request' && github.ref == 'refs/heads/main'";
const MUT = {
  // ① 판단
  'always-publish': ["  return { publish: false, head: top, level: 'notice',", "  return { publish: true, head: top, level: 'notice',"],
  'unknown-skips': ["if (!SHA_RE.test(top)) return { publish: true, head: '', level: 'warning'", "if (!SHA_RE.test(top)) return { publish: false, head: '', level: 'warning'"],
  'no-log-line': ["why: 'main moved on to ' + top + ' — newer run will publish", "why: '새 커밋이 있음 ' + top + ' — newer run will publish"],
  // ② 머리 읽기
  'no-retry': ['for (let i = 1; i <= tries; i++) {', 'for (let i = 1; i <= 1; i++) {'],
  'no-git-fallback': ["if (m) return { head: m[1], via: 'git' };", "if (m) return { head: '', via: '' };"],
  'loose-ref': ['refs\\/heads\\/main\\s*$/m.exec', 'refs\\/heads\\/main/m.exec'],
  'throw-through': ['} catch (_) { /* 한 번 더 */ }', '} catch (e) { throw e; }'],
  // ④ 워크플로
  'guard-removed': ['        run: node scripts/pages-head-guard.mjs "$GITHUB_OUTPUT"', '        run: echo publish=true >> "$GITHUB_OUTPUT"'],
  'guard-wrong-if': ["        id: head\n        if: " + MAIN_RUN, "        id: head\n        if: github.event_name == 'pull_request'"],
  'guard-continue': ['        id: head\n', '        id: head\n        continue-on-error: true\n'],
  'guard-named-deploy': ['      - name: Check this commit is still the head of main', '      - name: Check before Deploy to GitHub Pages'],
  'step-between': ['      - name: Upload site artifact', '      - name: Something else\n        run: "true"\n\n      - name: Upload site artifact'],
  'no-output': ['      publish: ${{ steps.head.outputs.publish }}', '      other: ${{ steps.head.outputs.publish }}'],
  'upload-unguarded': ["if: " + MAIN_RUN + " && steps.head.outputs.publish != 'false'", 'if: ' + MAIN_RUN],
  'upload-fail-closed': ["&& steps.head.outputs.publish != 'false'", "&& steps.head.outputs.publish == 'true'"],
  'deploy-unguarded': ["if: " + MAIN_RUN + " && needs.verify.outputs.publish != 'false'", 'if: ' + MAIN_RUN],
  'cancel-main': ["  cancel-in-progress: ${{ !(" + MAIN_RUN + ') }}', '  cancel-in-progress: true'],
  'no-dispatch': ['  workflow_dispatch:\n', '\n'],
};
const WF_MUT = new Set(Object.keys(MUT).filter((k) => /^(guard-|step-|no-output|upload-|deploy-|cancel-|no-dispatch)/.test(k)));
const REPO = '01023978629/manmool', A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-phg-'));
const pass = [];
const fail = [];

async function load(text, tag) {
  const file = path.join(TMP, 'pages-head-guard-' + tag + '.mjs');
  fs.writeFileSync(file, text);
  return import(pathToFileURL(file).href);
}

function checkDecide({ decidePublish }) {
  let r = decidePublish({ sha: A, head: A });
  assert.deepEqual([r.publish, r.head, r.level], [true, A, 'notice'], '머리 그대로면 공개');
  r = decidePublish({ sha: A, head: B });
  assert.deepEqual([r.publish, r.head], [false, B], 'main 이 넘어갔으면 건너뜀');
  assert.ok(r.why.includes('main moved on to ' + B + ' — newer run will publish'), '로그: ' + r.why);
  for (const head of ['', null, undefined, 'abc', B.toUpperCase(), B + 'x', ' ' + B]) {
    r = decidePublish({ sha: A, head });
    assert.deepEqual([r.publish, r.head, r.level], [true, '', 'warning'], '머리를 모르면 예전처럼 공개: ' + JSON.stringify(head));
  }
  for (const sha of ['', undefined, 'abc']) assert.equal(decidePublish({ sha, head: B }).publish, true, '이 실행의 커밋을 모르면 공개: ' + JSON.stringify(sha));
}

async function checkRead({ readMainHead }) {
  const fake = (answers) => { const calls = []; return { calls, api: async (p) => { calls.push(p); const a = answers.shift(); if (a instanceof Error) throw a; return a; } }; };
  let pauses = 0; const pause = async () => { pauses++; };
  const noGit = () => { throw new Error('ls-remote 를 부르면 안 됨'); };
  let f = fake([{ sha: B }]);
  assert.deepEqual(await readMainHead({ repo: REPO, api: f.api, lsRemote: noGit, pause }), { head: B, via: 'api' });
  assert.deepEqual(f.calls, ['repos/' + REPO + '/commits/main']);
  pauses = 0; f = fake([new Error('502'), { sha: 'abc' }, { sha: C }]);
  assert.deepEqual(await readMainHead({ repo: REPO, api: f.api, lsRemote: noGit, pause }), { head: C, via: 'api' }, '세 번째에 읽힘');
  assert.deepEqual([f.calls.length, pauses], [3, 2], '두 번 쉬고 세 번 물음');
  pauses = 0; f = fake([new Error('502'), new Error('502'), {}]);
  assert.deepEqual(await readMainHead({ repo: REPO, api: f.api, lsRemote: () => 'x\n' + C + '\trefs/heads/main\n', pause }), { head: C, via: 'git' }, 'API 가 안 되면 ls-remote');
  assert.equal(pauses, 2);
  f = fake([]);
  assert.deepEqual(await readMainHead({ repo: 'not a repo', api: f.api, lsRemote: () => B + '\trefs/heads/main', pause }), { head: B, via: 'git' }, '저장소 이름이 이상하면 API 는 묻지 않음');
  assert.deepEqual(f.calls, []);
  const bad = [() => C + '\trefs/heads/main-old\n' + C + '\trefs/tags/main\n', () => 'abc\trefs/heads/main\n', () => '', () => { throw new Error('no origin'); }];
  for (const lsRemote of bad) {
    assert.deepEqual(await readMainHead({ repo: REPO, api: fake([new Error('x'), new Error('x'), new Error('x')]).api, lsRemote, pause }), { head: '', via: '' }, '엉뚱한 ref·실패는 모름: ' + lsRemote);
  }
}

function checkWorkflow(text) {
  const p = [];
  const vAt = text.indexOf('\n  verify:\n'), dAt = text.indexOf('\n  deploy:\n');
  if (vAt < 0 || dAt < vAt) return ['④ verify·deploy job 을 못 찾음'];
  const verify = text.slice(vAt, dAt), deploy = text.slice(dAt);
  const steps = (job) => job.split(/\n(?=      - name: )/).slice(1).map((t) => ({ name: /- name: (.*)/.exec(t)[1].trim(), text: t }));
  const vs = steps(verify), ds = steps(deploy);
  const ifOf = (t) => ((/\n {8}if: (.*)/.exec(t) || [])[1] || '').trim();
  if (!text.includes("\n  group: ${{ (" + MAIN_RUN + ") && 'pages' ||") || !text.includes('\n  cancel-in-progress: ${{ !(' + MAIN_RUN + ') }}\n')) {
    p.push("④ main 배포는 'pages' 묶음 · cancel-in-progress 꺼짐");
  }
  if (!/\non:\n {2}push:\n {4}branches:\n {6}- main\n/.test(text) || !/\n {2}workflow_dispatch:\n/.test(text)) p.push('④ push main · workflow_dispatch');
  if (!/\n {4}outputs:\n(?: {6}#.*\n)* {6}publish: \$\{\{ steps\.head\.outputs\.publish \}\}\n/.test(verify)) p.push('④ verify outputs.publish = steps.head.outputs.publish');
  const iGuard = vs.findIndex((s) => /\n {8}id: head\n/.test(s.text + '\n'));
  const iLast = vs.findIndex((s) => s.name === 'Verify service navigation and responsive layouts');
  const iArtifact = vs.findIndex((s) => s.name === 'Verify public artifact');
  const iUp = vs.findIndex((s) => s.name === 'Upload site artifact');
  if ([iGuard, iLast, iArtifact, iUp].some((i) => i < 0)) return p.concat('④ 단계를 못 찾음: ' + JSON.stringify(vs.map((s) => s.name)));
  if (!(iArtifact < iGuard && iLast < iGuard && iGuard + 1 === iUp && iUp === vs.length - 1)) p.push('④ 순서: 검사 → 머리 확인 → 산출물 올리기(verify 끝)');
  const g = vs[iGuard];
  if (/deploy to github pages/i.test(g.name)) p.push("④ 머리 확인 단계 이름에 'Deploy to GitHub Pages' 가 있다");
  if (ifOf(g.text) !== MAIN_RUN) p.push('④ 머리 확인은 main 배포 실행(push·수동 실행)에서만 — 조건은 산출물과 같은 main 조건 그대로');
  if (/\n {8}continue-on-error:/.test(g.text)) p.push('④ 머리 확인에 continue-on-error 없음(스크립트가 실패로 끝나지 않는다)');
  if (!/\n {8}run: node scripts\/pages-head-guard\.mjs "\$GITHUB_OUTPUT"\n/.test(g.text + '\n')) p.push('④ 머리 확인은 scripts/pages-head-guard.mjs "$GITHUB_OUTPUT"');
  if (!/\n {10}GH_TOKEN: \$\{\{ github\.token \}\}/.test(g.text)) p.push('④ 머리 확인에 GH_TOKEN');
  if (ifOf(vs[iUp].text) !== MAIN_RUN + " && steps.head.outputs.publish != 'false'") p.push("④ 산출물 올리기 조건 = main 조건 && steps.head.outputs.publish != 'false'");
  if (!/\n {4}needs: verify\n/.test(deploy) || ((/\n {4}if: (.*)/.exec(deploy) || [])[1] || '').trim() !== MAIN_RUN + " && needs.verify.outputs.publish != 'false'") {
    p.push("④ deploy job 조건 = needs: verify · main 조건 && needs.verify.outputs.publish != 'false'");
  }
  const dep = ds.find((s) => s.name === 'Deploy to GitHub Pages');
  if (!dep || !/\n {8}id: deployment\n/.test(dep.text) || ifOf(dep.text)) p.push('④ deploy job 의 Deploy to GitHub Pages(id: deployment) 는 그대로(job 조건만)');
  return p;
}

async function step(label, fn) {
  try { await fn(); pass.push(label); } catch (error) { fail.push(label + ' — ' + String(error && error.message || error).split('\n')[0].slice(0, 200)); }
}

try {
  const real = await load(SRC.script, 'real');
  await step('① 판단 — 머리 그대로면 공개 · 넘어갔으면 건너뜀 · 모르면 예전처럼 공개', () => checkDecide(real));
  await step('② 머리 읽기 — API 세 번 → git ls-remote → 모름 · 엉뚱한 답은 믿지 않음', () => checkRead(real));

  await step('③ 실제 명령 — 가짜 API · 임시 저장소 · 출력 publish/head · 늘 0', async () => {
    const bare = path.join(TMP, 'origin.git'), work = path.join(TMP, 'work'), plain = path.join(TMP, 'plain');
    const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    fs.mkdirSync(work); fs.mkdirSync(plain);
    g(TMP, 'init', '-q', '--bare', bare); g(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    g(work, 'init', '-q'); g(work, 'config', 'user.email', 't@example.invalid'); g(work, 'config', 'user.name', 't'); g(work, 'checkout', '-q', '-b', 'main');
    fs.writeFileSync(path.join(work, 'index.html'), 'v1\n'); g(work, 'add', '.'); g(work, 'commit', '-q', '-m', 'A');
    g(work, 'remote', 'add', 'origin', bare); g(work, 'push', '-q', 'origin', 'main');
    const M = g(work, 'rev-parse', 'HEAD');
    let head = A;
    const seen = [];
    const server = http.createServer((req, res) => {
      seen.push([req.url, req.headers.authorization || '']);
      const ok = req.url === '/repos/' + REPO + '/commits/main';
      res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' }); res.end(JSON.stringify(ok ? { sha: head } : {}));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    // 가짜 서버가 같은 프로세스에 있으니 자식은 비동기로 띄운다(spawnSync 는 서버를 멈춘다)
    const cli = ({ sha, apiBase = base, cwd = work, token = '' }) => new Promise((resolve) => {
      const out = path.join(TMP, 'out-' + Math.random().toString(36).slice(2));
      const env = { ...process.env, GITHUB_REPOSITORY: REPO, GITHUB_SHA: sha, GH_TOKEN: token, PAGES_HEAD_GUARD_API_BASE: apiBase, PAGES_HEAD_GUARD_TRIES: '1', GIT_TERMINAL_PROMPT: '0' };
      if (cwd === plain) env.GIT_DIR = path.join(plain, 'no-such-git');   // 저장소 밖(위 폴더가 우연히 저장소여도)
      const c = spawn(process.execPath, [path.join(TMP, 'pages-head-guard-real.mjs'), out], { cwd, env });
      let log = ''; c.stdout.on('data', (b) => { log += b; }); c.stderr.on('data', (b) => { log += b; });
      c.on('close', (status) => resolve({ status, out: fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '', log }));
    });
    try {
      let r = await cli({ sha: A, token: 't0k' });
      assert.deepEqual([r.status, r.out], [0, 'publish=true\nhead=' + A + '\n'], '머리 그대로: ' + r.log);
      assert.match(r.log, /::notice::main 머리 그대로/);
      assert.deepEqual(seen[0], ['/repos/' + REPO + '/commits/main', 'Bearer t0k'], '토큰은 Bearer 로');
      head = B;
      r = await cli({ sha: A });
      assert.deepEqual([r.status, r.out], [0, 'publish=false\nhead=' + B + '\n'], 'main 이 넘어감: ' + r.log);
      assert.ok(r.log.includes('::notice::main moved on to ' + B + ' — newer run will publish'), r.log);
      r = await cli({ sha: M, apiBase: 'http://127.0.0.1:9' });
      assert.deepEqual([r.status, r.out], [0, 'publish=true\nhead=' + M + '\n'], 'API 가 안 되면 git ls-remote(머리 그대로): ' + r.log);
      assert.match(r.log, /git ls-remote/);
      r = await cli({ sha: A, apiBase: 'http://127.0.0.1:9' });
      assert.deepEqual([r.status, r.out], [0, 'publish=false\nhead=' + M + '\n'], 'API 가 안 되면 git ls-remote(넘어감): ' + r.log);
      r = await cli({ sha: A, apiBase: 'http://127.0.0.1:9', cwd: plain });
      assert.deepEqual([r.status, r.out], [0, 'publish=true\nhead=\n'], '둘 다 안 되면 예전처럼 공개(그래도 0): ' + r.log);
      assert.match(r.log, /::warning::main 머리를 못 읽음/);
    } finally { server.close(); }
  });

  await step("④ 워크플로 — 'pages'·끊지 않음 · 검사 뒤 올리기 바로 앞 · main 배포에서만 · 올리기·deploy job 은 publish != 'false'", () => {
    const now = checkWorkflow(SRC.workflow);
    assert.deepEqual(now, [], now.join(' · '));
  });

  await step('⑤ 변이 — ①②④ 가 ' + Object.keys(MUT).length + '종을 모두 잡음', async () => {
    for (const [name, [from, to]] of Object.entries(MUT)) {
      const key = WF_MUT.has(name) ? 'workflow' : 'script';
      assert.equal(SRC[key].split(from).length, 2, 'mutation anchor ' + name);
      const text = SRC[key].replace(from, () => to);
      let caught = false;
      if (key === 'workflow') caught = checkWorkflow(text).length > 0;
      else {
        const mod = await load(text, 'mut-' + name);
        try { checkDecide(mod); await checkRead(mod); } catch { caught = true; }
      }
      assert.ok(caught, '변이 ' + name + ' 를 못 잡음');
    }
  });
} finally {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* 임시 폴더 */ }
}

if (fail.length) {
  console.error(`✗ 공개 직전 머리 확인 ${fail.length}건 깨짐\n`);
  for (const item of fail) console.error(`  - ${item}`);
  process.exit(1);
}
console.log(`✓ 공개 직전 머리 확인 ${pass.length}개 항목 정상`);
