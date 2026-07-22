import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_PATH = path.join(ROOT, 'data', 'site.json');
const TARGET_PER_STYLE = 10;
const CACHE_VERSION = '20260723-catalog110';

const AREA_BINS = [
  { id: '10-19', label: '10~19평', area: 18, min: 1, max: 20 },
  { id: '20-29', label: '20~29평', area: 24, min: 20, max: 30 },
  { id: '30-39', label: '30~39평', area: 34, min: 30, max: 40 },
  { id: '40-49', label: '40~49평', area: 42, min: 40, max: 50 },
  { id: '50+', label: '50평 이상', area: 52, min: 50, max: 501 }
];

const STYLE_SLUGS = {
  '미니멀': 'minimal',
  '내추럴': 'natural',
  '북유럽': 'scandi',
  '모던': 'modern',
  '인더스트리얼': 'industrial',
  '빈티지': 'vintage',
  '웜 베이지': 'warm-beige',
  '프렌치': 'french',
  '호텔식': 'hotel',
  '재팬디': 'japandi',
  '스마트 수납': 'smart-storage'
};

const STYLE_COMPATIBILITY = {
  '미니멀': ['모던', '웜 베이지', '내추럴', '재팬디'],
  '내추럴': ['재팬디', '북유럽', '웜 베이지', '미니멀'],
  '북유럽': ['내추럴', '스마트 수납', '웜 베이지', '미니멀'],
  '모던': ['미니멀', '호텔식', '인더스트리얼', '웜 베이지'],
  '인더스트리얼': ['모던', '빈티지', '호텔식', '미니멀'],
  '빈티지': ['프렌치', '인더스트리얼', '호텔식', '웜 베이지'],
  '웜 베이지': ['호텔식', '내추럴', '미니멀', '프렌치'],
  '프렌치': ['빈티지', '호텔식', '웜 베이지', '내추럴'],
  '호텔식': ['모던', '웜 베이지', '프렌치', '미니멀'],
  '재팬디': ['내추럴', '미니멀', '웜 베이지', '북유럽'],
  '스마트 수납': ['북유럽', '미니멀', '모던', '내추럴']
};

const STYLE_PALETTES = {
  '미니멀': ['#f2f0eb', '#d9d4cb', '#b99b70', '#7e8d81'],
  '내추럴': ['#eee6d8', '#c9a477', '#8e714f', '#78866b'],
  '북유럽': ['#f0f1ef', '#c5d2d1', '#d0aa72', '#607789'],
  '모던': ['#e6e3dd', '#9a9994', '#34383a', '#b38d65'],
  '인더스트리얼': ['#d2cec7', '#77736d', '#2f3335', '#8a5f43'],
  '빈티지': ['#e7d8c6', '#9c6b52', '#566452', '#c4a15d'],
  '웜 베이지': ['#eee7dc', '#c9b49b', '#9a816b', '#d4c3ad'],
  '프렌치': ['#f0e9df', '#c7b5a6', '#879781', '#b58d70'],
  '호텔식': ['#dfd8cf', '#9a8169', '#313235', '#b99b68'],
  '재팬디': ['#e9e1d3', '#bc9d73', '#6f7668', '#4f4338'],
  '스마트 수납': ['#ececea', '#aeb8b5', '#6d7d83', '#bc9168']
};

const STYLE_ACCENTS = {
  '미니멀': ['무광 화이트 마감', '라인리스 간접조명'],
  '내추럴': ['오크 무늬목 마감', '린넨·라탄 패브릭'],
  '북유럽': ['애쉬 우드 마감', '저채도 패브릭 포인트'],
  '모던': ['웜그레이 무광 마감', '블랙 메탈 프레임'],
  '인더스트리얼': ['콘크리트 질감 도장', '블랙 스틸 프레임'],
  '빈티지': ['월넛 우드 마감', '브러시드 브라스 하드웨어'],
  '웜 베이지': ['샌드 베이지 텍스처', '부클 패브릭'],
  '프렌치': ['클래식 몰딩', '세이지·웜화이트 도장'],
  '호텔식': ['월넛 패널 마감', '브러시드 브라스 조명'],
  '재팬디': ['오크 격자 무늬목', '미장 질감 도장'],
  '스마트 수납': ['모듈 시스템 수납', '센서 연동 간접조명']
};

