import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'office-api.json');
const API_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const DISABLED = { enabled: false, apiUrl: '' };

function fail(message) {
  console.error(`오류: ${message}`);
  process.exitCode = 1;
}

function isExactAppsScriptUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || !API_URL.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'script.google.com'
      && url.port === ''
      && url.username === ''
      && url.password === ''
      && url.search === ''
      && url.hash === ''
      && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname);
  } catch (_) {
    return false;
  }
}

function writeConfig(config) {
  const content = `${JSON.stringify(config, null, 2)}\n`;
  const tempPath = path.join(ROOT, `.office-api-${process.pid}-${Date.now()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(tempPath, CONFIG_PATH);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

const args = process.argv.slice(2);
const forbiddenArg = args.find((arg) => /^--[^=]*(?:token|pin|secret)/i.test(arg));
if (forbiddenArg) {
  fail('비밀값 관련 인자는 받을 수 없습니다.');
} else if (args.length === 1 && args[0] === '--disable') {
  writeConfig(DISABLED);
  console.log('관리사무소 API 공개 설정을 비활성화했습니다.');
} else if (args.length === 3 && args[0] === '--url' && args[2] === '--enable') {
  if (!isExactAppsScriptUrl(args[1])) {
    fail('Apps Script의 정확한 https://script.google.com/macros/s/<deployment-id>/exec URL만 사용할 수 있습니다.');
  } else {
    writeConfig({ enabled: true, apiUrl: args[1] });
    console.log('관리사무소 API 공개 설정을 활성화했습니다.');
  }
} else {
  fail('사용법: node scripts/configure-office-api.mjs --url <URL> --enable | --disable');
}
