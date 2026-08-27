# 현장 웹 안정성과 홈페이지 문의 개인정보 3단계 개선 설계

## 문서 상태

- 상태: 사용자 승인 설계
- 작성일: 2026-08-27
- 승인된 구현 순서: 1 → 2 → 3
- 대상 저장소:
  - 내부 현장 운영 PWA hyeonjang
  - 공개 홈페이지 manmool
- 기준 커밋:
  - hyeonjang: ffb442f215f0dce2dc0515d483abf449e2fd7d44
  - manmool: 23564635aaea9c5d0b99358996bcfe4242e153fc
- 이 문서 다음 단계: 문서 검토·승인 뒤 별도 구현 계획을 작성한다.

## 1. 목적

이번 개선은 이미 구현된 관리사무소 접수 기능을 더 자주 확인하고, 현장 웹의 기기 저장공간 위험을 미리 알리며, 홈페이지 문의 전송 실패 시 고객 개인정보가 브라우저에 오래 남지 않게 하는 작업이다.

구현 우선순위는 다음과 같다.

1. 현장 웹의 관리사무소 접수 자동 동기화와 오래된 상태 경고
2. 현장 웹의 브라우저 저장소 영속성·용량 보호
3. 만물 홈페이지의 실패 문의 개인정보 로컬 저장 제거

세 단계는 서로 독립된 커밋과 검증 단위로 진행한다. 앞 단계가 실패하면 다음 단계를 섞어서 수정하지 않는다.

## 2. 고정된 작업 경계

### 포함

- 복원 완료 뒤 관리사무소 접수함 자동 조회
- 온라인 복귀와 화면 재진입 시 중복 제한이 있는 자동 조회
- 마지막 성공 동기화 시각과 15분 이상 미성공 상태 표시
- Storage API 지원 여부, 영속성 상태, 사용량·할당량 표시
- 사용자가 누르는 버튼을 통한 영속 저장 요청
- 사용량 80% 이상 경고
- 일반 상담과 누수 상담의 실패 문의를 현재 탭 메모리에서만 재시도
- 기존 manmul_inquiries 브라우저 저장 키의 안전한 제거
- 실제 동작과 일치하는 개인정보처리방침
- 신규 보호 동작의 자동검사와 변이 검증

### 제외

- Apps Script API, 데이터 모델, Script Properties 변경
- 관리사무소 접수 서버 자동 배포 또는 활성화
- 60초 간격의 주기적 폴링
- 신규 자동 접수 조회 관리자가 officeIntakeFlush 또는 상태 쓰기 API를 직접 호출하는 동작
- 사진 삭제, 이동, 압축, 재배치
- 현장 웹의 브라우저 저장공간 자동 정리
- Web3Forms, n8n 또는 다른 외부 전송 서비스 설정 변경
- 서버 측 문의 보관정책 변경
- main 병합, push, GitHub Pages 배포
- 실제 계정 로그인, 운영 데이터 변경, 실발송

## 3. 공통 원칙

1. 복원 전에는 네트워크 동기화를 시작하지 않는다.
2. 자동 작업은 기존 자료를 지우거나 덮어쓰는 복구 수단이 아니다.
3. 성공으로 확인된 응답만 성공 시각과 제출 완료 상태를 갱신한다.
4. 미지원 브라우저는 기능 제한을 설명하되 앱 전체 실패로 처리하지 않는다.
5. 개인정보는 실패 복구 편의보다 최소 보관을 우선한다.
6. 자동 알림은 반복 토스트로 사용을 방해하지 않고 상태 영역에서 설명한다.
7. 각 단계는 RED → GREEN → 전체 회귀 → 변이 검증 순으로 확인한다.

## 4. 전체 구조

    hyeonjang 앱 상태 복원 완료
      ├─ 최초 자동 접수 조회
      ├─ 온라인 복귀 자동 접수 조회
      ├─ foreground 복귀 자동 접수 조회
      └─ 백업센터 저장소 상태 조회

    manmool 일반·누수 문의
      ├─ 외부 전송 성공 → 제출 완료
      └─ 외부 전송 실패
          ├─ 현재 탭 메모리에서만 재시도
          ├─ 다시 시도·전화·문자 안내
          └─ 새로고침 시 의도적으로 폐기

신규 자동 접수 조회 관리자의 네트워크 동작은 서버의 officeInbox 읽기만 수행한다. 기존 앱에는 저장 성공 뒤 officeIntakeFlush를 실행하는 relay 경로가 있으므로, 자동 조회 결과의 로컬 저장이 markDirty, cloudAutoSave, relaySaveNow, cloudFlushQueue 또는 officeIntakeFlush를 연쇄 호출하지 않게 분리한다. 기존 relay 저장·큐 복구·수동 상태 동기화 동작은 이번 단계에서 변경하지 않는다.

