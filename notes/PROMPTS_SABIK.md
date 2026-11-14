# Detailed prompts — Sabik (paste one package per new Claude session, in order)

How to use
- **Before Nov 14: read only.** No code before the hackathon starts (Space Apps FAQ: teams may not begin working on the challenge before the event).
- Open each session inside the repo folder (Ky sends the link at 9:00 on Nov 14). Default to **Sonnet**; Opus only if stuck for more than 15 minutes.
- Paste the block as it is. Fill in the `«…»` parts. Don't add extra jobs to a package — one package per session.
- After each package, read the table Claude reports; if anything says "not checked", ask before moving on.

| Package | When | Time | Done when |
|---|---|---|---|
| S0 | Nov 14, first 15 min | 15 min | Tools checked, repo cloned |
| S1 | First hour (runs in background) | 30 min + download | Frames downloading, NDVI version decided |
| S2 | Nov 14 morning | 1.5 h | 11 hand-built tests pass |
| S3 | Late morning | 1 h | First real disc (Dhaka × rain × 2025) in `discs.json` |
| S5 | Nov 14 afternoon | 1.5 h | `schedule.js` + tests pass |
| S6 | Afternoon / evening | 1.5 h | Every sample disc plays 24 s with Tone.js |
| S4 | Nov 14 evening or Nov 15 morning | 1 h | All places × 2 datasets × 2 years |
| S7 | Nov 15 | as needed | Sound tuned by ear, data rules untouched |
| S8 | Only if everything else is done | 45 min | Independent sign check |

---

## S0 — Set up (Nov 14, first 15 minutes)
Without Claude: Python ≥ 3.10 · `pip install pillow numpy requests pytest` · Node.js ≥ 20 (`node --version`; if missing install the LTS from nodejs.org) · git · accept Ky's GitHub invite · `git clone «repo link»`.
```
Read CLAUDE.md and notes/00_start_here.md. Check my environment: python --version, pip show pillow numpy requests pytest, node --version, git --version.
Report a table: tool | version found | OK for our plan? Install nothing without asking me.
```

---

## S1 — Start the downloads first (first hour, runs in the background)
SVS was very slow on Nov 13 (60-second timeouts), so get the frames early.
```
Read notes/02_pipeline.md ("Frame sources" and "Monthly values"). Write pipeline/fetch.py:
- Build the list of frames we need. Rain (SVS 4897, flatalpha 3600x1800): every month Jan 2025 → Nov 2026, days 1, 8, 15, 22, 28
  (skip future dates and dates missing from the SVS folder listing). NDVI (SVS 5544): Jan 2024 → Dec 2025, days 5, 15, 25.
- NDVI version: first download ONE frame of the 4096x2048 "equirectangular_w_dates" version, find the box where the date text is drawn,
  and check that none of our places (pipeline/places.json) falls inside it. Clear ⇒ use the 4096 version; otherwise use the 8640x4320 version, day 15 only
  (then an NDVI month needs just that 1 frame and sample_days = [15] — see notes/02_pipeline.md "Monthly values"). Print the decision.
- Save to cache/frames/<dataset>/<original file name>; skip files already there; timeout 120 s; 3 retries waiting 5, 15 and 30 s.
  At the end print: wanted / downloaded / failed, total MB, and the list of failed dates.
- Also download once into cache/bars/: the NDVI colour bar (a005544/NDVI_colorbar.png) and one rain composite frame that shows the labelled colour bar.
Create pipeline/places.json with Dhaka first (id, name, lat, lon, biome, region, story) — Bormey will send the other places.
Make sure cache/ is in .gitignore. First line of every file: "Written by Sabik with help from Claude (SI). See AI_USE.md."
Start the download in the background and keep working; tell me the command to check progress. Commit "pipeline: frame downloader".
```

---

