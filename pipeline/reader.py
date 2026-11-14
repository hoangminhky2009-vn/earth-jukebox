# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Read uncomposited equirectangular SVS frames using their documented legends."""
import math
import numpy as np
from .bars import RAIN_COLOURS, RAIN_VALUES, image_array, sample_ndvi_bar
from .colour import srgb_to_lab, delta_e
from .months import ndvi_level, round_position


def coordinates_to_pixel(lon, lat, width, height):
    if not (np.isfinite(lon) and np.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90):
        raise ValueError('Longitude/latitude must be finite and within -180..180/-90..90')
    if width < 1 or height < 1:
        raise ValueError('Image dimensions must be positive')
    x = math.floor((lon + 180) / 360 * width) % width
    y = min(height - 1, math.floor((90 - lat) / 180 * height))
    return x, y


def _nearest(rgb, bar):
    distances = delta_e(srgb_to_lab(rgb)[:, None, :], srgb_to_lab(bar)[None, :, :])
    indices = np.argmin(distances, axis=1)
    return indices, distances[np.arange(len(indices)), indices]


def read_window(window, dataset, *, ndvi_bar=None):
    pixels = np.asarray(window)
    if pixels.ndim != 3 or pixels.shape[2] not in (3, 4) or pixels.shape[0] * pixels.shape[1] == 0:
        raise ValueError('Expected a non-empty RGB/RGBA pixel window')
    flat = pixels.reshape(-1, pixels.shape[2])
    size = len(flat)
    valid = np.zeros(size, dtype=bool)
    values = np.full(size, np.nan)
    transparent = np.zeros(size, dtype=bool)
    matched_deltas = []
    if dataset == 'rain':
        if flat.shape[1] != 4:
            raise ValueError('Rain requires the RGBA flatalpha data frame, not an RGB composite')
        transparent = flat[:,3] == 0
        valid[transparent] = True
        values[transparent] = 0
        opaque_indices = np.flatnonzero(flat[:,3] == 255)
        if len(opaque_indices):
            levels = np.array(list(RAIN_COLOURS))
            bar = np.array(list(RAIN_COLOURS.values()))
            indices, distances = _nearest(flat[opaque_indices,:3], bar)
            good = distances <= 10
            accepted = opaque_indices[good]
            valid[accepted] = True
            values[accepted] = levels[indices[good]]
            matched_deltas = distances[good].tolist()
    elif dataset == 'ndvi':
        if ndvi_bar is None:
            raise ValueError('NDVI requires a sampled colourbar or its source image/path')
        bar = np.asarray(ndvi_bar) if isinstance(ndvi_bar, np.ndarray) else image_array(ndvi_bar)
        if bar.ndim == 3:
            bar = sample_ndvi_bar(bar)
        if bar.ndim != 2 or bar.shape[1] != 3 or len(bar) < 2:
            raise ValueError('Sampled NDVI bar must contain at least two RGB colours')
        eligible = ~np.all(flat[:,:3] >= 250, axis=1)
        if flat.shape[1] == 4:
            eligible &= flat[:,3] == 255
        candidates = np.flatnonzero(eligible)
        if len(candidates):
            indices, distances = _nearest(flat[candidates,:3], bar)
            good = distances <= 15
            accepted = candidates[good]
            valid[accepted] = True
            values[accepted] = indices[good] / (len(bar) - 1)
            matched_deltas = distances[good].tolist()
    else:
        raise ValueError('Dataset must be rain or ndvi')
    matched = int(valid.sum())
    result = {
        'level': None, 'value': None, 'saturated': False,
        'sampled_pixels': size, 'matched_pixels': matched, 'invalid_pixels': size-matched,
        'transparent_pixels': int(transparent.sum()), 'matched_deltas': matched_deltas,
        'match_pct': 100 * matched / size,
        'median_de': float(np.median(matched_deltas)) if matched_deltas else None,
    }
    if matched < size / 2:
        return result
    median = float(np.median(values[valid]))
    if dataset == 'rain':
        level = int(np.trunc(median))
        result.update(level=level, value=RAIN_VALUES[level], saturated=abs(level) == 4)
    else:
        rounded = round_position(median)
        result.update(level=ndvi_level(rounded), value=median, saturated=rounded <= .02 or rounded >= .98)
    return result


def read_frame(image_or_path, dataset, lat, lon, *, ndvi_bar=None, window_size=None):
    image = image_array(image_or_path)
    if image.ndim != 3 or image.shape[1] != image.shape[0] * 2:
        raise ValueError('Frame must be a plain 2:1 equirectangular RGB/RGBA image')
    height, width = image.shape[:2]
    x, y = coordinates_to_pixel(lon, lat, width, height)
    size = window_size if window_size is not None else (11 if dataset == 'ndvi' and width >= 8000 else 5)
    if not isinstance(size, int) or size < 1 or size % 2 != 1:
        raise ValueError('window_size must be a positive odd integer')
    radius = size // 2
    # Longitude wraps at the date line; latitude is clipped at the poles.
    xs = np.arange(x-radius, x+radius+1) % width
    ys = np.arange(max(0,y-radius), min(height,y+radius+1))
    window = image[np.ix_(ys, xs)]
    return read_window(window, dataset, ndvi_bar=ndvi_bar)
