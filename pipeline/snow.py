# Written by Ky with help from Claude (SI). See AI_USE.md.
"""Snow cover discs for the snow place (Tromso), read from NASA's monthly MODIS Terra snow cover map.

Source: NASA GIBS layer MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct (product MOD10CM, 0.05 degree grid), the same
map NASA Worldview shows. Like the rain and greenness discs, the numbers are read back from the colours: the layer's
GIBS colour map gives every whole percent (1-100) its own colour, so each pixel decodes exactly.

Method, per month:
  1. Get the map for a small box around the place at the layer's own grid (0.05 degree, 20 x 10 pixels).
  2. Decode each pixel's colour to percent snow. A transparent pixel is "no snow or no data".
  3. Land pixels = pixels that show a colour in at least one month (the sea never does).
  4. Value = mean percent over the land pixels / 100 (transparent land pixels count as 0).
     A month where no pixel shows a colour has no data: the sun does not rise in December and January at 69.7 N,
     so MODIS sees nothing; later months of 2026 are not published yet.
  5. Level = quarter of the value (1: under 25 % of the land under snow ... 4: 75 % or more), like greenness.
Limits: a land pixel that is transparent in an observed month (cloud all month) counts as snow-free.

Usage: python -m pipeline.snow            (writes docs/data/discs.json, docs/data/frames/, pipeline/evidence/snow.json)
"""
import hashlib
import io
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

from .months import ndvi_level
from .validate import write_validated

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'docs' / 'data' / 'discs.json'
FRAMES = ROOT / 'docs' / 'data' / 'frames'
EVIDENCE = ROOT / 'pipeline' / 'evidence' / 'snow.json'
CACHE = ROOT / 'pipeline' / 'cache' / 'snow'

LAYER = 'MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct'
WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
COLORMAP = 'https://gibs.earthdata.nasa.gov/colormaps/v1.0/MODIS_NDSI_Snow_Cover.xml'
PRODUCT_URL = 'https://www.earthdata.nasa.gov/data/catalog/nsidc-cprd-mod10cm-61'
WORLDVIEW = 'https://worldview.earthdata.nasa.gov/?l=' + LAYER
PLACE = 'tromso'
BOX = (69.45, 18.5, 69.95, 19.5)          # south, west, north, east (degrees); on the 0.05 degree grid
GRID = (20, 10)                           # width, height in pixels = the layer's own resolution
YEARS = {2025: 'A', 2026: 'B'}
UA = {'User-Agent': 'EarthJukebox-hackathon/1.0 (educational project)'}

LEVELS = [{'level': 1, 'min': 0.0, 'max': 0.25, 'label': 'under 25% snow'},
          {'level': 2, 'min': 0.25, 'max': 0.5, 'label': '25-50% snow'},
          {'level': 3, 'min': 0.5, 'max': 0.75, 'label': '50-75% snow'},
          {'level': 4, 'min': 0.75, 'max': 1.0, 'label': '75-100% snow'}]


def dataset_metadata():
    return {'label': 'Snow cover: share of the land under snow',
            'unit': 'share of land pixels under snow in the monthly MODIS Terra map (0 = none, 1 = all)',
            'source_name': 'NASA MODIS Terra snow cover (GIBS)', 'source_url': WORLDVIEW,
            'gibs_layer': LAYER, 'product_url': PRODUCT_URL, 'levels': LEVELS}


