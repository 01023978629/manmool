/* import-case-zip.test.mjs — 현장 앱 사례 ZIP → 비공개 초안(.private/case-drafts) 도구 검사
 *
 * 합성 ZIP(가짜 사진·사례재료.txt·case.json)을 여기서 직접 만든다(외부 zip 도구 없이) — 경로 탈출·심볼릭 링크·
 * data descriptor 같은 변형도 그대로 만들 수 있어야 거부 동작을 검사할 수 있다.
 * 실제 저장소는 건드리지 않는다: 임시 뿌리(MANMOOL_CASE_ROOT)에 data/site.json 만 복사해 쓴다.
 * 도구가 게시(data/site.json·posts·assets/cases)를 하지 않는다는 것을 바이트·목록으로 확인한다.
 * 실행: node --test scripts/import-case-zip.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZip, flattenZip, jpegInfo, unsafeZipName, LIMITS } from './import-case-zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'scripts', 'import-case-zip.mjs');
const NODE = process.execPath;

/* ───── 합성 ZIP ───── */
function crc32(buf) { return zlib.crc32(buf) >>> 0; }
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data ?? ''), 'utf8');
    const method = e.method ?? 0;
    const comp = method === 8 ? zlib.deflateRawSync(data) : data;
    const flags = 0x0800 | (e.descriptor ? 0x0008 : 0);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(e.descriptor ? 0 : crc, 14); local.writeUInt32LE(e.descriptor ? 0 : comp.length, 18); local.writeUInt32LE(e.descriptor ? 0 : data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const parts = [local, name, comp];
    if (e.descriptor) { const d = Buffer.alloc(16); d.writeUInt32LE(0x08074b50, 0); d.writeUInt32LE(crc, 4); d.writeUInt32LE(comp.length, 8); d.writeUInt32LE(data.length, 12); parts.push(d); }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(e.madeBy ?? 20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(e.external ?? 0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    const chunk = Buffer.concat(parts);
    locals.push(chunk);
    offset += chunk.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/* ───── 가짜 사진 — 24×16 JPEG(JFIF 만). tag 로 COM 조각을 넣어 장마다 바이트가 다르게 한다. */
const JPEG_BASE = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCaiiiuo5QooooA/9k=', 'base64');
function segment(marker, payload) {
  const head = Buffer.alloc(4); head[0] = 0xff; head[1] = marker; head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}
function jpeg(tag) {
  const app0End = 2 + 2 + JPEG_BASE.readUInt16BE(4);   // SOI + APP0
  return Buffer.concat([JPEG_BASE.subarray(0, app0End), segment(0xfe, Buffer.from('tag:' + tag, 'latin1')), JPEG_BASE.subarray(app0End)]);
}
function jpegWithExif(tag) {
  const j = jpeg(tag);
  return Buffer.concat([j.subarray(0, 2), segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.alloc(20, 1)])), j.subarray(2)]);
}
const tagOf = (buf) => { const m = buf.toString('latin1').match(/tag:([a-z0-9-]+)/); return m ? m[1] : ''; };

