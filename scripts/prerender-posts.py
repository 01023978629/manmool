#!/usr/bin/env python3
"""인사이트 글별 정적 페이지 생성기.

왜: blog.html?post=<slug>는 서버 HTML의 canonical이 목록을 가리키고 본문이
비어 있어, JS 렌더링이 불안정한 네이버 크롤러가 글을 개별 색인하지 못한다.
이 스크립트가 data/site.json의 insights를 읽어 posts/<slug>.html 정적
페이지(본문·canonical·OG·BlogPosting 포함)를 만들어 그 문제를 해소한다.

사용: data/site.json의 insights를 수정할 때마다 실행 후 함께 커밋한다.
  python3 scripts/prerender-posts.py
"""
import html
import json
from urllib.parse import quote
import os
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://01023978629.github.io/manmool'
V = '20260823-brand1'  # css 캐시버스터 — 루트 html들과 동일하게 유지


def esc(s):
    return html.escape(str(s or ''), quote=True)


def shade_cover(hexv):
    return hexv or '#d8c3a5'


def article_service(a):
    """방수·설비 기록은 누수 전용 접수, 나머지는 인테리어 접수로 보낸다.

    새 누수 사례는 명시적 service를 쓰고, 기존 글은 category로 하위 호환한다.
    제목 키워드 추측은 하지 않으므로 일반 보증·계약 글을 누수로 잘못 보내지 않는다.
    """
    explicit = a.get('service')
    if explicit in ('leak', 'interior'):
        return explicit
    return 'leak' if a.get('category') in ('방수·설비', '누수탐지·수리') else 'interior'


def case_group(a):
    """사례 목록의 고객용 필터 그룹. 원문 category는 그대로 보존한다."""
    if article_service(a) == 'leak':
        return 'leak'
    category = str(a.get('category') or '')
    if any(word in category for word in ('견적', '계약', '보증', '관리', '브랜드')):
        return 'info'
    return 'interior'


def rss_date(value):
    """site.json 날짜를 RSS 2.0이 요구하는 RFC 2822 날짜로 바꾼다."""
    try:
        day = datetime.strptime(str(value or ''), '%Y-%m-%d')
    except ValueError:
        day = datetime.now(timezone(timedelta(hours=9))).replace(tzinfo=None)
    return format_datetime(day.replace(tzinfo=timezone(timedelta(hours=9))))


def write_rss(insights):
    """네이버가 새 인사이트 글을 발견할 수 있도록 RSS 2.0 피드를 만든다."""
    items = []
    for a in insights[:30]:
        url = f'{BASE}/posts/{a["slug"]}.html'
        items.append(
            '    <item>\n'
            f'      <title>{esc(a.get("title"))}</title>\n'
            f'      <link>{url}</link>\n'
            f'      <guid isPermaLink="true">{url}</guid>\n'
            f'      <description>{esc(a.get("excerpt"))}</description>\n'
            f'      <pubDate>{rss_date(a.get("date"))}</pubDate>\n'
            '    </item>')
    built = rss_date(insights[0].get('date')) if insights else format_datetime(datetime.now(timezone(timedelta(hours=9))))
    feed = f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>만물인테리어 인사이트</title>
    <link>{BASE}/blog.html</link>
    <description>대전 만물인테리어의 시공 사례와 견적·계약·보증 안내</description>
    <language>ko-KR</language>
    <lastBuildDate>{built}</lastBuildDate>
    <atom:link href="{BASE}/rss.xml" rel="self" type="application/rss+xml" />
{chr(10).join(items)}
  </channel>
