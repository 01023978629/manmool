#!/usr/bin/env node
/* 현장 앱 「📰 사례 내보내기」(v321) zip 을 홈페이지 비공개 사례 초안으로 들인다.
 *
 * 사용 예:
 *   node scripts/import-case-zip.mjs ~/Downloads/사례_목상동_평화로운아파트_20260926.zip --slug moksang-ceiling-leak
 *   node scripts/import-case-zip.mjs ./사례_폴더 --slug moksang-ceiling-leak      (zip 을 푼 폴더도 된다)
 *   --no-variants  사진 축소본(scripts/build-image-variants.py)을 돌리지 않고 명령만 안내한다
 *
 * 왜: 앱의 zip 은 「NN-전|중|후.jpg + 사례재료.txt」인데 new-case-post.mjs 는 글 6항목만 받고
 * 사진 입력이 없었다. 사진을 손으로 옮기고 이름을 짓다 보면 원본(EXIF 있는 폰 사진)이나
 * 동의 없는 사진이 섞여 들어간다. 이 도구는 아래를 **전부 통과해야** 쓰기 시작한다
 * (하나라도 걸리면 저장소에 아무것도 남기지 않는다).
 *   1. 사례재료.txt 의 '※ 고객 사진 공개 동의: 받음' — 그 밖의 값('미확인')이나 줄이 없으면 거부.
 *      assets/cases 에 들어간 사진은 병합되는 순간 공개 주소로 열린다(글이 비공개여도).
 *   2. 6항목·사진 공정 이름·파일 이름을 js/pii-rules.js 로 검사(new-case-post.mjs 의 piiFindings —
 *      규칙을 여기 다시 적지 않는다).
 *   3. 파일 이름은 앱 규칙(hjCaseFileName) 'NN-전|중|후.jpg' 와 사례재료.txt 뿐. 목록에 없는 사진은 거부 —
 *      묶음에 손으로 끼워 넣은 사진은 앱의 동의·EXIF 제거를 거치지 않았다.
 *   4. 사진마다 JPEG 구조·긴 변 1800 이하(앱 HJ_CASE_MAX_EDGE)·EXIF/XMP/IPTC 없음.
 *      앱은 canvas 로 다시 구워 위치 정보를 뺀다 — 1800 을 넘거나 EXIF 가 있으면 앱을 거치지 않은 원본이다.
 * 그다음 assets/cases/<slug>-NN.jpg 로 복사하고, .private/case-drafts/<slug>.json 에 published:false
 * 초안을 쓴다. 사진 설명(imgAlt)·소제목은 'TODO:' 로 남긴다 — 사진을 보지 않고 지어내지 않는다.
 * 공개 글에 'TODO:' 가 남으면 scripts/ensure-case-import.mjs 가 배포를 막는다.
 *
 * zip 은 node 기본 모듈(zlib)로 읽는다 — 대표 PC(Windows)에는 unzip 명령이 없고 외부 패키지도 쓰지 않는다.
 * 앱(JSZip)의 기본 저장 방식(STORE)과 DEFLATE 만 받는다. 암호·ZIP64 는 폴더로 풀어서 넣으라고 안내한다. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeDraft, parseMaterial, piiFindings } from './new-case-post.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.MANMOOL_CASE_ROOT || DEFAULT_ROOT);

export const MATERIAL_FILE = '사례재료.txt';
// 앱 hjCaseFileName: pad(i+1)+'-'+전|중|후+'.jpg'. 100장을 넘으면 세 자리가 된다.
export const PHOTO_NAME_RE = /^(\d{2,3})-(전|중|후)\.jpg$/;
// 앱 hjCaseText 의 '사진: N장 (시공 전 a · 작업 중 b · 완료 c)' 와 같은 말. 공개 글 사진 설명도 이 말을 쓴다.
export const SIDE_CAPTION = Object.freeze({ '전': '시공 전', '중': '작업 중', '후': '완료' });
export const APP_MAX_EDGE = 1800;              // 앱 HJ_CASE_MAX_EDGE — 홈페이지 사례 사진 규격과 같다
// scripts/prerender-posts.py 의 VARIANT_RE 가 받는 경로여야 한다 — 벗어나면 srcset·치수가 안 붙는다(검사가 대조한다).
export const CASE_IMG_RE = /^assets\/cases\/([A-Za-z0-9._-]+)\.jpg$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TODO_MARK = 'TODO:';
export const TODO_ALT = TODO_MARK + ' 사진을 보고 설명';
const TODO_HEADING = TODO_MARK + ' 사진 소제목';
const TODO_PARA = TODO_MARK + ' 이 사진에서 보이는 것을 한두 문장으로';

const MAX_INPUT = 500 * 1024 * 1024;           // zip 한 개
const MAX_ENTRY = 25 * 1024 * 1024;            // 풀린 파일 한 개 — 1800px JPEG 은 1MB 안팎이다
const MAX_TOTAL = 600 * 1024 * 1024;
const MAX_ENTRIES = 2000;

const fail = (msg) => { throw new Error(msg); };

/* ── zip 읽기 (node:zlib 만) ─────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function decodeName(raw, flags, extra) {
  if (flags & 0x0800) return raw.toString('utf8');
  // Info-ZIP Unicode Path(0x7075) — JSZip 이 UTF-8 이름에 같이 붙인다.
  for (let i = 0; i + 4 <= extra.length;) {
    const id = extra.readUInt16LE(i), size = extra.readUInt16LE(i + 2);
    if (id === 0x7075 && size >= 5 && i + 4 + size <= extra.length) return extra.subarray(i + 9, i + 4 + size).toString('utf8');
    i += 4 + size;
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { /* 아래로 */ }
  try { return new TextDecoder('euc-kr').decode(raw); } catch { return raw.toString('latin1'); }   // 한글 윈도우 압축
}

