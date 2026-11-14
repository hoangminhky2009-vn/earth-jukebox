# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Register cached NASA land/ocean boundaries against independent world geometry.

Run after the full light export: python -m pipeline.verify_geography
This tests geographic placement, not physical rainfall or vegetation accuracy.
"""
import hashlib
import json
from datetime import datetime, timezone

import numpy as np
from PIL import Image, ImageDraw
import requests

from .fetch import ROOT, CACHE, HEADERS
from .reader import FRAME_WEST_LONGITUDE

REFERENCE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson'
REFERENCE_SHA256 = '9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9'


def register(source, dataset, features):
    with Image.open(source) as image:
        pixels = np.array(image.convert('RGB'))
    height, width = pixels.shape[:2]
    mask = Image.new('L', (width, height))
    draw = ImageDraw.Draw(mask)
    for feature in features:
        geom = feature['geometry']
        polygons = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
        for polygon in polygons:
            for ring_index, ring in enumerate(polygon):
                points = [((lon+180)/360*width, (90-lat)/180*height) for lon,lat in ring]
                draw.polygon(points, fill=1 if ring_index == 0 else 0)
    # Avoid polar ice and the NDVI date panel; sample every fourth latitude row.
    reference = np.array(mask, dtype=float)[height//6:5*height//6:4]
    sample = pixels[height//6:5*height//6:4].astype(int)
    if dataset == 'rain':
        # Only neutral basemap pixels: coloured anomalies cannot locate coasts.
        valid = (sample.max(axis=2)-sample.min(axis=2)) <= 1
        land = sample[:,:,0] > 10
    else:
        valid = np.ones(sample.shape[:2], dtype=bool)
        land = np.any(sample != [8,123,176], axis=2)
    # Evaluate every possible horizontal shift, independently of our reader.
    spectrum = np.fft.rfft(valid*(1-2*land), axis=1) * np.conj(np.fft.rfft(reference, axis=1))
    cost = np.fft.irfft(spectrum.sum(axis=0), n=width)
    best = int(np.argmin(cost))
    expected = int(round((-180-FRAME_WEST_LONGITUDE[dataset])/360*width)) % width
    distance = min((best-expected) % width, (expected-best) % width)
    match = float(np.mean(((np.roll(reference,best,axis=1)>0) == land)[valid]))
    if distance > 2 or match < .94:
        raise ValueError(f'{source.name}: geography check failed ({best=}, {expected=}, {match=})')
    result = {'dataset':dataset, 'source_file':source.name,
              'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'size':[width,height], 'best_reference_roll_pixels':best,
              'inferred_west_lon':round((-180-best*360/width+180)%360-180,6),
              'configured_west_lon':FRAME_WEST_LONGITUDE[dataset],
              'land_ocean_agreement_pct':round(100*match,4),
              'valid_comparison_pixels':int(valid.sum())}
    if dataset == 'rain':
        alpha_path = CACHE/'frames/rain/full'/source.name.replace('composite','alpha')
        with Image.open(alpha_path) as image:
            alpha = np.array(image)
        opaque = alpha[:,:,3] == 255
        agreement = float(np.mean(np.all(pixels[opaque] == alpha[opaque,:3], axis=1)))
        if agreement < .999:
            raise ValueError('Rain alpha data and its composite are not pixel-aligned')
        result.update(alpha_sha256=hashlib.sha256(alpha_path.read_bytes()).hexdigest(),
                      opaque_alpha_composite_agreement_pct=round(100*agreement,4))
    return result


def main():
    reference_path = CACHE/'ne_110m_land.geojson'
    if not reference_path.exists():
        response = requests.get(REFERENCE_URL, headers=HEADERS, timeout=60)
        response.raise_for_status()
        reference_path.write_bytes(response.content)
    if hashlib.sha256(reference_path.read_bytes()).hexdigest() != REFERENCE_SHA256:
        raise ValueError('Reference geometry changed; inspect before updating the pinned hash')
    features = json.loads(reference_path.read_text(encoding='utf-8'))['features']
    checks = []
    for year in [2025,2026]:
        checks.append(register(CACHE/f'previews/imergvar_composite.{year}.07.15.png','rain',features))
    for year in [2024,2025]:
        checks.append(register(CACHE/f'frames/ndvi/light/SNPP_VIIRS.{year}0715.ndvi_w_snow.oceanblue.annotated.png','ndvi',features))
    evidence = {'made_with':'Written by Sabik with help from OpenAI Codex (SI).',
                'checked_at':datetime.now(timezone.utc).isoformat(),
                'reference':{'url':REFERENCE_URL,'sha256':REFERENCE_SHA256,
                             'licence':'Natural Earth public domain; https://www.naturalearthdata.com/about/terms-of-use/'},
                'method':'Rasterize independently georeferenced Natural Earth land polygons on a standard -180..180 grid. Search all horizontal circular shifts against uncoloured rain basemap or NDVI land/ocean pixels between 60 S and 60 N, every fourth image row.',
                'checks':checks,
                'limitations':['Coarse 110m coastlines, lakes, snow and raster edges cause some disagreement.',
                               'Checks four dated frames, not every archive image.',
                               'Geographic placement check only; not independent physical-data validation.'],
                'correction':'Earlier exports used -180 for rain and sampled the wrong longitude. SVS 4897 requires west_lon=20. SVS 5544 keeps west_lon=-180. All eight rain discs and crops were regenerated.'}
    target = ROOT/'pipeline/evidence/geography-check.json'
    target.write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    for check in checks:
        print(check['source_file'],check['inferred_west_lon'],check['land_ocean_agreement_pct'])


if __name__ == '__main__':
    main()
