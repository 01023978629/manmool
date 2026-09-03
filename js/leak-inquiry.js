/* ============================================================
   누수 전용 상담 폼 (leak.html)
   ------------------------------------------------------------
   누수로 급한 사람에게 평수·예산·공사범위를 묻지 않는다.
   연락처와 증상만 받고, 전송·보관은 인테리어 폼과 같은
   js/lead-transport.js 를 쓴다(경로가 갈라지면 한쪽 리드가 샌다).
   ============================================================ */
(function () {
  const LEAD = window.ManmulLead;
  const REVENUE = window.ManmulRevenue;
  const form = document.getElementById('leakForm');
  if (!LEAD || !REVENUE || !form) return;

  const $ = (id) => document.getElementById(id);
  const status = $('lkStatus');
  const doneBox = $('lkDone');
  const submitBtn = $('lkSubmit');
  const fillBtn = $('lkFillFromChecklist');
  const referenceHost = $('leakCaseContext');
  const referenceTitle = $('lkCaseReference');
  const PHONE = '01023978629';
  const CONFIG_LOOKUP_TIMEOUT_MS = 1500;
  const REFERENCE_LOOKUP_TIMEOUT_MS = 1500;
  const SCROLL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  let CONFIG = {};
  let leakSubmitAttemptEpoch = 0;
  let visibleFailureGeneration = 0;
  let visibleFailurePayload = null;
  let activeRetryTransport = null;
  let activeRetryUiPromise = null;
  let referenceCase = null;
  let referenceSubmitPending = false;
  // 첫 제출이 설정보다 먼저 진행되면 정상 접수 경로도 '미전송'으로 보인다.
  // 다만 설정 요청 하나가 끝없이 멈추는 경우를 막기 위해 제출 대기는 1.5초로 제한한다.
  const configReady = Promise.resolve()
    .then(() => LEAD.loadConfig())
    .then((config) => {
      CONFIG = config && typeof config === 'object' && !Array.isArray(config)
        ? config
        : { configLoadFailed: true };
      return CONFIG;
    }, () => {
      CONFIG = { configLoadFailed: true };
      return CONFIG;
    });

  async function waitForConfig() {
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), CONFIG_LOOKUP_TIMEOUT_MS);
    });
    const config = await Promise.race([configReady, timeout]);
    if (timer !== null) clearTimeout(timer);
    if (config === null) CONFIG = { configLoadFailed: true };
    return CONFIG;
  }

  /* 사례 글 CTA의 query는 신뢰하지 않는다. 공개된 누수 사례 목록과 slug가 정확히
     한 건 일치할 때만 제목·식별자를 메모리에서 사용한다. 원문 query를 표시하거나
     저장하지 않으며, 목록을 읽지 못하면 사례 없이 일반 누수 접수로 계속한다. */
  async function resolveReferenceCase() {
    const requestedSlug = new URLSearchParams(window.location.search).get('case');
    if (!requestedSlug) return null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    try {
      const lookup = fetch('data/leak-case-index.json', {
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      }).then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      });
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          reject(new Error('reference-lookup-timeout'));
        }, REFERENCE_LOOKUP_TIMEOUT_MS);
      });
      const index = await Promise.race([lookup, timeout]);
      const published = REVENUE.resolvePublishedLeakCase(requestedSlug, index);
      if (!published) return null;
      referenceCase = Object.freeze(published);
      if (referenceHost && referenceTitle) {
        referenceTitle.textContent = referenceCase.title;
        referenceHost.hidden = false;
      }
      return referenceCase;
    } catch (_) {
      return null;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
  const referenceReady = resolveReferenceCase();

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* 위쪽 '첫 대응 체크리스트' 에서 만든 메모를 이 폼으로 옮긴다.
     복사 → 붙여넣기를 손으로 하게 두면 대부분 그냥 비운 채 보낸다. */
  function checklistMemo() {
    const host = document.getElementById('responseChecks');
    if (!host) return '';
    const checked = Array.from(host.querySelectorAll('input[type="checkbox"]')).filter((i) => i.checked);
    if (!checked.length) return '';
    return ['[상담 준비 메모]'].concat(checked.map((i) => '- ' + i.value)).join('\n');
  }
  function syncFillButton() {
    if (!fillBtn) return;
    fillBtn.hidden = !checklistMemo();
  }
  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      const memo = checklistMemo();
      if (!memo) return;
      const box = $('lkMemo');
      // 이미 적은 내용을 지우지 않는다 — 손님이 쓴 글이 사라지면 다시 안 쓴다.
      box.value = box.value.trim() ? box.value.trim() + '\n\n' + memo : memo;
      box.focus();
      fillBtn.hidden = true;
    });
    document.addEventListener('change', (e) => {
      if (e.target && e.target.closest && e.target.closest('#responseChecks')) syncFillButton();
    });
    syncFillButton();
  }

  /* 010-1234-5678 / 01012345678 / +82 10 … 모두 받되, 숫자 10~11자리만 통과시킨다. */
  function normalizePhone(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '').replace(/^82/, '0');
    return /^0\d{9,10}$/.test(digits) ? digits : '';
  }

  function collect() {
    const fd = new FormData(form);
    const data = {
      type: '누수',
      region: (fd.get('region') || '').trim(),
      name: (fd.get('name') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      symptoms: fd.getAll('symptoms'),
      memo: (fd.get('memo') || '').trim(),
      inquiryPurpose: fd.get('inquiryPurpose') === 'paid-device-diagnosis' ? 'paid-device-diagnosis' : 'phone-consult',
      preferredVisitDate: /^\d{4}-\d{2}-\d{2}$/.test(fd.get('preferredVisitDate') || '') ? fd.get('preferredVisitDate') : '',
      preferredVisitWindow: ['morning', 'afternoon', 'any'].includes(fd.get('preferredVisitWindow')) ? fd.get('preferredVisitWindow') : 'any',
      consent: fd.get('consent') === 'on',
    };
    return data;
  }

  function fail(msg, focusId) {
    status.textContent = msg;
    status.className = 'leak-status err';
    if (focusId) { const el = $(focusId); if (el) el.focus(); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 봇 방어(허니팟): 전송하거나 기억하지 않고 직접 연락 경로만 남긴다.
    let hp = $('lkCompanyUrl');
    if (hp && hp.value) {
      leakSubmitAttemptEpoch += 1;
      submitBtn.disabled = false;
      showDone(collect(), { delivered: false, hasBackend: LEAD.backendConfigured(CONFIG), honeypot: true });
      return;
    }

    // 사례 목록이 느려도 동일한 submit 이벤트를 쌓아 두지 않는다. 조회가 실패하거나
    // 제한 시간을 넘으면 사례 정보 없이 일반 접수를 계속한다.
    if (referenceSubmitPending) return;
    referenceSubmitPending = true;
    const preflightEpoch = leakSubmitAttemptEpoch;
    const submitWasDisabled = submitBtn.disabled;
    const submitLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '접수 준비 중입니다…';
    try {
      await Promise.all([referenceReady, waitForConfig()]);
    } finally {
      referenceSubmitPending = false;
    }
    if (preflightEpoch !== leakSubmitAttemptEpoch) return;

    const data = collect();
    hp = $('lkCompanyUrl');
    if (hp && hp.value) {
      leakSubmitAttemptEpoch += 1;
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
      showDone(data, { delivered: false, hasBackend: LEAD.backendConfigured(CONFIG), honeypot: true });
      return;
    }

    const phone = normalizePhone(data.phone);
    if (!phone) {
      submitBtn.disabled = submitWasDisabled;
      submitBtn.textContent = submitLabel;
      fail('연락처를 010-0000-0000 형식으로 입력해 주세요.', 'lkPhone');
      return;
    }
    if (!data.consent) {
      submitBtn.disabled = submitWasDisabled;
      submitBtn.textContent = submitLabel;
      fail('개인정보 수집·이용에 동의해 주세요.', 'lkConsent');
      return;
    }

    const payload = Object.assign({}, data,
      REVENUE.captureLeadMetadata(window.location, 'leak-inquiry-submit', referenceCase),
      { phone, source: 'leak-page', bookingStatus: 'inquiry-only', privacyConsent: data.consent, submittedAt: new Date().toISOString(), status: '신규' });

    // 버튼 글자로도 '눌렸다'를 알린다 — 12초 대기 중 재클릭(중복 접수)을 막는다.
    submitBtn.textContent = '접수 중입니다…';
    status.className = 'leak-status';
    status.textContent = '접수 중입니다...';

    const hasBackend = LEAD.backendConfigured(CONFIG);
    const attempt = ++leakSubmitAttemptEpoch;
    const capturedFailureGeneration = visibleFailureGeneration;
    try {
      const delivered = await LEAD.deliver(CONFIG, payload);
      if (attempt !== leakSubmitAttemptEpoch) return;
      if (delivered === true) {
        const clearedCapturedFailure = capturedFailureGeneration === 0 || LEAD.clearFailure(capturedFailureGeneration);
        if (clearedCapturedFailure && visibleFailureGeneration === capturedFailureGeneration) {
          visibleFailureGeneration = 0;
          visibleFailurePayload = null;
        }
        showDone(payload, { delivered: true, hasBackend });
        return;
      }
      rememberAndShowFailure(payload, hasBackend);
    } catch (err) {
      if (attempt !== leakSubmitAttemptEpoch) return;
      rememberAndShowFailure(payload, hasBackend);
    } finally {
      if (attempt === leakSubmitAttemptEpoch) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    }
  });

  function rememberAndShowFailure(payload, hasBackend) {
    const generation = LEAD.rememberFailure(payload);
    visibleFailureGeneration = generation;
    visibleFailurePayload = payload;
    showDone(payload, { delivered: false, hasBackend, failed: true, generation });
  }

  function retryVisibleFailure() {
    const generation = visibleFailureGeneration;
    const payload = visibleFailurePayload;
    if (!generation || !payload) return Promise.resolve({ status: 'empty', generation: 0 });

    const transport = LEAD.retryLatest(CONFIG);
    if (activeRetryTransport === transport && activeRetryUiPromise) return activeRetryUiPromise;

    activeRetryTransport = transport;
    const retryButton = $('lkRetry');
    if (retryButton) {
      retryButton.disabled = true;
      retryButton.textContent = '다시 시도 중…';
    }
    const uiPromise = Promise.resolve(transport)
      .then((result) => {
        if (result && result.status === 'sent' && result.generation === visibleFailureGeneration) {
          visibleFailureGeneration = 0;
          visibleFailurePayload = null;
          if (result.receiptNo) payload.receiptNo = result.receiptNo;
          showDone(payload, { delivered: true, hasBackend: true });
          return result;
        }
        if (result && result.generation === visibleFailureGeneration) {
          const currentButton = $('lkRetry');
          if (currentButton) {
            currentButton.disabled = false;
            currentButton.textContent = result.status === 'unavailable'
              ? '자동 접수 경로를 확인해 주세요'
              : '다시 시도 (아직 전송되지 않음)';
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

  function showDone(payload, opts) {
    opts = opts || {};
    const text = LEAD.buildLeadText(payload);
    const kakao = (CONFIG.kakao || {});
    const kakaoUrl = kakao.chatUrl || kakao.channelAddUrl || '';
    const kakaoReady = !!(kakao.ready && kakaoUrl);
    const smsHref = 'sms:' + PHONE + '?body=' + encodeURIComponent(text);
    const retryable = !opts.delivered && !opts.honeypot && opts.generation > 0 && opts.hasBackend;

    const paidNotice = payload.inquiryPurpose === 'paid-device-diagnosis'
      ? '<p>방문이나 금액이 확정된 것은 아닙니다. 대표 확인 후 별도 견적과 일정 협의를 진행합니다.</p>' : '';
    // 접수번호는 접수함(서버)이 받았을 때만 온다. 메일만 간 문의에는 없다 — 없는 번호를 지어내지 않는다.
    const receiptNo = /^LD-\d{8}-\d{4,6}$/.test(String(payload.receiptNo || '')) ? String(payload.receiptNo) : '';
    const receiptLine = receiptNo ? '<p class="leak-done-receipt">접수번호 <b>' + esc(receiptNo) + '</b> — 문의하실 때 이 번호를 말씀해 주세요.</p>' : '';
    const head = opts.delivered
      ? '<h3>접수됐습니다.</h3>' + receiptLine + '<p>평일 09:00–17:30에 확인하고 남겨주신 번호로 회신드립니다. 물이 계속 번지는 상황이면 아래 번호로 바로 전화 주세요.</p>' + paidNotice
      : opts.honeypot
        ? '<h3>아직 전송되지 않았습니다.</h3><p>자동 전송하지 않았고 내용도 저장되지 않았습니다. 아래 버튼으로 전화·문자 또는 내용 복사를 이용해 주세요.</p>'
        // 설정을 못 읽어 못 보낸 것과 '접수 경로가 아예 없는 것'은 다른 말이어야 한다.
        // 앞의 경우 손님이 할 일은 새로고침이고, 뒤의 경우는 전화다. 누수는 급하니 더 그렇다.
        : CONFIG.configLoadFailed
          ? '<h3>아직 전송되지 않았습니다.</h3><p>홈페이지 설정을 잠시 못 읽어 자동 접수를 시도하지 못했습니다. 접수 경로가 없는 것이 아니니 새로고침 후 다시 넣어 주시거나, 급하시면 아래 번호로 바로 전화 주세요.</p>'
          : '<h3>아직 전송되지 않았습니다.</h3><p>최신 문의 1건만 현재 탭 메모리에 보관합니다. 새로고침하거나 탭을 닫으면 사라집니다. 다시 시도하거나 전화·문자로 보내주세요.</p>';

    doneBox.innerHTML = head
      + '<pre class="leak-done-text">' + esc(text) + '</pre>'
      + '<div class="leak-done-actions">'
      + (retryable ? '<button type="button" class="primary-button" id="lkRetry">자동 접수 다시 시도</button>' : '')
      + '<a class="primary-button" href="tel:' + PHONE + '">지금 전화하기</a>'
      + '<a class="outline-case-button" href="' + smsHref + '">문자로 보내기</a>'
      + (kakaoReady ? '<a class="outline-case-button" href="' + esc(kakaoUrl) + '" target="_blank" rel="noopener">카카오톡으로 보내기</a>' : '')
      + '<button type="button" class="outline-case-button" id="lkCopy">내용 복사</button>'
      + '</div>';
    doneBox.hidden = false;
    form.hidden = true;

    const retry = $('lkRetry');
    if (retry) retry.addEventListener('click', () => { retryVisibleFailure(); });
    const copy = $('lkCopy');
    if (copy) copy.addEventListener('click', () => {
      // 복사 성공 여부를 그대로 말한다 — 실패를 '복사됨'으로 덮으면
      // 손님이 빈 문자를 보내고 회신을 기다린다. 본문은 위에 이미 펼쳐져 있다.
      LEAD.copyToClipboard(text).then((ok) => {
        copy.textContent = ok ? '✓ 복사했습니다' : '복사가 막혔습니다 — 위 내용을 직접 선택해 주세요';
      });
    });
    doneBox.scrollIntoView({ behavior: SCROLL, block: 'center' });
  }

  function renderNaverBooking(config) {
    const host = $('lkNaverBookingHost');
    if (!host) return;
    const naver = config && config.naver || {};
    const href = naver.ready === true ? REVENUE.validateNaverBookingUrl(naver.bookingUrl) : null;
    host.replaceChildren();
    host.hidden = !href;
    if (!href) return;
    const link = document.createElement('a');
    link.id = 'lkNaverBooking';
    link.className = 'outline-case-button';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '네이버 예약 화면 열기';
    host.append(link);
  }

  configReady.then(renderNaverBooking);

  // 새 문서를 열 때는 자동 재시도하지 않는다. 같은 탭에서 실패한 최신 문의만 온라인 복귀 시 재시도한다.
  window.addEventListener('online', () => { retryVisibleFailure(); });
})();
