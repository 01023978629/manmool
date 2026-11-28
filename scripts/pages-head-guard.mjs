#!/usr/bin/env node
/* 공개 직전 — 이 실행의 커밋이 아직 main 의 머리인가 (2026-11-28, 옛 커밋이 새 커밋 위에 덮어 공개된 일)

   왜: 11/28 PR #231(병합 7194e19)·#242(병합 32013b7 — 둘 다 든 main 머리)가 6초 사이에 병합됐다. GitHub 이 두 push 의 배포 실행을
   10분쯤 늦게, 그것도 거꾸로(32013b7 실행 10:29:38 → 7194e19 실행 10:30:04) 만들었다. 'pages' 묶음(concurrency)은 실행이 만들어진 순서대로
   하나씩 돌리므로 새 커밋이 먼저 공개(10:45)되고, 기다리던 옛 커밋 실행이 그 뒤에 검사를 마치고 옛 트리를 덮어 공개(11:01)했다 — #242 내용이
   수동 실행(workflow_dispatch) 전까지 사이트에서 빠졌다(run 46135424711 · 46135456988). 현장웹(hyeonjang)도 같은 묶음이라 같은 수정을 했다.
   cancel-in-progress 로는 못 막는다 — 나중에 만들어진 실행(이번에는 옛 커밋)이 먼저 것(새 커밋)을 끊으므로 오히려 옛 커밋만 남고, 공개 중인 실행까지 끊긴다.

   하는 일: main 의 지금 머리(GitHub API commits/main — 세 번 해 보고 안 되면 git ls-remote)를 이 실행의 커밋(GITHUB_SHA)과 견준다.
     같으면 publish=true(공개). 다르면 publish=false — main 이 더 새 커밋으로 넘어갔으니 그 커밋의 실행이 새 트리(이 커밋이 이미 들어 있음)를 공개한다.
     그래서 main 이 한 번 넘어간 커밋은 다시 공개되지 않는다 — 사이트가 뒤로 가지 않는다.
     머리를 끝내 못 읽으면 publish=true(예전처럼 공개) — 확인이 안 된다고 최신 커밋의 공개를 조용히 빠뜨리지 않는다.
   수동 실행(workflow_dispatch, main)은 그때의 main 머리를 돌리므로 그대로 공개된다.
   이 스크립트는 실패로 끝나지 않는다(늘 0) — 공개를 건너뛴 실행은 'success' 로 끝나고 산출물 올리기와 deploy job 만 skipped.

   쓰임(deploy-pages.yml): node scripts/pages-head-guard.mjs "$GITHUB_OUTPUT"   환경: GITHUB_REPOSITORY · GITHUB_SHA · GH_TOKEN
   출력: publish=true|false · head=<main 머리, 모르면 빈칸>. 검사: scripts/ensure-pages-head-guard.mjs(CI 의 ensure 반복이 돈다) */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/* 순수 판단 — 던지지 않는다. 돌려줌 {publish, head, why, level(notice|warning)} */
export function decidePublish({ sha, head }) {
  const mine = String(sha || ''), top = String(head || '');
  if (!SHA_RE.test(mine)) return { publish: true, head: SHA_RE.test(top) ? top : '', level: 'warning', why: '이 실행의 커밋을 모름 — 예전처럼 공개한다' };
  if (!SHA_RE.test(top)) return { publish: true, head: '', level: 'warning', why: 'main 머리를 못 읽음 — 예전처럼 공개한다' };
  if (top === mine) return { publish: true, head: top, level: 'notice', why: 'main 머리 그대로(' + top + ') — 공개한다' };
  return { publish: false, head: top, level: 'notice',
    why: 'main moved on to ' + top + ' — newer run will publish (이 실행의 커밋 ' + mine + ' 는 그 트리에 이미 들어 있어 공개를 건너뛴다)' };
}

/* main 머리 읽기 — api(경로) 는 GitHub REST JSON, lsRemote() 는 'git ls-remote origin refs/heads/main' 출력(시험은 가짜). 돌려줌 {head, via} */
export async function readMainHead({ repo, api, lsRemote, tries = 3, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (REPO_RE.test(String(repo || ''))) {
    for (let i = 1; i <= tries; i++) {
      try {
        const commit = await api('repos/' + repo + '/commits/main');
        const sha = String(commit && commit.sha || '');
        if (SHA_RE.test(sha)) return { head: sha, via: 'api' };
      } catch (_) { /* 한 번 더 */ }
      if (i < tries) await pause(3000);
    }
  }
  try {
    const m = /^([0-9a-f]{40})\s+refs\/heads\/main\s*$/m.exec(String(lsRemote() || ''));
    if (m) return { head: m[1], via: 'git' };
  } catch (_) { /* 둘 다 안 되면 모름 */ }
  return { head: '', via: '' };
}

async function githubApi(path) {
  const base = process.env.PAGES_HEAD_GUARD_API_BASE || process.env.GITHUB_API_URL || 'https://api.github.com';   // 시험은 127.0.0.1 가짜 서버
  const res = await fetch(base.replace(/\/$/, '') + '/' + path, {
    headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
      ...(process.env.GH_TOKEN ? { authorization: 'Bearer ' + process.env.GH_TOKEN } : {}) },
    signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('GitHub API ' + res.status + ' ' + path);
  return res.json();
}

function lsRemoteMain() {
  return execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const out = argv[0] || env.GITHUB_OUTPUT || '';
  let res;
  try {
    const tries = Math.max(1, Math.min(5, Number(env.PAGES_HEAD_GUARD_TRIES) || 3));
    const { head, via } = await readMainHead({ repo: env.GITHUB_REPOSITORY, api: githubApi, lsRemote: lsRemoteMain, tries });
    res = decidePublish({ sha: env.GITHUB_SHA, head });
    if (via === 'git') res.why += ' · main 머리는 git ls-remote 로 읽음';
  } catch (error) {
    res = { publish: true, head: '', level: 'warning', why: '확인 실패 — 예전처럼 공개한다: ' + String(error && error.message || error).split('\n')[0].slice(0, 120) };
  }
  console.log('::' + res.level + '::' + res.why);
  try { if (out) appendFileSync(out, 'publish=' + res.publish + '\nhead=' + res.head + '\n'); }
  catch (_) { console.log('::warning::출력 파일에 못 씀 — 공개 단계는 조건(publish != false)대로 그대로 돈다'); }
  return res;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {}).finally(() => { process.exitCode = 0; });
}
