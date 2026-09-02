import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(ROOT, 'office-portal-api.json');
export const DISABLED = Object.freeze({ enabled: false, apiUrl: '' });
const API_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export function isExactAppsScriptUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || !API_URL.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'script.google.com' && url.port === ''
      && url.username === '' && url.password === '' && url.search === '' && url.hash === '';
  } catch (_) {
    return false;
  }
}

export function parseCommand(args) {
  const forbidden = args.find((arg) => /^--[^=]*(?:token|pin|secret|password|otp)/i.test(arg));
  if (forbidden) return { error: '비밀값 관련 인자는 받을 수 없습니다.' };
  if (args.length === 1 && args[0] === '--disable') {
    return { config: DISABLED, message: '역할 포털 API 연결을 비활성화했습니다.' };
  }
  if (args.length === 3 && args[0] === '--url' && args[2] === '--enable' && isExactAppsScriptUrl(args[1])) {
    return { config: { enabled: true, apiUrl: args[1] }, message: '역할 포털 API 연결을 활성화했습니다.' };
  }
  return { error: '사용법: node scripts/configure-office-portal-api.mjs --url <URL> --enable | --disable' };
}

export function writeAtomically(config, {
  fileSystem = fs,
  configPath = CONFIG_PATH,
  tempPath = `${CONFIG_PATH}.${process.pid}-${Date.now()}.tmp`,
} = {}) {
  const content = `${JSON.stringify(config, null, 2)}\n`;
  let descriptor;
  try {
    descriptor = fileSystem.openSync(tempPath, 'wx', 0o600);
    fileSystem.writeFileSync(descriptor, content, 'utf8');
    fileSystem.fsyncSync(descriptor);
    fileSystem.closeSync(descriptor);
    descriptor = undefined;
    fileSystem.renameSync(tempPath, configPath);
  } finally {
    if (descriptor !== undefined) fileSystem.closeSync(descriptor);
    if (fileSystem.existsSync(tempPath)) fileSystem.unlinkSync(tempPath);
  }
}

export function runCli(args, { stdout = console.log, stderr = console.error, writer = writeAtomically } = {}) {
  const result = parseCommand(args);
  if (result.error) {
    stderr(`오류: ${result.error}`);
    return 1;
  }
  writer(result.config);
  stdout(result.message);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
