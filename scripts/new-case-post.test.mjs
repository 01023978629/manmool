import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeDraft, parseMaterial, piiFindings } from './new-case-post.mjs';
import {
  APP_MAX_EDGE, CASE_IMG_RE, PHOTO_NAME_RE, SIDE_CAPTION, TODO_ALT, TODO_MARK, inspectJpeg, planImport, todoLeaks, writeImport,
} from './import-case-zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS  ' + name); };

const safe = {
  place: '서구 시험단지', symptom: '천장 물자국', method: '압력 검사와 청음 탐지',
  cause: '세대 전용 급수관 연결부', work: '연결부 교체 후 압력 재검사', duration: '약 두 시간',
};

test('6항목으로 비공개 초안을 만든다', () => {
  const draft = makeDraft(safe, new Date('2026-08-10T00:00:00Z'));
  assert.equal(draft.published, false);
  assert.equal(draft.service, 'leak');
  assert.equal(draft.body.length, 5);
  assert.match(draft.slug, /^case-draft-20260810-[a-f0-9]{10}$/);
});
test('현장앱 후기 재료 1~6번 형식을 읽는다', () => {
  const text = '[현장 후기 재료]\n1. 동네+단지: 서구 시험단지   ← 동·호수는 절대 넣지 마라\n2. 어떤 연락: 천장 물자국\n3. 탐지 방법: 압력 검사\n4. 원인+전유/공용: 전용 급수관\n5. 공사 내용: 연결부 교체\n6. 걸린 시간: 약 두 시간';
  assert.deepEqual(parseMaterial(text), {
    place: '서구 시험단지', symptom: '천장 물자국', method: '압력 검사',
    cause: '전용 급수관', work: '연결부 교체', duration: '약 두 시간',
  });
});
/* 현장 앱 v321 「📰 사례 내보내기」 zip 의 사례재료.txt — 앱 hjCaseText 가 실제로 내는 글자 그대로다.
   (아래 '이웃 저장소 대조' 가 hyeonjang/index.html 의 함수를 직접 돌려 이 글과 같은지 본다.)
   라벨이 옛 형식과 다르다: '어떤 연락(증상)'·'탐지·확인 방법'·'원인 (전유/공용)'. */
const V321_TEXT = [
  '[현장 사례 재료] 2026-09-26',
  '1. 동네+단지: 서구 시험단지',
  '2. 어떤 연락(증상): 아랫집 천장 물자국',
  '3. 탐지·확인 방법: 내시경으로 벽 속 배관 확인',
  '4. 원인 (전유/공용): 매립 배관 이음부 — 세대 전유',
  '5. 공사 내용: 배관 교체 후 보온',
  '6. 걸린 시간: 당일 09:30~15:40',
  '사진: 4장 (시공 전 1 · 작업 중 2 · 완료 1)',
  '01-전.jpg — 시공 전',
  '02-중.jpg — 배관 교체',
  '03-중.jpg — 공정 미지정',
  '04-후.jpg — 완료',
  '※ 고객 사진 공개 동의: 받음',
  '※ 동·호수·고객 연락처·출입 번호는 넣지 않았습니다. 사진의 촬영 위치 정보(EXIF)는 뺐습니다.',
].join('\n');
const V321_VALUES = {
  place: '서구 시험단지', symptom: '아랫집 천장 물자국', method: '내시경으로 벽 속 배관 확인',
  cause: '매립 배관 이음부 — 세대 전유', work: '배관 교체 후 보온', duration: '당일 09:30~15:40',
};
test('현장앱 v321 사례재료.txt 형식(어떤 연락(증상)·탐지·확인 방법·원인 (전유/공용))을 6항목 모두 읽는다', () => {
  assert.deepEqual(parseMaterial(V321_TEXT), V321_VALUES);
  assert.equal(makeDraft(parseMaterial(V321_TEXT)).published, false);
});
test('윈도에서 고친 사례재료.txt(BOM·CRLF)도 6항목을 읽는다', () => {
  assert.deepEqual(parseMaterial('\uFEFF' + V321_TEXT.replace(/\n/g, '\r\n')), V321_VALUES);
});
test("옛 형식의 '(직접 입력)' 자리는 빈 칸으로 보고 초안을 거부한다", () => {
  const text = '[현장 후기 재료]\n1. 동네+단지: 서구 시험단지   ← 동·호수는 절대 넣지 마라\n2. 어떤 연락: (직접 입력)\n3. 탐지 방법: (직접 입력)\n4. 원인+전유/공용: (직접 입력)\n5. 공사 내용: 연결부 교체\n6. 걸린 시간: (직접 입력)';
  assert.deepEqual(parseMaterial(text), { place: '서구 시험단지', work: '연결부 교체' });
  assert.throws(() => makeDraft(parseMaterial(text)), /필수 항목 누락: 증상, 탐지 방법, 원인\+전유\/공용, 걸린 시간/);
});
test('값이 빈 줄은 다음 줄을 값으로 삼키지 않는다', () => {
  const got = parseMaterial(V321_TEXT.replace('2. 어떤 연락(증상): 아랫집 천장 물자국', '2. 어떤 연락(증상): '));
  assert.equal(got.symptom, undefined);
  assert.equal(got.method, V321_VALUES.method);
});

