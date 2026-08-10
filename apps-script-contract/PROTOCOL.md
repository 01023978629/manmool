# 전자계약 Apps Script — 통신 규약 (contract-api-v1)

이 문서가 **웹앱과 현장 앱 사이의 계약**입니다. 여기 적힌 것만 오갑니다.
코드를 고칠 때 이 문서를 먼저 고치세요. 문서와 코드가 어긋나면 코드가 틀린 것입니다.

---

## 왜 `text/plain` 으로 보내는가

브라우저는 `Content-Type: application/json` 으로 다른 출처에 POST 하기 전에
**OPTIONS 요청(preflight)** 을 먼저 보냅니다. Apps Script 웹앱은 OPTIONS 에
응답하지 못해서 그 자리에서 막힙니다.

`text/plain` 은 preflight 없이 바로 나가는 몇 안 되는 타입 중 하나라,
기존 사진 중계 릴레이(`hyeonjang/apps-script/Code.gs`)도 같은 방법을 씁니다.
**본문은 여전히 JSON 문자열**이고, 서버가 `JSON.parse` 합니다.

```js
fetch(WEBAPP_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },  // ← 반드시 text/plain
  body: JSON.stringify({ action: 'contract.list', adminToken: '...', ts: Date.now() })
});
```

`redirect: 'follow'` 가 기본이어야 합니다 — Apps Script 는 302 로 한 번 넘깁니다.

---

## 요청 형태

```jsonc
{
  "action":     "contract.create",   // 필수. 아래 목록에 없는 값은 거부.
  "ts":         1785000000000,       // 필수. 서버 시각과 ±10분을 벗어나면 거부.
  "adminToken": "…",                 // 관리자 동작에만
  "signToken":  "…",                 // 고객 동작에만 (원문 토큰)
  "idem":       "…",                 // 선택. 같은 값이면 두 번 실행하지 않는다.
  "payload":    { }                  // 동작별 내용
}
```

`adminToken` 과 `signToken` 은 **절대 로그에 찍지 않습니다.** 기록에는 해시만 남습니다.

## 응답 형태

성공: `{ "ok": true, ... }` · 실패: `{ "ok": false, "error": "CODE", "message": "한국어 설명" }`

HTTP 상태는 언제나 200 입니다(Apps Script 제약). **`ok` 를 보고 판단하세요.**
`ok` 를 안 보고 성공으로 넘기면 실패가 조용히 지나갑니다.

### 오류 코드

| code | 뜻 |
|---|---|
| `BAD_REQUEST` | 본문·필수값 문제 |
| `UNAUTHORIZED` | 관리자 토큰 불일치 |
| `NOT_CONFIGURED` | 스크립트 속성이 덜 설정됨 |
| `CLOCK_SKEW` | 요청 시각이 ±10분을 벗어남 |
| `NOT_FOUND` | 그런 계약이 없음 |
| `TOKEN_EXPIRED` / `TOKEN_USED` / `TOKEN_REVOKED` / `TOKEN_INVALID` | 고객 링크 상태 |
| `LOCKED` | 잠금·완료된 계약을 고치려 함 |
| `BAD_STATE` | 허용되지 않는 상태 전이 |
| `DOC_TAMPERED` | 고객이 본 지문과 서버 지문이 다름 |
| `BUSY` | 다른 작업이 진행 중(LockService) |
| `AI_NOT_CONFIGURED` | 그 제공자의 키가 스크립트 속성에 없음 |
| `AI_PAID_BLOCKED` | 유료 제공자를 `AI_ALLOW_PAID` 없이 부름 |
| `AI_QUOTA` | 하루·분당 한도 초과 |
| `AI_UPSTREAM` | 제공자가 오류를 돌려줌 |
| `SERVER_ERROR` | 그 외 |

---

## 동작 목록

### 관리자 (`adminToken` 필요)

| action | payload | 하는 일 |
|---|---|---|
| `health` | — | 설정 상태·버전. 토큰 없이도 되지만 값은 최소만. |
| `contract.create` | `{title, amount, customer:{name,phone}, body?}` | 계약 생성(DRAFT) + 대금 3회차 |
| `contract.get` | `{id}` | 계약 1건 + 대금 + 사건 이력 |
| `contract.list` | `{status?, limit?, offset?}` | 목록(요약). 본문·해시 제외 |
| `contract.lock` | `{id}` | 본문 확정 → `docHash` 발급, 원본 파일 저장. 이후 본문 불변 |
| `contract.void` | `{id, reason?}` | 취소 + 미사용 토큰 전부 무효화 |
| `signlink.issue` | `{id, ttlHours?}` | **원문 토큰을 이때 한 번만** 돌려준다. 서버는 해시만 저장 |
| `contract.quickSend` | `{title, amount, customer:{name,phone}, body?, ttlHours?}` | 생성 → 잠금 → 링크발급을 **한 번에**. 아래 참조 |
| `notify.send` | `{to, text, kind}` | 임의 문자 발송 시도. 발송이 꺼져 있으면 `sent:false` |
| `ai.ask` | `{provider, model, body}` | **AI 중계.** 아래 참조 |
| `ai.status` | — | 어떤 AI 가 준비됐는지·오늘 몇 건 썼는지. 키 값은 안 준다 |
| `payment.update` | `{id, stage, status, memo?}` | 청구·입금 표시 |
| `backup.export` | `{}` | 전체를 JSON 으로 Drive 백업 폴더에 저장 |
| `settings.get` / `settings.set` | `{key,value}` | 비밀이 아닌 운영값만. 금지어 포함 키는 거부 |

