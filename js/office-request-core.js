(function attach(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ManmulOfficeRequest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createApi() {
  const ISSUE_TYPES = ['누수', '배수', '급수', '난방', '방수', '공용시설', '기타'];
  const PIPE_TYPES = ['미확정', '오수', '우수', '잡배수', '난방', '급수'];
  const OFFICE_SLUG = /^[a-z0-9][a-z0-9-]{2,63}$/;
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const STATUS_LABELS = {
    pending_review: '접수됨', needs_info: '내용 확인 필요', accepted: '확인 완료', visit_scheduled: '방문 예정',
    in_progress: '작업 중', completed: '작업 완료', billed: '청구 완료', paid: '처리 완료', on_hold: '확인 중', cancelled: '취소됨',
  };
  const CONTRACTED_STATUSES = new Set(Object.keys(STATUS_LABELS));
  const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  const RECENT_LABELS = {
    needs_info: '자료 보완 필요', visit_scheduled: '방문 예정', completed: '작업 완료',
    billed: '청구 완료', paid: '입금 완료', cancelled: '취소됨',
  };

  function text(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
  function digits(value) { return String(value == null ? '' : value).replace(/\D/g, ''); }
  function normalizePhone(value) {
    const number = digits(value);
    if (number.length === 11) return `${number.slice(0, 3)}-${number.slice(3, 7)}-${number.slice(7)}`;
    if (number.length === 10) return `${number.slice(0, 3)}-${number.slice(3, 6)}-${number.slice(6)}`;
    return '';
  }
  function parseOfficeSlug(search) {
    const slug = new URLSearchParams(String(search || '')).get('office') || '';
    return OFFICE_SLUG.test(slug) ? slug : '';
  }
  function parseOfficeEntry(value, currentUrl) {
    const raw = text(value, 500);
    if (OFFICE_SLUG.test(raw)) return raw;
    let current;
    let target;
    try {
      current = new URL(String(currentUrl || ''));
      target = new URL(raw);
    } catch (_) {
      return '';
    }
    const keys = [...target.searchParams.keys()];
    if (target.origin !== current.origin || target.pathname !== current.pathname || target.username || target.password || target.hash) return '';
    if (keys.length !== 1 || keys[0] !== 'office' || target.searchParams.getAll('office').length !== 1) return '';
    return parseOfficeSlug(target.search);
  }
  function validateLogin(data) {
    return /^\d{6}$/.test(String(data && data.pin || ''))
      ? { ok: true, field: null, message: '' }
      : { ok: false, field: 'pin', message: '6자리 비밀번호를 확인해 주세요.' };
  }
  function exactExpectedUploadIds(value) {
    if (!Array.isArray(value) || value.length > 5 || value.some((id) => typeof id !== 'string' || !UUID_V4.test(id)) || new Set(value).size !== value.length) throw new TypeError('expectedUploadIds');
    return [...value];
  }
  function buildCreatePayload(data, idempotencyKey, expectedUploadIds = []) {
    data = data && typeof data === 'object' ? data : {};
    const residentName = text(data.residentName, 60);
    const residentPhone = normalizePhone(data.residentPhone);
    return {
      idempotencyKey: text(idempotencyKey, 80), unit: text(data.unit, 80), location: text(data.location, 120),
      issueType: text(data.issueType, 20), pipeType: text(data.pipeType || '미확정', 20), urgency: data.urgency === 'urgent' ? 'urgent' : 'normal',
      description: text(data.description, 1200), officeContact: { name: text(data.officeContactName, 60), phone: normalizePhone(data.officeContactPhone) },
      residentContact: residentName && residentPhone ? { name: residentName, phone: residentPhone } : null,
      preferredVisitDate: text(data.preferredVisitDate, 10), privacyConsent: data.privacyConsent === true,
      expectedUploadIds: exactExpectedUploadIds(expectedUploadIds),
    };
  }
  function validateRequest(data) {
    data = data && typeof data === 'object' ? data : {};
    const residentName = text(data.residentName, 60);
    const residentPhoneInput = text(data.residentPhone, 40);
    if ((residentName && !residentPhoneInput) || (!residentName && residentPhoneInput)) return { ok: false, field: 'residentContact', message: '입주민 성함과 연락처를 함께 입력해 주세요.' };
    const value = buildCreatePayload(data, 'validation');
    const required = [
      ['unit', value.unit, '동·호수를 입력해 주세요.'], ['location', value.location, '발생 위치를 입력해 주세요.'],
      ['description', value.description, '증상을 입력해 주세요.'], ['officeContactName', value.officeContact.name, '관리사무소 담당자 이름을 입력해 주세요.'],
      ['officeContactPhone', value.officeContact.phone, '관리사무소 연락처를 확인해 주세요.'],
    ];
    for (const [field, fieldValue, message] of required) if (!fieldValue) return { ok: false, field, message };
    if (!ISSUE_TYPES.includes(value.issueType)) return { ok: false, field: 'issueType', message: '문제 유형을 선택해 주세요.' };
    if (!PIPE_TYPES.includes(value.pipeType)) return { ok: false, field: 'pipeType', message: '배관 유형을 선택해 주세요.' };
    if (residentName && !value.residentContact) return { ok: false, field: 'residentContact', message: '입주민 연락처를 확인해 주세요.' };
    // 입주민 연락처는 본인이 아닌 직원이 적는 제3자 정보다. 직원이 입주민에게 연락
    // 목적을 알리고 동의를 받았다는 확인 없이는 받지 않는다. 이 확인은 화면에서만
    // 막고 전송 본문(buildCreatePayload)에는 싣지 않는다 — 서버 계약 불변.
    if (value.residentContact && data.residentInformed !== true) return { ok: false, field: 'residentInformed', message: '입주민에게 연락 목적을 알리고 동의를 받았는지 확인해 주세요.' };
    if (!value.privacyConsent) return { ok: false, field: 'privacyConsent', message: '개인정보 수집·이용에 동의해 주세요.' };
    return { ok: true, field: null, message: '' };
  }
  function statusLabel(status) { return STATUS_LABELS[status] || '확인 중'; }
  function needsInfoLabel(reason) { const value = text(reason, 301); return value.length <= 300 ? value : ''; }
  function canonicalRequestId(item) {
    const primary = item && typeof item.requestId === 'string' ? item.requestId.trim() : '';
    const fallback = item && typeof item.id === 'string' ? item.id.trim() : '';
    const id = primary || fallback;
    return id.length > 0 && id.length <= 120 ? id : '';
  }
  function validUpdatedAt(value, validationNow) {
    if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value.trim())) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed <= validationNow ? parsed : null;
  }
  function normalizeRecentList(rows, validationNow) {
    if (!Array.isArray(rows) || !Number.isFinite(validationNow)) return { ok: false, rows: [], snapshot: [] };
    if (rows.length === 0) return { ok: true, rows: [], snapshot: [] };
    const chosen = new Map();
    rows.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return;
      const requestId = canonicalRequestId(row);
      const status = typeof row.status === 'string' && CONTRACTED_STATUSES.has(row.status) ? row.status : '';
      if (!requestId || !status) return;
      const updatedAtMs = validUpdatedAt(row.updatedAt, validationNow);
      const candidate = { index, row, snapshot: { requestId, status, updatedAtMs } };
      const current = chosen.get(requestId);
      if (!current || (updatedAtMs !== null && (current.snapshot.updatedAtMs === null || updatedAtMs > current.snapshot.updatedAtMs))) {
        chosen.set(requestId, candidate);
      }
    });
    if (!chosen.size) return { ok: false, rows: [], snapshot: [] };
    const selected = [...chosen.values()].sort((left, right) => left.index - right.index);
    return { ok: true, rows: selected.map((entry) => entry.row), snapshot: selected.map((entry) => entry.snapshot) };
  }
  function diffRecentSnapshots(previous, current) {
    if (!Array.isArray(current) || previous === null) return { total: 0, changes: [] };
    const before = new Map((Array.isArray(previous) ? previous : []).map((entry) => [entry.requestId, entry]));
    const detected = [];
    current.forEach((entry, order) => {
      const prior = before.get(entry.requestId);
      let kind = '';
      if (!prior) kind = 'appeared';
      else if (prior.status !== entry.status) kind = 'status';
      else if (prior.updatedAtMs !== null && entry.updatedAtMs !== null && entry.updatedAtMs > prior.updatedAtMs) kind = 'updated';
      if (kind) detected.push({ requestId: entry.requestId, kind, status: entry.status, updatedAtMs: entry.updatedAtMs, order });
    });
    detected.sort((left, right) => {
      const leftTime = left.updatedAtMs === null ? Number.NEGATIVE_INFINITY : left.updatedAtMs;
      const rightTime = right.updatedAtMs === null ? Number.NEGATIVE_INFINITY : right.updatedAtMs;
      return rightTime - leftTime || left.order - right.order;
    });
    return {
      total: detected.length,
      changes: detected.slice(0, 10).map(({ order, ...entry }) => entry),
    };
  }
  function recentChangeLabel(change) {
    if (!change || typeof change !== 'object') return '변경 확인';
    if (change.kind === 'appeared') return '이번 새로고침에서 새로 확인';
    if (change.kind === 'updated') return '내용 갱신';
    return RECENT_LABELS[change.status] || statusLabel(change.status);
  }
  return {
    normalizePhone, parseOfficeSlug, parseOfficeEntry, validateLogin, validateRequest, buildCreatePayload,
    statusLabel, needsInfoLabel, normalizeRecentList, diffRecentSnapshots, recentChangeLabel,
  };
});
