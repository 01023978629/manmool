#!/usr/bin/env node
/* 대표가 확인한 고객 후기를 data/site.json 의 reviews(정본)에 옮겨 적는다.
 *
 * 대문 후기 섹션은 reviews 가 비어 있지 않으면 바로 열린다(js/main.js renderReviews) — 즉 이 파일에
 * 넣는 순간 공개다. 그래서 동·호수·전화·이메일이 섞인 값은 거부한다(규칙 정본 js/pii-rules.js, 사본 금지).
 * 실제로 받은 후기만 옮겨 적는다. 지어내지 마라 — review.html 로 받은 메일을 그대로 쓰는 도구다.
 *
 * 표시 이름은 성만 남기고 가린다(2026-11-25): 홍길동 → 홍○○, 김민 → 김○, "홍길동 고객님" → "홍○○ 고객님".
 * 후기 폼의 표시 이름 칸은 자유 글이라 손님이 실명을 그대로 적는다 — 예전 도구는 그 이름을 그대로 공개했다.
 * 이미 가린 이름(김○○)과 "고객" 은 그대로 둔다. 한글 이름 꼴이 아닌 값(닉네임·영문)은 가릴 방법이 없어 거부한다 —
 * 그때는 성을 알면 성+○○, 모르면 "고객" 으로 넣는다. 현장·본문에 같은 실명이 있으면 같이 가린다.
 * ensure-review-intake 가 site.json reviews 에 가리지 않은 이름이 들어가면 막는다(isMaskedDisplayName).
 *
 * --service 는 leak(누수·배관·방수) 또는 interior(인테리어) — 누수 페이지(leak.html) 후기 칸은 leak 만 보여 준다.
 * leak.html 후기 칸은 scripts/prerender-posts.py 가 site.json reviews 로 그리므로 넣은 뒤 그 생성기도 돌린다.
 *
 * 사용:
 *   node scripts/new-review.mjs --rating 5 --name "홍길동" --service interior --space "유성구 ○○아파트 · 욕실 리모델링" --text "…" [--date 2026-10-23] [--dry-run]
 * 끝나면 python3 scripts/prerender-posts.py 를 돌리고 scripts/ensure-review-intake.mjs 와 ensure-promo-pages.mjs 로 공개 상태를 확인한다. */
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

/* 공개해도 되는 표시 이름 꼴 — 성 한 글자 + ○ 1~3개(뒤에 '고객'·'고객님'·'님' 허용) 또는 '고객'·'고객님'.
   ensure-review-intake 가 같은 함수로 site.json reviews 를 검사한다(규칙은 여기 한 곳). */
export const MASKED_NAME = /^(?:[가-힣]○{1,3}(?: ?(?:고객님|고객|님))?|고객님?)$/;
export const REVIEW_SERVICES = Object.freeze(['leak', 'interior']);

export function isMaskedDisplayName(name) {
  return MASKED_NAME.test(String(name == null ? '' : name));
}

/* 한글 이름(2~4자, 뒤에 고객·고객님·님)을 성+○ 로 바꾼다. 이미 가린 이름·'고객' 은 그대로.
   돌려주는 값: { name: 가린 이름, raw: 가리기 전 이름 글자(가렸을 때만) } */
export function maskDisplayName(value) {
  const name = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (isMaskedDisplayName(name)) return { name, raw: '' };
  const m = /^([가-힣]{2,4}?)(?: ?(고객님|고객|님))?$/.exec(name);
  if (!m || m[1] === '고객') {
    throw new Error('--name 은 한글 이름(예: 홍길동 → 홍○○ 로 가림)이나 이미 가린 이름(김○○), 또는 "고객" 만 넣을 수 있습니다 — 닉네임·영문은 성을 알면 성+○○, 모르면 "고객" 으로 넣으세요');
  }
  const core = m[1];
  const suffix = m[2] ? (m[2] === '님' ? '님' : ' ' + m[2]) : '';
  return { name: core[0] + '○'.repeat(core.length - 1) + suffix, raw: core };
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
  // 동·호수·전화·이메일은 가리기 전에 먼저 본다 — 이름 칸에 전화·이메일을 적은 경우 그 이유로 거부해야 대표가 알아듣는다.
  const findings = piiFindings([out.name, out.space, out.text].join('\n'));
  if (findings.length) throw new Error('개인정보로 보이는 값이 있어 거부했습니다: ' + findings.join(', ') + ' — 동·호수·전화·이메일을 빼고 다시 넣으세요');
  // 표시 이름은 성만 남긴다. 같은 실명이 현장·본문에 있으면 거기서도 가린다.
  const masked = maskDisplayName(out.name);
  if (masked.raw) {
    const hidden = masked.raw[0] + '○'.repeat(masked.raw.length - 1);
    out.space = out.space.split(masked.raw).join(hidden);
    out.text = out.text.split(masked.raw).join(hidden);
  }
  out.name = masked.name;
  const service = String(v.service == null ? '' : v.service).trim();
  if (!REVIEW_SERVICES.includes(service)) {
    throw new Error('--service 는 leak(누수·배관·방수) 또는 interior(인테리어) 중 하나여야 합니다 — 누수 페이지 후기 칸은 leak 만 보여 줍니다');
  }
  out.service = service;
  const date = String(v.date || today || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date 는 YYYY-MM-DD 형식이어야 합니다');
  out.date = date;
  return out;
}

/** reviews 맨 앞에 넣는다(최신이 먼저). site.json 은 2칸 들여쓰기 정본이라 그대로 다시 쓴다.
 *  줄끝은 원래 파일 것(CRLF/LF)을 지킨다 — 윈도우 작업본(CRLF)을 통째로 LF 로 바꾸지 않게. */
export function appendReview(sitePath, review) {
  const raw = fs.readFileSync(sitePath, 'utf8');
  const site = JSON.parse(raw);
  if (!Array.isArray(site.reviews)) site.reviews = [];
  if (site.reviews.some((r) => r && r.text === review.text)) throw new Error('같은 본문의 후기가 이미 있습니다');
  site.reviews.unshift(review);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(sitePath, (JSON.stringify(site, null, 2) + '\n').replace(/\n/g, eol));
  return site.reviews.length;
}

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error('알 수 없는 인자: ' + arg);
    const key = arg.slice(2);
    if (key === 'dry-run') { values.dryRun = true; continue; }
    if (!['rating', 'name', 'space', 'text', 'date', 'service'].includes(key)) throw new Error('알 수 없는 옵션: --' + key);
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
  console.log(`✓ 후기 추가 — data/site.json reviews ${count}건 (맨 앞에 ${review.date} · ${review.name} · ${review.service} · ${'★'.repeat(review.rating)})`);
  console.log('  다음: python3 scripts/prerender-posts.py (누수 페이지 후기 칸) → node scripts/ensure-review-intake.mjs && node scripts/ensure-promo-pages.mjs — 통과하면 브랜치 → PR → 병합(대표 승인)');
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
