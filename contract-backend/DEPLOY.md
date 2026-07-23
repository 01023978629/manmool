# 전자계약 서버 배포 가이드

이 서버가 **공개 주소**에 떠야 고객이 카카오톡으로 받은 서명 링크를 폰에서 열 수 있습니다.
서버는 무의존성(Node 22 내장 http/crypto/sqlite)이고, 데이터는 **SQLite 파일**에 저장되므로
**영속 볼륨(디스크)** 이 반드시 필요합니다(재배포 시 계약·서명 데이터 보존).

> ⚠️ AI(저)는 사장님 호스팅 계정에 직접 배포할 수 없습니다(계정·크레덴셜 필요).
> 아래는 **사장님이 몇 줄로 끝내는** 절차입니다. 코드·Docker·설정은 준비돼 있습니다.

## 준비물
- 호스팅 계정 1개(아래 A: Fly.io 권장 · B: Render)
- **영속 볼륨/디스크**(SQLite 저장)
- 시크릿 2개(최소): `CONTRACT_PEPPER`, `ADMIN_TOKEN`
  ```bash
  openssl rand -hex 32   # CONTRACT_PEPPER 값
  openssl rand -hex 16   # ADMIN_TOKEN 값(관리자 로그인용)
  ```

## 필수/선택 환경변수
| 변수 | 필수 | 설명 |
|---|---|---|
| `CONTRACT_PEPPER` | ✅ | 해시 페퍼. 없으면 기동 거부 |
| `ADMIN_TOKEN` | ▲권장 | `/admin` 로그인 토큰. 없으면 관리자 페이지 비활성 |
| `DB_PATH` | (기본 `/data/contract.db`) | 영속 볼륨 경로 |
| `PORT` | (기본 8787) | 호스팅이 지정하면 그 값 |
| `ALIMTALK_LIVE`, `SOLAPI_*` | ❌ | 알림톡 실제발송(나중에 `/admin`에서 입력 가능) |
| `CORS_ORIGINS` | ▲ | 현장 앱 등 **교차출처**에서 운영자 API 호출 시. 쉼표구분 허용 출처. 예: `https://01023978629.github.io` |

`NODE_ENV=production` 은 Docker 이미지에 이미 설정돼 있습니다(데모/기본페퍼 fail-fast).

> 💡 **배포 전 점검:** `npm run preflight` 를 돌리면 위 환경변수 중 무엇이 채워졌는지
> ✓/✗ 체크리스트로 확인해줍니다(필수 미설정 시 종료코드 1). 배포 환경에서 한 번 실행해
> 초록불을 확인한 뒤 `npm run prod` 하세요.

---

## ⚡ 자동 배포(GitHub Actions) — 1회 설정 후 푸시하면 자동

저장소에 `.github/workflows/deploy-contract.yml` 이 준비돼 있습니다. **딱 한 번만** 아래를 하면,
이후 `contract-backend` 변경이 main 에 들어올 때마다 **자동 배포**됩니다.

```bash
# 1) fly 앱·볼륨 1회 생성
cd contract-backend
fly launch --no-deploy --name <원하는앱이름>
fly volumes create contract_data --region nrt --size 1
# 2) 시크릿 주입(1회)
fly secrets set CONTRACT_PEPPER=$(openssl rand -hex 32) ADMIN_TOKEN=$(openssl rand -hex 16) \
  CORS_ORIGINS=https://01023978629.github.io
# 3) 배포 토큰 발급 → GitHub 저장소 Settings → Secrets → Actions 에 FLY_API_TOKEN 으로 추가
fly tokens create deploy
```

→ 이후 `git push`(main) 하면 Actions 가 `flyctl deploy` 실행. `FLY_API_TOKEN` 없으면 워크플로는
**조용히 건너뜁니다**(설정 전 실패 소음 없음). 첫 배포만 위 `fly launch` 로 앱을 만들면 됩니다.

수동으로 하고 싶으면 아래 A(Fly) 또는 B(Render)를 따르세요.

## A. Fly.io (권장 — Docker + 볼륨 + Node22 궁합)

```bash
# 0) flyctl 설치 & 로그인
curl -L https://fly.io/install.sh | sh
fly auth login

# 1) contract-backend 폴더에서(앱 생성만, 배포는 아직)
cd contract-backend
fly launch --no-deploy --copy-config --name <원하는앱이름>
#   → fly.toml 의 app 이름이 <원하는앱이름> 으로 바뀝니다.

# 2) 영속 볼륨 생성(fly.toml 의 source=contract_data 와 이름 일치)
fly volumes create contract_data --region nrt --size 1

# 3) 시크릿 주입(코드/저장소에 두지 않음)
fly secrets set CONTRACT_PEPPER=$(openssl rand -hex 32) ADMIN_TOKEN=$(openssl rand -hex 16)
#   ↑ ADMIN_TOKEN 값은 따로 메모(관리자 로그인에 씀)

# 4) 배포
fly deploy

# 5) 확인
fly open /healthz            # {"ok":true,...}
fly open /admin              # 관리자 로그인 화면
```

주소: `https://<원하는앱이름>.fly.dev` — 이게 **공개 서버 주소**입니다.
`https://<앱>.fly.dev/sign` 이 고객 서명 화면, `/admin` 이 사장님 설정 화면.

## B. Render (대안 — 웹 UI)
1. Render 대시보드 → **New → Web Service** → 이 저장소 연결, 루트를 `contract-backend` 로
2. **Docker** 런타임 선택(Dockerfile 자동 인식)
3. **Disks**: `/data` 에 1GB 디스크 추가(영속)
4. **Environment**: `CONTRACT_PEPPER`, `ADMIN_TOKEN` 추가(값은 위 openssl)
5. Deploy → 발급된 `https://<서비스>.onrender.com` 이 공개 주소

> 무료 티어는 디스크가 없거나 절전 지연이 있을 수 있습니다. 계약 데이터 보존을 위해 **디스크 있는 플랜**을 쓰세요.

---

## 배포 후 (알림톡 켜기 → 실제 발송)
1. `https://<앱주소>/admin` 접속 → `ADMIN_TOKEN` 으로 로그인
2. 카카오/솔라피에서 발급받은 값 입력·저장 → **실제 발송 켜기=1** (`SETUP-ALIMTALK.md` 참고)
3. **본인번호 테스트 발송**(서버 공개 주소를 "서버 주소"칸에 넣으면 서명 링크가 열림)
4. 이상 없으면 실제 계약 발송 진행

## 주의
- **인스턴스는 1개만.** SQLite 는 다중 인스턴스에서 동시쓰기가 안 됩니다(스케일아웃 금지).
- 볼륨(디스크)을 지우면 계약·서명·설정이 모두 사라집니다. 백업(볼륨 스냅샷)을 권장합니다.
- 시크릿은 항상 호스팅 시크릿 기능으로만 주입(저장소·이미지에 넣지 않기).
- 스키마 변경 시 기존 파일 DB는 자동 마이그레이션되지 않습니다(신규 배포는 무관).
