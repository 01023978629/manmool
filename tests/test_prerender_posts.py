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


if __name__ == '__main__':
    unittest.main()


class ImageHeaderTests(unittest.TestCase):
    """공유 카드 치수는 파일 머리에서 읽는다 — scripts/ensure-og-image-dims.mjs 가 같은 값을 따로 읽는다."""

    def test_png_ihdr(self):
        data = b'\x89PNG\r\n\x1a\n' + b'\x00\x00\x00\x0dIHDR' + (1200).to_bytes(4, 'big') + (630).to_bytes(4, 'big') + b'\x08\x02\x00\x00\x00'
        self.assertEqual(PRERENDER.png_dimensions(data), (1200, 630))

    def test_webp_lossy_lossless_and_extended(self):
        lossy = b'RIFF\x00\x00\x00\x00WEBPVP8 ' + b'\x00' * 7 + b'\x9d\x01\x2a' + (800).to_bytes(2, 'little') + (600).to_bytes(2, 'little')
        self.assertEqual(PRERENDER.webp_dimensions(lossy), (800, 600))
        bits = (800 - 1) | ((600 - 1) << 14)
        lossless = b'RIFF\x00\x00\x00\x00WEBPVP8L' + b'\x00' * 4 + b'\x2f' + bits.to_bytes(4, 'little')
        self.assertEqual(PRERENDER.webp_dimensions(lossless), (800, 600))
        extended = b'RIFF\x00\x00\x00\x00WEBPVP8X' + b'\x00' * 8 + (1599).to_bytes(3, 'little') + (1199).to_bytes(3, 'little')
        self.assertEqual(PRERENDER.webp_dimensions(extended), (1600, 1200))

    def test_real_share_card_and_query_token_is_ignored(self):
        self.assertEqual(PRERENDER.image_dimensions('og-image.png?v=abc'), (1200, 630))
        self.assertIsNone(PRERENDER.image_dimensions('../og-image.png'))


class SitemapTests(unittest.TestCase):
    def test_post_lastmod_follows_updated_or_date(self):
        block = '  <url>\n    <loc>x</loc>\n    <lastmod>2026-08-09</lastmod>\n  </url>\n'
        self.assertIn('<lastmod>2026-07-04</lastmod>', PRERENDER.set_lastmod(block, '2026-07-04'))
        self.assertEqual(PRERENDER.set_lastmod(block, 'not-a-day'), block)
        self.assertIn('</loc>\n    <lastmod>2026-07-04</lastmod>', PRERENDER.set_lastmod('<url><loc>x</loc></url>', '2026-07-04'))
