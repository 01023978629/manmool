/* ============================================================
   관리자 대시보드 — 외부 접수 경로 + 공개 사이트 콘텐츠 관리
   ------------------------------------------------------------
   상담 내용은 이 화면에서 읽거나 보관하지 않는다. 전송 경로 상태와
   별도의 비개인 콘텐츠 편집기만 관리한다.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const SUPPORTED_FORM_PROVIDERS = ['web3forms', 'generic', 'formspree'];
  let CONFIG = {};

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function loadConfig() {
    try {
      const response = await fetch('data/config.json', { cache: 'no-cache' });
      if (response.ok) return await response.json();
    } catch (_) {}
    return {};
  }

  function formProvider(forms) {
    return String(forms && forms.provider || '').trim().toLowerCase();
  }

  // 실제 전송 모듈과 같은 순서·조건을 사용한다: n8n 우선, 아니면 명시 지원 폼.
  function leadRoute() {
    const n8n = CONFIG.n8n || {};
    const forms = CONFIG.forms || {};
    if (n8n.enabled && n8n.inquiryWebhookUrl) {
      return { on: true, via: 'n8n', provider: 'n8n' };
    }
    const provider = formProvider(forms);
    if (forms.enabled && forms.endpoint && SUPPORTED_FORM_PROVIDERS.includes(provider)) {
      return { on: true, via: 'forms', provider };
    }
    return { on: false, via: '', provider: '' };
  }

  function renderPipeline() {
    const kakao = CONFIG.kakao || {};
    const pill = $('pipelineStatus');
    const note = $('pipeNote');
    const route = leadRoute();

    if (pill) {
      pill.textContent = route.on
        ? (route.via === 'n8n'
            ? 'n8n 연결됨 · 실서비스'
            : `폼 서비스(${route.provider}) 연결됨 · 실서비스`)
        : '⚠️ 접수 경로 없음 · 문의가 전달되지 않습니다';
      pill.classList.remove('pill-on', 'pill-demo');
      pill.classList.add(route.on ? 'pill-on' : 'pill-demo');
    }

    if (!note) return;
    note.innerHTML = route.on
      ? `접수 경로: <b>${escapeHtml(route.provider)} · 설정됨</b>` +
        (kakao.channelPublicId ? ` · 카카오 채널: <code>${escapeHtml(kakao.channelPublicId)}</code>` : '')
      : '<b>현재 자동 상담 접수 경로가 없습니다.</b> 설정 전에는 고객에게 전화·문자 직접 문의 경로를 안내하세요.<br>' +
        '<code>data/config.json</code>에서 n8n 또는 지원되는 폼 서비스 경로를 설정할 수 있습니다.';
  }

  function renderConnection() {
    const n8n = CONFIG.n8n || {};
    const forms = CONFIG.forms || {};
    const kakao = CONFIG.kakao || {};
    const hyeonjang = CONFIG.hyeonjang || {};
    const route = leadRoute();
    const badge = $('connBadge');
    const button = $('connTest');

    if (badge) {
      badge.textContent = route.on
        ? `🟢 ${route.via === 'n8n' ? 'n8n' : `폼 서비스(${route.provider})`} 연결됨`
        : '🔴 상담 접수 경로 없음';
      badge.className = 'conn-badge ' + (route.on ? 'on' : 'demo');
    }
    if (button) button.textContent = '접수 경로 설정 확인';

    const alimtalk = kakao.alimtalk || {};
    const templateCount = alimtalk.templates ? Object.keys(alimtalk.templates).length : 0;
    const alimtalkOn = !!(alimtalk.enabled && alimtalk.provider && templateCount);
    const supportedForms = !!(
      forms.enabled && forms.endpoint && SUPPORTED_FORM_PROVIDERS.includes(formProvider(forms))
    );
    const rows = [
      ['★ 상담 접수 경로', route.on
        ? (route.via === 'n8n' ? 'n8n 웹훅으로 전달됨' : '폼 서비스로 전달됨')
        : '없음 — 문의가 자동으로 오지 않습니다', route.on],
      ['n8n 웹훅', n8n.enabled && n8n.inquiryWebhookUrl ? '설정됨' : '(미설정)',
        !!(n8n.enabled && n8n.inquiryWebhookUrl)],
      ['지원 폼 서비스', supportedForms ? `${formProvider(forms)} · 설정됨` : '(미설정 또는 미지원)', supportedForms],
      ['카카오 채널', kakao.ready && (kakao.chatUrl || kakao.channelAddUrl) ? '설정됨' : '(미설정)',
        !!(kakao.ready && (kakao.chatUrl || kakao.channelAddUrl))],
      ['알림톡 자동발송', alimtalkOn ? `${alimtalk.provider} · 템플릿 ${templateCount}종` : '(미설정 · 수동 발송만)', alimtalkOn],
      ['현장 앱(hyeonjang)', hyeonjang.appUrl ? '설정됨' : '(미설정)', !!hyeonjang.appUrl],
      ['브라우저 상담 문의 보관', '사용 안 함', true]
    ];
    const grid = $('connGrid');
    if (grid) {
      grid.innerHTML = rows.map(([key, value, ok]) => `
        <div class="conn-item ${ok ? 'ok' : 'no'}">
          <span class="ci-key">${escapeHtml(key)}</span>
          <span class="ci-val">${escapeHtml(value)}</span>
          <span class="ci-dot">${ok ? '✓' : '—'}</span>
        </div>`).join('');
    }
  }

  // 비파괴 설정 확인: 실제 endpoint로 POST하거나 시험 문의를 만들지 않는다.
  function checkConnection() {
    const result = $('connResult');
    if (!result) return;
    const route = leadRoute();
    if (route.on) {
      result.textContent = `✓ ${route.via === 'n8n' ? 'n8n' : '폼 서비스'} 접수 경로 설정이 준비돼 있습니다. 실제 문의는 전송하지 않았습니다.`;
      result.className = 'conn-result ok';
    } else {
      result.textContent = '상담 접수 경로 설정이 없습니다. n8n 또는 지원되는 폼 서비스 설정을 확인하세요.';
      result.className = 'conn-result err';
    }
  }

  async function init() {
    CONFIG = await loadConfig();
    renderPipeline();
    renderConnection();
    const button = $('connTest');
    if (button) button.addEventListener('click', checkConnection);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
