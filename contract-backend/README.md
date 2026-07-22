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
node test/e2e.mjs          # 서비스 계층 E2E (30건)
node test/http.mjs         # HTTP 계층 스모크 (13건)
node test/integration.mjs  # 브라우저↔서버 통합 (25건, playwright 있을 때)
node src/server.mjs        # Mock 서버 기동 → 콘솔에 서명 URL 출력
```

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
  schema.sql              데이터 모델 (9개 테이블)
  src/
    crypto.mjs            토큰·해시·마스킹·문서지문
    db.mjs                SQLite 로드 + 템플릿 시드
    audit.mjs             감사 이벤트 taxonomy (append-only)
    service.mjs           핵심 상태전이·증거생성 (자체 서버 책임)
    server.mjs            node:http REST (토큰은 헤더로만)
    providers/kakao.mjs   Provider 추상화 + Mock
  test/
    e2e.mjs               서비스 계층 검증
    http.mjs              HTTP 계층 검증
  DESIGN.md               설계 문서 (데이터모델·API·보안·증거)
```

## 실제 발송으로 전환할 때 (승인 후)

1. `providers/` 에 실제 Provider(예: `SolapiProvider`) 를 `KakaoMessageProvider` 계약대로 구현
2. `CONTRACT_PEPPER` 등 시크릿을 환경변수/시크릿 매니저로 주입 (코드/저장소에 두지 않음)
3. 알림톡 템플릿 사전심사 통과본으로 `message_templates` 갱신
4. `demoOtp` 제거 → OTP는 메시지 채널로만 전달, 서버는 코드를 반환하지 않음

자세한 내용은 [DESIGN.md](./DESIGN.md) 참조.