## 5. 1단계 — 관리사무소 접수 자동 동기화

### 5.1 시작 게이트

- window.__hjRestoreDone이 성공하고 기존 상태 적용이 끝난 뒤에만 자동 동기화 관리자를 시작한다.
- 스크립트 로드 시점이나 복원 진행 중에는 officeIntakeSync를 호출하지 않는다.
- 복원이 실패하면 자동 동기화를 시작하지 않는다. 기존 복구 안내와 수동 복구 경로를 우선한다.
- 현재 __hjRestoreDone은 내부 오류를 삼키므로, 구현 시 호환 가능한 복원 결과 객체를 반환하도록 바꾼다.
- 복원 결과는 최소 ok, restoredAt, errorCode를 포함한다. 정상 신규 기기처럼 저장 상태가 없는 경우도 ok true이고, IndexedDB 읽기 또는 applyData 실패는 ok false이다.
- errorCode는 restore-failed 같은 정제된 값만 사용하고 원문 예외나 고객 자료를 담지 않는다.
- 기존 __hjRestoreDone 소비자는 반환값을 사용하지 않아도 계속 동작해야 한다.
- relay URL과 토큰은 relayBoot에서 별도로 복원되므로, 자동 관리자는 복원 성공과 relay 설정 복원 완료를 모두 기다린다.
- relay 설정 준비 결과는 window.__hjRelayConfigDone one-shot Promise로 공유한다. 결과는 최소 ok, ready, completedAt, errorCode를 포함한다.
- window.__hjRelayConfigDone은 relay URL·토큰·기기 정보의 IDB 읽기 완료 직후 ready 여부를 확정하고, 기존 cloud queue·health 동작은 그 뒤 독립적으로 계속한다.
- relay 설정 복원이 실패하면 최초 자동 조회를 시작하지 않는다.
- relayReady가 false이거나 navigator.onLine이 명시적으로 false이면 네트워크 호출 없이 종료한다.

### 5.2 자동 트리거

자동 조회는 다음 세 경우에만 요청한다.

1. 상태 복원 성공과 relay 설정 복원 완료 직후 한 번
2. window의 online 이벤트 발생 시
3. document.visibilityState가 visible로 바뀔 때

첫 자동 조회는 복원 성공과 relay 설정 복원 완료가 모두 확인된 뒤 정확히 한 번 예약한다. 주기 네트워크 타이머는 두지 않는다. 사용자가 현장 웹을 계속 열어 둔 상태에서 새 접수를 즉시 받는 실시간 폴링은 이번 범위가 아니다.

### 5.3 중복과 동시 실행 제어

- 자동 요청의 마지막 시작 시각은 메모리 변수로 관리한다.
- relay 미설정이나 오프라인으로 실제 호출을 시작하지 않은 경우에는 자동 제한 시각을 갱신하지 않는다.
- 마지막 자동 요청 시작 후 60초가 지나지 않았다면 뒤이은 자동 트리거는 네트워크 호출을 만들지 않는다.
- 자동, 수동, 접수 승인 복구를 포함한 모든 officeInbox 조회는 공통 coordinator를 통과한다.
- 기존 공개 진입점 officeIntakeSync(options)를 coordinator로 유지하고, 실제 단일 inbox 요청·merge는 내부 officeIntakeFetchInbox가 담당한다.
- options.source는 auto, manual, recovery 중 하나이며 누락 시 기존 호출 호환을 위해 manual로 취급한다.
- 동시에 실행할 수 있는 officeIntakeSync는 최대 하나다.
- 실행 중 새 자동 트리거가 오면 기존 Promise를 공유하거나 조용히 종료한다.
- 사용자가 누르는 기존 수동 다시 동기화는 자동 60초 제한을 우회할 수 있다.
- 수동 요청도 실행 중인 동일 동기화가 있으면 새 호출을 만들지 않고 그 결과를 공유한다.
- 접수 승인 복구 요청도 자동 60초 제한을 우회하지만 실행 중인 동일 동기화 결과를 공유한다.
- 자동 제한 시각은 성공 시각과 분리한다. 실패를 성공으로 기록하지 않는다.

이 규칙은 앱 시작, online, visible 이벤트가 짧은 시간 안에 연속으로 발생해 같은 inbox를 반복 조회하는 일을 막으면서도 사용자의 수동 복구 시도를 막지 않는다.

### 5.4 성공·실패 상태

