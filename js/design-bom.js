/* AI 디자인 시안용 공간별 자재 BOM·예상견적 계산기 */
(function (root) {
  'use strict';

  const SQM_PER_PYEONG = 3.3058;
  const PRICE_BASIS = '2026.07 수도권 소규모 현장';
  const PRICE_SOURCES = [
    { label: '2026 시중노임단가', href: 'https://info.cak.or.kr/lay1/bbs/S1T9C12/A/2/view.do?article_seq=153489&condition=&cpage=1&keyword=&mode=view&rows=10' },
    { label: '2026 건설공사 표준품셈', href: 'https://www.codil.or.kr/helpdesk/read.do?bbsId=BBSMSTR_900000000202&nttId=13261' },
    { label: '욕실 패키지 시장가', href: 'https://soomgo.com/market/products/6560ec0bb9f9d6cebf0a3460' },
    { label: '2026 도배 시장가', href: 'https://soomgo.com/blog/interior/%EB%8F%84%EB%B0%B0%EA%B0%80%EA%B2%A9/' }
  ];

  const CATEGORY_THUMBNAILS = {
    tile: 'assets/designs/travertine-spa-bath-buildable.jpg',
    sanitary: 'assets/designs/white-bath.jpg',
    flooring: 'assets/designs/natural-wood.jpg',
    windows: 'assets/designs/white-oak-living.jpg',
    waterproofing: 'assets/cases/case-coat-gray.jpg',
    finishes: 'assets/designs/minimal-white.jpg',
    wallcovering: 'assets/designs/french-modern-living-34.jpg'
  };

  const THUMBNAIL_RULES = [
    { match: /타일|포세린|트래버틴|스톤 바닥/, image: CATEGORY_THUMBNAILS.tile },
    { match: /양변기|위생도기|세면|수전|샤워|배수|환기|세탁 설비/, image: CATEGORY_THUMBNAILS.sanitary },
    { match: /마루|오크|헤링본|바닥/, image: CATEGORY_THUMBNAILS.flooring },
    { match: /방수/, image: CATEGORY_THUMBNAILS.waterproofing },
    { match: /도장|페인트|플라스터|회벽/, image: CATEGORY_THUMBNAILS.finishes },
    { match: /벽지|도배|벽체|벽·천장/, image: CATEGORY_THUMBNAILS.wallcovering },
    { match: /주방|상판|싱크/, image: 'assets/designs/modern-kitchen.jpg' },
    { match: /목공|수납|가구|중문|몰딩|파티션|헤드월/, image: 'assets/designs/wardrobe-laundry-42.jpg' },
    { match: /조명|전기/, image: 'assets/designs/modern-gray.jpg' },
    { match: /스타일링|패브릭|라탄|식물/, image: 'assets/designs/scandi.jpg' }
  ];

  const BUDGET_TIERS = [
    { match: /8천만원 이상/, key: 'luxury', label: '프리미엄', catalogTier: '프리미엄', materialFactor: 1.48, laborFactor: 1.15 },
    { match: /5천~8천만원/, key: 'premium', label: '고급', catalogTier: '프리미엄', materialFactor: 1.23, laborFactor: 1.08 },
    { match: /3천~5천만원/, key: 'standard', label: '표준', catalogTier: '중급', materialFactor: 1, laborFactor: 1 },
    { match: /.*/, key: 'economy', label: '실속', catalogTier: '실속', materialFactor: 0.86, laborFactor: 0.95 }
  ];

  const ROOM_RULES = {
    '거실': { factor: 0.27, min: 5.2, max: 15, wall: 2.3 },
    '주방': { factor: 0.16, min: 3.2, max: 9, wall: 1.35 },
    '욕실': { factor: 0.055, min: 1.35, max: 2.8, wall: 2.9 },
    '침실': { factor: 0.14, min: 3, max: 7.5, wall: 2.65 },
    '현관': { factor: 0.045, min: 1.1, max: 2.8, wall: 2.1 },
    '서재': { factor: 0.12, min: 2.8, max: 7.5, wall: 2.55 },
    '아이방': { factor: 0.115, min: 2.8, max: 7, wall: 2.55 },
    '드레스룸': { factor: 0.105, min: 2.5, max: 7.5, wall: 2.2 }
  };

  const CATALOG_PREFERENCES = {
    flooring: {
      economy: ['강그린 수퍼', '센트라 프라임'],
      standard: ['진 테라맥스', '진 그란데', '센트라'],
      premium: ['에디톤', '그랜드 텍스처'],
      luxury: ['블론테', '에디톤']
    },
    tile: {
      economy: ['세렌 사비아', '세렌 크레마'],
      standard: ['세렌', 'SistemN', 'Lume'],
      premium: ['Boost Stone', 'Marvel Travertine', 'Bottega'],
      luxury: ['Stones & More', 'Harlem Acero', 'Marvel Travertine']
    },
    sanitary: {
      economy: ['IC705E', 'IC859E'],
      standard: ['Acacia E', 'Boston', 'SMARTLET Edge'],
      premium: ['SMARTLET', 'Veil', 'NEOREST'],
      luxury: ['NEOREST', 'CW822REA', 'Veil']
    },
    waterproofing: {
      economy: ['Sikalastic-1K', 'Mapelastic 70KS'],
      standard: ['Sikalastic-1K', 'Mapelastic 70KS', 'Mapelastic AquaDefense'],
      premium: ['Mapelastic AquaDefense', 'WPM 002'],
      luxury: ['WPM 002', 'WPM 300', 'Mapelastic AquaDefense']
    },
    finishes: {
      economy: ['숲으로 웰빙', '순앤수 원터치'],
      standard: ['숲으로 웰빙', '아이럭스 듀로-X', '팬톤페인트'],
      premium: ['Scuff-X', 'Aura Bath & Spa', '아이럭스 듀로-X'],
      luxury: ['Aura Bath & Spa', 'Scuff-X']
    },
    wallcovering: {
      economy: ['IRIS', 'LENO'],
      standard: ['실크벽지 베스트', 'LIVING', 'NINE'],
      premium: ['디아망', 'GranD', '옥수수가'],
      luxury: ['GranD', '디아망', '옥수수가']
    }
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const roundQty = (value) => Math.round(value * 10) / 10;
  const roundUnit = (value) => Math.max(0, Math.round(value / 1000) * 1000);
  const roundAmount = (value) => Math.max(0, Math.round(value / 10000) * 10000);
  const formatWon = (value) => '₩' + Math.round(value || 0).toLocaleString('ko-KR');
  const compactManwon = (value, direction) => {
    const amount = Math.max(0, Number(value) || 0);
    const rounded = direction === 'down'
      ? Math.floor(amount / 100000) * 10
      : Math.ceil(amount / 100000) * 10;
    return rounded.toLocaleString('ko-KR');
  };
  const formatCompactRange = (low, high) =>
    `${compactManwon(low, 'down')}~${compactManwon(high, 'up')}만원`;

  function thumbnailFor(definition) {
    const text = [definition.category, definition.name, definition.spec].filter(Boolean).join(' ');
    const match = THUMBNAIL_RULES.find((rule) => rule.match.test(text));
    return match ? match.image : 'assets/designs/warm-beige.jpg';
  }

  function formatUnitRate(value, unit) {
    const surfacePyeong = unit === 'm²'
      ? `<small>표면 1평 ${formatWon(roundUnit(value * SQM_PER_PYEONG))}</small>`
      : '';
    return `<span>${formatWon(value)} /${unit}</span>${surfacePyeong}`;
  }

  function tierFor(item) {
    const budget = String(item.budget || '');
    return BUDGET_TIERS.find((tier) => tier.match.test(budget)) || BUDGET_TIERS[2];
  }

  function roomMetrics(item) {
    const homePyeong = clamp(Number(item.area) || 30, 10, 80);
    const rule = ROOM_RULES[item.spaceType] || { factor: 0.12, min: 2.8, max: 8, wall: 2.5 };
    const roomPyeong = roundQty(clamp(homePyeong * rule.factor, rule.min, rule.max));
    const floorM2 = roundQty(roomPyeong * SQM_PER_PYEONG);
    const wallM2 = roundQty(floorM2 * rule.wall);
    const perimeterM = roundQty(Math.sqrt(floorM2) * 4 * 1.08);
    return { homePyeong, roomPyeong, floorM2, wallM2, perimeterM };
  }

  function firstMaterial(item, pattern, fallback) {
    const match = (item.materials || []).find((name) => pattern.test(String(name)));
    return match || fallback;
  }

  function categoryProducts(catalog, categoryId) {
    if (!catalog || !Array.isArray(catalog.categories)) return [];
    const category = catalog.categories.find((entry) => entry.id === categoryId);
    return category && Array.isArray(category.products) ? category.products : [];
  }

  function pickCatalogProduct(catalog, categoryId, tier, hint) {
    const products = categoryProducts(catalog, categoryId);
    if (!products.length) return null;
    const preferences = (CATALOG_PREFERENCES[categoryId] && CATALOG_PREFERENCES[categoryId][tier.key]) || [];
    const hintText = String(hint || '').toLowerCase();

    return products
      .map((product, index) => {
        const text = [product.brand, product.name, product.type, product.spec].join(' ').toLowerCase();
        let score = product.availability === 'domestic' ? 3 : 0;
        if (product.tier === tier.catalogTier) score += 4;
        preferences.forEach((name, preferenceIndex) => {
          if (text.includes(name.toLowerCase())) score += 18 - preferenceIndex;
        });
        hintText.split(/\s+/).filter((word) => word.length >= 2).forEach((word) => {
          if (text.includes(word)) score += 1;
        });
        return { product, score, index };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index)[0].product;
  }

  function productSpec(product, fallback) {
    if (!product) return fallback;
    return [product.brand, product.name, product.spec].filter(Boolean).join(' · ');
  }

  function addLine(lines, tier, definition) {
    const quantity = roundQty(definition.quantity);
    const materialUnit = roundUnit(definition.materialUnit * tier.materialFactor);
    const laborUnit = roundUnit(definition.laborUnit * tier.laborFactor);
    const materialAmount = roundAmount(quantity * materialUnit);
    const laborAmount = roundAmount(quantity * laborUnit);
    lines.push({
      category: definition.category,
      name: definition.name,
      spec: definition.spec,
      quantity,
      unit: definition.unit,
      materialUnit,
      laborUnit,
      materialAmount,
      laborAmount,
      amount: materialAmount + laborAmount,
      source: definition.source || null,
      catalogLinked: Boolean(definition.source),
      thumbnail: definition.thumbnail || thumbnailFor(definition),
      thumbnailAlt: `${definition.name} 자재 적용 예시`
    });
  }

  function catalogLine(catalog, tier, categoryId, hint, definition) {
    const product = pickCatalogProduct(catalog, categoryId, tier, hint);
    return Object.assign({}, definition, {
      spec: productSpec(product, definition.spec),
      source: product && product.source,
      thumbnail: (product && product.image) || CATEGORY_THUMBNAILS[categoryId] || thumbnailFor(definition)
    });
  }

  function buildLiving(item, catalog, tier, metrics) {
    const lines = [];
    const wallName = firstMaterial(item, /도장|페인트|플라스터|회벽|벽지|화이트 벽|텍스처 월/, '친환경 실크벽지');
    const paintWall = /도장|페인트|플라스터|회벽/.test(wallName);
    const floorName = firstMaterial(item, /마루|오크|헤링본|타일|포세린|스톤 바닥/, '내추럴 오크 강마루');
    const tiledFloor = /타일|포세린|스톤/.test(floorName);

    addLine(lines, tier, catalogLine(catalog, tier, paintWall ? 'finishes' : 'wallcovering', wallName, {
      category: '벽체', name: wallName, spec: paintWall ? '친환경 수성도료·전용 하도 포함' : '실크벽지·초배 포함',
      quantity: metrics.wallM2 * 1.08, unit: 'm²', materialUnit: paintWall ? 8500 : 9500, laborUnit: paintWall ? 16500 : 10500
    }));
    addLine(lines, tier, catalogLine(catalog, tier, tiledFloor ? 'tile' : 'flooring', floorName, {
      category: '바닥', name: floorName, spec: tiledFloor ? '무광 포세린·접착제·줄눈 포함' : '강마루·전용 접착제 포함',
      quantity: metrics.floorM2 * (tiledFloor ? 1.1 : 1.08), unit: 'm²', materialUnit: tiledFloor ? 52000 : 47000, laborUnit: tiledFloor ? 88000 : 19000
    }));
    addLine(lines, tier, {
      category: '목공', name: '저상 걸레받이·마감 프로파일', spec: '화이트 저상 걸레받이, 코너·재료분리대 포함',
      quantity: metrics.perimeterM * 0.84, unit: 'm', materialUnit: 9000, laborUnit: 8500
    });
    addLine(lines, tier, {
      category: '조명', name: '매입등·간접조명 세트', spec: 'LED 3000K, 드라이버·배선 보완 포함',
      quantity: 1, unit: '식', materialUnit: 470000, laborUnit: 330000
    });
    const styling = firstMaterial(item, /패브릭|라탄|식물|하드웨어|수납|파티션|몰딩/, '패브릭·하드웨어 스타일링');
    addLine(lines, tier, {
      category: '스타일링', name: styling, spec: '시안 색상·질감 기준 선택품',
      quantity: 1, unit: '식', materialUnit: /수납|파티션/.test(styling) ? 1150000 : 430000, laborUnit: /수납|파티션/.test(styling) ? 360000 : 80000
    });
    return lines;
  }

  function buildKitchen(item, catalog, tier, metrics) {
    const lines = [];
    const cabinetLength = clamp(4.2 + metrics.homePyeong * 0.075 + (/아일랜드/.test(item.structure || '') ? 1.4 : 0), 4.8, 9.2);
    const cabinetName = firstMaterial(item, /도어|상부장|아일랜드|우드/, 'PET 무광 주방 도어');
    const counterName = firstMaterial(item, /상판|쿼츠|세라믹|스톤/, '엔지니어드스톤 상판');
    const backsplashName = firstMaterial(item, /\d+[×x]\d+mm.*타일|유약 타일|포세린 타일/, '100×100mm 무광 유약 타일');

    addLine(lines, tier, {
      category: '주방가구', name: cabinetName, spec: 'E0급 몸통·도어·소프트클로징 하드웨어',
      quantity: cabinetLength, unit: 'm', materialUnit: 390000, laborUnit: 125000
    });
    addLine(lines, tier, {
      category: '상판', name: counterName, spec: '20T급 상판·싱크 타공·이음 가공 포함',
      quantity: clamp(cabinetLength * 0.64, 3.2, 6.2), unit: 'm', materialUnit: 245000, laborUnit: 78000
    });
    addLine(lines, tier, catalogLine(catalog, tier, 'tile', backsplashName, {
      category: '벽타일', name: backsplashName, spec: '주방 벽타일·접착제·줄눈 포함',
      quantity: clamp(cabinetLength * 0.7, 2.8, 7), unit: 'm²', materialUnit: 48000, laborUnit: 82000
    }));
    addLine(lines, tier, {
      category: '싱크·수전', name: '싱크볼·주방 수전 세트', spec: '사각 싱크볼·절수형 수전·배수 트랩 포함',
      quantity: 1, unit: '세트', materialUnit: 560000, laborUnit: 190000
    });
    addLine(lines, tier, {
      category: '설비·전기', name: '급배수·후드·가전 전용회로', spec: '싱크 배관 연결·후드 덕트·인덕션 전용회로',
      quantity: 1, unit: '식', materialUnit: 390000, laborUnit: 570000
    });
    addLine(lines, tier, {
      category: '조명', name: '조리대 조명·간접조명', spec: 'LED 4000K 작업등·3000K 간접등',
      quantity: 1, unit: '식', materialUnit: 330000, laborUnit: 270000
    });
    return lines;
  }

  function buildBathroom(item, catalog, tier, metrics) {
    const lines = [];
    const allMaterials = (item.materials || []).join(' ');
    const wallTile = firstMaterial(item, /\d+[×x]\d+mm.*(타일|포세린)|트래버틴|벽타일/, '300×600mm 무광 포세린 타일');
    const floorTile = (item.tilePlan || []).find((row) => /바닥/.test(row.label || ''));
    const floorName = floorTile ? floorTile.value : (/트래버틴/.test(allMaterials) ? '300×300mm 트래버틴 논슬립 타일' : '300×300mm 논슬립 포세린 타일');

    addLine(lines, tier, catalogLine(catalog, tier, 'tile', wallTile, {
      category: '벽타일', name: wallTile, spec: '무광 포세린·접착제·줄눈 포함',
      quantity: metrics.wallM2 * 1.1, unit: 'm²', materialUnit: 42000, laborUnit: 74000
    }));
    addLine(lines, tier, catalogLine(catalog, tier, 'tile', floorName, {
      category: '바닥타일', name: floorName, spec: '습식 논슬립 타일·다방향 물매 포함',
      quantity: metrics.floorM2 * 1.15, unit: 'm²', materialUnit: 38000, laborUnit: 94000
    }));
    addLine(lines, tier, catalogLine(catalog, tier, 'waterproofing', '욕실 타일 하부 방수', {
      category: '방수', name: '욕실 2차 도막방수', spec: '프라이머·코너 밴드·배수구 보강·담수시험 포함',
      quantity: metrics.floorM2 * 1.85, unit: 'm²', materialUnit: 14000, laborUnit: 30000
    }));
    addLine(lines, tier, catalogLine(catalog, tier, 'sanitary', '양변기', {
      category: '위생도기', name: '절수형 양변기', spec: '배수거리 305mm 기준·설치 부속 포함',
      quantity: 1, unit: '세트', materialUnit: 280000, laborUnit: 110000
    }));
    addLine(lines, tier, {
      category: '세면가구', name: firstMaterial(item, /세면대|거울 수납장/, '하부장 일체형 세면대·거울장'), spec: '세면볼·하부장·거울장·팝업 포함',
      quantity: 1, unit: '세트', materialUnit: 550000, laborUnit: 150000
    });
    addLine(lines, tier, {
      category: '수전', name: firstMaterial(item, /수전/, '세면 수전·샤워 수전 세트'), spec: '세면 수전·레인샤워·앵글밸브 포함',
      quantity: 1, unit: '세트', materialUnit: 400000, laborUnit: 150000
    });
    addLine(lines, tier, {
      category: '샤워부스', name: '강화유리 샤워 파티션', spec: '8T 강화유리·스테인리스 하드웨어',
      quantity: 1, unit: '세트', materialUnit: 480000, laborUnit: 180000
    });
    addLine(lines, tier, {
      category: '배수·환기', name: '배수구·트랩·욕실 환풍기', spec: '악취차단 트랩·저소음 환풍기·덕트 연결',
      quantity: 1, unit: '식', materialUnit: 250000, laborUnit: 210000
    });
    return lines;
  }

  function buildBedroom(item, catalog, tier, metrics) {
    const lines = [];
    const wallName = firstMaterial(item, /벽지|도장|플라스터|회벽/, '친환경 실크벽지');
    const paintWall = /도장|페인트|플라스터/.test(wallName);
    const floorName = firstMaterial(item, /마루|오크|헤링본/, '내추럴 오크 강마루');

    addLine(lines, tier, catalogLine(catalog, tier, paintWall ? 'finishes' : 'wallcovering', wallName, {
      category: '벽·천장', name: wallName, spec: paintWall ? '친환경 수성도료·퍼티·하도 포함' : '실크벽지·천장 합지·초배 포함',
      quantity: (metrics.wallM2 + metrics.floorM2) * 1.08, unit: 'm²', materialUnit: paintWall ? 8500 : 9000, laborUnit: paintWall ? 16500 : 10000
    }));
    addLine(lines, tier, catalogLine(catalog, tier, 'flooring', floorName, {
      category: '바닥', name: floorName, spec: '강마루·전용 접착제 포함',
      quantity: metrics.floorM2 * 1.08, unit: 'm²', materialUnit: 47000, laborUnit: 19000
    }));
    addLine(lines, tier, {
      category: '목공', name: '걸레받이·도어 주변 마감', spec: '저상 걸레받이·코너 마감 포함',
      quantity: metrics.perimeterM * 0.86, unit: 'm', materialUnit: 9000, laborUnit: 8500
    });
    addLine(lines, tier, {
      category: '조명', name: '침실 조명·침대 헤드 간접등', spec: 'LED 3000K·양방향 스위치 포함',
      quantity: 1, unit: '식', materialUnit: 360000, laborUnit: 260000
    });
    if (/붙박이|수납|호텔/.test([item.structure, (item.materials || []).join(' ')].join(' '))) {
      addLine(lines, tier, {
        category: '수납가구', name: firstMaterial(item, /붙박이장|수납/, '붙박이장'), spec: 'E0급 몸통·무광 도어·소프트클로징 하드웨어',
        quantity: clamp(metrics.floorM2 * 0.22, 2.4, 4.6), unit: 'm', materialUnit: 440000, laborUnit: 105000
      });
    }
    const feature = firstMaterial(item, /헤드월|패브릭|몰딩|도어/, null);
    if (feature) addLine(lines, tier, {
      category: '포인트 마감', name: feature, spec: '시안 색상·질감 기준 제작',
      quantity: 1, unit: '식', materialUnit: 620000, laborUnit: 280000
    });
    return lines;
  }

  function buildEntry(item, catalog, tier, metrics) {
    const lines = [];
    addLine(lines, tier, catalogLine(catalog, tier, 'tile', '현관 논슬립 포세린', {
      category: '바닥', name: '현관 논슬립 포세린 타일', spec: '600각 무광 타일·접착제·줄눈 포함',
      quantity: metrics.floorM2 * 1.12, unit: 'm²', materialUnit: 49000, laborUnit: 92000
    }));
    addLine(lines, tier, {
      category: '수납가구', name: '현관 신발장·벤치 수납', spec: 'E0급 몸통·PET 무광 도어·하부 간접등',
      quantity: clamp(metrics.floorM2 * 0.58, 1.8, 3.4), unit: 'm', materialUnit: 420000, laborUnit: 110000
    });
    addLine(lines, tier, {
      category: '중문', name: '슬림 3연동 중문', spec: '알루미늄 프레임·5T 강화유리·레일 포함',
      quantity: 1, unit: '세트', materialUnit: 1250000, laborUnit: 350000
    });
    addLine(lines, tier, catalogLine(catalog, tier, 'wallcovering', '현관 벽지', {
      category: '벽·천장', name: '현관 벽·천장 마감', spec: '실크벽지·천장 합지·초배 포함',
      quantity: (metrics.wallM2 + metrics.floorM2) * 1.08, unit: 'm²', materialUnit: 9000, laborUnit: 10000
    }));
    addLine(lines, tier, {
      category: '조명', name: '현관 센서등·신발장 간접등', spec: 'LED 3000K·센서·드라이버 포함',
      quantity: 1, unit: '식', materialUnit: 260000, laborUnit: 190000
    });
    return lines;
  }

  function buildWorkRoom(item, catalog, tier, metrics) {
    const lines = [];
    const isKids = item.spaceType === '아이방';
    const wallName = isKids ? '친환경 합지·포인트 벽지' : '내오염 실크벽지';
    addLine(lines, tier, catalogLine(catalog, tier, 'wallcovering', wallName, {
      category: '벽·천장', name: wallName, spec: '초배·바탕 보수·천장 마감 포함',
      quantity: (metrics.wallM2 + metrics.floorM2) * 1.08, unit: 'm²', materialUnit: isKids ? 7600 : 9300, laborUnit: 10000
    }));
    addLine(lines, tier, catalogLine(catalog, tier, 'flooring', '오크 강마루', {
      category: '바닥', name: '내추럴 오크 강마루', spec: '강마루·전용 접착제·걸레받이 포함',
      quantity: metrics.floorM2 * 1.08, unit: 'm²', materialUnit: 47000, laborUnit: 20500
    }));
    addLine(lines, tier, {
      category: '가구', name: firstMaterial(item, /책장|수납|모듈|데스크/, isKids ? '성장형 모듈 수납·책상' : '벽면 책장·데스크'), spec: 'E0급 보드·PET/LPM 마감·하드웨어 포함',
      quantity: clamp(metrics.floorM2 * 0.27, 2.6, 5.5), unit: 'm', materialUnit: 410000, laborUnit: 115000
    });
    addLine(lines, tier, {
      category: '전기·조명', name: '작업등·콘센트 증설', spec: '눈부심 저감 LED·책상 상부 콘센트·USB 전원',
      quantity: 1, unit: '식', materialUnit: 390000, laborUnit: 330000
    });
    return lines;
  }

  function buildDressing(item, catalog, tier, metrics) {
    const lines = [];
    const wardrobeLength = clamp(metrics.floorM2 * 0.42, 4.5, 9.5);
    addLine(lines, tier, {
      category: '수납가구', name: firstMaterial(item, /붙박이장|수납|글라스 도어/, '시스템 붙박이장'), spec: 'E0급 몸통·행거·서랍·소프트클로징 하드웨어',
      quantity: wardrobeLength, unit: 'm', materialUnit: 430000, laborUnit: 110000
    });
    addLine(lines, tier, catalogLine(catalog, tier, 'flooring', '오크 강마루', {
      category: '바닥', name: '내추럴 오크 강마루', spec: '강마루·접착제·걸레받이 포함',
      quantity: metrics.floorM2 * 1.08, unit: 'm²', materialUnit: 47000, laborUnit: 20500
    }));
    addLine(lines, tier, catalogLine(catalog, tier, 'wallcovering', '내오염 실크벽지', {
      category: '벽·천장', name: '내오염 실크벽지', spec: '바탕 보수·초배·천장 합지 포함',
      quantity: (metrics.wallM2 + metrics.floorM2) * 1.08, unit: 'm²', materialUnit: 9300, laborUnit: 10000
    }));
    addLine(lines, tier, {
      category: '조명', name: '수납장 센서등·전신 조명', spec: 'LED 3000K·도어 센서·드라이버 포함',
      quantity: 1, unit: '식', materialUnit: 470000, laborUnit: 280000
    });
    if (/세탁/.test([item.title, item.structure, (item.materials || []).join(' ')].join(' '))) {
      addLine(lines, tier, {
        category: '세탁 설비', name: '세탁기·건조기 급배수·전원', spec: '급수 밸브·배수 트랩·전용 콘센트·환기 여유',
        quantity: 1, unit: '식', materialUnit: 310000, laborUnit: 420000
      });
    }
    return lines;
  }

  function buildLines(item, catalog, tier, metrics) {
    switch (item.spaceType) {
      case '주방': return buildKitchen(item, catalog, tier, metrics);
      case '욕실': return buildBathroom(item, catalog, tier, metrics);
      case '침실': return buildBedroom(item, catalog, tier, metrics);
      case '현관': return buildEntry(item, catalog, tier, metrics);
      case '서재':
      case '아이방': return buildWorkRoom(item, catalog, tier, metrics);
      case '드레스룸': return buildDressing(item, catalog, tier, metrics);
      default: return buildLiving(item, catalog, tier, metrics);
    }
  }

  function build(item, catalog) {
    const tier = tierFor(item || {});
    const metrics = roomMetrics(item || {});
    const lines = buildLines(item || {}, catalog, tier, metrics);
    const materialTotal = lines.reduce((sum, line) => sum + line.materialAmount, 0);
    const laborTotal = lines.reduce((sum, line) => sum + line.laborAmount, 0);
    const directTotal = materialTotal + laborTotal;
    const allowance = roundAmount(directTotal * 0.08);
    const beforeVat = directTotal + allowance;
    const vat = roundAmount(beforeVat * 0.1);
    const total = beforeVat + vat;
    const rangeLow = roundAmount(total * 0.9);
    const rangeHigh = roundAmount(total * 1.2);
    const perRoomPyeong = roundAmount(total / metrics.roomPyeong);
    return {
      priceBasis: PRICE_BASIS,
      tierLabel: tier.label,
      metrics,
      lines,
      materialTotal,
      laborTotal,
      allowance,
      vat,
      total,
      rangeLow,
      rangeHigh,
      perRoomPyeong
    };
  }

  function render(bom) {
    if (!bom || !bom.lines || !bom.lines.length) return '';
    const m = bom.metrics;
    return `
      <section class="fm-bom" aria-labelledby="fmBomTitle">
        <div class="fm-bom-head">
          <div>
            <h4 id="fmBomTitle">자재 BOM·예상견적</h4>
            <p>전체 ${m.homePyeong}평형 중 시안 공간 약 ${m.roomPyeong}평(${m.floorM2}m²) · ${bom.tierLabel} 사양</p>
          </div>
          <span>${bom.priceBasis}</span>
        </div>
        <div class="fm-bom-summary">
          <div class="fm-bom-total"><span>시안 공간 예상비용</span><strong>${formatCompactRange(bom.rangeLow, bom.rangeHigh)}</strong><small>부가세 포함 · 산출 기준금액 ${formatWon(bom.total)}</small></div>
          <dl>
            <div><dt>자재비</dt><dd>${formatWon(bom.materialTotal)}</dd></div>
            <div><dt>시공비</dt><dd>${formatWon(bom.laborTotal)}</dd></div>
            <div><dt>기준 공간</dt><dd>${m.roomPyeong}평</dd></div>
            <div><dt>공간 평당</dt><dd>${formatWon(bom.perRoomPyeong)}</dd></div>
            <div><dt>현장 예비비</dt><dd>${formatWon(bom.allowance)}</dd></div>
            <div><dt>부가세</dt><dd>${formatWon(bom.vat)}</dd></div>
          </dl>
        </div>
        <div class="fm-bom-unit-help">
          <b>단가 기준</b>
          <span>평당이 아니라 각 행의 /m², /m, /세트, /식 기준입니다.</span>
          <small>m² 항목에는 표면 1평(3.3058m²) 환산값을 함께 표시합니다.</small>
        </div>
        <div class="fm-bom-table-wrap">
          <table class="fm-bom-table">
            <caption class="sr-only">디자인 시안 자재 명세와 예상 단가</caption>
            <thead><tr><th>공종·자재</th><th>제품·사양</th><th>수량</th><th>자재 단가</th><th>시공 단가</th><th>금액</th></tr></thead>
            <tbody>${bom.lines.map((line) => `
              <tr>
                <td data-label="공종·자재"><div class="fm-bom-material"><img src="${line.thumbnail}" alt="" title="${line.thumbnailAlt}" loading="lazy" decoding="async" width="44" height="44"><span><em>${line.category}</em><b>${line.name}</b></span></div></td>
                <td data-label="제품·사양"><span>${line.spec}</span>${line.source ? `<a href="${line.source}" target="_blank" rel="noopener">공식 제품 자료</a>` : '<small>현장 실측 후 브랜드 확정</small>'}</td>
                <td data-label="수량">${line.quantity.toLocaleString('ko-KR')} ${line.unit}</td>
                <td class="fm-bom-rate" data-label="자재 단가">${formatUnitRate(line.materialUnit, line.unit)}</td>
                <td class="fm-bom-rate" data-label="시공 단가">${formatUnitRate(line.laborUnit, line.unit)}</td>
                <td data-label="금액"><b>${formatWon(line.amount)}</b></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
        <p class="fm-bom-sources"><b>검산 근거</b>${PRICE_SOURCES.map((source) => `<a href="${source.href}" target="_blank" rel="noopener">${source.label}</a>`).join('')}</p>
        <p class="fm-bom-note">시안에 표시된 공간 한 곳만 산정한 참고 견적입니다. 2026년 공표 노임·표준품셈과 최근 욕실·도배 시장가를 교차 확인해 수도권 소규모 현장의 최소 출역, 보양, 절단, 운반 부담을 반영했습니다. 작은 이미지는 자재 적용 예시이며 제품 링크는 사양 확인용입니다. 실제 납품가는 대리점·수량·운임에 따라 달라집니다. 현장 예비비 8%를 반영했고 기존 마감 철거·폐기·양중·가전·구조 변경은 제외됩니다. 최종 수량과 금액은 방문 실측 후 확정됩니다.</p>
      </section>`;
  }

  root.DesignBom = { build, render, formatWon, formatCompactRange };
}(window));
