# 만물인테리어 전자계약 (Google Apps Script)

종료한 Fly.io `contract-backend` 를 대신하는 계약 시스템입니다.
**서버가 없습니다.** 구글 계정 안에서만 돕니다 — 실행은 Apps Script, 자료는 Sheets, 서류는 Drive.

- 처음 설치하시는 분 → **[SETUP.md](./SETUP.md)** 부터 보세요.
- 옛 계약 자료를 옮기실 분 → **[MIGRATION.md](./MIGRATION.md)**
- 배포한 뒤 사람이 눈으로 확인할 것 → **[수동검증-체크리스트.md](./수동검증-체크리스트.md)**
- 앱과 서버가 주고받는 약속 → **[PROTOCOL.md](./PROTOCOL.md)** (코드보다 이 문서가 먼저입니다)

---

## 1. 무엇을 하는가

1. 계약을 만들고(DRAFT) 본문을 확정해 잠급니다(LOCKED). 잠그는 순간 **문서 지문**(SHA-256)이 찍히고 본문은 다시 못 고칩니다.
2. 고객에게 **일회용 서명 링크**를 문자로 보냅니다. 링크에는 원문 토큰이 실려 있고, 서버에는 그 해시만 남습니다.
3. 고객이 폰에서 손가락으로 서명합니다. 서명 이미지·서명 시각·고객이 본 지문이 함께 저장됩니다.
4. 서명이 들어오면 완료본 PDF 와 증거 JSON 을 Drive 에 만들고, 계약을 COMPLETED 로 봉인합니다.
5. 계약금·중도금·잔금의 청구·입금을 기록합니다.
6. 하루 한 번 전체를 JSON 으로 백업합니다.

**하지 않는 것**: 본인확인(OTP)·공인인증·고객 IP 기록. 이유는 4장(Fly 와의 차이)에 적었습니다.

---

## 2. 파일 지도

| 파일 | 무엇을 하는가 | 바깥을 건드리는가 |
| --- | --- | --- |
| `PROTOCOL.md` | 웹앱과 현장 앱이 주고받는 약속. **코드보다 먼저 고칠 문서** | — |
| `Pure.gs` | 금액·검증·정규화JSON·상태전이·수식삽입방지·escHtml | ✗ 순수 |
| `Schema.gs` | 시트 열 정의(`COLS_*`)·사건 이름(`EVENTS`)·설정 금지어 | ✗ 순수 |
| `AuthService.gs` | SHA-256 · HMAC(PEPPER) · 무작위 토큰 · 상수시간 비교 | Utilities · Properties |
| `SheetService.gs` | 시트 읽기·쓰기·원장 기록. 열은 **이름으로만** 찾음 | Sheets · Properties |
| `DriveService.gs` | 계약별 폴더 · 원본 PDF · 서명 PNG · 완료본 · 증거 JSON · 백업 폴더 | Drive |
| `ContractService.gs` | 계약 생성·조회·잠금·취소·링크발급·대금·백업 | 위 계층을 부름 |
| **`Sign.gs`** | 고객 서명 처리 — `signView_` · `signSubmit_` · `doneView_` · `signBoot_` | **⚠ 아직 없습니다 (아래)** |
| `MigrationService.gs` | 옛 자료 CSV 를 시트에 **덧붙이기**(덮어쓰지 않음) | Drive · Sheets |
| `Code.gs` | 창구. `doPost`/`doGet`·동작표·자격증명·잠금·멱등·health·selfTest | 전부 |
| `Sign.html` | 고객 서명 화면(폰) | — |
| `Admin.html` | 관리자 화면(`?page=admin`) | — |
| `appsscript.json` | 매니페스트(권한 범위·웹앱 설정) | — |
| `test/run.mjs` · `test/pure.test.mjs` | `Pure.gs`·`Schema.gs` 자동 검사 (Node) | — |
| `tools/migrate-sqlite-to-sheets.mjs` | 옛 백업 DB → 시트용 CSV (읽기 전용) | — |
| `tools/make-fixture-db.mjs` | 이전 도구를 시험할 가짜 DB 만들기 | — |

### ⚠ 지금 빠져 있는 것 — `Sign.gs`

`Code.gs` 는 고객 동작(`sign.view` · `signContract` · `completeContract`)을 받으면
`signView_` · `signSubmit_` · `doneView_` 라는 함수를 **이름으로 찾아** 부릅니다.
이 함수들이 있어야 할 `Sign.gs` 가 **아직 이 저장소에 없습니다.**