const SPACE_MATERIALS = {
  '거실': ['내오염 실크벽지', '광폭 오크 강마루', '매입등·간접조명'],
  '침실': ['친환경 실크벽지', '내추럴 오크 강마루', '붙박이장·헤드월'],
  '주방': ['무광 PET 주방 도어', '20T 엔지니어드스톤 상판', '600x600mm 포세린 벽타일'],
  '욕실': ['600x1200mm 포세린 벽타일', '300x300mm 논슬립 바닥타일', '8T 강화유리 파티션'],
  '현관': ['600x600mm 논슬립 포세린 타일', '슬림 현관 수납장', '하부 센서 조명'],
  '서재': ['내오염 실크벽지', '내추럴 오크 강마루', '맞춤 책장·데스크'],
  '아이방': ['친환경 포인트 벽지', '내추럴 오크 강마루', '성장형 모듈 수납'],
  '드레스룸': ['친환경 실크벽지', '내추럴 오크 강마루', '오픈 시스템장·서랍']
};

// 기존 사례와 겹치지 않는 추가 콘셉트입니다. 필요한 수만큼 순서대로 사용합니다.
const CONCEPTS = {
  '미니멀': [
    ['라인리스 화이트 현관', '현관', '일자 수납형 현관', '맑고 간결한', '바닥 줄눈과 수납장 라인을 맞추면 작은 현관도 한 면처럼 정돈되어 보입니다.'],
    ['무몰딩 플랫폼 침실', '침실', '평상형 수납 침실', '고요하고 정돈된', '침대 프레임과 협탁 높이를 통일하고 상부 조명은 벽 세척광으로 계획하세요.'],
    ['화이트 큐브 서재', '서재', '벽면 데스크형 서재', '집중감 있고 밝은', '책장 깊이를 300mm 안팎으로 제한하면 통로를 유지하면서 수납량을 확보할 수 있습니다.'],
    ['슬림 수납 아이방', '아이방', '한쪽 벽 수납형', '가볍고 실용적인', '수납은 한 벽에 모으고 가변형 책상을 두어 성장에 따라 빈 바닥을 유연하게 쓰세요.'],
    ['건식 라인 욕실', '욕실', '세면·샤워 분리형', '깨끗하고 차분한', '세면대와 거울 선을 맞추고 샤워 바닥은 작은 규격 타일로 물매를 안정적으로 잡습니다.'],
    ['오픈 다이닝 미니멀 거실', '거실', '거실·다이닝 통합형', '여유롭고 정갈한', '낮은 가구와 한 가지 목재 톤을 반복해 시선이 창까지 끊기지 않게 계획하세요.']
  ],
  '내추럴': [
    ['오크 라운지 거실', '거실', '창가 라운지형 거실', '따뜻하고 편안한', '창가에는 낮은 벤치를 두고 오크와 패브릭의 명도를 맞추면 채광이 부드럽게 퍼집니다.'],
    ['린넨 휴식 침실', '침실', '호텔형 침실', '포근하고 자연스러운', '헤드월은 무늬목과 린넨을 반반 사용해 따뜻함은 살리고 답답함은 줄이세요.'],
    ['내추럴 베이 주방', '주방', 'ㄱ자형 주방', '밝고 생활감 있는', '우드 도어는 조리대 아래에 집중하고 상부장은 밝게 두면 관리성과 개방감이 함께 좋아집니다.'],
    ['라탄 독서 아이방', '아이방', '창가 독서형 아이방', '부드럽고 즐거운', '창가 벤치 아래를 서랍으로 만들고 라탄 바구니는 손이 닿는 낮은 칸에 배치하세요.']
  ],
  '북유럽': [
    ['애쉬 톤 패밀리 거실', '거실', '가족 중심 거실', '밝고 아늑한', '애쉬 우드와 회청색 패브릭을 반복하고 중앙에는 넉넉한 놀이 동선을 남겨두세요.'],
    ['파스텔 블루 주방', '주방', '아일랜드형 주방', '산뜻하고 실용적인', '파스텔 도어는 하부장에만 적용하고 상판과 벽은 무채색으로 정리하면 오래 보아도 편안합니다.'],
    ['스칸디 라이트 욕실', '욕실', '컴팩트 건식 욕실', '맑고 편안한', '밝은 벽타일과 우드 하부장을 조합하되 샤워 바닥에는 논슬립 타일을 별도로 적용하세요.'],
    ['창가 데스크 침실', '침실', '워크존 통합형 침실', '차분하고 효율적인', '책상은 창과 직각으로 두어 눈부심을 줄이고 침대와 같은 목재 톤으로 연결하세요.'],
    ['컬러 블록 아이방', '아이방', '놀이·학습 분리형', '명랑하고 정돈된', '색은 수납 도어 일부에만 사용하고 가구 모듈을 통일해 산만함을 줄이세요.'],
    ['화이트 애쉬 현관', '현관', '벤치 수납형 현관', '환하고 실용적인', '신발장 하부를 띄워 자주 신는 신발을 넣고 벤치 옆에는 외투 수납을 확보하세요.']
  ],
  '모던': [
    ['모노톤 아일랜드 주방', '주방', '대면형 아일랜드 주방', '도시적이고 정교한', '아일랜드 통로를 1000mm 이상 확보하고 블랙 포인트는 손잡이와 조명에만 반복하세요.'],
    ['프레임리스 모던 침실', '침실', '호텔형 침실', '절제되고 고급스러운', '문선과 붙박이장 손잡이를 숨기고 헤드월 간접등으로 깊이를 더하면 면 구성이 선명해집니다.'],
    ['라인 조명 미디어 거실', '거실', '미디어월 중심 거실', '선명하고 안정적인', 'TV 벽과 천장 조명의 중심선을 맞추고 반사광이 화면에 직접 닿지 않도록 각도를 조정하세요.']
  ],
  '인더스트리얼': [
    ['콘크리트 갤러리 거실', '거실', '오픈 갤러리형 거실', '거칠고 세련된', '콘크리트 질감은 한 면에만 쓰고 따뜻한 목재와 패브릭으로 잔향과 냉기를 보완하세요.'],
    ['블랙 프레임 로프트 주방', '주방', '아일랜드형 주방', '강렬하고 실용적인', '블랙 프레임은 상부 선반과 조명에 반복하고 조리대는 밝게 두어 작업성을 확보하세요.'],
    ['브릭 포인트 침실', '침실', '독립형 침실', '빈티지하고 안정적인', '벽돌 질감은 헤드월 한 면에 제한하고 침구와 커튼은 무채색으로 균형을 맞추세요.'],
    ['메탈 그리드 현관', '현관', '파티션 수납형 현관', '단단하고 정돈된', '스틸 파티션 간격은 안전성을 먼저 확인하고 하부 수납에는 먼지 청소 공간을 남기세요.'],
    ['다크 타일 샤워 욕실', '욕실', '워크인 샤워형', '차분하고 묵직한', '어두운 타일일수록 물자국이 보여 무광 표면과 중간 톤 줄눈을 선택하는 것이 관리에 유리합니다.'],
    ['메탈 프레임 드레스룸', '드레스룸', '오픈 시스템장형', '기능적이고 선명한', '행거 모듈을 600mm 단위로 계획하고 천장 고정 위치는 구조체를 확인한 뒤 확정하세요.']
  ],
  '빈티지': [
    ['월넛 미드센추리 거실', '거실', '다이닝 연계형 거실', '깊고 따뜻한', '월넛 가구의 비중을 낮추고 벽과 커튼을 밝게 두면 중후함과 개방감을 함께 살릴 수 있습니다.'],
    ['브라스 포인트 주방', '주방', 'ㄱ자형 주방', '개성 있고 우아한', '브라스는 손잡이와 펜던트에 제한하고 물이 닿는 부위는 관리가 쉬운 마감을 선택하세요.'],
    ['플로럴 부티크 침실', '침실', '부티크 호텔형 침실', '화사하고 포근한', '패턴 벽지는 헤드월에만 적용하고 나머지 면은 패턴의 가장 밝은 색으로 연결하세요.'],
    ['체크 타일 욕실', '욕실', '컴팩트 욕실', '경쾌하고 복고적인', '체커보드 바닥은 배수구와 문턱 중심선을 먼저 잡아 가장자리 조각이 지나치게 작아지지 않게 합니다.'],
    ['레코드 라이브러리 서재', '서재', '벽면 라이브러리형', '취향 있고 아늑한', '음반 수납 깊이와 오디오 환기 공간을 확보하고 청취 위치는 좌우 스피커 중심에 맞추세요.'],
    ['세이지 클래식 현관', '현관', '아치 중문형 현관', '부드럽고 환영하는', '아치 중문은 유효 폭과 손잡이 간섭을 먼저 확인하고 세이지 색은 수납장과 연결하세요.'],
    ['컬러 캐비닛 아이방', '아이방', '모듈 수납형 아이방', '명랑하고 개성 있는', '빈티지 색은 교체 가능한 도어와 패브릭에 적용해 성장 후에도 쉽게 분위기를 바꿀 수 있게 하세요.']
  ],
  '웜 베이지': [
    ['샌드 톤 패밀리 거실', '거실', '가족 중심 거실', '포근하고 여유로운', '베이지는 벽과 큰 가구에, 짙은 우드는 작은 가구에 사용해 공간이 흐릿해지지 않게 중심을 잡으세요.'],
    ['토프 아일랜드 주방', '주방', '대면형 아일랜드 주방', '차분하고 부드러운', '토프 도어와 상판의 명도 차를 두고 조리대 조명은 연색성이 높은 제품으로 선택하세요.'],
    ['부클 헤드월 침실', '침실', '헤드월 수납형 침실', '포근하고 고급스러운', '부클 패브릭은 오염 관리가 쉬운 탈착형 패널로 계획하고 콘센트 위치를 먼저 확정하세요.'],
    ['크림 스톤 욕실', '욕실', '세면·샤워 분리형', '따뜻하고 깨끗한', '크림 타일은 실제 조명 아래서 샘플을 확인하고 바닥은 같은 색의 논슬립 소형 규격을 사용하세요.'],
    ['베이지 홈오피스 서재', '서재', '창가 데스크형 서재', '차분하고 집중되는', '벽과 책장은 비슷한 톤으로 정리하고 작업등만 조금 짙게 선택해 시선의 중심을 만드세요.'],
    ['웜 뉴트럴 현관', '현관', '벤치·전신거울형 현관', '환하고 단정한', '거울 맞은편을 밝게 비우고 벤치 하부에 로봇청소기와 신발 수납을 함께 계획하세요.'],
    ['라운드 수납 아이방', '아이방', '코너 수납형 아이방', '부드럽고 안전한', '돌출 모서리는 라운드 처리하고 자주 쓰는 수납은 아이 눈높이 아래에 배치하세요.']
  ],
  '프렌치': [
    ['파리지앵 몰딩 거실', '거실', '살롱형 거실', '우아하고 밝은', '몰딩 간격은 가구 배치와 콘센트 위치를 반영하고 작은 벽에는 패널 수를 줄이세요.'],
    ['세이지 셰이커 주방', '주방', 'ㄷ자형 주방', '산뜻하고 클래식한', '셰이커 도어 홈은 오염 관리가 쉬운 깊이로 선택하고 상판은 단순한 패턴으로 균형을 맞추세요.'],
    ['부티크 패널 침실', '침실', '호텔형 침실', '섬세하고 포근한', '패널 몰딩과 헤드보드 폭을 맞추고 조명은 좌우 대칭으로 배치해 안정감을 만드세요.'],
    ['클래식 타일 욕실', '욕실', '건식 세면 분리형', '정갈하고 로맨틱한', '벽의 작은 유약 타일과 바닥 논슬립 타일을 구분하고 금속 마감 색은 한 가지로 통일하세요.'],
    ['아치 책장 서재', '서재', '아치 빌트인 책장형', '차분하고 품격 있는', '아치 상단은 책보다 장식용으로 비우고 자주 쓰는 책은 손이 닿는 직선 구간에 배치하세요.'],
    ['체크 보드 현관', '현관', '콘솔 수납형 현관', '경쾌하고 고전적인', '체크 패턴은 현관 중심선에서 시작하고 문턱 주변에 작은 조각이 남지 않게 사전 배치하세요.'],
    ['라벤더 프렌치 아이방', '아이방', '창가 데스크형 아이방', '화사하고 부드러운', '라벤더는 벽 한 면과 패브릭에만 사용하고 가구는 웜화이트로 두어 성장 후 변경을 쉽게 하세요.']
  ],
  '호텔식': [
    ['월넛 헤드월 스위트 침실', '침실', '스위트형 침실', '깊고 편안한', '헤드월 조명은 누웠을 때 눈에 직접 보이지 않게 매입하고 양쪽 스위치를 독립 구성하세요.'],
    ['스톤 라운지 거실', '거실', '라운지형 대형 거실', '중후하고 여유로운', '대형 스톤 패턴은 베인 방향을 사전 배치하고 러그와 패브릭으로 소리를 흡수하세요.'],
    ['브라스 파우더 욕실', '욕실', '파우더·샤워 분리형', '화려하고 정교한', '브라스 수전은 동일 표면 마감으로 통일하고 물이 튀는 면에는 관리 가능한 코팅을 적용하세요.']
  ],
  '재팬디': [
    ['오크 다다미 라운지 거실', '거실', '좌식 라운지형 거실', '고요하고 자연스러운', '낮은 가구를 사용하되 무릎 높이와 청소 동선을 고려해 좌식 구간의 범위를 정하세요.'],
    ['쇼지 슬라이딩 침실', '침실', '슬라이딩 파티션형 침실', '은은하고 평온한', '반투명 파티션은 채광과 프라이버시를 함께 확인하고 하부 레일 청소가 쉬운 구조를 선택하세요.'],
    ['우드 블록 주방', '주방', '아일랜드형 주방', '절제되고 따뜻한', '무늬목 결 방향을 수평으로 연결하고 상판은 무채색 무광으로 두어 재료 수를 줄이세요.'],
    ['미장 스파 욕실', '욕실', '워크인 샤워형', '고요하고 편안한', '미장 질감은 방수층 위 전용 시스템으로 시공하고 바닥은 검증된 논슬립 타일을 사용하세요.'],
    ['선반형 차실 서재', '서재', '티룸 겸용 서재', '차분하고 집중되는', '낮은 선반과 작은 테이블을 중심으로 두고 수납은 문이 있는 하부장에 모아 시야를 비우세요.'],
    ['자작나무 재팬디 아이방', '아이방', '평상 수납형 아이방', '밝고 안정적인', '평상 높이는 낙상 위험을 줄이도록 낮추고 모서리와 서랍 손잡이는 매립형으로 계획하세요.'],
    ['정갈한 격자 현관', '현관', '격자 중문형 현관', '단정하고 환영하는', '격자 간격은 유리 안전성과 청소 편의를 고려하고 현관 폭이 좁으면 슬라이딩 방식을 선택하세요.']
  ],
  '스마트 수납': [
    ['월베드 스튜디오 거실', '거실', '월베드 가변형 거실', '유연하고 효율적인', '월베드 전면 동선을 비우고 잠금 장치와 벽체 고정 강도를 설치 전에 확인하세요.'],
    ['팬트리 연결 스마트 주방', '주방', '팬트리 연결형 주방', '정돈되고 실용적인', '식품과 소형가전 수납을 분리하고 팬트리 문이 주방 통로를 막지 않도록 여닫이 방향을 정하세요.'],
    ['브리지장 수납 침실', '침실', '브리지장형 침실', '차분하고 효율적인', '침대 상부장은 내진 고정하고 매일 쓰는 물건은 측면장 아래쪽에 배치해 안전하게 사용하세요.'],
    ['숨김 데스크 수납 서재', '서재', '폴딩 데스크형 서재', '집중되고 유연한', '폴딩 데스크를 닫았을 때 손잡이와 전선이 끼이지 않도록 여유 공간과 전원 위치를 먼저 계획하세요.'],
    ['슬라이딩 워크인 드레스룸', '드레스룸', '슬라이딩 파티션형', '정갈하고 기능적인', '파티션 이동 폭과 서랍 인출 공간이 겹치지 않게 평면에서 먼저 간섭을 확인하세요.']
  ]
};

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

