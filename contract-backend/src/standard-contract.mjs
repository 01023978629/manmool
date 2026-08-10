/* 만물인테리어 표준 도급계약 — 조항·지급조건의 단일 출처.
 *
 * 조항 문구를 현장 앱에도 복사해 두면 두 곳이 갈라진다. 그래서 앱은 현장·금액·고객만 보내고
 * 본문은 서버가 여기서 만든다. 조항을 고칠 일이 생기면 이 파일 하나만 고치면 된다.
 *
 * 값의 출처: 사장님(전병덕)이 직접 확정한 조건이다.
 *   · 지급     계약금 50%(작업금액 확정·자재구매 자금) / 중도금 40% / 잔금 10%(하자 마무리)
 *   · 하자보증  방수 관련 2년 / 보수 및 일반공사 1년
 *   · 추가공사  별도 계약서를 제출해 이행. 서비스로 요청받아 해준 작업은 보증 대상 아님
 *   · 공정 동의 절차별 3일. 회신이 없으면 유선으로 재확인하고 작업 사진으로 승인 간주
 *   · 분쟁     하자보증 사유에 한해 잔금 유보 가능. 그 외 미지급분은 법정이율 적용
 *
 * ※ 이 파일은 법률 자문이 아니다. 아래 buildStandardBody 주석의 [검토요망] 표시가 붙은 조항은
 *   고객에게 불리하게 읽힐 수 있어, 실제 사용 전 전문가 검토를 권한다.
 */

/** 지급 비율 — 합이 1이어야 한다(아래 assert 로 강제). */
export const PAYMENT_RATIO = { down: 0.5, mid: 0.4, bal: 0.1 };

/** 하자보증 기간(개월) — 준공일 기준. */
export const WARRANTY = [
  { name: '방수 관련', months: 24 },
  { name: '보수 및 일반공사', months: 12 },
];

export const WARRANTY_LABEL = '방수 관련 2년 · 보수 및 일반공사 1년';

/** 공정 동의 대기일 — 이 기간 안에 회신이 없으면 유선 재확인 절차로 넘어간다. */
export const CONSENT_WAIT_DAYS = 3;

const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const pct = (r) => Math.round(r * 100);

/** 계약금액을 계약금·중도금·잔금으로 나눈다. 반올림 오차는 잔금에서 흡수해 합계가 정확히 맞는다. */
export function splitPayment(amount) {
  const total = Math.round(Number(amount) || 0);
  const down = Math.round(total * PAYMENT_RATIO.down);
  const mid = Math.round(total * PAYMENT_RATIO.mid);
  const bal = total - down - mid;          // 나머지 전부 → down+mid+bal === total 보장
  return { down, mid, bal, total };
}

/**
 * 표준 계약 본문을 만든다.
 * @param {object} o
 * @param {string} o.site          현장 (예: '대전 중구 석교동 ○○아파트 101동 101호')
 * @param {string|string[]} o.scope 공사 범위(공정 배열도 허용)
 * @param {number} o.amount        총 계약금액(원)
 * @param {boolean} o.vatIncluded  계약금액에 부가세가 포함돼 있는가
 * @param {string} o.customerName  고객(갑) 성명
 * @param {string} [o.period]      공사기간 문구
 * @param {object} [o.operator]    { co, rep, bizNo, tel }
 */