</rss>
'''
    path = os.path.join(ROOT, 'rss.xml')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(feed)
    print('생성: rss.xml(%d건)' % min(len(insights), 30))


def article_html(a, insights):
    url = f'{BASE}/posts/{a["slug"]}.html'
    img_abs = f'{BASE}/{a["image"]}' if a.get('image') else f'{BASE}/og-image.png'
    cover_img = (
        f'<img class="post-cover-image" src="../{esc(a["image"])}" alt="{esc(a.get("imageAlt") or a["title"])}" loading="eager" fetchpriority="high" decoding="async">'
        if a.get('image') else '')
    # 문단마다 사진을 한 장 붙일 수 있다(선택). 표지 한 장만으로는 '무엇을 갈았는지'가
    # 안 보이는 현장 기록이 있어서, 해당 문단 바로 아래에 근거 사진을 둔다.
    def section_html(s):
        out = f'<h2>{esc(s.get("h"))}</h2><p>{esc(s.get("p"))}</p>'
        if s.get('img'):
            cap = f'<figcaption>{esc(s["imgCaption"])}</figcaption>' if s.get('imgCaption') else ''
            out += (f'<figure class="post-figure"><img src="../{esc(s["img"])}" '
                    f'alt="{esc(s.get("imgAlt") or s.get("h"))}" loading="lazy" decoding="async">{cap}</figure>')
        return out

    body = '\n'.join(section_html(s) for s in (a.get('body') or []))

    # 현장 위치 — 단지 단위까지만 적는다. 동·호수는 고객 집을 특정하므로 넣지 않는다.
    # 지도 링크는 대표가 넣은 값을 그대로 쓰고, 없으면 단지명으로 네이버 지도 검색을
    # 걸어 준다(좌표를 지어내지 않는다).
    place = a.get('place') or {}
    place_html = ''
    if place.get('name'):
        map_url = place.get('mapUrl') or (
            'https://map.naver.com/p/search/' + quote(place['name'] if place.get('address')
                                                      else place['name']))
        place_html = (
            '<aside class="post-place">'
            f'<div class="pp-body"><span class="pp-label">현장 위치</span>'
            f'<b>{esc(place["name"])}</b>'
            + (f'<span class="pp-addr">{esc(place["address"])}</span>' if place.get('address') else '')
            + '<span class="pp-note">단지 위치까지만 표기합니다. 동·호수와 고객 정보는 공개하지 않습니다.</span>'
            '</div>'
            f'<a class="pp-map" href="{esc(map_url)}" target="_blank" rel="noopener">네이버 지도에서 보기</a>'
            '</aside>')
        body = place_html + body
    related = [x for x in insights if x['slug'] != a['slug']][:3]
    related_html = '\n'.join(f'''          <a class="insight-card" href="{esc(x['slug'])}.html">
            <span class="ic-cover" style="background:{shade_cover(x.get('cover'))}">{f'<img class="ic-image" src="../{esc(x["image"])}" alt="{esc(x.get("imageAlt") or x["title"])}" loading="lazy" decoding="async">' if x.get('image') else ''}<span class="ic-cat">{esc(x.get('category'))}</span></span>
            <span class="ic-body"><b>{esc(x['title'])}</b><span class="ic-meta">{esc(x.get('date'))} · {esc(x.get('readMin'))}분 읽기</span></span>
          </a>''' for x in related)
    ld_obj = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        'headline': a['title'],
        'description': a.get('excerpt', ''),
        'articleSection': a.get('category', ''),
        'datePublished': a.get('date', ''),
        'image': img_abs,
        'author': {'@type': 'Organization', 'name': '만물인테리어'},
        'publisher': {'@type': 'Organization', 'name': '만물인테리어'},
        'mainEntityOfPage': url,
    }
    if a.get('updated'):
        ld_obj['dateModified'] = a['updated']
    if place.get('name'):
        # 좌표는 확인된 값이 있을 때만 넣는다. 지어낸 좌표는 엉뚱한 곳으로 안내한다.
        loc = {'@type': 'Place', 'name': place['name']}
        if place.get('address'):
            loc['address'] = {'@type': 'PostalAddress', 'streetAddress': place['address'],
                              'addressCountry': 'KR'}
        ld_obj['contentLocation'] = loc
    ld = json.dumps(ld_obj, ensure_ascii=False)
    sources = a.get('sources') or []
    sources_html = ''
    if sources:
        items = ''.join(
            f'<li><a href="{esc(source.get("url"))}" target="_blank" rel="noopener noreferrer">'
            f'{esc(source.get("title") or source.get("url"))}</a></li>'
            for source in sources if source.get('url'))
        sources_html = (
            '\n            <aside class="post-sources" aria-label="공식 출처">'
            '<h2>공식 출처</h2>'
            f'<p>확인일 {esc(a.get("sourcesChecked"))}</p>'
            f'<ul>{items}</ul>'
            '</aside>')
    service = article_service(a)
    if service == 'leak':
        cta_html = '''<div class="post-cta">
            <p data-service="leak">누수 원인과 필요한 공사 범위는 현장 확인 후 안내합니다.</p>
            <a href="../leak.html#leakInquiry" class="btn btn-primary">누수 증상 남기기</a>
            <a href="tel:01023978629" class="btn btn-ghost">전화 상담</a>
          </div>'''
    else:
        cta_html = '''<div class="post-cta">
            <p data-service="interior">예상 범위는 참고용이며, 최종 범위·금액은 실측 후 확정됩니다.</p>
            <a href="../index.html#estimator" class="btn btn-primary">예상 범위 확인</a>
            <a href="../index.html#inquiry" class="btn btn-ghost">인테리어 상담</a>
          </div>'''

    return f'''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{esc(a['title'])} · 만물인테리어</title>
  <meta name="description" content="{esc(a.get('excerpt'))}" />
  <meta name="theme-color" content="#b8895a" />
  <link rel="canonical" href="{url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="만물인테리어" />
  <meta property="og:url" content="{url}" />
  <meta property="og:title" content="{esc(a['title'])} · 만물인테리어" />
  <meta property="og:description" content="{esc(a.get('excerpt'))}" />
  <meta property="og:image" content="{img_abs}" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%23b8895a'/%3E%3Ctext x='50' y='68' font-size='58' text-anchor='middle' fill='white' font-family='sans-serif'%3E%E4%B8%87%3C/text%3E%3C/svg%3E" />
  <link rel="stylesheet" href="../css/styles.css?v={V}" />
  <link rel="stylesheet" href="../css/brand-system.css?v={V}" />
  <script type="application/ld+json">{ld}</script>