function materialsFor(style, spaceType) {
  return [...(SPACE_MATERIALS[spaceType] || SPACE_MATERIALS['거실']), ...(STYLE_ACCENTS[style] || [])].slice(0, 4);
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
  const styles = site.portfolioFilters.style || [];

  for (const style of styles) {
    const list = site.portfolio.filter((item) => item.style === style);
    if (list.length !== TARGET_PER_STYLE) errors.push(`${style}: ${list.length}건 (목표 ${TARGET_PER_STYLE}건)`);
    const uniquePhotos = new Set(list.map((item) => plainPhoto(item.photo)));
    if (uniquePhotos.size < TARGET_PER_STYLE) errors.push(`${style}: 중복 없는 이미지 ${uniquePhotos.size}장`);
  }

  for (const bin of AREA_BINS) {
    const list = site.portfolio.filter((item) => binForArea(item.area)?.id === bin.id);
    if (list.length < TARGET_PER_STYLE) errors.push(`${bin.label}: ${list.length}건 (최소 ${TARGET_PER_STYLE}건)`);
    const uniquePhotos = new Set(list.map((item) => plainPhoto(item.photo)));
    if (uniquePhotos.size < TARGET_PER_STYLE) errors.push(`${bin.label}: 중복 없는 이미지 ${uniquePhotos.size}장`);
  }

  for (const item of site.portfolio) {
    const photo = plainPhoto(item.photo);
    if (!photo || !fs.existsSync(path.join(ROOT, photo))) errors.push(`${item.id}: 이미지 파일 없음 (${photo || '빈 경로'})`);
  }

  if (errors.length) throw new Error(`디자인 카탈로그 검증 실패\n- ${errors.join('\n- ')}`);
}

