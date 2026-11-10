/* ensure-fee-honesty.mjs — 공개 화면의 '무료'는 조건형으로만 (AGENTS.md 🔴 6 · hyeonjang cost-honesty.check 와 같은 규칙)
 *
 * 2026-11-09 에 정보글 두 편(rainy-season-waterproof-check · bathroom-waterproof-signs)과 욕실 셀프 체크
 * (bathroom-check.html · js/bathroom-check.js)에 '점검·방문 실측은 무료 …' 가 남아 있는 것을 찾았다. 사이트 FAQ 정본
 * (data/site.json, index.html·leak.html 에 같은 글)은 "인테리어 상담과 1차 방문 실측은 무료입니다. 누수탐지는 장비 탐지에
 * 착수하는 시점부터 유료 …" 다. 누수 화면이 '점검이 무료'라고 말하면 손님은 장비 탐지까지 무료로 기대하고, 현장에서
 * 탐지비를 들으면 홈페이지가 거짓말을 했다고 느낀다. 그동안 이 문구를 보는 검사가 없어 1년 넘게 그대로 나갔다.
 *
 * 보는 곳: ⓐ 정본 data/site.json 의 공개 글 ⓑ 생성물 posts/ ⓒ 공개 루트 HTML(pages-artifact-policy 의 PUBLIC_ROOT_FILES 중
 * .html — 메타 content·alt/aria-label·본문 문단·ld+json 문자열) ⓓ 공개 js/(PUBLIC_JS_FILES, 줄 단위 — 화면에 찍는 문자열이
 * 여기 산다). 허용목록을 그대로 쓰므로 공개 파일을 더하면 자동으로 검사 범위에 든다.
 *
 * 규칙:
 *  ① 어디에도 '점검(과|·|및)?\s*방문 실측(은|는|도)? 무료' 꼴의 조건 없는 문장은 없다.
 *  ② 누수 분야(글: prerender-posts.py article_service 와 같은 규칙 / 화면: leak.html·bathroom-check.html / 스크립트:
 *     js/leak*.js·js/bathroom-check.js)의 한 문단(또는 메타·속성 값·스크립트 한 줄)에 '무료' 가 있으면 같은 단위 안에
 *     '유료' 경계가 함께 있어야 한다(FAQ 정본과 같은 꼴). 인테리어 화면의 '무료 방문 실측'·'무료 1차 상담' 은
 *     정본("인테리어 상담과 1차 방문 실측은 무료")과 같은 말이라 막지 않는다.
 *  ③ FAQ 정본 문장이 site.json 에 그대로 있다 — 정본이 바뀌면 글·화면의 괄호 문구도 같이 고쳐야 하므로 여기서 멈춘다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_ROOT_FILES, PUBLIC_JS_FILES } from './pages-artifact-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const fail = [];
const ok = [];
function check(cond, bad, good) { if (cond) ok.push(good); else fail.push(bad); }

// 조건 없는 '점검 무료' 문장. 띄어쓰기·연결 기호('과'·'·'·',')·조사 유무와 무관하게 잡는다.
const UNCONDITIONAL = /점검\s*(?:과|·|,|및)?\s*방문\s*실측\s*(?:은|는|이|도)?\s*무료/;
// 누수 화면 단위의 '무료' 옆에 있어야 하는 유료 경계.
const PAID_BOUNDARY = /유료/;
// FAQ 정본 — 이 문장이 바뀌면 글·화면의 괄호 문구도 같이 고쳐야 한다.
const FAQ_CANON = /인테리어 상담과 1차 방문 실측은 무료입니다\. 누수탐지는 장비 탐지에 착수하는 시점부터 유료/;

// 누수 분야 공개 화면·스크립트. 글은 isLeak() 으로 판정한다.
const LEAK_HTML = new Set(['leak.html', 'bathroom-check.html']);
const LEAK_JS = new Set(['js/leak.js', 'js/leak-inquiry.js', 'js/bathroom-check.js']);
const ROOT_HTML = PUBLIC_ROOT_FILES.filter((f) => f.endsWith('.html'));
const PUBLIC_JS = PUBLIC_JS_FILES.map((f) => 'js/' + f);

const unescapeHtml = (s) => s.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const flat = (s) => s.replace(/\s+/g, ' ').trim();

/* ⓪ 검사 자신의 눈 — 정규식이 잡아야 할 것과 놓아야 할 것 ----------------- */
// 이 블록이 떨어지면 아래 결과는 믿을 수 없다. 변이 검증 때 처음부터 확인한다.
for (const bad of ['점검과 방문 실측은 무료이니 사진 몇 장과', '점검·방문 실측은 무료입니다.', '점검·방문 실측 무료 — 확인만', '점검 및 방문 실측도 무료']) {
  check(UNCONDITIONAL.test(bad), `자가진단: 조건 없는 문장을 못 잡는다 — "${bad}"`, `자가진단: 잡음 "${bad.slice(0, 14)}…"`);
}
for (const good of ['1차 방문 실측은 무료이니(누수탐지는 장비 탐지에 착수하는 시점부터 유료) 사진 몇 장과', '무료 방문 실측에서 확정하는 순서', '1차 상담·방문 실측 무료.', '1차 방문 실측 무료(누수탐지는 장비 탐지 착수부터 유료)']) {
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
  'data/site.json 에 FAQ 정본 문장("인테리어 상담과 1차 방문 실측은 무료입니다. 누수탐지는 장비 탐지에 착수하는 시점부터 유료 …")이 없다 — 정본을 고쳤으면 누수 글·화면의 괄호 문구와 이 검사도 같이 고쳐라',
  'FAQ 정본 문장 존재');

