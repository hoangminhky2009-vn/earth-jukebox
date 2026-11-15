import json
from datetime import date

import pytest
from PIL import Image

from tools import make_month_maps as maps


def test_partial_map_update_keeps_other_places_and_skips_missing_months(tmp_path, monkeypatch):
    out = tmp_path / 'maps'
    out.mkdir()
    existing = {'note': 'Original NASA evidence', 'span_deg': [maps.SPAN_LON, maps.SPAN_LAT],
                'size_px': [maps.W, maps.H], 'discs': {
                    'dhaka-rain-2025': {'0': {'file': 'data/maps/keep.png', 'url': 'https://example.invalid/keep'}},
                    'ferlo-rain-2025': {'1': {'file': 'data/maps/stale.png'}}}}
    (out / 'index.json').write_text(json.dumps(existing))
    untouched = out / 'keep.png'
    untouched.write_bytes(b'untouched')
    data = tmp_path / 'discs.json'
    data.write_text(json.dumps({'places': [
        {'id': 'ferlo', 'lat': 15.6035, 'lon': -15.2857}, {'id': 'dhaka', 'lat': 23.81, 'lon': 90.41}],
        'discs': [{'id': 'ferlo-rain-2025', 'place': 'ferlo', 'dataset': 'rain', 'year': 2025,
                   'levels': [0] + [None] * 11},
                  {'id': 'dhaka-rain-2025', 'place': 'dhaka', 'dataset': 'rain', 'year': 2025,
                   'levels': [0] * 12}]}))
    source = tmp_path / 'source.png'
    Image.new('RGB', (360, 180), 'green').save(source)
    monkeypatch.setattr(maps, 'DATA', data)
    monkeypatch.setattr(maps, 'OUT', out)
    monkeypatch.setattr(maps, 'listing', lambda ds: {date(2025, 1, 15): '2025.01.15.png'})
    monkeypatch.setattr(maps, 'get', lambda url, path: source)

    maps.main(['--place', 'ferlo'])

    updated = json.loads((out / 'index.json').read_text())
    assert updated['discs']['dhaka-rain-2025'] == existing['discs']['dhaka-rain-2025']
    assert untouched.read_bytes() == b'untouched'
    ferlo = updated['discs']['ferlo-rain-2025']
    assert list(ferlo) == ['0']
    assert ferlo['0']['date'] == '2025-01-15'
    assert ferlo['0']['url'] == maps.SOURCES['rain']['folder'] + '2025.01.15.png'
    with Image.open(out / 'ferlo-rain-2025-01.png') as image:
        assert image.size == (maps.W, maps.H)
    assert not (out / 'ferlo-rain-2025-02.png').exists()


def test_partial_map_update_rejects_mixed_crop_geometry(tmp_path, monkeypatch):
    monkeypatch.setattr(maps, 'OUT', tmp_path)
    (tmp_path / 'index.json').write_text(json.dumps({'span_deg': [21.6, 11.2],
                                                   'size_px': [maps.W, maps.H], 'discs': {}}))
    with pytest.raises(ValueError, match='full rebuild'):
        maps.index_for_update({'ferlo'})


def test_nearest_frame_stays_in_month_and_breaks_ties_by_date():
    avail = {date(2025, 1, 16): 'later', date(2025, 1, 14): 'earlier', date(2024, 1, 15): 'wrong year'}
    assert maps.nearest_15th(avail, 2025, 1) == date(2025, 1, 14)
    assert maps.nearest_15th(avail, 2025, 2) is None


@pytest.mark.parametrize('args', [[], ['--place', 'tromso']])
def test_rebuild_retains_withheld_snow_imagery_without_fetching_or_changing_values(tmp_path, monkeypatch, args):
    out = tmp_path / 'maps'
    out.mkdir()
    entry = {'2': {'file': 'data/maps/tromso-snow-2025-03.png', 'date': '2025-03',
                   'source': 'NASA MODIS Terra (GIBS)', 'url': 'https://gibs.earthdata.nasa.gov/example'}}
    (out / 'index.json').write_text(json.dumps({'span_deg': [maps.SPAN_LON, maps.SPAN_LAT],
        'size_px': [maps.W, maps.H], 'discs': {'tromso-snow-2025': entry}}))
    image = out / 'tromso-snow-2025-03.png'
    image.write_bytes(b'existing NASA image stays unchanged')
    data = tmp_path / 'discs.json'
    original_data = json.dumps({'places': [{'id': 'tromso', 'lat': 69.7, 'lon': 19.0}], 'discs': [{
        'id': 'tromso-snow-2025', 'place': 'tromso', 'dataset': 'snow', 'year': 2025,
        'source': {'status': 'withheld'}, 'levels': [None] * 12, 'values': [None] * 12}]})
    data.write_text(original_data)
    monkeypatch.setattr(maps, 'DATA', data)
    monkeypatch.setattr(maps, 'OUT', out)
    monkeypatch.setattr(maps, 'get', lambda *args: pytest.fail('Withheld snow must not fetch images'))
    monkeypatch.setattr(maps, 'listing', lambda *args: pytest.fail('Withheld snow must not fetch listings'))

    maps.main(args)

    assert json.loads((out / 'index.json').read_text())['discs']['tromso-snow-2025'] == entry
    assert image.read_bytes() == b'existing NASA image stays unchanged'
    assert data.read_text() == original_data


def test_full_rebuild_does_not_reuse_withheld_snow_maps_with_old_crop_geometry(tmp_path, monkeypatch):
    monkeypatch.setattr(maps, 'OUT', tmp_path)
    (tmp_path / 'index.json').write_text(json.dumps({'span_deg': [21.6, 11.2],
        'size_px': [maps.W, maps.H], 'discs': {'tromso-snow-2025': {'2': {'file': 'old-crop.png'}}}}))
    snow = {'id': 'tromso-snow-2025', 'dataset': 'snow', 'source': {'status': 'withheld'}}
    assert maps.index_for_update(set(), [snow])['discs'] == {}
