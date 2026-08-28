# Hyeonjang v237 Office Intake Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리사무소 접수함을 복원·relay 설정 완료 뒤 부팅, 온라인 복귀, 화면 재진입 때 안전하게 자동 확인하고 15분 이상 확인하지 못한 상태를 사용자에게 알린다.

**Architecture:** 기존 office-intake 수동 동기화 본문을 단일 fetch 함수와 source-aware coordinator로 나눈다. 자동·수동·복구 호출은 한 in-flight Promise를 공유하되, 자동 전용 완료는 기존 persistLocal 디바운스만 사용하고 cloud save·outbox flush를 절대 만들지 않는다. 복원과 relay 설정은 각각 결과 객체를 내는 one-shot Promise가 되며, 자동 관리자는 두 준비 상태가 모두 성공한 뒤에만 이벤트 기반으로 작동한다.

**Tech Stack:** 정적 HTML/JavaScript PWA, IndexedDB, Google Apps Script relay, Node.js 검사, Playwright, PowerShell, Git.

**Spec:** docs/superpowers/specs/2026-08-27-reliability-privacy-three-step-design.md §5, §8, §9.1, §10, §12, §13

## Global Constraints

- 구현 저장소는 C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake 이다.
- 기준 커밋은 ffb442f이며 기존 미추적 debug.log는 읽거나 수정하거나 스테이징하지 않는다.
- 원본의 변경된 체크아웃 C:\Users\1dncj\Documents\New project\hyeonjang 은 건드리지 않는다.
- 이 계획은 v237 전용이다. v238 저장소 보호는 v237 커밋이 끝난 뒤 별도 계획으로 실행한다.
- 실데이터, Google Drive, Apps Script 배포, main push, merge, GitHub Pages 배포를 수행하지 않는다.
- 자동 경로는 officeAccept, officeSetStatus, officeIntakeFlush, relaySaveNow, cloudFlushQueue, cloudAutoSave를 호출하지 않는다.
- 자동 결과의 로컬 저장은 기존 persistLocal만 사용한다. 별도 IndexedDB writer를 만들지 않는다.
- 복원·relay 오류 객체에 원문 예외, 토큰, URL, 접수 개인정보를 넣지 않는다.
- index.html 변경과 같은 커밋에서 APP_BUILD, sw.js 캐시 키, tests/version-sync.check.js 목표값을 정확히 hyeonjang-v237-officesync로 맞춘다.
- Task 1-4는 RED/GREEN 체크포인트만 남기고 커밋하지 않는다. v237 코드·검사·세 버전 마커는 Task 5의 단일 커밋에 함께 넣는다.
- 각 RED/GREEN 단계에서 종료코드를 확인한다. 마지막 변경 뒤 전체 79개 검사 파일을 다시 실행한다.

## PowerShell Test Harness

계획 실행을 시작할 때 다음 helper를 현재 PowerShell session에 정의한다.

~~~powershell
$root = 'C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake'
$node = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'