## S2 — Hand-built tests first, then the reader (Nov 14 morning)
```
Read notes/06_tests.md (cases 1–11) and notes/02_pipeline.md (A1, A2, Monthly values).
1. Write pipeline/tests/test_reader.py with all 11 cases exactly as in the table, building the small test images in memory with NumPy/Pillow.
   Run it — it must fail at first (nothing is implemented yet).
2. Implement until every test passes, in small modules:
   - pipeline/colour.py — sRGB → CIELAB and ΔE (CIE76) with NumPy.
   - pipeline/bars.py — the 8-colour rain table (levels −4…+4, values and labels exactly as in notes/00_start_here.md)
     and NDVI bar sampling (256 samples along x 101 → 798, each the median of rows 115–135).
   - pipeline/reader.py — lat/lon → pixel; window; per-pixel class (rain: check alpha FIRST; NDVI: reject near-white and ΔE > 15);
     more than 50% bad ⇒ None; frame value (rain: median truncated toward 0; NDVI: median position).
   - pipeline/months.py — monthly values (rain needs ≥ 3 of 5 frames, NDVI ≥ 2 of 3, or 1 of 1 with the day-15-only fallback), saturation flags,
     NDVI quarter levels — computed from the value rounded to 2 decimals (the stored number), so the web validator agrees.
3. If a hand-worked answer in notes/06_tests.md looks wrong, STOP and tell me. Never change a test just to make the code pass.
Report a table: case | pass/fail. Commit "pipeline: colour reader + hand-built tests".
```

---

## S3 — First real disc: Dhaka × rain × 2025 (late morning)
```
Using the downloaded frames, write pipeline/run.py (CLI: --place, --dataset, --year, --all) and pipeline/validate.py
(exactly the "Validation rules" in notes/03_json.md).
- For Dhaka × rain × 2025 print, for each month: frames_used, the 5 frame levels, the month level, match %.
- Build the disc exactly as notes/03_json.md says (levels, values, saturated, frames_used, match_pct, median_de, condition, breaks, frame, source,
  description = "" for now, check = null). Root: version, generated (UTC now), provenance, datasets (labels exactly as in notes/00_start_here.md), places.
- Crop 256x256 around Dhaka from the 15 July 2025 "flatcomposite" 3600x1800 frame (download that one frame) ⇒ docs/data/frames/dhaka-rain-2025.png.
- Validate, then write docs/data/discs.json. Never write an invalid file.
Sanity check: the 15 July 2025 frame alone must give level −1 for Dhaka (see notes/00_start_here.md). Show me the month table.
Commit "pipeline: first real disc (Dhaka rain 2025)". Then tell Ky the file is ready.
```

---

## S5 — schedule.js, pure and tested (Nov 14 afternoon)
```
Read notes/05_music.md completely ("Interface for joining up" is the contract with Ky: full disc/place objects, mode "music"|"science",
NDVI layers = bed notes with distinct voices, breaks bar = normal notes + one skip note). Write docs/js/schedule.js — NO Tone.js import, no DOM — exporting:
- euclid(k, n): Bjorklund algorithm, array of n booleans with k hits spread evenly.
- schedule(disc, place, mode) ⇒ notes {bar, step, voice, pitch, velocity, kind} following every rule in notes/05_music.md:
  16 steps × 12 bars; rain n = 4 + k raindrops spread with euclid (was 8 + 2k; the music part moved to Ky on Nov 14); register by the sign of k; accent when |k| = 4;
  NDVI q bed voices with a steady 4 notes per bar; 4-bar chord loop in the region's scale (sea = major pentatonic, south-asia = Dorian, other = Lydian);
  null month ⇒ only crackle; month in breaks ⇒ skip; Science mode ⇒ one voice, 4 notes per bar, pitch = base + 2k semitones (rain)
  or base + round(24 × value) (NDVI). Pitches as MIDI numbers. Deterministic: the same disc always gives the same notes.
Then docs/js/schedule.test.mjs (node --test): n = 0, 2, …, 16 for k = −4…4; euclid(5, 16) has 5 evenly spread hits; a null month has only crackle;
a breaks month has a skip; NDVI gives q voices; Science pitches are correct; same input ⇒ same output; every step in 0–15 and bar in 0–11.
Run `node --test` from the repo root (on Node 22+ a folder argument such as `docs/js/` fails). First line of each file: the SI comment. Commit "music: pure schedule + tests".
```