- 기존 state.officeIntake.lastSyncAt은 officeInbox가 성공 응답을 반환한 때만 갱신한다.
- 실패 시 inbox, cursor, aptOrders, files, outbox와 기존 lastSyncAt을 그대로 둔다.
- 실패 원인은 기존 정제된 lastError 규칙을 사용한다.
- 자동 실패는 같은 오류의 토스트를 반복하지 않는다.
- 수동 동기화는 기존 사용자 피드백을 유지한다.
- 자동 동기화 결과는 기존 persistLocal 디바운스 경로를 사용해 IndexedDB appState에 로컬 전용으로 내구 저장한다. 별도 병렬 IDB writer를 만들지 않는다.
- 자동 경로의 로컬 저장은 markDirty와 cloud 자동 저장을 우회하여 outbox 전송을 촉발하지 않는다.
- 자동 성공의 inbox·lastSyncAt 변경과 자동 실패의 lastError 변경 모두 같은 로컬 전용 저장·화면 갱신 경계를 사용한다.
- 자동 경로가 officeAccept, officeSetStatus 또는 officeIntakeFlush를 직접 호출하지 않는다.
- 수동 버튼과 접수 승인 복구 경로는 기존 명시적 후속 처리와 피드백을 유지한다.
- 자동 요청에 수동 또는 복구 호출이 합류하면 네트워크 응답은 공유하되, 합류한 호출자의 기존 명시적 후속 처리만 응답 뒤 실행한다.

### 5.5 오래된 상태 표시

- relay가 설정된 상태에서 마지막 성공 동기화 후 15분 이상 지나면 관리사무소 접수 영역에 오래된 상태 경고를 표시한다.
- lastSyncAt이 없는 첫 실행은 복원 완료 시각을 기준으로 15분이 지난 뒤 경고한다.
- lastSyncAt이 파싱 불가이거나 현재보다 미래이면 유효하지 않은 값으로 보고 복원 완료 시각을 기준으로 삼는다.
- 15분 이내이면 마지막 성공 시각을 일반 정보로 표시하고 경고색을 사용하지 않는다.
- 성공하면 즉시 경고를 해제하고 마지막 성공 시각을 갱신한다.
- 복원 완료와 성공 시각을 기준으로 15분 경계에 한 번 실행되는 로컬 표시 타이머를 예약한다.
- 표시 타이머는 상태 문구만 다시 계산하며 네트워크 호출을 만들지 않는다. 성공 시 기존 타이머를 취소하고 새 경계로 예약한다.
- 성공으로 inbox가 바뀌면 관리사무소 신규 접수 배지와 열린 접수 상태 화면을 즉시 다시 그린다.
- 실패가 반복되어도 경고 문구는 한 곳에만 표시한다.
- relay 미설정 상태는 오래됨이 아니라 설정 필요 상태로 구분한다.

표시 예시는 다음 의미를 지켜야 한다.

- 정상: 마지막 확인 5분 전
- 오래됨: 15분 이상 새 접수를 확인하지 못했습니다
- 설정 필요: 관리사무소 접수 서버 연결을 확인하세요

문구는 서버에 새 접수가 없다고 단정하지 않는다. 확인하지 못한 상태와 접수가 없는 상태를 구분한다.

### 5.6 파일과 버전

예상 변경 파일은 다음과 같다.

- hyeonjang/index.html
- hyeonjang/sw.js
- hyeonjang/tests/version-sync.check.js
- hyeonjang/tests/office-intake-auto-sync.e2e.js
- 필요 시 기존 hyeonjang/tests/office-intake-sync.e2e.js
- 필요 시 hyeonjang/tests/office-intake-ui.e2e.js

1단계 빌드 마커는 hyeonjang-v237-officesync로 고정한다.

## 6. 2단계 — 브라우저 저장소 영속성·용량 보호

### 6.1 읽기 전용 상태 확인

- 상태 복원 성공 뒤 navigator.storage.estimate 지원 여부를 확인한다.
- 백업센터를 열 때 최신 estimate를 다시 읽는다.
- navigator.storage.persisted가 있으면 현재 영속 저장 상태를 읽는다.
- estimate와 persisted 조회는 읽기 전용이며 권한 팝업을 만들지 않는다.
- 반환값은 화면용 메모리 상태로만 사용하고 appState 데이터 모델에 저장하지 않는다.

### 6.2 영속 저장 요청

- navigator.storage.persist 호출은 백업센터의 명시적 버튼 클릭에서만 실행한다.
- 클릭 핸들러는 다른 await보다 먼저 persist Promise를 생성하여 브라우저의 사용자 activation을 잃지 않는다.
- 반복 클릭과 연속 키 입력은 하나의 in-flight persist 요청을 공유한다.
- 앱 시작, 화면 진입, online 이벤트에서 자동 호출하지 않는다.
- 이미 persisted가 true이면 재요청하지 않고 현재 상태를 설명한다.
- 승인되면 브라우저가 저장자료를 자동 정리 대상으로 삼을 가능성을 낮췄다고 안내한다.
- 승인되어도 데이터 보존을 보장한다고 표현하지 않는다.
- 거절 또는 false 반환은 오류가 아니라 브라우저 정책 안내로 표시한다.
- persisted 또는 persist 중 한쪽만 지원되는 부분 지원 환경과 Promise reject를 각각 안전하게 처리한다.
- 미지원 브라우저에서는 백업 내보내기와 정기 백업 안내를 유지한다.

