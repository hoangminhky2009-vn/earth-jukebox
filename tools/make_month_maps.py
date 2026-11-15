# Written by Ky with help from Claude (SI). See AI_USE.md.
"""Small monthly maps for the "map screen" (the tray turns into it while a disc plays): for every disc and month,
the real NASA image of that month, cut around the place, so the visitor sees what the music is reading.

Sources (the same NASA images the data is read from; nothing is drawn or changed except the crop and fewer colours):
  rain  NASA SVS 4897 composite frames (IMERG rain anomaly over the land and sea), 3600 x 1800, the frame nearest the 15th
  ndvi  NASA SVS 5544 frames (VIIRS NDVI), 4096 x 2048, the frame nearest the 15th
  snow  NASA GIBS MODIS Terra monthly snow cover, with coastlines (as in pipeline/snow.py)
Each map covers 32.4 x 16.8 degrees around the place, 216 x 112 pixels, 64 colours, written to
docs/data/maps/<disc id>-<MM>.png, plus docs/data/maps/index.json (which months exist, and each image's date and URL).

Usage: python tools/make_month_maps.py        (frames are cached in pipeline/cache/maps/, about 200 MB on first run)
"""
import io
import json
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'docs' / 'data' / 'discs.json'
OUT = ROOT / 'docs' / 'data' / 'maps'
CACHE = ROOT / 'pipeline' / 'cache' / 'maps'
HEADERS = {'User-Agent': 'EarthJukebox-SpaceApps2026/1.0 (NASA SVS image sonification)'}
W, H = 216, 112                     # output pixels
SPAN_LON, SPAN_LAT = 32.4, 16.8     # degrees covered (wide enough to see the region around the place)
SOURCES = {
    'rain': {'folder': 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004897/frames/3600x1800_2x1_15p/flatcomposite/',
             'pattern': r'(\d{4})\.(\d{2})\.(\d{2})\.png$', 'west': 20.0, 'credit': 'NASA SVS 4897'},
    'ndvi': {'folder': 'https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005544/frames/4096x2048_2x1_30p/equirectangular_w_dates/',
             'pattern': r'SNPP_VIIRS\.(\d{4})(\d{2})(\d{2})\.', 'west': -180.0, 'credit': 'NASA SVS 5544'},
}
GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'


def get(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        for wait in (0, 5, 20):
            time.sleep(wait)
            try:
                r = requests.get(url, headers=HEADERS, timeout=180); r.raise_for_status()
                path.write_bytes(r.content); break
            except requests.RequestException:
                if wait == 20:
                    raise
    return path


def listing(ds):
    src = SOURCES[ds]
    html = get(src['folder'], CACHE / f'listing-{ds}.html').read_text(encoding='utf-8', errors='ignore')
    out = {}
    for name in re.findall(r'href=["\']([^"\']+\.png)["\']', html, re.I):
        m = re.search(src['pattern'], name.rsplit('/', 1)[-1])
        if m:
            try:
                out[date(*map(int, m.groups()))] = name.rsplit('/', 1)[-1]
            except ValueError:
                pass
    return out


def nearest_15th(avail, year, month):
    days = [d for d in avail if d.year == year and d.month == month]
    return min(days, key=lambda d: abs(d.day - 15)) if days else None


def cut(img, lon, lat, west):
    """Cut SPAN_LON x SPAN_LAT degrees around (lon, lat) from a plain 2:1 world image whose left edge is `west`."""
    a = np.asarray(img.convert('RGB')); h, w = a.shape[:2]
    px = w / 360; cx = ((lon - west) % 360) * px; cy = (90 - lat) * px
    hw, hh = SPAN_LON / 2 * px, SPAN_LAT / 2 * px
    xs = np.arange(int(round(cx - hw)), int(round(cx + hw))) % w
    ys = np.clip(np.arange(int(round(cy - hh)), int(round(cy + hh))), 0, h - 1)
    return Image.fromarray(a[np.ix_(ys, xs)]).resize((W, H), Image.Resampling.LANCZOS)


def save(im, path):
    im.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)


