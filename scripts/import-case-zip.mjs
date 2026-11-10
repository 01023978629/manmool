#!/usr/bin/env node
/* import-case-zip.mjs — 현장 앱(hyeonjang)의 「📰 사례 내보내기」 ZIP 을 검사해 비공개 초안까지만 만든다.
 *
 * 사용:
 *   node scripts/import-case-zip.mjs <zip> [--slug <slug>] [--date YYYY-MM-DD] [--kind leak|interior] [--dry-run]
 *
 * ZIP 안에는 사진 `NN-전.jpg|NN-중.jpg|NN-후.jpg`(EXIF 없음·긴 변 1800), `사례재료.txt`(6항목 — new-case-post.mjs 의
 * parseMaterial 이 읽는 형식), 그리고 앱 v446 부터 `case.json`(format 'manmool-case/1') 이 들어 있다.
 *
 * 하는 일(순서대로, 하나라도 걸리면 아무것도 쓰지 않는다):
 *   1) ZIP 을 메모리에서 읽는다 — 경로 탈출(..·절대 경로·역슬래시)·심볼릭 링크·암호·ZIP64 거부, 항목 수·크기 상한.
 *   2) case.json 이 있으면 그것을, 없으면 사례재료.txt 를 parseMaterial 로 읽는다. 둘 다 없으면 멈춘다.
 *   3) 글·case.json 의 모든 문자열과 ZIP 항목 이름에 js/pii-rules.js 규칙(동·호수·전화·이메일·고객명·출입번호)을 돌린다.
 *      걸리면 어느 칸이 걸렸는지만 말하고 멈춘다. 과장 표현(최저가·100%·평생 보증…)도 같다.
 *   4) 고객 사진 공개 동의 기록(case.json consent:true 또는 재료 글 '동의: 받음')이 없으면 멈춘다 — 동의는 지어낼 수 없다.
 *   5) 사진은 JPEG 인지·EXIF/XMP 가 없는지 본다(앱이 구운 사진에는 없다 — 있으면 손으로 넣은 원본이다).
 *   6) 같은 slug 의 초안·공개 글·사진 파일이 이미 있으면 멈춘다(덮어쓰지 않는다).
 *   7) 그제야 `.private/case-drafts/<slug>.json`(초안)과 `.private/case-drafts/<slug>/<slug>-N.jpg`(사진, 전→중→후 순,
 *      이름은 slug+번호만)를 쓴다. `.private/` 는 .gitignore 라 저장소·공개 사이트에 올라가지 않는다.
 *
 * **게시는 하지 않는다.** data/site.json·posts/·assets/cases/ 는 읽기만 한다(같은 slug 가 있는지). 초안의 모양은
 * new-case-post.mjs 의 makeDraft 가 만드는 그대로(그 함수를 그대로 쓴다)에 사진·caseSummary 를 얹은 것이라, 사람이 읽고
 * 고친 뒤 data/site.json insights 에 옮겨 넣으면 된다(절차는 docs/import-case-zip-20261109.md). 비어 있는 항목은 비워 둔다 —
 * 사례를 지어내지 않는다.
 *
 * 종료 코드: 0 초안 만듦 · 1 거부 또는 오류(아무것도 쓰지 않음). */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { makeDraft, parseMaterial, piiFindings } from './new-case-post.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.MANMOOL_CASE_ROOT || DEFAULT_ROOT);

