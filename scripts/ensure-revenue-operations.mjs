import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PUBLIC_JS_FILES, expectedPublicFiles } from './pages-artifact-policy.mjs';
import { buildPagesArtifact } from './build-pages-artifact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALES_COPY = /(?:표준\s*패키지[\s\S]{0,80}500\s*만원\s*이하|500\s*만원\s*이하[\s\S]{0,80}표준\s*패키지)/;
const TEXT_EXTENSIONS = new Set(['.html', '.json', '.xml', '.txt', '.md', '.js', '.css', '.webmanifest', '.svg']);

function read(root, relative, fileSystem) {
  return fileSystem.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
}
function sha256(value) {
  const normalizedText = String(value).replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalizedText).digest('hex');
}
function functionBody(source, name) {
  const hit = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  if (!hit) return '';
  let depth = 1, quote = '', escaped = false;
  for (let i = hit.index + hit[0].length; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(hit.index + hit[0].length, i);
  }
  return '';
}
function element(source, id) {
  const open = new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(source);
  if (!open) return '';
  const tag = open[1]; let depth = 1; const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'ig'); token.lastIndex = open.index + open[0].length;
  let match;
  while ((match = token.exec(source))) { if (/^<\//.test(match[0])) depth--; else depth++; if (!depth) return source.slice(open.index, token.lastIndex); }
  return '';
}
function validNaver(naver) {
  if (!naver || typeof naver.ready !== 'boolean' || typeof naver.bookingUrl !== 'string') return false;
  if (!naver.ready) return naver.bookingUrl === '';
  try {
    const url = new URL(naver.bookingUrl.trim());
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'booking.naver.com' || url.hostname === 'm.booking.naver.com') && url.pathname !== '/';
  } catch { return false; }
}
function expectedOrigins(config) {
  const endpoints = [];
  if (config?.forms?.enabled === true && config.forms.endpoint) endpoints.push(config.forms.endpoint);
  if (config?.n8n?.enabled === true && config.n8n.inquiryWebhookUrl) endpoints.push(config.n8n.inquiryWebhookUrl);
  const origins = [];
  for (const endpoint of endpoints) {
    try { const u = new URL(endpoint); if (u.protocol !== 'https:' || u.username || u.password) return null; origins.push(u.origin); } catch { return null; }
  }
  // 문의 접수함(Apps Script)은 고정 호스트 둘로 간다. 설정의 inbox.enabled 와 무관하게 CSP 에 있어야
  // 대표가 접수함을 켜는 순간 폼이 막히지 않는다(2026-09-03, office.html 이 막혀 있던 사고).
  origins.push('https://script.google.com', 'https://script.googleusercontent.com');
  return [...new Set(origins)];
}
function copyPublicSource(root, destination, fileSystem) {
  for (const item of expectedPublicFiles(root, fileSystem)) {
    const target = path.join(destination, ...item.relative.split('/'));
    fileSystem.mkdirSync(path.dirname(target), { recursive: true }); fileSystem.copyFileSync(item.source, target);
  }
}
function walkText(root, fileSystem, visit) {
  const walk = current => { for (const entry of fileSystem.readdirSync(current, { withFileTypes: true })) { const absolute = path.join(current, entry.name); if (entry.isDirectory()) walk(absolute); else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) visit(absolute); } };
  walk(root);
}

