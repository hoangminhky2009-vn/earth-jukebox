# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Download original SVS frames once, preserving source dates and failure reasons."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin

from PIL import Image
import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'cache'
BASE = 'https://svs.gsfc.nasa.gov/vis/a000000/'
RAIN_FOLDER = BASE + 'a004800/a004897/frames/3600x1800_2x1_15p/flatalpha/'
RAIN_COMPOSITE = BASE + 'a004800/a004897/frames/3600x1800_2x1_15p/flatcomposite/'
RAIN_LEGEND = BASE + 'a004800/a004897/frames/1920x1080_16x9_15p/flatcomposite/'
NDVI_FULL = BASE + 'a005500/a005544/frames/8640x4320_2x1_30p/equirectangular/'
NDVI_LIGHT = BASE + 'a005500/a005544/frames/4096x2048_2x1_30p/equirectangular_w_dates/'
NDVI_BAR = BASE + 'a005500/a005544/NDVI_colorbar.png'
SAMPLE_DAYS = {'rain': [1, 8, 15, 22, 28], 'ndvi': [5, 15, 25]}
HEADERS = {'User-Agent': 'EarthJukebox-SpaceApps2026/1.0 (NASA SVS image sonification)'}


def dated_files(html: str, dataset: str) -> dict[date, str]:
    """Read exact filenames from an SVS directory, never guess a missing URL."""
    result = {}
    for name in re.findall(r'href=[\"\']([^\"\']+\.png)[\"\']', html, re.I):
        filename = name.rsplit('/', 1)[-1]
        pattern = r'imergvar_alpha\.(\d{4})\.(\d{2})\.(\d{2})\.png$' if dataset == 'rain' else r'SNPP_VIIRS\.(\d{4})(\d{2})(\d{2})\.'
        match = re.search(pattern, filename)
        if match:
            try:
                result[date(*map(int, match.groups()))] = filename
            except ValueError:
                pass
    return result


def frame_status(day: date, available: dict, today: date) -> str:
    if day > today:
        return 'future'
    if day in available:
        return 'available'
    if available and day > max(available):
        return 'not_yet_published'
    if available and day < min(available):
        return 'outside_archive'
    return 'archive_gap'


def get_listing(folder: str, dataset: str, cache: Path = CACHE, refresh=False) -> dict[date, str]:
    tag = hashlib.sha256(folder.encode()).hexdigest()[:12]
    path = cache / 'listings' / (tag + '.html')
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or refresh:
        response = requests.get(folder, headers=HEADERS, timeout=120)
        response.raise_for_status()
        items = dated_files(response.text, dataset)
        if not items:
            raise ValueError(f'No dated {dataset} PNG links in {folder}; do not treat this as missing data.')
        path.write_text(response.text, encoding='utf-8')
    items = dated_files(path.read_text(encoding='utf-8'), dataset)
    if not items:
        raise ValueError(f'Empty or unsupported cached listing: {path}')
    return items


def verify_png(path: Path):
    with Image.open(path) as image:
        if image.format != 'PNG':
            raise ValueError(f'Not a PNG image: {path}')
        image.verify()


def download(url: str, destination: Path, timeout=120) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    cached = destination.exists()
    if cached:
        try:
            verify_png(destination)
        except (OSError, ValueError):
            cached = False
    if not cached:
        partial = destination.with_suffix(destination.suffix + '.part')
        for attempt in range(4):
            try:
                with requests.get(url, headers=HEADERS, timeout=timeout, stream=True) as response:
                    response.raise_for_status()
                    with partial.open('wb') as output:
                        for chunk in response.iter_content(256 * 1024):
                            output.write(chunk)
                verify_png(partial)
                partial.replace(destination)
                break
            except (requests.RequestException, OSError, ValueError):
                partial.unlink(missing_ok=True)
                if attempt == 3:
                    raise
                time.sleep([5, 15, 30][attempt])
    raw = destination.read_bytes()
    return {'path': str(destination), 'url': url, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'cached': cached}


def fetch_year(dataset: str, year: int, *, variant='full', days=None, workers=4, refresh=False, today=None, cache=CACHE) -> dict:
    today = today or datetime.now(timezone.utc).date()
    folder = RAIN_FOLDER if dataset == 'rain' else NDVI_LIGHT if variant == 'light' else NDVI_FULL
    sample_days = days or SAMPLE_DAYS[dataset]
    listing = get_listing(folder, dataset, cache, refresh)
    manifest = {'dataset': dataset, 'year': year, 'folder': folder, 'variant': variant,
                'sample_days': sample_days, 'cutoff': today.isoformat(), 'listing_latest': max(listing).isoformat(), 'frames': {}}
    jobs = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for month in range(1, 13):
            for daynum in sample_days:
                day = date(year, month, daynum)
                key = day.isoformat()
                status = frame_status(day, listing, today)
                manifest['frames'][key] = {'status': status}
                if status == 'available':
                    name = listing[day]
                    destination = cache / 'frames' / dataset / variant / name
                    jobs[pool.submit(download, urljoin(folder, name), destination)] = key
        done = 0
        for job in as_completed(jobs):
            key = jobs[job]
            try:
                manifest['frames'][key] = {'status': 'ok', **job.result()}
            except Exception as exc:
                manifest['frames'][key] = {'status': 'download_failed', 'error': str(exc)}
            done += 1
            print(f'{dataset} {year}: {done}/{len(jobs)} {key} {manifest["frames"][key]["status"]}', flush=True)
    path = cache / 'manifests' / f'{dataset}-{variant}-{year}.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', choices=['rain', 'ndvi'], default='rain')
    parser.add_argument('--year', type=int, action='append', default=None)
    parser.add_argument('--variant', choices=['full', 'light'], default='full')
    parser.add_argument('--day15', action='store_true', help='Documented full-resolution NDVI fallback')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    if args.workers < 1 or args.workers > 8:
        parser.error('Use 1 to 8 download workers')
    for year in args.year or [2025]:
        m = fetch_year(args.dataset, year, variant=args.variant, days=[15] if args.day15 else None,
                       workers=args.workers, refresh=args.refresh)
        ok = [v for v in m['frames'].values() if v['status'] == 'ok']
        bad = {k: v['status'] for k,v in m['frames'].items() if v['status'] != 'ok'}
        print(json.dumps({'year': year, 'downloaded': len(ok), 'MB': round(sum(x['bytes'] for x in ok)/1e6,2), 'other_dates': bad}, indent=2))


if __name__ == '__main__':
    main()