export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xFFFF); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) fail('zip 끝머리를 찾지 못했습니다 — 내려받기가 끊긴 파일일 수 있습니다');
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xFFFF || cdOffset === 0xFFFFFFFF) fail('ZIP64 형식은 읽지 않습니다 — 압축을 풀어 폴더로 넣어 주세요');
  if (count > MAX_ENTRIES) fail(`zip 안 파일이 너무 많습니다(${count}개)`);
  const entries = [];
  let p = cdOffset, total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) fail('zip 목록이 깨졌습니다');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = decodeName(buf.subarray(p + 46, p + 46 + nlen), flags, buf.subarray(p + 46 + nlen, p + 46 + nlen + xlen)).normalize('NFC');
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;                                   // 폴더 항목
    if (flags & 0x0001) fail('암호가 걸린 zip 입니다 — 앱이 만든 묶음이 아닙니다');
    if (method !== 0 && method !== 8) fail(`zip 압축 방식(${method})을 읽지 못합니다 — 압축을 풀어 폴더로 넣어 주세요`);
    if (usize > MAX_ENTRY) fail(`zip 안 파일 하나가 너무 큽니다(${Math.round(usize / 1048576)}MB)`);
    total += usize;
    if (total > MAX_TOTAL) fail('zip 을 풀면 너무 큽니다');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) fail('zip 파일 머리가 깨졌습니다');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + csize > buf.length) fail('zip 이 중간에 끊겼습니다');
    const packed = buf.subarray(start, start + csize);
    let data;
    try { data = method === 0 ? Buffer.from(packed) : zlib.inflateRawSync(packed, { maxOutputLength: Math.max(1, usize) }); }
    catch { fail('zip 안 파일을 풀지 못했습니다(손상)'); }
    if (data.length !== usize || crc32(data) !== crc) fail('zip 안 파일이 손상됐습니다(검사값 불일치)');
    entries.push({ name, data });
  }
  return entries;
}

function readFolder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => {
      const file = path.join(dir, d.name);
      if (fs.statSync(file).size > MAX_ENTRY) fail('폴더 안 파일 하나가 너무 큽니다');
      return { name: d.name.normalize('NFC'), data: fs.readFileSync(file) };   // macOS 는 한글 이름을 NFD 로 준다
    });
}

