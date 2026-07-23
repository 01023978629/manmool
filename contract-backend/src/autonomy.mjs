// 자율 등급 엔진 — AI 운영 헌장 §3. 모든 운영 행동에 등급을 부여한다.
// 되돌리기 쉬운 건 AI가 알아서(AUTO/NOTIFY), 돈·법·물리가 걸리면 사람이 개입(APPROVE/HUMAN).
// 이 모듈은 '분류'만 한다 — 실제 실행/발송은 하지 않는다(정직한 경계).

export const TIERS = {
  AUTO: { key: 'AUTO', label: '자동', order: 0, desc: 'AI 단독 실행 (되돌리기 쉬움)', needsApproval: false, humanOnly: false },
  NOTIFY: { key: 'NOTIFY', label: '통보', order: 1, desc: 'AI 실행 + 사람에게 통보', needsApproval: false, humanOnly: false },
  APPROVE: { key: 'APPROVE', label: '승인', order: 2, desc: 'AI 제안 → 대표 승인 후 실행', needsApproval: true, humanOnly: false },
  HUMAN: { key: 'HUMAN', label: '사람', order: 3, desc: '사람만 가능 (물리·법·돈)', needsApproval: true, humanOnly: true },
};

export const TIER_ORDER = ['AUTO', 'NOTIFY', 'APPROVE', 'HUMAN'];

// 행동 유형 → 등급. 헌장 §3 예시에 근거. 명시되지 않은 유형은 안전측으로 APPROVE(사람 승인) 기본.
export const ACTION_TIERS = {
  // AUTO — 되돌리기 쉬운 정리·초안
  morning_brief: 'AUTO',
  lead_followup_draft: 'AUTO',
  review_request_draft: 'AUTO',
  status_cleanup: 'AUTO',
  // NOTIFY — 정보성 통보(고객에게 '알림'만, 행동 요구 아님)
  progress_notify: 'NOTIFY',
  schedule_confirm: 'NOTIFY',
  material_order_list: 'NOTIFY',
  // APPROVE — 돈·계약·고객에게 '행동 요구'가 걸려 대표 승인 필요
  //  (서명 리마인드·독촉·청구는 고객에게 무언가를 하라고 요구 → 정보성 알림보다 상위 게이트)
  sign_reminder: 'APPROVE',
  sign_link_send: 'APPROVE',
  payment_invoice: 'APPROVE',
  payment_remind: 'APPROVE',
  estimate_send: 'APPROVE',
  contract_finalize: 'APPROVE',
  expense_decision: 'APPROVE',
  // HUMAN — 사람만
  physical_work: 'HUMAN',
  legal_signature: 'HUMAN',
  bank_transfer: 'HUMAN',
  tax_filing: 'HUMAN',
};

// 행동 유형을 등급 정보로 분류. 미등록 유형은 HUMAN(가장 보수적) — 정체 모를 행동을
// AI가 승인만으로 실행하지 못하게 막고, 유형 등록을 강제한다(돈·법·물리 오분류 방지).
export function classify(actionType) {
  const key = ACTION_TIERS[actionType] || 'HUMAN';
  const tier = TIERS[key];
  return {
    action: actionType,
    tier: key,
    label: tier.label,
    desc: tier.desc,
    needsApproval: tier.needsApproval,
    humanOnly: tier.humanOnly,
    known: Object.prototype.hasOwnProperty.call(ACTION_TIERS, actionType),
  };
}

// 결정 목록을 등급별로 묶는다(AUTO/NOTIFY/APPROVE/HUMAN). 각 결정에 .tier 필요.
export function groupByTier(decisions) {
  const byTier = { AUTO: [], NOTIFY: [], APPROVE: [], HUMAN: [] };
  for (const d of decisions || []) {
    const t = d.tier && byTier[d.tier] ? d.tier : 'HUMAN'; // 알 수 없는 등급 → 가장 보수적
    byTier[t].push(d);
  }
  return byTier;
}