export const CASE_FORMAT = 'manmool-case/1';
export const LIMITS = Object.freeze({
  zipBytes: 250 * 1024 * 1024,   // ZIP 파일 자체
  entries: 80,                   // 항목 수(사진 40 + 글 2 + 여유)
  fileBytes: 25 * 1024 * 1024,   // 항목 하나(앱 사진은 1800px JPEG 라 1MB 안팎)
  totalBytes: 200 * 1024 * 1024, // 풀린 전체
  photos: 40,
});
const FIELDS = ['place', 'symptom', 'method', 'cause', 'work', 'duration'];
const LABELS = { place: '동네+단지', symptom: '증상', method: '탐지 방법', cause: '원인+전유/공용', work: '공사 내용', duration: '걸린 시간' };
const PHASES = ['before', 'mid', 'after'];
const PHASE_OF_KO = { '전': 'before', '중': 'mid', '후': 'after' };
const PHASE_LABEL = { before: '시공 전', mid: '작업 중', after: '완료' };
const KINDS = { '누수': 'leak', '인테리어': 'interior', leak: 'leak', interior: 'interior' };
const PLACE_NOTE = '단지명까지만 표시합니다. 동·호수와 고객 정보는 공개하지 않습니다.';
const EMPTY = '(비어 있음)'; // makeDraft 는 빈 칸을 거부한다 — 자리만 채웠다가 초안에서는 다시 비운다(지어내지 않는다)
/* 과장 표현 — 현장 앱 HJ_AD_BANNED 와 같은 축(사례 검사들이 공개 글에서 금지하는 정규식과 같다). */
const AD_BANNED = [
  ['최저가', /최저\s*가/], ['무조건', /무조건/], ['100%', /100\s*%|백\s*퍼센트/],
  ['평생 보증', /평생\s*(?:보증|무상|A\/?S)/i], ['업계 1위', /업계\s*(?:1|일)\s*위|업계\s*최고/], ['지어낸 만족 후기', /고객님께서.*만족/],
];
const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

export class CaseImportError extends Error {
  constructor(message, details = []) { super(message); this.details = details; }
}

/* ───────── ZIP 읽기(의존성 없음) ─────────
   중앙 디렉터리에서 크기·위치를 읽는다 — 로컬 헤더만 믿으면 data descriptor(bit 3) 항목의 크기가 0 으로 보인다. */
export function unsafeZipName(name) {
  if (!name || name.includes('\0')) return 'NUL 문자가 든 이름';
  if (name.includes('\\')) return '역슬래시 경로';
  if (/^[A-Za-z]:/.test(name)) return '드라이브 문자 절대 경로';
  if (name.startsWith('/')) return '절대 경로';
  const segs = name.split('/');
  if (segs.includes('..')) return '상위 폴더 탈출(..)';
  if (segs.includes('.')) return '현재 폴더 조각(.)';
  if (segs.slice(0, -1).some((s) => s === '')) return '빈 경로 조각(//)';
  return '';
}

export function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new CaseImportError('ZIP 파일이 아니다(너무 작다)');
  if (buf.length > LIMITS.zipBytes) throw new CaseImportError(`ZIP 이 너무 크다(${buf.length} 바이트 > ${LIMITS.zipBytes})`);
  let eocd = -1;
  for (let i = buf.length - 22, min = Math.max(0, buf.length - 22 - 0xffff); i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new CaseImportError('ZIP 끝 기록(EOCD)을 찾지 못했다 — ZIP 파일이 아니거나 잘렸다');
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new CaseImportError('ZIP64 형식은 지원하지 않는다');
  if (total > LIMITS.entries) throw new CaseImportError(`ZIP 항목이 너무 많다(${total}개 > ${LIMITS.entries}개)`);
  if (cdOffset + cdSize > eocd) throw new CaseImportError('중앙 디렉터리가 파일 밖을 가리킨다');
  const entries = [];
  let p = cdOffset;
  let totalBytes = 0;
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new CaseImportError('중앙 디렉터리 기록이 깨졌다');
    const madeBy = buf.readUInt16LE(p + 4);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const external = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    // JSZip 과 요즘 도구는 UTF-8(bit 11)로 이름을 쓴다. 아니어도 UTF-8 로 읽는다 — 안 맞으면 '모르는 이름'이 되어 무시될 뿐이다.
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8').normalize('NFC');
    if (flags & 0x0001) throw new CaseImportError(`암호가 걸린 항목이 있다: ${name}`);
    if (csize === 0xffffffff || usize === 0xffffffff || localOffset === 0xffffffff) throw new CaseImportError('ZIP64 형식은 지원하지 않는다');
    if (usize > LIMITS.fileBytes) throw new CaseImportError(`항목이 너무 크다(${usize} 바이트 > ${LIMITS.fileBytes}): ${name}`);
    totalBytes += usize;
    if (totalBytes > LIMITS.totalBytes) throw new CaseImportError(`풀린 전체 크기가 상한을 넘는다(> ${LIMITS.totalBytes} 바이트)`);
    const hostUnix = (madeBy >> 8) === 3 || (madeBy >> 8) === 19;
    const unixMode = hostUnix ? (external >>> 16) : 0;
    const isSymlink = (unixMode & 0xf000) === 0xa000;
    const isDir = name.endsWith('/') || (hostUnix && (unixMode & 0xf000) === 0x4000) || (external & 0x10) !== 0;
    entries.push({ name, isDir, isSymlink, method, crc, csize, usize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = (e) => {
    const lp = e.localOffset;
    if (lp + 30 > buf.length || buf.readUInt32LE(lp) !== 0x04034b50) throw new CaseImportError(`로컬 헤더가 깨졌다: ${e.name}`);
    const start = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28);
    const end = start + e.csize;
    if (end > buf.length) throw new CaseImportError(`항목 자료가 파일 밖을 가리킨다: ${e.name}`);
    const raw = buf.subarray(start, end);
    let data;
    if (e.method === 0) data = Buffer.from(raw);
    else if (e.method === 8) {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, e.usize) }); }
      catch (error) { throw new CaseImportError(`압축을 풀지 못했다(${error.code || error.message}): ${e.name}`); }
    } else throw new CaseImportError(`지원하지 않는 압축 방식(${e.method}): ${e.name}`);
    if (data.length !== e.usize) throw new CaseImportError(`풀린 크기가 기록과 다르다: ${e.name}`);
    if (typeof zlib.crc32 === 'function' && (zlib.crc32(data) >>> 0) !== e.crc) throw new CaseImportError(`CRC 가 맞지 않는다(손상): ${e.name}`);
    return data;
  };
  return entries.map((e) => ({ ...e, read: () => read(e) }));
}

