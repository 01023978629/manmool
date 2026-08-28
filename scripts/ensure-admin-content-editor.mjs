import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const site = JSON.parse(read('data/site.json'));
const index = read('index.html');
const leak = read('leak.html');
const admin = read('admin.html');
const editor = read('js/content-editor.js');
const main = read('js/main.js');
const inquiry = read('js/inquiry.js');
const leakJs = read('js/leak.js');
const adminJs = read('js/admin.js');
const integration = read('integrations/INTEGRATION.md');
const fail = [];
const check = (condition, message) => { if (!condition) fail.push(message); };

function functionBody(src, name) {
  const header = new RegExp(`^\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm').exec(src);
  if (!header) return null;
  const start = src.indexOf('{', header.index + header[0].length);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function executableJs(body) {
  const output = [...body];
  const mask = (index) => {
    if (output[index] !== '\n' && output[index] !== '\r') output[index] = ' ';
  };
  const contexts = [{ type: 'code', templateExpression: false, braceDepth: 0 }];
  let index = 0;

  while (index < body.length) {
    const context = contexts[contexts.length - 1];
    const char = body[index];
    const next = body[index + 1];

    if (context.type === 'template') {
      if (char === '\\') {
        mask(index);
        if (index + 1 < body.length) mask(index + 1);
        index += 2;
        continue;
      }
      if (char === '`') {
        mask(index);
        contexts.pop();
        index += 1;
        continue;
      }
      if (char === '$' && next === '{') {
        mask(index);
        mask(index + 1);
        contexts.push({ type: 'code', templateExpression: true, braceDepth: 1 });
        index += 2;
        continue;
      }
      mask(index);
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      mask(index);
      mask(index + 1);
      index += 2;
      while (index < body.length && body[index] !== '\n' && body[index] !== '\r') {
        mask(index);
        index += 1;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      mask(index);
      mask(index + 1);
      index += 2;
      while (index < body.length) {
        if (body[index] === '*' && body[index + 1] === '/') {
          mask(index);
          mask(index + 1);
          index += 2;
          break;
        }
        mask(index);
        index += 1;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      mask(index);
      index += 1;
      while (index < body.length) {
        if (body[index] === '\\') {
          mask(index);
          if (index + 1 < body.length) mask(index + 1);
          index += 2;
          continue;
        }
        const closes = body[index] === quote;
        mask(index);
        index += 1;
        if (closes) break;
      }
      continue;
    }
    if (char === '`') {
      mask(index);
      contexts.push({ type: 'template' });
      index += 1;
      continue;
    }
    if (context.templateExpression && char === '{') {
      context.braceDepth += 1;
      index += 1;
      continue;
    }
    if (context.templateExpression && char === '}') {
      context.braceDepth -= 1;
      if (context.braceDepth === 0) {
        mask(index);
        contexts.pop();
      }
      index += 1;
      continue;
    }
    index += 1;
  }

  return output.join('');
}

function directFunctionCalls(body) {
  const calls = [];
  const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with']);
  const executable = executableJs(body);
  const callPattern = /(?<![\w$])([A-Za-z_$][\w$]*(?:(?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*)|(?:\s*(?:\?\.)?\s*\[[^\]\r\n]*\]))*\s*(?:\?\.\s*)?)\(/g;
  for (const match of executable.matchAll(callPattern)) {
    const target = match[1].replace(/\s+/g, '');
    const bare = /^[A-Za-z_$][\w$]*$/.test(target);
    if (bare && keywords.has(target)) continue;
    const before = executable.slice(0, match.index);
    if (bare && /\bfunction\s*\*?\s*$/.test(before)) continue;
    calls.push(target);
  }
  for (const _ of executable.matchAll(/\)\s*(?:\?\.\s*)?\(/g)) {
    calls.push('(parenthesized callee)');
  }
  return calls;
}

