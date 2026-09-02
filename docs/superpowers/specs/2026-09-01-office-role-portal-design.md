# 관리사무소 역할 포털 설계

작성일: 2026-09-01

## 목표

관리사무소 직원 포털을 단지 공용 PIN 화면에서 개인 계정 기반 포털로 확장한다. 관리소장, 관리과장, 동대표, 입주민은 서버가 허용한 범위에서만 아파트 관리 상태와 관리 일지를 보고, 관리 권한이 있는 사용자는 사용자 역할과 열람 권한을 조정할 수 있다.

기존 `office-request.html` 시설보수 접수는 운영 호환을 위해 유지한다. 새 포털은 별도 로그인과 별도 Apps Script 프로젝트로 추가해 기존 현장 relay, OfficeIntake, OfficeOps의 장애 범위를 넓히지 않는다.

## 인증 방식

- 로그인 식별자는 `단지 코드 + 등록 이메일`이다.
- 서버가 6자리 일회용 코드를 이메일로 발송한다.
- 코드는 10분 뒤 만료되고 재사용할 수 없다.
- 브라우저에는 코드, 비밀번호, 서버 비밀키를 저장하지 않는다.
- 인증 성공 시 무작위 세션 토큰 원문을 한 번만 반환한다.
- 서버에는 세션 토큰의 HMAC 해시만 저장하며 세션은 8시간 뒤 만료된다.
- 로그아웃, 사용자 비활성화, 역할 또는 권한 변경 시 기존 세션을 폐기한다.
- 로그인 성공 전 응답은 사용자 존재 여부를 구분하지 않는 동일한 문구를 사용한다.

## 역할

| 역할 | 기본 범위 |
| --- | --- |
| `system_admin` | 사용자·권한 설정과 감사기록. 시설 상태·관리일지·대시보드 권한 없음 |
| `manager_chief` | 콘텐츠와 관리 capability 전체: 상태·일지·작업지시·접수·보고·공지·비용과 사용자·권한·감사 관리 |
| `facility_manager` | 대시보드, 시설 상태·관리일지·작업지시·공지·비용 작성. 담당자 배정과 공지 발행·비용 승인은 제외 |
| `resident_rep` | 대시보드, 공개 범위에 맞는 상태·일지·보고·공지 열람 |
| `resident` | 대시보드, 주민 공개 상태·일지·공지 열람 |

## 권한 모델

클라이언트는 서버가 반환한 권한을 화면 표시 용도로만 사용한다. 모든 API는 매 요청마다 세션, 사용자 활성 상태, 단지, 역할, 권한 버전을 다시 확인한다.

서버와 프런트가 공통으로 사용하는 capability는 다음과 같다. 이름을 임의로 변환하거나 역할만 보고 capability를 추론하지 않는다.

- `dashboard.view`
- `status.view`, `status.manage`
- `logs.view`, `logs.manage`
- `requests.view`
- `reports.view`
- `notices.view`, `notices.manage`, `notices.publish`
- `costs.view`, `costs.manage`, `costs.approve`
- `workorders.view`, `workorders.manage`, `workorders.assign`
- `admin.users.view`, `admin.users.manage`
- `admin.permissions.manage`
- `admin.audit.view`

관리자는 역할별 열람 capability를 끄거나 켤 수 있지만 서버에 정의한 role ceiling을 초과해 부여할 수 없다. 쓰기 권한과 개인정보 권한은 UI 선택만으로 확대되지 않는다.

## 공개 범위와 서버 필드 제거

관리 상태·관리 일지·작업지시·공지는 `public`, `board`, `internal` 중 하나의 공개 범위를 가진다.

- 입주민: `public`
- 동대표: `public`, `board`
- 관리과장·관리소장: `public`, `board`, `internal`
- 시스템 관리자: 별도 열람 허용이 없으면 관리 콘텐츠를 받지 않음

허용되지 않은 행은 서버가 반환하지 않는다. 허용된 행에서도 연락처, 내부 메모, 원본 Drive ID, 세부 금액 등은 해당 capability가 없으면 응답 객체에서 제거한다. 화면에서 숨기기만 하는 방식은 사용하지 않는다.

## 포털 화면

### `office-login.html`

- 단지 코드, 이메일 입력
- 일회용 코드 요청
- 일회용 코드 확인
- 설정되지 않은 서버 주소 또는 만료·과다 시도에 대한 명확한 안내

### `office-portal.html`

- 로그인 사용자·역할·단지 표시
- 관리 상태 요약
- 공개 범위에 맞는 관리 일지
- 접수번호와 연결된 작업지시·담당자 배정·기한 관리
- 공지 초안·발행, 비용 등록·승인·지급 상태, 개인정보 없는 기간 집계 보고
- 기존 시설보수 접수 화면으로 이동
- 권한이 있는 사용자만 상태·일지 작성 버튼 표시
- 권한 변경이나 세션 만료 시 즉시 로그인 화면으로 이동

### `office-admin.html`

- 사용자 목록
- 사용자 등록 또는 수정(등록만 수행하며 초대 이메일은 자동 발송하지 않음)
- 역할 변경, 활성화·비활성화
- 서버 ceiling 안의 열람 권한 override
- 감사기록 열람
- 마지막 활성 관리자 삭제, 자기 자신 잠금, 타 단지 수정 차단

## 서버 저장소

별도 Google Sheet에 다음 탭을 사용한다.

- `Offices`
- `Users`
- `OtpChallenges`
- `Sessions`
- `RolePermissions`
- `ManagementStatus`
- `ManagementLogs`
- `PortalAudit`

