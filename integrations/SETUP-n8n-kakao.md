# 무료 클라우드 n8n · 카카오톡 셋업 가이드

만물인테리어 공개 사이트를 **실서비스**로 전환하는 처음부터 끝까지 순서입니다.
목표: **웹 상담 폼 → n8n → (규칙 분석·시트 저장·카카오 알림) → 대표 승인 → 고객 발송**.

> **1인 운영이면 무료 `lite` 워크플로로 시작하세요.** 이 가이드는 기본적으로
> `manmul-inquiry-lite`(규칙 엔진 Code 노드 + Google Sheets, **API 키·DB 서버 불필요**)
> 기준으로 설명합니다. 유료 Claude 요약 + Postgres 버전은 문의량이 많아졌을 때의
> 선택지이며, 각 장 끝의 **〈고급〉** 표시에서 다룹니다.
> 두 버전 선택 기준은 [`n8n/README.md`](n8n/README.md) 참고.

> 이 문서는 "n8n을 어떻게 띄우나"부터 다룹니다. n8n이 이미 있으면
> [`INTEGRATION.md`](INTEGRATION.md)의 3~5장으로 바로 가도 됩니다.

---

## 0. 먼저 알아둘 비용 현실

| 구성요소 | 무료 여부 |
|---|---|
| **n8n 자체** | 오픈소스 = 무료. 단, "공개 URL로 24시간 떠 있게" 하려면 호스팅이 필요 |
| **호스팅** | Oracle Cloud Always Free(무료·평생) / Render 무료(잠자기) / n8n Cloud(14일 체험 후 유료) |
| **상담 분석** | **lite = 규칙 엔진 Code 노드 → 무료.** 〈고급〉 Claude API는 종량제(문의 1건 ≈ 수 원) |
| **리드 저장** | **lite = Google Sheets → 무료.** 〈고급〉 Postgres(Supabase·Neon 무료 티어)도 가능 |
| **카카오 채널** | 개설 무료 / **알림톡 발송**은 사업자 등록 + 건당 소액 요금 |

> **lite 워크플로는 알림톡 발송 전까지 완전 무료입니다.** (분석·저장 모두 무료 구성)
> 유일하게 소액이 드는 건 정식 **알림톡**(사업자 등록 후)뿐입니다. 그전에는
> 대표 알림을 텔레그램/이메일/문자로 받으면 여전히 0원으로 운영됩니다.

---

## 1. n8n 띄우기 (세 가지 경로)

### 경로 A — 가장 쉬움: n8n Cloud (14일 무료 체험)
1. https://n8n.io → **Get started** → 이메일 가입
2. 워크스페이스가 자동 생성되고, 바로 공개 URL이 나옵니다. (예: `https://<이름>.app.n8n.cloud`)
3. 체험 종료 후에도 쓰려면 유료(Starter). **가장 빠르게 검증**하고 싶을 때 추천.

### 경로 B — 평생 무료 자가호스팅: Oracle Cloud Always Free + Docker
1. Oracle Cloud 가입 → **Always Free** VM(Ampere/A1) 1개 생성(Ubuntu).
2. 도메인 or VM 공인 IP 확보, 방화벽에서 443 오픈.
3. Docker로 n8n 실행(아래) + Caddy/Nginx로 HTTPS.
```bash
docker run -d --restart unless-stopped --name n8n \
  -p 5678:5678 \
  -e N8N_HOST="n8n.yourdomain.com" \
  -e N8N_PROTOCOL="https" \
  -e WEBHOOK_URL="https://n8n.yourdomain.com/" \
  -e GENERIC_TIMEZONE="Asia/Seoul" \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```
> `WEBHOOK_URL`이 실제 공개 주소와 같아야 웹훅 URL이 올바르게 발급됩니다.

### 경로 C — 로컬 개발(임시): Docker + 터널
```bash
docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
# 다른 터미널에서 공개 터널 (예: cloudflared / ngrok)
cloudflared tunnel --url http://localhost:5678
```
> 터널 URL은 재시작 시 바뀝니다. **테스트 전용**으로만 쓰세요.

**추천**: 빠른 검증은 **A**, 실운영은 **B**(또는 소액 관리형).

---