</head>
<body class="story-page">
  <header class="site-header" id="siteHeader">
    <div class="container header-inner">
      <a href="../index.html#top" class="logo" aria-label="만물인테리어 홈">
        <span class="logo-mark">萬</span>
        <span class="logo-text"><strong>만물인테리어</strong><em>인테리어·누수 전문</em></span>
      </a>
      <nav class="main-nav" id="mainNav" aria-label="주요 메뉴">
        <a href="../index.html">인테리어</a>
        <a href="../leak.html">누수·배관</a>
        <a href="../blog.html" aria-current="page">실제 사례</a>
        <a href="../index.html#process">진행 순서</a>
        <a href="../index.html#inquiry">상담</a>
      </nav>
      <a href="../index.html#inquiry" class="btn btn-primary btn-sm header-cta">상담 신청</a>
      <button class="nav-toggle" id="navToggle" aria-label="메뉴 열기" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>

  <main id="top">
    <section class="section">
      <div class="container">
        <article class="post">
          <a class="post-back" href="../blog.html">← 인사이트 목록</a>
          <span class="post-cat">{esc(a.get('category'))}</span>
          <h1 class="post-title">{esc(a['title'])}</h1>
          <p class="post-meta">{esc(a.get('date'))} · {esc(a.get('readMin'))}분 읽기</p>
          <div class="post-cover" style="background:{shade_cover(a.get('cover'))}">{cover_img}</div>
          <div class="post-body">
            <p class="post-excerpt">{esc(a.get('excerpt'))}</p>
            {body}{sources_html}
          </div>
          {cta_html}
        </article>
        <div class="post-related">
          <h3>다른 인사이트</h3>
          <div class="insights-grid">
{related_html}
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-inner">
      <span>© 만물인테리어 · 인테리어·누수 전문</span>
      <a href="../index.html">홈으로</a>
    </div>
  </footer>

  <nav class="mobile-service-dock" aria-label="빠른 상담">
    <a class="dock-leak" href="../leak.html#leakInquiry">💧 누수</a>
    <a href="../index.html#inquiry">🏠 인테리어</a>
    <a class="dock-call" href="tel:01023978629">📞 전화</a>
  </nav>

  <script>
  (function () {{
    var t = document.getElementById('navToggle'), n = document.getElementById('mainNav');
    if (!t || !n) return;
    t.addEventListener('click', function () {{
      var open = n.classList.toggle('open');
      t.setAttribute('aria-expanded', open);
    }});
  }})();
  </script>
