# 만물 수익 운영 확장 설계

## 문서 상태

- 상태: 독립 검토 통과 · 사용자 승인 완료
- 작성일: 2026-08-30
- 최종 보완일: 2026-08-31
- 검토 결과: 구현 전 P0/P1 blocker 없음
- 대상 저장소:
  - 공개 영업 사이트 `manmool`
  - 내부 현장 운영 PWA `hyeonjang`
  - 신규 분리형 Google Apps Script 상업 승인 relay
  - 신규 분리형 Google Apps Script OfficeOps relay
- 구현 분리 원칙: 기존 `hyeonjang/apps-script/` 사진·OfficeIntake relay는 변경하지 않고, 상업 승인과 OfficeOps는 서로 다른 새 Apps Script 프로젝트·배포·토큰으로 구성한다.
- 사용자 결정:
  - 관리사무소 프로그램 사용료는 무료다.
  - 현장진단·출동·공사·정기점검 등 실제 업무는 별도 유료다.
  - 관리사무소 파일럿, 누수진단 예약 연결, 재점검, 예방점검, K-apt 기회관리의 다섯 기능을 모두 진행한다.
- 배포 경계: 이 설계의 구현·외부 계정 설정·고객 연락·입찰 제출·공개 배포는 각각 별도 단계다.

## 1. 목적

이미 구축된 `관리사무소 접수 → 대표 검토 → 현장 오더 → 사진·완료보고` 흐름을 실제 매출로 연결한다. 관리사무소에는 접수·현황 프로그램을 무료로 제공하고, 만물인테리어는 현장 확인과 시공 품질, 기록·보고 능력으로 수익을 만든다.

핵심 목표는 다음과 같다.

1. 관리사무소가 부담 없이 첫 업무를 시험 접수할 수 있다.
2. 무료 프로그램과 유료 현장 업무의 경계를 모든 화면에서 명확히 한다.
3. 누수 고객은 유상 장비진단 또는 방문 상담을 혼동 없이 신청할 수 있다.
4. 동의한 기존 고객만 6개월·12개월 재점검 대상으로 관리한다.
5. 관리사무소 공용부 예방점검을 반복 매출 상품으로 운영한다.
6. K-apt 공개 공고를 사람이 확인하는 영업기회 목록으로 관리한다.
7. 새 영업 기능이 기존 현장 데이터, 사진, 견적, 아파트 오더를 손상시키지 않는다.

## 2. 무료와 유료의 경계

### 무료 제공

- 단지별 관리사무소 직원 포털 사용
- 시설보수 접수와 진행상태 조회
- 해당 작업의 공개 승인된 완료사진·완료내용 조회
- 전화·사진 기반의 첫 상담과 업무 범위 확인
- 인테리어 1차 방문 실측
- 프로그램 이용, 계정 개통, 비밀번호 발급

### 별도 견적 후 유료

- 사전에 유료임을 안내하고 동의받은 현장 진단과 장비 누수탐지
- 일반·긴급·원거리 출동
- 자재, 인력, 철거, 수리, 방수, 미장, 타일, 마감 복구
- 공용부 정기·계절 예방점검
- 추가 보고자료나 계약 범위를 넘어서는 행정 업무

모든 유료 작업은 현장과 범위를 확인하고, 작업 범위·제외사항·부가세 포함 여부·금액·견적 유효기간·일정을 착수 전에 안내하여 승인을 받은 뒤 진행한다. 프로그램이 무료라는 문구를 무료 진단, 무료 수리, 무료 출동, 24시간 대응 또는 우선 출동 보장으로 해석할 수 없게 한다.

공개 문의와 파일럿 신청은 작업 오더가 아니다. 이 단계에서는 방문확정·작업확정·작업중·청구 상태를 만들 수 없다. 아래 네 유료 경로는 모두 같은 승인 게이트를 통과해야 한다.

1. 유상 장비 진단
2. 일반·긴급·원거리 출동
3. 수리·방수·미장·타일·마감 복구 등 실제 공사
4. 공용부 정기·계절 예방점검

각 경로는 현재 적용할 상업 조건과 그 조건을 승인한 자료를 함께 가진다.

```json
{
  "commercialTerms": {
    "workKind": "device-diagnosis|dispatch|repair|preventive-inspection",
    "scope": "승인받은 작업 범위",
    "exclusions": ["견적에서 제외한 범위"],
    "vatMode": "included|excluded",
    "quotedAmount": 100000,
    "validUntil": "2026-09-30",
    "scheduleWindow": "협의한 방문 또는 작업 일정"
  },
  "commercialApproval": {
    "receiptId": "receipt_...",
    "approvedTermsSha256": "hex-sha256",
    "approvalEvidenceType": "quote-file|contract-file|message-export-file",
    "approvalEvidenceFileId": "restricted-drive-file-id",
    "approvalEvidenceSha256": "hex-sha256",
    "approvedAt": "2026-08-30T00:00:00+09:00",
    "approvedByRole": "management-office|customer",
    "issuedAt": "2026-08-30T00:00:00+09:00",
    "receiptHmac": "server-generated-hmac"
  }
}
```

공통 비동기 게이트 `validateCommercialApproval({ subjectType, subjectId, commercialTerms, commercialApproval })`를 유료 경로의 유일한 승인 판정기로 사용한다. `commercialTerms`의 `workKind`, 공백을 정리한 `scope`, 순서를 유지한 `exclusions`, `vatMode`, 1원 이상의 정수 `quotedAmount`, `validUntil`, `scheduleWindow`를 정해진 키 순서의 UTF-8 JSON으로 직렬화해 SHA-256을 계산한다. 위 금액은 스키마 형식을 보여 주는 예시이며 공개 가격표가 아니다.

승인 영수증은 대표가 기존 견적서·계약서·승인 메시지 내보내기 파일을 제한된 Google Drive에서 직접 선택할 때 내부 relay의 `commercialApprovalIssue`가 발급한다. 서버는 선택한 파일이 존재하고 휴지통에 없으며 허용 MIME·용량을 만족하는지 확인하고 파일 bytes의 SHA-256을 계산한다. 이후 `receiptId`, `subjectType`, `subjectId`, 현재 조건 hash, 증빙 종류·file ID·file hash, 승인시각·승인자 역할, 발급시각을 `COMMERCIAL_APPROVAL_RECEIPT_KEY`로 HMAC 서명해 반환한다. 증빙 내용이나 주민 개인정보는 OfficeOps에 복사하지 않는다. 이 내부 영수증은 전자서명이나 결제 확인을 대신하지 않으며, 대표가 실제 승인 증빙을 확인했다는 변경 방지용 운영 기록이다.

판정할 때 `commercialApprovalVerify`가 서버에서 HMAC을 다시 계산하고, receipt의 대상 ID·조건 hash·승인자 역할을 현재 요청과 대조하며, 증빙 파일을 다시 읽어 file hash가 같은지 확인한다. `approvedAt <= serverNowKst <= validUntil 23:59:59 KST`도 만족해야 한다. 임의 file ID, 클라이언트가 만든 receipt, 없거나 변경·삭제된 증빙, 미래 승인시각, 조건 불일치, 만료, 서버 검증 불가 중 하나라도 있으면 fail-closed다. `commercialApprovalVerify` 응답은 `serverNowKst`, 요청 nonce, receipt ID를 포함하고 60초 동안 해당 한 번의 전이에만 사용한다.

모든 유료 오더 생성·상태 변경은 단일 경계 `executePaidWorkGate({ commandKind, subjectType, subjectId, targetState, commercialTerms, commercialApproval, createDraft })`만 사용한다. `commandKind`는 `create-order|transition-state` 두 값뿐이고 `createDraft`는 `create-order`에서만 허용한다. 이 함수가 위 검증을 통과한 뒤 작업 전 스냅샷을 만들고 신규 오더 생성 또는 한 가지 상태전이만 원자적으로 수행한다. 기존 개별 UI handler가 유료 오더를 직접 만들거나 상태를 대입하지 못하도록 호출부를 교체하고 정적 검사로 우회 경로가 0건인지 확인한다. 다음 네 실행 지점은 모두 이 함수를 호출하며 승인 실패 시 관련 데이터를 변경하지 않는다.

