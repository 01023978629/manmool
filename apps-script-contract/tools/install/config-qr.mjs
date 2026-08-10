import qr from 'qrcode-terminal';
import { stdin } from 'node:process';

let raw = '';
for await (const chunk of stdin) raw += chunk;
let data;
try { data = JSON.parse(raw); } catch { console.error('실패: 표준입력 JSON을 읽지 못했습니다.'); process.exit(1); }
if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(String(data.url || '')) || String(data.token || '').length < 40) {
  console.error('실패: 배포 주소 또는 관리자 토큰 형식이 올바르지 않습니다.'); process.exit(1);
}
const payload = Buffer.from(JSON.stringify({ v: 1, url: data.url, token: data.token }), 'utf8').toString('base64url');
const target = 'https://01023978629.github.io/hyeonjang/#hjcontract=' + encodeURIComponent(payload);
console.error('주의: 이 QR에는 관리자 토큰이 들어 있습니다. 다른 사람에게 보여 주거나 캡처하지 마세요.');
qr.generate(target, { small: true });
