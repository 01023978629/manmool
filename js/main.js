/* ============================================================
   만물인테리어 · Loop Agent — 프론트엔드 스크립트
   콘텐츠는 data/site.json 에서 로드됩니다. AI/운영자는 이 JSON만
   수정하면 사이트 전체 콘텐츠가 자동으로 갱신됩니다.
   ============================================================ */

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16l-1-5H5L4 9Z"/><path d="M5 9v11h14V9"/><path d="M9 20v-5h6v5"/></svg>',
  hammer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6 4 4-8 8-4-4 8-8Z"/><path d="m14 6 3-3 4 4-3 3"/><path d="m6 14-4 4 2 2 4-4"/></svg>',
  sofa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 2 2v3h16v-3a2 2 0 0 1 2-2 2 2 0 0 0-2-2 2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2 2 2 0 0 0-2 2Z"/><path d="M6 18v2M18 18v2"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 10-5 16-9 16Z"/><path d="M4 20c2-4 5-7 9-8"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3"/></svg>',
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>',
  badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2l-6 6 2.2 2.2 6-6a4 4 0 0 0 5.2-5.4l-2.4 2.4-2-2 2.4-2.4Z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 13h6M9 17h6"/></svg>'
};

const won = (n) => '₩ ' + Math.round(n).toLocaleString('ko-KR');

/* ---------- 데이터 로드 ---------- */
async function loadSite() {
  try {
    const res = await fetch('data/site.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('데이터 로드 실패');
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function loadMaterialCatalog() {
  try {
    const res = await fetch('data/material-catalog.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('자재 카탈로그 로드 실패');
    return await res.json();
  } catch (err) {
    console.error(err);
    return { categories: [] };
  }
}

/* ---------- data-bind: 텍스트 채우기 ---------- */
function bindText(data) {
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const path = el.getAttribute('data-bind');
    const val = path.split('.').reduce((o, k) => (o ? o[k] : undefined), data);
    if (val != null) el.textContent = val;
  });
}

/* ---------- 통계 (카운트업) ---------- */
function renderStats(stats) {
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = stats.map((s) => `
    <div class="stat">
      <b data-count="${s.value}" data-suffix="${s.suffix}">0</b>
      <span>${s.label}</span>
    </div>`).join('');

  const animate = (el) => {
    const target = +el.dataset.count;
    const suffix = el.dataset.suffix || '';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = target.toLocaleString('ko-KR') + suffix;
      return;
    }
    const dur = 1400; const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('ko-KR') + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.querySelectorAll('[data-count]').forEach(animate); obs.disconnect(); }
    });
  }, { threshold: 0.4 });
  io.observe(grid);
}

/* ---------- 서비스 ---------- */
function renderServices(services) {
  document.getElementById('servicesGrid').innerHTML = services.map((s) => `
    <article class="card reveal">
      <div class="card-icon">${ICONS[s.icon] || ICONS.home}</div>
      <h3>${s.title}</h3>
      <p>${s.desc}</p>
      <div class="card-tags">${s.tags.map((t) => `<span>${t}</span>`).join('')}</div>
    </article>`).join('');
}

/* ---------- 운영 프로세스 ---------- */
function renderProcess(steps) {
  document.getElementById('processList').innerHTML = steps.map((s) => `
    <li class="process-step reveal">
      <span class="num">${s.step}</span>
      <h3>${s.title}</h3>
      <p>${s.desc}</p>
    </li>`).join('');
}

/* ---------- 자동화 파이프라인 (n8n · 카카오톡) ---------- */
function renderAutomation(auto) {
  if (!auto) return;
  const head = document.getElementById('automationHeadline');
  const sub = document.getElementById('automationSub');
  if (head && auto.headline) head.textContent = auto.headline;
  if (sub && auto.sub) sub.textContent = auto.sub;

  const pipe = document.getElementById('automationPipeline');
  if (pipe && auto.pipeline) {
    pipe.innerHTML = auto.pipeline.map((n, i) => `
      <div class="pipe-step reveal">
        <span class="pipe-tag pipe-tag-${n.tag === '카카오' ? 'kakao' : n.tag === 'n8n' ? 'n8n' : n.tag === '승인' ? 'approve' : 'default'}">${n.tag}</span>
        <b>${n.node}</b>
        <span class="pipe-desc">${n.desc}</span>
      </div>${i < auto.pipeline.length - 1 ? '<i class="pipe-arrow" aria-hidden="true">→</i>' : ''}`).join('');
  }
  const stats = document.getElementById('automationStats');
  if (stats && auto.stats) {
    stats.innerHTML = auto.stats.map((s) => `
      <li><b>${s.value}<em>${s.suffix}</em></b><span>${s.label}</span></li>`).join('');
  }
}

/* ---------- 포트폴리오 (아파트멘터리형 사례 탐색) ---------- */
const AREA_FILTERS_DEFAULT = [];
const STYLE_FEEL_TAGS = {
  '미니멀': ['깔끔한', '넓어보이는', '정돈된'],
  '내추럴': ['따뜻한우드', '편안한', '자연스러운'],
  '북유럽': ['밝은', '포근한', '실용적인'],
  '모던': ['세련된', '도시적인', '선명한'],
  '인더스트리얼': ['시크한', '거친질감', '개성있는'],
  '빈티지': ['레트로', '따뜻한', '감성적인'],
  '웜 베이지': ['포근한', '차분한', '부드러운'],
  '프렌치': ['우아한', '로맨틱한', '클래식'],
  '호텔식': ['고급스러운', '차분한', '정돈된'],
  '재팬디': ['고요한', '절제된', '자연스러운'],
  '스마트 수납': ['실용적인', '공간활용', '정돈된']
};

const SPACE_DESIGN_SHEETS = {
  '거실': ['assets/design-sheets/living-a.webp', 'assets/design-sheets/living-b.webp'],
  '침실': ['assets/design-sheets/bedroom-a.webp', 'assets/design-sheets/bedroom-b.webp'],
  '주방': ['assets/design-sheets/kitchen-a.webp', 'assets/design-sheets/kitchen-b.webp'],
  '욕실': ['assets/design-sheets/bathroom-a.webp', 'assets/design-sheets/bathroom-b.webp'],
  '현관': ['assets/design-sheets/entry-a.webp', 'assets/design-sheets/entry-b.webp'],
  '서재': ['assets/design-sheets/study-a.webp', 'assets/design-sheets/study-b.webp'],
  '아이방': ['assets/design-sheets/kids-a.webp', 'assets/design-sheets/kids-b.webp'],
  '드레스룸': ['assets/design-sheets/dressing-a.webp', 'assets/design-sheets/dressing-b.webp']
};

