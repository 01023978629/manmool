/* ============================================================
   고객 전용 링크 페이지 — 본인확인 → 동의 → 진행/사진/계약(전자서명)/
   결제(승인·기록)/보증서(국가 기준)/카톡 알림
   데이터: data/project.json (실서비스: n8n→DB에서 프로젝트ID로 조회)
   원칙: 유실 0 · 무승인 발송 0 · 개발 0 운영 · 돈은 승인·기록을 거친다
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const won = (n) => '₩' + Number(n).toLocaleString('ko-KR');
  const ROOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>';
  let DATA = null, PID = null;

  async function load() {
    try { const r = await fetch('data/project.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {}
    return null;
  }

  /* ---------- 개인 링크: 본인확인 게이트 ---------- */
  function last4(phone) { return (phone || '').replace(/\D/g, '').slice(-4); }

  function runGate(project, onPass) {
    const key = 'manmul_gate_' + PID;
    if (sessionStorage.getItem(key) === '1') { onPass(); return; }
    const gate = $('gate'), input = $('gateInput'), err = $('gateErr'), btn = $('gateBtn');
    gate.hidden = false;
    $('gateTitle').textContent = (project.customer ? project.customer + ' 고객님' : '내 공사 페이지');
    const target = last4(project.phone);
    const tryPass = () => {
      if (input.value.trim() === target) {
        sessionStorage.setItem(key, '1');
        gate.hidden = true;
        onPass();
      } else {
        err.textContent = '번호가 일치하지 않습니다. 계약 시 등록한 번호 뒷 4자리를 입력해 주세요.';
        input.focus();
      }
    };
    btn.addEventListener('click', tryPass);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPass(); });
    setTimeout(() => input.focus(), 100);
  }

  /* ---------- 최초 진입 동의 ---------- */
  function runConsent(onDone) {
    const key = 'manmul_consent_' + PID;
    if (localStorage.getItem(key) === '1') { onDone(); return; }
    const box = $('consent'), btn = $('consentBtn');
    const boxes = ['cA', 'cB', 'cC'].map($);
    box.hidden = false;
    const sync = () => { btn.disabled = !boxes.every((b) => b.checked); };
    boxes.forEach((b) => b.addEventListener('change', sync));
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      localStorage.setItem(key, '1');
      box.hidden = true;
      onDone();
    });
  }

  /* ---------- 요약 ---------- */
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

  /* ---------- 계약서 · 전자 서명 ---------- */
  function contract(c, project) {
    if (!c) { $('contract').innerHTML = '<p class="form-note">등록된 계약서가 없습니다.</p>'; return; }
    const key = 'manmul_sign_' + PID;
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    const signed = c.signed || !!saved;
    const signedAt = (saved && saved.at) || c.signedAt;

    const render = () => {
      const s = JSON.parse(localStorage.getItem(key) || 'null');
      const isSigned = c.signed || !!s;
      const at = (s && s.at) || c.signedAt;
      $('contract').innerHTML = `
        <div class="contract-doc">
          <div class="cd-head"><b>${c.title}</b><span>총액 ${won(c.totalAmount)} · ${c.period}</span></div>
          <ul class="cd-terms">${c.summary.map((t) => `<li>${t}</li>`).join('')}</ul>
        </div>
        ${isSigned ? `
          <div class="sign-done">
            <span class="sign-check">✔ 전자 서명 완료</span>
            <span class="sign-meta">서명 ${at || ''} · 서명본이 현장 앱 프로젝트에 자동 저장되었습니다</span>
            ${s && s.img ? `<img class="sign-img" src="${s.img}" alt="서명" />` : ''}
            <button class="mini ghost" id="reSign">다시 서명</button>
          </div>` : `
          <div class="sign-box">
            <p class="form-note">아래 칸에 손가락 또는 마우스로 서명해 주세요. 서명 시 계약이 확정되며, 서명본은 자동 보관됩니다.</p>
            <canvas id="signPad" class="sign-pad" width="600" height="180"></canvas>
            <div class="actions-row">
              <button class="mini ghost" id="signClear">지우기</button>
              <button class="mini ok" id="signDone">서명 완료</button>
            </div>
          </div>`}
      `;
      if (!isSigned) bindPad(c, key, render);
      else {
        const re = $('reSign');
        if (re) re.addEventListener('click', () => { localStorage.removeItem(key); c.signed = false; render(); });
      }
    };
    render();
  }

  function bindPad(c, key, render) {
    const cv = $('signPad'); if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a231c';
    let drawing = false, last = null;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
    };
    const start = (e) => {
      e.preventDefault(); drawing = true; last = pos(e);
      // 점 하나만 찍어도 잉크가 남도록
      ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#2a231c'; ctx.fill();
      if (cv.setPointerCapture && e.pointerId != null) { try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
    };
    const move = (e) => {
      if (!drawing) return; e.preventDefault();
      const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    };
    const end = () => { drawing = false; };
    cv.addEventListener('pointerdown', start);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointerleave', end);
    const hasInk = () => {
      try {
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < d.length; i += 4) { if (d[i] !== 0) return true; }
      } catch (_) { return true; }
      return false;
    };
    $('signClear').addEventListener('click', () => { ctx.clearRect(0, 0, cv.width, cv.height); });
    $('signDone').addEventListener('click', () => {
      if (!hasInk()) { alert('서명을 입력해 주세요.'); return; }
      const at = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
      localStorage.setItem(key, JSON.stringify({ at, img: cv.toDataURL('image/png') }));
      c.signed = true; c.signedAt = at;
      alert('전자 서명이 완료되었습니다. 서명본이 저장되고 담당자에게 카카오톡으로 알림이 전송됩니다. (데모)');
      render();
    });
  }

  /* ---------- 자재 ---------- */
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

  /* ---------- 변경·추가공사 (돈은 승인·기록) ---------- */
  function changes(list) {
    $('changeCount').textContent = list.filter((c) => c.status === '승인대기').length;
    const render = () => {
      $('changes').innerHTML = list.map((c, i) => `
        <div class="row-card">
          <div class="rc-top"><b>${c.reason}</b><span class="${stCls(c.status)}">${c.status}</span></div>
          <p class="rc-sub">추가금 ${won(c.amount)} · 일정 영향 ${c.scheduleImpact}</p>
          ${c.status === '승인대기' ? `
          <div class="actions-row" style="margin-top:10px">
            <span class="approve-guide">승인 시에만 시공에 반영되고, 승인 내역이 기록됩니다</span>
            <button class="mini ok" data-i="${i}" data-act="승인완료">승인</button>
            <button class="mini no" data-i="${i}" data-act="반려">반려</button>
          </div>` : (c.decidedAt ? `<p class="rc-log">기록: ${c.decidedAt} 고객 ${c.status}</p>` : '')}
        </div>`).join('');
      $('changes').querySelectorAll('.mini').forEach((b) => b.addEventListener('click', () => {
        const c = list[b.dataset.i];
        c.status = b.dataset.act;
        c.decidedAt = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
        render();
        $('changeCount').textContent = list.filter((x) => x.status === '승인대기').length;
      }));
    };
    render();
  }

  /* ---------- 결제 (승인·기록 원칙) ---------- */
  function payments(list) {
    const total = list.reduce((s, x) => s + x.amount, 0);
    const paid = list.filter((x) => x.status === '완납').reduce((s, x) => s + x.amount, 0);
    $('payments').innerHTML = `
      <thead><tr><th>구분</th><th>예정일</th><th class="num">금액</th><th>상태</th></tr></thead>
      <tbody>
        ${list.map((p) => `<tr>
          <td>${p.name}</td><td>${p.dueDate}</td><td class="num">${won(p.amount)}</td>
          <td>${p.status === '완납'
            ? `<span class="${stCls(p.status)}">완납 · 기록됨</span>`
            : `<span class="${stCls(p.status)}">${p.status}</span>`}</td>
        </tr>`).join('')}
        <tr><td><b>합계</b></td><td></td><td class="num"><b>${won(total)}</b></td><td>${Math.round(paid / total * 100)}% 납부</td></tr>
      </tbody>`;
  }

  /* ---------- 하자 보증 (국가 기준 자동) ---------- */
  function warranty(w) {
    if (!w) { $('warranty').innerHTML = '<p class="form-note">보증 정보가 없습니다.</p>'; return; }
    $('warranty').innerHTML = `
      <div class="warr-head">
        <span class="auto-badge">${w.issued ? '보증서 발급 완료' : '준공 시 자동 발급 예정'}</span>
        <span class="warr-basis">${w.basis}</span>
      </div>
      <p class="form-note" style="margin:8px 0 14px">${w.startNote}</p>
      <div class="warr-grid">
        ${w.items.map((it) => `
          <div class="warr-item">
            <div class="wi-top"><b>${it.work}</b><span class="wi-year">${it.years}년</span></div>
            <p>${it.scope}</p>
          </div>`).join('')}
      </div>
      <div class="actions-row" style="margin-top:16px">
        <span class="approve-guide">준공 검수 완료 시 보증 시작일이 확정되고, 보증서가 이 페이지에 영구 보관됩니다</span>
        <button class="mini ghost" ${w.issued ? '' : 'disabled'} onclick="alert('보증서를 다운로드합니다 (데모)')">보증서 보기</button>
      </div>`;
  }

  function documents(list) {
    $('documents').innerHTML = list.map((d) => `
      <div class="row-card">
        <div class="rc-top"><b>${d.name}</b><button class="mini ghost" onclick="alert('문서를 다운로드합니다 (데모)')">열기</button></div>
        <p>${d.type} · ${d.date}</p>
      </div>`).join('');
  }

  /* ---------- 카카오톡 알림 이력 ---------- */
  function notifs(list) {
    if (!list || !list.length) { $('notifs').innerHTML = '<p class="form-note">알림 이력이 없습니다.</p>'; return; }
    $('notifs').innerHTML = list.map((n) => `
      <div class="notif">
        <span class="notif-kind kind-${n.kind}">${n.kind}</span>
        <div class="notif-body"><p>${n.text}</p><span class="notif-date">${n.date}${n.approved ? ' · 승인 후 발송' : ''}</span></div>
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

  function renderAll() {
    $('appMain').hidden = false;
    summary(DATA.project);
    schedule(DATA.schedule);
    today(DATA.todayWork);
    manager(DATA.project);
    photos(DATA.sitePhotos);
    contract(DATA.contract, DATA.project);
    materials(DATA.materials);
    changes(DATA.changes);
    payments(DATA.payments);
    warranty(DATA.warranty);
    documents(DATA.documents);
    notifs(DATA.notifications);
    checklist(DATA.checklist);
  }

  async function init() {
    DATA = await load();
    if (!DATA) {
      $('appMain').hidden = false;
      $('projSummary').innerHTML = '<p style="color:#fff">프로젝트 데이터를 불러오지 못했습니다. 로컬 서버로 실행해 주세요.</p>';
      return;
    }
    const params = new URLSearchParams(location.search);
    PID = params.get('pid') || DATA.project.id;
    // 개인 링크 본인확인 → 최초 동의 → 렌더
    runGate(DATA.project, () => runConsent(renderAll));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
