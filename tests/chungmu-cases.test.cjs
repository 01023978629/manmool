const {test}=require('node:test');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const slugs=['chungmu-heating-rust-water-flushing-20260930','chungmu-heating-manifold-installation-20260930'];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const baseline='b4aa058c95a96c4ec8316a7a79ebdd11c79dc35e83aab911a5338552e7b57b95';
function preserved(items){const old=items.filter(a=>!slugs.includes(a.slug));return old.length===54&&hash(old)===baseline;}
test('기존 54개 원고 객체와 순서 보존, 변이 검출',()=>{
  const items=JSON.parse(read('data/site.json')).insights;
  assert.ok(preserved(items));
  const changed=structuredClone(items); changed[2].title+='변이'; assert.equal(preserved(changed),false);
  assert.equal(preserved(items.slice(0,2).concat(items.slice(3))),false);
});
test('동일 현장의 두 공정: 사진 3장/4장 분리·분류·발견 경로·개인정보',()=>{
  const all=JSON.parse(read('data/site.json')).insights;
  const photos=[];
  slugs.forEach((slug,i)=>{
    const matches=all.filter(a=>a.slug===slug);assert.equal(matches.length,1);
    const a=matches[0];assert.equal(a.service,'leak');assert.equal(a.published,true);
    assert.equal(a.body.length,i?4:3);assert.equal(a.date,'2026-10-01');
    assert.match(JSON.stringify(a),/같은 현장/);assert.match(JSON.stringify(a),/2026-09-30/);
    // 공개 업체 대표번호만 허용하고 고객 연락처는 계속 차단한다.
    const companyPhone=JSON.parse(read('data/site.json')).company.phone;
    assert.equal(companyPhone,'010-2397-8629');
    assert.doesNotMatch(JSON.stringify(a).replaceAll(companyPhone,''),/92번길|고객명|driveId|sourcePath|GPS|010[- ]/);
    a.body.forEach((b,n)=>{
      assert.equal(b.img,`assets/cases/chungmu-${i?'manifold':'flushing'}-20260930-${String(n+1).padStart(2,'0')}.jpg`);
      assert.ok(b.imgAlt&&b.imgCaption);photos.push(b.img);
      for(const file of [b.img,b.img.replace('cases/','cases/resized/').replace('.jpg','-480w.jpg'),b.img.replace('cases/','cases/resized/').replace('.jpg','-960w.jpg')]){
        const bytes=fs.readFileSync(path.join(root,file));assert.ok(bytes.length>1000);assert.equal(bytes.indexOf(Buffer.from('Exif\0\0')), -1);
      }
    });
    for(const file of ['blog.html','leak.html','sitemap.xml','rss.xml','data/leak-case-index.json'])assert.ok(read(file).includes(slug),file);
    const html=read(`posts/${slug}.html`);assert.ok(html.includes(a.title));a.body.forEach(b=>assert.ok(html.includes('../'+b.img)));
    assert.match(read('blog.html'),new RegExp('href="posts/'+slug+'\\.html"[^>]*data-group="leak"'));
  });
  assert.equal(new Set(photos).size,7);
});
test('블로그형 원고: 짧은 문단·분량·관리 팁·상담·해시태그, 사진과 범위 유지',()=>{
  const cases=JSON.parse(read('data/site.json')).insights.filter(a=>slugs.includes(a.slug));
  for(const a of cases){
    const prose=a.body.map(b=>b.p).join('\n');
    assert.ok(prose.length>=1200&&prose.length<=1800);
    assert.ok(a.body.flatMap(b=>b.p.split(/\n\n/)).every(p=>p.length<=220));
    assert.match(prose,/안녕하세요/);assert.match(prose,/같은 현장/);
    assert.match(prose,/직접.*(?:풀지|조이기보다)/);
    assert.equal((prose.match(/010-2397-8629/g)||[]).length,1);
    assert.equal((prose.match(/#[가-힣]+/g)||[]).length,10);
    assert.doesNotMatch(prose,/최저가|100%|평생 보증|고객님께서.*만족/);
  }
  assert.match(cases[0].body.map(b=>b.p).join('\n'),/수질 측정값/);
  assert.match(cases[1].body.map(b=>b.p).join('\n'),/특정 원인을 확정하기보다/);
});
