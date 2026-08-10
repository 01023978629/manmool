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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(process.env.MANMOOL_CASE_ROOT || DEFAULT_ROOT);
const FIELDS = ['place', 'symptom', 'method', 'cause', 'work', 'duration'];
const LABELS = {
  place: '동네+단지', symptom: '증상', method: '탐지 방법',
  cause: '원인+전유/공용', work: '공사 내용', duration: '걸린 시간',
};

export function piiFindings(text) {
  const src = String(text || '');
  const checks = [
    ['동·호수', /(?:^|[^가-힣0-9])\d{1,4}\s*(?:동|호)(?=$|[^가-힣])/m],
    ['휴대전화', /(?:^|\D)01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/],
    ['일반전화', /(?:^|\D)0(?:2|[3-6][1-5])[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/],
    ['이메일', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ['고객명', /(?:고객명|고객\s*이름|성명|연락자|의뢰인)\s*[:=]\s*[가-힣A-Za-z]{2,30}/],
    ['고객명', /[가-힣]{2,5}\s*고객(?:님)?/],
  ];
  return checks.filter(([, pattern]) => pattern.test(src)).map(([name]) => name);
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
  const findings = piiFindings(Object.values(normalized).join('\n'));
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
    published: false,
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error('알 수 없는 인자: ' + arg);
    const key = arg.slice(2);
    if (!FIELDS.includes(key) && key !== 'material-file') throw new Error('알 수 없는 옵션: --' + key);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('--' + key + ' 값이 비었습니다');
    out[key] = argv[++i];
  }
  return out;
}

function runPrerender() {
  const script = path.join(ROOT, 'scripts', 'prerender-posts.py');
  const bundledPython = process.platform === 'win32'
    ? path.resolve(path.dirname(process.execPath), '..', '..', 'python', 'python.exe') : '';
  const candidates = process.env.PYTHON
    ? [[process.env.PYTHON, []]]
    : [
        ...(bundledPython && fs.existsSync(bundledPython) ? [[bundledPython, []]] : []),
        ...(process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]]),
      ];
  const errors = [];
  for (const [cmd, prefix] of candidates) {
    const result = spawnSync(cmd, [...prefix, script], { cwd: ROOT, encoding: 'utf8' });
    if (!result.error) {
      if (result.status === 0) {
        process.stdout.write(result.stdout || '');
        return;
      }
      errors.push(`${cmd} 종료 ${result.status}: ${result.stderr || result.stdout}`);
    } else {
      errors.push(`${cmd}: ${result.error.message}`);
    }
  }
  throw new Error('prerender-posts.py 를 실행하지 못했습니다. PYTHON 환경변수로 정상 Python 경로를 지정하세요.\n' + errors.join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let values = { ...args };
  if (args['material-file']) values = { ...parseMaterial(fs.readFileSync(path.resolve(args['material-file']), 'utf8')), ...values };
  else if (!FIELDS.some((key) => values[key]) && !process.stdin.isTTY) values = { ...parseMaterial(fs.readFileSync(0, 'utf8')), ...values };
  const draft = makeDraft(values);
  const sitePath = path.join(ROOT, 'data', 'site.json');
  const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  site.insights = Array.isArray(site.insights) ? site.insights : [];
  if (site.insights.some((x) => x && x.slug === draft.slug)) throw new Error('같은 현장 기록으로 만든 초안이 이미 있습니다: ' + draft.slug);
  site.insights.unshift(draft);
  const temp = sitePath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(site, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, sitePath);
  runPrerender();
  console.log(`초안 저장: ${draft.slug} (published:false · 공개 안 됨)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error('실패: ' + error.message); process.exit(1); }
}
