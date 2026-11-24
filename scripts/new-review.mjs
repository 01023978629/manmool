#!/usr/bin/env node
/* 대표가 확인한 고객 후기를 data/site.json 의 reviews(정본)에 옮겨 적는다.
 *
 * 대문 후기 섹션은 reviews 가 비어 있지 않으면 바로 열린다(js/main.js renderReviews) — 즉 이 파일에
 * 넣는 순간 공개다. 그래서 동·호수·전화·이메일이 섞인 값은 거부한다(규칙 정본 js/pii-rules.js, 사본 금지).
 * 실제로 받은 후기만 옮겨 적는다. 지어내지 마라 — review.html 로 받은 메일을 그대로 쓰는 도구다.
 *
 * 사용:
 *   node scripts/new-review.mjs --rating 5 --name "김○○" --space "유성구 ○○아파트 · 욕실 리모델링" --text "…" [--date 2026-10-23] [--dry-run]
 * 끝나면 scripts/ensure-review-intake.mjs 와 ensure-promo-pages.mjs 를 돌려 공개 상태를 확인한다. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMITS = { name: [1, 20], space: [1, 60], text: [10, 600] };

/* 개인정보 판별 규칙은 js/pii-rules.js 하나만 쓴다. 고객명 규칙은 등록 화면 입력용이라 산문에 돌리면
   "김○○ 고객" 같은 표시 이름이 걸린다 — 배포 검사(site-integrity)와 같이 4종만 쓴다. */
const PII_RULES = (() => {
  const src = fs.readFileSync(path.join(DEFAULT_ROOT, 'js', 'pii-rules.js'), 'utf8');
  const sandbox = { window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(src + '\n;MANMUL_PII_RULES;', sandbox, { filename: 'js/pii-rules.js' });
  const rules = sandbox.MANMUL_PII_RULES;
  if (!Array.isArray(rules) || !rules.length) throw new Error('js/pii-rules.js 에서 규칙을 읽지 못했습니다');
  return Array.from(rules, (r) => [String(r[0]), r[1]]).filter((r) => r[0] !== '고객명');
})();

export function piiFindings(text) {
  const src = String(text || '');
  return [...new Set(PII_RULES.filter(([, pattern]) => pattern.test(src)).map(([name]) => name))];
}

/** 입력값을 공개 가능한 후기 한 건으로 만든다. 못 만들면 이유를 담아 throw. */
export function buildReview(values, today) {
  const v = values || {};
  const rating = Number(v.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('별점(--rating)은 1~5 정수여야 합니다');
  const out = { rating };
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = String(v[key] == null ? '' : v[key]).replace(/\s+/g, ' ').trim();
    if (value.length < min) throw new Error(`--${key} 가 비었거나 너무 짧습니다(최소 ${min}자)`);
    if (value.length > max) throw new Error(`--${key} 가 너무 깁니다(최대 ${max}자)`);
    out[key] = value;
  }
  const date = String(v.date || today || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date 는 YYYY-MM-DD 형식이어야 합니다');
  out.date = date;
  const findings = piiFindings([out.name, out.space, out.text].join('\n'));
  if (findings.length) throw new Error('개인정보로 보이는 값이 있어 거부했습니다: ' + findings.join(', ') + ' — 동·호수·전화·이메일을 빼고 다시 넣으세요');
  return out;
}

/** reviews 맨 앞에 넣는다(최신이 먼저). site.json 은 2칸 들여쓰기 정본이라 그대로 다시 쓴다. */
export function appendReview(sitePath, review) {
  const raw = fs.readFileSync(sitePath, 'utf8');
  const site = JSON.parse(raw);
  if (!Array.isArray(site.reviews)) site.reviews = [];
  if (site.reviews.some((r) => r && r.text === review.text)) throw new Error('같은 본문의 후기가 이미 있습니다');
  site.reviews.unshift(review);
  fs.writeFileSync(sitePath, JSON.stringify(site, null, 2) + '\n');
  return site.reviews.length;
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error('알 수 없는 인자: ' + arg);
    const key = arg.slice(2);
    if (key === 'dry-run') { values.dryRun = true; continue; }
    if (!['rating', 'name', 'space', 'text', 'date'].includes(key)) throw new Error('알 수 없는 옵션: --' + key);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--' + key + ' 값이 비었습니다');
    values[key] = argv[++i];
  }
  return values;
}

export function main(argv, root = DEFAULT_ROOT) {
  const values = parseArgs(argv);
  const review = buildReview(values);
  if (values.dryRun) {
    console.log(JSON.stringify(review, null, 2));
    return review;
  }
  const count = appendReview(path.join(root, 'data', 'site.json'), review);
  console.log(`✓ 후기 추가 — data/site.json reviews ${count}건 (맨 앞에 ${review.date} · ${review.name} · ${'★'.repeat(review.rating)})`);
  console.log('  다음: node scripts/ensure-review-intake.mjs && node scripts/ensure-promo-pages.mjs — 통과하면 브랜치 → PR → 병합(대표 승인)');
  return review;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error('✗ ' + err.message);
    process.exit(1);
  }
}
