# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Read NASA image colours, retain evidence, and export the shared disc format."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urljoin

import numpy as np
from PIL import Image
import requests

from .bars import RAIN_LEVELS, image_array, sample_ndvi_bar
from .fetch import ROOT, CACHE, HEADERS, RAIN_COMPOSITE, NDVI_BAR, fetch_year, download
from .months import monthly_value
from .reader import read_frame, coordinates_to_pixel
from .validate import write_validated


def assert_light_window_clear(lat, lon, width, height):
    if (width,height) != (4096,2048):
        raise ValueError('Unexpected light-frame dimensions; inspect the date-label layout again')
    x,y = coordinates_to_pixel(lon,lat,width,height)
    xs = np.arange(x-2,x+3) % width
    if np.any(xs < 700) and y+2 >= 1840:
        raise ValueError('Sampling window overlaps the NDVI date label; use the full-resolution fallback')


def build_discs(manifest, places, *, ndvi_bar=None):
    """Decode a frame once for all places. Network errors stop the export."""
    dataset, year = manifest['dataset'], manifest['year']
    results = {p['id']: {} for p in places}
    for day, record in sorted(manifest['frames'].items()):
        status = record['status']
        if status == 'download_failed':
            raise ValueError(f'Download failed for {day}; retry before exporting')
        if status == 'ok':
            path = Path(record['path'])
            if record.get('sha256') and hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
                raise ValueError(f'Cached frame changed: {path}; fetch again')
            image = image_array(path)
        elif status not in ('future','not_yet_published','outside_archive','archive_gap'):
            raise ValueError(f'Unexpected frame status {status} for {day}')
        for place in places:
            entry = {k:v for k,v in record.items() if k not in ('path','cached')}
            if status == 'ok':
                if dataset == 'ndvi' and manifest.get('variant') == 'light':
                    assert_light_window_clear(place['lat'],place['lon'],image.shape[1],image.shape[0])
                entry['reading'] = read_frame(image, dataset, place['lat'], place['lon'], ndvi_bar=ndvi_bar)
            results[place['id']][day] = entry
    discs, evidence = [], {}
    for place in places:
        readings = results[place['id']]
        months = []
        breaks = []
        minimum = 1 if dataset == 'ndvi' and manifest['sample_days'] == [15] else None
        for month in range(1,13):
            rows = [r for d,r in readings.items() if int(d[5:7]) == month]
            months.append(monthly_value([r.get('reading') for r in rows], dataset, required_frames=minimum))
            if any(r['status'] == 'archive_gap' for r in rows):
                breaks.append(month)
        valid = [r['reading'] for r in readings.values() if 'reading' in r]
        sampled = sum(r['sampled_pixels'] for r in valid)
        matched = sum(r['matched_pixels'] for r in valid)
        deltas = [d for r in valid for d in r['matched_deltas']]
        quality = {'sampled_pixels':sampled,'matched_pixels':matched,
                   'opaque_matched_pixels':len(deltas),
                   'transparent_pixels':sum(r['transparent_pixels'] for r in valid),
                   'match_pct':round(100*matched/sampled,2) if sampled else 0,
                   'median_de':round(float(np.median(deltas)),4) if deltas else 0,
                   'median_de_note':'Transparent rain pixels count as classified, but have no colour distance. If there are no opaque matched pixels, the required numeric median_de field uses 0; it is not a measured distance.'}
        ident = f'{place["id"]}-{dataset}-{year}'
        svs = '4897' if dataset == 'rain' else '5544'
        levels = [m['level'] for m in months]
        discs.append({'id':ident,'place':place['id'],'dataset':dataset,'year':year,
                      'side':'A' if year == (2025 if dataset == 'rain' else 2024) else 'B',
                      'levels':levels,'values':[m['value'] for m in months],
                      'saturated':[m['saturated'] for m in months],
                      'frames_used':[m['frames_used'] for m in months],
                      'match_pct':quality['match_pct'],'median_de':quality['median_de'],
                      'condition':'skips' if breaks else 'scratched' if None in levels else 'mint',
                      'breaks':breaks,'frame':f'data/frames/{ident}.png',
                      'source':{'svs':svs,'svs_url':f'https://svs.gsfc.nasa.gov/{svs}',
                                'frames':manifest['folder'],'sample_days':manifest['sample_days']},
                      'description':'','check':None})
        # The readable evidence omits every individual colour distance; totals and
        # medians remain available, and source hashes allow exact reproduction.
        for entry in readings.values():
            if 'reading' in entry:
                entry['reading'].pop('matched_deltas', None)
        evidence[place['id']] = {'quality':quality,'months':months,'frames':readings}
    return discs, evidence