export function buildStandardBody(o = {}) {
  const site = String(o.site || '').trim();
  const scope = Array.isArray(o.scope) ? o.scope.filter(Boolean).join(' · ') : String(o.scope || '').trim();
  const amount = Math.round(Number(o.amount) || 0);
  const vatIncluded = o.vatIncluded === true;       // 대표 결정: 명시 안 하면 '별도'로 본다
  const customerName = String(o.customerName || '').trim();
  const period = String(o.period || '').trim();
  const pay = splitPayment(amount);
  const vatLabel = vatIncluded ? '부가세 포함' : '부가세 별도';
  const opr = Object.assign({ co: '만물인테리어', rep: '전병덕', bizNo: '895-48-01132', tel: '010-2397-8629' }, o.operator || {});

  const clauses = [
    { no: 1, title: '공사의 내용',
      text: `도급인(이하 "갑")과 수급인 ${opr.co}(이하 "을")은 표기 현장(${site || '별첨 견적서 기재 현장'})의 ${scope || '별첨 견적서 기재 공사'}에 관하여 아래와 같이 공사도급계약을 체결한다. 공사의 구체적 범위·자재 사양·수량은 별첨 견적서에 따른다.` },

    { no: 2, title: '계약금액',
      text: `총 계약금액은 금 ${won(amount)}원(${vatLabel})으로 한다.` },

    { no: 3, title: '대금의 지급',
      text: `갑은 다음과 같이 을에게 지급한다.\n`
        + `① 계약금 ${won(pay.down)}원(${pct(PAYMENT_RATIO.down)}%) — 계약 체결로 공사금액을 확정하고 자재를 구매하기 위한 대금으로, 계약 체결 시 지급한다.\n`
        + `② 중도금 ${won(pay.mid)}원(${pct(PAYMENT_RATIO.mid)}%) — 주요 공정 완료를 갑이 확인한 때 지급한다.\n`
        + `③ 잔금 ${won(pay.bal)}원(${pct(PAYMENT_RATIO.bal)}%) — 준공 및 하자 마무리 확인 후 지급한다.\n`
        + `지급 계좌는 을이 지정하여 갑에게 통지한 계좌로 한다.` },

    { no: 4, title: '공사기간',
      text: `공사기간은 ${period || '별도 협의하여 정한다'}. 천재지변, 민원, 갑의 자재 선정 지연 또는 현장 출입 불가 등 을의 책임 없는 사유로 공사가 지연된 경우 그 기간만큼 공사기간은 연장된다.` },

    { no: 5, title: '공정별 확인과 동의',
      // [검토요망] 회신이 없을 때 승인으로 보는 조항이다. 사장님 요청(절차별 3일·무회신 시 자동 승인)을
      // 그대로 두면 고객에게 일방적으로 불리하게 읽힐 수 있어, '통지 → 유선 재확인 → 기록 보관 → 간주'
      // 순서로 다듬었다. 분쟁에서 실제로 힘을 갖는 것은 '자동 승인'이라는 문구가 아니라 통지한 기록이다.
      text: `① 을은 각 공정을 진행하기 전 그 내용을 갑에게 서면(문자·카카오톡 등 전자적 방법을 포함한다)으로 통지한다.\n`
        + `② 갑은 통지를 받은 날부터 ${CONSENT_WAIT_DAYS}일 이내에 동의 여부를 회신한다.\n`
        + `③ 위 기간 내 회신이 없는 경우 을은 갑에게 유선으로 연락하여 동의 여부를 다시 확인하며, 이때의 구두 동의는 서면 동의와 같은 효력을 가진다.\n`
        + `④ 유선 연락으로도 회신을 받지 못한 경우, 을은 해당 공정의 작업 사진을 갑에게 전송하고 갑이 이에 대하여 이의를 제기하지 아니하면 그 공정에 동의한 것으로 본다.\n`
        + `⑤ 을은 위 각 단계의 통지·연락·사진 전송 기록을 보관하며, 갑이 이의를 제기하는 경우 을은 해당 공정을 즉시 중단하고 갑과 협의한다.` },

    { no: 6, title: '추가·변경 공사',
      text: `① 공사 중 추가 또는 변경이 필요한 경우 을은 그 내용과 금액을 갑에게 통지하고, 갑과 별도의 추가공사 계약서를 작성한 후 시공한다.\n`
        + `② 갑의 동의 없이 추가 비용을 청구하지 아니한다.\n`
        + `③ 별도 계약 없이 갑의 요청에 따라 을이 서비스로 시공한 작업은 제7조의 하자보증 대상에서 제외한다.` },

    { no: 7, title: '하자보증',
      text: `① 을은 준공일부터 방수 관련 공사는 2년, 보수 및 일반공사는 1년 동안 하자보수 책임을 진다.\n`
        + `② 통상의 마모, 갑 또는 제3자의 사용상 과실, 갑이 지급한 자재의 하자, 타 업체가 시공한 부분, 제6조 제3항의 서비스 작업은 보증 범위에서 제외한다.\n`
        + `③ 갑은 하자를 발견한 때 을에게 통지하고, 을은 통지를 받은 후 지체 없이 보수한다.` },

    { no: 8, title: '잔금과 하자보수의 관계',
      // [검토요망] 잔금 유보 사유를 하자보증 관련으로 한정하는 조항이다.
      text: `① 갑은 제7조의 하자보수가 완료되지 아니한 경우에 한하여 그 하자에 상응하는 범위에서 잔금의 지급을 유보할 수 있다.\n`
        + `② 그 밖의 사유로 대금 지급이 지연된 경우 갑은 지연된 금액에 대하여 지급기일 다음 날부터 완제일까지 법정이율에 따른 지연이자를 지급한다.` },

    { no: 9, title: '지체상금',
      text: `을의 귀책사유로 준공이 지연된 경우 을은 지연 1일당 계약금액의 0.1%를 지체상금으로 갑에게 지급한다. 다만 제4조 단서에 해당하는 기간은 지연일수에서 제외한다.` },

    { no: 10, title: '안전 및 민원',
      text: `을은 공사 중 안전관리와 현장 청결을 유지하고, 해당 건물의 관리규약을 준수하며, 인접 세대의 민원이 발생한 경우 갑과 협의하여 대응한다.\n`
        + `을의 통상 과실로 발생한 재산상 손해배상책임은 사고당 금 15,000,000원을 한도로 한다. `
        + `다만 을의 고의·중대한 과실, 생명·신체 손해, 법령상 제한할 수 없는 책임은 이 한도에서 제외한다. `
        + `완성작업위험 등 보험 가입 및 보장 여부는 견적서 또는 특약에 별도로 표시한다.` },

    { no: 11, title: '전자계약의 성립',
      text: `본 계약은 전자문서로 작성되며, 갑의 본인확인·전자서명·동의기록 및 문서해시로 그 성립과 내용을 증명한다. 양 당사자는 전자적 방법에 의한 계약 체결에 동의한다.` },

    { no: 12, title: '계약의 해제와 분쟁',
      text: `① 당사자 일방이 계약상 의무를 이행하지 아니하는 경우 상대방은 상당한 기간을 정하여 이행을 최고하고, 그 기간 내에 이행이 없으면 계약을 해제할 수 있다.\n`
        + `② 본 계약과 관련한 분쟁은 본 계약서의 내용을 기준으로 상호 협의하여 해결하되, 협의가 이루어지지 아니한 경우 관할 법원에 소를 제기할 수 있다.\n`
        + `③ 본 계약에 정하지 아니한 사항은 관련 법령과 거래 관행에 따른다.` },
  ];

  return {
    site, scope, amount, vatIncluded, customerName, period,
    payment: { down: pay.down, mid: pay.mid, bal: pay.bal },
    paymentRatio: { down: PAYMENT_RATIO.down, mid: PAYMENT_RATIO.mid, bal: PAYMENT_RATIO.bal },
    warranty: WARRANTY_LABEL, warrantyItems: WARRANTY,
    operator: opr,
    clauses,
    note: '본 계약서는 당사자 확인용이며 법률 자문이 아닙니다.',
  };
}