for (const [label, value] of [
  ['동', '101동'], ['호', '202호'], ['휴대전화', '010-1234-5678'],
  ['고객명 표기', '고객명: 김철수'], ['고객 호칭', '김철수 고객님'],
]) {
  test('개인정보 거부: ' + label, () => assert.throws(() => makeDraft({ ...safe, symptom: value }), /개인정보/));
}
test('PII 탐지기는 안전한 동네 이름을 막지 않는다', () => assert.deepEqual(piiFindings('월평동 누수 현장'), []));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-case-post-'));
try {
  fs.mkdirSync(path.join(temp, 'data'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'posts'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'data', 'site.json'), path.join(temp, 'data', 'site.json'));
  fs.copyFileSync(path.join(ROOT, 'blog.html'), path.join(temp, 'blog.html'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'prerender-posts.py'), path.join(temp, 'scripts', 'prerender-posts.py'));
  for (const file of fs.readdirSync(path.join(ROOT, 'posts'))) {
    if (file.endsWith('.html')) fs.copyFileSync(path.join(ROOT, 'posts', file), path.join(temp, 'posts', file));
  }
  const argv = Object.entries(safe).flatMap(([key, value]) => ['--' + key, value]);
  const result = spawnSync(NODE, [path.join(ROOT, 'scripts', 'new-case-post.mjs'), ...argv], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, MANMOOL_CASE_ROOT: temp },
  });
  test('CLI가 PC 전용 폴더에 초안을 저장한다', () => assert.equal(result.status, 0, result.stderr || result.stdout));
  const site = JSON.parse(fs.readFileSync(path.join(temp, 'data', 'site.json'), 'utf8'));
  const draftDir = path.join(temp, '.private', 'case-drafts');
  const draftFiles = fs.readdirSync(draftDir).filter((file) => file.endsWith('.json'));
  const draft = JSON.parse(fs.readFileSync(path.join(draftDir, draftFiles[0]), 'utf8'));
  test('초안 파일이 하나 생성된다', () => assert.equal(draftFiles.length, 1));
  test('CLI 결과는 published:false 다', () => assert.equal(draft.published, false));
  test('공개 site.json에는 초안이 들어가지 않는다', () => assert.equal(site.insights.some((x) => x && x.slug === draft.slug), false));
  test('초안 정적 HTML은 생성되지 않는다', () => assert.equal(fs.existsSync(path.join(temp, 'posts', draft.slug + '.html')), false));
  test('초안은 blog.html 목록에 노출되지 않는다', () => assert.equal(fs.readFileSync(path.join(temp, 'blog.html'), 'utf8').includes(draft.slug), false));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