const SAFE = {
  place: '서구 시험단지', symptom: '천장 물자국', method: '압력 검사와 청음 탐지',
  cause: '세대 전용 급수관 연결부', work: '연결부 교체 후 압력 재검사', duration: '약 두 시간',
};
function caseJson(over = {}) {
  return JSON.stringify({
    format: 'manmool-case/1', title: `${SAFE.place} ${SAFE.symptom}`, area: '시험동', kind: '누수', tags: ['누수', '시험동'],
    summary: { ...SAFE }, date: '2026-10-20', consent: true, app: 'hyeonjang-v446-publicweb',
    photos: [
      { file: '01-전.jpg', phase: 'before', caption: '천장 물자국' },
      { file: '02-중.jpg', phase: 'mid', caption: '배관 연결부 개방' },
      { file: '03-후.jpg', phase: 'after', caption: '완료' },
    ],
    ...over,
  }, null, 2);
}
const MATERIAL = [
  '[현장 사례 재료] 2026-10-21', `1. 동네+단지: ${SAFE.place}`, `2. 증상: ${SAFE.symptom}`, `3. 탐지 방법: ${SAFE.method}`,
  `4. 원인+전유/공용: ${SAFE.cause}`, `5. 공사 내용: ${SAFE.work}`, `6. 걸린 시간: ${SAFE.duration}`,
  '사진: 3장 (시공 전 1 · 작업 중 1 · 완료 1)', '01-전.jpg — 천장 물자국', '02-중.jpg — 배관 연결부 개방', '03-후.jpg — 완료',
  '※ 고객 사진 공개 동의: 받음', '※ 동·호수·고객 연락처·출입 번호는 넣지 않았습니다. 사진의 촬영 위치 정보(EXIF)는 뺐습니다.',
].join('\n');
const PHOTOS = [
  { name: '01-전.jpg', data: jpeg('before1') }, { name: '02-중.jpg', data: jpeg('mid1') }, { name: '03-후.jpg', data: jpeg('after1') },
];
const appZip = (over = {}, extra = []) => makeZip([...PHOTOS, { name: '사례재료.txt', data: MATERIAL }, { name: 'case.json', data: caseJson(over), method: 8 }, ...extra]);

/* ───── 임시 뿌리 ───── */
const SITE_RAW = fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8');
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manmool-case-zip-'));
  for (const dir of ['data', 'assets/cases', 'posts', 'zips']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'site.json'), SITE_RAW);
  return root;
}
function run(root, zipBuf, args = []) {
  const zipPath = path.join(root, 'zips', `in-${Math.random().toString(36).slice(2)}.zip`);
  fs.writeFileSync(zipPath, zipBuf);
  const r = spawnSync(NODE, [TOOL, zipPath, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MANMOOL_CASE_ROOT: root } });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function tree(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    return e.isDirectory() ? tree(abs, base) : [path.relative(base, abs).split(path.sep).join('/')];
  }).sort();
}
/* 공개 쪽(게시 대상)과 비공개 초안 폴더의 상태 — 거부·dry-run 뒤에는 통째로 같아야 한다 */
const snapshot = (root) => ({
  site: fs.readFileSync(path.join(root, 'data', 'site.json'), 'utf8'),
  assets: tree(path.join(root, 'assets')), posts: tree(path.join(root, 'posts')), drafts: tree(path.join(root, '.private')),
});
const assertNothingPublished = (root) => {
  assert.equal(fs.readFileSync(path.join(root, 'data', 'site.json'), 'utf8'), SITE_RAW, 'data/site.json 이 바뀌었다 — 이 도구는 게시하지 않는다');
  assert.deepEqual(tree(path.join(root, 'assets')), [], 'assets/ 에 파일이 생겼다');
  assert.deepEqual(tree(path.join(root, 'posts')), [], 'posts/ 에 파일이 생겼다');
};
const readDraft = (root, slug) => JSON.parse(fs.readFileSync(path.join(root, '.private', 'case-drafts', slug + '.json'), 'utf8'));

test('ZIP 읽기 — 저장·deflate·data descriptor 항목을 중앙 디렉터리 기준으로 읽고 CRC 를 확인한다', () => {
  const zip = makeZip([{ name: 'a.txt', data: 'hello' }, { name: 'b.txt', data: 'world', method: 8 }, { name: 'c.txt', data: 'desc', method: 8, descriptor: true }]);
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => [e.name, e.read().toString()]), [['a.txt', 'hello'], ['b.txt', 'world'], ['c.txt', 'desc']]);
  const broken = Buffer.from(zip);
  broken[30 + 'a.txt'.length] ^= 0xff;   // 첫 항목 자료 한 바이트
  assert.throws(() => readZip(broken)[0].read(), /CRC/);
  assert.throws(() => readZip(Buffer.from('not a zip at all, really not')), /EOCD/);
});

