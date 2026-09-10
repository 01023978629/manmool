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
  // Keep paragraph breaks and inline photos in the legacy ?post= view as well.
  const paragraphMarkup = (value) => String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n').trim().split(/\n[\t ]*\n+/)
    .map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const sectionMarkup = (section) => {
    let out = `<h2>${esc(section.h)}</h2>${paragraphMarkup(section.p)}`;
    if (section.img) {
      const extra = caseExtra(section.img, true).replace('(max-width: 1160px) 94vw, 1112px', '(max-width: 800px) 94vw, 712px');
      out += `<figure class="post-figure"><img src="${esc(section.img)}"${extra} alt="${esc(section.imgAlt || section.h)}" loading="lazy" decoding="async">${section.imgCaption ? `<figcaption>${esc(section.imgCaption)}</figcaption>` : ''}</figure>`;
    }
    if (section.video) {
      // 현장 동영상 — 정적 글(prerender-posts.py)과 같은 표식. 누르기 전엔 포스터만 받는다.
      const poster = section.videoPoster ? ` poster="${esc(section.videoPoster)}"` : '';
      const orient = section.videoOrientation ? ` data-orientation="${esc(section.videoOrientation)}"` : '';
      out += `<figure class="post-figure post-figure-video"><video controls preload="none" playsinline${poster}${orient} aria-label="${esc(section.videoAlt || section.videoCaption || section.h)}"><source src="${esc(section.video)}" type="video/mp4">브라우저가 동영상 재생을 지원하지 않습니다.</video>${section.videoCaption ? `<figcaption>${esc(section.videoCaption)}</figcaption>` : ''}</figure>`;
    }
    return out;
  };
  const absoluteImage = (a) => a.image
    ? 'https://01023978629.github.io/manmool/' + String(a.image).replace(/^\.\//, '')
    : 'https://01023978629.github.io/manmool/og-image.png';
  const articleService = (a) => a.service === 'leak'
    ? 'leak'
    : a.service === 'interior'
      ? 'interior'
      : (a.category === '방수·설비' || a.category === '누수탐지·수리') ? 'leak' : 'interior';
  const caseGroup = (a) => articleService(a) === 'leak' ? 'leak'
    : /견적|계약|보증|관리|브랜드/.test(a.category || '') ? 'info' : 'interior';
  const searchText = (a) => [a.title, a.excerpt, a.category,
    ...['site', 'issue', 'work', 'result'].map((key) => (a.caseSummary || {})[key])].filter(Boolean).join(' ');
  const finderMarkup = () => `
    <form class="case-finder" id="caseFinder" role="search" aria-label="시공 사례 검색" hidden>
      <div class="case-finder-fields">
        <div class="case-search-field"><label for="caseSearch">어떤 현장을 찾으세요?</label>
          <input id="caseSearch" type="search" maxlength="120" placeholder="아파트명·지역·작업명 검색" aria-describedby="caseSearchHint" autocomplete="off">
          <p id="caseSearchHint">예: 금호한사랑, 중구 난방관, 지하실 배관</p></div>
        <div class="case-sort-field"><label for="caseSort">정렬</label><select id="caseSort"><option value="newest">최신순</option><option value="oldest">오래된순</option></select></div>
      </div>
      <div class="case-filter-bar" role="group" aria-label="사례 분야 선택">
        ${[['all', '전체'], ['leak', '누수·배관'], ['interior', '인테리어'], ['info', '정보']].map(([value, label]) => `<button type="button" class="case-filter" data-case-filter="${value}" aria-pressed="${value === 'all'}">${label}</button>`).join('')}
      </div>
      <div class="case-finder-footer"><span>분야와 검색어를 함께 선택할 수 있습니다.</span><button type="button" class="case-reset" data-case-reset>전체 보기</button></div>
    </form>
    <p class="case-filter-status" id="caseFilterStatus" aria-live="polite"></p>
    <section class="case-empty" id="caseEmpty" aria-labelledby="caseEmptyTitle" hidden><h2 id="caseEmptyTitle">조건에 맞는 사례가 없습니다</h2><p>아파트명이나 작업명을 짧게 입력하거나, 다른 분야를 선택해 보세요.</p><div class="case-empty-actions"><button type="button" class="btn btn-primary" data-case-reset>전체 사례 다시 보기</button><a class="btn btn-ghost" id="caseEmptyInquiry" href="leak.html#leakInquiry">누수·배관 상담</a></div></section>`;
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
      ${finderMarkup()}
      <div class="insights-grid" style="margin-top:40px">
        ${list.map((a, idx) => `
          <a class="insight-card" href="posts/${encodeURIComponent(a.slug)}.html" data-group="${caseGroup(a)}" data-date="${esc(a.date)}" data-search="${esc(searchText(a))}">
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
        <p class="post-meta">${esc(a.date)} · ${esc(a.readMin)}분 읽기${a.updated && a.updated !== a.date ? ` · 수정 ${esc(a.updated)}` : ''}</p>
        <div class="post-cover" style="background:${cover(a)}">${image(a, 'post-cover-image', true)}</div>
        ${caseSummaryMarkup(a)}
        <div class="post-body">
          <p class="post-excerpt">${esc(a.excerpt)}</p>
          ${(a.body || []).map(sectionMarkup).join('')}
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
    const form = document.getElementById('caseFinder');
    if (!form || form.dataset.ready) return;
    const buttons = Array.from(form.querySelectorAll('[data-case-filter]'));
    const grid = root.querySelector('.insights-grid');
    const featured = root.querySelector('.insight-featured[data-group]');
    const slot = document.getElementById('caseFeaturedSlot');
    const cards = Array.from(root.querySelectorAll('a[data-group]'));
    const input = document.getElementById('caseSearch');
    const sort = document.getElementById('caseSort');
    const status = document.getElementById('caseFilterStatus');
    const empty = document.getElementById('caseEmpty');
    const inquiry = document.getElementById('caseEmptyInquiry');
    if (!buttons.length || !grid || !input || !sort || !status || !empty) return;
    form.dataset.ready = 'true';
    const normalize = (value) => String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR');
    const records = cards.map((card, index) => ({ card, index,
      text: normalize(card.dataset.search || card.textContent).replace(/\s/g, ''),
      date: card.dataset.date || '', group: card.dataset.group }));
    const featureLabel = featured && featured.querySelector('.ic-cat');
    const originalLabel = featureLabel && featureLabel.textContent;
    const featureImage = featured && featured.querySelector('img');
    const originalSizes = featureImage && featureImage.getAttribute('sizes');
    let group = 'all';
    let composing = false;

    // 검색어를 주소나 외부 서비스에 보내지 않고, 이 방문 기록 안에서만 복원한다.
    function restore() {
      const saved = history.state && history.state.manmoolCaseFinder;
      const category = new URLSearchParams(location.search).get('category');
      const validGroup = (value) => buttons.some((button) => button.dataset.caseFilter === value);
      group = saved && validGroup(saved.group) ? saved.group : validGroup(category) ? category : 'all';
      input.value = saved && typeof saved.query === 'string' ? saved.query.slice(0, 120) : '';
      sort.value = saved && saved.sort === 'oldest' ? 'oldest' : 'newest';
    }
    function apply(save = true) {
      const query = input.value.slice(0, 120).trim();
      const terms = normalize(query).split(/\s+/).filter(Boolean);
      const useFeatured = !query && group === 'all' && sort.value === 'newest';
      const matches = records.filter((record) => (group === 'all' || record.group === group)
        && terms.every((term) => record.text.includes(term)));
      const visible = new Set(matches.map((record) => record.card));
      const ordered = records.slice().sort((a, b) => {
        const dateOrder = a.date.localeCompare(b.date);
        return (sort.value === 'oldest' ? dateOrder : -dateOrder) || a.index - b.index;
      });
      if (featured && slot) {
        featured.classList.toggle('insight-featured', useFeatured);
        featured.classList.toggle('insight-card', !useFeatured);
        const kicker = featured.querySelector('.eyebrow');
        if (kicker) kicker.hidden = !useFeatured;
        if (featureLabel) featureLabel.textContent = useFeatured ? originalLabel : originalLabel.replace(/^최신 현장 · /, '');
        if (featureImage && originalSizes) featureImage.setAttribute('sizes', useFeatured ? originalSizes
          : '(max-width: 720px) 94vw, (max-width: 1130px) 46vw, 356px');
        slot.hidden = !useFeatured;
      }
      ordered.forEach(({ card }) => {
        card.hidden = !visible.has(card);
        (card === featured && slot && useFeatured ? slot : grid).appendChild(card);
      });
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.caseFilter === group)));
      const active = buttons.find((button) => button.dataset.caseFilter === group);
      status.textContent = `${active.textContent.trim()} ${matches.length}건${query ? ` · “${query}” 검색 결과` : ''}`;
      empty.hidden = matches.length !== 0;
      grid.hidden = matches.length === 0;
      if (inquiry) {
        const interior = group === 'interior';
        const info = group === 'info';
        inquiry.setAttribute('href', interior || info ? 'index.html#inquiry' : 'leak.html#leakInquiry');
        inquiry.textContent = interior ? '인테리어 상담' : info ? '공사 상담' : '누수·배관 상담';
      }
      if (save) {
        try {
          history.replaceState({ ...history.state, manmoolCaseFinder: { group, query: input.value.slice(0, 120), sort: sort.value } }, '');
        } catch (_) { /* 방문 기록 사용이 제한되어도 검색은 동작한다. */ }
      }
    }
    buttons.forEach((button) => button.addEventListener('click', () => { group = button.dataset.caseFilter; apply(); }));
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; apply(); });
    input.addEventListener('input', (event) => { if (!composing && !event.isComposing) apply(); });
    input.addEventListener('search', () => { if (!composing) apply(); });
    sort.addEventListener('change', () => apply());
    form.addEventListener('submit', (event) => { event.preventDefault(); if (!composing) apply(); });
    root.querySelectorAll('[data-case-reset]').forEach((button) => button.addEventListener('click', () => {
      input.value = ''; sort.value = 'newest'; group = 'all'; apply(); input.focus({ preventScroll: true });
    }));
    window.addEventListener('pageshow', (event) => { if (event.persisted) { restore(); apply(false); } });
    window.addEventListener('popstate', () => { restore(); apply(false); });
    restore();
    apply(false);
    form.hidden = false;
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
    else if (!root.querySelector('.insights-grid')) { renderList(insights); setupCaseFilters(); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