## 2. 리드 저장 준비 (Google Sheets · 무료)

**lite 워크플로는 Google Sheets에 저장합니다.** DB 서버가 필요 없습니다.

1. 구글 드라이브에서 새 스프레드시트 생성 (예: `만물_상담리드`)
2. 첫 행에 헤더를 넣습니다 (워크플로 출력 키와 **글자까지 동일**해야 자동 매핑됩니다):
   ```
   submittedAt | leadId | name | phone | type | region | area | scope | works | budget | movein | live | memo | selectedDesign | estimateHint | aiPriority | aiScore | aiSummary | aiQuestions | aiBudgetFit
   ```
3. n8n의 **Google Sheets Credential**(OAuth 또는 서비스계정)을 연결하고,
   `리드 저장 (Google Sheets)` 노드에서 이 시트를 지정합니다.
   (노드는 헤더명 기준 자동 매핑 = *Map Automatically*로 설정되어 있습니다.)

> 스프레드시트 한 장이 곧 상담 대장(臺帳)이 됩니다. 대표가 폰에서 바로 열어
> 보고, 필터·정렬로 관리할 수 있어 1인 운영에 충분합니다.

### 〈고급〉 Postgres로 저장하려면 (`manmul-inquiry` 버전)

문의량이 많아 관계형 조회·통계가 필요하면 Postgres 버전을 씁니다.

1. https://supabase.com (또는 https://neon.tech) 무료 프로젝트 생성
2. 연결 정보(host·port·database·user·password) 확보
3. 테이블 생성(SQL 에디터):
```sql
create table if not exists inquiries (
  id            bigserial primary key,
  submitted_at  timestamptz default now(),
  status        text default '신규',
  type text, region text, area int, scope text,
  works text, budget text, movein text, live text,
  name text, phone text, memo text,
  estimate_hint text,
  ai_summary text, ai_priority int
);
```

---

## 3. 워크플로 가져오기 (Import)

1. n8n → **Workflows** → **Import from File**
2. 이 저장소의 파일을 가져옵니다:
   - ⭐ `integrations/n8n/manmul-inquiry-lite.workflow.json` — **상담 접수(무료·추천)**
   - `integrations/n8n/kakao-chatbot-skill.workflow.json` — 카카오 챗봇 스킬(선택)
   - 〈고급〉 `integrations/n8n/manmul-inquiry.workflow.json` — Claude+Postgres 버전

> **lite와 고급 버전은 동시에 쓰지 마세요.** 웹훅 경로(`manmul-inquiry`)가 같아
> 충돌합니다. 하나만 **Active**로 켜 둡니다. (기본은 lite)

가져온 뒤 각 노드에 자격증명을 연결합니다(4장).

---

## 4. 자격증명 · 환경변수 (비밀값은 여기서만)

n8n **Settings → Variables/Credentials** 또는 컨테이너 환경변수로 설정합니다.
**절대 repo(config.json)에 넣지 마세요.**

**lite(무료) 워크플로에 필요한 값 — 딱 2가지:**

| 노드 | 필요한 값 |
|---|---|
| 정규화 + 규칙 분석 (무료 Code) | **없음** — 외부 API·키가 필요 없습니다 |
| 리드 저장 (Google Sheets) | Google Sheets Credential(OAuth 또는 서비스계정) |
| 대표에게 알림 (카카오/텔레그램) | `NOTIFY_WEBHOOK_URL` 등 알림 대상 토큰/URL(5장) |

> 알림 노드는 초기엔 **텔레그램 봇**이나 개인 이메일로 두면 5장을 건너뛰고도 동작합니다.

### 〈고급〉 `manmul-inquiry`(Claude+Postgres) 추가로 필요한 값

| 노드 | 필요한 값 |
|---|---|
| AI 1차 분석 (Claude) | `ANTHROPIC_API_KEY` — https://console.anthropic.com 에서 발급 (워크플로가 읽는 환경변수명과 동일해야 함) |
| DB 저장 (Postgres) | 2장의 Supabase/Neon 접속 정보(Postgres Credential) |

- Claude 노드는 `x-api-key` 헤더에 `ANTHROPIC_API_KEY`, 모델은 최신 Claude로 설정.

---

## 5. 카카오톡 연결

