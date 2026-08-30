const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };
let server, browser, origin;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

before(async () => {
  server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream' }); fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function waitFor(predicate, ms=3000) { const start=Date.now(); while (!predicate()) { if(Date.now()-start>ms) throw new Error('timeout'); await new Promise(r=>setTimeout(r,20)); } }
async function newPage() { const page=await browser.newPage(); page.setDefaultTimeout(5000); return page; }
async function fillValid(page) {
  await page.fill('#pilotComplexName','테스트 단지'); await page.fill('#pilotOfficeContactName','시설 담당자');
  await page.fill('#pilotPhone','042-123-4567'); await page.fill('#pilotRegion','대전 중구');
  await page.check('input[name="pilotInterest"][value="preventive-inspection"]'); await page.fill('#pilotDesiredStart','2026년 9월');
  await page.fill('#pilotMemo','공용부 우수관 상담'); await page.check('#pilotPrivacyConsent');
}

test('pilot Web3Forms success sends one minimal lead and shows exact commercial boundary', async () => {
  const page=await newPage(); const posted=[]; const requests=[];
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.route('https://api.web3forms.com/**', async r=>{posted.push(JSON.parse(r.request().postData())); await r.fulfill({status:200,contentType:'application/json',body:'{"success":true}'});});
  await page.goto(`${origin}/office.html?utm_source=naver&utm_medium=organic&utm_campaign=pilot-2026`); await fillValid(page); await page.click('#officePilotSubmit'); await waitFor(()=>posted.length===1);
  const p=posted[0]; assert.equal(p.source,'office-pilot'); assert.equal(p.sourcePage,'/office.html'); assert.equal(p.ctaId,'office-pilot-submit'); assert.equal(p.utmCampaign,'pilot-2026');
  assert.equal(p.complexName,'테스트 단지'); assert.equal(p.officeContactName,'시설 담당자'); assert.equal(p.phone,'0421234567'); assert.equal(p.region,'대전 중구'); assert.deepEqual(p.pilotInterest,['preventive-inspection']); assert.equal(p.privacyConsent,true); assert.equal(p.status,'신규'); assert.ok(p.submittedAt);
  for(const x of ['단지명: 테스트 단지','관리사무소 담당자: 시설 담당자','지역: 대전 중구','관심 업무: 예방점검','도입 희망 시점: 2026년 9월','문의 내용: 공용부 우수관 상담']) assert.ok(p.message.includes(x),x);
  for(const x of ['residentName','residentPhone','unit','photo','bookingStatus','orderId','payment']) assert.equal(Object.hasOwn(p,x),false,x);
  const done=await page.locator('#officePilotDone').innerText(); assert.match(done,/접수됐습니다/); assert.match(done,/접수 프로그램 이용료 0원/); assert.match(done,/실제 작업은 별도 견적/);
  assert.equal((await page.locator('#officePilotStaticNotice').innerText()).trim(),'접수 프로그램 이용료 0원 · 실제 작업은 별도 견적');
  const packageText=(await page.locator('.office-package-note').innerText()).replace(/\s+/g,' ').trim(); assert.equal(packageText,'관리사무소 시험운영 접수 프로그램 이용료 0원 첫 1건의 접수·진행 현황 확인 흐름을 30일 동안 함께 확인합니다. 실제 작업은 별도 견적 · 출동·진단·공사는 현장 확인 후 안내');
  await new Promise(r=>setTimeout(r,250)); const external=requests.filter(r=>!r.url.startsWith(origin)); assert.deepEqual(external,[{url:'https://api.web3forms.com/submit',method:'POST'}]); assert.equal(requests.filter(r=>r.url.startsWith(origin)&&/(?:hyeonjang|import|booking|order|payment)/i.test(new URL(r.url).pathname)).length,0);
  const portal=await newPage(); await portal.goto(`${origin}/office-request.html`); assert.equal((await portal.locator('#officeRequestCommercialNotice').innerText()).replace(/\s+/g,' ').trim(),'접수 프로그램 이용료 0원 실제 작업은 별도 견적입니다. 출동·진단·공사 범위와 일정은 현장 확인 후 안내드립니다.'); await portal.close(); await page.close();
});

test('both-enabled config sends exactly one request to distinct n8n endpoint and zero Web3Forms', async () => {
  const page=await newPage(); const requests=[]; page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.route(`${origin}/office.html`, r=>r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(ROOT,'office.html'),'utf8').replace("connect-src 'self' https://api.web3forms.com","connect-src 'self' https://api.web3forms.com https://n8n.example.test")}));
  await page.route('**/data/config.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify({n8n:{enabled:true,inquiryWebhookUrl:'https://n8n.example.test/webhook/pilot'},forms:{enabled:true,provider:'web3forms',endpoint:'https://api.web3forms.com/submit',accessKey:'TEST_ONLY'}})}));
  await page.route('https://n8n.example.test/webhook/pilot', r=>r.fulfill({status:200,contentType:'application/json',body:'{"success":true}'}));
  await page.route('https://api.web3forms.com/submit', r=>r.abort());
  await page.goto(`${origin}/office.html`); await fillValid(page); await page.click('#officePilotSubmit'); await waitFor(()=>requests.some(r=>r.url==='https://n8n.example.test/webhook/pilot')); await new Promise(r=>setTimeout(r,250));
  const external=requests.filter(r=>!r.url.startsWith(origin)); assert.deepEqual(external,[{url:'https://n8n.example.test/webhook/pilot',method:'POST'}]); assert.equal(requests.filter(r=>r.url==='https://api.web3forms.com/submit').length,0); assert.equal(requests.filter(r=>r.url.startsWith(origin)&&/(?:hyeonjang|import|booking|order|payment)/i.test(new URL(r.url).pathname)).length,0); await page.close();
});