- 공개 누수 문의의 `paid-device-diagnosis`를 대표가 방문확정 또는 작업 오더로 바꾸는 지점
- 일반·긴급·원거리 출동을 방문확정 또는 오더로 바꾸는 지점
- 수리·공사를 작업확정·작업중·청구 상태로 바꾸는 모든 지점
- OfficeOps 예방점검을 기존 `aptOrders`로 전환하는 지점

조건 변경과 유료 실행은 서로 다른 명령으로만 처리한다. `updateCommercialTerms`는 범위·제외사항·금액·부가세·유효기간·일정 중 하나라도 바뀌면 조건을 저장하고 현재 `commercialApproval`을 `null`로 만들며 이전 승인은 감사기록에만 남긴다. `executePaidWorkGate`는 저장된 현재 조건 또는 저장 전 `createDraft`의 조건을 검증한 뒤 생성·상태전이 중 하나만 수행한다. 한 요청에 조건 변경과 유료 실행을 함께 넣으면 전체 무변경으로 `compound-command-not-allowed`를 반환한다. 무료 예외는 `free-phone-photo-consultation`과 `free-interior-first-measurement` 두 종류뿐이며 자재·장비탐지·수리 범위를 포함할 수 없다. 새 전자서명·결제 기능은 만들지 않는다.

신뢰 시각과 승인 검증은 OfficeOps 기능 스위치 및 기존 사진·OfficeIntake relay와 독립된 새 상업 승인 relay의 `commercialNow`, `commercialApprovalIssue`, `commercialApprovalVerify` 액션으로 제공한다. 세 액션은 별도 `COMMERCIAL_APPROVAL_TOKEN`을 요구하고 HMAC 비밀키는 해당 Apps Script 프로젝트의 Script Properties에만 둔다. `getTrustedCommercialNowKst()`는 응답 왕복이 10초 이하이고 수신 후 60초 이내인 `serverNowKst`만 허용한다. 이 시각이나 승인 검증을 받지 못하면 해당 유료 전이만 무변경으로 차단하고 사진·견적·기존 자료 조회와 무료 포털은 계속 동작한다.

현재 `office.html`의 `표준 패키지 500만원 이하` 문구는 판매 가격으로 오해될 수 있으므로 `프로그램 무료 · 실제 작업은 건별 견적` 안내로 교체한다. 계약·입찰 기준 금액은 영업 문구가 아니라 대표의 내부 확인사항으로 유지한다.

여기서 프로그램 무료는 관리사무소의 접수·조회 포털 이용료만 뜻한다. 대표가 내부 현장 앱에서 선택적으로 사용하는 Google·네이버·공공데이터 등 외부 제공자의 API·결제 수수료 정책과는 별개이며, 이를 관리사무소 프로그램 이용료로 자동 청구하지 않는다. 외부 API는 설정과 별도 승인 없이 활성화하지 않는다.

## 3. 범위

### 포함

1. 관리사무소 30일 시험운영 신청 퍼널
2. 공식 네이버 예약 URL을 사용하는 유상 누수진단 연결
3. 별도 동의를 기반으로 한 6개월·12개월 재점검 대상 관리
4. 공용부 예방점검 상품 안내와 내부 체크리스트
5. K-apt 공개 공고의 수동 저장·검토·마감 관리
6. 문의 유입경로와 CTA 식별자 기록
7. 영업·재점검·예방점검·공고 후보를 관리하는 내부 `OfficeOps` 화면
8. 기존 현장 데이터와 분리된 Apps Script 저장소
9. 개인정보, 오류 복구, 회귀검사, 단계별 공개와 원복

### 제외

- 프로그램 이용료·가입비·월 구독료 청구
- 자동 문자, 자동 카카오 알림톡, 자동 이메일 발송
- 네이버 계정 로그인, 예약 생성, 결제 확인의 자동화
- K-apt 또는 나라장터 자동 로그인·자동 응찰·입찰서 제출
- 새 결제, 전자계약, 견적 승인 엔진 구축
- 입찰 낙찰 가능성, 면허 적합성 또는 보험 보상 여부의 자동 확정
- 24시간 대기, 즉시 출동, 도착시간 보장
- 고객 동의 없는 재점검 홍보 연락
- 비공식 K-apt 화면 크롤링
- 영업 데이터에 주민 이름·동호수·전화번호·현장사진 저장
- 기존 `_현장.json`, `현장데이터.json`, `aptOrders`, `officeIntake`를 영업 CRM 저장소로 재사용

유료 작업의 견적·계약·착수 승인은 기존 만물인테리어 견적·계약 운영 절차를 사용하되, 모든 유료 실행 경로가 §2의 공통 승인 판정기를 통과해야 한다. 이번 기능은 승인 자료의 존재와 변경 여부만 확인하며 새 전자서명·결제 기능을 만들지 않는다.

## 4. 접근법 비교와 선택

### 접근법 A: 기존 현장 상태에 모든 기능 추가

- 장점: 화면과 저장 함수 재사용이 쉽다.
- 단점: 영업기회·마케팅 동의·공고 후보가 프로젝트·사진·견적 데이터와 함께 저장된다. 신규 기능 오류가 핵심 현장 파일의 저장·복원에 영향을 줄 수 있다.
- 결정: 제외한다.

### 접근법 B: 외부 CRM과 n8n을 중심으로 운영

- 장점: 알림과 자동화 확장이 쉽다.
- 단점: 계정, 자격증명, 유료 서비스, 개인정보 위탁과 장애 지점이 늘어난다. 현재 1인 운영 규모에 비해 초기 부담이 크다.
- 결정: 첫 출시에서는 제외하고 실제 문의량이 확인된 뒤 검토한다.

### 접근법 C: 공개 문의는 기존 전송기, 내부 운영은 별도 OfficeOps 저장소

- 장점: 현재 공개 문의의 이메일·전화 폴백을 유지하고, 영업 운영 데이터는 기존 현장 파일과 분리한다. 새 기능을 꺼도 현장 운영이 계속된다.
- 단점: 공개 문의를 내부 후보로 옮길 때 첫 버전은 대표가 한 번 확인·등록해야 한다.
- 결정: 이 방식을 채택한다.

## 5. 전체 구조

```text
일반 고객·관리사무소
  │
  ├─ manmool 공개 사이트
  │    ├─ 관리사무소 30일 시험운영 신청
  │    ├─ 유상 누수진단 상담·네이버 예약 연결
  │    └─ 공용부 예방점검 상품 안내
  │
  ├─ 기존 LeadTransport
  │    ├─ n8n 설정 시 n8n
  │    ├─ 현재 Web3Forms 이메일
  │    └─ 실패 시 전화·문자·복사 폴백
  │
  └─ 대표 검토
       │ 수동 승인·최소 정보 등록
       ▼
hyeonjang 더보기 → 영업·정기관리
  │
  ├─ 시험운영 후보
  ├─ 재점검 예정
  ├─ 예방점검 계획
  └─ K-apt 기회
       │ OFFICE_OPS_TOKEN 내부 액션만 사용
       ▼
Google Apps Script OfficeOps API
       │
       └─ 별도 OFFICE_OPS_FILE_ID

기존 현장데이터·officeIntake·aptOrders와 저장 경계 분리
```

## 6. `manmool` 공개 사이트 구성

### 6.1 관리사무소 30일 시험운영

`office.html`에 다음 내용을 추가한다.

- `접수 프로그램 이용료 0원` 안내
- `첫 1건 시험운영 신청` CTA
- 실제 출동·진단·보수는 현장 확인 후 별도 견적이라는 안내
- 30일은 프로그램 업무 흐름을 확인하는 기간이며 무제한 보수계약이 아니라는 안내

공개 신청 폼의 필수 항목:

- 단지명
- 관리사무소 담당자명
- 회신 전화번호
- 지역
- 관심 업무: 누수·배관, 공용부 보수, 예방점검, 기타
- 개인정보 수집·이용 동의