버튼 문구는 사용자가 브라우저 권한 요청임을 이해할 수 있게 작성한다. 예: 이 기기 저장공간 보호 요청.

### 6.3 용량 표시와 경고

- usage와 quota가 유효한 숫자이고 quota가 0보다 클 때만 비율을 계산한다.
- 사용량과 할당량은 근사값임을 표시하고 읽기 쉬운 MB 또는 GB 단위로 보여 준다.
- 표시값은 현장 웹 하나의 파일 크기가 아니라 https://01023978629.github.io origin 전체 저장공간의 근사값이라고 설명한다. 같은 origin의 다른 경로가 사용한 Cache, IndexedDB와 localStorage가 포함될 수 있다.
- usage / quota가 0.80 이상이면 주의 경고를 표시한다.
- 비율이 0.80 미만이면 일반 상태로 표시한다.
- quota가 0, undefined, NaN이거나 API가 예외를 던지면 계산하지 않고 확인할 수 없음으로 표시한다.
- 경고는 사용자가 백업하도록 안내하지만 파일·사진·기록을 자동 삭제하지 않는다.

### 6.4 데이터 안전

이 단계에서는 다음 동작을 하지 않는다.

- IndexedDB 레코드 자동 삭제
- 오래된 프로젝트 자동 보관
- 사진 바이트 제거 또는 압축
- Drive 업로드 큐 변경
- appState 구조 변경
- 저장 실패를 숨기기 위한 자동 초기화

기존 pagehide 저장, IndexedDB appState 저장, 백업 내보내기와 복원 안전장치는 그대로 유지한다.

### 6.5 파일과 버전

예상 변경 파일은 다음과 같다.

- hyeonjang/index.html
- hyeonjang/sw.js
- hyeonjang/tests/version-sync.check.js
- hyeonjang/tests/storage-durability.e2e.js
- 필요 시 hyeonjang/tests/restore-safety.e2e.js
- 필요 시 hyeonjang/tests/backup-visible.e2e.js
- 필요 시 hyeonjang/tests/mobile-shell-a11y.e2e.js

2단계 빌드 마커는 hyeonjang-v238-storageguard로 고정한다.

## 7. 3단계 — 실패 문의의 개인정보 로컬 저장 제거

### 7.1 적용 대상

- index.html의 일반 인테리어 상담
- leak.html의 누수 상담
- 공용 전송 모듈 js/lead-transport.js
- 기존 브라우저 문의함을 읽는 admin.html과 js/admin.js
- 브라우저 임시 백업을 설명하는 data/config.json
- 실제 동작을 설명하는 privacy.html

두 상담 화면은 같은 실패·재시도·개인정보 규칙을 사용한다. 관리자 화면의 외부 접수 경로 상태와 콘텐츠 편집 기능은 유지하지만, 브라우저 PII 문의함·샘플 추가·로컬 상태 변경 기능은 폐지한다.

### 7.2 실패 문의 보관 규칙

- 이름, 전화번호, 메모, 증상, 공사 범위 등 문의 payload를 localStorage에 저장하지 않는다.
- sessionStorage와 IndexedDB에도 저장하지 않는다.
- 실패 재시도가 필요하면 현재 JavaScript 탭 메모리에서 가장 최근 실패 문의만 보관한다.
- 새 실패 문의가 생기면 같은 탭의 이전 실패 초안을 교체한다.
- 전송 성공 시 메모리 초안을 즉시 비운다.
- 페이지 새로고침, 탭 닫기, 브라우저 종료 시 초안은 의도적으로 사라진다.
- 자동 백그라운드 재전송은 현재 탭이 열려 있고 online 이벤트가 발생한 경우에만 허용한다.
- 공용 모듈이 rememberFailure, retryLatest, clearFailure와 단일 in-flight Promise를 소유한다.
- 수동 다시 시도와 online 자동 재시도는 모두 같은 retryLatest를 호출하고 같은 실행 중 Promise를 공유한다.
- 각 실패 초안은 메모리 generation을 가진다. 늦게 끝난 이전 요청은 더 새로운 초안을 지우거나 성공 상태로 바꾸지 못한다.
- 자동 재시도는 한 번의 online 이벤트당 최신 초안 한 건만 대상으로 한다.

### 7.3 기존 저장자료 정리

