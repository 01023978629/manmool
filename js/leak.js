/* 누수 전용 페이지 · 첫 대응 체크리스트
   체크 내용은 브라우저에 저장하거나 서버로 보내지 않고, 사용자가 눌렀을 때만 복사한다. */
(function () {
  const checksHost = document.getElementById('responseChecks');
  const count = document.getElementById('responseCount');
  const guide = document.getElementById('responseGuide');
  const copyBtn = document.getElementById('responseCopy');
  const status = document.getElementById('responseStatus');
  if (!checksHost || !count || !guide || !copyBtn || !status) return;

  const inputs = Array.from(checksHost.querySelectorAll('input[type="checkbox"]'));

  function current() {
    const done = inputs.filter((input) => input.checked).map((input) => input.value);
    const pending = inputs.filter((input) => !input.checked).map((input) => input.value);
    return { done, pending };
  }

  function render() {
    const state = current();
    count.textContent = `${state.done.length} / ${inputs.length} 준비`;
    count.classList.toggle('complete', state.done.length === inputs.length);
    guide.textContent = state.done.length
      ? `${state.done.length}개 항목을 확인했습니다. 메모를 복사해 전화 상담 때 읽어주시거나 온라인 상담 내용에 붙여 넣으세요.`
      : '항목을 하나씩 확인하면 전화나 온라인 상담 때 전달할 메모를 복사할 수 있습니다.';
    status.textContent = '';
  }

  function memoText() {
    const state = current();
    const lines = ['[누수 상담 준비 메모]'];
    if (state.done.length) {
      lines.push('', '확인 완료');
      state.done.forEach((item) => lines.push(`- ${item}`));
    }
    if (state.pending.length) {
      lines.push('', '아직 확인하지 못함');
      state.pending.forEach((item) => lines.push(`- ${item}`));
    }
    lines.push('', '※ 누수 원인과 공사 범위는 현장 점검 후 확인합니다.');
    return lines.join('\n');
  }

  async function copyMemo() {
    const text = memoText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      }
      status.textContent = '✓ 준비 메모를 복사했습니다. 상담 내용에 붙여 넣으세요.';
    } catch (e) {
      status.textContent = '복사하지 못했습니다. 체크한 내용을 화면을 보며 알려주세요.';
    }
  }

  inputs.forEach((input) => input.addEventListener('change', render));
  copyBtn.addEventListener('click', copyMemo);
  render();
})();
