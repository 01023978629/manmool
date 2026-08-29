# 유입(검색 노출) 등록 절차 — 대표님이 직접 하는 부분

사이트 쪽 기술 준비(제목·설명·구조화 데이터·sitemap·robots)는 **완료**되어 있습니다.
아래는 계정·본인 확인이 필요해서 **대표님이 직접** 해야 하는 것들입니다.
순서대로 하면 되고, 각 단계는 5~15분입니다.

> 사이트 주소(아래에서 계속 쓰입니다): `https://01023978629.github.io/manmool/`

---

## 1. 네이버 서치어드바이저 (네이버 검색에 뜨게) — 가장 먼저

1. https://searchadvisor.naver.com 접속 → 네이버 아이디로 로그인
2. **웹마스터 도구** → 사이트 등록 → 위 사이트 주소 입력
3. 소유 확인 방법이 **두 가지**로 나옵니다 — **「HTML 태그」를 고르세요.**

   | 방식 | 대표님이 하실 일 | 권장 |
   |---|---|---|
   | **HTML 태그** | 화면에 뜨는 `content="..."` 안의 **코드 한 줄만 저에게** 전달 | ✅ 이쪽 |
   | HTML 파일 업로드 | 파일을 내려받아 저에게 전달 (저장소에 넣고 배포 목록에도 등록해야 함) | 되긴 됩니다 |

   태그 방식이 대표님 손이 덜 갑니다. 파일 방식을 이미 받으셨다면 그 파일을 그대로 주셔도
   됩니다 — 배포 목록 등록까지 제가 처리하고, 빠뜨리면 검사가 막아 줍니다.

4. **그 코드를 저(AI)에게 알려주세요** → 제가 사이트에 넣고 배포합니다 (index.html에 자리 만들어 둠)
   - 코드는 `content="` 와 `"` 사이의 글자만 있으면 됩니다. 태그 전체를 주셔도 제가 골라냅니다.
5. 배포 후(1~2분) 서치어드바이저에서 **소유확인** 버튼 클릭
6. 확인되면 → 좌측 **요청 > 사이트맵 제출** → `sitemap.xml` 입력 → 확인
7. 좌측 **요청 > 웹 페이지 수집** → 메인 주소 1회 요청

⏱ 노출까지: 보통 며칠~2주. 등록 안 하면 네이버에 안 뜹니다 — 필수.

## 2. 네이버 스마트플레이스 (네이버 지도·"대전 인테리어" 검색) — 효과 가장 큼

1. https://smartplace.naver.com → **신규 등록**
2. 업체명 `만물인테리어` / 업종 `인테리어·리모델링` / 주소 `대전 돌다리로19번길 9` / 전화 `010-2397-8629`
3. 사업자등록번호(895-48-01132) 인증 → 대표자 본인 인증
4. **홈페이지 칸에 위 사이트 주소 입력** ← 지도에서 사이트로 유입되는 통로
5. 영업시간 평일 09:00–17:30, 소개글은 사이트 첫 문단을 붙여넣어도 됩니다
6. 승인(보통 1~3일) 후: 시공 사진이 생길 때마다 플레이스에도 올리기 — 지역 검색 순위에 직접 영향

⏱ 동네 손님은 대부분 여기서 옵니다. 서치어드바이저보다 매출 효과가 큽니다.

## 3. 구글 서치콘솔 (구글 검색)

1. https://search.google.com/search-console → 구글 계정 로그인
2. **URL 접두어** 방식으로 위 사이트 주소 등록
3. 소유 확인 → **HTML 태그** 선택 → 발급 코드를 **저에게 알려주세요** (네이버와 동일하게 제가 삽입)
4. 확인 후 **Sitemaps** 메뉴 → `sitemap.xml` 제출

참고: FAQ 구조화 데이터를 넣어 두어, 구글에서 질문·답변이 펼쳐지는 리치 결과 대상이 됩니다.

