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

    // 진행 표시 + 이전 버튼
    $('ceInput').insertAdjacentHTML('afterbegin',
      `<div class="ce-controls">
         <span class="ce-progress">질문 ${idx + 1} / ${STEPS.length}</span>
         ${idx > 0 ? '<button type="button" class="ce-back" id="ceBack">← 이전 답변 수정</button>' : ''}
       </div>`);
    const back = $('ceBack');
    if (back) back.addEventListener('click', goBack);
  }

  // 직전 답변으로 되돌아가 다시 묻기
  function goBack() {
    if (idx <= 0) return;
    const body = $('ceBody');
    const bubbles = () => body.querySelectorAll('.ce-bubble');
    let b = bubbles();
    if (b.length) b[b.length - 1].remove();   // 현재 질문(bot) 제거
    b = bubbles();
    if (b.length) b[b.length - 1].remove();   // 직전 답변(user) 제거
    idx -= 1;
    delete answers[STEPS[idx].key];
    ask();
  }

  function answer(key, value, label) {
    answers[key] = value;
    bubble('user', label);
    idx += 1;
    setInput('');
    setTimeout(ask, 350);
  }

  // AI 추천 디자인(spaceType/style/mood 스키마)에 맞춰 답변 기반으로 추천.
  // 과거 아파트단지(category/area) 스키마 잔재를 제거하고, 입력에 따라 결과가 달라지도록 함.
  function similarCases() {
    const area = answers.area || 30;
    const budget = answers.budget || '';
    const commercial = answers.type === '상업';
    const premium = /8천|이상/.test(budget) || area >= 45;
    const compact = (/^~?3천/.test(budget) && !/5천|8천/.test(budget)) || area <= 18;

    const COMMERCIAL = ['모던', '인더스트리얼', '호텔식'];
    const PREMIUM = ['호텔식', '프렌치', '모던'];
    const COMPACT = ['미니멀', '북유럽', '내추럴'];

    return PORTFOLIO
      .map((x, i) => {
        let s = 0;
        if (commercial && COMMERCIAL.includes(x.style)) s += 3;
        if (!commercial && ['거실', '침실'].includes(x.spaceType)) s += 2;
        if (premium && PREMIUM.includes(x.style)) s += 2;
        if (compact && COMPACT.includes(x.style)) s += 2;
        // 동점 축퇴 방지: 입력 평수에 따라 안정적으로 순서를 흔들어 준다(허위 정밀도 아님).
        s += ((area + i) % 5) * 0.1;
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
    // 상담 폼이 같은 질문을 반복하지 않도록 답변을 넘겨준다
    MANMUL.lastAnswers = { type: type, area: area, scope: scope, budget: budget, photo: answers.photo || 0 };

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
        <h4>${sims.some((s) => s.aiDesign) ? '추천 디자인' : '비슷한 시공 사례'}</h4>
        <div class="cr-similar-grid">
          ${sims.map((s) => {
            const thumb = s.photo
              ? `background-image:url('${s.photo}');background-size:cover;background-position:center`
              : `background:linear-gradient(150deg, ${s.afterColor || '#cdb8a0'}, ${shadeLocal(s.afterColor || '#cdb8a0', -14)})`;
            const sub = [s.spaceType, s.style].filter(Boolean).join(' · ') || (s.area ? s.area + '평 · ' + (s.style || '') : (s.style || ''));
            return `
            <button type="button" class="cr-sim" data-id="${s.id}">
              <span class="cr-sim-thumb" style="${thumb}"></span>
              <b>${s.title}</b><small>${sub}</small>
            </button>`;
          }).join('')}
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

    // '무료 방문 실측 예약하기' → 상담 폼에 답변 자동 채움
    const cta = card.querySelector('a[href="#inquiry"]');
    if (cta) cta.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('manmul:estimate', { detail: MANMUL.lastAnswers }));
    });
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