def dataset_metadata():
    return {
        'rain':{'label':'Rain: wetter or drier than normal',
                'unit':'mm/day compared with normal, smoothed over ~3 months',
                'svs':'4897','svs_url':'https://svs.gsfc.nasa.gov/4897','levels':RAIN_LEVELS},
        'ndvi':{'label':'Vegetation greenness: low to high',
                'unit':"position on the image's colour scale (0 = low, 1 = high); the scale has no NDVI numbers",
                'svs':'5544','svs_url':'https://svs.gsfc.nasa.gov/5544',
                'levels':[{'level':i+1,'min':i/4,'max':(i+1)/4,'label':label} for i,label in enumerate([
                    'low greenness','low to medium greenness','medium to high greenness','high greenness'])]}}


def merge_export(existing, places, discs):
    if existing.get('fake'):
        raise ValueError('Refusing to merge fake sample data into real output')
    place_map = {p['id']:p for p in existing.get('places',[])}
    disc_map = {d['id']:d for d in existing.get('discs',[])}
    for place in places:
        prior = place_map.get(place['id'], {})
        place_map[place['id']] = {**prior, **place,
                                  'story':place.get('story') or prior.get('story','')}
    for disc in discs:
        # Preserve Bormey's text and a separately supplied independent check.
        prior = disc_map.get(disc['id'], {})
        disc = {**disc,'description':prior.get('description',disc['description']),
                'check':prior.get('check',disc['check'])}
        disc_map[disc['id']] = disc
    return {**existing,'version':1,'generated':datetime.now(timezone.utc).isoformat(),
            'provenance':{'source':'Colours read from NASA SVS frames (Earth Information Center). Rain values are colour-bin representatives, not exact measurements; NDVI values are colourbar positions, not measured NDVI.',
                          'made_with':'Python pipeline written by Sabik with help from OpenAI Codex (SI); see pipeline/HANDOFF.md and AI_USE.md'},
            'datasets':dataset_metadata(),'places':list(place_map.values()),'discs':list(disc_map.values())}


def merge_evidence(existing, new_places):
    return {**existing.get('places',{}), **new_places}


