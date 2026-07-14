/* ============================================================
   고객 마이페이지 — 프로젝트 단위로 일정·사진·자재·승인·결제 연결
   데이터: data/project.json (실서비스에서는 n8n→DB에서 프로젝트ID로 조회)
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const won = (n) => '₩' + Number(n).toLocaleString('ko-KR');
  const ROOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>';
  let DATA = null;

  async function load() {
    try { const r = await fetch('data/project.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {}
    return null;
  }

  function summary(p) {
    $('projPill').textContent = `${p.id} · ${p.complex} ${p.area}평`;
    $('projSummary').innerHTML = `
      <div class="proj-top">
        <div>
          <h1>${p.complex} ${p.area}평 ${p.type}</h1>
          <p>${p.region} · ${p.scope} · ${p.style} · 계약 ${p.contractDate}</p>
        </div>
        <span class="proj-status">${p.status}</span>
      </div>
      <div class="proj-progress">
        <div class="bar"><i style="width:${p.progress}%"></i></div>
        <span>공정률 ${p.progress}% · 착공 ${p.startDate} → 준공예정 ${p.endDate}</span>
      </div>
      <div class="proj-meta">
        <div><b>담당 소장</b>${p.manager}</div>
        <div><b>고객</b>${p.customer}</div>
        <div><b>공사범위</b>${p.scope}</div>
      </div>`;
  }

  const stCls = (s) => 'st st-' + s;

  function schedule(list) {
    $('schedule').innerHTML = list.map((s) => `
      <div class="tl-item">
        <span class="tl-date">${s.date}</span>
        <div class="tl-body"><b>${s.phase}</b><span>${s.task}</span></div>
        <span class="${stCls(s.status)}">${s.status}</span>
      </div>`).join('');
  }

  function today(list) {
    $('today').innerHTML = list.map((t) => `
      <div class="row-card">
        <div class="rc-top"><b>${t.space}</b><span class="st st-진행">진행</span></div>
        <p>${t.task}</p>
        <p class="rc-sub">확인: ${t.must}</p>
      </div>`).join('');
  }

  function manager(p) {
    $('manager').innerHTML = `
      <div class="row-card">
        <b>${p.manager}</b>
        <p>${p.managerPhone}</p>
        <div class="actions-row" style="margin-top:12px">
          <a class="btn btn-primary btn-sm" href="tel:${p.managerPhone.replace(/-/g,'')}">전화</a>
          <button class="btn btn-kakao btn-sm" onclick="alert('카카오톡 채널로 연결됩니다 (데모)')">카카오톡</button>
        </div>
      </div>`;
  }

  function photos(list) {
    $('photos').innerHTML = list.map((ph) => `
      <div class="photo-card">
        <div class="ph-img" style="background:${ph.color}">${ROOM}</div>
        <div class="ph-cap"><b>${ph.space} · ${ph.phase}</b><span>${ph.date} · ${ph.caption}</span></div>
      </div>`).join('');
  }

  function materials(list) {
    const render = () => {
      $('materials').innerHTML = list.map((m, mi) => `
        <div class="mat">
          <div class="mat-head"><b>${m.category}</b><span class="deadline">선택 마감 ${m.deadline}</span></div>
          <div class="mat-opts">
            ${m.options.map((o, oi) => `
              <div class="mat-opt ${m.selected === o.name ? 'sel' : ''}" data-m="${mi}" data-o="${oi}">
                <span>${o.name}${m.selected === o.name ? ' ✓' : ''}</span>
                <span class="diff">${o.priceDiff === 0 ? '기본' : (o.priceDiff > 0 ? '+' : '') + won(o.priceDiff)}</span>
              </div>`).join('')}
          </div>
        </div>`).join('');
      $('materials').querySelectorAll('.mat-opt').forEach((el) => el.addEventListener('click', () => {
        list[el.dataset.m].selected = list[el.dataset.m].options[el.dataset.o].name;
        render();
      }));
    };
    render();
  }

  function changes(list) {
    $('changeCount').textContent = list.filter((c) => c.status === '승인대기').length;
    const render = () => {
      $('changes').innerHTML = list.map((c, i) => `
        <div class="row-card">
          <div class="rc-top"><b>${c.reason}</b><span class="${stCls(c.status)}">${c.status}</span></div>
          <p class="rc-sub">추가금 ${won(c.amount)} · 일정 영향 ${c.scheduleImpact}</p>
          ${c.status === '승인대기' ? `
          <div class="actions-row" style="margin-top:10px">
            <span class="approve-guide">고객 승인 시 시공에 반영됩니다</span>
            <button class="mini ok" data-i="${i}" data-act="승인완료">승인</button>
            <button class="mini no" data-i="${i}" data-act="반려">반려</button>
          </div>` : ''}
        </div>`).join('');
      $('changes').querySelectorAll('.mini').forEach((b) => b.addEventListener('click', () => {
        list[b.dataset.i].status = b.dataset.act; render();
        $('changeCount').textContent = list.filter((c) => c.status === '승인대기').length;
      }));
    };
    render();
  }

  function payments(list) {
    const total = list.reduce((s, x) => s + x.amount, 0);
    const paid = list.filter((x) => x.status === '완납').reduce((s, x) => s + x.amount, 0);
    $('payments').innerHTML = `
      <thead><tr><th>구분</th><th>예정일</th><th class="num">금액</th><th>상태</th></tr></thead>
      <tbody>
        ${list.map((p) => `<tr><td>${p.name}</td><td>${p.dueDate}</td><td class="num">${won(p.amount)}</td><td><span class="${stCls(p.status)}">${p.status}</span></td></tr>`).join('')}
        <tr><td><b>합계</b></td><td></td><td class="num"><b>${won(total)}</b></td><td>${Math.round(paid / total * 100)}% 납부</td></tr>
      </tbody>`;
  }

  function documents(list) {
    $('documents').innerHTML = list.map((d) => `
      <div class="row-card">
        <div class="rc-top"><b>${d.name}</b><button class="mini ghost" onclick="alert('문서를 다운로드합니다 (데모)')">열기</button></div>
        <p>${d.type} · ${d.date}</p>
      </div>`).join('');
  }

  function checklist(list) {
    const render = () => {
      $('checklist').innerHTML = list.map((c, i) => `
        <label class="check-item ${c.done ? 'done' : ''}">
          <input type="checkbox" data-i="${i}" ${c.done ? 'checked' : ''} />
          <span>${c.item}</span>
        </label>`).join('');
      $('checklist').querySelectorAll('input').forEach((el) => el.addEventListener('change', () => {
        list[el.dataset.i].done = el.checked; render();
      }));
    };
    render();
  }

  async function init() {
    DATA = await load();
    if (!DATA) { $('projSummary').innerHTML = '<p style="color:#fff">프로젝트 데이터를 불러오지 못했습니다. 로컬 서버로 실행해 주세요.</p>'; return; }
    summary(DATA.project);
    schedule(DATA.schedule);
    today(DATA.todayWork);
    manager(DATA.project);
    photos(DATA.sitePhotos);
    materials(DATA.materials);
    changes(DATA.changes);
    payments(DATA.payments);
    documents(DATA.documents);
    checklist(DATA.checklist);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