// 압축 프로그램·운영체제가 끼워 넣는 부스러기는 건너뛴다(사진도 글도 아니다).
const isJunk = (name) => /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name) ||
  /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name);

export function readPack(input) {
  const stat = fs.statSync(input);
  let entries;
  if (stat.isDirectory()) entries = readFolder(input);
  else {
    if (stat.size > MAX_INPUT) fail('zip 이 너무 큽니다');
    const buf = fs.readFileSync(input);
    if (buf.length < 4 || (buf.readUInt32LE(0) !== 0x04034b50 && buf.readUInt32LE(0) !== 0x06054b50)) {
      fail('zip 파일이 아닙니다 — 앱 「📰 사례 내보내기」가 만든 .zip 이나 그걸 푼 폴더를 주세요');
    }
    entries = readZip(buf);
  }
  const files = new Map();
  for (const e of entries) {
    if (isJunk(e.name)) continue;
    const base = e.name.split('/').pop();                  // 폴더째 다시 압축한 zip 도 받는다
    if (base.startsWith('.')) continue;
    if (files.has(base)) fail(`같은 이름의 파일이 두 번 들어 있습니다: ${base}`);
    files.set(base, e.data);
  }
  return files;
}

/* ── JPEG 검사 ───────────────────────────────────────────────────────────── */
const SOF = new Set([0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF]);
const EXIF_SIG = Buffer.from('Exif\0\0', 'latin1');
const XMP_SIG = Buffer.from('http://ns.adobe.com/xap/1.0/', 'latin1');

/* Safari(iOS·macOS)의 canvas.toBlob('image/jpeg') 는 위치·기기 없이 색공간·픽셀 크기만 든 작은 EXIF 를 쓴다
   (IFD0 = Exif IFD 포인터 하나, Exif IFD = ColorSpace·PixelXDimension·PixelYDimension). 앱(hjCaseJpeg)도 canvas.toBlob
   이라 아이폰에서 내보낸 zip 에는 이 EXIF 가 붙는다 — 그걸 원본으로 오해해 전부 거부하면 안 된다.
   허용은 좁게, 목록 방식으로: 아래 태그 말고 하나라도 있거나(GPS 0x8825·Make·Model·DateTime·MakerNote 등),
   썸네일 IFD 가 이어지거나, 구조를 끝까지 못 읽으면 '위치가 실릴 수 있는 EXIF' 로 보고 거부한다. */
const BENIGN_IFD0 = new Set([0x8769]);                        // Exif IFD 포인터
const BENIGN_EXIF_IFD = new Set([0x9000, 0xA000, 0xA001, 0xA002, 0xA003]);   // 버전 두 개·ColorSpace·픽셀 가로·세로
export function exifIsBenign(seg) {
  if (seg.length < 6 + 8 || !seg.subarray(0, 6).equals(EXIF_SIG)) return false;
  const t = seg.subarray(6);
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (!le && !(t[0] === 0x4D && t[1] === 0x4D)) return false;
  const u16 = (o) => (o + 2 <= t.length ? (le ? t.readUInt16LE(o) : t.readUInt16BE(o)) : -1);
  const u32 = (o) => (o + 4 <= t.length ? (le ? t.readUInt32LE(o) : t.readUInt32BE(o)) : -1);
  if (u16(2) !== 42) return false;
  // IFD 하나를 읽어 태그 목록을 돌려준다. 다음 IFD(썸네일)가 이어지면 null.
  const readIfd = (off) => {
    const n = u16(off);
    if (off < 8 || n < 0 || off + 2 + n * 12 + 4 > t.length) return null;
    const tags = new Map();
    for (let k = 0; k < n; k++) tags.set(u16(off + 2 + k * 12), off + 2 + k * 12);
    if (u32(off + 2 + n * 12) !== 0) return null;
    return tags;
  };
  const ifd0 = readIfd(u32(4));
  if (!ifd0 || ![...ifd0.keys()].every((tag) => BENIGN_IFD0.has(tag))) return false;
  if (!ifd0.has(0x8769)) return true;
  const exif = readIfd(u32(ifd0.get(0x8769) + 8));
  return !!exif && [...exif.keys()].every((tag) => BENIGN_EXIF_IFD.has(tag));
}

