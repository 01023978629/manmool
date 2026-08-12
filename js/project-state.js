/* ============================================================
   현장 진행 상태 덮어쓰기 — 현장관리 화면과 고객 마이페이지 공용
   ------------------------------------------------------------
   data/project.json 은 저장소에 든 고정 파일이라 화면에서 고칠 수 없다.
   그래서 '준공 처리' 같은 변경분만 이 브라우저에 따로 적어 두고,
   불러올 때 원본 위에 덮어씌운다.

   분명히 해 둘 것 — 이건 이 브라우저에만 있다. 서버가 없으므로
   고객의 휴대폰에는 반영되지 않는다. 화면에도 그렇게 적어야 한다.
   ============================================================ */
(function () {
  const KEY = 'manmul_project_state';

  function patch() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }

  function apply(data, p) {
    if (!data || !p) return data;
    if (p.completedAt) {
      data.project = Object.assign({}, data.project, {
        status: '완료', progress: 100, completedAt: p.completedAt,
        endDate: p.completedAt,
      });
      data.warranty = Object.assign({}, data.warranty, {
        issued: true, startDate: p.completedAt,
      });
    }
    return data;
  }

  /* 준공일에 공종별 보증기간을 더한 만료일. 국가 기준(건설산업기본법 하자담보
     책임기간)을 그대로 쓴다 — 방수 3년 · 급배수 등 설비 2년 · 마감 1년.
     화면에서 임의로 줄이지 마라. 줄이려면 법이 정한 절차가 따로 있다. */
  function expiry(startDate, years) {
    const d = new Date(startDate + 'T00:00:00');
    if (isNaN(d)) return '';
    d.setFullYear(d.getFullYear() + Number(years || 0));
    return d.toISOString().slice(0, 10);
  }

  async function load(url) {
    let data = null;
    try { const r = await fetch(url || 'data/project.json', { cache: 'no-cache' }); if (r.ok) data = await r.json(); }
    catch (e) { return null; }
    return apply(data, patch());
  }

  function complete(dateStr) {
    const day = dateStr || new Date().toISOString().slice(0, 10);
    localStorage.setItem(KEY, JSON.stringify({ completedAt: day }));
    return day;
  }
  function reopen() { localStorage.removeItem(KEY); }
  const completedAt = () => (patch() || {}).completedAt || '';

  window.ManmulProjectState = { load, complete, reopen, completedAt, expiry, KEY };
})();
