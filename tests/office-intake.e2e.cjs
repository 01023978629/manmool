const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
let server;
let browser;
let origin;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

before(async () => {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)
      .replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, rel);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
    });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('필수 동의 전에는 문자 검토 화면을 열지 않는다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${origin}/office-request.html`);
  await page.getByRole('button', { name: '문자 내용 확인' }).click();
  assert.equal(await page.locator('#requestReview').isHidden(), true);
  assert.match(await page.locator('#requestError').innerText(), /단지명/);
  await page.close();
});

test('정상 입력은 전송 전 검토와 SMS 링크를 만든다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${origin}/office-request.html`);
  await page.locator('[name="complex"]').fill('열매마을 7단지');
  await page.locator('[name="dong"]').fill('704');
  await page.locator('[name="ho"]').fill('1102');
  await page.locator('[name="issueType"]').selectOption('누수');
  await page.locator('[name="location"]').fill('욕실 천장');
  await page.locator('#officeRequestForm [name="description"]').fill('천장에서 물방울이 떨어집니다');
  await page.locator('[name="name"]').fill('홍길동');
  await page.locator('[name="phone"]').fill('01012345678');
  await page.locator('[name="privacyConsent"]').check();
  await page.getByRole('button', { name: '문자 내용 확인' }).click();
  assert.equal(await page.locator('#requestReview').isVisible(), true);
  assert.match(await page.locator('#requestPreview').inputValue(), /열매마을 7단지[\s\S]*704동 1102호/);
  assert.match(await page.locator('#smsLaunch').getAttribute('href'), /^sms:01023978629(?:\?|&)body=/);
  assert.match(await page.locator('#requestStatus').innerText(), /문자 앱에서 전송 버튼/);
  await page.close();
});

test('접수 페이지는 저장·자동 전송 없이 모바일에서 안전하게 보인다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const requests = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'fetch' || req.resourceType() === 'xhr') requests.push(req.url());
  });
  await page.goto(`${origin}/office-request.html`);
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    stored: localStorage.length + sessionStorage.length,
    short: [...document.querySelectorAll('button, a.request-button')]
      .filter((element) => {
        const height = element.getBoundingClientRect().height;
        return height > 0 && height < 44;
      }).length,
  }));
  assert.equal(metrics.scrollWidth, metrics.width);
  assert.equal(metrics.stored, 0);
  assert.equal(metrics.short, 0);
  assert.deepEqual(requests, []);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,follow');
  await page.close();
});
