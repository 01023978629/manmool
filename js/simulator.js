/* 우리집 사양서 시뮬레이터 — 공간을 고르고 등급을 조절해 "우리집에서 무엇까지 되는가"를 직접 맞춰본다.
 *
 * 이 도구가 하지 않는 것(중요): 사진을 합성하지 않는다. 생성형 AI를 호출하지 않는다.
 *   입력한 평형·공간·등급으로 자재 수량과 금액을 계산해 보여줄 뿐이다.
 *   화면 고지 문구(SIM_NOTICE)와 저장 이미지 워터마크가 그 사실을 항상 말한다.
 *
 * 계산은 새로 만들지 않는다 — 기존 DesignBom(표준품셈·시중노임단가 기반, 사례 카탈로그가 쓰는 그 엔진)을
 *   그대로 호출한다. 따로 만들면 같은 조건인데 사례 상세와 시뮬레이터 금액이 갈라진다.
 *
 * 상태는 URL 해시(#sim=...)에 담는다. 서버가 없어도 배우자에게 링크를 보내 같은 화면을 열 수 있고,
 *   사장님도 그 링크로 고객이 본 화면을 그대로 재현한다. fragment 는 서버 로그·리퍼러에 남지 않는다.
 */
(function (root) {
  'use strict';

  var SPACES = [
    { key: '거실', icon: '🛋', hint: '바닥·벽·조명' },
    { key: '주방', icon: '🍳', hint: '싱크대·타일' },
    { key: '욕실', icon: '🛁', hint: '방수·타일·도기' },
    { key: '침실', icon: '🛏', hint: '바닥·도배' },
    { key: '현관', icon: '🚪', hint: '중문·타일' },
    { key: '서재', icon: '📚', hint: '바닥·조명' },
    { key: '아이방', icon: '🧸', hint: '친환경 마감' },
    { key: '드레스룸', icon: '👗', hint: '수납·조명' }
  ];

  /* 등급은 DesignBom 의 BUDGET_TIERS 와 같은 축을 쓴다 — budget 문자열이 그 tier 를 고르는 열쇠다.
     여기서 임의 등급을 만들면 계산 엔진이 못 알아듣고 조용히 '표준'으로 떨어진다. */
  var TIERS = [
    { key: 'economy', label: '실속', budget: '3천만원 이하', desc: '꼭 필요한 곳만 · 기본 마감' },
    { key: 'standard', label: '표준', budget: '3천~5천만원', desc: '가장 많이 하시는 구성' },
    { key: 'premium', label: '고급', budget: '5천~8천만원', desc: '자재 등급을 올린 구성' }
  ];

  var AGE_OPTIONS = [
    { key: 'new', label: '10년 이내', risk: 0, note: '' },
    { key: 'mid', label: '10~20년', risk: 0.05, note: '부분 배관 점검이 필요할 수 있습니다.' },
    { key: 'old', label: '20년 이상', risk: 0.12, note: '철거 후 배관·기존 방수 상태에 따라 금액이 늘 수 있습니다.' },
    { key: 'unknown', label: '잘 모름', risk: 0.05, note: '준공 연도는 실측 때 함께 확인해 드립니다.' }
  ];

  var LIVE_OPTIONS = [
    { key: 'live', label: '살면서 공사', note: '물 사용이 어려운 날이 생깁니다. 공정을 나눠 진행합니다.' },
    { key: 'empty', label: '비우고 공사', note: '공정을 겹쳐 기간을 줄일 수 있습니다.' }
  ];

  var AREA_STEPS = [18, 20, 24, 25, 30, 32, 34, 42, 50, 52];

  /* 화면에 반드시 남아야 하는 고지 — 검증기(scripts/ensure-simulator-honesty.mjs)가 존재를 강제한다.
     문구를 바꾸려면 검증기도 함께 고쳐야 한다(조용히 사라지는 것을 막기 위함). */
  var SIM_NOTICE = {
    top: '참고용 구성안입니다. 이 화면은 실제 시공 사진이나 견적서가 아니라, 입력하신 조건으로 계산한 예시입니다. 실제 색상·자재·마감은 현장 상태와 제품 수급에 따라 달라집니다.',
    price: '표시 금액은 건설공사 표준품셈·시중노임단가로 계산한 참고 범위입니다. 철거 후 드러나는 배관·방수·바닥 구배 상태에 따라 달라지며, 최종 금액은 방문 실측 후 서면 견적서로만 확정됩니다.',
    material: '표시된 제품명·색상은 해당 등급의 예시입니다. 동급 대체품으로 시공될 수 있으며, 최종 사양은 계약서 별지에 기재됩니다. 화면 색상은 실제 도장·타일 색과 차이가 있습니다.',
    ai: '이 도구는 사진을 합성하지 않습니다. 입력하신 평형·공간·등급으로 자재 수량과 금액을 계산해 보여줍니다.'
  };

  var state = {
    area: 30,
    age: 'mid',
    live: 'live',
    picked: ['거실', '욕실'],
    tiers: {},          // 공간별 등급 key
    cap: 0,             // 예산 상한(원). 0 = 미설정
    step: 1
  };
  var CTX = null;
  var TOTAL_STEPS = 4;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function won(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function man(n) { return Math.round(Number(n || 0) / 10000).toLocaleString('ko-KR') + '만'; }
  function tierOf(space) { return state.tiers[space] || 'standard'; }
  function tierDef(key) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].key === key) return TIERS[i];
    return TIERS[1];
  }
  function ageDef() {
    for (var i = 0; i < AGE_OPTIONS.length; i++) if (AGE_OPTIONS[i].key === state.age) return AGE_OPTIONS[i];
    return AGE_OPTIONS[1];
  }

  /* ── 계산: 공간별로 DesignBom 에 넘길 가짜 '시안' 하나를 만들어 그 엔진으로 견적을 낸다 ── */
  function bomFor(space) {
    var catalog = (CTX && CTX.materialCatalog) || (root.MANMUL && root.MANMUL.materialCatalog) || null;
    if (!root.DesignBom || typeof root.DesignBom.build !== 'function') return null;
    var t = tierDef(tierOf(space));
    try {
      return root.DesignBom.build({ spaceType: space, area: state.area, budget: t.budget, materials: [] }, catalog);
    } catch (e) { return null; }
  }

  function calc() {
    var rows = [];
    var low = 0, high = 0;
    state.picked.forEach(function (space) {
      var bom = bomFor(space);
      if (!bom) return;
      rows.push({ space: space, tier: tierOf(space), bom: bom });
      low += bom.rangeLow;
      high += bom.rangeHigh;
    });
    // 노후 주택 위험분은 '상한'에만 얹는다. 하한까지 올리면 없는 비용을 확정처럼 보이게 만든다.
    var risk = ageDef().risk;
    high = Math.round(high * (1 + risk));
    return { rows: rows, low: roundMan(low), high: roundMan(high), risk: risk };
  }
  function roundMan(n) { return Math.round(Number(n || 0) / 100000) * 100000; }   // 10만원 단위 — 허위 정밀도 방지

  /* 예산 상한을 넘을 때 '무엇을 빼면 맞는지'를 제안한다. 고객이 통제감을 갖는 지점이라 결과를 숨기지 않는다. */
  function trimSuggestions(result) {
    if (!state.cap || result.low <= state.cap) return [];
    var out = [];
    // ① 등급을 한 단계 내리기 — 절감액이 큰 공간부터
    result.rows.forEach(function (r) {
      var cur = tierOf(r.space);
      if (cur === 'economy') return;
      var next = cur === 'premium' ? 'standard' : 'economy';
      var t = tierDef(next);
      var catalog = (CTX && CTX.materialCatalog) || null;
      try {
        var alt = root.DesignBom.build({ spaceType: r.space, area: state.area, budget: t.budget, materials: [] }, catalog);
        var save = r.bom.rangeLow - alt.rangeLow;
        if (save > 0) out.push({ type: 'tier', space: r.space, to: next, label: r.space + ' 등급을 ' + t.label + '으로', save: save });
      } catch (e) { /* 계산 실패한 제안은 내놓지 않는다 */ }
    });
    // ② 공간 빼기
    result.rows.forEach(function (r) {
      out.push({ type: 'drop', space: r.space, label: r.space + ' 이번에는 제외', save: r.bom.rangeLow });
    });
    out.sort(function (a, b) { return b.save - a.save; });
    return out.slice(0, 4);
  }

  /* ── URL 해시 상태(재현 링크) ── */
  function encodeState() {
    var t = state.picked.map(function (s) { return SPACES.findIndex(function (x) { return x.key === s; }) + ':' + tierOf(s).charAt(0); }).join(',');
    return ['a' + state.area, 'g' + state.age, 'l' + state.live, 'c' + Math.round(state.cap / 10000), 's' + t].join('|');
  }
  function decodeState(raw) {
    if (!raw) return false;
    try {
      var parts = String(raw).split('|');
      var picked = [], tiers = {};
      parts.forEach(function (p) {
        var k = p.charAt(0), v = p.slice(1);
        if (k === 'a') state.area = Math.max(10, Math.min(80, Number(v) || 30));
        else if (k === 'g') state.age = AGE_OPTIONS.some(function (x) { return x.key === v; }) ? v : 'mid';
        else if (k === 'l') state.live = (v === 'empty' ? 'empty' : 'live');
        else if (k === 'c') state.cap = Math.max(0, (Number(v) || 0) * 10000);
        else if (k === 's' && v) {
          v.split(',').forEach(function (pair) {
            var seg = pair.split(':');
            var sp = SPACES[Number(seg[0])];
            if (!sp) return;
            picked.push(sp.key);
            tiers[sp.key] = { e: 'economy', s: 'standard', p: 'premium' }[seg[1]] || 'standard';
          });
        }
      });
      if (picked.length) { state.picked = picked; state.tiers = tiers; }
      return true;
    } catch (e) { return false; }
  }
  function shareUrl() {
    return location.origin + location.pathname + '#sim=' + encodeURIComponent(encodeState());
  }

  /* ── 렌더 ── */
  function render() {
    var host = $('simBody');
    if (!host) return;
    host.innerHTML = state.step === 1 ? viewHome()
      : state.step === 2 ? viewSpaces()
        : state.step === 3 ? viewTiers()
          : viewResult();
    var prog = $('simProgress');
    if (prog) {
      prog.innerHTML = ['우리집', '공간 고르기', '등급 맞추기', '사양서'].map(function (l, i) {
        var n = i + 1;
        return '<span class="sim-step' + (n === state.step ? ' on' : (n < state.step ? ' done' : '')) + '">' + esc(l) + '</span>';
      }).join('');
    }
    var back = $('simBack');
    if (back) back.hidden = state.step === 1;
  }

  function chip(label, active, attr) {
    return '<button type="button" class="sim-chip' + (active ? ' on' : '') + '" ' + attr + '>' + label + '</button>';
  }

  function viewHome() {
    return '<p class="sim-lead">우리집 조건을 먼저 알려주세요. 4가지만 고르면 됩니다.</p>' +
      '<div class="sim-field"><label for="simArea">우리집 평형 <b id="simAreaVal">' + state.area + '평</b></label>' +
      '<input type="range" id="simArea" min="0" max="' + (AREA_STEPS.length - 1) + '" step="1" value="' + Math.max(0, AREA_STEPS.indexOf(state.area)) + '" aria-label="평형 선택"></div>' +
      '<div class="sim-field"><span class="sim-label">준공 연도</span><div class="sim-chips">' +
      AGE_OPTIONS.map(function (o) { return chip(esc(o.label), state.age === o.key, 'data-simage="' + o.key + '"'); }).join('') +
      '</div>' + (ageDef().note ? '<p class="sim-note">' + esc(ageDef().note) + '</p>' : '') + '</div>' +
      '<div class="sim-field"><span class="sim-label">공사 중 거주</span><div class="sim-chips">' +
      LIVE_OPTIONS.map(function (o) { return chip(esc(o.label), state.live === o.key, 'data-simlive="' + o.key + '"'); }).join('') +
      '</div></div>' +
      '<button type="button" class="btn btn-primary sim-next" data-simnext>공사할 공간 고르기 →</button>';
  }

  function viewSpaces() {
    return '<p class="sim-lead">이번에 손볼 공간만 남기세요. <b>우리집에 없는 공간은 지우면 됩니다.</b></p>' +
      '<div class="sim-grid">' + SPACES.map(function (s) {
        var on = state.picked.indexOf(s.key) >= 0;
        return '<button type="button" class="sim-space' + (on ? ' on' : '') + '" data-simspace="' + esc(s.key) + '" aria-pressed="' + on + '">' +
          '<span class="sim-space-ic" aria-hidden="true">' + s.icon + '</span>' +
          '<b>' + esc(s.key) + '</b><em>' + esc(s.hint) + '</em></button>';
      }).join('') + '</div>' +
      '<p class="sim-note">' + (state.picked.length ? esc(state.picked.length + '곳 선택됨') : '한 곳 이상 골라 주세요.') + '</p>' +
      '<button type="button" class="btn btn-primary sim-next" data-simnext' + (state.picked.length ? '' : ' disabled') + '>등급 맞추기 →</button>';
  }

  function viewTiers() {
    var r = calc();
    return '<p class="sim-lead">공간마다 등급을 올리고 내려 보세요. 금액이 바로 바뀝니다.</p>' +
      state.picked.map(function (space) {
        var bom = null;
        for (var i = 0; i < r.rows.length; i++) if (r.rows[i].space === space) bom = r.rows[i].bom;
        return '<div class="sim-row"><div class="sim-row-h"><b>' + esc(space) + '</b>' +
          (bom ? '<span class="sim-row-amt">' + man(bom.rangeLow) + '~' + man(bom.rangeHigh) + '원</span>' : '') + '</div>' +
          '<div class="sim-chips">' + TIERS.map(function (t) {
            return chip(esc(t.label), tierOf(space) === t.key, 'data-simtier="' + esc(space) + '|' + t.key + '" title="' + esc(t.desc) + '"');
          }).join('') + '</div></div>';
      }).join('') +
      '<div class="sim-field"><label for="simCap">예산 상한 (선택)</label>' +
      '<div class="sim-cap"><input type="number" id="simCap" inputmode="numeric" min="0" step="100" placeholder="예: 3500" value="' + (state.cap ? Math.round(state.cap / 10000) : '') + '"><span>만원</span></div></div>' +
      '<div class="sim-total"><span>예상 범위</span><b>' + man(r.low) + '~' + man(r.high) + '원</b></div>' +
      '<button type="button" class="btn btn-primary sim-next" data-simnext>우리집 사양서 보기 →</button>';
  }

  function viewResult() {
    var r = calc();
    var trims = trimSuggestions(r);
    var over = state.cap && r.low > state.cap;
    var html = '<div class="sim-notice sim-notice-top" role="note">⚠️ ' + esc(SIM_NOTICE.top) + '</div>';

    html += '<div class="sim-result-head"><span class="sim-eyebrow">우리집 사양서</span>' +
      '<b class="sim-result-amt">' + man(r.low) + '~' + man(r.high) + '원</b>' +
      '<span class="sim-result-sub">' + state.area + '평 · ' + esc(state.picked.join(' · ')) + ' · ' + esc(ageDef().label) + '</span></div>';
    html += '<p class="sim-notice">' + esc(SIM_NOTICE.price) + '</p>';

    if (over) {
      html += '<div class="sim-over"><b>예산 상한(' + man(state.cap) + '원)보다 ' + man(r.low - state.cap) + '원 높습니다.</b>' +
        '<p>무엇을 조정할지 골라 보세요.</p><div class="sim-trims">' +
        trims.map(function (t) {
          return '<button type="button" class="sim-trim" data-simtrim="' + t.type + '|' + esc(t.space) + '|' + (t.to || '') + '">' +
            esc(t.label) + ' <em>−' + man(t.save) + '원</em></button>';
        }).join('') + '</div></div>';
    }

    html += '<div class="sim-rooms">' + r.rows.map(function (row) {
      var lines = (row.bom.lines || []).slice(0, 4);
      return '<div class="sim-room"><div class="sim-room-h"><b>' + esc(row.space) + '</b>' +
        '<span class="sim-room-tier">' + esc(tierDef(row.tier).label) + '</span>' +
        '<span class="sim-room-amt">' + man(row.bom.rangeLow) + '~' + man(row.bom.rangeHigh) + '원</span></div>' +
        '<ul class="sim-room-lines">' + lines.map(function (l) {
          return '<li><span>' + esc(l.label || l.name || '') + '</span><em>' + esc(l.spec || '') + '</em></li>';
        }).join('') + '</ul></div>';
    }).join('') + '</div>';
    html += '<p class="sim-notice">' + esc(SIM_NOTICE.material) + '</p>';

    var live = LIVE_OPTIONS.filter(function (o) { return o.key === state.live; })[0];
    html += '<div class="sim-live"><b>공사 중 생활</b><p>' + esc(live ? live.note : '') + '</p>' +
      '<p class="sim-note">공사기간은 통상 공간당 3~10일이며, 현장 상태에 따라 달라집니다.</p></div>';

    html += '<div class="sim-actions">' +
      '<button type="button" class="btn btn-primary" data-simlead>이 사양서로 무료 방문 실측 예약</button>' +
      '<button type="button" class="btn btn-ghost" data-simsave>📷 이미지로 저장</button>' +
      '<button type="button" class="btn btn-ghost" data-simlink>🔗 링크 복사</button>' +
      '<button type="button" class="btn btn-ghost" data-simreset>처음부터</button></div>';
    html += '<p class="sim-note sim-ai-note">' + esc(SIM_NOTICE.ai) + '</p>';
    return html;
  }

  /* ── 결과 → 상담 폼 ── */
  function toInquiry() {
    var r = calc();
    var summary = '[우리집 사양서] ' + state.area + '평 · ' + state.picked.map(function (s) {
      return s + '(' + tierDef(tierOf(s)).label + ')';
    }).join(', ') + ' · 준공 ' + ageDef().label + ' · ' + (state.live === 'empty' ? '비우고' : '살면서') +
      ' · 예상 ' + man(r.low) + '~' + man(r.high) + '원' + (state.cap ? ' · 예산상한 ' + man(state.cap) + '원' : '') +
      ' · 재현링크 ' + shareUrl();
    if (root.MANMUL) {
      root.MANMUL.simSpec = { area: state.area, spaces: state.picked, tiers: state.tiers, low: r.low, high: r.high, link: shareUrl(), text: summary };
    }
    document.dispatchEvent(new CustomEvent('manmul:sim', {
      detail: { area: state.area, budget: budgetBand(r.low), text: summary, link: shareUrl() }
    }));
    var sec = $('inquiry');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function budgetBand(low) {
    if (low >= 80000000) return '8천만원 이상';
    if (low >= 50000000) return '5천~8천만원';
    if (low >= 30000000) return '3천~5천만원';
    return '3천만원 이하';
  }

  /* ── 이미지 저장(캔버스) — 밖으로 나가는 유일한 물체라 워터마크로 고지를 굽는다 ── */
  function saveImage() {
    var r = calc();
    var W = 1000, pad = 48;
    var lines = state.picked.map(function (s) {
      var bom = null;
      for (var i = 0; i < r.rows.length; i++) if (r.rows[i].space === s) bom = r.rows[i].bom;
      return s + '  ·  ' + tierDef(tierOf(s)).label + '  ·  ' + (bom ? man(bom.rangeLow) + '~' + man(bom.rangeHigh) + '원' : '-');
    });
    var H = 420 + lines.length * 46;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#faf7f2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#201b16'; g.fillRect(0, 0, W, 132);
    g.fillStyle = '#ffffff';
    g.font = 'bold 34px sans-serif'; g.fillText('우리집 사양서', pad, 62);
    g.font = '20px sans-serif'; g.fillStyle = '#e7ddd0';
    g.fillText(state.area + '평 · ' + ageDef().label + ' · ' + (state.live === 'empty' ? '비우고 공사' : '살면서 공사'), pad, 100);
    g.fillStyle = '#262019';
    g.font = 'bold 44px sans-serif';
    g.fillText(man(r.low) + '~' + man(r.high) + '원', pad, 204);
    g.font = '18px sans-serif'; g.fillStyle = '#6b6157';
    g.fillText('참고 범위 · 방문 실측 후 서면 견적서로 확정', pad, 236);
    g.font = '22px sans-serif'; g.fillStyle = '#262019';
    lines.forEach(function (t, i) {
      var y = 300 + i * 46;
      g.fillStyle = '#e7ddd0'; g.fillRect(pad, y + 12, W - pad * 2, 1);
      g.fillStyle = '#262019'; g.fillText(t, pad, y);
    });
    var wy = H - 78;
    g.fillStyle = '#f3e7d7'; g.fillRect(0, wy - 34, W, 112);
    g.fillStyle = '#7d5528'; g.font = '17px sans-serif';
    g.fillText('참고용 구성안 · 실제 시공 결과 및 견적과 다를 수 있음', pad, wy);
    g.fillText('만물인테리어 010-2397-8629 · ' + new Date().toISOString().slice(0, 10) + ' 생성', pad, wy + 30);

    cv.toBlob(function (blob) {
      if (!blob) return;
      var file = null;
      try { file = new File([blob], '우리집사양서.png', { type: 'image/png' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: '우리집 사양서' }).catch(function () { downloadBlob(blob); });
        return;
      }
      downloadBlob(blob);
    }, 'image/png');
  }
  function downloadBlob(blob) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = u; a.download = '우리집사양서.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }

  function copyLink() {
    var url = shareUrl();
    try { location.hash = 'sim=' + encodeURIComponent(encodeState()); } catch (e) { /* 해시 갱신 실패는 치명적이지 않다 */ }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { flash('링크가 복사되었습니다'); }, function () { prompt('링크를 복사하세요', url); });
    } else { prompt('링크를 복사하세요', url); }
  }
  function flash(msg) {
    var el = $('simFlash');
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    setTimeout(function () { el.hidden = true; }, 2400);
  }

  /* ── 이벤트(위임) ── */
  function bind() {
    var sec = $('simulator');
    if (!sec || sec.dataset.bound) return;
    sec.dataset.bound = '1';

    sec.addEventListener('click', function (e) {
      var t = e.target.closest('[data-simspace],[data-simtier],[data-simage],[data-simlive],[data-simnext],[data-simtrim],[data-simlead],[data-simsave],[data-simlink],[data-simreset],#simBack');
      if (!t) return;
      var d = t.dataset;
      if (d.simspace !== undefined) {
        var i = state.picked.indexOf(d.simspace);
        if (i >= 0) state.picked.splice(i, 1); else state.picked.push(d.simspace);
        return render();
      }
      if (d.simtier !== undefined) {
        var p = d.simtier.split('|');
        state.tiers[p[0]] = p[1];
        return render();
      }
      if (d.simage !== undefined) { state.age = d.simage; return render(); }
      if (d.simlive !== undefined) { state.live = d.simlive; return render(); }
      if (d.simnext !== undefined) {
        if (state.step === 2 && !state.picked.length) return;
        state.step = Math.min(TOTAL_STEPS, state.step + 1);
        return render();
      }
      if (t.id === 'simBack') { state.step = Math.max(1, state.step - 1); return render(); }
      if (d.simtrim !== undefined) {
        var q = d.simtrim.split('|');
        if (q[0] === 'drop') { var k = state.picked.indexOf(q[1]); if (k >= 0) state.picked.splice(k, 1); }
        else if (q[0] === 'tier') state.tiers[q[1]] = q[2];
        return render();
      }
      if (d.simlead !== undefined) return toInquiry();
      if (d.simsave !== undefined) return saveImage();
      if (d.simlink !== undefined) return copyLink();
      if (d.simreset !== undefined) {
        state.step = 1; state.picked = ['거실', '욕실']; state.tiers = {}; state.cap = 0;
        return render();
      }
    });

    sec.addEventListener('input', function (e) {
      if (e.target.id === 'simArea') {
        state.area = AREA_STEPS[Number(e.target.value) || 0] || 30;
        var lab = $('simAreaVal');
        if (lab) lab.textContent = state.area + '평';
        return;
      }
      if (e.target.id === 'simCap') {
        state.cap = Math.max(0, (Number(e.target.value) || 0) * 10000);
      }
    });
    sec.addEventListener('change', function (e) {
      if (e.target.id === 'simCap') render();
    });
  }

  function init(ctx) {
    CTX = ctx || root.MANMUL || null;
    var m = String(location.hash || '').match(/sim=([^&]+)/);
    if (m) { if (decodeState(decodeURIComponent(m[1]))) state.step = TOTAL_STEPS; }
    bind();
    render();
  }

  root.MANMUL_SIM = { init: init, encodeState: encodeState, decodeState: decodeState, calc: calc, NOTICE: SIM_NOTICE, SPACES: SPACES, TIERS: TIERS, state: state };
  root.initSimulator = init;
}(window));