test('seven PII categories including domestic phone variants, six overlength fields, and unknown interest independently make zero POST', async t => {
  const pii=['입주민 전화 010-1234-5678','안심번호 0507-1234-5678','안심번호 050-1234-5678','대표번호 080-123-4567','대표번호 1588-1234','입주민 위치 101동','입주민 위치 1002호','참고 https://example.test/a','사진 링크를 확인해 주세요','입주민 이름 홍길동','세대주 성명 홍길동'];
  for(const [i,memo] of pii.entries()) await t.test(`PII ${i+1}`, async()=>runInvalid({memo},/입주민 정보/));
  const lengths=[['pilotComplexName',81],['pilotOfficeContactName',51],['pilotPhone',31],['pilotRegion',81],['pilotDesiredStart',81],['pilotMemo',501]];
  for(const [id,n] of lengths) await t.test(`length ${id}`, async()=>runInvalid({id,value:'가'.repeat(n)},/길이/));
  await t.test('unknown interest', async()=>runInvalid({unknown:true},/관심 업무/));
});
async function runInvalid(item,error) {
  const page=await newPage(); let posts=0; await page.route('https://api.web3forms.com/**',r=>{posts++; return r.fulfill({status:200,body:'{"success":true}'});}); await page.goto(`${origin}/office.html`); await fillValid(page);
  if(item.memo) await page.fill('#pilotMemo',item.memo); if(item.id) await page.evaluate(({id,value})=>document.getElementById(id).value=value,item);
  if(item.unknown) await page.evaluate(()=>{const x=document.createElement('input');x.name='pilotInterest';x.value='resident-contact';x.type='checkbox';x.checked=true;document.getElementById('officePilotForm').append(x);});
  await page.click('#officePilotSubmit'); assert.equal(posts,0); assert.match(await page.locator('#officePilotStatus').innerText(),error); await page.close();
}

test('failed delivery uses only current-tab fallback, no URL console persistence or automatic retry', async () => {
  const page=await newPage(); let posts=0; const logs=[]; page.on('console',m=>logs.push(m.text()));
  await page.addInitScript(()=>{ window.__copies=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>window.__copies.push(String(t))}}); const writes=[]; window.__writes=writes; for(const s of [localStorage,sessionStorage]){const o=s.setItem.bind(s);s.setItem=(k,v)=>{writes.push(['storage',k,v]);return o(k,v);};} const io=indexedDB.open.bind(indexedDB);indexedDB.open=(...a)=>{writes.push(['idb',String(a[0]||'')]);return io(...a);};if(window.caches){const co=caches.open.bind(caches);caches.open=(...a)=>{writes.push(['cache',String(a[0]||'')]);return co(...a);};} });
  let fail=true; await page.route('https://api.web3forms.com/**',r=>{posts++;return r.fulfill({status:fail?500:200,contentType:'application/json',body:fail?'{}':'{"success":true}'});}); await page.goto(`${origin}/office.html`); await fillValid(page); await page.click('#officePilotSubmit'); await waitFor(()=>posts===1); await page.locator('#officePilotCopy').click();
  const fallback=(await page.evaluate(()=>window.__copies.join('\n')))+'\n'+decodeURIComponent(await page.locator('#officePilotSms').getAttribute('href')); for(const x of ['테스트 단지','시설 담당자','대전 중구','예방점검','2026년 9월','공용부 우수관 상담']) assert.match(fallback,new RegExp(x));
  assert.deepEqual(await page.evaluate(()=>window.__writes),[]); assert.equal(['테스트 단지','시설 담당자','042-123-4567'].some(x=>page.url().includes(x)),false); assert.equal(logs.some(x=>/테스트 단지|시설 담당자|042-123-4567/.test(x)),false);
  assert.equal(await page.locator('a[href="tel:01023978629"]').count()>0,true); await new Promise(r=>setTimeout(r,250)); assert.equal(posts,1);
  fail=false; await page.click('#officePilotRetry'); await waitFor(()=>posts===2); await page.waitForFunction(()=>document.getElementById('officePilotDone').innerText.includes('접수됐습니다')); assert.match(await page.locator('#officePilotDone').innerText(),/접수됐습니다/); await page.reload({waitUntil:'networkidle'}); assert.equal(posts,2); assert.equal(await page.inputValue('#pilotComplexName'),''); await page.close();
});

