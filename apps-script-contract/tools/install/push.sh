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
command -v npx >/dev/null || { echo "실패: Node.js(npx)가 없습니다." >&2; exit 1; }
npm install --ignore-scripts --no-audit --no-fund
CLASP=(npx --yes @google/clasp@3)
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