### Google siteVerification API로 발급·확인하기

브라우저에서 직접 복사하지 않으려면 Google 계정 승인 뒤 API를 쓸 수 있습니다. 기본은 조회·계획만 하고, 마지막 `insert`가 실제 소유확인입니다.

```powershell
gcloud auth login
gcloud services enable siteverification.googleapis.com
$accessToken = gcloud auth print-access-token
$site = 'https://01023978629.github.io/manmool/'
$body = @{ site = @{ type = 'SITE'; identifier = $site }; verificationMethod = 'META' } | ConvertTo-Json -Depth 4
$tokenResult = Invoke-RestMethod -Method Post -Uri 'https://www.googleapis.com/siteVerification/v1/token' -Headers @{ Authorization = "Bearer $accessToken" } -ContentType 'application/json' -Body $body
node scripts/set-verification.mjs --google=$($tokenResult.token)
node scripts/ensure-site-integrity.mjs
# 사이트가 배포된 뒤에만 실행(실제 확인):
Invoke-RestMethod -Method Post -Uri 'https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META' -Headers @{ Authorization = "Bearer $accessToken" } -ContentType 'application/json' -Body (@{ site = @{ type = 'SITE'; identifier = $site } } | ConvertTo-Json -Depth 4)
```

토큰은 비밀번호가 아니지만 저장소에는 meta 한 곳에만 둡니다. `insert`가 실패하면 먼저 GitHub Pages에 meta가 배포됐는지 확인합니다.

### 네이버 코드를 한 줄로 반영하기

네이버 서치어드바이저에서 HTML 태그의 `content` 값만 받은 뒤 실행합니다.

```powershell
node scripts/set-verification.mjs --naver=<받은코드>
node scripts/ensure-site-integrity.mjs
```

## 4. 당근 비즈프로필 (동네 직접 홍보)

1. 당근 앱 → 나의 당근 → **비즈프로필 만들기**
2. 업체 정보 입력(위와 동일) + 홈페이지 주소
3. 소식 글에 시공 전/후 사진 올리기 — 동네 기반이라 인테리어와 궁합이 좋습니다

## 5. 카카오톡 채널 (개통 항목과 겹침)

채널을 개설하면 ① 카카오 검색에 노출되고 ② 사이트의 카카오 버튼이 살아납니다.
개설 후 채널 URL을 알려주시면 `config.json`에 연결해 드립니다 (`kakao.ready: true`).

---

## 제가 이미 해둔 것 (기술 SEO)

- 제목·설명에 지역 키워드: "만물인테리어 — 대전 인테리어·리모델링"
- 구조화 데이터: 사업자 정보(LocalBusiness) + **FAQ 10건**(리치 결과 대상)
- sitemap.xml(블로그 글 포함)·robots.txt·canonical·OG(카카오톡 공유 미리보기)
- 내부 업무 화면(admin/mypage/field/as)은 검색 제외(noindex)

## 솔직한 기대치

- 검색 노출은 **등록 후 며칠~몇 주** 걸립니다. 하루 만에 안 뜨는 게 정상입니다.
- "대전 인테리어" 같은 경쟁 키워드 상위 노출은 시간+실제 시공 사진+후기가 쌓여야 합니다.
  초기엔 **스마트플레이스(지도)와 당근**이 가장 현실적인 유입 통로입니다.
- 블로그 글(인사이트)을 꾸준히 늘리면 "인테리어 하자보증 기준" 같은 정보성 검색으로 유입됩니다.

> 📌 **무엇을 써서 올릴지**는 실제 네이버 검색 데이터로 정리해 두었습니다 →
> [`CONTENT-PLAN.md`](CONTENT-PLAN.md). 바로 붙여넣어 쓸 수 있는 글 초안 3편도
> [`content/`](content/) 폴더에 있습니다(하자보증·추가공사·시공후기 템플릿).
