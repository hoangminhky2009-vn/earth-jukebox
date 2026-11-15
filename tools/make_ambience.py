# Written by Ky with help from Claude (SI). See AI_USE.md.
"""Turn the CC0 field recordings (see CREDITS.md) into short seamless loops for the page.

Usage: python tools/make_ambience.py <folder with the source recordings> [--only name ...]
Sources: rain_2.ogg rain_4.ogg birds.wav wind.wav hill.ogg howl.ogg, and the regional bird recording
mekong.ogg (Siem Reap birds for Tonle Sap and Hue; park birds elsewhere).
Writes docs/audio/ambience/<name>.mp3 (stereo, 44.1 kHz, 96 kbps); a job whose source is missing is skipped.
Each loop: cut a segment, blend its tail into its head over 2 s (so it repeats without a click),
and set the loudness to the same RMS so audio.js can mix them with plain gains. Needs ffmpeg and numpy.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
FADE = 2.0
TARGET_RMS = 0.08   # about -22 dBFS
OUT = Path(__file__).resolve().parent.parent / "docs" / "audio" / "ambience"

# name: (source file, start s, loop length s)
JOBS = {
    "rain-heavy": ("rain_2.ogg", 0.0, 22.0),
    "rain-light": ("rain_4.ogg", 2.0, 30.0),
    "birds": ("birds.wav", 3.0, 30.0),
    "wind": ("wind.wav", 1.0, 22.0),
    "snow-wind": ("hill.ogg", 12.0, 30.0),    # Killiney Hill storm, gusty wind on an exposed hill
    "snow-howl": ("howl.ogg", 20.0, 30.0),    # howling wind (skips the silent start)
    # regional birds (CREDITS.md)
    "birds-mekong": ("mekong.ogg", 1.0, 30.0),      # Siem Reap, Cambodia (near Tonle Sap)
}


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def make_loop(x: np.ndarray, start: float, length: float) -> np.ndarray:
    s, n, f = int(start * SR), int(length * SR), int(FADE * SR)
    seg = x[s:s + n + f]
    if len(seg) < n + f:
        raise ValueError(f"source too short: need {length + FADE + start:.1f} s")
    y = seg[:n].copy()
    ramp = np.linspace(0.0, 1.0, f, dtype=np.float32)[:, None]
    y[:f] = seg[:f] * np.sqrt(ramp) + seg[n:n + f] * np.sqrt(1.0 - ramp)   # equal-power blend: tail -> head
    y -= y.mean(axis=0)
    rms = float(np.sqrt(np.mean(y ** 2)))
    y *= TARGET_RMS / rms
    peak = float(np.abs(y).max())
    if peak > 0.98:
        y *= 0.98 / peak
    return y


def encode(y: np.ndarray, out: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", "96k", str(out)],
        input=y.astype(np.float32).tobytes(), check=True,
    )


def main() -> None:
    src = Path(sys.argv[1]); only = sys.argv[3:] if len(sys.argv) > 2 and sys.argv[2] == "--only" else None
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (file, start, length) in JOBS.items():
        if (only and name not in only) or not (src / file).exists():
            continue
        y = make_loop(decode(src / file), start, length)
        out = OUT / f"{name}.mp3"
        encode(y, out)
        print(f"{name}: {length:.0f} s loop from {file} @ {start:.0f} s -> {out.name} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