const SPACE_STYLE_SCENES = {
  '거실': {
    '미니멀': [0, 2, 5],
    '내추럴': [11, 14, 24],
    '북유럽': [4, 16, 29],
    '모던': [3, 10, 30],
    '인더스트리얼': [6, 22, 28],
    '빈티지': [15, 20, 23],
    '스마트 수납': [13, 21, 25],
    '웜 베이지': [7, 17, 31],
    '재팬디': [12, 27],
    '프렌치': [8, 19],
    '호텔식': [1, 26]
  },
  '침실': {
    '웜 베이지': [0, 8],
    '프렌치': [3, 12, 20],
    '내추럴': [6, 11, 16],
    '재팬디': [15, 19, 29],
    '북유럽': [7, 9, 25],
    '빈티지': [10, 13, 26],
    '스마트 수납': [1, 17, 27],
    '미니멀': [5, 22, 30],
    '모던': [14, 18, 23],
    '인더스트리얼': [4, 31],
    '호텔식': [21, 28]
  },
  '주방': {
    '모던': [9, 18, 20],
    '미니멀': [0, 7, 28],
    '내추럴': [1, 5, 16],
    '북유럽': [4, 11, 21],
    '빈티지': [8, 10, 22],
    '인더스트리얼': [2, 19, 24],
    '프렌치': [6, 13, 23],
    '호텔식': [14, 25],
    '웜 베이지': [3, 17, 31],
    '재팬디': [15, 26],
    '스마트 수납': [27, 30]
  },
  '욕실': {
    '호텔식': [1, 2, 7, 26],
    '모던': [11, 12, 25],
    '내추럴': [6, 8, 16],
    '웜 베이지': [3, 10, 18],
    '재팬디': [14, 22, 30],
    '미니멀': [0, 27],
    '북유럽': [4, 13, 17],
    '인더스트리얼': [5, 19],
    '빈티지': [9, 21],
    '프렌치': [15, 20, 24],
    '스마트 수납': [28, 31]
  },
  '현관': {
    '내추럴': [0, 5, 20],
    '미니멀': [1, 9, 22],
    '북유럽': [7, 19, 29],
    '인더스트리얼': [8, 16, 24],
    '빈티지': [3, 23, 28],
    '웜 베이지': [10, 12, 31],
    '프렌치': [14, 17],
    '재팬디': [2, 11, 27],
    '호텔식': [4, 13, 18],
    '모던': [26, 30],
    '스마트 수납': [6, 21]
  },
  '서재': {
    '모던': [1, 13, 24],
    '인더스트리얼': [10, 11, 21],
    '미니멀': [3, 15, 29],
    '빈티지': [8, 12, 18],
    '웜 베이지': [17, 22, 27],
    '프렌치': [2, 23, 26],
    '재팬디': [5, 14, 25],
    '스마트 수납': [4, 19],
    '호텔식': [6, 28, 30],
    '내추럴': [0, 31],
    '북유럽': [7, 16]
  },
  '아이방': {
    '스마트 수납': [2, 12, 21],
    '미니멀': [5, 15, 31],
    '내추럴': [0, 11, 19],
    '북유럽': [1, 4, 17],
    '빈티지': [7, 26, 29],
    '웜 베이지': [6, 13],
    '프렌치': [3, 9, 20],
    '재팬디': [10, 14, 25],
    '인더스트리얼': [8, 24, 30],
    '모던': [18, 22],
    '호텔식': [16, 23]
  },
  '드레스룸': {
    '모던': [7, 9, 29],
    '호텔식': [1, 10, 25],
    '인더스트리얼': [6, 8, 18],
    '스마트 수납': [3, 11, 30],
    '웜 베이지': [2, 5, 17],
    '프렌치': [4, 21, 28],
    '재팬디': [13, 16, 31],
    '미니멀': [12, 19, 23],
    '내추럴': [0, 24],
    '북유럽': [14, 22],
    '빈티지': [26, 27]
  }
};

function styleFeelTagsMarkup(item, className) {
  const tags = STYLE_FEEL_TAGS[item.style] || ['편안한', '조화로운', '실용적인'];
  const label = `${item.style || '디자인'} 느낌`;
  return `<div class="${className}" aria-label="${label}">${tags.map((tag) => `<span>#${tag}</span>`).join('')}</div>`;
}

function assignPortfolioDesignSheets(items) {
  const spaceCounts = {};
  const styleCounts = {};
  items.forEach((item) => {
    const sheets = SPACE_DESIGN_SHEETS[item.spaceType];
    if (!sheets) return;
    const spaceIndex = spaceCounts[item.spaceType] || 0;
    const styleKey = `${item.spaceType}:${item.style || ''}`;
    const styleIndex = styleCounts[styleKey] || 0;
    const styleScenes = SPACE_STYLE_SCENES[item.spaceType]?.[item.style] || [];
    const sceneIndex = styleScenes[styleIndex] ?? spaceIndex;
    spaceCounts[item.spaceType] = spaceIndex + 1;
    styleCounts[styleKey] = styleIndex + 1;
    item.__designSheet = sheets[Math.min(sheets.length - 1, Math.floor(sceneIndex / 16))];
    item.__designCell = sceneIndex % 16;
  });
}

function portfolioSpriteStyle(item) {
  const cell = Math.max(0, Math.min(15, Number(item.__designCell) || 0));
  const column = cell % 4;
  const row = Math.floor(cell / 4);
  return `background-image:url('${item.__designSheet}');background-size:400% 400%;background-position:${column * 100 / 3}% ${row * 100 / 3}%;`;
}

function portfolioSpriteMarkup(item, className) {
  return `<span class="${className} portfolio-sprite" role="img" aria-label="${item.imageAlt || item.title}" style="${portfolioSpriteStyle(item)}"></span>`;
}

function portfolioPhotoStyle(item) {
  const position = item.photoPosition || '50% 50%';
  const scale = Math.max(1, Math.min(1.12, Number(item.photoScale) || 1));
  const mirror = item.photoMirror ? -1 : 1;
  return `object-position:${position};transform:scale(${scale}) scaleX(${mirror});`;
}

