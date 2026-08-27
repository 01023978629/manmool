# Hyeonjang v238 Browser Storage Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현장 웹 백업센터에서 브라우저 저장소의 영속 보관 상태와 origin 전체 사용량을 안전하게 확인하고, 사용자 동작으로만 영속 보관을 요청하며 80% 이상 사용 시 백업을 권고한다.

**Architecture:** appState와 완전히 분리된 메모리 전용 storage guard 상태를 두고 navigator.storage.persisted/estimate는 읽기 전용 refresh로 캡슐화한다. navigator.storage.persist는 백업센터의 명시적 버튼 이벤트에서 첫 await 전에 호출해 user activation을 보존하고, 중복 입력은 하나의 in-flight Promise를 공유한다. 비동기 상태 갱신은 전용 #bcStorageStatus만 바꿔 기존 서버 백업·복원 UI와 데이터를 보존한다.

**Tech Stack:** 정적 HTML/JavaScript PWA, StorageManager API, IndexedDB, Node.js 검사, Playwright, PowerShell, Git.

**Spec:** docs/superpowers/specs/2026-08-27-reliability-privacy-three-step-design.md §6, §8, §9.2, §10, §12, §13

## Global Constraints

- 구현 저장소는 C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake 이다.
- 이 계획은 v237 커밋이 완료되고 세 버전 마커가 hyeonjang-v237-officesync인 상태에서만 시작한다.
- 기존 미추적 debug.log와 원본 dirty checkout을 보존한다.
- 읽기 전용 조회 또는 persist 요청의 성공·거절·오류 어떤 경우에도 state.projects, state.files, appState, 사진 원본을 삭제·이동·압축·정리하지 않는다.
- boot에서는 persisted와 estimate만 확인한다. navigator.storage.persist는 절대 자동 호출하지 않는다.
- persist는 #bcPersist의 trusted click 또는 키보드 활성화에서만 호출한다.
- 같은 origin https://01023978629.github.io 전체의 근사 사용량임을 UI에 명시한다.
- 백업센터의 기존 #bcNow, #bcDrive, #bcRestore, __relayBackupStat 표시를 제거하거나 전체 재렌더링하지 않는다.
- API 미지원, 부분 지원, reject, invalid quota는 pageerror 없이 구분된 안전 문구로 처리한다.
- index.html 변경과 같은 커밋에서 APP_BUILD, sw.js, tests/version-sync.check.js를 hyeonjang-v238-storageguard로 맞춘다.
- push, merge, Pages 배포, Apps Script 변경, 실데이터 작업을 하지 않는다.
- Task 1-4는 RED/GREEN 체크포인트만 남기고 커밋하지 않는다. v238 코드·검사·세 버전 마커는 Task 5의 단일 커밋에 함께 넣는다.

## PowerShell Test Harness

계획 실행을 시작할 때 다음 helper를 현재 PowerShell session에 정의한다. 모든 집중 E2E는 static server readiness와 종료를 이 helper로 보장한다.

~~~powershell
$root = 'C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake'
$node = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$env:NODE_PATH = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'

