# prerender-designs.py — 대표 시안 8개(공간별 1개)를 정적 페이지로 뜬다
#
# 왜: 시안 300개가 전부 index.html 모달 안에만 있어 검색엔진 진입점이 홈 하나뿐이다.
# 해시 주소(#design=id)는 공유용으로는 되지만 검색엔진은 해시를 색인하지 않는다.
# 그래서 공간별 대표 1개씩만 정적 페이지로 떠서 '대전 거실 인테리어' 류 검색의 착지면을 만든다.
#
# 대표 선정 기준(기계적·재현 가능): 공간별로 '사진이 가장 덜 재사용된 시안'
# (재사용 횟수 같으면 imageAlt 있는 쪽 → id 순). 사진이 고유해야 페이지가 고유해 보인다.
#
# 정직성 원칙:
#  - 금액을 여기서 계산하지 않는다. 예상비용은 홈 카탈로그(DesignBom)가 한 곳에서만 낸다.
#  - 디지털 참고 시안임을 명시한다(실제 시공 사진으로 오해 금지).
#  - 데이터에 있는 것(자재·팔레트·팁)만 옮겨 적는다.
#
# 실행: python3 scripts/prerender-designs.py   (site.json 의 portfolio 를 읽어 designs/ 재생성)
# sitemap 은 이 스크립트가 직접 갱신하지 않는다 — 파일이 늘면 ensure-site-integrity 가 알려준다.
import json, os, html, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://01023978629.github.io/manmool'

with open(os.path.join(ROOT, 'data', 'site.json'), encoding='utf-8') as f:
    site = json.load(f)
port = site['portfolio']

use = collections.Counter((x.get('photo') or '').split('?')[0] for x in port)
best = {}
for x in port:
    ph = (x.get('photo') or '').split('?')[0]
    key = (use[ph], 0 if x.get('imageAlt') else 1, x['id'])
    sp = x['spaceType']
    if sp not in best or key < best[sp][0]:
        best[sp] = (key, x)

E = html.escape
outdir = os.path.join(ROOT, 'designs')
os.makedirs(outdir, exist_ok=True)

made = []
for sp, (_k, x) in best.items():
    slug = x['id']
    url = f'{BASE}/designs/{slug}.html'
    title = f"{x['title']} — 대전 {sp} 인테리어 디자인 | 만물인테리어"
    desc = (f"{x.get('area','')}평형 {sp} · {x.get('style','')} 스타일 디자인 참고 시안. "
            f"주요 자재: {', '.join((x.get('materials') or [])[:3])}. "
            "무료 방문 실측으로 우리 집 기준 견적을 받아보세요. 대전·세종·충남 만물인테리어.")
    alt = x.get('imageAlt') or x['title']
    pal = ''.join(f'<span style="background:{E(c)}" aria-label="{E(c)}"></span>' for c in (x.get('palette') or [])[:4])
    mats = ''.join(f'<li>{E(m)}</li>' for m in (x.get('materials') or []))
    specs = []
    if x.get('area'): specs.append(('기준 주택', f"{x['area']}평형"))
    if x.get('structure'): specs.append(('구조', x['structure']))
    if x.get('style'): specs.append(('스타일', x['style']))
    if x.get('budget'): specs.append(('예산대(전체공사 기준)', x['budget']))
    spec_html = ''.join(f'<div><dt>{E(a)}</dt><dd>{E(b)}</dd></div>' for a, b in specs)
    tip = f'<p class="dp-tip">💡 {E(x["tip"])}</p>' if x.get('tip') else ''

    page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{E(title)}</title>
  <meta name="description" content="{E(desc)}" />
  <link rel="canonical" href="{url}" />
  <meta name="theme-color" content="#b8895a" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="{E(x['title'])} — {E(sp)} 인테리어 디자인" />
  <meta property="og:description" content="{E(desc)}" />
  <meta property="og:image" content="{BASE}/{E((x.get('photo') or '').split('?')[0])}" />
  <link rel="stylesheet" href="../css/styles.css?v=20260823-brand1" />
  <link rel="stylesheet" href="../css/brand-system.css?v=20260823-brand1" />
</head>
<body class="design-page">
  <header class="site-header" id="siteHeader">
    <div class="container header-inner">
      <a href="../index.html#top" class="logo" aria-label="만물인테리어 홈">
        <span class="logo-mark">萬</span>
        <span class="logo-text"><strong>만물인테리어</strong><em>인테리어·누수 전문</em></span>
      </a>
      <nav class="main-nav" id="mainNav" aria-label="주요 메뉴">
        <a href="../index.html">인테리어</a>
        <a href="../leak.html">누수·배관</a>
        <a href="../blog.html">실제 사례</a>
        <a href="../office.html">관리사무소</a>
        <a href="../index.html#process">진행 순서</a>
        <a href="../index.html#inquiry">상담</a>
      </nav>
      <a href="../index.html#inquiry" class="btn btn-primary btn-sm header-cta">상담 신청</a>
      <button class="nav-toggle" id="navToggle" type="button" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </header>
  <main id="top">
    <article class="section">
      <div class="container office-wrap">
        <span class="eyebrow">{E(sp)} · 디자인 참고 시안</span>
        <h1 class="dp-title">{E(x['title'])}</h1>
        <p class="digital-reference-note"><b>디지털 참고 시안 · 실제 완공 사진 아님</b><br />고객님 댁을 촬영하거나 합성한 이미지가 아니며 실제 구조와 자재에 따라 달라집니다.</p>
        <img class="dp-photo" src="../{E(x.get('photo') or '')}" alt="{E(alt)}" />
        <dl class="dp-specs">{spec_html}</dl>
        {f'<div class="dp-pal" aria-hidden="true">{pal}</div>' if pal else ''}
        {f'<h2 class="dp-h2">주요 자재</h2><ul class="dp-mats">{mats}</ul>' if mats else ''}
        {tip}
        <p class="of-small">예상비용은 이 페이지에서 계산하지 않습니다 — 홈 카탈로그에서 같은 시안을 열면 공간 면적 기준 예상 범위를 볼 수 있고, 정확한 금액은 무료 방문 실측 후 정식 견적서로 확정됩니다.</p>
        <div class="bc-cta">
          <a class="btn btn-primary" href="../index.html#design={E(slug)}">홈에서 이 시안 자세히 보기</a>
          <a class="btn btn-ghost" href="../index.html#inquiry">무료 방문 실측 신청</a>
        </div>
      </div>
    </article>
  </main>
  <footer class="site-footer">
    <div class="container footer-inner">
      <p class="footer-note">만물인테리어 · 대표 전병덕 · 사업자등록번호 895-48-01132 · <a href="tel:01023978629">010-2397-8629</a> · <a href="../privacy.html">개인정보처리방침</a> · 대전·세종·충남</p>
    </div>
  </footer>
  <script>
  (function () {{
    var t = document.getElementById('navToggle'), n = document.getElementById('mainNav');
    if (!t || !n) return;
    t.addEventListener('click', function () {{ var open = n.classList.toggle('open'); t.setAttribute('aria-expanded', String(open)); }});
  }})();
  </script>
</body>
</html>
'''
    with open(os.path.join(outdir, slug + '.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    made.append((sp, slug))
    print('생성:', f'designs/{slug}.html', f'({sp})')

print('완료 ·', len(made), '건 — sitemap 에 designs/*.html 이 있는지는 ensure-site-integrity 가 확인한다')
