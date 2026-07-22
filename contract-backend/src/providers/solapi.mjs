// 실제 알림톡 발송 Provider — 솔라피(Solapi) 연동.
//
// 중요(스펙 준수):
//   * 카카오는 "메시지 배달"만 한다. 본인확인·서명·증거는 서버(service.mjs)가 책임진다.
//   * 이 Provider 는 자격증명(API키/발신프로필/승인된 템플릿ID)이 모두 있을 때만 동작한다.
//   * 수신번호(원문)는 발송 시점에 메모리로만 받아 API 로 넘기고, 로그/DB엔 남기지 않는다.
//   * 알림톡 템플릿은 카카오 사전심사를 통과한 templateId 만 사용할 수 있다.
//
// 솔라피 인증(HMAC-SHA256):
//   signature = HMAC_SHA256(date + salt, apiSecret)
//   Authorization: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=...
import { createHmac, randomBytes } from 'node:crypto';
import { KakaoMessageProvider } from './kakao.mjs';

const API_BASE = 'https://api.solapi.com';

export class SolapiProvider extends KakaoMessageProvider {
  // cfg: { apiKey, apiSecret, pfId, sender, templateIds:{contract_sign,contract_done}, disableSmsFallback }
  // deps: { fetchImpl, clock, saltImpl } — 테스트에서 주입(실네트워크 없이 검증).
  constructor(cfg = {}, deps = {}) {
    super();
    this.cfg = cfg;
    this._fetch = deps.fetchImpl || globalThis.fetch;
    this._clock = deps.clock || (() => new Date().toISOString());
    this._salt = deps.saltImpl || (() => randomBytes(16).toString('hex'));
    this._assertConfig();
  }

  get name() { return 'solapi'; }

  _assertConfig() {
    for (const k of ['apiKey', 'apiSecret', 'pfId', 'sender']) {
      if (!this.cfg[k]) throw new Error(`SolapiProvider: 설정 누락 — ${k}`);
    }
    if (!this.cfg.templateIds || Object.keys(this.cfg.templateIds).length === 0) {
      throw new Error('SolapiProvider: 승인된 templateIds 가 필요합니다.');
    }
  }

  _authHeader() {
    const date = this._clock();
    const salt = this._salt();
    const signature = createHmac('sha256', this.cfg.apiSecret).update(date + salt).digest('hex');
    return `HMAC-SHA256 apiKey=${this.cfg.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  async send(req) {
    const to = (req.toPhoneRaw || '').replace(/\D/g, '');
    if (!to) return { providerMsgId: null, status: 'FAILED', failedReason: 'NO_RECIPIENT_RAW' };
    const templateId = (this.cfg.templateIds || {})[req.templateKey];
    if (!templateId) return { providerMsgId: null, status: 'FAILED', failedReason: `NO_APPROVED_TEMPLATE:${req.templateKey}` };

    // 알림톡 변수는 승인 템플릿의 치환자(#{...}) 키와 정확히 일치해야 한다.
    const variables = {};
    for (const [k, v] of Object.entries(req.variables || {})) {
      variables[k.startsWith('#{') ? k : `#{${k}}`] = String(v);
    }

    const payload = {
      message: {
        to, from: this.cfg.sender,
        // 실패 시 문자(대체발송) 여부: 기본은 대체발송 허용(disableSms=false).
        kakaoOptions: { pfId: this.cfg.pfId, templateId, variables, disableSms: !!this.cfg.disableSmsFallback },
      },
    };

    let res;
    try {
      res = await this._fetch(`${API_BASE}/messages/v4/send`, {
        method: 'POST',
        headers: { Authorization: this._authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { providerMsgId: null, status: 'FAILED', failedReason: `NETWORK:${e.message}` };
    }
    const data = await safeJson(res);
    // 솔라피 단건 성공은 statusCode '2000'(접수). 실제 전달은 비동기 → queryStatus 로 확인.
    if (res.ok && (data.statusCode === '2000' || data.statusCode === 2000) && (data.messageId || data.groupId)) {
      return { providerMsgId: data.messageId || data.groupId, status: 'SENT' };
    }
    return { providerMsgId: null, status: 'FAILED', failedReason: data.statusMessage || data.errorMessage || `HTTP_${res.status}` };
  }

  async queryStatus(providerMsgId) {
    let res;
    try {
      res = await this._fetch(`${API_BASE}/messages/v4/list?messageId=${encodeURIComponent(providerMsgId)}`, {
        headers: { Authorization: this._authHeader() },
      });
    } catch (e) {
      return { status: 'UNKNOWN' };
    }
    const data = await safeJson(res);
    const list = data.messageList || {};
    const rec = list[providerMsgId] || Object.values(list)[0];
    if (!rec) return { status: 'UNKNOWN' };
    // 솔라피 status: PENDING/SENDING/COMPLETE/FAILED 등. COMPLETE → 전달완료로 본다.
    const s = String(rec.status || '').toUpperCase();
    if (s === 'COMPLETE' || s === 'DELIVERED') return { status: 'DELIVERED', deliveredAt: rec.dateReceived || rec.dateUpdated };
    if (s === 'FAILED' || s === 'FAIL') return { status: 'FAILED' };
    return { status: 'SENT' };
  }
}

async function safeJson(res) { try { return await res.json(); } catch { return {}; } }