function Invoke-HjE2E {
  param(
    [Parameter(Mandatory=$true)][string]$TestFile,
    [switch]$ExpectRed
  )
  $server = Start-Process -FilePath $node -ArgumentList 'tests/static-server.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
  try {
    $ready = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
      try {
        Invoke-WebRequest -Uri 'http://127.0.0.1:8299/index.html' -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
        break
      } catch {
        Start-Sleep -Milliseconds 250
      }
    }
    if (-not $ready) { throw 'static server not ready' }
    Set-Location $root
    & $node $TestFile
    $exitCode = $LASTEXITCODE
    if ($ExpectRed -and $exitCode -eq 0) { throw 'Expected RED but test passed' }
    if (-not $ExpectRed -and $exitCode -ne 0) { throw "Expected GREEN but exit=$exitCode" }
  }
  finally {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
~~~

---

## File Structure

### Modify

- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\index.html
  - 메모리 전용 __storageGuard
  - storageGuardRefresh, storageGuardRequestPersist, formatting/render helpers
  - restore 뒤 read-only refresh
  - backupCenter의 고립된 storage 영역과 44px 버튼
  - APP_BUILD
- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\sw.js
  - 캐시 키
- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\tests\version-sync.check.js
  - TARGET_BUILD

### Create

- C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake\tests\storage-durability.e2e.js
  - boot read-only, activation, single-flight, 부분 지원, 80% 경계, 데이터 보존, 모바일 UI

### Preserve

- tests/restore-safety.e2e.js
- tests/backup-visible.e2e.js
- tests/mobile-shell-a11y.e2e.js
- backupCenter의 기존 서버 날짜별 백업 상태
- IndexedDB appState와 모든 현장 사진

---

## Task 1: v237 선행 조건과 StorageManager RED probe

**Files:**

- Create: tests/storage-durability.e2e.js

- [ ] **Step 1: v237 완료 상태를 검증한다**

~~~powershell
$root = 'C:\Users\1dncj\Documents\New project\.worktrees\hyeonjang-office-intake'
Set-Location $root
git status --short
rg -n "hyeonjang-v237-officesync" index.html sw.js tests/version-sync.check.js
~~~

Expected:

- 세 파일 모두 v237 마커를 포함한다.
- debug.log 외 예상하지 못한 변경이 없다.
- v237 전체 회귀가 직전 단계에서 79/79 통과했다.

조건이 맞지 않으면 이 계획을 시작하지 않고 v237 계획으로 돌아간다.

- [ ] **Step 2: StorageManager를 제어하는 Playwright probe를 작성한다**

tests/storage-durability.e2e.js를 다음 하네스로 만든다.

~~~js
'use strict';

const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const APP = 'http://127.0.0.1:8299/index.html';
let browser;

async function openPage(options) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block'
  });
  await context.addInitScript(settings => {
    localStorage.setItem('hj_onboard_done', '1');
    const probe = {
      hasPersisted: true,
      hasPersist: true,
      hasEstimate: true,
      persistedValue: false,
      persistValue: true,
      usage: 799,
      quota: 1000,
      persistedReject: false,
      estimateReject: false,
      persistReject: false,
      persistThrow: false,
      estimateDeferred: false,
      persistDeferred: false,
      persistedCalls: 0,
      estimateCalls: 0,
      persistCalls: 0,
      activationAtPersist: [],
      resolveEstimate: null,
      resolvePersist: null
    };
    Object.assign(probe, settings || {});
    const api = {};
    Object.defineProperty(api, 'persisted', {
      configurable: true,
      get() {
        if (!probe.hasPersisted) return undefined;
        return async () => {
          probe.persistedCalls += 1;
          await new Promise(resolve => setTimeout(resolve, 0));
          if (probe.persistedReject) throw new Error('persisted rejected');
          return probe.persistedValue;
        };
      }
    });
    Object.defineProperty(api, 'estimate', {
      configurable: true,
      get() {
        if (!probe.hasEstimate) return undefined;
        return async () => {
          probe.estimateCalls += 1;
          if (probe.estimateReject) throw new Error('estimate rejected');
          if (probe.estimateDeferred) {
            return new Promise(resolve => {
              probe.resolveEstimate = () => resolve({
                usage: probe.usage,
                quota: probe.quota
              });
            });
          }
          return { usage: probe.usage, quota: probe.quota };
        };
      }
    });
    Object.defineProperty(api, 'persist', {
      configurable: true,
      get() {
        if (!probe.hasPersist) return undefined;
        return () => {
          probe.persistCalls += 1;
          probe.activationAtPersist.push(
            !!(navigator.userActivation && navigator.userActivation.isActive)
          );
          if (probe.persistThrow) {
            throw new Error('persist threw');
          }
          if (probe.persistReject) {
            return Promise.reject(new Error('persist rejected'));
          }
          if (probe.persistDeferred) {
            return new Promise(resolve => {
              probe.resolvePersist = resolve;
            });
          }
          return Promise.resolve(probe.persistValue);
        };
      }
    });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: api
    });
    window.__storageProbe = probe;
  }, options || {});
  const page = await context.newPage();
  await page.route('https://**/*', route => route.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  return { context, page, errors };
}

(async () => {
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
      : {}
  );
  const opened = await openPage();
  await opened.page.evaluate(() => backupCenter());
  assert.equal(await opened.page.locator('#bcStorageStatus').count(), 1);
  await opened.context.close();
  await browser.close();
  console.log('PASS browser storage guard');
})().catch(async error => {
  console.error('FAIL', error && error.stack || error);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});
~~~

- [ ] **Step 3: RED를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/storage-durability.e2e.js' -ExpectRed
~~~

Expected: #bcStorageStatus가 없어 assertion 실패.