def fetch(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        for wait in (0, 5, 20):
            time.sleep(wait)
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                    path.write_bytes(r.read())
                break
            except OSError:
                if wait == 20:
                    raise
    return path.read_bytes()


def colour_map():
    xml = fetch(COLORMAP, 'colormap.xml').decode('utf-8')
    table = {}
    for rgb, transparent, value in re.findall(r'<ColorMapEntry rgb="([^"]+)" transparent="([^"]+)" value="\[([^\]]+)\]"', xml):
        if transparent == 'false':
            table[tuple(int(v) for v in rgb.split(','))] = int(value)
    if sorted(table.values()) != list(range(1, 101)):
        raise ValueError('Unexpected snow colour map: expected one colour for each percent 1..100')
    return table


def wms_url(date, box=BOX, size=GRID, layer=LAYER):
    south, west, north, east = box
    q = {'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetMap', 'LAYERS': layer, 'CRS': 'EPSG:4326',
         'BBOX': f'{south},{west},{north},{east}', 'WIDTH': size[0], 'HEIGHT': size[1], 'FORMAT': 'image/png',
         'TRANSPARENT': 'TRUE'}
    if date:
        q['TIME'] = date
    return WMS + '?' + urllib.parse.urlencode(q)


def decode(png, table):
    """Percent snow per pixel (None = transparent) and how many coloured pixels the colour map did not know."""
    a = np.asarray(Image.open(io.BytesIO(png)).convert('RGBA'))
    out = np.full(a.shape[:2], -1, dtype=int); unknown = 0
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            r, g, b, al = (int(v) for v in a[y, x])
            if al == 0:
                continue
            v = table.get((r, g, b))
            if v is None:
                unknown += 1
            else:
                out[y, x] = v
    return out, unknown


def month_values(grids):
    """Monthly values from the decoded grids of every month (keys 'YYYY-MM'). Returns {key: (value or None, info)}."""
    land = np.zeros_like(next(iter(grids.values())), dtype=bool)
    for g in grids.values():
        land |= g >= 0
    n_land = int(land.sum())
    out = {}
    for key, g in grids.items():
        seen = int((g >= 0).sum())
        if seen == 0 or n_land == 0:
            out[key] = (None, {'land_pixels': n_land, 'coloured_pixels': 0})
            continue
        pct = np.where(g[land] >= 0, g[land], 0)
        out[key] = (round(float(pct.mean()) / 100, 2), {'land_pixels': n_land, 'coloured_pixels': seen})
    return out


def make_frame(year, table):
    """A picture of northern Norway's snow in March of the year (the Details dialog shows it), 256 x 256."""
    box = (65.7, 15.0, 73.7, 23.0)
    snow = Image.open(io.BytesIO(fetch(wms_url(f'{year}-03-01', box, (256, 256)), f'frame-{year}-03.png'))).convert('RGBA')
    coast = Image.open(io.BytesIO(fetch(wms_url(None, box, (256, 256), 'Coastlines_15m'), 'frame-coast.png'))).convert('RGBA')
    base = Image.new('RGBA', (256, 256), (26, 34, 48, 255))
    base.alpha_composite(snow); base.alpha_composite(coast)
    # Tromso: a small marker
    y = round((box[2] - 69.7) / (box[2] - box[0]) * 256); x = round((19.0 - box[1]) / (box[3] - box[1]) * 256)
    for dx in range(-3, 4):
        for px, py in ((x + dx, y), (x, y + dx)):
            if 0 <= px < 256 and 0 <= py < 256:
                base.putpixel((px, py), (232, 131, 74, 255))
    FRAMES.mkdir(parents=True, exist_ok=True)
    base.convert('RGB').save(FRAMES / f'{PLACE}-snow-{year}.png', optimize=True)


def build():
    table = colour_map()
    grids, hashes, unknown = {}, {}, {}
    for year in YEARS:
        for m in range(1, 13):
            key = f'{year}-{m:02d}'
            png = fetch(wms_url(f'{key}-01'), f'{key}.png')
            grids[key], unknown[key] = decode(png, table)
            hashes[key] = hashlib.sha256(png).hexdigest()
    values = month_values(grids)
    coloured = sum(int((g >= 0).sum()) for g in grids.values()); bad = sum(unknown.values())
    match = round(100 * (coloured) / (coloured + bad), 2) if coloured + bad else 0
    discs = []
    for year, side in YEARS.items():
        vals = [values[f'{year}-{m:02d}'][0] for m in range(1, 13)]
        levels = [None if v is None else ndvi_level(v) for v in vals]
        ident = f'{PLACE}-snow-{year}'
        discs.append({'id': ident, 'place': PLACE, 'dataset': 'snow', 'year': year, 'side': side,
                      'levels': levels, 'values': vals,
                      'saturated': [False if v is None else (v <= .02 or v >= .98) for v in vals],
                      'frames_used': [0 if v is None else 1 for v in vals],
                      'match_pct': match, 'median_de': 0,
                      'condition': 'scratched' if None in levels else 'mint', 'breaks': [],
                      'frame': f'data/frames/{ident}.png',
                      'source': {'gibs_layer': LAYER, 'wms': WMS, 'colormap': COLORMAP, 'product_url': PRODUCT_URL,
                                 'box_south_west_north_east': list(BOX), 'grid': list(GRID), 'time': 'first day of each month (monthly map)'},
                      'description': '', 'check': None})
        make_frame(year, table)
    data = json.loads(DATA.read_text(encoding='utf-8'))
    keep = [d for d in data['discs'] if d['id'] not in {x['id'] for x in discs}]
    data['discs'] = keep + discs
    data['datasets']['snow'] = dataset_metadata()
    data['generated'] = datetime.now(timezone.utc).isoformat()
    write_validated(data, DATA)
    EVIDENCE.write_text(json.dumps({'layer': LAYER, 'colormap': COLORMAP, 'box': BOX, 'grid': GRID,
                                    'months': {k: {'value': v, **info, 'unknown_colours': unknown[k], 'sha256': hashes[k]}
                                               for k, (v, info) in values.items()}}, indent=1) + '\n', encoding='utf-8')
    return discs


if __name__ == '__main__':
    for d in build():
        print(d['id'], d['levels'], d['values'])
