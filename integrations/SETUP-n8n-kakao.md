# 무료 클라우드 n8n · 카카오톡 셋업 가이드

만물인테리어 공개 사이트를 **실서비스**로 전환하는 처음부터 끝까지 순서입니다.
목표: **웹 상담 폼 → n8n → (Claude 요약·DB 저장·카카오 알림) → 대표 승인 → 고객 발송**.

> 이 문서는 "n8n을 어떻게 띄우나"부터 다룹니다. n8n이 이미 있으면
> [`INTEGRATION.md`](INTEGRATION.md)의 3~5장으로 바로 가도 됩니다.

---

## 0. 먼저 알아둘 비용 현실

| 구성요소 | 무료 여부 |
|---|---|
| **n8n 자체** | 오픈소스 = 무료. 단, "공개 URL로 24시간 떠 있게" 하려면 호스팅이 필요 |
| **호스팅** | Oracle Cloud Always Free(무료·평생) / Render 무료(잠자기) / n8n Cloud(14일 체험 후 유료) |
| **Postgres DB** | Supabase·Neon 무료 티어로 충분 |
| **Claude API** | 종량제(소액 유료). 문의 1건 요약 ≈ 수 원 |
| **카카오 채널** | 개설 무료 / **알림톡 발송**은 사업자 등록 + 건당 소액 요금 |

> 개발·테스트까지는 **완전 무료**로 가능합니다. 실제 고객 알림 발송(알림톡)과
> Claude 요약은 소액이 듭니다. 아래는 **무료로 시작**하는 경로 기준입니다.

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

## 2. 데이터베이스 준비 (Postgres 무료)

상담 워크플로에 **DB 저장(Postgres)** 노드가 있습니다.

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
> 규모가 작으면 DB 노드를 빼고 n8n **Data Table**이나 Google Sheets로 대체해도 됩니다.

---

## 3. 워크플로 가져오기 (Import)

1. n8n → **Workflows** → **Import from File**
2. 이 저장소의 파일 2개를 각각 가져옵니다:
   - `integrations/n8n/manmul-inquiry.workflow.json` (상담 접수 파이프라인)
   - `integrations/n8n/kakao-chatbot-skill.workflow.json` (카카오 챗봇 스킬)

가져온 뒤 각 노드에 자격증명을 연결합니다(4장).

---

## 4. 자격증명 · 환경변수 (비밀값은 여기서만)

n8n **Settings → Variables/Credentials** 또는 컨테이너 환경변수로 설정합니다.
**절대 repo(config.json)에 넣지 마세요.**

| 노드 | 필요한 값 |
|---|---|
| AI 1차 분석 (Claude) | `CLAUDE_API_KEY` — https://console.anthropic.com 에서 발급 |
| DB 저장 (Postgres) | 2장의 Supabase/Neon 접속 정보(Postgres Credential) |
| 대표에게 카카오 알림 | `KAKAO_ADMIN_TOKEN` 등 채널 메시지 발송 토큰(5장) |

- Claude 노드는 `x-api-key` 헤더에 `CLAUDE_API_KEY`, 모델은 최신 Claude로 설정.
- 카카오 알림 노드는 5장에서 발급한 값으로 채웁니다.

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

- [ ] 워크플로 **Active** ON (Production Webhook 활성화)
- [ ] `demoMode: false`, `n8n.enabled: true`
- [ ] 비밀값(Claude 키·DB·카카오 토큰)은 **n8n에만**, repo엔 없음
- [ ] 승인 전에는 고객에게 아무것도 발송되지 않음(무승인 발송 0)
- [ ] 개인정보·사진 공개·전자서명 동의 문구 확인
- [ ] 실패 시 폴백(대표 이메일/문자) 경로 확보

---

> 요약: **경로 A로 n8n을 띄우고 → 워크플로 2개 import → Claude·DB·카카오 자격증명 연결 →
> config.json에 Webhook URL 넣고 demoMode 끄기 → admin 연동 상태에서 테스트**.
> 여기까지면 실서비스 전환 완료입니다.