/**
 * 잠그기 전 본문이 계약서라 부를 만한지 검사한다.
 * 조항 0줄·지급조건 0원짜리 문서에 고객이 서명하는 일을 서버에서 막는다.
 * @returns {string[]} 문제 목록(비어 있으면 통과)
 */
export function validateBody(body, amount) {
  const b = body || {};
  const bad = [];
  // 조항은 {no,title,text} 객체가 표준이지만, 문자열 한 줄로 들어오는 본문도 있어 둘 다 인정한다
  // (서명 화면도 두 형태를 모두 렌더한다). 막으려는 건 '조항이 아예 없는 계약서'다.
  const clauseText = (c) => (typeof c === 'string' ? c : String((c && c.text) || ''));
  if (!Array.isArray(b.clauses) || b.clauses.length === 0) bad.push('계약 조항이 없습니다');
  else if (b.clauses.some((c) => !clauseText(c).trim())) bad.push('내용이 빈 조항이 있습니다');
  if (!String(b.customerName || '').trim()) bad.push('고객(갑) 성명이 없습니다');
  const p = b.payment || {};
  const sum = (Number(p.down) || 0) + (Number(p.mid) || 0) + (Number(p.bal) || 0);
  const total = Math.round(Number(amount) || 0);
  if (sum <= 0) bad.push('대금 지급 조건이 없습니다');
  else if (total > 0 && sum !== total) bad.push(`지급 조건 합계(${won(sum)}원)가 계약금액(${won(total)}원)과 다릅니다`);
  return bad;
}

// 비율 합이 1이 아니면 기동 시점에 바로 알아채야 한다(조용히 금액이 어긋나는 것보다 낫다)
{
  const s = PAYMENT_RATIO.down + PAYMENT_RATIO.mid + PAYMENT_RATIO.bal;
  if (Math.abs(s - 1) > 1e-9) throw new Error(`PAYMENT_RATIO 합이 1이 아닙니다: ${s}`);
}
