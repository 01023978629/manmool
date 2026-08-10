1. 터미널에서 `npx --yes @google/clasp@3 login`을 실행해 Google 계정 권한을 승인합니다.
2. 이 폴더에서 먼저 `./push.ps1`, 확인 뒤 `./push.ps1 -Apply`를 실행합니다(맥·리눅스는 `bash push.sh`, `bash push.sh --apply`).
3. 열린 Apps Script 편집기에서 `bootstrap(true)` 후 `bootstrap()`을 실행합니다. QR은 인증된 경로가 JSON을 표준입력으로 넘길 때만 그리며, 토큰을 화면에 꺼내 실행하지 않습니다.