/* 치수와 메타데이터 자리(EXIF·XMP·IPTC)를 SOS 전까지 마커로 읽는다. 위치 정보는 이 자리에 실린다. */
export function inspectJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return { error: 'JPEG 이 아닙니다' };
  const meta = new Set();
  const benignAt = new Set();   // Safari canvas 의 크기만 든 EXIF 가 시작하는 자리
  let width = 0, height = 0, i = 2, scan = false;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xFF) return { error: 'JPEG 구조를 읽지 못했습니다' };
    let marker = buf[i + 1];
    while (marker === 0xFF && i + 2 < buf.length) marker = buf[++i + 1];   // 채움 바이트
    i += 2;
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8)) continue; // 길이 없는 마커
    if (marker === 0xD9) break;
    if (i + 2 > buf.length) return { error: 'JPEG 이 중간에 끊겼습니다' };
    const len = buf.readUInt16BE(i);
    if (len < 2 || i + len > buf.length) return { error: 'JPEG 구조를 읽지 못했습니다' };
    const seg = buf.subarray(i + 2, i + len);
    if (marker === 0xE1 && exifIsBenign(seg)) benignAt.add(i + 2);
    else if (marker === 0xE1) meta.add(seg.subarray(0, 6).equals(EXIF_SIG) ? 'EXIF' : seg.subarray(0, XMP_SIG.length).equals(XMP_SIG) ? 'XMP' : 'APP1');
    else if (marker === 0xED) meta.add('IPTC');
    else if (SOF.has(marker) && seg.length >= 5) { height = seg.readUInt16BE(1); width = seg.readUInt16BE(3); }
    if (marker === 0xDA) { scan = true; break; }
    i += len;
  }
  if (!scan || !width || !height) return { error: '사진 크기를 읽지 못했습니다' };
  // 마커를 벗어난 자리에 숨은 EXIF 머리도 본다 — 6바이트가 우연히 맞을 확률은 무시할 만하다.
  // 봐 준 Safari EXIF 자리 하나만 빼고 본다.
  for (let at = buf.indexOf(EXIF_SIG); at >= 0; at = buf.indexOf(EXIF_SIG, at + 1)) {
    if (!benignAt.has(at)) { meta.add('EXIF'); break; }
  }
  return { width, height, meta: [...meta] };
}

/* ── 사례재료.txt ─────────────────────────────────────────────────────────── */
const CONSENT_RE = /^※[ \t]*고객 사진 공개 동의[ \t]*:[ \t]*(.*?)[ \t]*$/gm;
const PHOTO_LINE_RE = /^(\d{2,3}-(?:전|중|후)\.jpg)[ \t]*—[ \t]*(.*?)[ \t]*$/gm;

export function parseCasePack(text) {
  // CRLF 는 따로 바꾸지 않아도 된다 — JS 정규식의 '.' 은 \r 을 먹지 않고 m 플래그의 '$' 는 \r 앞에서도 맞는다
  // (그래서 동의가 '받음\r' 로 잡히지 않는다). 테스트 '윈도 메모장으로 연 사례재료.txt(BOM·CRLF)' 가 이것을 지킨다.
  const src = String(text || '').replace(/^\uFEFF/, '').normalize('NFC');
  const consents = [...src.matchAll(CONSENT_RE)].map((m) => m[1]);
  const listed = new Map();
  for (const m of src.matchAll(PHOTO_LINE_RE)) listed.set(m[1], m[2]);
  const date = (src.match(/^\[현장 사례 재료\][ \t]*(\d{4}-\d{2}-\d{2})/m) || [])[1] || '';
  return { values: parseMaterial(src), consents, listed, date };
}

