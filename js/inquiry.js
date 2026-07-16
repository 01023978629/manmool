/* ============================================================
   단계형 AI 상담 문의 — n8n 웹훅 연동
   ------------------------------------------------------------
   폼 제출 → data/config.json 의 n8n.inquiryWebhookUrl 로 POST.
   n8n 워크플로가 저장·AI요약·카카오알림·대표승인을 담당합니다.
   미설정(또는 demoMode) 시 브라우저 localStorage 에 저장하여
   admin.html 관리자 대시보드에서 확인할 수 있습니다.
   ============================================================ */

(function () {
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
    el.hidden = false;
    el.innerHTML = `<span class="sd-ico">🎨</span>
      <span class="sd-text">선택한 디자인 · <b>${d.title}</b>${d.style ? ` (${d.style})` : ''}</span>
      <button type="button" class="sd-clear" id="sdClear" aria-label="선택 해제">✕</button>`;
    const c = $('sdClear');
    if (c) c.addEventListener('click', () => {
      SELECTED_DESIGN = null;
      if (window.MANMUL) window.MANMUL.selectedDesign = null;
      renderSelectedDesign();
    });
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
    if (sec && n > 1) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      selectedDesign: SELECTED_DESIGN ? (SELECTED_DESIGN.title + (SELECTED_DESIGN.style ? ' (' + SELECTED_DESIGN.style + ')' : '')) : ''
    };
  }

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
      rows.map(([k, v]) => `<div class="sum-row"><span>${k}</span><b>${v}</b></div>`).join('');
  }

  /* ----- 검증 ----- */
  function validateStep(n) {
    if (n === 3) {
      if (!$('iName').value.trim()) return '이름을 입력해 주세요.';
      const phone = $('iPhone').value.trim();
      if (!/^01[0-9][-\s]?\d{3,4}[-\s]?\d{4}$/.test(phone)) return '올바른 휴대폰 번호를 입력해 주세요.';
    }
    return null;
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

    const n8n = CONFIG.n8n || {};
    const forms = CONFIG.forms || {};
    const useN8n = n8n.enabled && n8n.inquiryWebhookUrl;
    const useForm = !useN8n && forms.enabled && forms.endpoint;

    try {
      let delivered = false;
      if (useN8n) {
        const res = await fetch(n8n.inquiryWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('n8n 응답 오류 ' + res.status);
        delivered = true;
      } else if (useForm) {
        // 무료 폼→이메일 서비스(Web3Forms/Formspree 등)로 대표에게 즉시 전달
        const body = Object.assign({}, payload, {
          subject: '[홈페이지 상담] ' + (payload.name || '') + ' · ' + (payload.type || ''),
          from_name: '만물인테리어 홈페이지',
          message: buildLeadText(payload)
        }, forms.accessKey ? { access_key: forms.accessKey } : {});
        const res = await fetch(forms.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('폼 전송 오류 ' + res.status);
        delivered = true;
      }
      // 항상 로컬에도 저장(관리자 화면 확인용) + 접수 완료 화면
      saveLocal(payload);
      showSuccess(payload, { delivered });
    } catch (err) {
      // 백엔드 실패 시에도 리드를 잃지 않도록: 로컬 저장 + 고객이 직접 보낼 수 있는 안내
      saveLocal(payload);
      showSuccess(payload, { delivered: false, fallback: true });
    }
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
    const kakaoUrl = (CONFIG.kakao && (CONFIG.kakao.chatUrl || CONFIG.kakao.channelAddUrl)) || '';
    const text = buildLeadText(payload);
    const smsHref = phone ? `sms:${phone}?body=${encodeURIComponent(text)}` : '';
    const lead = opts.delivered
      ? '접수 내용이 담당자에게 전달되었습니다. 영업시간 기준 빠르게 회신드립니다.'
      : '아래 방법으로 신청 내용을 보내주시면 <b>담당자가 바로 확인</b>해 드립니다.';
    form.innerHTML = `
      <div class="inquiry-done">
        <div class="done-check">✓</div>
        <h3>상담 신청이 접수되었습니다</h3>
        <p><b>${payload.name || '고객'}</b>님, 감사합니다. ${lead}</p>
        <div class="done-actions">
          ${phone ? `<a class="btn btn-primary btn-lg" href="tel:${phone}">📞 전화 상담</a>` : ''}
          ${kakaoUrl ? `<button type="button" class="btn btn-kakao btn-lg" id="doneKakao">💬 카카오톡으로 문의 보내기</button>` : ''}
          ${smsHref ? `<a class="btn btn-ghost btn-lg" href="${smsHref}">✉️ 문자로 문의 보내기</a>` : ''}
        </div>
        <p class="done-eta">영업시간(평일 09:00–17:30) 기준 빠른 회신 · 금액·계약은 대표 확인 후 안내됩니다</p>
        ${opts.fallback ? '<p class="done-note">※ 자동 접수 서버가 아직 연결되지 않아, 위 버튼으로 보내주시면 확실히 전달됩니다.</p>' : ''}
        <a href="#top" class="btn btn-ghost btn-sm">처음으로</a>
      </div>`;
    const dk = $('doneKakao');
    if (dk) dk.addEventListener('click', () => {
      copyToClipboard(text);
      if (kakaoUrl) window.open(kakaoUrl, '_blank', 'noopener');
      dk.textContent = '✓ 내용 복사됨 · 채널 열림 (붙여넣기 전송)';
    });
  }

  /* ----- 초기화 ----- */
  function init(ctx) {
    CONFIG = (ctx && ctx.config) || {};
    COMPANY = (ctx && ctx.data && ctx.data.company) || {};
    if (!$('inquiryForm')) return;
    renderWorks();
    renderStepper();
    showStep(1);

    // 선택한 디자인 반영(초기값 + 이후 선택 이벤트)
    if (ctx && typeof ctx.getDesign === 'function') SELECTED_DESIGN = ctx.getDesign();
    renderSelectedDesign();
    document.addEventListener('manmul:design', (e) => {
      SELECTED_DESIGN = e.detail || null;
      renderSelectedDesign();
      if (SELECTED_DESIGN) {
        const sec = $('inquiry');
        if (sec) setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    });

    $('nextStep').addEventListener('click', () => {
      const err = validateStep(step);
      const status = $('inquiryStatus');
      if (err) { status.textContent = err; status.className = 'form-status err'; return; }
      status.textContent = ''; status.className = 'form-status';
      showStep(step + 1);
    });
    $('prevStep').addEventListener('click', () => showStep(step - 1));
    $('inquiryForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  }

  window.initInquiry = init;
})();
