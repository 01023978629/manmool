(() => {
  'use strict';

  let framed = true;
  try { framed = window.self !== window.top; } catch (_) { framed = true; }
  if (!framed) {
    document.documentElement.removeAttribute('data-office-frame-pending');
    return;
  }

  window.__MANMUL_OFFICE_FRAME_BLOCKED__ = true;
  document.documentElement.setAttribute('data-office-frame-blocked', 'true');
  document.documentElement.style.display = 'none';
  try { window.stop(); } catch (_) {}
  try { window.location.replace('about:blank'); } catch (_) {}
})();