- 공용 전송 모듈 초기화 시 legacy key manmul_inquiries만 제거한다.
- 제거 전에 내용을 로그, 화면, 분석 도구 또는 다른 저장소로 복사하지 않는다.
- 다른 localStorage 키는 건드리지 않는다.
- 제거 실패는 문의 화면 전체를 중단시키지 않는다.
- 제거 실패 시 해당 키를 읽기·렌더링·재작성하지 않고, 다음 공용 모듈 초기화에서 best-effort cleanup을 다시 시도한다.
- 이후 코드와 테스트에서 해당 키로 PII를 다시 쓰는 경로가 없어야 한다.
- js/admin.js는 manmul_inquiries를 읽거나 쓰지 않고, 기존 키가 있어도 고객 정보를 렌더링하지 않는다.
- admin.html은 js/admin.js보다 먼저 공용 js/lead-transport.js를 로드하여 관리자 페이지를 먼저 연 경우에도 같은 legacy cleanup을 실행한다.
- manmul_inquiries 문자열은 공용 전송 모듈의 best-effort removeItem 경로와 해당 보호 테스트 외의 운영 코드에 남기지 않는다.
- admin.html의 문의 영역은 브라우저에 문의를 보관하지 않는다는 안내와 실제 외부 접수 경로 상태만 보여 준다.
- data/config.json의 demoMode 호환 설명은 로컬 PII 백업이 없다는 실제 동작으로 고친다. 외부 전송 설정값 자체는 바꾸지 않는다.

### 7.4 제출 상태와 대체 행동

- HTTP 2xx만으로 deliver 성공을 확정하지 않는다.
- Web3Forms 응답은 파싱 가능한 JSON의 success true를 확인해야 성공이다.
- n8n 또는 일반 forms 응답은 파싱 가능한 JSON의 ok true 또는 success true를 확인해야 성공이다.
- 빈 본문, 비JSON 본문, 명시적 false, timeout과 늦은 응답은 성공으로 표시하지 않는다.
- 위 제공자 성공 계약을 통과해 deliver가 true를 반환한 경우에만 제출 완료를 표시한다.
- 네트워크 오류, timeout, 미구성, false 응답은 아직 전송되지 않았습니다로 표시한다.
- 전송 실패 화면에 다시 시도, 전화, 문자 또는 내용 복사 경로를 유지한다.
- 전화·문자 앱을 열었다는 사실을 실제 전송 완료로 표시하지 않는다.
- 사용자가 새로고침하면 초안이 사라진다는 점을 실패 화면에 짧게 알린다.
- 허니팟 감지처럼 실제 전송하지 않은 경로도 고객에게 거짓 성공을 표시하지 않는다.
- 일반·누수 화면 모두 다시 시도, 전화, 문자, 내용 복사의 같은 대체 행동을 제공한다.
- 사용자 이름·메모·증상 등 payload를 성공·실패 화면에 표시할 때는 textContent 또는 명시적 이스케이프를 사용하고 innerHTML에 원문을 삽입하지 않는다.

### 7.5 개인정보처리방침 정합성

privacy.html은 다음 사실을 명확히 설명한다.

- 홈페이지 상담은 설정된 외부 폼 전송 서비스로 전달될 수 있다.
- 자동 전송에 실패한 문의 내용은 브라우저 영구 저장소에 보관하지 않는다.
- 현재 탭에서 다시 시도할 수 있으나 새로고침하면 폐기된다.
- 서버에 성공적으로 전달된 자료의 보유·처리 설명과 브라우저 실패 초안의 처리 설명을 구분한다.

외부 전송 서비스의 계정 설정이나 서버 보유기간은 이번 코드 변경으로 바꾸지 않는다.

### 7.6 파일과 버전

예상 변경 파일은 다음과 같다.

- manmool/js/lead-transport.js
- manmool/js/inquiry.js
- manmool/js/leak-inquiry.js
- manmool/js/admin.js
- manmool/admin.html
- manmool/data/config.json
- manmool/privacy.html
- manmool/scripts/ensure-conversion-basics.mjs
- manmool/scripts/ensure-leak-inquiry.mjs
- manmool/tests/lead-transport.test.cjs
- manmool/tests/lead-privacy.e2e.cjs
- 필요 시 manmool/tests/unified-brand-design.e2e.cjs

ensure-conversion-basics와 ensure-leak-inquiry의 기존 RETENTION_DAYS, pruneExpired, saveLocal 필수 조건은 제거한다. 대신 PII 영구 저장 금지, legacy key 제거, 두 폼의 공용 메모리 재시도, 서버 보유 안내와 브라우저 실패 초안 안내의 구분을 검사한다. ensure-lead-route-parity와 관리자 콘텐츠 편집 검사는 외부 접수 경로 상태와 편집 기능 보존을 계속 검증한다.

3단계는 manmool의 별도 개인정보 보호 커밋으로 만든다. office-api.json을 활성화하거나 외부 전송 설정값을 바꾸지 않는다.

## 8. 오류 처리

### 현장 웹 자동 동기화