function renderPortfolio(items, filterConfig) {
  const grid = document.getElementById('portfolioGrid');
  const filtersEl = document.getElementById('portfolioFilters');
  const costGuideEl = document.getElementById('portfolioCostGuide');
  const countEl = document.getElementById('portfolioCount');
  const emptyEl = document.getElementById('portfolioEmpty');
  const cfg = filterConfig || {};
  assignPortfolioDesignSheets(items);
  const budgetGradeLabels = {
    '3천만원 이하': '실속형',
    '3천~5천만원': '표준형',
    '5천~8천만원': '고급형',
    '8천만원 이상': '프리미엄'
  };
  const designBomFor = (item) => {
    if (!item || !item.aiDesign || !window.DesignBom) return null;
    if (!item.__designBom) {
      item.__designBom = window.DesignBom.build(
        item,
        window.MANMUL && window.MANMUL.materialCatalog
      );
    }
    return item.__designBom;
  };
  const costRangeFor = (item) => {
    const bom = designBomFor(item);
    return bom
      ? window.DesignBom.formatCompactRange(bom.rangeLow, bom.rangeHigh)
      : (item.cost || item.budget || null);
  };

  // 데이터에서 옵션 파생 (지역·공간종류·공정·연도)
  const uniq = (key) => [...new Set(items.map((x) => x[key]).filter((v) => v != null))];
  const regions = uniq('region');
  const spaceTypes = uniq('spaceType');
  const processes = uniq('process');
  const years = uniq('year').sort((a, b) => b - a);

  // 선택 상태 (그룹별 단일 선택, null = 전체) + 단지·현장명 텍스트 검색
  const state = { region: null, area: null, budget: null, spaceType: null, process: null, style: null, scope: null, year: null, complex: '' };

  const groups = [
    { key: 'spaceType', label: '공간종류', options: spaceTypes, step: 1, requires: [] },
    { key: 'style', label: '스타일', options: cfg.style || [], step: 2, requires: ['spaceType'] },
    { key: 'area', label: '주택 평수', options: (cfg.area || []).map((a) => a.label), step: 3, requires: ['spaceType', 'style'] },
    { key: 'budget', label: '공간 예상비용', options: cfg.budget || [], step: 4, requires: ['spaceType', 'style', 'area'] },
    { key: 'process', label: '공정', options: processes },
    { key: 'scope', label: '공사범위', options: cfg.scope || [] },
    { key: 'region', label: '지역', options: regions },
    { key: 'year', label: '공사연도', options: years.map((y) => String(y)) }
  // 옵션이 없는 필터 그룹은 숨김 (데이터에 없는 기준은 표시하지 않음)
  ].filter((g) => (g.options || []).length > 0);

  const optionMatches = (item, key, option) => {
    if (!option) return true;
    if (key === 'area') {
      const range = (cfg.area || []).find((entry) => entry.label === option);
      return range ? item.area >= range.min && item.area < range.max : true;
    }
    if (key === 'year') return String(item.year) === String(option);
    return item[key] === option;
  };

  const groupEnabled = (group) => (group.requires || []).every((key) => !!state[key]);

  const candidatesForGroup = (group) => {
    const requirements = group.requires || ['spaceType', 'style', 'area', 'budget'];
    return items.filter((item) => requirements.every((key) => !state[key] || optionMatches(item, key, state[key])));
  };

  const optionCount = (group, option) => {
    const candidates = candidatesForGroup(group);
    return option ? candidates.filter((item) => optionMatches(item, group.key, option)).length : candidates.length;
  };

  const optionLabel = (group, option) => {
    if (!option || group.key !== 'budget') return option || '전체';
    const boms = candidatesForGroup(group)
      .filter((item) => optionMatches(item, group.key, option))
      .map(designBomFor)
      .filter(Boolean);
    if (!boms.length) return budgetGradeLabels[option] || option;
    const low = Math.min(...boms.map((bom) => bom.rangeLow));
    const high = Math.max(...boms.map((bom) => bom.rangeHigh));
    return `${budgetGradeLabels[option] || option} · ${window.DesignBom.formatCompactRange(low, high)}`;
  };

  const filterChip = (group, option, enabled) => {
    const showCount = ['spaceType', 'style', 'area', 'budget'].includes(group.key);
    const count = optionCount(group, option);
    const label = optionLabel(group, option);
    const countHtml = showCount ? `<span class="fg-chip-count" aria-hidden="true">${count}</span>` : '';
    const active = option ? state[group.key] === option : !state[group.key];
    return `<button class="fg-chip${active ? ' active' : ''}" data-val="${option || ''}"${showCount ? ` aria-label="${label} ${count}개 디자인"` : ''}${enabled ? '' : ' disabled'}>${label}${countHtml}</button>`;
  };

  const filterGroup = (group) => {
    const enabled = groupEnabled(group);
    const options = enabled ? group.options.filter((option) => optionCount(group, option) > 0) : [];
    const label = `${group.step ? `<span class="fg-step">${group.step}</span>` : ''}${group.label}`;
    if (!enabled) {
      return `
      <div class="folio-filter-group is-locked" data-group="${group.key}" aria-disabled="true">
        <span class="fg-label">${label}</span>
        <div class="fg-chips"><button class="fg-chip fg-waiting" type="button" disabled>선택 대기</button></div>
      </div>`;
    }
    if (options.length > 12) {
      return `
      <div class="folio-filter-group" data-group="${group.key}">
        <label class="fg-label" for="folioFilter-${group.key}">${label}</label>
        <select class="folio-filter-select" id="folioFilter-${group.key}">
          <option value="">전체 ${group.label} (${optionCount(group, '')})</option>
          ${options.map((option) => `<option value="${option}"${state[group.key] === option ? ' selected' : ''}>${optionLabel(group, option)} (${optionCount(group, option)})</option>`).join('')}
        </select>
      </div>`;
    }
    return `
    <div class="folio-filter-group" data-group="${group.key}">
      <span class="fg-label">${label}</span>
      <div class="fg-chips">
        ${filterChip(group, '', enabled)}
        ${options.map((option) => filterChip(group, option, enabled)).join('')}
      </div>
    </div>`;
  };

  const renderFilters = () => {
    filtersEl.innerHTML = `
      <div class="folio-search">
        <input type="search" id="folioComplex" placeholder="공간·스타일 검색 (예: 거실 모던)" aria-label="디자인 검색" />
        <span class="folio-ai-note">공간종류부터 선택하면 스타일·평수·공간 예상비용이 순서대로 맞춰집니다</span>
      </div>
      ${groups.map(filterGroup).join('')}`;
    const searchInput = filtersEl.querySelector('#folioComplex');
    if (searchInput) searchInput.value = state.complex;
  };

  const matchArea = (item) => {
    if (!state.area) return true;
    const range = (cfg.area || []).find((a) => a.label === state.area);
    if (!range) return true;
    return item.area >= range.min && item.area < range.max;
  };

  const representativeForSpace = (space) => {
    const list = items
      .filter((item) =>
        item.spaceType === space &&
        item.budget === '3천~5천만원' &&
        item.area >= 20 &&
        item.area < 40 &&
        designBomFor(item))
      .sort((a, b) => designBomFor(a).total - designBomFor(b).total);
    return list[Math.floor(list.length / 2)] || null;
  };

  const renderCostGuide = () => {
    if (!costGuideEl) return;
    costGuideEl.innerHTML = `
      <div class="space-cost-guide-head">
        <div>
          <h3>공간별 대표 예상비용</h3>
          <p>20~39평형 · 표준형 시안 중앙값 · 해당 공간 한 곳 기준</p>
        </div>
        <span>부가세 포함 · 철거·폐기 별도</span>
      </div>
      <div class="space-cost-list">
        ${spaceTypes.map((space) => {
          const item = representativeForSpace(space);
          const bom = designBomFor(item);
          if (!item || !bom) return '';
          return `
            <button type="button" class="space-cost-item${state.spaceType === space ? ' active' : ''}" data-cost-space="${space}" aria-label="${space} 디자인 ${window.DesignBom.formatCompactRange(bom.rangeLow, bom.rangeHigh)} 보기">
              <span>${space}</span>
              <strong>${window.DesignBom.formatCompactRange(bom.rangeLow, bom.rangeHigh)}</strong>
              <small>약 ${bom.metrics.roomPyeong}평 공간</small>
            </button>`;
        }).join('')}
      </div>`;
  };

  const draw = () => {
    const q = state.complex.trim();
    const list = items.filter((it) =>
      (!state.region || it.region === state.region) &&
      matchArea(it) &&
      (!state.budget || it.budget === state.budget) &&
      (!state.spaceType || it.spaceType === state.spaceType) &&
      (!state.process || it.process === state.process) &&
      (!state.style || it.style === state.style) &&
      (!state.scope || it.scope === state.scope) &&
      (!state.year || String(it.year) === state.year) &&
      (!q || [it.title, it.style, it.mood, it.spaceType, (it.materials || []).join(' ')]
        .some((v) => v && String(v).toLowerCase().includes(q.toLowerCase()))));

    const hasActive = !!(state.complex && state.complex.trim()) || groups.some((g) => state[g.key]);
    const hasThirtyPerSpace = spaceTypes.length > 0 &&
      spaceTypes.every((space) => items.filter((item) => item.spaceType === space).length === 30);
    renderCostGuide();
    const countSummary = !hasActive && hasThirtyPerSpace
      ? `${spaceTypes.length}개 공간 · 공간별 30개 · 총 ${list.length}개 디자인`
      : `총 ${list.length}개 디자인`;
    countEl.innerHTML = countSummary +
      (hasActive ? ' · <button type="button" class="folio-reset" data-folio-reset>필터 초기화</button>' : '');
    emptyEl.hidden = list.length !== 0;
    if (list.length === 0) {
      emptyEl.innerHTML = '조건에 맞는 디자인이 없습니다. <button type="button" class="folio-reset" data-folio-reset>필터 초기화</button>';
    }

    const cardHTML = (i, idx) => {
      // 값이 있는 항목만 노출 (모르는 수치는 지어내지 않음)
      const bom = designBomFor(i);
      const specs = bom
        ? [
          ['기준 주택', i.area ? i.area + '평형' : null],
          ['공간 면적', `${bom.metrics.roomPyeong}평 · ${bom.metrics.floorM2}m²`],
          ['마감 등급', bom.tierLabel],
          ['공간 예상비용', costRangeFor(i), 'folio-cost-spec']
        ].filter(([, v]) => v)
        : [
          ['공간', i.spaceType],
          ['평수', i.area ? i.area + '평' : null],
          ['스타일', i.style],
          ['예산', i.cost || i.budget || null]
        ].filter(([, v]) => v);
      const badge = i.aiDesign ? `<span class="ai-badge">${i.trendLabel || '✨ AI 추천 디자인'}</span>`
        : (i.photo ? '' : '<span class="ai-badge">AI 스타일 참고 이미지</span>');
      const styleTag = i.style ? `<span class="folio-style-tag">${i.style}</span>` : '';
      return `
      <article class="folio reveal" data-id="${i.id}" tabindex="0" role="button" aria-label="${i.title} 상세보기">
        <div class="folio-photo">
          ${i.__designSheet ? portfolioSpriteMarkup(i, 'scene') : i.photo ? `<img class="scene" src="${i.photo}" alt="${i.imageAlt || i.title}" style="${portfolioPhotoStyle(i)}" loading="lazy" decoding="async" />` : roomScene(i, idx, i.afterColor)}
          ${badge}
          ${styleTag}
        </div>
        <div class="folio-info">
          <h3 class="folio-title">${i.title}</h3>
          ${styleFeelTagsMarkup(i, 'folio-feel-tags')}
          <dl class="folio-specs">
            ${specs.map(([k, v, className]) => `<div${className ? ` class="${className}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
          </dl>
          ${(i.palette || []).length ? `<div class="folio-palette" aria-hidden="true">${i.palette.map((c) => `<span style="background:${c}"></span>`).join('')}</div>` : ''}
          <span class="folio-more">${i.aiDesign ? '디자인 자세히 보기 →' : '사례 상세 보기 →'}</span>
        </div>
      </article>`;
    };

    const groupBySpace = !state.spaceType;
    const order = groupBySpace ? spaceTypes : (cfg.style || []);
    const grouped = {};
    list.forEach((it) => {
      const key = groupBySpace ? (it.spaceType || '기타') : (it.style || '기타');
      (grouped[key] = grouped[key] || []).push(it);
    });
    const keys = [
      ...order.filter((key) => grouped[key]),
      ...Object.keys(grouped).filter((key) => !order.includes(key))
    ];
    let gi = 0;
    grid.innerHTML = keys.map((key) =>
      `<h3 class="folio-group-head">${key} ${groupBySpace ? '디자인' : '스타일'} <em>${grouped[key].length}</em></h3>` +
      grouped[key].map((i) => cardHTML(i, gi++)).join('')
    ).join('');
    observeReveal();
  };

  const clearDownstream = (key) => {
    const downstream = {
      spaceType: ['style', 'area', 'budget'],
      style: ['area', 'budget'],
      area: ['budget']
    };
    (downstream[key] || []).forEach((nextKey) => { state[nextKey] = null; });
  };

  filtersEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.fg-chip');
    if (!chip || chip.disabled) return;
    const group = chip.closest('.folio-filter-group').dataset.group;
    state[group] = chip.dataset.val || null;
    clearDownstream(group);
    renderFilters();
    draw();
  });

  filtersEl.addEventListener('change', (e) => {
    const select = e.target.closest('.folio-filter-select');
    if (!select) return;
    const group = select.closest('.folio-filter-group').dataset.group;
    state[group] = select.value || null;
    clearDownstream(group);
    renderFilters();
    draw();
  });

  filtersEl.addEventListener('input', (e) => {
    if (e.target.id !== 'folioComplex') return;
    state.complex = e.target.value;
    draw();
  });

  if (costGuideEl) {
    costGuideEl.addEventListener('click', (e) => {
      const button = e.target.closest('[data-cost-space]');
      if (!button) return;
      state.spaceType = button.dataset.costSpace || null;
      clearDownstream('spaceType');
      renderFilters();
      draw();
    });
  }

  // 필터 초기화 (0건 탈출 + 활성 필터 리셋)
  function resetFilters() {
    state.complex = '';
    groups.forEach((g) => { state[g.key] = null; });
    renderFilters();
    draw();
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-folio-reset]')) resetFilters();
  });

  // 카드 클릭 → 상세 모달
  const openById = (id) => openFolioModal(items.find((x) => x.id === id), items);
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.folio');
    if (card) openById(card.dataset.id);
  });
  grid.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.folio')) {
      e.preventDefault();
      openById(e.target.closest('.folio').dataset.id);
    }
  });

  renderFilters();
  draw();
}

