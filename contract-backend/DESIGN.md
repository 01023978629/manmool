# 전자계약 백엔드 설계서 (v0.1 · Mock)

만물인테리어 카카오톡 기반 전자계약의 경량 백엔드 설계. 본 문서는 **구현 승인용
설계**이며, 동봉된 코드는 이 설계를 그대로 검증하는 **Mock 참조구현**이다(실제 발송 없음).

## 0. 설계 대전제 (스펙에서 도출한 불변식)

1. **알림톡 ≠ 전자서명 ≠ 본인확인.** 카카오는 "메시지 배달"만 한다. 서명의 법적
   효력·본인확인·증거는 전부 자체 서버가 만든다.
2. **사건 분리.** "메시지 전달완료 / 링크 열림 / 본인확인 / 문서열람 / 서명"은
   각각 독립된 감사 이벤트다. 하나로 뭉뚱그리지 않는다.
3. **최소보관·해시화.** 전화번호 원문·평문 토큰·원문 IP를 저장/로그하지 않는다.
   마스킹 + HMAC 해시로만 남긴다.
4. **불변 문서.** 잠금(lock) 시점에 `doc_hash` 를 확정하고, 서명 시점에 "고객이 본
   해시"를 다시 대조해 위·변조를 차단한다.
5. **단기 접근.** 서명 링크는 72시간, 완료본 열람 링크는 15분. 완료 계약서의 장기
   공개 URL은 존재하지 않는다.

## 1. 상태 기계 (contracts.status)

```
DRAFT ──lock──▶ LOCKED ──send──▶ SENT ──viewed──▶ VIEWED ──sign──▶ COMPLETED
                  │                                                    ▲
                  └────────────────(서명 링크는 LOCKED 이후에만 발급)──┘
VOID: 임의 시점에 취소(관리자). 이후 어떤 전이도 불가.
```

- `DRAFT`: 본문 수정 가능. 서명 링크 발급 불가.
- `LOCKED`: `doc_hash` 확정, 본문 불변. 이후에만 서명 링크 발급 가능.
- `SENT`/`VIEWED`: 진행 상태 추적용. 서명 가능 조건과 무관하게 감사 목적.
- `COMPLETED`: 서명 완료. 토큰 소진. 완료본은 15분 view 토큰으로만 접근.

## 2. 데이터 모델

`schema.sql` 참조. 9개 테이블:

| 테이블 | 역할 | 민감정보 처리 |
|---|---|---|
| `contracts` | 계약 본문·상태·`doc_hash` | 본문은 잠금 후 불변 |
| `contract_parties` | 갑/을 당사자 | `phone_masked` + `phone_hash`(HMAC) — 원문 없음 |
| `sign_tokens` | 일회용 링크 토큰 | `token_hash`(SHA-256)만, 평문 없음 |
| `otp_challenges` | 본인확인 OTP | `code_hash`만, 시도 5회 제한 |
| `consents` | 동의 항목 | 동의문 원문 해시 동반 |
| `signatures` | 전자서명 지문 | `image_sha256` + `doc_hash_seen` |
| `audit_logs` | append-only 원장 | `request_hash`만, 원문 금지 |
| `message_templates` | 알림톡 템플릿 | 승인본 관리 |
| `message_deliveries` | 발송·전달 이력 | Provider 결과 |

## 3. API 계약

운영자 측(사업자 대시보드 → 서버):

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/contracts` | 계약 생성(DRAFT) |
| POST | `/api/contracts/:id/lock` | 문서 잠금 + `doc_hash` 확정 |
| POST | `/api/contracts/:id/parties/:pid/sign-link` | 일회용 서명 링크 발급(raw 1회 노출) |
| POST | `/api/contracts/:id/parties/:pid/send` | 메시지 발송(Provider) |
| POST | `/api/deliveries/:id/refresh` | 전달상태 갱신(웹훅 대체) |
| GET | `/api/contracts/:id/evidence` | 증거 패키지 |

고객 측(서명 화면 → 서버). **토큰은 URL이 아니라 `x-sign-token` 헤더로** 전달(요청
로그에 토큰이 남지 않도록):

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/sign` | 링크 열람(요약만, 본인확인 요구) |
| POST | `/api/sign/otp` | 본인확인 코드 발급 |
| POST | `/api/sign/verify` | 코드 검증 → 본인확인 성립 |
| POST | `/api/sign/viewed` | 전체 계약서 열람 완료 |
| POST | `/api/sign/consent` | 동의 기록 |
| POST | `/api/sign/signature` | 서명 제출 → 완료 |

