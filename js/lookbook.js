/* 우리집 한 채로 보기 — 240개 시안을 한 장씩 보는 대신, 우리집에 있는 공간마다 한 장씩 꽂아
 * 한 채로 나란히 놓고 "어디를 공사할지"를 먼저 정하는 보기 모드.
 *
 * 이 화면이 하지 않는 것(중요):
 *  · 금액을 계산하지 않는다. 표시하는 값은 카탈로그 카드가 이미 보여주는 그 값(같은 __designBom 캐시)이고,
 *    공간별 금액을 더하지 않는다 — 시안마다 기준 평형이 18~52평으로 달라 합계가 의미를 잃는다.
 *    합계가 필요하면 시뮬레이터로 넘긴다.
 *  · 어울린다/안 어울린다를 판정하지 않는다. 점수도 매기지 않는다.
 *    (바닥재 표기는 거실 30개 중 17개뿐이고 종류도 6가지라, "바닥이 이어집니다" 류 판정은 대부분 거짓이 된다.)
 *  · 고객 사진을 받지도, 합성하지도, 저장하지도 않는다. 밖으로 나가는 물체는 '링크'뿐이다.
 *
 * 사진·상세·금액은 전부 기존 자산을 그대로 쓴다(신규 이미지 0장):
 *   portfolioSpriteMarkup/observeSprites(main.js) · openFolioModal(main.js) · DesignBom.formatCompactRange
 */
