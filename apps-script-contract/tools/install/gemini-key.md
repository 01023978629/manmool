# Gemini 인증 키 준비

2026년 9월부터 Standard API key는 Gemini API에서 거부될 예정이므로, 처음부터 서비스 계정에 묶인 auth key를 만듭니다. 이 키는 전자계약 설치 필수값이 아니며 늦어져도 `bootstrap()`과 자가진단은 먼저 끝낼 수 있습니다.

## 권장 절차

```powershell
gcloud auth login
gcloud config set project manmool-gemini-no-billing
gcloud services enable generativelanguage.googleapis.com apikeys.googleapis.com iam.googleapis.com
gcloud iam service-accounts create manmool-gemini --display-name="Manmool Gemini Server"
$project = gcloud config get-value project
$serviceAccount = "manmool-gemini@$project.iam.gserviceaccount.com"
gcloud services api-keys create --display-name="Manmool Gemini Server" --service-account=$serviceAccount --api-target=service=generativelanguage.googleapis.com
```

생성 명령의 결과에 나온 키를 채팅·문서·Git에 붙이지 않습니다. Apps Script 편집기의 **프로젝트 설정 → 스크립트 속성**에서 `GEMINI_API_KEY`로 직접 저장하고 화면에는 `설정됨` 여부만 확인합니다. 결제 계정은 이 프로젝트에 연결하지 않습니다.

## 실패할 때

- `PERMISSION_DENIED`: 현재 계정이 프로젝트의 API Keys Admin 및 Service Account Admin 권한을 갖는지 확인합니다.
- `service account binding is not supported` 또는 auth key 옵션을 인식하지 못함: `gcloud components update` 후 다시 실행합니다.
- 조직 정책이 서비스 계정 키 생성을 막음: 개인 프로젝트를 새로 만들거나 조직 관리자에게 auth key 생성을 요청합니다. Standard key로 임시 우회하지 않습니다.
- AI Studio가 `The request is suspicious`를 내더라도 위 CLI 경로는 별개입니다.

서비스 계정 자체의 JSON 키 파일은 만들지 않습니다. Gemini auth key는 API key와 서비스 계정의 결합만 필요하며, 별도 JSON 자격증명 파일을 PC에 남길 이유가 없습니다.