- [ ] **Step 4: RED 하네스 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 2: 읽기 전용 persisted/estimate 상태

**Files:**

- Modify: index.html:18954-18991
- Modify: index.html:26097-26125
- Modify: tests/storage-durability.e2e.js

- [ ] **Step 1: boot가 persist를 호출하지 않는 RED 검사를 추가한다**

~~~js
  const boot = await openPage();
  await boot.page.evaluate(() => window.__hjRestoreDone);
  await boot.page.waitForFunction(() =>
    window.__storageGuard &&
    window.__storageGuard.persisted.kind !== 'unknown' &&
    window.__storageGuard.estimate.kind !== 'unknown'
  );
  const bootResult = await boot.page.evaluate(() => ({
    persistCalls: window.__storageProbe.persistCalls,
    persistedCalls: window.__storageProbe.persistedCalls,
    estimateCalls: window.__storageProbe.estimateCalls,
    persistedKind: window.__storageGuard.persisted.kind,
    estimateKind: window.__storageGuard.estimate.kind
  }));
  assert.equal(bootResult.persistCalls, 0);
  assert.equal(bootResult.persistedCalls >= 1, true);
  assert.equal(bootResult.estimateCalls >= 1, true);
  assert.notEqual(bootResult.persistedKind, 'missing');
  assert.notEqual(bootResult.persistedKind, 'unknown');
  assert.notEqual(bootResult.estimateKind, 'missing');
  assert.notEqual(bootResult.estimateKind, 'unknown');
  await boot.context.close();
~~~

- [ ] **Step 2: 79.9%, 80%, 95%, invalid quota RED 검사를 추가한다**

~~~js
  async function storageText(usage, quota) {
    const opened = await openPage({ usage, quota });
    await opened.page.evaluate(async () => {
      await storageGuardRefresh();
      backupCenter();
    });
    const text = await opened.page.locator('#bcStorageStatus').innerText();
    await opened.context.close();
    return text;
  }

  const under = await storageText(799, 1000);
  const edge = await storageText(800, 1000);
  const high = await storageText(950, 1000);
  const zero = await storageText(1, 0);
  const invalid = await storageText(Number.NaN, 1000);
  assert.equal(under.includes('80% 이상'), false);
  assert.equal(edge.includes('80% 이상'), true);
  assert.equal(high.includes('80% 이상'), true);
  assert.equal(zero.includes('확인할 수 없음'), true);
  assert.equal(invalid.includes('확인할 수 없음'), true);
~~~

- [ ] **Step 3: RED를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/storage-durability.e2e.js' -ExpectRed
~~~

Expected: __storageGuard 또는 storageGuardRefresh 부재로 실패한다.

- [ ] **Step 4: appState와 분리된 메모리 상태를 구현한다**

~~~js
window.__storageGuard = {
  persisted: { kind: 'unknown', message: '' },
  estimate: {
    kind: 'unknown',
    usage: null,
    quota: null,
    ratio: null,
    message: ''
  },
  refreshInFlight: null,
  persistInFlight: null
};
~~~

이 객체를 serializeData, applyData, persistLocal, idbSet에 연결하지 않는다.

- [ ] **Step 5: 숫자 정규화와 용량 formatting을 구현한다**

~~~js
function storageGuardFiniteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function storageGuardFormatBytes(value) {
  const bytes = storageGuardFiniteNonNegative(value);
  if (bytes === null) return '확인할 수 없음';
  const gb = 1024 * 1024 * 1024;
  const mb = 1024 * 1024;
  if (bytes >= gb) return (bytes / gb).toFixed(1) + ' GB';
  return (bytes / mb).toFixed(1) + ' MB';
}
~~~

- [ ] **Step 6: single-flight read-only refresh를 구현한다**

