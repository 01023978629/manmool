# 현장 앱 사례 ZIP → 홈페이지 비공개 초안 (`scripts/import-case-zip.mjs`, 2026-11-10)

현장 앱(hyeonjang)의 「📰 사례 내보내기」가 만든 ZIP 하나를 **검사**(동의·개인정보·과장 표현·JPEG/EXIF)하고
`.private/case-drafts/` 에 **비공개 초안과 사진**을 만든다. **게시는 하지 않는다** — `data/site.json`·`posts/`·`assets/cases/` 는
읽기만 한다. `.private/` 는 `.gitignore` 라 저장소와 공개 사이트에 올라가지 않는다(`new-case-post.mjs` 초안과 같은 자리).

## 사용

```bash
node scripts/import-case-zip.mjs 사례_시험단지_20261016.zip --slug sample-ceiling-leak-20261016
# 선택: --date 2026-10-16   글의 날짜(기본: case.json 의 date = 준공일, 없으면 오늘)
#       --kind leak|interior 분야(기본: case.json 의 kind, 없으면 leak)
#       --dry-run            초안 JSON 만 보여 주고 아무것도 쓰지 않는다
```

종료 코드: `0` 초안 만듦 · `1` 거부 또는 오류(아무것도 쓰지 않음).

`--slug` 는 나중에 공개 URL(`posts/<slug>.html`)과 사진 파일 이름(`assets/cases/<slug>-N.jpg`)이 된다. 안 주면
`case-draft-YYYYMMDD-<지문>` 이 되는데, 나중에 바꾸려면 `image`·`body[].img`·사진 파일 이름을 전부 같이 바꿔야 하니
**처음부터 영문 slug 를 주는 편이 낫다**(소문자·숫자·하이픈, 80자 이하. 기존 관례: `<단지>-<작업>-<YYYYMMDD>`).

## ZIP 안에 무엇이 있어야 하나 (현장 앱이 만드는 그대로)

| 파일 | 내용 | 없으면 |
|---|---|---|
| `NN-전.jpg` · `NN-중.jpg` · `NN-후.jpg` | 앱이 canvas 로 다시 구운 JPEG(EXIF 없음, 긴 변 1800) | 사진이 0장이면 멈춘다 |
| `case.json` | format `manmool-case/1`(앱 v446 부터) — 아래 표 | `사례재료.txt` 로 읽는다 |
| `사례재료.txt` | 6항목 글(`1. 동네+단지:` … `6. 걸린 시간:`), 사진 줄 `01-전.jpg — 설명`, `※ 고객 사진 공개 동의: 받음` | case.json 이 있으면 7·8번(단지 주소·지도 링크)만 읽는다 |

`case.json`(`manmool-case/1`) 필드 — 모두 문자열이고, 모든 문자열이 개인정보 검사를 받는다:

| 필드 | 뜻 | 초안에서 쓰는 곳 |
|---|---|---|
| `format` | `"manmool-case/1"` 고정 | 다르면 멈춘다 |
| `title` | `동네+단지 증상` | 참고만(제목은 makeDraft 규칙으로 다시 만든다) |
| `area` | 동 단위(`시험동`) | `draftSource.area` |
| `kind` | `누수` 또는 `인테리어` | `service`/`category`(누수 → `leak`/`누수탐지·수리`, 인테리어 → `interior`/`시공 사례`), `--kind` 가 이긴다 |
| `tags` | `[kind, area]` | `draftSource.tags` |
| `summary` | `{place, symptom, method, cause, work, duration}` | 본문 5절·`caseSummary`·제목·요약 |
| `photos[]` | `{file, phase: before\|mid\|after, caption}` — ZIP 에 든 사진만 | 사진 순서(전→중→후)·`imgCaption`·표지(`image` = 첫 완료 사진) |
| `date` | 준공일 `YYYY-MM-DD` | `date`(`--date` 가 이긴다) |
| `consent` | 고객 사진 공개 동의 | `true` 가 아니면 멈춘다 |
| `app` | 앱 빌드 이름 | `draftSource.app` |

