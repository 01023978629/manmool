# 대전 구별 현장 기록 쪽 (2026-11-25, M3)

`area/daejeon-<구>.html` — 만물인테리어가 그 구에서 작업한 **실제 사례 글 목록**만 모은 쪽이다. 지어낸 소개 문장·과장 없이,
사례 글에 이미 공개된 제목·소개·날짜·공정(분류)·글에 적힌 동네와, 서비스 링크(누수 상담·인테리어 상담)·전화만 둔다.
**사례가 3건 이상인 구만** 쪽을 만든다(얇은 지역 쪽은 검색엔진이 '도어웨이'로 본다).

| 쪽 | 사례 | 누수·배관 / 인테리어 | 기록 날짜 | sitemap lastmod |
|---|---:|---|---|---|
| `area/daejeon-jung-gu.html` 대전 중구 | 5 | 5 / 0 | 2026-07-27 ~ 2026-11-12 | 2026-11-12 |
| `area/daejeon-seo-gu.html` 대전 서구 | 9 | 6 / 3 | 2026-10-06 ~ 2026-11-12 | 2026-11-12 |
| `area/daejeon-yuseong-gu.html` 대전 유성구 | 5 | 3 / 2 | 2026-08-30 ~ 2026-11-18 | 2026-11-18 |
| `area/daejeon-daedeok-gu.html` 대전 대덕구 | 8 | 8 / 0 | 2026-09-09 ~ 2026-11-17 | 2026-11-17 |

동구는 사례 1건(용전동)뿐이라 쪽을 만들지 않았다 — `post-areas.json` 에는 넣어 두었으니 동구 사례가 3건이 되면 생성기가 쪽을 만든다.

## 구를 붙인 기준 — 짐작 금지

정본은 `scripts/post-areas.json` `{slug: {gu, dong?}}`(사례 글 `insights` 는 한 글자도 고치지 않았다 — 고치면 기존 글 고정 검사가 줄줄이 깨진다).
**글(제목·소개·장소·요약·본문)에 '○구' 가 글자로 적혀 있거나, 그 구의 동이 적힌 실제 사례만** 넣었다. 대전 밖·불확실은 넣지 않았다.
`dong` 은 글에 그 동 이름이 글자로 있을 때만 적었다. 단지 이름만으로 구를 짐작하지 않았다(예: '열매마을'·'선비마을'·'삼호아파트'만 적힌 글은 넣지 않음).

| 구 | 글(slug) | 글에 적힌 근거 |
|---|---|---|
| 유성구 | heightsville-extension-floor-heating-screed-20261118 | 대전 유성구 관평동 |
| 유성구 | yeolmae-bathtub-area-waterproof-floor-screed-20261114 | 대전 유성구 노은동 |
| 유성구 | gyochon-mimade-boiler-hot-water-pipe-repair-20261112 | 대전 유성구 교촌동 |
| 유성구 | jukdong-yemiji-bathroom-coating-vent-core-20261007 | 대전 유성구 죽동 |
| 유성구 | sangdae-ipark-bathroom-waterproof-coating-20260830 | 대전 유성구 상대동 |
| 대덕구 | saeyeoul-toilet-drain-pipe-insert-20261117 | 대전 대덕구 신탄진(동 이름 없음) |
| 대덕구 | samho-front-balcony-rain-pipe-waterproof-20261116 | 대전 대덕구 법동 |
| 대덕구 | samho-balcony-rain-pipe-base-replacement-20261110 | 대전 대덕구 법동 |
| 대덕구 | seonbi-1danji-retaining-wall-plaster-repair-20261103 | 대전 대덕구 송촌동 |
| 대덕구 | saeyeoul-laundry-rain-pipe-floor-drain-20261022 | 대전 대덕구 신탄진(동 이름 없음) |
| 대덕구 | seonbi-1danji-boiler-pipe-valve-replacement-20261007 | 대전 대덕구 송촌동 |
| 대덕구 | samho-balcony-rain-pipe-joint-replacement-20261005 | 대전 대덕구 법동 |
| 대덕구 | pyeonghaneul-apartment-leak-repair-20260909 | 본문 '대전 대덕구 목상동' |
| 중구 | munchang-heating-manifold-valve-replacement-20261112 | 대전 중구 문창동 |
| 중구 | mokyang-washbasin-drain-pipe-20261110 | 대전 중구 목동 |
| 중구 | daejeon-jung-gu-heating-pipe-leak-repair | 대전 중구 문화동 |
| 중구 | daejeon-jung-gu-yard-water-valve-leak | 대전 중구 문화동 |
| 중구 | mokdong-trench-drain | 장소 '대전 중구 목동' |
| 서구 | tanbang-house-floor-screed-20261112 | 대전 서구 탄방동 |
| 서구 | sanho-balcony-drain-tile-replacement-20261029 | 대전 서구(동 이름 없음) |
| 서구 | sujeong-town-laundry-rain-pipe-drain-20261029 | 대전 서구 둔산동 |
| 서구 | wolpyeong-town-laundry-rain-pipe-joint-20261029 | 대전 서구 월평동 |
| 서구 | mokhwa-toilet-reset-ceiling-drain-pipe-20261026 | 대전 서구 복수동 |
| 서구 | dunsan-shop-front-deck-board-repair-20261021 | 대전 서구 둔산동 |
| 서구 | sujeong-town-balcony-rain-pipe-joint-20261014 | 대전 서구 둔산동 |
| 서구 | gubong-balcony-rain-pipe-floor-drain-20261008 | 대전 서구 관저동 |
| 서구 | daejeon-aluminum-window-screen-replacement-20261006 | '대전 탄방동'(구 글자 없음 — 탄방동은 서구, 동→구 표로 확인) |
| 동구 | yongjeon-apartment-water-pipe-replacement-20261019 | 대전 동구 용전동 (쪽 없음 — 1건) |

