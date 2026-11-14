# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Aggregate valid sampled frames without inventing absent observations."""
from decimal import Decimal, ROUND_HALF_UP
import numpy as np
from .bars import RAIN_VALUES


def round_position(value):
    value = float(value)
    if not np.isfinite(value) or not 0 <= value <= 1:
        raise ValueError('NDVI colourbar position must be finite and in 0..1')
    # Decimal half-up matches the written example: 0.745 is stored as 0.75.
    return float(Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def ndvi_level(value):
    position = round_position(value)
    return 1 if position < .25 else 2 if position < .5 else 3 if position < .75 else 4


def monthly_value(results, dataset, *, required_frames=None):
    if dataset not in ('rain', 'ndvi'):
        raise ValueError('Dataset must be rain or ndvi')
    minimum = (3 if dataset == 'rain' else 2) if required_frames is None else required_frames
    if not isinstance(minimum, int) or minimum < 1:
        raise ValueError('required_frames must be a positive integer')
    valid = []
    for result in results:
        if result is None:
            continue
        value = result.get('level' if dataset == 'rain' else 'value') if isinstance(result, dict) else result
        if value is None:
            continue
        if not np.isfinite(value):
            raise ValueError('Frame values must be finite or None')
        if dataset == 'rain' and (value != int(value) or not -4 <= value <= 4):
            raise ValueError('Rain frame levels must be integers from -4 to 4')
        if dataset == 'ndvi' and not 0 <= value <= 1:
            raise ValueError('NDVI frame positions must be in 0..1')
        valid.append(value)
    result = {'level': None, 'value': None, 'saturated': False, 'frames_used': len(valid)}
    if len(valid) < minimum:
        return result
    median = float(np.median(valid))
    if dataset == 'rain':
        level = int(np.trunc(median))
        result.update(level=level, value=RAIN_VALUES[level], saturated=abs(level) == 4)
    else:
        value = round_position(median)
        result.update(level=ndvi_level(value), value=value, saturated=value <= .02 or value >= .98)
    return result
