import io
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from pipeline.snow import decode, month_values
from pipeline.validate import validate


def png(pixels):
    stream = io.BytesIO()
    Image.fromarray(np.array(pixels, dtype=np.uint8), 'RGBA').save(stream, format='PNG')
    return stream.getvalue()


def test_transparent_zero_and_missing_are_both_unresolved():
    # NASA's colour key makes both 0% and unavailable categories transparent.
    image = png([[[0, 255, 0, 0], [255, 200, 255, 0], [255, 255, 255, 255]]])
    grid, unknown = decode(image, {(255, 255, 255): 100})
    assert grid.tolist() == [[-1, -1, 100]]
    assert unknown == 0


@pytest.mark.parametrize('restore_numeric', [True, False])
def test_publish_rejects_withheld_numbers_and_old_statusless_records(restore_numeric):
    data = json.loads((Path(__file__).resolve().parents[2] / 'docs/data/discs.json').read_text(encoding='utf-8'))
    assert validate(data) == []
    disc = next(d for d in data['discs'] if d['dataset'] == 'snow')
    if restore_numeric:
        disc['values'][0] = .5
        disc['levels'][0] = 3
        disc['frames_used'][0] = 1
    else:
        del disc['source']['status']
    assert any('snow' in error for error in validate(data))


def test_partial_alpha_and_unknown_colours_cannot_be_measurements():
    grid, unknown = decode(png([[[255, 255, 255, 128], [5, 6, 7, 255]]]),
                           {(255, 255, 255): 100})
    assert grid.tolist() == [[-1, -1]]
    assert unknown == 2


def test_observation_in_another_month_does_not_turn_missing_into_zero():
    values = month_values({'2025-01': np.array([[100, 100]]),
                           '2025-02': np.array([[100, -1]])})
    assert values['2025-01'][0] == 1
    assert values['2025-02'][0] is None
    assert values['2025-02'][1]['unresolved_pixels'] == 1
    assert values['2025-02'][1]['status'] == 'withheld'


def test_never_observed_pixel_is_not_assumed_to_be_water():
    values = month_values({'2025-01': np.array([[50, -1]]),
                           '2025-02': np.array([[25, -1]])})
    assert all(value is None for value, _ in values.values())


def test_only_fully_resolved_grid_can_produce_a_mean():
    value, info = month_values({'2025-01': np.array([[25, 50], [75, 100]])})['2025-01']
    assert value == .62
    assert info['grid_pixels'] == 4
    assert info['coloured_pixels'] == 4
    assert info['unresolved_pixels'] == 0
    assert info['status'] == 'available'


def test_empty_input_is_safe():
    assert month_values({}) == {}


@pytest.mark.parametrize('grid', [np.array([]), np.array([1, 2]), np.array([[101]]), np.array([[np.nan]])])
def test_malformed_decoded_grid_is_rejected(grid):
    with pytest.raises(ValueError):
        month_values({'2025-01': grid})


def test_published_snow_evidence_has_no_fully_resolved_month():
    path = Path(__file__).parents[1] / 'evidence' / 'snow.json'
    evidence = json.loads(path.read_text(encoding='utf-8'))
    count = evidence['grid'][0] * evidence['grid'][1]
    assert all(info['coloured_pixels'] < count for info in evidence['months'].values())
