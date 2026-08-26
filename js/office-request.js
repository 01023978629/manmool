(() => {
  const form = document.getElementById('officeRequestForm');
  const review = document.getElementById('requestReview');
  const preview = document.getElementById('requestPreview');
  const launch = document.getElementById('smsLaunch');
  const error = document.getElementById('requestError');
  const copyButton = document.getElementById('copyRequest');
  const copyStatus = document.getElementById('copyStatus');
  const year = document.getElementById('requestYear');
  const api = window.ManmulOfficeRequest;

  if (year) year.textContent = new Date().getFullYear();
  if (!form || !review || !preview || !launch || !error || !copyButton || !api) return;

  const collect = () => {
    const values = Object.fromEntries(new FormData(form).entries());
    values.privacyConsent = form.elements.privacyConsent.checked;
    return values;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = collect();
    const result = api.validateRequest(data);
    error.textContent = result.message;
    copyStatus.textContent = '';

    if (!result.ok) {
      const target = form.elements[result.field];
      if (target) target.focus();
      review.hidden = true;
      return;
    }

    const body = api.formatRequestMessage(data);
    preview.value = body;
    launch.href = api.buildSmsHref(body, navigator.userAgent);
    review.hidden = false;
    review.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(preview.value);
      copyStatus.textContent = '접수 내용을 복사했습니다.';
    } catch (_) {
      preview.focus();
      preview.select();
      const copied = document.execCommand('copy');
      copyStatus.textContent = copied
        ? '접수 내용을 복사했습니다.'
        : '위 내용을 길게 눌러 직접 복사해 주세요.';
    }
  });
})();
