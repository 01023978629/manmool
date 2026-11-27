# 코덱스 인수인계서 — manmool (공개 홈페이지 + 전자계약 서버 소스)

> 이 저장소에서 작업하는 모든 AI 에이전트(Codex·Claude)가 시작 전에 읽는 문서.
> 2026-09-06 확인: 공개 배포는 `scripts/build-pages-artifact.mjs`가 만든 `_site` 허용목록을 사용한다.
> 아래 2026-08-10 상태·커밋·검사 개수는 과거 기록이다. 작업 전 최신 `origin/main`과 배포 결과를 확인한다.

## 이 저장소가 무엇인가

### 2026-11-27 대전 동구 낭월동 남대전 이편한세상아파트 33평 리모델링(11/27) 사례 1건 공개 후보

`claude/case-nangwol-namdaejeon-epyeonhan-33py-remodel-20261127`는 대표가 승인한 비공개 초안을 `published:true`로 더한다 —
`nangwol-namdaejeon-epyeonhan-33py-remodel-20261127`(사진 12장, 인테리어·`시공 사례`). 문구는 초안 그대로다(새 검사가 글 객체 전체를 `entryHash` 로 고정).
**병합하면 바로 공개된다** — 범위·핀 목록은 PR 설명과 `docs/recent-cases-20261127.md`.

- 가장 새 글이라 맨 앞에 들어가 **대표 사례(FEATURED)가 11/18 하이츠빌에서 이 글로 바뀐다**(인테리어 칸). blog `lastmod` 2026-11-27, leak 은 2026-11-25 그대로
  (인테리어라 누수 카드·색인 없음). 기존 검사의 blog 기대값을 2026-11-27 로, leak 은 따로 2026-11-25 로 보게 고쳤다.
- 공개 위치는 동네+단지명까지. 상표 '한샘'(주방 키친장·안방 붙박이장)·'휴젠트'(욕실 온풍기)는 대표 승인, 바닥은 장판(마루 아님)·도배·전등은 대표 확인 — 새 검사가 지킨다.
- '대전 동구' 가 적힌 사례라 `scripts/post-areas.json` 에 동구·낭월동으로 넣었다(`ensure-area-pages` 동→구 표에 '낭월동' 추가). 동구는 2건이라 구별 쪽은 아직 없다 —
  **동구 사례가 하나 더 생기면 `area/daejeon-dong-gu.html` 이 생기므로** sitemap·`index.html`/`leak.html` 지역 문구를 그때 같이 맞춘다.
- 기존 93건은 한 글자도 바꾸지 않았다(origin/main `4fdd80c`). 다시 고정한 핀 목록은 `docs/recent-cases-20261127.md`.

### 2026-11-25 최근 사례 글 5편 보강 (`claude/case-enrich-20261125`, 로컬 커밋)

대표 요청("최근 5가지 사례 글을 더 보강… 네이버 api 를 사용해서")으로 공개된 최근 5편(11/18 하이츠빌·11/17 새여울·11/16 삼호 앞베란다·11/14 열매마을 욕조 자리·
11/13 태산그린)의 **글만** 보강했다 — 범위·검색어·근거·핀 목록은 `docs/case-enrich-20261125.md`. 새 사례·새 사진 없음, 제목·slug·날짜·장소·사진 순서·상담 안내 그대로.

- **기존 글을 고친 첫 보강이다.** 그동안의 '기존 n건은 한 글자도 바꾸지 않았다' 핀들을 이 5편의 새 글로 다시 계산했다. 고치기 전에 '이 5편만 옛 객체로 되돌리면
  옛 고정값이 나온다'를 검사마다 확인했다(다른 88건·insights 밖 데이터·사진 지문은 그대로).
- 글 구조: 사진 칸은 그대로 두고 설명만 늘렸고, 마지막 칸('확인한 범위와 상담 안내') **바로 앞에 사진 없는 `{h, p}` 칸 하나** — 'N. 알아 두면 좋은 점 — …'.
  첫 문장이 "아래는 이 현장에서 확인한 내용이 아니라, … 일반적으로 정리한 것입니다."로 시작한다(`recent-cases-20261117`·`1118-taesan`·`1121` 이 지킨다).
  현장 사실(원인·시험 결과·시간·자재·금액)을 이 칸에 섞지 마라. 일반 안내에도 가격·기간 숫자, 보장·최상급 표현은 쓰지 않는다.
- 고친 글에는 `updated`(2026-11-25)를 넣는다 — 글 머리 '수정 …', JSON-LD `dateModified`, 그리고 **sitemap 의 그 글·`blog.html`·`leak.html`·구별 쪽 `lastmod` 가 그날로 간다**
  (`ensure-weekly-leak-cases`·`ensure-area-pages`). 그래서 여러 검사의 blog/leak `lastmod` 기대값이 2026-11-25 로 바뀌었다. 다음 사례가 11/25 보다 앞 날짜면 이 값은 그대로다.
- 소개문을 고치면 `leak.html` 누수 카드의 `<p>`(소개문을 손으로 옮긴 것)도 같이 고친다 — 이번에 3장. 목록 검색 글(`data-search`)도 소개문·요약 카드에서 나오므로
  e2e 가 쓰는 검색어의 결과가 달라지지 않는지 본다(이번에는 16개 모두 같음).
- 네이버 API HUB 검색어 비교값·윗자리 글은 주제를 보는 데만 썼다. 남의 글 제목·문장·업체 이름은 글에도 저장소에도 넣지 않는다.

### 2026-11-25 후기 정리·문의 출처·대전 구별 현장 기록 (`claude/reviews-stats-area-20261125`, 로컬 후보)

- **M1 후기**(`docs/reviews-20261125.md`): `new-review.mjs` 가 표시 이름을 성+○○ 로 가리고(`--service leak|interior` 필수), `ensure-review-intake` 가
  가리지 않은 이름·escape 없는 `renderReviews`·접수함으로 새는 후기를 막는다. 후기(`type:'후기'`)는 **메일로만** 간다 — `js/lead-transport.js`
  `inboxAccepts`(접수함 서버는 그대로, 재배포 없음). `leak.html` 에 누수 후기 칸(`#leakReviews`, `<!-- leak-reviews:start/end -->` 사이는
  `prerender-posts.py` 생성물, 0건이면 hidden) — CI 생성물 비교에 `leak.html` 을 더했다. 실제 후기는 여전히 0건이다.
- **M2 문의 출처(계정 없이)**: 인테리어 폼(`js/inquiry.js`)도 누수·파일럿 폼처럼 `captureLeadMetadata(location, 'index-inquiry-submit')` 로
  유입 페이지·신청 단추·`utm_source/medium/campaign` 을 싣는다(`index.html` 이 `js/revenue-conversion.js` 를 먼저 읽는다). 메일 본문·접수함 `utm` 열로
  채널별 문의 수를 센다. 대표용 링크 안내 `docs/운영/문의-출처-링크.md`(당근·네이버 블로그·카카오 채널 × 인테리어·누수), 처리방침
  `#privacy-lead-source`. **GA4 등 계정형 도구는 넣지 않았다** — 새 검사 `ensure-lead-attribution` 이 배선·안내 링크(정본 코드로 실제 기록되는지)·
  추적 도구 유입을 본다. 화면 확인은 `tests/inquiry-receipt.e2e.cjs` 새 시험(이 PC 에는 playwright 가 없어 CI 에서만 돈다).
- **M3 대전 구별 현장 기록**(`docs/area-pages-20261125.md`): `area/daejeon-{jung,seo,yuseong,daedeok}-gu.html`(사례 5·9·5·8건) — `prerender-posts.py`
  생성물, 정본은 옆 파일 `scripts/post-areas.json`(28건, 글에 '○구' 또는 그 구의 동이 글자로 있는 사례만 — 짐작 금지, insights 는 그대로라 해시 고정 변화 없음).
  사례 3건 이상인 구만 쪽을 만든다(동구 1건은 쪽 없음). 블로그 목록·글 27편('모아 보기')·`index.html`/`leak.html` 지역 문구에서 링크, sitemap(lastmod = 그 구 사례 최신일, 손으로),
  `PUBLIC_TREE_RULES` `area`, 사이트 무결성·아이콘·업체 신원 검사가 `area/` 도 본다. 새 검사 `ensure-area-pages`. **구가 글에 없는 대전 사례 32건은 대표 확인 목록**(그 문서).
  새 사례 글에 '대전 ○구' 를 적으면 `post-areas.json` 에도 넣어야 검사가 통과한다.