test('경로 탈출·절대 경로·역슬래시·심볼릭 링크는 ZIP 단계에서 거부한다', () => {
  for (const name of ['../evil.jpg', 'a/../../evil.jpg', '/etc/passwd', 'C:\\Windows\\x.jpg', 'dir//x.jpg', './x.jpg']) {
    assert.ok(unsafeZipName(name), name);
    assert.throws(() => flattenZip(readZip(makeZip([{ name, data: 'x' }]))), /허용되지 않는 경로/, name);
  }
  const symlink = makeZip([{ name: 'link.jpg', data: '../../target', madeBy: 3 << 8, external: (0o120777 << 16) >>> 0 }]);
  assert.throws(() => flattenZip(readZip(symlink)), /심볼릭 링크/);
  // 한 겹 폴더로 싸인 ZIP 은 벗기고, __MACOSX 부스러기는 무시한다
  const wrapped = flattenZip(readZip(makeZip([{ name: '사례/', data: '' }, { name: '사례/case.json', data: '{}' }, { name: '__MACOSX/._case.json', data: 'x' }, { name: '사례/.DS_Store', data: 'x' }])));
  assert.deepEqual(wrapped.files.map((f) => f.name), ['case.json']);
  assert.equal(wrapped.ignored.length, 2);
  const many = makeZip(Array.from({ length: LIMITS.entries + 1 }, (_, i) => ({ name: `f${i}.txt`, data: 'x' })));
  assert.throws(() => readZip(many), /너무 많다/);
});

test('JPEG 검사 — 크기를 읽고 EXIF/XMP 조각을 알아본다', () => {
  assert.deepEqual(jpegInfo(jpeg('x')), { width: 24, height: 16, exif: false, xmp: false });
  assert.equal(jpegInfo(jpegWithExif('x')).exif, true);
  assert.equal(jpegInfo(Buffer.from('GIF89a')), null);
});

