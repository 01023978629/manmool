import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_PATH = path.join(ROOT, 'data', 'site.json');
const TARGET_PER_SPACE = 30;
const CACHE_VERSION = '20260723-space30';

const SPACE_ORDER = ['거실', '침실', '주방', '욕실', '현관', '서재', '아이방', '드레스룸'];
const SPACE_SLUGS = {
  '거실': 'living',
  '침실': 'bedroom',
  '주방': 'kitchen',
  '욕실': 'bathroom',
  '현관': 'entry',
  '서재': 'study',
  '아이방': 'kids',
  '드레스룸': 'dressing'
};

const AREA_BINS = [
  { id: '10-19', area: 18, min: 1, max: 20 },
  { id: '20-29', area: 24, min: 20, max: 30 },
  { id: '30-39', area: 34, min: 30, max: 40 },
  { id: '40-49', area: 42, min: 40, max: 50 },
  { id: '50+', area: 52, min: 50, max: 501 }
];

const SPACE_LAYOUTS = {
  '거실': ['창가 라운지 거실', '미디어월 거실', '다이닝 연계 거실', '수납 벽 거실', '패밀리 라운지', '갤러리월 거실', '홈시네마 거실', '라운드 가구 거실', '오픈 플랜 거실', '소파 중심 거실', '베이 윈도 거실', '테라스 연계 거실', '리딩 코너 거실', '플렉스 거실', '낮은 가구 거실'],
  '침실': ['헤드월 침실', '호텔형 침실', '붙박이장 침실', '창가 벤치 침실', '워크존 침실', '평상 수납 침실', '파우더 연계 침실', '슬라이딩 수납 침실', '간접조명 침실', '부티크 침실', '패브릭 침실', '오픈 드레스 침실', '컴팩트 침실', '라운지 침실', '테라스 침실'],
  '주방': ['대면형 아일랜드 주방', 'ㄱ자형 주방', 'ㄷ자형 주방', '갤리형 주방', '팬트리 연계 주방', '다이닝 통합 주방', '창가 조리대 주방', '카페형 주방', '투톤 주방', '히든 수납 주방', '슬림 아일랜드 주방', '패밀리 주방', '오픈 선반 주방', '세컨드 주방', '홈바 연계 주방'],
  '욕실': ['워크인 샤워 욕실', '건식 세면 욕실', '파우더 연계 욕실', '조적 욕조 욕실', '호텔형 욕실', '컴팩트 욕실', '스파 욕실', '반건식 욕실', '세면 분리 욕실', '부부 욕실', '패밀리 욕실', '젠다이 수납 욕실', '코너 샤워 욕실', '프레임리스 욕실', '테라조 욕실'],
  '현관': ['벤치 수납 현관', '아치 중문 현관', '격자 중문 현관', '전신거울 현관', '오픈 선반 현관', '팬트리 연계 현관', '슬림 수납 현관', '파티션 현관', '갤러리 현관', '신발장 통합 현관', '외투 수납 현관', '반개방 현관', '라운드 중문 현관', '센서 조명 현관', '컴팩트 현관'],
  '서재': ['창가 데스크 서재', '벽면 책장 서재', '라이브러리 서재', '폴딩 데스크 서재', '티룸 겸용 서재', '듀얼 데스크 서재', '집중형 서재', '라운지 서재', '슬라이딩 서재', '갤러리 서재', '미디어 서재', '코너 데스크 서재', '오픈 책장 서재', '취미 작업실', '컴팩트 홈오피스'],
  '아이방': ['성장형 수납 아이방', '창가 책상 아이방', '놀이 학습 아이방', '평상 침대 아이방', '모듈 가구 아이방', '2인 아이방', '벙커 침대 아이방', '독서 코너 아이방', '컬러 포인트 아이방', '라운드 수납 아이방', '오픈 놀이 아이방', '슬라이딩 수납 아이방', '미술 놀이 아이방', '컴팩트 아이방', '패밀리 학습방'],
  '드레스룸': ['워크인 드레스룸', '오픈 시스템 드레스룸', '유리장 드레스룸', '파우더 연계 드레스룸', '아일랜드 드레스룸', '슬라이딩 드레스룸', '세탁 연계 드레스룸', '컴팩트 드레스룸', 'ㄱ자 드레스룸', '양면 수납 드레스룸', '부티크 드레스룸', '슈즈 수납 드레스룸', '미러 드레스룸', '모듈 드레스룸', '히든 드레스룸']
};

