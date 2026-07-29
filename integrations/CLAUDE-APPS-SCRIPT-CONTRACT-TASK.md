# 클로드 실행 명령 — 전자계약을 Google Apps Script로 이전

아래 작업을 만물인테리어 저장소에 직접 구현하고, 코드·테스트·문서·마이그레이션 결과를 커밋 또는 PR로 남겨라. 설명만 하지 말고 실제 파일을 수정하라.

## 목표

종료한 Fly.io `contract-backend`를 대체하는 별도 `apps-script-contract/` 프로젝트를 만든다.

- 실행: Google Apps Script 웹앱
- 구조화 데이터: Google Sheets
- 원본·서명·PDF·백업: Google Drive
- 현장 화면: 기존 `hyeonjang` PWA
- 실제 발송: 기본 OFF(Mock)

기존 사진·현장 데이터용 Apps Script 릴레이는 건드리지 말고, 전자계약용 프로젝트를 분리한다.

## 필수 기능

1. 계약 생성·조회·잠금
2. 고객용 일회성 서명 링크 발급
3. 모바일 서명 화면과 서명 제출
4. 완료 처리와 변경 불가능한 증거 기록
5. 계약금·중도금·잔금 청구 및 입금 기록
6. 관리자 조회·검색·CSV 내보내기
7. Drive PDF 생성과 버전별 SHA-256 해시
8. 일일 백업과 복원 절차

Apps Script 웹앱 액션은 최소한 `createContract`, `getContract`, `signContract`, `completeContract`, `listContracts`, `recordPayment`, `backup`으로 분리한다.

## 보안·데이터 규칙

- 관리자 토큰, Solapi API Key/Secret, Pepper는 코드나 저장소에 넣지 않고 Script Properties만 사용한다.
- 서명 링크 토큰은 원문 저장 금지, 해시만 저장하고 TTL과 1회 사용을 적용한다.
- 모든 변경 요청에 `LockService`와 idempotency key를 적용한다.
- 계약 원본, 서명 시각, 문서 해시, 버전, 변경 주체를 append-only 감사 로그에 남긴다.
- CORS만 믿지 말고 서버 측 토큰 검증을 한다.
- 시트 셀에 쓰는 사용자 입력은 수식 주입을 막는다.
- 로그에 전화번호·서명·토큰·API Secret 원문을 남기지 않는다.
- 실제 Solapi 발송은 구현 중과 배포 직후에도 OFF로 유지한다.

## 기존 데이터 이전

원본 백업:

`D:\만물인테리어_백업\contract_20260730_before_fly_delete.db`

검증용 SHA-256:

`4FABBA67249B9480DA019AE998713D24A7082A67BA316AA12CCF958FB6541840`

- 원본 DB를 절대 수정하지 않는다.
- 읽기 전용으로 테이블·건수·금액을 분석한다.
- Sheets/Drive로 이관할 변환 스크립트와 dry-run 보고서를 만든다.
- 이관 전후 계약 건수, 대금 합계, 서명 상태, 문서 해시를 대조한다.
- 불일치는 자동 보정하지 말고 별도 목록으로 보고한다.

## PWA 연결

- 현재 `Apps Script 이전 준비 중`으로 잠긴 전자계약 UI를 새 웹앱 주소가 유효하고 self-test를 통과했을 때만 활성화한다.
- 웹앱 주소와 운영 상태는 설정값으로 관리하며 하드코딩하지 않는다.
- 실패 시 계약·발송 기록을 성공으로 남기지 않는다.
- 중복 클릭·재시도에도 계약 또는 서명이 중복 생성되지 않게 한다.

## 테스트

- 정상 흐름: 생성 → 고객 조회 → 서명 → 완료 → PDF/해시
- 만료·재사용·변조 토큰 거부
- 중복 요청 idempotency
- 동시에 들어온 서명 LockService 처리
- 관리자 인증 실패
- 시트 수식 주입 방지
- Drive 쓰기 실패 시 성공 기록 금지
- 마이그레이션 dry-run과 건수·금액 대조
- 실제 발송 OFF 확인

## 산출물

- `apps-script-contract/` 전체 소스와 설정 예시
- 시트 컬럼·Drive 폴더 구조 문서
- 배포·권한 승인·Script Properties 설정 문서
- 마이그레이션 스크립트와 dry-run 결과
- PWA 변경과 회귀 테스트
- 검증한 것과 사람 계정이 필요해 검증하지 못한 것을 분리한 인계서

완료 시 커밋 또는 Draft PR 링크, 변경 파일, 통과한 테스트, 미검증 항목, 대표님이 Google 화면에서 해야 할 최소 단계만 보고하라.