- 네트워크 불가: 호출하지 않고 기존 자료 유지
- 인증·설정 오류: 정제된 설정 안내, 비밀값 미표시
- 서버 오류: 기존 접수 목록과 마지막 성공 시각 유지
- 중복 트리거: 추가 호출 없이 기존 실행 결과 공유
- 복원 지연: 복원 완료 전 호출 금지

### 현장 웹 저장소

- API 미지원: 지원하지 않음 안내와 백업 경로 제공
- persist 거절: 브라우저 정책 안내, 앱 사용 지속
- estimate 실패: 용량 확인 불가 안내, 계산 중단
- 80% 이상: 백업 권고만 표시, 자동 정리 금지

### 홈페이지 문의

- 외부 전송 실패: 미전송 표시와 현재 탭 재시도
- 새로고침: 실패 초안 폐기
- legacy key 제거 실패: 화면은 계속 동작하되 새 PII 저장은 금지
- 직접 전화·문자: 채널을 열었다는 안내만 제공

## 9. 테스트 전략

### 9.1 1단계 RED 검사

신규 hyeonjang/tests/office-intake-auto-sync.e2e.js가 최소 다음 실패를 먼저 보여야 한다.

- 복원 완료 전 officeInbox가 호출되는 구현
- IndexedDB 읽기 또는 applyData 실패 뒤 officeInbox가 자동 호출되는 구현
- 지연된 relay URL·토큰 복원 뒤 최초 자동 조회가 없거나 두 번 실행되는 구현
- 60초 안의 online과 visible 이벤트가 중복 호출을 만드는 구현
- 동시에 두 officeInbox가 실행되는 구현
- 수동 다시 동기화가 자동 제한에 막히는 구현
- 자동 조회와 수동 버튼이 동시에 별도 officeInbox를 만드는 구현
- 자동 조회와 접수 승인 복구가 동시에 별도 officeInbox를 만드는 구현
- 실패가 lastSyncAt을 갱신하는 구현
- 실패가 inbox, cursor, aptOrders, files 또는 outbox를 바꾸는 구현
- pending outbox가 있는 상태에서 자동 조회의 성공 또는 실패가 officeAccept, officeSetStatus, cloud save 또는 officeIntakeFlush를 촉발하는 구현
- 자동 조회 성공 자료가 IndexedDB appState에 로컬 저장되지 않는 구현
- 15분 이상 미성공 상태 경고가 없는 구현
- 15분 경계의 로컬 표시 타이머가 네트워크 조회를 만드는 구현
- 파싱 불가 또는 미래 lastSyncAt이 경고를 영구히 막는 구현
- 성공 뒤 신규 접수 배지와 stale 상태가 즉시 갱신되지 않는 구현
- 자동 실패가 토스트를 반복하는 구현

GREEN 뒤에는 기존 office-intake-sync와 office-intake-ui 검사를 함께 실행한다.

변이 검증은 다음 보호 동작을 각각 한 번 되돌려 신규 검사가 실패하는지 확인한다.

- 복원 게이트 제거
- relay 설정 준비 게이트 제거
- 60초 제한 제거
- 자동 결과 저장에 markDirty를 사용하여 outbox를 전송
- 성공 여부와 관계없이 lastSyncAt 갱신
- 실패 시 기존 inbox 초기화

### 9.2 2단계 RED 검사

신규 hyeonjang/tests/storage-durability.e2e.js는 최소 다음을 검증한다.

- 부팅 중 persist를 자동 호출하지 않음
- 버튼 클릭에서만 persist 호출
- 클릭 핸들러의 다른 await 뒤에 persist를 호출하여 사용자 activation을 잃는 구현
- 반복 클릭 중 persist Promise 하나만 실행
- persisted true, false, 미지원 상태의 구분
- persisted만 지원, persist만 지원, 두 Promise reject의 안전한 처리
- estimate 정상값과 79.9%, 80%, 95% 경계
- quota 0, undefined, NaN과 예외의 안전한 처리
- 같은 origin 전체 근사값이라는 문구
- 경고 뒤에도 사진·프로젝트·appState를 삭제하지 않음
- estimate 비동기 갱신 중 기존 서버 백업 성공·실패 표시 유지
- 390px 화면에서 버튼과 상태 문구가 잘리지 않음
- 주요 버튼의 44px 터치 영역과 키보드 접근

restore-safety와 backup-visible 검사는 기존 복원·백업 안전장치와 서버 백업 상태가 그대로인지를 확인한다.

변이 검증은 80% 비교를 잘못 바꾸거나, 부팅 시 persist를 호출하거나, 오류 시 정리 함수를 호출하는 구현을 넣어 검사가 실패하는지 확인한다.

### 9.3 3단계 RED 검사