const raw = fs.readFileSync(SITE_PATH, 'utf8');
const site = JSON.parse(raw);
const styles = site.portfolioFilters.style || [];
const items = [...site.portfolio];
const photoMeta = new Map();

for (const item of items) {
  const photo = plainPhoto(item.photo);
  if (!photo || photoMeta.has(photo)) continue;
  photoMeta.set(photo, {
    spaceType: item.spaceType,
    style: item.style,
    imageAlt: item.imageAlt,
    imageCredit: item.imageCredit,
    imageSource: item.imageSource
  });
}

const allPhotos = [...photoMeta.keys()].filter((photo) => fs.existsSync(path.join(ROOT, photo)));
if (allPhotos.length < 40) throw new Error(`사용 가능한 로컬 디자인 이미지가 부족합니다: ${allPhotos.length}장`);

const globalBinCounts = new Map(AREA_BINS.map((bin) => [bin.id, 0]));
const usedByBin = new Map(AREA_BINS.map((bin) => [bin.id, new Set()]));
const usedByStyle = new Map(styles.map((style) => [style, new Set()]));
const styleBinCounts = new Map(styles.map((style) => [style, new Map(AREA_BINS.map((bin) => [bin.id, 0]))]));

for (const item of items) {
  const bin = binForArea(item.area);
  const photo = plainPhoto(item.photo);
  if (bin) {
    globalBinCounts.set(bin.id, globalBinCounts.get(bin.id) + 1);
    usedByBin.get(bin.id).add(photo);
    if (styleBinCounts.has(item.style)) {
      const counts = styleBinCounts.get(item.style);
      counts.set(bin.id, counts.get(bin.id) + 1);
    }
  }
  if (usedByStyle.has(item.style)) usedByStyle.get(item.style).add(photo);
}

