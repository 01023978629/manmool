// 2026-11-22 글 끝 '관련 검색어'·네이버 블로그 글 링크 검사.
// 정본은 scripts/post-extras.json({slug: {keywords: [...], naverBlog}}) — site.json insights 는 기존 글 고정 검사가 많아 손대지 않는다.
// prerender-posts.py 가 posts/<slug>.html 의 본문 아래 aside.post-keywords · <meta name="keywords"> · BlogPosting keywords 로 그린다.
// 지키는 것
//   ① 파일 꼴: 공개 글 slug 만, 검색어 1~10개(중복 없음·2~20자), 블로그 주소는 대표 블로그(blog.naver.com/1dncjf/글번호) 꼴, 같은 블로그 글을 두 글에 붙이지 않음
//   ② 공개 금지 표현: 동·호수, 동-호 꼴 숫자, 전화번호, 금액, 협력사·발주처 이름, 과장('최저가'·'100%'·'평생'·'무료'·'보증')
//   ③ 생성물: 각 글 페이지의 칩·메타·구조화 데이터·링크가 정본과 같고(순서까지), 본문 뒤·상담 칸 앞에 있다
//   ④ 정본에 없는 글 페이지에는 관련 검색어 칸·keywords 메타가 없다(지운 뒤 다시 생성하지 않은 경우)
// 2026-11-28: 공개한 뒤 내린 글의 옛 주소(scripts/post-redirects.json — 예: 11/26 월평타운 두 세대 합친 글)는 글이 아니라 이동 쪽이다.
//   정본에 옛 slug 가 있으면 '대신 올린 글 slug 로 옮겨라'로 멈춘다(이동 쪽에는 칸이 그려지지 않으므로 ④ 가 그 쪽을 본다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import hidden from './lib/hidden-terms.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTRAS_PATH = path.join(ROOT, 'scripts', 'post-extras.json');
const SITE_PATH = path.join(ROOT, 'data', 'site.json');
const REDIRECTS_PATH = path.join(ROOT, 'scripts', 'post-redirects.json');
const POSTS_DIR = path.join(ROOT, 'posts');
const MAX_KEYWORDS = 10;
const BLOG_RE = /^https:\/\/blog\.naver\.com\/1dncjf\/\d{6,}$/;
const FORBIDDEN = [
  [/\d{1,4}\s*동\s*\d{2,4}\s*호/, '동·호수'],
  [/(?<![\d.])\d{3,4}\s*호(?![가-힣])/, '호수'],
  [/(?<![\d-])\d{2,4}-\d{2,4}(?![\d-])/, '동-호 꼴 숫자'],
  [/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/, '전화번호'],
  [/\d[\d,]*\s*(?:만|천|억)?\s*원/, '금액'],
  [/최저가|100%|평생|무료|보증/, '과장 표현'],
];
// 협력사·발주처·작업자 이름은 공개 저장소에 글자로 적지 않는다(2026-11-25 규칙) — 공용 대조기 scripts/lib/hidden-terms.cjs(sha256)로 본다.
// 11/22 초안은 이름을 정규식에 글자로 적었다. 11/28 다시 얹으며 대조기로 바꿨다(같은 이름들이 partners 묶음에 들어 있음을 확인).
const HIDDEN_GROUPS = ['partners', 'people'];
const failures = [];

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${label} 을(를) 읽을 수 없다: ${error.code || error.message}`);
    return null;
  }
}

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unescapeHtml(value) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
}

const extras = readJson(EXTRAS_PATH, 'scripts/post-extras.json');
const site = readJson(SITE_PATH, 'data/site.json');
const insights = new Map((site?.insights || []).map((item) => [item.slug, item]));
const redirects = fs.existsSync(REDIRECTS_PATH) ? (readJson(REDIRECTS_PATH, 'scripts/post-redirects.json') || {}) : {};
const redirectTo = (slug) => (slug !== '_comment' && Object.hasOwn(redirects, slug) ? String(redirects[slug]?.to || '?') : '');

// ① ② 정본
const blogSeen = new Map();
if (!extras || typeof extras !== 'object' || Array.isArray(extras)) {
  failures.push('scripts/post-extras.json 의 최상위 값은 {slug: …} 객체여야 한다');
} else {
  for (const [slug, item] of Object.entries(extras)) {
    const insight = insights.get(slug);
    if (!insight && redirectTo(slug)) failures.push(`${slug}: 내린 글의 옛 주소(post-redirects.json → ${redirectTo(slug)})다 — 대신 올린 글 slug 로 옮겨라`);
    else if (!insight) failures.push(`${slug}: site.json 에 없는 글이다`);
    else if (insight.published === false) failures.push(`${slug}: 공개하지 않은 글이다`);
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      failures.push(`${slug}: 값은 {keywords, naverBlog} 객체여야 한다`);
      continue;
    }
    const keywords = Array.isArray(item.keywords) ? item.keywords.map(norm) : null;
    if (!keywords || keywords.length < 1 || keywords.length > MAX_KEYWORDS) {
      failures.push(`${slug}: keywords 는 1~${MAX_KEYWORDS}개 배열이어야 한다`);
    } else {
      if (new Set(keywords).size !== keywords.length) failures.push(`${slug}: 같은 검색어가 두 번 있다`);
      for (const keyword of keywords) {
        if (keyword.length < 2 || keyword.length > 20) failures.push(`${slug}: 검색어 길이(2~20자)가 아니다 — '${keyword}'`);
        for (const [pattern, label] of FORBIDDEN) {
          if (pattern.test(keyword)) failures.push(`${slug}: 공개 금지(${label}) — '${keyword}'`);
        }
        const hit = hidden.findHidden(keyword, ...HIDDEN_GROUPS);
        if (hit) failures.push(`${slug}: 공개 금지(협력사·작업자 이름) — 검색어 '${keyword.length}글자' 중 ${hidden.describeHidden(hit)}`);
      }
    }
    if (item.naverBlog !== undefined) {
      if (!BLOG_RE.test(String(item.naverBlog))) failures.push(`${slug}: naverBlog 가 대표 블로그 글 주소 꼴이 아니다 — '${item.naverBlog}'`);
      else if (blogSeen.has(item.naverBlog)) failures.push(`${slug}: ${blogSeen.get(item.naverBlog)} 와 같은 블로그 글을 붙였다`);
      else blogSeen.set(item.naverBlog, slug);
    }
    for (const key of Object.keys(item)) {
      if (!['keywords', 'naverBlog'].includes(key)) failures.push(`${slug}: 모르는 칸 '${key}'`);
    }
  }
}

// ③ ④ 생성물
const postFiles = fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR).filter((name) => name.endsWith('.html')) : [];
for (const name of postFiles) {
  const slug = name.replace(/\.html$/, '');
  const page = fs.readFileSync(path.join(POSTS_DIR, name), 'utf8');
  const item = extras && typeof extras === 'object' ? extras[slug] : undefined;
  const asideMatch = page.match(/<aside class="post-keywords"[^>]*>([\s\S]*?)<\/aside>/);
  const metaMatch = page.match(/<meta name="keywords" content="([^"]*)" \/>/);
  if (!item) {
    if (asideMatch || metaMatch) failures.push(`posts/${name}: 정본에 없는데 관련 검색어 칸·메타가 남아 있다 — prerender-posts.py 를 다시 돌려라`);
    continue;
  }
  const keywords = (item.keywords || []).map(norm);
  if (!asideMatch) {
    failures.push(`posts/${name}: 관련 검색어 칸(aside.post-keywords)이 없다 — prerender-posts.py 를 다시 돌려라`);
    continue;
  }
  const chips = [...asideMatch[1].matchAll(/<li>([^<]*)<\/li>/g)].map((m) => unescapeHtml(m[1]));
  if (JSON.stringify(chips) !== JSON.stringify(keywords)) failures.push(`posts/${name}: 칩이 정본과 다르다 (${chips.join(', ')})`);
  if (!metaMatch || unescapeHtml(metaMatch[1]) !== keywords.join(', ')) failures.push(`posts/${name}: <meta name="keywords"> 가 정본과 다르다`);
  const ldMatch = page.match(/<script type="application\/ld\+json">(\{"@context": "https:\/\/schema\.org", "@type": "BlogPosting"[\s\S]*?)<\/script>/);
  let ld = null;
  try { ld = ldMatch ? JSON.parse(ldMatch[1]) : null; } catch { ld = null; }
  if (!ld || ld.keywords !== keywords.join(', ')) failures.push(`posts/${name}: BlogPosting keywords 가 정본과 다르다`);
  const link = asideMatch[1].match(/<a class="pk-blog" href="([^"]*)" target="_blank" rel="noopener">/);
  if (item.naverBlog && (!link || unescapeHtml(link[1]) !== item.naverBlog)) failures.push(`posts/${name}: 네이버 블로그 링크가 정본과 다르다`);
  if (!item.naverBlog && link) failures.push(`posts/${name}: 정본에 없는 블로그 링크가 있다`);
  const bodyAt = page.indexOf('<div class="post-body">');
  const asideAt = page.indexOf('<aside class="post-keywords"');
  const ctaAt = page.indexOf('<div class="post-cta">');
  if (!(bodyAt >= 0 && bodyAt < asideAt && asideAt < ctaAt)) failures.push(`posts/${name}: 관련 검색어 칸은 본문 뒤·상담 칸 앞에 있어야 한다`);
}
if (extras && typeof extras === 'object') {
  for (const slug of Object.keys(extras)) {
    if (!postFiles.includes(`${slug}.html`)) failures.push(`${slug}: posts/${slug}.html 이 없다`);
  }
}

if (failures.length) {
  console.error(`ensure-post-extras: ${failures.length}건 실패`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`ensure-post-extras: 통과 — 글 ${Object.keys(extras).length}편 · 검색어 ${Object.values(extras).reduce((n, x) => n + x.keywords.length, 0)}개 · 블로그 링크 ${blogSeen.size}개`);
