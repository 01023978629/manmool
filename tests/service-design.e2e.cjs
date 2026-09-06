/* Public service-page behavior: serve the Pages artifact; never submit a form. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, '_site');
const SERVICES = [
  { file: 'index.html', category: 'interior', form: '#inquiryForm' },
  { file: 'leak.html', category: 'leak', form: '#leakForm' },
  { file: 'office.html', category: 'leak', form: '#officePilotForm' },
];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
let server, browser, origin;

before(async () => {
  assert.equal(fs.existsSync(path.join(PUBLIC_ROOT, 'index.html')), true,
    '공개 산출물이 없습니다. 먼저 node scripts/build-pages-artifact.mjs를 실행하세요.');
  server = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let target;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      target = path.resolve(PUBLIC_ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
    } catch (_) { res.writeHead(400).end(); return; }
    if (!target.startsWith(PUBLIC_ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end(); return;
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

async function openPublic(t, file, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
    serviceWorkers: 'block', ...options,
  });
  const mutations = [];
  const errors = [];
  const missingFiles = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') mutations.push({ method: request.method(), url: request.url() });
    if (!request.url().startsWith(origin + '/') || request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith(origin + '/') && response.status() >= 400) {
      missingFiles.push(new URL(response.url()).pathname + ':' + response.status());
    }
  });
  t.after(async () => {
    await context.close();
    assert.deepEqual(mutations, [], '페이지 이동 중 폼이나 데이터를 전송함');
    assert.deepEqual(errors, [], '브라우저 JavaScript 오류');
    assert.deepEqual(missingFiles, [], '공개 산출물에서 요청 파일 누락');
  });
  await page.goto(`${origin}/${file}`, { waitUntil: 'networkidle' });
  return page;
}

async function settleScroll(page) {
  await page.evaluate(() => new Promise((resolve) => {
    let previous = window.scrollY;
    let stable = 0;
    let frames = 0;
    function frame() {
      stable = Math.abs(window.scrollY - previous) < 1 ? stable + 1 : 0;
      previous = window.scrollY;
      if (stable >= 6 || ++frames >= 180) { resolve(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
}

async function assertTargetUncovered(page, hash, label) {
  const geometry = await page.evaluate((targetHash) => {
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const nav = document.querySelector('.service-jump-nav').getBoundingClientRect();
    const target = document.getElementById(decodeURIComponent(targetHash.slice(1)));
    const heading = target.matches('h1,h2,h3') ? target : target.querySelector('h1,h2,h3') || target;
    const box = heading.getBoundingClientRect();
    return {
      headerBottom: header.bottom, navTop: nav.top, navBottom: nav.bottom,
      headingTop: box.top, headingBottom: box.bottom, viewportHeight: innerHeight,
    };
  }, hash);
  assert.equal(geometry.navTop >= geometry.headerBottom - 2, true,
    `${label}: 섹션 메뉴가 고정 헤더와 겹침 ${JSON.stringify(geometry)}`);
  assert.equal(geometry.headingTop >= Math.max(geometry.headerBottom, geometry.navBottom) - 2, true,
    `${label}: 이동한 제목이 헤더/섹션 메뉴에 가려짐 ${JSON.stringify(geometry)}`);
  assert.equal(geometry.headingTop < geometry.viewportHeight, true,
    `${label}: 이동한 제목이 화면 밖에 있음 ${JSON.stringify(geometry)}`);
}

async function assertCurrentTarget(page, hash, label) {
  try {
    await page.waitForFunction((expected) =>
      document.querySelector('.service-jump-nav a[aria-current="location"]')?.getAttribute('href') === expected, hash);
  } catch (error) {
    const positions = await page.locator('.service-jump-nav a').evaluateAll((links) => links.map((link) => ({
      href: link.getAttribute('href'), current: link.getAttribute('aria-current'),
      top: Math.round(document.getElementById(link.hash.slice(1)).getBoundingClientRect().top),
    })));
    assert.fail(`${label}: 현재 섹션 ${hash} 표시 실패 ${JSON.stringify(positions)} (${error.name})`);
  }
}

async function assertServiceMenu(page, selector, currentFile) {
  for (const { file } of SERVICES) {
    const link = page.locator(`${selector} a[href="${file}"]`);
    assert.equal(await link.count(), 1, `${selector}의 ${file} 서비스 링크 누락/중복`);
    assert.equal(await link.isVisible(), true, `${selector}의 ${file} 링크를 사용할 수 없음`);
    assert.equal(await page.locator(`#mainNav a[href="${file}"]:visible, .service-family a[href="${file}"]:visible`).count(), 1,
      `${file} 상단 서비스 메뉴가 한 벌로 표시되지 않음`);
  }
  assert.equal(await page.locator(`${selector} [aria-current="page"]`).count(), 1);
  assert.equal(await page.locator(`${selector} [aria-current="page"]`).getAttribute('href'), currentFile);
}

async function followAnotherService(page, selector, currentFile) {
  const next = SERVICES[(SERVICES.findIndex(({ file }) => file === currentFile) + 1) % SERVICES.length].file;
  await page.locator(`${selector} a[href="${next}"]`).click();
  await page.waitForURL(`${origin}/${next}`);
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('body.service-page').count(), 1, '서비스 전환 후 페이지 로드 실패');
  assert.equal(await page.locator(`${selector} [aria-current="page"]`).getAttribute('href'), next,
    '전환한 서비스의 현재 메뉴 표시가 다름');
}

for (const service of SERVICES) {
  for (const width of [320, 390, 1280]) {
    test(`${service.file} ${width}px: 서비스 전환·상담 경로·44px 버튼·고정 섹션 이동`, async (t) => {
      const page = await openPublic(t, service.file, { viewport: { width, height: 900 } });
      assert.equal(await page.locator('body.service-page').count(), 1);
      assert.equal(await page.locator(service.form).count(), 1, '기존 상담 폼 ID 누락');
      assert.equal(await page.locator('.service-family').count(), 0,
        'JavaScript 사용 중 대체 서비스 메뉴가 중복으로 생성됨');
      const mobile = width <= 960;
      if (mobile) {
        assert.equal(await page.locator('#mainNav').isVisible(), false, '모바일 메뉴가 처음부터 열려 있음');
        assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'false');
        await page.locator('#navToggle').click();
        assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'true');
      }
      await assertServiceMenu(page, '#mainNav', service.file);
      assert.equal(await page.locator('.service-family:visible').count(), 0,
        '주요 메뉴를 연 뒤 대체 서비스 메뉴가 함께 보임');
      assert.equal(await page.locator(`a[href="blog.html?category=${service.category}"]`).count() > 0, true,
        '서비스에 맞는 사례 필터 링크 누락');

      const metrics = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        short: [...document.querySelectorAll([
          '#mainNav a', '#navToggle', '.service-jump-nav a', '.btn', '.primary-button',
          '.office-button', '.hero-actions a', '.hero-actions button',
          '.office-hero-actions a', '.leak-hero-cta a', '.leak-hero-cta button',
          '.mobile-call-bar', '.mobile-service-dock a',
        ].join(','))].filter((el) => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return box.width > 0 && box.height > 0 && style.visibility !== 'hidden'
            && (box.height < 43.5 || box.width < 43.5);
        }).map((el) => `${el.textContent.trim()}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`),
      }));
      assert.equal(metrics.scroll, metrics.width, '페이지 가로 넘침');
      assert.deepEqual(metrics.short, [], '44px 미만 핵심 조작 영역');
      if (mobile) {
        await page.locator('#navToggle').click();
        assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'false');
        assert.equal(await page.locator('#mainNav').isVisible(), false, '모바일 메뉴가 닫히지 않음');
      }

      const jumpLinks = page.locator('.service-jump-nav a');
      const hashes = await jumpLinks.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
      assert.equal(hashes.length >= 3, true, '섹션 이동 링크가 부족함');
      assert.equal(new Set(hashes).size, hashes.length, '섹션 이동 링크 중복');
      for (let index = 0; index < hashes.length; index++) {
        const hash = hashes[index];
        assert.match(hash, /^#[^#]+$/, '기본 앵커 링크여야 함');
        assert.equal(await page.locator(hash).count(), 1, `${hash} 이동 대상 누락/중복`);
        await jumpLinks.nth(index).click();
        await settleScroll(page);
        assert.equal(new URL(page.url()).hash, hash, '앵커 주소를 유지하지 않음');
        await assertTargetUncovered(page, hash, `${service.file}/${width}/${hash}`);
        await assertCurrentTarget(page, hash, `${service.file}/${width}`);
        assert.equal(await page.locator('.service-jump-nav a[aria-current="location"]').count(), 1,
          '현재 보는 섹션이 여러 개 선택됨');
      }
      const afterScroll = await page.evaluate(() => ({
        width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      }));
      assert.equal(afterScroll.scroll, afterScroll.width, '섹션 이동 후 페이지 가로 넘침');
      if (mobile) await page.locator('#navToggle').click();
      await assertServiceMenu(page, '#mainNav', service.file);
      await followAnotherService(page, '#mainNav', service.file);
      assert.equal(await page.locator('.service-family').count(), 0, '서비스 전환 뒤 대체 메뉴가 중복으로 생성됨');
      if (mobile) assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'false');
    });
  }

  test(`${service.file}: 키보드 이동과 수동 스크롤은 현재 섹션을 표시하고 포커스를 빼앗지 않는다`, async (t) => {
    const page = await openPublic(t, service.file, { viewport: { width: 390, height: 844 } });
    await page.locator('#navToggle').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'true',
      '키보드로 주요 메뉴를 열 수 없음');
    await assertServiceMenu(page, '#mainNav', service.file);
    for (const selector of ['#mainNav a', '.service-jump-nav a']) {
      if (selector === '.service-jump-nav a') {
        await page.locator('#navToggle').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'), 'false');
      }
      const links = page.locator(selector);
      await links.first().focus();
      for (let index = 1; index < await links.count(); index++) {
        await page.keyboard.press('Tab');
        assert.equal(await links.nth(index).evaluate((link) => document.activeElement === link), true,
          `${selector} ${index + 1}번째 링크에 Tab으로 접근할 수 없음`);
      }
    }
    const links = page.locator('.service-jump-nav a');
    const targetLink = links.nth(1);
    const hash = await targetLink.getAttribute('href');
    await targetLink.focus();
    await page.keyboard.press('Enter');
    await settleScroll(page);
    assert.equal(new URL(page.url()).hash, hash);
    await assertTargetUncovered(page, hash, `${service.file}/keyboard`);

    const otherHash = await links.nth(2).getAttribute('href');
    await links.first().focus();
    await page.evaluate((targetHash) => {
      const target = document.getElementById(targetHash.slice(1));
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const nav = document.querySelector('.service-jump-nav').getBoundingClientRect();
      window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - header.height - nav.height - 8);
    }, otherHash);
    await settleScroll(page);
    await assertCurrentTarget(page, otherHash, `${service.file}/manual-scroll`);
    assert.equal(await links.first().evaluate((link) => document.activeElement === link), true,
      '스크롤 위치 추적이 키보드 포커스를 옮김');
  });

  test(`${service.file}: JavaScript 없는 모바일은 대체 메뉴 한 벌과 섹션 앵커를 사용할 수 있다`, async (t) => {
    const page = await openPublic(t, service.file, {
      viewport: { width: 320, height: 844 }, javaScriptEnabled: false,
    });
    assert.equal(await page.locator('.service-family').count(), 1);
    assert.equal(await page.locator('.service-family a:visible').count(), 3);
    assert.equal(await page.locator('#mainNav').isVisible(), false);
    await assertServiceMenu(page, '.service-family', service.file);
    const links = page.locator('.service-jump-nav a');
    assert.equal(await links.count() >= 3, true);
    const hash = await links.nth(1).getAttribute('href');
    await links.nth(1).click();
    // With page scripts disabled rAF callbacks do not run. Reduced motion makes
    // this native anchor jump immediate, so geometry can be inspected directly.
    assert.equal(new URL(page.url()).hash, hash);
    await assertTargetUncovered(page, hash, `${service.file}/no-JavaScript`);
    await followAnotherService(page, '.service-family', service.file);
    assert.equal(await page.locator('.service-family a:visible').count(), 3);
  });

  test(`${service.file}: JavaScript 없는 데스크톱은 대체 메뉴를 숨기고 주요 메뉴로 전환한다`, async (t) => {
    const page = await openPublic(t, service.file, {
      viewport: { width: 1280, height: 900 }, javaScriptEnabled: false,
    });
    assert.equal(await page.locator('.service-family:visible').count(), 0, '데스크톱 대체 메뉴가 주요 메뉴와 중복됨');
    await assertServiceMenu(page, '#mainNav', service.file);
    await followAnotherService(page, '#mainNav', service.file);
    assert.equal(await page.locator('.service-family:visible').count(), 0, '서비스 전환 뒤 대체 메뉴가 중복됨');
  });
}

test('인테리어 참고 이미지는 실제 완공 사진과 구분하고 직원 접수·로그인 경로를 유지한다', async (t) => {
  const page = await openPublic(t, 'index.html');
  const hero = page.locator('img[src="assets/site/hero-interior.jpg"]');
  assert.equal(await hero.count(), 1, '인테리어 대표 참고 이미지 누락/중복');
  assert.equal(await hero.isVisible(), true);
  assert.equal(await hero.evaluate((img) => img.complete && img.naturalWidth > 0), true, '대표 이미지 로드 실패');
  const label = hero.locator('..').getByText(/디지털 참고 시안/);
  assert.equal(await label.isVisible(), true, '대표 이미지의 디지털 참고 시안 표기가 보이지 않음');
  await page.goto(`${origin}/office.html`, { waitUntil: 'networkidle' });
  for (const href of ['office-request.html', 'office-login.html']) {
    assert.equal(await page.locator(`a[href="${href}"]:visible`).count() > 0, true, `${href} 기존 직원 경로 누락`);
  }
});

test('섹션 메뉴가 고정된 채 데스크톱에서 모바일로 바뀌어도 제목을 가리지 않는다', async (t) => {
  const page = await openPublic(t, 'leak.html');
  const link = page.locator('.service-jump-nav a').nth(1);
  await link.click();
  await settleScroll(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await link.click();
  await settleScroll(page);
  await assertTargetUncovered(page, await link.getAttribute('href'), 'leak.html/resize');
});

test('서비스별 사례 링크는 URL 분야에 맞는 공개 카드만 표시한다', async (t) => {
  const page = await openPublic(t, 'blog.html?category=interior');
  for (const category of ['interior', 'leak', 'info']) {
    await page.goto(`${origin}/blog.html?category=${category}`, { waitUntil: 'networkidle' });
    await page.locator('#caseFinder').waitFor({ state: 'visible' });
    assert.equal(await page.locator(`[data-case-filter="${category}"]`).getAttribute('aria-pressed'), 'true');
    const groups = await page.locator('#blogRoot a[data-group]:visible')
      .evaluateAll((links) => links.map((link) => link.dataset.group));
    assert.equal(groups.length > 0, true, `${category} 분야가 빈 목록으로 표시됨`);
    assert.deepEqual([...new Set(groups)], [category], `${category} 외의 분야가 섞임`);
  }
});

test('잘못된 사례 분야는 전체로 돌아가고 잘못된 복원 상태는 유효한 URL 분야를 덮지 않는다', async (t) => {
  const page = await openPublic(t, 'blog.html?category=unknown');
  assert.equal(await page.locator('[data-case-filter="all"]').getAttribute('aria-pressed'), 'true');
  await page.addInitScript(() => {
    if (location.pathname.endsWith('/blog.html')) {
      history.replaceState({ manmoolCaseFinder: { group: 'unknown' } }, '');
    }
  });
  await page.goto(`${origin}/blog.html?category=info`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-case-filter="info"]').getAttribute('aria-pressed'), 'true');
});

test('분야 링크로 진입한 뒤 선택을 바꾸고 글에서 돌아오면 URL 기본값보다 사용자 선택을 복원한다', async (t) => {
  const page = await openPublic(t, 'blog.html?category=interior');
  await page.locator('[data-case-filter="leak"]').click();
  await page.locator('#caseSearch').fill('배관');
  await page.locator('#caseSort').selectOption('oldest');
  const results = page.locator('#blogRoot a[data-group]:visible');
  const before = await results.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  assert.equal(before.length > 0, true);
  await results.first().click();
  await page.waitForURL(`${origin}/${before[0]}`);
  await page.goBack({ waitUntil: 'networkidle' });
  await page.locator('#caseFinder').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).searchParams.get('category'), 'interior');
  assert.equal(await page.locator('[data-case-filter="leak"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#caseSearch').inputValue(), '배관');
  assert.equal(await page.locator('#caseSort').inputValue(), 'oldest');
  assert.deepEqual(await results.evaluateAll((links) => links.map((link) => link.getAttribute('href'))), before);
});