선택 항목:

- 도입 희망 시점
- 문의 내용

입주민 이름·전화번호·동호수·현장사진은 파일럿 신청 단계에서 의도적으로 받지
않는다. 문의 내용 옆에 이를 입력하지 말라는 안내를 표시하고, 국내 전화번호 형태,
숫자 동·호수, URL·사진 링크, `입주민/세대주 이름·성명`처럼 명시적인 주민정보
패턴이 있으면 전송을 막는다. 단지명·담당자명·지역·도입 희망 시점·문의 내용은
고정 길이 제한을 두고 관심 업무는 위 네 값만 허용한다. 전송 payload는
`source: office-pilot`, `sourcePage`, `ctaId`를 포함한다. n8n 원문뿐 아니라
Web3Forms 사람이 읽는 본문과 실패 시 문자·복사 내용에도 단지명, 담당자명, 지역,
관심 업무, 도입 희망 시점, 문의 내용이 빠짐없이 표시되어야 한다.

### 6.2 유상 누수진단과 네이버 예약 연결

`leak.html`의 기존 상담 폼에 신청 목적을 추가한다.

- 전화로 증상 상담
- 유상 장비진단·방문 일정 상담

전송 계약은 다음 값을 사용한다.

- `source: leak-page`
- `inquiryPurpose: phone-consult|paid-device-diagnosis`
- `preferredVisitDate`: 선택한 경우 `YYYY-MM-DD`
- `preferredVisitWindow: morning|afternoon|any`
- `bookingStatus: inquiry-only`

`LeadTransport.buildLeadText()`와 Web3Forms·n8n payload가 이 값을 그대로 보존해야 한다. 대표가 받은 제목과 본문에는 `유상 장비진단 상담` 여부가 표시되어야 한다. `bookingStatus`는 공개 사이트가 예약·결제·방문확정을 만들지 않는다는 고정값이며 외부 응답으로 `confirmed`로 바꾸지 않는다.

유상 진단 신청은 희망 날짜와 시간대를 선택 항목으로 받되, 신청만으로 방문이나 금액이 확정되었다고 표시하지 않는다. 현재 공개된 `1차 인테리어 방문 실측 무료`, `누수 장비 탐지는 착수부터 유료` 정책과 충돌하지 않게 한다.

Web3Forms·n8n 이메일 리드는 자동으로 현장 앱에 들어오지 않는다. 대표가 상담과 승인 증빙을 확인한 뒤 현장 앱의 `더보기 → 유상 진단 수동 등록`에서 `createPaidDiagnosisOrderFromManualLead()`를 실행한다. 고객 연락처와 주소는 OfficeOps가 아니라 기존 현장·오더 입력란에 대표가 직접 입력하며, 이메일 본문을 통째로 저장하거나 자동 가져오지 않는다. 브라우저 메모리에서 새 오더 ID를 먼저 생성하되 저장하지 않고, 그 ID를 receipt의 `subjectId`로 사용한다. `commercialApprovalIssue`로 실제 증빙 파일 영수증을 받은 후 `executePaidWorkGate({ commandKind: 'create-order', ... })`를 통과해야만 같은 ID의 기존 오더 한 건과 방문확정 상태를 원자적으로 저장한다. 승인 실패·취소·서버 검증 불가는 프로젝트·일정·오더를 0건 변경한다.

`data/config.json`에 공개 설정값 `naver.bookingUrl`과 `naver.ready`를 둔다.

기존 `forms.accessKey`는 Web3Forms 공식 문서가 정적 브라우저 코드에 공개해도 된다고
정의한 public form identifier이며, 관리자 권한이나 저장 데이터 읽기 권한을 주는
비밀 API 키가 아니다. 이번 작업에서는 현재 값을 바꾸거나 fixture·로그·보고서에
복사하지 않는다. 이 분류는 Web3Forms의 해당 필드에만 적용하며 다른 API 키·토큰은
계속 공개 루트에서 금지한다.

- `ready=false` 또는 공식 URL이 없으면 네이버 예약 버튼을 숨기고 기존 상담 폼과 전화만 제공한다.
- 설정된 URL은 HTTPS, 기본 포트, 사용자명·비밀번호 없음, host가 정확히 `booking.naver.com` 또는 `m.booking.naver.com`, 비어 있지 않은 path 조건을 모두 만족해야 한다. query는 공식 예약 식별자 전달을 위해 유지하고 fragment는 제거한다. 유사 도메인, 커스텀 포트, 자격정보가 들어간 URL은 거절한다.
- 버튼은 네이버 예약 화면을 여는 역할만 한다. 내부 사이트는 예약번호·결제완료·일정확정을 생성하지 않는다.

### 6.3 공용부 예방점검 상품

`office.html`에 다음 세 종류를 상품으로 안내한다.

- 우기 전: 옥상·외벽 접합부·우수관·트렌치·배수구
- 동절기 전: 급수·난방 배관·밸브·보온 상태
- 반기 공용부: 지하 배관·펌프 주변·공용 화장실·누수 흔적

화면에는 점검 대상과 산출물만 설명하고 고정가격, 안전진단 확정, 하자 판정, 무조건 수리 문구를 쓰지 않는다. 산출물은 체크리스트, 위험항목 요약, 현장사진, 보수 권고이며 실제 범위는 현장 확인 후 확정한다.

### 6.4 유입경로 기록

개인정보 필드와 의미를 섞지 않는 별도 메타데이터 필드로 다음 항목을 같은 lead payload에 추가한다.

- `sourcePage`: query와 fragment가 없는 현재 페이지의 `location.pathname`
- `ctaId`: 사용자가 누른 신청 진입점
- `referenceCase`: 공개 사례 slug가 검증된 경우의 slug 문자열. 기존 객체형
  `{slug,title}` 입력은 `LeadTransport.buildLeadText()`에서만 하위 호환으로 읽는다.
- `utmSource`, `utmMedium`, `utmCampaign`: 길이와 허용문자 제한을 통과한 값

폼에서 받은 전화번호, 주소, 증상, 이름은 URL, UTM 또는 분석 이벤트로 복사하지
않는다. UTM sanitizer는 URL query만 입력으로 받고, 각 값은 최대 80자이며
영문·숫자·한글·공백·`-_.`만 허용한다. 허용문자를 통과해도 국내 전화번호처럼
보이는 값은 버리며 이 규칙을 세 UTM 필드에 동일하게 적용한다.

## 7. `hyeonjang` 내부 OfficeOps 구성

`더보기 → 영업·정기관리`에 네 탭을 추가한다. 첫 버전은 대표 1명 전용이며 별도 직원 권한·자동 알림은 만들지 않는다.

### 7.1 시험운영 후보

필드:

```json
{
  "pilotId": "pilot_...",
  "complexName": "예시 아파트",
  "source": "website|phone|referral|kapt",
  "stage": "new|contacted|meeting|pilot|converted|closed",
  "pilotStartedAt": null,
  "pilotEndsAt": null,
  "extensionApprovedAt": null,
  "nextActionAt": "2026-09-01",
  "owner": "대표",
  "notes": "공용부 배관 보수 문의",
  "createdAt": "2026-08-30T00:00:00+09:00",
  "updatedAt": "2026-08-30T00:00:00+09:00"
}
```

주민 연락처·동호수·현장사진은 저장하지 않는다. 관리사무소 전화번호도 첫 버전 OfficeOps에는 저장하지 않고 대표 전화·이메일 수신함에서 확인한다. `converted`는 유료 구독 전환이 아니라 무료 정식 운영 관계로의 전환을 뜻하며, 이때만 기존 단지 개통 절차로 이동한다.

