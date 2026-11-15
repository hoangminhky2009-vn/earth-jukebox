# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Validate the shared data contract and atomically publish complete JSON."""
import json
import math
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .bars import RAIN_VALUES
from .months import ndvi_level


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def source_sampling(source, dataset, bad):
    """Check provenance and return the valid-frame minimum and maximum."""
    if dataset == 'snow':
        # One monthly map per month from NASA GIBS (pipeline/snow.py).
        if not isinstance(source, dict) or source.get('gibs_layer') != 'MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct':
            bad('source.gibs_layer must be MODIS_Terra_L3_Snow_Cover_Monthly_Average_Pct')
        elif not str(source.get('wms', '')).startswith('https://gibs.earthdata.nasa.gov/'):
            bad('source.wms must be a NASA GIBS address')
        if isinstance(source, dict):
            if source.get('status') not in ('available', 'withheld'):
                bad('snow source.status must explicitly state available or withheld')
            if not isinstance(source.get('limitation'), str) or not source['limitation'].strip():
                bad('snow source.limitation is required')
        return 1, 1
    minimum, maximum = (3, 5) if dataset == 'rain' else (2, 3)
    if not isinstance(source, dict):
        bad('source metadata is required')
        return minimum, maximum
    svs = '4897' if dataset == 'rain' else '5544'
    if source.get('svs') != svs:
        bad(f'source.svs must be {svs} for {dataset}')

    def nasa_path(value):
        if not isinstance(value, str) or not value.strip():
            return None
        try:
            parsed = urlsplit(value)
        except ValueError:
            return None
        path = unquote(parsed.path)
        if (parsed.scheme != 'https' or parsed.netloc != 'svs.gsfc.nasa.gov'
                or parsed.query or parsed.fragment or '..' in path.split('/')):
            return None
        return path

    if (nasa_path(source.get('svs_url')) or '').rstrip('/') != '/' + svs:
        bad(f'source.svs_url must identify NASA SVS {svs}')
    prefix = '/vis/a000000/' + ('a004800/a004897/frames/' if dataset == 'rain' else 'a005500/a005544/frames/')
    frames_path = nasa_path(source.get('frames'))
    if frames_path is None or not frames_path.startswith(prefix) or not frames_path.endswith('/'):
        bad(f'source.frames must identify the SVS {svs} frame folder')

    days = source.get('sample_days')
    allowed = [[1,8,15,22,28]] if dataset == 'rain' else [[5,15,25],[15]]
    if not isinstance(days, list) or any(type(day) is not int for day in days) or days not in allowed:
        bad(f'source.sample_days must be one of {allowed}')
    elif dataset == 'ndvi' and days == [15]:
        minimum, maximum = 1, 1
    return minimum, maximum


