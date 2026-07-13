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

  const $ = (id) => document.getElementById(id);

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
      estimateHint: window.MANMUL && window.MANMUL.getEstimate ? window.MANMUL.getEstimate() : ''
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
    const useN8n = n8n.enabled && n8n.inquiryWebhookUrl;

    try {
      if (useN8n) {
        const res = await fetch(n8n.inquiryWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('n8n 응답 오류 ' + res.status);
      } else if (!CONFIG.demoMode) {
        throw new Error('상담 접수 채널이 설정되지 않았습니다.');
      }
      // 데모/보조용: 로컬에도 저장하여 관리자 화면에서 확인 가능
      saveLocal(payload);

      showSuccess(payload);
    } catch (err) {
      // n8n 실패 시에도 데모 모드면 로컬 저장으로 폴백
      if (CONFIG.demoMode) {
        saveLocal(payload);
        showSuccess(payload, true);
      } else {
        status.textContent = '접수에 실패했습니다. 잠시 후 다시 시도하거나 전화로 문의해 주세요. (' + err.message + ')';
        status.className = 'form-status err';
        btn.disabled = false;
      }
    }
  }

  function saveLocal(payload) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { list = []; }
    payload.id = 'INQ-' + Date.now();
    list.unshift(payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function showSuccess(payload, fallback) {
    const form = $('inquiryForm');
    form.innerHTML = `
      <div class="inquiry-done">
        <div class="done-check">✓</div>
        <h3>상담 신청이 접수되었습니다</h3>
        <p><b>${payload.name}</b>님, 감사합니다. 루프 에이전트가 내용을 분석한 뒤
        대표 검토를 거쳐 <b>카카오톡</b>으로 예상 범위와 실측 일정을 안내드립니다.</p>
        <p class="done-eta">평균 응답 시간: 영업시간 기준 10분 이내 1차 회신</p>
        ${fallback ? '<p class="done-note">※ 현재 데모 모드로 접수되었습니다 (localStorage 저장).</p>' : ''}
        <a href="#top" class="btn btn-ghost">처음으로</a>
      </div>`;
  }

  /* ----- 초기화 ----- */
  function init(ctx) {
    CONFIG = (ctx && ctx.config) || {};
    if (!$('inquiryForm')) return;
    renderWorks();
    renderStepper();
    showStep(1);

    $('nextStep').addEventListener('click', () => {
      const err = validateStep(step);
      const status = $('inquiryStatus');
      if (err) { status.textContent = err; status.className = 'form-status err'; return; }
      status.textContent = ''; status.className = 'form-status';
      showStep(step + 1);
    });
    $('prevStep').addEventListener('click', () => showStep(step - 1));
    $('inquiryForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });

    // "이 견적으로 상담 신청" 클릭 시 예상 견적을 자동 반영
    const link = $('estimateToInquiry');
    if (link) link.addEventListener('click', () => setTimeout(() => showStep(1), 300));
  }

  window.initInquiry = init;
})();