신규 manmool/tests/lead-transport.test.cjs는 제공자 응답 계약, 메모리 generation, 단일 in-flight와 legacy cleanup 순수 동작을 검사한다. 신규 manmool/tests/lead-privacy.e2e.cjs는 index.html, leak.html, admin.html의 실제 브라우저 흐름을 검사한다. 두 검사를 합쳐 최소 다음을 검증한다.

- 일반 문의 전송 실패 후 localStorage와 sessionStorage에 이름·전화·메모가 없음
- 누수 문의 전송 실패 후 두 저장소에 PII가 없음
- legacy manmul_inquiries 키만 제거되고 다른 키는 유지됨
- removeItem 첫 시도가 예외여도 화면이 동작하고 PII를 렌더링하지 않으며, 다음 초기화에서 성공하면 키가 제거됨
- admin.html을 먼저 열어도 기존 key를 제거하고 PII를 읽거나 렌더링하지 않음
- admin.js 운영 코드에 manmul_inquiries 읽기·쓰기 경로가 없음
- 일반·누수 두 화면 모두 현재 탭에서 명시적 다시 시도 가능
- 수동 재시도와 online 이벤트가 겹쳐도 전송 한 번만 실행
- 연속 클릭이 같은 in-flight Promise를 공유
- 새 실패 초안 뒤 늦게 끝난 이전 응답이 최신 초안이나 화면을 바꾸지 않음
- 성공 후 메모리 초안 제거
- 새로고침 뒤 자동 재전송 없음
- HTTP 200과 success false, ok false, 빈 본문, 비JSON 본문에서 제출 완료 문구 없음
- false, throw, timeout과 timeout 뒤 늦은 응답에서 제출 완료 문구 없음
- 제공자별 명시적 success true 또는 ok true에서만 제출 완료
- 전화·문자 앱 열기가 제출 완료로 바뀌지 않음
- 일반·누수 이름과 메모의 악성 HTML이 실행되지 않음
- 문의 PII를 저장하는 localStorage.setItem, sessionStorage 또는 IndexedDB 경로가 없고 legacy removeItem만 허용됨
- ensure-conversion-basics와 ensure-leak-inquiry가 영구 저장 금지 계약을 검사함
- ensure-lead-route-parity와 관리자 콘텐츠 편집 검사가 계속 통과함
- privacy.html 문구와 코드 동작 일치

변이 검증은 saveLocal의 localStorage 쓰기를 되살리거나, admin.js의 legacy reader를 되살리거나, HTTP 200을 무조건 성공으로 처리하거나, generation 확인 또는 legacy key 제거를 삭제해 검사가 실패하는지 확인한다.

### 9.4 전체 회귀

hyeonjang은 각 파일에 120초 제한을 두고 AGENTS.md에 정의된 check, e2e, unit 전체 78개 기준 파일과 새 테스트를 모두 실행한다. 테스트 서버는 깨끗한 프로세스로 시작하고 종료한다.

manmool은 다음을 모두 통과해야 한다.

- Node 기반 tests 전체
- scripts/ensure-*.mjs 전체
- Pages 산출물 정책 검사
- 일반 문의와 누수 문의 브라우저 흐름
- 390px 모바일 레이아웃 검사

테스트 성공 숫자는 마지막 일부 출력이 아니라 모든 프로세스의 종료코드로 판정한다.

## 10. 구현·커밋 순서

### 1단계

1. 자동 동기화 RED 테스트
2. 최소 구현
3. 관련 검사와 전체 hyeonjang 회귀
4. 변이 검증
5. 빌드 마커 hyeonjang-v237-officesync 확인
6. 독립 코드 리뷰
7. 1단계 전용 커밋

### 2단계

1. 저장소 보호 RED 테스트
2. 최소 구현
3. 관련 검사와 전체 hyeonjang 회귀
4. 변이 검증
5. 빌드 마커 hyeonjang-v238-storageguard 확인
6. 독립 코드 리뷰
7. 2단계 전용 커밋

### 3단계

1. 문의 개인정보 RED 테스트
2. 공용 전송 모듈과 두 폼의 최소 구현
3. 관리자 브라우저 문의함 폐지와 접수 경로 상태 보존
4. 개인정보처리방침·config 도움말·정적 검사 정합성 수정
5. 관련 검사와 전체 manmool 회귀
6. 변이 검증
7. 독립 코드 리뷰
8. 3단계 전용 커밋

한 커밋에 다음 단계의 준비 코드를 미리 섞지 않는다.

## 11. 작업트리와 배포 경계

- hyeonjang 구현은 feat/office-intake-hyeonjang 작업트리에서 진행한다.
- 원본 hyeonjang 체크아웃의 기존 수정 파일은 건드리지 않는다.
- hyeonjang 작업트리의 기존 미추적 debug.log는 보존한다.
- manmool 구현은 feat/office-intake 작업트리에서 진행한다.
- 두 작업트리 모두 main 직접 push를 하지 않는다.
- 로컬 구현·테스트·커밋까지만 수행한다.
- push, PR, merge, GitHub Pages 배포, Apps Script 배포와 운영 활성화는 결과 보고 뒤 별도 사용자 승인을 받는다.