/* ZIP 항목 → 평평한 파일 목록. 탈출 경로·링크는 여기서 거부하고, 한 겹 폴더로 싸인 ZIP(압축 도구가 그렇게 만든다)은 벗긴다. */
export function flattenZip(entries) {
  const ignored = [];
  const files = [];
  for (const e of entries) {
    const why = unsafeZipName(e.name);
    if (why) throw new CaseImportError(`ZIP 안에 허용되지 않는 경로가 있다(${why}): ${e.name}`);
    if (e.isSymlink) throw new CaseImportError(`ZIP 안에 심볼릭 링크가 있다: ${e.name}`);
    if (e.isDir) continue;
    const base = e.name.split('/').pop();
    if (e.name.startsWith('__MACOSX/') || SKIP_NAMES.has(base) || base.startsWith('._')) { ignored.push(e.name); continue; }
    files.push(e);
  }
  const tops = new Set(files.map((f) => f.name.split('/')[0]));
  const wrapped = files.length && tops.size === 1 && files.every((f) => f.name.includes('/'));
  const out = [];
  for (const f of files) {
    const name = wrapped ? f.name.slice(f.name.indexOf('/') + 1) : f.name;
    if (name.includes('/')) { ignored.push(f.name); continue; }   // 하위 폴더 속 파일은 사례 묶음이 아니다
    out.push({ name, read: f.read, usize: f.usize });
  }
  return { files: out, ignored };
}

/* ───────── JPEG 검사(의존성 없음) ───────── */
export function jpegInfo(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  const info = { width: 0, height: 0, exif: false, xmp: false };
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;   // EOI 또는 SOS — 그 뒤는 영상 자료
    if (i + 4 > buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i + 4, Math.min(buf.length, i + 2 + len));
    if (marker === 0xe1) {
      if (seg.subarray(0, 6).equals(Buffer.from('Exif\0\0', 'latin1'))) info.exif = true;
      if (seg.subarray(0, 28).toString('latin1') === 'http://ns.adobe.com/xap/1.0/') info.xmp = true;
    }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && seg.length >= 5) {
      info.height = seg.readUInt16BE(1);
      info.width = seg.readUInt16BE(3);
    }
    i += 2 + len;
  }
  return info;
}

