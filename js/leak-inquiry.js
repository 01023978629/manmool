/* ============================================================
   누수 전용 상담 폼 (leak.html)
   ------------------------------------------------------------
   누수로 급한 사람에게 평수·예산·공사범위를 묻지 않는다.
   연락처와 증상만 받고, 전송·보관은 인테리어 폼과 같은
   js/lead-transport.js 를 쓴다(경로가 갈라지면 한쪽 리드가 샌다).
   ============================================================ */
(function () {
  const LEAD = window.ManmulLead;
  const form = document.getElementById('leakForm');
  if (!LEAD || !form) return;

  const $ = (id) => document.getElementById(id);
  const status = $('lkStatus');
  const doneBox = $('lkDone');
  const submitBtn = $('lkSubmit');
  const fillBtn = $('lkFillFromChecklist');
  const PHONE = '01023978629';
  const SCROLL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  let CONFIG = {};
  let leakSubmitAttemptEpoch = 0;
  let visibleFailureGeneration = 0;
  let visibleFailurePayload = null;
  let activeRetryTransport = null;
  let activeRetryUiPromise = null;
  fetch('data/config.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((c) => { CONFIG = c || {}; })
    .catch(() => { CONFIG = {}; });

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
    return {
      type: '누수',
      region: (fd.get('region') || '').trim(),
      name: (fd.get('name') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      symptoms: fd.getAll('symptoms'),
      memo: (fd.get('memo') || '').trim(),
      consent: fd.get('consent') === 'on',
    };
  }

  function fail(msg, focusId) {
    status.textContent = msg;
    status.className = 'leak-status err';
    if (focusId) { const el = $(focusId); if (el) el.focus(); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collect();

    // 봇 방어(허니팟): 전송하거나 기억하지 않고 직접 연락 경로만 남긴다.
    const hp = $('lkCompanyUrl');
    if (hp && hp.value) {
      leakSubmitAttemptEpoch += 1;
      submitBtn.disabled = false;
      showDone(data, { delivered: false, hasBackend: LEAD.backendConfigured(CONFIG), honeypot: true });
      return;
    }

    const phone = normalizePhone(data.phone);
    if (!phone) { fail('연락처를 010-0000-0000 형식으로 입력해 주세요.', 'lkPhone'); return; }
    if (!data.consent) { fail('개인정보 수집·이용에 동의해 주세요.', 'lkConsent'); return; }

    const payload = Object.assign({}, data, {
      phone,
      source: 'leak-page',
      submittedAt: new Date().toISOString(),
      status: '신규',
    });

    submitBtn.disabled = true;
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
      if (attempt === leakSubmitAttemptEpoch) submitBtn.disabled = false;
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

    const head = opts.delivered
      ? '<h3>접수됐습니다.</h3><p>평일 09:00–17:30에 확인하고 남겨주신 번호로 회신드립니다. 물이 계속 번지는 상황이면 아래 번호로 바로 전화 주세요.</p>'
      : opts.honeypot
        ? '<h3>아직 전송되지 않았습니다.</h3><p>자동 전송하지 않았고 내용도 저장되지 않았습니다. 아래 버튼으로 전화·문자 또는 내용 복사를 이용해 주세요.</p>'
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
      LEAD.copyToClipboard(text);
      copy.textContent = '✓ 복사했습니다';
    });
    doneBox.scrollIntoView({ behavior: SCROLL, block: 'center' });
  }

  // 새 문서를 열 때는 자동 재시도하지 않는다. 같은 탭에서 실패한 최신 문의만 온라인 복귀 시 재시도한다.
  window.addEventListener('online', () => { retryVisibleFailure(); });
})();