30일 시험운영은 관리사무소가 첫 단지 계정을 실제로 개통한 시각을 `pilotStartedAt`으로 기록하고, 그 KST 날짜를 1일차로 포함한다. `startDateKst`의 00:00:00부터 세어 `pilotEndsAt = startDateKst + 30 calendar days - 1 second`로 계산한다. 예를 들어 2026-08-31 어느 시각에 개통해도 종료시각은 2026-09-29 23:59:59 KST이며 그 시각까지 활성, 다음 1초부터 종료다. 종료 후에는 `시험운영 종료`로 표시하되 포털 자료를 삭제하거나 유료 작업을 자동 생성하지 않는다. 계속 이용하기로 하면 사용료 없이 `converted`로 바꾸고, 미결정이면 대표가 명시적으로 승인한 경우에만 `extensionApprovedAt`과 새 종료일을 기록하며, 이용하지 않으면 `closed`로 정리한다. 시험기간은 도입 확인 기간일 뿐 이후 구독료나 무료 출동·보수 횟수와 연결하지 않는다.

### 7.2 재점검 예정

재점검 대상은 별도 동의가 있는 항목만 생성한다.

```json
{
  "consentId": "consent_...",
  "subjectType": "project|aptOrder",
  "subjectId": "stable-existing-id",
  "purpose": "preventive-reinspection",
  "intervalMonths": 6,
  "channel": "sms|phone|kakao",
  "consentVersion": "reinspection-v1",
  "consentTextSnapshot": "고객이 확인한 선택 동의문 원문",
  "consentTextSha256": "hex-sha256",
  "recordedBy": "대표",
  "consentedAt": "2026-08-30T00:00:00+09:00",
  "withdrawnAt": null,
  "withdrawnBy": null,
  "withdrawalReason": null,
  "nextDueAt": "2027-02-28",
  "lastContactedAt": null,
  "evidenceType": "signed-document|message|recorded-call-note",
  "evidenceId": "existing-record-id",
  "audit": []
}
```

규칙:

- 기본값은 미동의다.
- 6개월 또는 12개월만 선택한다.
- `subjectType`과 `subjectId`를 함께 사용하고 서로 다른 종류의 ID를 추정해 연결하지 않는다.
- 동의 생성·철회·연락기록은 기존 항목을 덮어쓰지 않고 시각·행위·행위자를 `audit`에 추가한다.
- 동의문 원문과 SHA-256 해시, 수집자, 증빙 종류·식별자가 없으면 활성 동의로 취급하지 않는다.
- 동의 거부가 계약, A/S, 기존 서비스 이용을 제한하지 않는다.
- 철회 시 즉시 예정 목록과 연락 초안에서 제외한다.
- 앱은 연락 초안을 만들고 복사할 수 있지만 자동 발송하지 않는다.
- 재점검은 하자 인정, 무상 보수, 안전진단 결과를 의미하지 않는다.
- 연락 초안은 대표가 버튼을 누른 순간 OfficeOps의 활성 동의를 다시 확인한 뒤, 브라우저 메모리의 기존 프로젝트 또는 오더에서 연락처를 읽어 생성한다. 연락처를 OfficeOps에 복사하거나 저장하지 않는다. `subjectType`·`subjectId`가 없거나 철회·만료된 동의면 초안을 만들지 않는다.
- 6개월·12개월 계산은 KST 달력 기준으로 하고, 같은 일자가 없는 달은 그 달 마지막 날을 사용한다.

### 7.3 예방점검 계획

점검 템플릿은 정적 코드 자산으로 관리한다. 계획과 요약만 OfficeOps에 저장하고, 실제 작업사진과 공사 오더는 기존 승인 절차로 명시적으로 전환한다.

```json
{
  "inspectionId": "inspection_...",
  "officeId": "office_...",
  "complexName": "예시 아파트",
  "templateId": "rainy-season-v1",
  "status": "planned|checked|proposal|conversion-pending|conversion-writing|conversion-local-committed|converted|closed",
  "nextDueAt": "2027-05-01",
  "riskItems": ["지하 우수관 연결부 확인 필요"],
  "summary": "육안 점검 요약",
  "commercialTerms": null,
  "commercialApproval": null,
  "conversionId": null,
  "conversionTermsSha256": null,
  "conversionReceiptId": null,
  "pendingOrderId": null,
  "linkedOrderId": null,
  "updatedAt": "2026-08-30T00:00:00+09:00"
}
```

OfficeOps 서버 액션은 `aptOrders`를 읽거나 쓰지 않는다. `기존 오더로 전환`은 브라우저의 별도 명령 `convertOfficeOpsInspectionToAptOrder(inspectionId)`만 담당하되, 두 저장소를 하나의 트랜잭션처럼 가장하지 않고 복구 가능한 단계로 처리한다.

1. 브라우저는 아직 저장하지 않은 `pendingOrderId`를 먼저 만든다. `commercialApprovalIssue`는 반드시 `subjectType: 'aptOrder'`, `subjectId: pendingOrderId`로 receipt를 발급한다. 대표 확인, `hjSnapshot('OfficeOps 예방점검 오더 전환', true)` 성공, §2의 서버 승인 검증을 완료한다.
2. 새 `conversionId`를 만들고 `officeInspectionBeginConversion`으로 inspection을 `proposal → conversion-pending`으로 바꾼다. 서버는 `conversionId`, `pendingOrderId`, receipt ID·대상 ID·현재 조건 hash, 시작 revision을 원자적으로 고정하고 중복 conversion, receipt 대상 불일치, revision 충돌을 거절한다.
3. 실제 로컬 쓰기 직전에 `officeInspectionArmLocalCommit`으로 `conversion-pending → conversion-writing`을 만든다. 이 상태부터 cancel을 거절한다.
4. 로컬에는 고정된 `pendingOrderId`, `sourceOfficeOpsInspectionId`, `sourceOfficeOpsConversionId`를 가진 `aptOrders` 한 건만 idempotent하게 만들고 기존 현장 저장 성공을 확인한다.
5. `officeInspectionRecordLocalCommit(conversionId, pendingOrderId)`를 idempotent하게 호출해 `conversion-writing → conversion-local-committed`로 바꾸고 `linkedOrderId`를 기록한다.
6. `officeInspectionFinalizeConversion`은 저장된 `pendingOrderId === linkedOrderId`와 receipt의 `subjectType: 'aptOrder'`, `subjectId: pendingOrderId`를 다시 확인한 뒤에만 `conversion-local-committed → converted`를 만든다.

`conversion-pending|conversion-writing|conversion-local-committed`에서는 조건·승인·일반 update·archive·restore·새 begin을 모두 fail-closed로 막는다. `officeInspectionCancelConversion`은 3단계 전 `conversion-pending`에서만 같은 revision으로 허용하고 `proposal`로 되돌린다. arm 이후에는 다른 탭·기기에서도 cancel할 수 없다.

2단계 전에 실패하면 양쪽 데이터를 변경하지 않는다. pending이면 대표에게 재개·취소를 보여 준다. writing인데 로컬 오더가 없으면 최신 현장 데이터를 다시 읽은 뒤 고정된 `pendingOrderId`로 4단계만 재시도하고 자동 cancel하지 않는다. writing+로컬 오더이면 record만, local-committed이면 finalize만 재시도한다. 재개·취소·후속 유료 상태전이도 같은 order ID를 사용한다. 앱 시작과 OfficeOps 새로고침 때 source ID와 고정 order ID를 대조해 `연결 마무리 필요`를 표시한다. 따라서 순간적인 양쪽 무변경이 아니라 중복·유실·cancel 경쟁 없이 복구 가능한 전환을 보장하며 자동 전환은 하지 않는다.

### 7.4 K-apt 기회

첫 버전은 공식 페이지를 대표가 직접 확인하고 후보를 수동 저장한다.

```json
{
  "opportunityId": "opp_...",
  "complexName": "예시 아파트",
  "officialUrl": "https://www.k-apt.go.kr/...",
  "observedAt": "2026-08-30T00:00:00+09:00",
  "region": "대전",
  "category": "배관",
  "deadlineAt": "2026-09-05T18:00:00+09:00",
  "stage": "watch|review|participate|skip|closed",
  "requirements": ["면허 확인", "현장설명 확인", "공동인증서 확인"],
  "verifiedBy": "대표",
  "notes": "원문 확인 메모"
}
```

