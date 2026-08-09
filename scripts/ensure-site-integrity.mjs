/* ensure-site-integrity.mjs — 사이트가 조용히 망가지지 않게 지킨다
 *
 * 손님이 링크를 눌렀는데 404 가 뜨거나, 검색엔진이 페이지를 제대로 못 읽는 상태는
 * 아무도 알려주지 않는다. 사람이 매번 수동으로 훑는 대신 여기서 잡는다.
 *
 * 판정 기준: 페이지를 '공개'와 '내부'로 나눈다.
 *   · 내부 화면(admin·mypage·field·as)은 <meta name="robots" content="noindex"> 가 붙어 있고
 *     검색에 안 뜨는 게 정상이다. 여기에 description·canonical 을 요구하면 오탐이 된다.
 *   · 공개 페이지만 메타·사이트맵을 갖춰야 한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
let checked = 0;

const readIf = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
const htmlFiles = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  ...(fs.existsSync(path.join(ROOT, 'posts'))
    ? fs.readdirSync(path.join(ROOT, 'posts')).filter((f) => f.endsWith('.html')).map((f) => 'posts/' + f)
    : []),
];

const isInternal = (src) => /name="robots"[^>]*content="[^"]*noindex/.test(src);

/* ⓪ 글이 사이트에서 도달 가능한가 (고아 글 방지) ------------------------
 * posts/<slug>.html 은 data/site.json 의 insights 에서 생성된다(prerender-posts.py).
 * site.json 에 없는 글은 파일만 존재하고 blog.html 목록·홈 인사이트 어디에도
 * 안 뜬다 — 손님이 볼 방법이 없다. 실제로 2026-08-02 글이 그 상태로 방치됐다.
 * 문서에는 "빼먹으면 검사가 잡는다"고 적혀 있었지만 그 검사가 없었다. 이제 있다. */
{
  const raw = readIf('data/site.json');
  if (raw) {
    let ins = [];
    try { ins = (JSON.parse(raw).insights || []); } catch (e) { fail.push('data/site.json 을 읽을 수 없다: ' + e.message); }
    const slugs = new Set(ins.map((x) => x && x.slug).filter(Boolean));
    const blog = readIf('blog.html') || '';
    for (const s of slugs) {
      checked++;
      if (!fs.existsSync(path.join(ROOT, 'posts', s + '.html')))
        fail.push(`site.json 에 있는 글 "${s}" 의 posts/${s}.html 이 없다 — prerender-posts.py 를 돌려라`);
      if (!blog.includes(`posts/${s}.html`))
        fail.push(`글 "${s}" 이 blog.html 목록에 없다 — 손님이 볼 방법이 없다. prerender-posts.py 를 돌려라`);
    }
    for (const f of fs.existsSync(path.join(ROOT, 'posts')) ? fs.readdirSync(path.join(ROOT, 'posts')) : []) {
      if (!f.endsWith('.html')) continue;
      const s = f.replace(/\.html$/, '');
      checked++;
      if (!slugs.has(s))
        fail.push(`posts/${f} 이 data/site.json 의 insights 에 없다 — 고아 글이다(목록·홈 어디에도 안 뜬다). site.json 에 넣고 prerender-posts.py 를 돌려라`);
    }
  }
}

/* ⓪-2 blog.html 에 목록이 정확히 한 벌인가 (중복 누적 방지) ------------
 * prerender 의 끝 탐지가 부분문자열 검색이던 시절, 실행할 때마다 옛 목록이
 * 컨테이너 밖에 한 벌씩 남아 쌓였다 — 실제로 4벌 중복된 채 배포돼 있었다.
 * 같은 글이 목록에 두 번 보이면 그 자체로 고장이므로 카드 수로 잡는다. */
{
  const raw = readIf('data/site.json');
  const blog = readIf('blog.html') || '';
  if (raw && blog) {
    let ins = [];
    try { ins = (JSON.parse(raw).insights || []); } catch (e) { /* ⓪ 에서 이미 보고 */ }
    for (const x of ins) {
      if (!x || !x.slug) continue;
      checked++;
      const n = blog.split(`posts/${x.slug}.html`).length - 1;
      if (n > 1)
        fail.push(`글 "${x.slug}" 카드가 blog.html 에 ${n}번 나온다 — 목록이 중복 누적됐다. 떠돌이 목록을 지우고 prerender-posts.py 를 돌려라`);
    }
    const grids = blog.split('class="insights-grid"').length - 1;
    checked++;
    if (grids !== 1)
      fail.push(`blog.html 의 insights-grid 가 ${grids}개다(1개여야 함) — 옛 목록이 남아 있다`);
  }
}

