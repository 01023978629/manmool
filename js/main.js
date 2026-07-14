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
function renderPortfolio(items, filterConfig) {
  const grid = document.getElementById('portfolioGrid');
  const filtersEl = document.getElementById('portfolioFilters');
  const countEl = document.getElementById('portfolioCount');
  const emptyEl = document.getElementById('portfolioEmpty');
  const cfg = filterConfig || {};

  // 데이터에서 옵션 파생 (지역·공간종류·연도)
  const uniq = (key) => [...new Set(items.map((x) => x[key]).filter((v) => v != null))];
  const regions = uniq('region');
  const spaceTypes = uniq('spaceType');
  const years = uniq('year').sort((a, b) => b - a);

  // 선택 상태 (그룹별 단일 선택, null = 전체) + 아파트명 텍스트 검색
  const state = { region: null, area: null, budget: null, spaceType: null, style: null, scope: null, year: null, complex: '' };

  const groups = [
    { key: 'region', label: '지역', options: regions },
    { key: 'area', label: '평수', options: (cfg.area || []).map((a) => a.label) },
    { key: 'budget', label: '공사비', options: cfg.budget || [] },
    { key: 'spaceType', label: '공간종류', options: spaceTypes },
    { key: 'style', label: '스타일', options: cfg.style || [] },
    { key: 'scope', label: '공사범위', options: cfg.scope || [] },
    { key: 'year', label: '공사연도', options: years.map((y) => String(y)) }
  ];

  filtersEl.innerHTML = `
    <div class="folio-search">
      <input type="search" id="folioComplex" placeholder="아파트명·단지명 검색 (예: 도안)" aria-label="아파트명 검색" />
      <span class="folio-ai-note">🤖 사진을 업로드하면 AI가 지역·평수·스타일을 자동 분류합니다</span>
    </div>
    ${groups.map((g) => `
    <div class="folio-filter-group" data-group="${g.key}">
      <span class="fg-label">${g.label}</span>
      <div class="fg-chips">
        <button class="fg-chip active" data-val="">전체</button>
        ${g.options.map((o) => `<button class="fg-chip" data-val="${o}">${o}</button>`).join('')}
      </div>
    </div>`).join('')}`;

  const matchArea = (item) => {
    if (!state.area) return true;
    const range = (cfg.area || []).find((a) => a.label === state.area);
    if (!range) return true;
    return item.area >= range.min && item.area < range.max;
  };

  // 저장(♡) 스크랩 — 오늘의집 스타일
  const SAVE_KEY = 'manmul_saved';
  const saved = (() => { try { return new Set(JSON.parse(localStorage.getItem(SAVE_KEY)) || []); } catch (e) { return new Set(); } })();
  const persistSaved = () => localStorage.setItem(SAVE_KEY, JSON.stringify([...saved]));
  const likesOf = (i) => (i.likes || 0) + (saved.has(i.id) ? 1 : 0);

  state.sort = '추천';
  state.savedOnly = false;
  const SORTS = ['추천', '인기순', '최신순', '저장'];
  const sortEl = document.getElementById('portfolioSort');
  const renderSort = () => {
    if (!sortEl) return;
    sortEl.innerHTML = SORTS.map((s) => {
      const active = (s === '저장') ? state.savedOnly : (!state.savedOnly && state.sort === s);
      const label = s === '저장' ? `♥ 저장${saved.size ? ' ' + saved.size : ''}` : s;
      return `<button class="sort-chip ${active ? 'active' : ''}" data-sort="${s}">${label}</button>`;
    }).join('');
  };

  const RATIOS = ['4 / 5', '1 / 1', '4 / 3', '3 / 4', '1 / 1', '4 / 5', '3 / 4', '4 / 3'];

  const draw = () => {
    const q = state.complex.trim();
    let list = items.filter((it) =>
      (!state.region || it.region === state.region) &&
      matchArea(it) &&
      (!state.budget || it.budget === state.budget) &&
      (!state.spaceType || it.spaceType === state.spaceType) &&
      (!state.style || it.style === state.style) &&
      (!state.scope || it.scope === state.scope) &&
      (!state.year || String(it.year) === state.year) &&
      (!q || (it.complex && it.complex.includes(q)) || (it.title && it.title.includes(q))));

    if (state.savedOnly) list = list.filter((it) => saved.has(it.id));
    if (state.savedOnly || state.sort === '인기순') list = [...list].sort((a, b) => likesOf(b) - likesOf(a));
    else if (state.sort === '최신순') list = [...list].sort((a, b) => (b.year - a.year) || (likesOf(b) - likesOf(a)));

    countEl.textContent = `${list.length}개 사례`;
    emptyEl.hidden = list.length !== 0;
    grid.innerHTML = list.map((i, idx) => {
      const on = saved.has(i.id);
      const tags = (i.photoTags || [i.style]).slice(0, 2);
      return `
      <article class="folio reveal" data-id="${i.id}" tabindex="0" role="button" aria-label="${i.title} 상세보기">
        <div class="folio-photo" style="aspect-ratio:${RATIOS[idx % RATIOS.length]};background:linear-gradient(150deg, ${i.afterColor}, ${shade(i.afterColor, -16)})">
          ${ICONS.room}
          <button class="save-btn ${on ? 'on' : ''}" data-save="${i.id}" aria-label="저장" aria-pressed="${on}">${on ? '♥' : '♡'}</button>
          <div class="photo-tags">${tags.map((t) => `<span>#${t}</span>`).join('')}</div>
        </div>
        <div class="folio-info">
          <h3>${i.title}</h3>
          <p class="folio-sub">${i.region} · ${i.spaceType} · ${i.area}평</p>
          <div class="folio-foot">
            <span class="folio-budget">${i.budget}</span>
            <span class="folio-likes ${on ? 'liked' : ''}">♥ ${likesOf(i).toLocaleString('ko-KR')}</span>
          </div>
        </div>
      </article>`;
    }).join('');
    observeReveal();
  };

  filtersEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.fg-chip');
    if (!chip) return;
    const group = chip.closest('.folio-filter-group').dataset.group;
    chip.parentElement.querySelectorAll('.fg-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state[group] = chip.dataset.val || null;
    draw();
  });

  const complexInput = document.getElementById('folioComplex');
  if (complexInput) complexInput.addEventListener('input', (e) => { state.complex = e.target.value; draw(); });

  if (sortEl) sortEl.addEventListener('click', (e) => {
    const b = e.target.closest('.sort-chip');
    if (!b) return;
    const s = b.dataset.sort;
    if (s === '저장') state.savedOnly = !state.savedOnly;
    else { state.savedOnly = false; state.sort = s; }
    renderSort(); draw();
  });

  // 카드 클릭 → 상세 모달 (저장 버튼은 제외)
  const openById = (id) => openFolioModal(items.find((x) => x.id === id), items);
  grid.addEventListener('click', (e) => {
    const saveBtn = e.target.closest('.save-btn');
    if (saveBtn) {
      e.stopPropagation();
      const id = saveBtn.dataset.save;
      if (saved.has(id)) saved.delete(id); else saved.add(id);
      persistSaved(); renderSort(); draw();
      return;
    }
    const card = e.target.closest('.folio');
    if (card) openById(card.dataset.id);
  });
  grid.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.folio')) {
      e.preventDefault();
      openById(e.target.closest('.folio').dataset.id);
    }
  });

  renderSort();
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

/* ---------- 사례 상세 모달 (Before/After + 유사 사례) ---------- */
function openFolioModal(item, all) {
  if (!item) return;
  const modal = document.getElementById('folioModal');
  const body = document.getElementById('folioModalBody');
  // 유사도 점수: 스타일 일치 + 같은 카테고리 + 평수 근접
  const similar = all
    .filter((x) => x.id !== item.id)
    .map((x) => {
      let s = 0;
      if (x.style === item.style) s += 3;
      if (x.category === item.category) s += 1;
      s += Math.max(0, 3 - Math.abs(x.area - item.area) / 6);
      return { x, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map((o) => o.x);

  body.innerHTML = `
    <div class="fm-ba">
      <figure><div class="fm-img" style="background:linear-gradient(150deg, ${item.beforeColor}, ${shade(item.beforeColor, -12)})">${ICONS.room}</div><figcaption>BEFORE</figcaption></figure>
      <figure><div class="fm-img" style="background:linear-gradient(150deg, ${item.afterColor}, ${shade(item.afterColor, -14)})">${ICONS.room}</div><figcaption class="after">AFTER</figcaption></figure>
    </div>
    <div class="fm-info">
      <div class="fm-head">
        <span class="fm-style">${item.style}</span>
        <h3 id="folioModalTitle">${item.title}</h3>
        <p>${item.region} · ${item.complex}</p>
      </div>
      <dl class="fm-grid">
        <div><dt>면적</dt><dd>${item.area}평</dd></div>
        <div><dt>공사기간</dt><dd>${item.period}</dd></div>
        <div><dt>예산구간</dt><dd>${item.budget}</dd></div>
        <div><dt>공사범위</dt><dd>${item.scope}</dd></div>
      </dl>
      <div class="fm-block"><h4>핵심 문제</h4><p>${item.problem}</p></div>
      <div class="fm-block"><h4>해결 방법</h4><p>${item.solution}</p></div>
      <div class="fm-block"><h4>주요 자재</h4><div class="fm-tags">${(item.materials || []).map((m) => `<span>${m}</span>`).join('')}</div></div>
      ${item.consent ? '<p class="fm-consent">✔ 고객 공개 동의 완료</p>' : ''}
      <a href="#inquiry" class="btn btn-primary btn-block" data-close>이 사례처럼 상담 신청</a>
    </div>
    ${similar.length ? `
    <div class="fm-similar">
      <h4>비슷한 사례</h4>
      <div class="fm-similar-grid">
        ${similar.map((s) => `
          <button class="fm-sim" data-goto="${s.id}">
            <span class="fm-sim-thumb" style="background:linear-gradient(150deg, ${s.afterColor}, ${shade(s.afterColor, -14)})"></span>
            <b>${s.title}</b><small>${s.area}평 · ${s.style}</small>
          </button>`).join('')}
      </div>
    </div>` : ''}`;

  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  // 유사 사례 클릭 시 모달 내용 교체
  body.querySelectorAll('.fm-sim').forEach((b) => b.addEventListener('click', () => {
    openFolioModal(all.find((x) => x.id === b.dataset.goto), all);
  }));
}

function setupFolioModal() {
  const modal = document.getElementById('folioModal');
  if (!modal) return;
  const close = () => { modal.hidden = true; document.body.style.overflow = ''; };
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
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
  document.getElementById('reviewsGrid').innerHTML = reviews.map((r) => `
    <article class="review reveal">
      <div class="stars">★★★★★</div>
      <p>“${r.text}”</p>
      <div class="who"><b>${r.name}</b><small>${r.space}</small></div>
    </article>`).join('');
}

/* ---------- 연락처 ---------- */
function renderContact(company) {
  const items = [
    { ic: '📞', label: '전화 상담', value: company.phone },
    { ic: '💬', label: '카카오톡 채널', value: '<a href="#" id="contactKakao">채널 추가 / 상담하기</a>' },
    { ic: '✉️', label: '이메일', value: company.email },
    { ic: '🕐', label: '운영 시간', value: company.hours },
    { ic: '📍', label: '오시는 길', value: company.address }
  ];
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

function setupKakao(config) {
  const kakao = (config && config.kakao) || {};
  const chatUrl = kakao.chatUrl || kakao.channelAddUrl || '#';
  const addUrl = kakao.channelAddUrl || kakao.chatUrl || '#';
  const open = (url) => window.open(url, '_blank', 'noopener');

  const bind = (id, url) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (!url || url === '#') {
        alert('카카오톡 채널이 아직 연결되지 않았습니다.\n운영자는 data/config.json의 kakao 설정을 입력하세요.');
        return;
      }
      open(url);
    });
  };
  bind('heroKakao', chatUrl);
  bind('inquiryKakao', chatUrl);
  bind('fabKakao', chatUrl);
  bind('contactKakao', addUrl);
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
  let i = 0;
  const next = () => {
    if (i >= script.length) return;
    const m = script[i++];
    const b = document.createElement('div');
    b.className = 'bubble ' + m.who;
    b.textContent = m.text;
    box.appendChild(b);
    box.scrollTop = box.scrollHeight;
    setTimeout(next, 1100);
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

/* ---------- 폴백 (데이터 로드 실패 시 index.html의 기본 문구 유지) ---------- */
function renderFallbackNotice() {
  const grid = document.getElementById('servicesGrid');
  if (grid && !grid.children.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--ink-soft)">콘텐츠를 불러오지 못했습니다. 로컬 서버(예: <code>python3 -m http.server</code>)로 실행해 주세요.</p>';
  }
}

/* ---------- 부트스트랩 ---------- */
async function init() {
  setupUI();
  playHeroChat();

  const [data, config] = await Promise.all([loadSite(), loadConfig()]);
  window.MANMUL = { config: config || {}, data: data || {} };

  setupKakao(config);

  if (!data) { renderFallbackNotice(); observeReveal(); return; }

  bindText(data);
  renderStats(data.stats);
  renderServices(data.services);
  renderAutomation(data.automation);
  renderProcess(data.process);
  renderPortfolio(data.portfolio, data.portfolioFilters);
  setupFolioModal();
  renderTrust(data.trust);
  renderReviews(data.reviews);
  renderContact(data.company);
  observeReveal();

  // 대화식 예상견적 결과를 상담 폼으로 넘기기 위해 노출
  window.MANMUL.lastEstimate = '';
  window.MANMUL.getEstimate = () => window.MANMUL.lastEstimate || '';

  // estimate.js(대화식 견적) 초기화
  if (typeof window.initEstimator === 'function') window.initEstimator(window.MANMUL);
  // inquiry.js 초기화 (body 끝에서 먼저 로드됨)
  if (typeof window.initInquiry === 'function') window.initInquiry(window.MANMUL);
}

document.addEventListener('DOMContentLoaded', init);