/* ───────── 내용 읽기 ───────── */
function collectStrings(value, prefix, out) {
  if (typeof value === 'string') out.push([prefix, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => collectStrings(v, `${prefix}[${i}]`, out));
  else if (value && typeof value === 'object') for (const k of Object.keys(value)) collectStrings(value[k], prefix ? `${prefix}.${k}` : k, out);
}

export function privacyFindings(pairs) {
  const hits = [];
  for (const [where, text] of pairs) {
    const pii = [...new Set(piiFindings(text))];
    if (pii.length) hits.push(`${where}: 개인정보(${pii.join('·')})`);
    const ad = AD_BANNED.filter(([, re]) => re.test(text)).map(([name]) => name);
    if (ad.length) hits.push(`${where}: 과장 표현(${ad.join('·')})`);
  }
  return hits;
}

const isJpegName = (name) => /\.jpe?g$/i.test(name);
const photoOrderKey = (name) => {
  const m = name.match(/^(\d{1,3})-/);
  return [m ? Number(m[1]) : 9999, name];
};
const comparePhotos = (a, b) => {
  const d = PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase);
  if (d) return d;
  const [na, sa] = photoOrderKey(a.name);
  const [nb, sb] = photoOrderKey(b.name);
  return na - nb || sa.localeCompare(sb);
};

/* ZIP 파일 목록 → 사례 재료(값·사진·동의·종류). 여기서는 아직 아무것도 쓰지 않는다. */
export function readCaseMaterial(files) {
  const byName = new Map(files.map((f) => [f.name, f]));
  const caseJsonFile = byName.get('case.json');
  const materialFile = [...byName.values()].find((f) => f.name === '사례재료.txt');
  if (!caseJsonFile && !materialFile) throw new CaseImportError('ZIP 에 case.json 도 사례재료.txt 도 없다 — 현장 앱 「📰 사례 내보내기」가 만든 ZIP 인지 확인하라');
  const warnings = [];
  const strings = [];
  for (const f of files) strings.push([`zip:${f.name}`, f.name]);
  const values = {};
  const captions = new Map();
  const phases = new Map();
  let consent = false;
  let kind = '';
  let area = '';
  let tags = [];
  let app = '';
  let jsonDate = '';
  let format = '사례재료.txt';
  let listed = null;

  if (caseJsonFile) {
    let json;
    try { json = JSON.parse(caseJsonFile.read().toString('utf8')); }
    catch (error) { throw new CaseImportError('case.json 을 읽지 못했다: ' + error.message); }
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new CaseImportError('case.json 이 객체가 아니다');
    if (json.format !== CASE_FORMAT) throw new CaseImportError(`case.json format 이 '${CASE_FORMAT}' 가 아니다: ${JSON.stringify(json.format)}`);
    format = CASE_FORMAT;
    collectStrings(json, 'case.json', strings);
    const summary = json.summary && typeof json.summary === 'object' && !Array.isArray(json.summary) ? json.summary : {};
    for (const key of FIELDS) values[key] = typeof summary[key] === 'string' ? summary[key].trim() : '';
    consent = json.consent === true;
    kind = KINDS[String(json.kind || '')] || '';
    area = typeof json.area === 'string' ? json.area.trim() : '';
    tags = Array.isArray(json.tags) ? json.tags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean) : [];
    app = typeof json.app === 'string' ? json.app : '';
    if (typeof json.date === 'string' && validDate(json.date)) jsonDate = json.date;
    if (!Array.isArray(json.photos)) throw new CaseImportError('case.json 의 photos 가 배열이 아니다');
    listed = [];
    for (const [i, ph] of json.photos.entries()) {
      if (!ph || typeof ph !== 'object' || typeof ph.file !== 'string') throw new CaseImportError(`case.json photos[${i}] 에 file 이 없다`);
      const name = ph.file.normalize('NFC');
      if (!byName.has(name)) throw new CaseImportError(`case.json 에 적힌 사진이 ZIP 에 없다: ${name}`);
      if (!isJpegName(name)) throw new CaseImportError(`case.json 사진이 JPEG 가 아니다: ${name}`);
      listed.push(name);
      phases.set(name, PHASES.includes(ph.phase) ? ph.phase : 'mid');
      if (typeof ph.caption === 'string' && ph.caption.trim()) captions.set(name, ph.caption.trim());
    }
  }
  if (materialFile) {
    const text = materialFile.read().toString('utf8');
    const parsed = parseMaterial(text);
    if (!caseJsonFile) {
      for (const key of FIELDS) values[key] = String(parsed[key] || '').trim();
      const m = text.match(/※\s*고객 사진 공개 동의\s*:\s*(받음|미확인)/);
      consent = !!m && m[1] === '받음';
      for (const line of text.matchAll(/^(\d{1,3}-[전중후])\.jpe?g\s*[—–-]\s*(.+)$/gmu) ) captions.set(line[1] + '.jpg', line[2].trim());
      collectStrings(parsed, '사례재료.txt', strings);
      for (const [name, cap] of captions) strings.push([`사례재료.txt:${name}`, cap]);
    }
    if (parsed.address) values.address = parsed.address;
    if (parsed.mapUrl) values.mapUrl = parsed.mapUrl;
  }

  const photoNames = listed || files.map((f) => f.name).filter(isJpegName);
  const extras = files.map((f) => f.name).filter((n) => isJpegName(n) && !photoNames.includes(n));
  if (extras.length) warnings.push(`case.json 에 없는 사진 ${extras.length}장은 넣지 않았다: ${extras.join(', ')}`);
  if (!photoNames.length) throw new CaseImportError('ZIP 에 사진이 없다');
  if (photoNames.length > LIMITS.photos) throw new CaseImportError(`사진이 너무 많다(${photoNames.length}장 > ${LIMITS.photos}장)`);
  const photos = [];
  for (const name of photoNames) {
    const data = byName.get(name).read();
    const info = jpegInfo(data);
    if (!info) throw new CaseImportError(`JPEG 가 아니다: ${name}`);
    if (info.exif || info.xmp) {
      throw new CaseImportError(`사진에 EXIF/XMP 메타데이터가 남아 있다(촬영 위치가 샐 수 있다): ${name} — 앱이 구운 ZIP 사진에는 없다. 메타데이터를 지운 사본으로 다시 만들어라`);
    }
    if (Math.max(info.width, info.height) > 1800) warnings.push(`${name}: 긴 변 ${Math.max(info.width, info.height)}px — 사이트 규격(1800)보다 크다. 그대로 넣었다`);
    const koMatch = name.match(/^\d{1,3}-([전중후])\.jpe?g$/i);
    const phase = phases.get(name) || (koMatch ? PHASE_OF_KO[koMatch[1]] : 'mid');
    if (!phases.has(name) && !koMatch) warnings.push(`${name}: 전/중/후를 알 수 없어 '작업 중'으로 두었다`);
    const caption = captions.get(name) || PHASE_LABEL[phase];
    photos.push({ name, data, phase, caption, width: info.width, height: info.height });
  }
  photos.sort(comparePhotos);
  return { format, values, photos, consent, kind, area, tags, app, jsonDate, strings, warnings };
}

