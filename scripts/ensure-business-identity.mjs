/* ensure-business-identity.mjs — 업체 정보(이름·전화·사업자번호·주소)가 공개 페이지 어디서나 같은지 지킨다
 *
 * 왜: 검색엔진·AI 검색은 "같은 이름·같은 전화·같은 주소"가 여러 곳에 일관되게 보일 때만 하나의 업체로 묶는다.
 * 2026-09-25 에 office.html 의 구조화 데이터가 전화 '+82-10-…', 주소 '(석교동)' 없음, 사업자번호 없음으로
 * 첫 화면과 달랐다 — 페이지마다 손으로 적혀 있어 아무도 몰랐다. 정본은 data/site.json 의 company 하나다.
 *
 * 검사 대상: 루트 공개 HTML + posts/ 의 모든 JSON-LD 에서 LocalBusiness 계열 노드, tel: 링크, 본문의 사업자번호. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const fail = [], ok = [];
const check = (cond, bad, good) => { if (cond) ok.push(good); else fail.push(bad); };

const site = JSON.parse(read('data/site.json'));
const co = site.company || {};
const config = JSON.parse(read('data/config.json'));
const NAME = String(co.name || ''), TEL = String(co.phone || ''), BIZ = String(co.bizno || ''), ADDR = String(co.address || '');
check(NAME && /^010-\d{4}-\d{4}$/.test(TEL) && /^\d{3}-\d{2}-\d{5}$/.test(BIZ) && ADDR,
  'data/site.json company 에 이름·전화(010-0000-0000)·사업자번호(000-00-00000)·주소가 다 있어야 한다',
  `정본: ${NAME} · ${TEL} · ${BIZ}`);
const TEL_DIGITS = TEL.replace(/\D/g, '');
const STREET = ADDR.replace(/^대전광역시\s*중구\s*/, '');   // 구조화 데이터는 시·구를 따로 적고 streetAddress 에 나머지를 둔다

// 검사에서 빼는 것: 직원 포털(SHA-256 고정), 검색엔진 소유확인 파일
const EXEMPT = new Set(['office-request.html', 'google11dc37fbc3ab6e98.html']);
const pages = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !EXEMPT.has(f)),
  ...fs.readdirSync(path.join(ROOT, 'posts')).filter((f) => f.endsWith('.html')).map((f) => 'posts/' + f),
];

const BUSINESS_TYPES = new Set(['LocalBusiness', 'HomeAndConstructionBusiness', 'Organization']);
let nodes = 0, telLinks = 0, bizMentions = 0;
for (const rel of pages) {
  const html = read(rel);
  // ① JSON-LD 의 업체 노드
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch (e) { fail.push(`${rel}: JSON-LD 를 파싱할 수 없다 — ${e.message}`); continue; }
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (BUSINESS_TYPES.has(o['@type']) && (o.telephone || o.taxID || o.address)) {
        nodes++;
        check(String(o.name || '').startsWith(NAME), `${rel}: 업체 노드 이름 "${o.name}" 이 정본 "${NAME}" 으로 시작하지 않는다`, `${rel} 이름`);
        if (o.telephone !== undefined) check(o.telephone === TEL, `${rel}: telephone "${o.telephone}" ≠ 정본 "${TEL}" — 표기가 다르면 다른 업체로 읽힌다`, `${rel} 전화`);
        if (o.taxID !== undefined) check(o.taxID === BIZ, `${rel}: taxID "${o.taxID}" ≠ 정본 "${BIZ}"`, `${rel} 사업자번호`);
        if (o.address && typeof o.address === 'object') {
          check(o.address.streetAddress === STREET, `${rel}: streetAddress "${o.address.streetAddress}" ≠ 정본 "${STREET}"`, `${rel} 주소`);
          check(o.address.addressRegion === '대전광역시' && o.address.addressLocality === '중구',
            `${rel}: addressRegion/addressLocality 가 "대전광역시"/"중구" 가 아니다 (${o.address.addressRegion}/${o.address.addressLocality})`, `${rel} 시·구`);
        }
      }
      Object.values(o).forEach(walk);
    };
    walk(obj);
  }
  // ② 전화 링크는 전부 정본 번호
  for (const m of html.matchAll(/href="tel:([^"]+)"/g)) {
    telLinks++;
    check(m[1].replace(/\D/g, '') === TEL_DIGITS, `${rel}: tel: 링크 "${m[1]}" 가 정본 번호가 아니다`, `${rel} tel`);
  }
  // ③ 본문에 적힌 사업자번호
  // 두 표기 다 본다 — '<strong>사업자등록번호</strong> 895-…'(leak 푸터)과 '사업자등록번호 895-…'·'사업자 895-…'(그 밖)
  for (const m of html.matchAll(/사업자(?:등록번호|번호)?(?:<\/strong>)?\s*(\d{3}-\d{2}-\d{5})/g)) {
    bizMentions++;
    check(m[1] === BIZ, `${rel}: 본문 사업자번호 "${m[1]}" ≠ 정본 "${BIZ}"`, `${rel} 본문 사업자번호`);
  }
}
check(nodes >= 3, `업체 구조화 데이터 노드가 ${nodes}개뿐이다(index·leak·office 최소 3)`, `업체 노드 ${nodes}개 대조`);
check(telLinks >= 60, `tel: 링크가 ${telLinks}개뿐이다 — 글 페이지 전화 버튼이 빠졌나`, `tel: 링크 ${telLinks}개 대조`);
check(bizMentions >= 3, `본문 사업자번호 표기가 ${bizMentions}곳뿐이다`, `본문 사업자번호 ${bizMentions}곳 대조`);

// ④ 첫 화면: 서비스 지역은 구 단위, 외부 채널(sameAs)은 실제로 열어 둔 것만
{
  const idx = read('index.html');
  const m = idx.match(/"@type": "HomeAndConstructionBusiness"[\s\S]*?"areaServed": (\[[^\]]*\])[\s\S]*?"sameAs": (\[[^\]]*\])/);
  check(!!m, 'index.html 업체 노드에 areaServed·sameAs 가 없다', 'index.html areaServed·sameAs 존재');
  if (m) {
    const area = JSON.parse(m[1]), same = JSON.parse(m[2]);
    for (const gu of ['대전 동구', '대전 중구', '대전 서구', '대전 유성구', '대전 대덕구']) check(area.includes(gu), `index.html areaServed 에 "${gu}" 가 없다 — 구 단위가 없으면 "대전 업체"로만 잡히고 동네 검색에 안 잡힌다`, `areaServed ${gu}`);
    const kakao = config.kakao && config.kakao.ready ? config.kakao.channelAddUrl : null;
    if (kakao) check(same.includes(kakao), `index.html sameAs 에 카카오 채널(${kakao})이 없다 — config.json 은 ready:true 다`, 'sameAs 카카오 채널');
    for (const u of same) check(/^https:\/\//.test(u) && !/example|TODO|xxx/i.test(u), `index.html sameAs 에 자리표시자 주소가 있다: ${u}`, `sameAs ${u}`);
  }
}

console.log('\n===== 업체 정보 일관성 검증 =====');
ok.slice(0, 12).forEach((m) => console.log('  ✓', m));
if (ok.length > 12) console.log(`  ✓ … 외 ${ok.length - 12}건`);
fail.forEach((m) => console.log('  ✗', m));
if (fail.length) { console.log(`\n${fail.length}건 실패 — 업체 정보가 페이지마다 다르면 검색엔진·AI 검색이 하나의 업체로 묶지 못한다.`); process.exit(1); }
console.log(`\n전부 통과 (${ok.length}건) · 정본 data/site.json company`);
