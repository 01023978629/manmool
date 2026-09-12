# 방문자 오류 안내·사례 검색 보완 (2026-09-13)

## 작업 기준과 병행 개발

- 기준: 만물 저장소 `origin/main`의 `e8555a0`.
- 브랜치: `codex/visitor-recovery-20260913`.
- 작업 공간: `C:\Users\1dncj\Documents\New project\.worktrees\manmool-visitor-recovery-20260913`.
- 원래 `manmool` 체크아웃은 오래된 `b42853d`이므로 거기서 원고를 재생성하지 않는다.
- 클로드의 최신 `data/site.json`, 사례 글·사진·영상, `leak.html`, `js/blog.js`, 공통 디자인과 현장 앱 변경은 보존했다.
- 새 기능은 로컬 개발·검증 완료 상태이며, 이 작업에서 업로드·PR·main 병합·공개 배포는 하지 않았다.

## 추가 기능

잘못되거나 오래된 주소로 방문하면 GitHub 기본 화면 대신 `404.html`을 제공한다.
누수·배관, 인테리어, 관리사무소, 시공 사례 목록으로 바로 이동한다.
모든 고정 링크와 스타일·스크립트 주소는 `/manmool/` 기준이어서 중첩된 오류 주소에서도 동작한다.
HTTP 404와 `noindex`를 유지하며 임의 주소로 자동 이동하지 않는다.

검색은 현재 공개된 `blog.html`의 카드만 읽는다. 확인 당시 공개 글은 40건이다.
아파트명·지역·작업명 검색, 분야 선택, 6건씩 더 보기, 초기화, 한글 조합 입력을 지원한다.
검색어와 잘못된 주소는 저장소·조회 URL·리퍼러로 보내지 않는다.
목록 로드가 8초 이상 걸리거나 실패하면 재시도를 제공한다.
JavaScript가 꺼져도 기본 이동 링크는 사용할 수 있다.

배포 검사에서는 기존 `src` 외에 동영상 `poster`, 반응형 이미지 `srcset`,
`/manmool/` 경로와 같은 호스트의 절대 URL도 실제 산출물과 대조한다.
잘못된 URI는 다른 검사까지 중단하지 않고 오류로 함께 보고한다.
다른 호스트와 자매 저장소 `/hyeonjang/`의 파일까지 이 산출물에서 찾지는 않는다.

## 변경 파일

- `404.html`, `css/page-recovery.css`, `js/page-recovery.js`: 새 방문자 안내·검색.
- `scripts/pages-artifact-policy.mjs`: 새 HTML·JS 공개 허용목록.
- `scripts/ensure-pages-artifact.mjs`: 미디어·경로 누락 검사.
- `scripts/ensure-site-integrity.mjs`: 프로젝트 루트 기준 링크의 로컬 검사 지원.
- `tests/page-recovery.e2e.cjs`: 실제 중첩 404 응답, 검색, 재시도, 통신 지연, JS 비활성, 모바일 검사.
- `tests/pages-artifact-policy.test.cjs`: 미디어 누락·잘못된 URI·실제 영상 보존 회귀.
- `.github/workflows/deploy-pages.yml`: 새 브라우저 검사 등록.

## 검증 결과

- `scripts/ensure-*.mjs` 23개 모두 통과. 첫 검사에서 루트 링크 해석 실패를 발견해 수정 후 해당 검사 통과.
- `tests/page-recovery.e2e.cjs` 9/9 통과.
- `tests/case-finder.e2e.cjs`, `tests/pages-artifact-policy.test.cjs`, `tests/service-design.e2e.cjs` 합계 43/43 통과.
- 합계 관련 테스트 52/52 통과. PC 1280px, 모바일 390px·320px 확인.
- 미디어 검사 보호 로직을 이전 동작으로 되돌리는 변이 검사에서 신규 3개 테스트가 실패함을 확인한 뒤 정상 복구.
- `node --check js/page-recovery.js`, `git diff --check` 통과.
- `_site` 554개 파일 공개 허용목록 검사 통과. 기존 원고·생성 파일 차이 없음.
- PC·모바일 브라우저 스크린샷 검토 완료. 실제 휴대폰 기기 검사는 포함하지 않는다.

## 확인·병합 시 참고

현재 미리보기: `http://127.0.0.1:8899/manmool/404.html`.
중첩 오류 상황: `http://127.0.0.1:8899/manmool/posts/old/missing.html`.
미리보기 서버가 종료되면 이 로컬 주소도 닫힌다.

병합 전 최신 `origin/main`을 다시 확인한다. 클로드가 같은 배포 검사나 허용목록을
수정했다면 양쪽 변경을 보존해 합친 뒤 `node scripts/build-pages-artifact.mjs`와
위 관련 검사를 다시 실행한다. 오래된 전체 파일로 덮어쓰지 않는다.
배포 후에는 실제 존재하지 않는 중첩 URL이 HTTP 404 상태로 새 안내를 표시하는지,
검색·고정 링크가 정상 사례와 서비스로 이어지는지 확인한다.
