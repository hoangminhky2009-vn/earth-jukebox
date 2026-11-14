# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
import numpy as np
import pytest

from pipeline.bars import sample_ndvi_bar
from pipeline.colour import srgb_to_lab
from pipeline.months import monthly_value, ndvi_level
from pipeline.reader import coordinates_to_pixel, read_window, read_frame


def rain_window(colour):
    return np.tile(np.array(colour, dtype=np.uint8), (5, 5, 1))


def vegetation_bar():
    # A hand-built low-to-high brown/green gradient, not an observed NASA bar.
    start = np.array([218, 186, 153])
    end = np.array([31, 61, 19])
    return np.round(start + np.linspace(0, 1, 256)[:, None] * (end-start)).astype(np.uint8)


def test_01_coordinates():
    assert coordinates_to_pixel(105, 10, 360, 180) == (285, 80)
    assert coordinates_to_pixel(90.41, 23.81, 3600, 1800) == (2704, 661)


def test_rain_longitude_origin_places_dhaka_in_bangladesh():
    # SVS 4897 is Pacific-centred: its western edge is 20 E, not 180 W.
    # Independently checked against the Natural Earth coastline (see evidence).
    assert coordinates_to_pixel(90.41, 23.81, 3600, 1800, west_lon=20) == (704, 661)
    assert coordinates_to_pixel(0, 0, 3600, 1800, west_lon=20) == (3400, 900)
    assert coordinates_to_pixel(20, 0, 3600, 1800, west_lon=20) == (0, 900)


def test_rain_reader_does_not_sample_the_caribbean_for_dhaka():
    pixels = np.zeros((1800, 3600, 4), dtype=np.uint8)
    pixels[659:664, 702:707] = [102, 187, 177, 255]
    pixels[659:664, 2702:2707] = [84, 48, 2, 255]
    assert read_frame(pixels, 'rain', 23.81, 90.41)['level'] == 3


def test_ndvi_keeps_its_standard_longitude_origin():
    bar = vegetation_bar()
    pixels = np.full((180, 360, 3), [8,123,176], dtype=np.uint8)
    pixels[64:69,268:273] = bar[200]
    result = read_frame(pixels, 'ndvi', 23.81, 90.41, ndvi_bar=bar)
    assert result['level'] == 4


def test_02_transparent_is_normal_despite_leftover_rgb():
    result = read_window(rain_window([95, 54, 3, 0]), 'rain')
    assert result['level'] == 0
    assert result['value'] == 0
    assert result['matched_pixels'] == 25
    assert result['transparent_pixels'] == 25
    assert result['matched_deltas'] == []


def test_03_exact_rain_bar_colour():
    result = read_window(rain_window([0, 69, 56, 255]), 'rain')
    assert result['level'] == 1
    assert result['value'] == 3.5
    assert result['median_de'] == pytest.approx(0, abs=1e-12)


def test_04_slightly_off_rain_colour():
    result = read_window(rain_window([95, 54, 3, 255]), 'rain')
    assert result['level'] == -1
    assert 4 < result['median_de'] < 6


def test_05_majority_bad_pixels_is_missing():
    window = rain_window([0, 69, 56, 255])
    window.reshape(-1, 4)[:15] = [128, 128, 128, 255]
    result = read_window(window, 'rain')
    assert result['level'] is None
    assert result['value'] is None
    assert result['saturated'] is False
    assert result['matched_pixels'] == 10
    assert result['match_pct'] == 40


@pytest.mark.parametrize('colour,expected', [([189,230,225,255],4), ([242,226,185,255],-4)])
def test_06_extreme_bins_are_saturated(colour, expected):
    result = read_window(rain_window(colour), 'rain')
    assert result['level'] == expected
    assert result['saturated'] is True


def test_07_frame_median_toward_zero():
    window = rain_window([128, 128, 128, 255])
    flat = window.reshape(-1, 4)
    flat[:12] = [84, 48, 2, 255]
    flat[12:24] = [0, 69, 56, 255]
    assert read_window(window, 'rain')['level'] == 0
    flat[:13] = [11, 125, 118, 255]
    flat[13:] = [95, 54, 3, 0]
    assert read_window(window, 'rain')['level'] == 2


def test_08_month_minimum_and_median():
    result = monthly_value([-1, -1, 0, -2, None], 'rain')
    assert result == {'level': -1, 'value': -3.5, 'saturated': False, 'frames_used': 4}
    assert monthly_value([-1, 0, None, None, None], 'rain') == {
        'level': None, 'value': None, 'saturated': False, 'frames_used': 2}


def test_09_ndvi_gradient_quarter():
    bar = vegetation_bar()
    result = read_window(np.tile(bar[64], (5, 5, 1)), 'ndvi', ndvi_bar=bar)
    assert result['value'] == pytest.approx(.25, abs=.01)


@pytest.mark.parametrize('colour', [[255,255,255], [8,123,176]])
def test_10_ndvi_snow_and_ocean_are_missing(colour):
    result = read_window(np.tile(np.array(colour, dtype=np.uint8), (5,5,1)), 'ndvi', ndvi_bar=vegetation_bar())
    assert result['value'] is None
    assert result['level'] is None


@pytest.mark.parametrize('position,expected', [(.24,1),(.25,2),(.74,3),(.75,4)])
def test_11_ndvi_quarters(position, expected):
    assert ndvi_level(position) == expected


def test_ndvi_rounds_before_level_and_saturation():
    result = monthly_value([.745, .745, None], 'ndvi')
    assert result['value'] == .75
    assert result['level'] == 4
    assert monthly_value([.984, .984], 'ndvi')['saturated'] is True
    assert monthly_value([.025, .025], 'ndvi')['saturated'] is False


def test_ndvi_one_frame_is_only_valid_with_explicit_fallback():
    assert monthly_value([.5, None, None], 'ndvi')['value'] is None
    assert monthly_value([.5], 'ndvi', required_frames=1)['value'] == .5


def test_cielab_known_black_white_and_red():
    lab = srgb_to_lab(np.array([[0,0,0],[255,255,255],[255,0,0]]))
    np.testing.assert_allclose(lab[0], [0,0,0], atol=1e-9)
    np.testing.assert_allclose(lab[1], [100,0,0], atol=.02)
    np.testing.assert_allclose(lab[2], [53.2408,80.0925,67.2032], atol=.02)


def test_ndvi_bar_samples_only_interior_rows():
    image = np.full((250,1000,4),255,dtype=np.uint8)
    for x in range(101,799):
        image[115:136,x,:3] = [round((x-101)/697*200),50,25]
    sampled = sample_ndvi_bar(image)
    assert sampled.shape == (256,3)
    np.testing.assert_array_equal(sampled[0], [0,50,25])
    np.testing.assert_array_equal(sampled[-1], [200,50,25])


def test_exactly_half_bad_is_still_usable():
    window=np.array([[[0,69,56,255],[128,128,128,255]]],dtype=np.uint8)
    assert read_window(window,'rain')['level'] == 1


def test_rain_requires_alpha_and_rejects_partial_alpha():
    with pytest.raises(ValueError, match='RGBA'):
        read_window(np.zeros((5,5,3),dtype=np.uint8),'rain')
    assert read_window(rain_window([0,69,56,128]),'rain')['value'] is None