/* ── 이웃 저장소 대조 — 현장 앱이 실제로 내는 글자와 위 V321_TEXT 가 같은지 ───────────────
   hyeonjang/index.html 의 hjCaseText·HJ_CASE_FIELDS 를 읽어 그대로 돌린다(사본을 만들지 않는다).
   앱 라벨이 바뀌면 여기서 먼저 빨간불이 난다 — 그러면 parseMaterial 과 이 픽스처를 같이 고친다.
   CI 에는 이웃 저장소가 없어 건너뛴다. 로컬: HYEONJANG_ROOT=<현장 앱 저장소> 또는 ../hyeonjang */
{
  const appDir = process.env.HYEONJANG_ROOT || path.resolve(ROOT, '..', 'hyeonjang');
  const appFile = path.join(appDir, 'index.html');
  if (!fs.existsSync(appFile)) console.log('SKIP  이웃 저장소 대조 — ' + appFile + ' 없음');
  else {
    const src = fs.readFileSync(appFile, 'utf8');
    const grab = (head) => {   // 여는 괄호부터 짝이 맞는 닫는 괄호까지(문자열 안 괄호는 건너뛴다)
      const at = src.indexOf(head);
      assert.ok(at >= 0, '현장 앱에서 못 찾음: ' + head);
      let depth = 0, quote = null;
      for (let i = at + head.length - 1; i < src.length; i++) {
        const c = src[i];
        if (quote) { if (c === '\\\\') i++; else if (c === quote) quote = null; continue; }
        if (c === "'" || c === '"' || c === '`') quote = c;
        else if (c === '{' || c === '[') depth++;
        else if ((c === '}' || c === ']') && --depth === 0) return src.slice(at, i + 1);
      }
      throw new Error('끝을 못 찾음: ' + head);
    };
    const heads = ['const HJ_CASE_FIELDS=[', 'function hjCaseData(p){', 'function hjCaseVal(p,d,k){', 'function hjCaseSide(f){',
      'function hjCaseSort(a,b){', ...(src.includes('function hjCaseRefs(p){') ? ['function hjCaseRefs(p){'] : []), 'function hjCaseSelected(p){', 'function hjCaseFileName(f,i){', 'function hjCaseCount(p){', 'function hjCaseText(p){'];
    const ctx = {
      pad: (n) => String(n).padStart(2, '0'), localDate: () => '2026-09-26', hjPhaseSideOf: (f) => f.side || null,
      hjCasePlaceOf: () => '', files: [
        { id: 'a', side: 'before', _phase: '시공 전', when: '1' }, { id: 'b', side: null, _phase: '배관 교체', when: '2' },
        { id: 'c', side: 'after', _phase: '완료', when: '3' }, { id: 'd', side: null, when: '4' },
      ],
    };
    ctx.hjCasePhotos = () => ctx.files;
    // v328 부터 사진은 안정 참조(hjFilesByRefs)로 찾는다 — 이 대조는 글자만 보므로 id 로 찾는 대역을 둔다.
    ctx.hjFilesByRefs = (refs, pool) => ({ files: pool.filter((f) => (refs || []).includes(f.id)), missing: [] });
    vm.createContext(ctx);
    vm.runInContext(heads.map(grab).join(';\n') + ';\nthis.hjCaseText=hjCaseText;', ctx, { filename: 'hyeonjang/index.html' });
    const edge = Number((src.match(/const HJ_CASE_MAX_EDGE=(\d+);/) || [])[1]);
    const appText = ctx.hjCaseText({ name: 'P', casePack: { ...V321_VALUES, photos: ['a', 'b', 'c', 'd'], consent: true } });
    test('이웃 저장소 대조: 현장 앱 hjCaseText 출력이 V321_TEXT 와 글자까지 같다', () => assert.equal(appText, V321_TEXT));
    test('이웃 저장소 대조: 앱 사진 긴 변 상한(HJ_CASE_MAX_EDGE)이 들이기 도구와 같다', () => assert.equal(edge, APP_MAX_EDGE));
    test('이웃 저장소 대조: 앱 사진 줄의 전/중/후 말이 들이기 도구의 사진 설명과 같다', () => {
      const m = appText.match(/^사진: \d+장 \((.+) \d+ · (.+) \d+ · (.+) \d+\)$/m);
      assert.deepEqual(m && m.slice(1), [SIDE_CAPTION['전'], SIDE_CAPTION['중'], SIDE_CAPTION['후']]);
    });
  }
}

/* ── import-case-zip.mjs — 앱 zip 을 초안으로 ─────────────────────────────────────────
   픽스처는 합성 JPEG(머리만 있는 가짜 사진)과 가짜 문구다. 실제 사진·고객 자료는 쓰지 않는다. */
const IMPORTER = path.join(ROOT, 'scripts', 'import-case-zip.mjs');
const u16 = (n) => Buffer.from([n >> 8, n & 255]);
const seg = (marker, body) => Buffer.concat([Buffer.from([0xFF, marker]), u16(body.length + 2), body]);
/* Safari canvas.toBlob('image/jpeg') 가 쓰는 EXIF 모양(빅엔디언, APP1 길이 0x4C): IFD0 = Exif IFD 포인터(0x8769) 하나,
   Exif IFD = ColorSpace(A001)·PixelXDimension(A002)·PixelYDimension(A003). extra0/extraExif 로 태그를 끼워 넣으면
   폰 원본처럼 위치·기기가 실린 EXIF 가 된다(0x8825 GPS IFD 포인터·0x010F Make·0x927C MakerNote 등). */
