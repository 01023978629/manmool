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
  room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>'
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

/* ---------- 포트폴리오 (필터 포함) ---------- */
function renderPortfolio(items) {
  const grid = document.getElementById('portfolioGrid');
  const filters = document.getElementById('portfolioFilters');
  const cats = ['전체', ...new Set(items.map((i) => i.category))];

  filters.innerHTML = cats.map((c, i) =>
    `<button class="filter-btn ${i === 0 ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('');

  const draw = (cat) => {
    const list = cat === '전체' ? items : items.filter((i) => i.category === cat);
    grid.innerHTML = list.map((i) => `
      <article class="folio reveal">
        <div class="folio-thumb" style="background:${i.color}">
          <span class="thumb-tag">${i.category}</span>
          ${ICONS.room}
        </div>
        <div class="folio-body">
          <h3>${i.title}</h3>
          <span>${i.area}</span>
        </div>
      </article>`).join('');
    observeReveal();
  };

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    draw(btn.dataset.cat);
  });

  draw('전체');
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

/* ---------- AI 견적 시뮬레이터 ---------- */
function setupEstimator(cfg) {
  const typeEl = document.getElementById('estType');
  const areaEl = document.getElementById('estArea');
  const areaOut = document.getElementById('estAreaOut');
  const amountEl = document.getElementById('estimateAmount');
  const rangeEl = document.getElementById('estimateRange');
  const gradeGroup = document.getElementById('gradeGroup');
  document.getElementById('estimatorNote').textContent = cfg.note;

  const calc = () => {
    const type = typeEl.value;
    const area = +areaEl.value;
    const grade = gradeGroup.querySelector('input:checked').value;
    const base = cfg.baseByType[type] || 900000;
    const mult = cfg.gradeMultiplier[grade] || 1;
    const total = base * mult * area;
    areaOut.textContent = area + '평';
    amountEl.textContent = won(total);
    rangeEl.textContent = `예상 범위 ${won(total * 0.9)} ~ ${won(total * 1.15)}`;
  };

  [typeEl, areaEl].forEach((el) => el.addEventListener('input', calc));
  gradeGroup.addEventListener('change', calc);
  calc();
}

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
  renderProcess(data.process);
  renderPortfolio(data.portfolio);
  renderReviews(data.reviews);
  renderContact(data.company);
  setupEstimator(data.estimator);
  observeReveal();

  // 견적 시뮬레이터 결과를 상담 폼으로 넘기기 위해 노출
  window.MANMUL.getEstimate = () => {
    const amount = document.getElementById('estimateAmount');
    return amount ? amount.textContent : '';
  };
  // inquiry.js 초기화 (body 끝에서 먼저 로드됨)
  if (typeof window.initInquiry === 'function') window.initInquiry(window.MANMUL);
}

document.addEventListener('DOMContentLoaded', init);
