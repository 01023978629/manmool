(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ManmulOfficeRequest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const required = [
    ['complex', '단지명을 입력해 주세요.'],
    ['dong', '동을 입력해 주세요.'],
    ['ho', '호수를 입력해 주세요.'],
    ['issueType', '문제 유형을 선택해 주세요.'],
    ['location', '발생 위치를 입력해 주세요.'],
    ['description', '증상을 입력해 주세요.'],
    ['name', '신청자 이름을 입력해 주세요.'],
    ['phone', '회신 전화번호를 입력해 주세요.'],
  ];

  const digits = (value) => String(value || '').replace(/\D/g, '');

  function normalizePhone(value) {
    const number = digits(value);
    if (number.length === 11) {
      return `${number.slice(0, 3)}-${number.slice(3, 7)}-${number.slice(7)}`;
    }
    if (number.length === 10) {
      return `${number.slice(0, 3)}-${number.slice(3, 6)}-${number.slice(6)}`;
    }
    return String(value || '').trim();
  }

  function validateRequest(data) {
    for (const [field, message] of required) {
      if (!String(data[field] || '').trim()) return { ok: false, field, message };
    }
    if (!/^01\d{8,9}$/.test(digits(data.phone))) {
      return {
        ok: false,
        field: 'phone',
        message: '휴대전화 번호 10~11자리를 확인해 주세요.',
      };
    }
    if (!data.privacyConsent) {
      return {
        ok: false,
        field: 'privacyConsent',
        message: '개인정보 수집·이용에 동의해 주세요.',
      };
    }
    return { ok: true, field: null, message: '' };
  }

  function formatRequestMessage(data) {
    return [
      '[만물인테리어 관리사무소 시설접수]',
      `단지: ${data.complex.trim()}`,
      `동·호수: ${data.dong.trim()}동 ${data.ho.trim()}호`,
      `문제 유형: ${data.issueType.trim()}`,
      `발생 위치: ${data.location.trim()}`,
      `증상: ${data.description.trim()}`,
      `신청자: ${data.name.trim()}`,
      `연락처: ${normalizePhone(data.phone)}`,
    ].join('\n');
  }

  function buildSmsHref(body, userAgent) {
    const separator = /iPad|iPhone|iPod/i.test(userAgent || '') ? '&' : '?';
    return `sms:01023978629${separator}body=${encodeURIComponent(body)}`;
  }

  return { normalizePhone, validateRequest, formatRequestMessage, buildSmsHref };
});
