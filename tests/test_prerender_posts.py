import importlib.util
from html.parser import HTMLParser
import io
import json
import pathlib
import re
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


class ListCardParser(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.cards = []
        self.groups = []
        self.group_cards = {}
        self.current_group = None
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
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


class PhotoVariantTests(unittest.TestCase):
    """설명 글 사진(assets/insights)도 사례 사진과 같은 축소본 규칙을 탄다.

    2026-09-26 전까지 규칙이 ^assets/cases/…\\.jpg$ 뿐이라 설명 글 9장(PNG 1.2MB 포함)이
    356px 카드에 원본 그대로 나갔다. 여기 검사는 실제 저장소 파일로 치수를 읽는다.
    """
    CARD = PRERENDER.SIZES_CARD

    def test_case_jpeg_keeps_existing_rule(self):
        extra = PRERENDER.photo_extra('assets/cases/samho-rain-pipe-202609-01.jpg', self.CARD)
        self.assertEqual(extra, ' width="1200" height="1600" srcset="assets/cases/resized/samho-rain-pipe-202609-01-480w.jpg 480w, '
                                'assets/cases/resized/samho-rain-pipe-202609-01-960w.jpg 960w" sizes="%s"' % self.CARD)

    def test_insights_jpeg_gets_variants_and_dimensions(self):
        extra = PRERENDER.photo_extra('assets/insights/budget-guide-34py.jpg', self.CARD, '../')
        self.assertIn(' width="1600" height="900"', extra)
        self.assertIn('srcset="../assets/insights/resized/budget-guide-34py-480w.jpg 480w, '
                      '../assets/insights/resized/budget-guide-34py-960w.jpg 960w"', extra)

    def test_png_original_gets_jpeg_variants_and_png_dimensions(self):
        src = 'assets/insights/interior-quote-details-ai-redacted.png'
        self.assertEqual(PRERENDER.image_dimensions(src), (1774, 887))
        extra = PRERENDER.photo_extra(src, self.CARD)
        self.assertIn(' width="1774" height="887"', extra)
        self.assertIn('assets/insights/resized/interior-quote-details-ai-redacted-480w.jpg 480w', extra)
        self.assertNotIn('-480w.png', extra)

    def test_cache_query_is_stripped_to_find_file_and_carried_to_variants(self):
        src = 'assets/insights/office-partner-check.jpg?v=20260919-photofix'
        self.assertEqual(PRERENDER.image_dimensions(src), (1600, 900))
        extra = PRERENDER.photo_extra(src, self.CARD)
        self.assertIn('srcset="assets/insights/resized/office-partner-check-480w.jpg?v=20260919-photofix 480w, '
                      'assets/insights/resized/office-partner-check-960w.jpg?v=20260919-photofix 960w"', extra)

    def test_paths_outside_the_rule_get_nothing(self):
        for src in ('assets/site/hero-interior.jpg', 'https://example.invalid/a.jpg',
                    'assets/insights/a.jpg?v=1&x=2', 'assets/insights/sub/a.jpg',
                    'assets/insights/a.gif', '../assets/insights/a.jpg', '', None):
            self.assertEqual(PRERENDER.photo_extra(src, self.CARD), '', src)

    def test_missing_file_has_no_guessed_dimensions(self):
        self.assertIsNone(PRERENDER.image_dimensions('assets/insights/no-such-synthetic-file.png'))
        self.assertNotIn('width=', PRERENDER.photo_extra('assets/insights/no-such-synthetic-file.png', self.CARD))

    def test_png_header_reader(self):
        ihdr = b'\x00\x00\x00\x0dIHDR' + (300).to_bytes(4, 'big') + (200).to_bytes(4, 'big') + b'\x08\x02\x00\x00\x00'
        self.assertEqual(PRERENDER.read_png_size(io.BytesIO(ihdr)), (300, 200))
        self.assertIsNone(PRERENDER.read_png_size(io.BytesIO(b'\x00\x00\x00\x0dIDAT' + bytes(8))))
        self.assertIsNone(PRERENDER.read_png_size(io.BytesIO(ihdr[:12])))

    def test_every_insights_image_in_site_json_is_covered(self):
        site = json.loads((ROOT / 'data' / 'site.json').read_text(encoding='utf-8'))
        paths = set()
        for a in site['insights']:
            paths.add(a.get('image'))
            paths.update(b.get('img') for b in a.get('body') or [])
        insights = sorted(p for p in paths if p and p.startswith('assets/insights/'))
        self.assertGreaterEqual(len(insights), 9)
        for src in insights:
            self.assertTrue(PRERENDER.image_dimensions(src), src)
            self.assertIn('/resized/', PRERENDER.photo_extra(src, self.CARD), src)

    def test_post_page_declares_og_image_size_for_insights(self):
        a = {'slug': 'synthetic-guide', 'title': '합성 안내', 'category': '계약',
             'image': 'assets/insights/interior-quote-details-ai-redacted.png'}
        page = PRERENDER.article_html(a, [a])
        self.assertIn('<meta property="og:image:width" content="1774" />', page)
        self.assertIn('../assets/insights/resized/interior-quote-details-ai-redacted-960w.jpg 960w', page)


class IndexCardTests(unittest.TestCase):
    """대문 #insightsGrid 는 생성기가 정적 카드로 채운다(JS 없이도 보이게)."""

    ARTICLES = [
        {'slug': 'newest', 'date': '2026-09-10', 'title': '최신 <글>', 'category': '계약',
         'excerpt': '요약 & 설명', 'readMin': 3, 'cover': '#123456'},
        {'slug': 'guide-a', 'date': '2026-09-01', 'title': '가이드 A', 'category': '견적',
         'excerpt': 'A', 'readMin': 4, 'image': 'assets/insights/budget-guide-34py.jpg', 'imageAlt': '평면도'},
        {'slug': 'guide-b', 'date': '2026-08-01', 'title': '가이드 B', 'category': '보증',
         'excerpt': 'B', 'readMin': 5, 'image': 'assets/insights/warranty-periods.jpg?v=20260919-photofix'},
    ]
    GRID = ('<main>\n        <div class="insights-grid" id="insightsGrid" data-featured-slugs="%s"></div>\n'
            '        <div class="insights-more"></div>\n</main>\n')

    def cards(self, markup):
        return re.findall(r'<a class="insight-card" href="posts/([^"]+)\.html">', markup)

    def test_featured_order_and_missing_slug_skipped(self):
        out = PRERENDER.index_with_cards(self.GRID % 'guide-b,no-such,guide-a', self.ARTICLES)
        self.assertEqual(self.cards(out), ['guide-b', 'guide-a'])

    def test_without_featured_slugs_latest_three(self):
        out = PRERENDER.index_with_cards(self.GRID % '', self.ARTICLES)
        self.assertEqual(self.cards(out), ['newest', 'guide-a', 'guide-b'])

    def test_cards_are_visible_without_js_and_carry_srcset(self):
        out = PRERENDER.index_with_cards(self.GRID % 'guide-a,guide-b,newest', self.ARTICLES)
        self.assertNotIn('reveal', out)
        self.assertIn('src="assets/insights/budget-guide-34py.jpg" width="1600" height="900" '
                      'srcset="assets/insights/resized/budget-guide-34py-480w.jpg 480w', out)
        self.assertIn('assets/insights/resized/warranty-periods-960w.jpg?v=20260919-photofix 960w', out)
        self.assertIn('background:linear-gradient(150deg, #123456, #022446)', out)
        self.assertIn('<b>최신 &lt;글&gt;</b>', out)
        self.assertIn('요약 &amp; 설명', out)
        self.assertNotIn('<div', out.split('id="insightsGrid"', 1)[1].split('</div>', 1)[0])

    def test_regeneration_is_idempotent_and_touches_only_the_grid(self):
        once = PRERENDER.index_with_cards(self.GRID % 'guide-a', self.ARTICLES)
        twice = PRERENDER.index_with_cards(once, self.ARTICLES)
        self.assertEqual(once, twice)
        self.assertTrue(once.startswith('<main>\n        <div class="insights-grid" id="insightsGrid" data-featured-slugs="guide-a">\n'))
        self.assertTrue(once.endswith('\n        </div>\n        <div class="insights-more"></div>\n</main>\n'))

    def test_shade_matches_main_js(self):
        self.assertEqual(PRERENDER.shade('#d8c3a5', -16), '#c8b395')
        self.assertEqual(PRERENDER.shade('#0a0a0a', -16), '#000000')
        self.assertEqual(PRERENDER.shade('not-a-color', -16), 'not-a-color')

    def test_committed_index_is_current(self):
        """CI 의 git diff 단계는 index.html 을 보지 않는다 — 여기서 대신 막는다."""
        site = json.loads((ROOT / 'data' / 'site.json').read_text(encoding='utf-8'))
        insights = [a for a in site['insights'] if a.get('published', True) is not False]
        insights = sorted(insights, key=lambda a: str(a.get('date') or ''), reverse=True)
        index = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertEqual(len(self.cards(index)), 3, '대문 인사이트 카드가 정적으로 박혀 있지 않다')
        self.assertEqual(PRERENDER.index_with_cards(index, insights), index,
                         'index.html #insightsGrid 가 site.json 과 다르다 — python3 scripts/prerender-posts.py')


if __name__ == '__main__':
    unittest.main()
