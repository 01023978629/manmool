# 전자계약 백엔드 — Mock 참조구현

만물인테리어 **카카오톡 기반 전자계약**의 경량 백엔드입니다.
현 단계는 **설계 검증용 Mock 참조구현**으로, **실제 카카오 발송이 전혀 없습니다.**
모든 메시지는 `MockKakaoMessageProvider` 를 통과하며 네트워크로 나가지 않습니다.

> ⚠️ 스펙 제약 준수: 설계가 승인되기 전에는 실제 고객에게 운영 카카오 메시지를 발송하지 않습니다.
> 이 코드에는 실제 발송 경로 자체가 없습니다.

## 무엇을 검증하나

카카오 알림톡은 **메시지 배달**만 담당하고, **본인확인·전자서명·증거자료는 자체 서버**가
생성·보관한다는 스펙 원칙을 코드로 못박았습니다.

| 스펙 요구 | 구현 위치 |
|---|---|
| 알림톡을 서명/본인확인 수단으로 쓰지 않음 | Provider는 배달만, 서명은 `service.mjs` |
| 전자서명·증거는 자체 서버 생성·보관 | `signatures`, `consents`, `audit_logs` |
| 링크 클릭 ≠ 본인확인 | `SIGN_LINK_OPENED` vs `IDENTITY_OTP_VERIFIED` 분리 |
| 전달완료 ≠ 본인열람 | `KAKAO_MESSAGE_DELIVERED` vs `DOCUMENT_VIEWED` 분리 |
| 전화번호 원문 로그 금지 | 마스킹 + HMAC 해시만 저장 |
| 일회용 토큰 ≥128bit, DB엔 해시만 | `crypto.issueToken()`(256bit) + `token_hash` |
| 완료본 장기 공개 URL 금지 | 15분 만료 `view` 토큰 |
| 동의 증거 위조 방지 | 동의문 정본은 서버 상수, 서버가 해시 계산(클라이언트 텍스트 불신) |
| 완료 계약 봉인 | COMPLETED 후 재서명·서명링크 재발급 거부 |
| 문서 위·변조 대조 | 서명 시 클라이언트 `docHash`와 서버 정본 일치 검증 |
| 안전한 기본값 | 데모/시크릿 기본 off·운영에서 fail-fast |

## 실행

```bash
cd contract-backend
node test/e2e.mjs          # 서비스 계층 E2E (33건)
node test/http.mjs         # HTTP 계층 스모크 (33건)
node test/operator.mjs     # 자율 루프·CEO 리포트 (38건)
node test/admin.mjs        # 관리자 설정·인증 (12건)
node test/payments.mjs     # 대금 청구·입금·미수 (14건)
node test/notify.mjs       # 범용 통지(작업지시·공지) (10건)
node test/solapi.mjs       # 솔라피 실발송 어댑터 (20건)
node test/integration.mjs  # 브라우저↔서버 통합 (29건, playwright 있을 때)
node src/server.mjs        # Mock 서버 기동 → 콘솔에 서명 URL 출력
```

서비스·HTTP 계층 7스위트 합계 **163건** + 통합 29건(playwright).

`node src/server.mjs` 를 실행하면 데모 계약 1건을 자동 생성하고 **바로 열 수 있는
서명 URL**(`http://localhost:8787/sign#t=…`)을 콘솔에 찍어줍니다. 그 링크를 열면
아래 "연결된 서명 화면"이 뜹니다.

의존성 0개 — Node 22 내장 `node:http` / `node:crypto` / `node:sqlite` 만 사용합니다.

## 연결된 서명 화면 (`public/sign.html`)

시제품 서명 UI를 **같은 서버가 서빙**하고, 각 단계가 실제 REST 엔드포인트를 `fetch`
로 호출합니다(동일 출처 → CORS 불필요). 시제품 Artifact가 인메모리 Mock이었다면,
이 화면은 진짜로 서버에 저장·검증합니다.

- 토큰은 URL 프래그먼트(`#t=…`)로만 받고, 매 요청 `x-sign-token` 헤더로 전달 →
  경로/쿼리/서버 로그에 토큰이 남지 않습니다.
- 계약 **전문은 본인확인(OTP) 성공 이후에만** 서버에서 받아옵니다(`GET /api/sign/full`).
- 완료 화면의 **문서해시·서명해시는 서버가 계산한 값**을 그대로 표시합니다(클라이언트 계산 아님).
- 만료·사용됨·네트워크 오류는 전용 안내 화면으로 처리합니다.

흐름: `GET /api/sign` → `otp` → `verify` → `full` → `viewed` → `consent` → `signature`.

## 구조

