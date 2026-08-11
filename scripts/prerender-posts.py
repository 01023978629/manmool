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
import os
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://01023978629.github.io/manmool'
V = '20260719-fixes'  # css 캐시버스터 — 루트 html들과 동일하게 유지


def esc(s):
    return html.escape(str(s or ''), quote=True)


def shade_cover(hexv):
    return hexv or '#d8c3a5'


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
        f'<img class="post-cover-image" src="../{esc(a["image"])}" alt="{esc(a.get("imageAlt") or a["title"])}" fetchpriority="high" decoding="async">'
        if a.get('image') else '')
    body = '\n'.join(
        f'<h2>{esc(s.get("h"))}</h2><p>{esc(s.get("p"))}</p>' for s in (a.get('body') or []))
    related = [x for x in insights if x['slug'] != a['slug']][:3]
    related_html = '\n'.join(f'''          <a class="insight-card" href="{esc(x['slug'])}.html">
            <span class="ic-cover" style="background:{shade_cover(x.get('cover'))}">{f'<img class="ic-image" src="../{esc(x["image"])}" alt="{esc(x.get("imageAlt") or x["title"])}" loading="lazy" decoding="async">' if x.get('image') else ''}<span class="ic-cat">{esc(x.get('category'))}</span></span>
            <span class="ic-body"><b>{esc(x['title'])}</b><span class="ic-meta">{esc(x.get('date'))} · {esc(x.get('readMin'))}분 읽기</span></span>
          </a>''' for x in related)
    ld = json.dumps({
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
    }, ensure_ascii=False)

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
  <script type="application/ld+json">{ld}</script>
</head>
<body>
  <header class="site-header" id="siteHeader">
    <div class="container header-inner">
      <a href="../index.html#top" class="logo" aria-label="만물인테리어 홈">
        <span class="logo-mark">萬</span>
        <span class="logo-text"><strong>만물인테리어</strong><em>Loop Agent</em></span>
      </a>
      <nav class="main-nav" id="mainNav" aria-label="주요 메뉴">
        <a href="../index.html#about">회사 소개</a>
        <a href="../index.html#portfolio">추천 디자인</a>
        <a href="../index.html#estimator">AI 예상견적</a>
        <a href="../blog.html">인사이트</a>
        <a href="../index.html#inquiry">상담 신청</a>
      </nav>
      <a href="../index.html#estimator" class="btn btn-primary btn-sm header-cta">AI 예상견적</a>
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
            {body}
          </div>
          <div class="post-cta">
            <p>더 정확한 금액이 궁금하신가요?</p>
            <a href="../index.html#estimator" class="btn btn-primary">30초 AI 예상견적</a>
            <a href="../index.html#inquiry" class="btn btn-ghost">상담 신청</a>
          </div>
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
      <span>© 만물인테리어 · Loop Agent</span>
      <a href="../index.html">홈으로</a>
    </div>
  </footer>

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
    cards = []
    for a in insights:
        img = ''
        if a.get('image'):
            img = ('<img class="ic-image" src="%s" alt="%s" fetchpriority="high" decoding="async">'
                   % (esc(a['image']), esc(a.get('imageAlt') or a.get('title'))))
        cards.append(
            '          <a class="insight-card" href="posts/%s.html">\n'
            '            <span class="ic-cover" style="background:%s">%s<span class="ic-cat">%s</span></span>\n'
            '            <span class="ic-body">\n'
            '              <b>%s</b>\n'
            '              <span class="ic-excerpt">%s</span>\n'
            '              <span class="ic-meta">%s · %s분 읽기</span>\n'
            '            </span>\n'
            '          </a>' % (
                esc(a.get('slug')), shade_cover(a.get('cover') or '#d8c3a5'), img,
                esc(a.get('category')), esc(a.get('title')), esc(a.get('excerpt')),
                esc(a.get('date')), esc(a.get('readMin'))))
    return (
        '      <div class="container" id="blogRoot">\n'
        '        <div class="section-head" style="text-align:center">\n'
        '          <span class="eyebrow">INSIGHTS</span>\n'
        '          <h1>인테리어, 알고 시작하면 다릅니다</h1>\n'
        '          <p class="section-sub" style="margin:12px auto 0">견적·계약·보증까지 — 후회 없는 선택을 돕는 만물인테리어의 콘텐츠.</p>\n'
        '        </div>\n'
        '        <div class="insights-grid" style="margin-top:40px">\n'
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