ZIP 에 있는데 `case.json` 의 `photos` 에 없는 사진은 넣지 않는다(주의 줄로 알린다). `case.json` 이 없으면 사진 이름의
`전|중|후` 로 단계를 정하고, 재료 글의 사진 줄에서 설명을 읽는다. 이름이 그 꼴이 아니면 '작업 중'으로 두고 알린다.

## 멈추는 조건 — 하나라도 걸리면 아무것도 쓰지 않는다

1. **ZIP 자체**: 경로 탈출(`..`)·절대 경로·역슬래시·`.`·`//` 조각, 심볼릭 링크, 암호, ZIP64, 항목 80개·항목 25MiB·전체 200MiB·
   사진 40장 상한, CRC 불일치. 한 겹 폴더로 싸인 ZIP 은 벗기고 `__MACOSX/`·`.DS_Store` 는 무시한다.
2. **개인정보**: `js/pii-rules.js` 규칙 **전부**(동·호수·휴대전화·일반전화·이메일·고객명·출입번호)를 글 6항목·주소·사진 설명·
   `case.json` 의 모든 문자열·ZIP 항목 이름에 돌린다. 걸리면 `case.json.summary.work: 개인정보(동·호수)` 처럼 **칸 이름만**
   출력한다(값은 되풀이하지 않는다). 규칙은 `js/pii-rules.js` 한 곳에만 있다 — 여기에 정규식을 다시 적지 마라.
3. **과장 표현**: 최저가·무조건·100%·평생 보증·업계 1위·'고객님께서 … 만족'(현장 앱 `HJ_AD_BANNED` 와 같은 축).
4. **동의 기록 없음**: `case.json consent:true` 또는 재료 글 `※ 고객 사진 공개 동의: 받음`. 동의는 지어낼 수 없다.
5. **사진**: JPEG 가 아니거나 APP1 `Exif`/XMP 조각이 남아 있다(촬영 위치가 샐 수 있다). 앱이 구운 사진에는 없으므로, 있으면
   손으로 넣은 원본이다 — 메타데이터를 지운 사본으로 다시 만들어라. 긴 변이 1800 을 넘으면 경고만.
6. **중복**: 같은 slug 의 초안(`.private/case-drafts/<slug>.json`·폴더), 공개 글(`data/site.json`), `assets/cases/<slug>-*` 사진이
   이미 있다(덮어쓰지 않는다 — 나중에 옮길 때 부딪히지 않게 지금 알린다).

## 무엇이 만들어지나 (전부 `.private/case-drafts/` 안)

- `<slug>.json` — 초안 한 건. 모양은 `scripts/new-case-post.mjs` 의 `makeDraft` 가 만드는 그대로(`slug`·`title`·`category`·`service`·
  `date`·`readMin`·`cover`·`excerpt`·`body` 5절·`place`·`published:false`)에 `image`/`imageAlt`(첫 완료 사진),
  `caseSummary{site, issue, work, result}`, 사진마다 본문 절(`{h:'시공 전 사진', p:'', img, imgAlt, imgCaption}`),
  `draftSource`(format·app·zip·importedAt·kind·area·tags·consent·photoDir) 를 얹은 것 — `data/site.json` insights 에 옮겨 넣을 수 있는 꼴.
  **비어 있는 항목은 비워 둔다**(`p: ""`). `caseSummary.result` 는 확인되는 것만 — '완료 사진 N장 확인'·'소요시간 …'.
  `image`·`body[].img` 는 게시할 때 놓일 자리(`assets/cases/<slug>-N.jpg`)를 미리 가리킨다.
- `<slug>/<slug>-1.jpg … -N.jpg` — 전→중→후 순. 원본 이름(`01-전.jpg`)은 어디에도 남지 않는다. 사진을 다시 굽지 않는다(앱이 이미
  EXIF 없이 1800 으로 구웠다).

## 초안 → 공개 (사람이 한다 — 이 도구는 여기부터 하지 않는다)

1. `.private/case-drafts/<slug>.json` 을 읽는다. 빈 칸을 채우거나 그 절을 지운다. `caseSummary.result`, 사진 설명(`imgCaption`·`imgAlt`),
   제목·요약을 실제 기록에 맞춘다. 금액·견적번호·발주처·작업자·확인 안 된 원인·효과 단정은 넣지 않는다.