- **검토 반영(같은 날)**: 인테리어 폼은 처음 들어온 주소의 출처를 스크립트가 읽히는 순간 잡아 둔 사본으로 보내고, `main.js` 는 주소를 다시 쓸 때
  (`currentPageUrl` — 시안 창 닫기·`MANMUL_HASH.build`) `?검색어` 를 지키며 가이드 상담 링크에 utm_* 를 잇는다(`tests/lead-source-persist.test.cjs`).
  후기 기본 날짜는 한국 시각, 처리방침 시행일 2026-11-25, 구별 쪽 동 줄은 '글에 동 이름이 적힌 기록' 만 센다.
  고친 js/css 의 캐시 표시는 `20261125-reviews1`(글·구별 쪽의 site-polish 는 생성기 `V_POLISH`) — 고정값 옮긴 곳은 `docs/reviews-20261125.md` '검토 반영'.

### 2026-11-21 대전 유성구 관평동 하이츠빌아파트 확장부 난방 배관·미장(11/18, 진행 중) 사례 1건 공개 후보

`claude/case-heightsville-extension-floor-heating-screed-20261118`는 대표가 검토한 비공개 초안을 `published:true`로 더한다 —
`heightsville-extension-floor-heating-screed-20261118`(사진 9장, 인테리어·`바닥·미장`). 대표가 11/21 단지가 관평동이라고 확인해 장소 표기만
'대전 유성구 관평동 하이츠빌아파트'로 고쳤고 나머지 문구는 초안 그대로다. **병합하면 바로 공개된다** — 대표 확인 대기 8개는 PR 설명과 `docs/recent-cases-20261121.md`.

- 가장 새 글이라 맨 앞에 들어가 **대표 사례(FEATURED)가 11/17 새여울에서 이 글로 바뀐다**(인테리어 칸). 인테리어라 누수 카드·색인 없음.
- **blog/leak `lastmod` 가 처음으로 갈라졌다** — blog 2026-11-18(최신 공개 글), leak 2026-11-17(누수 페이지 최신 사례 카드, `ensure-weekly-leak-cases` 규칙 그대로).
  기존 검사의 `['blog.html','leak.html']` 같은 값 기대를 각각 따로 보게 고쳤다. 다음 누수 사례가 더 새것이면 둘이 다시 같아진다.
- 진행 중 사례다(남은 작업은 다음 방문 때). 완공처럼 쓰지 않는다 — 새 검사 `recent-cases-20261121` 이 막는다. 공개 위치는 동네+단지명까지.
- 기존 92건은 한 글자도 바꾸지 않았다(origin/main `520dc41`). 다시 고정한 핀 목록은 `docs/recent-cases-20261121.md`.

### 2026-11-19 정리 — A/S 상담 유형·내부 화면 비공개·포털 설정 저장소 고정·문의 접수함 켜기

`claude/tidy-20261119` (대표 정리 목록 12·17·28·32·33번 중 만물웹 몫).

