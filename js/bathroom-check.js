/* bathroom-check.js — 욕실 방수 사전점검 (셀프 체크)
 *
 * 항목·설명은 블로그 글(bathroom-waterproof-signs)의 내용을 그대로 옮긴 것이다 —
 * 여기서 새 주장을 만들지 않는다. 점수·판정도 내지 않는다: '몇 개 해당'이라는 사실과
 * 글에 이미 있는 안내(초기 단계가 비용이 가장 적게 든다)만 보여준다.
 */
(function () {
  'use strict';
  var list = document.getElementById('bcList');
  var out = document.getElementById('bcResult');
  if (!list) return;

  // urgent: 글에서 '이미 뚫렸을 가능성 / 재시공 신호'로 설명하는 항목
  var SIGNS = [
    { t: '아랫집 천장에 물 얼룩·곰팡이가 생겼다', d: '가장 확실하고 가장 늦은 신호 — 방수층이 이미 뚫렸을 가능성', urgent: true },
    { t: '타일 줄눈이 닦아도 금방 다시 까매진다', d: '타일 뒤로 물이 돌고 있다는 뜻 — 초기 단계일 수 있음' },
    { t: '타일 표면에 하얀 가루(백화)가 올라온다', d: '타일 뒤 수분의 흔적 — 초기 단계일 수 있음' },
    { t: '바닥 타일을 두드리면 속 빈 소리·들뜸이 있다', d: '들뜸이 여러 장으로 번지면 재시공 신호', urgent: true },
    { t: '욕실 문지방 주변 마루 변색·벽지 아래 곰팡이', d: '물이 문턱 방수 부위를 넘고 있다는 뜻', urgent: true },
    { t: '물을 안 쓰는데 계량기가 돈다', d: '이건 방수(표면)가 아니라 배관(속) 누수 — 원인 구분이 필요', pipe: true }
  ];

  var picked = [];
  SIGNS.forEach(function (s, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bc-item';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<b>' + s.t + '</b><small>' + s.d + '</small>';
    b.onclick = function () {
      var on = picked.indexOf(i) < 0;
      if (on) picked.push(i); else picked = picked.filter(function (x) { return x !== i; });
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      render();
    };
    list.appendChild(b);
  });

  function render() {
    if (!picked.length) { out.innerHTML = ''; return; }
    var n = picked.length;
    var urgent = picked.some(function (i) { return SIGNS[i].urgent; });
    var pipe = picked.some(function (i) { return SIGNS[i].pipe; });
    var lines = ['<b>' + n + '개 항목이 해당</b>됩니다.'];
    if (urgent) lines.push('그중에는 글에서 <b>재시공 신호</b>로 설명하는 항목이 있습니다. 방치하면 교체 범위가 커집니다.');
    else lines.push('초기 단계일 수 있는 신호입니다 — <b>이때 점검을 받는 것이 비용이 가장 적게 듭니다.</b>');
    if (pipe) lines.push('계량기 항목은 방수가 아니라 <b>배관 누수</b> 가능성입니다. 점검 때 표면·배관을 구분해 확인해야 정확한 견적이 나옵니다.');
    lines.push('<span class="of-small">정확한 상태와 비용은 현장 확인 후에만 알 수 있습니다. 점검·방문 실측은 무료입니다.</span>');
    out.innerHTML = '<div class="bc-box' + (urgent ? ' bc-urgent' : '') + '">' + lines.join('<br>') +
      '<div class="bc-cta"><a class="btn btn-primary" href="index.html#inquiry">무료 방문 점검 신청</a>' +
      '<a class="btn btn-ghost" href="tel:01023978629">📞 바로 통화</a></div></div>';
  }
})();