---

## S6 — audio.js: playing it (Nov 14 afternoon / evening)
```
Vendor Tone.js: download the latest stable single-file UMD build (Tone.js) into docs/vendor/tone/ and send Ky one line for CREDITS.md (name, version, MIT licence, link).
Write docs/js/audio.js (ES module) that imports ./schedule.js and the vendored build (`import '../vendor/tone/Tone.js';` then use window.Tone — see notes/05_music.md)
and exports exactly: start() (async, calls Tone.start()), load(disc, place), play(), pause(), stop(), seek(month), setMode("music"|"science"),
duck(db, ms), setVolume(0–1), onTick(fn) (fn gets an integer bar 0–11, once per bar). disc and place are the full objects from discs.json.
- Instruments by region: sea = plucked (Tone.PluckSynth), south-asia = flute-like (sine + gentle vibrato), other = bright synth. Bed = soft pad.
  Crackle = filtered noise + random clicks for the whole bar. Skip = cut the last quarter of the bar + a short rough buzz.
- Sound starts only after the user presses "Press to start" (Tone.start()). Keep CPU low: reuse synths, never create nodes per note.
- duck(−12, 1500) lowers the master volume for 1.5 s, then restores it.
Test in the browser with your own page docs/audio-test.html (a start button + one button per disc; never edit Ky's index.html or app.js),
loading Ky's docs/data/discs.sample.json (python -m http.server 8000 -d docs): every disc plays 24 s; stop, seek and flip work; no console errors.
Commit "music: playback with Tone.js".
```

---

## S4 — All places, both datasets, both years (Nov 14 evening or Nov 15 morning)
```
Add Bormey's places «paste list» to pipeline/places.json (west → east). Run `python -m pipeline.run --all`:
rain 2025 (side A) + 2026 (side B), NDVI 2024 (A) + 2025 (B) for every place.
Print a summary: disc | condition | null months | saturated months | match % | median ΔE. Flag any disc with match % < 90 or more than 3 null months
and say why (cloud, ocean, snow, date text…). Do NOT tune thresholds to make numbers look better; if a threshold looks wrong, explain and ask me.
Make a crop for every disc (rain from flatcomposite, NDVI from the NDVI frame).
Fill each disc's "description" from Bormey's texts in pipeline/descriptions.json ({"<disc id>": "text ≤ 40 words"}); a missing one stays "" and goes in the summary.
Validate, write discs.json, commit "pipeline: all places".
```

---

## S7 — Tune by ear (Nov 15)
Listen first, then describe exactly — it saves turns:
```
On disc «id», bar «month», I hear «what you hear, e.g. "the raindrops are louder than the bed and sound harsh"». I want «what you want».
Change only «instrument / velocity / filter / reverb». Keep the data rules in notes/05_music.md unchanged.
Tell me which numbers you changed and why, and re-run node --test.
```
Never change n = 4 + k (Ky's music rule since Nov 14), the layer counts or the crackle/skip rules — that would break Ky's round-trip check.

---

## S8 — Optional, only if everything else is done
```
Stretch goal (notes/02_pipeline.md, A3): for each place, compare our rain sign (wetter/drier) per month with an independent source:
NASA POWER monthly precipitation (PRECTOTCORR) for 2025–2026 minus that month's 2017–2024 average (POWER has a known break in 2016, so don't use older years).
Report the % of months where the sign agrees, ignoring months with level 0 or |POWER anomaly| < 0.5 mm/day.
Store it as disc.check = {source, sign_agree_pct}. If agreement is low, report it honestly — do not tune anything.
```

---

## When stuck (paste any time)
```
Stop. In 5 lines: what you were doing, the exact error (pasted), what you tried. Give 2 fixes with pros and cons, pick one, then do it.
```

## When your quota is about to run out
```
Write notes/handoff_sabik.md in the repo (10 lines): what is done, what is half-done (file + line), the next step, the test command. Then stop.
```