## 12. 원복

- 1단계 문제 시 v237 커밋만 되돌리면 기존 수동 동기화가 계속 동작해야 한다.
- 2단계 문제 시 v238 커밋만 되돌리며 IndexedDB 데이터는 변경하거나 삭제하지 않는다.
- v238까지 적용된 뒤 v237을 원복해야 하면 먼저 v238을 되돌린 다음 v237을 역순으로 되돌린다. 충돌 해결 뒤 index.html, sw.js, version-sync.check.js의 최종 빌드 마커를 다시 확인한다.
- 3단계 문제 시 개인정보 저장을 되살리는 방식으로 원복하지 않는다. 재시도 UI만 이전 안정 버전으로 조정하고 PII 영구 저장 금지는 유지한다.
- 운영 배포 전 단계이므로 로컬 커밋 원복은 각 단계별 revert로 처리한다.

## 13. 완료 기준

### 1단계

- 복원 성공과 relay 설정 복원 완료 전에는 자동 네트워크 호출이 없다.
- 복원 또는 relay 설정 복원 실패를 성공으로 오인하지 않는다.
- 두 준비 단계 직후, 온라인 복귀, foreground 복귀에서 자동 조회한다.
- 자동·수동·접수 승인 복구 조회가 하나의 coordinator와 in-flight 실행을 공유한다.
- 자동 조회는 60초 중복 제한과 단일 실행을 지킨다.
- 수동 다시 동기화는 유지된다.
- 실패가 기존 자료와 마지막 성공 시각을 손상하지 않는다.
- 자동 조회 결과는 로컬에 내구 저장되지만 cloud save, outbox flush 또는 상태 쓰기를 촉발하지 않는다.
- 15분 이상 미성공 상태가 정확히 표시된다.
- 파싱 불가·미래 시각이 stale 경고를 막지 않고, 성공 뒤 배지와 경고가 즉시 갱신된다.
- hyeonjang-v237-officesync 버전과 테스트가 일치한다.

### 2단계

- estimate와 persisted 상태가 지원 범위 안에서 표시된다.
- persist는 사용자의 명시적 클릭에서 사용자 activation을 유지한 채 한 번만 호출된다.
- 80% 이상 사용량이 경고된다.
- 표시값이 같은 origin 전체의 근사 사용량임을 명시한다.
- 미지원·거절·예외가 앱 실패나 자동 삭제로 이어지지 않는다.
- 기존 저장·백업·복원 기능과 서버 백업 상태 표시가 회귀하지 않는다.
- hyeonjang-v238-storageguard 버전과 테스트가 일치한다.

### 3단계

- 일반·누수 문의 실패 PII가 localStorage, sessionStorage, IndexedDB에 남지 않는다.
- 정상 Storage API에서는 legacy manmul_inquiries 키가 제거된다. 제거 실패 시에도 운영 코드가 해당 키를 읽기·렌더링·재작성하지 않고 다음 페이지 로드에서 정리를 다시 시도한다.
- 관리자 페이지가 legacy PII를 읽거나 렌더링하지 않는다.
- 현재 탭의 공용 단일 재시도와 전화·문자·복사 대안이 두 폼에서 동작한다.
- 제공자별 명시적 성공 본문 전에는 제출 완료를 표시하지 않는다.
- 늦은 이전 응답이 새 실패 초안이나 화면을 변경하지 않는다.
- 사용자 입력이 성공·실패 화면에서 스크립트나 HTML로 실행되지 않는다.
- 개인정보처리방침이 실제 실패 초안 처리와 일치한다.
- 기존 정적 검사가 로컬 PII 보관을 요구하지 않고 새 금지 규칙을 검사한다.
- 외부 전송 설정값과 office-api.json은 바뀌지 않는다.

### 전체

- 각 단계의 집중 검사, 전체 회귀, 변이 검증이 통과한다.
- 두 저장소의 범위 밖 파일과 기존 사용자 변경은 보존된다.
- push, merge, 배포와 운영 설정 변경은 발생하지 않는다.
- 구현 결과와 남은 실기기·계정 확인 항목을 단계별로 보고한다.

## 14. 설계 이후 절차

이 문서가 사용자 검토를 통과하면 다음 작업은 세 단계의 파일별 구현 계획 작성이다. 구현 계획도 1 → 2 → 3 순서를 유지하며, 각 단계의 RED 테스트, 최소 코드 변경, 회귀검사, 변이 검증, 리뷰와 커밋 지점을 명시한다.