/* 한 단위씩 두 규칙을 건다. leak 이면 ②도 본다. 결과는 [①위반 수, ②위반 수, 누수 '무료' 단위 수] */
function judge(where, units, leak, hint) {
  let unconditional = 0, unpaired = 0, freeUnits = 0;
  for (const [label, text] of units) {
    if (UNCONDITIONAL.test(text)) { unconditional++; fail.push(`${where} ${label}: 조건 없는 '점검·방문 실측 무료' 문장${hint}`); }
    if (leak && /무료/.test(text)) {
      freeUnits++;
      if (!PAID_BOUNDARY.test(text)) { unpaired++; fail.push(`${where} ${label}: 누수 화면 단위에 '무료'만 있고 '유료' 경계가 없다 — 누수탐지는 장비 착수부터 유료임을 같은 문단에 적어라 · "${text.slice(0, 60)}"`); }
    }
  }
  return [unconditional, unpaired, freeUnits];
}

/* 글 하나의 문단 목록 — 정본의 글자 단위(h·p·요약·상담·사진 설명). p 는 빈 줄로 나뉜 문단을 따로 센다 */
function articleUnits(a) {
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

/* HTML 의 사용자 문자열 단위 — 메타 content · alt/aria-label/placeholder/title 속성 · 블록 단위 본문 · ld+json 문자열.
 * 인라인 태그(<b>·<a>)로는 나누지 않는다: "<b>1차 방문 실측 무료</b>(… 유료)" 는 한 문장이다. */
function htmlUnits(html) {
  const units = [];
  for (const m of html.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"/g)) units.push(['meta', flat(unescapeHtml(m[1]))]);
  for (const m of html.matchAll(/\b(?:alt|aria-label|placeholder|title)="([^"]*)"/g)) units.push(['attr', flat(unescapeHtml(m[1]))]);
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let strings = [];
    try { JSON.stringify(JSON.parse(m[1]), (k, v) => { if (typeof v === 'string') strings.push(v); return v; }); }
    catch { strings = [m[1]]; }
    for (const s of strings) units.push(['ld+json', flat(s)]);
  }
  const body = html.replace(/<script\b[\s\S]*?<\/script>/g, ' ').replace(/<style\b[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const piece of body.split(/<\/(?:p|li|h[1-6]|dt|dd|td|th|summary|figcaption|blockquote|label|small|option)>|<br\s*\/?>/)) {
    const text = flat(unescapeHtml(piece.replace(/<[^>]*>/g, ' ')));
    if (text) units.push(['text', text]);
  }
  return units;
}

/* ⓐ 정본 ------------------------------------------------------------------ */
{
  let u = 0, p = 0, f = 0;
  for (const a of published) {
    const [a1, a2, a3] = judge(a.slug, articleUnits(a), isLeak(a), ' — FAQ 정본대로 "1차 방문 실측은 무료이니(누수탐지는 장비 탐지에 착수하는 시점부터 유료)" 꼴로 고쳐라');
    u += a1; p += a2; f += a3;
  }
  check(u === 0, `정본에 조건 없는 '점검·방문 실측 무료' 문장 ${u}곳`, "정본: 조건 없는 '점검·방문 실측 무료' 문장 없음");
  check(p === 0, `정본 누수 글에 유료 경계 없는 '무료' 문단 ${p}곳`, `정본: 누수 글의 '무료' 문단 ${f}곳 모두 유료 경계 동반`);
}

/* ⓑ 생성물 posts/ ---------------------------------------------------------- */
{
  let u = 0, p = 0, seen = 0, missing = 0;
  for (const a of published) {
    const file = `posts/${a.slug}.html`;
    if (!exists(file)) { missing++; continue; } // 글이 빠진 것은 ensure-site-integrity 가 잡는다
    seen++;
    const html = read(file);
    const start = html.indexOf('<div class="post-body">'), end = html.indexOf('<div class="post-cta">', start);
    const [b1, b2] = judge(file, htmlUnits(start < 0 || end < 0 ? html : html.slice(start, end)), isLeak(a), ' — 정본을 고친 뒤 python3 scripts/prerender-posts.py 를 다시 돌려라');
    u += b1; p += b2;
  }
  check(u === 0, `생성물에 조건 없는 '점검·방문 실측 무료' 문장 ${u}곳`, `생성물 ${seen}편: 조건 없는 문장 없음${missing ? ` (${missing}편은 파일 없음 — site-integrity 몫)` : ''}`);
  check(p === 0, `생성물 누수 글에 유료 경계 없는 '무료' 문단 ${p}곳`, "생성물: 누수 글의 '무료' 문단 모두 유료 경계 동반");
}

/* ⓒ 공개 루트 HTML ---------------------------------------------------------- */
{
  let u = 0, p = 0, f = 0, seen = 0;
  for (const file of ROOT_HTML) {
    if (!exists(file)) continue; // 허용목록에만 있고 파일이 없는 것은 ensure-pages-artifact 몫
    seen++;
    const [c1, c2, c3] = judge(file, htmlUnits(read(file)), LEAK_HTML.has(file), ' — FAQ 정본대로 "1차 방문 실측 무료(누수탐지는 장비 탐지 착수부터 유료)" 꼴로 고쳐라');
    u += c1; p += c2; f += c3;
  }
  check(seen >= 2 && ROOT_HTML.includes('leak.html') && ROOT_HTML.includes('bathroom-check.html'), '공개 루트 HTML 허용목록에 leak.html·bathroom-check.html 이 없다 — 누수 화면이 검사 밖으로 나갔다', `공개 루트 HTML ${seen}장 읽음(누수 화면 ${[...LEAK_HTML].join('·')})`);
  check(u === 0, `공개 루트 HTML 에 조건 없는 '점검·방문 실측 무료' 문장 ${u}곳`, "루트 HTML: 조건 없는 '점검·방문 실측 무료' 문장 없음");
  check(p === 0, `누수 화면 HTML 에 유료 경계 없는 '무료' ${p}곳`, `루트 HTML: 누수 화면의 '무료' 단위 ${f}곳 모두 유료 경계 동반`);
}

/* ⓓ 공개 js/ — 화면에 찍는 문자열은 줄 단위로 본다 ------------------------------ */
{
  let u = 0, p = 0, f = 0, seen = 0;
  for (const file of PUBLIC_JS) {
    if (!exists(file)) continue;
    seen++;
    const units = read(file).split('\n').map((line, i) => [`${i + 1}행`, line]).filter(([, line]) => /무료/.test(line));
    const [d1, d2, d3] = judge(file, units, LEAK_JS.has(file), ' — 화면 문자열도 FAQ 정본대로 조건을 붙여라');
    u += d1; p += d2; f += d3;
  }
  check(seen > 0 && PUBLIC_JS.includes('js/bathroom-check.js'), '공개 js 허용목록에 bathroom-check.js 가 없다 — 셀프 체크 결과 문구가 검사 밖으로 나갔다', `공개 js ${seen}개 읽음(누수 스크립트 ${[...LEAK_JS].join('·')})`);
  check(u === 0, `공개 js 에 조건 없는 '점검·방문 실측 무료' 문장 ${u}곳`, "공개 js: 조건 없는 '점검·방문 실측 무료' 문장 없음");
  check(p === 0, `누수 스크립트에 유료 경계 없는 '무료' ${p}줄`, `공개 js: 누수 스크립트의 '무료' 줄 ${f}곳 모두 유료 경계 동반`);
}

console.log('\n===== 공개 화면 요금 문구(무료 조건형) 검증 =====');
ok.forEach((m) => console.log('  ✓', m));
fail.forEach((m) => console.log('  ✗', m));
if (fail.length) {
  console.log(`\n${fail.length}건 실패 — 손님이 탐지비를 무료로 기대할 수 있는 상태입니다.`);
  process.exit(1);
}
console.log(`\n전부 통과 (${ok.length}건) · 공개 글·화면·스크립트의 '무료'는 전부 조건형`);
