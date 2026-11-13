#!/usr/bin/env python3
"""Shrink the models the game downloads. Safe to run again: finished files are skipped.

  python3 tools/optimize-models.py            # every .glb under public/assets/models
  python3 tools/optimize-models.py --check    # report only, change nothing

What it does to each .glb:
  * re-encodes the PNG texture inside it as WebP (quality 90). The textures are
    painted noise, which PNG stores badly: ~300 KB each becomes ~50 KB.
  * for the terrain only, first paints out the dirt path and bare patch that were
    baked into the grass texture. The game draws its own paths (src/world/Paths.ts),
    and the baked one was repeated on every terrain tile, leading nowhere.

Geometry, animation and materials are not touched. Needs Pillow with WebP support.
The original exports are in git history (before this script was first run).
"""
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'models'
WEBP = 'EXT_texture_webp'
QUALITY = 90


def read_glb(path):
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF' and version == 2, f'{path} is not a glTF 2 binary'
    json_length, json_type = struct.unpack_from('<I4s', data, 12)
    assert json_type == b'JSON'
    doc = json.loads(data[20:20 + json_length])
    offset = 20 + json_length
    bin_length, bin_type = struct.unpack_from('<I4s', data, offset)
    assert bin_type == b'BIN\0'
    return doc, data[offset + 8:offset + 8 + bin_length]


def write_glb(path, doc, views):
    """`views` holds the bytes of every bufferView, in order; they are repacked 4-byte aligned."""
    binary = bytearray()
    for view, payload in zip(doc['bufferViews'], views):
        while len(binary) % 4:
            binary.append(0)
        view['byteOffset'] = len(binary)
        view['byteLength'] = len(payload)
        binary += payload
    while len(binary) % 4:
        binary.append(0)
    doc['buffers'] = [{'byteLength': len(binary)}]

    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    path.write_bytes(
        struct.pack('<4sII', b'glTF', 2, total)
        + struct.pack('<I4s', len(text), b'JSON') + text
        + struct.pack('<I4s', len(binary), b'BIN\0') + bytes(binary)
    )


def paint_out_baked_path(image):
    """Cover everything brown (and the dark fringe round it) with grass from elsewhere in the picture."""
    rgb = image.convert('RGB')
    r, g, _ = rgb.split()
    # Grass is green-led even where it is yellow; packed earth is red-led. The old
    # tree-base marks are only faintly red-led, but they are dark, which yellow grass is not.
    earth = ImageChops.subtract(r, g).point(lambda v: 255 if v > 12 else 0)
    faint = ImageChops.subtract(r, g, 1, 3).point(lambda v: 255 if v > 0 else 0)  # r - g > -3
    dark = g.point(lambda v: 255 if v < 135 else 0)
    lit = g.point(lambda v: 255 if v > 40 else 0)  # not the black border round the picture
    brown = ImageChops.lighter(earth, ImageChops.multiply(ImageChops.multiply(faint, dark), lit))
    # A lone stray pixel is not a mark: keep only what survives a small erosion.
    brown = brown.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    if brown.getbbox() is None:
        return image, False
    mask = brown.filter(ImageFilter.MaxFilter(41))

    width, height = rgb.size
    # The outermost pixels are a black border; never copy from there.
    border = Image.new('L', rgb.size, 255)
    border.paste(0, (16, 16, width - 16, height - 16))
    blocked = ImageChops.lighter(mask, border)

    best = None
    for dx in range(-width + 64, width, 32):
        for dy in range(-height + 64, height, 32):
            if abs(dx) + abs(dy) < 128:
                continue
            # A pixel at (x, y) is filled from (x - dx, y - dy); that source must be plain grass.
            source_blocked = ImageChops.offset(blocked, dx, dy)
            overlap = ImageChops.multiply(mask, source_blocked)
            if overlap.getbbox() is None:
                score = abs(dx) + abs(dy)
                if best is None or score < best[0]:
                    best = (score, dx, dy)
    assert best is not None, 'no clean patch of grass to copy from'
    _, dx, dy = best
    grass = ImageChops.offset(rgb, dx, dy)
    feather = mask.filter(ImageFilter.GaussianBlur(8))
    return Image.composite(grass, rgb, feather), True


def optimize(path, check):
    doc, binary = read_glb(path)
    views = [bytes(binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]) for v in doc['bufferViews']]
    changed = []

    for image_def in doc.get('images', []):
        if image_def.get('mimeType') != 'image/png' or 'bufferView' not in image_def:
            continue
        index = image_def['bufferView']
        image = Image.open(io.BytesIO(views[index]))
        image.load()
        note = ''
        if path.name == 'foundation_terrain.glb':
            image, painted = paint_out_baked_path(image)
            note = ' (baked path painted out)' if painted else ''
        encoded = io.BytesIO()
        image.save(encoded, 'WEBP', quality=QUALITY, method=6)
        changed.append(f'{len(views[index]) // 1024} KB png -> {len(encoded.getvalue()) // 1024} KB webp{note}')
        views[index] = encoded.getvalue()
        image_def['mimeType'] = 'image/webp'

    if not changed:
        return None
    # A texture that points at a WebP image has to say so through the extension.
    image_is_webp = [image_def.get('mimeType') == 'image/webp' for image_def in doc['images']]
    for texture in doc.get('textures', []):
        source = texture.get('source')
        if source is not None and image_is_webp[source]:
            del texture['source']
            texture.setdefault('extensions', {})[WEBP] = {'source': source}
    for key in ('extensionsUsed', 'extensionsRequired'):
        if WEBP not in doc.setdefault(key, []):
            doc[key].append(WEBP)

    before = path.stat().st_size
    if not check:
        write_glb(path, doc, views)
    after = path.stat().st_size
    return before, after, changed


def main():
    check = '--check' in sys.argv
    total_before = total_after = 0
    for path in sorted(ROOT.rglob('*.glb')):
        result = optimize(path, check)
        size = path.stat().st_size
        if result is None:
            total_before += size
            total_after += size
            continue
        before, after, changed = result
        total_before += before
        total_after += after
        print(f'{path.relative_to(ROOT)}: {before // 1024} KB -> {after // 1024} KB; ' + '; '.join(changed))
    print(f'total {total_before // 1024} KB -> {total_after // 1024} KB' + (' (check only)' if check else ''))


if __name__ == '__main__':
    main()
