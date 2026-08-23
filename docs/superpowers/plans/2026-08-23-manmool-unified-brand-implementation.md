# Manmool Unified Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 만물인테리어 공개 화면에서 n8n·AI 운영 설명과 복잡한 장식을 걷어내고, 인테리어·누수·사례 페이지가 하나의 신뢰도 높은 만물 브랜드로 보이게 한다.

**Architecture:** 공통 색상·타이포·헤더·버튼·모바일 하단 행동영역은 `css/brand-system.css`에서 관리하고, 인테리어와 누수의 개별 분위기는 기존 테마 CSS가 보완한다. 콘텐츠 데이터와 계산 로직은 유지하되 공개 라벨만 고객 중심 표현으로 바꾸며, 정적 HTML과 생성 스크립트를 함께 수정해 재생성 후에도 동일한 화면을 보장한다.

**Tech Stack:** 정적 HTML5, CSS, 바닐라 JavaScript, Python 사전 렌더러, Node.js 검증 스크립트, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-08-23-manmool-unified-brand-design.md`

## Global Constraints

- 원본 작업 폴더가 아니라 이 격리 worktree에서만 수정한다.
- `data/site.json`의 실제 사례·시안·자재·원가 데이터는 변경하지 않는다.
- `#estimator`, `#simulator`, `#inquiry`, 전화·문자·사례 링크와 계산 동작을 유지한다.
- 참고 시안은 실제 완공 사진으로 오해되지 않도록 짧은 고지를 유지한다.
- 공개 배포·main 병합은 별도 승인 전까지 하지 않는다.

---

## Task 1: 공개 브랜드 계약 테스트 추가

**Files:**
- Create: `scripts/ensure-unified-brand-design.mjs`
- Test: `scripts/ensure-unified-brand-design.mjs`

- [ ] 정적 산출물을 실제로 읽어 공통 브랜드 CSS, 서비스 전환 링크, 핵심 CTA, 4단계 공정, 블로그 필터와 참고 시안 고지를 검사하는 테스트를 작성한다.
- [ ] `node scripts/ensure-unified-brand-design.mjs`를 실행해 현재의 `Loop Agent`, n8n 파이프라인, AI 중심 라벨, 공통 CSS 부재 때문에 RED가 되는 것을 확인한다.
- [ ] 실패 이유가 오탈자가 아니라 아직 구현하지 않은 사용자 경험임을 확인한다.
- [ ] Commit: `test: define unified public brand contract`

## Task 2: 공통 브랜드 기반과 헤더 통일

**Files:**
- Create: `css/brand-system.css`
- Modify: `index.html`
- Modify: `leak.html`
- Modify: `blog.html`
- Modify: `scripts/prerender-posts.py`
- Modify: `scripts/prerender-designs.py`

- [ ] 공통 색상 토큰, 로고, 서비스 전환, 버튼 크기, 포커스 표시, 모바일 44px 터치 규칙을 `brand-system.css`에 구현한다.
- [ ] 인테리어·누수·블로그·글·디자인 상세 화면에 공통 CSS와 `만물인테리어 / 인테리어·누수 전문` 로고 구조를 적용한다.
- [ ] 주요 메뉴를 `인테리어`, `누수·배관`, `실제 사례`, `진행 순서`, `상담`으로 정리하고 각 페이지의 현재 서비스 표시를 제공한다.
- [ ] `python scripts/prerender-posts.py`와 `python scripts/prerender-designs.py`를 실행해 생성 페이지도 같은 껍데기로 갱신한다.
- [ ] 브랜드 계약 테스트를 재실행해 공통 껍데기 항목이 GREEN인지 확인한다.
- [ ] Commit: `feat: unify manmool public brand shell`

## Task 3: 인테리어 홈을 고객 중심으로 단순화

**Files:**
- Modify: `index.html:160-760`
- Modify: `data/site.json:2-220`
- Modify: `js/main.js:1-280`
- Modify: `js/estimate.js:1-240`
- Modify: `js/simulator.js:130-170`
- Modify: `css/styles.css`
- Test: `scripts/ensure-unified-brand-design.mjs`
- Test: `scripts/ensure-conversion-basics.mjs`
- Test: `scripts/ensure-lookbook-honesty.mjs`
- Test: `scripts/ensure-simulator-honesty.mjs`