~~~js
function storageGuardRefresh() {
  const guard = window.__storageGuard;
  if (guard.refreshInFlight) return guard.refreshInFlight;
  const api = navigator.storage || {};
  const promise = (async () => {
    if (typeof api.persisted !== 'function') {
      guard.persisted = { kind: 'unsupported', message: '상태 확인 미지원' };
    } else {
      try {
        const persisted = await api.persisted();
        guard.persisted = {
          kind: persisted ? 'yes' : 'no',
          message: persisted ? '영속 보관 적용됨' : '영속 보관 미적용'
        };
      } catch (_) {
        guard.persisted = { kind: 'error', message: '보관 상태 확인 실패' };
      }
    }

    if (typeof api.estimate !== 'function') {
      guard.estimate = {
        kind: 'unsupported',
        usage: null,
        quota: null,
        ratio: null,
        message: '용량 확인 미지원'
      };
    } else {
      try {
        const result = await api.estimate();
        const usage = storageGuardFiniteNonNegative(result && result.usage);
        const quota = storageGuardFiniteNonNegative(result && result.quota);
        const ratio = usage !== null && quota !== null && quota > 0
          ? usage / quota
          : null;
        guard.estimate = {
          kind: ratio === null ? 'invalid' : 'ready',
          usage,
          quota,
          ratio,
          message: ratio === null ? '용량을 확인할 수 없음' : ''
        };
      } catch (_) {
        guard.estimate = {
          kind: 'error',
          usage: null,
          quota: null,
          ratio: null,
          message: '용량 확인 실패'
        };
      }
    }
    storageGuardRenderIntoBackupCenter();
    return guard;
  })().finally(() => {
    if (guard.refreshInFlight === promise) guard.refreshInFlight = null;
  });
  guard.refreshInFlight = promise;
  return promise;
}
~~~

- [ ] **Step 7: restore 성공 뒤 read-only refresh만 예약한다**

~~~js
Promise.resolve(window.__hjRestoreDone)
  .then(result => {
    if (result && result.ok === false) return;
    return storageGuardRefresh();
  })
  .catch(() => {});
~~~

v237 결과 객체가 있으면 명시적 restore 실패만 건너뛴다. 이전 build의 undefined 완료값도 “복원 Promise가 끝남”으로 취급해 읽기 전용 조회는 실행한다. 이 연결부에는 storageGuardRequestPersist 또는 navigator.storage.persist가 없어야 한다.

- [ ] **Step 8: 상태 영역 renderer를 구현한다**

renderer는 #bcStorageStatus가 존재할 때만 해당 element의 text/HTML을 바꾼다. 표시 내용은 다음을 모두 포함한다.

- 영속 보관 적용/미적용/미지원/오류
- 사용량과 quota 또는 확인할 수 없음
- ratio >= 0.80이면 80% 이상 사용 중이므로 지금 백업 권고
- 같은 origin https://01023978629.github.io 전체의 근사값
- Cache, IndexedDB, localStorage를 포함할 수 있음

고정 문구와 계산 숫자만 출력하며 state 데이터는 출력하지 않는다.

~~~js
const STORAGE_ORIGIN_LABEL = 'https://01023978629.github.io';

function storageGuardRenderIntoBackupCenter() {
  const status = document.getElementById('bcStorageStatus');
  if (!status) return;
  const guard = window.__storageGuard;
  const api = navigator.storage || {};
  const lines = [];

  lines.push(guard.persisted.message || '영속 보관 상태 확인 중');
  if (typeof api.persist !== 'function') {
    lines.push('영속 보관 요청 미지원');
  }

  if (guard.estimate.kind === 'ready') {
    lines.push(
      storageGuardFormatBytes(guard.estimate.usage) + ' / ' +
      storageGuardFormatBytes(guard.estimate.quota) + ' 사용'
    );
  } else {
    lines.push(guard.estimate.message || '용량 확인 중');
  }

  lines.push(
    STORAGE_ORIGIN_LABEL +
    ' origin 전체의 근사값이며 Cache, IndexedDB, localStorage를 포함할 수 있습니다.'
  );
  if (guard.estimate.ratio !== null &&
      guard.estimate.ratio >= 0.80) {
    lines.push('저장공간을 80% 이상 사용 중입니다. 지금 백업하세요.');
  }

  status.replaceChildren();
  lines.forEach(text => {
    const line = document.createElement('p');
    line.textContent = text;
    status.appendChild(line);
  });

  const button = document.getElementById('bcPersist');
  if (button) {
    const busy = !!guard.persistInFlight;
    const unsupported = typeof api.persist !== 'function';
    button.disabled = busy || unsupported || guard.persisted.kind === 'yes';
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    button.textContent = guard.persisted.kind === 'yes'
      ? '이 기기 저장공간 보호 적용됨'
      : busy
        ? '보호 요청 중…'
        : '이 기기 저장공간 보호 요청';
  }
}
~~~

- [ ] **Step 9: backupCenter에 고립된 영역을 추가한다**

기존 내용 아래에 다음 구조를 추가한다.

