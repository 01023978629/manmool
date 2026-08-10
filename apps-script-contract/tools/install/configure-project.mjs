import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXPECTED_GS, EXPECTED_HTML } from './precheck.mjs';

const file = resolve(process.argv[2] || '.clasp.json');
const cfg = JSON.parse(readFileSync(file, 'utf8'));
// .clasp.json 자체를 apps-script-contract 루트에 두므로 업로드 파일과 같은 기준점이다.
// clasp 3의 filePushOrder는 .clasp.json 기준 경로라, 이 배치에서만 파일명이 그대로 맞는다.
cfg.rootDir = '.';
cfg.scriptExtensions = ['.js', '.gs'];
cfg.htmlExtensions = ['.html'];
cfg.filePushOrder = [...EXPECTED_GS, ...EXPECTED_HTML, 'appsscript.json'];
writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log('업로드 순서 고정: .gs 11개 → .html 2개 → manifest');