/* ───────── 초안 만들기 ───────── */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function buildDraft(material, options = {}) {
  const { values, photos } = material;
  const kind = KINDS[options.kind || ''] || material.kind || 'leak';
  const date = options.date || material.jsonDate || new Date().toISOString().slice(0, 10);
  if (!validDate(date)) throw new CaseImportError(`날짜가 YYYY-MM-DD 가 아니다: ${date}`);
  if (!values.place || !values.symptom) throw new CaseImportError('동네+단지·증상이 비어 있으면 제목을 만들 수 없다 — ZIP 의 6항목을 채워 다시 내보내라');
  const filled = Object.fromEntries(FIELDS.map((k) => [k, values[k] || EMPTY]));
  const base = makeDraft({ ...filled, address: values.address, mapUrl: values.mapUrl }, new Date(date + 'T00:00:00Z'));
  const slug = options.slug || base.slug;
  if (!SLUG_RE.test(slug) || slug.length > 80) throw new CaseImportError(`slug 는 소문자·숫자·하이픈만(80자 이하): ${slug}`);
  const interior = kind === 'interior';
  const headings = interior
    ? ['현장에서 확인한 상태', '확인 방법', '원인과 범위', '진행한 공사', '걸린 시간']
    : base.body.map((s) => s.h);
  const textSections = base.body.map((s, i) => ({ h: headings[i], p: s.p === EMPTY ? '' : s.p }));
  const files = photos.map((ph, i) => ({ ...ph, to: `assets/cases/${slug}-${i + 1}.jpg` }));
  const byPhase = (phase) => files.filter((f) => f.phase === phase);
  const photoSections = files.map((f) => {
    const n = byPhase(f.phase).length > 1 ? ` ${byPhase(f.phase).indexOf(f) + 1}` : '';
    return { h: `${PHASE_LABEL[f.phase]} 사진${n}`, p: '', img: f.to, imgAlt: f.caption, imgCaption: f.caption };
  });
  const cover = byPhase('after')[0] || files[0];
  const result = [byPhase('after').length ? `완료 사진 ${byPhase('after').length}장 확인` : '', values.duration ? `소요시간 ${values.duration}` : '']
    .filter(Boolean).join('\n');
  const draft = {
    slug,
    title: interior ? `${values.place} ${values.symptom} — 시공 기록` : base.title,
    category: interior ? '시공 사례' : base.category,
    service: interior ? 'interior' : 'leak',
    date,
    readMin: base.readMin,
    cover: interior ? '#7a6f5b' : base.cover,
    published: false,
    image: cover.to,
    imageAlt: cover.caption,
    excerpt: interior
      ? `${values.place}에서 진행한 ${values.symptom} 작업 기록입니다. 현장에서 확인한 내용, 공사 내용과 걸린 시간을 실제 현장 기록으로 정리했습니다.`
      : base.excerpt,
    place: { ...base.place, note: PLACE_NOTE },
    caseSummary: { site: values.place, issue: values.symptom, work: values.work || '', result },
    body: [...textSections, ...photoSections],
    draftSource: {
      format: material.format, app: material.app || '', zip: options.zipName || '',
      importedAt: new Date().toISOString().slice(0, 10), kind, area: material.area || '', tags: material.tags || [], consent: true,
      photoDir: `${DRAFT_DIR.join('/')}/${slug}/`,   // 사진이 지금 있는 곳 — image·body[].img 는 게시할 때 놓일 자리(assets/cases)다
    },
  };
  return { draft, files };
}

