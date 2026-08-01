# 옛 서버 자료 옮기기 — 사용법

옛 Fly 서버(SQLite)에 있던 계약·대금·서명링크·사건기록을 **Google 시트로 옮기는 순서**입니다.

원본 백업: `D:\만물인테리어_백업\contract_20260730_before_fly_delete.db`
원본 지문(SHA-256): `4FABBA67249B9480DA019AE998713D24A7082A67BA316AA12CCF958FB6541840`

---

## 먼저 알아 두실 것

- **원본 파일은 한 글자도 바뀌지 않습니다.** 읽기 전용으로만 엽니다.
  그래도 원본 자체로 돌리지 마시고 **복사본을 만들어** 그 복사본으로 돌리세요. 사고는 언제나 예상 밖에서 납니다.
- **기본은 시늉만 하기(dry-run)** 입니다. `--write` 를 붙여야 파일이 만들어집니다.
- 만들어진 `out/` 폴더에는 **고객 이름·마스킹 전화번호·계약 금액**이 들어 있습니다.
  git 에는 올라가지 않게 막아 두었지만(`.gitignore`), 끝나면 **손으로 지우세요.**
- 옛 백업 파일은 **지우지 마십시오.** 서명 그림·동의 기록처럼 시트로 못 옮기는 것이 그 안에만 남습니다.

## 준비물

- Node 22 이상 (`node --version`)
- 실행하면 `ExperimentalWarning: SQLite is an experimental feature` 가 뜹니다. **정상입니다.**
  Node 가 내장 SQLite 를 아직 실험 기능으로 두어서 나오는 안내일 뿐, 자료와는 무관합니다.
- 백업 폴더에 `.db-wal` · `.db-shm` 파일이 함께 있으면 **그 둘도 같이 복사**하세요.
  최근 며칠치 기록이 그 파일에 남아 있을 수 있습니다.

---

## 1) 시늉만 해 보기 — 무엇이 옮겨질지 먼저 봅니다

```bash
node apps-script-contract/tools/migrate-sqlite-to-sheets.mjs --db="D:\만물인테리어_백업\contract_20260730_before_fly_delete.db"
```

화면 맨 아래 판정 한 줄과 ✓/✗ 목록을 보십시오.

- **지문이 다르면 여기서 멈춥니다.** 다른 백업 파일을 넣으신 것입니다. 파일을 다시 확인하세요.
  그 파일이 맞다고 확신하시면 `--allow-hash-mismatch` 를 붙이세요(보고서 첫머리에 남습니다).
- `✗` 가 하나라도 있으면 **시트에 올리지 마세요.** 무엇이 어긋났는지 보고서에 다 적혀 있습니다.

## 2) 실제로 파일 만들기

```bash
node apps-script-contract/tools/migrate-sqlite-to-sheets.mjs --db="…\contract_20260730_before_fly_delete.db" --write
```

`apps-script-contract/tools/out/` 에 다섯 개가 생깁니다.

| 파일 | 들어갈 시트 |
|---|---|
| `Contracts.csv` | Contracts |
| `Payments.csv` | Payments |
| `SignTokens.csv` | SignTokens |
| `ContractEvents.csv` | ContractEvents |
| `report.md` | (사장님이 읽으실 보고서) |

**`report.md` 를 먼저 읽으십시오.** 이전 전/후 건수, 금액 합계, 문서 지문 보존,
옮기지 못한 줄과 그 이유, 원본에서 이미 어긋나 있던 줄이 전부 적혀 있습니다.

## 3) Drive 에 올리고 시트로 밀어 넣기

1. Drive 에 폴더를 하나 만들고 CSV 4개를 올립니다. **공유하지 마세요.**
2. Apps Script 편집기에서 `ensureSheets_()` 를 한 번 실행합니다(시트와 머리행 준비).
3. 같은 편집기에서 실행합니다:

   ```js
   importFromDriveFolder_('<Drive 폴더 id>')
   ```

   폴더 id 는 Drive 주소창의 `…/folders/` 뒤 문자열입니다.

4. 실행 기록(보기 ▸ 실행 로그)에 이렇게 찍힙니다:

   ```
   [이전] Contracts ← Contracts.csv
   [이전] 넣기 전 0줄 → 넣은 뒤 42줄 (새로 넣음 42줄)
   [이전] 건너뜀: 이미 있음 0 · CSV 안 중복 0 · 빈 줄 0
   ```

   이 건수가 `report.md` 의 "건수 — 이전 전 / 후" 표와 같은지 보십시오.

5. **"아직 N줄이 남았습니다"** 가 찍히면 구글의 6분 제한에 걸린 것입니다.
   그냥 **같은 명령을 한 번 더** 실행하세요. 이미 들어간 줄은 건너뛰고 남은 줄부터 이어 넣습니다.
   몇 번을 실행해도 같은 줄이 두 번 들어가지 않습니다.

## 4) 마무리

- 시트를 눈으로 확인하십시오(계약 몇 건 골라 금액·이름·날짜).
- `out/` 폴더를 지우십시오.
- Drive 에 올린 CSV 도 지우십시오.
- 옛 백업 `.db` 는 **그대로 보관**하십시오.

---

## 옵션

