/* ============================================================
   관리자 대시보드 — 리드 관리 + 사람 승인 장치
   문의는 localStorage(manmul_inquiries)에서 읽습니다. 실서비스에서는
   n8n → DB(PostgreSQL 등)로 저장하고 이 화면을 DB API에 연결하세요.
   ============================================================ */
(function () {
  const STORAGE_KEY = 'manmul_inquiries';
  const $ = (id) => document.getElementById(id);
  let filter = '전체';
  let CONFIG = {};

  const load = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; } };
  const save = (list) => localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

  /* ----- 간이 AI 요약(클라이언트) : 실제로는 n8n의 AI 노드가 생성 ----- */
  function aiSummary(d) {
    const parts = [];
    if (d.region) parts.push(d.region);
    if (d.area) parts.push(d.area + '평');
    parts.push(d.type + (d.scope ? ' ' + d.scope + '공사' : ''));
    if (d.budget) parts.push(d.budget);
    if (d.movein) parts.push(d.movein + ' 희망');
    const summary = parts.join(', ');

    const questions = [];
    if (d.type !== '상업' && !d.works.includes('샷시')) questions.push('샷시 교체 여부');
    if (!d.works.includes('확장')) questions.push('확장 계획');
    if (d.type === '주거') questions.push('욕실 개수');
    if (d.live === '거주중') questions.push('거주공사 가능 여부');

    // 우선순위 점수 (급함 + 예산 적합성 + 규모)
    let score = 50;
    if (/1개월/.test(d.movein)) score += 20;
    if (/5천|8천|이상/.test(d.budget)) score += 15;
    if (d.scope === '전체') score += 10;
    if ((d.area || 0) >= 30) score += 5;
    score = Math.min(score, 98);

    return { summary, questions: questions.slice(0, 3), score };
  }

  function priorityLabel(score) {
    if (score >= 80) return { t: '높음', c: 'hi' };
    if (score >= 65) return { t: '보통', c: 'mid' };
    return { t: '낮음', c: 'lo' };
  }

  const STATUS_CLASS = { '신규': 'st-new', '승인': 'st-ok', '보류': 'st-hold', '거절': 'st-no' };

  /* ----- KPI ----- */
  function renderKpi(list) {
    const total = list.length;
    const nw = list.filter((x) => x.status === '신규').length;
    const ok = list.filter((x) => x.status === '승인').length;
    const avg = total ? Math.round(list.reduce((s, x) => s + aiSummary(x).score, 0) / total) : 0;
    const kpis = [
      { label: '전체 문의', value: total },
      { label: '신규(미처리)', value: nw },
      { label: '승인 완료', value: ok },
      { label: '평균 우선순위', value: avg + '점' }
    ];
    $('kpiRow').innerHTML = kpis.map((k) => `
      <div class="kpi"><b>${k.value}</b><span>${k.label}</span></div>`).join('');
  }

  /* ----- 문의 카드 ----- */
  function card(d) {
    const ai = aiSummary(d);
    const p = priorityLabel(ai.score);
    const when = (d.submittedAt || '').replace('T', ' ').slice(0, 16);
    const worksTxt = d.works && d.works.length ? d.works.join(', ') : '-';
    return `
    <article class="inq-card" data-id="${d.id}">
      <div class="inq-top">
        <div class="inq-title">
          <span class="status ${STATUS_CLASS[d.status] || 'st-new'}">${d.status}</span>
          <span class="prio prio-${p.c}">우선순위 ${p.t} · ${ai.score}점</span>
        </div>
        <time>${when}</time>
      </div>

      <div class="ai-summary">
        <span class="ai-tag">🤖 AI 1차 요약</span>
        <p>${ai.summary}</p>
        ${ai.questions.length ? `<p class="ai-q">추가 확인 질문: ${ai.questions.join(' / ')}</p>` : ''}
      </div>

      <dl class="inq-grid">
        <div><dt>고객</dt><dd>${d.name || '-'} · ${d.phone || '-'}</dd></div>
        <div><dt>공간/범위</dt><dd>${d.type} ${d.scope || ''} · ${worksTxt}</dd></div>
        <div><dt>예산/시기</dt><dd>${d.budget || '-'} · ${d.movein || '-'}</dd></div>
        <div><dt>참고 견적</dt><dd>${d.estimateHint || '-'}</dd></div>
      </dl>
      ${d.memo ? `<p class="inq-memo">“${d.memo}”</p>` : ''}

      <div class="inq-actions">
        <span class="approve-guide">가격·일정·발송은 대표 승인 후 진행됩니다</span>
        <div class="btn-set">
          <button class="mini ok" data-act="승인">승인</button>
          <button class="mini hold" data-act="보류">보류</button>
          <button class="mini no" data-act="거절">거절</button>
          <button class="mini ghost" data-act="draft">고객 안내문 초안</button>
        </div>
      </div>
      <div class="draft-box" hidden></div>
    </article>`;
  }

  function draftMessage(d) {
    const ai = aiSummary(d);
    return `안녕하세요 ${d.name || '고객'}님, 만물인테리어입니다.\n` +
      `문의 주신 ${ai.summary} 건 확인했습니다.\n` +
      `유사 조건 기준 참고 예상 범위를 안내드리며, 정확한 금액·일정은 현장 실측 후 확정됩니다.\n` +
      `실측 일정을 잡아드릴까요? 가능하신 날짜를 알려주세요.\n\n` +
      `※ 본 메시지는 초안입니다. 대표 승인 후 발송하세요.`;
  }

  function render() {
    const all = load();
    const list = filter === '전체' ? all : all.filter((x) => x.status === filter);
    renderKpi(all);
    $('inqCount').textContent = all.length;
    const wrap = $('inquiryList');
    wrap.innerHTML = list.map(card).join('');
    $('emptyNote').hidden = all.length !== 0;
  }

  /* ----- 상태 변경 / 초안 ----- */
  function setStatus(id, status) {
    const list = load();
    const it = list.find((x) => x.id === id);
    if (it) { it.status = status; save(list); render(); }
  }

  function onListClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const cardEl = btn.closest('.inq-card');
    const id = cardEl.dataset.id;
    const act = btn.dataset.act;
    if (act === 'draft') {
      const list = load();
      const d = list.find((x) => x.id === id);
      const box = cardEl.querySelector('.draft-box');
      box.hidden = !box.hidden;
      box.innerHTML = box.hidden ? '' :
        `<pre>${draftMessage(d)}</pre><small>승인 전에는 자동 발송되지 않습니다 (초안·발송 분리).</small>`;
      return;
    }
    setStatus(id, act);
  }

  /* ----- 파이프라인 상태 ----- */
  async function loadConfig() {
    try { const r = await fetch('data/config.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) {}
    return {};
  }
  function renderPipeline() {
    const n8n = CONFIG.n8n || {};
    const kakao = CONFIG.kakao || {};
    const pill = $('pipelineStatus');
    const on = n8n.enabled && n8n.inquiryWebhookUrl;
    pill.textContent = on ? 'n8n 연결됨 · 실서비스' : '데모 모드 · 로컬 저장';
    pill.classList.add(on ? 'pill-on' : 'pill-demo');
    $('pipeNote').innerHTML = on
      ? `n8n 웹훅: <code>${n8n.inquiryWebhookUrl}</code> · 카카오 채널: <code>${kakao.channelPublicId || '-'}</code>`
      : 'n8n 미설정 상태입니다. <code>data/config.json</code>의 <code>n8n.inquiryWebhookUrl</code>과 <code>enabled:true</code>를 설정하면 실서비스로 전환됩니다. 지금은 문의가 브라우저에 저장됩니다.';
  }

  /* ----- 데모 샘플 ----- */
  function seed() {
    const samples = [
      { type: '주거', region: '대전 유성구', area: 34, scope: '전체', works: ['샷시', '주방', '욕실', '바닥'], budget: '5천~8천만원', movein: '1개월 이내', live: '공실', name: '김민수', phone: '010-1234-5678', memo: '입주 전 전체 리모델링 원해요.', estimateHint: '₩ 41,310,000' },
      { type: '상업', region: '세종시 나성동', area: 22, scope: '전체', works: ['철거', '조명·전기', '가구·붙박이'], budget: '3천~5천만원', movein: '1~3개월', live: '공실', name: '이서연', phone: '010-2222-3333', memo: '카페 창업 준비 중입니다.', estimateHint: '₩ 32,670,000' },
      { type: '리모델링', region: '대전 서구', area: 45, scope: '부분', works: ['욕실', '도배·페인트'], budget: '~3천만원', movein: '3~6개월', live: '거주중', name: '박준호', phone: '010-4444-5555', memo: '', estimateHint: '₩ 27,000,000' }
    ];
    const list = load();
    samples.forEach((s, i) => list.unshift({
      id: 'INQ-DEMO-' + (Date.now() + i),
      source: 'demo', status: '신규',
      submittedAt: new Date(Date.now() - i * 3600000).toISOString(),
      ...s
    }));
    save(list); render();
  }

  async function init() {
    CONFIG = await loadConfig();
    renderPipeline();
    render();
    $('inquiryList').addEventListener('click', onListClick);
    $('seedBtn').addEventListener('click', seed);
    $('statusFilter').addEventListener('click', (e) => {
      const b = e.target.closest('.ftab'); if (!b) return;
      $('statusFilter').querySelectorAll('.ftab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); filter = b.dataset.f; render();
    });
  }

  // 외부(단일 파일 데모의 화면 전환 등)에서 목록을 새로고침할 수 있도록 노출
  window.manmulAdminRefresh = render;

  document.addEventListener('DOMContentLoaded', init);
})();
