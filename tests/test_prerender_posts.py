import importlib.util
from html.parser import HTMLParser
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'manmool_prerender_posts',
    ROOT / 'scripts' / 'prerender-posts.py',
)
PRERENDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRERENDER)


class ArticleServiceTests(unittest.TestCase):
    def test_explicit_supported_service_wins(self):
        self.assertEqual(
            PRERENDER.article_service({'service': 'interior', 'category': '방수·설비'}),
            'interior',
        )
        self.assertEqual(
            PRERENDER.article_service({'service': 'leak', 'category': '인테리어'}),
            'leak',
        )

    def test_category_fallback_is_only_for_missing_service(self):
        self.assertEqual(PRERENDER.article_service({'category': '방수·설비'}), 'leak')
        self.assertEqual(
            PRERENDER.article_service({'service': '', 'category': '방수·설비'}),
            'interior',
        )
        self.assertEqual(
            PRERENDER.article_service({'service': 'unsupported', 'category': '누수탐지·수리'}),
            'interior',
        )


class ParagraphTests(unittest.TestCase):
    def test_blank_lines_are_semantic_paragraphs(self):
        self.assertEqual(PRERENDER.render_paragraphs(' 첫 문단\n두 줄\n\n다음 문단 '),
                         '<p>첫 문단<br>두 줄</p><p>다음 문단</p>')

    def test_crlf_whitespace_and_empty_paragraphs(self):
        self.assertEqual(PRERENDER.render_paragraphs('\r\nA\r\n \t\r\n\r\nB\r\n'),
                         '<p>A</p><p>B</p>')
        self.assertEqual(PRERENDER.render_paragraphs(' \n\n '), '')
        self.assertEqual(PRERENDER.render_paragraphs(None), '')

    def test_text_cannot_inject_markup(self):
        self.assertEqual(PRERENDER.render_paragraphs('<img onerror="bad()"> &\n\n끝'),
                         '<p>&lt;img onerror=&quot;bad()&quot;&gt; &amp;</p><p>끝</p>')


class CaseReaderTests(unittest.TestCase):
    def test_consultation_requires_both_fields_and_escapes_markup(self):
        self.assertEqual(PRERENDER.consultation_markup({}), '')
        self.assertEqual(PRERENDER.consultation_markup({'consultation': {'photos': '사진'}}), '')
        self.assertEqual(PRERENDER.consultation_markup({'consultation': []}), '')
        markup = PRERENDER.consultation_markup({'consultation': {'photos': '<img onerror="x">', 'scope': '관 & 부속'}})
        self.assertIn('&lt;img onerror=&quot;x&quot;&gt;', markup)
        self.assertIn('관 &amp; 부속', markup)
        self.assertNotIn('<img', markup)

    def test_related_ignores_self_duplicate_missing_hidden_and_cross_service(self):
        current = {'slug': 'self', 'service': 'leak', 'relatedSlugs': ['self', 'missing', 'preferred', 'preferred', 'hidden', 'interior']}
        items = [current, {'slug': 'new', 'service': 'leak'}, {'slug': 'preferred', 'service': 'leak'},
                 {'slug': 'hidden', 'service': 'leak', 'published': False},
                 {'slug': 'older', 'service': 'leak'}, {'slug': 'interior', 'service': 'interior'}]
        self.assertEqual([x['slug'] for x in PRERENDER.select_related(current, items)], ['preferred', 'new', 'older'])
        current['relatedSlugs'] = 'not-an-array'
        self.assertEqual([x['slug'] for x in PRERENDER.select_related(current, items)], ['new', 'preferred', 'older'])
        self.assertEqual(PRERENDER.select_related(current, [current]), [])


