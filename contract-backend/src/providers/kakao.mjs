// 메시지 발송 Provider 추상화.
//
// 스펙 핵심 제약:
//   * 카카오 알림톡 자체를 전자서명/본인확인 수단으로 간주하지 않는다.
//     → Provider 는 "메시지 배달"만 책임진다. 서명·본인확인은 서버(service.mjs)가 한다.
//   * 설계 승인 전에는 실제 고객에게 운영 메시지를 발송하지 않는다.
//     → 기본 구현은 MockKakaoMessageProvider. 실제 발송은 어디에도 없다.
//   * "전달완료"와 "본인열람"은 다른 사건 → Provider 는 전달완료까지만 보고한다.

/**
 * @typedef {Object} SendRequest
 * @property {string} toPhoneMasked  마스킹된 수신번호(로그/표시용)
 * @property {string} toPhoneHash    HMAC 해시(대조용, 원문 아님)
 * @property {string} templateKey
 * @property {Object} variables      치환자 (#{name} 등)
 * @property {Array}  [buttons]
 *
 * @typedef {Object} SendResult
 * @property {string} providerMsgId
 * @property {'QUEUED'|'SENT'|'FAILED'} status
 * @property {string} [failedReason]
 */

// 실제 Provider(Solapi/NHN Cloud 등)를 붙일 때 구현해야 할 계약.
export class KakaoMessageProvider {
  get name() { return 'abstract'; }
  /** @param {SendRequest} _req @returns {Promise<SendResult>} */
  async send(_req) { throw new Error('not implemented'); }
  /** 자유문구 문자(SMS/LMS) 발송. 템플릿 없는 통지(작업지시·공지)용.
   * @param {{toPhoneRaw:string,toPhoneHash?:string,text:string}} _req @returns {Promise<SendResult>} */
  async sendText(_req) { throw new Error('not implemented'); }
  /** 전달상태 폴링(웹훅 대체). @returns {Promise<{status:string, deliveredAt?:string}>} */
  async queryStatus(_providerMsgId) { throw new Error('not implemented'); }
}

// 검증용 Mock. 실제 네트워크 호출 없음. 결정적 ID/상태를 반환한다.
// deliverAfterMs 이후 상태를 DELIVERED 로 승격(단말 전달완료 시뮬레이션).
export class MockKakaoMessageProvider extends KakaoMessageProvider {
  constructor({ clock, deliverAfterMs = 0, failPhoneHashes = [] } = {}) {
    super();
    this._clock = clock || (() => new Date().toISOString());
    this._deliverAfterMs = deliverAfterMs;
    this._failSet = new Set(failPhoneHashes);   // 특정 번호는 실패로 시뮬레이션
    this._store = new Map();                      // providerMsgId -> {status, deliveredAt}
    this._seq = 0;
  }

  get name() { return 'mock'; }

  async send(req) {
    // 실패 시나리오(수신거부/차단 등) 시뮬레이션.
    if (this._failSet.has(req.toPhoneHash)) {
      return { providerMsgId: null, status: 'FAILED', failedReason: 'MOCK_RECIPIENT_BLOCKED' };
    }
    const id = `mock-${++this._seq}`;
    // 전달완료 예약: deliverAfterMs=0 이면 즉시 DELIVERED 로 조회 가능.
    this._store.set(id, {
      status: this._deliverAfterMs === 0 ? 'DELIVERED' : 'SENT',
      deliveredAt: this._deliverAfterMs === 0 ? this._clock() : null,
      _deliverAt: Date.now() + this._deliverAfterMs,
    });
    return { providerMsgId: id, status: 'SENT' };
  }

  async sendText(req) {
    if (this._failSet.has(req.toPhoneHash)) {
      return { providerMsgId: null, status: 'FAILED', failedReason: 'MOCK_RECIPIENT_BLOCKED' };
    }
    if (!(req.text || '').trim()) return { providerMsgId: null, status: 'FAILED', failedReason: 'EMPTY_TEXT' };
    const id = `mock-sms-${++this._seq}`;
    this._store.set(id, { status: 'DELIVERED', deliveredAt: this._clock(), _deliverAt: Date.now() });
    return { providerMsgId: id, status: 'SENT' };
  }

  async queryStatus(providerMsgId) {
    const rec = this._store.get(providerMsgId);
    if (!rec) return { status: 'FAILED' };
    if (rec.status !== 'DELIVERED' && Date.now() >= rec._deliverAt) {
      rec.status = 'DELIVERED';
      rec.deliveredAt = this._clock();
    }
    return { status: rec.status, deliveredAt: rec.deliveredAt || undefined };
  }
}