~~~html
<section class="bc-storage" aria-labelledby="bcStorageTitle">
  <h3 id="bcStorageTitle">이 기기 저장공간 보호</h3>
  <div id="bcStorageStatus" role="status" aria-live="polite"></div>
  <button id="bcPersist" type="button">이 기기 저장공간 보호 요청</button>
</section>
~~~

modal을 연 직후 storageGuardRenderIntoBackupCenter()를 호출하고, storageGuardRefresh()를 await하지 않은 채 별도로 시작한다.

- [ ] **Step 10: 집중 RED/GREEN을 실행한다**

Expected: boot persist 0, 경계값, origin 문구 검사가 통과한다.

- [ ] **Step 11: Task 2 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 3: user activation을 보존하는 persist 요청

**Files:**

- Modify: index.html:18954-18991
- Modify: tests/storage-durability.e2e.js

- [ ] **Step 1: 연속 click/Enter가 한 Promise를 공유하는 RED 검사를 추가한다**

~~~js
  const persistPage = await openPage({
    persistedValue: false,
    estimateDeferred: true,
    persistDeferred: true
  });
  await persistPage.page.evaluate(() => backupCenter());
  const first = persistPage.page.locator('#bcPersist');
  await first.click({ noWaitAfter: true });
  const beforeResolve = await persistPage.page.evaluate(() => ({
    calls: __storageProbe.persistCalls,
    active: __storageProbe.activationAtPersist[0],
    same: __storageGuard.persistInFlight === storageGuardRequestPersist()
  }));
  assert.equal(beforeResolve.calls, 1);
  assert.equal(beforeResolve.active, true);
  assert.equal(beforeResolve.same, true);
  await persistPage.page.waitForFunction(
    () => __storageProbe.resolveEstimate !== null
  );
  await persistPage.page.evaluate(() => __storageProbe.resolveEstimate());
  await persistPage.page.evaluate(() => __storageProbe.resolvePersist(true));
  await assert.doesNotReject(
    persistPage.page.waitForFunction(
      () => __storageGuard.persisted.kind === 'yes'
    )
  );
  await persistPage.context.close();
~~~

- [ ] **Step 2: false/reject/부분 지원 RED 검사를 추가한다**

각 새 context에서 persist false/reject와 persisted-only, persist-only, estimate-only를 실제 DOM과 호출 수로 검사한다.

~~~js
async function partialSupport(settings) {
  const opened = await openPage(settings);
  await opened.page.evaluate(async () => {
    await window.__hjRestoreDone;
    backupCenter();
    await storageGuardRefresh();
  });
  const button = opened.page.locator('#bcPersist');
  const result = {
    text: await opened.page.locator('#bcStorageStatus').innerText(),
    disabled: await button.isDisabled(),
    errors: opened.errors,
    calls: await opened.page.evaluate(() => __storageProbe.persistCalls)
  };
  await opened.context.close();
  return result;
}

const persistedOnly = await partialSupport({
  hasPersisted: true,
  hasPersist: false,
  hasEstimate: false
});
assert.match(persistedOnly.text, /요청 미지원/);
assert.equal(persistedOnly.disabled, true);
assert.equal(persistedOnly.calls, 0);
assert.deepEqual(persistedOnly.errors, []);

const persistOnly = await partialSupport({
  hasPersisted: false,
  hasPersist: true,
  hasEstimate: false
});
assert.match(persistOnly.text, /상태 확인 미지원/);
assert.equal(persistOnly.disabled, false);
assert.deepEqual(persistOnly.errors, []);

const estimateOnly = await partialSupport({
  hasPersisted: false,
  hasPersist: false,
  hasEstimate: true
});
assert.match(estimateOnly.text, /요청 미지원/);
assert.match(estimateOnly.text, /MB|GB/);
assert.equal(estimateOnly.disabled, true);
assert.deepEqual(estimateOnly.errors, []);
~~~

persist false는 브라우저 정책상 적용되지 않음, reject와 sync throw는 요청 실패를 표시해야 한다. 세 case 모두 errors.length 0, state/appState deep equality, 실제 클릭 시 persistCalls 1을 별도 assert한다.

~~~js
async function persistFailure(settings, expected) {
  const opened = await openPage(settings);
  await opened.page.evaluate(() => backupCenter());
  await opened.page.locator('#bcPersist').click();
  await opened.page.waitForFunction(() =>
    __storageGuard.persistInFlight === null
  );
  const result = {
    text: await opened.page.locator('#bcStorageStatus').innerText(),
    calls: await opened.page.evaluate(() => __storageProbe.persistCalls),
    errors: opened.errors
  };
  assert.equal(result.text.includes(expected), true);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.errors, []);
  await opened.context.close();
}

