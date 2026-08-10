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

if (p.published !== false) fail.push('요금표 published 는 대표 확인 전 false 여야 한다');
if (JSON.stringify(amounts) !== JSON.stringify([400000, 570000, 650000, 650000, 830000])) fail.push('5단계 금액이 40/57/65/65/83만원과 다르다');
if (p.vatLabel !== '[대표 확인 필요: 부가세 포함/별도]') fail.push('부가세 방침을 지어내지 말고 대표 확인 필요 문구를 그대로 남겨야 한다');
if (p.noFindPromise !== '못 찾으면 탐지비 0원') fail.push('못 찾으면 탐지비 0원 문구가 요금표 데이터에 없다');
if (!/<section[^>]+id="leakPricing"[^>]+hidden/.test(html)) fail.push('요금표 화면 컴포넌트가 기본 hidden 이 아니다');
if (!/config\.published !== true/.test(main) || !/section\.hidden = false/.test(main)) fail.push('published:true 일 때만 여는 렌더 잠금이 없다');
if (!/\.leak-pricing\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css)) fail.push('hidden 요금표를 CSS가 확실히 숨기지 않는다');

if (fail.length) { fail.forEach((x) => console.error('FAIL  ' + x)); process.exit(1); }
console.log('PASS  누수탐지 요금 5단계 준비 완료 · published:false · 부가세 대표 확인 대기 · 화면 숨김');
