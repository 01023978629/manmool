#!/usr/bin/env python3
"""build-image-variants.py — 사진 축소본(480w/960w) 생성

왜: 원본 사진이 목록 카드·본문에 그대로 나가서 휴대폰 LTE에서 페이지 LCP가
5초를 넘었다(종합평가 ⑤). 카드 한 칸은 356px, 본문 칼럼은 712px라 원본 폭의
절반도 안 쓴다.
  - assets/cases/     사례 사진(최대 1800px·480KB) — 처음부터 대상.
  - assets/insights/  설명 글 사진(1600px JPEG 190~270KB 8장 + 견적서 PNG 1774px
                      1.2MB). 2026-09-26 전까지 대상이 아니어서 blog.html 한 장을
                      열 때 이미지 전송 4.5MB 중 3.0MB가 이 9장이었다.
  - assets/site/hero-interior.jpg  인테리어 대문 첫 그림(LCP). 폰 첫 화면에 1600px.

하는 일: 대상 폴더의 원본마다 <폴더>/resized/<이름>-480w.jpg 와 -960w.jpg 를
만든다. 원본이 목표 폭보다 작으면 확대하지 않고 원본 폭 그대로 저장한다
(뻥튀기 금지 — 480/960 이름은 유지해 참조 규칙을 한 가지로 둔다).

- 축소본은 **늘 JPEG** 이다. PNG 원본(견적서 캡처)도 JPEG 축소본을 만든다 —
  사진·문서 캡처를 PNG 로 줄이면 원본과 무게가 비슷하게 남는다. 투명 부분은
  흰 바탕에 얹는다. 그래서 같은 폴더에 이름만 같고 확장자가 다른 원본(a.jpg·a.png)
  이 있으면 축소본 이름이 겹친다 — 그 경우 만들지 않고 실패한다.
- EXIF·ICC·PNG 텍스트 청크(C2PA 포함)는 저장 시 버려진다(위치정보 포함) —
  PIL 기본 동작. 출처 표시는 원본(src)과 글의 본문 고지가 맡는다.
- 원본은 절대 건드리지 않는다. resized/ 만 쓴다.
- 다시 돌려도 안전하다: 원본보다 새 출력이 이미 있으면 건너뛴다.
  강제 재생성은 --force.
- 축소본이 원본보다 무거우면(작게 저장된 원본을 다시 굽는 경우) 경고한다.
  scripts/ensure-image-variants.mjs 가 같은 조건을 실패로 막는다.

사용: python3 scripts/build-image-variants.py [--force]
검사: scripts/ensure-image-variants.mjs 가 누락·비대·고아를 잡는다.
참조 규칙(같이 고칠 곳): scripts/prerender-posts.py VARIANT_RE,
js/main.js caseImgExtra, js/blog.js caseExtra.
"""
import os
import sys
import glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO_PATTERNS = ('*.jpg', '*.jpeg', '*.png')
# (원본 폴더, 원본 파일 글롭) — 축소본은 <원본 폴더>/resized/ 에 쓴다.
# assets/site 는 아이콘 폴더이기도 해서 대문 첫 그림 한 장만 이름으로 고른다.
SOURCES = (
    ('assets/cases', PHOTO_PATTERNS),
    ('assets/insights', PHOTO_PATTERNS),
    ('assets/site', ('hero-interior.jpg',)),
)
WIDTHS = (480, 960)
QUALITY = 78


def originals(folder, patterns):
    base = os.path.join(ROOT, *folder.split('/'))
    found = set()
    for pattern in patterns:
        found.update(glob.glob(os.path.join(base, pattern)))
    return sorted(found)


def flatten(im):
    """투명도가 있으면 흰 바탕에 얹어 JPEG 로 저장할 수 있는 RGB 로 만든다."""
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        rgba = im.convert('RGBA')
        bg = Image.new('RGB', rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return im.convert('RGB')


def build(force=False):
    made, kept, heavy = 0, 0, []
    for folder, patterns in SOURCES:
        sources = originals(folder, patterns)
        stems = {}
        for src in sources:
            stem = os.path.splitext(os.path.basename(src))[0]
            if stem in stems:
                sys.exit(f'축소본 이름이 겹친다: {folder}/{os.path.basename(stems[stem])} 와 '
                         f'{os.path.basename(src)} — 둘 중 하나의 이름을 바꿔라')
            stems[stem] = src
        out_dir = os.path.join(ROOT, *folder.split('/'), 'resized')
        os.makedirs(out_dir, exist_ok=True)
        for src in sources:
            stem = os.path.splitext(os.path.basename(src))[0]
            for w in WIDTHS:
                out = os.path.join(out_dir, f'{stem}-{w}w.jpg')
                if not force and os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
                    kept += 1
                    continue
                im = flatten(Image.open(src))
                if im.width > w:
                    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
                im.save(out, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
                made += 1
                if os.path.getsize(out) >= os.path.getsize(src):
                    heavy.append(os.path.relpath(out, ROOT))
    print(f'변형 {made}개 생성, {kept}개 최신 유지 → ' + ', '.join(f'{f}/resized/' for f, _ in SOURCES))
    for path in heavy:
        print(f'경고: 축소본이 원본보다 무겁다 — {path} (ensure-image-variants 가 막는다)')


if __name__ == '__main__':
    build(force='--force' in sys.argv[1:])