| | |
| --- | --- |
| 지금 되는 것 | 계약 생성·잠금·목록·대금·취소·백업·CSV·자가진단 — **관리자 쪽은 전부** |
| 지금 안 되는 것 | **고객 서명 전 과정.** 링크는 발급되지만 고객이 열면 서명이 접수되지 않습니다 |
| 어떻게 알아보나 | `health` 응답의 `modules.sign` 이 `false` 입니다 |
| 무너지지는 않나 | 무너지지 않습니다. `Code.gs` 가 “서명 처리 모듈(Sign.gs)이 설치되지 않아…” 라고 정확히 답합니다 |

**`Sign.gs` 가 들어오기 전에는 고객에게 서명 링크를 보내지 마세요.**

### 계층 규칙

```
Code.gs  ──▶ ContractService.gs ──▶ SheetService.gs ──▶ Sheets
   │                │                DriveService.gs ──▶ Drive
   │                │                AuthService.gs  ──▶ Utilities
   └────────────────┴──────────────▶ Pure.gs / Schema.gs   (아무 데도 안 감)
```

- **아래 계층이 위를 부르지 않습니다.** `DriveService.gs` 는 시트를 모르고, `SheetService.gs` 는 계약 규칙을 모릅니다.
- 해시는 `AuthService.gs` 한 곳에서만 만듭니다. 두 곳에서 만들면 언젠가 한쪽만 틀립니다.
- 수식 삽입 방지는 `SheetService.gs` 의 쓰기 지점 한 곳에서만 겁니다(`sheetSafe`).

### 검사 돌리기

```bash
node apps-script-contract/test/run.mjs
```

`Pure.gs` 와 `Schema.gs` 를 **복사하지 않고 원본 그대로** 읽어 검사합니다(`node:vm`).
설치할 것이 없습니다. 실패 건수가 종료코드로 나옵니다(0 이면 전부 통과).

이 검사가 **닿지 않는 곳**: Sheets·Drive·권한·PDF 모양·폰 화면.
그건 사람이 봐야 합니다 → [수동검증-체크리스트.md](./수동검증-체크리스트.md)

---

## 3. 자료 구조

### 3-1. Sheets — 5장

열 순서는 `Schema.gs` 한 곳에서만 정합니다. **열은 뒤에 추가만 하세요.**
중간에 끼우면 이미 만들어진 시트와 어긋나고, 시트에는 마이그레이션이 없습니다.

#### `Contracts` — 계약 한 건이 한 줄 (27열)

| 열 | 뜻 |
| --- | --- |
| `id` | `ct_…` 추측 불가한 무작위. **고객은 이 값으로 아무것도 열 수 없습니다** |
| `contractNo` | `MM-2026-0142` — 사람이 전화로 부르는 번호 |
| `title` | 계약 제목 |
| `status` | `DRAFT`→`LOCKED`→`SENT`→`VIEWED`→`SIGNING`→`COMPLETED` / `VOID` |
| `amount` | 원 단위 정수 |
| `customerName` | 고객 성명 |
| `customerPhoneMasked` | `010-****-5678` — **원문 열은 없습니다** |
| `customerPhoneHash` | HMAC(번호, PEPPER). 대조용, 역산 불가 |
| `operatorName` | 시공자 표기 |
| `bodyJson` | 잠금 시점 본문(JSON 문자열). 잠금 후 불변. 최대 45,000자 |
| `docHash` | SHA-256(정규화JSON{금액, 본문}) — 위변조 대조의 기준 |
| `lockedAt` `sentAt` `viewedAt` `signedAt` `completedAt` `voidedAt` | 각 사건의 서버 기준 시각(ISO8601) |
| `folderId` | Drive 계약별 폴더 ID |
| `originalFileId` | 원본 PDF (잠금 시 생성, 이후 덮어쓰지 않음) |
| `completedFileId` | 완료 PDF (최신본) |
| `completedFileVersion` | 완료본 판 번호. 재발행 시 1씩 오르고 옛 파일은 남습니다 |
| `signerName` | 고객이 직접 입력한 성명(마스킹 없음 — 계약 당사자 표기) |
| `signatureSha256` | 서명 PNG **원본 바이트**의 SHA-256 |
| `signatureFileId` | 서명 이미지 파일 ID |
| `completedSha256` | 완료 PDF 의 SHA-256 |
| `createdAt` `updatedAt` | 만든 때 / 마지막으로 고친 때 |

#### `ContractEvents` — 덧붙이기만 하는 원장 (7열)

지우거나 고치지 않습니다. **이 시트가 곧 감사 기록입니다.**

