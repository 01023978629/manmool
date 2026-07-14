/* ============================================================
   현장 운영 앱(hyeonjang) 링크 연결 — 단일 설정으로 모든 진입점 제어
   [data-hj-link] 요소의 href를 data/config.json의 hyeonjang.appUrl로 지정.
   ============================================================ */
(function () {
  async function wire() {
    var url = '';
    try {
      var r = await fetch('data/config.json', { cache: 'no-cache' });
      if (r.ok) { var c = await r.json(); url = (c.hyeonjang && c.hyeonjang.appUrl) || ''; }
    } catch (e) { /* noop */ }
    document.querySelectorAll('[data-hj-link]').forEach(function (a) {
      if (url) {
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
      } else {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          alert('현장 운영 앱 주소가 설정되지 않았습니다.\ndata/config.json의 hyeonjang.appUrl을 입력하세요.');
        });
      }
    });
  }
  if (document.readyState !== 'loading') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