규칙:

- 공식 원문 URL과 확인시각이 없는 항목은 `participate`로 바꿀 수 없다.
- 공식 URL은 HTTPS, 기본 포트, 사용자명·비밀번호 없음, host가 정확히 `www.k-apt.go.kr` 또는 `k-apt.go.kr`인 경우만 허용한다. query는 유지하고 fragment는 제거한다.
- 날짜와 마감 비교는 Apps Script가 반환한 KST 기준 서버시각을 사용한다. 기기 시각과 서버시각 차이가 5분을 넘거나 서버시각을 받지 못하면 참여 판단을 막고 `시각 확인 필요`로 표시한다.
- `deadlineAt`과 서버시각이 같거나 서버시각이 더 늦으면 `마감·재확인 필요`로 표시한다.
- 적합도는 지역·공종·마감·요구서류의 사실 표시만 사용한다.
- 면허 적합성, 낙찰 가능성, 예상 수익을 자동 확정하지 않는다.
- 자동 조회, 자동 연락, 자동 입찰 제출은 하지 않는다.
- 향후 공공데이터 API를 연결할 경우 서비스 키는 Script Properties 또는 기기 로컬 설정에만 두고 저장소에 넣지 않는다.

### 7.5 기존 아파트 오더 호환

배포 전에 생성되어 `commercialTerms`, `commercialApproval`, `commercialGateVersion`이 없는 오더는 구형 오더로 식별한다. 기존 데이터를 일괄 수정하거나 승인·금액·hash를 추정해 채우지 않는다.

- 기존 `done|billed|paid` 오더는 현재 상태 그대로 조회·검색·내보내기할 수 있고 과거 승인을 새로 만들어 내지 않는다. 완료 상태를 다시 실제 작업 상태로 여는 경우에는 새 조건과 승인 영수증이 필요하다.
- 기존 `recv|visit|work` 오더와 OfficeIntake 유래 오더는 사진·견적·메모 조회/편집을 계속 허용하되, 다음 방문확정·작업확정·작업중·청구 전이 전에 대표가 `updateCommercialTerms`로 실제 조건을 입력하고 증빙 파일을 선택해 승인 영수증을 받아야 한다.
- 새 오더는 `commercialGateVersion: 1`을 가지며 승인 게이트를 우회할 수 없다.
- 구형 백업을 복원하면 같은 식별·전이 규칙을 다시 적용한다. 복원 자체가 승인이나 신규 작업확정으로 취급되지 않는다.
- 어떤 마이그레이션도 기본 금액, 가짜 증빙 file ID, 자동 승인, 임의 조건 hash를 생성하지 않는다.

## 8. OfficeOps 서버와 데이터 경계

### 8.1 공통 상업 승인 relay

유료 승인과 신뢰 시각은 OfficeOps와 분리된 내부 액션으로 둔다.

- Script Properties: `COMMERCIAL_APPROVAL_ENABLED`, `COMMERCIAL_APPROVAL_TOKEN`, `COMMERCIAL_APPROVAL_RECEIPT_KEY`
- 내부 액션: `commercialNow`, `commercialApprovalIssue`, `commercialApprovalVerify`
- `COMMERCIAL_APPROVAL_TOKEN`은 `APP_TOKEN`, `OFFICE_OPS_TOKEN`, 공개 관리사무소 세션 토큰과 모두 달라야 한다.
- `COMMERCIAL_APPROVAL_RECEIPT_KEY`는 HMAC 생성에만 쓰고 브라우저 응답·로그·GitHub에 노출하지 않는다.
- 증빙 파일은 정확한 Drive file ID로만 읽는다. 파일명 검색·폴더 전체 검색은 하지 않으며 PDF·JPEG·PNG, 최대 20MB, 휴지통 아님, 기존 현장/OfficeIntake/OfficeOps 저장 파일 ID가 아님을 확인한다.
- 세 액션은 `OFFICE_OPS_ENABLED`와 독립적으로 동작하고 기존 현장·OfficeIntake·OfficeOps JSON을 읽거나 쓰지 않는다. issue/verify는 지정된 증빙 파일 bytes만 읽는다. `COMMERCIAL_APPROVAL_ENABLED=0`이면 시각 조회를 제외한 issue/verify를 거절해 새 유료 전이만 중지한다.
- `commercialApprovalVerify`는 receipt HMAC, 현재 대상·조건 hash, 증빙 file hash, 승인시각, 유효기간을 서버 KST로 함께 검증한다. 실패 응답에는 receipt·file ID·토큰을 되돌려 주지 않는다.

### 8.2 OfficeOps 저장소

Apps Script에 기존 `OfficeIntake`와 분리된 내부 전용 `OfficeOps` 액션을 추가한다.

- 저장 파일 표시명: `관리사무소영업운영.json`
- 저장 파일 식별자: Script Property `OFFICE_OPS_FILE_ID`
- 기능 스위치: `OFFICE_OPS_ENABLED`
- 인증: 별도 Script Property `OFFICE_OPS_TOKEN`
- 공개 브라우저 호출: 허용하지 않음
- 저장 내용: 시험운영 후보, 재점검 동의, 예방점검 계획, K-apt 후보
- 저장하지 않는 내용: 사진 파일, 주민 개인정보, 견적 원본, 현장 전체 상태

초기 데이터 구조:

```json
{
  "schemaVersion": 1,
  "revision": 0,
  "updatedAt": "2026-08-30T00:00:00+09:00",
  "pilots": [],
  "consents": [],
  "inspections": [],
  "opportunities": [],
  "audit": []
}
```

`pilots`, `inspections`, `opportunities`의 모든 항목은 공통 보관 필드 `archivedAt`, `archivedBy`, `archiveReason`, `restoredAt`을 가진다. 생성 시 네 값은 `null`이다. archive는 배열에서 항목을 제거하지 않고 `archivedAt`·`archivedBy`·`archiveReason`을 기록하는 tombstone 방식이며, 기본 목록과 영업 통계에서는 제외한다. restore는 같은 ID를 유지하면서 `archivedAt`·`archivedBy`·`archiveReason`을 `null`로 만들고 `restoredAt`을 기록하며, archive와 restore 모두 이전 값과 행위자를 `audit`에 남긴다. 재점검 동의는 archive하지 않고 §7.2의 철회 기록을 사용한다.

한 번의 계정 설정 단계에서만 빈 파일을 만들고 그 Drive file ID를 `OFFICE_OPS_FILE_ID`에 기록한다. 일반 요청은 파일명을 검색해 새 파일을 만들지 않는다. 시작과 모든 쓰기 전에 다음 조건을 검사하고 하나라도 실패하면 읽기·쓰기 모두 중단한다.

- `OFFICE_OPS_FILE_ID`가 한 개의 JSON 파일을 가리킨다.
- 그 file ID가 기존 `DATA_FILE_NAME` 또는 `OFFICE_STORE_FILE`의 file ID와 다르다.
- 표시명이 기존 두 저장 파일의 이름과 다르다.
- JSON이 객체이고 `schemaVersion===1`, 정수 `revision`, 네 배열과 `audit` 배열을 가진다.
- 중복 ID, 알 수 없는 최상위 필드, 허용하지 않은 상태가 없다.

손상 JSON, 지원하지 않는 version, 중복 파일 ID, 파일명 충돌이 있으면 빈 데이터로 덮어쓰지 않는다. 오류 코드와 복구 안내만 반환한다.

내부 액션:

- `officeOpsList`
- `officePilotCreate`, `officePilotUpdate`, `officePilotArchive`
- `officeConsentRecord`, `officeConsentWithdraw`
- `officeInspectionCreate`, `officeInspectionUpdate`, `officeInspectionArchive`
- `officeInspectionBeginConversion`, `officeInspectionArmLocalCommit`, `officeInspectionRecordLocalCommit`, `officeInspectionFinalizeConversion`, `officeInspectionCancelConversion`
- `officeOpportunityCreate`, `officeOpportunityUpdate`, `officeOpportunityArchive`
- `officePilotRestore`, `officeInspectionRestore`, `officeOpportunityRestore`
- `officeOpsRetentionList`