function chooseArea(style) {
  const counts = styleBinCounts.get(style);
  return [...AREA_BINS].sort((a, b) => {
    const aScore = counts.get(a.id) * 1000 + globalBinCounts.get(a.id);
    const bScore = counts.get(b.id) * 1000 + globalBinCounts.get(b.id);
    return aScore - bScore || a.min - b.min;
  })[0];
}

function choosePhoto(style, spaceType, binId) {
  const styleUsed = usedByStyle.get(style);
  const binUsed = usedByBin.get(binId);
  const candidates = allPhotos.filter((photo) => !styleUsed.has(photo));
  if (!candidates.length) throw new Error(`${style}: 중복 없는 이미지를 선택할 수 없습니다.`);

  const compatible = STYLE_COMPATIBILITY[style] || [];
  return candidates
    .map((photo) => {
      const meta = photoMeta.get(photo) || {};
      const compatibilityIndex = compatible.indexOf(meta.style);
      const score = (meta.spaceType === spaceType ? 1000 : 0)
        + (!binUsed.has(photo) ? 160 : 0)
        + (meta.style === style ? 120 : 0)
        + (compatibilityIndex >= 0 ? 80 - compatibilityIndex * 12 : 0);
      return { photo, score };
    })
    .sort((a, b) => b.score - a.score || a.photo.localeCompare(b.photo))[0].photo;
}