**서명 선행조건(서버가 강제):** 본인확인 성공 → 전체 열람 → 필수 동의(terms/privacy/
esign) → 서명. 하나라도 빠지면 400.

## 4. Provider 추상화

```ts
interface SendRequest {
  toPhoneMasked: string;   // 표시/로그용 (010-****-8629)
  toPhoneHash: string;     // 대조용 HMAC
  templateKey: string;
  variables: Record<string, string>;
  buttons?: { name: string; type: string; url: string }[];
}
interface SendResult { providerMsgId: string | null; status: 'SENT' | 'FAILED'; failedReason?: string; }

interface KakaoMessageProvider {
  readonly name: string;
  send(req: SendRequest): Promise<SendResult>;
  queryStatus(providerMsgId: string): Promise<{ status: string; deliveredAt?: string }>;
}
```

- 구현체: `MockKakaoMessageProvider`(기본) + `SolapiProvider`(실제 알림톡, `src/providers/solapi.mjs`).
- 선택: `selectProvider()` 가 환경변수로 결정 — `ALIMTALK_LIVE=1` + 자격증명 완비일 때만 실 발송,
  그 외에는 항상 Mock. live 인데 설정이 없으면 기동 거부(fail-fast).
- 수신번호 원문은 **발송 시점 `rawPhone` 인자로만** 전달(메모리) → Provider 로. 로그/DB엔 남기지 않으며,
  넘어온 번호가 당사자 해시와 다르면 `PHONE_MISMATCH` 로 오발송 차단.
- **Provider는 서명·본인확인을 절대 판단하지 않는다.** 배달 성공조차 본인확인이 아니다.
- 실제 발송 셋업/템플릿: `SETUP-ALIMTALK.md`, `templates/alimtalk-templates.md`. Solapi 연동은
  `test/solapi.mjs` 가 fetch 주입으로 HMAC 인증·페이로드·응답 파싱을 오프라인 검증(20건).

## 5. 토큰 수명주기

```
issueToken(): raw=randomBytes(32)→base64url (256bit)   ── raw는 응답으로 1회만
   DB: token_hash = SHA-256(raw)                        ── 평문 저장 안 함
검증: SHA-256(입력) == token_hash  (상수시간 비교)
소진: 서명 완료 시 used_at 기록 → 재사용 400(USED)
만료: sign 72h / view 15m → 초과 시 400(EXPIRED)
취소: revoked_at → 400(REVOKED)
```

## 6. 본인확인(OTP) 모델

- `/api/sign/otp` 발급 → `otp_challenges` 에 `code_hash`(만료 5분) 저장.
- 운영에서 코드는 **메시지 채널로만** 전달. 서버 응답에 코드를 넣지 않는다.
  (데모에서만 `demoOtp` 고정값을 응답 — 운영 전환 시 제거)
- 검증 5회 초과 → 잠금(OTP_LOCKED). 성공 시 `contract_parties.verified_at` 기록.
- **링크 열람(SIGN_LINK_OPENED)은 본인확인이 아니다.** 서명은 `verified_at` 없으면 거부.

## 7. 감사 이벤트 taxonomy

`audit.mjs::EVENTS`. 상태전이는 반드시 이 로그를 남긴다. 핵심 분리:

```
KAKAO_MESSAGE_DELIVERED  (단말 전달완료)
        ≠ SIGN_LINK_OPENED   (페이지 열림)
        ≠ IDENTITY_OTP_VERIFIED (본인확인)
        ≠ DOCUMENT_VIEWED    (문서 열람 완료)
```

전 이벤트는 `request_hash`(HMAC)만 남기고 전화번호·토큰 원문은 남기지 않는다.

## 8. 증거 패키지

`GET /api/contracts/:id/evidence` — 계약 메타(+`doc_hash`), 당사자(마스킹), 동의(원문
해시), 서명(`image_sha256`+`doc_hash_seen`), 발송이력, **전체 감사추적**을 한 객체로
묶고, 그 전체를 다시 SHA-256 한 `packageHash`(봉인 해시)를 덧붙인다. 분쟁 시 이
패키지 하나로 "누가·언제·무엇에·어떤 문서에 서명했는지"를 재현·대조할 수 있다.

