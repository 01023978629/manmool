# 최근 1주일 만물누수 실제 사례 3건 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최근 1주일 현장 사진에서 승인된 15장을 개인정보 없이 가공하고, 실제 작업 기록 3건을 만물누수 사례 목록과 검색 피드에 추가한다.

**Architecture:** 원본 사진은 읽기 전용으로 두고 `assets/cases/`에 EXIF 없는 파생 JPEG만 만든다. `data/site.json`의 `insights`를 유일한 글 정본으로 사용하고 기존 `scripts/prerender-posts.py`가 개별 글, 목록, RSS를 생성하며 `sitemap.xml`만 명시적으로 갱신한다. 별도 회귀검사는 사진 자산과 콘텐츠·생성물의 연결을 함께 검증한다.

**Tech Stack:** Python 3 + Pillow, Node.js ESM 검사, JSON, 정적 HTML, GitHub Pages

**Spec:** `docs/superpowers/specs/2026-08-29-weekly-leak-cases-design.md`

## Global Constraints

- 공개 사례는 정확히 3건이며 slugs는 `apartment-basement-cast-iron-pipe-repair`, `apartment-balcony-rain-pipe-replacement`, `apartment-upper-lower-rain-pipe-repair`이다.
- 공개 사진은 지하실 주철관 6장, 베란다 우수관 4장, 상·하층 우수관 5장으로 정확히 15장이다.
- 원장 프로젝트명, 아파트 고유명, 동·호수, 상세 주소는 공개 콘텐츠와 공개 파일명에 들어가지 않는다.
- 원장에 없는 누수 원인, 탐지 방법, 통수시험, 작업 시간, 보험, 전유부·공용부 판정을 만들지 않는다.
- 모든 파생 사진은 EXIF가 없고 긴 변 1600px 이하, JPEG 품질 82, 파일당 500KB 이하여야 한다.
- 원본 사진은 수정·이동·삭제하지 않는다. 앱 미배정 방수 사진 4장은 사용하지 않는다.
- 기존 `data/site.json` 정본과 `scripts/prerender-posts.py` 생성 흐름을 유지한다.
- 원격 push, PR 병합, 공개 배포는 이 계획의 범위 밖이며 별도 대표 승인이 필요하다.

---

### Task 1: 개인정보 없는 사례 사진 15장 만들기

**Files:**
- Create: `scripts/ensure-weekly-leak-cases.mjs`
- Create: `assets/cases/apartment-basement-cast-iron-pipe-repair-cover.jpg`
- Create: `assets/cases/apartment-basement-cast-iron-pipe-repair-1.jpg`
- Create: `assets/cases/apartment-basement-cast-iron-pipe-repair-2.jpg`
- Create: `assets/cases/apartment-basement-cast-iron-pipe-repair-3.jpg`
- Create: `assets/cases/apartment-basement-cast-iron-pipe-repair-4.jpg`
- Create: `assets/cases/apartment-basement-cast-iron-pipe-repair-5.jpg`
- Create: `assets/cases/apartment-balcony-rain-pipe-replacement-cover.jpg`
- Create: `assets/cases/apartment-balcony-rain-pipe-replacement-1.jpg`
- Create: `assets/cases/apartment-balcony-rain-pipe-replacement-2.jpg`
- Create: `assets/cases/apartment-balcony-rain-pipe-replacement-3.jpg`
- Create: `assets/cases/apartment-upper-lower-rain-pipe-repair-cover.jpg`
- Create: `assets/cases/apartment-upper-lower-rain-pipe-repair-1.jpg`
- Create: `assets/cases/apartment-upper-lower-rain-pipe-repair-2.jpg`
- Create: `assets/cases/apartment-upper-lower-rain-pipe-repair-3.jpg`
- Create: `assets/cases/apartment-upper-lower-rain-pipe-repair-4.jpg`

**Interfaces:**
- Consumes: 15 explicit source files below; source files remain read-only.
- Produces: `export const WEEKLY_CASES` in `scripts/ensure-weekly-leak-cases.mjs`, listing the three slugs and their exact public image paths. Task 2 imports no code from it but must use the same paths verbatim.

- [ ] **Step 1: Write the failing media regression check**

