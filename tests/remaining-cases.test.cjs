// Public content only. GET-only local preview; no customer submissions.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'), site=JSON.parse(fs.readFileSync(path.join(ROOT,'data/site.json'),'utf8'));
// 2026-10-06: 방충망·옥천 수전 배관 신규 글은 각각 전용 검사에서 검증.
// 기존 57건의 순서·186개 사진 지문은 같은 기준으로 보호한다. 옥천 검사에서 이전 58건 전체도 대조한다.
const legacyInsights=site.insights.filter(a=>!['daejeon-aluminum-window-screen-replacement-20261006','water-outlet-wall-repair-20261006'].includes(a.slug));
const targets=["samho-apartment-rain-pipe-repair-202609","samho-apartment-rain-pipe-repair-second-home-202609","samsung-balcony-rain-pipe-repair-202609","pyeonghaneul-apartment-leak-repair-20260909","buyeo-buyeong-balcony-waterproofing","daejeon-geumho-hansarang-balcony-floor-screed","daejeon-jung-gu-heating-pipe-leak-repair","daejeon-jung-gu-yard-water-valve-leak","apartment-balcony-rain-pipe-replacement","apartment-upper-lower-rain-pipe-repair","apartment-basement-cast-iron-pipe-repair","eunhasu-bathroom-waterproof","mugunghwa-pipe-replacement","yeolmae-waterproof-screed","geumseong-basement-pipe-valve","seonbi-pipe-replacement","taesan-rain-pipe-replacement","beomjigi-bathroom-waterproof","gaon-bathroom-waterproof","doram-waterproof-heating","sejong-cafe-waterproof","mokdong-trench-drain","daejeon-church-canopy","taesan-lexan-frame","nonsan-fire-door","daejayeon-bathroom-fixtures","daejeon-cafe-restroom-remodel","dodam-floor-screed","samsung-apartment-drain-pipe-replacement","hanbat-drain-replacement"];
const protectedSlugs=["chungmu-heating-rust-water-flushing-20260930","chungmu-heating-manifold-installation-20260930","seonbi-boiler-pipe-leak-repair-20260929","doan-central-bathroom-pipe-waterproof-20260923","jinjam-town-rain-pipe-repair-202609","interior-quote-contract-comparison","wallpaper-silk-paper","flooring-lifestyle","kitchen-countertop-under-sink","bathroom-tile-grout-slope","carpentry-storage-partition-molding","electrical-before-wallpaper","renovation-while-occupied","renovation-process-sequence","leak-insurance-guide","apt-office-repair-partner","rainy-season-waterproof-check","apt-office-construction-notice","budget-guide-34py","warranty-5-checks","contract-checklist","ai-operated-interior","bathroom-waterproof-signs","partial-vs-full-remodel","warranty-periods-by-work","extra-work-dispute-prevention"];
const splitSlug='yeolmae-extension-floor-screed';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const service=a=>a.service||(['방수·설비','누수탐지·수리'].includes(a.category)?'leak':'interior');
const facts=items=>targets.map(slug=>{
  const a=items.find(x=>x.slug===slug);
  const body=slug==='yeolmae-waterproof-screed'?[...a.body,...(items.find(x=>x.slug===splitSlug)?.body||[])]:a.body;
  return {slug:a.slug,date:a.date,category:a.category,service:a.service,place:a.place,published:a.published,image:a.image,imageAlt:a.imageAlt,
    media:body.filter(b=>b.img||b.video).map(({h,p,...b})=>b)};
});
const cases=targets.concat(splitSlug).map(slug=>site.insights.find(a=>a.slug===slug));
test('승인 범위: 기존 5개·안내 21개·카탈로그·기존 URL 순서·사진 설명·영상 보존',()=>{
  assert.equal(legacyInsights.length,57);
  assert.equal(hash(site.insights.filter(a=>protectedSlugs.includes(a.slug))),'2e2921d0e082a724ff3ec8541215f045c49294cabe7650eca6c4050c5fc53b82');
  const {insights,...rest}=site;assert.equal(hash(rest),'5ce930bbf0be2e52959b420208146a75c42bc16e193f653b728689b6dafa5487');
  assert.equal(hash(legacyInsights.filter(a=>a.slug!==splitSlug).map(a=>a.slug)),'0366b289dad2cdc3a506f0e3c7c0c87a2e8c85921bdde330c8dfc8caf519dfdd');
  assert.equal(hash(facts(site.insights)),'02ca1c566aecf64f288884dc7cc907d8224b3ad5787b374ab9b00c05972778e3');
  const mutated=structuredClone(site.insights);mutated.find(a=>a.slug===targets[0]).body.reverse();
  assert.notEqual(hash(facts(mutated)),'02ca1c566aecf64f288884dc7cc907d8224b3ad5787b374ab9b00c05972778e3');
  const altered=structuredClone(site.insights);altered.find(a=>a.slug===protectedSlugs[0]).title+='변이';
  assert.notEqual(hash(altered.filter(a=>protectedSlugs.includes(a.slug))),'2e2921d0e082a724ff3ec8541215f045c49294cabe7650eca6c4050c5fc53b82');
});
test('공개 원본 사진·동영상 186개 파일 내용 보존',()=>{
  const files=[...new Set(legacyInsights.flatMap(a=>[a.image,...a.body.flatMap(b=>[b.img,b.video,b.videoPoster])]).filter(Boolean).map(p=>p.split('?')[0]))].sort();
  assert.equal(files.length,186);
  const fingerprints=files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex')]);
  assert.equal(hash(fingerprints),'64d52f6d58ceabb9e4331651790b7e78f9bd0fee5b594d23c5b2edb737f8865e');
});
test('31개 글의 요약·상담·관련 글과 사실성 경계',()=>{
  for(const a of cases){
    assert.ok(a);assert.equal(a.updated,'2026-10-02');
    for(const key of ['site','issue','work','result'])assert.ok(a.caseSummary[key].trim(),a.slug+key);
    assert.ok(a.consultation.photos.length>20&&a.consultation.scope.length>20);
    assert.match(a.consultation.scope,/최종 범위·금액은 현장 확인 후/);
    assert.equal(a.relatedSlugs.length,2);assert.equal(new Set(a.relatedSlugs).size,2);
    for(const slug of a.relatedSlugs){const b=site.insights.find(x=>x.slug===slug);assert.ok(b&&b.published!==false&&slug!==a.slug);assert.equal(service(b),service(a));}
    assert.doesNotMatch(JSON.stringify(a).replaceAll(site.company.phone,''),/100%|최저가|평생 보증|고객님께서.*만족|sourcePath|driveId|GPS|010[- ]/);
  }
  const old=site.insights.find(a=>a.slug==='yeolmae-waterproof-screed'),fresh=site.insights.find(a=>a.slug===splitSlug);
  assert.ok(!old.body.some(b=>b.img));assert.equal(fresh.body.filter(b=>b.img).length,2);
  assert.match(old.title,/욕실/);assert.match(fresh.title,/확장부/);
  assert.equal(fresh.date,old.date);assert.deepEqual(fresh.place,old.place);
  assert.ok(old.relatedSlugs.includes(fresh.slug)&&fresh.relatedSlugs.includes(old.slug));
  assert.match(JSON.stringify(site.insights.find(a=>a.slug==='beomjigi-bathroom-waterproof')),/사진별 세대|세대.*확정할 수 없어/);
  for(const slug of ['taesan-rain-pipe-replacement','nonsan-fire-door']){
    const a=site.insights.find(a=>a.slug===slug);assert.ok(!a.image&&!a.body.some(b=>b.img));
  }
});
let server,browser,origin;
before(async()=>{
  server=http.createServer((req,res)=>{
    if(req.method!=='GET')return res.writeHead(405).end();
    let file;try{file=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{return res.writeHead(400).end();}
    if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
    const type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(200,{'content-type':type+(type.startsWith('text/')?'; charset=utf-8':'')});fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function contextFor(t,options={}){
  const context=await browser.newContext({viewport:{width:1280,height:850},...options}),errors=[];
  await context.route('**/*',r=>r.request().url().startsWith(origin+'/')&&r.request().method()==='GET'?r.continue():r.abort());
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});return context;
}
async function check(page,a){
  await page.locator('.post-title').waitFor();assert.equal(await page.locator('.post-title').innerText(),a.title);
  assert.equal(await page.locator('.post-summary').count(),1);
  assert.ok((await page.locator('.post-cta-prep').innerText()).includes(a.consultation.photos));
  assert.ok((await page.locator('.post-cta-scope').innerText()).includes(a.consultation.scope));
  const href=(await page.locator('.post-cta .btn-primary').getAttribute('href')).replace(/^\.\.\//,'');
  assert.equal(href,service(a)==='leak'?'leak.html?case='+a.slug+'#leakInquiry':'index.html#estimator');
  const related=await page.locator('.post-related .insight-card').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href').split('/').pop().replace('.html','')));
  assert.deepEqual(related.slice(0,2),a.relatedSlugs);assert.equal(new Set(related).size,3);
  const photos=await page.locator('.post-body figure img').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src').replace(/^\.\.\//,'')));
  assert.deepEqual(photos,a.body.filter(b=>b.img).map(b=>b.img));
  assert.equal(await page.locator('.post-body video').count(),a.body.filter(b=>b.video).length);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
}
test('31개 사례의 정적·동적 62경로: 요약·상담·관련 글·사진·영상',{timeout:180000},async t=>{
  const context=await contextFor(t),page=await context.newPage();
  for(const a of cases)for(const route of ['posts/'+a.slug+'.html','blog.html?post='+a.slug]){
    await page.goto(origin+'/'+route,{waitUntil:'domcontentloaded'});await check(page,a);
  }
});
test('320px·JavaScript 꺼짐: 31개 사례의 상담 안내·링크·사진 유지',{timeout:120000},async t=>{
  const context=await contextFor(t,{viewport:{width:320,height:740},javaScriptEnabled:false}),page=await context.newPage();
  for(const a of cases){await page.goto(origin+'/posts/'+a.slug+'.html',{waitUntil:'domcontentloaded'});await check(page,a);}
});
test('인테리어 동적 글도 상담 문구를 HTML로 실행하지 않는다',async t=>{
  const context=await contextFor(t),page=await context.newPage(),fixture=structuredClone(site);
  const a=fixture.insights.find(a=>a.slug===splitSlug);a.consultation.photos='<img src=x onerror="window.injected=true">';
  await context.route('**/data/site.json*',r=>r.fulfill({json:fixture}));
  await page.goto(origin+'/blog.html?post='+splitSlug);await page.locator('.post-cta-prep').waitFor();
  assert.ok((await page.locator('.post-cta-prep').innerText()).includes(a.consultation.photos));
  assert.equal(await page.locator('.post-cta-prep img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
});
