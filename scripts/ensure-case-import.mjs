#!/usr/bin/env node
/* 사례 zip 들이기(scripts/import-case-zip.mjs)가 초안에 남기는 'TODO:' 자리가 공개 글로 나가지 않게 막는다.
 *
 * 들이기 도구는 사진 소제목·설명(imgAlt)·표지 설명을 지어내지 않고 'TODO: 사진을 보고 설명' 으로 남긴다.
 * 초안을 site.json 에 옮기고 published:false 만 지운 채 올리면, 손님 화면과 화면 낭독기에
 * 'TODO: 사진을 보고 설명' 이 그대로 읽힌다. 비공개 초안(published:false)은 봐 주고, 공개 글과
 * 그 생성물(posts/·blog.html·rss.xml)은 한 글자도 봐 주지 않는다.
 * 표시 문자열은 들이기 도구에서 가져온다 — 두 곳에 따로 적으면 한쪽만 바뀐다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TODO_MARK, todoLeaks } from './import-case-zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
for (const where of todoLeaks(site)) fail.push(`공개 글에 '${TODO_MARK}' 자리가 남았다: ${where} — 사진을 보고 채우거나 published:false 로 두라`);

const generated = ['blog.html', 'rss.xml', 'data/leak-case-index.json',
  ...fs.readdirSync(path.join(ROOT, 'posts')).filter((f) => f.endsWith('.html')).map((f) => 'posts/' + f)];
for (const rel of generated) {
  const file = path.join(ROOT, rel);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(TODO_MARK)) fail.push(`${rel} 에 '${TODO_MARK}' 가 있다 — 들이기 초안의 빈자리가 공개 페이지로 나갔다`);
}

if (fail.length) {
  for (const f of fail) console.error('FAIL  ' + f);
  process.exit(1);
}
console.log(`PASS  공개 글 ${site.insights.filter((a) => a && a.published !== false).length}편·생성물 ${generated.length}개에 '${TODO_MARK}' 자리 없음`);
