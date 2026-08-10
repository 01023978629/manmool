import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((x) => {
  const m = x.match(/^--(naver|google)=(.+)$/);
  return m ? [m[1], m[2].trim()] : ['', ''];
}).filter(([k]) => k));
if (!args.naver && !args.google) {
  console.error('사용법: node scripts/set-verification.mjs --naver=<코드> [--google=<코드>]');
  process.exit(1);
}
for (const [kind, value] of Object.entries(args)) {
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(value) || /발급코드|여기코드|placeholder/i.test(value)) {
    console.error(kind + ' 소유확인 코드 형식이 올바르지 않습니다.'); process.exit(1);
  }
}
const file = resolve('index.html');
let html = readFileSync(file, 'utf8');
for (const [kind, value] of Object.entries(args)) {
  const name = kind === 'naver' ? 'naver-site-verification' : 'google-site-verification';
  const re = new RegExp('(?:<!--\\s*)?<meta\\s+name=["\']' + name + '["\']\\s+content=["\'][^"\']*["\']\\s*\\/?>(?:\\s*-->)?', 'i');
  const tag = `<meta name="${name}" content="${value}" />`;
  if (re.test(html)) html = html.replace(re, tag);
  else {
    const marker = '<!-- verification-meta: scripts/set-verification.mjs 가 실제 코드만 이 위치에 넣습니다. -->';
    if (!html.includes(marker)) { console.error(name + ' meta 위치를 찾지 못했습니다.'); process.exit(1); }
    html = html.replace(marker, marker + '\n  ' + tag);
  }
}
writeFileSync(file, html);
console.log('소유확인 meta 반영 완료: ' + Object.keys(args).join(', '));