function safariExif(w, h, { extra0 = [], extraExif = [], nextIfd = 0 } = {}) {
  const entry = (tag, type, value) => {
    const e = Buffer.alloc(12); e.writeUInt16BE(tag, 0); e.writeUInt16BE(type, 2); e.writeUInt32BE(1, 4);
    if (type === 3) e.writeUInt16BE(value, 8); else e.writeUInt32BE(value, 8);
    return e;
  };
  const ifd = (entries, next) => {
    const n = Buffer.alloc(2); n.writeUInt16BE(entries.length, 0);
    const nx = Buffer.alloc(4); nx.writeUInt32BE(next, 0);
    return Buffer.concat([n, ...entries, nx]);
  };
  const ifd0Len = 2 + (1 + extra0.length) * 12 + 4;
  const ifd0 = ifd([...extra0.map(([t, v]) => entry(t, 4, v)), entry(0x8769, 4, 8 + ifd0Len)].sort((a, b) => a.readUInt16BE(0) - b.readUInt16BE(0)), nextIfd);
  const exifIfd = ifd([entry(0xA001, 3, 1), entry(0xA002, 4, w), entry(0xA003, 4, h), ...extraExif.map(([t, v]) => entry(t, 4, v))], 0);
  return seg(0xE1, Buffer.concat([Buffer.from('Exif\0\0MM\0*\0\0\0\x08', 'latin1'), ifd0, exifIfd]));
}
function synthJpeg(w, h, { exif = false, tag = 0, app1 = null } = {}) {
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]),
    seg(0xE0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    // 폰 원본처럼 촬영 위치가 실린 EXIF — 들이기 도구가 이것을 찾아 거부해야 한다
    ...(exif ? [seg(0xE1, Buffer.from('Exif\0\0MM\0*GPSLatitude 36.32 GPSLongitude 127.42', 'latin1'))] : []),
    ...(app1 ? [app1] : []),
    seg(0xC0, Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])),
    seg(0xDA, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3F, 0])),
    Buffer.from([0x12, 0x34, tag & 255, 0x56]), Buffer.from([0xFF, 0xD9]),
  ]);
}
/* 앱(JSZip)처럼 UTF-8 이름 표시(0x0800)를 켠 zip. method 8 이면 DEFLATE, rawName 이면 표시 없이 이름 바이트와
   Info-ZIP Unicode Path(0x7075) 를 싣는다(다른 압축 프로그램이 한글 이름을 싣는 방식). */
function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data, method = 0, rawName = null, badCrc = false } of entries) {
    const utf8Name = Buffer.from(name, 'utf8');
    const nameBuf = rawName || utf8Name;
    const extra = rawName ? Buffer.concat([Buffer.from([0x75, 0x70]), Buffer.from([(5 + utf8Name.length) & 255, (5 + utf8Name.length) >> 8]), Buffer.from([1]), Buffer.alloc(4), utf8Name]) : Buffer.alloc(0);
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const crc = (zlib.crc32(data) ^ (badCrc ? 1 : 0)) >>> 0;
    const flags = rawName ? 0 : 0x0800;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(extra.length, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(extra.length, 30); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, extra, body);
    centrals.push(ch, nameBuf, extra);
    offset += 30 + nameBuf.length + extra.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const PHOTOS = [['01-전.jpg', 1800, 1200], ['02-중.jpg', 1200, 1800], ['03-중.jpg', 1600, 1200], ['04-후.jpg', 1800, 1350]]
  .map(([name, w, h], i) => ({ name, data: synthJpeg(w, h, { tag: i + 1 }) }));
const packEntries = ({ text = V321_TEXT, photos = PHOTOS, extra = [] } = {}) =>
  [{ name: '사례재료.txt', data: Buffer.from(text, 'utf8') }, ...photos, ...extra];
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const tempRoots = [];
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-case-zip-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'data', 'site.json'), path.join(root, 'data', 'site.json'));
  return root;
}
function importZip(entries, slug, { root = makeRoot(), args = ['--no-variants'], asFolder = false } = {}) {
  const input = path.join(root, asFolder ? 'pack' : '사례_서구_시험단지_20260926.zip');
  if (asFolder) {
    fs.mkdirSync(input);
    for (const e of entries) fs.writeFileSync(path.join(input, e.name), e.data);
  } else fs.writeFileSync(input, makeZip(entries));
  const r = spawnSync(NODE, [IMPORTER, input, ...(slug == null ? [] : ['--slug', slug]), ...args], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, MANMOOL_CASE_ROOT: root },
  });
  const casesDir = path.join(root, 'assets', 'cases');
  const draftFile = path.join(root, '.private', 'case-drafts', `${slug}.json`);
  return {
    ...r, root, out: (r.stdout || '') + (r.stderr || ''),
    cases: fs.existsSync(casesDir) ? fs.readdirSync(casesDir).sort() : [],
    draft: fs.existsSync(draftFile) ? JSON.parse(fs.readFileSync(draftFile, 'utf8')) : null,
    drafts: fs.existsSync(path.dirname(draftFile)) ? fs.readdirSync(path.dirname(draftFile)) : [],
  };
}
// 거부될 때는 저장소에 아무것도 남지 않아야 한다 — 사진 한 장이라도 남으면 병합 때 공개된다.
function assertRejected(r, pattern) {
  assert.notEqual(r.status, 0, '거부해야 하는데 통과했다:\n' + r.out);
  assert.match(r.out, pattern);
  assert.deepEqual(r.cases, [], '거부됐는데 assets/cases 에 사진이 남았다');
  assert.deepEqual(r.drafts, [], '거부됐는데 초안이 남았다');
}

