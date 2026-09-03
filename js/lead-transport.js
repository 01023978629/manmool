/* ============================================================
   상담 리드 전송 — 인테리어 폼(index.html)과 누수 폼(leak.html) 공용
   ------------------------------------------------------------
   두 폼이 각자 전송 코드를 갖고 있으면, 사장님이 나중에 n8n 주소를
   바꾸거나 보유기간 안내를 고칠 때 한쪽만 고쳐진다. 그러면 한쪽 폼의
   리드가 조용히 사라지거나, 화면 안내와 실제 삭제 시점이 어긋난다.
   그래서 '어디로 보내는가 · 실패를 어떻게 알리는가 · 사람이 읽는 형식'
   세 가지는 이 파일 하나에만 둔다.
   ============================================================ */
(function () {
  const LEGACY_STORAGE_KEY = 'manmul_inquiries';
  const SUPPORTED_FORM_PROVIDERS = ['web3forms', 'generic', 'formspree'];
  let latestFailure = null;
  let failureGeneration = 0;
  let retryInFlight = null;

  // 예전 브라우저 저장 문의는 내용을 읽거나 옮기지 않고 초기화마다 한 번만 제거한다.
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) {}

  function formProvider(forms) {
    return String(forms && forms.provider || '').trim().toLowerCase();
  }

  // 문의 접수함(Apps Script + 구글 시트). 메일 경로와 별개로 "무엇이 들어왔고 어떻게
  // 판정했나"의 정본이다. 주소는 script.google.com 의 /exec 만 받는다.
  const INBOX_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  const RECEIPT_NO = /^LD-\d{8}-\d{4,6}$/;
  function inboxConfigured(config) {
    const inbox = (config && config.inbox) || {};
    return !!(inbox.enabled && typeof inbox.url === 'string' && INBOX_URL.test(inbox.url));
  }

  function backendConfigured(config) {
    const n8n = (config && config.n8n) || {};
    const forms = (config && config.forms) || {};
    return !!(
      (n8n.enabled && n8n.inquiryWebhookUrl) ||
      (forms.enabled && forms.endpoint && SUPPORTED_FORM_PROVIDERS.includes(formProvider(forms))) ||
      inboxConfigured(config)
    );
  }

  // fetch 호출부터 본문 읽기까지 하나의 deadline(기본 12초)으로 제한한다.
  function fetchWithTimeout(url, opts, ms) {
    const controller = new AbortController();
    const timeoutMs = ms || 12000;
    let settled = false;

    return new Promise((resolve, reject) => {
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { controller.abort(); } catch (_) {}
        reject(new Error('request-timeout'));
      }, timeoutMs);

      Promise.resolve()
        .then(() => fetch(url, Object.assign({}, opts, { signal: controller.signal })))
        .then(response => Promise.resolve()
          .then(() => response.text())
          .then(text => ({ response, text })))
        .then(
          result => settle(resolve, result),
          error => settle(reject, error)
        );
    });
  }

  function parseJsonObject(text) {
    if (!text) throw new Error('empty-response');
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) { throw new Error('invalid-json'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid-json-object');
    }
    return parsed;
  }

  // 문의 내용을 사람이 읽는 텍스트로(문자·카카오 전달용).
  // 없는 항목은 줄 자체를 넣지 않는다 — 누수 리드에 '평수: -' 같은 빈칸이 늘어서면
  // 사장님이 문자에서 필요한 정보를 찾기 어려워진다.
  function buildLeadText(d) {
    d = d || {};
    const L = ['[만물인테리어 상담 신청]'];
    const isOfficePilot = d.source === 'office-pilot' || !!d.complexName ||
      !!d.officeContactName || Array.isArray(d.pilotInterest);
    const purposeLabels = {
      'phone-consult': '전화로 증상 상담',
      'paid-device-diagnosis': '유상 장비진단·방문 일정 상담'
    };
    const visitWindowLabels = {
      morning: '오전',
      afternoon: '오후',
      any: '시간 협의'
    };
    const pilotInterestLabels = {
      'leak-piping': '누수·배관',
      'common-repair': '공용부 보수',
      'preventive-inspection': '예방점검',
      other: '기타'
    };
    if (d.name) L.push('이름: ' + d.name);
    if (d.phone) L.push('연락처: ' + d.phone);
    if (d.complexName) L.push('단지명: ' + d.complexName);
    if (d.officeContactName) L.push('관리사무소 담당자: ' + d.officeContactName);
    if (isOfficePilot && d.region) L.push('지역: ' + d.region);
    const interest = Array.isArray(d.pilotInterest)
      ? d.pilotInterest.map(value => pilotInterestLabels[value]).filter(Boolean)
      : [];
    if (interest.length) L.push('관심 업무: ' + interest.join(', '));
    if (d.desiredStart) L.push('도입 희망 시점: ' + d.desiredStart);
    const space = [d.type, d.area ? d.area + '평' : '', isOfficePilot ? '' : d.region]
      .filter(Boolean).join(' · ');
    if (space) L.push('공간: ' + space);
    if (d.symptoms && d.symptoms.length) L.push('증상: ' + d.symptoms.join(', '));
    const scope = [d.scope, (d.works || []).join(',')].filter(Boolean).join(' · ');
    if (scope) L.push('범위: ' + scope);
    const bm = [d.budget, d.movein].filter(Boolean).join(' · ');
    if (bm) L.push('예산/시기: ' + bm);
    if (d.selectedDesign) L.push('관심 디자인: ' + d.selectedDesign);
    if (d.simSpec) L.push(d.simSpec);
    if (d.lookSpec) L.push(d.lookSpec);
    if (d.estimateHint) L.push('참고 견적: ' + d.estimateHint);
    if (d.inquiryPurpose) {
      L.push('신청 목적: ' + (purposeLabels[d.inquiryPurpose] || d.inquiryPurpose));
    }
    const schedule = [
      d.preferredVisitDate,
      visitWindowLabels[d.preferredVisitWindow] || d.preferredVisitWindow
    ].filter(Boolean).join(' · ');
    if (schedule) L.push('희망 일정: ' + schedule);
    if (d.bookingStatus === 'inquiry-only') L.push('예약 상태: inquiry-only');
    if (typeof d.referenceCase === 'string' && d.referenceCase.trim()) {
      L.push('참고 사례: ' + d.referenceCase.trim());
    } else if (d.referenceCase && typeof d.referenceCase === 'object') {
      const reference = d.referenceCase;
      const title = typeof reference.title === 'string' ? reference.title.trim() : '';
      const slug = typeof reference.slug === 'string' ? reference.slug.trim() : '';
      if (title || slug) L.push('참고 사례: ' + (title && slug ? `${title} (${slug})` : title || slug));
    }
    if (d.source) L.push('접수 경로: ' + d.source);
    if (d.sourcePage) L.push('유입 페이지: ' + d.sourcePage);
    if (d.ctaId) L.push('신청 진입점: ' + d.ctaId);
    if (d.utmSource) L.push('UTM Source: ' + d.utmSource);
    if (d.utmMedium) L.push('UTM Medium: ' + d.utmMedium);
    if (d.utmCampaign) L.push('UTM Campaign: ' + d.utmCampaign);
    if (typeof d.privacyConsent === 'boolean') {
      L.push('개인정보 수집·이용 동의: ' + (d.privacyConsent ? '동의' : '미동의'));
    }
    if (d.memo) L.push((isOfficePilot ? '문의 내용: ' : '메모: ') + d.memo);
    return L.join('\n');
  }

  // 문의 ID — 접수함이 같은 문의를 두 줄로 만들지 않게 하는 열쇠. 같은 payload 객체로
  // 재시도하면 같은 ID 가 간다(rememberFailure 가 객체를 그대로 보관한다).
  function ensureLeadId(payload) {
    if (payload && typeof payload === 'object' && !payload.leadId) {
      let id = '';
      try { id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ''; } catch (_) { id = ''; }
      if (!id) {
        const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
        id = hex() + hex() + '-' + hex() + '-4' + hex().slice(1) + '-' + (8 + Math.floor(Math.random() * 4)).toString(16) + hex().slice(1) + '-' + hex() + hex() + hex();
      }
      payload.leadId = id;
    }
    return payload && payload.leadId;
  }

  // 접수함에 한 줄 남긴다. 성공하면 true, 응답이 ok 가 아니면 throw.
  async function deliverToInbox(config, payload, emailDelivered) {
    const inbox = (config && config.inbox) || {};
    const body = {
      action: 'leadCreate',
      ts: Date.now(),
      payload: Object.assign({}, payload, { emailDelivered: emailDelivered === true, message: buildLeadText(payload) })
    };
    const result = await fetchWithTimeout(inbox.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', credentials: 'omit'
    });
    if (!result.response.ok) throw new Error('inbox-http-error');
    const responseBody = parseJsonObject(result.text);
    if (responseBody.ok !== true) throw new Error('inbox-not-accepted');
    // 접수번호(LD-날짜-순번)는 손님 화면과 대표 접수함이 같은 건을 가리키는 열쇠. 형식이 맞을 때만 payload 에 남긴다.
    if (typeof responseBody.receiptNo === 'string' && RECEIPT_NO.test(responseBody.receiptNo)) payload.receiptNo = responseBody.receiptNo;
    return true;
  }

  // 실제 전송. 메일 경로(n8n 또는 폼 서비스)와 접수함을 둘 다 시도한다.
  // 하나라도 받았으면 true — 손님에게는 "전달됐다"가 맞고, 접수함 줄에는 메일 발송 여부가
  // 남아 대표가 어느 길로 왔는지 안다. 둘 다 실패하면 마지막 오류를 던진다.
  async function deliver(config, payload) {
    ensureLeadId(payload);
    const inboxOn = inboxConfigured(config);
    let emailDelivered = false;
    let emailError = null;
    try {
      emailDelivered = await deliverEmail(config, payload);
    } catch (err) {
      emailError = err;
    }
    if (!inboxOn) {
      if (emailError) throw emailError;
      return emailDelivered;
    }
    try {
      await deliverToInbox(config, payload, emailDelivered);
      return true;
    } catch (inboxError) {
      if (emailDelivered) return true;
      throw emailError || inboxError;
    }
  }

  // 메일 경로만. 백엔드가 없으면 false, 실패 시 throw.
  async function deliverEmail(config, payload) {
    const n8n = (config && config.n8n) || {};
    const forms = (config && config.forms) || {};
    if (n8n.enabled && n8n.inquiryWebhookUrl) {
      const result = await fetchWithTimeout(n8n.inquiryWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!result.response.ok) throw new Error('n8n-http-error');
      const body = parseJsonObject(result.text);
      if (body.ok !== true && body.success !== true) throw new Error('n8n-not-accepted');
      return true;
    }
    if (forms.enabled && forms.endpoint) {
      const provider = formProvider(forms);
      if (!SUPPORTED_FORM_PROVIDERS.includes(provider)) {
        throw new Error('unsupported-form-provider');
      }
      // 무료 폼→이메일 서비스(Web3Forms/Formspree 등)로 대표에게 즉시 전달
      const body = Object.assign({}, payload, {
        subject: '[홈페이지 상담] ' + (payload.name || '') + ' · ' + (payload.type || ''),
        from_name: '만물인테리어 홈페이지',
        message: buildLeadText(payload)
      }, forms.accessKey ? { access_key: forms.accessKey } : {});
      const result = await fetchWithTimeout(forms.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
      });
      if (!result.response.ok) throw new Error('form-http-error');
      const responseBody = parseJsonObject(result.text);
      const accepted = provider === 'web3forms'
        ? responseBody.success === true
        : responseBody.ok === true || responseBody.success === true;
      if (!accepted) throw new Error('form-not-accepted');
      return true;
    }
    return false; // 백엔드 없음 → 고객 직접 전송 경로로 안내
  }

  function rememberFailure(payload) {
    const clonedPayload = JSON.parse(JSON.stringify(payload));
    failureGeneration += 1;
    latestFailure = {
      generation: failureGeneration,
      payload: clonedPayload
    };
    return failureGeneration;
  }

  function clearFailure(expectedGeneration) {
    if (!Number.isInteger(expectedGeneration) || expectedGeneration <= 0 ||
        !latestFailure || latestFailure.generation !== expectedGeneration) {
      return false;
    }
    latestFailure = null;
    return true;
  }

  function retryLatest(config) {
    if (retryInFlight) return retryInFlight;
    if (!latestFailure) return Promise.resolve({ status: 'empty', generation: 0 });

    const captured = latestFailure;
    let promise;
    promise = Promise.resolve()
      .then(() => {
        if (!backendConfigured(config)) {
          return { status: 'unavailable', generation: captured.generation };
        }
        return deliver(config, captured.payload).then(delivered => {
          if (delivered !== true) {
            return { status: 'failed', generation: captured.generation };
          }
          if (!latestFailure || latestFailure.generation !== captured.generation) {
            return { status: 'stale', generation: captured.generation };
          }
          latestFailure = null;
          // 재전송은 복제본으로 나가므로 접수번호를 결과에 실어 화면이 원본에 붙일 수 있게 한다.
          return { status: 'sent', generation: captured.generation, receiptNo: typeof captured.payload.receiptNo === 'string' ? captured.payload.receiptNo : '' };
        });
      })
      .catch(() => ({ status: 'failed', generation: captured.generation }))
      .finally(() => {
        if (retryInFlight === promise) retryInFlight = null;
      });
    retryInFlight = promise;
    return promise;
  }

  // 복사가 됐는지 **사실대로** 알려준다. 예전에는 성공/실패와 무관하게
  // 화면이 '복사했습니다'를 띄웠다 — 붙여넣기 하면 빈 채로 카톡이 나가고,
  // 손님은 보냈다고 믿고 기다린다. 그래서 항상 boolean 을 돌려준다.
  // 설정 파일(data/config.json)을 못 읽으면 '자동 접수 경로가 없다'와 구분이 안 된다.
  // 실제로는 경로가 멀쩡한데 요청 하나를 놓친 것뿐인데, 손님 화면에는 "이 업체는
  // 온라인 접수를 안 받는다"처럼 보이고 다시 시도 버튼도 안 나온다.
  // 한 번 더 시도하고, 그래도 안 되면 '못 읽었다'는 사실 자체를 표시로 남긴다.
  function loadConfig(opts) {
    const retryDelayMs = (opts && typeof opts.retryDelayMs === 'number') ? opts.retryDelayMs : 400;
    // 본문 해석은 전송 응답과 같은 parseJsonObject 를 쓴다 — 배열·문자열·null 처럼
    // 설정으로 쓸 수 없는 응답을 '읽었다'고 넘기지 않는다.
    const once = () => fetch('data/config.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('config-http-' + r.status);
        return Promise.resolve(r.text()).then(parseJsonObject);
      });
    const failed = () => ({ configLoadFailed: true });
    return once().catch(() => new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      .then(once)
      .catch(failed));
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return !!ok;
  }

  window.ManmulLead = {
    backendConfigured, fetchWithTimeout, buildLeadText,
    deliver, rememberFailure, retryLatest, clearFailure, copyToClipboard, loadConfig,
  };
})();