/* ───────── 쓰기(.private/case-drafts 안에만) ───────── */
export const DRAFT_DIR = ['.private', 'case-drafts'];

export function importCaseZip(zipPath, options = {}) {
  const root = path.resolve(options.root || ROOT);
  const buf = fs.readFileSync(zipPath);
  const { files, ignored } = flattenZip(readZip(buf));
  const material = readCaseMaterial(files);
  const warnings = [...material.warnings];
  if (ignored.length) warnings.push(`무시한 항목 ${ignored.length}개: ${ignored.join(', ')}`);
  const hits = privacyFindings(material.strings);
  if (hits.length) throw new CaseImportError('공개 글에 넣을 수 없는 값이 있어 초안을 만들지 않았다 — 걸린 칸:', hits);
  if (!material.consent) throw new CaseImportError('고객 사진 공개 동의 기록이 없다(case.json consent:true 또는 재료 글 "동의: 받음") — 동의 없이는 초안을 만들지 않는다');
  const { draft, files: photoFiles } = buildDraft(material, { ...options, zipName: path.basename(zipPath) });

  const draftDir = path.join(root, ...DRAFT_DIR);
  const draftPath = path.join(draftDir, draft.slug + '.json');
  const photoDir = path.join(draftDir, draft.slug);
  if (fs.existsSync(draftPath) || fs.existsSync(photoDir)) throw new CaseImportError(`같은 slug 의 초안이 이미 있다(덮어쓰지 않는다): ${DRAFT_DIR.join('/')}/${draft.slug} — --slug 로 다른 이름을 주어라`);
  // 공개 쪽은 읽기만 — 나중에 옮겨 넣을 때 기존 글·사진과 부딪히지 않게 지금 알린다.
  const sitePath = path.join(root, 'data', 'site.json');
  if (fs.existsSync(sitePath)) {
    const insights = JSON.parse(fs.readFileSync(sitePath, 'utf8')).insights;
    if (Array.isArray(insights) && insights.some((a) => a && a.slug === draft.slug)) throw new CaseImportError(`같은 slug 의 글이 이미 있다(data/site.json): ${draft.slug} — --slug 로 다른 이름을 주어라`);
  }
  const casesDir = path.join(root, 'assets', 'cases');
  const taken = fs.existsSync(casesDir) ? fs.readdirSync(casesDir).filter((n) => n.startsWith(draft.slug + '-')) : [];
  if (taken.length) throw new CaseImportError(`assets/cases/ 에 같은 slug 로 시작하는 사진이 이미 있다: ${taken.slice(0, 5).join(', ')}`);

  const photos = photoFiles.map(({ name, to, phase, caption }) => ({ name, file: path.basename(to), to, phase, caption }));
  if (options.dryRun) return { draft, photos, warnings, written: false };

  fs.mkdirSync(draftDir, { recursive: true });
  fs.mkdirSync(photoDir);   // 이미 있으면 던진다 — 위 확인과 이 줄 사이에 생긴 것도 덮지 않는다
  try {
    for (const f of photoFiles) fs.writeFileSync(path.join(photoDir, path.basename(f.to)), f.data, { flag: 'wx' });
    const temp = draftPath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(draft, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temp, draftPath);
  } catch (error) {
    fs.rmSync(photoDir, { recursive: true, force: true });
    fs.rmSync(draftPath + '.tmp', { force: true });
    throw error;
  }
  return {
    draft, photos, warnings, written: true,
    draftPath: path.relative(root, draftPath).split(path.sep).join('/'),
    photoDir: path.relative(root, photoDir).split(path.sep).join('/'),
  };
}