function Invoke-HjE2E {
  param(
    [Parameter(Mandatory=$true)][string]$TestFile,
    [switch]$Relay,
    [switch]$ExpectRed
  )
  $static = Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
  $relayProcess = $null
  if ($Relay) {
    $relayProcess = Start-Process -FilePath $node -ArgumentList 'tests/mock-relay.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
  }
  try {
    $uris = @('http://127.0.0.1:8299/index.html')
    if ($Relay) { $uris += 'http://127.0.0.1:8398/' }
    foreach ($uri in $uris) {
      $ready = $false
      for ($attempt = 1; $attempt -le 30; $attempt++) {
        try {
          Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2 | Out-Null
          $ready = $true
          break
        } catch {
          Start-Sleep -Milliseconds 250
        }
      }
      if (-not $ready) { throw "SERVER NOT READY $uri" }
    }
    Set-Location $root
    & $node $TestFile
    $exitCode = $LASTEXITCODE
    if ($ExpectRed -and $exitCode -eq 0) { throw 'Expected RED but test passed' }
    if (-not $ExpectRed -and $exitCode -ne 0) { throw "Expected GREEN but exit=$exitCode" }
  }
  finally {
    Stop-Process -Id $static.Id -Force -ErrorAction SilentlyContinue
    if ($relayProcess) {
      Stop-Process -Id $relayProcess.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
~~~

---

## File Structure

### Modify

- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\index.html
  - window.__hjRestoreDone 결과 계약
  - window.__hjRelayConfigDone 결과 계약
  - officeIntakeFetchInbox와 source-aware officeIntakeSync
  - boot/online/visibility 자동 트리거
  - 60초 자동 cooldown과 15분 stale 상태
  - 접수함·아파트 오더·더보기 배지 갱신
  - APP_BUILD
- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\sw.js
  - 캐시 키
- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\tests\version-sync.check.js
  - TARGET_BUILD

### Create

- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\tests\office-intake-auto-sync.e2e.js
  - 준비 게이트, single-flight, source 승격, local-only 저장, cooldown, stale UI 계약

### Preserve

- tests/office-intake-sync.e2e.js: relay 수동 동기화 회귀
- tests/office-intake-ui.e2e.js: 기존 모바일 접수 UI 회귀
- tests/relay.e2e.js: relay 계약 회귀
- debug.log: 사용자 소유 미추적 파일

---

## Task 1: 자동 동기화 RED 하네스와 준비 게이트 계약

**Files:**

- Create: tests/office-intake-auto-sync.e2e.js
- Modify: index.html:2168-2213
- Modify: index.html:26097-26125

- [ ] **Step 1: 신규 Playwright 검사의 공통 하네스를 작성한다**

tests/office-intake-auto-sync.e2e.js를 다음 시작 코드로 만든다.

~~~js
'use strict';

const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const APP = 'http://127.0.0.1:8299/index.html';
let browser;

async function openPage() {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  await page.addInitScript(() => localStorage.setItem('hj_onboard_done', '1'));
  await page.route('https://**/*', route => route.abort());
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  return page;
}

(async () => {
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {}
  );

  const page = await openPage();
  assert.equal(typeof window, 'undefined');
  await page.close();
  await browser.close();
  console.log('PASS office intake auto-sync contract');
})().catch(async error => {
  console.error('FAIL', error && error.stack || error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});
~~~

- [ ] **Step 2: 복원과 relay 설정을 모두 기다리는 RED 검사를 추가한다**

IIFE 안의 임시 assert를 아래 검사로 교체한다.

~~~js
  const page = await openPage();
  const gate = await page.evaluate(async () => {
    const calls = [];
    window.__hjRestoreDone = new Promise(resolve => {
      window.__testResolveRestore = resolve;
    });
    window.__hjRelayConfigDone = new Promise(resolve => {
      window.__testResolveRelay = resolve;
    });
    window.cloudOfficeInbox = async () => {
      calls.push('inbox');
      return { ok: true, requests: [], cursor: '', operationalErrors: [] };
    };
    __relay.url = 'https://relay.test/exec';
    __relay.token = 'test-token';
    __officeIntakeAutoStarted = false;
    __officeIntakeAutoLastStartedAt = 0;
    __officeIntakeSyncPromise = null;

    officeIntakeAutoStart();
    await Promise.resolve();
    const before = calls.length;

    window.__testResolveRestore({
      ok: true,
      restoredAt: '2026-08-27T00:00:00.000Z',
      errorCode: ''
    });
    await Promise.resolve();
    const afterRestoreOnly = calls.length;

    window.__testResolveRelay({
      ok: true,
      ready: true,
      completedAt: '2026-08-27T00:00:01.000Z',
      errorCode: ''
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    return { before, afterRestoreOnly, afterBoth: calls.length };
  });
  assert.deepEqual(gate, {
    before: 0,
    afterRestoreOnly: 0,
    afterBoth: 1
  });
~~~

- [ ] **Step 3: RED를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/office-intake-auto-sync.e2e.js' -ExpectRed
~~~

Expected: ReferenceError: officeIntakeAutoStart is not defined.

- [ ] **Step 4: window.__hjRestoreDone이 항상 정제된 결과 객체를 반환하도록 구현한다**

현재 복원 IIFE를 다음 계약으로 바꾼다. existingData와 noSavedState도 정상 완료다.

~~~js
window.__hjRestoreDone = (async () => {
  const restoredAt = new Date().toISOString();
  let restoredSavedState = false;
  try {
    if (!state.projects.length && !state.files.length) {
      const saved = await idbGet('appState');
      if (saved && typeof saved === 'object') {
        applyData(saved);
        restoredSavedState = true;
      }
    }
  } catch (_) {
    return { ok: false, restoredAt, errorCode: 'restore-failed' };
  }
  if (restoredSavedState) {
    try {
      const mountName = document.getElementById('mountName');
      if (mountName) mountName.textContent = '📦 저장된 작업(이 기기)';
      render();
    } catch (_) {}
    try { hydrateThumbs(); } catch (_) {}
  }
  try {
    if (typeof gdBootSync === 'function') gdBootSync();
  } catch (_) {}
  return { ok: true, restoredAt, errorCode: '' };
})();
~~~

기존 복원 뒤 호출은 이 Promise의 resolve 값과 무관하게 동작하도록 유지하되, 자동 관리자는 ok가 false면 멈춰야 한다.

- [ ] **Step 5: relayBoot의 설정 복원만 나타내는 one-shot Promise를 구현한다**

relayBoot 전에 deferred를 한 번 만들고, relay_url/token/device/rev 및 관련 설정 IDB 조회가 끝난 직후 resolve한다.

~~~js
let __hjRelayConfigResolve;
window.__hjRelayConfigDone = new Promise(resolve => {
  __hjRelayConfigResolve = resolve;
});

function relayConfigComplete(result) {
  if (!__hjRelayConfigResolve) return;
  const resolve = __hjRelayConfigResolve;
  __hjRelayConfigResolve = null;
  resolve(result);
}
~~~

relayBoot의 설정 읽기 구간을 try/catch로 감싸고 다음 두 결과 중 하나만 resolve한다.

~~~js
relayConfigComplete({
  ok: true,
  ready: relayReady(),
  completedAt: new Date().toISOString(),
  errorCode: ''
});
~~~

~~~js
relayConfigComplete({
  ok: false,
  ready: false,
  completedAt: new Date().toISOString(),
  errorCode: 'relay-config-failed'
});
~~~

queue flush, health, cloud load, Drive 병합은 resolve 뒤 기존 순서로 계속 실행한다.

- [ ] **Step 6: 게이트 결과 단위 검사를 추가한다**

새 E2E에 복원 실패, relay 실패, ready false 각각 calls가 0임을 별도 page로 검사한다. 실패 결과에는 errorCode 외 원문 Error.message가 노출되지 않는지도 assert한다.

- [ ] **Step 7: 집중 검사를 다시 실행한다**

Expected: 준비 Promise 계약은 통과하고 officeIntakeAutoStart 부재 또는 후속 coordinator 부재로 실패한다.

- [ ] **Step 8: Task 1 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 2: 단일 fetch와 source-aware coordinator

**Files:**

- Modify: index.html:9384-9464
- Modify: index.html:10026-10040
- Modify: tests/office-intake-auto-sync.e2e.js

- [ ] **Step 1: single-flight와 자동 로컬 전용 저장 RED 검사를 추가한다**

~~~js
  const coordinator = await page.evaluate(async () => {
    const network = [];
    const effects = [];
    let release;
    window.cloudOfficeInbox = () => {
      network.push('inbox');
      return new Promise(resolve => { release = resolve; });
    };
    window.persistLocal = () => effects.push('persist');
    window.officeIntakeMarkDirty = () => effects.push('dirty');
    window.cloudAutoSave = () => effects.push('cloud');
    window.officeIntakeFlush = async () => effects.push('flush');
    window.relaySaveNow = async () => effects.push('relay-save');
    state.officeIntake = {
      inbox: [], cursor: '', outbox: [{ action: 'existing' }],
      lastSyncAt: '', lastError: ''
    };

    const auto = officeIntakeSync({ source: 'auto' });
    const manual = officeIntakeSync({ source: 'manual' });
    const recovery = officeIntakeSync({ source: 'recovery' });
    release({
      ok: true,
      requests: [{
        requestId: 'new-1',
        updatedAt: '2026-08-27T00:00:00.000Z'
      }],
      cursor: '2026-08-27T00:00:00.000Z',
      operationalErrors: []
    });
    const results = await Promise.all([auto, manual, recovery]);
    return {
      network: network.length,
      same: auto === manual && manual === recovery,
      effects,
      results,
      outbox: state.officeIntake.outbox.slice(),
      inboxCount: officeIntakeData().inbox.length
    };
  });
  assert.equal(coordinator.network, 1);
  assert.equal(coordinator.same, true);
  assert.equal(coordinator.inboxCount, 1);
  assert.deepEqual(coordinator.outbox, [{ action: 'existing' }]);
  assert.deepEqual(coordinator.effects, ['persist']);
  assert.equal(coordinator.effects.includes('dirty'), false);
  assert.equal(coordinator.effects.includes('cloud'), false);
  assert.equal(coordinator.effects.includes('flush'), false);
  assert.equal(coordinator.effects.includes('relay-save'), false);
~~~

- [ ] **Step 2: RED를 실행한다**

Expected: 세 Promise가 같지 않거나 네트워크가 3회이거나 기존 markDirty/cloud 경로가 호출되어 실패한다.

- [ ] **Step 3: 기존 요청·merge 본문을 officeIntakeFetchInbox로 분리한다**

함수는 response를 검증하고 적용 예정값만 계산한다. 성공이 확정되기 전 state를 바꾸거나 저장·UI·toast·flush를 수행하지 않는다. 기존 officeIntakeMerge는 optional targetInbox를 받아 clone에 병합하도록 하위 호환 확장한다.

~~~js
function officeIntakeMerge(records, targetInbox) {
  const d = officeIntakeData();
  const inbox = Array.isArray(targetInbox) ? targetInbox : d.inbox;
  const byId = {};
  let changed = false;
  inbox.forEach(function (row, index) {
    if (row && row.requestId) byId[String(row.requestId)] = index;
  });
  (Array.isArray(records) ? records : []).forEach(function (incoming) {
    if (!incoming || !incoming.requestId) return;
    const id = String(incoming.requestId);
    const index = byId[id];
    if (index == null) {
      inbox.push(incoming);
      byId[id] = inbox.length - 1;
      changed = true;
      return;
    }
    if (officeIntakeIsNewer(incoming, inbox[index])) {
      inbox[index] = incoming;
      changed = true;
    }
  });
  return changed;
}

async function officeIntakeFetchInbox() {
  const d = officeIntakeData();
  const response = await cloudOfficeInbox(d.cursor || '');
  if (!response || response.ok !== true) {
    return { ok: false, error: officeIntakeError(response) };
  }
  const inbox = officeIntakeClonePayload(d.inbox || []);
  const changed = officeIntakeMerge(response.requests || [], inbox);
  const cursor = typeof response.cursor === 'string' && response.cursor
    ? response.cursor
    : officeIntakeCursor(response.requests, d.cursor);
  return {
    ok: true,
    changed: changed || cursor !== d.cursor,
    inbox,
    cursor,
    operationalErrors: officeIntakeOperationalErrors(
      response.operationalErrors
    )
  };
}
~~~

- [ ] **Step 4: source-aware coordinator를 구현한다**

~~~js
let __officeIntakeSyncPromise = null;
let __officeIntakeSyncOwnerSource = '';

function officeIntakeNormalizeSource(source) {
  return source === 'auto' || source === 'recovery' ? source : 'manual';
}

function officeIntakeSync(options) {
  const source = officeIntakeNormalizeSource(options && options.source);
  if (__officeIntakeSyncPromise) return __officeIntakeSyncPromise;

  const ownerSource = source;
  __officeIntakeSyncOwnerSource = ownerSource;
  const promise = (async () => {
    const d = officeIntakeData();
    try {
      const result = await officeIntakeFetchInbox();
      if (result.ok !== true) {
        d.lastError = result.error || '동기화 오류';
        if (ownerSource === 'auto') officeIntakePersistAuto();
        else officeIntakeMarkDirty();
        officeIntakeRefreshVisibleUi();
        officeIntakeScheduleStaleStatus();
        return false;
      }
      d.inbox = result.inbox;
      d.cursor = result.cursor;
      d.operationalErrors = result.operationalErrors;
      d.lastSyncAt = new Date().toISOString();
      d.lastError = '';
      if (ownerSource === 'auto') officeIntakePersistAuto();
      else officeIntakeMarkDirty();
      officeIntakeRefreshVisibleUi();
      officeIntakeScheduleStaleStatus();
      return true;
    } catch (error) {
      d.lastError = officeIntakeError(error);
      if (ownerSource === 'auto') officeIntakePersistAuto();
      else officeIntakeMarkDirty();
      officeIntakeRefreshVisibleUi();
      officeIntakeScheduleStaleStatus();
      return false;
    } finally {
      if (__officeIntakeSyncPromise === promise) {
        __officeIntakeSyncPromise = null;
        __officeIntakeSyncOwnerSource = '';
      }
    }
  })();
  __officeIntakeSyncPromise = promise;
  return promise;
}
~~~

fetch 단계는 clone에서 계산한 뒤 성공 때 officeIntake 필드만 한 번에 적용한다. 따라서 실패 rollback을 위해 state.projects, state.aptOrders, state.files 또는 FileSystem handle을 직렬화·재대입하지 않는다. 테스트는 이 값들과 inbox/cursor/outbox/lastSyncAt이 실패 전후 동일한지 확인한다.

- [ ] **Step 5: 자동 전용 저장 helper를 구현한다**

~~~js
function officeIntakePersistAuto() {
  persistLocal();
}
~~~

이 helper 안에 markDirty, cloudAutoSave, relaySaveNow, officeIntakeFlush를 넣지 않는다.

- [ ] **Step 6: 명시적 호출부에 source를 표시한다**

- #apoOfficeRetry: officeIntakeSync({ source: 'manual' })
- #apoOfficeRetry: await officeIntakeSync({ source: 'manual' }) 뒤 기존 officeIntakeFlush를 호출
- officeIntakeRecoverQueuedAccept: await officeIntakeSync({ source: 'recovery' }) 뒤 기존 요청·사진 재검증을 계속 수행
- options가 없는 기존 외부 호출: manual 기본값

auto가 소유한 request에 manual/recovery가 합류해도 coordinator의 저장 경계는 끝까지 persistLocal-only다. 명시적 호출자의 flush·복구 후속 처리는 shared Promise가 끝난 뒤 각 호출자 함수에서 실행한다. manual/recovery가 request를 먼저 소유한 경우에만 기존 officeIntakeMarkDirty 경계를 유지한다.

- [ ] **Step 7: 실패 보존 RED 검사를 추가한다**

기존 inbox/cursor/projects/aptOrders/files/outbox/operationalErrors/lastSyncAt를 채우고 cloudOfficeInbox를 reject시킨 뒤 각각 deepEqual인지 검사한다. lastError는 officeIntakeError의 인증 오류/동기화 오류 정제 규칙을 유지하고 toast 0, auto cloud side effect 0이어야 한다.

- [ ] **Step 8: 집중 검사와 기존 동기화 검사를 GREEN으로 만든다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/office-intake-auto-sync.e2e.js'
Invoke-HjE2E -TestFile 'tests/office-intake-sync.e2e.js' -Relay
~~~

Expected: 둘 다 exit 0.

- [ ] **Step 9: Task 2 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 3: boot, online, foreground 자동 트리거와 cooldown

**Files:**

- Modify: index.html:1335
- Modify: index.html:1825
- Modify: index.html:9384-9464
- Modify: index.html:26097-26125
- Modify: tests/office-intake-auto-sync.e2e.js

- [ ] **Step 1: 실제 네트워크 시작 기준 60초 RED 검사를 추가한다**

~~~js
  const cooldown = await page.evaluate(async () => {
    let calls = 0;
    window.cloudOfficeInbox = async () => {
      calls += 1;
      return { ok: true, requests: [], cursor: '', operationalErrors: [] };
    };
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true
    });
    __relay.url = 'https://relay.test/exec';
    __relay.token = 'test-token';
    await officeIntakeAutoTrigger('online');
    await officeIntakeAutoTrigger('visible');
    return calls;
  });
  assert.equal(cooldown, 1);
~~~

추가 page에서 offline 또는 relayReady false 호출 뒤 online ready 호출이 1건을 만드는지 검사한다. skip이 cooldown을 소비하면 이 검사가 실패해야 한다.

- [ ] **Step 2: RED를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/office-intake-auto-sync.e2e.js' -ExpectRed
~~~

Expected: officeIntakeAutoTrigger 부재 또는 연속 두 요청으로 실패한다.

- [ ] **Step 3: 자동 상태와 trigger를 구현한다**

~~~js
const OFFICE_INTAKE_AUTO_COOLDOWN_MS = 60 * 1000;
let __officeIntakeAutoLastStartedAt = 0;
let __officeIntakeAutoStarted = false;

function officeIntakeAutoTrigger(reason) {
  if (!navigator.onLine || !relayReady()) return Promise.resolve(false);
  const now = Date.now();
  if (__officeIntakeSyncPromise) {
    return officeIntakeSync({ source: 'auto' });
  }
  if (now - __officeIntakeAutoLastStartedAt < OFFICE_INTAKE_AUTO_COOLDOWN_MS) {
    return Promise.resolve(false);
  }
  __officeIntakeAutoLastStartedAt = now;
  return officeIntakeSync({ source: 'auto' });
}
~~~

reason은 관측·테스트 용도로만 받고 개인정보가 포함된 로그를 남기지 않는다.

- [ ] **Step 4: 두 준비 Promise를 기다리는 시작 관리자를 구현한다**

~~~js
function officeIntakeAutoStart() {
  if (__officeIntakeAutoStarted) return;
  __officeIntakeAutoStarted = true;
  Promise.all([window.__hjRestoreDone, window.__hjRelayConfigDone])
    .then(results => {
      const restore = results[0];
      const relay = results[1];
      if (!restore || restore.ok !== true) return;
      if (!relay || relay.ok !== true || relay.ready !== true) return;
      __officeIntakeRestoreCompletedAt = restore.restoredAt || new Date().toISOString();
      officeIntakeScheduleStaleStatus();
      return officeIntakeAutoTrigger('boot');
    })
    .catch(() => {});
}
~~~

relayBoot과 restore Promise를 설정한 뒤 exactly once 호출한다.

- [ ] **Step 5: 기존 online과 visibilitychange handler에만 연결한다**

기존 online queue flush 코드를 유지하고 다음 호출만 덧붙인다.

~~~js
officeIntakeAutoTrigger('online');
~~~

기존 visibilitychange에서 document.visibilityState === 'visible' 분기에 다음 호출을 추가한다.

~~~js
officeIntakeAutoTrigger('visible');
~~~

setInterval, background polling, focus 이벤트는 추가하지 않는다.

- [ ] **Step 6: source 승격 동시성 검사를 강화한다**

auto 시작 뒤 manual/recovery가 join하면 네트워크는 1건, Promise는 동일하며 coordinator effect는 합류 뒤에도 정확히 ['persist']여야 한다. manual-owned request에 auto가 join한 별도 case는 ['dirty']여야 한다. manual 버튼의 officeIntakeFlush와 recovery의 요청·사진 재검증은 shared Promise 완료 뒤 각 호출자에서 한 번만 실행되는지 검사한다.

- [ ] **Step 7: boot/online/visible 검사를 GREEN으로 만든다**

Expected: exit 0, pageerror 0, toast spam 0.

- [ ] **Step 8: Task 3 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 4: 15분 stale 상태와 열린 UI 갱신

**Files:**

- Modify: index.html:9889-9917
- Modify: index.html:9983-10040
- Modify: index.html:18576-18591
- Modify: tests/office-intake-auto-sync.e2e.js

- [ ] **Step 1: 14:59.999, 15:00.000, invalid, future RED 검사를 추가한다**

~~~js
  const stale = await page.evaluate(() => {
    __officeIntakeRestoreCompletedAt = '2026-08-27T00:00:00.000Z';
    const d = officeIntakeData();
    d.lastSyncAt = '';
    const fresh = officeIntakeStaleState(
      Date.parse('2026-08-27T00:14:59.999Z')
    );
    const edge = officeIntakeStaleState(
      Date.parse('2026-08-27T00:15:00.000Z')
    );
    d.lastSyncAt = 'not-a-date';
    const invalid = officeIntakeStaleState(
      Date.parse('2026-08-27T00:15:00.000Z')
    );
    d.lastSyncAt = '2026-08-27T00:20:00.000Z';
    const future = officeIntakeStaleState(
      Date.parse('2026-08-27T00:15:00.000Z')
    );
    return { fresh, edge, invalid, future };
  });
  assert.equal(stale.fresh.mode, 'fresh');
  assert.equal(stale.edge.mode, 'stale');
  assert.equal(stale.invalid.mode, 'stale');
  assert.equal(stale.future.mode, 'stale');
~~~

- [ ] **Step 2: RED를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/office-intake-auto-sync.e2e.js' -ExpectRed
~~~

Expected: ReferenceError: officeIntakeStaleState is not defined.

- [ ] **Step 3: 순수 stale 계산 함수를 구현한다**

~~~js
const OFFICE_INTAKE_STALE_MS = 15 * 60 * 1000;
let __officeIntakeRestoreCompletedAt = '';
let __officeIntakeStaleTimer = null;

function officeIntakeStaleState(now) {
  if (!relayReady()) {
    return { mode: 'setup', at: '', dueAt: null };
  }
  const current = Number.isFinite(now) ? now : Date.now();
  const d = officeIntakeData();
  const synced = Date.parse(d.lastSyncAt || '');
  const restored = Date.parse(__officeIntakeRestoreCompletedAt || '');
  const validSynced = Number.isFinite(synced) && synced <= current;
  const base = validSynced ? synced : restored;
  if (!Number.isFinite(base) || base > current) {
    return { mode: 'fresh', at: '', dueAt: current + OFFICE_INTAKE_STALE_MS };
  }
  const dueAt = base + OFFICE_INTAKE_STALE_MS;
  return {
    mode: current >= dueAt ? 'stale' : 'fresh',
    at: new Date(base).toISOString(),
    dueAt
  };
}
~~~

- [ ] **Step 4: 네트워크 없는 one-shot UI timer를 구현한다**

~~~js
function officeIntakeScheduleStaleStatus() {
  if (__officeIntakeStaleTimer) {
    clearTimeout(__officeIntakeStaleTimer);
    __officeIntakeStaleTimer = null;
  }
  const status = officeIntakeStaleState(Date.now());
  if (status.mode !== 'fresh' || !Number.isFinite(status.dueAt)) {
    officeIntakeRefreshVisibleUi();
    return;
  }
  const wait = Math.max(0, status.dueAt - Date.now());
  __officeIntakeStaleTimer = setTimeout(() => {
    __officeIntakeStaleTimer = null;
    officeIntakeRefreshVisibleUi();
  }, wait);
}
~~~

timer callback에 officeIntakeAutoTrigger나 network 함수를 넣지 않는다.

- [ ] **Step 5: 공통 상태 문구와 열린 UI refresh를 구현한다**

문구 계약:

- setup: 관리사무소 접수 서버 연결을 확인하세요
- fresh: 마지막 확인 N분 전
- stale: 15분 이상 새 접수를 확인하지 못했습니다

officeIntakeStatusHtml은 고정 문구와 계산 숫자만 반환한다. 접수 개인정보를 innerHTML에 넣지 않는다. officeIntakeRefreshVisibleUi는 현재 열려 있는 #apoOfficeInbox, 아파트 오더 모달, 더보기 배지만 갱신하고 새 modal을 열지 않는다.

- [ ] **Step 6: 성공·실패 직후 UI와 timer 재예약을 연결한다**

- 성공: lastSyncAt 갱신, lastError 비움, badge/열린 화면 갱신, timer 재예약
- 실패: lastSyncAt 보존, lastError 정제, badge/열린 화면 갱신, 기존 기준으로 timer 재예약

- [ ] **Step 7: timer가 network를 만들지 않는 검사를 추가한다**

가짜 타이머로 정확한 15분 경계를 진행한 뒤 상태 문구는 stale, cloudOfficeInbox calls는 0인지 검사한다.

- [ ] **Step 8: 390×844 UI 검사를 추가한다**

접수함과 아파트 오더를 각각 열고 documentElement.scrollWidth <= innerWidth, 버튼 높이 44px 이상, stale 문구 가시성을 검사한다.

- [ ] **Step 9: 집중 회귀를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/office-intake-auto-sync.e2e.js'
Invoke-HjE2E -TestFile 'tests/office-intake-ui.e2e.js'
~~~

Expected: 둘 다 exit 0.

- [ ] **Step 10: Task 4 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 5: v237 버전 동기화와 전체 회귀

**Files:**

- Modify: index.html:2268
- Modify: sw.js:2
- Modify: tests/version-sync.check.js

- [ ] **Step 1: 세 버전 값을 한 번에 바꾼다**

~~~js
const APP_BUILD = 'hyeonjang-v237-officesync';
~~~

~~~js
const C = 'hyeonjang-v237-officesync';
~~~

~~~js
const TARGET_BUILD = 'hyeonjang-v237-officesync';
~~~

- [ ] **Step 2: 버전·문법·집중 회귀를 실행한다**

~~~powershell
& $node tests/version-sync.check.js
& $node tests/syntax.check.js
& $node tests/sw-cache.check.js
Invoke-HjE2E -TestFile 'tests/office-intake-auto-sync.e2e.js'
Invoke-HjE2E -TestFile 'tests/office-intake-sync.e2e.js' -Relay
Invoke-HjE2E -TestFile 'tests/office-intake-ui.e2e.js'
Invoke-HjE2E -TestFile 'tests/relay.e2e.js' -Relay
~~~

Expected: 모든 명령 exit 0.

- [ ] **Step 3: 아래 변이를 하나씩 적용하고 새 검사가 RED가 되는지 확인한 뒤 즉시 원복한다**

1. relay Promise 대기를 제거한다. gate의 afterRestoreOnly가 1이 되어 실패해야 한다.
2. 60초 guard를 제거한다. online+visible calls가 2가 되어 실패해야 한다.
3. auto 저장을 officeIntakeMarkDirty로 바꾼다. cloud/dirty 불호출 검사가 실패해야 한다.
4. 실패 catch에서 lastSyncAt을 현재 시각으로 바꾼다. 보존 검사가 실패해야 한다.
5. stale 비교를 >로 바꾼다. 15:00.000 경계 검사가 실패해야 한다.
6. stale timer에서 auto trigger를 호출한다. timer network 0 검사가 실패해야 한다.

각 변이 원복 뒤 git diff로 의도한 v237 변경만 남았는지 확인한다.

- [ ] **Step 4: static server와 mock relay를 띄우고 전체 79개 검사를 실행한다**

~~~powershell
$static = Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
$relay = Start-Process -FilePath $node -ArgumentList 'tests/mock-relay.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
try {
  foreach ($uri in @('http://127.0.0.1:8299/index.html','http://127.0.0.1:8398/')) {
    $ready = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      try {
        Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
        break
      } catch {
        Start-Sleep -Milliseconds 250
      }
    }
    if (-not $ready) { throw "SERVER NOT READY $uri" }
  }
  Get-ChildItem "$root\tests" -File |
    Where-Object { $_.Name -match '\.(check|e2e|unit)\.js$' } |
    Sort-Object Name |
    ForEach-Object {
      $process = Start-Process -FilePath $node -ArgumentList $_.FullName -WorkingDirectory $root -WindowStyle Hidden -PassThru
      if (-not $process.WaitForExit(120000)) {
        Stop-Process -Id $process.Id -Force
        throw "TIMEOUT $($_.Name)"
      }
      if ($process.ExitCode -ne 0) {
        throw "FAIL $($_.Name) exit=$($process.ExitCode)"
      }
    }
}
finally {
  Stop-Process -Id $static.Id,$relay.Id -Force -ErrorAction SilentlyContinue
}
~~~

Expected: 79/79 exit 0. 현재 78개 + 신규 1개다.

- [ ] **Step 5: 범위와 민감정보를 검사한다**

~~~powershell
git diff --check
git status --short
git diff --name-only
rg -n "hyeonjang-v237-officesync" index.html sw.js tests/version-sync.check.js
rg -n "officeAccept|officeSetStatus|officeIntakeFlush|relaySaveNow|cloudAutoSave" tests/office-intake-auto-sync.e2e.js
~~~

Expected:

- 변경 파일은 index.html, sw.js, tests/version-sync.check.js, tests/office-intake-auto-sync.e2e.js뿐이다.
- debug.log는 여전히 미추적이고 스테이징되지 않는다.
- 세 버전 마커가 정확히 일치한다.
- 토큰, 실 URL, 실 접수 데이터가 diff에 없다.

- [ ] **Step 6: v237 릴리스 커밋을 만든다**

~~~powershell
git add index.html sw.js tests/version-sync.check.js tests/office-intake-auto-sync.e2e.js
git diff --cached --check
git status --short
git commit -m "feat: add office intake automatic sync v237"
~~~

- [ ] **Step 7: 배포 전 종료 조건을 확인한다**

~~~powershell
git status --short
git log -5 --oneline
~~~

Expected: debug.log만 미추적이다. push, merge, 배포는 하지 않고 v238 계획으로 넘어간다.

---

## Review Checklist

- [ ] window.__hjRestoreDone은 모든 정상 경로에서 ok true, 오류에서 정제된 restore-failed를 반환한다.
- [ ] window.__hjRelayConfigDone은 설정 복원 직후 한 번만 resolve하며 후속 relay side effect와 분리된다.
- [ ] restore와 relay가 모두 성공하기 전 자동 network가 0건이다.
- [ ] auto/manual/recovery가 한 Promise와 한 request를 공유한다.
- [ ] manual/recovery join은 explicit post-processing을 잃지 않는다.
- [ ] auto-only 성공·실패가 cloud save, outbox flush, accept, status update를 만들지 않는다.
- [ ] 실패가 inbox, cursor, projects, files, outbox, lastSyncAt을 보존한다.
- [ ] skipped auto trigger가 60초 cooldown을 소비하지 않는다.
- [ ] stale는 15분 정확한 경계에서 켜지고 timer는 network를 만들지 않는다.
- [ ] 390px 모바일에서 상태와 버튼이 잘리지 않는다.
- [ ] 79개 전체 회귀와 변이 검증이 통과했다.
- [ ] debug.log와 원본 dirty checkout을 보존했다.
- [ ] push, merge, 배포, 외부 계정 변경을 수행하지 않았다.