## 9. 보안·프라이버시 요약

- 시크릿(`CONTRACT_PEPPER` 등)은 환경변수/시크릿 매니저로만 주입. 저장소·AI 컨텍스트에 두지 않음.
  운영(`NODE_ENV=production`)에서 PEPPER 미설정이면 **기동 거부**(fail-fast).
- 저장: 마스킹 전화번호 + HMAC 해시 · 토큰/OTP 해시 · IP/UA 해시. **원문 없음.**
- 로그: 토큰은 URL이 아닌 헤더. 요청 식별자는 해시. 예상치 못한 500은 내부 메시지/스택을 응답에 노출하지 않음.
- 완료본: 장기 공개 URL 없음(15분 토큰). 필요 시 로그인 게이트로 확장.
- **안전한 기본값**: 데모 기능(`enableDemo`/`demoOtp`)은 기본 off. 운영에서 켜져 있으면 기동 거부.
- **동의 증거 위조 방지**: 동의문 정본은 서버 상수(`CONSENT_TEXTS`)에 두고 그 해시를 저장(클라이언트가 보낸 텍스트는 신뢰하지 않음).
- **순서 강제**: 본인확인 → 열람 → 동의 → 서명을 서버가 각 단계에서 검사. 완료(COMPLETED) 계약은 봉인되어 재서명·서명링크 재발급 불가.
- **문서 위·변조 대조**: 서명 시 고객 화면이 표시한 `docHash`를 함께 받아 서버 정본과 일치할 때만 서명 유효.
- **본인확인 남용 방지**: OTP는 시도 5회·발급 5회 상한, 재발급 시 이전 미검증 코드 만료. 빈 서명 거부.

## 10. 프런트엔드 연동 (완료)

모바일 서명 화면을 `public/sign.html` 로 **실제 연결**했다. 서버가 같은 출처로
서빙하므로 CORS가 필요 없고, 각 단계가 §3 고객 API를 `fetch` 로 호출한다.

- 토큰은 URL 프래그먼트(`#t=`)에서 읽어 `x-sign-token` 헤더로만 전송 → 서버 접근
  로그·리퍼러에 토큰이 남지 않는다.
- 계약 **전문은 본인확인 이후**(`GET /api/sign/full`)에만 클라이언트로 내려간다.
  열람 전 화면(`GET /api/sign`)은 계약번호·금액 등 최소 요약만 받는다.
- 완료 화면의 문서해시·서명해시는 서버 응답값을 그대로 표시(클라이언트 계산 아님).
- `test/integration.mjs` 가 실제 브라우저로 전 흐름을 조작하고, 서버 증거 패키지로
  본인확인·열람·동의·서명·완료가 기록되었는지 대조한다(23건).

## 11. 미결·후속 (승인 필요 항목)

- 실제 알림톡 발송: 코드(`SolapiProvider`)·심사용 템플릿·셋업 가이드 완료. 남은 것은 **사장님의
  계정 작업**(채널·발신프로필·템플릿 카카오 심사·API키) — `SETUP-ALIMTALK.md` 참조.
- 완료 PDF 렌더링(서버측) 및 장기 보관 정책(보존기간·파기)
- **운영자(사업자) API 인증/인가** — 현재 Mock은 `/api/sign*` 외 운영자 라우트가 무인증.
  실제 배포 전 세션/서버 API키/mTLS 등으로 보호 필요(서명링크 발급·증거 조회는 특권 동작).
- **서명 이미지 원본 보관** — 현재는 `image_sha256` 지문만 저장. 분쟁 시 원본 대조를 위해
  파생 아티팩트를 불변 저장소에 보관하고 `image_ref`가 실제 위치를 가리키게 확장.
- **인프라 레이트리밋** — OTP 앱단 상한 외에 IP·당사자 단위 요청 속도 제한(리버스프록시/WAF).
- **완료본 재열람 UX** — 완료 후 새로고침 시 재접근을 위한 단기 view 링크 자동 발급(현재는 세션 내에서만 표시).
- 배포 대상(자체 경량 서버) 선정 및 시크릿 운영 방식

> 위 항목은 리뷰(다관점·적대적 검증)에서 확인된 "운영 전환" 과제다. 사전-승인 Mock 단계의
> 무결성·프런트 결함은 이번에 반영했고, 실제 발송·배포는 설계 승인 후에만 진행한다.
