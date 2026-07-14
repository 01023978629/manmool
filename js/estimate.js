/* ============================================================
   AI 예상견적 — 대화식(chat) 흐름
   긴 설문 대신 한 번에 하나씩 묻고, 마지막에 예상금액·필요공사·
   자재등급·공사기간·비슷한 사례·상담 전 준비를 생성합니다.
   ============================================================ */
(function () {
  const won = (n) => '₩' + Math.round(n).toLocaleString('ko-KR');
  const $ = (id) => document.getElementById(id);

  let CFG = null;      // data.estimator
  let PORTFOLIO = [];  // data.portfolio
  let MANMUL = null;
  const answers = {};

  const STEPS = [
    {
      key: 'type', bot: '안녕하세요! AI 예상견적을 도와드릴게요 🤖\n어떤 공간을 공사하시나요?',
      options: [{ v: '주거', l: '주거(아파트·주택)' }, { v: '상업', l: '상업(카페·매장·오피스)' }, { v: '리모델링', l: '리모델링' }]
    },
    {
      key: 'area', bot: '공사할 공간은 몇 평인가요?', type: 'area'
    },
    {
      key: 'scope', bot: '전체공사인가요, 부분공사인가요?',
      options: [{ v: '전체공사', l: '전체공사' }, { v: '부분공사', l: '부분공사' }]
    },
    {
      key: 'budget', bot: '생각하시는 예상 예산은 어느 정도인가요?',
      options: [{ v: '~3천만원', l: '~3천만원' }, { v: '3~5천만원', l: '3~5천만원' }, { v: '5~8천만원', l: '5~8천만원' }, { v: '8천만원 이상', l: '8천만원 이상' }, { v: '미정', l: '아직 미정' }]
    },
    {
      key: 'photo', bot: '현재 공간 사진을 올려주시면 더 정확해요. (선택)', type: 'photo'
    }
  ];

  let idx = 0;

  function bubble(who, text) {
    const b = document.createElement('div');
    b.className = 'ce-bubble ' + who;
    b.textContent = text;
    $('ceBody').appendChild(b);
    $('ceBody').scrollTop = $('ceBody').scrollHeight;
  }

  function setInput(html) {
    const el = $('ceInput');
    el.innerHTML = html;
    return el;
  }

  function ask() {
    if (idx >= STEPS.length) { finish(); return; }
    const step = STEPS[idx];
    bubble('bot', step.bot);

    if (step.type === 'area') {
      setInput(`
        <div class="ce-area">
          <input type="number" id="ceArea" min="1" max="500" placeholder="예: 34" inputmode="numeric" />
          <button type="button" class="ce-btn" id="ceAreaGo">확인</button>
        </div>
        <div class="ce-quick">${[15, 24, 34, 45, 60].map((a) => `<button type="button" class="ce-chip" data-a="${a}">${a}평</button>`).join('')}</div>`);
      const go = () => {
        const v = parseInt($('ceArea').value, 10);
        if (!v || v < 1) { $('ceArea').focus(); return; }
        answer('area', v, v + '평');
      };
      $('ceAreaGo').addEventListener('click', go);
      $('ceArea').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      $('ceInput').querySelectorAll('.ce-chip').forEach((c) =>
        c.addEventListener('click', () => answer('area', +c.dataset.a, c.dataset.a + '평')));
    } else if (step.type === 'photo') {
      setInput(`
        <label class="ce-upload">
          <input type="file" id="cePhoto" accept="image/*" multiple hidden />
          <span>📷 사진 첨부</span>
        </label>
        <button type="button" class="ce-btn ghost" id="cePhotoSkip">사진 없이 계속</button>`);
      $('cePhoto').addEventListener('change', (e) => {
        const n = e.target.files.length;
        answer('photo', n, n ? `사진 ${n}장 첨부` : '사진 없이 진행');
      });
      $('cePhotoSkip').addEventListener('click', () => answer('photo', 0, '사진 없이 진행'));
    } else {
      setInput(`<div class="ce-quick">${step.options.map((o) =>
        `<button type="button" class="ce-chip" data-v="${o.v}">${o.l}</button>`).join('')}</div>`);
      $('ceInput').querySelectorAll('.ce-chip').forEach((c) =>
        c.addEventListener('click', () => answer(step.key, c.dataset.v, c.textContent)));
    }
  }

  function answer(key, value, label) {
    answers[key] = value;
    bubble('user', label);
    idx += 1;
    setInput('');
    setTimeout(ask, 350);
  }

  function similarCases() {
    const type = answers.type;
    const area = answers.area || 30;
    const catMatch = type === '리모델링' ? null : type; // 주거/상업
    return PORTFOLIO
      .map((x) => {
        let s = 0;
        if (catMatch && x.category === catMatch) s += 3;
        s += Math.max(0, 4 - Math.abs(x.area - area) / 5);
        return { x, s };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((o) => o.x);
  }

  function finish() {
    const type = answers.type;
    const area = answers.area || 30;
    const scope = answers.scope || '전체공사';
    const budget = answers.budget || '미정';

    const base = (CFG.baseByType && CFG.baseByType[type]) || CFG.baseByType['주거'] || 900000;
    const grade = (CFG.gradeByBudget && CFG.gradeByBudget[budget]) || '표준형';
    const mult = (CFG.gradeMultiplier && CFG.gradeMultiplier[grade]) || 1.35;
    const scopeFactor = scope === '부분공사' ? 0.55 : 1;
    const total = base * mult * area * scopeFactor;
    const low = total * 0.9;
    const high = total * 1.15;

    const works = (CFG.worksByScope && CFG.worksByScope[scope]) || [];
    const periodRow = (CFG.periodByArea || []).find((p) => area <= p.max);
    const period = periodRow ? periodRow.period : '협의';
    const sims = similarCases();

    MANMUL.lastEstimate = `${won(low)} ~ ${won(high)}`;

    bubble('bot', 'AI가 입력하신 내용을 분석했어요. 아래 참고 결과를 확인해 주세요 👇');

    const card = document.createElement('div');
    card.className = 'ce-result';
    card.innerHTML = `
      <div class="cr-amount">
        <span>예상 금액 범위</span>
        <strong>${won(low)} ~ ${won(high)}</strong>
        <small>${type} · ${area}평 · ${scope} · ${grade} 기준</small>
      </div>
      <div class="cr-grid">
        <div class="cr-box">
          <h4>필요한 공사</h4>
          <div class="cr-tags">${works.map((w) => `<span>${w}</span>`).join('') || '<span>상담 후 확정</span>'}</div>
        </div>
        <div class="cr-box">
          <h4>추천 자재 등급</h4>
          <p class="cr-grade">${grade}</p>
        </div>
        <div class="cr-box">
          <h4>예상 공사기간</h4>
          <p class="cr-grade">${period}</p>
        </div>
        <div class="cr-box">
          <h4>상담 전 준비</h4>
          <ul class="cr-prep"><li>평면도·등기 정보</li><li>희망 스타일 이미지</li><li>입주(공사) 희망일</li></ul>
        </div>
      </div>
      ${sims.length ? `
      <div class="cr-similar">
        <h4>비슷한 시공 사례</h4>
        <div class="cr-similar-grid">
          ${sims.map((s) => `
            <button type="button" class="cr-sim" data-id="${s.id}">
              <span class="cr-sim-thumb" style="background:linear-gradient(150deg, ${s.afterColor}, ${shadeLocal(s.afterColor, -14)})"></span>
              <b>${s.title}</b><small>${s.area}평 · ${s.style}</small>
            </button>`).join('')}
        </div>
      </div>` : ''}
      <div class="cr-flow">
        <span class="crf-title">다음 단계</span>
        <ol class="crf-steps">
          <li class="done"><b>AI 예상견적</b><span>지금 여기</span></li>
          <li class="active"><b>무료 방문 실측</b><span>현장 확인</span></li>
          <li><b>정식 견적서</b><span>금액 확정</span></li>
          <li><b>계약</b><span>전자 서명</span></li>
        </ol>
        <p class="crf-note">위 금액은 참고용이며, <b>실제 금액은 방문 실측 후 정식 견적서로 확정</b>됩니다.</p>
      </div>
      <p class="cr-note">${CFG.note || ''}</p>
      <a href="#inquiry" class="btn btn-primary btn-lg btn-block">무료 방문 실측 예약하기</a>`;
    $('ceBody').appendChild(card);
    $('ceBody').scrollTop = $('ceBody').scrollHeight;
    setInput('');
    $('ceRestart').hidden = false;

    // 비슷한 사례 클릭 → 상세 모달(main.js) 재사용
    card.querySelectorAll('.cr-sim').forEach((b) => b.addEventListener('click', () => {
      const item = PORTFOLIO.find((x) => x.id === b.dataset.id);
      if (typeof window.openFolioModal === 'function') window.openFolioModal(item, PORTFOLIO);
    }));
  }

  function shadeLocal(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const c = (v) => Math.max(0, Math.min(255, v));
    return '#' + ((c(((n >> 16) & 255) + amt) << 16) | (c(((n >> 8) & 255) + amt) << 8) | c((n & 255) + amt)).toString(16).padStart(6, '0');
  }

  function reset() {
    idx = 0;
    Object.keys(answers).forEach((k) => delete answers[k]);
    $('ceBody').innerHTML = '';
    $('ceRestart').hidden = true;
    ask();
  }

  function init(ctx) {
    if (!$('chatEstimator')) return;
    MANMUL = ctx;
    CFG = (ctx.data && ctx.data.estimator) || {};
    PORTFOLIO = (ctx.data && ctx.data.portfolio) || [];
    if (CFG.note) { const note = $('estimatorNote'); if (note) note.textContent = CFG.note; }
    $('ceRestart').addEventListener('click', reset);
    reset();
  }

  window.initEstimator = init;
})();
