# 만물인테리어 · Loop Agent

**AI가 24시간 운영하는 만물인테리어 회사 웹사이트**

상담부터 견적, 시공 관리, 사후 관리까지 — AI 루프 에이전트가 순환하며
운영하는 인테리어 회사 콘셉트의 반응형 원페이지 웹사이트입니다.

기획서(`AI 운영형 홈페이지 기획서`)의 구조 —
**웹 → n8n(워크플로) → 카카오톡(알림·챗봇) → 대표 승인** — 을 그대로 구현했습니다.

## 주요 기능

- **단계형 AI 상담 문의** — 4단계 폼을 **n8n 웹훅**으로 전송 (미설정 시 데모 모드)
- **카카오톡 챗봇 연동** — 채널 상담 버튼 + i 오픈빌더 스킬서버(n8n) 워크플로
- **관리자 대시보드** (`admin.html`) — 리드 목록·AI 1차 요약·우선순위·**승인/보류/거절** (사람 승인 장치)
- **AI 견적 시뮬레이터** — 공간·면적·등급으로 30초 예상 견적 산출
- **AI 상담 챗봇 데모** — 히어로 영역 대화형 애니메이션
- **서비스 / 운영 프로세스 / 포트폴리오(필터) / 리뷰** — 데이터 기반 렌더링
- 스크롤 리빌·카운트업, 모바일 반응형, 접근성(reduced-motion) 고려

## 구조

```
index.html                              메인 페이지
admin.html                              관리자 대시보드(리드·승인)
css/styles.css, css/admin.css           스타일
js/main.js                              데이터 로드·렌더링
js/inquiry.js                           단계형 상담 폼 → n8n 전송
js/admin.js                             대시보드·승인 로직
data/site.json                          콘텐츠(회사·서비스·견적 단가)
data/config.json                        연동 설정(n8n 웹훅·카카오 채널)
integrations/INTEGRATION.md             n8n·카카오 연동 가이드
integrations/n8n/*.workflow.json        n8n 워크플로(import용)
```

## n8n · 카카오톡 연동

1. `integrations/n8n/`의 워크플로 2개를 n8n에 **Import** 합니다.
   - `manmul-inquiry.workflow.json` — 문의 접수 → AI요약 → 카카오 알림 → 대표 승인 → 고객 발송
   - `kakao-chatbot-skill.workflow.json` — 카카오 i 오픈빌더 챗봇 스킬서버
2. `data/config.json`에 n8n 웹훅 URL과 카카오 채널 URL을 넣고 `enabled: true`, `demoMode: false`로 전환합니다.
3. 자세한 절차는 [`integrations/INTEGRATION.md`](integrations/INTEGRATION.md) 참고.

> **안전장치:** 금액·계약·고객 발송은 **대표 승인 후에만** 실행됩니다(초안·발송 분리).
> AI는 요약·분류·초안까지만 담당합니다.

## 콘텐츠 운영 (AI/운영자용)

- 사이트 콘텐츠는 **`data/site.json`**, 연동 설정은 **`data/config.json`** 하나로 관리됩니다.
- 두 파일만 수정하면 코드 변경 없이 사이트·연동이 갱신되므로, AI 에이전트가 운영할 수 있습니다.

## 로컬 실행

`fetch`로 JSON을 불러오므로 로컬 서버가 필요합니다.

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

## 배포

빌드 과정이 없는 정적 사이트이므로 GitHub Pages, Netlify, Vercel 등에
그대로 배포할 수 있습니다.

---

> 본 프로젝트는 AI 루프 에이전트가 콘텐츠와 상담을 운영하는 콘셉트의 데모입니다.
> 표시된 견적·통계는 예시 값이며 실제 견적은 현장 실측 후 확정됩니다.
