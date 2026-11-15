# Written by Ky with help from Claude (SI). See AI_USE.md.
"""Turn photographs of the places into small pixel art for the story cards (docs/art/places/<place id>.png).

Usage: python tools/make_pixel_art.py <folder with the source photos> [--only place-id ...]
Each photo is cropped to 16:9 around a chosen point, shrunk to 216 x 122 pixels, given a little more colour and
contrast, and reduced to a 32-colour palette with an ordered (Bayer) dither, which is what gives the pixel-art look.
The page shows the result at 2x (432 x 244), the same pixel size as the rest of the scene.
Needs Pillow and NumPy. Every photo used is credited in CREDITS.md.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

W, H = 216, 122
COLOURS = 32
OUT = Path(__file__).resolve().parent.parent / "docs" / "art" / "places"

# place id: (photo file, crop centre x, crop centre y as fractions of the photo, zoom: 1 = the widest 16:9 crop, less = closer)
JOBS = {
    "dhaka": ("dhaka.jpg", 0.5, 0.5, 1.0),
    "sylhet": ("sylhet.jpg", 0.5, 0.55, 1.0),
    "tonle-sap": ("tonle-sap.jpg", 0.5, 0.5, 1.0),
    "hue": ("hue.jpg", 0.5, 0.5, 1.0),
    "amazon": ("amazon.jpg", 0.5, 0.5, 1.0),
    "alice-springs": ("alice-springs.jpg", 0.5, 0.2, 1.0),   # top of the gorge only (small walkers at the bottom are cropped out)
    "tromso": ("tromso.jpg", 0.215, 0.6, 0.43),               # the snowy mountain and the fjord (the hut is cropped out)
}

# optional colour tweaks (brightness, red gain, blue gain) for photos that came out dark or too cool
TWEAK = {"hue": (1.18, 1.0, 1.0)}

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32)


def crop_16_9(im: Image.Image, fx: float, fy: float, zoom: float = 1.0) -> Image.Image:
    w, h = im.size
    cw, ch = (w, round(w * H / W)) if w * H / W <= h else (round(h * W / H), h)
    cw, ch = round(cw * zoom), round(ch * zoom)
    x0 = min(max(round(fx * w - cw / 2), 0), w - cw)
    y0 = min(max(round(fy * h - ch / 2), 0), h - ch)
    return im.crop((x0, y0, x0 + cw, y0 + ch))


def pixelate(path: Path, fx: float, fy: float, zoom: float = 1.0, tweak=(1.0, 1.0, 1.0)) -> Image.Image:
    im = Image.open(path).convert("RGB")
    im = crop_16_9(im, fx, fy, zoom)
    im = im.resize((W, H), Image.Resampling.LANCZOS)
    if tweak != (1.0, 1.0, 1.0):
        a = np.asarray(im, dtype=np.float32) * np.array([tweak[0] * tweak[1], tweak[0], tweak[0] * tweak[2]], dtype=np.float32)
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    im = ImageEnhance.Color(im).enhance(1.25)
    im = ImageEnhance.Contrast(im).enhance(1.12)
    palette = im.quantize(colors=COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    arr = np.asarray(im, dtype=np.float32)
    tile = np.tile(BAYER4, (H // 4 + 1, W // 4 + 1))[:H, :W, None]
    arr = np.clip(arr + (tile - 7.5) * 2.0, 0, 255).astype(np.uint8)   # ordered dither before choosing the palette colour
    return Image.fromarray(arr).quantize(palette=palette, dither=Image.Dither.NONE)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path)
    ap.add_argument("--only", nargs="*", help="place ids to build (default: all that have a photo)")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for place, (name, fx, fy, zoom) in JOBS.items():
        if args.only and place not in args.only:
            continue
        src = args.folder / name
        if not src.exists():
            print(f"{place}: no photo {name}, skipped")
            continue
        out = OUT / f"{place}.png"
        pixelate(src, fx, fy, zoom, TWEAK.get(place, (1.0, 1.0, 1.0))).save(out, optimize=True)
        print(f"{place}: {name} -> {out.name} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