/* ⓪-3 하자보증 기간이 법정 이상인가 + FAQ 구조화 데이터가 정본과 같은가 ---
 * 2026-08-09 에 "방수 2년"을 3년으로 고쳤는데 **표면만 고쳐졌다.** 홈페이지 문구는
 * 바뀌었지만 곧 설치할 계약서 코드(ContractService.gs), 고객 전용 페이지가 읽는
 * data/project.json, 검색에 나가는 JSON-LD 는 2년 그대로였다. 광고는 3년인데
 * 계약서는 2년인 상태 — 분쟁이 나면 "손님에겐 3년이라 해놓고 계약서로 줄였다"가
 * 되고, 단축 요건(사유·보증수수료 명시, 시행령 제30조②)을 못 갖췄으니 법원은
 * 어차피 법정기간을 적용한다. 줄여 쓴 대가만 남는다.
 * 근거: 건설산업기본법 시행령 별표4 — 방수 3년 · 급배수 등 설비 2년 · 실내건축 1년 */
{
  const LEGAL = { 방수: 3, 설비: 2 };
  // (a) 법정보다 짧은 연수가 박힌 곳이 있는가
  const SCAN = ['index.html', 'office.html', 'bathroom-check.html', 'data/site.json',
                'data/project.json', 'apps-script-contract/ContractService.gs',
                'apps-script-contract/수동검증-체크리스트.md', 'README.md'];
  for (const rel of SCAN) {
    const src = readIf(rel);
    if (src == null) continue;
    checked++;
    // 설명 주석("예전에는 방수 2년이었다")은 잡지 않는다 — 실제 값 표기만 본다
    const body = src.split('\n').filter((l) => !/^\s*(\/\/|\*|#|<!--|\s*예전|.*나갔고)/.test(l)).join('\n');
    if (/방수[^가-힣0-9]{0,12}2년|방수 관련[^0-9]{0,6}2년|"work": *"방수"[^}]*"years": *2/.test(body))
      fail.push(`${rel}: 방수 보증이 2년으로 적혀 있다 — 법정은 3년이다(건산법 시행령 별표4). 짧게 적어도 책임은 그대로이고 홈페이지 안내와 어긋나는 손해만 남는다`);
  }
  // (b) 계약서 코드의 구조화된 정본 값
  const cs = readIf('apps-script-contract/ContractService.gs');
  if (cs) {
    checked++;
    const m = cs.match(/var CT_WARRANTY = (\[[^\]]*\]);/);
    if (!m) fail.push('ContractService.gs 의 CT_WARRANTY 를 찾지 못했다 — 형식이 바뀌었으면 이 검사부터 고쳐라');
    else {
      const wp = m[1].match(/name: *'방수[^']*', *months: *(\d+)/);
      const eq = m[1].match(/name: *'[^']*설비[^']*', *months: *(\d+)/);
      if (!wp || Number(wp[1]) < LEGAL.방수 * 12)
        fail.push(`ContractService.gs CT_WARRANTY: 방수가 ${wp ? wp[1] : '없음'}개월 — 법정 36개월 이상이어야 한다. 이 값이 계약서 제7조와 고객 서명 화면에 그대로 찍힌다`);
      if (!eq || Number(eq[1]) < LEGAL.설비 * 12)
        fail.push(`ContractService.gs CT_WARRANTY: 급배수 등 설비 항목이 ${eq ? eq[1] + '개월' : '없다'} — 법정 24개월 이상이어야 한다`);
    }
  }
  // (c) index.html 의 FAQ 구조화 데이터가 site.json 정본과 글자 그대로 같은가
  const rawSite = readIf('data/site.json');
  const idx = readIf('index.html');
  if (rawSite && idx) {
    let faq = [];
    try { faq = JSON.parse(rawSite).faq || []; } catch (e) { /* ⓪ 에서 이미 보고 */ }
    checked++;
    const n = idx.split('"@type": "FAQPage"').length - 1;
    if (n !== 1)
      fail.push(`index.html 의 FAQPage 가 ${n}개다(1개여야 함) — 둘이면 내용이 갈릴 때 검색엔진이 어느 쪽을 집을지 통제할 수 없다`);
    for (const f of faq) {
      checked++;
      if (!idx.includes(JSON.stringify(f.q).slice(1, -1)))
        fail.push(`FAQ "${String(f.q).slice(0, 24)}…" 이 index.html 구조화 데이터에 없다 — python3 scripts/sync-faq-jsonld.py 를 돌려라`);
      else if (!idx.includes(JSON.stringify(f.a).slice(1, -1)))
        fail.push(`FAQ "${String(f.q).slice(0, 24)}…" 의 답이 site.json 과 다르다 — 화면과 검색 결과가 다른 말을 한다. python3 scripts/sync-faq-jsonld.py`);
    }
  }
}