const additions = [];
for (const style of styles) {
  const currentCount = items.filter((item) => item.style === style).length;
  const needed = TARGET_PER_STYLE - currentCount;
  if (needed < 0) throw new Error(`${style} 사례가 목표보다 많습니다: ${currentCount}건`);
  if (!needed) continue;

  const existingTitles = new Set(items.map((item) => item.title));
  const concepts = (CONCEPTS[style] || []).filter(([title]) => !existingTitles.has(title));
  if (concepts.length < needed) throw new Error(`${style} 추가 콘셉트가 부족합니다: 필요 ${needed}, 보유 ${concepts.length}`);

  for (let index = 0; index < needed; index += 1) {
    const [title, spaceType, structure, mood, tip] = concepts[index];
    const bin = chooseArea(style);
    const photo = choosePhoto(style, spaceType, bin.id);
    const meta = photoMeta.get(photo) || {};
    const sequence = currentCount + index + 1;
    const tilePlan = tilePlanFor(spaceType);
    const item = {
      id: `design-${CACHE_VERSION}-${STYLE_SLUGS[style]}-${String(sequence).padStart(2, '0')}`,
      title,
      category: 'AI추천',
      spaceType,
      structure,
      area: bin.area,
      budget: budgetForArea(bin.area),
      style,
      mood,
      palette: STYLE_PALETTES[style],
      materials: materialsFor(style, spaceType),
      tip,
      trendLabel: `${bin.area}평 ${style} · 추천 사례 ${sequence}`,
      trendNote: `${style}의 색감과 ${spaceType} 동선을 조합한 AI 추천 참고 사례입니다. 실제 자재와 치수는 현장 실측 후 확정합니다.`,
      photo: `${photo}?v=${CACHE_VERSION}`,
      imageAlt: meta.imageAlt || `${title} ${spaceType} 인테리어 참고 이미지`,
      aiDesign: true,
      catalogBatch: '2026-07-23'
    };

    if (tilePlan) item.tilePlan = tilePlan;
    if (spaceType === '욕실') {
      item.tileNote = '벽 대형 타일은 바탕 평활도를 먼저 확인하고, 바닥은 300각 이하 논슬립 타일로 배수 물매와 재단선을 확보합니다.';
    }
    if (meta.imageCredit && meta.imageSource) {
      item.imageCredit = meta.imageCredit;
      item.imageSource = meta.imageSource;
    }

    additions.push(item);
    items.push(item);
    usedByStyle.get(style).add(photo);
    usedByBin.get(bin.id).add(photo);
    globalBinCounts.set(bin.id, globalBinCounts.get(bin.id) + 1);
    const counts = styleBinCounts.get(style);
    counts.set(bin.id, counts.get(bin.id) + 1);
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

const finalSite = additions.length ? { ...site, portfolio: items } : site;
console.table(styles.map((style) => ({
  분류: style,
  사례: finalSite.portfolio.filter((item) => item.style === style).length,
  이미지: new Set(finalSite.portfolio.filter((item) => item.style === style).map((item) => plainPhoto(item.photo))).size
})));
console.table(AREA_BINS.map((bin) => {
  const list = finalSite.portfolio.filter((item) => binForArea(item.area)?.id === bin.id);
  return { 분류: bin.label, 사례: list.length, 이미지: new Set(list.map((item) => plainPhoto(item.photo))).size };
}));