try {
  const SLUG = 'seogu-test-ceiling-leak';
  const siteBefore = sha(fs.readFileSync(path.join(ROOT, 'data', 'site.json')));
  const ok = importZip(packEntries(), SLUG);
  test('들이기: 앱 zip(사진 4장·동의 받음)을 받아 성공한다', () => assert.equal(ok.status, 0, ok.out));
  test('들이기: 사진을 assets/cases/<slug>-NN.jpg 로 앱이 구운 바이트 그대로 복사한다', () => {
    assert.deepEqual(ok.cases, PHOTOS.map((ph) => `${SLUG}-${ph.name.slice(0, 2)}.jpg`));
    for (const ph of PHOTOS) {
      assert.equal(sha(fs.readFileSync(path.join(ok.root, 'assets', 'cases', `${SLUG}-${ph.name.slice(0, 2)}.jpg`))), sha(ph.data));
    }
  });
  test('들이기: 초안은 .private/case-drafts/<slug>.json 에 published:false', () => {
    assert.ok(ok.draft, ok.out);
    assert.equal(ok.draft.slug, SLUG);
    assert.equal(ok.draft.published, false);
    assert.equal(ok.draft.sourcePlace, V321_VALUES.place);
  });
  test('들이기: 본문 사진 블록 — 전은 증상 뒤, 중·후는 공사 뒤, 설명은 TODO, 사진 설명은 앱과 같은 말', () => {
    const hs = ok.draft.body.map((b) => b.img ? b.imgCaption : b.h);
    assert.deepEqual(hs, ['현장에서 확인한 증상', '시공 전', '탐지 방법', '원인과 전유부·공용부 구분', '진행한 공사', '작업 중', '작업 중', '완료', '걸린 시간']);
    const imgs = ok.draft.body.filter((b) => b.img);
    assert.deepEqual(imgs.map((b) => b.img), ok.cases.map((f) => 'assets/cases/' + f));
    for (const b of imgs) {
      assert.equal(b.imgAlt, TODO_ALT);
      assert.ok(b.h.startsWith(TODO_MARK) && b.p.startsWith(TODO_MARK), '사진 소제목·문단은 TODO 로 남긴다(지어내지 않는다)');
      assert.match(b.img, CASE_IMG_RE);
    }
    assert.match(imgs[1].p, /\(앱 공정: 배관 교체\)/);
    assert.doesNotMatch(imgs[2].p, /앱 공정/, "'공정 미지정' 은 힌트로 싣지 않는다");
    assert.doesNotMatch(imgs[0].p + imgs[3].p, /앱 공정/, "사진 설명과 같은 말('시공 전'·'완료')은 힌트로 되풀이하지 않는다");
    assert.equal(ok.draft.image, `assets/cases/${SLUG}-04.jpg`, '표지는 첫 완료 사진');
    assert.equal(ok.draft.imageAlt, TODO_ALT);
    assert.equal(ok.draft.body.find((b) => b.h === '원인과 전유부·공용부 구분').p, V321_VALUES.cause);
  });
  test('들이기: 공개 site.json 은 건드리지 않는다', () => assert.equal(sha(fs.readFileSync(path.join(ROOT, 'data', 'site.json'))), siteBefore));
  test('들이기: --no-variants 면 축소본 명령을 안내한다', () => assert.match(ok.out, /python3 scripts\/build-image-variants\.py/));
  test('들이기: 같은 slug 로 다시 들이면 거부하고 먼저 들인 사진을 덮어쓰지 않는다', () => {
    const again = spawnSync(NODE, [IMPORTER, path.join(ok.root, '사례_서구_시험단지_20260926.zip'), '--slug', SLUG, '--no-variants'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, MANMOOL_CASE_ROOT: ok.root },
    });
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /이미 있/);
    assert.equal(fs.readdirSync(path.join(ok.root, 'assets', 'cases')).length, PHOTOS.length);
  });

  test('들이기: zip 을 푼 폴더(macOS 처럼 NFD 한글 이름)도 받는다', () => {
    const r = importZip(packEntries().map((e) => ({ ...e, name: e.name.normalize('NFD') })), SLUG, { asFolder: true });
    assert.equal(r.status, 0, r.out);
    assert.equal(r.cases.length, PHOTOS.length);
  });
  test('들이기: DEFLATE 압축·Unicode Path 로 이름을 실은 zip 도 읽는다', () => {
    const entries = packEntries().map((e, i) => ({ ...e, method: 8, rawName: i === 1 ? Buffer.from('X1.jpg') : null }));
    const r = importZip(entries, SLUG);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.cases.length, PHOTOS.length);
  });
  test('들이기: 윈도 메모장으로 연 사례재료.txt(BOM·CRLF)도 동의·사진 목록을 읽는다', () => {
    const r = importZip(packEntries({ text: '\uFEFF' + V321_TEXT.replace(/\n/g, '\r\n') }), SLUG);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.draft.body.find((b) => b.img && b.img.endsWith('-02.jpg')).p.includes('(앱 공정: 배관 교체)'), true);
  });
  test('들이기: 굽기 실패로 목록에만 있는 사진은 알려 주고 나머지로 만든다', () => {
    const r = importZip(packEntries({ photos: PHOTOS.filter((ph) => ph.name !== '03-중.jpg') }), SLUG);
    assert.equal(r.status, 0, r.out);
    assert.match(r.stdout, /03-중\.jpg/);
    assert.equal(r.cases.length, PHOTOS.length - 1);
  });

  // ── 거부 ──
  test("거부: 고객 사진 공개 동의가 '미확인'", () => assertRejected(importZip(packEntries({ text: V321_TEXT.replace('동의: 받음', '동의: 미확인') }), SLUG), /동의/));
  test('거부: 동의 줄이 아예 없다(옛 형식 재료)', () => assertRejected(importZip(packEntries({ text: V321_TEXT.replace(/^※ 고객 사진 공개 동의.*$/m, '') }), SLUG), /동의/));
  test('거부: 동의 줄이 둘인데 하나가 받음이 아니다', () => assertRejected(importZip(packEntries({ text: V321_TEXT + '\n※ 고객 사진 공개 동의: 미확인' }), SLUG), /동의/));
  test('거부: 6항목에 동·호수', () => assertRejected(importZip(packEntries({ text: V321_TEXT.replace('서구 시험단지', '서구 시험단지 107동 1302호') }), SLUG), /개인정보/));
  test('거부: 6항목에 휴대전화', () => assertRejected(importZip(packEntries({ text: V321_TEXT.replace('배관 교체 후 보온', '배관 교체 후 보온 010-1234-5678') }), SLUG), /개인정보/));
  test('거부: 사진 공정 이름에 동·호수', () => assertRejected(importZip(packEntries({ text: V321_TEXT.replace('02-중.jpg — 배관 교체', '02-중.jpg — 1302호 배관') }), SLUG), /개인정보/));
  test('거부: 6항목 중 빈 칸', () => assertRejected(importZip(packEntries({ text: V321_TEXT.replace('5. 공사 내용: 배관 교체 후 보온', '5. 공사 내용: ') }), SLUG), /필수 항목 누락: 공사 내용/));
  test('거부: 파일 이름에 동·호수(원본 파일명이 섞였다)', () => {
    const r = importZip(packEntries({ extra: [{ name: '1302호 완료.jpg', data: synthJpeg(100, 100) }] }), SLUG);
    assertRejected(r, /파일 이름 1개에 개인정보/);
    assert.doesNotMatch(r.out, /1302호/, '거부 안내가 개인정보 파일 이름을 다시 찍지 않는다');
  });
  for (const odd of ['사진1.jpg', '01-전.JPG', '01-전.png', '1-후.jpg', 'notes.txt']) {
    test('거부: 앱 파일 이름 규칙 밖 — ' + odd, () => assertRejected(importZip(packEntries({ extra: [{ name: odd, data: synthJpeg(100, 100) }] }), SLUG), /앱 규칙/));
  }
  test('거부: 사례재료.txt 가 없다', () => assertRejected(importZip(PHOTOS, SLUG), /사례재료\.txt 가 없습니다/));
  test('거부: 사례재료.txt 목록에 없는 사진(손으로 끼워 넣음)', () => assertRejected(importZip(packEntries({ extra: [{ name: '05-후.jpg', data: synthJpeg(900, 600) }] }), SLUG), /목록에 없는 사진/));
  test('거부: EXIF(촬영 위치)가 남은 사진', () => {
    const photos = PHOTOS.map((ph, i) => i === 2 ? { ...ph, data: synthJpeg(1600, 1200, { exif: true }) } : ph);
    assertRejected(importZip(packEntries({ photos }), SLUG), /03-중\.jpg: 사진에 EXIF/);
  });
  test('들이기: 아이폰 Safari 가 구운 사진(크기만 든 EXIF)은 받는다 — 원본으로 오해해 거부하지 않는다', () => {
    const photos = PHOTOS.map((ph) => ({ ...ph, data: synthJpeg(1800, 1200, { app1: safariExif(1800, 1200) }) }));
    const r = importZip(packEntries({ photos }), SLUG);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.cases.length, PHOTOS.length);
  });
  test('거부: Safari 모양 EXIF 에 GPS IFD 가 끼어 있다', () => {
    const photos = PHOTOS.map((ph, i) => i === 1 ? { ...ph, data: synthJpeg(1200, 1800, { app1: safariExif(1200, 1800, { extra0: [[0x8825, 0]] }) }) } : ph);
    assertRejected(importZip(packEntries({ photos }), SLUG), /02-중\.jpg: 사진에 EXIF/);
  });
  test('거부: 긴 변이 1800px 을 넘는 사진(앱을 거치지 않은 원본)', () => {
    const photos = PHOTOS.map((ph, i) => i === 0 ? { ...ph, data: synthJpeg(4032, 3024) } : ph);
    assertRejected(importZip(packEntries({ photos }), SLUG), /긴 변이 4032px/);
  });
  test('거부: 이름만 .jpg 인 JPEG 아닌 파일', () => {
    const photos = PHOTOS.map((ph, i) => i === 3 ? { ...ph, data: Buffer.from('\x89PNG\r\n\x1a\n', 'latin1') } : ph);
    assertRejected(importZip(packEntries({ photos }), SLUG), /JPEG 이 아닙니다/);
  });
  test('거부: zip 안 파일 검사값이 틀리다(손상)', () => {
    assertRejected(importZip(packEntries().map((e, i) => ({ ...e, badCrc: i === 2 })), SLUG), /손상/);
  });
  test('거부: --slug 없음', () => assertRejected(importZip(packEntries(), null), /--slug 가 필요합니다/));
  for (const bad of ['Seogu-Leak', 'seogu_leak', '서구-누수', '../escape', 'a', '-lead', 'x--y']) {
    test('거부: slug 형식 — ' + bad, () => assertRejected(importZip(packEntries(), bad), /slug/));
  }
  test('거부: site.json 에 이미 있는 slug', () => {
    const taken = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8')).insights[0].slug;
    assertRejected(importZip(packEntries(), taken), /이미 있는 slug/);
  });

  test('거부: 같은 이름의 사진이 assets/cases 에 이미 있으면 덮어쓰지 않고 아무것도 쓰지 않는다', () => {
    const root = makeRoot();
    const existing = path.join(root, 'assets', 'cases', `${SLUG}-02.jpg`);
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, 'earlier photo');
    const r = importZip(packEntries(), SLUG, { root });
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.out, /이미 있는 사진과 이름이 겹칩니다/);
    assert.deepEqual(r.cases, [`${SLUG}-02.jpg`]);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'earlier photo');
    assert.deepEqual(r.drafts, []);
  });
  test('쓰는 도중 이름이 겹치면(검사와 쓰기 사이) 덮어쓰지 않고 복사한 사진을 되돌린다', () => {
    const root = makeRoot();
    const files = new Map(packEntries().map((e) => [e.name, e.data]));
    const plan = planImport(files, SLUG, { root });
    const late = path.join(root, plan.photos[2].img);
    fs.mkdirSync(path.dirname(late), { recursive: true });
    fs.writeFileSync(late, 'arrived late');
    assert.throws(() => writeImport(plan, { root }), /쓰는 중 실패.*2장은 되돌렸습니다/);
    assert.deepEqual(fs.readdirSync(path.dirname(late)), [path.basename(late)]);
    assert.equal(fs.readFileSync(late, 'utf8'), 'arrived late');
    assert.equal(fs.existsSync(plan.draftPath), false);
  });

  test('축소본: build-image-variants.py 를 들인 뒤에 돌린다(가짜 스크립트로 배선 확인)', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'scripts', 'build-image-variants.py'),
      "import os\nroot=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))\n" +
      "open(os.path.join(root,'variants-ran.txt'),'w').write('\\n'.join(sorted(os.listdir(os.path.join(root,'assets','cases')))))\n");
    const r = importZip(packEntries(), SLUG, { root, args: [] });
    assert.equal(r.status, 0, r.out);
    assert.equal(fs.readFileSync(path.join(root, 'variants-ran.txt'), 'utf8').split('\n').length, PHOTOS.length, '사진을 복사한 뒤에 돌아야 한다');
  });
} finally {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
}