/* 색상 음영 조절 (#rrggbb) */
function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + amt);
  const g = clamp(((n >> 8) & 255) + amt);
  const b = clamp((n & 255) + amt);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* ---------- AI 생성 룸 장면 이미지 (SVG 일러스트) ----------
   각 사례의 색감(afterColor/beforeColor)과 공간종류에 맞춰
   인테리어 장면을 그려 카드/모달 이미지로 사용합니다. */
function roomScene(i, idx, baseColor) {
  const base = baseColor || i.afterColor || '#dcd3c7';
  const wall = shade(base, 16);
  const wallHi = shade(base, 34);
  const floor = shade(base, -36);
  const floorHi = shade(base, -18);
  const dark = shade(base, -78);
  const accent = shade(base, -48);
  const soft = shade(base, -24);
  const gid = 'sc_' + (i.id || 'x') + '_' + idx;
  const st = i.spaceType || '';
  const cat = i.category || '';

  let furniture;
  if (st === '카페' || st === '매장' || (cat === '상업' && st !== '오피스')) {
    furniture = `
      <line x1="150" y1="46" x2="150" y2="96" stroke="${dark}" stroke-width="2.5"/>
      <path d="M138 96 h24 l-4 14 h-16 z" fill="${accent}"/>
      <line x1="212" y1="46" x2="212" y2="84" stroke="${dark}" stroke-width="2.5"/>
      <path d="M202 84 h20 l-3 12 h-14 z" fill="${accent}"/>
      <rect x="118" y="196" width="176" height="60" rx="6" fill="${accent}"/>
      <rect x="114" y="188" width="184" height="12" rx="5" fill="${dark}"/>
      <rect x="150" y="228" width="9" height="34" fill="${dark}"/><circle cx="154.5" cy="224" r="12" fill="${soft}"/>
      <rect x="206" y="228" width="9" height="34" fill="${dark}"/><circle cx="210.5" cy="224" r="12" fill="${soft}"/>`;
  } else if (st === '오피스') {
    furniture = `
      <rect x="112" y="206" width="176" height="12" rx="3" fill="${accent}"/>
      <rect x="120" y="218" width="8" height="44" fill="${dark}"/><rect x="272" y="218" width="8" height="44" fill="${dark}"/>
      <rect x="150" y="164" width="62" height="42" rx="4" fill="${dark}"/><rect x="156" y="170" width="50" height="30" rx="2" fill="${wallHi}"/>
      <rect x="176" y="206" width="10" height="8" fill="${dark}"/>
      <rect x="232" y="210" width="36" height="18" rx="7" fill="${soft}"/><rect x="246" y="228" width="8" height="34" fill="${dark}"/>`;
  } else {
    furniture = `
      <ellipse cx="205" cy="266" rx="128" ry="15" fill="${floorHi}" opacity=".55"/>
      <rect x="112" y="210" width="158" height="48" rx="15" fill="${accent}"/>
      <rect x="112" y="182" width="158" height="36" rx="13" fill="${soft}"/>
      <rect x="122" y="198" width="42" height="28" rx="9" fill="${wall}"/><rect x="172" y="198" width="42" height="28" rx="9" fill="${wall}"/>
      <line x1="300" y1="150" x2="300" y2="256" stroke="${dark}" stroke-width="3"/>
      <path d="M286 150 h28 l-7 -22 h-14 z" fill="${wallHi}"/>`;
  }

  return `
  <svg class="scene" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${wallHi}"/><stop offset="1" stop-color="${wall}"/>
    </linearGradient></defs>
    <rect width="400" height="320" fill="url(#${gid})"/>
    <path d="M0 252 H400 V320 H0 Z" fill="${floor}"/>
    <path d="M0 252 H400 V260 H0 Z" fill="${floorHi}" opacity=".6"/>
    <rect x="40" y="70" width="92" height="112" rx="4" fill="${wallHi}" stroke="${dark}" stroke-width="3"/>
    <line x1="86" y1="70" x2="86" y2="182" stroke="${dark}" stroke-width="2"/>
    <line x1="40" y1="126" x2="132" y2="126" stroke="${dark}" stroke-width="2"/>
    <rect x="248" y="78" width="72" height="54" rx="3" fill="${wallHi}" stroke="${dark}" stroke-width="2"/>
    <rect x="332" y="214" width="26" height="34" rx="4" fill="${accent}"/>
    <path d="M345 214 C326 191 331 166 345 158 C359 166 364 191 345 214 Z" fill="${soft}"/>
    ${furniture}
  </svg>`;
}