| 열 | 뜻 |
| --- | --- |
| `at` | 서버 기준 시각. 고객 기기 시계를 믿지 않습니다 |
| `contractId` | 어느 계약인가(빈 값이면 계약과 무관한 사건 — 예: 백업) |
| `event` | `CONTRACT_CREATED` `CONTRACT_LOCKED` `SIGN_LINK_ISSUED` `SIGN_LINK_OPENED` `SIGN_SUBMITTED` `CONTRACT_COMPLETED` `CONTRACT_VOIDED` `PAYMENT_INVOICED` `PAYMENT_PAID` `MESSAGE_QUEUED` `MESSAGE_BLOCKED` `BACKUP_EXPORTED` `ADMIN_AUTH_FAILED` `TOKEN_REJECTED` |
| `detail` | 사람이 읽는 한 줄. **민감정보·토큰 금지** |
| `uaHash` | HMAC(User-Agent). 원문은 남기지 않습니다 |
| `requestHash` | HMAC(요청 식별자). 같은 요청의 재시도를 알아보기 위한 값 |
| `actor` | `admin` / `customer` / `system` |

> `MESSAGE_QUEUED`(보내려 했음)와 `SIGN_LINK_OPENED`(고객이 열었음)는 **다른 사건**입니다.
> 섞어 기록하면 증거가 되지 못합니다.

#### `Payments` — 계약금·중도금·잔금 (10열)

| 열 | 뜻 |
| --- | --- |
| `contractId` | 계약 |
| `stage` | `down` / `mid` / `bal` |
| `label` | 계약금 / 중도금 / 잔금 |
| `seq` | 0 / 1 / 2 |
| `amount` | 원 단위 정수 |
| `status` | `PENDING` → `INVOICED` → `PAID` (되돌아가지 않습니다) |
| `invoicedAt` `paidAt` | 청구·입금 시각 |
| `memo` | 메모(200자 이내) |
| `updatedAt` | 마지막으로 고친 때 |

비율은 **계약금 50% · 중도금 40% · 잔금 나머지 전부**입니다.
잔금을 비율로 계산하지 않는 이유는 세 값의 합이 총액과 1원도 어긋나지 않게 하기 위해서입니다.

#### `SignTokens` — 고객 링크 (8열)

| 열 | 뜻 |
| --- | --- |
| `id` | 토큰 줄 식별자 |
| `contractId` | 어느 계약 |
| `purpose` | `sign`(서명, 기본 72시간) / `view`(완료본 열람, 기본 15분) |
| `tokenHash` | SHA-256(원문 토큰). **원문은 이 시트 어디에도 없습니다** |
| `expiresAt` | 만료 시각 |
| `usedAt` | 1회 소진 시각. 값이 있으면 다시 못 씁니다 |
| `revokedAt` | 무효 처리 시각(계약 취소 시 그 계약의 미사용 토큰 전부) |
| `createdAt` | 발급 시각 |

> 시트가 통째로 유출돼도 남의 계약을 열 수 없어야 합니다. 그래서 원문을 저장하지 않습니다.
> 대신 **잃어버린 링크는 다시 못 봅니다** — 새로 발급(`issueSignLink`)하셔야 합니다.

#### `Settings` — 비밀이 아닌 운영값만 (3열)

`key` · `value` · `updatedAt`.
`TOKEN` `SECRET` `KEY` `PEPPER` `PASSWORD` `PASSWD` `APIKEY` `CREDENTIAL` 이 이름에 들어간 키는 **거부**합니다.
시트는 공유 링크 한 번이면 남이 볼 수 있는 곳입니다. 비밀값은 스크립트 속성에만 둡니다.

### 3-2. Drive — 폴더 구조

```
<DRIVE_FOLDER_ID>/                     ← 사장님이 만드신 폴더
└── 전자계약/
    ├── MM-2026-0142 홍길동/            ← 계약 한 건이 폴더 하나
    │   ├── 원본_MM-2026-0142.pdf           잠금 시점 본문. 이후 덮어쓰지 않음
    │   ├── 서명_MM-2026-0142.png           고객 서명 이미지(원본 바이트)
    │   ├── 완료_MM-2026-0142_v1.pdf        서명까지 담은 완료본
    │   ├── 완료_MM-2026-0142_v2.pdf        재발행하면 판이 오름 (옛 판은 남음)
    │   ├── 증거_MM-2026-0142_v1.json       시각·해시·사건 이력 묶음
    │   └── 증거_MM-2026-0142_v2.json
    ├── MM-2026-0143 김영희/
    └── 백업/
        ├── 계약백업_20260730-0300.json
        └── 계약백업_20260731-0300.json
```