const SPACE_GUIDANCE = {
  '거실': '소파와 창 사이의 주동선을 비우고 TV 시청거리와 조명 눈부심을 함께 확인하세요.',
  '침실': '침대 양옆 통로와 문 여닫이 간섭을 확인한 뒤 콘센트와 조명 위치를 확정하세요.',
  '주방': '조리대 사이 통로를 충분히 확보하고 냉장고·싱크·쿡탑의 작업 동선을 먼저 맞추세요.',
  '욕실': '배수구 위치와 바닥 높이를 실측한 뒤 논슬립 타일과 물매 방향을 확정하세요.',
  '현관': '중문 유효 폭과 신발장 문 간섭을 확인하고 자주 쓰는 수납을 손이 닿는 높이에 두세요.',
  '서재': '책상 눈부심과 의자 뒤 통로를 확인하고 책장 깊이는 보관할 물품에 맞춰 정하세요.',
  '아이방': '가구 모서리와 전도 방지를 우선하고 성장 후 재배치할 수 있는 빈 바닥을 남겨두세요.',
  '드레스룸': '행거 깊이와 서랍 인출 공간을 확인하고 습기 배출을 위한 환기 동선을 확보하세요.'
};

const PHOTO_POSITIONS = ['50% 50%', '42% 50%', '58% 50%', '50% 42%', '50% 58%', '35% 50%', '65% 50%'];
const PHOTO_SCALES = [1, 1.025, 1.05, 1.075];

function plainPhoto(photo) {
  return String(photo || '').split('?')[0];
}

function binForArea(area) {
  return AREA_BINS.find((bin) => Number(area) >= bin.min && Number(area) < bin.max);
}

function budgetForArea(area) {
  if (area < 20) return '3천만원 이하';
  if (area < 30) return '3천~5천만원';
  if (area < 40) return '5천~8천만원';
  return '8천만원 이상';
}

function tilePlanFor(spaceType) {
  if (spaceType === '욕실') {
    return [
      { label: '벽', value: '600x1200mm 무광 포세린' },
      { label: '바닥', value: '300x300mm 논슬립 포세린' },
      { label: '줄눈', value: '2mm 중간 톤 내오염 줄눈' },
      { label: '배수', value: '배수구 방향 1/100~1/50 물매' }
    ];
  }
  if (spaceType === '주방') {
    return [
      { label: '조리대 벽', value: '600x600mm 무광 포세린' },
      { label: '줄눈', value: '2mm 내오염 줄눈' }
    ];
  }
  if (spaceType === '현관') {
    return [
      { label: '바닥', value: '600x600mm 미끄럼 저항 포세린' },
      { label: '줄눈', value: '2mm 중간 톤 내오염 줄눈' }
    ];
  }
  return null;
}

function validate(site) {
  const errors = [];
  const ids = new Set();

  for (const item of site.portfolio) {
    if (ids.has(item.id)) errors.push(`${item.id}: 중복 ID`);
    ids.add(item.id);
    const photo = plainPhoto(item.photo);
    if (!photo || !fs.existsSync(path.join(ROOT, photo))) errors.push(`${item.id}: 이미지 파일 없음 (${photo || '빈 경로'})`);
  }

  for (const space of SPACE_ORDER) {
    const list = site.portfolio.filter((item) => item.spaceType === space);
    if (list.length !== TARGET_PER_SPACE) errors.push(`${space}: ${list.length}건 (목표 ${TARGET_PER_SPACE}건)`);
    if (new Set(list.map((item) => item.style)).size < 8) errors.push(`${space}: 스타일 구성이 8종 미만`);
  }

  if (errors.length) throw new Error(`공간별 카탈로그 검증 실패\n- ${errors.join('\n- ')}`);
}

const raw = fs.readFileSync(SITE_PATH, 'utf8');
const site = JSON.parse(raw);
const styles = site.portfolioFilters.style || [];
const items = [...site.portfolio];
const existingTitles = new Set(items.map((item) => item.title));
const styleTemplates = new Map(styles.map((style) => [style, items.find((item) => item.style === style)]));
const globalStyleCounts = new Map(styles.map((style) => [style, items.filter((item) => item.style === style).length]));
const additions = [];

