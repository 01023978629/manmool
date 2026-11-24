/* ============================================================
   후기 남기기 (review.html)
   ------------------------------------------------------------
   후기는 공개 페이지에 올라가는 글이다. 그래서 상담 폼보다 한 가지를 더 한다 —
   보내기 전에 동·호수·전화·이메일 패턴(js/pii-rules.js 정본)을 막는다.
   전송·실패 보관은 상담 폼과 같은 js/lead-transport.js 를 쓴다(경로가
   갈라지면 한쪽이 샌다). 브라우저 영구 저장소에는 아무것도 두지 않는다.
   ============================================================ */
(function () {
  const LEAD = window.ManmulLead;
  const form = document.getElementById('reviewForm');
  if (!LEAD || !form) return;

  const $ = (id) => document.getElementById(id);
  const status = $('rvStatus');
  const doneBox = $('rvDone');
  const submitBtn = $('rvSubmit');
  const PHONE = '01023978629';
  const CONFIG_LOOKUP_TIMEOUT_MS = 1500;
  const WORK_TYPES = Array.from(form.querySelectorAll('#rvWorkType option'))
    .map((o) => o.value).filter(Boolean);
  const RATING_LABELS = { 1: '아쉬웠어요', 2: '그저 그래요', 3: '보통이에요', 4: '좋았어요', 5: '아주 만족해요' };
  const SCROLL = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  let CONFIG = {};
  let submitAttemptEpoch = 0;
  let visibleFailureGeneration = 0;
  let visibleFailurePayload = null;
  let activeRetryTransport = null;
  let activeRetryUiPromise = null;

  const configReady = Promise.resolve()
    .then(() => LEAD.loadConfig())
    .then((config) => {
      CONFIG = config && typeof config === 'object' && !Array.isArray(config) ? config : { configLoadFailed: true };
      return CONFIG;
    }, () => {
      CONFIG = { configLoadFailed: true };
      return CONFIG;
    });

  async function waitForConfig() {
    let timer = null;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), CONFIG_LOOKUP_TIMEOUT_MS); });
    const config = await Promise.race([configReady, timeout]);
    if (timer !== null) clearTimeout(timer);
    if (config === null) CONFIG = { configLoadFailed: true };
    return CONFIG;
  }

  /* 개인정보 규칙은 js/pii-rules.js 정본 하나만 쓴다. '고객명' 규칙은 등록 화면용이라
     "김○○ 고객" 같은 표시 이름을 오탐하므로 여기서는 제외한다(배포 검사도 같은 4종만 쓴다). */
  const PII_RULES = (window.MANMUL_PII_RULES || []).filter((rule) => rule[0] !== '고객명');
  function piiKinds(text) {
    const src = String(text || '');
    return [...new Set(PII_RULES.filter(([, re]) => re.test(src)).map(([kind]) => kind))];
  }

  /* 010-1234-5678 / 01012345678 / +82 10 … 모두 받되, 숫자 10~11자리만 통과시킨다. */
  function normalizePhone(raw) {
    const digits = String(raw || '').replace(/[^0-9]/g, '').replace(/^82/, '0');
    return /^0\d{9,10}$/.test(digits) ? digits : '';
  }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* 별점: 고른 점수까지 별을 칠하고 말로도 알려준다 */
  const stars = Array.from(form.querySelectorAll('.rv-star'));
  const ratingLabel = $('rvRatingLabel');
  function paintStars() {
    const picked = Number((form.querySelector('input[name="rating"]:checked') || {}).value || 0);
    stars.forEach((star) => {
      const value = Number(star.querySelector('input').value);
      star.classList.toggle('on', value <= picked);
    });
    if (ratingLabel) ratingLabel.textContent = picked ? `${picked}점 · ${RATING_LABELS[picked]}` : '';
  }
  form.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'rating') paintStars();
  });
  paintStars();

  function collect() {
    const fd = new FormData(form);
    const rating = Number(fd.get('rating'));
    return {
      type: '후기',
      rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0,
      workType: WORK_TYPES.includes(fd.get('workType')) ? fd.get('workType') : '',
      site: String(fd.get('site') || '').trim().slice(0, 40),
      reviewText: String(fd.get('reviewText') || '').trim().slice(0, 600),
      displayName: String(fd.get('displayName') || '').trim().slice(0, 20),
      phone: String(fd.get('phone') || '').trim(),
      consent: fd.get('consent') === 'on',
      publishConsent: fd.get('publishConsent') === 'on',
    };
  }

  function fail(msg, focusId) {
    status.textContent = msg;
    status.className = 'app-status err';
    if (focusId) { const el = $(focusId); if (el) (el.querySelector('input') || el).focus(); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 봇 방어(허니팟): 전송하거나 기억하지 않고 직접 연락 경로만 남긴다.
    const hp = $('rvCompanyUrl');
    if (hp && hp.value) {
      submitAttemptEpoch += 1;
      showDone(collect(), { delivered: false, hasBackend: LEAD.backendConfigured(CONFIG), honeypot: true });
      return;
    }

    const submitLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '보낼 준비 중입니다…';
    await waitForConfig();
    const restore = () => { submitBtn.disabled = false; submitBtn.textContent = submitLabel; };

    const data = collect();
    if (!data.rating) { restore(); fail('별점을 골라 주세요.', 'rvRating'); return; }
    if (!data.workType) { restore(); fail('공사 종류를 골라 주세요.', 'rvWorkType'); return; }
    if (data.reviewText.length < 10) { restore(); fail('후기 내용을 10자 이상 적어 주세요.', 'rvText'); return; }
    // 공개되는 글이다 — 남의 정보가 될 수 있는 패턴은 보내기 전에 막는다.
    for (const [key, label, id] of [['site', '현장', 'rvSite'], ['reviewText', '후기 내용', 'rvText'], ['displayName', '표시 이름', 'rvName']]) {
      const kinds = piiKinds(data[key]);
      if (kinds.length) {
        restore();
        fail(`${label}에 ${kinds.join('·')}로 보이는 내용이 있습니다. 동·호수·전화번호·이메일은 빼고 적어 주세요.`, id);
        return;
      }
    }
    let phone = '';
    if (data.phone) {
      phone = normalizePhone(data.phone);
      if (!phone) { restore(); fail('확인 연락처는 숫자 10~11자리로 입력하거나 비워 주세요 (예: 010-1234-5678).', 'rvPhone'); return; }
    }
    if (!data.consent) { restore(); fail('개인정보 수집·이용에 동의해 주세요.', 'rvConsent'); return; }
    if (!data.publishConsent) {
      restore();
      fail('홈페이지 공개에 동의해 주세요. 공개를 원치 않으시면 전화나 문자로 말씀해 주셔도 됩니다.', 'rvPublishConsent');
      return;
    }

    const payload = Object.assign({}, data, {
      phone,
      name: data.displayName || '고객',
      source: 'review-page',
      sourcePage: window.location.pathname.startsWith('/') ? window.location.pathname : '/',
      privacyConsent: true,
      publishConsent: true,
      submittedAt: new Date().toISOString(),
    });
    delete payload.consent;

    submitBtn.textContent = '보내는 중입니다…';
    status.className = 'app-status';
    status.textContent = '보내는 중입니다...';

    const hasBackend = LEAD.backendConfigured(CONFIG);
    const attempt = ++submitAttemptEpoch;
    const capturedFailureGeneration = visibleFailureGeneration;
    try {
      const delivered = await LEAD.deliver(CONFIG, payload);
      if (attempt !== submitAttemptEpoch) return;
      if (delivered === true) {
        const cleared = capturedFailureGeneration === 0 || LEAD.clearFailure(capturedFailureGeneration);
        if (cleared && visibleFailureGeneration === capturedFailureGeneration) {
          visibleFailureGeneration = 0;
          visibleFailurePayload = null;
        }
        showDone(payload, { delivered: true, hasBackend });
        return;
      }
      rememberAndShowFailure(payload, hasBackend);
    } catch (err) {
      if (attempt !== submitAttemptEpoch) return;
      rememberAndShowFailure(payload, hasBackend);
    } finally {
      if (attempt === submitAttemptEpoch) restore();
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
    const retryButton = $('rvRetry');
    if (retryButton) { retryButton.disabled = true; retryButton.textContent = '다시 시도 중…'; }
    const uiPromise = Promise.resolve(transport)
      .then((result) => {
        if (result && result.status === 'sent' && result.generation === visibleFailureGeneration) {
          visibleFailureGeneration = 0;
          visibleFailurePayload = null;
          showDone(payload, { delivered: true, hasBackend: true });
          return result;
        }
        if (result && result.generation === visibleFailureGeneration) {
          const currentButton = $('rvRetry');
          if (currentButton) {
            currentButton.disabled = false;
            currentButton.textContent = result.status === 'unavailable' ? '자동 전송 경로를 확인해 주세요' : '다시 시도 (아직 전송되지 않음)';
          }
        }
        return result;
      })
      .finally(() => {
        if (activeRetryUiPromise === uiPromise) { activeRetryTransport = null; activeRetryUiPromise = null; }
      });
    activeRetryUiPromise = uiPromise;
    return uiPromise;
  }

  function showDone(payload, opts) {
    opts = opts || {};
    const text = LEAD.buildLeadText(payload);
    const smsHref = 'sms:' + PHONE + '?body=' + encodeURIComponent(text);
    const retryable = !opts.delivered && !opts.honeypot && opts.generation > 0 && opts.hasBackend;
    const head = opts.delivered
      ? '<h3>후기를 받았습니다. 고맙습니다.</h3>'
        + '<p>대표가 확인한 뒤 홈페이지 후기 란에 표시 이름·현장·별점·내용만 올립니다. 확인 연락처와 동·호수는 공개하지 않습니다. 올라간 뒤에도 삭제를 원하시면 010-2397-8629로 말씀해 주세요.</p>'
      : opts.honeypot
        ? '<h3>아직 전송되지 않았습니다.</h3><p>자동 전송하지 않았고 내용도 저장되지 않았습니다. 아래 버튼으로 문자 또는 내용 복사를 이용해 주세요.</p>'
        : CONFIG.configLoadFailed
          ? '<h3>아직 전송되지 않았습니다.</h3><p>홈페이지 설정을 잠시 못 읽어 자동 전송을 시도하지 못했습니다. 새로고침 후 다시 보내 주시거나, 아래 버튼으로 문자로 보내 주세요.</p>'
          : '<h3>아직 전송되지 않았습니다.</h3><p>최신 후기 1건만 현재 탭 메모리에 보관합니다. 새로고침하거나 탭을 닫으면 사라집니다. 다시 시도하거나 문자로 보내 주세요.</p>';

    doneBox.innerHTML = head
      + '<pre class="rv-done-text">' + esc(text) + '</pre>'
      + '<div class="rv-done-actions">'
      + (retryable ? '<button type="button" class="btn btn-primary" id="rvRetry">다시 시도</button>' : '')
      + '<a class="btn btn-ghost" href="' + smsHref + '">문자로 보내기</a>'
      + '<button type="button" class="btn btn-ghost" id="rvCopy">내용 복사</button>'
      + (opts.delivered ? '<a class="btn btn-ghost" href="index.html">홈페이지로</a>' : '')
      + '</div>';
    doneBox.hidden = false;
    form.hidden = true;

    const retry = $('rvRetry');
    if (retry) retry.addEventListener('click', () => { retryVisibleFailure(); });
    const copy = $('rvCopy');
    if (copy) copy.addEventListener('click', () => {
      // 복사 성공 여부를 그대로 말한다 — 실패를 '복사됨'으로 덮으면 빈 문자가 나간다.
      LEAD.copyToClipboard(text).then((ok) => {
        copy.textContent = ok ? '✓ 복사했습니다' : '복사가 막혔습니다 — 위 내용을 직접 선택해 주세요';
      });
    });
    doneBox.scrollIntoView({ behavior: SCROLL, block: 'center' });
  }
})();