| 규칙 | 왜 |
| --- | --- |
| **지우지 않습니다** | `setTrashed`·`removeFile`·`moveTo` 가 코드에 없습니다. 계약 서류는 지우는 물건이 아닙니다 |
| **덮어쓰지 않습니다** | 같은 이름이 있으면 판을 올리거나(`_v2`) 이름을 비켜 새 파일로 만듭니다 |
| **저장한 파일을 다시 읽어 해시합니다** | 증거는 메모리의 blob 이 아니라 드라이브에 실제로 남은 바이트입니다 |
| 폴더 이름을 손으로 고치셔도 됩니다 | 시트는 이름이 아니라 `folderId` 로 찾습니다 |

---

## 4. Fly 방식과 Apps Script 방식의 차이

**좋아진 것만 적지 않았습니다.** 나빠진 것을 알고 쓰셔야 분쟁이 났을 때 당황하지 않습니다.

| 항목 | Fly.io (`contract-backend`, 종료됨) | Apps Script (지금) | 판정 |
| --- | --- | --- | --- |
| **비용** | 서버·볼륨 유지비가 매달 나감 | **0원** (구글 계정 안) | 좋아짐 |
| **서버 관리** | 배포·재시작·볼륨·인증서·모니터링 | **없음.** 코드를 붙여넣고 배포 한 번 | 좋아짐 |
| **꺼질 위험** | 결제 실패·볼륨 손상이면 계약이 전부 사라짐 | 구글 계정이 살아 있는 한 남음 | 좋아짐 |
| **자료를 눈으로 보기** | SQLite — 열려면 도구가 필요 | 스프레드시트를 그냥 열면 보임 | 좋아짐 |
| **고객 IP 기록** | 남길 수 있었음 | **못 남깁니다.** Apps Script 는 요청자 IP 를 주지 않음 | **나빠짐** |
| **본인확인(OTP)** | 문자 OTP 로 본인확인까지 함 | **없음.** 링크를 받은 사람이 서명 | **나빠짐** |
| **실행 시간** | 제한 없음 | **1회 6분**. 넘으면 구글이 끊음 | **나빠짐** |
| **조회 속도** | SQLite 인덱스 — 즉시 | 시트 전체를 읽음. 건수가 늘면 눈에 띄게 느려짐 | **나빠짐** |
| **동시성** | DB 트랜잭션 | `LockService` 하나로 줄 세움. 못 잡으면 `BUSY` 로 **실패** | **나빠짐** |
| **HTTP 상태코드** | 401·404·409 로 구분 | **언제나 200.** `ok` 필드를 봐야 함 | **나빠짐** |
| **CORS preflight** | 정상 처리 | OPTIONS 응답 불가 → `text/plain` 으로 우회 | **나빠짐** |
| **하루 사용량 한도** | 없음 | 있음(수치는 [SETUP.md 9장](./SETUP.md) 참고) | **나빠짐** |
| 백업 | 볼륨 하나 + 수동 다운로드 | Drive 에 매일 자동 JSON | 좋아짐 |

### 나빠진 것에 대해 실제로 무엇을 했는가

| 잃은 것 | 대신 무엇을 남기는가 | 남는 한계 |
| --- | --- | --- |
| 고객 IP | User-Agent 해시 · **서버 기준 시각** · 고객이 본 문서 지문 · 사건 원장 | 분쟁에서 "이 사람이 이 자리에서 눌렀다"까지는 못 갑니다. 증거의 강도가 그만큼 약합니다 |
| 본인확인 OTP | 링크를 **문자로 그 번호에만** 보냄 · 1회용 · 72시간 만료 | 링크를 남에게 전달하면 그 사람이 서명할 수 있습니다 |
| HTTP 상태코드 | `{ok:false, error:'CODE'}` — 코드표는 PROTOCOL.md | 앱이 `ok` 를 안 보면 실패가 조용히 지나갑니다 |
| 6분 제한 | 백업·이전은 나눠 돌리도록 만듦(다시 실행하면 이어서 함) | 계약 수천 건 규모가 되면 구조를 바꿔야 합니다 |
| 시트 조회 속도 | 한 줄만 찾을 때는 `findRow_`(열 하나만 훑음) | 목록 화면은 시트 전체를 읽습니다 |

### 이 차이가 견딜 만한 이유

1인 시공, 연 수십 건 규모입니다. 6분 안에 끝나고, 동시에 두 사람이 서명할 일이 없고,
시트 몇백 줄은 느리지 않습니다. **사람이 늘거나 건수가 늘면 이 판단이 바뀝니다** —
언제 옮겨야 하는지는 [SETUP.md 10장](./SETUP.md)에 적었습니다.

---

## 5. 동작 이름

