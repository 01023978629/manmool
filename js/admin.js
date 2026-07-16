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
          ${d.sentAt ? '<span class="prio sent-chip">✓ 발송됨</span>' : ''}
        </div>
        <time>${when}</time>
      </div>

      <div class="ai-summary">
        <span class="ai-tag">🤖 AI 1차 요약</span>
        <p>${escapeHtml(ai.summary)}</p>
        ${ai.questions.length ? `<p class="ai-q">추가 확인 질문: ${escapeHtml(ai.questions.join(' / '))}</p>` : ''}
      </div>

      <dl class="inq-grid">
        <div><dt>고객</dt><dd>${escapeHtml(d.name || '-')} · ${escapeHtml(d.phone || '-')}</dd></div>
        <div><dt>공간/범위</dt><dd>${escapeHtml(d.type || '')} ${escapeHtml(d.scope || '')} · ${escapeHtml(worksTxt)}</dd></div>
        <div><dt>예산/시기</dt><dd>${escapeHtml(d.budget || '-')} · ${escapeHtml(d.movein || '-')}</dd></div>
        <div><dt>참고 견적</dt><dd>${escapeHtml(d.estimateHint || '-')}</dd></div>
        ${d.selectedDesign ? `<div><dt>선택 디자인</dt><dd>🎨 ${escapeHtml(d.selectedDesign)}</dd></div>` : ''}
      </dl>
      ${d.memo ? `<p class="inq-memo">“${escapeHtml(d.memo)}”</p>` : ''}

      <div class="inq-actions">
        <span class="approve-guide">가격·일정·발송은 대표 승인 후 진행됩니다</span>
        <div class="btn-set">
          <button class="mini ok" data-act="승인">승인</button>
          <button class="mini hold" data-act="보류">보류</button>
          <button class="mini no" data-act="거절">거절</button>
          <button class="mini ghost" data-act="draft">고객 안내문 초안</button>
          <button class="mini field" data-act="tofield">🏗 현장 앱으로 보내기</button>
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
      `- 만물인테리어 (${(CONFIG.company && CONFIG.company.phone) || '010-2397-8629'})`;
  }

  /* ----- 수동 발송 UI (초안·발송 분리, 사람이 직접 발송) ----- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtSent(d) {
    if (!d.sentAt) return '';
    const t = d.sentAt.replace('T', ' ').slice(0, 16);
    const n = (d.sentLog && d.sentLog.length) || 1;
    return `<span class="sent-mark">✓ 발송 기록 · ${d.sentVia || ''} · ${t}${n > 1 ? ` (총 ${n}회)` : ''}</span>`;
  }
  function draftBoxHTML(d) {
    const msg = draftMessage(d);
    const kakao = CONFIG.kakao || {};
    const hasKakao = !!(kakao.chatUrl || kakao.channelAddUrl);
    const approved = d.status === '승인';
    return `
      <div class="draft-head">
        <b>고객 안내문 · 수동 발송</b>
        <span class="draft-hint ${approved ? 'ok' : 'warn'}">${approved
          ? '승인된 리드입니다. 내용 확인 후 직접 발송하세요.'
          : '⚠ 아직 승인 전 리드입니다. 발송 전 반드시 내용을 확인하세요.'}</span>
      </div>
      <textarea class="draft-text" rows="7" aria-label="고객 안내문 내용">${escapeHtml(msg)}</textarea>
      <div class="draft-actions">
        <button class="mini ok" data-act="copy">📋 내용 복사</button>
        <button class="mini" data-act="sms">📱 문자로 발송</button>
        <button class="mini kakao" data-act="kakao"${hasKakao ? '' : ' disabled title="data/config.json의 kakao.chatUrl을 설정하세요"'}>💬 카카오톡 열고 발송</button>
      </div>
      <small class="draft-foot">복사·문자·카카오톡 중 하나로 발송하면 발송 기록이 남습니다. 자동 발송은 없으며, 대표가 직접 발송합니다.</small>
      <div class="sent-line">${fmtSent(d)}</div>`;
  }

  function copyText(text) {
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
  function flash(btn, txt) {
    const orig = btn.textContent;
    btn.textContent = txt; btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1400);
  }
  function recordSent(id, via) {
    const list = load();
    const it = list.find((x) => x.id === id);
    if (!it) return;
    const now = new Date().toISOString();
    it.sentAt = now; it.sentVia = via;
    (it.sentLog = it.sentLog || []).push({ via, at: now });
    save(list);
    const cardEl = document.querySelector('.inq-card[data-id="' + id + '"]');
    if (!cardEl) return;
    const line = cardEl.querySelector('.sent-line');
    if (line) line.innerHTML = fmtSent(it);
    const title = cardEl.querySelector('.inq-title');
    if (title && !title.querySelector('.sent-chip')) {
      title.insertAdjacentHTML('beforeend', '<span class="prio sent-chip">✓ 발송됨</span>');
    }
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

  // 리드를 현장 앱(hyeonjang) 딥링크로 인코딩
  function utf8ToB64url(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fieldAppLink(d) {
    const app = (CONFIG.hyeonjang && CONFIG.hyeonjang.appUrl) || '';
    const lead = {
      name: d.name, phone: d.phone, region: d.region, type: d.type, area: d.area,
      scope: d.scope, works: d.works, budget: d.budget, movein: d.movein,
      estimateHint: d.estimateHint, memo: d.memo
    };
    const url = app ? app + (app.indexOf('?') >= 0 ? '&' : '?') + 'lead=' + utf8ToB64url(JSON.stringify(lead)) : '';
    return { app, url };
  }

  function onListClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const cardEl = btn.closest('.inq-card');
    const id = cardEl.dataset.id;
    const act = btn.dataset.act;
    if (act === 'tofield') {
      const d = load().find((x) => x.id === id);
      const { app, url } = fieldAppLink(d);
      if (!app) {
        alert('현장 앱 주소가 설정되지 않았습니다.\n운영자는 data/config.json의 hyeonjang.appUrl을 입력하세요.');
        return;
      }
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (act === 'draft') {
      const d = load().find((x) => x.id === id);
      const box = cardEl.querySelector('.draft-box');
      box.hidden = !box.hidden;
      box.innerHTML = box.hidden ? '' : draftBoxHTML(d);
      if (!box.hidden) btn.classList.add('open'); else btn.classList.remove('open');
      return;
    }
    if (act === 'copy' || act === 'sms' || act === 'kakao') {
      const d = load().find((x) => x.id === id);
      if (!d) return;
      const box = cardEl.querySelector('.draft-box');
      const ta = box && box.querySelector('.draft-text');
      const text = ta ? ta.value : draftMessage(d);
      if (act === 'copy') {
        copyText(text).then(() => flash(btn, '✓ 복사됨'));
        recordSent(id, '복사');
      } else if (act === 'sms') {
        const phone = (d.phone || '').replace(/[^0-9]/g, '');
        if (!phone) { alert('고객 전화번호가 없습니다.'); return; }
        window.open('sms:' + phone + '?body=' + encodeURIComponent(text), '_blank');
        recordSent(id, '문자');
      } else if (act === 'kakao') {
        const kakao = CONFIG.kakao || {};
        const url = kakao.chatUrl || kakao.channelAddUrl;
        if (!url) {
          alert('카카오톡 채널 URL이 설정되지 않았습니다.\n운영자는 data/config.json의 kakao.chatUrl을 입력하세요.');
          return;
        }
        // 카카오 1:1 채팅은 자동 전송 API가 아니므로, 내용을 복사한 뒤 채널 채팅을 엽니다(붙여넣기 발송).
        copyText(text).then(() => flash(btn, '✓ 복사됨 · 채널 열림'));
        window.open(url, '_blank', 'noopener');
        recordSent(id, '카카오톡');
      }
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

  /* ----- 연동 상태 (실서비스 전환) ----- */
  function renderConnection() {
    const n8n = CONFIG.n8n || {};
    const kakao = CONFIG.kakao || {};
    const hj = CONFIG.hyeonjang || {};
    const live = !!(n8n.enabled && n8n.inquiryWebhookUrl) && !CONFIG.demoMode;
    const badge = $('connBadge');
    if (badge) {
      badge.textContent = live ? '🟢 실서비스 연결됨' : '🟡 데모 모드';
      badge.className = 'conn-badge ' + (live ? 'on' : 'demo');
    }
    const rows = [
      ['n8n 웹훅', n8n.inquiryWebhookUrl || '(미설정)', !!n8n.inquiryWebhookUrl],
      ['n8n enabled', String(!!n8n.enabled), !!n8n.enabled],
      ['카카오 채널', kakao.chatUrl || kakao.channelAddUrl || '(미설정)', !!(kakao.chatUrl || kakao.channelAddUrl)],
      ['현장 앱(hyeonjang)', hj.appUrl || '(미설정)', !!hj.appUrl],
      ['demoMode', String(!!CONFIG.demoMode), !CONFIG.demoMode]
    ];
    const grid = $('connGrid');
    if (grid) grid.innerHTML = rows.map(([k, v, ok]) => `
      <div class="conn-item ${ok ? 'ok' : 'no'}">
        <span class="ci-key">${k}</span>
        <span class="ci-val">${v}</span>
        <span class="ci-dot">${ok ? '✓' : '—'}</span>
      </div>`).join('');
  }

  async function testWebhook() {
    const n8n = CONFIG.n8n || {};
    const res = $('connResult');
    const btn = $('connTest');
    if (!n8n.inquiryWebhookUrl) {
      res.textContent = '웹훅 URL이 설정되지 않았습니다. data/config.json의 n8n.inquiryWebhookUrl을 먼저 입력하세요.';
      res.className = 'conn-result err';
      return;
    }
    btn.disabled = true;
    res.textContent = '연결 테스트 중… (' + n8n.inquiryWebhookUrl + ')';
    res.className = 'conn-result';
    const payload = { source: 'admin-test', submittedAt: new Date().toISOString(), status: '테스트', ping: true };
    try {
      const r = await fetch(n8n.inquiryWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (r.ok) { res.textContent = '✓ 웹훅 응답 정상 (' + r.status + '). n8n 워크플로가 테스트 요청을 수신했습니다.'; res.className = 'conn-result ok'; }
      else { res.textContent = '△ 웹훅이 응답했으나 오류 상태입니다 (' + r.status + '). n8n 워크플로 활성화/경로를 확인하세요.'; res.className = 'conn-result err'; }
    } catch (e) {
      res.textContent = '✗ 웹훅에 연결하지 못했습니다 (' + e.message + '). URL·CORS·n8n 실행 상태를 확인하세요.';
      res.className = 'conn-result err';
    } finally {
      btn.disabled = false;
    }
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
    renderConnection();
    render();
    $('inquiryList').addEventListener('click', onListClick);
    $('seedBtn').addEventListener('click', seed);
    const ct = $('connTest'); if (ct) ct.addEventListener('click', testWebhook);
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
