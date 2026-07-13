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

  async function load() { try { const r = await fetch('data/project.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {} return null; }
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
      $('phStatus').className = 'app-status ok'; files = 0; $('phFile').value = ''; renderPhotos();
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

  function checklist() {
    const items = ['금일 작업 사진 등록', '자재 입고/파손 확인', '문제사항 보고', '고객 요청 반영', '현장 정리·청소'];
    const state = items.map(() => false);
    const render = () => {
      $('checklist').innerHTML = items.map((it, i) => `
        <label class="check-item ${state[i] ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${state[i] ? 'checked' : ''} /><span>${it}</span></label>`).join('');
      $('checklist').querySelectorAll('input').forEach((el) => el.addEventListener('change', () => { state[el.dataset.i] = el.checked; render(); }));
    };
    render();
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
  }

  document.addEventListener('DOMContentLoaded', init);
})();