/* ---------- 사례 상세 모달 (Before/After + 유사 사례) ---------- */
let __fmOpener = null; // 모달을 연 요소 — 닫을 때 포커스 복귀(접근성)

function openFolioModal(item, all) {
  if (!item) return;
  const modal = document.getElementById('folioModal');
  const body = document.getElementById('folioModalBody');
  // 첫 오픈일 때만 기억 (유사 사례로 내용 교체 시 원래 카드 유지)
  if (modal.hidden) __fmOpener = document.activeElement;
  // 유사도 점수: 스타일 일치 + 같은 카테고리 + 평수 근접
  const similar = all
    .filter((x) => x.id !== item.id)
    .map((x) => {
      let s = 0;
      if (item.style && x.style === item.style) s += 3;
      if (item.process && x.process === item.process) s += 2;
      if (item.spaceType && x.spaceType === item.spaceType) s += 2;
      if (x.category === item.category) s += 1;
      if (item.area && x.area) s += Math.max(0, 3 - Math.abs(x.area - item.area) / 6);
      return { x, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((o) => o.x);

  const simThumb = (s) => s.__designSheet
    ? portfolioSpriteMarkup(s, 'fm-sim-thumb')
    : s.photo
      ? `<span class="fm-sim-thumb" style="background-image:url('${s.photo}');background-size:cover;background-position:${s.photoPosition || 'center'}"></span>`
      : `<span class="fm-sim-thumb" style="background:linear-gradient(150deg, ${s.afterColor || '#cdb8a0'}, ${shade(s.afterColor || '#cdb8a0', -14)})"></span>`;
  const simSub = (s) => [s.spaceType, s.process || s.style].filter(Boolean).join(' · ') || '시공 사례';

  const mediaCap = item.aiDesign ? 'AI 추천 디자인 시안' : '시공 현장';
  const hasSingleMedia = !!(item.__designSheet || item.photo);
  const singleMedia = item.__designSheet
    ? portfolioSpriteMarkup(item, 'scene')
    : `<img class="scene" src="${item.photo}" alt="${item.imageAlt || item.title}" style="${portfolioPhotoStyle(item)}" />`;
  const media = hasSingleMedia
    ? `<figure class="fm-single"><div class="fm-img">${singleMedia}</div><figcaption>${mediaCap}</figcaption></figure>`
    : `<figure><div class="fm-img">${roomScene(item, 'b', item.beforeColor)}</div><figcaption>BEFORE</figcaption></figure>
       <figure><div class="fm-img">${roomScene(item, 'a', item.afterColor)}</div><figcaption class="after">AFTER</figcaption></figure>`;

  const headTag = item.style || item.process || item.category || '시공 사례';
  const headSub = [item.region, item.complex].filter(Boolean).join(' · ');
  const designBom = item.aiDesign && window.DesignBom
    ? (item.__designBom || window.DesignBom.build(item, window.MANMUL && window.MANMUL.materialCatalog))
    : null;
  const gridRows = [
    ['공간', item.spaceType],
    ['기준 주택', item.area ? item.area + '평형' : null],
    ['공간 면적', designBom ? `${designBom.metrics.roomPyeong}평 · ${designBom.metrics.floorM2}m²` : null],
    ['공간 예상비용', designBom ? window.DesignBom.formatCompactRange(designBom.rangeLow, designBom.rangeHigh) : (item.cost || item.budget)],
    ['마감 등급', designBom ? designBom.tierLabel : null],
    ['스타일', item.style],
    ['주요 공정', item.process],
    ['공사범위', item.scope],
    ['공사기간', item.period],
    ['지역', item.region]
  ].filter(([, v]) => v).slice(0, 6);
  const matLabel = item.aiDesign ? '추천 자재·마감' : '주요 자재';
  const tileNote = item.tileNote || (item.spaceType === '욕실'
    ? '욕실은 현장 배수구 위치와 바닥 높이를 실측한 뒤 물매와 재단선을 최종 확정합니다.'
    : '현장 치수에 따라 끝단 재단과 줄눈 시작 위치를 최종 조정합니다.');
  const cta = item.aiDesign ? '이 디자인으로 상담 신청' : '이 사례처럼 상담 신청';
  const designBomHtml = designBom && window.DesignBom ? window.DesignBom.render(designBom) : '';

  body.innerHTML = `
    <div class="fm-ba${hasSingleMedia ? ' fm-ba-single' : ''}">
      ${media}
    </div>
    <div class="fm-info">
      <div class="fm-head">
        <span class="fm-style">${headTag}</span>
        <h3 id="folioModalTitle">${item.title}</h3>
        ${styleFeelTagsMarkup(item, 'fm-feel-tags')}
        ${headSub ? `<p>${headSub}</p>` : ''}
        ${!item.__designSheet && item.imageCredit && item.imageSource ? `<a class="fm-image-credit" href="${item.imageSource}" target="_blank" rel="noopener">이미지: ${item.imageCredit} · Unsplash</a>` : ''}
      </div>
      ${gridRows.length ? `<dl class="fm-grid">${gridRows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
      ${(item.tilePlan || []).length ? `<div class="fm-block fm-tile-plan"><h4>실시공 타일 규격</h4><dl>${item.tilePlan.map((row) => `<div><dt>${row.label}</dt><dd>${row.value}</dd></div>`).join('')}</dl><p>${tileNote}</p></div>` : ''}
      ${(item.palette || []).length ? `<div class="fm-block"><h4>컬러 팔레트</h4><div class="fm-palette">${item.palette.map((c) => `<span style="background:${c}" title="${c}"></span>`).join('')}</div></div>` : ''}
      ${item.tip ? `<div class="fm-block"><h4>💡 AI 추천 포인트</h4><p>${item.tip}</p></div>` : ''}
      ${item.trendNote ? `<div class="fm-block fm-trend-note"><h4>트렌드 리서치</h4><p>${item.trendNote}</p></div>` : ''}
      ${item.problem ? `<div class="fm-block"><h4>핵심 문제</h4><p>${item.problem}</p></div>` : ''}
      ${item.solution ? `<div class="fm-block"><h4>해결 방법</h4><p>${item.solution}</p></div>` : ''}
      ${(item.materials || []).length ? `<div class="fm-block"><h4>${matLabel}</h4><div class="fm-tags">${item.materials.map((m) => `<span>${m}</span>`).join('')}</div></div>` : ''}
      ${designBomHtml}
      ${item.consent ? '<p class="fm-consent">✔ 고객 공개 동의 완료</p>' : ''}
      <a href="#inquiry" class="btn btn-primary btn-block" data-close>${cta}</a>
    </div>
    ${similar.length ? `
    <div class="fm-similar">
      <h4>비슷한 사례</h4>
      <div class="fm-similar-grid">
        ${similar.map((s) => `
          <button class="fm-sim" data-goto="${s.id}">
            ${simThumb(s)}
            <b>${s.title}</b><small>${simSub(s)}</small>
          </button>`).join('')}
      </div>
    </div>` : ''}`;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  const closeBtn = modal.querySelector('.folio-modal-close');
  if (closeBtn) closeBtn.focus();

  // 유사 사례 클릭 시 모달 내용 교체
  body.querySelectorAll('.fm-sim').forEach((b) => b.addEventListener('click', () => {
    openFolioModal(all.find((x) => x.id === b.dataset.goto), all);
  }));

  // '이 디자인으로 상담 신청' → 선택 디자인을 상담 폼으로 전달
  if (item.aiDesign) {
    const ctaBtn = body.querySelector('a[href="#inquiry"]');
    if (ctaBtn) ctaBtn.addEventListener('click', () => {
      if (window.MANMUL && typeof window.MANMUL.selectDesign === 'function') {
        window.MANMUL.selectDesign({
          id: item.id,
          title: item.title,
          style: item.style,
          spaceType: item.spaceType,
          area: item.area || null,
          budget: null,
          finishTier: designBom ? designBom.tierLabel : null,
          estimateTotal: designBom ? designBom.total : null,
          estimateRange: designBom ? window.DesignBom.formatCompactRange(designBom.rangeLow, designBom.rangeHigh) : null,
          estimateBasis: designBom ? `${designBom.metrics.roomPyeong}평 공간·${designBom.tierLabel} 사양` : null
        });
      }
    });
  }
}

function setupFolioModal() {
  const modal = document.getElementById('folioModal');
  if (!modal) return;
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    // 모달을 연 요소로 포커스 복귀 (요소가 재렌더로 사라졌으면 생략)
    if (__fmOpener && document.contains(__fmOpener)) { try { __fmOpener.focus(); } catch (e) {} }
    __fmOpener = null;
  };
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    // Tab 포커스 트랩: 모달 밖으로 새지 않게 순환
    const foci = modal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!foci.length) return;
    const first = foci[0], last = foci[foci.length - 1];
    if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  });
}

/* ---------- 면허·보증·A/S (신뢰) ---------- */
function renderTrust(trust) {
  if (!trust) return;
  const head = document.getElementById('trustHeadline');
  const sub = document.getElementById('trustSub');
  if (head && trust.headline) head.textContent = trust.headline;
  if (sub && trust.sub) sub.textContent = trust.sub;
  const grid = document.getElementById('trustGrid');
  if (grid && trust.items) {
    grid.innerHTML = trust.items.map((t) => `
      <article class="trust-card reveal">
        <div class="trust-icon">${ICONS[t.icon] || ICONS.badge}</div>
        <h3>${t.title}</h3>
        <p>${t.desc}</p>
      </article>`).join('');
  }
}

/* ---------- 리뷰 ---------- */
function renderReviews(reviews) {
  const section = document.getElementById('reviews');
  // 실제 고객 후기가 없으면 섹션을 숨긴다(허위 후기 미노출)
  if (!Array.isArray(reviews) || reviews.length === 0) {
    if (section) section.hidden = true;
    return;
  }
  if (section) section.hidden = false;
  document.getElementById('reviewsGrid').innerHTML = reviews.map((r) => `
    <article class="review reveal">
      ${r.rating ? `<div class="stars" aria-label="별점 ${r.rating}점">${'★'.repeat(r.rating)}${'☆'.repeat(Math.max(0, 5 - r.rating))}</div>` : ''}
      <p>“${r.text}”</p>
      <div class="who"><b>${r.name}</b><small>${r.space}</small></div>
    </article>`).join('');
}

/* ---------- 회사 소개 (About) ---------- */
function renderAbout(about) {
  if (!about) return;
  const body = document.getElementById('aboutBody');
  if (body && Array.isArray(about.paragraphs)) {
    body.innerHTML = about.paragraphs.map((p) => `<p>${p}</p>`).join('');
  }
  const vals = document.getElementById('aboutValues');
  if (vals && Array.isArray(about.values)) {
    vals.innerHTML = about.values.map((v) => `
      <div class="about-value reveal">
        <span class="av-icon" aria-hidden="true">${v.icon || ''}</span>
        <b>${v.title}</b>
        <p>${v.desc}</p>
      </div>`).join('');
  }
}

/* ---------- 인사이트 (블로그 미리보기) ---------- */
function renderInsights(insights) {
  const grid = document.getElementById('insightsGrid');
  if (!grid || !Array.isArray(insights) || !insights.length) return;
  // 최신 글이 홈에 먼저 보이도록 날짜 내림차순 (날짜 없으면 뒤로)
  const latest = insights.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  grid.innerHTML = latest.slice(0, 3).map((a) => `
    <a class="insight-card reveal" href="posts/${encodeURIComponent(a.slug)}.html">
      <span class="ic-cover" style="background:linear-gradient(150deg, ${a.cover || '#d8c3a5'}, ${shade(a.cover || '#d8c3a5', -16)})">
        ${a.image ? `<img class="ic-image" src="${a.image}" alt="${a.imageAlt || a.title}" loading="lazy" decoding="async">` : ''}
        <span class="ic-cat">${a.category}</span>
      </span>
      <span class="ic-body">
        <b>${a.title}</b>
        <span class="ic-excerpt">${a.excerpt}</span>
        <span class="ic-meta">${a.date} · ${a.readMin}분 읽기</span>
      </span>
    </a>`).join('');
}

/* ---------- 자주 묻는 질문 (FAQ) ---------- */
function renderFaq(faq) {
  const host = document.getElementById('faqList');
  if (!host || !Array.isArray(faq) || !faq.length) return;
  host.innerHTML = faq.map((f, i) => `
    <div class="faq-item reveal">
      <button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}" id="faq-q-${i}">
        <span>${f.q}</span><span class="faq-icon" aria-hidden="true">+</span>
      </button>
      <div class="faq-a" id="faq-a-${i}" role="region" aria-labelledby="faq-q-${i}" hidden>
        <p>${f.a}</p>
      </div>
    </div>`).join('');
  host.querySelectorAll('.faq-q').forEach((btn) => btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    btn.querySelector('.faq-icon').textContent = open ? '+' : '−';
    document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
  }));

  // FAQPage 구조화 데이터 주입 (검색 리치 결과)
  try {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  } catch (e) { /* noop */ }
}

/* ---------- 연락처 ---------- */
function renderContact(company) {
  const cfg = (window.MANMUL && window.MANMUL.config) || {};
  const kakao = cfg.kakao || {};
  const chatUrl = kakao.chatUrl || kakao.channelAddUrl || '';
  const kakaoReady = !!(kakao.ready && chatUrl);
  const rep = company.rep ? company.rep + (company.repTitle ? ' ' + company.repTitle : '') : '';
  const tel = company.phone ? 'tel:' + company.phone.replace(/[^0-9]/g, '') : '';
  const items = [
    { ic: '📞', label: '전화 상담', value: company.phone ? `<a href="${tel}">${company.phone}</a>` : '' },
    kakaoReady
      ? { ic: '💬', label: '카카오톡 채널', value: `<a href="${chatUrl}" id="contactKakao" target="_blank" rel="noopener">채널 추가 / 상담하기</a>` }
      : { ic: '💬', label: '카카오톡 채널', value: '준비 중 — 전화·문자로 상담해 주세요' },
    { ic: '✉️', label: '이메일', value: company.email ? `<a href="mailto:${company.email}">${company.email}</a>` : '' },
    { ic: '🧑‍🔧', label: '담당', value: rep },
    { ic: '🕐', label: '운영 시간', value: company.hours },
    { ic: '📍', label: '오시는 길', value: company.address },
    { ic: '🧾', label: '사업자등록번호', value: company.bizno }
  ].filter((i) => i.value && String(i.value).trim());
  document.getElementById('contactList').innerHTML = items.map((i) => `
    <li><span class="ic">${i.ic}</span><div><b>${i.label}</b>${i.value}</div></li>`).join('');
}

/* AI 예상견적은 js/estimate.js(대화식)에서 처리합니다. */

/* ---------- 연동 설정 로드 + 카카오톡 버튼 연결 ---------- */
async function loadConfig() {
  try {
    const res = await fetch('data/config.json', { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch (e) { /* noop */ }
  return null;
}

// 카카오 채널이 실제 개설(ready)되면 카카오 버튼을 노출, 아니면 전화가 기본 CTA.
// 미개설 채널로 유도하거나 운영자용 alert를 띄우지 않는다(정직·사용성).
function setupContactCtas(config, company) {
  const kakao = (config && config.kakao) || {};
  const chatUrl = kakao.chatUrl || kakao.channelAddUrl || '';
  const ready = !!(kakao.ready && chatUrl);
  // 데이터 로드 실패 시에도 전화 CTA는 동작해야 한다 (폴백 번호)
  const phoneRaw = (company && company.phone) || FALLBACK_CONTACT.phone;
  const tel = 'tel:' + phoneRaw.replace(/[^0-9]/g, '');

  // 전화 CTA 연결 (항상 동작)
  ['heroCall', 'fabCall', 'inquiryCall', 'utilPhone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && tel) el.setAttribute('href', tel);
  });

  // 카카오 준비 시에만 노출 + 연결
  ['heroKakao', 'fabKakao', 'inquiryKakao', 'contactKakao'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (ready) {
      el.hidden = false;
      el.setAttribute('href', chatUrl);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    } else {
      el.hidden = true;
    }
  });
}

/* ---------- 히어로 챗봇 애니메이션 ---------- */
function playHeroChat() {
  const box = document.getElementById('heroChat');
  const script = [
    { who: 'bot', text: '안녕하세요! 만물인테리어 루프 에이전트입니다 🤖' },
    { who: 'user', text: '34평 아파트 리모델링 견적이 궁금해요' },
    { who: 'bot', text: '표준형 기준 예상 견적을 30초 안에 계산해 드릴게요.' },
    { who: 'bot', text: '예상 견적: 약 ₩ 41,310,000 (현장 실측 후 확정)' },
    { who: 'user', text: '바로 상담 신청할게요!' }
  ];
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  const next = () => {
    if (i >= script.length) return;
    const m = script[i++];
    const b = document.createElement('div');
    b.className = 'bubble ' + m.who;
    b.textContent = m.text;
    box.appendChild(b);
    box.scrollTop = box.scrollHeight;
    if (reduce) next();          // 모션 최소화: 순차 등장 없이 즉시 전체 표시
    else setTimeout(next, 1100);
  };
  next();
}

/* ---------- 스크롤 리빌 ---------- */
let revealObserver;
function observeReveal() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
  }
  document.querySelectorAll('.reveal:not(.in)').forEach((el) => revealObserver.observe(el));
}

/* ---------- 헤더/내비게이션 UI ---------- */
function setupUI() {
  const header = document.getElementById('siteHeader');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 10);
  });

  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', false); }
  });

  document.getElementById('year').textContent = '2024–2026';
}

function setupPortfolioFabVisibility() {
  const portfolio = document.getElementById('portfolio');
  const fabGroup = document.querySelector('.fab-group');
  if (!portfolio || !fabGroup || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    document.body.classList.toggle('portfolio-in-view', entries.some((entry) => entry.isIntersecting));
  }, { rootMargin: '-72px 0px -72px 0px', threshold: 0 });
  observer.observe(portfolio);
}

/* ---------- 폴백 (데이터 로드 실패 시 index.html의 기본 문구 유지) ---------- */
// site.json 로드 실패 시에도 고객이 연락할 수 있도록 핵심 연락처는 하드코딩 폴백
const FALLBACK_CONTACT = { phone: '010-2397-8629', email: '1dncjf@naver.com', hours: '평일 09:00 - 17:30' };

function renderFallbackNotice() {
  const grid = document.getElementById('servicesGrid');
  if (grid && !grid.children.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--ink-soft)">콘텐츠를 일시적으로 불러오지 못했습니다. 새로고침하시거나, 아래 연락처로 문의해 주세요.<br/>📞 <a href="tel:' + FALLBACK_CONTACT.phone.replace(/[^0-9]/g, '') + '"><b>' + FALLBACK_CONTACT.phone + '</b></a> (' + FALLBACK_CONTACT.hours + ')</p>';
  }
  const cl = document.getElementById('contactList');
  if (cl && !cl.children.length) {
    const tel = 'tel:' + FALLBACK_CONTACT.phone.replace(/[^0-9]/g, '');
    cl.innerHTML = `
      <li><span class="ic">📞</span><div><b>전화 상담</b><a href="${tel}">${FALLBACK_CONTACT.phone}</a></div></li>
      <li><span class="ic">✉️</span><div><b>이메일</b><a href="mailto:${FALLBACK_CONTACT.email}">${FALLBACK_CONTACT.email}</a></div></li>
      <li><span class="ic">🕐</span><div><b>운영 시간</b>${FALLBACK_CONTACT.hours}</div></li>`;
  }

  // 데이터 없이는 AI 견적·상담 폼이 초기화되지 않으므로,
  // 입력해도 반응 없는 "죽은 UI" 대신 연락 경로를 안내한다
  const tel = 'tel:' + FALLBACK_CONTACT.phone.replace(/[^0-9]/g, '');
  const sms = 'sms:' + FALLBACK_CONTACT.phone.replace(/[^0-9]/g, '');
  const ceBody = document.getElementById('ceBody');
  if (ceBody && !ceBody.children.length) {
    ceBody.innerHTML = `<p style="padding:18px 4px;line-height:1.7">⚠ 콘텐츠를 일시적으로 불러오지 못해 AI 예상견적을 시작할 수 없습니다.<br/>
      새로고침하시거나, 전화로 바로 문의해 주세요. 📞 <a href="${tel}" style="color:inherit"><b>${FALLBACK_CONTACT.phone}</b></a></p>`;
  }
  const form = document.getElementById('inquiryForm');
  if (form) {
    form.innerHTML = `
      <div class="inquiry-done" role="status">
        <div class="done-check warn">⚠️</div>
        <h3>상담 폼을 불러오지 못했습니다</h3>
        <p>일시적인 오류입니다. 새로고침해 주시거나, 아래로 바로 연락 주세요.</p>
        <div class="done-actions">
          <a class="btn btn-primary btn-lg" href="${tel}">📞 전화 상담 ${FALLBACK_CONTACT.phone}</a>
          <a class="btn btn-ghost btn-lg" href="${sms}">✉️ 문자 문의</a>
        </div>
        <p class="done-eta">${FALLBACK_CONTACT.hours} 기준 빠르게 회신드립니다</p>
      </div>`;
  }
}

/* ---------- 부트스트랩 ---------- */
async function init() {
  setupUI();
  setupPortfolioFabVisibility();
  playHeroChat();

  const [data, config, materialCatalog] = await Promise.all([loadSite(), loadConfig(), loadMaterialCatalog()]);
  window.MANMUL = { config: config || {}, data: data || {}, materialCatalog: materialCatalog || { categories: [] } };

  setupContactCtas(config, data && data.company);

  if (!data) { renderFallbackNotice(); observeReveal(); return; }

  bindText(data);
  renderStats(data.stats);
  renderAbout(data.about);
  renderServices(data.services);
  renderAutomation(data.automation);
  renderProcess(data.process);
  renderPortfolio(data.portfolio, data.portfolioFilters);
  setupFolioModal();
  renderTrust(data.trust);
  renderReviews(data.reviews);
  renderInsights(data.insights);
  renderFaq(data.faq);
  renderContact(data.company);
  observeReveal();

  // 대화식 예상견적 결과를 상담 폼으로 넘기기 위해 노출
  window.MANMUL.lastEstimate = '';
  window.MANMUL.getEstimate = () => window.MANMUL.lastEstimate || '';

  // 선택한 AI 추천 디자인을 상담 폼으로 전달
  window.MANMUL.selectedDesign = null;
  window.MANMUL.selectDesign = (d) => {
    window.MANMUL.selectedDesign = d || null;
    document.dispatchEvent(new CustomEvent('manmul:design', { detail: d || null }));
  };
  window.MANMUL.getDesign = () => window.MANMUL.selectedDesign;

  // estimate.js(대화식 견적) 초기화
  if (typeof window.initEstimator === 'function') window.initEstimator(window.MANMUL);
  // inquiry.js 초기화 (body 끝에서 먼저 로드됨)
  if (typeof window.initInquiry === 'function') window.initInquiry(window.MANMUL);
}

document.addEventListener('DOMContentLoaded', init);