check(/id="contentEditor"[^>]*data-content-editor/.test(admin), '관리자 콘텐츠 편집기 영역이 없습니다.');
check(/js\/content-editor\.js/.test(admin), '관리자 콘텐츠 편집기 스크립트가 연결되지 않았습니다.');
for (const id of ['contentSave', 'contentPreview', 'contentDownload', 'contentImport', 'contentRequestCopy', 'contentClear']) {
  check(admin.includes(`id="${id}"`), `관리자 편집 도구 ${id} 버튼이 없습니다.`);
}
check(editor.includes("const DRAFT_KEY = 'manmul_site_content_draft_v1'"), '관리자 초안 키가 없습니다.');
check(main.includes("const CONTENT_DRAFT_KEY = 'manmul_site_content_draft_v1'"), '공개 미리보기와 관리자 초안 키가 다릅니다.');
check(/get\('preview'\) === '1'/.test(main), 'preview=1일 때만 초안을 읽는 안전 경계가 없습니다.');
check(/portfolio\.length >= 300/.test(main) && /MIN_PORTFOLIO = 300/.test(editor), '300개 디자인 보존 검사가 없습니다.');
check(/new Blob/.test(editor) && /site-수정본/.test(editor), '수정 site.json 내보내기가 없습니다.');
check(/JSON\.parse\(await file\.text\(\)\)/.test(editor), '기존 JSON 가져오기 기능이 없습니다.');
check(!/(?:api\.github\.com|Authorization|Bearer\s)/i.test(editor), '공개 관리자 편집기가 GitHub 자격증명을 직접 다루고 있습니다.');
check(/sensitiveKeyFound/.test(editor) && /HTML 기호/.test(editor), '가져온 콘텐츠의 비밀값·HTML 검사가 없습니다.');

check(Array.isArray(site.actualWork) && site.actualWork.length >= 3, 'data/site.json에 실제 현장 카드 3개가 없습니다.');
for (const [indexNo, item] of (site.actualWork || []).entries()) {
  check(item.title && item.desc && item.image && item.href, `실제 현장 ${indexNo + 1}번 필수값이 없습니다.`);
  check(fs.existsSync(path.join(ROOT, item.image || 'missing')), `실제 현장 ${indexNo + 1}번 사진 파일이 없습니다: ${item.image}`);
}
check(/id="actualWorkGrid"/.test(index) && /renderActualWork\(data\.actualWork\)/.test(main), '실제 현장 데이터가 공개 대문에 연결되지 않았습니다.');

/* 대문의 정적 카드가 site.json 과 같은 사례를 가리키는가 --------------------
 * renderActualWork 가 실행되면 innerHTML 을 통째로 갈아끼우므로, JS 를 켠
 * 손님은 항상 site.json 대로 본다. 문제는 그 앞뒤다 — JS 를 안 돌리는 크롤러,
 * 스크립트 로드 실패, 로드 직전 한순간에는 index.html 에 박아 둔 카드가 그대로
 * 보인다. 실제로 #118 병합 뒤 대문 정적 카드는 내린 사례를 계속 보여 주고
 * 새 사례로 가는 링크는 하나도 없는 상태였다. 두 벌이 존재하는 한 조용히
 * 갈라지므로, 최소한 "어느 글을 가리키는가"만은 맞춰 둔다. */
{
  const grid = (index.split('id="actualWorkGrid">')[1] || '').split('<div class="real-work-note"')[0];
  const staticHrefs = [...grid.matchAll(/class="real-work-card" href="([^"]+)"/g)].map((m) => m[1]);
  const dataHrefs = (site.actualWork || []).slice(0, 6).map((x) => x.href);
  check(staticHrefs.length > 0, '대문에서 정적 실제 현장 카드를 찾지 못했습니다.');
  check(JSON.stringify(staticHrefs) === JSON.stringify(dataHrefs),
    `대문 정적 실제 현장 카드가 data/site.json 과 다릅니다.\n      대문: ${JSON.stringify(staticHrefs)}\n      정본: ${JSON.stringify(dataHrefs)}`);
}
check(!/href="admin\.html"/.test(index), '공개 대문에 관리자 링크가 다시 노출됐습니다.');

check(/id="projectGuide"/.test(index), '공사 시작 가이드가 없습니다.');
for (const key of ['full', 'partial', 'commercial', 'leak']) {
  check(index.includes(`data-project-guide="${key}"`) && main.includes(`${key}: {`), `공사 시작 가이드 ${key} 경로가 없습니다.`);
}
check(/params\.get\('scope'\)/.test(inquiry), '가이드에서 상담 범위를 자동 선택하지 못합니다.');

