import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_GS = [
  'Pure.gs', 'Schema.gs', 'AuthService.gs', 'SheetService.gs', 'DriveService.gs',
  'ContractService.gs', 'Sign.gs', 'Notify.gs', 'AiService.gs',
  'MigrationService.gs', 'Code.gs'
];
export const EXPECTED_HTML = ['Sign.html', 'Admin.html'];

export function precheck(root) {
  const names = readdirSync(root);
  const gs = names.filter((x) => x.endsWith('.gs')).sort();
  const html = names.filter((x) => x.endsWith('.html')).sort();
  const missing = [...EXPECTED_GS, ...EXPECTED_HTML, 'appsscript.json'].filter((x) => !names.includes(x));
  const manifest = join(root, 'appsscript.json');
  let manifestOk = false;
  try { JSON.parse(readFileSync(manifest, 'utf8')); manifestOk = true; } catch { /* 아래에서 실패 */ }
  return { ok: gs.length === 11 && html.length === 2 && missing.length === 0 && manifestOk, gs, html, missing, manifestOk };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const r = precheck(root);
  if (!r.ok) {
    console.error(`사전검사 실패: .gs ${r.gs.length}/11, .html ${r.html.length}/2, manifest=${r.manifestOk ? '정상' : '오류'}, 누락=${r.missing.join(', ') || '없음'}`);
    process.exit(1);
  }
  console.log('사전검사 통과: .gs 11개 · .html 2개 · appsscript.json 정상');
}
