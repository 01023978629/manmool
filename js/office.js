/* office.js — 관리사무소 전용 창구: 채팅형 단계 진행
 *
 * 관리사무소 담당자는 바쁘고, 긴 폼은 안 쓴다. 질문 하나에 버튼 하나로 답하게 한다
 * (사장님이 보여준 생활 서비스 앱의 예약 흐름과 같은 감각).
 * 제출은 기존 상담 폼과 같은 경로(Web3Forms)로 가되 제목에 [관리사무소] 를 붙여
 * 대표 메일함에서 입주민 상담과 바로 구분되게 한다. 실패하면 전화·문자 폴백.
 */
(function () {
  'use strict';
  var chat = document.getElementById('ofChat');
  var bar = document.getElementById('ofInputBar');
  var txt = document.getElementById('ofText');
  var send = document.getElementById('ofSend');
  if (!chat) return;

  var CONFIG = null;
  var state = { complex: '', region: '', units: '', needs: [], manager: '', phone: '', agreed: false };

  function scrollChat() {
    chat.scrollTop = chat.scrollHeight;
  }

  function focusTextIfVisible() {
    var rect = bar.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      try { txt.focus({ preventScroll: true }); }
      catch (e) { txt.focus(); }
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function bot(html) {
    var d = document.createElement('div');
    d.className = 'of-msg of-bot';
    d.innerHTML = html;
    chat.appendChild(d);
    scrollChat();
    return d;
  }
  function me(text) {
    var d = document.createElement('div');
    d.className = 'of-msg of-me';
    d.textContent = text;
    chat.appendChild(d);
    scrollChat();
  }
  function chips(items, onPick, multi) {
    var wrap = document.createElement('div');
    wrap.className = 'of-chips';
    items.forEach(function (label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'of-chip';
      b.textContent = label;
      b.onclick = function () {
        if (multi) {
          b.classList.toggle('on');
          onPick(label, b.classList.contains('on'), wrap);
        } else {
          wrap.remove();
          onPick(label);
        }
      };
      wrap.appendChild(b);
    });
    if (multi) {
      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'of-chip of-chip-next';
      next.textContent = '선택 완료 →';
      next.onclick = function () { onPick(null, null, wrap, true); };
      wrap.appendChild(next);
    }
    chat.appendChild(wrap);
    scrollChat();
    return wrap;
  }
  function askText(placeholder, type, onDone) {
    bar.hidden = false;
    txt.value = '';
    txt.placeholder = placeholder;
    txt.type = type || 'text';
    focusTextIfVisible();
    var fire = function () {
      var v = txt.value.trim();
      if (!v) { txt.focus(); return; }
      bar.hidden = true;
      send.onclick = null; txt.onkeydown = null;
      me(v);
      onDone(v);
    };
    send.onclick = fire;
    txt.onkeydown = function (e) { if (e.key === 'Enter') fire(); };
  }

  /* ---- 단계 ---- */
  function stepComplex() {
    bot('안녕하세요, <b>만물인테리어</b>입니다.<br>관리사무소 업무를 빠르게 확인할 수 있도록 몇 가지만 여쭙겠습니다.<br><br><b>단지(아파트) 이름</b>이 어떻게 되나요?');
    askText('예: 신흥마을아파트', 'text', function (v) { state.complex = v; stepRegion(); });
  }
  function stepRegion() {
    bot('단지가 <b>어느 지역</b>인가요?');
    chips(['대전 동구', '대전 중구', '대전 서구', '대전 유성구', '대전 대덕구', '세종', '충남', '그 외'], function (v) {
      state.region = v; me(v); stepUnits();
    });
  }
  function stepUnits() {
    bot('<b>세대수</b>는 대략 어느 정도인가요?');
    chips(['100세대 미만', '100~300세대', '300~500세대', '500세대 이상', '잘 모름'], function (v) {
      state.units = v; me(v); stepNeeds();
    });
  }
  function stepNeeds() {
    bot('<b>필요하신 것</b>을 모두 골라 주세요. (여러 개 가능)');
    chips([
      '누수·배관 원인 확인·보수',
      '공용부 방수·타일·도장 보수',
      '세대 민원 보수·복구',
      '인테리어 공사 안내·행정지원',
      '기타(통화로 설명)'
    ], function (label, on, wrap, done) {
      if (done) {
        if (!state.needs.length) { bot('한 가지 이상 골라 주세요.'); return; }
        wrap.remove();
        me(state.needs.join(', '));
        stepManager();
        return;
      }
      if (on) state.needs.push(label);
      else state.needs = state.needs.filter(function (x) { return x !== label; });
    }, true);
  }
  function stepManager() {
    bot('연락드릴 <b>담당자 성함(직함)</b>을 알려 주세요.');
    askText('예: 김OO 관리소장', 'text', function (v) { state.manager = v; stepPhone(); });
  }
  function stepPhone() {
    bot('<b>연락처</b>를 남겨 주세요. (사무소 전화 또는 휴대폰)');
    askText('예: 042-000-0000 / 010-0000-0000', 'tel', function (v) {
      var digits = v.replace(/\D/g, '');
      if (digits.length < 9) { bot('번호를 다시 확인해 주세요.'); stepPhone(); return; }
      state.phone = v; stepConsent();
    });
  }
  function stepConsent() {
    bot('연락을 위해 <b>단지명·담당자명·연락처</b>를 1년간 보관합니다. 동의하시나요?<br><span class="of-small"><a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침 보기</a></span>');
    chips(['동의하고 접수', '그만두기'], function (v) {
      me(v);
      if (v === '동의하고 접수') { state.agreed = true; submit(); }
      else bot('접수를 중단했습니다. 편하실 때 전화 주셔도 됩니다 — <a href="tel:01023978629"><b>010-2397-8629</b></a>');
    });
  }

  function leadText() {
    return ['[만물인테리어 관리사무소 제휴 요청]',
      '단지: ' + state.complex + ' (' + state.region + ' · ' + state.units + ')',
      '필요한 것: ' + state.needs.join(', '),
      '담당자: ' + state.manager,
      '연락처: ' + state.phone].join('\n');
  }

  async function submit() {
    var wait = bot('접수하는 중…');
    var forms = (CONFIG && CONFIG.forms) || {};
    var sent = false;
    if (forms.enabled && forms.endpoint) {
      try {
        var body = {
          subject: '[관리사무소] ' + state.complex + ' · ' + state.region,
          from_name: '만물인테리어 관리사무소 창구',
          channel: 'office',
          complex: state.complex, region: state.region, units: state.units,
          needs: state.needs.join(', '), manager: state.manager, phone: state.phone,
          message: leadText()
        };
        if (forms.accessKey) body.access_key = forms.accessKey;
        var ctl = new AbortController();
        var t = setTimeout(function () { ctl.abort(); }, 12000);
        var res = await fetch(forms.endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body), signal: ctl.signal
        });
        clearTimeout(t);
        sent = res.ok;
      } catch (e) { sent = false; }
    }
    wait.remove();
    if (sent) {
      bot('✅ <b>접수됐습니다.</b> ' + esc(state.manager) + '님, 대표가 영업시간 내 직접 연락드립니다.<br><span class="of-small">급하시면 지금 바로: <a href="tel:01023978629"><b>010-2397-8629</b></a></span>');
    } else {
      // 정직한 폴백 — 전송이 안 됐는데 됐다고 말하지 않는다
      bot('⚠️ 지금 자동 접수가 되지 않았습니다.<br>아래 내용이 복사되니 <b>문자로 붙여넣어 보내 주세요</b> — 같은 효력입니다.<br><span class="of-small">문자·전화: <a href="sms:01023978629"><b>010-2397-8629</b></a></span>');
      try { navigator.clipboard.writeText(leadText()); } catch (e) {}
    }
  }

  /* ---- 시작 ---- */
  fetch('data/config.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (c) { CONFIG = c; })
    .catch(function () { CONFIG = null; })
    .then(stepComplex);
})();
