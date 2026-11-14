# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Independent boundary cases for source handling and safe JSON delivery."""
from copy import deepcopy
from datetime import date
import json
from pathlib import Path

import pytest

from pipeline.fetch import dated_files, frame_status
from pipeline.validate import validate, write_validated


def sample():
    path = Path(__file__).resolve().parents[2] / 'docs/data/discs.sample.json'
    return json.loads(path.read_text(encoding='utf-8'))


def test_source_dates_do_not_make_future_months_archive_breaks():
    available = {date(2026,11,1):'one.png', date(2026,11,8):'eight.png'}
    assert frame_status(date(2026,11,15),available,date(2026,11,14)) == 'future'
    assert frame_status(date(2026,11,12),available,date(2026,11,14)) == 'not_yet_published'
    assert frame_status(date(2026,11,5),available,date(2026,11,14)) == 'archive_gap'
    assert frame_status(date(2024,1,1),available,date(2026,11,14)) == 'outside_archive'


def test_read_only_exact_dated_filenames():
    html='<a href="imergvar_alpha.2025.07.15.png">frame</a><a href="imergvar_alpha.now.png">now</a>'
    assert dated_files(html,'rain') == {date(2025,7,15):'imergvar_alpha.2025.07.15.png'}
    assert dated_files('<a href="SNPP_VIIRS.20250715.ndvi_w_snow.oceanblue.png">x</a>','ndvi') == {date(2025,7,15):'SNPP_VIIRS.20250715.ndvi_w_snow.oceanblue.png'}


def test_current_team_sample_passes():
    assert validate(sample()) == []


@pytest.mark.parametrize('mutation', [
    lambda d:d['discs'][0]['levels'].pop(),
    lambda d:d['discs'][0]['values'].__setitem__(0,999),
    lambda d:d['discs'][0]['saturated'].__setitem__(0,True),
    lambda d:d['discs'][0].update(place='nonexistent'),
    lambda d:d['discs'][0].update(match_pct=float('nan')),
])
def test_invalid_data_is_rejected(mutation):
    data=sample();mutation(data)
    assert validate(data)


def test_source_gap_can_have_valid_monthly_values():
    data=sample();disc=data['discs'][0]
    disc.update(breaks=[6],condition='skips')
    assert all(v is not None for v in disc['levels'])
    assert validate(data) == []


def test_invalid_export_preserves_last_good_file(tmp_path):
    path=tmp_path/'discs.json';path.write_text('original',encoding='utf-8')
    data=sample();data['discs'][0]['levels']=[None]*12
    with pytest.raises(ValueError):write_validated(data,path)
    assert path.read_text(encoding='utf-8')=='original'


@pytest.mark.parametrize('dataset,used', [('rain',2),('rain',0),('ndvi',1)])
def test_non_null_month_needs_minimum_valid_frames(dataset,used):
    data=sample();disc=next(d for d in data['discs'] if d['dataset']==dataset)
    disc['frames_used'][0]=used
    assert any('valid frames' in e for e in validate(data))


def test_day15_ndvi_fallback_accepts_one_frame_but_not_two():
    data=sample();disc=next(d for d in data['discs'] if d['dataset']=='ndvi')
    disc['source']['sample_days']=[15]
    disc['frames_used']=[1]*12
    assert validate(data)==[]
    disc['frames_used'][0]=2
    assert any('frames_used' in e for e in validate(data))


@pytest.mark.parametrize('source', [
    {},
    {'svs':'5544'},
    {'svs':'4897','svs_url':'https://example.org/4897','frames':'','sample_days':[1,8,15,22,28]},
])
def test_empty_or_mismatched_provenance_is_rejected(source):
    data=sample();data['discs'][0]['source']=source
    assert any('source' in e for e in validate(data))


@pytest.mark.parametrize('field,value', [
    ('svs','5544'),
    ('svs_url','https://svs.gsfc.nasa.gov/5544/'),
    ('frames','https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005544/frames/'),
    ('frames','https://svs.gsfc.nasa.gov.attacker.example/vis/a000000/a004800/a004897/frames/'),
    ('sample_days',[1,8,15,22,22]),
    ('sample_days',[15]),
    ('sample_days','1,8,15,22,28'),
    ('sample_days',[1,8,15,22,False]),
])
def test_source_metadata_matches_dataset_and_sampling(field,value):
    data=sample();data['discs'][0]['source'][field]=value
    assert any('source' in e for e in validate(data))


@pytest.mark.parametrize('target,field,value', [
    ('places','id',[]),('places','id',{}),('places','id',''),
    ('discs','id',[]),('discs','id',{}),('discs','id',''),
    ('discs','place',[]),('discs','year',[]),('discs','year',True),
])
def test_malformed_identity_returns_errors_instead_of_throwing(target,field,value):
    data=sample();data[target][0][field]=value
    assert validate(data)