def main():
    data = json.loads(DATA.read_text(encoding='utf-8'))
    places = {p['id']: p for p in data['places']}
    OUT.mkdir(parents=True, exist_ok=True)
    index = {}
    lists = {ds: listing(ds) for ds in SOURCES}
    # which world frames are needed (one per dataset and month), then fetch them in parallel
    need = {}
    for d in data['discs']:
        if d['dataset'] not in SOURCES:
            continue
        for m in range(12):
            if d['levels'][m] is None:
                continue
            day = nearest_15th(lists[d['dataset']], d['year'], m + 1)
            if day:
                need[(d['dataset'], day)] = lists[d['dataset']][day]
    print(f'{len(need)} NASA frames needed', flush=True)
    def fetch(item):
        (ds, day), name = item
        return item[0], get(SOURCES[ds]['folder'] + name, CACHE / ds / name)
    with ThreadPoolExecutor(4) as pool:
        frames = dict(pool.map(fetch, need.items()))
    print('frames ready', flush=True)
    for d in data['discs']:
        p = places[d['place']]; entry = {}
        for m in range(12):
            if d['levels'][m] is None:
                continue
            name = f"{d['id']}-{m + 1:02d}.png"
            if d['dataset'] in SOURCES:
                day = nearest_15th(lists[d['dataset']], d['year'], m + 1)
                if not day:
                    continue
                with Image.open(frames[(d['dataset'], day)]) as img:
                    save(cut(img, p['lon'], p['lat'], SOURCES[d['dataset']]['west']), OUT / name)
                entry[m] = {'file': f'data/maps/{name}', 'date': day.isoformat(), 'source': SOURCES[d['dataset']]['credit'],
                            'url': SOURCES[d['dataset']]['folder'] + lists[d['dataset']][day]}
            elif d['dataset'] == 'snow':
                box = (p['lat'] - SPAN_LAT / 2, p['lon'] - SPAN_LON / 2, p['lat'] + SPAN_LAT / 2, p['lon'] + SPAN_LON / 2)
                def wms(layer, t=None):
                    q = {'SERVICE': 'WMS', 'VERSION': '1.3.0', 'REQUEST': 'GetMap', 'LAYERS': layer, 'CRS': 'EPSG:4326',
                         'BBOX': ','.join(f'{v:.2f}' for v in box), 'WIDTH': W, 'HEIGHT': H, 'FORMAT': 'image/png', 'TRANSPARENT': 'TRUE'}
                    if t:
                        q['TIME'] = t
                    return GIBS + '?' + urllib.parse.urlencode(q)
                t = f"{d['year']}-{m + 1:02d}-01"
                snow = Image.open(get(wms('MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct', t), CACHE / 'snow' / f"{d['place']}-{t}.png")).convert('RGBA')
                coast = Image.open(get(wms('Coastlines_15m'), CACHE / 'snow' / f"{d['place']}-coast.png")).convert('RGBA')
                base = Image.new('RGBA', (W, H), (26, 34, 48, 255)); base.alpha_composite(snow); base.alpha_composite(coast)
                save(base.convert('RGB'), OUT / name)
                entry[m] = {'file': f'data/maps/{name}', 'date': t[:7], 'source': 'NASA MODIS Terra (GIBS)',
                            'url': wms('MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct', t)}
        index[d['id']] = entry
        print(d['id'], len(entry), flush=True)
    (OUT / 'index.json').write_text(json.dumps({'note': 'Monthly NASA images cut around each place for the map screen (tools/make_month_maps.py). '
                                                'Same sources as the data; only cropped and reduced to 64 colours.',
                                                'span_deg': [SPAN_LON, SPAN_LAT], 'size_px': [W, H], 'discs': index}, indent=1) + '\n', encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
