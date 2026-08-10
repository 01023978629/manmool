import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_GS, EXPECTED_HTML } from './precheck.mjs';

const file = resolve(process.argv[2] || '.clasp.json');
const cfg = JSON.parse(readFileSync(file, 'utf8'));
cfg.rootDir = resolve(fileURLToPath(new URL('../../', import.meta.url))).replace(/\\/g, '/');
cfg.scriptExtensions = ['.js', '.gs'];
cfg.htmlExtensions = ['.html'];
cfg.filePushOrder = [...EXPECTED_GS, ...EXPECTED_HTML, 'appsscript.json'];
writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log('업로드 순서 고정: .gs 11개 → .html 2개 → manifest');