// 동의는 '받음' 한 가지만 통과. 줄이 없거나('옛 형식'), 하나라도 다른 값이면 거부한다.
export function consentProblem(consents) {
  if (!consents.length) return '사례재료.txt 에 「※ 고객 사진 공개 동의」 줄이 없습니다 — 앱 「📰 사례 내보내기」로 다시 만드세요';
  if (consents.some((v) => v !== '받음')) return `고객 사진 공개 동의가 '받음'이 아닙니다(${consents.join(', ')}) — 동의를 받은 뒤 앱에서 다시 내보내세요`;
  return '';
}

/* ── 검사 전부 → 쓸 계획 ─────────────────────────────────────────────────── */
export function planImport(files, slug, { root = ROOT, now = new Date() } = {}) {
  if (!slug) fail('--slug 가 필요합니다 — 공개 주소 posts/<slug>.html 과 사진 이름에 쓰는 영문 소문자·숫자·하이픈');
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 80) {
    fail(`slug 는 영문 소문자·숫자·하이픈만 씁니다(3~80자, 예: moksang-ceiling-leak): ${JSON.stringify(slug)}`);
  }
  // 1) 파일 이름 — 개인정보 먼저(이름을 화면에 다시 찍지 않는다), 그다음 앱 규칙
  const names = [...files.keys()];
  const piiNames = names.filter((n) => piiFindings(n).length);
  if (piiNames.length) {
    fail(`파일 이름 ${piiNames.length}개에 개인정보로 보이는 값(${[...new Set(piiNames.flatMap(piiFindings))].join(', ')})이 있어 거부했습니다 — 앱에서 다시 내보내세요`);
  }
  const odd = names.filter((n) => n !== MATERIAL_FILE && !PHOTO_NAME_RE.test(n));
  if (odd.length) fail(`앱 규칙(NN-전|중|후.jpg, 사례재료.txt)에 없는 파일이 있습니다: ${odd.slice(0, 5).join(', ')}${odd.length > 5 ? ' 외' : ''}`);
  if (!files.has(MATERIAL_FILE)) fail(`${MATERIAL_FILE} 가 없습니다 — 앱 「📰 사례 내보내기」가 만든 zip(또는 그걸 푼 폴더)인지 확인하세요`);

  // 2) 동의 → 글 6항목·사진 공정 이름 개인정보
  const pack = parseCasePack(files.get(MATERIAL_FILE).toString('utf8'));
  const consent = consentProblem(pack.consents);
  if (consent) fail(consent);
  const phaseFindings = piiFindings([...pack.listed.values()].join('\n'));
  if (phaseFindings.length) fail('사진 공정 이름에 개인정보로 보이는 값이 있어 거부했습니다: ' + [...new Set(phaseFindings)].join(', '));
  const draft = makeDraft(pack.values, now);             // 6항목 누락·개인정보는 여기서 거부된다

  // 3) 사진 — 목록과 대조, JPEG 검사
  const photos = names.filter((n) => PHOTO_NAME_RE.test(n)).map((n) => {
    const [, num, side] = n.match(PHOTO_NAME_RE);
    return { name: n, num, side, data: files.get(n), phase: pack.listed.get(n) };
  }).sort((a, b) => Number(a.num) - Number(b.num));
  if (!photos.length) fail('사진이 한 장도 없습니다');
  const unlisted = photos.filter((ph) => ph.phase === undefined).map((ph) => ph.name);
  if (unlisted.length) fail(`사례재료.txt 사진 목록에 없는 사진이 있습니다(앱을 거치지 않은 사진): ${unlisted.join(', ')}`);
  if (new Set(photos.map((ph) => ph.num)).size !== photos.length) fail('같은 번호의 사진이 두 장 있습니다');
  for (const ph of photos) {
    const info = inspectJpeg(ph.data);
    if (info.error) fail(`${ph.name}: ${info.error}`);
    if (info.meta.length) fail(`${ph.name}: 사진에 ${info.meta.join('·')} 정보가 남아 있습니다(촬영 위치가 실릴 수 있는 자리) — 앱에서 다시 내보내세요`);
    if (Math.max(info.width, info.height) > APP_MAX_EDGE) {
      fail(`${ph.name}: 긴 변이 ${Math.max(info.width, info.height)}px 입니다(앱은 ${APP_MAX_EDGE}px 이하로 굽는다) — 앱을 거치지 않은 원본으로 보입니다`);
    }
    Object.assign(ph, { width: info.width, height: info.height });
    ph.img = `assets/cases/${slug}-${ph.num}.jpg`;
    if (!CASE_IMG_RE.test(ph.img)) fail(`사진 경로가 사례 사진 규칙에 맞지 않습니다: ${ph.img}`);
  }
  // 앱은 굽기에 실패한 사진을 zip 에서 빼고 목록에는 남긴다 — 거부할 일은 아니지만 알려 준다.
  const missing = [...pack.listed.keys()].filter((n) => !files.has(n));

  // 4) 이미 있는 것과 겹치지 않는지 — 덮어쓰지 않는다
  const draftPath = path.join(root, '.private', 'case-drafts', slug + '.json');
  if (fs.existsSync(draftPath)) fail(`같은 slug 의 초안이 이미 있습니다: ${path.relative(root, draftPath)}`);
  const sitePath = path.join(root, 'data', 'site.json');
  if (fs.existsSync(sitePath)) {
    const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
    if ((site.insights || []).some((x) => x && x.slug === slug)) fail(`data/site.json 에 이미 있는 slug 입니다: ${slug}`);
  }
  const taken = photos.filter((ph) => fs.existsSync(path.join(root, ph.img)));
  if (taken.length) fail(`이미 있는 사진과 이름이 겹칩니다: ${taken.map((ph) => ph.img).join(', ')} — 다른 slug 를 쓰세요`);

  // 5) 초안 — 사진은 글 흐름에 맞춰 끼운다: 전 → 증상 뒤, 중·후 → 공사 내용 뒤
  draft.slug = slug;
  // 앱 공정 이름은 글쓴이에게 주는 힌트다. '공정 미지정'·사진 설명과 같은 말('시공 전')은 싣지 않는다.
  const hint = (ph) => {
    const flat = (v) => String(v || '').replace(/\s+/g, '');
    return ph.phase && ph.phase !== '공정 미지정' && flat(ph.phase) !== flat(SIDE_CAPTION[ph.side]) ? ` (앱 공정: ${ph.phase})` : '';
  };
  const block = (ph) => ({
    h: TODO_HEADING,
    p: TODO_PARA + hint(ph),
    img: ph.img,
    imgAlt: TODO_ALT,
    imgCaption: SIDE_CAPTION[ph.side],
  });
  const of = (side) => photos.filter((ph) => ph.side === side).map(block);
  // makeDraft 의 소제목으로 자리를 찾는다 — 순서가 바뀌어도 사진이 엉뚱한 문단에 붙지 않게.
  // 소제목을 못 찾으면 본문 끝에 붙인다(사진을 빠뜨리지는 않는다).
  const after = (h, blocks) => {
    const at = draft.body.findIndex((b) => b.h === h);
    draft.body.splice(at < 0 ? draft.body.length : at + 1, 0, ...blocks);
  };
  after('진행한 공사', [...of('중'), ...of('후')]);
  after('현장에서 확인한 증상', of('전'));
  const cover = photos.filter((ph) => ph.side === '후')[0] || photos[photos.length - 1];
  draft.image = cover.img;
  draft.imageAlt = TODO_ALT;
  return { draft, draftPath, photos, missing, materialDate: pack.date };
}