for (const space of SPACE_ORDER) {
  const current = items.filter((item) => item.spaceType === space);
  if (current.length > TARGET_PER_SPACE) throw new Error(`${space} 사례가 목표보다 많습니다: ${current.length}건`);

  const photoPool = [...new Set(current.map((item) => plainPhoto(item.photo)).filter(Boolean))]
    .filter((photo) => fs.existsSync(path.join(ROOT, photo)));
  if (!photoPool.length) throw new Error(`${space}: 사용할 로컬 이미지가 없습니다.`);

  const styleCounts = new Map(styles.map((style) => [style, current.filter((item) => item.style === style).length]));
  const areaCounts = new Map(AREA_BINS.map((bin) => [bin.id, current.filter((item) => binForArea(item.area)?.id === bin.id).length]));
  const needed = TARGET_PER_SPACE - current.length;

  for (let index = 0; index < needed; index += 1) {
    const sequence = current.length + index + 1;
    const style = [...styles].sort((a, b) =>
      styleCounts.get(a) - styleCounts.get(b) ||
      globalStyleCounts.get(a) - globalStyleCounts.get(b) ||
      styles.indexOf(a) - styles.indexOf(b))[0];
    const minAreaCount = Math.min(...areaCounts.values());
    const areaCandidates = AREA_BINS.filter((bin) => areaCounts.get(bin.id) === minAreaCount);
    const bin = areaCandidates[(sequence + styles.indexOf(style)) % areaCandidates.length];
    const layouts = SPACE_LAYOUTS[space];
    const layout = layouts[(sequence - 1) % layouts.length];
    let title = `${style} ${layout}`;
    if (existingTitles.has(title)) title = `${title} ${sequence}`;

    const photo = photoPool[(sequence - 1) % photoPool.length];
    const sourceItem = items.find((item) => plainPhoto(item.photo) === photo) || current[0];
    const styleTemplate = styleTemplates.get(style) || sourceItem;
    const materialsTemplate = items.find((item) => item.spaceType === space && item.style === style) || sourceItem;
    const tilePlan = tilePlanFor(space);
    const item = {
      id: `design-${CACHE_VERSION}-${SPACE_SLUGS[space]}-${String(sequence).padStart(2, '0')}`,
      title,
      category: 'AI추천',
      spaceType: space,
      structure: layout,
      area: bin.area,
      budget: budgetForArea(bin.area),
      style,
      mood: styleTemplate?.mood || `${style} 감성의 편안한`,
      palette: styleTemplate?.palette || ['#ece8e1', '#c7b59e', '#8b7a67', '#6d7b72'],
      materials: (materialsTemplate?.materials || styleTemplate?.materials || []).slice(0, 4),
      tip: SPACE_GUIDANCE[space],
      trendLabel: `${bin.area}평 ${style} ${space} · 추천 ${sequence}`,
      trendNote: `${space}의 실제 동선 기준과 ${style} 색감을 조합한 AI 추천 참고 시안입니다. 자재와 치수는 현장 실측 후 확정합니다.`,
      photo: `${photo}?v=${CACHE_VERSION}-${String(sequence).padStart(2, '0')}`,
      photoPosition: PHOTO_POSITIONS[(sequence - 1) % PHOTO_POSITIONS.length],
      photoScale: PHOTO_SCALES[(sequence - 1) % PHOTO_SCALES.length],
      photoMirror: sequence % 6 === 0,
      imageAlt: `${title} ${space} 인테리어 AI 추천 이미지`,
      aiDesign: true,
      catalogBatch: '2026-07-23-space30'
    };

    if (tilePlan) item.tilePlan = tilePlan;
    if (space === '욕실') {
      item.tileNote = '벽 대형 타일은 바탕 평활도를 먼저 확인하고, 바닥은 300각 이하 논슬립 타일로 배수 물매와 재단선을 확보합니다.';
    }
    if (sourceItem?.imageCredit && sourceItem?.imageSource) {
      item.imageCredit = sourceItem.imageCredit;
      item.imageSource = sourceItem.imageSource;
    }

    additions.push(item);
    items.push(item);
    existingTitles.add(title);
    styleCounts.set(style, styleCounts.get(style) + 1);
    globalStyleCounts.set(style, globalStyleCounts.get(style) + 1);
    areaCounts.set(bin.id, areaCounts.get(bin.id) + 1);
  }
}

if (additions.length) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const marker = /\r?\n  \],\r?\n  "reviews":/g;
  const matches = [...raw.matchAll(marker)];
  const match = matches[matches.length - 1];
  if (!match) throw new Error('portfolio 배열의 끝 위치를 찾지 못했습니다.');

  const serialized = additions
    .map((item) => JSON.stringify(item, null, 2).split('\n').map((line) => `    ${line}`).join(eol))
    .join(`,${eol}`);
  const next = `${raw.slice(0, match.index)},${eol}${serialized}${raw.slice(match.index)}`;
  const nextSite = JSON.parse(next);
  validate(nextSite);
  fs.writeFileSync(SITE_PATH, next, 'utf8');
  console.log(`추가 완료: ${additions.length}건, 총 ${nextSite.portfolio.length}건`);
} else {
  validate(site);
  console.log(`추가 불필요: 총 ${site.portfolio.length}건이 기준을 충족합니다.`);
}

const finalItems = additions.length ? items : site.portfolio;
console.table(SPACE_ORDER.map((space) => {
  const list = finalItems.filter((item) => item.spaceType === space);
  return {
    공간: space,
    사례: list.length,
    스타일: new Set(list.map((item) => item.style)).size,
    평수구간: new Set(list.map((item) => binForArea(item.area)?.id)).size,
    원본이미지: new Set(list.map((item) => plainPhoto(item.photo))).size
  };
}));