test('들이기 도구가 받는 사례 사진 경로는 prerender-posts.py VARIANT_RE 도 받는다(아니면 srcset·치수가 안 붙는다)', () => {
  const py = fs.readFileSync(path.join(ROOT, 'scripts', 'prerender-posts.py'), 'utf8');
  const m = py.match(/^VARIANT_RE = re\.compile\(r'([^']+)'\)$/m);
  assert.ok(m, 'prerender-posts.py 에서 VARIANT_RE 를 못 찾음');
  const variant = new RegExp(m[1]);
  // 이름 글자 규칙이 같아야 한다 — 들이기 도구가 받은 이름을 축소본 규칙이 떨어뜨리면 안 된다.
  const nameClass = '[A-Za-z0-9._-]+';
  assert.ok(CASE_IMG_RE.source.includes(nameClass) && m[1].includes(nameClass), '사진 이름 글자 규칙이 갈라졌다');
  for (const ok of ['assets/cases/daejeon-bath-01.jpg', 'assets/cases/a.b_c-2.jpg']) {
    assert.ok(CASE_IMG_RE.test(ok), ok);
    assert.ok(variant.test(ok), 'VARIANT_RE 가 못 받음: ' + ok);
  }
});
test('JPEG 검사: 치수와 EXIF 를 읽는다', () => {
  assert.deepEqual(inspectJpeg(synthJpeg(1800, 1200)), { width: 1800, height: 1200, meta: [] });
  assert.deepEqual(inspectJpeg(synthJpeg(10, 20, { exif: true })).meta, ['EXIF']);
  // Safari canvas EXIF(크기만)는 봐 주고, 목록 밖 태그·썸네일 IFD·깨진 구조·두 번째 EXIF 는 거부
  assert.deepEqual(inspectJpeg(synthJpeg(100, 100, { app1: safariExif(100, 100) })), { width: 100, height: 100, meta: [] });
  for (const bad of [{ extra0: [[0x8825, 0]] }, { extra0: [[0x010F, 0]] }, { extra0: [[0x0132, 0]] }, { extraExif: [[0x927C, 0]] }, { nextIfd: 60 }]) {
    assert.deepEqual(inspectJpeg(synthJpeg(100, 100, { app1: safariExif(100, 100, bad) })).meta, ['EXIF'], JSON.stringify(bad));
  }
  const cut = safariExif(100, 100);
  assert.deepEqual(inspectJpeg(synthJpeg(100, 100, { app1: seg(0xE1, cut.subarray(4, cut.length - 6)) })).meta, ['EXIF'], '끝이 잘린 EXIF');
  assert.deepEqual(inspectJpeg(synthJpeg(100, 100, { exif: true, app1: safariExif(100, 100) })).meta, ['EXIF'], '봐 준 EXIF 옆의 진짜 EXIF');
  const farPtr = safariExif(100, 100); farPtr.writeUInt32BE(0xFFFFFFF0, 4 + 6 + 8 + 2 + 8);   // Exif IFD 포인터가 밖을 가리킨다
  assert.deepEqual(inspectJpeg(synthJpeg(100, 100, { app1: farPtr })).meta, ['EXIF'], '밖을 가리키는 IFD 포인터');
  const badMagic = safariExif(100, 100); badMagic.writeUInt16BE(43, 4 + 6 + 2);
  assert.deepEqual(inspectJpeg(synthJpeg(100, 100, { app1: badMagic })).meta, ['EXIF'], 'TIFF 머리 42 가 아니다');
  const safari = synthJpeg(100, 100, { app1: safariExif(100, 100) });
  const hidden = Buffer.concat([safari.subarray(0, -2), Buffer.from('Exif\0\0MM\0*', 'latin1'), Buffer.from([0xFF, 0xD9])]);
  assert.deepEqual(inspectJpeg(hidden).meta, ['EXIF'], '봐 준 EXIF 와 별개로 스캔 뒤에 숨은 EXIF 머리');
  assert.match(inspectJpeg(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A])).error || '', /읽지 못했습니다/);   // 중간에 끊긴 파일
  assert.match(inspectJpeg(Buffer.concat([synthJpeg(10, 10).subarray(0, 20), Buffer.from([0xFF, 0xD9])])).error || '', /크기를 읽지 못했습니다/);   // 크기 없이 끝
});
test("앱 파일 이름 규칙: '01-전.jpg' 만, '01-전.jpg.exe'·'001-후.jpg'(100장 넘을 때)", () => {
  assert.ok(PHOTO_NAME_RE.test('01-전.jpg') && PHOTO_NAME_RE.test('001-후.jpg'));
  assert.ok(!PHOTO_NAME_RE.test('01-전.jpg.exe') && !PHOTO_NAME_RE.test('01-앞.jpg'));
});
test("공개 글에 남은 'TODO:' 를 찾고, 비공개 초안은 봐 준다", () => {
  const draftish = { slug: 'x', published: false, imageAlt: TODO_ALT };
  const leaked = { slug: 'y', body: [{ h: 'a', p: 'b', imgAlt: TODO_ALT }] };
  assert.deepEqual(todoLeaks({ insights: [draftish, leaked] }), ['y.body[0].imgAlt']);
  assert.deepEqual(todoLeaks({ insights: [draftish] }), []);
});

console.log(`\n전부 통과 (${passed}건)`);