Create `scripts/ensure-weekly-leak-cases.mjs`. Define this exact manifest:

```js
export const WEEKLY_CASES = [
  { slug: 'apartment-basement-cast-iron-pipe-repair', images: [
    'assets/cases/apartment-basement-cast-iron-pipe-repair-cover.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-1.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-2.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-3.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-4.jpg',
    'assets/cases/apartment-basement-cast-iron-pipe-repair-5.jpg'
  ]},
  { slug: 'apartment-balcony-rain-pipe-replacement', images: [
    'assets/cases/apartment-balcony-rain-pipe-replacement-cover.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-1.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-2.jpg',
    'assets/cases/apartment-balcony-rain-pipe-replacement-3.jpg'
  ]},
  { slug: 'apartment-upper-lower-rain-pipe-repair', images: [
    'assets/cases/apartment-upper-lower-rain-pipe-repair-cover.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-1.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-2.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-3.jpg',
    'assets/cases/apartment-upper-lower-rain-pipe-repair-4.jpg'
  ]}
];
```

The check must exercise the actual JPEG files and report all failures at once. Use this implementation after the manifest:

```js
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const allImages = WEEKLY_CASES.flatMap((item) => item.images);

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (sof.has(marker) && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

if (WEEKLY_CASES.map((item) => item.images.length).join(',') !== '6,4,5') failures.push('사례별 사진 수는 6,4,5여야 한다');
if (allImages.length !== 15) failures.push(`전체 사진 수가 ${allImages.length}장이다`);
if (new Set(allImages).size !== allImages.length) failures.push('새 사례 사진 경로가 중복된다');
for (const relative of allImages) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) { failures.push(`사진 없음: ${relative}`); continue; }
  const buffer = fs.readFileSync(absolute);
  if (buffer.length > 500000) failures.push(`사진이 500KB를 넘음: ${relative}`);
  if (buffer.includes(Buffer.from('Exif\0\0', 'binary'))) failures.push(`EXIF가 남음: ${relative}`);
  const size = jpegSize(buffer);
  if (!size) failures.push(`JPEG 치수를 읽을 수 없음: ${relative}`);
  else if (size.width > 1600 || size.height > 1600) failures.push(`1600px를 넘음: ${relative} ${size.width}x${size.height}`);
}

if (failures.length) {
  console.error(`최근 누수 사례 검사 실패 ${failures.length}건`);
  failures.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log('PASS 최근 누수 사례 3건 · 사진 15장');
```

Import `fs`, `path`, and `fileURLToPath` from the Node standard library. This check asserts: file exists, path is unique, file is at most 500000 bytes, bytes do not contain `Exif\0\0`, JPEG SOF dimensions can be parsed, and both dimensions are at most 1600.

- [ ] **Step 2: Run the media check and verify RED**

Run:

```powershell
& 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/ensure-weekly-leak-cases.mjs
```

Expected: FAIL because all 15 output JPEG files are missing. This proves the check catches absent production assets.

- [ ] **Step 3: Create the 15 derived JPEGs from the private source map**

Read the exact 15 source → destination pairs from the git-ignored file `.superpowers/sdd/2026-08-29-weekly-leak-cases/private-source-map.json`. Each item has exactly `source` and `destination` absolute paths. This file is created by the controller from the approved photo audit so private project names never enter the public repository history.

Use Pillow `ImageOps.exif_transpose`, `convert('RGB')`, `thumbnail((1600, 1600), Image.Resampling.LANCZOS)`, then save as `JPEG` with `quality=82`, `optimize=True`, `progressive=True` and no `exif` argument. Use this exact transformation loop:

```python
for item in mapping:
    src = Path(item['source'])
    dst = Path(item['destination'])
    if not src.is_file():
        raise FileNotFoundError(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        image.save(dst, 'JPEG', quality=82, optimize=True, progressive=True)
```

- [ ] **Step 4: Run the media check and verify GREEN**

Run the same Node command. Expected: PASS with `3건 · 사진 15장` and no warnings.

- [ ] **Step 5: Commit Task 1**

```powershell
git add scripts/ensure-weekly-leak-cases.mjs assets/cases/apartment-*.jpg
git commit -m "feat: prepare privacy-safe weekly leak case photos"
```