(function (root) {
  'use strict';

  var CTX = null;
  var CFG = null;
  var TOTAL = 3;
  var SPEC_RE = /(\d{2,4})\s*[×xX]\s*(\d{2,4})\s*mm/;

  var state = {
    step: 1,
    picked: [],
    seed: '',
    pick: {},      // 공간 → 시안 id
    drawer: ''
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cfg(path, fallback) {
    var cur = CFG;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return fallback;
      cur = cur[parts[i]];
    }
    return (cur === undefined || cur === null) ? fallback : cur;
  }
  function order() { return cfg('spaceOrder', ['거실', '주방', '욕실', '침실', '현관', '서재', '아이방', '드레스룸']); }
  function portfolio() { return (CTX && CTX.data && CTX.data.portfolio) || []; }
  function listOf(space) { return portfolio().filter(function (p) { return p.spaceType === space; }); }
  function itemOf(space) {
    var id = state.pick[space];
    var list = listOf(space);
    var found = id ? list.filter(function (p) { return p.id === id; })[0] : null;
    return found || list[0] || null;
  }
  function sortPicked() {
    var o = order();
    state.picked.sort(function (a, b) { return o.indexOf(a) - o.indexOf(b); });
  }

  /* 금액: 카탈로그 카드(main.js)와 완전히 같은 경로. item.__designBom 캐시를 먼저 보므로
     같은 시안이면 같은 문자열이 나오는 것이 구조적으로 보장된다. 자체 포맷 금지. */
  function costRange(item) {
    if (!item || !item.aiDesign || !root.DesignBom) return '';
    if (!item.__designBom) {
      try { item.__designBom = root.DesignBom.build(item, CTX && CTX.materialCatalog); }
      catch (e) { return ''; }
    }
    var b = item.__designBom;
    return root.DesignBom.formatCompactRange(b.rangeLow, b.rangeHigh);
  }

  /* ── 상태 ↔ 링크 (#look=공간인덱스:시안id, 쉼표 연결) ──
     인덱스가 아니라 id 를 쓴다. portfolio 배열은 공간별로 뭉쳐 있지 않아서, 시안이 하나만 늘어도
     인덱스 링크는 '다른 시안이 조용히 열리는' 오답이 된다. 링크가 죽는 편이 낫다. */
  function encodeState() {
    var o = order();
    return state.picked.map(function (s) {
      var it = itemOf(s);
      return o.indexOf(s) + ':' + (it ? it.id : '');
    }).filter(function (x) { return x.indexOf(':') > 0; }).join(',');
  }
  function decodeState(raw) {
    if (!raw) return false;
    var o = order();
    var picked = [], pick = {}, missed = [];
    String(raw).split(',').forEach(function (pair) {
      var seg = pair.split(':');
      var space = o[Number(seg[0])];
      if (!space) return;
      picked.push(space);
      var found = listOf(space).filter(function (p) { return p.id === seg[1]; })[0];
      if (found) pick[space] = found.id;
      else missed.push(space);   // 못 찾으면 기본 배정 + 아래에서 고지한다(조용한 오답 금지)
    });
    if (!picked.length) return false;
    state.picked = picked; state.pick = pick; state.seed = '';
    sortPicked();
    if (missed.length) flash('일부 시안을 찾지 못해 ' + missed.join('·') + ' 은(는) 기본 시안으로 열었습니다.');
    return true;
  }
  function shareUrl() {
    if (root.MANMUL_HASH && root.MANMUL_HASH.build) return root.MANMUL_HASH.build('look', encodeState());
    return location.origin + location.pathname + '#look=' + encodeURIComponent(encodeState());
  }

  function flash(msg) {
    var el = $('lbFlash');
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    setTimeout(function () { el.hidden = true; }, 5000);
  }

  /* ── 보기 전환 ── */
  function setView(view) {
    var board = $('lbBoard');
    var grid = $('portfolioGrid');
    var filters = $('portfolioFilters');
    var guide = $('portfolioCostGuide');
    var count = $('portfolioCount');
    var empty = $('portfolioEmpty');
    var home = view === 'home';
    if (board) board.hidden = !home;
    [grid, filters, guide, count].forEach(function (el) { if (el) el.hidden = home; });
    if (empty && home) empty.hidden = true;
    var tabs = document.querySelectorAll('[data-lbview]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-lbview') === view;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (home) render();
  }

  /* ── 렌더 ── */
  function render() {
    var host = $('lbBody');
    if (!host) return;
    host.innerHTML = state.step === 1 ? viewSpaces() : state.step === 2 ? viewStyles() : viewBoard();
    var prog = $('lbProgress');
    if (prog) {
      prog.innerHTML = ['공간 고르기', '톤 시작점', '우리집 한 채'].map(function (l, i) {
        var n = i + 1;
        return '<span class="lb-step' + (n === state.step ? ' on' : (n < state.step ? ' done' : '')) + '">' + esc(l) + '</span>';
      }).join('');
    }
    var back = $('lbBack');
    if (back) back.hidden = state.step === 1;
    if (typeof root.observeSprites === 'function') { try { root.observeSprites(); } catch (e) { /* 폴백: 배경이 즉시 채워짐 */ } }
  }

  function viewSpaces() {
    var o = order();
    return '<h3 class="lb-h">우리집에 있는 공간을 골라 주세요</h3>' +
      '<p class="lb-sub">이번 공사와 상관없는 공간은 꺼 주세요.</p>' +
      '<div class="lb-spaces">' + o.map(function (s) {
        var on = state.picked.indexOf(s) >= 0;
        return '<button type="button" class="lb-space' + (on ? ' on' : '') + '" data-lbspace="' + esc(s) + '" aria-pressed="' + on + '">' +
          esc(s) + '</button>';
      }).join('') + '</div>' +
      '<p class="lb-hint">' + (state.picked.length
        ? esc(state.picked.length + '곳 선택됨' + (state.picked.length > cfg('maxComfortableSpaces', 6) ? ' — ' + cfg('labels.manySpaces', '') : ''))
        : '한 곳 이상 골라 주세요.') + '</p>' +
      '<button type="button" class="btn btn-primary lb-next" data-lbnext' + (state.picked.length ? '' : ' disabled') + '>다음 →</button>';
  }

  function viewStyles() {
    var styles = [];
    portfolio().forEach(function (p) { if (p.style && styles.indexOf(p.style) < 0) styles.push(p.style); });
    return '<h3 class="lb-h">전체 톤을 어디서 시작할까요</h3>' +
      '<p class="lb-sub">고른 공간에 그 스타일 시안이 한 장씩 들어갑니다. 나중에 한 칸씩 바꿀 수 있습니다.</p>' +
      '<div class="lb-styles">' + styles.map(function (s) {
        return '<button type="button" class="lb-chip' + (state.seed === s ? ' on' : '') + '" data-lbstyle="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') +
      '<button type="button" class="lb-chip' + (state.seed === '' ? ' on' : '') + '" data-lbstyle="">' + esc(cfg('labels.mixStyle', '이것저것 섞어서')) + '</button>' +
      '</div>';
  }

  function applySeed(seed) {
    state.seed = seed || '';
    state.pick = {};
    state.picked.forEach(function (s) {
      var list = listOf(s);
      var hit = seed ? list.filter(function (p) { return p.style === seed; })[0] : null;
      var chosen = hit || list[0];
      if (chosen) state.pick[s] = chosen.id;
    });
  }

  function tile(space) {
    var it = itemOf(space);
    if (!it) return '';
    var shot = (typeof root.portfolioSpriteMarkup === 'function')
      ? root.portfolioSpriteMarkup(it, 'lb-shot')
      : '<span class="lb-shot" role="img" aria-label="' + esc(it.title) + '"></span>';
    var cost = costRange(it);
    var pal = (it.palette || []).slice(0, 4).map(function (c) {
      return '<span class="lb-sw" style="background:' + esc(c) + '" aria-label="' + esc(c) + '"></span>';
    }).join('');
    return '<article class="lb-tile" data-space="' + esc(space) + '">' + shot +
      '<div class="lb-tile-b">' +
        '<div class="lb-tile-head"><span class="lb-space-name">' + esc(space) + '</span>' +
          (it.style ? '<span class="lb-badge">' + esc(it.style) + '</span>' : '') + '</div>' +
        '<h4 class="lb-tile-title">' + esc(it.title) + '</h4>' +
        (cost ? '<p class="lb-cost">공간 예상비용 ' + esc(cost) + '</p>' : '') +
        (pal ? '<div class="lb-pal">' + pal + '</div>' : '') +
        '<div class="lb-tile-act">' +
          '<button type="button" class="lb-swap" data-lbswap="' + esc(space) + '">' + esc(cfg('labels.swap', '다른 시안 ▾')) + '</button>' +
          '<button type="button" class="lb-detail" data-lbdetail="' + esc(it.id) + '">' + esc(cfg('labels.detail', '자세히')) + '</button>' +
        '</div>' +
      '</div></article>';
  }

  function drawer() {
    var space = state.drawer;
    if (!space) return '';
    var cands = listOf(space);
    return '<div class="lb-drawer" data-space="' + esc(space) + '">' +
      '<div class="lb-drawer-h"><b>' + esc(space) + ' 시안 ' + cands.length + '개</b>' +
        '<button type="button" class="lb-drawer-x" data-lbclose aria-label="닫기">✕</button></div>' +
      '<div class="lb-cands">' + cands.map(function (p) {
        var on = state.pick[space] === p.id;
        var shot = (typeof root.portfolioSpriteMarkup === 'function')
          ? root.portfolioSpriteMarkup(p, 'lb-cand-shot')
          : '<span class="lb-cand-shot"></span>';
        return '<button type="button" class="lb-cand' + (on ? ' on' : '') + '" data-lbpick="' + esc(space) + '|' + esc(p.id) + '">' +
          shot + '<b>' + esc(p.title) + '</b><small>' + esc(p.style || '') + '</small></button>';
      }).join('') + '</div></div>';
  }

  /* 사실 카드 — 데이터에 실재하는 것만 옮겨 적는다. 판정·점수 없음. */
  function facts() {
    var wet = cfg('wetSpaces', ['욕실', '주방', '현관']);
    var specRows = [];
    state.picked.forEach(function (s) {
      if (wet.indexOf(s) < 0) return;
      var it = itemOf(s);
      if (!it) return;
      var hit = (it.materials || []).filter(function (m) { return SPEC_RE.test(String(m)); })[0];
      specRows.push('<li><b>' + esc(s) + '</b> ' + (hit ? esc(hit) : esc(cfg('notices.specMissing', '규격 표기가 없습니다.'))) + '</li>');
    });

    var styles = {};
    state.picked.forEach(function (s) { var it = itemOf(s); if (it && it.style) styles[it.style] = (styles[it.style] || 0) + 1; });
    var keys = Object.keys(styles);
    var styleLine = keys.length === 1
      ? '지금은 <b>' + esc(keys[0]) + '</b> 한 가지로 맞춰져 있습니다.'
      : keys.length + '가지 스타일이 섞여 있습니다: ' + keys.map(esc).join(' · ');

    var matRows = state.picked.map(function (s) {
      var it = itemOf(s);
      if (!it || !(it.materials || []).length) return '';
      return '<li><b>' + esc(s) + '</b> ' + it.materials.map(esc).join(' · ') + '</li>';
    }).filter(Boolean).join('');

    return '<div class="lb-facts">' +
      '<p class="lb-notice">' + esc(cfg('notices.facts', '')) + '</p>' +
      '<section class="lb-fact"><h4 class="lb-fact-h">고른 스타일</h4><p class="lb-fact-p">' + styleLine + '</p></section>' +
      (specRows.length ? '<section class="lb-fact"><h4 class="lb-fact-h">물 쓰는 공간 규격</h4><ul class="lb-fact-list">' + specRows.join('') + '</ul></section>' : '') +
      (matRows ? '<section class="lb-fact"><h4 class="lb-fact-h">시안에 적힌 자재</h4><ul class="lb-fact-list">' + matRows + '</ul>' +
        '<p class="lb-notice">' + esc(cfg('notices.material', '')) + '</p></section>' : '') +
      '<section class="lb-fact"><h4 class="lb-fact-h">바닥·문턱 이야기</h4><p class="lb-fact-p">' + esc(cfg('notices.floorTalk', '')) + '</p></section>' +
      '<p class="lb-notice">' + esc(cfg('notices.palette', '')) + '</p>' +
      '</div>';
  }

  function viewBoard() {
    return '<h3 class="lb-h">우리집 한 채</h3>' +
      '<p class="lb-sub">공간마다 ‘' + esc(cfg('labels.swap', '다른 시안 ▾')) + '’으로 바꿔 보세요.</p>' +
      '<div class="lb-tiles">' + state.picked.map(tile).join('') + '</div>' +
      drawer() +
      '<p class="lb-notice">' + esc(cfg('notices.money', '')) + '</p>' +
      facts() +
      '<div class="lb-actions">' +
        '<button type="button" class="btn btn-primary" data-lbsim>' + esc(cfg('labels.toSimulator', '이 범위로 예상 금액 보기')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-lblead>' + esc(cfg('labels.toInquiry', '이 구성으로 무료 방문 실측 예약')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-lblink>🔗 링크 복사</button>' +
        '<button type="button" class="btn btn-ghost" data-lbrestart>처음부터</button>' +
      '</div>';
  }

  /* ── 넘기기 ── */
  function repSpace() {
    if (state.picked.indexOf('거실') >= 0) return '거실';
    return state.picked[0] || '';
  }
  function lookSpecText() {
    var parts = state.picked.map(function (s) {
      var it = itemOf(s);
      return s + ' ' + (it ? it.title + '(' + (it.style || '') + ')' : '-');
    });
    var wet = cfg('wetSpaces', []);
    var specs = state.picked.filter(function (s) { return wet.indexOf(s) >= 0; }).map(function (s) {
      var it = itemOf(s);
      var hit = it ? (it.materials || []).filter(function (m) { return SPEC_RE.test(String(m)); })[0] : null;
      return s + ' ' + (hit || '규격 표기 없음');
    });
    return '[우리집 한 채] ' + state.picked.length + '곳 · ' + parts.join(' / ') +
      (specs.length ? '\n' + specs.join(' · ') : '') +
      '\n재현 링크: ' + shareUrl();
  }

  function toSimulator() {
    // 공간 목록만 시뮬레이터에 넘긴다 — 등급·평형은 고객이 거기서 정한다.
    if (root.MANMUL_SIM && typeof root.MANMUL_SIM.applyPreset === 'function') {
      root.MANMUL_SIM.applyPreset({ spaces: state.picked.slice() });
    }
    var sec = $('simulator');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toInquiry() {
    // 상담 폼의 '관심 디자인' 슬롯에는 가짜 합성 항목을 넣지 않는다 — 고객이 고른 실제 시안을 덮어쓴다.
    var lead = itemOf(repSpace());
    if (root.MANMUL && typeof root.MANMUL.selectDesign === 'function' && lead) {
      var bom = lead.__designBom || null;
      root.MANMUL.selectDesign({
        id: lead.id, title: lead.title, style: lead.style, spaceType: lead.spaceType,
        area: lead.area || null,
        budget: null,   // 자재 등급용 문자열이라 고객 예산 칸에 찍히면 사고가 된다
        estimateTotal: bom ? bom.total : null,
        estimateRange: bom && root.DesignBom ? root.DesignBom.formatCompactRange(bom.rangeLow, bom.rangeHigh) : null
      });
    }
    document.dispatchEvent(new CustomEvent('manmul:lookbook', { detail: { text: lookSpecText(), link: shareUrl() } }));
    var sec = $('inquiry');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function copyLink() {
    var url = shareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { flash('링크가 복사되었습니다'); }, function () { prompt('링크를 복사하세요', url); });
    } else { prompt('링크를 복사하세요', url); }
  }

  /* ── 이벤트(위임) ── */
  function bind() {
    var sec = $('portfolio');
    if (!sec || sec.dataset.lbBound) return;
    sec.dataset.lbBound = '1';
    sec.addEventListener('click', function (e) {
      var t = e.target.closest('[data-lbview],[data-lbspace],[data-lbnext],[data-lbstyle],[data-lbswap],[data-lbdetail],[data-lbpick],[data-lbclose],[data-lbsim],[data-lblead],[data-lblink],[data-lbrestart],#lbBack');
      if (!t) return;
      var d = t.dataset;
      if (d.lbview !== undefined) return setView(d.lbview);
      if (d.lbspace !== undefined) {
        var i = state.picked.indexOf(d.lbspace);
        if (i >= 0) state.picked.splice(i, 1); else state.picked.push(d.lbspace);
        sortPicked();
        return render();
      }
      if (d.lbnext !== undefined) {
        if (!state.picked.length) return;
        state.step = 2;
        return render();
      }
      if (t.id === 'lbBack') { state.step = Math.max(1, state.step - 1); state.drawer = ''; return render(); }
      if (d.lbstyle !== undefined) { applySeed(d.lbstyle); state.step = 3; return render(); }
      if (d.lbswap !== undefined) { state.drawer = (state.drawer === d.lbswap) ? '' : d.lbswap; return render(); }
      if (d.lbclose !== undefined) { state.drawer = ''; return render(); }
      if (d.lbpick !== undefined) {
        var q = d.lbpick.split('|');
        state.pick[q[0]] = q[1];
        state.seed = '';          // 한 칸이라도 바꾸면 '섞임'
        state.drawer = '';
        return render();
      }
      if (d.lbdetail !== undefined) {
        var it = portfolio().filter(function (p) { return p.id === d.lbdetail; })[0];
        if (it && typeof root.openFolioModal === 'function') root.openFolioModal(it, portfolio());
        return;
      }
      if (d.lbsim !== undefined) return toSimulator();
      if (d.lblead !== undefined) return toInquiry();
      if (d.lblink !== undefined) return copyLink();
      if (d.lbrestart !== undefined) {
        state.step = 1; state.drawer = ''; state.seed = '';
        state.picked = (cfg('defaultSpaces', ['거실', '주방', '욕실', '침실']) || []).slice();
        state.pick = {};
        return render();
      }
    });
  }

  function init(ctx) {
    if (!$('lbBoard')) return;                 // 마크업이 없으면 조용히 빠진다
    CTX = ctx || root.MANMUL || null;
    CFG = (CTX && CTX.data && CTX.data.lookbook) || null;
    state.picked = (cfg('defaultSpaces', ['거실', '주방', '욕실', '침실']) || []).slice();
    sortPicked();
    applySeed('');
    bind();
    var raw = (root.MANMUL_HASH && root.MANMUL_HASH.read) ? root.MANMUL_HASH.read('look') : '';
    if (raw && decodeState(raw)) { state.step = TOTAL; setView('home'); return; }
    render();
  }

  root.MANMUL_LOOK = { init: init, encodeState: encodeState, decodeState: decodeState, lookSpecText: lookSpecText, costRange: costRange, state: state };
  root.initLookbook = init;
}(window));