class ListCardParser(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.cards = []
        self.images = []
        self.groups = []
        self.group_cards = {}
        self.current_group = None
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'img' and attributes.get('class') == 'ic-image':
            self.images.append(attributes)
        if tag == 'section' and 'data-case-group' in attributes:
            self.current_group = attributes['data-case-group']
            self.groups.append((self.current_group, 'hidden' in attributes))
            self.group_cards[self.current_group] = []
        if tag == 'a' and attributes.get('class') in ('insight-featured', 'insight-card'):
            self.cards.append((attributes['class'], attributes['href'], attributes['data-group']))
            if self.current_group:
                self.group_cards[self.current_group].append(attributes['data-group'])

    def handle_endtag(self, tag):
        if tag == 'section':
            self.current_group = None


class FeaturedCaseTests(unittest.TestCase):
    def test_first_rendered_image_has_priority_not_newer_interior_featured(self):
        items = [
            {'slug': 'interior', 'category': '인테리어', 'image': 'interior.jpg',
             'caseSummary': {'work': '새 실제 사례'}},
            {'slug': 'leak', 'category': '방수·설비', 'image': 'leak.jpg'},
            {'slug': 'guide', 'category': '계약', 'image': 'guide.jpg'},
        ]
        images = ListCardParser(PRERENDER.list_markup(items)).images
        self.assertEqual([i['src'] for i in images], ['leak.jpg', 'interior.jpg', 'guide.jpg'])
        self.assertEqual(images[0]['loading'], 'eager')
        self.assertEqual(images[0]['fetchpriority'], 'high')
        for image in images[1:]:
            self.assertEqual(image['loading'], 'lazy')
            self.assertNotIn('fetchpriority', image)

    def test_first_photo_skips_imageless_cards_and_featured(self):
        items = [
            {'slug': 'featured', 'category': '방수·설비', 'caseSummary': {'work': '확인된 작업'}},
            {'slug': 'plain', 'category': '방수·설비'},
            {'slug': 'photo', 'category': '인테리어', 'image': 'first.jpg'},
            {'slug': 'guide', 'category': '계약', 'image': 'second.jpg'},
        ]
        images = ListCardParser(PRERENDER.list_markup(items)).images
        self.assertEqual(images[0]['src'], 'first.jpg')
        self.assertEqual(images[0]['loading'], 'eager')
        self.assertEqual(images[0]['fetchpriority'], 'high')
        self.assertEqual(images[1]['loading'], 'lazy')
        self.assertNotIn('fetchpriority', images[1])
        featured_only = dict(items[0], image='featured.jpg')
        images = ListCardParser(PRERENDER.list_markup([featured_only])).images
        self.assertEqual(images[0]['loading'], 'eager')
        self.assertEqual(images[0]['fetchpriority'], 'high')
        self.assertEqual(ListCardParser(PRERENDER.list_markup(items[:2])).images, [])

    def test_newer_guide_stays_a_card_and_latest_actual_work_is_featured(self):
        guide = {'slug': 'guide', 'date': '2026-09-09', 'category': '견적·계약 가이드',
                 'caseSummary': {'work': '정보 글은 작업 요약이 있어도 대표 시공이 아님'}}
        case = {'slug': 'actual-work', 'date': '2026-09-08', 'category': '방수·설비',
                'caseSummary': {'work': '실제 방수 작업'}}
        older = {'slug': 'older-work', 'date': '2026-09-07', 'category': '인테리어',
                 'caseSummary': {'work': '이전 실제 작업'}}
        insights = [guide, case, older]
        self.assertEqual(ListCardParser(PRERENDER.list_markup(insights)).cards, [
            ('insight-featured', 'posts/actual-work.html', 'leak'),
            ('insight-card', 'posts/older-work.html', 'interior'),
            ('insight-card', 'posts/guide.html', 'info'),
        ])
        self.assertEqual([a['slug'] for a in insights], ['guide', 'actual-work', 'older-work'])

    def test_guides_only_have_no_featured_label_and_keep_every_card(self):
        insights = [
            {'slug': 'new-guide', 'category': '계약', 'caseSummary': {'work': '정보 설명'}},
            {'slug': 'old-guide', 'category': '보증'},
        ]
        markup = PRERENDER.list_markup(insights)
        self.assertNotIn('FEATURED CASE', markup)
        self.assertNotIn('최신 현장 ·', markup)
        self.assertEqual(ListCardParser(markup).cards, [
            ('insight-card', 'posts/new-guide.html', 'info'),
            ('insight-card', 'posts/old-guide.html', 'info'),
        ])

    def test_article_without_work_summary_is_not_featured(self):
        markup = PRERENDER.list_markup([{'slug': 'interior-guide', 'category': '인테리어'}])
        self.assertNotIn('FEATURED CASE', markup)
        self.assertEqual(ListCardParser(markup).cards,
                         [('insight-card', 'posts/interior-guide.html', 'interior')])

    def test_all_groups_contain_only_their_cards_and_report_counts(self):
        markup = PRERENDER.list_markup([
            {'slug': 'guide', 'category': '인테리어 공정 가이드'},
            {'slug': 'interior', 'category': '인테리어'},
            {'slug': 'leak-a', 'category': '방수·설비'},
            {'slug': 'leak-b', 'category': '방수·설비'},
        ])
        parsed = ListCardParser(markup)
        self.assertEqual(parsed.groups, [('leak', False), ('interior', False), ('info', False)])
        self.assertEqual(parsed.group_cards, {'leak': ['leak', 'leak'], 'interior': ['interior'], 'info': ['info']})
        for group, label, count in [('leak', '누수·배관', 2), ('interior', '인테리어', 1), ('info', '정보', 1)]:
            self.assertIn(f'id="caseGroup-{group}">{label} <span data-case-group-count>{count}건</span>', markup)

    def test_empty_groups_stay_hidden_without_javascript(self):
        parsed = ListCardParser(PRERENDER.list_markup([{'slug': 'guide', 'category': '계약'}]))
        self.assertEqual(parsed.groups, [('leak', True), ('interior', True), ('info', False)])
        self.assertEqual(len(parsed.cards), 1)


class LeakReviewTests(unittest.TestCase):
    """2026-11-25 — leak.html 누수 후기 칸. 손님 글은 escape, 누수 후기만, 0건이면 숨김."""

    def test_no_leak_reviews_keeps_section_hidden_and_empty(self):
        for reviews in ([], None, [{'service': 'interior', 'rating': 5, 'name': '가○○', 'text': '인테리어 후기 본문입니다'}]):
            markup = PRERENDER.leak_reviews_markup(reviews)
            self.assertIn('id="leakReviews" aria-labelledby="leak-reviews-title" hidden>', markup)
            self.assertNotIn('<article', markup)
            self.assertTrue(markup.startswith(PRERENDER.LEAK_REVIEWS_START))
            self.assertTrue(markup.endswith(PRERENDER.LEAK_REVIEWS_END))

    def test_only_leak_reviews_are_rendered_and_text_is_escaped(self):
        markup = PRERENDER.leak_reviews_markup([
            {'service': 'leak', 'rating': 5, 'name': '가○○', 'space': '가상구 <b>가상</b>아파트',
             'text': '"</p><script>alert(1)</script>', 'date': '2026-11-25'},
            {'service': 'interior', 'rating': 4, 'name': '나○○', 'text': '인테리어 후기라 누수 칸에 안 나온다'},
            {'service': 'leak', 'rating': '5" onmouseover="x', 'name': '다○', 'text': '별점이 이상하면 별을 안 그린다'},
            {'service': 'leak', 'rating': 5, 'name': '', 'text': '이름이 비면 뺀다'},
        ])
        self.assertNotIn(' hidden>', markup)
        self.assertEqual(markup.count('<article class="leak-review">'), 2)
        self.assertNotIn('<script>', markup)
        self.assertNotIn('<b>가상</b>', markup)
        self.assertIn('&lt;script&gt;', markup)
        self.assertIn('가상구 &lt;b&gt;가상&lt;/b&gt;아파트 · 2026-11-25', markup)
        self.assertIn('aria-label="별점 5점">★★★★★</div>', markup)
        self.assertNotIn('onmouseover', markup)
        self.assertNotIn('인테리어 후기라', markup)
        self.assertNotIn('이름이 비면', markup)


class AreaPageTests(unittest.TestCase):
    """2026-11-25 — 대전 구별 현장 기록 쪽. 사례 3건 이상인 구만, 그 구 사례만, 손님 글은 escape."""

    @staticmethod
    def case(slug, date, category='방수·설비', title=None):
        return {'slug': slug, 'date': date, 'category': category, 'title': title or f'가상 사례 {slug}',
                'excerpt': '가상 소개', 'readMin': 2, 'caseSummary': {'site': '가상', 'issue': '가상', 'work': '가상', 'result': '가상'}}

    def setUp(self):
        self.insights = [
            self.case('seo-a', '2026-11-03'), self.case('seo-b', '2026-11-02', '바닥·미장'), self.case('seo-c', '2026-11-01'),
            self.case('jung-a', '2026-10-30'), self.case('jung-b', '2026-10-29'),
            {'slug': 'guide', 'date': '2026-11-04', 'category': '계약 가이드', 'title': '가이드', 'readMin': 1},
        ]
        self.areas = {'seo-a': {'gu': '서구', 'dong': '가상동'}, 'seo-b': {'gu': '서구'}, 'seo-c': {'gu': '서구', 'dong': '가상동'},
                      'jung-a': {'gu': '중구'}, 'jung-b': {'gu': '중구'}, 'guide': {'gu': '서구'}}

    def test_only_gu_with_three_real_cases_gets_a_page(self):
        pages = PRERENDER.area_pages_for(self.insights, self.areas)
        self.assertEqual([(gu, slug, [a['slug'] for a in items]) for gu, slug, items in pages],
                         [('서구', 'daejeon-seo-gu', ['seo-a', 'seo-b', 'seo-c'])])
        hidden = [dict(a, published=False) if a['slug'] == 'seo-c' else a for a in self.insights]
        self.assertEqual(PRERENDER.area_pages_for(hidden, self.areas), [])
        self.assertEqual(PRERENDER.area_lastmod(pages[0][2]), '2026-11-03')

    def test_area_page_lists_only_its_cases_with_facts_and_escapes_text(self):
        insights = [dict(self.insights[0], title='<b>가상</b> 제목')] + self.insights[1:]
        pages = PRERENDER.area_pages_for(insights, self.areas)
        gu, slug, items = pages[0]
        markup = PRERENDER.area_html(gu, slug, items, pages, self.areas)
        self.assertEqual([c[1] for c in ListCardParser(markup).cards],
                         ['../posts/seo-a.html', '../posts/seo-b.html', '../posts/seo-c.html'])
        self.assertNotIn('jung-a', markup)
        self.assertNotIn('<b>가상</b>', markup)
        self.assertIn('&lt;b&gt;가상&lt;/b&gt; 제목', markup)
        self.assertIn('"name": "\\u003cb\\u003e가상\\u003c/b\\u003e 제목"', markup, 'JSON-LD 안의 제목도 script 를 닫지 못하게')
        self.assertIn('<h1>대전 서구 현장 기록</h1>', markup)
        self.assertIn('<title>대전 서구 현장 기록 3건 · 만물인테리어</title>', markup)
        self.assertIn('<link rel="canonical" href="https://01023978629.github.io/manmool/area/daejeon-seo-gu.html" />', markup)
        self.assertIn('href="tel:01023978629"', markup)
        # 동이 없는 글은 세지 않는다 — '동 이름 없이' 라고 쓰면 '신탄진' 처럼 동네를 적은 글을 틀리게 말한다(2026-11-25 검토).
        self.assertIn('<p class="area-dongs">글에 동 이름이 적힌 기록: 가상동 2건</p>', markup)
        self.assertNotIn('동 이름 없이', markup)
        no_dong = {slug: {'gu': v['gu']} for slug, v in self.areas.items()}
        self.assertNotIn('area-dongs', PRERENDER.area_html(gu, slug, items, pages, no_dong), '동이 하나도 없으면 줄을 두지 않는다')
        self.assertIn('<div><dt>누수·배관</dt><dd>2건</dd></div><div><dt>인테리어</dt><dd>1건</dd></div>', markup)
        self.assertNotIn('area-others', markup, '다른 구 쪽이 없으면 다른 구 목록도 없다')

    def test_blog_list_links_area_pages_only_when_there_are_some(self):
        pages = PRERENDER.area_pages_for(self.insights, self.areas)
        with_nav = PRERENDER.list_markup(self.insights, pages)
        self.assertIn('<a href="area/daejeon-seo-gu.html">대전 서구 <small>3건</small></a>', with_nav)
        self.assertNotIn('case-area-links', PRERENDER.list_markup(self.insights))
        self.assertEqual(ListCardParser(with_nav).cards, ListCardParser(PRERENDER.list_markup(self.insights)).cards)
        self.assertNotIn('\n      </div>', with_nav.split('case-area-links')[1].split('</nav>')[0],
                         'blog.html 목록 끝 표시(6칸 </div>)가 구별 링크 안에 생기면 생성기가 목록을 잘못 자른다')

    def test_post_links_back_to_its_area_page_only_when_given(self):
        a = self.insights[0]
        self.assertIn('href="../area/daejeon-seo-gu.html">대전 서구 현장 기록 모아 보기',
                      PRERENDER.article_html(a, self.insights, ('서구', 'daejeon-seo-gu')))
        self.assertNotIn('../area/', PRERENDER.article_html(a, self.insights))


class PostRedirectTests(unittest.TestCase):
    """2026-11-28: 공개한 뒤 내린 글의 옛 주소(scripts/post-redirects.json)."""

    insights = [
        {'slug': 'new-a', 'title': '새 글 A & 첫 번째', 'published': True},
        {'slug': 'new-b', 'title': '새 글 B', 'published': True},
    ]

    def test_redirect_page_is_noindex_and_points_at_the_new_post(self):
        markup = PRERENDER.redirect_html('old-post', {'to': 'new-a', 'also': ['new-b']}, self.insights)
        self.assertIn('<meta name="robots" content="noindex, follow" />', markup)
        self.assertIn('<link rel="canonical" href="https://01023978629.github.io/manmool/posts/new-a.html" />', markup)
        self.assertIn('<meta http-equiv="refresh" content="0; url=new-a.html" />', markup)
        self.assertIn('<a href="new-a.html">새 글 A &amp; 첫 번째</a>', markup)
        self.assertIn('<a href="new-b.html">새 글 B</a>', markup)
        self.assertNotIn('<script', markup)
        self.assertNotIn('old-post', markup)

    def test_bad_redirect_tables_stop_the_build(self):
        PRERENDER.check_post_redirects({'old-post': {'to': 'new-a', 'also': ['new-b']}}, self.insights)
        for table in ({'new-a': {'to': 'new-b'}},                 # 옛 주소가 아직 공개 글
                      {'old-post': {'to': 'missing'}},            # 없는 글로 보냄
                      {'old-post': {'to': 'new-a', 'also': ['missing']}},
                      {'Old Post': {'to': 'new-a'}},              # slug 형식
                      {'old-post': 'new-a'}):                     # 형식
            with self.assertRaises(SystemExit, msg=table):
                PRERENDER.check_post_redirects(table, self.insights)


if __name__ == '__main__':
    unittest.main()
