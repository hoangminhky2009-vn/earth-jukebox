# Sabik's first working handoff — 14 November 2026

Written by Sabik with help from OpenAI Codex (SI). Ky owns the top-level project documentation; the suggested additions below are for him to integrate.

## What is ready

- `docs/data/discs.json`: one real disc, Dhaka rain 2025, side A. It contains no fake observations.
- All 60 requested NASA frames were read: five dates for each of twelve months. Levels January–December: `[1,0,0,0,0,0,-1,0,2,2,1,1]`.
- 1,500 of 1,500 sampled pixels were classified. This is colour-decoding success, not proof of rainfall accuracy. Detailed source URLs, file hashes and readings are in `pipeline/evidence/rain-2025.json`.
- `docs/data/frames/dhaka-rain-2025.png` is a 256 × 256 regional crop of the **15 July 2025** NASA composite. It is one dated image, not an annual average. Its centre represents Dhaka.
- `docs/js/schedule.js`, `docs/js/audio.js`, and `docs/audio-test.html` provide the score and working synthesis. Tone.js 15.1.22 is included locally with its MIT licence.

## Ky: integration

1. Change `DATA_URL` in your `docs/js/app.js` from `data/discs.sample.json` to `data/discs.json` when you integrate this branch. The existing dynamic imports find the real schedule and audio modules. No script-tag change is required.
2. This first disc has only side A. The store already handles the missing B side. Do not substitute fake B-side observations.
3. Bormey's story and frame description are deliberately empty pending reviewed text. The exporter preserves existing disc descriptions and independent checks when rerun. Add the agreed place stories to `pipeline/places.json` before expanding.
4. Add the source and SI notes below to your owned documentation. There are no new JSON schema fields and the shared labels are unchanged.

## Run it

From the repository root, with Python and Node available:

```text
python -m pip install -r pipeline/requirements.txt
python -m pytest pipeline/tests -q
python -m pipeline.run --place dhaka --dataset rain --year 2025
node --test
python -m http.server 8000 -d docs
```

Open `http://localhost:8000/audio-test.html`, choose **Start sound**, then **Play**. Each month lasts two seconds, so a year loops in 24 seconds. Use the month selector to hear July's drier category or September's wetter category. These are musical choices encoding image categories, not recordings of rain.

Downloads are cached outside the published website in `cache/` and never committed. Use `--refresh` to update NASA listings and retry failed downloads. A network failure stops an export; it does not become a scientific missing observation. Future and not-yet-published dates remain missing, with no invented values. Only holes inside the listed archive become `breaks`.

`--all --day15` expands the configured places to both rain years and both NDVI years, using the agreed full-resolution, day-15-only NDVI fallback. Without `--day15`, NDVI samples days 5, 15 and 25 and requires more downloading. The light-image option needs a visual check that date labels avoid every selected place before use.

## Scientific limits to retain in the explanation

- [NASA SVS 4897](https://svs.gsfc.nasa.gov/4897/) shows precipitation departure from normal. Daily departures are added and fade over about three months. The output is not monthly rainfall totals and should not be described as a simple three-month average.
- Rain numeric values are representatives of colour bins. For example, level −1 stores −3.5 to represent the −5 to −2 bin; −3.5 is not an independently measured exact anomaly. Level −4 does not mean no rainfall or establish a drought diagnosis.
- [NASA SVS 5544](https://svs.gsfc.nasa.gov/5544/) supplies the vegetation images. Values from its unnumbered legend are relative positions on that image's colour scale, not measured NDVI values.
- Transparent rain pixels mean the near-normal category. They count as successfully classified but have no opaque colour-distance measurement. `median_de` excludes those pixels; if none are opaque, its required numeric field is 0 by convention, explicitly marked in evidence.
- The legend check in `pipeline/evidence/rain-legend-check.json` reproduces Dhaka −1 and Can Tho 0 for 15 July 2025. The agreed −1 RGB is a boundary shade; the actual interior shade remains within the agreed matching tolerance.
- Independent physical-data comparison is not done: `check` remains `null`. Music round-trip checks recover the encoded categories from the score, not exact satellite measurements from a recorded audio waveform.
- The regional sounds are generic synthesized timbres, not authentic recordings or faithful reproductions of local instruments.

## Suggested HOW_IT_WORKS additions

The Python pipeline samples a small area around each agreed place in dated NASA frames and converts the legend colours into monthly categories.
The music schedule turns those categories into repeatable notes; the browser synthesizes them while retaining silence/noise cues for missing observations.
Source hashes, frame counts and colour-match evidence make the image decoding reproducible, with scientific limits stated separately from musical choices.

## Credits and SI additions for Ky

- NASA's Scientific Visualization Studio: SVS 4897 precipitation images and crop; SVS 5544 vegetation images and colourbar when included. Preserve the attribution listed on each source page and link [NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). These NASA materials are not being relicensed as CC0 by this project.
- Tone.js 15.1.22, Yotam Mann and contributors, MIT. Exact download, hash and licence are in `docs/vendor/tone/SOURCE.md` and `docs/vendor/tone/LICENSE.md`.
- Sabik used OpenAI Codex to help implement and test the Python pipeline, monthly score and Tone.js audio engine. The new authored files and real-data provenance identify that assistance truthfully. Existing Claude-assisted team work remains separately credited.

## Remaining team checks

Confirm Bormey's final 4–6 places, their coordinates and reviewed descriptions before the full export. Complete subjective listening, NVDA testing, and mobile/Safari testing. Merge the reviewed branch and switch the data URL before claiming the public Pages game uses these real observations.
