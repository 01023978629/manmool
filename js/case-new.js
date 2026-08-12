/* ============================================================
   사례 등록 화면 (case-new.html)
   ------------------------------------------------------------
   하는 일:
     · 현장 6항목을 받아 실제 글이 어떻게 나올지 미리 보여준다
     · 동·호수·연락처·고객명이 섞이면 등록을 막는다(규칙은 js/pii-rules.js 공용)
     · 사진의 촬영 위치정보(EXIF)를 이 브라우저에서 지운 사본을 만든다
     · 여러 현장을 저장해 두었다가 한 번에 꺼낼 수 있게 보관한다(js/case-store.js)
   하지 않는 일:
     · 사이트를 바꾸지 않는다. 어디로도 전송하지 않는다.
       (정적 사이트라 서버가 없다 — 있는 척하면 사장님이 올라간 줄 안다)
   ============================================================ */
(function () {
  const RULES = window.MANMUL_PII_RULES;
  const STORE = window.ManmulCaseStore;
  const form = document.getElementById('caseForm');
  if (!RULES || !STORE || !form) return;

  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = 'manmul_case_draft';
  const FIELDS = [
    ['place', 'cfPlace', '동네+단지'],
    ['symptom', 'cfSymptom', '증상'],
    ['method', 'cfMethod', '탐지 방법'],
    ['cause', 'cfCause', '원인+전유/공용'],
    ['work', 'cfWork', '공사 내용'],
    ['duration', 'cfDuration', '걸린 시간'],
  ];
  const status = $('cfStatus');
  let photos = [];   // { name, blob, url, hadExif, bytes }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function values() {
    const out = {};
    for (const [key, id] of FIELDS) out[key] = ($(id).value || '').trim();
    return out;
  }

  function piiFindings(text) {
    const src = String(text || '');
    return RULES.filter(([, pattern]) => pattern.test(src)).map(([name]) => name);
  }

  /* 현장앱 [후기 재료 복사] 결과와 같은 형식. scripts/new-case-post.mjs 가
     이 형식을 그대로 읽으므로, 사장님이 붙여넣기만 하면 초안이 만들어진다. */
  function materialText(v) {
    return [
      '1. 동네+단지: ' + v.place,
      '2. 증상: ' + v.symptom,
      '3. 탐지 방법: ' + v.method,
      '4. 원인+전유/공용: ' + v.cause,
      '5. 공사 내용: ' + v.work,
      '6. 걸린 시간: ' + v.duration,
    ].join('\n');
  }

  /* 같은 형식을 되읽는다 — 현장앱에서 복사해 온 재료를 칸에 나눠 넣을 때 쓴다 */
  function parseMaterial(text) {
    const map = [
      ['cfPlace', /^(?:1\.\s*)?동네\+단지\s*:\s*(.+)$/m],
      ['cfSymptom', /^(?:2\.\s*)?(?:어떤 연락|증상)\s*:\s*(.+)$/m],
      ['cfMethod', /^(?:3\.\s*)?탐지 방법\s*:\s*(.+)$/m],
      ['cfCause', /^(?:4\.\s*)?원인\+전유\/공용\s*:\s*(.+)$/m],
      ['cfWork', /^(?:5\.\s*)?공사 내용\s*:\s*(.+)$/m],
      ['cfDuration', /^(?:6\.\s*)?걸린 시간\s*:\s*(.+)$/m],
    ];
    let filled = 0;
    for (const [id, pattern] of map) {
      const m = String(text || '').match(pattern);
      if (m) { $(id).value = m[1].replace(/\s*←.*$/, '').trim(); filled++; }
    }
    return filled;
  }

  /* ---------- 확인 목록 ---------- */
  function guard() {
    const v = values();
    const missing = FIELDS.filter(([key]) => !v[key]).map(([, , label]) => label);
    const found = [...new Set(piiFindings(Object.values(v).join('\n')))];
    const rows = [];
    rows.push(missing.length
      ? { ok: false, text: '아직 안 적은 항목: ' + missing.join(', ') }
      : { ok: true, text: '6항목 모두 적었습니다' });
    rows.push(found.length
      ? { ok: false, text: '개인정보로 보이는 값: ' + found.join(', ') + ' — 이대로는 등록할 수 없습니다' }
      : { ok: true, text: '동·호수·연락처·고객명 없음' });
    const withExif = photos.filter((p) => p.hadExif).length;
    rows.push(photos.length
      ? { ok: true, text: `사진 ${photos.length}장 준비됨` + (withExif ? ` · 위치정보 있던 ${withExif}장은 지운 사본을 씁니다` : ' · 위치정보 없음') }
      : { ok: null, text: '사진 없음 — 글만 올릴 수 있지만 사진이 있으면 훨씬 좋습니다' });

    const list = $('cfGuard');
    list.innerHTML = rows.map((r) =>
      `<li class="${r.ok === true ? 'ok' : r.ok === false ? 'bad' : 'warn'}">${esc(r.text)}</li>`).join('');

    const blocked = missing.length || found.length;
    const badge = $('cfGuardBadge');
    badge.textContent = blocked ? '아직 안 됩니다' : '등록 가능';
    badge.className = 'case-badge ' + (blocked ? 'bad' : 'ok');
    return { blocked: !!blocked, missing, found, v };
  }

  /* ---------- 미리보기 ---------- */
  function preview(v) {
    const filled = FIELDS.some(([key]) => v[key]);
    if (!filled) { $('cfPreview').innerHTML = '<p class="case-empty">내용을 적으면 실제 글 모양이 여기에 나옵니다.</p>'; return; }
    const date = new Date().toISOString().slice(0, 10);
    const title = `${v.place || '(동네·단지)'} ${v.symptom || '(증상)'} — 탐지부터 보수까지`;
    const excerpt = `${v.place || '(동네·단지)'}에서 확인한 ${v.symptom || '(증상)'} 사례입니다. `
      + '탐지 방법, 원인 구분, 공사 내용과 걸린 시간을 실제 현장 기록으로 정리했습니다.';
    const body = [
      ['현장에서 확인한 증상', v.symptom],
      ['탐지 방법', v.method],
      ['원인과 전유부·공용부 구분', v.cause],
      ['진행한 공사', v.work],
      ['걸린 시간', v.duration],
    ];
    $('cfPreview').innerHTML =
      `<small class="case-pv-meta">누수탐지·수리 · ${esc(date)}</small>`
      + `<h3>${esc(title)}</h3>`
      + `<p class="case-pv-excerpt">${esc(excerpt)}</p>`
      + (photos.length ? `<div class="case-pv-photos">${photos.slice(0, 3).map((p) =>
        `<img src="${p.url}" alt="현장 사진 미리보기" />`).join('')}</div>` : '')
      + body.map(([h, p]) => `<h4>${esc(h)}</h4><p>${esc(p || '(아직 안 적음)')}</p>`).join('');
  }

  function refresh() {
    const g = guard();
    preview(g.v);
    saveDraft(g.v);
    return g;
  }

  /* ---------- 초안 보관 (이 브라우저에만) ---------- */
  function saveDraft(v) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch (e) {}
  }
  function loadDraft() {
    try {
      const v = JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
      for (const [key, id] of FIELDS) if (v[key]) $(id).value = v[key];
    } catch (e) {}
  }

  /* ---------- 사진: EXIF 제거 ----------
     캔버스에 다시 그려 내보내면 촬영 위치·기기 정보가 따라오지 않는다.
     원본 파일은 읽기만 하고 그대로 둔다. */
  function hasExif(buf) {
    const b = new Uint8Array(buf);
    if (b[0] !== 0xff || b[1] !== 0xd8) return false;        // JPEG 아니면 판정 생략
    for (let i = 2; i + 3 < b.length && i < 200000;) {
      if (b[i] !== 0xff) break;
      const marker = b[i + 1];
      if (marker === 0xda) break;                             // 이미지 데이터 시작
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker === 0xe1 || marker === 0xe2) return true;     // APP1(EXIF/XMP) · APP2
      i += 2 + len;
    }
    return false;
  }

  async function stripExif(file, index) {
    const buf = await file.arrayBuffer();
    const hadExif = hasExif(buf);
    const bitmap = await createImageBitmap(new Blob([buf], { type: file.type || 'image/jpeg' }));
    // 너무 큰 사진은 긴 변 2000px 로 줄인다 — 올릴 때 무겁고, 화면에서 그만큼 필요하지 않다
    const max = 2000;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close && bitmap.close();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return {
      name: `case-${date}-${String(index + 1).padStart(2, '0')}.jpg`,
      blob, url: URL.createObjectURL(blob), hadExif, bytes: blob.size,
    };
  }

  function renderPhotos() {
    $('cfPhotoList').innerHTML = photos.map((p, i) =>
      `<figure class="case-photo"><img src="${p.url}" alt="${esc(p.name)} 미리보기" />`
      + `<figcaption><b>${esc(p.name)}</b><span>${Math.round(p.bytes / 1024)}KB · ${p.hadExif ? '위치정보 지움' : '위치정보 없었음'}</span>`
      + `<button type="button" class="case-photo-del" data-i="${i}" aria-label="${esc(p.name)} 빼기">✕</button></figcaption></figure>`).join('');
  }

  $('cfPhotos').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    status.className = 'case-status';
    status.textContent = `사진 ${files.length}장에서 위치정보를 지우는 중…`;
    for (const file of files) {
      try { photos.push(await stripExif(file, photos.length)); }
      catch (err) { status.className = 'case-status err'; status.textContent = `${file.name} 을(를) 읽지 못했습니다. 다른 형식으로 저장해 다시 시도해 주세요.`; }
    }
    e.target.value = '';
    renderPhotos(); refresh();
    if (!/읽지 못했습니다/.test(status.textContent)) {
      status.textContent = `사진 ${photos.length}장 준비됐습니다.`;
    }
  });

  $('cfPhotoList').addEventListener('click', (e) => {
    const btn = e.target.closest('.case-photo-del');
    if (!btn) return;
    const [gone] = photos.splice(Number(btn.dataset.i), 1);
    if (gone) URL.revokeObjectURL(gone.url);
    renderPhotos(); refresh();
  });

  /* ---------- 내보내기 ---------- */
  function blocked(g) {
    if (!g.blocked) return false;
    status.className = 'case-status err';
    status.textContent = g.found.length
      ? '개인정보로 보이는 값이 있어 막았습니다: ' + g.found.join(', ')
      : '아직 안 적은 항목이 있습니다: ' + g.missing.join(', ');
    return true;
  }

  $('cfCopy').addEventListener('click', async () => {
    const g = refresh();
    if (blocked(g)) return;
    const text = materialText(g.v);
    try {
      await navigator.clipboard.writeText(text);
      status.className = 'case-status ok';
      status.textContent = '✓ 재료를 복사했습니다. 사진과 함께 전달해 주세요.';
    } catch (err) {
      status.className = 'case-status err';
      status.textContent = '복사하지 못했습니다. 아래 내용을 직접 긁어 복사해 주세요.';
    }
  });

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------- 저장한 현장 목록 ---------- */
  const QSTATUS = $('cfQueueStatus');
  let queue = [];
  const shortId = (id) => String(id).slice(-4);

  function qsay(text, kind) {
    QSTATUS.className = 'case-status' + (kind ? ' ' + kind : '');
    QSTATUS.textContent = text;
  }

  function photoNames(rec) {
    // 여러 현장을 한 번에 내려받으면 파일명이 겹친다. 현장별 꼬리표를 붙여 구분한다.
    return rec.photos.map((p, i) =>
      `case-${String(rec.savedAt).slice(0, 10).replaceAll('-', '')}-${shortId(rec.id)}-${String(i + 1).padStart(2, '0')}.jpg`);
  }

  function recMaterial(rec, index, total) {
    const names = photoNames(rec);
    return [
      `[현장 ${index + 1} / 총 ${total}건 · 저장 ${String(rec.savedAt).slice(0, 10)}]`,
      materialText(rec.fields),
      names.length ? `사진 ${names.length}장: ${names.join(', ')}` : '사진 없음',
    ].join('\n');
  }

  async function loadQueue() {
    try { queue = await STORE.all(); }
    catch (e) { queue = []; qsay('보관소를 열지 못했습니다. 브라우저의 사생활 보호 모드에서는 저장이 안 됩니다.', 'err'); }
    renderQueue();
  }

  function renderQueue() {
    const pending = queue.filter((r) => r.status !== 'done');
    $('cfQueueCount').textContent = `${pending.length}건`;
    $('cfQueueCount').className = 'case-badge' + (pending.length ? ' ok' : '');
    if (!queue.length) {
      $('cfQueueList').innerHTML = '<p class="case-empty">저장한 현장이 없습니다. 위에서 적고 <b>이 현장 저장</b>을 누르세요.</p>';
      return;
    }
    $('cfQueueList').innerHTML = queue.map((rec) => {
      const done = rec.status === 'done';
      const thumbs = rec.photos.slice(0, 4).map((p) =>
        `<img src="${URL.createObjectURL(p.blob)}" alt="" loading="lazy" />`).join('');
      return `<article class="case-queue-item${done ? ' is-done' : ''}">
        <div class="cq-main">
          <b>${esc(rec.fields.place || '(동네·단지 없음)')}</b>
          <span class="cq-meta">${esc(String(rec.savedAt).slice(0, 10))} · 사진 ${rec.photos.length}장${done ? ' · 올림' : ''}</span>
          <span class="cq-sym">${esc(rec.fields.symptom || '')}</span>
        </div>
        ${thumbs ? `<div class="cq-thumbs">${thumbs}</div>` : ''}
        <div class="cq-actions">
          <button type="button" class="cq-btn" data-act="load" data-id="${esc(rec.id)}">불러오기</button>
          <button type="button" class="cq-btn" data-act="toggle" data-id="${esc(rec.id)}">${done ? '되돌리기' : '올림 표시'}</button>
          <button type="button" class="cq-btn cq-del" data-act="del" data-id="${esc(rec.id)}">삭제</button>
        </div>
      </article>`;
    }).join('');
  }

  $('cfSave').addEventListener('click', async () => {
    const g = refresh();
    if (blocked(g)) return;
    const rec = {
      id: 'case-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      savedAt: new Date().toISOString(),
      status: 'pending',
      fields: g.v,
      photos: photos.map((p) => ({ blob: p.blob, hadExif: p.hadExif })),
    };
    try {
      await STORE.put(rec);
    } catch (e) {
      // 공간이 찼을 때 '저장됐다'고 하면 사장님은 지우고 다음 현장을 적는다 — 그러면 사라진다.
      qsay('저장하지 못했습니다: ' + ((e && e.message) || e) + ' · 먼저 올린 현장을 지우고 다시 시도해 주세요.', 'err');
      return;
    }
    // 저장이 끝난 뒤에만 입력을 비운다
    for (const [, id] of FIELDS) $(id).value = '';
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    renderPhotos(); refresh();
    await loadQueue();
    status.className = 'case-status ok';
    status.textContent = `저장했습니다. 아래 목록에 쌓입니다. 다음 현장을 이어서 적으셔도 됩니다.`;
  });

  $('cfQueueList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.cq-btn');
    if (!btn) return;
    const rec = queue.find((r) => r.id === btn.dataset.id);
    if (!rec) return;
    if (btn.dataset.act === 'load') {
      for (const [key, id] of FIELDS) $(id).value = rec.fields[key] || '';
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      photos = rec.photos.map((p, i) => ({
        name: photoNames(rec)[i], blob: p.blob, url: URL.createObjectURL(p.blob),
        hadExif: p.hadExif, bytes: p.blob.size,
      }));
      renderPhotos(); refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      qsay('불러왔습니다. 고친 뒤 다시 저장하면 새 건으로 쌓이니, 원래 건은 삭제해 주세요.');
      return;
    }
    if (btn.dataset.act === 'toggle') {
      rec.status = rec.status === 'done' ? 'pending' : 'done';
      await STORE.put(rec); await loadQueue();
      return;
    }
    if (btn.dataset.act === 'del') {
      if (!window.confirm(`"${rec.fields.place || '이 현장'}" 을(를) 삭제합니다. 되돌릴 수 없습니다.`)) return;
      await STORE.remove(rec.id); await loadQueue();
      qsay('삭제했습니다.');
    }
  });

  $('cfQueueCopy').addEventListener('click', async () => {
    const pending = queue.filter((r) => r.status !== 'done');
    if (!pending.length) { qsay('넘길 현장이 없습니다.', 'err'); return; }
    const text = pending.map((r, i) => recMaterial(r, i, pending.length)).join('\n\n────────\n\n');
    try {
      await navigator.clipboard.writeText(text);
      qsay(`✓ ${pending.length}건을 복사했습니다. 대화창에 붙여넣고 사진도 함께 올려 주세요.`, 'ok');
    } catch (err) { qsay('복사하지 못했습니다. 전부 내려받기를 쓰세요.', 'err'); }
  });

  $('cfQueueDownload').addEventListener('click', () => {
    const pending = queue.filter((r) => r.status !== 'done');
    if (!pending.length) { qsay('넘길 현장이 없습니다.', 'err'); return; }
    const text = pending.map((r, i) => recMaterial(r, i, pending.length)).join('\n\n────────\n\n');
    download(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'cases-material.txt');
    let n = 0;
    for (const rec of pending) {
      const names = photoNames(rec);
      rec.photos.forEach((p, i) => { n++; setTimeout(() => download(p.blob, names[i]), 250 * n); });
    }
    qsay(`${pending.length}건과 사진 ${n}장을 내려받습니다.`, 'ok');
  });

  $('cfQueueClearDone').addEventListener('click', async () => {
    const done = queue.filter((r) => r.status === 'done').length;
    if (!done) { qsay('올림 표시한 현장이 없습니다.', 'err'); return; }
    if (!window.confirm(`올림 표시한 ${done}건을 지웁니다. 되돌릴 수 없습니다.`)) return;
    const gone = await STORE.removeDone();
    await loadQueue();
    qsay(`${gone}건을 지웠습니다.`, 'ok');
  });

  $('cfImport').addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) { text = ''; }
    if (!text) text = window.prompt('현장앱에서 복사한 재료를 붙여 넣으세요.') || '';
    const filled = parseMaterial(text);
    refresh();
    status.className = filled ? 'case-status ok' : 'case-status err';
    status.textContent = filled ? `${filled}개 항목을 채웠습니다.` : '읽을 수 있는 항목이 없었습니다.';
  });

  $('cfClear').addEventListener('click', () => {
    if (!window.confirm('적은 내용과 사진을 모두 지웁니다. 계속할까요?')) return;
    for (const [, id] of FIELDS) $(id).value = '';
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    renderPhotos(); refresh();
    status.className = 'case-status';
    status.textContent = '지웠습니다.';
  });

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', refresh);
  loadDraft();
  renderPhotos();
  refresh();
  loadQueue();
})();
