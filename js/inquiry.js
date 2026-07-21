/* ============================================================
   단계형 AI 상담 문의 — n8n 웹훅 연동
   ------------------------------------------------------------
   폼 제출 → data/config.json 의 n8n.inquiryWebhookUrl 로 POST.
   n8n 워크플로가 저장·AI요약·카카오알림·대표승인을 담당합니다.
   미설정(또는 demoMode) 시 브라우저 localStorage 에 저장하여
   admin.html 관리자 대시보드에서 확인할 수 있습니다.
   ============================================================ */

(function () {
  const SCROLL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const STORAGE_KEY = 'manmul_inquiries';
  const WORKS = ['철거', '샷시', '확장', '바닥', '도배·페인트', '주방', '욕실', '조명·전기', '가구·붙박이', '스마트홈'];

  const TOTAL_STEPS = 4;
  let step = 1;
  let CONFIG = {};
  let COMPANY = {};
  let SELECTED_DESIGN = null;

  const $ = (id) => document.getElementById(id);

  /* ----- 선택한 AI 추천 디자인 ----- */
  function renderSelectedDesign() {
    const el = $('selectedDesignChip');
    if (!el) return;
    if (!SELECTED_DESIGN) { el.hidden = true; el.innerHTML = ''; return; }
    const d = SELECTED_DESIGN;
    const estimate = d.estimateTotal ? ` · 시안 공간 ${Number(d.estimateTotal).toLocaleString('ko-KR')}원` : '';
    el.hidden = false;
    el.innerHTML = `<span class="sd-ico">🎨</span>
      <span class="sd-text">선택한 디자인 · <b>${d.title}</b>${d.style ? ` (${d.style})` : ''}${d.area ? ` · ${d.area}평 추천` : ''}${d.budget ? ` · 예산 ${d.budget}` : ''}${estimate}</span>
      <button type="button" class="sd-clear" id="sdClear" aria-label="선택 해제">✕</button>`;
    const c = $('sdClear');
    if (c) c.addEventListener('click', () => {
      SELECTED_DESIGN = null;
      if (window.MANMUL) window.MANMUL.selectedDesign = null;
      renderSelectedDesign();
    });
  }

  /* ----- 평수 목록 + 직접 입력 ----- */
  function setAreaValue(value) {
    const preset = $('iAreaPreset');
    const custom = $('iArea');
    if (!preset || !custom) return;
    const area = Number(value);
    if (!Number.isFinite(area) || area <= 0) {
      preset.value = '';
      custom.value = '';
      custom.hidden = true;
      return;
    }
    const areaText = String(area);
    const listed = Array.from(preset.options).some((o) => o.value === areaText);
    preset.value = listed ? areaText : 'custom';
    custom.value = areaText;
    custom.hidden = listed;
  }

  function setupAreaControl() {
    const preset = $('iAreaPreset');
    const custom = $('iArea');
    if (!preset || !custom) return;
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') {
        custom.value = '';
        custom.hidden = false;
        custom.focus();
        return;
      }
      custom.value = preset.value;
      custom.hidden = true;
    });
  }

  function setBudgetValue(value) {
    const budget = $('iBudget');
    if (!budget || !value) return;
    const values = {
      '3천만원 이하': '~3천만원',
      '~3천만원': '~3천만원',
      '3~5천만원': '3천~5천만원',
      '3천~5천만원': '3천~5천만원',
      '5~8천만원': '5천~8천만원',
      '5천~8천만원': '5천~8천만원',
      '8천만원 이상': '8천만원~',
      '8천만원~': '8천만원~',
      '미정': '미정'
    };
    budget.value = values[value] || value;
  }

  /* ----- 예상견적 답변 프리필 ----- */
  function prefillFromEstimate(a) {
    if (!a) return;
    const setVal = (id, v) => { const el = $(id); if (el && v != null && v !== '') el.value = v; };
    if (a.type) setVal('iType', a.type);
    if (a.area) setAreaValue(a.area);
    const scopeVal = a.scope === '부분공사' ? '부분' : (a.scope === '전체공사' ? '전체' : null);
    if (scopeVal) { const r = document.querySelector(`input[name="scope"][value="${scopeVal}"]`); if (r) r.checked = true; }
    if (a.budget) setBudgetValue(a.budget);
    if (step === TOTAL_STEPS) renderSummary();
  }

  /* ----- 스텝 UI ----- */
  function renderStepper() {
    const el = $('stepper');
    if (!el) return;
    const labels = ['공간·지역', '공사범위', '예산·연락처', '확인'];
    el.innerHTML = labels.map((l, i) => `
      <div class="stepper-item ${i + 1 === step ? 'active' : ''} ${i + 1 < step ? 'done' : ''}">
        <span class="stepper-dot">${i + 1 < step ? '✓' : i + 1}</span>
        <em>${l}</em>
      </div>`).join('<span class="stepper-line"></span>');
  }

  function renderWorks() {
    const g = $('worksGroup');
    if (!g) return;
    g.innerHTML = WORKS.map((w) => `
      <label class="chip"><input type="checkbox" name="works" value="${w}" /><span>${w}</span></label>`).join('');
  }

  function showStep(n) {
    step = Math.min(Math.max(n, 1), TOTAL_STEPS);
    document.querySelectorAll('.inquiry-form .step').forEach((f) => {
      f.hidden = +f.dataset.step !== step;
    });
    $('prevStep').hidden = step === 1;
    $('nextStep').hidden = step === TOTAL_STEPS;
    $('submitInquiry').hidden = step !== TOTAL_STEPS;
    if (step === TOTAL_STEPS) renderSummary();
    renderStepper();
    const sec = $('inquiry');
    if (sec && n > 1) sec.scrollIntoView({ behavior: SCROLL, block: 'start' });
    // 새 단계 첫 입력으로 포커스 이동(접근성) — 초기 로드/스텝1 제외
    if (n > 1) {
      const first = document.querySelector(`.inquiry-form .step[data-step="${step}"] input:not([type=radio]):not([type=checkbox]), .inquiry-form .step[data-step="${step}"] select, .inquiry-form .step[data-step="${step}"] textarea`);
      if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 140);
    }
  }

  /* ----- 데이터 수집 ----- */
  function collect() {
    const form = $('inquiryForm');
    const fd = new FormData(form);
    const works = fd.getAll('works');
    return {
      type: fd.get('type'),
      region: (fd.get('region') || '').trim(),
      area: fd.get('area') ? Number(fd.get('area')) : null,
      scope: fd.get('scope'),
      works,
      budget: fd.get('budget'),
      movein: fd.get('movein'),
      live: fd.get('live'),
      name: (fd.get('name') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      memo: (fd.get('memo') || '').trim(),
      consent: fd.get('consent') === 'on',
      estimateHint: window.MANMUL && window.MANMUL.getEstimate ? window.MANMUL.getEstimate() : '',
      selectedDesign: SELECTED_DESIGN ? (SELECTED_DESIGN.title + (SELECTED_DESIGN.style ? ' (' + SELECTED_DESIGN.style + ')' : '') + (SELECTED_DESIGN.estimateTotal ? ' · 시안 공간 예상 ' + Number(SELECTED_DESIGN.estimateTotal).toLocaleString('ko-KR') + '원' : '')) : ''
    };
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderSummary() {
    const d = collect();
    const rows = [
      ['공간 유형', d.type],
      ['지역', d.region || '-'],
      ['평수', d.area ? d.area + '평' : '-'],
      ['공사 범위', d.scope],
      ['희망 항목', d.works.length ? d.works.join(', ') : '-'],
      ['예상 예산', d.budget],
      ['희망 시기', d.movein],
      ['거주 여부', d.live],
      ['선택 디자인', d.selectedDesign || '-'],
      ['참고 견적', d.estimateHint || '-']
    ];
    $('inquirySummary').innerHTML =
      '<h4>입력 내용 확인</h4>' +
      rows.map(([k, v]) => `<div class="sum-row"><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  }

  /* ----- 검증 (필드별 인라인 오류) ----- */
  function validateStep(n) {
    if (n === 3) {
      if (!$('iName').value.trim()) return { field: 'iName', msg: '이름을 입력해 주세요.' };
      const phone = $('iPhone').value.trim();
      if (!/^01[0-9][-\s]?\d{3,4}[-\s]?\d{4}$/.test(phone)) return { field: 'iPhone', msg: '올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)' };
    }
    return null;
  }

  function clearFieldErrors() {
    document.querySelectorAll('.inquiry-form .field-error').forEach((e) => e.remove());
    document.querySelectorAll('.inquiry-form [aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  }
  function showFieldError(fieldId, msg) {
    const input = $(fieldId);
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    const field = input.closest('.field') || input.parentElement;
    let err = field.querySelector('.field-error');
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error';
      err.setAttribute('role', 'alert');
      field.appendChild(err);
    }
    err.textContent = msg;
    input.focus();
  }

  // '다음' 및 Enter 진행 공통 처리
  function advance() {
    clearFieldErrors();
    const status = $('inquiryStatus');
    const err = validateStep(step);
    if (err) { showFieldError(err.field, err.msg); return; }
    if (status) { status.textContent = ''; status.className = 'form-status'; }
    showStep(step + 1);
  }

  // 전화번호 자동 하이픈 (010-1234-5678)
  function formatPhone(v) {
    const d = String(v).replace(/[^0-9]/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }

  /* ----- 제출 ----- */
  async function submit() {
    const status = $('inquiryStatus');
    if (!$('iConsent').checked) {
      status.textContent = '개인정보 수집·이용에 동의해 주세요.';
      status.className = 'form-status err';
      return;
    }
    const data = collect();
    const payload = {
      source: 'website',
      submittedAt: new Date().toISOString(),
      status: '신규',
      ...data
    };

    const btn = $('submitInquiry');
    btn.disabled = true;
    status.className = 'form-status';
    status.textContent = '접수 중입니다...';

    const hasBackend = backendConfigured();
    try {
      const delivered = await deliver(payload);
      saveLocal(payload);
      showSuccess(payload, { delivered, hasBackend });
    } catch (err) {
      // 백엔드 실패 시에도 리드를 잃지 않도록: 로컬 저장 + 재시도/직접 전송 안내
      saveLocal(payload);
      showSuccess(payload, { delivered: false, hasBackend, failed: true });
    }
  }

  function backendConfigured() {
    const n8n = CONFIG.n8n || {};
    const forms = CONFIG.forms || {};
    return !!((n8n.enabled && n8n.inquiryWebhookUrl) || (forms.enabled && forms.endpoint));
  }

  // 실제 전송(백엔드 있으면 전송, 없으면 false). 실패 시 throw.
  async function deliver(payload) {
    const n8n = CONFIG.n8n || {};
    const forms = CONFIG.forms || {};
    if (n8n.enabled && n8n.inquiryWebhookUrl) {
      const res = await fetch(n8n.inquiryWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('n8n 응답 오류 ' + res.status);
      return true;
    }
    if (forms.enabled && forms.endpoint) {
      // 무료 폼→이메일 서비스(Web3Forms/Formspree 등)로 대표에게 즉시 전달
      const body = Object.assign({}, payload, {
        subject: '[홈페이지 상담] ' + (payload.name || '') + ' · ' + (payload.type || ''),
        from_name: '만물인테리어 홈페이지',
        message: buildLeadText(payload)
      }, forms.accessKey ? { access_key: forms.accessKey } : {});
      const res = await fetch(forms.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('폼 전송 오류 ' + res.status);
      return true;
    }
    return false; // 백엔드 없음 → 고객 직접 전송 경로로 안내
  }

  // 문의 내용을 사람이 읽는 텍스트로(문자·카카오 전달용)
  function buildLeadText(d) {
    const L = ['[만물인테리어 상담 신청]'];
    if (d.name) L.push('이름: ' + d.name);
    if (d.phone) L.push('연락처: ' + d.phone);
    const space = [d.type, d.area ? d.area + '평' : '', d.region].filter(Boolean).join(' · ');
    if (space) L.push('공간: ' + space);
    const scope = [d.scope, (d.works || []).join(',')].filter(Boolean).join(' · ');
    if (scope) L.push('범위: ' + scope);
    const bm = [d.budget, d.movein].filter(Boolean).join(' · ');
    if (bm) L.push('예산/시기: ' + bm);
    if (d.selectedDesign) L.push('관심 디자인: ' + d.selectedDesign);
    if (d.estimateHint) L.push('참고 견적: ' + d.estimateHint);
    if (d.memo) L.push('메모: ' + d.memo);
    return L.join('\n');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    fallbackCopy(text);
    return Promise.resolve();
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function saveLocal(payload) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { list = []; }
    payload.id = 'INQ-' + Date.now();
    list.unshift(payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function showSuccess(payload, opts) {
    opts = opts || {};
    const form = $('inquiryForm');
    const phone = (COMPANY.phone || '').replace(/[^0-9]/g, '');
    const kakao = CONFIG.kakao || {};
    const kakaoUrl = kakao.chatUrl || kakao.channelAddUrl || '';
    const kakaoReady = !!(kakao.ready && kakaoUrl);
    const text = buildLeadText(payload);
    const smsHref = phone ? `sms:${phone}?body=${encodeURIComponent(text)}` : '';

    const delivered = !!opts.delivered;
    const failed = !!opts.failed;
    const icon = delivered ? '✓' : (failed ? '!' : '↗');
    const iconCls = delivered ? 'done-check ok' : (failed ? 'done-check warn' : 'done-check send');
    const head = delivered ? '상담 신청이 전달되었습니다'
      : (failed ? '아직 전송되지 않았습니다' : '거의 다 됐어요 — 마지막으로 보내주세요');
    const lead = delivered
      ? '접수 내용이 담당자에게 전달되었습니다. 영업시간 기준 빠르게 회신드립니다.'
      : (failed
        ? '자동 전송에 실패했습니다. <b>다시 시도</b>하거나 전화·문자로 보내주세요.'
        : '아래 방법 중 하나로 신청 내용을 보내주시면 <b>담당자가 바로 확인</b>해 드립니다.');

    form.innerHTML = `
      <div class="inquiry-done" role="status" aria-live="polite">
        <div class="${iconCls}">${icon}</div>
        <h3 tabindex="-1">${head}</h3>
        <p><b>${payload.name || '고객'}</b>님, 감사합니다. ${lead}</p>
        ${delivered ? '' : `<div class="done-actions">
          ${failed && opts.hasBackend ? '<button type="button" class="btn btn-primary btn-lg" id="doneRetry">🔄 자동 접수 다시 시도</button>' : ''}
          ${phone ? `<a class="btn ${failed ? 'btn-ghost' : 'btn-primary'} btn-lg" href="tel:${phone}">📞 전화 상담</a>` : ''}
          ${kakaoReady ? '<button type="button" class="btn btn-kakao btn-lg" id="doneKakao">💬 카카오톡으로 보내기</button>' : ''}
          ${smsHref ? `<a class="btn btn-ghost btn-lg" href="${smsHref}">✉️ 문자로 문의 보내기</a>` : ''}
        </div>`}
        <p class="done-eta">영업시간(평일 09:00–17:30) 기준 빠른 회신 · 금액·계약은 대표 확인 후 안내됩니다</p>
        <a href="#top" class="btn btn-ghost btn-sm">처음으로</a>
      </div>`;

    // 화면 전환을 스크린리더·키보드 사용자에게 전달 (innerHTML 교체는 포커스를 유실시킨다)
    const doneHead = form.querySelector('.inquiry-done h3');
    if (doneHead) doneHead.focus();

    const dk = $('doneKakao');
    if (dk) dk.addEventListener('click', () => {
      copyToClipboard(text);
      if (kakaoUrl) window.open(kakaoUrl, '_blank', 'noopener');
      dk.textContent = '✓ 내용 복사됨 · 채널 열림 (붙여넣기 전송)';
    });
    const rt = $('doneRetry');
    if (rt) rt.addEventListener('click', async () => {
      rt.disabled = true; rt.textContent = '다시 시도 중…';
      try {
        const ok = await deliver(payload);
        showSuccess(payload, { delivered: ok, hasBackend: true });
      } catch (e) {
        rt.disabled = false; rt.textContent = '🔄 다시 시도 (전송 실패)';
      }
    });
  }

  /* ----- 초기화 ----- */
  function init(ctx) {
    CONFIG = (ctx && ctx.config) || {};
    COMPANY = (ctx && ctx.data && ctx.data.company) || {};
    if (!$('inquiryForm')) return;
    renderWorks();
    setupAreaControl();
    renderStepper();
    showStep(1);

    // 선택한 디자인 반영(초기값 + 이후 선택 이벤트)
    if (ctx && typeof ctx.getDesign === 'function') SELECTED_DESIGN = ctx.getDesign();
    renderSelectedDesign();
    // 예상견적 답변을 폼에 자동 채움 (같은 질문 반복 방지)
    document.addEventListener('manmul:estimate', (e) => prefillFromEstimate(e.detail || {}));

    document.addEventListener('manmul:design', (e) => {
      SELECTED_DESIGN = e.detail || null;
      renderSelectedDesign();
      if (SELECTED_DESIGN) {
        if (SELECTED_DESIGN.area) setAreaValue(SELECTED_DESIGN.area);
        if (SELECTED_DESIGN.budget) setBudgetValue(SELECTED_DESIGN.budget);
        const sec = $('inquiry');
        if (sec) setTimeout(() => sec.scrollIntoView({ behavior: SCROLL, block: 'start' }), 60);
      }
    });

    $('nextStep').addEventListener('click', advance);
    $('prevStep').addEventListener('click', () => showStep(step - 1));
    $('inquiryForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });

    // Enter로 다음 단계 진행 (마지막 단계·textarea 제외)
    $('inquiryForm').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if ((e.target.tagName || '').toLowerCase() === 'textarea') return;
      if (step < TOTAL_STEPS) { e.preventDefault(); advance(); }
    });

    // 전화번호 자동 하이픈
    const phoneEl = $('iPhone');
    if (phoneEl) phoneEl.addEventListener('input', () => {
      const start = phoneEl.selectionStart;
      const before = phoneEl.value;
      phoneEl.value = formatPhone(phoneEl.value);
      // 끝에서 입력 중이면 커서를 끝으로(단순화)
      if (start >= before.length) phoneEl.setSelectionRange(phoneEl.value.length, phoneEl.value.length);
    });
  }

  window.initInquiry = init;
})();
