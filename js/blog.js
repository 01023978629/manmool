/* ============================================================
   인사이트(블로그) — 목록 / 단일 글
   데이터: data/site.json 의 insights[]
   ?post=<slug> 이면 해당 글을, 없으면 전체 목록을 표시합니다.
   ============================================================ */
(function () {
  const root = document.getElementById('blogRoot');

  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex || '#d8c3a5';
    const n = parseInt(m[1], 16);
    const c = (v) => Math.max(0, Math.min(255, v));
    return '#' + ((c(((n >> 16) & 255) + amt) << 16) | (c(((n >> 8) & 255) + amt) << 8) | c((n & 255) + amt)).toString(16).padStart(6, '0');
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cover = (a) => `linear-gradient(150deg, ${a.cover || '#d8c3a5'}, ${shade(a.cover || '#d8c3a5', -16)})`;
  // 사례 사진은 resized/ 축소본(480w/960w)을 srcset 으로 — 원본(최대 1800px)을
  // 목록 카드에 그대로 내보내면 휴대폰에서 카드 한 칸에 400KB 넘게 받는다.
  const caseExtra = (src, wide) => {
    const m = /^assets\/cases\/([A-Za-z0-9._-]+)\.jpg$/.exec(String(src || ''));
    if (!m) return '';
    const p = 'assets/cases/resized/' + m[1];
    // wide = 대표(featured) 카드 — 한 칸이 아니라 전체 폭이라 sizes 가 다르다
    //        (prerender-posts.py 의 featured 와 같은 값이어야 로드 후 마크업이 안 어긋난다)
    const sizes = wide ? '(max-width: 1160px) 94vw, 1112px'
      : '(max-width: 720px) 94vw, (max-width: 1130px) 46vw, 356px';
    return ` srcset="${p}-480w.jpg 480w, ${p}-960w.jpg 960w" sizes="${sizes}"`;
  };
  const image = (a, className, priority) => a.image
    ? `<img class="${className}" src="${esc(a.image)}"${caseExtra(a.image, priority)} alt="${esc(a.imageAlt || a.title)}"${priority ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"'} decoding="async">`
    : '';
  const absoluteImage = (a) => a.image
    ? 'https://01023978629.github.io/manmool/' + String(a.image).replace(/^\.\//, '')
    : 'https://01023978629.github.io/manmool/og-image.png';
  const articleService = (a) => a.service === 'leak'
    ? 'leak'
    : a.service === 'interior'
      ? 'interior'
      : (a.category === '방수·설비' || a.category === '누수탐지·수리') ? 'leak' : 'interior';
  const caseSummaryFields = [
    ['site', '현장'],
    ['issue', '문제'],
    ['work', '작업'],
    ['result', '결과']
  ];
  const caseSummaryMarkup = (a) => {
    const summary = a.caseSummary;
    if (!summary || typeof summary !== 'object'
      || !caseSummaryFields.every(([key]) => typeof summary[key] === 'string' && summary[key].trim())) return '';
    const items = caseSummaryFields.map(([key, label]) => `
      <div class="post-summary-item"><dt>${label}</dt><dd>${esc(summary[key]).replace(/\r?\n/g, '<br>')}</dd></div>`).join('');
    return `<section class="post-summary" aria-labelledby="caseSummaryTitle">
      <div class="post-summary-head"><span class="post-summary-kicker">작업 핵심</span><h2 id="caseSummaryTitle">현장 작업 한눈에 보기</h2></div>
      <dl class="post-summary-grid">${items}</dl>
    </section>`;
  };
  const selectRelated = (a, list) => {
    const others = list.filter((item) => item.slug !== a.slug);
    const sameService = others.filter((item) => articleService(item) === articleService(a));
    const otherService = others.filter((item) => articleService(item) !== articleService(a));
    return sameService.concat(otherService).slice(0, 3);
  };

  function renderList(list) {
    document.title = '누수·배관 사례와 인테리어 기록 · 만물인테리어';
    list = list.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); // 최신순
    root.innerHTML = `
      <div class="section-head" style="text-align:center">
        <span class="eyebrow">INSIGHTS</span>
        <h1>누수·배관 사례부터 인테리어까지</h1>
        <p class="section-sub" style="margin:12px auto 0">누수탐지·배관·방수 실제 현장을 먼저, 인테리어 시공·견적·보증 안내도 함께 기록합니다.</p>
      </div>
      <div class="insights-grid" style="margin-top:40px">
        ${list.map((a, idx) => `
          <a class="insight-card" href="posts/${encodeURIComponent(a.slug)}.html">
            <span class="ic-cover" style="background:${cover(a)}">${image(a, 'ic-image', idx === 0)}<span class="ic-cat">${esc(a.category)}</span></span>
            <span class="ic-body">
              <b>${esc(a.title)}</b>
              <span class="ic-excerpt">${esc(a.excerpt)}</span>
              <span class="ic-meta">${esc(a.date)} · ${esc(a.readMin)}분 읽기</span>
            </span>
          </a>`).join('')}
      </div>`;
  }

  // 글별 SEO: 제목·설명·canonical·OG를 해당 글로 교체
  // canonical은 정적 프리렌더 페이지(posts/<slug>.html)를 가리킨다 —
  // ?post= 뷰는 그 정적 페이지의 중복본으로 통합(consolidate)된다
  function applyPostSeo(a) {
    const url = 'https://01023978629.github.io/manmool/posts/' + encodeURIComponent(a.slug) + '.html';
    const set = (sel, attr, val) => { const el = document.querySelector(sel); if (el) el.setAttribute(attr, val); };
    set('meta[name="description"]', 'content', a.excerpt || '');
    set('link[rel="canonical"]', 'href', url);
    set('meta[property="og:url"]', 'content', url);
    set('meta[property="og:title"]', 'content', a.title + ' · 만물인테리어');
    set('meta[property="og:description"]', 'content', a.excerpt || '');
    set('meta[property="og:image"]', 'content', absoluteImage(a));
  }

  function renderArticle(a, list) {
    document.title = `${a.title} · 만물인테리어`;
    applyPostSeo(a);
    const related = selectRelated(a, list);
    const leakArticle = articleService(a) === 'leak';
    const sourceMarkup = Array.isArray(a.sources) && a.sources.length
      ? `<aside class="post-sources" aria-label="공식 출처">
          <h2>공식 출처</h2><p>확인일 ${esc(a.sourcesChecked || '')}</p>
          <ul>${a.sources.map((source) => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || source.url)}</a></li>`).join('')}</ul>
        </aside>`
      : '';
    const articleCta = leakArticle
      ? `<div class="post-cta">
          <p data-service="leak">누수 원인과 필요한 공사 범위는 현장 확인 후 안내합니다.</p>
          <a href="leak.html?case=${encodeURIComponent(a.slug)}#leakInquiry" class="btn btn-primary">누수 증상 남기기</a>
          <a href="tel:01023978629" class="btn btn-ghost">전화 상담</a>
        </div>`
      : `<div class="post-cta">
          <p data-service="interior">예상 범위는 참고용이며, 최종 범위·금액은 실측 후 확정됩니다.</p>
          <a href="index.html#estimator" class="btn btn-primary">예상 범위 확인</a>
          <a href="index.html#inquiry" class="btn btn-ghost">인테리어 상담</a>
        </div>`;
    root.innerHTML = `
      <article class="post">
        <a class="post-back" href="blog.html">← 인사이트 목록</a>
        <span class="post-cat">${esc(a.category)}</span>
        <h1 class="post-title">${esc(a.title)}</h1>
        <p class="post-meta">${esc(a.date)} · ${esc(a.readMin)}분 읽기</p>
        <div class="post-cover" style="background:${cover(a)}">${image(a, 'post-cover-image', true)}</div>
        ${caseSummaryMarkup(a)}
        <div class="post-body">
          <p class="post-excerpt">${esc(a.excerpt)}</p>
          ${(a.body || []).map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('')}
          ${sourceMarkup}
        </div>
        ${articleCta}
      </article>
      ${related.length ? `
      <div class="post-related">
        <h3>다른 인사이트</h3>
        <div class="insights-grid">
          ${related.map((x) => `
            <a class="insight-card" href="posts/${encodeURIComponent(x.slug)}.html">
              <span class="ic-cover" style="background:${cover(x)}">${image(x, 'ic-image')}<span class="ic-cat">${esc(x.category)}</span></span>
              <span class="ic-body"><b>${esc(x.title)}</b><span class="ic-meta">${esc(x.date)} · ${esc(x.readMin)}분 읽기</span></span>
            </a>`).join('')}
        </div>
      </div>` : ''}`;

    // BlogPosting 구조화 데이터
    try {
      const ld = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: a.title,
        description: a.excerpt,
        articleSection: a.category,
        datePublished: a.date,
        image: absoluteImage(a),
        author: { '@type': 'Organization', name: '만물인테리어' },
        publisher: { '@type': 'Organization', name: '만물인테리어' },
        mainEntityOfPage: 'https://01023978629.github.io/manmool/posts/' + encodeURIComponent(a.slug) + '.html'
      };
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(ld);
      document.head.appendChild(s);
    } catch (e) { /* noop */ }
  }

  function setupCaseFilters() {
    const buttons = Array.from(document.querySelectorAll('[data-case-filter]'));
    const cards = Array.from(document.querySelectorAll('.insights-grid .insight-card[data-group]'));
    const featured = document.querySelector('.insight-featured[data-group]');
    const status = document.getElementById('caseFilterStatus');
    if (!buttons.length || !cards.length || !status) return;

    const apply = (group) => {
      let visible = 0;
      cards.forEach((card) => {
        const show = group === 'all' || card.dataset.group === group;
        card.hidden = !show;
        if (show) visible += 1;
      });
      if (featured) {
        const showFeatured = group === 'all' || featured.dataset.group === group;
        featured.hidden = !showFeatured;
        if (showFeatured) visible += 1;
      }
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.caseFilter === group)));
      const active = buttons.find((button) => button.dataset.caseFilter === group);
      status.textContent = `${active ? active.textContent.trim() : '전체'} ${visible}건`;
    };

    buttons.forEach((button) => button.addEventListener('click', () => apply(button.dataset.caseFilter)));
    apply('all');
  }

  // 헤더 내비 토글 — main.js는 이 페이지에 로드되지 않으므로 여기서 배선한다
  function setupNav() {
    const toggle = document.getElementById('navToggle');
    const nav = document.getElementById('mainNav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    nav.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', false); }
    });
  }

  async function init() {
    setupNav();
    setupCaseFilters();
    const slug = new URLSearchParams(location.search).get('post');
    // blog.html 은 검색엔진·느린 회선에서도 보이도록 목록을 정적으로 품고 있다.
    // 목록 화면에서는 이미 있는 HTML을 정본으로 쓰고 불필요한 fetch/재렌더를 하지 않는다.
    if (!slug && root && root.querySelector('.insights-grid')) return;
    let insights = [];
    try {
      const r = await fetch('data/site.json', { cache: 'no-cache' });
      if (r.ok) insights = ((await r.json()).insights || []).filter((x) => x && x.published !== false);
    } catch (e) { /* noop */ }

    if (!insights.length) {
      // 프리렌더된 내용이 있으면 통신 실패 문구로 지우지 않는다.
      if (root && root.children.length) return;
      root.innerHTML = '<p class="blog-loading">콘텐츠를 일시적으로 불러오지 못했습니다. 새로고침해 주시거나, 급하시면 전화로 문의해 주세요.<br/>📞 <a href="tel:01023978629"><b>010-2397-8629</b></a> (평일 09:00–17:30)</p>';
      return;
    }
    const found = slug && insights.find((x) => x.slug === slug);
    if (found) renderArticle(found, insights);
    else { renderList(insights); setupCaseFilters(); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