모든 mutation 요청은 클라이언트가 HTTP 시도마다 새로 생성한 `mutationId`와 `timestamp`를 요구한다. 서버 시각 기준 5분을 벗어난 timestamp 또는 이미 사용한 `mutationId`는 각각 `stale-request`, `replay-request`로 거절한다. create 요청은 논리적 생성 작업 동안 유지하는 `idempotencyKey`도 요구한다. action과 검증 완료된 업무 payload만 포함하고 `mutationId`·`timestamp`를 제외한 canonical payload를 정해진 키 순서의 UTF-8 JSON으로 직렬화해 해시한다.

- 같은 `idempotencyKey`와 같은 canonical payload를 새 `mutationId`·유효한 timestamp로 재시도하면 첫 성공 결과를 그대로 반환하고 새 항목을 만들지 않는다.
- 같은 `idempotencyKey`에 다른 canonical payload를 보내면 `idempotency-conflict`로 거절한다.
- 동일 `mutationId` 재사용은 payload와 관계없이 `replay-request`로 거절한다.
- 5분을 벗어난 요청은 기존 idempotency 결과가 있더라도 `stale-request`로 거절한다.

서버가 항목 ID를 생성하고 update·archive·restore는 `expectedRevision`을 요구한다. idempotency 결과는 해당 항목이 보존되는 동안 유지하고, mutation ID·payload hash·결과 ID·처리시각을 `audit`에 남긴다.

서버 ID는 종류별 `pilot_`, `consent_`, `inspection_`, `opp_` 접두사와 `Utilities.getUuid()`로 생성한다. `idempotencyKey`는 16~80자의 영문·숫자·`-_`만 허용한다. 단지명은 100자, 일반 메모·요약은 2,000자, `riskItems`와 `requirements`는 각 20개·항목당 200자로 제한한다. 서버는 알 수 없는 필드를 버리지 않고 `unknown-field`로 거절한다.

서버는 종류별 스키마·문자열 길이·배열 개수·상태전이·URL 도메인을 검증한다. `LockService`로 갱신을 직렬화하고 revision 충돌을 감지한다. mutation 직전에 현재 정상 JSON의 정확한 UTF-8 bytes를 `관리사무소영업운영_백업_YYYYMMDD_HHmmss.json`으로 복사하고, 같은 timestamp의 `관리사무소영업운영_백업_YYYYMMDD_HHmmss.manifest.json`을 만든다. manifest에는 `sourceFileId`, `backupFileId`, `createdAt`, `schemaVersion`, `revision`, `byteLength`, 백업 bytes의 `sha256Hex`를 저장한다. 두 파일 생성과 백업 재읽기 hash 검증까지 성공한 쌍만 정상 backup으로 audit에 기록하며 최근 10쌍만 보존한다. 어느 단계든 실패하면 새 쌍을 폐기 대상으로 표시하고 원본을 변경하지 않는다. 이 해시는 악의적 변경 방지가 아니라 전송·저장 손상 탐지용이다. schema migration은 새 version 파일과 동일한 manifest를 별도로 만들고 검증한 뒤 `OFFICE_OPS_FILE_ID`를 바꾸며 기존 file ID를 보관한다.

`OFFICE_OPS_TOKEN`은 기존 `APP_TOKEN`, 공개 관리사무소 세션 토큰과 달라야 한다. 공개 페이지와 관리사무소 브라우저에는 전달하지 않고 대표의 현장 앱 기기 로컬 설정에만 저장한다. OfficeOps dispatch allowlist는 위 액션만 허용하며 기존 `load`, `save`, `upload`, `officeInbox`, `officeAccept`, `officeSetStatus`를 호출할 수 없다. 무토큰, 잘못된 토큰, 공개 세션 토큰, 5분을 벗어난 요청, `OFFICE_OPS_ENABLED=0` 호출은 모두 거절한다.

OfficeOps 서버 액션과 저장소는 기존 `load`, `save`, `OfficeIntake`, 프로젝트, 사진, 견적, 아파트 오더에 접근하지 않는다. OfficeOps 장애 또는 기능 중지는 기존 현장 기능에 영향을 주지 않는다. `OFFICE_OPS_ENABLED=0`이면 영업·정기관리 화면은 마지막 정상 자료의 내보내기만 허용하고 생성·수정·초안 생성을 중지한다.

## 9. 개인정보와 보존

- 파일럿 신청: 상담·제휴 회신 목적으로 최소 정보만 수집하고 일반 상담과 같은 1년 보관 기준을 적용한다. 계약으로 전환된 자료는 계약·세무 법정 보관 기준을 따른다.
- 재점검 동의: 상담 동의와 분리한다. 목적, 채널, 6/12개월, 동의문 버전, 동의시각, 철회시각을 기록한다.
- 재점검 철회: 즉시 발송 후보에서 제외하고 대표 확인용 정리 목록에 표시한다.
- OfficeOps 보존: `closed` 시험운영 후보와 `skip/closed` 공고 후보는 1년 후 정리 대상, 철회 동의는 철회 사실과 최소 증빙만 1년 후 정리 대상으로 표시한다.
- archive·복원: archive된 tombstone은 `archivedAt`부터 1년 뒤 `officeOpsRetentionList`에 표시한다. 첫 버전은 삭제하지 않으며, 복원은 보존 목록에 있더라도 대표가 명시적으로 실행할 수 있다. restore 후 보존 기산점은 다음 archive 시각으로 다시 정한다.
- 영구삭제 자동화: 첫 버전에서는 하지 않는다. 만료 목록을 대표에게 보여 주고 확인 후 정리한다.
- 홍보 공개: 접수·시공 동의와 사진·사례 공개 동의를 분리한다.
- 비밀값: `APP_TOKEN`, `OFFICE_OPS_TOKEN`, `COMMERCIAL_APPROVAL_TOKEN`, `COMMERCIAL_APPROVAL_RECEIPT_KEY`, Script Properties, 서비스 키는 GitHub, HTML, 대화, 리포트에 넣지 않는다.

`privacy.html`에는 파일럿 신청과 재점검 동의의 목적·항목·보존·철회 경로를 기존 관리사무소 접수와 구분해 추가한다.

## 10. 오류 처리

### 공개 신청

- 서버가 성공 응답을 반환한 경우에만 접수 완료로 표시한다.
- 실패하면 현재 탭 메모리에 최신 신청 한 건만 유지하고 전화·문자·복사 대체수단을 제공한다.
- 새로고침 또는 탭 종료 후 개인정보를 브라우저 저장소에 남기지 않는다.
- 네이버 예약 버튼 클릭을 내부 접수완료로 기록하지 않는다.

### OfficeOps

- 오프라인에서 자동 저장하거나 자동 재전송하지 않는다.
- 입력 중 연결이 끊기면 현재 화면 메모리에 유지하고 복사·다시 시도를 제공한다.
- 서버 revision 충돌 시 덮어쓰지 않고 최신 자료를 다시 읽은 뒤 대표가 병합한다.
- K-apt 원문이 열리지 않으면 상태를 `확인 필요`로 표시하고 기존 메모를 보존한다.
- OfficeOps 오류는 현장 앱의 일반 저장 실패로 표시하지 않는다.

## 11. 테스트 전략

### `manmool`

- `office.html`, 파일럿 신청 결과, `office-request.html` 안내에서 프로그램 무료와 실제 작업 별도 견적 문구가 함께 표시된다.
- 파일럿 폼 필수값·전화번호·개인정보 동의를 검증한다.
- 파일럿 payload가 `source: office-pilot`이고 입주민 정보·사진을 받지 않는다.
- 누수 payload가 `inquiryPurpose`·희망일·시간대·`bookingStatus: inquiry-only`를 Web3Forms와 n8n 계약에 동일하게 전달한다.
- 누수 유상 진단 신청이 예약·결제·방문 확정으로 표시되지 않는다.
- 유상 장비진단 문의는 이메일에서 자동 수입되지 않는다. `createPaidDiagnosisOrderFromManualLead()`가 증빙 영수증·공통 게이트를 통과할 때만 기존 오더 한 건을 만들고, 실패하면 프로젝트·일정·오더 변경이 0건이다.
- `naver.ready=false`, 비공식 host, 유사 도메인, credentials, 커스텀 포트이면 예약 버튼이 노출되지 않는다. 허용 URL은 query를 유지하고 fragment를 제거한다.
- 네이버 버튼을 실제 클릭한 뒤 폼을 제출해도 payload는 `inquiry-only`이고,
  현재 URL·브라우저 저장소·내부 예약 레코드가 바뀌지 않는다.