### 고객 (`signToken` 필요 · 관리자 토큰 없음)

| action | payload | 하는 일 |
|---|---|---|
| `sign.view` | — | 계약 본문·금액·지문. **토큰을 소진하지 않는다**(다시 열어볼 수 있어야 함) |
| `sign.submit` | `{signerName, signatureImage, agreed, docHashSeen}` | 서명 저장 → 완료 PDF → 토큰 소진 |
| `done.view` | — | 완료본 열람(purpose=view 토큰, 짧은 만료) |

**계약 ID 로는 고객이 아무것도 열 수 없습니다.** 고객 경로는 토큰만 받습니다.
그래서 ID 를 추측해도 남의 계약이 열리지 않습니다.

### `contract.quickSend` — 현장에서 실제로 쓰는 동작

폰에서 계약 한 건을 보내려면 생성·잠금·링크발급 세 번을 왕복해야 합니다.
현장 신호가 나쁘면 두 번째에서 끊겨 **잠기지 않은 계약이 남습니다.**
그래서 셋을 한 번에 묶습니다. 안은 그냥 세 함수를 차례로 부르는 것이고,
전체가 하나의 `LockService` 안에서 돕니다 — 중간에 실패하면 계약도 남지 않습니다.

응답:
```jsonc
{
  "ok": true,
  "contractId": "ct_…",
  "contractNo": "MM-2026-0143",
  "signUrl": "https://script.google.com/…/exec?page=sign&t=…",  // 원문 토큰이 실린 완성 링크
  "expiresAt": "2026-08-02T…Z",
  "notify": { "sent": false, "reason": "MOCK_OFF" }   // 발송은 기본 꺼짐
}
```

`signUrl` 은 **이 응답에서만** 볼 수 있습니다. 서버에 원문이 남지 않으므로
다시 물어볼 수 없고, 잃어버리면 `signlink.issue` 로 새 링크를 발급해야 합니다.

`notify.sent` 가 `false` 여도 계약과 링크는 정상입니다 — 사장님이 링크를 직접 보내면 됩니다.
**`notify.sent` 를 보지 않고 "보냈습니다"라고 화면에 띄우지 마세요.**

### `ai.ask` — AI 키를 브라우저에서 서버로 옮기는 통과창구

전에는 현장 앱이 Gemini·ChatGPT 를 **브라우저에서 직접** 불렀습니다. 그래서 키가
사장님 폰 안에 있었고 네 가지가 따라왔습니다.

| | |
|---|---|
| 기기마다 키를 따로 넣어야 함 | 키는 보안상 클라우드 백업에 안 실립니다 |
| 사파리가 7일마다 지움 | 홈 화면에 추가 안 한 사이트의 저장소를 정리합니다 |
| **ChatGPT 키는 도용을 막을 수 없음** | OpenAI 키에는 도메인 제한 기능이 아예 없습니다 |
| 한도를 기기마다 따로 셈 | PC 200 + 폰 200 = 400건이 나갑니다 |

`ai.ask` 는 키를 **스크립트 속성**으로 옮겨 넷을 한 번에 없앱니다.

```jsonc
// 요청 — 앱이 원래 그 API 에 보내던 본문을 그대로 body 에 담는다
{ "action": "ai.ask", "adminToken": "…", "ts": …,
  "payload": { "provider": "gemini", "model": "gemini-2.0-flash",
               "body": { "contents": [ … ] } } }

// 응답 — 제공자가 준 답을 그대로 돌려준다
{ "ok": true, "provider": "gemini", "model": "…", "status": 200, "json": { … } }
```

- **얇은 통과창구입니다.** 프롬프트를 서버에서 다시 만들지 않습니다 — 그러면 앱과 서버
  두 곳을 따로 고치게 되고 언젠가 한쪽만 고쳐집니다.
- 부를 수 있는 곳은 **아는 두 곳뿐**입니다. 주소를 요청에서 받지 않습니다.
- 키는 **헤더로만** 나갑니다. 주소에 붙이면 오류 로그·중계 기록에 남습니다.
- 한도(하루 200 · 분당 8)를 **서버 한 곳에서** 셉니다. 실패하면 되돌립니다.
- 서버에 키가 없으면 `AI_NOT_CONFIGURED` 로 답합니다. 앱은 이걸 보고 기기에 넣어 둔
  키로 되돌아갈 수 있어야 합니다 — **있는 척하지 않습니다.**
