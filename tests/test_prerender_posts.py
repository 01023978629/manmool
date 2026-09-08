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
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'a' and attributes.get('class') in ('insight-featured', 'insight-card'):
            self.cards.append((attributes['class'], attributes['href'], attributes['data-group']))


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
            ('insight-card', 'posts/guide.html', 'info'),
            ('insight-card', 'posts/older-work.html', 'interior'),
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


if __name__ == '__main__':
    unittest.main()
