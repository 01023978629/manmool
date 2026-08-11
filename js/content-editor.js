/* ============================================================
   공개 사이트 콘텐츠 편집기
   - GitHub Pages에서 비밀 토큰 없이 안전하게 초안·미리보기·JSON 내보내기만 담당한다.
   - 실제 게시(커밋·PR·배포)는 검증된 개발 작업으로 분리한다.
   ============================================================ */
(function () {
  const DRAFT_KEY = 'manmul_site_content_draft_v1';
  const MIN_PORTFOLIO = 300;
  const $ = (id) => document.getElementById(id);
  const editor = $('contentEditor');
  if (!editor) return;

  let published = null;
  let draft = null;
  let activeTab = 'basic';
  let dirty = false;
  let draftSaved = false;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function getPath(root, path) {
    return path.split('.').reduce((value, key) => value == null ? undefined : value[key], root);
  }

  function setPath(root, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const host = parts.reduce((obj, key) => obj[key], root);
    host[last] = value;
  }

  function safePublicUrl(value) {
    const url = String(value || '').trim();
    return !!url && !/[\u0000-\u001f]/.test(url) && !/^\s*(?:javascript|data):/i.test(url) && !/^\/\//.test(url);
  }

  function editableSnapshot(site) {
    if (!site) return null;
    return {
      company: site.company,
      about: site.about ? { headline: site.about.headline, lead: site.about.lead } : null,
      services: site.services,
      actualWork: site.actualWork,
      faq: site.faq
    };
  }

  function changedPaths(before, after, prefix, out) {
    out = out || [];
    prefix = prefix || '';
    if (Array.isArray(before) || Array.isArray(after)) {
      const a = Array.isArray(before) ? before : [];
      const b = Array.isArray(after) ? after : [];
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i += 1) changedPaths(a[i], b[i], `${prefix}[${i}]`, out);
      return out;
    }
    if (before && after && typeof before === 'object' && typeof after === 'object') {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      keys.forEach((key) => changedPaths(before[key], after[key], prefix ? `${prefix}.${key}` : key, out));
      return out;
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push(prefix);
    return out;
  }

  function textValues(site) {
    const values = [];
    const add = (value) => {
      if (typeof value === 'string') values.push(value);
      else if (Array.isArray(value)) value.forEach(add);
      else if (value && typeof value === 'object') Object.values(value).forEach(add);
    };
    add(site && site.company);
    add(site && site.services);
    add(site && site.actualWork);
    add(site && site.faq);
    if (site && site.about) add({ headline: site.about.headline, lead: site.about.lead });
    return values;
  }

  function sensitiveKeyFound(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) =>
      /(?:password|passwd|secret|api[_-]?key|access[_-]?key|token)/i.test(key) || sensitiveKeyFound(child));
  }

  function validateSite(site) {
    const errors = [];
    if (!site || typeof site !== 'object') return ['JSON 최상위가 객체가 아닙니다.'];
    if (!site.company || typeof site.company !== 'object') errors.push('회사 기본정보가 없습니다.');
    if (!Array.isArray(site.services) || site.services.length < 4) errors.push('서비스 항목은 최소 4개가 필요합니다.');
    if (!Array.isArray(site.actualWork) || site.actualWork.length < 3) errors.push('실제 현장 카드는 최소 3개가 필요합니다.');
    if (!Array.isArray(site.faq) || site.faq.length < 4) errors.push('FAQ는 최소 4개가 필요합니다.');
    if (!Array.isArray(site.portfolio) || site.portfolio.length < MIN_PORTFOLIO) errors.push(`디자인 ${MIN_PORTFOLIO}개가 보존되지 않았습니다.`);
    if (textValues(site).some((value) => /[<>]/.test(value))) errors.push('편집 문구에는 HTML 기호(< 또는 >)를 넣을 수 없습니다.');
    if (site.company && site.company.phone && String(site.company.phone).replace(/\D/g, '').length < 10) errors.push('대표 전화번호 형식을 확인하세요.');
    if (site.company && site.company.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.company.email)) errors.push('이메일 형식을 확인하세요.');
    (site.actualWork || []).forEach((item, index) => {
      if (!item || !item.title || !item.desc) errors.push(`실제 현장 ${index + 1}번의 제목·설명을 입력하세요.`);
      if (!safePublicUrl(item && item.image)) errors.push(`실제 현장 ${index + 1}번 이미지 경로가 안전하지 않습니다.`);
      if (!safePublicUrl(item && item.href)) errors.push(`실제 현장 ${index + 1}번 연결 주소가 안전하지 않습니다.`);
    });
    if (sensitiveKeyFound(site)) errors.push('사이트 콘텐츠 파일에 비밀번호·토큰·API 키로 보이는 항목이 있습니다.');
    return [...new Set(errors)];
  }

  function updateState(message) {
    const state = $('contentState');
    if (!state) return;
    const changes = published && draft ? changedPaths(editableSnapshot(published), editableSnapshot(draft)).length : 0;
    state.textContent = message || (dirty ? `저장 안 된 변경 ${changes}개` : draftSaved ? `브라우저 초안 · 변경 ${changes}개` : `공개본 기준 · 변경 ${changes}개`);
    state.className = 'content-state ' + (dirty ? 'dirty' : changes ? 'saved' : 'clean');
  }

  function renderValidation() {
    const host = $('contentValidation');
    if (!host || !draft) return false;
    const errors = validateSite(draft);
    if (errors.length) {
      host.className = 'content-validation error';
      host.innerHTML = `<b>수정 파일을 만들기 전에 ${errors.length}가지를 고쳐야 합니다.</b><ul>${errors.slice(0, 6).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
      return false;
    }
    const changes = changedPaths(editableSnapshot(published), editableSnapshot(draft)).length;
    host.className = 'content-validation ok';
    host.innerHTML = `<b>✓ 구조 검사 정상</b><span>디자인 ${draft.portfolio.length}개 보존 · 서비스 ${draft.services.length}개 · 실제 현장 ${draft.actualWork.length}개 · FAQ ${draft.faq.length}개 · 공개본 대비 변경 ${changes}개</span>`;
    return true;
  }

  function field(label, path, options) {
    options = options || {};
    const value = getPath(draft, path) == null ? '' : getPath(draft, path);
    const common = `data-content-path="${esc(path)}" maxlength="${options.max || 200}"`;
    const input = options.area
      ? `<textarea ${common} rows="${options.rows || 3}">${esc(value)}</textarea>`
      : `<input ${common} type="${options.type || 'text'}" value="${esc(value)}" />`;
    return `<label class="content-field ${options.wide ? 'wide' : ''}"><span>${esc(label)}</span>${input}${options.help ? `<small>${esc(options.help)}</small>` : ''}</label>`;
  }

  function renderBasic() {
    return `<fieldset class="content-fieldset"><legend>첫 화면·연락처</legend><div class="content-field-grid">
      ${field('업체명', 'company.name', { max: 40 })}
      ${field('영문/보조 표기', 'company.brandEn', { max: 60 })}
      ${field('한 줄 전문 분야', 'company.specialty', { max: 130, wide: true })}
      ${field('첫 화면 큰 제목', 'company.tagline', { max: 80, wide: true })}
      ${field('첫 화면 설명', 'company.description', { max: 320, area: true, rows: 4, wide: true })}
      ${field('대표자명', 'company.rep', { max: 30 })}
      ${field('직함', 'company.repTitle', { max: 30 })}
      ${field('대표 전화', 'company.phone', { max: 24, type: 'tel' })}
      ${field('이메일', 'company.email', { max: 100, type: 'email' })}
      ${field('상담 시간', 'company.hours', { max: 120, wide: true })}
      ${field('주소', 'company.address', { max: 180, wide: true })}
      ${field('사업자등록번호', 'company.bizno', { max: 24, help: '실제 등록정보와 같은지 확인하세요.' })}
    </div></fieldset>
    <fieldset class="content-fieldset"><legend>회사 소개 첫 문단</legend><div class="content-field-grid">
      ${field('소개 제목', 'about.headline', { max: 100, wide: true })}
      ${field('소개 요약', 'about.lead', { max: 420, area: true, rows: 5, wide: true })}
    </div></fieldset>`;
  }

  function renderServices() {
    return `<div class="content-card-stack">${draft.services.map((service, index) => `
      <fieldset class="content-fieldset"><legend>서비스 ${index + 1}</legend><div class="content-field-grid">
        ${field('제목', `services.${index}.title`, { max: 80, wide: true })}
        ${field('설명', `services.${index}.desc`, { max: 300, area: true, rows: 3, wide: true })}
        <label class="content-field wide"><span>검색·요약 태그</span><input data-content-path="services.${index}.tags" data-content-mode="csv" maxlength="120" value="${esc((service.tags || []).join(', '))}" /><small>쉼표로 구분합니다. 예: 욕실, 방수, 부분 공사</small></label>
      </div></fieldset>`).join('')}</div>`;
  }

  function renderActual() {
    return `<p class="content-tab-help">실제 현장에서 촬영한 사진만 사용하세요. 고객 이름·전화번호·동·호수·얼굴은 제목·설명·사진에 공개하지 않습니다.</p><div class="content-card-stack">${draft.actualWork.map((item, index) => `
      <fieldset class="content-fieldset"><legend>실제 현장 ${index + 1}</legend><div class="content-field-grid">
        ${field('사진 구분 라벨', `actualWork.${index}.label`, { max: 60 })}
        ${field('버튼 문구', `actualWork.${index}.cta`, { max: 40 })}
        ${field('제목', `actualWork.${index}.title`, { max: 120, wide: true })}
        ${field('설명', `actualWork.${index}.desc`, { max: 300, area: true, rows: 3, wide: true })}
        ${field('사진 경로', `actualWork.${index}.image`, { max: 220, wide: true, help: '예: assets/cases/파일명.jpg' })}
        ${field('사진 대체 설명', `actualWork.${index}.imageAlt`, { max: 180, wide: true })}
        ${field('연결 주소', `actualWork.${index}.href`, { max: 220, wide: true, help: '예: posts/사례명.html' })}
      </div></fieldset>`).join('')}</div>`;
  }

  function renderFaq() {
    return `<div class="content-tab-head"><p class="content-tab-help">검색 결과의 FAQ 정보도 배포 과정에서 같은 내용으로 동기화됩니다. 답변에는 확정되지 않은 가격·보증 약속을 넣지 마세요.</p><button type="button" class="btn btn-ghost btn-sm" id="contentAddFaq">FAQ 추가</button></div><div class="content-card-stack">${draft.faq.map((item, index) => `
      <fieldset class="content-fieldset"><legend>FAQ ${index + 1}</legend><div class="content-field-grid">
        ${field('질문', `faq.${index}.q`, { max: 160, wide: true })}
        ${field('답변', `faq.${index}.a`, { max: 900, area: true, rows: 5, wide: true })}
      </div>${draft.faq.length > 4 ? `<button type="button" class="remove-content-item" data-remove-faq="${index}">이 FAQ 삭제</button>` : ''}</fieldset>`).join('')}</div>`;
  }

  function renderForm() {
    if (!draft) return;
    const body = $('contentFormBody');
    const renderers = { basic: renderBasic, services: renderServices, actual: renderActual, faq: renderFaq };
    body.innerHTML = (renderers[activeTab] || renderBasic)();
    document.querySelectorAll('[data-content-tab]').forEach((button) => {
      const on = button.dataset.contentTab === activeTab;
      button.classList.toggle('active', on); button.setAttribute('aria-selected', String(on));
    });
    renderValidation(); updateState();
  }

  function onInput(event) {
    const input = event.target.closest('[data-content-path]');
    if (!input || !draft) return;
    const value = input.dataset.contentMode === 'csv'
      ? input.value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8)
      : input.value.trimStart();
    setPath(draft, input.dataset.contentPath, value);
    dirty = true; draftSaved = false;
    renderValidation(); updateState();
  }

  function saveDraft(message) {
    if (!renderValidation()) return false;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      dirty = false; draftSaved = true;
      updateState(message || '✓ 브라우저에 초안 저장됨');
      return true;
    } catch (e) {
      updateState('초안을 저장하지 못했습니다. 브라우저 저장공간을 확인하세요.');
      return false;
    }
  }

  function downloadJson(value, prefix) {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `${prefix}-${stamp}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
  }

  async function importFile(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const errors = validateSite(parsed);
      if (errors.length) throw new Error(errors.slice(0, 3).join(' / '));
      draft = parsed; dirty = true; draftSaved = false; activeTab = 'basic';
      renderForm(); updateState('가져온 수정본 · 아직 저장 안 됨');
    } catch (e) {
      updateState('가져오기 실패: ' + e.message);
    } finally { $('contentFile').value = ''; }
  }

  function addFaq() {
    if (draft.faq.length >= 20) { updateState('FAQ는 최대 20개까지 관리할 수 있습니다.'); return; }
    draft.faq.push({ q: '새 질문을 입력하세요', a: '확인된 사실을 기준으로 답변을 입력하세요.' });
    dirty = true; draftSaved = false; renderForm();
    requestAnimationFrame(() => $('contentFormBody').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function onFormClick(event) {
    if (event.target.id === 'contentAddFaq') { addFaq(); return; }
    const remove = event.target.closest('[data-remove-faq]');
    if (!remove) return;
    const index = Number(remove.dataset.removeFaq);
    if (!Number.isInteger(index) || draft.faq.length <= 4) return;
    draft.faq.splice(index, 1); dirty = true; draftSaved = false; renderForm();
  }

  async function loadPublished() {
    updateState('공개본 불러오는 중…');
    try {
      const response = await fetch('data/site.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      published = await response.json();
      const storedRaw = localStorage.getItem(DRAFT_KEY);
      const stored = storedRaw ? JSON.parse(storedRaw) : null;
      if (stored && !validateSite(stored).length) {
        draft = stored; draftSaved = true;
      } else {
        draft = clone(published); draftSaved = false;
        if (storedRaw) localStorage.removeItem(DRAFT_KEY);
      }
      dirty = false; renderForm();
    } catch (e) {
      updateState('콘텐츠를 불러오지 못했습니다: ' + e.message);
      $('contentFormBody').innerHTML = '<p class="editor-load-error">공개 사이트의 data/site.json을 읽지 못했습니다. 인터넷 연결과 배포 상태를 확인하세요.</p>';
    }
  }

  $('contentEditorForm').addEventListener('input', onInput);
  $('contentEditorForm').addEventListener('click', onFormClick);
  document.querySelector('.content-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-content-tab]');
    if (!tab) return; activeTab = tab.dataset.contentTab; renderForm();
  });
  $('contentSave').addEventListener('click', () => saveDraft());
  $('contentPreview').addEventListener('click', () => {
    if (saveDraft('✓ 초안 저장 · 미리보기 열림')) window.open('index.html?preview=1#top', '_blank', 'noopener');
  });
  $('contentDownload').addEventListener('click', () => {
    if (!renderValidation()) return;
    saveDraft('✓ 수정본 준비 완료'); downloadJson(draft, 'site-수정본');
  });
  $('contentImport').addEventListener('click', () => $('contentFile').click());
  $('contentFile').addEventListener('change', () => importFile($('contentFile').files[0]));
  $('contentReload').addEventListener('click', async () => {
    if (dirty && !confirm('저장하지 않은 변경을 버리고 현재 공개본을 다시 불러올까요?')) return;
    localStorage.removeItem(DRAFT_KEY); dirty = false; draftSaved = false;
    await loadPublished(); updateState('✓ 최신 공개본을 다시 불러왔습니다.');
  });
  $('contentClear').addEventListener('click', () => {
    if (!confirm('이 브라우저에 저장한 사이트 초안을 지울까요? 공개 사이트는 바뀌지 않습니다.')) return;
    localStorage.removeItem(DRAFT_KEY); draft = clone(published); dirty = false; draftSaved = false; renderForm(); updateState('브라우저 초안을 지웠습니다.');
  });
  $('contentRequestCopy').addEventListener('click', async () => {
    if (!renderValidation()) return;
    const changes = changedPaths(editableSnapshot(published), editableSnapshot(draft));
    const text = `만물 사이트 콘텐츠 수정 요청\n- 관리자 미리보기 확인 완료\n- 공개본 대비 변경 항목: ${changes.length}개\n- 첨부 파일: 관리자에서 내려받은 site-수정본 JSON\n- 요청: data/site.json 교체 → FAQ 검색정보 동기화 → 전체 검사 → PR 병합 → 실제 배포 확인\n- 주의: 300개 디자인 데이터와 기존 사례 글은 유지`;
    try { await copyText(text); updateState('✓ 배포 요청문을 복사했습니다.'); }
    catch (e) { updateState('요청문을 복사하지 못했습니다.'); }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return; event.preventDefault(); event.returnValue = '';
  });

  loadPublished();
})();
