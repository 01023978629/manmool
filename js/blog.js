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
  const image = (a, className, priority) => a.image
    ? `<img class="${className}" src="${esc(a.image)}" alt="${esc(a.imageAlt || a.title)}"${priority ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`
    : '';
  const absoluteImage = (a) => a.image
    ? 'https://01023978629.github.io/manmool/' + String(a.image).replace(/^\.\//, '')
    : 'https://01023978629.github.io/manmool/og-image.png';

  function renderList(list) {
    document.title = '인사이트 · 만물인테리어';
    list = list.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); // 최신순
    root.innerHTML = `
      <div class="section-head" style="text-align:center">
        <span class="eyebrow">INSIGHTS</span>
        <h1>인테리어, 알고 시작하면 다릅니다</h1>
        <p class="section-sub" style="margin:12px auto 0">견적·계약·보증까지 — 후회 없는 선택을 돕는 만물인테리어의 콘텐츠.</p>
      </div>
      <div class="insights-grid" style="margin-top:40px">
        ${list.map((a) => `
          <a class="insight-card" href="blog.html?post=${encodeURIComponent(a.slug)}">
            <span class="ic-cover" style="background:${cover(a)}">${image(a, 'ic-image', true)}<span class="ic-cat">${esc(a.category)}</span></span>
            <span class="ic-body">
              <b>${esc(a.title)}</b>
              <span class="ic-excerpt">${esc(a.excerpt)}</span>
              <span class="ic-meta">${esc(a.date)} · ${esc(a.readMin)}분 읽기</span>
            </span>
          </a>`).join('')}
      </div>`;
  }

  // 글별 SEO: 제목·설명·canonical·OG를 해당 글로 교체
  // (canonical이 목록(blog.html)을 가리키면 검색엔진이 모든 글을 중복으로 취급한다)
  function applyPostSeo(a) {
    const url = 'https://01023978629.github.io/manmool/blog.html?post=' + encodeURIComponent(a.slug);
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
    const related = list.filter((x) => x.slug !== a.slug).slice(0, 3);
    root.innerHTML = `
      <article class="post">
        <a class="post-back" href="blog.html">← 인사이트 목록</a>
        <span class="post-cat">${esc(a.category)}</span>
        <h1 class="post-title">${esc(a.title)}</h1>
        <p class="post-meta">${esc(a.date)} · ${esc(a.readMin)}분 읽기</p>
        <div class="post-cover" style="background:${cover(a)}">${image(a, 'post-cover-image', true)}</div>
        <div class="post-body">
          <p class="post-excerpt">${esc(a.excerpt)}</p>
          ${(a.body || []).map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('')}
        </div>
        <div class="post-cta">
          <p>더 정확한 금액이 궁금하신가요?</p>
          <a href="index.html#estimator" class="btn btn-primary">30초 AI 예상견적</a>
          <a href="index.html#inquiry" class="btn btn-ghost">상담 신청</a>
        </div>
      </article>
      ${related.length ? `
      <div class="post-related">
        <h3>다른 인사이트</h3>
        <div class="insights-grid">
          ${related.map((x) => `
            <a class="insight-card" href="blog.html?post=${encodeURIComponent(x.slug)}">
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
        mainEntityOfPage: 'https://01023978629.github.io/manmool/blog.html?post=' + encodeURIComponent(a.slug)
      };
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(ld);
      document.head.appendChild(s);
    } catch (e) { /* noop */ }
  }

  async function init() {
    let insights = [];
    try {
      const r = await fetch('data/site.json', { cache: 'no-cache' });
      if (r.ok) insights = (await r.json()).insights || [];
    } catch (e) { /* noop */ }

    if (!insights.length) {
      root.innerHTML = '<p class="blog-loading">콘텐츠를 불러오지 못했습니다. 로컬 서버로 실행해 주세요.</p>';
      return;
    }
    const slug = new URLSearchParams(location.search).get('post');
    const found = slug && insights.find((x) => x.slug === slug);
    if (found) renderArticle(found, insights);
    else renderList(insights);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
