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

test('전체 주요 페이지에서 관리사무소 전용 창구로 이동할 수 있다', async () => {
  for (const file of [
    'index.html',
    'leak.html',
    'blog.html',
    'posts/apt-office-repair-partner.html',
    'designs/design-20260727-space300-living-35.html',
    'bathroom-check.html',
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${origin}/${file}`, { waitUntil: 'networkidle' });
    const officeLink = page.getByRole('link', { name: '관리사무소', exact: true }).first();
    assert.equal(await officeLink.count(), 1, `${file} 관리사무소 메뉴 누락`);
    assert.match(await officeLink.getAttribute('href'), /(?:^|\.\.\/)office\.html$/);
    await page.close();
  }
});

test('관리사무소 페이지는 이메일 직원 포털과 기존 PIN 접수 진입점을 함께 안내한다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${origin}/office.html`, { waitUntil: 'networkidle' });

  const bodyText = await page.locator('body').innerText();
  assert.match(bodyText, /아파트 관리사무소의 공식 홈페이지가 아니라/);
  assert.match(bodyText, /만물인테리어가.*운영하는.*상담 안내 페이지/);
  assert.match(bodyText, /관리사무소 직원 전용/);
  assert.match(bodyText, /등록된 이메일로 로그인/);
  assert.match(bodyText, /관리소장.*관리과장.*동대표.*입주민/);
  assert.match(bodyText, /기존 단지 전용 주소와 6자리 비밀번호 접수도 계속/);
  assert.doesNotMatch(bodyText, /\?office=<slug>/);
  assert.match(bodyText, /비밀번호.*주민등록번호.*신용카드.*계좌정보.*요청하지 않습니다/);
  assert.equal(await page.locator('#officeInquiry input, #officeInquiry textarea, #officeInquiry form').count(), 0);
  assert.equal(await page.locator('script[src*="office.js"]').count(), 0);
  assert.equal(await page.locator('a[href^="tel:01023978629"]').count() > 0, true);
  assert.equal(await page.getByRole('link', { name: '업무 문의', exact: true }).first().getAttribute('href'), '#officeInquiry');
  assert.equal(await page.getByRole('link', { name: '관리사무소 직원 로그인', exact: true }).first().getAttribute('href'), 'office-login.html');
  assert.equal(await page.getByRole('link', { name: '기존 6자리 비밀번호 접수', exact: false }).getAttribute('href'), 'office-request.html');

  await page.close();
});

test('개인정보처리방침은 관리사무소 접수의 항목, 목적, 보존기간과 브라우저 세션 경계를 밝힌다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${origin}/privacy.html`, { waitUntil: 'networkidle' });
  const text = await page.locator('main').innerText();
  for (const phrase of ['관리사무소 담당자', '선택한 입주민 연락처', '현장 사진', '시설보수 접수', '취소·거절된 접수', '90일', '완료된 일반 접수', '1년', '계약·세무 증빙', '법정 보관기간', '단지 코드', '등록 이메일', '동·호/담당 구역', '관리 상태', '관리 일지', '감사기록', '비밀번호 원문', '세션 토큰 원문']) {
    assert.equal(text.includes(phrase), true, `개인정보 안내 누락: ${phrase}`);
  }
  assert.equal(text.includes('문자 앱에서 직접 전송'), false);
  assert.equal(text.includes('브라우저에 남는 임시 사본도 1년'), false);
  await page.close();
});

test('관리사무소 페이지는 발주 판단 정보와 전화·직원 포털 경로를 제공한다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${origin}/office.html`, { waitUntil: 'networkidle' });

  assert.equal(await page.locator('body.office-page').count(), 1);
  assert.equal(await page.locator('.office-hero h1').count(), 1);
  assert.equal(await page.locator('.office-hero a[href="#officePilot"]').count(), 1);
  assert.equal(await page.locator('.office-hero a[href^="tel:"]').count(), 1);
  assert.equal(await page.locator('#officeServices .office-service-card').count() >= 4, true);
  assert.deepEqual(
    await page.locator('#officeProcess .office-process-step h3').allInnerTexts(),
    ['업무 접수', '현장 확인', '견적·승인', '시공·복구', '사진 보고·정산']
  );
  assert.equal(await page.locator('#officeCases a[href^="posts/"]').count() >= 3, true);
  assert.equal(await page.getByRole('link', { name: '관리사무소', exact: true }).getAttribute('aria-current'), 'page');
  assert.equal(await page.getByRole('link', { name: '전화 상담', exact: true }).getAttribute('href'), 'tel:01023978629');
  assert.equal(await page.getByRole('link', { name: '직원 포털 안내', exact: true }).getAttribute('href'), '#officeRequestIntro');
  await page.close();
});

test('관리사무소 상담 안내는 현장 위치와 증상을 우선 준비하도록 안내한다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/office.html`, { waitUntil: 'networkidle' });
  assert.deepEqual(
    await page.locator('.office-contact-list b').allInnerTexts(),
    ['단지명과 현장 위치', '발생한 증상', '사진과 희망 일정']
  );
  assert.match(await page.locator('.office-contact-list').innerText(), /누수.*배수 불량.*배관 파손/);
  await page.close();
});

test('관리사무소 첫 방문은 하단 상담 영역으로 자동 이동하지 않는다', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/office.html`, { waitUntil: 'networkidle' });
  const state = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY) }));
  assert.equal(state.scrollY < 10, true, `첫 화면이 ${state.scrollY}px 아래로 자동 이동함`);
  await page.close();
});

test('390px 화면에서 가로 넘침 없이 핵심 행동영역을 누를 수 있다', async () => {
  for (const file of ['index.html', 'leak.html', 'blog.html', 'office.html']) {
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

test('모바일 누수 사례의 상담 바로가기 제목을 고정 헤더 아래에 보여 준다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}/leak.html?case=apartment-balcony-rain-pipe-replacement#leakInquiry`, { waitUntil: 'networkidle' });
  const geometry = await page.evaluate(() => {
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const heading = document.querySelector('#leakInquiry h2').getBoundingClientRect();
    return { headerBottom: Math.round(header.bottom), headingTop: Math.round(heading.top) };
  });
  assert.equal(geometry.headingTop >= geometry.headerBottom,
    true, `상담 제목 top ${geometry.headingTop}px이 헤더 bottom ${geometry.headerBottom}px 뒤에 가려짐`);
  await page.close();
});

test('공통 버튼은 플랫폼 글꼴 줄높이와 무관하게 44px을 유지한다', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });

  // Linux와 Windows의 `line-height: normal` 계산 차이를 작은 줄높이로 재현한다.
  await page.addStyleTag({ content: '.btn { line-height: 15px !important; }' });
  const shortButtons = await page.locator('.sim-next, #nextStep').evaluateAll((buttons) => (
    buttons
      .filter((button) => button.getBoundingClientRect().height < 44)
      .map((button) => `${button.textContent.trim()}:${button.getBoundingClientRect().height}`)
  ));

  assert.deepEqual(shortButtons, [], `글꼴에 따라 44px 미만이 되는 버튼: ${shortButtons.join(', ')}`);
  await page.close();
});