await persistFailure(
  { persistedValue: false, persistValue: false },
  '브라우저 정책상 적용되지 않음'
);
await persistFailure(
  { persistedValue: false, persistReject: true },
  '영속 보관 요청 실패'
);
await persistFailure(
  { persistedValue: false, persistThrow: true },
  '영속 보관 요청 실패'
);
~~~

- [ ] **Step 3: RED를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/storage-durability.e2e.js' -ExpectRed
~~~

Expected: #bcPersist handler 부재, pending estimate 전에 persistCalls 0, 또는 중복 calls 2로 실패한다.

- [ ] **Step 4: async가 아닌 함수에서 persist Promise를 즉시 만든다**

~~~js
function storageGuardRequestPersist() {
  const guard = window.__storageGuard;
  if (guard.persistInFlight) return guard.persistInFlight;
  if (guard.persisted.kind === 'yes') return Promise.resolve(true);
  const api = navigator.storage || {};
  if (typeof api.persist !== 'function') {
    guard.persisted = { kind: 'unsupported', message: '영속 보관 요청 미지원' };
    storageGuardRenderIntoBackupCenter();
    return Promise.resolve(false);
  }

  let request;
  try {
    request = api.persist();
  } catch (_) {
    guard.persisted = { kind: 'error', message: '영속 보관 요청 실패' };
    storageGuardRenderIntoBackupCenter();
    return Promise.resolve(false);
  }
  const promise = Promise.resolve(request)
    .then(granted => {
      guard.persisted = granted
        ? { kind: 'yes', message: '영속 보관 적용됨' }
        : { kind: 'no', message: '브라우저 정책상 적용되지 않음' };
      storageGuardRenderIntoBackupCenter();
      return granted === true;
    })
    .catch(() => {
      guard.persisted = { kind: 'error', message: '영속 보관 요청 실패' };
      storageGuardRenderIntoBackupCenter();
      return false;
    })
    .finally(() => {
      if (guard.persistInFlight === promise) {
        guard.persistInFlight = null;
        storageGuardRenderIntoBackupCenter();
      }
    });
  guard.persistInFlight = promise;
  storageGuardRenderIntoBackupCenter();
  return promise;
}
~~~

storageGuardRequestPersist를 async로 선언하지 않는다. api.persist 앞에 await를 두지 않는다.

- [ ] **Step 5: click handler의 첫 비동기 작업으로 호출한다**

~~~js
document.getElementById('bcPersist').onclick = function () {
  const request = storageGuardRequestPersist();
  request.then(() => storageGuardRefresh());
};
~~~

키보드는 native button의 click activation을 사용한다. 별도 keydown에서 중복 호출하지 않는다.

- [ ] **Step 6: 버튼 접근성과 중복 방지를 구현한다**

- min-height: 44px
- width: 100%, max-width: 100%
- in-flight 동안 aria-busy=true와 disabled
- 완료 뒤 disabled 해제
- persisted yes이면 이미 보호됨 표시와 disabled

renderer가 async update 중에도 button element와 focus를 불필요하게 교체하지 않도록 textContent, disabled, aria-busy만 갱신한다.

- [ ] **Step 7: 집중 검사를 GREEN으로 만든다**

Expected: activationAtPersist[0] true, persistCalls 1, 부분 지원/reject pageerror 0.

- [ ] **Step 8: Task 3 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 4: 데이터·서버 백업 UI 보존과 모바일 회귀

**Files:**

- Modify: tests/storage-durability.e2e.js
- Verify: index.html:18954-18991

- [ ] **Step 1: 데이터 보존 RED 검사를 추가한다**

estimate reject, persist false, persist reject 세 context에서 실제 실패 동작을 실행하고 전후 값을 비교한다.

