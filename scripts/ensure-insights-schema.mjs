/* ensure-insights-schema.mjs — 글 정본(data/site.json insights)의 모양이 한결같은가
 *
 * 왜: 글은 site.json insights 하나에서 posts/·blog.html·rss.xml·sitemap 이 생성된다. 그런데 정본의 모양을
 *   보는 검사가 없어서 2026-09-26 에 세어 보니 readMin 이 3편만 문자열("4")이었다 — 생성기·blog.js 가
 *   숫자로 보고 더하거나 비교하면 조용히 '44분'·정렬 어긋남이 난다. 사진 경로가 틀려도 생성은 되고
 *   손님 화면에서만 깨진 그림으로 드러난다. 그래서 생성 전에 정본의 모양을 막는다.
 *
 * 실패: 필수 키(slug·title·category·date·readMin·cover·excerpt·body) 없음 · slug 형식/중복 ·
 *   date·updated 가 실제 날짜가 아님(updated 가 date 보다 앞섬) · readMin 이 양의 정수가 아님 ·
 *   cover 가 #색 이 아님 · published 가 참/거짓이 아님 · 대표 사진(image)·본문 사진(img)·영상(video·
 *   videoPoster) 파일 없음 · 사진이 있는데 설명(imageAlt·imgAlt) 없음 · 본문 칸에 h·p 없음.
 * 경고만: 본문 사진의 imgAlt 와 imgCaption 이 글자까지 같다 — 화면 읽기 사용자는 같은 문장을 두 번 듣는다.
 *   alt 는 '무엇이 보이는가', 캡션은 '무슨 단계인가' 로 나누는 게 좋지만, 문장을 새로 지으면 사진에 없는
 *   사실이 섞일 수 있어 사진을 보며 한 편씩 고친다(자동으로 막지 않는다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = ['slug', 'title', 'category', 'date', 'readMin', 'cover', 'excerpt', 'body'];
const fail = [];
const warnSame = [];

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const insights = site.insights;
if (!Array.isArray(insights) || !insights.length) {
  console.error('✗ data/site.json 에 insights 배열이 없다');
  process.exit(1);
}

const isDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
};
const fileOf = (src) => String(src).split(/[?#]/)[0];
const exists = (src) => {
  const rel = fileOf(src);
  return rel && !rel.split('/').includes('..') && !/^[a-z]+:/i.test(rel) && fs.existsSync(path.join(ROOT, ...rel.split('/')));
};
const text = (value) => typeof value === 'string' && value.trim().length > 0;

const slugs = new Set();
insights.forEach((a, index) => {
  const name = a && typeof a === 'object' ? (a.slug || `#${index}`) : `#${index}`;
  if (!a || typeof a !== 'object' || Array.isArray(a)) { fail.push(`${name}: 글 항목이 객체가 아니다`); return; }
  for (const key of REQUIRED) if (!(key in a)) fail.push(`${name}: 필수 키 ${key} 가 없다`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(a.slug || ''))) fail.push(`${name}: slug 는 영문 소문자·숫자·하이픈만 — posts/<slug>.html 주소가 된다`);
  if (slugs.has(a.slug)) fail.push(`${name}: slug 가 겹친다 — 한 글이 다른 글을 덮어쓴다`);
  slugs.add(a.slug);
  for (const key of ['title', 'category', 'excerpt']) if (key in a && !text(a[key])) fail.push(`${name}: ${key} 가 빈 글자다`);
  if ('date' in a && !isDay(a.date)) fail.push(`${name}: date "${a.date}" 가 YYYY-MM-DD 실제 날짜가 아니다`);
  if ('updated' in a) {
    if (!isDay(a.updated)) fail.push(`${name}: updated "${a.updated}" 가 YYYY-MM-DD 실제 날짜가 아니다`);
    else if (isDay(a.date) && a.updated < a.date) fail.push(`${name}: updated(${a.updated}) 가 date(${a.date}) 보다 앞선다`);
  }
  if ('readMin' in a && !(Number.isInteger(a.readMin) && a.readMin > 0)) {
    fail.push(`${name}: readMin 은 양의 정수(따옴표 없이) — 지금 ${JSON.stringify(a.readMin)}`);
  }
  if ('cover' in a && !/^#[0-9a-f]{6}$/i.test(String(a.cover))) fail.push(`${name}: cover 는 #rrggbb 색이어야 한다 — 지금 ${JSON.stringify(a.cover)}`);
  if ('published' in a && typeof a.published !== 'boolean') fail.push(`${name}: published 는 true/false — 지금 ${JSON.stringify(a.published)}`);
  if ('image' in a) {
    if (!exists(a.image)) fail.push(`${name}: 대표 사진 파일이 없다 — ${a.image}`);
    if (!text(a.imageAlt)) fail.push(`${name}: 대표 사진이 있는데 imageAlt 가 없다`);
  }
  if ('body' in a) {
    if (!Array.isArray(a.body) || !a.body.length) { fail.push(`${name}: body 는 비어 있지 않은 배열이어야 한다`); return; }
    a.body.forEach((section, at) => {
      const where = `${name} 본문 ${at + 1}번째 칸`;
      if (!section || typeof section !== 'object') { fail.push(`${where}: 객체가 아니다`); return; }
      if (!text(section.h)) fail.push(`${where}: 소제목(h)이 없다`);
      if (!text(section.p)) fail.push(`${where}: 문단(p)이 없다`);
      if ('img' in section) {
        if (!exists(section.img)) fail.push(`${where}: 사진 파일이 없다 — ${section.img}`);
        if (!text(section.imgAlt)) fail.push(`${where}: 사진이 있는데 imgAlt 가 없다`);
        if (text(section.imgAlt) && section.imgAlt.trim() === String(section.imgCaption || '').trim()) warnSame.push(`${name}#${at + 1}`);
      }
      for (const key of ['video', 'videoPoster']) {
        if (key in section && !exists(section[key])) fail.push(`${where}: ${key} 파일이 없다 — ${section[key]}`);
      }
    });
  }
});

if (warnSame.length) {
  const bySlug = new Map();
  for (const item of warnSame) { const slug = item.split('#')[0]; bySlug.set(slug, (bySlug.get(slug) || 0) + 1); }
  console.warn(`⚠ 본문 사진 ${warnSame.length}장의 imgAlt 가 imgCaption 과 같다(경고만 — 사진을 보며 한 편씩 나눠 쓴다): ${[...bySlug].map(([s, n]) => `${s} ${n}장`).join(', ')}`);
}
if (fail.length) {
  console.error(`✗ 글 정본 모양 ${fail.length}건 문제 (data/site.json insights)\n`);
  fail.forEach((message) => console.error('  - ' + message));
  process.exit(1);
}
console.log(`✓ 글 정본 모양 — ${insights.length}편 필수 키·날짜·readMin 정수·사진/영상 파일·설명 확인`);