</body>
</html>
'''


def list_markup(insights):
    """js/blog.js 의 renderList 와 **같은 구조**의 목록 마크업.

    왜 정적으로 만드나: blog.html 은 서버 HTML 에 <h1>도 글 링크도 없고
    '불러오는 중…' 한 줄뿐이라, JS 를 안 돌리는 크롤러에게는 빈 페이지다.
    sitemap 에 홈 다음 순위(priority 0.8)로 올려두고도 8편으로 가는 내부 링크가
    JS 실행 후에만 생겨, 개별 글로 넘어갈 경로 자체가 없었다.

    blog.js 는 그대로 두면 로드 후 같은 내용으로 덮어쓰므로 화면 차이가 없다.
    → 두 마크업이 어긋나면 깜빡이므로 반드시 함께 고칠 것.
    """
    featured = insights[0] if insights else None
    featured_html = ''
    if featured:
        featured_image = ''
        if featured.get('image'):
            featured_image = ('<img class="ic-image" src="%s" alt="%s" loading="eager" '
                              'fetchpriority="high" decoding="async">'
                              % (esc(featured['image']), esc(featured.get('imageAlt') or featured.get('title'))))
        featured_html = (
            '        <a class="insight-featured" href="posts/%s.html" data-group="%s">\n'
            '          <span class="ic-cover" style="background:%s">%s<span class="ic-cat">최신 현장 · %s</span></span>\n'
            '          <span class="ic-body"><span class="eyebrow">FEATURED CASE</span><b>%s</b>'
            '<span class="ic-excerpt">%s</span><span class="ic-meta">%s · %s분 읽기</span></span>\n'
            '        </a>' % (
                esc(featured.get('slug')), case_group(featured), shade_cover(featured.get('cover') or '#d8c3a5'),
                featured_image, esc(featured.get('category')), esc(featured.get('title')), esc(featured.get('excerpt')),
                esc(featured.get('date')), esc(featured.get('readMin'))))

    cards = []
    for idx, a in enumerate(insights[1:]):
        img = ''
        if a.get('image'):
            priority = ' loading="lazy"'
            img = ('<img class="ic-image" src="%s" alt="%s"%s decoding="async">'
                   % (esc(a['image']), esc(a.get('imageAlt') or a.get('title')), priority))
        cards.append(
            '          <a class="insight-card" href="posts/%s.html" data-group="%s">\n'
            '            <span class="ic-cover" style="background:%s">%s<span class="ic-cat">%s</span></span>\n'
            '            <span class="ic-body">\n'
            '              <b>%s</b>\n'
            '              <span class="ic-excerpt">%s</span>\n'
            '              <span class="ic-meta">%s · %s분 읽기</span>\n'
            '            </span>\n'
            '          </a>' % (
                esc(a.get('slug')), case_group(a), shade_cover(a.get('cover') or '#d8c3a5'), img,
                esc(a.get('category')), esc(a.get('title')), esc(a.get('excerpt')),
                esc(a.get('date')), esc(a.get('readMin'))))
    return (
        '      <div class="container" id="blogRoot">\n'
        '        <div class="section-head">\n'
        '          <span class="eyebrow">ACTUAL WORK</span>\n'
        '          <h1>현장에서 한 일을 사진과 함께 기록합니다</h1>\n'
        '          <p class="section-sub">누수·배관 실제 현장과 인테리어 공정, 견적·보증 안내를 분야별로 확인하세요.</p>\n'
        '        </div>\n'
        + featured_html + '\n'
        '        <div class="case-filter-bar" role="group" aria-label="사례 분야 선택">\n'
        '          <button type="button" class="case-filter" data-case-filter="all" aria-pressed="true">전체</button>\n'
        '          <button type="button" class="case-filter" data-case-filter="leak" aria-pressed="false">누수·배관</button>\n'
        '          <button type="button" class="case-filter" data-case-filter="interior" aria-pressed="false">인테리어</button>\n'
        '          <button type="button" class="case-filter" data-case-filter="info" aria-pressed="false">정보</button>\n'
        '        </div>\n'
        f'        <p class="case-filter-status" id="caseFilterStatus" aria-live="polite">전체 {len(insights)}건</p>\n'
        '        <div class="insights-grid">\n'
        + '\n'.join(cards) + '\n'
        '        </div>\n'
        '      </div>')


def write_blog_list(insights):
    """blog.html 의 #blogRoot 블록을 정적 목록으로 교체한다."""
    path = os.path.join(ROOT, 'blog.html')
    with open(path, encoding='utf-8') as f:
        html_src = f.read()
    start = html_src.find('      <div class="container" id="blogRoot">')
    if start < 0:
        print('건너뜀: blog.html 에서 #blogRoot 블록을 찾지 못했습니다')
        return False
    # 줄 시작에 앵커한다. 그냥 find('      </div>')는 부분문자열 검색이라
    # 8칸 들여쓴 '        </div>' 안의 6칸 패턴에 먼저 걸린다 — 그 결과
    # 실행할 때마다 옛 목록 한 벌이 컨테이너 밖에 남아 페이지에 쌓였다
    # (실제로 4벌까지 쌓인 채 배포돼 있었다).
    end = html_src.find('\n      </div>', start)
    if end < 0:
        print('건너뜀: #blogRoot 닫는 태그를 찾지 못했습니다')
        return False
    end += len('\n      </div>')
    new = html_src[:start] + list_markup(insights) + html_src[end:]
    if new == html_src:
        print('blog.html 변경 없음')
        return False
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new)
    print('생성: blog.html 목록(%d건 정적)' % len(insights))
    return True


def main():
    with open(os.path.join(ROOT, 'data', 'site.json'), encoding='utf-8') as f:
        insights = json.load(f).get('insights', [])
    # 초안은 공개 data/site.json 안에 있어도 목록·정적 글로 만들지 않는다.
    # published 가 없던 기존 글은 하위 호환으로 공개 상태다.
    insights = [a for a in insights if a.get('published', True) is not False]
    insights = sorted(insights, key=lambda a: str(a.get('date') or ''), reverse=True)
    outdir = os.path.join(ROOT, 'posts')
    os.makedirs(outdir, exist_ok=True)
    known = set()
    for a in insights:
        path = os.path.join(outdir, a['slug'] + '.html')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(article_html(a, insights))
        known.add(a['slug'] + '.html')
        print('생성:', os.path.relpath(path, ROOT))
    # 삭제된 글의 잔여 페이지 정리
    for fn in os.listdir(outdir):
        if fn.endswith('.html') and fn not in known:
            os.remove(os.path.join(outdir, fn))
            print('삭제(글 없음):', 'posts/' + fn)
    write_blog_list(insights)
    write_rss(insights)
    print(f'완료 · {len(insights)}건')


if __name__ == '__main__':
    main()
