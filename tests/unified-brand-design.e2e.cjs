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
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(ROOT, rel);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
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

test('인테리어 홈은 자동화 설명 대신 고객의 공사 흐름과 도구를 보여준다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('.logo-text em').first().innerText(), '인테리어·누수 전문');
  const bodyText = await page.locator('body').innerText();
  for (const hiddenTerm of ['Loop Agent', 'n8n', 'AI ESTIMATOR', 'AI SIMULATOR', 'AI 견적 상담']) {
    assert.equal(bodyText.includes(hiddenTerm), false, `고객 화면에 ${hiddenTerm} 설명이 남아 있음`);
  }
  assert.deepEqual(await page.locator('#processList .process-step h3').allInnerTexts(), ['상담', '실측·견적', '시공', '준공·보증']);
  assert.equal(await page.locator('.consultation-proof-list > li').count(), 3);
  for (const id of ['estimator', 'simulator', 'inquiry']) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `#${id} 기능이 사라짐`);
  }
  assert.match(bodyText, /디지털 참고 시안\s*·\s*실제 완공 사진 아님/);
  await page.close();
});

test('누수 페이지는 같은 만물 브랜드와 서비스 전환을 제공한다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/leak.html`, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('.logo-text em').first().innerText(), '인테리어·누수 전문');
  assert.equal(await page.locator('a[href="index.html"]').count() > 0, true);
  assert.equal(await page.locator('a[href="blog.html"]').count() > 0, true);
  assert.equal(await page.locator('a[href="#leakInquiry"]').count() > 0, true);
  await page.close();
});

test('사례 목록은 전체 링크를 유지하며 고객이 분야별로 좁혀 볼 수 있다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/blog.html`, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('.logo-text em').first().innerText(), '인테리어·누수 전문');
  assert.equal(await page.locator('.insight-featured').count(), 1);
  const allLinks = await page.locator('.insights-grid a[href^="posts/"]').count();
  assert.equal(allLinks > 0, true);

  const leakFilter = page.getByRole('button', { name: '누수·배관' });
  await leakFilter.click();
  assert.equal(await leakFilter.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.insights-grid a[href^="posts/"]:visible').count() < allLinks, true);
  assert.match(await page.locator('#caseFilterStatus').innerText(), /\d+건/);
  assert.equal(await page.locator('.insights-grid a[href^="posts/"]').count(), allLinks, '필터가 정적 사례 링크를 DOM에서 삭제함');
  await page.close();
});

test('공개 보조 페이지도 같은 만물 브랜드를 사용한다', async () => {
  for (const file of ['bathroom-check.html', 'office.html', 'privacy.html']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/${file}`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.logo-text em').first().innerText(), '인테리어·누수 전문', `${file} 로고 부제가 다름`);
    assert.equal(await page.locator('link[href^="css/brand-system.css"]').count(), 1, `${file} 공통 브랜드 CSS 누락`);
    assert.equal((await page.locator('body').innerText()).includes('Loop Agent'), false, `${file} 예전 브랜드 문구가 남음`);
    assert.equal(await page.locator('a[href="index.html"]').count() > 0, true, `${file} 인테리어 전환 링크 누락`);
    assert.equal(await page.locator('a[href="leak.html"]').count() > 0, true, `${file} 누수 전환 링크 누락`);
    await page.close();
  }
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobilePage.goto(`${origin}/office.html`, { waitUntil: 'networkidle' });
  await mobilePage.locator('#navToggle').click();
  assert.equal(await mobilePage.locator('#navToggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await mobilePage.locator('#mainNav').evaluate((el) => el.classList.contains('open')), true);
  await mobilePage.close();
});

test('390px 화면에서 가로 넘침 없이 핵심 행동영역을 누를 수 있다', async () => {
  for (const file of ['index.html', 'leak.html', 'blog.html']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await page.goto(`${origin}/${file}`, { waitUntil: 'networkidle' });
    const metrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      shortActions: [...document.querySelectorAll([
        '.btn', '.nav-toggle', '.main-nav a', '.utility-nav a', '.utility-contact a',
        '.fab', '.mobile-service-dock a', '.header-cta', '.primary-button', '.text-button',
        '.mobile-call-bar', '.case-filter'
      ].join(','))]
        .filter((el) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0 && box.height < 44;
        })
        .slice(0, 5)
        .map((el) => `${el.textContent.trim()}:${Math.round(el.getBoundingClientRect().height)}`),
    }));
    assert.equal(metrics.scrollWidth, metrics.clientWidth, `${file} 가로 넘침`);
    assert.deepEqual(metrics.shortActions, [], `${file} 44px 미만 행동영역: ${metrics.shortActions.join(', ')}`);
    const menuBar = await page.locator('.nav-toggle span').first().boundingBox();
    assert.equal(Boolean(menuBar && menuBar.width >= 20 && menuBar.height >= 2), true, `${file} 모바일 메뉴 아이콘이 보이지 않음`);
    await page.close();
  }
});