---

### Task 2: 사례 3건을 정본·검색 목록·정적 페이지에 연결하기

**Files:**
- Modify: `scripts/ensure-weekly-leak-cases.mjs`
- Modify: `data/site.json`
- Modify: `sitemap.xml`
- Modify (generated): `blog.html`
- Modify (generated): `rss.xml`
- Create (generated): `posts/apartment-basement-cast-iron-pipe-repair.html`
- Create (generated): `posts/apartment-balcony-rain-pipe-replacement.html`
- Create (generated): `posts/apartment-upper-lower-rain-pipe-repair.html`

**Interfaces:**
- Consumes: the 15 exact asset paths produced by Task 1 and the existing optional `img`, `imgAlt`, `imgCaption` fields supported by `scripts/prerender-posts.py`.
- Produces: three published `insights` entries, three static pages, three blog cards, three RSS items, and three sitemap URLs.

- [ ] **Step 1: Extend the regression check for content and generated outputs**

For each slug, load `data/site.json` and assert exactly one insight exists with `category === '방수·설비'`, `service === 'leak'`, the exact title/date below, and cover plus body image paths equal the Task 1 manifest in order. Assert the three counts `[6,4,5]`, 4~6 body sections, no duplicate public image paths, and no public data contains a `place` field, a unit pattern such as `/\b\d{3,4}\s*(?:동|호)\b/`, or a Korean mobile number.

Append this exact behavior before the Task 1 failure-report block, reusing its single `failures` array:

