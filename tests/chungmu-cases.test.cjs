const {test}=require('node:test');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const slugs=['chungmu-heating-rust-water-flushing-20260930','chungmu-heating-manifold-installation-20260930'];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
// 2026-10-01: 선비마을·도안센트럴·진잠타운의 승인된 원고 개선 반영. 나머지 51건과 전체 사진은 별도 보존 검사.
// 2026-10-02: 나머지 실제 사례 보완·열매 분리 승인. 기존 사실 보존은 remaining-cases 검사.
// 2026-10-06: 방충망 실제 사례 1건 추가. 기존 57건 전체 보존은 aluminum-screen-case 검사.
const baseline='b6b9c13c97e598097c57fa649137e730802cc0d4a15eee93f9dea768ca760911';
function preserved(items){const old=items.filter(a=>!slugs.includes(a.slug));return old.length===56&&hash(old)===baseline;}
test('기준 갱신한 56개 원고 객체와 순서 보존, 변이 검출',()=>{
  const items=JSON.parse(read('data/site.json')).insights;
  assert.ok(preserved(items));
  const changed=structuredClone(items); changed.find(a=>!slugs.includes(a.slug)).title+='변이'; assert.equal(preserved(changed),false);
  const removed=items.filter(a=>a.slug!==items.find(a=>!slugs.includes(a.slug)).slug);
  assert.equal(preserved(removed),false);
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
test('웹 사례 원고: 짧은 문단·관리 팁·별도 상담 안내, 과장 없는 작업 범위',()=>{
  const cases=JSON.parse(read('data/site.json')).insights.filter(a=>slugs.includes(a.slug));
  for(const a of cases){
    const prose=a.body.map(b=>b.p).join('\n');
    assert.ok(prose.length>=700&&prose.length<=1800);
    assert.ok(a.body.flatMap(b=>b.p.split(/\n\n/)).every(p=>p.length<=220));
    assert.match(prose,/같은 현장/);
    assert.match(prose,/직접.*(?:풀지|조이기보다)/);
    assert.ok(a.consultation.photos.length>20&&a.consultation.scope.length>20);
    assert.ok(a.relatedSlugs.includes(slugs.find(slug=>slug!==a.slug)));
    assert.doesNotMatch(prose,/#[가-힣]+|010-2397-8629/); // 실제 전화 링크를 상담 영역에 한 번 제공
    assert.doesNotMatch(prose,/최저가|100%|평생 보증|고객님께서.*만족/);
  }
  assert.match(cases[0].body.map(b=>b.p).join('\n'),/수질 측정값/);
  assert.match(cases[1].body.map(b=>b.p).join('\n'),/특정 누수 원인을 확정할 수는 없습니다/);
});