| 옵션 | 뜻 |
|---|---|
| `--db=<경로>` | 옛 백업 파일 (필수) |
| `--write` | 실제로 파일을 만든다. 없으면 시늉만 한다 |
| `--out=<폴더>` | 산출물 폴더 (기본 `tools/out`) |
| `--expect-sha256=<지문>` | 기대하는 원본 지문을 바꾼다 (기본은 위에 적힌 값) |
| `--allow-hash-mismatch` | 지문이 달라도 진행한다 |
| `--drop-dead-tokens` | 이미 죽은 링크(만료·사용됨·취소됨)는 옮기지 않는다. 기본은 전부 옮긴다 |
| `--allow-source-anomalies` | 원본이 이미 어긋나 있어도 통과로 본다. 기본은 실패 |
| `--now=<ISO시각>` | 링크 만료 판정 기준 시각 (기본: 지금) |

끝난 뒤 값: `0` 통과 · `1` 대조가 어긋남 · `2` 시작도 못 함(지문 불일치·파일 없음)

---

## 자주 나오는 질문

**만료된 서명 링크는 어떻게 되나요?**
기본은 **전부 옮깁니다.** 링크를 언제 몇 번 보냈는지가 기록의 일부이기 때문입니다.
옮겨도 열리지 않습니다 — 만료·사용·취소된 링크는 `Pure.gs` 의 `tokenState` 가 막습니다.
애초에 토큰 원문은 어디에도 없고 해시만 있어서, 시트가 통째로 새어 나가도 남의 계약은 열리지 않습니다.
굳이 빼고 싶으시면 `--drop-dead-tokens` 를 붙이세요.

**보고서에 "원본 이상"이 떴습니다.**
옛 DB 안에서 **이미** 어긋나 있던 값입니다(예: 계약금 3회차 합이 총액과 다름).
이 도구는 **고치지 않고 그대로** 옮깁니다. 어느 쪽이 맞는지는 사장님만 아시기 때문입니다.
시트에 올린 뒤 손으로 바로잡으시고, 무엇을 왜 고쳤는지 `ContractEvents` 에 한 줄 남기세요.

**전화번호 해시가 그대로 쓸 수 있나요?**
옛 서버의 `CONTRACT_PEPPER` 로 만든 값입니다. Apps Script 의 스크립트 속성 `PEPPER` 를
**같은 값으로** 두셔야 앞으로 만드는 해시와 대조가 됩니다.
다른 값을 쓰시면 옛 계약의 번호 해시는 영영 대조하지 못합니다(마스킹본 `010-****-5678` 은 그대로 보입니다).

**옮기지 않는 것**
서명 그림(용량), 동의 항목, 본인확인 OTP, 발송 이력, 문구 틀, 옛 운영 설정(비밀값이 섞여 있을 수 있음),
대금 독촉 시각, 접속지 해시. 전부 `report.md` 8번 항목에 건수와 이유가 적힙니다.
**그래서 옛 백업 파일을 지우면 안 됩니다.**

---

## 개발자용 — 가짜 자료로 검증하기

사장님의 실제 백업 없이도 이전 도구가 제대로 도는지 확인할 수 있습니다.

```bash
# 1) 정상 자료로 만든 가짜 DB — 통과해야 한다
node apps-script-contract/tools/make-fixture-db.mjs --out=apps-script-contract/tools/fixture/clean.db
H=$(sha256sum apps-script-contract/tools/fixture/clean.db | cut -d' ' -f1)
node apps-script-contract/tools/migrate-sqlite-to-sheets.mjs \
  --db=apps-script-contract/tools/fixture/clean.db --expect-sha256=$H --write
echo $?     # → 0

# 2) 일부러 어긋뜨린 가짜 DB — 실패해야 한다
node apps-script-contract/tools/make-fixture-db.mjs --out=apps-script-contract/tools/fixture/dirty.db --dirty
H=$(sha256sum apps-script-contract/tools/fixture/dirty.db | cut -d' ' -f1)
node apps-script-contract/tools/migrate-sqlite-to-sheets.mjs \
  --db=apps-script-contract/tools/fixture/dirty.db --expect-sha256=$H
echo $?     # → 1  (보고서 6·7번 항목에 무엇이 어긋났는지 나온다)
```

`--dirty` 가 심는 것: 대금 합계 불일치 · 잠금 후 본문 변조(지문 재계산 불일치) ·
모르는 계약 상태 · 대금 회차 없음 · 시트 한 칸을 넘는 긴 본문(이 계약은 옮기지 못하고 이유가 남는다).

`--expect-sha256` 을 빼고 돌리면 사장님 백업의 지문과 달라 **중단**됩니다(끝난 뒤 값 `2`).
그 중단이 제대로 되는지도 함께 확인하세요 — 그게 이 도구의 첫 번째 안전장치입니다.

### 열 이름은 어디서 오는가

`Schema.gs` 와 `Pure.gs` 를 **실행 시점에 그대로 읽어** 씁니다(`node:vm`).
열 목록을 도구 안에 다시 적지 않았습니다 — 적는 순간 언젠가 시트와 어긋나고,
어긋난 열은 금액 칸에 날짜가 들어가는 사고로 나타납니다.
`Schema.gs` 에 열을 뒤에 추가하면 이 도구가 만드는 CSV 도 저절로 따라갑니다.