모든 쓰기는 `LockService` 안에서 처리한다. 감사기록에는 사용자 ID, action, entity ID, 결과, 시각만 기록하며 일지 본문·전화번호·OTP·세션 토큰은 기록하지 않는다.

`portalStatusSave`, `portalLogSave`, `portalUserSave`, `portalPermissionSave`, `portalWorkOrderSave`, `portalNoticeSave`, `portalCostSave`, `portalCostApprove`는 payload에 브라우저가 생성한 v4 UUID `requestId`를 반드시 포함한다. 한 작업의 응답이 끊기거나 실패하면 같은 `requestId`로 재시도하고, 성공하거나 사용자가 편집 대상 또는 새 입력을 명시적으로 바꾼 뒤에만 새 UUID를 만든다. 활성화·비활성화도 사용자와 목표 상태가 같은 재시도에는 같은 `requestId`를 사용한다.

운영 API는 `portalWorkOrderList`/`portalWorkOrderSave`, `portalNoticeList`/`portalNoticeSave`, `portalCostList`/`portalCostSave`/`portalCostApprove`, `portalReportSummary`를 사용한다. 작업지시 목록의 `assignees`는 `workorders.assign` 권한이 있을 때만 반환하며, 배정 권한이 없는 사용자가 기존 작업지시를 수정할 때는 `assigneeUserId`를 보내지 않아 기존 배정을 보존한다. 비용은 `draft` 상태에서만 수정하거나 승인 요청할 수 있고, `submitted` 이후에는 수정하지 않는다. 승인 흐름은 `submitted`에서 `approved` 또는 `cancelled`, `approved`에서 `paid` 또는 `cancelled`로만 이동한다. 보고 API는 기간과 aggregate만 반환하고, 작업지시 집계는 `reports.view`와 기록 공개 범위로 제한한다. 비용 항목·상태별 금액은 `costs.view`가 있을 때만 포함하고 전부 세금 구분을 반영한다. `totalAmountKrw`는 취소 제외 등록액, `pendingAmountKrw`는 초안+승인 요청액, `approvedUnpaidAmountKrw`는 승인 후 미지급액, `paidAmountKrw`는 지급 완료액이다.

## 초기 설정과 배포 경계

GitHub Pages에는 정적 화면과 Apps Script 배포 URL만 공개한다. Apps Script 비밀키, Sheet ID, 관리자 초기화 값은 Script Properties에만 둔다.

최초 단지와 `system_admin` 계정은 Apps Script 편집기에서 서버의 `portalBootstrapFromProperties_()` 함수를 직접 실행해 등록한다. 공개 웹에서 최초 관리자를 자체 생성하는 기능은 제공하지 않는다.

완료 판정은 다음이 모두 충족되어야 한다.

1. GitHub Pages 정적 파일 배포
2. 별도 Apps Script 프로젝트 새 버전 배포
3. Script Properties와 Google Sheet 설정
4. 최초 단지와 `system_admin` 등록
5. 실제 이메일 코드 수신 및 로그인 확인
6. 다섯 역할의 허용·거부 동작을 실제 계정으로 확인

로컬 테스트 통과만으로 실제 로그인이 완료되었다고 보고하지 않는다.

Apps Script의 새 `/exec` 주소를 발급받은 뒤에는 저장소 루트에서 다음 명령으로 공개 설정 파일만 안전하게 활성화한다. 이 명령은 token, PIN, secret, password, OTP 인자를 받지 않는다.

```powershell
node scripts/configure-office-portal-api.mjs --url "https://script.google.com/macros/s/배포_ID/exec" --enable
```

연결을 중단할 때는 `node scripts/configure-office-portal-api.mjs --disable`을 사용한다. 기존 `office-api.json`은 공유 PIN 접수 포털용이므로 덮어쓰지 않는다.

## GitHub Pages 프레임 방어 한계

GitHub Pages 정적 호스팅에서는 이 저장소가 포털 경로별 `X-Frame-Options` 또는 응답 헤더의 `Content-Security-Policy: frame-ancestors 'none'`를 직접 설정할 수 없다. HTML의 CSP `<meta>`에 `frame-ancestors`를 적는 방식도 응답 헤더와 동일한 보안 보장을 제공하지 않는다.

따라서 로그인·포털·관리 화면은 문서 파싱 초기에 실행되는 동일 출처 스크립트로 `window.self !== window.top`을 확인한다. 프레임 안이면 문서를 즉시 숨기고 로딩을 중단한 뒤 `about:blank`로 전환하며, 나머지 포털 스크립트도 실행을 거부한다. 이는 클릭재킹 위험을 줄이는 정적 호스팅용 보완책이며 HTTP 응답 헤더와 동일한 보안 보장은 아니다. 응답 헤더 강제가 필수인 운영 환경에서는 해당 헤더를 설정할 수 있는 호스팅 또는 프록시로 이전해야 한다.

## 회귀 및 보안 검사

- 기존 `office-request.html` PIN 접수 흐름 유지
- 역할 5종의 허용·거부 표 검사
- 주민과 동대표 응답에서 개인정보·내부 메모 제거 검사
- 권한 변경 뒤 기존 세션 무효화 검사
- 마지막 관리자 보호 검사
- 타 단지 행 접근 차단 검사
- OTP·세션 원문이 Sheet, 로그, GitHub Pages 산출물에 없는지 검사
- 모바일 390px과 PC 화면에서 로그인·대시보드·관리 화면 확인
