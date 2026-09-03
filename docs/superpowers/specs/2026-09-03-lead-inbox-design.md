# 문의 접수함(Lead Inbox) 설계 — 2026-09-03

## 왜

대표 결정(9/3): 홈페이지 문의는 **관리자 페이지에 이력을 남겨 승인 방식**으로 처리한다. 선택지 A(현장 앱 수동 붙여넣기 + 승인, 이력 없음)와 B(서버 접수함 + 승인 이력) 중 **B**.

지금까지 문의는 Web3Forms 메일 한 통으로 끝났다. 메일함에서 사라지면 "누가 언제 무슨 문의를 했고 내가 뭐라고 판정했나"가 남지 않았다.

## 무엇

| 조각 | 파일 | 역할 |
|---|---|---|
| 서버 | `apps-script-lead-inbox/Code.gs`, `LeadInboxPure.gs`, `appsscript.json`, `README.md` | 별도 Apps Script 웹앱 + 전용 구글 시트(`문의`·`이력`·`세션`). 폼 접수(`leadCreate`)와 대표 판정(`leadDecide`)을 기록 |
| 폼 → 서버 | `js/lead-transport.js` `deliver` | 메일 경로(n8n/폼 서비스) 뒤에 접수함 호출. **하나라도 받으면 성공**, 접수함 줄에 메일 발송 여부(`emailDelivered`)가 남는다. `leadId`(UUID)는 `deliver` 가 붙이고 재시도해도 같다 |
| 설정 | `data/config.json` `inbox { enabled, url }` | 꺼져 있으면(기본) 지금과 완전히 같다. 켜려면 script.google.com 의 `/exec` 주소만 허용 |
| 대표 화면 | `lead-inbox.html`, `js/lead-inbox-api.js`, `js/lead-inbox.js`, `css/lead-inbox.css` | 관리 비밀번호 로그인 → 상태별 목록 → 건별 내용·이력 → 승인/보류/거절 + 메모 → 본문 복사(현장 앱 「📥 웹 업무 연결」에 붙여넣기) |
| 관리자 표시 | `js/admin.js` | 연결 상태 줄 "문의 접수함(서버 이력·승인)" |
| 처리방침 | `privacy.html` | 3절 경유 설명, `#privacy-lead-inbox-retention` 보관 기준 |

## 상태와 전이

`신규 → 승인 | 보류 | 거절`, `보류 → 승인 | 거절`, `거절 → 보류`. **승인은 종착**(현장으로 넘어간 뒤 기록이 사라지면 안 된다). 거절은 사유 메모 필수. 이 표는 `LeadInboxPure.gs`·`js/lead-inbox.js` 에 같은 글자로 있고 `scripts/ensure-lead-inbox.mjs` 가 둘을 맞춘다.

## 보안·개인정보 (직원 포털과 같은 규칙)

- 비밀값(세션 비밀·관리 비밀번호·로그인 pepper·시트 ID)은 스크립트 속성에만. 코드·Git 금지.
- 비밀번호는 HMAC 뒤 상수시간 비교, 5회/15분 잠금(CacheService). 세션 토큰은 원문 한 번만 반환, 서버에는 HMAC 해시. 8시간 만료, 30일 지난 세션 자동 정리.
- 판정은 클라이언트 `requestId`(UUID)로 멱등. 접수는 `leadId` 로 중복 방지, 10분 60건 상한.
- 손님 입력의 수식 첫 글자(`= + - @` 탭 줄바꿈)는 작은따옴표로 고정(거부하지 않음). 제어문자 제거, 열별 길이 상한.
- 화면: noindex·no-referrer·CSP(connect-src 는 Apps Script 두 호스트)·프레임 가드·sessionStorage 만·textContent 만·console 금지. robots.txt Disallow, sitemap 제외.
- 오류는 서버에서 코드 하나로 접고(`leadPublicError_`) 화면 문구는 그 코드 표와 1:1.

## 검사

- `tests/lead-inbox-pure.test.cjs` — 순수 로직(정규화·전이·접수번호·비밀번호 형식).
- `tests/lead-inbox-transport.test.cjs` — 폼 → 접수함 경로(둘 다 성공/한쪽 실패/둘 다 실패/주소 규칙/leadId 안정/저장소 무접촉).
- `tests/lead-inbox.e2e.cjs` — 브라우저(잠금·XSS·세션 필드·판정·연타·복사·로그아웃·만료·복원·프레임). 서버는 `page.route` 로 대신하고 실제 외부 호출은 없다.
- `scripts/ensure-lead-inbox.mjs` — 위 규칙의 정적 검사. 21개 변이 중 21개를 잡는 것을 확인(2026-09-03).

## 열어 두는 것

- 실제 서버 배포는 대표가 README 순서대로 한다(약 30분). 배포 전에는 `inbox.enabled:false` 로 지금과 같다.
- 승인 뒤 현장 앱 등록은 **본문 복사 → 앱에 붙여넣기**다. 복사본 마지막 줄의 「접수번호: LD-…」를 앱 v249 가 읽어 현장 `sourceReceiptNo` 에 남기고 같은 번호를 두 번 등록하지 않는다(같은 날 추가). 앱이 접수함을 직접 읽는 연동은 다음 단계.
- 새 문의 알림은 서버 속성 `LEAD_INBOX_NOTIFY_TO` 에 주소를 넣으면 평문 메일로 간다(같은 날 추가, #156). 카톡/문자 알림은 없다.