test('required fields, consent, invalid phone, and provider rejection never show false success', async t => {
  for (const [label, mutate, expected] of [
    ['required', page=>page.fill('#pilotComplexName',''), /단지명/],
    ['office contact', page=>page.fill('#pilotOfficeContactName',''), /관리사무소 담당자/],
    ['region', page=>page.fill('#pilotRegion',''), /지역/],
    ['interest', async page=>{for(const box of await page.locator('input[name="pilotInterest"]:checked').all()) await box.uncheck();}, /관심 업무/],
    ['phone', page=>page.fill('#pilotPhone','1234'), /연락처/],
    ['consent', page=>page.uncheck('#pilotPrivacyConsent'), /동의/]
  ]) await t.test(label, async()=>{const page=await newPage();let posts=0;await page.route('https://api.web3forms.com/**',r=>{posts++;return r.fulfill({status:200,body:'{"success":true}'});});await page.goto(`${origin}/office.html`);await fillValid(page);await mutate(page);await page.click('#officePilotSubmit');assert.equal(posts,0);assert.match(await page.locator('#officePilotStatus').innerText(),expected);await page.close();});
  await t.test('provider rejected',async()=>{const page=await newPage();let posts=0;await page.route('https://api.web3forms.com/**',r=>{posts++;return r.fulfill({status:200,contentType:'application/json',body:'{"success":false}'});});await page.goto(`${origin}/office.html`);await fillValid(page);await page.click('#officePilotSubmit');await waitFor(()=>posts===1);await page.waitForFunction(()=>document.getElementById('officePilotDone').innerText.includes('완료되지 않았습니다'));assert.match(await page.locator('#officePilotDone').innerText(),/완료되지 않았습니다/);assert.doesNotMatch(await page.locator('#officePilotDone').innerText(),/접수됐습니다/);await page.close();});
});

test('portal bytes are preserved except the exact static commercial notice', () => {
  const b=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/office-request-commercial-baseline.json'),'utf8')); const after=fs.readFileSync(path.join(ROOT,'office-request.html'),'utf8'); const notice=/\r?\n        <aside id="officeRequestCommercialNotice"[\s\S]*?^        <\/aside>\r?\n/m.exec(after); assert.ok(notice); assert.equal(sha256(after.replace(notice[0],'\r\n')),b['office-request.html']);
  for(const f of Object.keys(b).slice(1)) assert.equal(sha256(fs.readFileSync(path.join(ROOT,f))),b[f],f);
});

test('pilot markup fixes limits, disclosure, privacy and script order', async()=>{
  const page=await newPage(); await page.goto(`${origin}/office.html`); for(const [id,n] of [['pilotComplexName',80],['pilotOfficeContactName',50],['pilotPhone',30],['pilotRegion',80],['pilotDesiredStart',80],['pilotMemo',500]]) assert.equal(await page.locator('#'+id).getAttribute('maxlength'),String(n));
  assert.match(await page.locator('#officePilot').innerText(),/접수 프로그램 이용료 0원/); assert.match(await page.locator('#officePilot').innerText(),/실제 작업은 별도 견적/); assert.match(await page.locator('#officePilot').innerText(),/입주민 이름·전화번호·동호수·현장사진 또는 사진 링크는 적지 마세요/);
  const scripts=await page.locator('script[src]').evaluateAll(xs=>xs.map(x=>x.getAttribute('src'))); assert.deepEqual(scripts.slice(-3),['js/revenue-conversion.js?v=20260831-revenue1','js/lead-transport.js?v=20260831-revenue1','js/office-pilot.js?v=20260831-revenue1']); await page.close();
});