- [ ] n8n 파이프라인·자동화 통계·시스템/대표 역할 설명 블록과 `renderAutomation()` 호출을 제거한다.
- [ ] 히어로 설명과 카드에는 실측·항목별 견적·시공 기록을 3개 단계로만 보여주고 빈 대화 애니메이션은 제거한다.
- [ ] 공개 라벨을 `간편 예상견적`, `예상 범위 확인`, `우리집 공사 범위 확인`, `인테리어 디자인 참고 시안`, `온라인 상담 24시간`으로 바꾼다.
- [ ] 진행 절차를 `상담 → 실측·견적 → 시공 → 준공·보증` 4단계로 축약한다.
- [ ] 참고 시안에는 `디지털 참고 시안 · 실제 완공 사진 아님` 고지를 한 번 명확하게 남긴다.
- [ ] 사이트 데이터 FAQ와 `index.html` JSON-LD를 동기화하고 기존 계산·문의·전화 기능을 유지한다.
- [ ] 관련 검증을 실행해 GREEN인지 확인한다.
- [ ] Commit: `feat: simplify interior customer journey`

## Task 4: 누수 페이지를 같은 브랜드로 정돈

**Files:**
- Modify: `leak.html`
- Modify: `css/leak-theme.css`
- Test: `scripts/ensure-unified-brand-design.mjs`
- Test: `scripts/ensure-leak-first-experience.mjs`
- Test: `scripts/ensure-leak-inquiry.mjs`
- Test: `scripts/ensure-leak-pricing.mjs`

- [ ] 기존 탐지 요금·못 찾으면 0원·전화·문의 계약은 유지한다.
- [ ] 과도한 스캔 장식을 축소하고 실제 현장 사진과 핵심 약속을 우선 배치한다.
- [ ] 공통 헤더·버튼·카드 모서리·본문 폭을 적용하되 누수 페이지는 네이비·청록 포인트를 유지한다.
- [ ] 누수 검증과 브랜드 계약 테스트를 실행해 GREEN인지 확인한다.
- [ ] Commit: `feat: align leak page with manmool brand`

## Task 5: 사례 목록과 생성 페이지 단순화

**Files:**
- Modify: `blog.html`
- Modify: `js/blog.js`
- Modify: `scripts/prerender-posts.py`
- Modify: `scripts/prerender-designs.py`
- Modify: `css/styles.css`
- Test: `scripts/ensure-unified-brand-design.mjs`
- Test: `scripts/ensure-site-integrity.mjs`

- [ ] 최신 실제 사례 한 건을 대표 카드로 보여주고 아래에 전체 카드를 유지한다.
- [ ] `전체`, `누수·배관`, `인테리어`, `정보` 필터를 추가하되 JavaScript가 꺼져도 모든 글 링크가 정적 HTML에 남게 한다.
- [ ] 필터는 `aria-pressed`, 현재 결과 수, 키보드 조작을 지원하고 DOM에서 링크를 삭제하지 않는다.
- [ ] 글·디자인 상세의 헤더와 하단 CTA를 공통 브랜드로 정돈한다.
- [ ] 사전 렌더러를 다시 실행하고 중복·고아 글이 없는지 검증한다.
- [ ] Commit: `feat: simplify case browsing experience`

## Task 6: 반응형·회귀·산출물 최종 검증

**Files:**
- Create: `tests/unified-brand-design.e2e.js`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `css/brand-system.css`
- Modify: `css/styles.css`
- Modify: `css/leak-theme.css`

- [ ] Playwright 테스트를 먼저 작성하고 로컬 서버에서 320, 390, 768, 1280, 1440px 화면의 가로 넘침, 44px 터치 영역, 모바일 하단 CTA 겹침, 필터 동작을 검사한다.
- [ ] 테스트가 현재 남은 반응형 결함에서 RED가 되는 것을 확인하고 CSS를 최소 수정해 GREEN으로 만든다.
- [ ] 모든 `scripts/ensure-*.mjs`, `scripts/new-case-post.test.mjs`, Apps Script 계약 테스트를 실행한다.
- [ ] `node scripts/build-pages-artifact.mjs`와 `node scripts/ensure-pages-artifact.mjs`를 실행해 공개 허용목록 산출물을 검증한다.
- [ ] 브라우저 콘솔 오류 없이 인테리어·누수·블로그·글 상세를 데스크톱과 모바일에서 시각 검토한다.
- [ ] `git diff --check`, `git status --short`, 변경 파일 목록과 테스트 결과를 확인한다.
- [ ] Commit: `test: verify unified responsive design`

## Final Review

- [ ] 스펙의 공통 브랜드, AI/n8n 설명 제거, 4단계 흐름, 기능 보존, 참고 시안 고지, 모바일 접근성 항목이 모두 반영됐는지 대조한다.
- [ ] `TODO`, `TBD`, `PLACEHOLDER`, 임시 이미지·임시 링크가 없는지 검색한다.
- [ ] HTML의 id와 JavaScript 조회 이름, 생성 스크립트와 생성 결과, CSS 버전 쿼리가 서로 일치하는지 확인한다.
- [ ] 배포하지 않은 로컬 작업임을 사용자에게 명확히 보고하고, 시각 미리보기와 배포 승인 여부를 요청한다.
