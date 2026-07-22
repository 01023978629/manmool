// Provider 선택 — 환경변수로 Mock ↔ 실제(Solapi) 전환.
//
// 안전 게이트:
//   * 기본은 Mock(실제 발송 없음).
//   * ALIMTALK_LIVE=1 이 "명시적으로" 설정될 때만 실제 발송 Provider 를 쓴다.
//   * live 인데 자격증명/승인 템플릿이 하나라도 없으면 기동을 거부한다(fail-fast).
//   * 운영에서 실제 고객 발송은 "템플릿 카카오 승인 + 사장님 확인" 이후에만.
import { MockKakaoMessageProvider } from './kakao.mjs';
import { SolapiProvider } from './solapi.mjs';

export function selectProvider(env = process.env, deps = {}) {
  const live = env.ALIMTALK_LIVE === '1';
  if (!live) return { provider: new MockKakaoMessageProvider(deps), live: false, reason: 'ALIMTALK_LIVE 미설정 → Mock(실제 발송 없음)' };

  const cfg = {
    apiKey: env.SOLAPI_API_KEY,
    apiSecret: env.SOLAPI_API_SECRET,
    pfId: env.SOLAPI_PF_ID,
    sender: env.SOLAPI_SENDER,
    disableSmsFallback: env.SOLAPI_DISABLE_SMS === '1',
    templateIds: {
      contract_sign: env.SOLAPI_TEMPLATE_SIGN,
      contract_done: env.SOLAPI_TEMPLATE_DONE,
    },
  };
  const missing = [];
  for (const k of ['apiKey', 'apiSecret', 'pfId', 'sender']) if (!cfg[k]) missing.push(k);
  if (!cfg.templateIds.contract_sign) missing.push('SOLAPI_TEMPLATE_SIGN');
  if (missing.length) {
    throw new Error(`ALIMTALK_LIVE=1 인데 실제 발송 설정이 없습니다: ${missing.join(', ')} — 셋업(SETUP-ALIMTALK.md) 완료 후 다시 시도하세요.`);
  }
  return { provider: new SolapiProvider(cfg, deps), live: true, reason: 'Solapi 실제 발송 활성' };
}
