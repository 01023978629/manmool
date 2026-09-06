/* Read-only navigation enhancement; native links also work without JavaScript. */
(() => {
  const page = document.querySelector('.service-page');
  const nav = page && page.querySelector('.service-jump-nav');
  if (!nav) return;
  const header = document.getElementById('siteHeader');
  const sections = Array.from(nav.querySelectorAll('a[href^="#"]')).map(link => ({
    link, target: document.getElementById(link.hash.slice(1))
  })).filter(item => item.target);
  let pending = false;
  let headerHeight = 72;
  let navHeight = 58;
  function update() {
    pending = false;
    headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    navHeight = Math.ceil(nav.getBoundingClientRect().height);
    page.style.setProperty('--service-header-offset', `${headerHeight}px`);
    page.style.setProperty('--service-jump-height', `${navHeight}px`);
    const threshold = headerHeight + navHeight + 32;
    // Compare section positions, not menu order (some pages link to sections out of order).
    const passed = sections.filter(item => item.target.getBoundingClientRect().top <= threshold);
    passed.sort((a, b) => b.target.getBoundingClientRect().top - a.target.getBoundingClientRect().top);
    const current = passed[0];
    sections.forEach(item => {
      if (item === current) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  window.addEventListener('load', schedule);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    if (header) observer.observe(header);
    observer.observe(nav);
    sections.forEach(item => observer.observe(item.target));
  }
  update();
})();
