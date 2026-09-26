#!/usr/bin/env python3
"""build-design-og-images.py — 대표 시안 WebP 사진의 공유 카드용 JPEG 사본을 굽는다

왜: designs/*.html 8장 중 7장의 og:image 가 WebP 였다. 카카오톡·네이버 같은 공유
미리보기가 WebP 를 그려 준다는 보장이 없어(스크래퍼마다 다르다), 링크를 보내도 그림
없는 카드가 뜰 수 있다. 화면에 보이는 사진(dp-photo)은 WebP 그대로 두고, 공유 카드에만
같은 그림을 JPEG 로 구운 사본을 쓴다.

하는 일: prerender-designs.py 가 고르는 공간별 대표 시안 중 사진이 .webp 인 것마다
assets/designs/og/<이름>.jpg 를 만든다. 긴 변 1200px(원본이 작으면 그대로 — 뻥튀기 금지),
비율은 원본 그대로(자르지 않는다), JPEG 품질 82, 메타데이터 없음(Pillow 기본).
그림을 바꾸거나 지어내지 않는다 — 크기와 형식만 바꾼다.

Pillow 가 필요해 CI 에서는 돌리지 않는다. 대표 시안이 바뀌면 이것을 먼저 돌리고
python3 scripts/prerender-designs.py 를 돌린다(없으면 생성기가 회사 공유 카드로 물러선다).
검사: scripts/ensure-og-image-dims.mjs (선언 치수 == 실제 치수, 공유 카드는 JPEG·PNG)

사용: python3 scripts/build-design-og-images.py [--force]
"""
import importlib.util
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LONG_EDGE = 1200
QUALITY = 82

_spec = importlib.util.spec_from_file_location('manmool_prerender_designs', os.path.join(ROOT, 'scripts', 'prerender-designs.py'))
DESIGNS = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(DESIGNS)


def build(force=False):
    made = kept = 0
    for _space, design in DESIGNS.featured_designs(DESIGNS.load_portfolio()):
        photo = (design.get('photo') or '').split('?')[0]
        if not photo.lower().endswith('.webp'):
            continue
        source = os.path.join(ROOT, *photo.split('/'))
        target_rel = DESIGNS.og_fallback_path(photo)
        target = os.path.join(ROOT, *target_rel.split('/'))
        if not force and os.path.exists(target) and os.path.getmtime(target) >= os.path.getmtime(source):
            kept += 1
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        image = Image.open(source).convert('RGB')
        scale = min(1.0, LONG_EDGE / max(image.size))
        if scale < 1.0:
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        image.save(target, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        made += 1
        print('생성:', target_rel, f'{image.width}x{image.height}')
    print(f'공유 카드 JPEG {made}장 생성, {kept}장 최신 유지 → assets/designs/og/')


if __name__ == '__main__':
    build(force='--force' in sys.argv[1:])
