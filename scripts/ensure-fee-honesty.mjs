/* ensure-fee-honesty.mjs — 공개 글의 '무료'는 조건형으로만 (AGENTS.md 🔴 6 · hyeonjang cost-honesty.check 와 같은 규칙)
 *
 * 2026-11-09 에 정보글 두 편(rainy-season-waterproof-check · bathroom-waterproof-signs)에
 * '점검과 방문 실측은 무료이니 …' 가 남아 있는 것을 찾았다. 사이트 FAQ 정본(data/site.json, index.html·leak.html 에
 * 같은 글)은 "인테리어 상담과 1차 방문 실측은 무료입니다. 누수탐지는 장비 탐지에 착수하는 시점부터 유료 …" 다.
 * 누수 글이 '점검이 무료'라고 말하면 손님은 장비 탐지까지 무료로 기대하고, 현장에서 탐지비를 들으면
 * 홈페이지가 거짓말을 했다고 느낀다. 그동안 글 본문의 이 문구를 보는 검사가 없어 1년 넘게 그대로 나갔다.
 *
 * 규칙(정본 data/site.json 과 생성물 posts/ 양쪽에 건다 — 생성물만 보면 정본을 고친 사람이 재생성을 잊었을 때 지나간다):
 *  ① 공개 글 어디에도 '점검(과|·)방문 실측(은|는)? 무료' 꼴의 조건 없는 문장은 없다.
 *  ② 누수 분야(service leak — prerender-posts.py article_service 와 같은 규칙) 공개 글의 문단에 '무료' 가 있으면
 *     같은 문단 안에 '유료' 경계가 함께 있어야 한다(FAQ 정본과 같은 꼴). 인테리어 글의 '무료 방문 실측' 은
 *     정본("인테리어 상담과 1차 방문 실측은 무료")과 같은 말이라 막지 않는다.
 *  ③ FAQ 정본 문장이 site.json 에 그대로 있다 — 정본이 바뀌면 두 글도 같이 고쳐야 하므로 여기서 멈춘다.
 *
 * 범위 밖(2026-11-09 현재 같은 문구가 남아 있어 대표 확인 뒤 넓힌다): bathroom-check.html · js/bathroom-check.js 의
 * '점검·방문 실측은 무료입니다' / '무료 방문 점검'. 루트 HTML 은 이 검사가 보지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fail = [];
const ok = [];
function check(cond, bad, good) { if (cond) ok.push(good); else fail.push(bad); }

// 조건 없는 '점검 무료' 문장. 띄어쓰기·연결 기호('과'·'·'·',')·조사 유무와 무관하게 잡는다.
const UNCONDITIONAL = /점검\s*(?:과|·|,|및)?\s*방문\s*실측\s*(?:은|는|이|도)?\s*무료/;
// 누수 글 문단의 '무료' 옆에 있어야 하는 유료 경계.
const PAID_BOUNDARY = /유료/;
// FAQ 정본 — 이 문장이 바뀌면 두 글의 괄호 문구도 같이 고쳐야 한다.
const FAQ_CANON = /인테리어 상담과 1차 방문 실측은 무료입니다\. 누수탐지는 장비 탐지에 착수하는 시점부터 유료/;

/* ⓪ 검사 자신의 눈 — 정규식이 잡아야 할 것과 놓아야 할 것 ----------------- */
// 이 블록이 떨어지면 아래 결과는 믿을 수 없다. 변이 검증 때 처음부터 확인한다.
for (const bad of ['점검과 방문 실측은 무료이니 사진 몇 장과', '점검·방문 실측은 무료입니다.', '점검·방문 실측 무료 — 확인만', '점검 및 방문 실측도 무료']) {
  check(UNCONDITIONAL.test(bad), `자가진단: 조건 없는 문장을 못 잡는다 — "${bad}"`, `자가진단: 잡음 "${bad.slice(0, 14)}…"`);
}
for (const good of ['1차 방문 실측은 무료이니(누수탐지는 장비 탐지에 착수하는 시점부터 유료) 사진 몇 장과', '무료 방문 실측에서 확정하는 순서']) {
  check(!UNCONDITIONAL.test(good), `자가진단: 조건형 문장을 잘못 잡는다 — "${good}"`, `자가진단: 놓음 "${good.slice(0, 14)}…"`);
}

/* 정본 읽기 ------------------------------------------------------------- */
const site = JSON.parse(read('data/site.json'));
const published = (Array.isArray(site.insights) ? site.insights : []).filter((a) => a && typeof a === 'object' && a.published !== false);
check(published.length > 0, 'data/site.json 에 공개 글이 하나도 없다', `공개 글 ${published.length}건 읽음`);
// prerender-posts.py article_service 와 같은 규칙 — service 키가 있으면 그 값, 없으면 category 로 하위 호환.
const isLeak = (a) => (Object.hasOwn(a, 'service') ? a.service === 'leak' : ['방수·설비', '누수탐지·수리'].includes(a.category));

/* ③ FAQ 정본이 그대로 있다 ---------------------------------------------- */
check(FAQ_CANON.test(JSON.stringify(site)),
  'data/site.json 에 FAQ 정본 문장("인테리어 상담과 1차 방문 실측은 무료입니다. 누수탐지는 장비 탐지에 착수하는 시점부터 유료 …")이 없다 — 정본을 고쳤으면 누수 글의 괄호 문구와 이 검사도 같이 고쳐라',
  'FAQ 정본 문장 존재');