test('case.json ZIP → .private/case-drafts 초안 + slug 번호 사진(전→중→후), 게시는 하지 않는다', () => {
  const root = makeRoot();
  try {
    const slug = 'test-leak-case-20261020';
    const r = run(root, appZip(), ['--slug', slug]);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /비공개 초안 저장: \.private\/case-drafts\/test-leak-case-20261020\.json/);
    assertNothingPublished(root);
    assert.deepEqual(tree(path.join(root, '.private')), [
      `case-drafts/${slug}.json`, `case-drafts/${slug}/${slug}-1.jpg`, `case-drafts/${slug}/${slug}-2.jpg`, `case-drafts/${slug}/${slug}-3.jpg`,
    ]);
    const d = readDraft(root, slug);
    assert.equal(d.published, false);
    assert.equal(d.slug, slug);
    assert.equal(d.date, '2026-10-20');   // case.json date(준공일)
    assert.equal(d.category, '누수탐지·수리');
    assert.equal(d.service, 'leak');
    assert.equal(d.title, `${SAFE.place} ${SAFE.symptom} — 탐지부터 보수까지`);
    assert.deepEqual(d.caseSummary, { site: SAFE.place, issue: SAFE.symptom, work: SAFE.work, result: '완료 사진 1장 확인\n소요시간 약 두 시간' });
    assert.equal(d.image, `assets/cases/${slug}-3.jpg`);   // 첫 완료 사진이 표지 — 게시할 때 놓일 자리
    assert.equal(d.imageAlt, '완료');
    assert.deepEqual(d.body.slice(0, 5).map((x) => x.p), [SAFE.symptom, SAFE.method, SAFE.cause, SAFE.work, SAFE.duration]);
    assert.deepEqual(d.body.slice(5).map((x) => [x.img, x.imgCaption]), [
      [`assets/cases/${slug}-1.jpg`, '천장 물자국'], [`assets/cases/${slug}-2.jpg`, '배관 연결부 개방'], [`assets/cases/${slug}-3.jpg`, '완료'],
    ]);
    assert.equal(d.place.note.includes('동·호수'), true);
    assert.equal(d.draftSource.consent, true);
    assert.equal(d.draftSource.photoDir, `.private/case-drafts/${slug}/`);
    assert.doesNotMatch(JSON.stringify(d), /01-전|02-중|03-후/, '원본 파일 이름이 초안에 남지 않는다');
    assert.deepEqual([1, 2, 3].map((n) => tagOf(fs.readFileSync(path.join(root, '.private', 'case-drafts', slug, `${slug}-${n}.jpg`)))), ['before1', 'mid1', 'after1']);
    // 같은 slug 로 다시 → 거부, 아무것도 바뀌지 않는다
    const snap = snapshot(root);
    const again = run(root, appZip({ summary: { ...SAFE, work: '다른 내용' } }), ['--slug', slug]);
    assert.equal(again.status, 1);
    assert.match(again.out, /같은 slug 의 초안이 이미 있다/);
    assert.deepEqual(snapshot(root), snap);
    // 이미 공개된 글의 slug·이미 있는 사진 접두사와 부딪히면 초안도 만들지 않는다(나중에 옮길 때 덮지 않게)
    const existing = JSON.parse(SITE_RAW).insights.find((a) => a.published !== false && a.slug);
    const clash = run(root, appZip(), ['--slug', existing.slug]);
    assert.equal(clash.status, 1, clash.out);
    assert.match(clash.out, /같은 slug 의 글이 이미 있다\(data\/site\.json\)/);
    assert.deepEqual(snapshot(root), snap);
    fs.writeFileSync(path.join(root, 'assets', 'cases', 'taken-slug-1.jpg'), jpeg('old'));
    const snap2 = snapshot(root);
    const clash2 = run(root, appZip(), ['--slug', 'taken-slug']);
    assert.equal(clash2.status, 1, clash2.out);
    assert.match(clash2.out, /같은 slug 로 시작하는 사진이 이미 있다/);
    assert.deepEqual(snapshot(root), snap2);
    fs.rmSync(path.join(root, 'assets', 'cases', 'taken-slug-1.jpg'));
    // --slug 없이: case-draft-<날짜>-<지문>
    const auto = run(root, appZip());
    assert.equal(auto.status, 0, auto.out);
    const autoDraft = tree(path.join(root, '.private')).find((f) => /^case-drafts\/case-draft-20261020-[a-f0-9]{10}\.json$/.test(f));
    assert.ok(autoDraft, tree(path.join(root, '.private')).join(', '));
    assertNothingPublished(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('사례재료.txt 만 있는 옛 ZIP 도 parseMaterial 로 읽는다(사진 설명·동의 줄 포함) · --kind interior · --date', () => {
  const root = makeRoot();
  try {
    const zip = makeZip([...PHOTOS, { name: '사례재료.txt', data: MATERIAL }]);
    const r = run(root, zip, ['--slug', 'test-interior-20260901', '--kind', 'interior', '--date', '2026-09-01']);
    assert.equal(r.status, 0, r.out);
    assertNothingPublished(root);
    const d = readDraft(root, 'test-interior-20260901');
    assert.equal(d.published, false);
    assert.equal(d.category, '시공 사례');
    assert.equal(d.service, 'interior');
    assert.equal(d.date, '2026-09-01');
    assert.equal(d.draftSource.format, '사례재료.txt');
    assert.deepEqual(d.body.slice(5).map((x) => x.imgCaption), ['천장 물자국', '배관 연결부 개방', '완료']);
    assert.equal(d.body[0].h, '현장에서 확인한 상태');
    // 비어 있는 항목은 지어내지 않고 비워 둔다
    const sparse = makeZip([...PHOTOS, { name: 'case.json', data: caseJson({ summary: { ...SAFE, method: '', cause: '' } }) }]);
    const r3 = run(root, sparse, ['--slug', 'test-sparse']);
    assert.equal(r3.status, 0, r3.out);
    assert.deepEqual(readDraft(root, 'test-sparse').body.slice(0, 5).map((x) => x.p), [SAFE.symptom, '', '', SAFE.work, SAFE.duration]);
    assert.doesNotMatch(JSON.stringify(readDraft(root, 'test-sparse')), /비어 있음/);
    // 동의 줄이 '미확인'이면 거부
    const noConsent = makeZip([...PHOTOS, { name: '사례재료.txt', data: MATERIAL.replace('동의: 받음', '동의: 미확인') }]);
    const snap = snapshot(root);
    const r2 = run(root, noConsent, ['--slug', 'test-no-consent']);
    assert.equal(r2.status, 1);
    assert.match(r2.out, /동의/);
    assert.deepEqual(snapshot(root), snap);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('개인정보·과장 표현·EXIF·동의 없음은 초안을 만들지 않고 걸린 칸만 말한다', () => {
  const root = makeRoot();
  try {
    const snap = snapshot(root);
    assert.deepEqual(snap.drafts, []);
    const refuse = (zip, pattern, args = []) => {
      const r = run(root, zip, ['--slug', 'test-refused', ...args]);
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, pattern);
      assert.deepEqual(snapshot(root), snap, '거부했는데 무언가 썼다');
      return r.out;
    };
    const out = refuse(appZip({ summary: { ...SAFE, work: '1302호 욕실 연결부 교체' } }), /case\.json\.summary\.work: 개인정보\(동·호수\)/);
    assert.doesNotMatch(out, /1302/, '걸린 값 자체를 되풀이하지 않는다');
    refuse(appZip({ photos: [{ file: '01-전.jpg', phase: 'before', caption: '공동현관 비번 1234 확인' }, { file: '02-중.jpg', phase: 'mid' }, { file: '03-후.jpg', phase: 'after' }] }),
      /case\.json\.photos\[0\]\.caption: 개인정보\(출입번호\)/);
    refuse(appZip({ summary: { ...SAFE, cause: '연락은 010-1234-5678' } }), /summary\.cause: 개인정보\(휴대전화\)/);
    refuse(appZip({ title: '시험단지 문의 test@example.com' }), /case\.json\.title: 개인정보\(이메일\)/);
    refuse(appZip({ summary: { ...SAFE, work: '최저가로 교체' } }), /summary\.work: 과장 표현\(최저가\)/);
    refuse(appZip({ consent: false }), /동의/);
    refuse(makeZip([PHOTOS[0], PHOTOS[1], { name: '03-후.jpg', data: jpegWithExif('exif') }, { name: 'case.json', data: caseJson() }]), /EXIF/);
    refuse(makeZip([PHOTOS[0], PHOTOS[1], { name: '03-후.jpg', data: 'not a jpeg' }, { name: 'case.json', data: caseJson() }]), /JPEG 가 아니다/);
    refuse(appZip({ format: 'manmool-case/2' }), /format/);
    refuse(appZip({ photos: [{ file: '09-후.jpg', phase: 'after' }] }), /ZIP 에 없다/);
    refuse(makeZip([...PHOTOS, { name: '../case.json', data: caseJson() }]), /허용되지 않는 경로/);
    refuse(makeZip([{ name: '01-전.jpg', data: jpeg('x') }]), /case\.json 도 사례재료\.txt 도 없다/);
    refuse(appZip(), /slug 는 소문자/, ['--slug', 'Bad Slug']);
    refuse(appZip(), /slug 는 소문자/, ['--slug', '../escape']);
    const txtOnly = makeZip([...PHOTOS, { name: '사례재료.txt', data: MATERIAL.replace(SAFE.place, '101동 1502호 시험단지') }]);
    refuse(txtOnly, /사례재료\.txt\.place: 개인정보\(동·호수\)/);
    // --dry-run 은 초안을 보여 주기만 한다
    const dry = run(root, appZip(), ['--slug', 'test-dry', '--dry-run']);
    assert.equal(dry.status, 0, dry.out);
    assert.match(dry.out, /dry-run/);
    assert.match(dry.out, /"published": false/);
    assert.deepEqual(snapshot(root), snap);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
