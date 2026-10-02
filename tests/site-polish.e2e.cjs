/* Check the actual public allowlist, including JS-disabled and recovery markup. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..','_site');
const site=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/site.json'),'utf8'));
const published=site.insights.filter(a=>a.published!==false);
const group=a=>a.service==='leak'||(!a.service&&['방수·설비','누수탐지·수리'].includes(a.category))?'leak':/견적|계약|보증|관리|브랜드|가이드/.test(a.category||'')?'info':'interior';
const expected=['leak','interior','info'].map(g=>published.filter(a=>group(a)===g).length+'편');
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
let server,browser,origin;
before(async()=>{
  assert.ok(fs.existsSync(path.join(ROOT,'css/site-polish.css')),'build-pages-artifact.mjs 먼저 실행');
  server=http.createServer((req,res)=>{
    const file=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);
    if(req.method!=='GET'||!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return res.writeHead(404).end();
    res.setHeader('content-type',(MIME[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function open(t,file,options={}){
  const {recover,...contextOptions}=options;
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',...contextOptions}),errors=[],mutations=[],missing=[];
  await context.route('**/*',r=>{
    if(r.request().method()!=='GET')mutations.push(r.request().method());
    if(!r.request().url().startsWith(origin+'/')||r.request().method()!=='GET')return r.abort();
    if(recover&&new URL(r.request().url()).pathname==='/blog.html'){
      const html=fs.readFileSync(path.join(ROOT,'blog.html'),'utf8');
      return r.fulfill({contentType:'text/html; charset=utf-8',body:html.replace(/(<div class="container" id="blogRoot">)[\s\S]*?\r?\n      <\/div>/,'$1</div>')});
    }
    return r.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(origin+'/')&&r.status()>=400)missing.push(new URL(r.url()).pathname);});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);assert.deepEqual(missing,[]);});
  await page.goto(origin+'/'+file,{waitUntil:'networkidle'});return page;
}
for(const width of [320,390,768,1280])test(`${width}px 공개 화면: 새 스타일 배포·이미지 구분·메뉴·가로 넘침`,async t=>{
  for(const file of ['index.html','blog.html','leak.html','posts/yeolmae-extension-floor-screed.html']){
    const page=await open(t,file,{viewport:{width,height:900}});
    assert.equal(await page.locator('link[href$="site-polish.css?v=20261002-editorial"]').count(),1,file);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),file+' 가로 넘침');
    if(file==='index.html'){
      const visual=page.locator('.interior-hero-visual');
      assert.match(await visual.innerText(),/디지털 참고 시안 · 실제 완공 사진 아님/);
      const link=page.locator('.hero-record-link');
      assert.equal(await link.getAttribute('href'),'blog.html?category=interior');
      assert.ok((await link.boundingBox()).height>=44);
      assert.ok(await visual.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0));
      assert.equal(await page.locator('#inquiryForm').count(),1);
    }
    assert.equal(await page.locator('#navToggle').isVisible(),width<=960,'데스크톱 메뉴와 모바일 버튼 중복');
    if(width<=960){await page.locator('#navToggle').click();assert.equal(await page.locator('#navToggle').getAttribute('aria-expanded'),'true');}
  }
});
for(const mode of ['static','no-js','recovery'])test(`${mode}: 전체 편수·분류 설명·기존 링크와 공사 안내 구분`,async t=>{
  const page=await open(t,'blog.html',{javaScriptEnabled:mode!=='no-js',recover:mode==='recovery'});
  const compact=s=>s.replace(/\s/g,'');
  assert.deepEqual((await page.locator('.case-archive-summary dd').allInnerTexts()).map(compact),expected);
  assert.equal(await page.locator('#blogRoot a[data-group]').count(),published.length);
  assert.equal(await page.locator('.case-category-description').count(),3);
  assert.equal(await page.locator('.case-editorial-header h1').count(),1);
  assert.ok(await page.locator('.case-archive-summary').isVisible());
  assert.match(await page.locator('.case-archive-summary > p').innerText(),/시공 사례와 공사 안내/);
  if(mode==='no-js')assert.equal(await page.locator('#caseFinder').isVisible(),false);
  else{
    await page.locator('[data-case-filter="interior"]').click();
    assert.deepEqual((await page.locator('.case-archive-summary dd').allInnerTexts()).map(compact),expected,'전체 공개 편수는 검색 결과 건수와 분리');
    await page.locator('#caseSearch').fill('열매');
    assert.equal(await page.locator('#blogRoot a[data-group]:visible').count(),2);
  }
});
test('참고 이미지 표시는 JS 없이도 보이고 새 링크는 키보드 포커스가 선명하다',async t=>{
  const page=await open(t,'index.html',{javaScriptEnabled:false,viewport:{width:390,height:900}});
  assert.ok(await page.locator('.interior-hero-visual figcaption small').isVisible());
  const link=page.locator('.hero-record-link');await link.focus();
  assert.equal(await link.evaluate(el=>document.activeElement===el),true);
  assert.equal(await link.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
});
test('분야 편수의 작은 글자 대비는 4.5 이상이며 같은색 변이를 검출한다',async t=>{
  const page=await open(t,'blog.html');
  const contrast=()=>page.locator('.case-archive-summary').evaluate(root=>{
    const luminance=color=>{
      const values=color.match(/[\d.]+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      return values[0]*.2126+values[1]*.7152+values[2]*.0722;
    };
    const background=luminance(getComputedStyle(root).backgroundColor);
    return Math.min(...[...root.querySelectorAll('p,dt,dd,small')].map(el=>{
      const foreground=luminance(getComputedStyle(el).color);
      return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
    }));
  });
  assert.ok(await contrast()>=4.5);
  await page.addStyleTag({content:'.case-archive-summary p { color: #293e38 !important; }'});
  await assert.rejects(async()=>assert.ok(await contrast()>=4.5),{code:'ERR_ASSERTION'});
});