정본은 사장님이 지정하신 이름입니다. PROTOCOL.md 의 점 표기(`contract.create` 등)는 **별칭**으로 함께 받습니다.

| 정본 이름 | 별칭 | 누가 | 하는 일 |
| --- | --- | --- | --- |
| `health` | `contract.health` | 아무나 | 설정 상태·버전(값은 담지 않음) |
| `selfTest` | `self.test` `diag.selfTest` | 관리자 | **이것이 통과해야 현장 앱의 계약 버튼이 열립니다** |
| `createContract` | `contract.create` | 관리자 | 계약 생성(DRAFT) + 대금 3회차 |
| `getContract` | `contract.get` | 관리자·고객 | 자격증명으로 갈라집니다(섞어 보내면 거부) |
| `listContracts` | `contract.list` | 관리자 | 목록(요약). 본문·해시 제외 |
| `lockContract` | `contract.lock` | 관리자 | 본문 확정 → `docHash` 발급 + 원본 PDF |
| `issueSignLink` | `signlink.issue` | 관리자 | **원문 토큰을 이때 한 번만** 돌려줍니다 |
| `quickSend` | `contract.quickSend` | 관리자 | 생성→잠금→링크발급을 한 번에(현장에서 실제로 쓰는 것) |
| `voidContract` | `contract.void` | 관리자 | 취소 + 미사용 토큰 전부 무효화 |
| `recordPayment` | `payment.update` | 관리자 | 청구·입금 표시 |
| `backup` | `backup.export` | 관리자 | 전체를 JSON 으로 Drive 백업 폴더에 |
| `exportCsv` | `contract.exportCsv` `export.csv` | 관리자 | 목록을 CSV 로 |
| `signContract` | `sign.submit` | 고객 | 서명 저장 → 완료 PDF → 토큰 소진 |
| `completeContract` | `done.view` | 고객 | 완료본 열람(`view` 토큰) |
| — | `sign.view` `viewContract` | 고객 | 본문·금액·지문 조회(토큰을 소진하지 않음) |
| — | `notify.send` `settings.get` `settings.set` | 관리자 | 발송 시도 · 운영값 |

> `completeContract` 는 **고객 전용**입니다. 관리자가 서명 없이 계약을 '완료 처리'하는 길은
> 만들지 않았습니다. 그 길이 있으면 전자계약의 근거가 통째로 무너집니다.

자세한 요청·응답 모양은 [PROTOCOL.md](./PROTOCOL.md) 를 보세요.

---

## 6. 안전에 대해 지킨 것

| 지킨 것 | 어디서 |
| --- | --- |
| 관리자 토큰·PEPPER·API 키를 코드·시트·로그에 두지 않음 | 스크립트 속성만 사용 |
| 전화번호 원문을 저장하지 않음 | `Schema.gs` — 마스킹본과 HMAC 만 (`test/` 가 열 이름으로 검사) |
| 서명 링크 토큰 원문을 저장하지 않음 | `AuthService.gs` + `COLS_TOKENS.tokenHash` |
| 토큰 대조를 상수시간으로 | `AuthService.gs` `constantTimeEq` |
| 시트 수식 삽입 방지 | `Pure.gs` `sheetSafe` — 쓰기 지점 한 곳에서만 |
| 고객 화면 HTML 이스케이프 | `Pure.gs` `escHtml` |
| 잠금·멱등 | `Code.gs` `LockService` + `idem` 캐시 |
| 실패를 성공으로 기록하지 않음 | Drive 저장 실패 시 그 자리에서 `throw` |
| 실제 문자 발송 기본 꺼짐 | `ALIMTALK_LIVE` 미설정 = 꺼짐. `selfTest` 는 **켜져 있으면 실패**로 봅니다 |

### 아직 못 지킨 것 (정직하게)

- **고객 IP 를 못 남깁니다.** 위 4장 참고.
- **본인확인이 없습니다.** 링크를 받은 사람이 곧 서명자입니다.
- **난수가 국가 표준 CSPRNG 가 아닙니다.** `Utilities.getUuid()` 넷을 잇고 SHA-256 으로 접습니다.
  72시간짜리 1회용 링크에는 충분하지만, 분쟁에서 "표준 난수 생성기를 썼다"고 주장하지 마세요
  (근거는 `AuthService.gs` `randomToken` 주석에 적어 두었습니다).
- **`Pure.gs` `canTransition` 에 알려진 결함이 하나 있습니다.**
  출발 상태가 `constructor`·`toString` 같은 이름이면 `false` 가 아니라 오류가 납니다.
  `test/pure.test.mjs` 의 `[결함기록]` 항목이 이 사실을 못박고 있습니다.