- UTM·CTA 항목은 길이·허용문자 제한을 거치고 세 UTM 필드의 전화번호 형태를
  거절하며, 폼 개인정보를 URL·분석값으로 복사하지 않는다.
- `referenceCase`의 새 브라우저 payload는 검증된 slug 문자열이고, 기존 객체형
  입력 호환은 `LeadTransport` 단위 회귀에서만 유지한다.
- `office.html`의 `connect-src` 토큰 집합은 정확히 `'self'`와 활성 provider origin만
  포함하며 유사 접두 origin·불필요한 추가 origin·중복·와일드카드를 거절한다.
- Pages 허용목록으로 실제 생성한 최종 artifact의 모든 텍스트형 공개 파일(생성된
  게시물과 JSON-LD 포함)에서 제거 대상 `500만원 이하 표준 패키지` 판매 문구가 0건이다.
- `scripts/ensure-conversion-basics.mjs`의 기존 `표준 패키지 500만원 이하` 고정문구 검사를 `접수 프로그램 이용료 0원`과 `실제 작업은 별도 견적` 동시 검사로 교체한다.
- `tests/revenue-conversion.e2e.cjs`, `tests/lead-transport.test.cjs`, `scripts/ensure-revenue-operations.mjs`와 기존 인테리어·누수·관리사무소 문의 폴백·포털 인증 회귀검사가 통과한다.
- 무료 정책 변경 후 `rg`로 공개 HTML·구조화데이터·운영문서의 `500만원 이하 표준 패키지` 판매 문구가 0건인지 확인한다. 내부 계약선정 참고문구는 공개 판매가가 아님을 표시한다.

### `hyeonjang`과 Apps Script

- `commercialApprovalIssue`는 존재·MIME·20MB·휴지통·저장파일 ID 제외 조건을 통과한 정확한 증빙 file ID만 받아 서버가 file hash와 HMAC 영수증을 만든다. 임의 receipt, 바뀌거나 삭제된 증빙, 다른 대상·조건 hash, 미래 승인시각, 만료 승인은 verify에서 거절된다.
- `COMMERCIAL_APPROVAL_TOKEN`과 receipt HMAC 비밀키가 다른 토큰·브라우저·로그에 노출되지 않고, `commercialNow`·issue·verify는 `OFFICE_OPS_ENABLED=0`에서도 동작하며 OfficeOps/현장 JSON을 읽거나 쓰지 않는다. `COMMERCIAL_APPROVAL_ENABLED=0`은 새 유료 전이만 막는다.
- `getTrustedCommercialNowKst()`는 왕복 10초·수신 후 60초 경계를 지키며, 시각/검증 실패는 해당 유료 전이만 무변경으로 막고 사진·견적·조회·무료 포털을 막지 않는다.
- `OFFICE_OPS_TOKEN` 없는 호출, 기존 `APP_TOKEN`, 공개 Office 세션 토큰, 5분을 벗어난 요청, 재사용한 `mutationId`, `OFFICE_OPS_ENABLED=0` 호출은 거절된다.
- OfficeOps 서버 액션은 `현장데이터.json`, `DATA_FILE_NAME`, `OFFICE_STORE_FILE`, `state.aptOrders`를 읽거나 쓰지 않는다.
- OfficeOps 신규 데이터가 기존 `serializeData()` 결과에 포함되지 않는다.
- 저장 file ID·이름 충돌, 중복 파일, 손상 JSON, 잘못된 schema version, unknown field, 길이·배열 상한 위반을 fail-closed로 거절하고 원본을 덮어쓰지 않는다.
- 동시 mutation의 revision 충돌을 검증한다. 같은 idempotency key·같은 canonical payload·새 mutation ID는 기존 결과를 반환하고, 같은 key·다른 payload는 `idempotency-conflict`, 같은 mutation ID는 `replay-request`, 5분 밖 요청은 `stale-request`가 된다.
- archive가 tombstone과 audit을 남기고 기본 목록에서 제외되는지, restore가 같은 ID를 복원하는지, 1년 기산점과 retention 목록이 맞는지 검증한다.
- 계정 개통일을 포함한 `startDateKst + 30 calendar days - 1 second` 계산을 월말·윤년·연말과 종료 직전/정각/직후에서 검증한다.
- backup bytes와 manifest의 file ID·schemaVersion·revision·byteLength·SHA-256이 일치해야 mutation을 허용하고, copy·manifest·재읽기 hash 중 하나라도 실패하면 원본 revision과 내용이 변하지 않는다.
- 동의문 원문·해시·증빙 없는 항목, 동의 없는 항목, 철회된 항목은 재점검 예정·연락 초안에 나타나지 않는다. 철회 직후 live-consent 확인에서도 초안 생성이 0건이다.
- `executePaidWorkGate()`만 유상 장비진단·출동·수리·예방점검 네 경로의 오더 생성·방문확정·작업확정·작업중·청구 전이를 수행한다. 직접 생성·상태 대입 우회가 0건인지 정적 검사하고, 누락·미래·만료·HMAC/file/조건 hash 불일치 승인에서 관련 데이터가 변하지 않는지 검증한다.
- `updateCommercialTerms`는 조건 변경과 승인 무효화만, `executePaidWorkGate`는 승인된 생성 또는 한 상태전이만 수행한다. 복합 요청은 `compound-command-not-allowed`로 전체 무변경이고 두 명령 각각 revision 충돌·원자성을 검증한다. 무료 두 예외에는 장비·자재·수리 범위를 넣을 수 없다.
- 구형 `done|billed|paid`는 그대로 조회되고 가짜 승인을 생성하지 않는다. 구형/OfficeIntake `recv|visit|work`, 구형 백업 복원, 새 오더의 다음 유료 전이가 §7.5 정책을 지키는지 검증한다.
- `convertOfficeOpsInspectionToAptOrder()`의 begin·arm·로컬 저장·record·finalize 각 지점에 실패와 다른 탭 cancel 경쟁을 주입한다. pending은 재개·취소, writing+오더 없음은 고정 `pendingOrderId` 생성 재시도, writing+오더 있음은 record, local-committed는 finalize만 수행한다. pending 이후 조건·승인·archive·restore 변경과 arm 이후 cancel을 거절한다. receipt 대상·`pendingOrderId`·`linkedOrderId`가 하나라도 다르면 finalize와 후속 전이를 막고, 같은 source IDs에서 중복 오더가 생기지 않는다.
- 공식 URL·확인시각 없는 K-apt 후보, 마감 후보, 서버시각 미확인 후보는 참여 상태로 바뀌지 않는다.
- 마감 공고가 명확히 표시되고 자동 입찰 요청은 발생하지 않는다.
- OfficeOps 코드 경로에서 `MailApp`, `CalendarApp`, `UrlFetchApp`, SMS·카카오·네이버 예약 API 호출이 0건이다.
- 사용자 입력은 HTML 이스케이프되고 URL 자격정보·포트·fragment·유사 도메인을 거절하며 토큰·Script Property가 오류·로그·테스트 출력에 나타나지 않는다.
- OfficeOps 기능을 꺼도 기존 프로젝트·사진·견적·OfficeIntake 전체 회귀검사가 통과한다.
- 새 검사는 `tests/office-ops-pure.unit.js`, `tests/office-ops-server.unit.js`, `tests/office-ops-ui.e2e.js`, `tests/office-ops-isolation.e2e.js`, `tests/commercial-approval.unit.js`, `tests/paid-work-gate.e2e.js`, `tests/legacy-commercial-gate.e2e.js`로 나누고, 각 보호장치의 조건을 반대로 바꾸면 해당 검사가 실패하는 RED 증거를 구현 보고서에 남긴다.
- hyeonjang 전체 회귀는 현재 Pages 배포 게이트가 실행하는 전체 Node 테스트 목록과 OfficeIntake 서버·동기화 테스트를 모두 포함한다. 특정 과거 `N/N` 결과를 최종 증거로 재사용하지 않는다.

