/* ============================================================
   A/S 센터 — 하자 접수 → 자동 분류·긴급도·담당배정·방문일정
   접수는 localStorage(manmul_as)에 저장. 기존 이력은 project.json.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const KEY = 'manmul_as';
  const LOCATIONS = ['거실', '주방', '욕실', '안방', '현관', '발코니', '기타'];
  const TYPES = ['누수', '들뜸', '크랙', '오염', '작동불량', '결로', '기타'];

  // 유형 → 긴급도·담당(자동 규칙). 고위험은 전문가 확인 안내를 붙임.
  const RULE = {
    '누수': { urgency: '긴급', worker: '정설비(설비)', high: true },
    '작동불량': { urgency: '보통', worker: '이전기(전기)', high: true },
    '결로': { urgency: '보통', worker: '김현장(현장소장)', high: false },
    '들뜸': { urgency: '보통', worker: '박목공(목공)', high: false },
    '크랙': { urgency: '낮음', worker: '박목공(목공)', high: false },
    '오염': { urgency: '낮음', worker: '청소팀', high: false },
    '기타': { urgency: '보통', worker: '김현장(현장소장)', high: false }
  };
  const urgencyClass = (u) => u === '긴급' ? 'st-긴급' : u === '보통' ? 'st-진행' : 'st-대기';

  let PROJECT = [];
  const sel = { location: null, type: null, files: 0 };

  async function load() { try { const r = await fetch('data/project.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {} return {}; }
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const saveLocal = (l) => localStorage.setItem(KEY, JSON.stringify(l));

  function chips(el, arr, key) {
    el.innerHTML = arr.map((v) => `<button type="button" class="opt-chip" data-v="${v}">${v}</button>`).join('');
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.opt-chip'); if (!c) return;
      el.querySelectorAll('.opt-chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active'); sel[key] = c.dataset.v;
      if (key === 'type') showAuto();
    });
  }

  function nextVisit() {
    // 데모: 오늘로부터 2일 뒤 (고정 문자열 — 실서비스에서는 서버 시간 사용)
    return '접수 후 2일 이내 방문 협의';
  }

  function showAuto() {
    const r = RULE[sel.type]; if (!r) return;
    $('asAuto').hidden = false;
    $('asUrgency').textContent = r.urgency;
    $('asUrgency').className = 'st ' + urgencyClass(r.urgency);
    $('asAssign').textContent = '담당 배정(자동 추천): ' + r.worker + (r.high ? ' · 전문가 현장 확인 필요' : '');
    $('asVisit').textContent = '방문 일정: ' + nextVisit();
  }

  function render() {
    const local = loadLocal();
    const all = [...local, ...PROJECT];
    $('asCount').textContent = all.length;
    $('asList').innerHTML = all.map((a) => {
      const r = RULE[a.type] || { urgency: a.urgency || '보통' };
      const uc = urgencyClass(a.urgency || r.urgency);
      const done = a.status === '처리완료';
      return `<div class="row-card">
        <div class="rc-top"><b>[${a.location}] ${a.type}</b><span class="st ${uc}">${a.urgency || r.urgency}</span></div>
        <p class="rc-sub">${a.id} · 상태 ${a.status}${a.worker ? ' · ' + a.worker : ''}</p>
        <div class="actions-row" style="margin-top:8px">
          <span class="approve-guide">${done ? '처리 전/후 사진 · 고객 확인 완료' : '담당 배정 → 방문 → 처리 → 고객 확인'}</span>
          ${done ? '<span class="st st-완료">고객 확인</span>' : (a._local ? '<button class="mini ok" data-id="' + a.id + '">고객 확인 완료</button>' : '')}
        </div>
      </div>`;
    }).join('');
    $('asList').querySelectorAll('.mini').forEach((b) => b.addEventListener('click', () => {
      const l = loadLocal(); const it = l.find((x) => x.id === b.dataset.id);
      if (it) { it.status = '처리완료'; saveLocal(l); render(); }
    }));
  }

  function submit() {
    if (!sel.location || !sel.type) {
      $('asStatus').textContent = '하자 위치와 유형을 선택해 주세요.';
      $('asStatus').className = 'app-status err'; return;
    }
    const r = RULE[sel.type];
    const list = loadLocal();
    const id = 'AS-' + (2000 + list.length + 1);
    list.unshift({ id, location: sel.location, type: sel.type, urgency: r.urgency, worker: r.worker, status: '접수', _local: true });
    saveLocal(list);
    $('asStatus').textContent = `${id} 접수 완료! 긴급도 ${r.urgency}, ${r.worker} 배정 예정입니다. 방문 일정을 카카오톡으로 안내드립니다.`;
    $('asStatus').className = 'app-status ok';
    // reset
    sel.location = null; sel.type = null; sel.files = 0;
    $('asLocation').querySelectorAll('.opt-chip').forEach((x) => x.classList.remove('active'));
    $('asType').querySelectorAll('.opt-chip').forEach((x) => x.classList.remove('active'));
    $('asFile').value = ''; $('asFileNote').textContent = ''; $('asAuto').hidden = true;
    render();
  }

  async function init() {
    const data = await load();
    PROJECT = (data.asCases || []).map((x) => ({ ...x }));
    chips($('asLocation'), LOCATIONS, 'location');
    chips($('asType'), TYPES, 'type');
    $('asFile').addEventListener('change', (e) => {
      sel.files = e.target.files.length;
      $('asFileNote').textContent = sel.files ? `${sel.files}개 첨부됨 · AI가 하자 유형을 자동 분류합니다` : '';
    });
    $('asSubmit').addEventListener('click', submit);
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