~~~js
async function assertDataPreserved(settings, action) {
  const opened = await openPage(settings);
  const page = opened.page;
  await page.evaluate(() => window.__hjRestoreDone);
  const before = await page.evaluate(async () => {
    state.projects = [{
      id: 'storage-project-sentinel',
      name: '보존 대상'
    }];
    state.files = [{
      id: 'storage-file-sentinel',
      projectId: 'storage-project-sentinel'
    }];
    await idbSet('appState', serializeData());
    return {
      projects: JSON.parse(JSON.stringify(state.projects)),
      files: JSON.parse(JSON.stringify(state.files)),
      appState: await idbGet('appState')
    };
  });

  if (action === 'estimate') {
    await page.evaluate(() => storageGuardRefresh());
  } else {
    await page.evaluate(() => backupCenter());
    await page.locator('#bcPersist').click();
    await page.waitForFunction(() =>
      __storageGuard.persistInFlight === null
    );
  }

  const after = await page.evaluate(async () => ({
    projects: JSON.parse(JSON.stringify(state.projects)),
    files: JSON.parse(JSON.stringify(state.files)),
    appState: await idbGet('appState')
  }));
  assert.deepEqual(after, before);
  assert.deepEqual(opened.errors, []);
  await opened.context.close();
}

await assertDataPreserved(
  { estimateReject: true },
  'estimate'
);
await assertDataPreserved(
  { persistedValue: false, persistValue: false },
  'persist'
);
await assertDataPreserved(
  { persistedValue: false, persistReject: true },
  'persist'
);
~~~

- [ ] **Step 2: 지연 estimate 중 서버 백업 표시 보존 검사를 추가한다**

estimateDeferred probe로 성공/실패 두 context를 만들고 다음 실제 assertion을 실행한다.

~~~js
async function backupStatusSurvives(stat, expected) {
  const opened = await openPage({ estimateDeferred: true });
  await opened.page.evaluate(value => {
    __relay.url = 'https://relay.test/exec';
    __relay.token = 'test-token';
    __relayBackupStat = value;
    backupCenter();
  }, stat);
  const before = await opened.page.locator('#modalRoot').innerText();
  assert.equal(before.includes(expected), true);
  assert.equal(
    await opened.page.evaluate(() => __storageProbe.resolveEstimate !== null),
    true
  );
  await opened.page.evaluate(() => __storageProbe.resolveEstimate());
  await opened.page.waitForFunction(
    () => __storageGuard.estimate.kind !== 'unknown'
  );
  const after = await opened.page.locator('#modalRoot').innerText();
  assert.equal(after.includes(expected), true);
  assert.deepEqual(opened.errors, []);
  await opened.context.close();
}

await backupStatusSurvives(
  { ok: true, d: '2026-08-27' },
  '서버 날짜별 백업 — 마지막 성공 2026-08-27'
);
await backupStatusSurvives(
  { ok: false, d: '2026-08-27', msg: 'test-failure' },
  '서버 날짜별 백업 실패'
);
~~~

- [ ] **Step 3: 390×844 모바일 접근성 검사를 추가한다**

~~~js
const mobile = await page.evaluate(() => {
  const button = document.getElementById('bcPersist');
  const rect = button.getBoundingClientRect();
  return {
    height: rect.height,
    right: rect.right,
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    label: button.textContent.trim()
  };
});
assert.equal(mobile.height >= 44, true);
assert.equal(mobile.right <= mobile.viewport + 1, true);
assert.equal(mobile.scrollWidth <= mobile.viewport, true);
assert.equal(mobile.label.length > 0, true);
~~~

click과 Space 각각으로 버튼이 활성화되는지도 별도 fresh context에서 확인한다.

- [ ] **Step 4: pageerror와 삭제 API 부재를 검사한다**

- 모든 scenario의 pageerror 배열 길이 0
- storage 관련 helper 소스에 state.files=[], state.projects=[], indexedDB.deleteDatabase, localStorage.clear, caches.delete가 없음

- [ ] **Step 5: 신규 검사와 기존 백업·복원·모바일 검사를 실행한다**

~~~powershell
Invoke-HjE2E -TestFile 'tests/storage-durability.e2e.js'
Invoke-HjE2E -TestFile 'tests/restore-safety.e2e.js'
Invoke-HjE2E -TestFile 'tests/backup-visible.e2e.js'
Invoke-HjE2E -TestFile 'tests/mobile-shell-a11y.e2e.js'
~~~

Expected: 모두 exit 0.

- [ ] **Step 6: Task 4 체크포인트를 확인한다**

~~~powershell
git diff --check
git status --short
~~~

---

## Task 5: v238 버전 동기화, 변이 검증, 전체 회귀

**Files:**

- Modify: index.html
- Modify: sw.js:2
- Modify: tests/version-sync.check.js

