#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
APPLY="${1:-}"
node precheck.mjs
echo "계획: 새 독립 프로젝트 「만물 전자계약」 생성 → 대상 재확인 → 14개 파일 업로드 → 웹앱 배포"
if [[ "$APPLY" != "--apply" ]]; then
  echo "계획만 확인했습니다. 실제 실행은: bash push.sh --apply"
  exit 0
fi
command -v npx >/dev/null || { echo "실패: Node.js(npx)가 없습니다." >&2; exit 1; }
npm install --ignore-scripts --no-audit --no-fund
CLASP=(npx --yes @google/clasp@3)
rm -f .clasp.json
"${CLASP[@]}" list-scripts > before-scripts.txt
"${CLASP[@]}" create-script --title "만물 전자계약" --type standalone --rootDir ../..
node configure-project.mjs .clasp.json
"${CLASP[@]}" list-scripts > after-scripts.txt
node project-guard.mjs .clasp.json after-scripts.txt before-scripts.txt
"${CLASP[@]}" show-file-status
"${CLASP[@]}" push --force
"${CLASP[@]}" create-deployment --description "만물 전자계약 최초 설치"
"${CLASP[@]}" open-script
rm -f before-scripts.txt after-scripts.txt
echo "완료: 열린 편집기에서 bootstrap(true), 확인 뒤 bootstrap()을 실행하세요."
