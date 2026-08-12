/* ============================================================
   현장관리 — 기사/현장관리자용. 버튼·사진 중심 입력.
   고위험(구조·전기·누수·안전) 판단은 자동화하지 않고 사람 확인.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const ROOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>';
  const SPACES = ['거실', '주방', '안방', '욕실', '현관', '발코니'];
  const PHASES = ['철거', '목공', '전기', '설비', '타일', '도장', '마루'];
  const ISSUE_TYPES = ['치수', '간섭', '누수', '전기', '자재불량', '고객요청'];
  const HIGH_RISK = ['누수', '전기', '구조', '가스', '안전'];
  let DATA = null;
  const photos = [];

  // 준공 처리 같은 변경분은 js/project-state.js 가 원본 위에 덮어씌운다.
  const PSTATE = window.ManmulProjectState;
  async function load() { return PSTATE ? PSTATE.load('data/project.json') : null; }
  const stCls = (s) => 'st st-' + s;
  const chips = (arr, sel) => arr.map((v, i) => `<button type="button" class="opt-chip ${i === 0 && sel ? 'active' : ''}" data-v="${v}">${v}</button>`).join('');

  function selectGroup(el) {
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.opt-chip'); if (!c) return;
      el.querySelectorAll('.opt-chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
    });
  }
  const selected = (el) => { const a = el.querySelector('.opt-chip.active'); return a ? a.dataset.v : null; };

  function today(list) {
    $('todoCount').textContent = list.length;
    const render = () => {
      $('today').innerHTML = list.map((t, i) => `
        <div class="row-card">
          <div class="rc-top"><b>${t.space} · ${t.worker}</b>${t._done ? '<span class="st st-완료">완료</span>' : '<button class="mini ok" data-i="' + i + '">완료 체크</button>'}</div>
          <p>${t.task}</p>
          <p class="rc-sub">필수 확인: ${t.must}</p>
        </div>`).join('');
      $('today').querySelectorAll('.mini').forEach((b) => b.addEventListener('click', () => { list[b.dataset.i]._done = true; render(); }));
    };
    render();
  }

  function renderPhotos() {
    const base = (DATA.sitePhotos || []).map((p) => ({ ...p }));
    const all = [...photos, ...base];
    $('photos').innerHTML = all.map((ph) => `
      <div class="photo-card">
        <div class="ph-img" style="background:${ph.color || '#d8c3a5'}">${ROOM}</div>
        <div class="ph-cap"><b>${ph.space} · ${ph.phase}</b><span>${ph.date} · ${ph.caption || '현장 촬영'}</span></div>
      </div>`).join('');
  }

  function photoForm() {
    $('phSpace').innerHTML = chips(SPACES, true);
    $('phPhase').innerHTML = chips(PHASES, true);
    selectGroup($('phSpace')); selectGroup($('phPhase'));
    let files = 0;
    $('phFile').addEventListener('change', (e) => { files = e.target.files.length; $('phStatus').textContent = files + '장 선택됨'; $('phStatus').className = 'app-status'; });
    $('phSave').addEventListener('click', () => {
      photos.unshift({ space: selected($('phSpace')), phase: selected($('phPhase')), date: '오늘', caption: files ? files + '장 촬영' : '현장 촬영', color: '#d8c3a5' });
      $('phStatus').textContent = '사진 보고가 등록되었습니다. AI가 일일보고 문장으로 정리합니다. ✓';
      $('phStatus').className = 'app-status ok'; files = 0; $('phFile').value = ''; renderPhotos(); renderDone();
    });
  }

  function materialIn(list) {
    $('materialIn').innerHTML = list.map((m) => {
      const bad = /파손|불일치|부족/.test(m.status);
      return `<div class="row-card">
        <div class="rc-top"><b>${m.item}</b><span class="st ${bad ? 'st-긴급' : 'st-완료'}">${m.status}</span></div>
        <p>${m.qty} · 입고 ${m.date}</p>
      </div>`;
    }).join('');
  }

  function issues(list) {
    const render = () => {
      $('issueCount').textContent = list.length;
      $('issues').innerHTML = list.map((it) => `
        <div class="row-card">
          <div class="rc-top"><b>[${it.type}] ${it.space || '현장'}</b><span class="st st-대기">${it.status}</span></div>
          <p>${it.text}</p>
        </div>`).join('');
    };
    render();

    $('issueType').innerHTML = chips(ISSUE_TYPES, false);
    selectGroup($('issueType'));
    $('issueSave').addEventListener('click', () => {
      const type = selected($('issueType'));
      if (!type) { $('issueStatus').textContent = '유형을 선택해 주세요.'; $('issueStatus').className = 'app-status err'; return; }
      const risky = HIGH_RISK.includes(type);
      list.unshift({ type, space: '현장', text: $('issueText').value.trim() || '(사진 첨부)', status: risky ? '대표 확인중' : '접수' });
      $('issueStatus').textContent = risky ? '고위험 항목으로 분류되어 대표·전문가 확인을 요청했습니다.' : '문제 보고가 등록되었습니다. ✓';
      $('issueStatus').className = 'app-status ok'; $('issueText').value = '';
      $('issueType').querySelectorAll('.opt-chip').forEach((x) => x.classList.remove('active'));
      render();
    });
  }

  function extraForm() {
    $('extraSave').addEventListener('click', () => {
      const txt = $('extraText').value.trim();
      if (!txt) { $('extraStatus').textContent = '추가 공사 내용을 입력해 주세요.'; $('extraStatus').className = 'app-status err'; return; }
      $('extraStatus').textContent = '추가 공사 요청이 대표 승인 대기로 전송되었습니다. 승인 전에는 작업하지 않습니다.';
      $('extraStatus').className = 'app-status ok';
      $('extraText').value = ''; $('extraAmount').value = ''; $('extraDays').value = '';
    });
  }

  function access(list) {
    $('access').innerHTML = list.map((a) => `
      <div class="row-card"><div class="rc-top"><b>${a.name}</b><span class="st st-진행">${a.type}</span></div><p>${a.time}</p></div>`).join('');
  }

  function custReq(issuesList) {
    const reqs = issuesList.filter((i) => i.type === '고객요청');
    $('custReq').innerHTML = reqs.length
      ? reqs.map((r) => `<div class="row-card"><div class="rc-top"><b>${r.space}</b><span class="st st-대기">${r.status}</span></div><p>${r.text}</p></div>`).join('')
      : '<p class="form-note">등록된 고객 요청이 없습니다.</p>';
  }

  const CHECK_ITEMS = ['금일 작업 사진 등록', '자재 입고/파손 확인', '문제사항 보고', '고객 요청 반영', '현장 정리·청소'];
  const checkState = CHECK_ITEMS.map(() => false);

  function checklist() {
    const render = () => {
      $('checklist').innerHTML = CHECK_ITEMS.map((it, i) => `
        <label class="check-item ${checkState[i] ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${checkState[i] ? 'checked' : ''} /><span>${it}</span></label>`).join('');
      $('checklist').querySelectorAll('input').forEach((el) => el.addEventListener('change', () => {
        checkState[el.dataset.i] = el.checked; render(); renderDone();
      }));
    };
    render();
  }

  /* ---------- 준공 처리 ----------
     체크리스트를 다 채우고 사진이 한 장이라도 있어야 누를 수 있다.
     화면에 "체크리스트와 사진이 모두 있어야 완료 처리됩니다"라고 적어 놓고
     아무 때나 눌리면, 그 문장이 거짓말이 된다. */
  function doneGateReasons() {
    const left = CHECK_ITEMS.filter((_, i) => !checkState[i]);
    const reasons = [];
    if (left.length) reasons.push(`작업 완료 체크가 남았습니다 — ${left.join(', ')}`);
    if (!photos.length) reasons.push('오늘 작업 사진이 한 장도 등록되지 않았습니다.');
    return reasons;
  }

  function renderDone() {
    if (!$('donePanel') || !DATA) return;
    const doneAt = PSTATE.completedAt();
    const badge = $('doneBadge');
    badge.textContent = doneAt ? `준공 ${doneAt}` : '시공 중';
    badge.className = 'done-badge' + (doneAt ? ' is-done' : '');

    // 보증 기간은 준공일에서 세므로, 준공 전에는 '준공일 기준' 이라고만 적는다.
    const w = DATA.warranty || {};
    $('doneWarranty').innerHTML = (w.items || []).map((it) => {
      const end = doneAt ? PSTATE.expiry(doneAt, it.years) : '';
      return `<div class="dw-item"><b>${it.work}</b><span>${it.years}년</span>` +
        `<small>${end ? end + ' 까지' : '준공일 기준'}</small></div>`;
    }).join('');

    const reasons = doneGateReasons();
    $('doneGate').innerHTML = doneAt
      ? `<p class="done-ok">✓ ${doneAt} 준공 처리됨 · 하자보증서 발급 · A/S 접수 열림</p>`
      : (reasons.length
        ? '<ul class="done-block">' + reasons.map((r) => `<li>${r}</li>`).join('') + '</ul>'
        : '<p class="done-ok">✓ 준공 처리할 수 있습니다.</p>');

    $('doneBtn').disabled = !!doneAt || reasons.length > 0;
    $('doneBtn').hidden = !!doneAt;
    $('reopenBtn').hidden = !doneAt;
    $('doneDate').disabled = !!doneAt;
  }

  function doneActions() {
    if (!$('donePanel')) return;
    const today = new Date().toISOString().slice(0, 10);
    $('doneDate').value = PSTATE.completedAt() || today;
    $('doneDate').max = today;   // 아직 오지 않은 날짜로 보증을 시작시키지 않는다

    $('doneBtn').addEventListener('click', async () => {
      const day = $('doneDate').value || today;
      if (day > today) { $('doneStatus').textContent = '준공일은 오늘보다 뒤일 수 없습니다.'; $('doneStatus').className = 'app-status err'; return; }
      if (!window.confirm(`${day} 로 준공 처리합니다.\n하자보증이 이 날짜부터 시작됩니다. 계속할까요?`)) return;
      PSTATE.complete(day);
      DATA = await load();
      $('projPill').textContent = `${DATA.project.complex} ${DATA.project.area}평 · ${DATA.project.status}`;
      renderDone();
      $('doneStatus').className = 'app-status ok';
      $('doneStatus').textContent = `${day} 준공으로 바꿨습니다. 고객 마이페이지에서도 준공으로 보입니다(이 브라우저 기준).`;
    });

    $('reopenBtn').addEventListener('click', async () => {
      if (!window.confirm('준공을 취소하고 시공 중으로 되돌립니다. 보증서 발급도 취소됩니다. 계속할까요?')) return;
      PSTATE.reopen();
      DATA = await load();
      $('projPill').textContent = `${DATA.project.complex} ${DATA.project.area}평 · ${DATA.project.status}`;
      $('doneDate').value = new Date().toISOString().slice(0, 10);
      renderDone();
      $('doneStatus').className = 'app-status';
      $('doneStatus').textContent = '시공 중으로 되돌렸습니다.';
    });
  }

  async function init() {
    DATA = await load();
    if (!DATA) { $('today').innerHTML = '<p class="form-note">데이터를 불러오지 못했습니다. 로컬 서버로 실행해 주세요.</p>'; return; }
    $('projPill').textContent = `${DATA.project.complex} ${DATA.project.area}평 · ${DATA.project.status}`;
    today(DATA.todayWork);
    photoForm(); renderPhotos();
    materialIn(DATA.fieldExtras.materialIn);
    issues(DATA.fieldExtras.issues);
    extraForm();
    access(DATA.fieldExtras.access);
    custReq(DATA.fieldExtras.issues);
    checklist();
    doneActions();
    renderDone();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
