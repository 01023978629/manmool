import importlib.util
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


if __name__ == '__main__':
    unittest.main()