```
contract-backend/
  schema.sql              데이터 모델 (payments·app_settings 포함)
  src/
    crypto.mjs            토큰·해시·마스킹·문서지문
    db.mjs                SQLite 로드 + 템플릿 시드
    audit.mjs             감사 이벤트 taxonomy (append-only)
    service.mjs           상태전이·증거·대금·통지·운영브리핑 (자체 서버 책임)
    autonomy.mjs         자율 등급 엔진(AUTO/NOTIFY/APPROVE/HUMAN) — 헌장 §3
    server.mjs            node:http REST (토큰은 헤더로만) · CORS
    settings.mjs          운영자 연결 설정 저장·마스킹·관리자 인증
    prod.mjs              운영 엔트리포인트(데모없음·영속DB·시크릿필수)
    providers/            kakao(Mock) · solapi(실발송) · index(선택 게이트)
  public/                 sign.html(서명화면) · admin.html(운영 콘솔)
  test/                   e2e·http·solapi·admin·payments·notify·integration
  Dockerfile · fly.toml · DEPLOY.md · SETUP-ALIMTALK.md · DESIGN.md
```

## API 요약

고객(서명, `x-sign-token` 헤더): `GET /api/sign` · `/full` · `/completed` · `POST /api/sign/{otp,verify,viewed,consent,signature}`
운영자(관리자 토큰 `x-admin-token`):
- 계약: `POST /api/contracts`(생성)·`/quick-send`(원클릭) · `:id/lock` · `:id/parties/:pid/{sign-link,send}` · `GET /api/contracts`(목록) · `:id/evidence`
- 대금: `:id/payments`(seed·목록) · `:id/payments/:stage/{invoice,paid}` · `GET /api/receivables`
- 재무: `GET /api/finance/summary`(입금·공급가액·부가세 10% 추정·분기 입금·미수) — `/admin` 재무 요약 카드·미수 CSV
- 운영: `GET /api/operator/brief`(자율 루프 SENSE→DECIDE — 상태 읽고 '다음 한 수'를 등급(AUTO/NOTIFY/APPROVE/HUMAN)과 함께 반환. 발송·실행 없음) · `GET /api/operator/weekly`(지난 7일 CEO 요약 — 신규·완료·입금·미수·승인대기) — `/admin` 🧠 오늘의 운영 판단·📈 주간 요약(리포트 텍스트 복사)
- 통지: `POST /api/notify/quick-send`(작업지시·공지 문자)
- 관리자: `GET/POST /admin/{status,settings,selftest}` · 화면 `GET /admin`
공용: `GET /healthz` · `GET /sign`(서명화면)

## 실제 알림톡 발송 (솔라피 연동)

실제 발송 코드는 구현되어 있습니다(`src/providers/solapi.mjs`). 다만 알림톡은 대행사·카카오
심사가 필요하므로, **사장님이 계정·발신프로필·템플릿 승인·API키**를 준비해야 켜집니다.

- 켜는 법(택1): **웹 관리자 페이지 `/admin`** 에서 입력·저장(권장), 또는 환경변수 `ALIMTALK_LIVE=1` +
  `SOLAPI_*` + `CONTRACT_PEPPER`. 관리자 페이지는 `ADMIN_TOKEN` 환경변수 설정 시 활성화되며,
  시크릿은 저장 후 원문을 다시 보여주지 않습니다(끝 4자리만). 운영자 라우트는 관리자 토큰으로 보호됩니다.
- 수신번호 원문은 **발송 시점 요청 본문(`rawPhone`)으로만** 받아 대행사로 넘기고, 로그/DB엔 마스킹·해시만 남깁니다.
- 본인번호 테스트: `node bin/selftest-send.mjs 01012345678` (고객 아님).

단계별 셋업은 [SETUP-ALIMTALK.md](./SETUP-ALIMTALK.md), 심사용 템플릿 문안은
[templates/alimtalk-templates.md](./templates/alimtalk-templates.md) 참조.

> 카카오 템플릿 **승인 전·본인번호 테스트 전에는 실제 고객에게 발송하지 않습니다.**

## 배포 (공개 서버)

고객이 폰에서 서명 링크를 열려면 이 서버가 공개 주소에 떠야 합니다. 운영 엔트리포인트는
`src/prod.mjs`(데모 없음·영속 DB·시크릿 필수·`0.0.0.0`), 컨테이너는 `Dockerfile`(Node 22).

```bash
npm run prod   # CONTRACT_PEPPER 필수 · DB_PATH 로 영속 저장소 지정
```

- 운영자 라우트(계약 생성·발송·증거)는 `ADMIN_TOKEN` 필수. 고객 서명 라우트는 토큰(`x-sign-token`) 기반.
- 헬스체크 `GET /healthz`. SQLite 특성상 **인스턴스 1개** 전제(볼륨 필수).
- Fly.io/Render 단계별 절차는 [DEPLOY.md](./DEPLOY.md) 참조.

자세한 설계는 [DESIGN.md](./DESIGN.md) 참조.