```js
const expectedContent = [
  { slug: 'apartment-balcony-rain-pipe-replacement', date: '2026-08-28', title: '대전 아파트 베란다 우수관 교체 — 바닥 배수구와 연결부 작업' },
  { slug: 'apartment-upper-lower-rain-pipe-repair', date: '2026-08-28', title: '대전 아파트 상·하층 우수관 보수 — 배수구 테두리와 관통부 마감' },
  { slug: 'apartment-basement-cast-iron-pipe-repair', date: '2026-08-26', title: '대전 아파트 지하실 주철관 보수 — 부식 구간부터 슬리브 마감까지' }
];
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const blog = fs.readFileSync(path.join(ROOT, 'blog.html'), 'utf8');
const rss = fs.readFileSync(path.join(ROOT, 'rss.xml'), 'utf8');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const unitPattern = /\b\d{3,4}\s*(?:동|호)\b/;
const phonePattern = /01[016789]-?\d{3,4}-?\d{4}/;

for (const expected of expectedContent) {
  const matches = (site.insights || []).filter((item) => item && item.slug === expected.slug);
  if (matches.length !== 1) { failures.push(`${expected.slug}: insight가 ${matches.length}건이다`); continue; }
  const item = matches[0];
  const media = [item.image, ...(item.body || []).filter((section) => section.img).map((section) => section.img)];
  const wantedMedia = WEEKLY_CASES.find((entry) => entry.slug === expected.slug).images;
  if (item.title !== expected.title || item.date !== expected.date) failures.push(`${expected.slug}: 제목 또는 날짜가 다르다`);
  if (item.category !== '방수·설비' || item.service !== 'leak') failures.push(`${expected.slug}: 누수 서비스 분류가 아니다`);
  if (item.place) failures.push(`${expected.slug}: 익명 사례에 위치 필드가 있다`);
  if ((item.body || []).length < 4 || item.body.length > 6) failures.push(`${expected.slug}: 본문 소제목이 4~6개가 아니다`);
  if (JSON.stringify(media) !== JSON.stringify(wantedMedia)) failures.push(`${expected.slug}: 사진 순서 또는 수가 다르다`);
  const publicText = JSON.stringify(item);
  if (unitPattern.test(publicText) || phonePattern.test(publicText)) failures.push(`${expected.slug}: 동호수 또는 전화번호가 공개 데이터에 있다`);
  const postPath = path.join(ROOT, 'posts', `${expected.slug}.html`);
  if (!fs.existsSync(postPath)) { failures.push(`${expected.slug}: 정적 글이 없다`); continue; }
  const post = fs.readFileSync(postPath, 'utf8');
  const canonical = `https://01023978629.github.io/manmool/posts/${expected.slug}.html`;
  if (!post.includes(`<link rel="canonical" href="${canonical}"`)) failures.push(`${expected.slug}: canonical이 없다`);
  if (!post.includes('data-service="leak"')) failures.push(`${expected.slug}: 누수 상담 CTA가 없다`);
  for (const image of wantedMedia) if (!post.includes(`../${image}`)) failures.push(`${expected.slug}: 정적 글에 사진 누락 ${image}`);
  if (!blog.includes(expected.slug) || !rss.includes(expected.slug) || !sitemap.includes(expected.slug)) failures.push(`${expected.slug}: 목록·RSS·sitemap 연결이 빠졌다`);
}
```

- [ ] **Step 2: Run the content check and verify RED**

Run the Node check. Expected: media checks pass, then FAIL because the three `insights` and generated pages do not exist.

- [ ] **Step 3: Add these three entries to the front of `data/site.json.insights`**

Insert these objects verbatim, in the order shown:

```json
{
  "slug": "apartment-balcony-rain-pipe-replacement",
  "title": "대전 아파트 베란다 우수관 교체 — 바닥 배수구와 연결부 작업",
  "category": "방수·설비",
  "service": "leak",
  "date": "2026-08-28",
  "readMin": 3,
  "cover": "#5f7782",
  "image": "assets/cases/apartment-balcony-rain-pipe-replacement-cover.jpg",
  "imageAlt": "수직 우수관 하부 연결부와 바닥 마감 상태",
  "excerpt": "바닥 배수구를 열어 기존 상태를 확인하고 수직 우수관 하부의 연결 부속을 교체한 현장입니다. 관통부와 연결부, 바닥 마감이 어떻게 달라졌는지 실제 사진으로 정리했습니다.",
  "body": [
    {"h": "바닥 배수구를 열어 확인했습니다", "p": "우수관 교체 작업을 시작하며 바닥 배수구를 개방해 내부와 주변 마감 상태를 확인했습니다. 사진에는 작업 전 배수구 안쪽과 바닥 타일 경계가 함께 남아 있습니다.", "img": "assets/cases/apartment-balcony-rain-pipe-replacement-1.jpg", "imgAlt": "작업 전 개방한 바닥 배수구와 주변 타일", "imgCaption": "작업 전 바닥 배수구를 개방한 상태"},
    {"h": "천장 관통부의 기존 배관", "p": "수직 배관이 천장을 통과하는 위치와 기존 연결 상태도 함께 확인했습니다. 교체 전 배관의 방향과 관통부 주변을 나중에도 확인할 수 있도록 가까이 촬영했습니다.", "img": "assets/cases/apartment-balcony-rain-pipe-replacement-2.jpg", "imgAlt": "교체 전 수직 우수관과 천장 관통부", "imgCaption": "교체 전 천장 관통부와 수직 배관"},
    {"h": "수직관 하부 연결 부속", "p": "수직 우수관 하부에 새 연결 부속을 설치했습니다. 바닥으로 이어지는 구간과 부속이 맞물린 상태가 보이도록 작업 중 사진을 남겼습니다.", "img": "assets/cases/apartment-balcony-rain-pipe-replacement-3.jpg", "imgAlt": "수직 우수관 하부에 설치한 연결 부속", "imgCaption": "수직관 하부 연결 부속 설치 상태"},
    {"h": "연결부와 바닥 마감 기록", "p": "작업 후에는 배관 하부 연결부와 바닥 주변을 한 화면에 담았습니다. 사진으로 확인되는 작업 범위를 그대로 기록하며, 보이지 않는 원인이나 결과는 덧붙이지 않았습니다."}
  ]
},
{
  "slug": "apartment-upper-lower-rain-pipe-repair",
  "title": "대전 아파트 상·하층 우수관 보수 — 배수구 테두리와 관통부 마감",
  "category": "방수·설비",
  "service": "leak",
  "date": "2026-08-28",
  "readMin": 3,
  "cover": "#687b72",
  "image": "assets/cases/apartment-upper-lower-rain-pipe-repair-cover.jpg",
  "imageAlt": "우수관 보수 후 정리한 배수구 테두리와 내부",
  "excerpt": "상·하층을 잇는 우수관 보수 현장에서 배수구와 배관 관통부 주변을 정리했습니다. 기존 마감 확인부터 부속 배치, 보수재 도포, 작업 후 상태까지 촬영 순서대로 기록했습니다.",
  "body": [
    {"h": "기존 배수구와 타일 마감", "p": "작업 전 배수구 안쪽과 주변 타일 경계를 먼저 확인했습니다. 배수구 테두리의 기존 마감 상태가 보이도록 가까운 거리에서 촬영했습니다.", "img": "assets/cases/apartment-upper-lower-rain-pipe-repair-1.jpg", "imgAlt": "작업 전 배수구와 주변 타일 마감", "imgCaption": "작업 전 배수구 테두리와 타일 경계"},
    {"h": "배관 관통부 주변 확인", "p": "배관이 구조체를 통과하는 부분과 그 주변 마감도 함께 살폈습니다. 사진에는 관통부 위치와 배관이 이어지는 방향이 함께 보입니다.", "img": "assets/cases/apartment-upper-lower-rain-pipe-repair-2.jpg", "imgAlt": "우수관이 구조체를 통과하는 관통부 주변", "imgCaption": "배관 관통부와 주변 마감 상태"},
    {"h": "보수용 부속 배치", "p": "배수구 크기와 위치에 맞춰 테두리 보수용 부속을 놓았습니다. 부속이 배수구 중심에 맞춰진 상태를 작업 중 기록으로 남겼습니다.", "img": "assets/cases/apartment-upper-lower-rain-pipe-repair-3.jpg", "imgAlt": "배수구 테두리에 놓은 보수용 부속", "imgCaption": "배수구 위치에 맞춘 보수용 부속"},
    {"h": "테두리 보수재 도포", "p": "배수구 테두리와 부속 주변에 보수재를 도포했습니다. 물이 지나가는 내부를 막지 않으면서 가장자리 작업 범위가 보이도록 촬영했습니다.", "img": "assets/cases/apartment-upper-lower-rain-pipe-repair-4.jpg", "imgAlt": "배수구 테두리와 부속 주변에 도포한 보수재", "imgCaption": "배수구 테두리 보수재 도포 상태"},
    {"h": "작업 후 상태를 남겼습니다", "p": "작업 후에는 정리된 배수구 테두리와 내부 상태를 표지 사진으로 남겼습니다. 특정 세대 정보는 공개하지 않고 상·하층 우수관 보수라는 실제 작업 범위만 기록합니다."}
  ]
},
{
  "slug": "apartment-basement-cast-iron-pipe-repair",
  "title": "대전 아파트 지하실 주철관 보수 — 부식 구간부터 슬리브 마감까지",
  "category": "방수·설비",
  "service": "leak",
  "date": "2026-08-26",
  "readMin": 3,
  "cover": "#59686d",
  "image": "assets/cases/apartment-basement-cast-iron-pipe-repair-cover.jpg",
  "imageAlt": "지하실 주철관 두 라인에 슬리브 보수를 마친 상태",
  "excerpt": "지하실 주철관의 관벽이 부식돼 파손된 상태를 확인하고 손상 구간에 보수 슬리브를 설치한 현장입니다. 보수 전 내부 상태부터 두 배관 라인의 작업 후 모습까지 실제 사진으로 남겼습니다.",
  "body": [
    {"h": "관벽이 파손된 기존 상태", "p": "지하실 주철관의 겉면과 관벽이 부식돼 벌어진 구간이 보였습니다. 먼저 손상 부위의 크기와 주변 배관 상태가 함께 보이도록 작업 전 사진을 남겼습니다.", "img": "assets/cases/apartment-basement-cast-iron-pipe-repair-1.jpg", "imgAlt": "부식으로 관벽이 벌어진 기존 지하실 주철관", "imgCaption": "부식으로 관벽이 파손된 기존 주철관"},
    {"h": "절개된 관 내부 확인", "p": "노후 주철관을 가까이에서 촬영해 관 안쪽과 절개된 가장자리 상태를 확인했습니다. 겉면만으로는 보기 어려운 내부 부식 상태가 사진에 남아 있습니다.", "img": "assets/cases/apartment-basement-cast-iron-pipe-repair-2.jpg", "imgAlt": "절개된 노후 주철관 안쪽과 주변 배관", "imgCaption": "절개된 노후 주철관 내부 상태"},
    {"h": "보수 슬리브 설치", "p": "확인한 구간에는 주철관을 감싸는 보수 슬리브를 설치했습니다. 슬리브가 손상 구간을 덮고 양쪽 배관과 이어진 상태를 작업 중 사진으로 기록했습니다.", "img": "assets/cases/apartment-basement-cast-iron-pipe-repair-3.jpg", "imgAlt": "손상된 주철관 구간에 설치한 보수 슬리브", "imgCaption": "주철관 손상 구간의 보수 슬리브"},
    {"h": "두 배관 라인의 연결부 고정", "p": "나란히 지나가는 두 배관 구간의 슬리브와 연결부를 각각 고정했습니다. 어느 위치를 손봤는지 구분할 수 있도록 두 라인이 한 화면에 보이게 남겼습니다.", "img": "assets/cases/apartment-basement-cast-iron-pipe-repair-4.jpg", "imgAlt": "두 주철관 라인에 고정한 슬리브 연결부", "imgCaption": "두 배관 라인의 슬리브 연결부 고정"},
    {"h": "작업 후 연결 상태", "p": "마지막으로 보수 구간의 연결부와 주변 배관을 다시 촬영했습니다. 사진에서 확인되는 마감 상태를 기록하며, 원장에 없는 원인이나 시험 결과는 별도로 단정하지 않습니다.", "img": "assets/cases/apartment-basement-cast-iron-pipe-repair-5.jpg", "imgAlt": "주철관 보수 구간의 작업 후 연결부", "imgCaption": "보수 후 연결부와 주변 배관 상태"}
  ]
}
```

- [ ] **Step 4: Regenerate static posts, blog list, and RSS**

Run:

```powershell
& 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts/prerender-posts.py
```

Expected: all published posts are generated, `blog.html` list count increases by 3, and `rss.xml` includes the new slugs.

- [ ] **Step 5: Update `sitemap.xml`**

Change the `blog.html` entry `lastmod` to `2026-08-29`. Add these exact entries with `changefreq monthly` and `priority 0.7`:

```xml
  <url>
    <loc>https://01023978629.github.io/manmool/posts/apartment-balcony-rain-pipe-replacement.html</loc>
    <lastmod>2026-08-28</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://01023978629.github.io/manmool/posts/apartment-upper-lower-rain-pipe-repair.html</loc>
    <lastmod>2026-08-28</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://01023978629.github.io/manmool/posts/apartment-basement-cast-iron-pipe-repair.html</loc>
    <lastmod>2026-08-26</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
