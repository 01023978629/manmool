#!/usr/bin/env node
/* 실제 현장 메모 6항목을 공개 전 초안으로 바꾼다.
 *
 * 사용 예:
 *   node scripts/new-case-post.mjs --place "월평동 OO아파트" --symptom "..." \
 *     --method "..." --cause "..." --work "..." --duration "..."
 *
 * 현장앱의 [후기 재료 복사] 결과는 --material-file <파일> 또는 stdin 으로도 받는다.
 * 초안은 published:false 로 저장하며, 공개 글 생성기는 이 항목을 건너뛴다. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.MANMOOL_CASE_ROOT || DEFAULT_ROOT);
const FIELDS = ['place', 'symptom', 'method', 'cause', 'work', 'duration'];
const LABELS = {
  place: '동네+단지', symptom: '증상', method: '탐지 방법',
  cause: '원인+전유/공용', work: '공사 내용', duration: '걸린 시간',
};

/* 개인정보 판별 규칙은 js/pii-rules.js 하나만 쓴다(브라우저 등록 화면과 공용).
   여기에 규칙을 다시 적으면 언젠가 한쪽만 고쳐져서, 화면은 통과시킨 글에
   동·호수가 남는다. 파일을 읽어 그대로 평가하므로 사본이 생기지 않는다. */
const PII_RULES = (() => {
  const src = fs.readFileSync(path.join(DEFAULT_ROOT, 'js', 'pii-rules.js'), 'utf8');
  const sandbox = { window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(src + '\n;MANMUL_PII_RULES;', sandbox, { filename: 'js/pii-rules.js' });
  const rules = sandbox.MANMUL_PII_RULES;
  if (!Array.isArray(rules) || !rules.length) throw new Error('js/pii-rules.js 에서 규칙을 읽지 못했습니다');
  // 샌드박스가 만든 배열을 그대로 돌려주면 프로토타입이 이쪽 realm 과 달라서
  // assert.deepEqual 같은 비교가 '구조는 같은데 다르다'로 실패한다. 여기서 옮겨 담는다.
  return Array.from(rules, (r) => [String(r[0]), r[1]]);   // rules.map 은 샌드박스 배열을 그대로 낸다
})();

export function piiFindings(text) {
  const src = String(text || '');
  return PII_RULES.filter(([, pattern]) => pattern.test(src)).map(([name]) => name);
}

export function parseMaterial(text) {
  const out = {};
  const map = [
    ['place', /^(?:1\.\s*)?동네\+단지\s*:\s*(.+)$/m],
    ['symptom', /^(?:2\.\s*)?(?:어떤 연락|증상)\s*:\s*(.+)$/m],
    ['method', /^(?:3\.\s*)?탐지 방법\s*:\s*(.+)$/m],
    ['cause', /^(?:4\.\s*)?원인\+전유\/공용\s*:\s*(.+)$/m],
    ['work', /^(?:5\.\s*)?공사 내용\s*:\s*(.+)$/m],
    ['duration', /^(?:6\.\s*)?걸린 시간\s*:\s*(.+)$/m],
    // 7·8번은 선택이다. 단지 위치와 네이버 지도 링크 — 동·호수는 넣지 않는다.
    ['address', /^(?:7\.\s*)?단지 주소\s*:\s*(.+)$/m],
    ['mapUrl', /^(?:8\.\s*)?지도 링크\s*:\s*(.+)$/m],
  ];
  for (const [key, pattern] of map) {
    const m = String(text || '').match(pattern);
    if (m) out[key] = m[1].replace(/\s*←.*$/, '').trim();
  }
  return out;
}

export function makeDraft(values, now = new Date()) {
  const missing = FIELDS.filter((key) => !String(values[key] || '').trim());
  if (missing.length) throw new Error('필수 항목 누락: ' + missing.map((k) => LABELS[k]).join(', '));
  const normalized = Object.fromEntries(FIELDS.map((key) => [key, String(values[key]).trim()]));
  // 주소도 같은 검사를 받는다 — 6항목만 보면 주소로 동·호수가 새어 나간다.
  const findings = piiFindings(Object.values(normalized).concat(String(values.address || '')).join('\n'));
  if (findings.length) throw new Error('개인정보로 보이는 값이 있어 거부했습니다: ' + [...new Set(findings)].join(', '));
  const date = now.toISOString().slice(0, 10);
  const hash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 10);
  return {
    slug: `case-draft-${date.replaceAll('-', '')}-${hash}`,
    title: `${normalized.place} ${normalized.symptom} — 탐지부터 보수까지`,
    category: '누수탐지·수리',
    date,
    readMin: Math.max(2, Math.ceil(Object.values(normalized).join(' ').length / 500)),
    cover: '#5b7a8c',
    excerpt: `${normalized.place}에서 확인한 ${normalized.symptom} 사례입니다. 탐지 방법, 원인 구분, 공사 내용과 걸린 시간을 실제 현장 기록으로 정리했습니다.`,
    body: [
      { h: '현장에서 확인한 증상', p: normalized.symptom },
      { h: '탐지 방법', p: normalized.method },
      { h: '원인과 전유부·공용부 구분', p: normalized.cause },
      { h: '진행한 공사', p: normalized.work },
      { h: '걸린 시간', p: normalized.duration },
    ],
    sourcePlace: normalized.place,
    place: Object.assign({ name: normalized.place },
      values.address ? { address: String(values.address).trim() } : {},
      values.mapUrl ? { mapUrl: String(values.mapUrl).trim() } : {}),
    published: false,
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error('알 수 없는 인자: ' + arg);
    const key = arg.slice(2);
    if (!FIELDS.includes(key) && !['material-file', 'address', 'mapUrl'].includes(key)) throw new Error('알 수 없는 옵션: --' + key);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--' + key + ' 값이 비었습니다');
    out[key] = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let values = { ...args };
  if (args['material-file']) values = { ...parseMaterial(fs.readFileSync(path.resolve(args['material-file']), 'utf8')), ...values };
  else if (!FIELDS.some((key) => values[key]) && !process.stdin.isTTY) values = { ...parseMaterial(fs.readFileSync(0, 'utf8')), ...values };
  const draft = makeDraft(values);
  const draftDir = path.join(ROOT, '.private', 'case-drafts');
  const draftPath = path.join(draftDir, draft.slug + '.json');
  if (fs.existsSync(draftPath)) throw new Error('같은 현장 기록으로 만든 초안이 이미 있습니다: ' + draft.slug);
  fs.mkdirSync(draftDir, { recursive: true });
  const temp = draftPath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(draft, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, draftPath);
  console.log(`비공개 초안 저장: ${path.relative(ROOT, draftPath)} (공개 데이터·HTML 변경 없음)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('실패: ' + error.message); process.exit(1); }
}