- [ ] **Step 1: 세 버전 값을 한 번에 v238로 변경한다**

~~~js
const APP_BUILD = 'hyeonjang-v238-storageguard';
~~~

~~~js
const C = 'hyeonjang-v238-storageguard';
~~~

~~~js
const TARGET_BUILD = 'hyeonjang-v238-storageguard';
~~~

- [ ] **Step 2: 정적·집중 검사를 실행한다**

~~~powershell
& $node tests/syntax.check.js
& $node tests/version-sync.check.js
& $node tests/sw-cache.check.js
Invoke-HjE2E -TestFile 'tests/storage-durability.e2e.js'
Invoke-HjE2E -TestFile 'tests/restore-safety.e2e.js'
Invoke-HjE2E -TestFile 'tests/backup-visible.e2e.js'
Invoke-HjE2E -TestFile 'tests/mobile-shell-a11y.e2e.js'
~~~

Expected: 모두 exit 0.

- [ ] **Step 3: 변이를 하나씩 적용해 새 검사가 RED가 되는지 확인하고 즉시 원복한다**

1. ratio >= 0.80을 > 0.80으로 변경한다. 80.0% 경계가 실패해야 한다.
2. boot callback에 navigator.storage.persist()를 넣는다. boot persistCalls 0이 실패해야 한다.
3. api.persist 전에 await storageGuardRefresh를 넣는다. user activation 검사가 실패해야 한다.
4. persistInFlight 재사용을 제거한다. 연속 활성화 calls가 2가 되어 실패해야 한다.
5. estimate 오류에서 state.files=[]를 넣는다. 데이터 deepEqual이 실패해야 한다.
6. storage refresh가 backupCenter 전체 innerHTML을 교체하게 한다. 서버 백업 문구 보존이 실패해야 한다.

- [ ] **Step 4: 전체 80개 검사 파일을 실행한다**

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

Expected: 80/80 exit 0. 기준 78개 + v237 1개 + v238 1개다.

- [ ] **Step 5: diff 범위와 금지 동작을 검사한다**

~~~powershell
git diff --check
git status --short
git diff --name-only
rg -n "hyeonjang-v238-storageguard" index.html sw.js tests/version-sync.check.js
rg -n "deleteDatabase|localStorage\.clear|caches\.delete|state\.files\s*=\s*\[\]|state\.projects\s*=\s*\[\]" index.html
~~~

검색 결과가 기존 unrelated 코드에 존재하면 storage guard 함수 구간 diff에서 새로 추가되지 않았음을 git diff로 확인한다.

- [ ] **Step 6: v238 릴리스 커밋을 만든다**

~~~powershell
git add index.html sw.js tests/version-sync.check.js tests/storage-durability.e2e.js
git diff --cached --check
git status --short
git commit -m "feat(storage): warn before origin storage becomes unsafe"
~~~

- [ ] **Step 7: 역순 원복 가능성을 확인한다**

~~~powershell
git log -8 --oneline
git status --short
~~~

Expected:

- v237 단일 커밋이 v238보다 앞에 있다.
- v238 문제 시 v238 커밋만 revert 가능하다.
- v237까지 되돌릴 때는 v238을 먼저 revert한다.
- push, merge, 배포는 수행하지 않는다.

---

## Review Checklist

- [ ] boot에서 persist 호출은 0건이다.
- [ ] persisted와 estimate는 restore 성공 뒤 및 backupCenter 열 때만 읽는다.
- [ ] persist는 trusted button activation의 첫 비동기 호출이다.
- [ ] 반복 click/keyboard가 한 in-flight Promise를 공유한다.
- [ ] API 미지원·부분 지원·reject가 pageerror 없이 구분된다.
- [ ] 79.9%는 정상, 80.0%와 95%는 백업 권고다.
- [ ] quota 0, undefined, NaN은 비율을 계산하지 않는다.
- [ ] same-origin 전체 근사값과 Cache/IndexedDB/localStorage 범위가 표시된다.
- [ ] estimate/persist 어떤 결과도 projects/files/appState를 바꾸지 않는다.
- [ ] 비동기 refresh 중 기존 서버 백업 성공·실패 문구가 유지된다.
- [ ] 390px에서 버튼이 44px 이상이고 overflow가 없다.
- [ ] v238 마커 3개와 80개 전체 검사가 일치한다.
- [ ] debug.log, 원본 dirty checkout, 외부 시스템을 건드리지 않았다.