def make_crop(manifest, place, disc):
    candidates = sorted(d for d,r in manifest['frames'].items() if r['status'] == 'ok')
    if not candidates:
        raise ValueError(f'No source image available for {disc["id"]}')
    preferred = f'{disc["year"]}-07-15'
    day = preferred if preferred in candidates else candidates[0]
    record = manifest['frames'][day]
    if disc['dataset'] == 'rain':
        # Composite URLs are resolved from the real directory listing, not guessed.
        listing = CACHE / 'listings' / 'rain-composite.html'
        if not listing.exists():
            response = requests.get(RAIN_COMPOSITE,headers=HEADERS,timeout=120)
            response.raise_for_status()
            listing.parent.mkdir(parents=True,exist_ok=True)
            listing.write_text(response.text,encoding='utf-8')
        names = re.findall(r'href=[\"\']([^\"\']+\.png)[\"\']',listing.read_text(encoding='utf-8'))
        matches = [n for n in names if day.replace('-','.') in n]
        if len(matches) != 1:
            raise ValueError(f'Expected exactly one composite for {day}, found {len(matches)}')
        record = download(urljoin(RAIN_COMPOSITE,matches[0]),CACHE/'previews'/Path(matches[0]).name)
    with Image.open(record['path']) as source:
        source = source.convert('RGB')
        if source.width != 2*source.height:
            raise ValueError('Crop requires a plain 2:1 equirectangular source')
        x,y = coordinates_to_pixel(place['lon'],place['lat'],source.width,source.height)
        pixels = np.asarray(source)
        xs = np.arange(x-128,x+128) % source.width
        ys = np.clip(np.arange(y-128,y+128),0,source.height-1)
        crop = Image.fromarray(pixels[np.ix_(ys,xs)])
        destination = ROOT/'docs'/disc['frame']
        destination.parent.mkdir(parents=True,exist_ok=True)
        crop.save(destination)
    return {'date':day,'source_url':record['url'],'source_sha256':record.get('sha256'),
            'output':disc['frame'],'size':[256,256],'centre_pixel':[x,y],
            'note':'A single dated regional image, not a picture of the annual aggregate.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--place',default='dhaka')
    parser.add_argument('--dataset',choices=['rain','ndvi'],default='rain')
    parser.add_argument('--year',type=int,default=2025)
    parser.add_argument('--all',action='store_true',help='All configured places, both datasets and year pairs')
    parser.add_argument('--variant',choices=['full','light'],default='full')
    parser.add_argument('--day15',action='store_true',help='Use the documented full-resolution NDVI day-15 fallback')
    parser.add_argument('--refresh',action='store_true',help='Refresh NASA listings and retry downloads')
    args = parser.parse_args()
    places = json.loads((ROOT/'pipeline/places.json').read_text(encoding='utf-8'))
    if not args.all:
        places = [p for p in places if p['id'] == args.place]
        if not places:
            parser.error('Unknown place; add the agreed coordinates to pipeline/places.json first')
    pairs = [('rain',2025),('rain',2026),('ndvi',2024),('ndvi',2025)] if args.all else [(args.dataset,args.year)]
    output = ROOT/'docs/data/discs.json'
    data = json.loads(output.read_text(encoding='utf-8')) if output.exists() else {}
    for dataset,year in pairs:
        if year not in ([2025,2026] if dataset == 'rain' else [2024,2025]):
            parser.error('Use the agreed rain 2025/2026 or NDVI 2024/2025 year pair')
        variant = 'full' if dataset == 'rain' else args.variant
        days = [15] if dataset == 'ndvi' and args.day15 else None
        manifest_path = CACHE/'manifests'/f'{dataset}-{variant}-{year}.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else None
        wanted = days or ([1,8,15,22,28] if dataset == 'rain' else [5,15,25])
        if args.refresh or manifest is None or manifest['sample_days'] != wanted or (year == datetime.now(timezone.utc).year and manifest['cutoff'] != datetime.now(timezone.utc).date().isoformat()):
            manifest = fetch_year(dataset,year,variant=variant,days=days,refresh=args.refresh or year==datetime.now(timezone.utc).year)
        ndvi_bar = None
        if dataset == 'ndvi':
            bar_record = download(NDVI_BAR,CACHE/'NDVI_colorbar.png')
            ndvi_bar = sample_ndvi_bar(bar_record['path'])
        discs,evidence = build_discs(manifest,places,ndvi_bar=ndvi_bar)
        for place,disc in zip(places,discs):
            evidence[place['id']]['crop'] = make_crop(manifest,place,disc)
            print(f'{disc["id"]}: levels={disc["levels"]}; frames={disc["frames_used"]}; colour match={disc["match_pct"]}%',flush=True)
        data = merge_export(data,places,discs)
        write_validated(data,output)
        evidence_path = ROOT/'pipeline/evidence'/f'{dataset}-{year}.json'
        evidence_path.parent.mkdir(parents=True,exist_ok=True)
        old_evidence = json.loads(evidence_path.read_text(encoding='utf-8')) if evidence_path.exists() else {}
        evidence_path.write_text(json.dumps({'generated':data['generated'],'made_with':data['provenance']['made_with'],
            'cutoff':manifest['cutoff'],'listing_latest':manifest['listing_latest'],
            'meaning':'Colour decoding evidence, not independent validation of physical rainfall or NDVI.',
            'places':merge_evidence(old_evidence,evidence)},indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(f'Validated export: {output}',flush=True)


if __name__ == '__main__':
    main()
