# 연동 가이드 — n8n · 카카오톡 챗봇

만물인테리어 웹을 **n8n 워크플로 엔진**과 **카카오톡 챗봇**에 연결하는 방법입니다.
기획서(§7 AI·도구 역할 분담, §8 로드맵)의 구조를 그대로 따릅니다.

```
[웹 단계형 폼] ──POST──> [n8n Webhook] ──> AI요약·분류 ──> DB저장
                                              │
                                              ├──> 대표에게 카카오 알림
                                              └──> (대표 승인) ──> 고객에게 카카오 발송

[카카오톡 채널/챗봇] ──스킬요청──> [n8n Webhook(스킬서버)] ──> 응답(2.0 템플릿)
```

> **원칙:** 금액·계약·고객 발송·삭제는 **대표 승인 없이는 실행하지 않습니다.**
> AI는 초안까지만 만들고, 발송은 승인 버튼을 눌러야 진행됩니다 (초안·발송 분리).

> 🚀 **n8n을 아직 안 띄웠다면** → 무료 클라우드부터 처음부터 세우는
> [**SETUP-n8n-kakao.md**](SETUP-n8n-kakao.md)를 먼저 보세요. 이 문서는 그 다음 단계입니다.

---

## 1. 사전 준비

| 항목 | 설명 |
|------|------|
| n8n 인스턴스 | [n8n.io](https://n8n.io) 클라우드 또는 self-host (Docker) |
| 카카오톡 채널 | [카카오톡 채널 관리자센터](https://center-pf.kakao.com)에서 채널 생성 |
| 카카오 i 오픈빌더 | [i 오픈빌더](https://i.kakao.com)에서 챗봇 생성 후 채널 연결 |
| Claude API 키 | [Anthropic Console](https://console.anthropic.com) (AI 1차 분석용, 선택) |
| DB (선택) | PostgreSQL — 고객·프로젝트·문의·A/S 단일 저장소 |

---

## 2. n8n 워크플로 가져오기

1. n8n에서 **Workflows → Import from File**을 선택합니다.
2. 아래 두 파일을 각각 가져옵니다.
   - `integrations/n8n/manmul-inquiry.workflow.json` — 상담 문의 처리
   - `integrations/n8n/kakao-chatbot-skill.workflow.json` — 카카오 챗봇 스킬서버
3. 각 워크플로의 **Webhook** 노드에서 **Production URL**을 복사해 둡니다.
   - 예: `https://your-n8n.example.com/webhook/manmul-inquiry`
   - 예: `https://your-n8n.example.com/webhook/kakao-skill`
4. 크리덴셜을 설정합니다.
   - **AI 1차 분석 (Claude)** 노드: 환경변수 `ANTHROPIC_API_KEY` 또는 HTTP Header 크리덴셜
   - **대표에게 카카오 알림** 노드: 환경변수 `KAKAO_ADMIN_TOKEN`
   - **DB 저장 (Postgres)** 노드: Postgres 크리덴셜 (미사용 시 노드 비활성화)
5. 워크플로를 **Active**로 전환합니다.

> AI/DB/카카오 노드는 크리덴셜이 없어도 **가져오기(import)는 정상 동작**합니다.
> 먼저 Webhook → Respond 흐름만 켜서 접수 확인 후, 노드를 하나씩 연결하세요.

---

## 3. 웹에 n8n·카카오 연결하기

`data/config.json`을 열어 값을 채웁니다.

```json
{
  "n8n": {
    "inquiryWebhookUrl": "https://your-n8n.example.com/webhook/manmul-inquiry",
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

- `n8n.enabled: true` + `inquiryWebhookUrl` 설정 → 폼 제출이 n8n으로 전송됩니다.
- `kakao.chatUrl` → "카카오톡 상담" 버튼이 채널 1:1 채팅으로 연결됩니다.
- `demoMode: false` → n8n 미응답 시 실패로 처리(운영). `true`면 로컬 저장으로 폴백(데모).

변경 후 저장하면 코드 수정 없이 즉시 반영됩니다. (사이트 새로고침)
> 예시 파일: [`integrations/config.example.json`](config.example.json)

### 실서비스 전환 체크리스트 (3단계)

1. **채우기** — `data/config.json`에 실제 값 입력
   - `n8n.inquiryWebhookUrl` = n8n 상담 워크플로 **Production Webhook URL**
   - `n8n.enabled` = `true`, `demoMode` = `false`
   - `kakao.channelAddUrl`·`chatUrl` = 카카오톡 채널 홈/1:1 채팅 URL
2. **검증** — 관리자 화면(`admin.html`) → **연동 상태** 패널에서
   - 배지가 **🟢 실서비스 연결됨** 인지 확인
   - **웹훅 연결 테스트** 버튼으로 n8n이 요청을 수신하는지 확인
   (n8n Webhook 노드는 웹 도메인에 대해 **CORS 허용** 필요)
3. **비밀값 분리** — 관리자 토큰·API 키 등은 **repo에 넣지 말고** n8n
   환경변수(`KAKAO_ADMIN_TOKEN`, `CLAUDE_API_KEY` 등)로 관리

---

## 3-1. n8n 없이 바로 상담받기 (무료 · MVP)

n8n·DB를 아직 안 붙였어도 **상담 신청이 대표에게 도착**하게 하는 두 경로가 있습니다.

### (A) 항상 동작 — 고객이 직접 전송 (설정 0)
상담 폼 제출이 끝나면 완료 화면에 **📞 전화 · 💬 카카오톡 · ✉️ 문자** 버튼이 나옵니다.
고객이 한 번 누르면 신청 요약이 그대로 대표 번호(`site.json`의 `company.phone`)로
전송되거나 카카오 채널로 복사됩니다. 서버가 없어도 **리드 유실 0**.

### (B) 자동 이메일 접수 — 무료 폼 서비스 (권장)
가입/서버 없이 상담 내용을 **대표 이메일로 자동** 받습니다.
1. [Web3Forms](https://web3forms.com) 에서 이메일만 입력하고 **Access Key** 발급(무료)
2. `data/config.json` 의 `forms` 를 설정:
   ```json
   "forms": {
     "enabled": true,
     "provider": "web3forms",
     "endpoint": "https://api.web3forms.com/submit",
     "accessKey": "발급받은-키"
   }
   ```
3. 저장하면 끝. 폼 제출 시 요약이 대표 메일로 전송됩니다. (Formspree 등 다른 서비스도 endpoint만 바꾸면 됩니다.)

> 우선순위: `n8n.enabled` → `forms.enabled` → (둘 다 없으면) 고객 직접 전송(A).
> 나중에 n8n을 붙이면 자동으로 그쪽이 우선합니다.

---

## 4. 카카오톡 챗봇(i 오픈빌더) 스킬 연결

1. i 오픈빌더에서 챗봇을 열고 **스킬(Skill)** 메뉴로 이동합니다.
2. **스킬 서버 URL**에 n8n 스킬 워크플로의 Webhook Production URL을 등록합니다.
   - `https://your-n8n.example.com/webhook/kakao-skill`
3. **시나리오 → 폴백 블록**(또는 원하는 블록)의 **스킬 데이터** 응답으로 위 스킬을 연결합니다.
4. 봇을 **배포**하고 채널과 연결합니다.

### 스킬 요청/응답 포맷 (참고)

**카카오 → n8n (요청 body):**
```json
{
  "userRequest": { "utterance": "34평 아파트 견적", "user": { "id": "abc" } },
  "action": { "params": {} }
}
```

**n8n → 카카오 (응답, 스킬 워크플로가 자동 생성):**
```json
{
  "version": "2.0",
  "template": {
    "outputs": [ { "simpleText": { "text": "..." } } ],
    "quickReplies": [
      { "label": "30초 견적", "action": "message", "messageText": "견적 알려줘" }
    ]
  }
}
```

`카카오 응답 생성` 코드 노드에서 `HOME` 상수를 실제 배포 도메인으로 바꾸세요.

---

## 5. 대표 승인 흐름 (사람 승인 장치)

`manmul-inquiry` 워크플로에는 **대표 승인 대기(Wait)** 노드가 있습니다.

1. 문의가 접수되면 대표에게 카카오 알림이 갑니다.
2. 대표가 관리자 대시보드(`admin.html`) 또는 알림 링크에서 **승인/보류/거절**을 선택합니다.
3. 승인 시 Wait 노드가 재개되고, **승인된 건만** 고객에게 안내가 발송됩니다.

> 관리자 대시보드는 현재 데모로 `localStorage`를 사용합니다.
> 실서비스에서는 n8n이 저장한 DB를 조회하도록 `js/admin.js`의 데이터 소스를
> REST API 호출로 교체하고, 승인 버튼이 Wait 노드의 resume URL을 호출하도록 연결하세요.

---

## 5-2. 알림톡 자동 발송 노드 설정 (완전 자동 발송)

`admin.html`의 **수동 발송**(대표가 직접 복사/문자/카카오)과 별개로, 승인된 건을
**카카오 알림톡으로 자동 발송**하려면 `manmul-inquiry` 워크플로의
**"고객에게 안내 발송 (승인분)"**(httpRequest) 노드를 실제 발송 대행 API로 연결합니다.

### 준비물
1. **사업자 + 카카오 채널** — 발신프로필(senderKey) 발급 (채널과 사업자 정보 일치)
2. **발송 대행 파트너** — 솔라피(solapi)·알리고(aligo)·NHN Cloud 등 중 하나 가입
3. **템플릿 심사 승인** — [`alimtalk-templates.md`](alimtalk-templates.md)의 T1·T2·T3 등록 → 코드 발급
4. `data/config.json` → `kakao.alimtalk` 에 `provider`·`templates`(승인 코드) 입력, `enabled: true`

### 노드 구성 (솔라피 예시)
- **Method/URL**: `POST https://api.solapi.com/messages/v4/send`
- **인증**: API Key/Secret → **n8n 자격증명**(HTTP Header Auth)으로 보관 (repo 금지)
- **Body**(예):
```json
{
  "message": {
    "to": "={{$json.phone}}",
    "from": "발신번호(사전등록)",
    "kakaoOptions": {
      "pfId": "={{$env.KAKAO_SENDER_KEY}}",
      "templateId": "={{$json.templateCode}}",
      "variables": {
        "#{고객명}": "={{$json.name}}",
        "#{공간요약}": "={{$json.summary}}",
        "#{예상범위}": "={{$json.estimateRange}}",
        "#{다음단계}": "={{$json.nextStep}}"
      }
    }
  }
}
```
- **templateCode 매핑**: 승인 여부/단계에 따라 앞선 `set`/`code` 노드에서
  `templateCode` 를 `config.kakao.alimtalk.templates.intake|survey|estimate` 중 하나로 채웁니다.
- **실패 폴백**: 알림톡 발송 실패(미채널추가 등) 시 SMS로 대체 발송하는 IF 분기를 두세요.

### 승인 게이트 (중요)
- **T1(intake)** 은 폼 접수 직후 자동 발송 가능(정보성 확인).
- **T2(survey)·T3(estimate)** 는 **대표 승인(Wait 재개) 이후에만** 이 노드에 도달하도록
  연결합니다 — 금액·일정 관련 발송은 사람 승인·기록을 거칩니다(무승인 발송 0).

> 비용: 알림톡은 건당 소액 유료(대행사별 상이). 채널 친구가 아니어도 발송되나,
> 템플릿 심사·발신프로필 등록이 반드시 선행됩니다.

---

## 5-1. 알림 미확인 리마인드 (읽음 추적)

고객에게 발송한 카카오톡 알림이 **읽히지 않았을 때** 자동으로 다시 안내합니다.
(고객 전용 링크의 "카카오톡 알림 이력"에 **읽음/미확인·리마인드 예정**이 표시됩니다.)

권장 구성:

1. **읽음 추적** — 알림에 담긴 고객 전용 링크(`mypage.html?pid=...`) 진입 시
   n8n Webhook로 `read` 이벤트를 기록합니다. (카카오 알림톡의 열람 콜백을 쓸 수 있으면 병행)
2. **리마인드 스케줄** — 발송 후 **Wait(예: 24시간)** 노드를 두고, 재개 시점에
   해당 알림의 `read` 여부를 조회합니다.
3. **분기(IF)** — 아직 미확인이면 **리마인드 발송**(카카오 재발송 → 실패 시 SMS 폴백),
   이미 읽었으면 종료합니다.
4. **중요 알림만** — 진행 사진 등 일반 알림은 1회 리마인드, **결제·계약 관련은
   사람 승인 후에만** 재발송합니다(무승인 발송 0 원칙 유지).

> 데이터 예시: `data/project.json`의 `notifications[]`에 `read`(읽음)·`remindAt`(리마인드 예정 시각).

---

## 6. 안전장치 체크리스트 (기획서 §10)

- [ ] AI 출력에 기준일·제외사항·신뢰수준을 함께 저장
- [ ] 고객 사진·주소는 프로젝트 권한자만 접근
- [ ] 승인 버튼을 눌러야 메시지 발송 (무단 발송 0건)
- [ ] 포트폴리오·SNS 생성 전 공개 동의 확인
- [ ] 구조·전기·가스·누수·안전은 AI가 결정하지 않음 (전문가 확인 필수)
- [ ] 자동화 실패 시 1~2회 후 사람에게 원인·데이터 전달 (무한 재시도 금지)
- [ ] 엑셀·카톡·메모 분산 금지, 단일 DB + 변경 이력 유지

---

## 7. 로드맵 (기획서 §8)

| 단계 | 목표 | 이 저장소의 대응 |
|------|------|------------------|
| 1단계 | 영업 MVP | 홈·시공사례·단계형 문의·관리자 리드보드·AI 요약 ✅ |
| 2단계 | 견적 보조 | 표준 공종·자재 등급·참고 범위 (견적 시뮬레이터 확장) |
| 3단계 | 현장·고객 | 고객 마이페이지·사진보고·변경 승인 |
| 4단계 | 루프 에이전트 | 성과 분석·콘텐츠 재생산·후속 영업·A/S 패턴 |