## 바뀐 곳

- `scripts/prerender-posts.py`: `area_pages_for`(3건 이상인 구)·`area_html`·`write_area_pages`, 블로그 목록 머리 아래 '대전 구별 기록' 링크(`list_markup`),
  쪽에 든 글의 상담 상자 아래 '대전 ○구 현장 기록 모아 보기 →'(`article_html` — 27편, 동구 글은 쪽이 없어 그대로). 쪽 안 JSON-LD(CollectionPage·BreadcrumbList)의
  글 제목은 `<`·`>`·`&` 를 `\u` 꼴로 바꿔 script 를 닫지 못하게 했다. 남은 쪽(대상이 아닌 `area/*.html`)은 **지우지 않고** 알리기만 한다(검사가 막는다).
- `sitemap.xml`: 쪽 4개(lastmod = 그 구 사례의 최신 수정일, 손으로). 생성기는 sitemap 을 고치지 않는다(기존 관례).
- `index.html` 서비스 지역 문구·`leak.html` 출장 지역 문구 아래에 구별 기록 링크. CSS `css/site-polish.css`(쪽·블로그·글), `css/leak-theme.css`, 폰 44px `css/service-design.css`.
- `scripts/pages-artifact-policy.mjs` `PUBLIC_TREE_RULES` 에 `['area', /\.html$/i]`. 사이트 무결성(`ensure-site-integrity`)·아이콘(`ensure-brand-icons`)·업체 신원(`ensure-business-identity`)
  검사가 `area/` 도 본다. CI 생성물 비교에 `area`(+ 추적 안 된 새 쪽을 잡는 `git status --porcelain -- area posts`).
- 새 검사 `scripts/ensure-area-pages.mjs`(CI 의 `ensure-*` 반복에서 자동으로 돈다).

