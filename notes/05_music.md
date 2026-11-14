# 05 — Music engine (Sabik's part; written here so both halves fit together) — option A

## Principles
- The data → music rules are **identical for every place, every year and both sides A/B**. A region only changes the **scale + instrument**.
- The music reads `levels` (integers) ⇒ exactly reversible. Science mode reads `values`.
- Keep **building the note schedule** (a pure function, testable, no audio needed) separate from **playing** it (Web Audio, `audio.js`). The piano roll and the round-trip check use the schedule.

## Note schedule
- 120 BPM, 4/4. **1 month = 1 bar** = 2 seconds ⇒ 12 months = 24 seconds. Grid of 16 sixteenth notes per bar.
- **Chord bed:** a 4-bar loop in the region's scale ⇒ 12 bars = 3 loops. Always plays (except in `null` bars).
- **Rain disc — level k (−4…+4) → raindrops:**
  - Notes per bar `n = 8 + 2k` ⇒ 0, 2, 4, …, 16. Spread the n notes over the 16 grid steps with a **Euclidean rhythm** (even, groovy, not random).
  - Pitch: k < 0 ⇒ low octave · k = 0 ⇒ middle · k > 0 ⇒ high. Drier = sparse + low, wetter = dense + high.
  - k = −4 ⇒ 0 notes: only the chord bed remains (drought = no raindrops). It can't be confused with a missing month, because missing months crackle.
  - Saturated (|k| = 4) ⇒ accent (maximum velocity) for the whole bar.
- **NDVI disc — level q (1…4) → layers:** q voices in the chord bed (1 = thin, 4 = full), steady pulse of 4 notes per bar. Each voice in its own octave.
- **`null` month:** the whole bar is crackle (filtered noise + clicks); no data notes, no chord.
- **Month in `breaks`:** record skip (cut 1/4 of the bar) + a rough warning sound — **used only here**.
- **Science mode:** one voice, no chords, 4 notes per bar. Pitch: rain = base + 2 semitones × k (9 pitches); NDVI = base + round(24 × `values`) semitones (2 octaves).

## Regions
| `region` | Scale | Instrument (idea) |
|---|---|---|
| `sea` | Major pentatonic | Plucked (close to đàn tranh / roneat): Karplus–Strong |
| `south-asia` | Dorian (close to Kafi) | Flute (close to bansuri): sine + light vibrato |
| `other` | Lydian | Bright synth (fits the futuristic UI) |

Real samples only if CC0 / CC-BY; otherwise synthesise.

## Interface for joining up (the contract — both sides code against exactly this)
- `disc` and `place` are always the **full objects** from `discs.json` (never ids). `mode` is the string `"music"` or `"science"`.
- `docs/js/schedule.js`: pure function `schedule(disc, place, mode)` ⇒ list of notes `{ bar, step, voice, pitch, velocity, kind: "data"|"bed"|"crackle"|"skip" }`,
  `bar` 0–11, `step` 0–15, `pitch` = MIDI number. **No audio code in this file**, so it runs under `node --test` and in the round-trip check.
  - Rain: raindrops are `data`; the chord bed is `bed`.
  - NDVI: the q layers are `bed` notes, **one distinct `voice` number per layer** (0 … q−1) ⇒ count distinct bed voices to get q. No `data` notes in Music mode.
  - `null` month: only `crackle` notes in that bar.
  - Month in `breaks`: `schedule` keeps every normal note of that bar and adds **one** `skip` note (step 12). Cutting the last quarter happens only in `audio.js`.
  - Science mode: one voice of `data` notes, 4 per bar.
- `docs/js/audio.js` (ES module) exports exactly:
  `start()` (async; resumes the AudioContext after the first click or key press; nothing plays before it) ·
  `load(disc, place)` · `play()` · `pause()` · `stop()` · `seek(month 0–11)` · `setMode("music"|"science")` · `duck(db, ms)` · `setVolume(0–1)` ·
  `onTick(fn)` — `fn(bar)` with an **integer 0–11, once per bar**; the piano roll slides its playhead across the bar itself (2 s per bar).
  Ky's `audio-stub.js` has the same exports.
- No Tone.js (Nov 14): `audio.js` uses the Web Audio API directly, every sound synthesized, so nothing is vendored.
- Lofi style (Nov 14): the rain chord bed is a seventh chord (4 bed notes), loop ii-V-I-vi; audio.js adds a half-time beat, bass and swing
  that carry no data and stop in null bars and science mode, so the round trip is unchanged.
- Field-recording bed (Nov 14): real CC0 recordings under the music, chosen by `ambience.js` from the month's level only
  (rain: wind → light rain → heavy rain; greenness: wind → birds; missing month: silent). Science mode has no bed.
- Sabik may create `docs/audio-test.html` (his own test page) — never edit Ky's `index.html` / `app.js`.
- Text for listeners comes from `datasets.<dataset>.levels[].label` (e.g. "2 to 5 mm/day drier").

## Round-trip check
From the schedule: rain ⇒ count `data` notes per bar ⇒ `k = (n − 8) / 2`; NDVI ⇒ count bed voices ⇒ q; a `null` bar must contain only `crackle`.
Compare with `levels`: expect **100% match** (the mapping is one-to-one). Science mode: pitch ⇒ `values`, NDVI error ≤ 1/48. Put the numbers in the README.
Advanced (only if time): record the real audio ⇒ onset detection ⇒ count notes.