/* ── 쓰기 — 검사를 다 지난 뒤에만. 중간에 실패하면 쓴 사진을 되돌린다 ─────── */
export function writeImport(plan, { root = ROOT } = {}) {
  const written = [];
  try {
    fs.mkdirSync(path.join(root, 'assets', 'cases'), { recursive: true });
    for (const ph of plan.photos) {
      const dest = path.join(root, ph.img);
      fs.writeFileSync(dest, ph.data, { flag: 'wx' });   // 앱이 구운 바이트 그대로 — 다시 압축하지 않는다
      written.push(dest);
    }
    fs.mkdirSync(path.dirname(plan.draftPath), { recursive: true });
    const temp = plan.draftPath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(plan.draft, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temp, plan.draftPath);
  } catch (error) {
    for (const f of written) { try { fs.unlinkSync(f); } catch { /* 이미 없음 */ } }
    try { fs.unlinkSync(plan.draftPath + '.tmp'); } catch { /* 없음 */ }
    throw new Error(`쓰는 중 실패(${error.message}) — 복사한 사진 ${written.length}장은 되돌렸습니다`);
  }
}

const VARIANTS_HINT = 'python3 scripts/build-image-variants.py   (Pillow 필요 — 안 돌리면 ensure-image-variants 가 배포를 막는다)';

