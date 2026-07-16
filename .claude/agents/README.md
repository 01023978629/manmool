# 만물인테리어 서브에이전트 번들 (v103)

manmool(공개 사이트)·hyeonjang(운영앱) 운영을 위한 서브에이전트 정의입니다.
Claude Code가 이 저장소에서 새 세션을 시작할 때 자동 로딩됩니다.
(이미 열려 있는 세션에는 반영되지 않으니 새 세션에서 사용하세요.)

## 운영 원칙 2가지
1. **병렬 읽기, 단일 쓰기** — 같은 파일은 동시에 쓰기 에이전트 1명만 수정한다.
   - 쓰기 가능: `lead-integration-engineer`(유일한 교차 저장소), `hyeonjang-pwa-engineer`, `manmool-public-site-engineer`, `release-documentation-manager`(문서만)
   - 나머지 6종은 전부 읽기 전용 리뷰어다.
2. **승인 게이트** — 금액·계약·고객 발송·삭제·배포는 대표 승인 후에만 (무승인 발송 0).

## 자동화 권한 3분류
| 분류 | 예시 |
|---|---|
| 자동 실행 가능 | 읽기 검색, 요약, 초안 작성, 체크리스트, 회귀 테스트 |
| 대표 승인 필요 | 리드 import 확정, 일정, 수금 반영, 고객 발송, CTA 변경, 배포 |
| 항상 금지 | 무승인 삭제·계약 확정, 비밀값 공개 커밋, 실고객정보 테스트, 스냅샷 없는 대량 병합 |

## 에이전트 목록
| 파일 | 역할 | 권한 |
|---|---|---|
| lead-integration-engineer.md | manmool↔hyeonjang 리드 연동 계약 | 쓰기(교차) |
| hyeonjang-pwa-engineer.md | 운영앱 PWA·저장 계층 | 쓰기 |
| manmool-public-site-engineer.md | 공개 사이트·폼·콘텐츠 | 쓰기 |
| data-integrity-guardian.md | 직렬화·import·마이그레이션 무결성 | 읽기 |
| security-privacy-reviewer.md | URL·저장소·로그·XSS·EXIF | 읽기 |
| qa-regression-runner.md | 비파괴 회귀 테스트 실행 | 읽기+실행 |
| ai-automation-auditor.md | 자동화 권한 3분류 감사 | 읽기 |
| construction-operations-reviewer.md | 시공 도메인·분쟁 리스크 | 읽기 |
| ux-accessibility-reviewer.md | UX·접근성 | 읽기 |
| release-documentation-manager.md | 문서 동기화·릴리스 패키징 | 문서 쓰기 |

Codex용 동일 번들: `../../.codex/agents/*.toml`
