# Written by Sabik with help from OpenAI Codex (SI). See AI_USE.md.
"""sRGB (0..255) to CIELAB using the sRGB D65 reference white."""
import numpy as np


def srgb_to_lab(rgb):
    rgb = np.asarray(rgb, dtype=float)
    if rgb.shape[-1] != 3 or not np.isfinite(rgb).all() or np.any((rgb < 0) | (rgb > 255)):
        raise ValueError('Expected finite RGB triplets in 0..255')
    encoded = rgb / 255.0
    linear = np.where(encoded <= .04045, encoded / 12.92, ((encoded + .055) / 1.055) ** 2.4)
    matrix = np.array([[.4124564,.3575761,.1804375], [.2126729,.7151522,.0721750], [.0193339,.1191920,.9503041]])
    xyz = (linear @ matrix.T) / np.array([.95047, 1.0, 1.08883])
    delta = 6 / 29
    f = np.where(xyz > delta ** 3, np.cbrt(xyz), xyz / (3 * delta ** 2) + 4 / 29)
    return np.stack([116*f[...,1]-16, 500*(f[...,0]-f[...,1]), 200*(f[...,1]-f[...,2])], axis=-1)


def delta_e(lab_a, lab_b):
    """CIE76 Euclidean colour distance, allowing NumPy broadcasting."""
    return np.linalg.norm(np.asarray(lab_a) - np.asarray(lab_b), axis=-1)
