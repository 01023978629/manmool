import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const p = site.leakPricing || {};
const fail = [];
const amounts = (p.tiers || []).map((x) => Number(x.amount));

if (p.published !== true) fail.push('확정된 요금표 published 는 true 여야 한다');
if (JSON.stringify(amounts) !== JSON.stringify([400000, 570000, 650000, 650000, 830000])) fail.push('5단계 금액이 40/57/65/65/83만원과 다르다');
if (p.vatLabel !== '부가세 별도' || Number(p.vatRate) !== 0.1) fail.push('부가세 별도와 VAT 10%가 확정값으로 저장되지 않았다');
if (p.noFindPromise !== '못 찾으면 탐지비 0원') fail.push('못 찾으면 탐지비 0원 문구가 요금표 데이터에 없다');
if (!/<section[^>]+id="leakPricing"[^>]+hidden/.test(html)) fail.push('요금표 화면 컴포넌트가 기본 hidden 이 아니다');
if (!/config\.published !== true/.test(main) || !/section\.hidden = false/.test(main)) fail.push('published:true 일 때만 여는 렌더 잠금이 없다');
// 라벨 'VAT 10%' 리터럴을 못박았더니 세율 연동 라벨(도메인 검토 A-6:
// 계산은 vatRate 를 따르는데 라벨만 10% 고정이면 어긋난 화면이 나간다)과
// 충돌했다. 의도는 리터럴이 아니라 "세 값을 함께 + 라벨이 세율에서 파생"이다.
if (!/공급가/.test(main) || !/VAT \$\{vatPct\}%|VAT 10%/.test(main) || !/합계/.test(main)) fail.push('각 단계에 공급가·VAT·합계를 함께 표시하지 않는다');
if (/VAT \$\{vatPct\}%/.test(main) && !/vatPct = Math.round\(vatRate \* 100\)/.test(main)) fail.push('VAT 라벨이 vatRate 에서 파생되지 않는다 — 세율이 바뀌면 라벨과 금액이 어긋난다');
if (!/\.leak-pricing\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css)) fail.push('hidden 요금표를 CSS가 확실히 숨기지 않는다');

/* ── leak.html 범위 공개 (대표 결정 2026-10-23: 단계별 표는 숨기고 최소~최대 범위만 공개) ──
   숫자가 손으로 적혀 있으므로 site.json 과 어긋나는 순간 여기서 막는다. 화면(#leakFeeRange)·FAQ·
   검색엔진용 구조화 데이터(AggregateOffer) 세 곳이 같은 범위를 말해야 한다. */
const leak = fs.readFileSync(path.join(ROOT, 'leak.html'), 'utf8');
const minAmount = Math.min(...amounts);
const maxAmount = Math.max(...amounts);
const man = (n) => `${n / 10000}만`;
const rangeText = `${man(minAmount)}~${man(maxAmount)}원`;
const rangeBlock = /<p([^>]*)\bid="leakFeeRange"([^>]*)>([\s\S]*?)<\/p>/.exec(leak);
if (p.published === true) {
  if (!rangeBlock) fail.push('leak.html 에 탐지비 범위 안내(#leakFeeRange)가 없다 — published:true 인데 공개 화면 어디에도 금액이 없다');
  else {
    const text = rangeBlock[3].replace(/<[^>]+>/g, '');
    if (!text.includes(rangeText)) fail.push(`leak.html 탐지비 범위가 site.json 단계 최소~최대(${rangeText})와 다르다`);
    if (!/부가세 별도/.test(text)) fail.push('leak.html 탐지비 범위에 부가세 별도 표기가 없다');
    if (/\bhidden\b/.test(rangeBlock[1] + rangeBlock[2])) fail.push('#leakFeeRange 가 hidden 이다 — 범위 공개 결정과 다르다');
  }
  const faqAnswer = (leak.split('누수 탐지 비용은 얼마인가요')[1] || '').split('</details>')[0];
  if (!faqAnswer.includes(rangeText)) fail.push('leak.html FAQ 비용 답변에 탐지비 범위가 없다');
} else if (rangeBlock) {
  fail.push('leakPricing.published 가 false 인데 leak.html 에 탐지비 범위가 공개돼 있다');
}
for (const amount of amounts.filter((x) => x !== minAmount && x !== maxAmount)) {
  if (leak.includes(`${man(amount)}원`) || leak.includes(amount.toLocaleString('ko-KR'))) fail.push(`leak.html 에 중간 단계 금액(${man(amount)}원)이 노출됐다 — 2026-10-23 결정은 범위만 공개다`);
}
if (/leakPricingTiers|leak-price-grid/.test(leak)) fail.push('leak.html 에 단계별 요금표 컴포넌트가 있다 — 2026-10-23 결정은 범위만 공개다');
const ldNodes = [...leak.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((m) => { try { const d = JSON.parse(m[1]); return d['@graph'] || [d]; } catch (e) { fail.push('leak.html JSON-LD 를 파싱할 수 없다: ' + e.message); return []; } });
const service = ldNodes.find((n) => n && n['@type'] === 'Service');
const offers = service && service.offers;
if (p.published === true) {
  if (!offers || offers['@type'] !== 'AggregateOffer') fail.push('leak.html Service 구조화 데이터에 탐지비 범위(AggregateOffer)가 없다');
  else {
    if (Number(offers.lowPrice) !== minAmount || Number(offers.highPrice) !== maxAmount) fail.push(`AggregateOffer 가 ${offers.lowPrice}~${offers.highPrice} 인데 site.json 은 ${minAmount}~${maxAmount} 다 — 화면과 검색결과가 다른 금액을 말한다`);
    if (offers.priceCurrency !== 'KRW') fail.push('AggregateOffer priceCurrency 가 KRW 가 아니다');
    if (!(offers.priceSpecification && offers.priceSpecification.valueAddedTaxIncluded === false)) fail.push('AggregateOffer 에 부가세 별도(valueAddedTaxIncluded:false)가 없다 — 화면은 별도인데 검색결과는 포함으로 읽힌다');
  }
} else if (offers) {
  fail.push('leakPricing.published 가 false 인데 구조화 데이터에 탐지비 범위가 있다');
}

if (fail.length) { fail.forEach((x) => console.error('FAIL  ' + x)); process.exit(1); }
console.log(`PASS  누수탐지 요금 5단계 확정 · 대문 숨김 · leak.html 은 범위(${rangeText}, 부가세 별도)만 공개 · 구조화 데이터 동일`);
