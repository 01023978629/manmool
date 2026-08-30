import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_PATH = path.join(ROOT, 'data', 'site.json');
const INDEX_PATH = path.join(ROOT, 'data', 'leak-case-index.json');
const failures = [];
const requiredCaseKeys = ['slug', 'title', 'service', 'published'];

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    failures.push(`${label} 파일을 읽을 수 없다: ${error.code || error.message}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    failures.push(`${label}이(가) UTF-8 JSON이 아니다: ${error.message}`);
    return null;
  }
}

function isPublicLeakInsight(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || item.published === false) return false;
  if (Object.hasOwn(item, 'service')) return item.service === 'leak';
  return item.category === '방수·설비' || item.category === '누수탐지·수리';
}

const site = readJson(SITE_PATH, 'data/site.json');
const index = readJson(INDEX_PATH, 'data/leak-case-index.json');

if (fs.existsSync(INDEX_PATH) && fs.statSync(INDEX_PATH).size >= 10 * 1024) {
  failures.push('data/leak-case-index.json이 10KB 이상이다');
}

if (!site || typeof site !== 'object' || Array.isArray(site)) {
  failures.push('data/site.json의 최상위 값은 객체여야 한다');
}

const expectedCases = site && Array.isArray(site.insights)
  ? site.insights
      .filter(isPublicLeakInsight)
      .sort((left, right) => {
        const leftDate = String(left.date ?? '');
        const rightDate = String(right.date ?? '');
        if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;
        const leftSlug = String(left.slug ?? '');
        const rightSlug = String(right.slug ?? '');
        return leftSlug === rightSlug ? 0 : leftSlug < rightSlug ? -1 : 1;
      })
      .map(({ slug, title }) => ({ slug, title, service: 'leak', published: true }))
  : [];

if (!site || !Array.isArray(site.insights)) {
  failures.push('data/site.json의 insights 배열을 읽을 수 없다');
}

if (!index || typeof index !== 'object' || Array.isArray(index)) {
  failures.push('data/leak-case-index.json의 최상위 값은 객체여야 한다');
} else {
  if (index.version !== 1) failures.push('data/leak-case-index.json의 version은 1이어야 한다');
  if (!Array.isArray(index.cases)) {
    failures.push('data/leak-case-index.json의 cases는 배열이어야 한다');
  } else {
    const slugs = new Set();
    index.cases.forEach((item, position) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        failures.push(`cases[${position}]는 객체여야 한다`);
        return;
      }
      const keys = Object.keys(item).sort();
      if (JSON.stringify(keys) !== JSON.stringify([...requiredCaseKeys].sort())) {
        failures.push(`cases[${position}]는 slug, title, service, published 네 키만 가져야 한다`);
      }
      for (const key of requiredCaseKeys) {
        if (key === 'published') continue;
        if (typeof item[key] !== 'string' || !item[key].trim()) {
          failures.push(`cases[${position}].${key}은(는) 빈 문자열이 아닌 문자열이어야 한다`);
        }
      }
      if (item.service !== 'leak') failures.push(`cases[${position}].service는 leak이어야 한다`);
      if (item.published !== true) failures.push(`cases[${position}].published는 true여야 한다`);
      if (slugs.has(item.slug)) failures.push(`cases에 중복 slug가 있다: ${String(item.slug)}`);
      slugs.add(item.slug);
    });
    const actualCases = index.cases.map(({ slug, title, service, published }) => ({ slug, title, service, published }));
    if (JSON.stringify(actualCases) !== JSON.stringify(expectedCases)) {
      failures.push('cases가 공개 누수 글을 한 번씩만 date 내림차순·slug 오름차순으로 담지 않는다');
    }
  }
}

if (failures.length) {
  console.error(`✗ 누수 사례 인덱스 ${failures.length}건 문제`);
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log(`✓ 누수 사례 인덱스 정상 — ${expectedCases.length}건 확인`);