**해시 고정 다시 맞추기**: 필요 없었다. `data/site.json`(insights·나머지 칸)을 고치지 않고 옆 파일로 두었기 때문에 기존 고정값(글 묶음 해시·`otherDataHash`·
사진 지문 — PR #229 가 바꿀 `remaining-cases` 사진 지문 포함)은 그대로다. 생성물만 바뀌었고(블로그 목록 링크·글 27편의 모아 보기 링크·`area/`), 생성물을 해시로 고정한 시험은 없다.
전체 검사로 확인했다(아래).

## 새 사례를 더할 때

1. 글(제목·장소·본문)에 '대전 ○구' 를 적었으면 `scripts/post-areas.json` 에 `{ "gu": "○구", "dong": "○○동" }` 을 더한다(동은 글에 적었을 때만).
   빼먹으면 `ensure-area-pages` 가 "글에 '대전 ○구' 가 적혀 있는데 post-areas.json 에 없다" 로 막는다.
2. `python3 scripts/prerender-posts.py` — 쪽·블로그 링크·글의 모아 보기 링크가 다시 그려진다.
3. `sitemap.xml` 그 쪽 `lastmod` 를 그 구 사례의 최신 날짜로(검사가 알려 준다). 구가 처음 3건이 되면 쪽 주소를 sitemap 에 더하고,
   `index.html`·`leak.html` 지역 문구에도 링크를 더한다.

## 검사

- `scripts/ensure-area-pages.mjs`(확인 442건): ① 글자 근거(구 글자 또는 동→구 표의 동), 동이 글에 있음, 동-구 일치, 다른 구가 적힌 글 아님, 대전 밖 아님
  ② '대전 ○구' 가 적힌 실제 사례 누락 없음 ③ 쪽 목록 = 3건 이상인 구, 남은 쪽 없음 ④ 쪽 카드 = 그 구 사례(최신순)·제목·canonical·연락/서비스 링크·구조화 데이터,
  금액·협력사 이름·좌표 없음, 동네 줄 ⑤ sitemap 목록·lastmod, 블로그 링크·건수, 누수/인테리어 지역 문구, 글의 모아 보기 링크, 허용목록, CI 생성물 비교.
- `tests/test_prerender_posts.py` `AreaPageTests` 4건(3건 문턱·공개/실제 사례만, 쪽 내용·escape·JSON-LD, 블로그 링크, 글 링크).

### 변이 표 — 27/27 잡힘

| 변이 | 잡은 검사 |
|---|---|
| 탄방동 글을 중구로 | ensure-area-pages |
| 대전 밖(청주) 글을 넣음 | ensure-area-pages |
| 구·동이 글에 없는 글을 짐작으로 넣음(열매마을 우수관 박스) | ensure-area-pages |
| '대전 서구' 가 적힌 산호아파트 글을 뺌 | ensure-area-pages |
| 동을 다른 구 동으로(둔산동 → 법동) | ensure-area-pages |
| 구 글자 없는 방충망 글에서 동 근거를 뺌 | ensure-area-pages |
| 3건 미만 구(동구) 쪽이 남음 | ensure-area-pages |
| 쪽에 금액(○○만원 꼴) | ensure-area-pages |
| 쪽에 협력사 이름 | ensure-area-pages |
| 쪽에서 사례 카드 하나 빠짐 | ensure-area-pages |
| sitemap 서구 lastmod 틀림 | ensure-area-pages |
| sitemap 대덕구 주소 빠짐 | ensure-site-integrity |
| 블로그 구별 링크 건수 틀림 | ensure-area-pages |
| leak.html 대덕구 링크 빠짐 | ensure-area-pages |
| index.html 중구 링크 빠짐 | ensure-area-pages |
| 글의 모아 보기 링크 빠짐 | ensure-area-pages |
| 허용목록에서 area 뺌 | ensure-area-pages |
| CI 생성물 비교에서 area 뺌 | ensure-area-pages |
| area 쪽 링크 깨짐 | ensure-site-integrity |
| area 쪽 탭 아이콘 빠짐 | ensure-brand-icons |
| area 쪽 전화 링크가 정본과 다름 | ensure-business-identity |
| 생성기: 1건만 있어도 쪽을 만듦 | test_prerender_posts |
| 생성기: 실제 사례 아닌 글도 셈 | test_prerender_posts |
| 생성기: 쪽 카드 제목 escape 제거 | test_prerender_posts |
| 생성기: JSON-LD 안 `<` 막기 제거 | test_prerender_posts |
| 생성기: 블로그 목록 구별 링크 빠짐 | test_prerender_posts |
| 생성기: 글의 모아 보기 링크 빠짐 | test_prerender_posts |

이 PC 에는 playwright 가 없어 브라우저 e2e(`case-finder`·`unified-brand-design`·`service-design`·`site-polish`·`case-reader` 등)는 돌리지 못했다.
그 시험들이 세는 것은 `#blogRoot a[href^="posts/"]`·`a[data-group]`·`.post-cta`·`.post-related` 인데, 새 링크는 `area/…` 이고 `.post-cta` 밖(형제 `<p>`)에 있어
세는 대상이 아니다. `remaining-cases.test.cjs` 는 브라우저 없는 앞 3건(사진 지문 포함)만 따로 돌려 통과했다.

## 대표 확인 필요 — 구가 글에 없는 대전(또는 불분명) 사례 32건

글에 구도 동도 없어서 **넣지 않았다.** 구(가능하면 동)를 알려 주시면 글의 장소를 고친 뒤(그 글의 고정 검사도 함께) `post-areas.json` 에 넣는다.
'참고' 는 다른 공개 글에 같은 이름이 어느 동으로 적혀 있는지일 뿐, 같은 단지라는 확인이 아니다.

| 글(slug) | 날짜 | 글에 적힌 장소 | 참고 |
|---|---|---|---|
| `yuwon-balcony-rain-pipe-base-drain-20261110` | 2026-11-10 | 대전 유원아파트 | |
| `yeolmae-rain-pipe-box-replacement-20261106` | 2026-11-06 | 대전 열매마을 | 11/14 글은 '유성구 노은동 열매마을' |
| `hanbat-woosung-entrance-wall-mortar-repair-20260916` | 2026-10-13 | 대전 한밭우성아파트 | |
| `geumho-hansarang-bathroom-coating-threshold-20260828` | 2026-10-13 | 대전 금호한사랑아파트 | |
| `hyosung-bathroom-heating-faucet-screed-20260821` | 2026-10-13 | 효성혜링턴 (대전인지도 글에 없음) | |
| `yeolmae-bathroom-waterproof-coating-20260821` | 2026-10-13 | 대전 열매마을 | 11/14 글은 '유성구 노은동 열매마을' |
| `munhwa-samsung-wall-pipe-partial-replacement-20260818` | 2026-10-13 | 삼성아파트 (대전인지도 글에 없음) | 글 주소(slug)에만 'munhwa' |
| `chungmu-heating-rust-water-flushing-20260930` | 2026-10-01 | 충무로 인근 | |
| `chungmu-heating-manifold-installation-20260930` | 2026-10-01 | 충무로 인근 | |
| `seonbi-boiler-pipe-leak-repair-20260929` | 2026-09-29 | 대전 선비마을아파트 | 1단지 글은 '대덕구 송촌동 선비마을아파트 1단지' |
| `doan-central-bathroom-pipe-waterproof-20260923` | 2026-09-29 | 대전 도안센트럴 | |
| `samho-apartment-rain-pipe-repair-202609` | 2026-09-25 | 삼호아파트 | 다른 글은 '대덕구 법동 삼호아파트' |
| `samho-apartment-rain-pipe-repair-second-home-202609` | 2026-09-25 | 삼호아파트 | 다른 글은 '대덕구 법동 삼호아파트' |
| `jinjam-town-rain-pipe-repair-202609` | 2026-09-25 | 대전 진잠타운아파트 | |
| `samsung-balcony-rain-pipe-repair-202609` | 2026-09-25 | 대전 삼성아파트 | |
| `daejeon-geumho-hansarang-balcony-floor-screed` | 2026-09-04 | 대전 금호한사랑아파트 거실 확장부 | |
| `apartment-balcony-rain-pipe-replacement` | 2026-08-28 | 대전 한밭우성아파트 베란다 | |
| `apartment-upper-lower-rain-pipe-repair` | 2026-08-28 | 대전 목양마을아파트 | 11/10 글은 '중구 목동 목양마을아파트' |
| `apartment-basement-cast-iron-pipe-repair` | 2026-08-26 | 대전 유원아파트 지하실 | |
| `yeolmae-waterproof-screed` | 2026-08-20 | 대전 열매마을 | 11/14 글은 '유성구 노은동 열매마을' |
| `yeolmae-extension-floor-screed` | 2026-08-20 | 대전 열매마을 | 11/14 글은 '유성구 노은동 열매마을' |
| `mugunghwa-pipe-replacement` | 2026-08-19 | 대전 무궁화아파트 | |
| `taesan-lexan-frame` | 2026-08-15 | 대전 태산그린아파트 | 청주로 보임(11/13 글은 '청주 용암동 태산그린아파트') — 대전이 맞는지부터 |
| `geumseong-basement-pipe-valve` | 2026-08-14 | 대전 금성백조아파트 | |
| `samsung-apartment-drain-pipe-replacement` | 2026-08-13 | 대전 삼성아파트 | |
| `hanbat-drain-replacement` | 2026-08-11 | 대전 한밭유성아파트 | 이름에 '유성' 이 있지만 구 표기는 아님 |
| `seonbi-pipe-replacement` | 2026-08-10 | 대전 선비마을3단지 | |
| `daejayeon-bathroom-fixtures` | 2026-07-15 | 대전 대자연아파트 | |
| `eunhasu-bathroom-waterproof` | 2026-06-26 | 대전 은하수아파트 | |
| `taesan-rain-pipe-replacement` | 2026-06-24 | 대전 태산그린아파트 | 청주로 보임 — 대전이 맞는지부터 |
| `daejeon-cafe-restroom-remodel` | 2026-06-18 | 대전 카페 화장실 | |
| `daejeon-church-canopy` | 2026-05-12 | 대전 교회 지붕·처마 | |

대전 밖이라 넣지 않은 사례 11건(확인 불필요): 청주 1(태산그린 11/13)·공주 1·옥천 1·세종 6(범지기 2·도담동·가온·도램·카페)·논산 2.

## 대표 확인 대기(결정)

- 쪽 문턱 3건 — 더 높이거나(예: 5건) 낮출지.
- 동구는 1건이라 쪽이 없다. 위 32건 중 동구가 있으면 알려 주세요.
- 위 32건에 구를 정해 주시면 글 장소 표기도 같이 고칠지(지금 글은 손대지 않았다).
