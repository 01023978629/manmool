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

  function backendConfigured(config) {
    const n8n = (config && config.n8n) || {};
    const forms = (config && config.forms) || {};
    return !!(
      (n8n.enabled && n8n.inquiryWebhookUrl) ||
      (forms.enabled && forms.endpoint && SUPPORTED_FORM_PROVIDERS.includes(formProvider(forms)))
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
    if (d.name) L.push('이름: ' + d.name);
    if (d.phone) L.push('연락처: ' + d.phone);
    const space = [d.type, d.area ? d.area + '평' : '', d.region].filter(Boolean).join(' · ');
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
    if (d.memo) L.push('메모: ' + d.memo);
    return L.join('\n');
  }

  // 실제 전송(백엔드 있으면 전송, 없으면 false). 실패 시 throw.
  async function deliver(config, payload) {
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
          return { status: 'sent', generation: captured.generation };
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
