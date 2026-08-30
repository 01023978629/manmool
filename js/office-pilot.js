(function () {
  'use strict';
  var LEAD = window.ManmulLead;
  var REVENUE = window.ManmulRevenue;
  var form = document.getElementById('officePilotForm');
  if (!LEAD || !REVENUE || !form) return;

  var status = document.getElementById('officePilotStatus');
  var done = document.getElementById('officePilotDone');
  var submit = document.getElementById('officePilotSubmit');
  var config = null;
  var failureGeneration = 0;
  var allowed = ['leak-piping', 'common-repair', 'preventive-inspection', 'other'];
  var limits = { complexName:80, officeContactName:50, phone:30, region:80, desiredStart:80, memo:500 };

  function collect() {
    var fd = new FormData(form);
    return {
      type:'관리사무소 30일 시험운영',
      complexName:String(fd.get('complexName') || '').trim(),
      officeContactName:String(fd.get('officeContactName') || '').trim(),
      phone:String(fd.get('phone') || '').trim(),
      region:String(fd.get('region') || '').trim(),
      pilotInterest:fd.getAll('pilotInterest'),
      desiredStart:String(fd.get('desiredStart') || '').trim(),
      memo:String(fd.get('memo') || '').trim(),
      privacyConsent:fd.get('privacyConsent') === 'on'
    };
  }

  function hasResidentPii(value) {
    var text = String(value || '');
    var compact = text.replace(/[ ._-]/g, '');
    return /(?:^|\D)(?:01[016789]\d{7,8}|02\d{7,8}|0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}|050\d{8,9}|0(?:60|70|80)\d{7,8}|1(?:5|6|8)\d{6})(?:\D|$)/.test(compact) ||
      /\d{1,4}\s*동/.test(text) || /\d{1,4}\s*호/.test(text) || /https?:\/\//i.test(text) ||
      /사진\s*링크/.test(text) || /입주민\s*(?:이름|성명)/.test(text) || /세대주\s*(?:이름|성명)/.test(text);
  }

  function validate(data) {
    var keys = Object.keys(limits);
    for (var i=0;i<keys.length;i++) if (data[keys[i]].length > limits[keys[i]]) return '입력값 길이를 확인해 주세요.';
    if (!data.complexName) return '단지명을 입력해 주세요.';
    if (!data.officeContactName) return '관리사무소 담당자를 입력해 주세요.';
    var phone = data.phone.replace(/\D/g, '');
    if (!/^0\d{9,10}$/.test(phone)) return '연락처를 10~11자리 국내 전화번호로 입력해 주세요.';
    if (!data.region) return '지역을 입력해 주세요.';
    if (!data.pilotInterest.length || data.pilotInterest.length > 4 || new Set(data.pilotInterest).size !== data.pilotInterest.length || data.pilotInterest.some(function(v){return allowed.indexOf(v)<0;})) return '관심 업무를 올바르게 선택해 주세요.';
    if (!data.privacyConsent) return '개인정보 수집·이용에 동의해 주세요.';
    if (hasResidentPii(data.memo)) return '문의 내용에 입주민 정보를 적지 말아 주세요.';
    data.phone = phone;
    return '';
  }

  function leadText(payload) { return LEAD.buildLeadText(payload); }
  function showFailure(payload) {
    var generation = LEAD.rememberFailure(payload); failureGeneration = generation;
    var text = leadText(payload);
    done.hidden = false;
    done.innerHTML = '<strong>자동 접수가 완료되지 않았습니다.</strong><p>아래 방법으로 직접 전달하거나 다시 시도해 주세요.</p><div class="office-pilot-result-actions"><button id="officePilotRetry" type="button">다시 시도</button><a href="tel:01023978629">전화하기</a><a id="officePilotSms" href="sms:01023978629?body=' + encodeURIComponent(text) + '">문자로 보내기</a><button id="officePilotCopy" type="button">내용 복사</button></div>';
    document.getElementById('officePilotCopy').addEventListener('click', function(){ LEAD.copyToClipboard(text).then(function(ok){status.textContent=ok?'문의 내용을 복사했습니다.':'복사하지 못했습니다. 내용을 직접 선택해 주세요.';}); });
    document.getElementById('officePilotRetry').addEventListener('click', function(){
      status.textContent='다시 접수하고 있습니다.';
      LEAD.retryLatest(config).then(function(result){ if(result.status==='sent'){ LEAD.clearFailure(generation); showSuccess(); } else status.textContent='아직 자동 접수가 되지 않았습니다. 전화·문자 또는 복사를 이용해 주세요.'; });
    });
  }
  function showSuccess() {
    if (failureGeneration) LEAD.clearFailure(failureGeneration);
    failureGeneration = 0;
    status.textContent=''; done.hidden=false;
    done.innerHTML='<strong>시험운영 신청이 접수됐습니다.</strong><p>접수 프로그램 이용료 0원 · 실제 작업은 별도 견적</p><p>대표가 확인 후 연락드리겠습니다.</p><a href="tel:01023978629">대표에게 전화</a>';
    form.reset();
  }

  LEAD.loadConfig().then(function(value){ config=value; });
  form.addEventListener('submit', function(event){
    event.preventDefault(); var data=collect(); var error=validate(data); done.hidden=true; done.innerHTML='';
    if(error){status.classList.add('err'); status.textContent=error; return;}
    status.classList.remove('err');
    var metadata=REVENUE.captureLeadMetadata(window.location,'office-pilot-submit');
    var payload=Object.assign({},data,metadata,{source:'office-pilot',submittedAt:new Date().toISOString(),status:'신규'});
    submit.disabled=true; status.textContent='접수하고 있습니다.';
    Promise.resolve(config || LEAD.loadConfig()).then(function(current){config=current; return LEAD.deliver(current,payload);}).then(function(sent){ if(sent===true) showSuccess(); else showFailure(payload); }).catch(function(){showFailure(payload);}).finally(function(){submit.disabled=false;});
  });
})();
