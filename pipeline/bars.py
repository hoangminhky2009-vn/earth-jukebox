# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""Colour legend definitions; rainfall values are bin representatives."""
from pathlib import Path
import numpy as np
from PIL import Image

RAIN_COLOURS = {
    -4: (242,226,185), -3: (211,170,94), -2: (161,103,18), -1: (84,48,2),
    1: (0,69,56), 2: (11,125,118), 3: (102,187,177), 4: (189,230,225),
}
RAIN_LEVELS = [
    {'level':-4,'min':None,'max':-15,'value':-17.5,'label':'15+ mm/day drier than normal'},
    {'level':-3,'min':-15,'max':-10,'value':-12.5,'label':'10 to 15 mm/day drier'},
    {'level':-2,'min':-10,'max':-5,'value':-7.5,'label':'5 to 10 mm/day drier'},
    {'level':-1,'min':-5,'max':-2,'value':-3.5,'label':'2 to 5 mm/day drier'},
    {'level':0,'min':-2,'max':2,'value':0,'label':'near normal (within 2 mm/day)'},
    {'level':1,'min':2,'max':5,'value':3.5,'label':'2 to 5 mm/day wetter'},
    {'level':2,'min':5,'max':10,'value':7.5,'label':'5 to 10 mm/day wetter'},
    {'level':3,'min':10,'max':15,'value':12.5,'label':'10 to 15 mm/day wetter'},
    {'level':4,'min':15,'max':None,'value':17.5,'label':'15+ mm/day wetter than normal'},
]
RAIN_VALUES = {row['level']: row['value'] for row in RAIN_LEVELS}


def image_array(image_or_path):
    """Load without flattening alpha or silently converting a composite to RGBA."""
    if isinstance(image_or_path, (str, Path)):
        with Image.open(image_or_path) as image:
            return np.asarray(image).copy()
    return np.asarray(image_or_path)


def sample_ndvi_bar(image_or_path):
    """Sample the documented 1000x250 legend interior, excluding its outline."""
    image = image_array(image_or_path)
    if image.ndim != 3 or image.shape[0] < 136 or image.shape[1] < 799 or image.shape[2] < 3:
        raise ValueError('NDVI colourbar image is too small or is not RGB/RGBA')
    xs = np.rint(np.linspace(101, 798, 256)).astype(int)
    return np.median(image[115:136, xs, :3], axis=0)