/* 글 하나의 문단 목록 — 정본의 글자 단위(h·p·요약·상담·사진 설명). p 는 빈 줄로 나뉜 문단을 따로 센다 */
function paragraphsOf(a) {
  const out = [];
  const push = (label, value) => {
    if (typeof value !== 'string') return;
    for (const piece of value.replace(/\r\n?/g, '\n').split(/\n[\t ]*\n+/)) if (piece.trim()) out.push([label, piece]);
  };
  push('title', a.title); push('excerpt', a.excerpt); push('imageAlt', a.imageAlt);
  (Array.isArray(a.body) ? a.body : []).forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    push(`body[${i}].h`, s.h); push(`body[${i}].p`, s.p); push(`body[${i}].imgAlt`, s.imgAlt); push(`body[${i}].imgCaption`, s.imgCaption);
  });
  for (const [k, v] of Object.entries(a.caseSummary && typeof a.caseSummary === 'object' ? a.caseSummary : {})) push(`caseSummary.${k}`, v);
  for (const [k, v] of Object.entries(a.consultation && typeof a.consultation === 'object' ? a.consultation : {})) push(`consultation.${k}`, v);
  return out;
}

/* 생성물 posts/<slug>.html 의 본문 문단 — 태그를 벗기고 </p>·<br> 단위로 나눈다 */
function postParagraphs(slug) {
  const file = `posts/${slug}.html`;
  if (!fs.existsSync(path.join(ROOT, file))) return null;
  const html = read(file);
  const start = html.indexOf('<div class="post-body">');
  const end = html.indexOf('<div class="post-cta">', start);
  const body = start < 0 || end < 0 ? html : html.slice(start, end);
  const unescape = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return body.split(/<\/p>|<br\s*\/?>|<\/h2>|<\/figcaption>/).map((piece) => unescape(piece.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/* ①·② 정본 ------------------------------------------------------------- */
let unconditional = 0, unpaired = 0, leakFreeParagraphs = 0;
for (const a of published) {
  for (const [label, text] of paragraphsOf(a)) {
    if (UNCONDITIONAL.test(text)) { unconditional++; fail.push(`${a.slug} ${label}: 조건 없는 '점검·방문 실측 무료' 문장 — FAQ 정본대로 "1차 방문 실측은 무료이니(누수탐지는 장비 탐지에 착수하는 시점부터 유료)" 꼴로 고쳐라`); }
    if (isLeak(a) && /무료/.test(text)) {
      leakFreeParagraphs++;
      if (!PAID_BOUNDARY.test(text)) { unpaired++; fail.push(`${a.slug} ${label}: 누수 글 문단에 '무료'만 있고 '유료' 경계가 없다 — 누수탐지는 장비 착수부터 유료임을 같은 문단에 적어라`); }
    }
  }
}
check(unconditional === 0, `정본에 조건 없는 '점검·방문 실측 무료' 문장 ${unconditional}곳`, "정본: 조건 없는 '점검·방문 실측 무료' 문장 없음");
check(unpaired === 0, `정본 누수 글에 유료 경계 없는 '무료' 문단 ${unpaired}곳`, `정본: 누수 글의 '무료' 문단 ${leakFreeParagraphs}곳 모두 유료 경계 동반`);

/* ①·② 생성물 ----------------------------------------------------------- */
let postUnconditional = 0, postUnpaired = 0, postsSeen = 0, postsMissing = 0;
for (const a of published) {
  const pieces = postParagraphs(a.slug);
  if (pieces === null) { postsMissing++; continue; }
  postsSeen++;
  for (const text of pieces) {
    if (UNCONDITIONAL.test(text)) { postUnconditional++; fail.push(`posts/${a.slug}.html: 조건 없는 '점검·방문 실측 무료' 문장 — 정본을 고친 뒤 python3 scripts/prerender-posts.py 를 다시 돌려라`); }
    if (isLeak(a) && /무료/.test(text) && !PAID_BOUNDARY.test(text)) { postUnpaired++; fail.push(`posts/${a.slug}.html: 누수 글 문단에 '무료'만 있고 '유료' 경계가 없다`); }
  }
}
// 글이 빠진 것은 ensure-site-integrity 가 잡는다 — 여기서는 읽은 것만 센다.
check(postUnconditional === 0, `생성물에 조건 없는 '점검·방문 실측 무료' 문장 ${postUnconditional}곳`, `생성물 ${postsSeen}편: 조건 없는 문장 없음${postsMissing ? ` (${postsMissing}편은 파일 없음 — site-integrity 몫)` : ''}`);
check(postUnpaired === 0, `생성물 누수 글에 유료 경계 없는 '무료' 문단 ${postUnpaired}곳`, '생성물: 누수 글의 \'무료\' 문단 모두 유료 경계 동반');

console.log('\n===== 공개 글 요금 문구(무료 조건형) 검증 =====');
ok.forEach((m) => console.log('  ✓', m));
fail.forEach((m) => console.log('  ✗', m));
if (fail.length) {
  console.log(`\n${fail.length}건 실패 — 손님이 탐지비를 무료로 기대할 수 있는 상태입니다.`);
  process.exit(1);
}
console.log(`\n전부 통과 (${ok.length}건) · 공개 글의 '무료'는 전부 조건형`);