def validate(data):
    errors=[]
    if not isinstance(data,dict):return ['Root must be an object']
    for field in ['version','generated','provenance','datasets','places','discs']:
        if field not in data:errors.append(f'Missing root field {field}')
    if not isinstance(data.get('places'),list) or not isinstance(data.get('discs'),list):
        return errors+['places and discs must be arrays']
    places=set()
    for place in data['places']:
        if not isinstance(place,dict):errors.append('Place must be an object');continue
        place_id=place.get('id')
        if not isinstance(place_id,str) or not place_id.strip():
            errors.append('Place id must be a non-empty string')
        elif place_id in places:
            errors.append('Place ids must be unique')
        else:
            places.add(place_id)
        for key in ['id','name','biome','region','story']:
            if not isinstance(place.get(key),str):errors.append(f'Place {place.get("id")}: missing string {key}')
        for key,low,high in [('lat',-90,90),('lon',-180,180)]:
            v=place.get(key)
            if not finite(v) or not low<=v<=high:errors.append(f'Place {place.get("id")}: invalid {key}')
    seen=set();pairs=set()
    for disc in data['discs']:
        if not isinstance(disc,dict):errors.append('Disc must be an object');continue
        ident=disc.get('id','(no id)')
        def bad(message):errors.append(f'{ident}: {message}')
        if not isinstance(disc.get('id'),str) or not disc['id'].strip():
            bad('id must be a non-empty string')
        else:
            if ident in seen:bad('duplicate id')
            seen.add(ident)
        place_id=disc.get('place')
        valid_place_id=isinstance(place_id,str) and bool(place_id.strip())
        if not valid_place_id or place_id not in places:bad('unknown place')
        dataset=disc.get('dataset')
        if dataset not in ('rain','ndvi','snow'):bad('unknown dataset');continue
        if valid_place_id and type(disc.get('year')) is int:
            pair=(place_id,dataset,disc['year'])
            if pair in pairs:bad('duplicate place/dataset/year')
            pairs.add(pair)
        if disc.get('side') not in ('A','B'):bad('side must be A or B')
        if type(disc.get('year')) is not int:bad('year must be an integer')
        minimum,maximum=source_sampling(disc.get('source'),dataset,bad)
        for name in ['levels','values','saturated','frames_used']:
            if not isinstance(disc.get(name),list) or len(disc[name])!=12:bad(f'{name} needs exactly 12 entries')
        if any(not isinstance(disc.get(name),list) or len(disc[name])!=12 for name in ['levels','values','saturated','frames_used']):continue
        if dataset == 'snow' and isinstance(disc.get('source'), dict) and disc['source'].get('status') == 'withheld':
            if (any(v is not None for v in disc['levels'] + disc['values'])
                    or any(disc['frames_used']) or any(disc['saturated']) or disc.get('breaks')):
                bad('withheld snow must have null values/levels, no used frames, no saturation and no breaks')
        breaks=disc.get('breaks')
        if not isinstance(breaks,list) or any(type(m) is not int or not 1<=m<=12 for m in breaks):bad('breaks must contain months 1..12');breaks=[]
        expected='skips' if breaks else 'scratched' if None in disc['levels'] else 'mint'
        if disc.get('condition')!=expected:bad(f'condition must be {expected}')
        for i,(level,value,sat,used) in enumerate(zip(disc['levels'],disc['values'],disc['saturated'],disc['frames_used']),1):
            valid_used=type(used) is int and 0<=used<=maximum
            if not valid_used:bad(f'month {i}: invalid frames_used (expected 0..{maximum})')
            if type(sat) is not bool:bad(f'month {i}: saturated must be boolean')
            if level is None or value is None:
                if level is not None or value is not None or sat is not False:bad(f'month {i}: null level/value must pair with false saturation')
                continue
            if valid_used and used<minimum:bad(f'month {i}: non-null value needs at least {minimum} valid frames')
            if not finite(value):bad(f'month {i}: value must be finite');continue
            if dataset=='rain':
                if type(level) is not int or level not in RAIN_VALUES:bad(f'month {i}: invalid rain level');continue
                if value!=RAIN_VALUES[level]:bad(f'month {i}: value does not match rain level')
                if sat!=(abs(level)==4):bad(f'month {i}: incorrect saturation')
            else:
                if not 0<=value<=1:bad(f'month {i}: {dataset} value outside 0..1');continue
                if type(level) is not int or level!=ndvi_level(value):bad(f'month {i}: incorrect NDVI quarter')
                if sat!=(value<=.02 or value>=.98):bad(f'month {i}: incorrect saturation')
        for field in ['match_pct','median_de']:
            v=disc.get(field)
            if not finite(v) or v<0 or (field=='match_pct' and v>100):bad(f'{field} must be a valid finite quality number')
        frame=disc.get('frame')
        if not isinstance(frame,str) or not frame.startswith('data/frames/') or '..' in Path(frame).parts:bad('frame must be under data/frames/')
        if not isinstance(disc.get('description'),str) or len(disc['description'].split())>40:bad('description must be at most 40 words')
    return errors


def write_validated(data,path):
    errors=validate(data)
    if errors:raise ValueError('\n'.join(errors))
    text=json.dumps(data,ensure_ascii=False,allow_nan=False,indent=2)+'\n'
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(text,encoding='utf-8')
    temp.replace(path)
