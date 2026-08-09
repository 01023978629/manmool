#!/usr/bin/env python3
"""sync-faq-jsonld.py — index.html 의 FAQ 구조화 데이터를 data/site.json 에서 생성한다.

왜 있는가
  검색 결과에 뜨는 답(JSON-LD)과 화면에서 보는 답(site.json)은 같아야 한다.
  예전에는 JSON-LD 를 손으로 관리해서, site.json 이 "방수 3년"으로 바뀐 뒤에도
  검색 결과에는 "방수 2년"이 나갔다. 그 답을 보고 온 손님과 3년짜리 보증서를
  놓고 말이 갈린다 — 틀린 구조화 데이터는 없는 것보다 나쁘다.

사용
  data/site.json 의 faq 를 고친 뒤 이것을 돌린다.
  ensure-site-integrity.mjs 가 두 곳이 글자 단위로 같은지 대조한다.
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
site = json.load(open(os.path.join(ROOT, 'data/site.json'), encoding='utf-8'))
faq = site['faq']

ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
        {"@type": "Question", "name": f["q"],
         "acceptedAnswer": {"@type": "Answer", "text": f["a"]}}
        for f in faq
    ],
}

block = (
    '  <!-- FAQ 구조화 데이터 — 정본은 data/site.json 의 faq 하나뿐이다.\n'
    '       손으로 고치지 마라: scripts/sync-faq-jsonld.py 가 생성하고\n'
    '       ensure-site-integrity.mjs 가 site.json 과 글자 단위로 대조한다.\n'
    '       예전에는 이 블록이 손으로 관리돼 site.json 이 3년으로 바뀐 뒤에도\n'
    '       검색 결과에는 "방수 2년"이 나갔고, main.js 가 두 번째 FAQPage 를\n'
    '       주입해 한 페이지에 상충하는 FAQPage 가 둘이었다. -->\n'
    '  <script type="application/ld+json">\n'
    + json.dumps(ld, ensure_ascii=False, indent=2) + '\n  </script>\n'
)

path = os.path.join(ROOT, 'index.html')
src = open(path, encoding='utf-8').read()
fq = src.find('"@type": "FAQPage"')
if fq < 0:
    raise SystemExit('index.html 에서 FAQPage 블록을 찾지 못했습니다')
start = src.rfind('<script type="application/ld+json">', 0, fq)
cm = src.rfind('<!--', 0, start)
if cm > 0 and src.find('-->', cm) < start:
    start = cm
end = src.find('</script>', fq) + len('</script>') + 1
new = src[:start] + block.lstrip() + src[end:]
if new == src:
    print('index.html 변경 없음')
else:
    open(path, 'w', encoding='utf-8').write(new)
    print('생성: index.html FAQPage (%d문항)' % len(faq))
