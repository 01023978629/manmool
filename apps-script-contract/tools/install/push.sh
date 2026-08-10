#!/usr/bin/env bash
set -euo pipefail
INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INSTALL_DIR"
APPLY="${1:-}"
node precheck.mjs
echo "계획: 새 독립 프로젝트 「만물 전자계약」 생성 → 대상 재확인 → 14개 파일 업로드 → 웹앱 배포"
if [[ "$APPLY" != "--apply" ]]; then
  echo "계획만 확인했습니다. 실제 실행은: bash push.sh --apply"
  exit 0
fi
# 아래 두 파일에는 계정의 전체 Apps Script ID가 들어간다. npm/clasp 준비 단계에서
# 실패해도 반드시 지워지도록 실제 작업보다 먼저 정리 장치를 건다.
trap 'rm -f "$INSTALL_DIR/before-scripts.txt" "$INSTALL_DIR/after-scripts.txt"' EXIT

# 계정 없는 설치 리허설 전용 실패 주입점. 값이 1일 때는 clasp·npm을 부르기 전에
# 가짜 임시 파일을 만든 뒤 실패해 EXIT trap이 실제로 지우는지 확인한다.
if [[ "${MANMOOL_INSTALL_REHEARSAL_FAIL:-}" == "1" ]]; then
  : > "$INSTALL_DIR/before-scripts.txt"
  : > "$INSTALL_DIR/after-scripts.txt"
  echo "리허설용 강제 실패" >&2
  exit 97
fi
command -v npx >/dev/null || { echo "실패: Node.js(npx)가 없습니다." >&2; exit 1; }
npm install --ignore-scripts --no-audit --no-fund
CLASP=(npx --yes @google/clasp@3)
# before/after-scripts.txt 에는 **사장님 계정의 모든 Apps Script 프로젝트 ID**가 담긴다
# (사진 중계 프로젝트 포함). set -e 로 중간에 멎으면 마지막 rm 까지 못 가서
# 그 파일이 공개 저장소 안에 남는다 — 위 EXIT trap이 어떤 경로에서도 지운다.
cd ../..
rm -f .clasp.json
"${CLASP[@]}" list-scripts > "$INSTALL_DIR/before-scripts.txt"
"${CLASP[@]}" create-script --title "만물 전자계약" --type standalone --rootDir .
node "$INSTALL_DIR/configure-project.mjs" .clasp.json
"${CLASP[@]}" list-scripts > "$INSTALL_DIR/after-scripts.txt"
node "$INSTALL_DIR/project-guard.mjs" .clasp.json "$INSTALL_DIR/after-scripts.txt" "$INSTALL_DIR/before-scripts.txt"
"${CLASP[@]}" show-file-status
"${CLASP[@]}" push --force
"${CLASP[@]}" create-deployment --description "만물 전자계약 최초 설치"
"${CLASP[@]}" open-script
rm -f "$INSTALL_DIR/before-scripts.txt" "$INSTALL_DIR/after-scripts.txt"
echo "완료: 열린 편집기에서 bootstrap(true), 확인 뒤 bootstrap()을 실행하세요."