```

- [ ] **Step 6: Run focused and repository checks**

Run:

```powershell
$node = 'C:\Users\1dncj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node scripts/ensure-weekly-leak-cases.mjs
& $node scripts/ensure-site-integrity.mjs
& $node scripts/ensure-conversion-basics.mjs
& $node scripts/new-case-post.test.mjs
```

Expected: all pass with pristine output.

- [ ] **Step 7: Commit Task 2**

```powershell
git add scripts/ensure-weekly-leak-cases.mjs data/site.json sitemap.xml blog.html rss.xml posts/apartment-*.html
git commit -m "feat: add three weekly leak field cases"
```

---

## Final verification after both tasks

1. Run every `scripts/ensure-*.mjs`; normalize `office-api.json` through the existing configurator first on Windows, then build `_site` before `ensure-pages-artifact.mjs`.
2. Run `scripts/new-case-post.test.mjs` and the existing Node tests referenced by `.github/workflows/deploy-pages.yml`.
3. Build and verify the Pages allowlist artifact, then remove only the generated `_site` directory after validating its absolute path is inside this worktree.
4. Serve the worktree locally and capture desktop plus 390×844 mobile screenshots of `blog.html` and all three new posts.
5. Verify the three generated pages show the correct title, 6/4/5 actual photos, readable captions, and leak inquiry CTA without exposing project names, units, or GPS metadata.
6. Stop before push, PR, merge, or deployment and present the exact local result for approval.