### 실제 운영 확인

- 관리사무소 담당자가 PC와 휴대전화에서 무료 범위와 유료 범위를 구분할 수 있다.
- 파일럿 신청이 대표 이메일에 도착하고 실패 시 전화·문자 대체수단이 보인다.
- 공식 네이버 예약 링크는 사용자가 계정에서 만든 실제 링크로만 열린다.
- 재점검 동의·철회 한 건을 대표가 직접 확인한다.
- 예방점검 계획 한 건을 기존 오더로 전환하기 전에 `hjSnapshot('OfficeOps 예방점검 오더 전환', true)` 성공이 확인된다.
- K-apt 원문 한 건을 열어 마감·공종·요구서류를 사람이 확인한다.

## 12. 구현 단위와 순서

### 하위 프로젝트 A: `manmool` 공개 전환 기능

1. 무료 프로그램·별도 유료 작업 문구 정리
2. 관리사무소 파일럿 신청 폼
3. 누수 유상 진단 목적과 네이버 공식 링크 핸드오프
4. 예방점검 상품 안내
5. 유입경로·CTA 표식과 개인정보처리방침
6. 정적·단위·브라우저 회귀검사

### 하위 프로젝트 B: `hyeonjang` OfficeOps

1. 별도 Apps Script 데이터 모델과 내부 API
2. 시험운영 후보와 상태관리
3. 재점검 동의·철회·예정 목록
4. 예방점검 템플릿·계획과 명시적 오더 전환
5. K-apt 수동 후보·마감·원문 확인
6. 공통 상업 승인 영수증·신뢰 시각·단일 유료 전이 함수
7. 유상 진단 수동 등록과 구형 오더 호환
8. 격리·보안·전체 현장 회귀검사

### 하위 프로젝트 C: 계정과 운영 활성화

1. 네이버 스마트플레이스에서 실제 예약상품 생성
2. 공식 예약 URL을 공개 설정에 입력
3. Apps Script `OFFICE_OPS_FILE_ID`, `OFFICE_OPS_ENABLED`, `OFFICE_OPS_TOKEN`, `COMMERCIAL_APPROVAL_ENABLED`, `COMMERCIAL_APPROVAL_TOKEN`, `COMMERCIAL_APPROVAL_RECEIPT_KEY` 설정
4. 기존 관계 관리사무소 3곳용 영업 문구·대상·연락시점 검토
5. 동의받은 기존 고객의 재점검 연락 초안 검토
6. K-apt 후보 한 건의 자격·서류·마감 수동 확인

하위 프로젝트 C는 계정 로그인, 고객 연락, 외부 제출을 포함하므로 정확한 대상·문구·시점과 사용자 승인을 받은 뒤 실행한다.

## 13. 배포와 원복

- `manmool`과 `hyeonjang`은 각각 격리 브랜치에서 구현한다.
- 현재 dirty 상태인 `hyeonjang` 기본 작업본은 사용하지 않는다.
- 구현 계획 작성 시 기준 커밋을 기록하고, 구현 시작 직전에 `git fetch origin` 후 `origin/main` freshness와 worktree 상태를 다시 검사한다. 2026-08-30 감사 기준 `hyeonjang origin/main`은 `f44fa57`이었으나 이 값은 시작 시 재검증한다.
- `hyeonjang` 구현은 검증된 최신 `origin/main` 기준으로 분기하고, 미공개 모바일 변경은 별도 병합 검토를 거친다.
- Apps Script 배포, `hyeonjang` Pages 배포, `manmool` Pages 배포를 각각 독립 게이트로 다룬다.
- 정적 사이트를 배포했다고 Apps Script가 배포된 것으로 간주하지 않는다.
- push, PR, main 병합, Pages 공개, 네이버 설정은 변경 파일과 테스트 결과를 보고한 뒤 별도 승인을 받아 실행한다.
- 배포 순서는 `상업 승인 relay 코드·테스트 → OfficeOps relay 코드·테스트 → 각 프로젝트의 Script Properties와 OfficeOps 새 파일 ID 확인 → 상업 승인 Apps Script 새 배포 → OfficeOps Apps Script 새 배포 → hyeonjang → manmool → PC·휴대전화 검증`이다. 앞 단계가 실패하면 다음 단계를 공개하지 않는다.
- `manmool` 원복은 이전 커밋과 `naver.ready=false`, `hyeonjang` 원복은 이전 커밋, Apps Script 원복은 이전 배포 버전과 `OFFICE_OPS_ENABLED=0`, `COMMERCIAL_APPROVAL_ENABLED=0`으로 수행한다.
- 데이터 원복은 마지막 정상 backup pair의 manifest에 기록된 `sourceFileId`·`backupFileId`·`schemaVersion`·revision·byteLength·SHA-256을 백업 bytes에서 다시 검사한 뒤 새 파일로 복원하고, 기존 file ID를 덮어쓰거나 삭제하지 않는다. migration 실패 시 `OFFICE_OPS_FILE_ID`를 이전 file ID로 되돌린다.
- 기능 비활성화 중에는 OfficeOps 데이터의 읽기 전용 내보내기만 허용한다. 복구 검증이 끝나기 전 생성·수정·오더 전환·연락 초안을 재개하지 않는다.

## 14. 완료 기준

- `office.html`, 파일럿 신청 결과, `office-request.html`에서 관리사무소 프로그램 사용료가 무료임과 실제 현장 업무가 유료임이 함께 보인다.
- 관리사무소가 주민정보 없이 30일 시험운영 상담을 신청하고, 계정 개통일부터 시작·종료·연장 상태가 계산되며 종료가 무료 공사나 자동 계약을 만들지 않는다.
- 누수 고객이 `phone-consult` 또는 `paid-device-diagnosis`를 선택하고, 대표가 전달 payload에서 이를 구분하며, 공식 네이버 예약 화면을 열어도 내부 상태는 `inquiry-only`로 남는다. 대표 전용 수동 등록과 실제 증빙 영수증 검증 전에는 현장 오더가 생기지 않는다.
- 별도 동의와 철회가 재점검 예정 목록에 정확히 반영되고 자동 발송이 없다.
- 유상 장비진단·출동·수리·예방점검이 공통 상업 승인 게이트를 사용하고, 조건 변경·승인 누락·미래·만료·HMAC·증빙 file hash·조건 hash 불일치 때 방문확정·오더·작업·청구를 진행하지 않는다.
- 예방점검 계획이 별도 저장되며 유효한 상업 승인·스냅샷·`sourceOfficeOpsInspectionId` 중복 확인 전 기존 오더를 만들지 않는다. receipt 대상 ID, `pendingOrderId`, 실제 `linkedOrderId`가 끝까지 같고 중간 장애·cancel 경쟁 후에도 중복 없이 복구된다.
- K-apt 후보가 공식 URL·확인시각·마감·요구서류와 함께 관리되고 자동 응찰이 없다.
- OfficeOps 데이터가 기존 현장 데이터와 분리되고 기능 중지 시 현장 운영이 계속된다.
- 개인정보·비밀값이 URL, 공개 HTML, GitHub 산출물, 테스트 출력에 노출되지 않는다.
- §11에 이름을 지정한 새 기능 검사와 기존 `manmool`·`hyeonjang` 전체 회귀검사가 최신 커밋에서 통과한다.
- 실제 PC·휴대전화·Apps Script·네이버 공식 링크의 계정 의존 단계는 각각 확인 결과가 기록된다.