export function verifyRevenueOperations(root = ROOT, fileSystem = fs) {
  const failures = [];
  const fail = (condition, message) => { if (!condition) failures.push(message); };
  let office, portal, privacy, pilot, leak, revenue, policy, config, baseline;
  try {
    office = read(root, 'office.html', fileSystem); portal = read(root, 'office-request.html', fileSystem); privacy = read(root, 'privacy.html', fileSystem);
    pilot = read(root, 'js/office-pilot.js', fileSystem); leak = read(root, 'js/leak-inquiry.js', fileSystem); revenue = read(root, 'js/revenue-conversion.js', fileSystem);
    policy = read(root, 'scripts/pages-artifact-policy.mjs', fileSystem); config = JSON.parse(read(root, 'data/config.json', fileSystem)); baseline = JSON.parse(read(root, 'tests/fixtures/office-request-commercial-baseline.json', fileSystem));
  } catch (error) { return [`공개 수익 게이트 필수 파일을 읽지 못했습니다: ${error.message}`]; }

  const packageNotice = /<aside class="office-package-note"[\s\S]*?<\/aside>/.exec(office)?.[0] || '';
  const success = functionBody(pilot, 'showSuccess');
  const portalNotice = element(portal, 'officeRequestCommercialNotice');
  const hasBoundary = value => /접수 프로그램 이용료 0원/.test(value) && /실제 작업은 별도 견적/.test(value);
  fail(hasBoundary(packageNotice), '0원 프로그램 안내가 office 패키지 위치에서 빠졌습니다');
  fail(hasBoundary(success), '0원 프로그램 안내가 파일럿 성공 결과에서 빠졌습니다');
  fail(hasBoundary(portalNotice), '0원 프로그램 안내가 직원 포털 정적 공지에서 빠졌습니다');

  const collect = functionBody(pilot, 'collect');
  fail(/id=["']officePilotForm["']/.test(office) && /source\s*:\s*['"]office-pilot['"]/.test(pilot), 'office 파일럿 form/source 계약이 없습니다');
  fail(!/(?:office-?request|office-?api)/i.test(pilot), '파일럿이 직원 포털 또는 office-api에 연결되었습니다');
  fail(!/(?:residentName|residentPhone|\bunit\b|\bphoto\b)/.test(collect), '파일럿 collect에 금지된 입주민 정보가 포함되었습니다');
  fail(/bookingStatus\s*:\s*['"]inquiry-only['"]/.test(leak), '누수 문의의 inquiry-only 계약이 없습니다');
  fail(/resolvePublishedLeakCase\s*\(\s*requestedSlug\s*,\s*index\s*\)/.test(leak) && !/CASE_SLUG\.test\s*\(\s*requestedSlug/.test(leak), '누수 공개 사례 allowlist 검증이 약해졌습니다');
  for (const [name, source] of [['파일럿', pilot], ['누수 문의', leak]]) fail(!/(?:hyeonjang|#hjreq=|#lead=|autoImport|importLead)/i.test(source), `${name}가 현장 웹 딥링크에 연결되었습니다`);
  fail(!/(?:<script\b|onclick\s*=|data-action\s*=|endpoint|workflow)/i.test(portalNotice), '직원 포털 상업 공지는 정적 notice만 허용됩니다');
  const pilotPrivacy = element(privacy, 'privacy-office-pilot-items');
  const leakPrivacy = element(privacy, 'privacy-leak-items');
  fail([/단지명/, /관리사무소 담당자명/, /관심 업무/, /도입 희망 시점/].every(pattern => pattern.test(pilotPrivacy)), '파일럿 개인정보 항목이 정확한 문단에 모두 없습니다');
  fail([/신청 목적/, /희망 방문일/, /희망 시간대/, /증상/].every(pattern => pattern.test(leakPrivacy)), '누수 개인정보 항목이 정확한 문단에 모두 없습니다');

  fail(/const\s+NAVER_HOSTS\s*=\s*new Set\(\[['"]booking\.naver\.com['"],\s*['"]m\.booking\.naver\.com['"]\]\)/.test(revenue) && /NAVER_HOSTS\.has\(url\.hostname\)/.test(revenue), '공식 네이버 host exact 검증이 없습니다');
  fail(/naver\.ready\s*===\s*true/.test(leak), '네이버 handoff ready exact 조건이 없습니다');
  fail(validNaver(config.naver), 'config naver ready/bookingUrl 계약이 올바르지 않습니다');

  for (const script of ['revenue-conversion.js', 'office-pilot.js']) {
    const literalCount = (policy.match(new RegExp(`['"]${script.replace('.', '\\.')}['"]`, 'g')) || []).length;
    fail(PUBLIC_JS_FILES.filter(value => value === script).length === 1 && literalCount === 1, `${script} artifact allowlist가 정확히 한 번 등록되지 않았습니다`);
  }
  const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(office)?.[1] || '';
  const connect = csp.split(';').map(value => value.trim()).filter(value => /^connect-src\b/.test(value));
  fail(connect.length === 1, 'office CSP connect-src는 정확히 하나여야 합니다');
  if (connect[0]) {
    const tokens = connect[0].split(/\s+/).slice(1);
    fail(!tokens.some(value => value.includes('*')), 'office CSP connect-src 와일드카드는 금지됩니다');
    const origins = expectedOrigins(config);
    const expected = ["'self'", ...(origins || [])];
    fail(origins !== null && tokens.length === new Set(tokens).size && tokens.length === expected.length && expected.every(value => tokens.includes(value)), 'office CSP는 정확한 활성 provider origin만 허용합니다');
    let originOnly = true;
    for (const value of tokens) {
      if (!/^https?:/.test(value)) continue;
      try { if (new URL(value).origin !== value) originOnly = false; } catch { originOnly = false; }
    }
    fail(originOnly, 'office CSP connect-src에는 provider origin만 허용합니다');
  }
  const order = (html, names) => names.map(name => html.indexOf(name));
  const ordered = indexes => indexes.every((value, index) => value >= 0 && (!index || indexes[index - 1] < value));
  fail(ordered(order(office, ['revenue-conversion.js', 'lead-transport.js', 'office-pilot.js'])), 'office 공개 script 순서가 올바르지 않습니다');
  fail(ordered(order(read(root, 'leak.html', fileSystem), ['revenue-conversion.js', 'lead-transport.js', 'leak-inquiry.js'])), '누수 공개 script 순서가 올바르지 않습니다');

  fail(/관리사무소 30일 파일럿 신청/.test(privacy), '개인정보처리방침의 관리사무소 파일럿 문구가 없습니다');
  fail(/privacy-office-pilot-items[\s\S]*?최대 1년/.test(privacy), '파일럿 개인정보 1년 보유 안내가 없습니다');
  fail(/privacy-office-pilot-items[\s\S]*?삭제 요청[\s\S]*?010-2397-8629/.test(privacy), '파일럿 개인정보 삭제 연락 경로가 없습니다');
  fail(/privacy-office-pilot-items[\s\S]*?입주민[\s\S]*?자유입력란[\s\S]*?패턴[\s\S]*?차단/.test(privacy), '파일럿 입주민 정보 경고와 명시적 패턴 차단 안내가 없습니다');
  fail(!/(?:모든|어떠한|임의의)\s*(?:개인정보|PII).{0,20}(?:차단|포함되지)/.test(privacy), '개인정보처리방침이 임의의 모든 PII 차단을 과장합니다');
  fail(!/(?:localStorage|sessionStorage|indexedDB|\bcaches\b|console\.|location\.(?:href|search|hash)|hyeonjang|#hjreq=|#lead=|autoImport|importLead)/i.test(pilot), '파일럿 소스에 영구 저장·URL·console·현장 딥링크 sink가 있습니다');

  const noticeMatch = /\r?\n        <aside id="officeRequestCommercialNotice"[\s\S]*?^        <\/aside>\r?\n/m.exec(portal);
  fail(!!noticeMatch && sha256(portal.replace(noticeMatch?.[0] || '', '\n')) === baseline['office-request.html'], '직원 포털은 줄바꿈 정규화와 정적 상업 공지 외 byte-exact여야 합니다');
  for (const relative of Object.keys(baseline).filter(value => value !== 'office-request.html')) {
    try { fail(sha256(fileSystem.readFileSync(path.join(root, ...relative.split('/')))) === baseline[relative], `직원 포털 보호 파일이 변경되었습니다: ${relative}`); }
    catch { failures.push(`직원 포털 보호 파일을 읽지 못했습니다: ${relative}`); }
  }

  let artifactTemp = '';
  try {
    artifactTemp = fileSystem.mkdtempSync(path.join(os.tmpdir(), 'manmool-revenue-artifact-'));
    copyPublicSource(root, artifactTemp, fileSystem);
    const artifact = path.join(artifactTemp, '_site'); buildPagesArtifact(artifactTemp, artifact, fileSystem);
    walkText(artifact, fileSystem, absolute => { if (SALES_COPY.test(fileSystem.readFileSync(absolute, 'utf8'))) failures.push(`공개 artifact 판매 문구가 남았습니다: ${path.relative(artifact, absolute).replace(/\\/g, '/')}`); });
  } catch (error) { failures.push(`공개 artifact 판매 문구 검사를 완료하지 못했습니다: ${error.message}`); }
  finally { if (artifactTemp) fileSystem.rmSync(artifactTemp, { recursive: true, force: true }); }
  for (const relative of ['README.md', 'CODEX-인수인계.md', 'CODEX-인수인계-20260812.md']) {
    const file = path.join(root, relative); if (fileSystem.existsSync(file) && SALES_COPY.test(fileSystem.readFileSync(file, 'utf8'))) failures.push(`운영 문서 판매 문구가 남았습니다: ${relative}`);
  }
  const integrations = path.join(root, 'integrations');
  if (fileSystem.existsSync(integrations)) walkText(integrations, fileSystem, absolute => { if (SALES_COPY.test(fileSystem.readFileSync(absolute, 'utf8'))) failures.push(`운영 문서 판매 문구가 남았습니다: ${path.relative(root, absolute).replace(/\\/g, '/')}`); });
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = verifyRevenueOperations();
  if (failures.length) { for (const failure of failures) console.error(`✗ ${failure}`); process.exitCode = 1; }
  else console.log('✓ 공개 수익 운영 경계 정적·artifact 검증 통과');
}
