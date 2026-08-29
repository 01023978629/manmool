#!/usr/bin/env python3
"""build-image-variants.py — 사례 사진 축소본(480w/960w) 생성

왜: assets/cases/ 원본(최대 1800px·480KB)이 목록 카드·본문에 그대로 나가서
휴대폰 LTE에서 사례 페이지 LCP가 5초를 넘었다(종합평가 ⑤). 카드 한 칸은
356px, 본문 칼럼은 712px라 원본 폭의 절반도 안 쓴다.

하는 일: assets/cases/*.jpg 마다 assets/cases/resized/<이름>-480w.jpg 와
-960w.jpg 를 만든다. 원본이 목표 폭보다 작으면 확대하지 않고 원본 폭 그대로
저장한다(뻥튀기 금지 — 480/960 이름은 유지해 참조 규칙을 한 가지로 둔다).

- EXIF 는 저장 시 버려진다(위치정보 포함) — PIL 기본 동작.
- 원본은 절대 건드리지 않는다. resized/ 만 쓴다.
- 다시 돌려도 안전하다: 원본보다 새 출력이 이미 있으면 건너뛴다.
  강제 재생성은 --force.

사용: python3 scripts/build-image-variants.py [--force]
검사: scripts/ensure-image-variants.mjs 가 누락·비대를 잡는다.
"""
import os
import sys
import glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'assets', 'cases')
OUT_DIR = os.path.join(SRC_DIR, 'resized')
WIDTHS = (480, 960)
QUALITY = 78

def build(force=False):
    os.makedirs(OUT_DIR, exist_ok=True)
    made, kept = 0, 0
    for src in sorted(glob.glob(os.path.join(SRC_DIR, '*.jpg'))):
        stem = os.path.splitext(os.path.basename(src))[0]
        for w in WIDTHS:
            out = os.path.join(OUT_DIR, f'{stem}-{w}w.jpg')
            if not force and os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
                kept += 1
                continue
            im = Image.open(src)
            im = im.convert('RGB')
            if im.width > w:
                im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            im.save(out, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
            made += 1
    print(f'변형 {made}개 생성, {kept}개 최신 유지 → {os.path.relpath(OUT_DIR, ROOT)}/')

if __name__ == '__main__':
    build(force='--force' in sys.argv[1:])
