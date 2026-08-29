/* ============================================================
   단계형 AI 상담 문의 — n8n 웹훅 연동
   ------------------------------------------------------------
   폼 제출 → data/config.json 의 n8n.inquiryWebhookUrl 로 POST.
   n8n 워크플로가 저장·AI요약·카카오알림·대표승인을 담당합니다.
   전송 실패 시에는 현재 탭 메모리에 최신 문의 한 건만 두고,
   사용자가 직접 다시 시도하거나 전화·문자·카카오로 전달합니다.
   ============================================================ */

(function () {
  const SCROLL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  // 전송·보관·리드 본문 형식은 js/lead-transport.js 한 곳에만 둔다.
  // 누수 폼(leak.html)과 같은 코드를 쓰게 해서, 나중에 n8n 주소나
  // 보유기간 안내를 바꿀 때 한쪽만 고쳐지는 일을 막는다.
  const LEAD = window.ManmulLead;
  const buildLeadText = LEAD.buildLeadText;
  const copyToClipboard = LEAD.copyToClipboard;
  const backendConfigured = () => LEAD.backendConfigured(CONFIG);
  const deliver = (payload) => LEAD.deliver(CONFIG, payload);
  const WORKS = ['철거', '샷시', '확장', '바닥', '도배·페인트', '주방', '욕실', '누수탐지·누수수리', '조명·전기', '가구·붙박이', '스마트홈'];

  const TOTAL_STEPS = 4;
  let step = 1;
  let CONFIG = {};
  let COMPANY = {};
  let SELECTED_DESIGN = null;
  let SIM_SPEC = '';   // 시뮬레이터에서 만든 '우리집 사양서' 요약(재현 링크 포함) — 문의 본문에 함께 보낸다
  let LOOK_SPEC = '';  // '우리집 한 채로 보기'에서 정한 공간·시안 목록 — SIM_SPEC 과 슬롯을 나눈다(재사용하면 사양서 요약이 덮여 사라진다)
  let inquirySubmitAttemptEpoch = 0;
  let visibleFailureGeneration = 0;
  let visibleFailurePayload = null;
  let activeRetryTransport = null;
  let activeRetryUiPromise = null;

  const $ = (id) => document.getElementById(id);

  /* ----- 선택한 AI 추천 디자인 ----- */
  function renderSelectedDesign() {
    const el = $('selectedDesignChip');
    if (!el) return;
    if (!SELECTED_DESIGN) { el.hidden = true; el.innerHTML = ''; return; }
    const d = SELECTED_DESIGN;
    const estimate = d.estimateRange
      ? ` · ${d.spaceType || '공간'} 예상 ${d.estimateRange}`
      : d.estimateTotal
        ? ` · 시안 공간 ${Number(d.estimateTotal).toLocaleString('ko-KR')}원`
        : '';
    el.hidden = false;
    el.innerHTML = `<span class="sd-ico">🎨</span>
      <span class="sd-text">선택한 디자인 · <b>${d.title}</b>${d.style ? ` (${d.style})` : ''}${d.area ? ` · 기준 주택 ${d.area}평형` : ''}${estimate}</span>
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

  // 유형이 '누수'일 때만 지름길 안내를 띄운다. 시안 선택처럼 코드가 유형을
  // 바꾸는 경로는 change 이벤트가 안 나므로 그 자리에서도 직접 부른다.
  function syncLeakShortcut() {
    const sel = $('iType');
    const box = $('leakShortcut');
    if (box) box.hidden = !sel || sel.value !== '누수';
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
      simSpec: SIM_SPEC || '',
      lookSpec: LOOK_SPEC || '',
      selectedDesign: SELECTED_DESIGN
        ? (SELECTED_DESIGN.title +
          (SELECTED_DESIGN.style ? ' (' + SELECTED_DESIGN.style + ')' : '') +
          (SELECTED_DESIGN.estimateRange
            ? ' · ' + (SELECTED_DESIGN.spaceType || '공간') + ' 예상 ' + SELECTED_DESIGN.estimateRange
            : SELECTED_DESIGN.estimateTotal
              ? ' · 시안 공간 예상 ' + Number(SELECTED_DESIGN.estimateTotal).toLocaleString('ko-KR') + '원'
              : ''))
        : ''
    };
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderSummary() {
    const d = collect();
    const rows = [
      ['공간 유형', d.type],
      ['지역', d.region || '-'],
      ['평수', d.area ? d.area + '평' : '-'],
      ['공사 범위', d.scope || '아직 선택 안 함'],
      ['희망 항목', d.works.length ? d.works.join(', ') : '-'],
      ['예상 예산', d.budget],
      ['희망 시기', d.movein],
      ['거주 여부', d.live || '아직 선택 안 함'],
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
      /* 휴대폰만 받으면 안 된다 — 상가·사무실·관리사무소 손님은 042·02 유선번호로,
         일부는 070으로 연락받길 원한다. 인테리어는 큰 공사가 들어오는 통로인데
         예전 규칙(/^01[0-9]…/)은 그런 손님을 3단계에서 아예 막았다.
         누수 폼(js/leak-inquiry.js normalizePhone)은 이미 0으로 시작하는 10~11자리를
         받고 있었다 — 같은 사이트에서 규칙이 갈려 있던 것을 이쪽에 맞춘다. */
      const phone = $('iPhone').value.trim();
      const phoneDigits = phone.replace(/[^0-9]/g, '').replace(/^82/, '0');
      if (!/^0\d{8,10}$/.test(phoneDigits)) return { field: 'iPhone', msg: '연락 받으실 번호를 입력해 주세요. (예: 010-1234-5678 또는 042-123-4567)' };
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
    // 봇 방어(허니팟): 전송하거나 기억하지 않고, 실제 사용자 오탐을 위해 직접 연락 경로만 남긴다.
    const hp = $('iCompanyUrl');
    if (hp && hp.value) {
      inquirySubmitAttemptEpoch += 1;
      const pendingButton = $('submitInquiry');
      if (pendingButton) pendingButton.disabled = false;
      showResult(collect(), { delivered: false, hasBackend: backendConfigured(), honeypot: true });
      return;
    }
    const contactError = validateStep(3);
    if (contactError) {
      clearFieldErrors();
      showFieldError(contactError.field, contactError.msg);
      return;
    }
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

    // 누른 게 먹혔다는 표시를 버튼 자체에 남긴다. 전송은 최대 12초까지 걸리는데
    // 그동안 버튼 글자가 그대로면 손님은 안 눌린 줄 알고 다시 누른다(중복 접수).
    const btn = $('submitInquiry');
    const btnLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '접수 중입니다…'; }
    status.className = 'form-status';
    status.textContent = '접수 중입니다...';

    const hasBackend = backendConfigured();
    const attempt = ++inquirySubmitAttemptEpoch;
    const capturedFailureGeneration = visibleFailureGeneration;
    try {
      const delivered = await deliver(payload);
      if (attempt !== inquirySubmitAttemptEpoch) return;
      if (delivered === true) {
        const clearedCapturedFailure = capturedFailureGeneration === 0 || LEAD.clearFailure(capturedFailureGeneration);
        if (clearedCapturedFailure && visibleFailureGeneration === capturedFailureGeneration) {
          visibleFailureGeneration = 0;
          visibleFailurePayload = null;
        }
        showResult(payload, { delivered: true, hasBackend });
        return;
      }
      rememberAndRenderFailure(payload, hasBackend);
    } catch (err) {
      if (attempt !== inquirySubmitAttemptEpoch) return;
      rememberAndRenderFailure(payload, hasBackend);
    } finally {
      if (attempt === inquirySubmitAttemptEpoch && btn && btn.isConnected) {
        btn.disabled = false;
        btn.textContent = btnLabel;
      }
    }
  }

  function rememberAndRenderFailure(payload, hasBackend) {
    const generation = LEAD.rememberFailure(payload);
    visibleFailureGeneration = generation;
    visibleFailurePayload = payload;
    showResult(payload, { delivered: false, failed: true, hasBackend, generation });
  }

  function retryVisibleFailure() {
    const generation = visibleFailureGeneration;
    const payload = visibleFailurePayload;
    if (!generation || !payload) return Promise.resolve({ status: 'empty', generation: 0 });

    const transport = LEAD.retryLatest(CONFIG);
    if (activeRetryTransport === transport && activeRetryUiPromise) return activeRetryUiPromise;

    activeRetryTransport = transport;
    const retryButton = $('doneRetry');
    if (retryButton) {
      retryButton.disabled = true;
      retryButton.textContent = '다시 시도 중…';
    }

    const uiPromise = Promise.resolve(transport)
      .then((result) => {
        if (result && result.status === 'sent' && result.generation === visibleFailureGeneration) {
          visibleFailureGeneration = 0;
          visibleFailurePayload = null;
          showResult(payload, { delivered: true, hasBackend: true });
          return result;
        }
        if (result && result.generation === visibleFailureGeneration) {
          const currentButton = $('doneRetry');
          if (currentButton) {
            currentButton.disabled = false;
            currentButton.textContent = result.status === 'unavailable'
              ? '자동 접수 경로를 확인해 주세요'
              : '🔄 다시 시도 (아직 전송되지 않음)';
          }
        }
        return result;
      })
      .finally(() => {
        if (activeRetryUiPromise === uiPromise) {
          activeRetryTransport = null;
          activeRetryUiPromise = null;
        }
      });
    activeRetryUiPromise = uiPromise;
    return uiPromise;
  }

  function showResult(payload, opts) {
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
    const retryable = !delivered && !opts.honeypot && opts.generation > 0 && opts.hasBackend;
    const icon = delivered ? '✓' : (failed ? '!' : '↗');
    const iconCls = delivered ? 'done-check ok' : (failed ? 'done-check warn' : 'done-check send');
    const head = delivered ? '상담 신청이 전달되었습니다'
      : '아직 전송되지 않았습니다';
    const lead = delivered
      ? '접수 내용이 담당자에게 전달되었습니다. 영업시간 기준 빠르게 회신드립니다.'
      : opts.honeypot
        ? '자동 전송하지 않았고 내용도 저장되지 않았습니다. 전화·문자 또는 내용 복사로 직접 보내주세요.'
        : '최신 문의 1건만 현재 탭 메모리에 보관합니다. 새로고침하거나 탭을 닫으면 사라집니다. 다시 시도하거나 전화·문자로 보내주세요.';

    const previous = form.querySelector('.inquiry-done');
    if (previous) previous.remove();
    Array.from(form.children).forEach((child) => { child.hidden = true; });
    const done = document.createElement('div');
    done.className = 'inquiry-done';
    done.setAttribute('role', 'status');
    done.setAttribute('aria-live', 'polite');
    done.innerHTML = `
        <div class="${iconCls}">${icon}</div>
        <h3 tabindex="-1">${head}</h3>
        <p><b class="done-person-name"></b>님, 감사합니다. <span class="done-lead"></span></p>
        ${delivered ? (phone ? `<p class="done-followup">회신이 없거나 급하시면 바로 전화 주세요 —
          <a href="tel:${phone}">${COMPANY.phone || phone}</a></p>` : '')
        : `<pre class="done-text"></pre>
        <div class="done-actions">
          ${retryable ? '<button type="button" class="btn btn-primary btn-lg" id="doneRetry">🔄 자동 접수 다시 시도</button>' : ''}
          ${phone ? `<a class="btn ${failed ? 'btn-ghost' : 'btn-primary'} btn-lg" href="tel:${phone}">📞 전화 상담</a>` : ''}
          ${kakaoReady ? '<button type="button" class="btn btn-kakao btn-lg" id="doneKakao">💬 카카오톡으로 보내기</button>' : ''}
          ${smsHref ? `<a class="btn btn-ghost btn-lg" href="${smsHref}">✉️ 문자로 문의 보내기</a>` : ''}
          <button type="button" class="btn btn-ghost btn-lg" id="doneCopy">📋 문의 내용 복사</button>
        </div>`}
        <p class="done-eta">영업시간(평일 09:00–17:30) 기준 빠른 회신 · 금액·계약은 대표 확인 후 안내됩니다</p>
        <a href="#top" class="btn btn-ghost btn-sm">처음으로</a>
      `;
    done.querySelector('.done-person-name').textContent = payload.name || '고객';
    done.querySelector('.done-lead').textContent = lead;
    // 전송이 안 된 화면에서는 보낼 내용을 화면에 펼쳐 둔다. 복사가 막힌 브라우저
    // (권한 거부·구형 iOS)에서도 손님이 직접 긁어서 문자·카톡에 붙일 수 있어야 한다.
    const doneText = done.querySelector('.done-text');
    if (doneText) doneText.textContent = text;
    form.appendChild(done);
    done.hidden = false;

    // 화면 전환을 스크린리더·키보드 사용자에게 전달 (innerHTML 교체는 포커스를 유실시킨다)
    const doneHead = done.querySelector('h3');
    if (doneHead) doneHead.focus();

    // 복사 결과를 사실대로 알린다 — 실패했는데 '복사됨'이라고 하면 손님은
    // 빈 카톡을 보내고 기다린다. 실패하면 위 본문을 직접 긁으라고 안내한다.
    const dk = $('doneKakao');
    if (dk) dk.addEventListener('click', () => {
      copyToClipboard(text).then((ok) => {
        if (kakaoUrl) window.open(kakaoUrl, '_blank', 'noopener');
        dk.textContent = ok ? '✓ 내용 복사됨 · 채널 열림 (붙여넣기 전송)'
          : '채널만 열었습니다 — 복사가 막혀 위 내용을 직접 붙여 주세요';
      });
    });
    const copy = $('doneCopy');
    if (copy) copy.addEventListener('click', () => {
      copyToClipboard(text).then((ok) => {
        copy.textContent = ok ? '✓ 문의 내용을 복사했습니다'
          : '복사가 막혔습니다 — 위 내용을 직접 선택해 복사해 주세요';
      });
    });
    const rt = $('doneRetry');
    if (rt) rt.addEventListener('click', () => { retryVisibleFailure(); });
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

    // 공사 시작 가이드·누수 전용 페이지처럼 서비스가 명시된 링크는
    // ?type=주거&scope=전체#inquiry 형태로 들어온다. 허용된 선택값만 폼에 반영한다.
    try {
      const params = new URLSearchParams(location.search);
      const requestedType = params.get('type');
      const requestedScope = params.get('scope');
      const typeSel = $('iType');
      if (typeSel && ['주거', '상업', '리모델링', '누수'].includes(requestedType)) {
        typeSel.value = requestedType;
      }
      if (['전체', '부분'].includes(requestedScope)) {
        const scopeInput = document.querySelector(`input[name="scope"][value="${requestedScope}"]`);
        if (scopeInput) scopeInput.checked = true;
      }
    } catch (e) { /* 오래된 브라우저에서는 기본값을 유지 */ }
    syncLeakShortcut();

    // 선택한 디자인 반영(초기값 + 이후 선택 이벤트)
    if (ctx && typeof ctx.getDesign === 'function') SELECTED_DESIGN = ctx.getDesign();
    renderSelectedDesign();
    // 예상견적 답변을 폼에 자동 채움 (같은 질문 반복 방지)
    document.addEventListener('manmul:estimate', (e) => prefillFromEstimate(e.detail || {}));
    // 시뮬레이터('우리집 사양서') 결과를 폼에 자동 채움 — 사장님이 방문 전에 범위를 알 수 있게
    // 사양서 요약 텍스트는 SIM_SPEC 으로 들고 있다가 문의 본문에 실어 보낸다(전화번호 요구 없음).
    // '우리집 한 채로 보기' 구성 — 대표가 방문 전에 어느 공간을 어떤 시안으로 볼지 알 수 있게 본문에 싣는다
    document.addEventListener('manmul:lookbook', (e) => { LOOK_SPEC = (e.detail && e.detail.text) || ''; });
    document.addEventListener('manmul:sim', (e) => {
      const d = e.detail || {};
      SIM_SPEC = d.text || '';
      prefillFromEstimate({ area: d.area, budget: d.budget });
    });

    // 페이지를 다시 열었을 때는 자동 전송하지 않는다. 현재 탭에서 실패한 최신 문의만
    // 온라인 복귀 시 공용 단일-flight 재시도 경로로 보낸다.
    window.addEventListener('online', () => { retryVisibleFailure(); });

    document.addEventListener('manmul:design', (e) => {
      SELECTED_DESIGN = e.detail || null;
      renderSelectedDesign();
      if (SELECTED_DESIGN) {
        // 누수 전용 링크에서 들어온 뒤 디자인을 선택했다면 인테리어 상담으로 전환한다.
        const typeSel = document.querySelector('#inquiry select[name="type"]');
        if (typeSel && typeSel.value === '누수') { typeSel.value = '주거'; syncLeakShortcut(); }
        if (SELECTED_DESIGN.area) setAreaValue(SELECTED_DESIGN.area);
        if (SELECTED_DESIGN.budget) setBudgetValue(SELECTED_DESIGN.budget);
        const sec = $('inquiry');
        if (sec) setTimeout(() => sec.scrollIntoView({ behavior: SCROLL, block: 'start' }), 60);
      }
    });

    // 누수는 급한 일이다. 평수·범위·항목·예산·시기를 다 지나야 연락처가 나오면
    // 그 전에 손님이 나간다 — 유형이 누수면 연락처 단계(3)로 바로 갈 길을 연다.
    const typeSel = $('iType');
    if (typeSel) typeSel.addEventListener('change', syncLeakShortcut);
    syncLeakShortcut();
    const shortcutGo = $('leakShortcutGo');
    if (shortcutGo) shortcutGo.addEventListener('click', () => { showStep(3); });

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
