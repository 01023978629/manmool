param([switch]$Apply)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
try {
  node precheck.mjs
  Write-Host '계획: 새 독립 프로젝트 「만물 전자계약」 생성 → 대상 재확인 → 14개 파일 업로드 → 웹앱 배포'
  if (-not $Apply) { Write-Host '계획만 확인했습니다. 실제 실행은: .\push.ps1 -Apply'; exit 0 }
  if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw 'Node.js(npx)가 없습니다.' }
  npm install --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE) { throw 'QR 도구 설치에 실패했습니다.' }
  $installDir = $PSScriptRoot
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
  Remove-Item -LiteralPath .clasp.json -Force -ErrorAction SilentlyContinue
  $before = Join-Path $installDir 'before-scripts.txt'
  $after = Join-Path $installDir 'after-scripts.txt'
  npx --yes '@google/clasp@3' list-scripts | Set-Content -LiteralPath $before -Encoding utf8
  npx --yes '@google/clasp@3' create-script --title '만물 전자계약' --type standalone --rootDir .
  if ($LASTEXITCODE) { throw '새 Apps Script 프로젝트 생성에 실패했습니다.' }
  node (Join-Path $installDir 'configure-project.mjs') .clasp.json
  npx --yes '@google/clasp@3' list-scripts | Set-Content -LiteralPath $after -Encoding utf8
  node (Join-Path $installDir 'project-guard.mjs') .clasp.json $after $before
  npx --yes '@google/clasp@3' show-file-status
  npx --yes '@google/clasp@3' push --force
  if ($LASTEXITCODE) { throw '코드 업로드에 실패했습니다.' }
  npx --yes '@google/clasp@3' create-deployment --description '만물 전자계약 최초 설치'
  if ($LASTEXITCODE) { throw '웹앱 배포에 실패했습니다.' }
  npx --yes '@google/clasp@3' open-script
  Remove-Item -LiteralPath $before,$after -Force -ErrorAction SilentlyContinue
  Write-Host '완료: 열린 편집기에서 bootstrap(true), 확인 뒤 bootstrap()을 실행하세요.'
} catch {
  Write-Error ('설치 중단: ' + $_.Exception.Message)
  exit 1
}