check(/id="firstResponse"/.test(leak) && /js\/leak\.js/.test(leak), '누수 첫 대응 체크리스트가 연결되지 않았습니다.');
check((leak.match(/responseChecks[\s\S]*?input type="checkbox"/g) || []).length >= 1, '누수 체크 항목이 없습니다.');
check((leak.match(/input type="checkbox" value=/g) || []).length === 4, '누수 첫 대응 체크 항목은 4개여야 합니다.');
check(/navigator\.clipboard/.test(leakJs) && !/localStorage|sessionStorage|fetch\(/.test(leakJs), '누수 체크 내용이 저장·전송되거나 복사 기능이 없습니다.');

/* 공개 관리자에는 문의 개인정보 보드가 없고 외부 경로 상태만 둔다. ---------
 * content-editor.js 의 manmul_site_content_draft_v1 은 공개 콘텐츠 미리보기용
 * 비개인 초안이므로 이 검사 대상이 아니다. */
{
  const relevantScripts = [...admin.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)]
    .map((match) => match[1].split('?')[0])
    .filter((src) => ['js/lead-transport.js', 'js/admin.js', 'js/content-editor.js'].includes(src));
  check(JSON.stringify(relevantScripts) === JSON.stringify([
    'js/lead-transport.js', 'js/admin.js', 'js/content-editor.js'
  ]), '관리자 스크립트는 lead-transport → admin → content-editor 순서여야 합니다.');

  for (const id of ['pipelineStatus', 'pipeNote', 'connBadge', 'connTest', 'connGrid', 'connResult']) {
    check(admin.includes(`id="${id}"`), `외부 접수 경로 상태 요소 ${id}가 없습니다.`);
  }
  const leadRouteBody = functionBody(adminJs, 'leadRoute') || '';
  const pipelineBody = functionBody(adminJs, 'renderPipeline') || '';
  const connectionBody = functionBody(adminJs, 'renderConnection') || '';
  const checkBody = functionBody(adminJs, 'checkConnection') || '';
  const initBody = functionBody(adminJs, 'init') || '';
  check(/n8n\.enabled\s*&&\s*n8n\.inquiryWebhookUrl/.test(leadRouteBody) &&
        /forms\.enabled\s*&&\s*forms\.endpoint\s*&&\s*SUPPORTED_FORM_PROVIDERS\.includes\(provider\)/.test(leadRouteBody),
    'leadRoute()가 외부 n8n/지원 폼 경로 상태를 판정하지 않습니다.');
  check(/leadRoute\(\)/.test(pipelineBody) && /pipelineStatus/.test(pipelineBody),
    'renderPipeline()이 외부 접수 경로 상태를 표시하지 않습니다.');
  check(/leadRoute\(\)/.test(connectionBody) && /connBadge/.test(connectionBody) && /connGrid/.test(connectionBody),
    'renderConnection()이 외부 접수 경로 상태를 표시하지 않습니다.');
  check(/실제 문의는 전송하지 않았습니다/.test(checkBody) && !/\b(?:fetch|deliver)\s*\(/.test(checkBody),
    '접수 경로 확인이 비파괴 설정 확인이 아니거나 실제 시험 문의를 전송합니다.');
  check(/const\s+button\s*=\s*\$\(\s*['"]connTest['"]\s*\)/.test(initBody) &&
        /button\.addEventListener\(\s*['"]click['"]\s*,\s*checkConnection\s*\)/.test(initBody),
    '#connTest가 checkConnection 클릭 경로에 실제로 바인딩되지 않았습니다.');

  check(!/(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem)\s*\(/.test(adminJs),
    '공개 관리자 코드가 문의 개인정보를 브라우저 영구 저장소에서 읽거나 씁니다.');
  check(!/^\s*(?:async\s+)?function\s+(?:saveLocal|loadLocal|seed|seedDemo|seedInquiries|renderKpi|renderInquiries|renderLeadBoard|onListClick|setStatus|sendToHyeonjang)\s*\(/m.test(adminJs),
    '공개 관리자 코드에 퇴역한 로컬 문의 reader/writer/seed/board 함수가 있습니다.');
  for (const id of ['kpiRow', 'inquiryPanel', 'inqCount', 'statusFilter', 'seedBtn', 'inquiryList', 'emptyNote']) {
    check(!new RegExp(`\\bid="${id}"`).test(admin), `공개 관리자 HTML에 퇴역한 로컬 문의 UI #${id}가 있습니다.`);
  }
  for (const className of ['kpi-row', 'inquiry-list', 'inq-card', 'inq-actions']) {
    check(!new RegExp(`\\bclass="[^"]*\\b${className}\\b`).test(admin),
      `공개 관리자 HTML에 퇴역한 로컬 문의 UI .${className}가 있습니다.`);
  }

  const routeReturns = [...leadRouteBody.matchAll(/\breturn\s*\{([^}]*)\}/g)].map((match) => match[1]).join('\n');
  check(!/\b(?:detail|endpoint|accessKey|inquiryWebhookUrl)\s*:/.test(routeReturns),
    'leadRoute() 반환값이 endpoint/accessKey 상세를 클릭·렌더 경로에 노출합니다.');
  check(/return\s*\{\s*on:\s*true,\s*via:\s*['"]n8n['"],\s*provider:\s*['"]n8n['"]\s*\}/.test(leadRouteBody) &&
        /return\s*\{\s*on:\s*true,\s*via:\s*['"]forms['"],\s*provider\s*\}/.test(leadRouteBody) &&
        /return\s*\{\s*on:\s*false,\s*via:\s*['"]['"],\s*provider:\s*['"]['"]\s*\}/.test(leadRouteBody),
    'leadRoute()가 route/provider 상태 외 설정 상세를 반환하거나 반환 계약이 달라졌습니다.');
  const allowedCheckCalls = new Set(['$', 'leadRoute']);
  const unexpectedCheckCalls = directFunctionCalls(checkBody).filter((name) => !allowedCheckCalls.has(name));
  check(unexpectedCheckCalls.length === 0,
    'checkConnection() 클릭 경로가 검증되지 않은 helper를 호출합니다: ' + unexpectedCheckCalls.join(', '));
  check(!/\bCONFIG\b|\bforms\.(?:endpoint|accessKey)\b|\bn8n\.inquiryWebhookUrl\b/.test(checkBody) &&
        !/(?:\.innerHTML\b|\.outerHTML\b|\.insertAdjacentHTML\s*\(|\.setAttribute\s*\(|\.dataset\b|\.(?:href|src)\b|\b(?:console|location|history)\.|\bwindow\.open\s*\(|\bURL\s*\()/.test(checkBody),
    'checkConnection() 클릭 경로가 설정 상세를 DOM/text/attribute/console/URL sink로 보낼 수 있습니다.');

  const renderedStatus = pipelineBody + connectionBody + checkBody;
  check(!/route\.detail/.test(renderedStatus) &&
        !/\$\{\s*(?:forms\.(?:endpoint|accessKey)|n8n\.inquiryWebhookUrl)\s*\}/.test(renderedStatus) &&
        !/escapeHtml\(\s*(?:forms\.(?:endpoint|accessKey)|n8n\.inquiryWebhookUrl)\s*\)/.test(renderedStatus) &&
        !/(?:textContent|innerHTML)\s*=\s*(?:forms\.(?:endpoint|accessKey)|n8n\.inquiryWebhookUrl)/.test(renderedStatus),
    '관리자 상태 화면이 endpoint/accessKey 같은 설정 상세를 렌더링합니다.');

  const alimtalkSection = (integration.split('## 5-1.')[1] || '').split('\n---')[0];
  check(!/`admin\.html`의\s*\*\*수동 발송\*\*/.test(alimtalkSection) &&
        /승인된\s*외부\s*워크플로|보호된\s*운영\s*도구/.test(alimtalkSection) &&
        /공개\s*관리자[^\n]*(?:복사|문자|카카오)[^\n]*제공하지/.test(alimtalkSection),
    'INTEGRATION.md 알림톡 안내가 퇴역한 공개 admin 수동 발송 계약을 다시 주장합니다.');
}

if (fail.length) {
  console.error('FAIL  관리자 편집기·방문자 도구 검증 실패');
  fail.forEach((message) => console.error(' - ' + message));
  process.exit(1);
}
console.log('PASS  관리자 콘텐츠 편집·미리보기·백업 + 공사 시작 가이드 + 누수 첫 대응 도구');
