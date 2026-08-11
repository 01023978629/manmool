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

if (fail.length) { fail.forEach((x) => console.error('FAIL  ' + x)); process.exit(1); }
console.log('PASS  누수탐지 요금 5단계 공개 · 부가세 별도 · 공급가/VAT/합계 표시');