- **A/S·하자 상담 유형(현장웹과 공통 약속 — 바꾸지 말 것)**: `index.html` 상담 폼 '공간 유형'에 `<option value="A/S">A/S·하자 (시공했던 집)</option>`.
  값에는 '·' 를 넣지 않는다 — 현장웹 `webWorkClassify` 가 메일 '공간' 줄을 '·' 로 나눠 첫 칸 `A/S`(별칭 AS·하자·하자보수)를 service `as`(표시 'A/S·하자')로 읽는다.
  누수처럼 연락처 지름길(`#asShortcut`, '만물인테리어에서 시공한 집…평수·공사 범위를 건너뛰셔도 됩니다')과 요청 내용 안내('어느 아파트(단지)·동네인지,
  언제 시공한 곳인지, 어떤 증상인지' — 지름길이 1단계 지역 칸을 건너뛰고, 현장웹 A/S 접수는 단지명으로 현장 짝을 찾는다)를 준다. 예상견적(`manmul:estimate`)이
  유형을 바꿔도 안내가 따라 바뀐다(`prefillFromEstimate` → `syncTypeGuides`). 전송 코드는 그대로(제목에 유형이 이미 붙는다).
  `ensure-lead-route-parity` ⑥이 폼 유형 값 = **로컬 약속 목록**·공간 줄 첫 칸을 지킨다 — 현장웹 코드는 읽지 않으므로 병합 순서는 못 잡는다.
  **현장웹 v613(정리 묶음 — A/S 분류, 판 이름 hyeonjang-v613-tidy) 라이브 배포 뒤에 병합한다**(병합 전 https://01023978629.github.io/hyeonjang/ 에서 A/S 분류가 보이는지 PR 체크리스트에 남긴다) —
  먼저 나가면 A/S 메일이 현장웹에서 '모르는 유형'으로 거부된다.
- **admin.html·case-new.html 을 Pages 공개 산출물에서 뺐다**(로그인 없이 공개 주소에서 열리던 내부 화면). `scripts/pages-artifact-policy.mjs` 의 `LOCAL_ONLY_*`
  (페이지 2·js 4·css 2). 파일은 저장소에 남고 로컬에서 연다(README '로컬 전용 화면'). robots 의 두 줄과 `js/main.js` 미리보기 배너의 admin 링크를 뗐다.
  `ensure-admin-content-editor`·`ensure-case-new`·`ensure-pages-artifact` 가 '공개 허용목록·산출물에 없음'을 지킨다. `lead-inbox.html`·`office-*` 는 그대로 공개.
- **포털 설정 저장소 고정**: `office-portal-api.json` 을 라이브 값 그대로 두고 배포 중 주입 단계를 뺐다(저장소 = 라이브).
  `ensure-office-portal` 이 주입 재등장(주석 밖 워크플로에 설정 스크립트·파일 이름이 나오면 실패)을 막는다.
  `tests/office-portal-rbac.e2e.cjs` 의 '꺼진 설정' 검사는 저장소 파일 대신 꺼짐 설정을 직접 route 한다.
  포털 **서버 소스**는 보안 검토가 끝날 때까지 이 공개 저장소에 올리지 않는다(정본은 대표 PC 의 외부 작업본). 현장웹 `apps-script-office-portal/` 은 옛 판이다.
- **PR 검사**: `deploy-pages.yml` 이 main 으로 가는 PR 에서도 `verify` job(전체 검사·산출물 빌드·화면 검사)을 돈다. `deploy` job(Pages 공개)은
  main push·main 수동 실행에서만, `github-pages` 환경과 쓰기 권한도 그 job 에만 있다. 예전에는 e2e 가 병합 뒤 main 에서 처음 돌았다.
- **문의 접수함 켬**(PR #238): `data/config.json` `inbox` 에 대표가 배포한 주소가 들어가 있다. 메일(Web3Forms)과 접수함은 둘 다 나간다(기존 `deliver`).
  편집기 입구 `leadInboxSetup()`(웹 action 아님)과 접수함 service `A/S·하자` 를 더했다. 대표 안내 `docs/운영/문의접수함-켜기.md`,
  현장웹이 부를 API 는 `apps-script-lead-inbox/README.md` '현장웹(hyeonjang)에서 부를 때'.
  로그인 실패 잠금은 전역 키 하나(`lead-login:fail`)다 — 막혀도 손님 접수·메일은 무관하므로 우선 이대로 켰다(바꿀 때는 서버 코드부터).
  서버가 스크립트 속성을 쓰지 않는 규칙(`ensure-lead-inbox`) 때문에 비밀값 자동 생성은 넣지 않았다. 관리 비밀번호는 8~64자.
- 관리사무소 PIN 접수(`office-request.*`)는 주소를 `office-api.json` 하나에서만 읽는다(`js/office-request-api.js` `CONFIG_PATH`). 새 접수 서버 배포 뒤 메인 세션이 그 파일만 바꾼다.

### 2026-11-18 청주 용암동 태산그린아파트 옥상 배수구 2곳·앞베란다 우수관 하부(11/13) 사례 1건 공개 후보

`claude/case-taesan-roof-drain-balcony-20261113`는 대표 요청("현장 웹에 프로젝트 및 사진 정리하고 만물 웹에 사례도 추가해줘")으로 사례 1건을
`published:true`로 더한다 — `taesan-roof-drain-balcony-rain-pipe-20261113`(사진 9장, 누수). **병합하면 바로 공개된다** — 대표 확인 대기 항목은
PR 설명과 `docs/recent-cases-20261118-taesan.md`.

- 날짜 자리(11/14 열매마을 뒤·11/12 문창동 앞)라 FEATURED·blog/leak `lastmod`(2026-11-17)는 그대로다. 누수 카드는 11/16 삼호 카드 뒤(카드 수 45→46).
- **`data/leak-case-index.json` 예산을 10KB → 16KB 로 올렸다**(52건·10,261바이트). 키·형식은 그대로. 다음에 넘으면 그때 항목 축소를 정한다.
- 대전 밖(충북 청주시) 아파트 사례다. 단지명까지만 쓰고 동 번호·라인·호수·관리사무소(발주처)·금액은 쓰지 않는다 — 새 검사 `recent-cases-20261118-taesan` 이 막는다.
- 기존 `taesan-rain-pipe-replacement`·`taesan-lexan-frame` 은 '대전 태산그린아파트'로 적혀 있다(청주로 보임 — 대표 확인 대기, 이 PR 에서는 손대지 않음).
- 기존 91건은 한 글자도 바꾸지 않았다(origin/main `e3e888f`). 다시 고정한 핀 목록은 `docs/recent-cases-20261118-taesan.md`.

### 2026-11-18 충남 공주 공장 컨테이너 옆 판넬 지붕·벽체(11/9) 사례 1건 공개 후보

`claude/case-gongju-factory-container-panel-roof-wall-20261109`는 대표 요청("만물웹에 사례 작성해줘" → 비공개 초안 → "올려줘")으로 사례 1건을
`published:true`로 더한다 — `gongju-factory-container-panel-roof-wall-20261109`(사진 8장, 인테리어·새 분류 `판넬·조립식`).
**병합하면 바로 공개된다** — 대표 확인 대기 항목은 PR 설명과 `docs/recent-cases-20261118.md`.

- 대전 밖(충남 공주시) 판넬·조립식 사례다. 위치는 시까지만 쓰고 공장(발주처) 이름·주소·금액은 쓰지 않는다 — 새 검사 `recent-cases-20261118` 이
  다른 지명·시 아래 단위·발주처 표기를 막는다.
- 날짜 자리(11/10 사례 뒤·11/6 앞)라 FEATURED·blog/leak `lastmod`(2026-11-17)·`leak.html` 카드 수(45)는 그대로다. 인테리어라 누수 카드·색인 없음.
- `recent-cases-20261112` 의 '세 글 연속' 조건을, 날짜상 그 사이에 들어가는 이 글만 낄 수 있게 고쳤다(`LATER`). 다음에 11/7~11/9 글을 더하면 거기에 더한다.
- 기존 90건은 한 글자도 바꾸지 않았다(origin/main `66ae5bd` 해시 그대로, 새 검사가 고정). 다시 고정한 핀 목록은 `docs/recent-cases-20261118.md`.

### 2026-11-17 새여울아파트 양변기 배관 삽입(11/17)·삼호아파트 앞베란다 우수관 방수(11/16)·열매마을 욕조 자리 방수·바닥 미장(11/14, 진행 중)·목양마을아파트 세면대 배관(11/10) 사례 4건 공개

`claude/cases-saeyeoul-samho-yeolmae-mokyang-20261117`는 대표 요청("사례 만물웹 만들어줘" → 초안 수정 요청 → "올려줘")으로 사례 4건을
`published:true`로 더한다 — `saeyeoul-toilet-drain-pipe-insert-20261117`(사진 4장, 누수), `samho-front-balcony-rain-pipe-waterproof-20261116`(5장, 누수),
`yeolmae-bathtub-area-waterproof-floor-screed-20261114`(4장, 인테리어·진행 중), `mokyang-washbasin-drain-pipe-20261110`(5장, 누수).
대표 승인("바로공개", 2026-11-17)으로 PR #234 를 병합했다. 범위·제외 사진·확인 사항은 `docs/recent-cases-20261117.md`.

- 세 글(11/17·11/16·11/14)이 맨 앞에 들어가 **대표 사례(FEATURED)가 11/17 새여울로 바뀐다**. 목양(11/10)은 날짜 자리 — 11/12 사례 뒤, 같은 날 먼저
  공개한 삼호·유원 묶음 바로 앞(그 묶음을 고정한 `recent-cases-20261112` 가 갈라지지 않게). `leak.html` 카드 수 핀 42→45, blog/leak `lastmod` 2026-11-17.
  기존 86건은 한 글자도 바꾸지 않았다(새 검사 `recent-cases-20261117` 이 고정).
- 삼호는 페인트 마감이 따로라 완료로 쓰지 않고, 새여울 배관 삽입 단계는 사진이 없다고 본문에 밝혔다 — 새 검사가 둘 다 지킨다.
- 다시 고정한 핀: `docs/recent-cases-20261117.md` 목록. 다음에 실제 사례를 더할 때도 이 목록을 같이 챙겨라.
- ⚠ `data/leak-case-index.json` 이 10KB 예산까지 약 200바이트 남았다(51건·10,041바이트). 다음 누수 사례 1건이면 `ensure-leak-case-index` 가 막을 수
  있다 — 그때 색인 항목 축소나 예산을 같이 정한다.
- 병합 뒤 첫 배포(run 44069722749)가 마지막 단계에서 멈췄다 — `ubuntu-latest` 가 26.04 로 바뀌어 index.html 1280px '상담' 버튼이 41px 로 그려졌다
  (44px 검사). `deploy-pages.yml` 을 `runs-on: ubuntu-24.04` 로 고정했다(hyeonjang PR #218 과 같은 조치). 26.04 로 올리려면 그 버튼 최소 너비부터 고친다.

### 2026-11-13 문창동 난방 분배기·밸브(11/12)·교촌동 미메이드아파트 온수 배관(11/12)·탄방동 바닥 미장(11/12, 진행 중) 사례 3건 공개

`claude/cases-munchang-mimade-tanbang-20261113`는 대표 요청("이번주에 사례 올리지 않은 것은 만물 웹과 당근 네이버지도 카카오지도에 올려줘")으로
사례 3건을 `published:true`로 더한다 — `munchang-heating-manifold-valve-replacement-20261112`(사진 6장, 누수),
`gyochon-mimade-boiler-hot-water-pipe-repair-20261112`(3장, 누수), `tanbang-house-floor-screed-20261112`(8장, 인테리어·진행 중).
범위·제외 사진·확인 사항은 `docs/recent-cases-20261113.md`.

- 세 글이 맨 앞에 들어가 **대표 사례(FEATURED)가 11/12 문창동으로 바뀐다**. `leak.html` #cases 맨 앞 카드는 누수 2건만(카드 수 핀 40→42),
  blog/leak `lastmod` 2026-11-12. 기존 83건은 한 글자도 바꾸지 않았다(새 검사 `recent-cases-20261113` 이 고정).
- 탄방동은 **공사 중 사례**다(도배·마루 전). 완공처럼 쓰지 않는다 — 새 검사가 '완공·시공 완료' 같은 표현을 막는다. 도배·마루가 끝나면 같은 글을
  고치지 말고 완료 사례를 따로 더하는 편이 기존 글 고정 검사와 맞는다.
- 다시 고정한 핀: `docs/recent-cases-20261113.md` 끝 목록. 다음에 실제 사례를 더할 때도 이 목록을 같이 챙겨라.
- 문창동 원본 사진 속 보일러 A/S 스티커(다른 업체 전화번호)·제조사 모델명, 서비스점 접수 화면 정보는 공개 글·사진에 넣지 않는다.

### 2026-11-12 삼호아파트·유원아파트 베란다 우수관 하부(11/10)·열매마을 우수관 박스(11/6) 사례 3건 공개

`claude/cases-yeolmae-samho-yuwon-20261112`는 대표 요청("만물 웹에는 최신 사례 올려줘")으로 사례 3건을 `published:true`로 더한다 —
`samho-balcony-rain-pipe-base-replacement-20261110`(사진 7장), `yuwon-balcony-rain-pipe-base-drain-20261110`(9장),
`yeolmae-rain-pipe-box-replacement-20261106`(8장). 범위·제외 사진·확인 사항은 `docs/recent-cases-20261112.md`.

- 세 글이 11/3 선비마을보다 새것이라 site.json 맨 앞(날짜 순)에 들어가고 **대표 사례(FEATURED)가 11/10 삼호로 바뀐다**.
  `leak.html` #cases 맨 앞 카드 3장(카드 수 핀 37→40), blog/leak `lastmod` 2026-11-10. 기존 80건은 한 글자도 바꾸지 않았다(`4a50d2f` 해시 그대로).
- 기존 검사 12곳의 핀을 다시 고정했다(날짜 주석) — 맨 앞 글·FEATURED·첫 누수 카드·`lastmod`·'삼호아파트' 검색 건수를 가정한 검사 포함.
  다음에 실제 사례를 더할 때도 이 목록(`docs/recent-cases-20261112.md` 끝)을 같이 챙겨라.
- `data/leak-case-index.json` 은 이제 한 줄 JSON 이다 — 들여쓰기본이 10KB 예산(`ensure-leak-case-index`)을 넘었다. 키·순서·내용은 그대로.
- 같은 날 목양마을 '세면대 배관' 사진은 작업 전후가 분명하지 않아 넣지 않았다(대표 설명 대기).

### 2026-11-04 목화아파트·둔산동 데크·아이파크시티 사례 3건 공개 후보

`claude/cases-ipark-mokhwa-deck-20261104`는 PR #227(11/3 선비마을) 위에 쌓은 브랜치로, 사례 3건을 `published:true`로 더한다 —
`mokhwa-toilet-reset-ceiling-drain-pipe-20261026`(사진 12장), `dunsan-shop-front-deck-board-repair-20261021`(10장),
`sangdae-ipark-bathroom-waterproof-coating-20260830`(8장). **병합하면 바로 공개된다** — 대표 확인 사항은 PR 설명과
`docs/recent-cases-20261104.md`에 있다. #227을 먼저 병합해야 이 PR에 이 커밋만 남는다.

- 세 글은 site.json의 날짜 자리에 넣었다(생성기는 날짜 내림차순·같은 날짜는 원래 순서). 모두 11/3보다 오래돼 FEATURED는 그대로다.
- 데크 보수는 `데크·목공 보수`/`interior`다. `ensure-public-leak-case-parity`가 누수 분야 글만 `leak.html` 카드로 허용하므로
  누수 랜딩 카드는 목화·아이파크 2장만 더했다(카드 수 핀 35→37). 인테리어 사례를 더할 때 누수 카드를 만들지 마라.
- 기존 77건은 한 글자도 바꾸지 않았다(`b6a32c3` insights 해시 그대로). 개별 검사 9곳의 핀을 다시 고정했고(날짜 주석),
  `recent-cases-20261103`의 고정 대상도 이제 '이 글 빼고 전부'(79건)다. 기존 77건 전체는 `recent-cases-20261104`가 고정한다.
- 사진 폴더 이름(아이파크 '저수조')·폴더에 붙은 도로명·번지·상호·발주처는 공개 글에 넣지 않는다 — 검사가 금지 표현과
  도로명 주소 패턴으로 막는다.

### 2026-11-03 선비마을 1단지 외벽(옹벽) 미장 보수 사례 1건 공개 후보

`claude/seonbi-wall-plaster-20261103`은 11월 3일 작업 사례 1건(`seonbi-1danji-retaining-wall-plaster-repair-20261103`,
사진 9장)을 `published:true`로 더한다. **병합하면 바로 공개된다** — 대표 확인 사항은 PR 설명과 `docs/recent-cases-20261103.md`에 있다.

- 분류 `방수·설비`/`leak`. 가장 최근 실제 사례라 `blog.html` 대표 사례 칸과 `leak.html` #cases 첫 카드로 간다(카드 수 핀 34→35,
  `quote-contract-guide` FEATURED 교체). 기존 76건은 한 글자도 바꾸지 않았고(origin/main `2e0c484` 해시 그대로) 생성기가
  바꾼 것은 관련 글 카드뿐이다.
- 기존 개별 검사 8개의 '나머지 n건' 핀을 다시 고정했다(날짜 주석). 기존 76건 전체는 새 검사 `recent-cases-20261103`이 따로 고정한다.
- 금액·견적번호·발주처·작업자·원인·성능 주장은 공개 글에 넣지 않는다 — 검사가 금지 표현으로 막는다.
- 다음에 실제 사례를 더할 때도 이 8개 핀·카드 수·FEATURED 를 같이 챙겨야 한다.

### 2026-10-31 10월 사례 10건과 정보글 '11월 동파 예방' 공개

PR #225(`claude/october-cases-20261031`)가 10월 현장 사진 사례 10건을 공개했다(`date` = 사진으로 확인한 작업일,
범위·검증은 `docs/recent-cases-20261031.md`). 이어서 `claude/info-winter-freeze-20261028`(PR #224)을 그 main 위에
다시 맞춰 정보글 1건(`winter-pipe-freeze-prevention-november`)을 `published:true`로 더했다 — 대표 공개 승인 2026-10-31.
새 사진은 없고 이미 공개된 선비마을·평화로운아파트 사진 4장만 다시 참조한다.

- 분류가 `방수·설비`라 누수 분야(목록 '누수·배관' 칸, 누수 상담 버튼, `leak-case-index`)로 간다.
  기존 정보글 `rainy-season-waterproof-check`와 같은 형식이다.
- 누수 분야의 최근 3건은 `ensure-public-leak-case-parity`가 `leak.html` #cases 카드를 요구한다. 이 글은 10/29 사례
  3건 다음 자리라 요구 대상은 아니지만, 계절 안내로 찾을 수 있게 카드를 날짜 자리에 둔다. 그 칸 제목은 '실제 현장 기록'이라
  카드 라벨을 "실제 보온 작업 사진 · 동파 예방 안내", 링크 문구를 "동파 점검 순서 보기"로 해 안내 글임을 밝혔다
  (`bathroom-waterproof-signs` 카드와 같은 방식). 카드 수 핀 33→34.
- 기존 75건은 한 글자도 바꾸지 않았다(origin/main 1f1dfe2 해시 그대로). '나머지 n건' 해시를 고정한 검사들은
  개수·해시를 다시 고정했다. 기존 75건 전체는 `winter-freeze-guide-20261028`이, 10월 사례 밖 66건은
  `recent-cases-20261031`이 따로 고정한다.
- `quote-contract-guide`의 'order' 규칙은 "site.json 맨 앞 글 = 대표 사례"였는데, 맨 앞이 사례 요약 없는
  정보글이면 대표 사례 칸에 갈 수 없어 깨진다. "맨 앞 실제 사례(caseSummary 있음) = 대표 사례"로 바꿨다
  (`prerender-posts.py`의 대표 사례 규칙과 같다). 변이 2종 추가.
- 다음에 누수 분야 정보글을 더할 때도 랜딩 카드와 이 핀들을 같이 챙겨야 한다.

### 2026-09-09 방수 사례 현장명 정정

대표가 `buyeo-buyeong-balcony-waterproofing` 사례의 실제 현장명을
**논산 강산부영아파트**로 정정했다. 이후 공개 제목·본문·사진 설명·지도 검색명은
이 이름을 사용한다. 아래 9월 8일의 부여 표기는 당시 기록이며 현재 현장명이 아니다.
기존 링크 보호를 위해 slug와 사진 파일명은 유지한다. 실제 사진·시공 단계와
현장 앱 원본 자료는 이 정정 작업으로 변경하지 않는다.

### 2026-09-08 주간 실제 사례 추가

`codex/weekly-cases-20260908`은 부여 부영아파트 베란다 방수 1건을 추가한다.
초기 상태 → 1차 몰탈 후 → 2차 도막 도포 단계의 실제 사진 6장을 사용한다.
승인된 일반 번호판 가림 외 시공 모습을 바꾸지 않고, 공개 이미지의 EXIF를 제거했다.
최종 마감·담수시험·누수 원인 확정은 확인된 사실이 아니므로 완료로 쓰지 않는다.
기존 37개 원고 정본과 현장 앱 자료는 보존한다. 범위·검증은
`docs/buyeo-balcony-case-20260908.md` 참고. 이 기록 자체는 배포 성공을 뜻하지 않는다.

### 2026-09-08 마스터 비밀번호 확장 후보

`codex/portal-master-password-20260908`은 직원 숫자 6자리 로그인은 유지하고
system_admin에 공백 없는 8~64자 ASCII 비밀번호를 추가한다. 로그인 전 역할은
추정하지 않고 실제 역할 판정은 포털 서버에 맡긴다. 비밀번호 원문 trim·저장·로그 금지.
계정·권한·현장 자료 변경이 아닌 로컬 후보다. 독립 포털 Apps Script 백엔드 선행 배포,
Pages 배포, 소유자 인증 후 계정 발급은 각각 별도로 확인한다.
기존 직원 포털 연결 6개 파일은 자동 보안 검토의 구체적 승인 대기 상태이며,
이 브랜치의 추가 로그인 변경까지 공개 배포 승인된 것으로 간주하지 않는다.

### 2026-09-08 직원 포털 연결 후보

`codex/office-mobile-bridge-20260908`은 서버가 확인한 단지 코드와 직원 권한으로
시설접수 링크를 연결한다. `portalMe` 성공 전에는 href가 없으며, 로그아웃·만료·
권한 거부 후 링크와 단지명을 제거한다. 별도 PIN 인증·대표 수락·현장 오더 흐름을
안내하고 이메일 포털 작업지시와 자동 합치기/자동 로그인은 하지 않는다.
실제 서버·계정·접수는 변경하지 않았다. 신규 공개 배포는 별도 승인 전이다.
검증 근거와 운영 확인 경계는 `docs/office-intake-link-20260908.md` 참고.

### 2026-09-07 로컬 사례 원고 후보

`codex/blog-story-rewrite-20260907`은 사례 25건을 짧은 문단·공정별 사진 설명으로 정리한다.
일반 안내 12건의 정본은 보존한다. 정본 `data/site.json`에서 `prerender-posts.py`로 생성하며,
빈 줄은 별도 문단, 단일 줄바꿈은 `<br>`로 이스케이프 출력한다. `blog.html?post=`도 본문 사진을 유지한다.
원고 변경 때는 누수 페이지 사례 카드·sitemap과 `tests/case-story.e2e.cjs`도 확인한다.
로컬 후보이며 공개 배포 완료를 뜻하지 않는다. 검증·사실성 기준은 `docs/case-blog-rewrite-20260907.md` 참고.

만물인테리어(대전, 1인 시공업체)의 두 덩어리가 산다:

1. **공개 홈페이지** (루트) — GitHub Pages. **main 병합 = 즉시 공개 배포.**
   `_site` 허용목록만 공개로 서빙하지만 **어떤 저장소 파일에도 비밀값을 넣으면 안 된다.**
2. **`apps-script-contract/`** — 전자계약 Google Apps Script 서버의 **소스**.
   여기 커밋해도 배포되지 않는다 — 사장님이 자기 구글 계정에 붙여넣어 배포한다
   (`SETUP.md` 절차). 운영 배포·health·selfTest 는 2026-08-10 완료했지만,
   저장소 커밋이 자동으로 운영 서버에 반영되는 구조는 아니다.

현장 앱은 자매 저장소 `01023978629/hyeonjang`. **사진 중계 서버 소스도
저쪽(`hyeonjang/apps-script/`)이다 — 여기 것과 혼동 금지.**

> **인수인계서는 저장소 밖(2026-11-25)**: 예전 `integrations/인수인계서.md`(협력사 이름·사업자번호·업체별 금액 포함)는 공개 저장소에서 빼고 대표 PC 에만 비공개로 둔다 — 다시 넣지 마라(`ensure-conversion-basics` 가 막는다).
> 같은 이유로 `integrations/사장님-인계서.md`·`docs/운영/대표님-5분-답변지.md`(거래처 이름·거래 금액)도 뺐다. 공개 저장소에는 협력사·거래처 이름, 거래별 금액, 동·호수, 고객 정보를 두지 않는다 —
> 검사가 그런 낱말을 알아야 하면 글자 대신 sha256 으로 대조한다(`scripts/lib/hidden-terms.cjs`, 낱말 목록은 대표 PC 비공개 인수인계서).

## 🔴 절대 금지

1. **비밀값을 어디에도 넣지 마라.** `ADMIN_TOKEN`·`PEPPER`·API 키·고객 전화번호
   원문은 Script Properties 에만 산다. 공개 파일에 민감정보를 포함하지 않는다.
   단, `data/config.json`의 `forms.accessKey`는 Web3Forms가 정적 웹 클라이언트에
   공개하도록 설계한 **public form identifier**이며 비밀 API 키가 아니다
   (`https://docs.web3forms.com/getting-started/faq`). 이 예외를 다른 키·토큰에
   확대하지 말고, 기존 값은 채팅·로그·테스트 fixture에 복사하거나 출력하지 않는다.
2. **고객 서명 토큰은 해시만 저장.** 원문 저장 코드를 만들지 마라.
3. **고객 경로에 계약 ID 를 받는 코드를 만들지 마라.** 토큰만 받는다 —
   ID 추측으로 남의 계약이 열리면 끝이다.
4. **Solapi 실발송은 계속 OFF.** `ALIMTALK_LIVE` 를 켜는 코드·문서를 쓰지 마라.
   selfTest 는 그것이 켜져 있으면 일부러 실패한다.
5. **`contract-backend/` 를 지우지 마라** (은퇴한 Fly 서버 — 이전 참고용 보관).
   되살리지도 마라.
6. **요금을 "무료"라고 단정하는 문구를 쓰지 마라.** 조건형만:
   "결제계정이 없을 때만 무료". (hyeonjang `cost-honesty.check.js` 와 같은 규칙)
7. main 직접 push 금지 — 브랜치 → PR → 검증 → 병합(대표 승인).
8. 검증하지 않은 것을 완료라고 보고하지 마라.

## ✅ 검증 절차

> 2026-10-23 문서·CI 정리: ensure 개수(8→26)·전자계약 검사 수(파일 6·pure 130·wiring 158)·잠금 동작 7개(`payment.update` 제거)·README `admin.html` 설명(승인/보류/거절은 `lead-inbox.html`)·`deploy-pages.yml` 에 designs 드리프트 검사 단계 추가. 코드에서 센 값만 적었다.

**홈페이지 변경:**
```bash
for f in scripts/ensure-*.mjs; do node "$f" >/dev/null 2>&1 || echo "FAIL $f"; done
# 종료코드로 판정하라 — 일부 스크립트는 통과해도 표를 길게 출력한다
```
**브라우저 e2e 는 실서버와 끊고 쓴다(2026-11-19).** playwright 를 쓰는 `tests/*.cjs` 의 첫 require 는
`require('./helpers/e2e-offline.cjs');` 다. 이 helper 가 모든 브라우저 context 에서 `data/config.json` 의 `inbox`·`n8n`
접수 경로만 끄고(저장소 값은 라이브 접수함이 켜진 운영 값이다) Apps Script·Web3Forms 로 가는 요청과, 시험이 받지 않은
로컬 밖 쓰기 요청(POST 등)을 막는다. 막은 요청이 하나라도 있으면 그 시험 파일은 실패한다. 시험 라우트가 직접
처리하지 않는 요청은 `route.continue()` 가 아니라 `route.fallback()` 으로 넘긴다 — continue 는 helper 를 건너뛴다.
`page.request`·`route.fetch()` 같은 브라우저 밖 요청도 helper 를 거치지 않으므로 쓰지 않는다(로컬 서버 확인은 `node:http`).
접수함을 시험하려면 page 라우트로 가짜 주소(`https://script.google.com/macros/s/fixture-…/exec`)를 켜고 그 주소를 직접 받는다.
`scripts/ensure-e2e-offline.mjs` 가 지키고, 배포 워크플로가 첫 e2e 전에 돌린다. 계기: PR #238 병합 뒤 배포 검사의 e2e 가
라이브 접수함에 시험 행 16개를 남기고 9건이 깨졌다.

**블로그 글은 `posts/*.html` 을 손으로 만들지 마라.** 그건 생성물이다.
정본은 `data/site.json` 의 `insights` 하나뿐이고, 거기에 항목을 넣은 뒤
`python3 scripts/prerender-posts.py` 를 돌리면 `posts/<slug>.html` 과
`blog.html` 목록이 함께 만들어진다. `sitemap.xml` 만 따로 챙기면 된다.
**생성 전에 반드시 `origin/main` 의 `data/site.json` 을 기준으로 삼아라.** 오래된
로컬 사본으로 생성해 푸시하면 그 사이 main 에 들어간 글 40건의 개정과 `leak.html`
의 기능(카톡 문의 버튼·신청 목적·서비스 디자인)이 통째로 옛날로 돌아간다 —
2026-09-10 에 실제로 일어나 배포 게이트가 3번 연속 떨어졌다(복구 커밋 "복구: 옛 site.json 재생성으로 되돌아간 글·leak.html").
`leak.html` 은 생성물이 아니다. 사례 카드를 넣을 때는 손으로 한 장 추가하고
`scripts/ensure-promo-pages.mjs` 의 카드 수 핀을 같이 올린다.
목록 검색은 정적 카드의 공개 제목·설명·분류·`caseSummary`만 사용한다.
필터 UI를 바꾸면 `tests/case-finder.e2e.cjs`와 브랜드 화면 검사를 실행한다.
실제 현장 사례는 `scripts/new-case-post.mjs` 에 6항목(동네+단지/증상/탐지 방법/
원인+전유·공용/공사 내용/소요시간)을 줘 **비공개 초안**부터 만든다. 이 도구는
동·호수·고객명·연락처를 거부하고 `published:false` 로 저장한다. 실제 자료 없이
사례를 지어내지 마라.

손으로 `posts/*.html` 을 만들면 **고아 글**이 된다 — 파일은 있는데 목록·홈
어디에도 안 떠서 손님이 볼 방법이 없다. 실제로 2026-08-02 관리사무소 대상
글이 그 상태로 방치됐다(문서에는 "검사가 잡는다"고 적혀 있었지만 그런 검사가
없었다). 지금은 `ensure-site-integrity.mjs` 가 site.json↔posts↔blog.html
세 방향을 대조해 잡는다. 표현 안전수칙: 최상급·보증
과장 금지("최저가"·"100%"·"평생 보증" 금지). 하자보수 기간은 **공종별 법정
기간을 그대로** 써라 — 건산법 시행령 별표4 기준 방수 3년·급배수 등 설비 2년·
실내건축(마감) 1년. 예전 수칙("준공 후 1년까지만")이 법정보다 짧게 적는 원인이
됐다: "방수 2년"이 법령 이름을 달고 사이트 전체에 퍼져 있었다(실제는 3년).
줄여 말한다고 책임이 줄지 않는다 — 계약서로 단축하려면 사유·보증수수료 명시
요건(시행령 제30조②)이 붙고, 못 갖추면 법원은 법정기간을 적용해 왔다.

## 그림·아이콘 (2026-09-19)

**시안 카탈로그 300칸 중 사진 파일로 그려지는 것은 60칸뿐이다.** 나머지 240칸은
`assets/design-sheets/` 스프라이트 시트(한 장에 방 16칸)로 그려지고, 그 칸들의
`photo` 값은 **화면에 나오지 않는다**. `js/main.js` 의 카드 만드는 줄이 `__designSheet`
를 먼저 보기 때문이다(격자·모달·유사 시안 썸네일 세 곳 모두). 사진을 쓰는 것은
`catalogBatch: '2026-07-27-space300'` 60칸이다.

그래서 `scripts/report-photo-duplicates.mjs` 가 말하는 **겹침 59건은 전부 안 보이는 칸이다.**
그 숫자를 근거로 이미지를 사지 마라 — 2026-09-19 에 그 계산으로 19장을 주문했고 4장이 남았다.
`ensure-lookbook-honesty.mjs` 의 `DUP_CEILING = 59` 도 같은 이유로 잘 안 내려간다.
공간별 실제 부족분은 space300 60칸만 세야 나온다.

**아이콘 파일은 `assets/site/` 에 둔다. 루트에 두지 마라.**
`PUBLIC_ROOT_FILES`(scripts/pages-artifact-policy.mjs) 는 이름 고정 목록이라, 거기 없는
루트 파일은 `_site` 에 복사되지 않는데 **`ensure-pages-artifact` 는 그래도 통과한다.**
대표 폰에서 "아이콘이 안 뜨네" 로만 드러난다. `assets/` 아래 png·svg·webp 는 자동으로 나간다.
단 **`.ico` 는 `assets/` 어디에 둬도 빌드가 통째로 실패한다**(허용 확장자에 없다).

**아이콘 SVG 에 `<text>` 를 쓰지 마라.** 한중일 글꼴이 없는 기기에서 네모(두부)가 된다.
글자가 필요하면 큰 크기로 굽고 윤곽을 따 `path` 로 박는다. 로고 글자는 **번체 萬** 이다
(공개 HTML 65장이 전부 그렇다). 예전 파비콘만 간체 万 이었고 그래서 탭과 헤더가 달랐다.
아이콘 바탕은 `--brand`(#b8895a) 가 아니라 `--brand-btn`(#8a6239) 을 쓴다 — 흰 글자 대비가
3.10:1 대 5.40:1 이라 16px 탭에서 갈린다(css/styles.css:11 주석이 그 이유로 이 색을 따로 둔다).

이것들을 `scripts/ensure-brand-icons.mjs` 가 지킨다(변이 11건 검증). 그 전에는 `ensure-*`
어디에도 og:image·파비콘·head 를 보는 곳이 **하나도 없었고**, 실제로 공개 페이지 20장에
탭 아이콘이 아예 없었다(광고로 들어오는 `leak.html` 포함).

**공유 카드 `og-image.png` 은 이름과 1200×630 만 지키면 배선을 고칠 것이 없다.**
치수를 바꾸면 `index.html`·`bathroom-check.html` 의 `og:image:width/height` 를 같이 고쳐라 —
그 숫자를 보는 검사가 없어 조용히 틀린 채 나간다. 그림을 바꿨으면 그 카드를 쓰는 페이지의
`og:image:alt` 도 같이 고친다. **글자가 들어가는 그림은 생성 모델에 맡기지 마라** — HTML 을
헤드리스 크로미움으로 구우면 한글이 또렷하고 다시 만들 수 있다.

**새 헤드리스 크로미움은 창 높이에서 87px 를 떼어 간다**(`--headless=old` 는 제거됐다).
`--window-size=W,H` 로 굽으면 아래 87줄이 투명하게 남는다. `H+87` 로 요청해 잘라내라.
이걸 모르고 구운 아이콘은 아래가 잘린 채로 나오고, 글리프가 가운데 있으면 눈치채기 어렵다.

**`tests/quote-contract-guide.test.cjs` 의 `OLD_COUNT`·`OLD_HASH`** 는 나머지 글(2026-09-19
현재 47편)이 그대로인지 본다. 글을 더하거나 `image`·`imageAlt` 를 정당하게 고쳤으면 둘 다 다시
고정하고 **주석에 무엇이 왜 바뀌었는지** 적어라(그 줄의 기존 주석이 그 관례를 보여 준다).
개수는 `inspect` 와 합성 fixture 두 곳에서 쓰이므로 상수 하나로 둔다 — 숫자를 박으면 한쪽만
고쳐진다. 다시 고정한 뒤에는 변이(기존 글 제목 바꾸기·한 편 빼기)로 여전히 드리프트를 잡는지
확인한다. 이 검사는 CI 에 있어서, 안 고치면 병합 즉시 배포가 멈춘다.

## 업체 정보는 한 곳에서 (2026-09-25)

**정본은 `data/site.json` 의 `company`** (이름·전화 `010-2397-8629`·사업자번호·주소). 페이지마다 손으로 적힌
구조화 데이터·`tel:` 링크·푸터 사업자번호는 전부 이것과 같아야 한다 — `scripts/ensure-business-identity.mjs`
가 루트 HTML + posts/ 전체를 대조한다(변이 7종 검증). 2026-09-25 에 `office.html` 이 전화 `+82-10-…`·주소
`(석교동)` 없음·사업자번호 없음으로 첫 화면과 달랐다. 검색엔진·AI 검색은 이름·전화·주소가 **글자까지 같아야**
하나의 업체로 묶는다 — 표기가 다르면 다른 업체다.

- 구조화 데이터 주소는 `addressRegion` 대전광역시 · `addressLocality` 중구 · `streetAddress` "돌다리로19번길 9, 1층(석교동)".
- 첫 화면 `areaServed` 는 **구 단위**(동구·중구·서구·유성구·대덕구 + 세종·충남). "대전"만 적으면 동네 검색에 안 잡힌다.
- `sameAs` 에는 **실제로 열어 둔 채널만**(지금은 `config.json` kakao 가 ready 라 카카오 채널 하나). 네이버 플레이스·
  구글 비즈니스 프로필 주소가 생기면 여기 더한다 — 자리표시자 주소는 검사가 막는다.
- 글 페이지에는 `BreadcrumbList`(홈 › 현장 기록 › 글)가 붙는다(`prerender-posts.py` 생성). 절대주소만.

## 글을 더할 때 (2026-09-19)

정본은 `data/site.json` 의 `insights` 하나다. 넣은 뒤에 **손으로 같이 고칠 곳이 네 군데** 있다.

| 고칠 곳 | 안 고치면 |
|---|---|
| `python3 scripts/prerender-posts.py` | `posts/*.html`·`blog.html`·`rss.xml`·`data/leak-case-index.json` 이 안 생긴다. CI 첫 단계가 `git diff --exit-code` 로 막는다 |
| `python3 scripts/prerender-designs.py` | 시안의 `tip`·`trendLabel` 을 고쳤다면 `designs/*.html` 8장이 옛 글을 들고 남는다. CI `Verify generated designs are current` 단계(`git diff --exit-code -- designs`, 2026-10-23 추가 — 그 전에는 CI 가 이 생성기를 돌리지 않아 잡지 못했다)가 잡는다 |
| `sitemap.xml` 에 `posts/<slug>.html` 줄 | `ensure-site-integrity` 가 "sitemap 에 없다" 로 막는다 — **생성기가 손대지 않는다** |
| `sitemap.xml` 의 `blog.html` `<lastmod>` | `ensure-weekly-leak-cases` 가 "목록의 최신 공개 글 수정일과 다르다" 로 막는다 |
| (2026-11-25) 글에 '대전 ○구' 를 적었으면 `scripts/post-areas.json` 과 `sitemap.xml` 의 `area/daejeon-<구>.html` `<lastmod>` | `ensure-area-pages` 가 "post-areas.json 에 없다"·"lastmod 가 그 구 사례 최신일과 다르다" 로 막는다 |

**목록 분야 필터(`case_group`)의 규칙은 두 곳에 따로 적혀 있다** — `scripts/prerender-posts.py`
의 `case_group()` 과 `tests/case-finder.e2e.cjs` 의 `caseGroup()`. 검사가 생성기를 독립적으로
검증하려고 일부러 베낀 것이니 **같이 고쳐야 한다**(한쪽만 고치면 그 자리에서 빨간불이 난다).
2026-09-19 에 `'가이드'` 를 더했다 — 공정 설명 글은 '인테리어' 칸(실제로 한 작업의 기록)이
아니라 '정보' 칸에 들어가야 손님이 시공 실적으로 읽지 않는다.

**설명 글에는 `image` 가 없어도 된다**(`cover` 색으로 그려진다 — 이미 2건이 그렇다). 다만
카드가 색 덩어리로만 보이니, 사진이 생기면 `image`·`imageAlt` 를 같이 채워라.

**`office-request.html` 과 지원 파일 6개는 SHA-256 으로 고정돼 있다**
(`tests/fixtures/office-request-commercial-baseline.json`). `<link rel="icon">` 한 줄만 넣어도
`ensure-revenue-operations` 가 막는다. 손대지 마라.

**전자계약 서버 변경:**
```bash
node --test apps-script-contract/test/*.mjs   # 파일 6개(node --test 는 13건으로 센다); pure 130 + wiring 158, 화면 screens.e2e 12건은 Playwright 가 있을 때만(없으면 건너뜀·CI 는 실패)
```
- **`PROTOCOL.md` 가 규약이다. 코드보다 먼저 고쳐라.** 문서와 코드가 어긋나면
  코드가 틀린 것이다.
- 테스트 하네스는 `.gs` 원본을 **복사하지 않고** `node:vm` 으로 그대로 읽는다.
  소스를 테스트용으로 복제하지 마라 — 언젠가 한쪽만 고쳐진다.
- 새 검사는 변이 검증(보호 동작을 되돌려 실패 확인)까지.

## 후기 수집과 누수 요금 범위 (2026-10-23)

**후기는 `review.html` 로 받는다.** 대문 후기 섹션은 `data/site.json` 의 `reviews` 가 비면 숨겨진다(허위 후기
미노출). 2026-10-23 전까지 고객 페이지(`js/mypage.js`)의 "후기 작성" 버튼은 `alert('데모')` 였다 — 후기를 받을
통로 자체가 없었다. 지금 흐름:

1. 손님이 `review.html` 에서 별점·공사 종류·현장(단지명까지)·후기·표시 이름·확인 연락처(선택)를 적고 동의 2종
   (개인정보·공개)을 체크한다 → 상담 폼과 같은 `js/lead-transport.js` 로 `type:'후기'` 메일이 간다(제목
   `[홈페이지 후기]`, 본문은 `buildReviewText`). 보내기 전에 `js/pii-rules.js` 로 동·호수·전화·이메일을 막는다
   ('고객명' 규칙은 "김○○ 고객" 같은 표시 이름을 오탐하므로 제외 — 배포 검사와 같은 4종만 쓴다).
2. 대표가 메일을 확인하고 `node scripts/new-review.mjs --rating 5 --name "홍길동" --service interior --space "유성구 ○○아파트 · 욕실
   리모델링" --text "…"` 로 `reviews` 맨 앞에 옮겨 적는다(2026-11-25부터 이름은 성+○○ 로 가려 넣고, `--service leak|interior` 필수 —
   누수 후기는 `python3 scripts/prerender-posts.py` 로 `leak.html` 후기 칸도 다시 그린다). 이 도구도 같은 규칙으로 거부한다. **넣는 순간 대문에
   공개되므로** 브랜치 → PR → 병합(대표 승인). 확인 연락처는 게시용이 아니다 — 메일에 `(비공개)` 로 찍히고
   `reviews` 에는 넣지 않는다. 받지 않은 후기를 지어내지 마라.
3. `scripts/ensure-review-intake.mjs` 가 폼 요소·동의 2종 required·허니팟·규칙 정본 사용·영구 저장소 미사용·
   처리방침 문단(`#privacy-review-items`)·푸터 링크·mypage 실연결·공개 허용목록·`reviews` 의 개인정보를 본다
   (변이 8건 검증). 화면 동작은 `tests/review-intake.e2e.cjs`(정상 전송·PII 차단·동의 미체크·허니팟·실패 복구),
   본문·제목은 `tests/lead-transport.test.cjs`, 옮겨 적기 도구는 `scripts/new-review.test.mjs`.

- `review.html` 은 `noindex` 라 sitemap 에 넣지 않는다. 새 공개 페이지는 `scripts/pages-artifact-policy.mjs`
  허용목록(`review.html`·`js/review.js`)에 있어야 배포된다 — 빠지면 조용히 404 다.
- 현장 앱(`hyeonjang`) 문자 센터의 리뷰 요청 문자는 `https://01023978629.github.io/manmool/review.html` 주소를 쓴다
  (저쪽 `REVIEW_FALLBACK_URL`·`hjReviewLink()`, 2026-11-25 조사 때 확인). 네이버 플레이스가 생기면 그쪽 후기 링크도 같이 둔다.

**누수 탐지비는 범위만 공개한다(대표 결정 2026-10-23).** 5단계 표(40·57·65·65·83만원)는 `site.json`
`leakPricing` 에 `published:true` 로 확정돼 있지만, 대문은 인테리어 전용이라 `data-surface="leak-only"` 로 닫혀
있고 `leak.html` 에는 표가 없어 공개 화면 어디에도 금액이 없었다(숨고는 '대전 누수탐지' 페이지에서 평균
30만원·15~80만원을 공개해 손님이 그 앵커를 들고 온다). 이제 `leak.html` 첫 화면 `#leakFeeRange`·FAQ·구조화
데이터 `AggregateOffer` 세 곳에 **최소~최대(40만~83만원, 부가세 별도)** 만 적는다. 숫자는 손으로 적혀 있어
`ensure-leak-pricing.mjs` 가 `site.json` 단계 최소·최대와 대조하고, 중간 단계 금액(57·65만원)이나 단계별 표
컴포넌트가 `leak.html` 에 나오면 막는다(변이 6건 검증, 화면은 `tests/leak-fee-range.e2e.cjs`). 요금을 바꾸면
정본과 `leak.html` 두 곳을 같이 고쳐라. 단계별 표를 공개하려면 대표 결정부터 다시 받는다.

## 전자계약 서버 핵심 불변식

- 통신: 단일 `/exec` + `text/plain` POST(preflight 회피), 커스텀 헤더 금지,
  HTTP 는 항상 200 — `ok` 필드로 성패 판정.
- 토큰: 32바이트+ 무작위, SHA-256 해시만 저장, sign 72h/view 15m 만료, 1회성.
- 문서지문 `docHash = SHA-256(정렬JSON({amount, body}))` — 금액 바꿔치기 검출.
- 대금 분할 50/40/10, 잔금은 나머지 전부. 계약번호 `MM-YYYY-NNNN`.
- 잠금 동작(`create·lock·signlink.issue·quickSend·void·settings.set·sign.submit` 7개 — `payment.update` 는 2026-08-13 삭제, `PROTOCOL.md` 동시성 항목과 `wiring.test.mjs` 가 대조)은 LockService 안, 멱등키는
  인증 통과 후 조회, 고객 캐시는 토큰 해시별 분리.
- AI 중계(`ai.ask`): 키는 헤더로만, 갈 수 있는 곳은 아는 두 곳뿐, 한도는
  횟수만 막는다(요금 아님), 유료(openai)는 `AI_ALLOW_PAID=1` 없이 거절.
- **오류 코드는 `GW_ERROR_CODES`(Code.gs) 와 `PROTOCOL.md` 코드표가 같아야 한다.**
  목록에 없는 코드는 조용히 `SERVER_ERROR` 로 내려간다. 실제로 AI 코드 4개가
  통째로 빠져 있어 `AI_QUOTA` 가 `SERVER_ERROR` 로 뭉개졌고, 앱은 한도를 모른 채
  기기 키로 계속 호출했다 — 한도를 한 곳에서 세려고 키를 서버로 옮긴 의미가
  사라진다. 새 코드를 던지려면 **PROTOCOL.md 코드표부터** 고치고 두 곳을 맞춰라.
  `wiring.test.mjs` 가 대조한다.
- **동작 이름도 같은 규칙이다(2026-09-18).** PROTOCOL.md 관리자·고객 표에 적힌 action 은 전부
  `Code.gs` 동작표(`gwActions_`)에 배선되어 있어야 한다. 오류 코드표는 대조하고 있었는데
  동작 이름은 아무도 대조하지 않아, 문서에만 있는 동작이 "모르는 동작"으로 거절될 수 있었다.
  `wiring.test.mjs` 0-3 절이 규약 → 코드 방향으로 대조한다(별칭만 있는 동작은 허용).
- **문서 종류 `docKind` — 계약서(`contract`, 기본)와 하자보증서(`warranty`) (PR #199).**
  갈라지는 자리는 둘뿐이다: ① 보증서는 금액 0 허용·`Payments` 회차를 만들지 않는다
  ② 보증서 본문은 앱이 보낸 조항을 그대로 쓴다 — **서버가 보증 문구를 지어내지 않는다**
  (지어내면 고객이 받은 보증서와 서명한 보증서가 갈라진다). 조항 없이 만들면 `BAD_REQUEST`.
  `docKind` 열은 `COLS_CONTRACTS` **맨 뒤**에만 있다(빈 칸 = 계약서). `contract.signature {id}`
  는 관리자 전용으로 서명 PNG 를 되돌려주며 서명 전은 `BAD_STATE` — 빈 서명을 내주지 않는다.
  보증서 완성본(사진 포함)은 현장 앱이 만든다. 배포 뒤 `ensureSheets_()` 한 번(수동검증 B-6).

## 작업 분류 — 누가 할 수 있는 일인가 (2026-08-05)

에이전트가 "못 하는 일"을 **전부 코덱스로 넘기면 안 된다.** 대부분은 사람 손이
필요하고, 코덱스 몫으로 적어 두면 아무도 안 하는 채로 남는다. 세 칸으로 나눈다.
(자매 저장소 `hyeonjang/AGENTS.md` 에 같은 표가 있다 — 한쪽만 고치지 마라.)

### 🅰 에이전트가 한다 (Claude·Codex 아무나 — 저장소 안에서 끝나는 일)

홈페이지 콘텐츠·SEO·전자계약 서버 소스·문서. 위 검증 절차만 지키면 된다.
남은 후보: `수동검증-체크리스트.md` 실환경 절차 갱신, 블로그 추가 집필.

### 🅱 사장님만 할 수 있다 (브라우저·본인 계정·결제 — 에이전트는 대신 못 누른다)

| 일 | 어디서 | 지금 상태 |
|---|---|---|
| 전자계약 Apps Script 배포 | 본인 구글 계정 | 완료 — health·selfTest 통과(2026-08-10) |
| Script Properties 에 비밀값 입력 | Apps Script | 완료 — 값은 저장소·로그에 기록하지 않음 |
| Gemini API 키 발급 | `aistudio.google.com/api-keys` | **막힘** — "The request is suspicious" 재시도 필요 |
| 네이버·구글 소유확인 코드 | 서치어드바이저·서치콘솔 | `index.html` 11~14행이 주석 처리된 자리표시자 |
| Threads 토큰 재발급 | Meta | 2026-06-19 만료 |

### 🅲 사장님이 자료를 줘야 에이전트가 한다

고객 후기 섹션 — **실제 후기가 있어야 한다. 지어내면 안 된다.**

## 지금 상태와 남은 일 (2026-08-10)

- 운영 main 은 `128ac72`; 이전 #96은 main 이 아닌 작업 브랜치에 병합돼 있다.
  현재 작업은 `codex/install-rehearsal-20260810` → `codex/site-defects-20260810` →
  `codex/case-post-pipeline-20260810` → `codex/leak-pricing-ready-20260810` 순으로 쌓여
  있으므로 아래쪽부터 병합해야 한다.
- 홈페이지 회귀: `scripts/ensure-*.mjs` 8개 전부 통과(2026-10-23 현재 26개). 누수 상담 유형은 접수→관리자→
  현장앱 인계까지 보존되며, 공개 블로그 본문에 숫자 동·호수가 있으면 실패한다.
- (2026-10-23) 후기 수집 통로 `review.html` 과 옮겨 적기 도구 `scripts/new-review.mjs` 가 생겼다. **실제 후기는 아직 0건**이고 지어내지 않는다. 누수 탐지비는 `leak.html` 에 범위(40만~83만원, 부가세 별도)만 공개한다.
- 실제 현장 사례 생성 도구는 준비됐지만 **실제 사례는 추가하지 않았다.** 대표가
  6항목을 줄 때만 `scripts/new-case-post.mjs` 로 `published:false` 초안을 만든다.
- 누수탐지 5단계 금액(40/57/65/65/83만원)과 화면 컴포넌트는 준비됐으나
  `published:false`. 부가세 포함/별도는 대표 확인 전이며, 공개하면 안 된다.
- 전자계약 서버: 운영 배포·health·selfTest 완료. 설치 리허설 5개 정상 경로와
  모든 변이 검증 통과, 실제 `clasp` 호출 0. 대표 폰 실기기 서명·완료 PDF 확인은 남음.
- 서브에이전트 10종: `.codex/agents/` (원칙: single-writer, PII 금지,
  무승인 발송 0, 허위 완료 보고 금지).