/* ① 내부 링크가 실제 파일을 가리키는가 (404 방지) ---------------------- */
for (const rel of htmlFiles) {
  const src = readIf(rel);
  if (src == null) continue;
  const dir = path.dirname(path.join(ROOT, rel));
  for (const href of src.match(/href="([^"]+)"/g) || []) {
    const v = href.slice(6, -1);
    if (/^(https?:|mailto:|tel:|sms:|#|data:|javascript:|\/\/)/.test(v)) continue;
    const target = v.split('#')[0].split('?')[0];
    if (!target) continue;
    checked++;
    if (!fs.existsSync(path.resolve(dir, target))) {
      fail.push(`${rel} 의 링크가 깨졌다: ${v} (손님이 누르면 404)`);
    }
  }
}

/* ② 공개 페이지에 검색용 메타가 있는가 --------------------------------- */
for (const rel of htmlFiles) {
  const src = readIf(rel);
  if (src == null || isInternal(src)) continue;   // 내부 화면은 noindex 가 정상
  const head = src.split('</head>')[0] || '';
  if (!/<title>[^<]+<\/title>/.test(head)) fail.push(`${rel}: <title> 이 비었거나 없다`);
  if (!/name="description"\s+content="[^"]{10,}"/.test(head)) fail.push(`${rel}: meta description 이 없다(검색 결과에 설명이 안 뜬다)`);
  if (!/rel="canonical"/.test(head)) fail.push(`${rel}: canonical 이 없다(중복 URL 로 색인될 수 있다)`);
}

/* ③ 내부 화면이 검색에 새지 않는가 ------------------------------------- */
// robots.txt 는 GitHub Pages 프로젝트 사이트(/manmool/)에서는 크롤러가 읽지 않는다
// (오리진 루트에서만 읽힌다). 그래서 실제 보호는 각 페이지의 noindex 가 한다 — 이게 핵심.
for (const rel of ['admin.html', 'mypage.html', 'field.html', 'as.html']) {
  const src = readIf(rel);
  if (src == null) continue;
  if (!isInternal(src)) fail.push(`${rel}: 내부 화면인데 noindex 가 없다 — 검색에 노출될 수 있다`);
}

/* ④ 공개 페이지가 sitemap 에 들어 있는가 ------------------------------- */
const sm = readIf('sitemap.xml');
if (!sm) fail.push('sitemap.xml 이 없다');
else {
  const locs = (sm.match(/<loc>([^<]+)<\/loc>/g) || []).map((m) => m.slice(5, -6));
  for (const rel of htmlFiles) {
    const src = readIf(rel);
    if (src == null || isInternal(src)) continue;
    const inMap = locs.some((u) => u.endsWith('/' + rel) || (rel === 'index.html' && /\/manmool\/?$/.test(u)));
    if (!inMap) fail.push(`${rel} 이 sitemap.xml 에 없다 — 검색엔진이 늦게 찾거나 못 찾는다`);
  }
}

/* ⑤ 혼합 콘텐츠(http://) 링크가 없는가 --------------------------------- */
// HTTPS 페이지에서 http:// 링크는 브라우저가 막거나 경고한다.
for (const rel of [...htmlFiles, 'data/config.json', 'data/site.json']) {
  const src = readIf(rel);
  if (src == null) continue;
  for (const m of src.match(/http:\/\/[a-z0-9.-]+[^"'\s<>]*/gi) || []) {
    if (/127\.0\.0\.1|localhost|w3\.org|schema\.org|purl\.org|ns\.adobe/.test(m)) continue;
    fail.push(`${rel}: http:// 링크가 남아 있다 → ${m} (HTTPS 페이지에서 차단·경고될 수 있다)`);
  }
}

if (fail.length) {
  console.error('✗ 사이트 무결성 ' + fail.length + '건 문제\n');
  fail.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`✓ 사이트 무결성 정상 — 페이지 ${htmlFiles.length}개 · 내부링크 ${checked}건 확인`);