function buildVariants(root) {
  const script = path.join(root, 'scripts', 'build-image-variants.py');
  if (!fs.existsSync(script)) return false;
  const r = spawnSync('python3', [script], { cwd: root, stdio: 'inherit' });
  return !r.error && r.status === 0;
}

/* 공개 글(published 가 false 가 아닌 것)에 남은 'TODO:' 자리를 찾는다 — ensure-case-import.mjs 가 쓴다. */
export function todoLeaks(site) {
  const out = [];
  const walk = (v, where) => {
    if (typeof v === 'string') { if (v.includes(TODO_MARK)) out.push(where); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  for (const a of (site && site.insights) || []) {
    if (!a || a.published === false) continue;
    walk(a, String(a.slug || '(slug 없음)'));
  }
  return out;
}

function parseArgs(argv) {
  const out = { variants: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-variants') out.variants = false;
    else if (arg === '--slug') {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail('--slug 값이 비었습니다');
      out.slug = argv[++i];
    } else if (arg.startsWith('--')) fail('알 수 없는 옵션: ' + arg);
    else if (out.input) fail('입력은 zip(또는 폴더) 하나만 받습니다');
    else out.input = arg;
  }
  if (!out.input) fail('사용법: node scripts/import-case-zip.mjs <사례_….zip | 푼 폴더> --slug <영문-slug> [--no-variants]');
  if (!out.slug) fail('--slug 가 필요합니다 — 공개 주소 posts/<slug>.html 과 사진 이름에 쓰는 영문 소문자·숫자·하이픈');
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = path.resolve(args.input);
  if (!fs.existsSync(input)) fail('입력이 없습니다: ' + args.input);
  const plan = planImport(readPack(input), args.slug);
  writeImport(plan);
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  console.log(`사례 사진 ${plan.photos.length}장 → ${plan.photos.map((ph) => ph.img).join(', ')}`);
  console.log(`비공개 초안 저장: ${rel(plan.draftPath)} (published:false — 공개 데이터·HTML 변경 없음)`);
  if (plan.missing.length) console.log(`참고: 사례재료.txt 목록에 있지만 묶음에 없는 사진 ${plan.missing.length}장(${plan.missing.join(', ')}) — 앱에서 굽기에 실패한 사진입니다`);
  if (!args.variants) console.log('사진 축소본은 만들지 않았습니다. 커밋 전에: ' + VARIANTS_HINT);
  else if (buildVariants(ROOT)) console.log('사진 축소본(480w·960w) 생성 완료 — assets/cases/resized/');
  else console.error('주의: 사진 축소본을 만들지 못했습니다. 직접 실행하세요: ' + VARIANTS_HINT);
  console.log([
    '다음 할 일:',
    `  1) 초안의 '${TODO_MARK}' 자리(사진 소제목·설명·표지 설명)를 사진을 보고 채운다 — 공개 글에 남으면 ensure-case-import 가 막는다`,
    '  2) origin/main 의 data/site.json insights 에 옮기고 published:false 를 지운다',
    '  3) python3 scripts/prerender-posts.py, sitemap.xml 에 글 줄·blog.html lastmod',
    '  ※ assets/cases 사진은 병합되면 글이 비공개여도 주소로 열린다 — 글을 공개할 때 같이 커밋하라',
  ].join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('실패: ' + error.message); process.exit(1); }
}