- 한도 초과(`AI_QUOTA`)일 때는 앱이 **기기 키로 우회하면 안 됩니다.** 우회하면
  한 곳에서 센다는 말이 거짓이 됩니다. 이건 앱 쪽 회귀 테스트로 묶어 두었습니다.
- **이 한도는 요금이 아니라 횟수를 셉니다.** 하루 200건은 "구글에 200번까지만 부른다"는
  뜻이지 "200건까지 공짜"라는 뜻이 아닙니다. 그 200번에 얼마가 청구되는지는 키가 속한
  프로젝트의 결제 상태가 정합니다 — 서버가 손댈 수 없는 영역입니다.

#### 유료는 기본으로 잠겨 있습니다

| 제공자 | 요금 | 기본 |
|---|---|---|
| `gemini` | 무료 — **단 키가 속한 구글 프로젝트에 결제계정이 없을 때만.** 연결돼 있으면 쓴 만큼 과금 | **열림** |
| `openai` | 쓴 만큼 과금 · 키에 도메인 제한 기능이 아예 없음 | **잠김** |

> ⚠️ **잠금(`AI_ALLOW_PAID`)은 `openai` 에만 걸려 있습니다.** `gemini` 키의 프로젝트에
> 결제계정이 붙으면 **잠기지 않은 채로 과금됩니다.** 서버는 그 연결 여부를 알 수 없습니다 —
> 구글이 키만으로는 알려주지 않기 때문입니다. 그래서 이 잠금은 요금 방어의 전부가 아니고,
> **결제계정을 붙이지 않는 것**이 유일한 구조적 방어입니다.

`openai` 를 부르면 키가 있어도 `AI_PAID_BLOCKED` 로 거절합니다.
열려면 스크립트 속성 `AI_ALLOW_PAID=1` 을 넣어야 합니다 — 사람이 한 번 정하는 행동으로 만든 것입니다.
현장 앱은 지금 `provider: 'gemini'` 만 부릅니다.

스크립트 속성: `GEMINI_API_KEY` · `OPENAI_API_KEY` · `AI_ALLOW_PAID` (전부 선택)

---

### GET

| 주소 | 하는 일 |
|---|---|
| `?action=health` | 상태 확인(주소창용) |
| `?page=sign&t=<토큰>` | 고객 서명 화면(HTML) |
| `?page=done&t=<토큰>` | 완료본 확인 화면(HTML) |

---

## 토큰 규칙

- 발급: 무작위 **32바이트 이상**을 base64url 로. `Utilities.getUuid()` 하나만 쓰지 않습니다(엔트로피 부족).
- 저장: **SHA-256 해시만.** 원문은 발급 응답에 한 번 실려 나가고 서버에 남지 않습니다.
- 만료: `sign` 기본 72시간, `view` 기본 15분.
- 1회성: `sign.submit` 이 성공하면 `usedAt` 이 찍히고 다시 못 씁니다.
- 취소: 계약이 VOID 되면 그 계약의 미사용 토큰이 전부 `revokedAt` 됩니다.

## 동시성

`contract.create` · `contract.lock` · `signlink.issue` · `contract.quickSend` ·
`contract.void` · `payment.update` · `settings.set` · `sign.submit` 은
`LockService.getScriptLock()` 안에서 실행합니다. 잠금을 못 잡으면 `BUSY` 로 **실패**합니다 —
기다렸다가 두 번 쓰지 않습니다.

`idem` 을 함께 보내면 같은 값의 요청은 **처음 결과를 그대로 돌려줍니다**(재실행 없음).
인증을 먼저 통과한 뒤 조회하며, 고객 요청의 캐시는 토큰 해시별로 분리됩니다.
잠금이 필요한 동작은 캐시 조회·실행·결과 저장까지 같은 잠금 안에서 처리합니다.
전화가 끊겨 앱이 재시도했을 때 계약이 두 건 생기는 것을 막습니다.

---

## 알아 두셔야 할 제약

- **고객 IP 를 남길 수 없습니다.** Apps Script 웹앱은 요청자 IP 를 코드에 주지 않습니다.
  Fly 서버에서는 남기던 항목이고, 지금은 못 남깁니다. 대신 User-Agent 해시와
  서버 기준 시각을 남깁니다. 분쟁 시 증거의 강도가 그만큼 약합니다.
- **실행 1회당 6분**을 넘으면 구글이 끊습니다. 백업 내보내기처럼 오래 걸릴 수 있는
  동작은 나눠서 돌리도록 만들어야 합니다.
- 무료 계정 기준 하루 실행 시간·UrlFetch 호출 수에 한도가 있습니다(`DEPLOY.md` 참조).