2. `.private/case-drafts/<slug>/` 의 사진을 `assets/cases/` 로 옮기고 `python3 scripts/build-image-variants.py`(480w·960w 축소본 —
   Pillow 필요. `ensure-image-variants` 가 없으면 막는다).
3. 초안에서 `draftSource` 를 지우고 `data/site.json` insights 의 날짜 자리에 넣는다. `published: true`.
   **생성 전에 `origin/main` 의 site.json 을 기준으로 삼는다**(AGENTS.md).
4. `python3 scripts/prerender-posts.py` → `posts/<slug>.html`·`blog.html`·`rss.xml`·`data/leak-case-index.json`.
5. `sitemap.xml` 에 `posts/<slug>.html` 줄, `blog.html`(누수면 `leak.html` 도) `<lastmod>`. 누수 분야면 `leak.html` #cases 카드와
   `ensure-promo-pages` 카드 수 핀.
6. 핀 재고정 — `tests/quote-contract-guide.test.cjs` `OLD_COUNT/OLD_HASH`, `recent-cases-*.test.cjs` 의 '나머지 n건' 개수·해시,
   `remaining-cases.test.cjs` 제외 목록, FEATURED 가 바뀌면 그 검사들(AGENTS.md 「글을 더할 때」).
7. `for f in scripts/ensure-*.mjs; do node "$f" >/dev/null 2>&1 || echo "FAIL $f"; done` 와 관련 `node --test` → PR → 대표 확인 → 병합.

## 검사

`node --test scripts/import-case-zip.test.mjs` — ZIP 을 검사 안에서 직접 만든다(외부 zip 도구 없이, 합성 사진·글만). 실제 저장소는
건드리지 않고 임시 뿌리(`MANMOOL_CASE_ROOT`)에 `data/site.json` 만 복사해 쓴다.

- ZIP 읽기(저장·deflate·data descriptor·CRC), 경로 탈출·절대 경로·역슬래시·심볼릭 링크·항목 상한 거부, 한 겹 폴더 벗기기.
- case.json ZIP → `.private/case-drafts` 초안(published:false·분류·제목·caseSummary·표지·본문 사진 순서)·사진 전→중→후(바이트 지문)·
  원본 이름 없음 · **`data/site.json` 바이트 그대로·`assets/`·`posts/` 빈 채** · 같은 slug 초안/공개 글/사진 접두사 거부 · 기본 slug.
- 사례재료.txt 만 있는 옛 ZIP, `--kind interior`, `--date`, 빈 항목은 빈 채, 동의 '미확인' 거부.
- 개인정보(동·호수·출입번호·휴대전화·이메일)·과장 표현·동의 없음·EXIF·JPEG 아님·format 불일치·case.json 에 적힌 사진 없음·탈출 경로·
  글 파일 없음·나쁜 slug 거부 — 모두 아무것도 쓰지 않음을 확인. `--dry-run` 무변경.

변이 10종 검출 확인(각각 보호를 빼고 검사 실패 → 원복, 원복은 sha256 대조): 개인정보 검사 제거 · 과장 표현 검사 제거 · EXIF 검사 제거 ·
동의 검사 제거 · `published` 기본 true · 경로 탈출(`..`) 허용 · `js/pii-rules.js` 출입번호 규칙 제거 · 초안 중복 검사 제거 ·
공개 글 slug 중복 검사 제거 · 초안 폴더를 `assets/cases` 로(게시 금지 위반).

## 이 도구가 하지 않는 것

- **게시하지 않는다** — `data/site.json`·`posts/`·`assets/cases/`·`sitemap.xml` 을 쓰지 않는다. 사례를 지어내지 않는다(빈 칸은 빈 채로).
- 사진을 다시 굽지 않고 축소본도 만들지 않는다(게시할 때). 동영상은 받지 않는다.
- 현장 앱 자료·서버를 건드리지 않는다. 네트워크를 쓰지 않는다.
- 현장 앱 문서가 예고한 PowerShell 감싸개 `Import-CaseZip.ps1` 는 아직 없다 — Windows 에서는 `node scripts/import-case-zip.mjs …` 를 그대로 쓴다.
