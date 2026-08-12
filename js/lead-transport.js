/* ============================================================
   상담 리드 전송 — 인테리어 폼(index.html)과 누수 폼(leak.html) 공용
   ------------------------------------------------------------
   두 폼이 각자 전송 코드를 갖고 있으면, 사장님이 나중에 n8n 주소를
   바꾸거나 보유기간 안내를 고칠 때 한쪽만 고쳐진다. 그러면 한쪽 폼의
   리드가 조용히 사라지거나, 화면 안내와 실제 삭제 시점이 어긋난다.
   그래서 '어디로 보내는가 · 얼마나 보관하는가 · 사람이 읽는 형식'
   세 가지는 이 파일 하나에만 둔다.
   ============================================================ */
(function () {
  const STORAGE_KEY = 'manmul_inquiries';

  // 개인정보 보유기간 — 두 폼의 동의 문구("보유기간 1년")와 반드시 같아야 한다.
  // 화면은 1년이라고 안내하는데 코드가 90일이면, 안내와 다른 시점에 자료가 사라진다.
  const RETENTION_DAYS = 365;

  function backendConfigured(config) {
    const n8n = (config && config.n8n) || {};
    const forms = (config && config.forms) || {};
    return !!((n8n.enabled && n8n.inquiryWebhookUrl) || (forms.enabled && forms.endpoint));
  }

  // 네트워크 무응답으로 제출이 멈추지 않도록 타임아웃(기본 12초).
  // 초과하면 abort → 실패 경로(로컬저장 + 전화·문자 직접 안내)로 떨어진다.
  async function fetchWithTimeout(url, opts, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 12000);
    try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); }
    finally { clearTimeout(t); }
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
      const res = await fetchWithTimeout(n8n.inquiryWebhookUrl, {
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
      const res = await fetchWithTimeout(forms.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('폼 전송 오류 ' + res.status);
      return true;
    }
    return false; // 백엔드 없음 → 고객 직접 전송 경로로 안내
  }

  // 보유기간 지난 항목을 실제로 지운다. 걸러내기만 하면 브라우저에는 그대로 남으므로,
  // 지운 게 있으면 저장까지 해야 '삭제'가 된다.
  function pruneExpired(list) {
    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    // 시각을 알 수 없는 항목은 함부로 지우지 않는다(언제 들어왔는지 모르는 걸 지우면 복구 불가)
    const kept = list.filter((x) => { const t = Date.parse(x && x.submittedAt || '') || 0; return !t || t >= cutoff; });
    return { kept, removed: list.length - kept.length };
  }

  function saveLocal(payload) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { list = []; }
    list = pruneExpired(list).kept;
    payload.id = payload.id || ('INQ-' + Date.now());
    list.unshift(payload);
    if (list.length > 50) list = list.slice(0, 50);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
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

  window.ManmulLead = {
    STORAGE_KEY, RETENTION_DAYS,
    backendConfigured, fetchWithTimeout, buildLeadText,
    deliver, pruneExpired, saveLocal, copyToClipboard,
  };
})();