/* ───────── CLI ───────── */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { out.dryRun = true; continue; }
    if (arg === '--help' || arg === '-h') { out.help = true; continue; }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (!['slug', 'date', 'kind'].includes(key)) throw new CaseImportError('알 수 없는 옵션: ' + arg);
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new CaseImportError(`--${key} 값이 비었습니다`);
      out[key] = argv[++i];
      continue;
    }
    out._.push(arg);
  }
  if (out.kind && !KINDS[out.kind]) throw new CaseImportError('--kind 는 leak 또는 interior');
  if (out.date && !validDate(out.date)) throw new CaseImportError('--date 는 YYYY-MM-DD');
  return out;
}

const USAGE = `사용: node scripts/import-case-zip.mjs <사례.zip> [--slug <slug>] [--date YYYY-MM-DD] [--kind leak|interior] [--dry-run]
  현장 앱 「📰 사례 내보내기」 ZIP 을 검사(동의·개인정보·과장 표현·JPEG/EXIF)하고 비공개 초안까지만 만든다:
    .private/case-drafts/<slug>.json  +  .private/case-drafts/<slug>/<slug>-N.jpg
  게시(data/site.json·posts·assets/cases)는 하지 않는다 — 사람이 읽고 고친 뒤 옮긴다.
  --slug 를 주지 않으면 case-draft-YYYYMMDD-<지문>. --date 는 글의 날짜(기본: case.json date = 준공일, 없으면 오늘).
  --dry-run 은 초안 JSON 만 보여 주고 아무것도 쓰지 않는다.`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args._.length) { console.log(USAGE); return args.help ? 0 : 1; }
  if (args._.length > 1) throw new CaseImportError('ZIP 은 하나만');
  const zipPath = path.resolve(args._[0]);
  if (!fs.existsSync(zipPath)) throw new CaseImportError('ZIP 파일이 없다: ' + zipPath);
  const result = importCaseZip(zipPath, { slug: args.slug, date: args.date, kind: args.kind, dryRun: args.dryRun });
  for (const w of result.warnings) console.log('주의: ' + w);
  const counts = PHASES.map((p) => `${PHASE_LABEL[p]} ${result.photos.filter((x) => x.phase === p).length}`).join(' · ');
  if (!result.written) {
    console.log(`[dry-run] 쓰지 않았다. 초안(published:false) 미리보기 — 사진 ${result.photos.length}장(${counts})`);
    for (const p of result.photos) console.log(`  ${p.name} → ${p.file} (${p.caption})`);
    console.log(JSON.stringify(result.draft, null, 2));
    return 0;
  }
  console.log(`비공개 초안 저장: ${result.draftPath} (published:false — 공개 데이터·HTML·assets 변경 없음)`);
  console.log(`사진 ${result.photos.length}장 (${counts}) → ${result.photoDir}/`);
  for (const p of result.photos) console.log(`  ${p.file}  ← ${PHASE_LABEL[p.phase]} · ${p.caption}`);
  console.log('다음(사람이): 초안을 읽고 고친다 → 사진을 assets/cases/ 로 옮기고 축소본 → data/site.json 에 넣고 published:true → 생성기·sitemap·핀. 절차: docs/import-case-zip-20261109.md');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main()); }
  catch (error) {
    if (error instanceof CaseImportError) {
      console.error('실패: ' + error.message);
      for (const d of error.details) console.error('  - ' + d);
    } else console.error('실패: ' + (error && error.message || error));
    process.exit(1);
  }
}