### 5-1. 채널 개설(무료)
1. https://business.kakao.com → **카카오톡 채널** 만들기
2. 채널 홈 URL / 1:1 채팅 URL 확인 → 6장 `config.json`에 넣습니다.

### 5-2. 대표 알림 받기
- 가장 간단: **카카오워크/알림톡** 대신, 초기엔 대표 개인에게 **이메일/문자** 또는
  n8n의 **Telegram/Slack** 노드로 알림을 받아도 됩니다(알림톡 심사 전까지).
- 정식 **알림톡**은 사업자 등록 + 발신프로필 + 템플릿 심사가 필요합니다(건당 소액).

### 5-3. 챗봇(자동응대) — 카카오 i 오픈빌더
1. https://i.kakao.com → 봇 생성 → 채널 연결
2. **스킬(Skill)** 등록 → URL에 `kakao-chatbot-skill` 워크플로의 **Production Webhook URL**
3. 폴백 블록/시나리오에서 스킬 호출 → 견적·사례 안내 자동응답
   (상세 포맷은 [`INTEGRATION.md`](INTEGRATION.md) 4장)

---

## 6. 웹에 연결 (config.json)

`data/config.json`을 실제 값으로 채웁니다. (템플릿: `integrations/config.example.json`)

```json
{
  "n8n": {
    "inquiryWebhookUrl": "https://<your-n8n>/webhook/manmul-inquiry",
    "enabled": true
  },
  "kakao": {
    "channelPublicId": "_yourid",
    "channelAddUrl": "http://pf.kakao.com/_yourid",
    "chatUrl": "http://pf.kakao.com/_yourid/chat"
  },
  "demoMode": false
}
```

- `inquiryWebhookUrl` = `manmul-inquiry` 워크플로 Webhook 노드의 **Production URL**
  (워크플로를 **Active**로 켜야 Production URL이 활성화됩니다.)
- 커밋 후 GitHub Pages가 자동 배포하면 즉시 반영됩니다.

### ⚠️ CORS
브라우저(사이트) → n8n 직접 호출이므로, n8n Webhook 응답에
사이트 도메인 허용 헤더가 필요할 수 있습니다.
`respondToWebhook`(웹사이트에 응답) 노드에서 다음 헤더를 추가하세요:
```
Access-Control-Allow-Origin: https://01023978629.github.io
Access-Control-Allow-Headers: Content-Type
```

---

## 7. 검증

1. 사이트 관리자 화면 `admin.html` → **연동 상태** 패널
   - 배지가 **🟢 실서비스 연결됨** 인지 확인
   - **웹훅 연결 테스트** 버튼 → "✓ 웹훅 응답 정상" 나오면 성공
2. 실제로 홈에서 **상담 신청** 제출 → n8n 실행 로그에 접수 확인 →
   대표 알림 수신 → **승인** → 고객 발송까지 한 번 통과시켜 봅니다.
3. 문제 시 점검 순서: 워크플로 Active 여부 → Webhook URL 오타 → CORS →
   각 노드 자격증명 → n8n 실행 로그(Executions).

---

## 8. 운영 체크리스트

- [ ] **lite 워크플로 하나만** Active ON (고급 버전과 동시 활성 금지 — 웹훅 경로 충돌)
- [ ] `demoMode: false`, `n8n.enabled: true`
- [ ] 비밀값(Sheets·카카오 토큰)은 **n8n에만**, repo엔 없음
- [ ] 승인 전에는 고객에게 아무것도 발송되지 않음(무승인 발송 0)
- [ ] 개인정보·사진 공개·전자서명 동의 문구 확인
- [ ] 실패 시 폴백(대표 이메일/문자) 경로 확보

---

> 요약(무료 경로): **경로 A로 n8n을 띄우고 → `manmul-inquiry-lite` + 챗봇 import →
> Google Sheets·알림 자격증명만 연결 → config.json에 Webhook URL 넣고 demoMode 끄기 →
> admin 연동 상태에서 테스트**. Claude 키·Postgres 없이 여기까지면 실서비스 전환 완료입니다.
> 문의량이 늘면 `manmul-inquiry`(Claude+Postgres)로 무중단 교체(웹훅 경로 동일).
