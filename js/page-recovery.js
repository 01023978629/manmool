/* Search only already-published blog cards. Keep unknown URLs and queries local. */
(() => {
  'use strict';
  const base = new URL('../', document.currentScript.src);
  const form = document.getElementById('recovery-search');
  const input = document.getElementById('recovery-query');
  const results = document.getElementById('recovery-results');
  const status = document.getElementById('recovery-results-status');
  const loading = document.getElementById('recovery-load-status');
  const retry = document.getElementById('recovery-retry');
  const more = document.getElementById('recovery-more');
  const empty = document.getElementById('recovery-empty');
  const filters = [...form.querySelectorAll('[data-group]')];
  const names = { all: '전체', leak: '누수 · 배관', interior: '인테리어', info: '공사 안내' };
  const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  let cards = [], group = 'all', limit = 6, composing = false;

  function render() {
    const terms = input.value.slice(0, 120).trim().normalize('NFKC').split(/\s+/).filter(Boolean).map(normalize);
    const matched = cards.filter(card => (group === 'all' || group === card.group) && terms.every(term => card.search.includes(term)));
    const shown = matched.slice(0, limit);
    const fragment = document.createDocumentFragment();
    shown.forEach(card => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = card.href;
      const meta = document.createElement('small');
      meta.textContent = `${names[card.group]}${card.date ? ' · ' + card.date : ''}`;
      const title = document.createElement('h3');
      title.textContent = card.title;
      const read = document.createElement('span');
      read.className = 'read-more';
      read.textContent = '사진과 작업 내용 보기 →';
      link.append(meta, title, read);
      li.append(link);
      fragment.append(li);
    });
    results.replaceChildren(fragment);
    status.textContent = `${names[group]} ${matched.length}건${matched.length ? ' · ' + shown.length + '건 표시' : ' · 검색 결과가 없습니다'}`;
    status.hidden = false;
    empty.hidden = matched.length > 0;
    more.hidden = matched.length <= limit;
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.group === group)));
  }

  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    loading.hidden = false;
    loading.textContent = '사례 검색을 준비하고 있습니다.';
    retry.hidden = true;
    try {
      const url = new URL('blog.html', base);
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('list unavailable');
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const seen = new Set();
      cards = [...doc.querySelectorAll('#blogRoot a[data-group][href]')].flatMap(card => {
        const href = new URL(card.getAttribute('href'), url);
        const slug = href.pathname.slice(base.pathname.length);
        const title = card.querySelector('.ic-body > b')?.textContent.trim();
        if (href.origin !== base.origin || !href.pathname.startsWith(base.pathname) || !/^posts\/[a-z0-9-]+\.html$/.test(slug)
          || href.search || href.hash || !title || !['leak', 'interior', 'info'].includes(card.dataset.group) || seen.has(href.href)) return [];
        seen.add(href.href);
        return [{ href: href.href, title, group: card.dataset.group,
          date: /^\d{4}-\d{2}-\d{2}$/.test(card.dataset.date) ? card.dataset.date : '',
          search: normalize(card.dataset.search || title) }];
      }).sort((a, b) => b.date.localeCompare(a.date));
      if (!cards.length) throw new Error('no published cards');
      loading.hidden = true;
      form.hidden = false;
      render();
    } catch (_) {
      loading.textContent = '사례 목록을 불러오지 못했습니다. 다시 시도하거나 위의 시공 사례 보기를 눌러 주세요.';
      retry.hidden = false;
    } finally { clearTimeout(timer); }
  }

  const search = () => { if (!composing) { limit = 6; render(); } };
  form.addEventListener('submit', event => event.preventDefault());
  input.addEventListener('input', search);
  input.addEventListener('search', search);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; search(); });
  filters.forEach(button => button.addEventListener('click', () => { group = button.dataset.group; limit = 6; render(); }));
  document.getElementById('recovery-reset').addEventListener('click', () => { input.value = ''; group = 'all'; limit = 6; render(); input.focus(); });
  more.addEventListener('click', () => {
    const previous = results.children.length;
    limit += 6;
    render();
    results.children[previous]?.querySelector('a').focus();
  });
  retry.addEventListener('click', load);
  load();
})();
