# Sabik's data handoff — 14 November 2026

## Update — 15 November: snow and monthly maps

- The seasonal-comparison branch contains 32 rain/greenness records across eight places, with all 46 usable Ferlo months now mapped. The four Bormey descriptions in `reviewed_descriptions.json` are preserved for the fixed 15 July 2025 images; they are not reused as captions for other months.
- The earlier Tromso snow estimates are withdrawn. NASA's GIBS colour key renders both 0% and missing/cloud/night/water categories transparently. The old cross-month land mask and transparent-to-zero substitution cannot recover a land-average snow percentage. Both snow records now carry null values, explicit withheld status and a limitation. Imagery is visual context only; no numeric snow data notes play.
- `pipeline/snow.py` now withholds a month whenever any sampled cell is unresolved. `pipeline/evidence/snow.json` retains source hashes and observed colour counts and explains the withdrawal. Restore quantitative snow only from raw MOD10CM values and quality flags, with reviewed handling of valid zero, land/water and unavailable categories. See NASA's [colour key](https://gibs.earthdata.nasa.gov/colormaps/v1.0/MODIS_NDSI_Snow_Cover.xml) and [v6.1 guide](https://nsidc.org/sites/default/files/mod10cm-v061-userguide_0.pdf).

The earlier notes below describe the original four-place handoff. Human listening, actual NVDA use and physical-device checks still belong to the team's final review.

Written by Sabik with help from OpenAI Codex (SI). Ky owns the top-level project documentation; the suggested additions below are for him to integrate.

## Coordinates aligned with Ky's message

The current export uses exactly Dhaka (23.81, 90.41), Sylhet (24.90, 91.87), Tonle Sap (12.88, 104.07), and Hue (16.46, 107.59). These replace the earlier provisional points. All data and crops were regenerated. Dhaka's four discs and images are byte-for-byte unchanged, so Bormey can continue the Dhaka description already requested. Tonle Sap is no longer labelled "near Phnom Krom". Tonle Sap rain and greenness, plus Hue greenness, have changed readings; use the latest export.

## Geographic correction — replaces the earlier rain export

The first rain export used the wrong longitude origin. SVS 4897's Pacific-centred map starts at **20 E**, not 180 W. The old Dhaka sample at x=2704 was near 69.6 W in the Caribbean. The correct Dhaka pixel is **x=704, y=661**. All eight rain discs, crops and evidence were regenerated in commit `2612e53`. Do not use the earlier rain values or images. That longitude correction did not change NDVI; the later coordinate alignment described above does change Tonle Sap and Hue NDVI.

`python -m pipeline.verify_geography` independently registers the NASA coastlines against Natural Earth land polygons. Both inspected rain years select 20 E (over 99% land/ocean agreement); both NDVI years select -180 (over 96%). Rain alpha and composite opaque pixels agree 100%. See `evidence/geography-check.json`. This checks geographic placement, not physical rainfall accuracy. Additive `source.west_lon` records the layout in the JSON.

Ky: the x=2704 Dhaka example in `notes/00_start_here.md` and the generic formula in `notes/02_pipeline.md` need correction for rain. The original tests and note-to-data checks repeated the same incorrect assumption. The new regression tests check the longitude origin, sampling and image crop separately. July's Dhaka category happens to remain -1; that coincidence did not validate the earlier geography.

## What is ready

- `docs/data/discs.json`: **16 real discs** for Dhaka, Sylhet, Tonle Sap, and Hue; rain 2025/2026 and greenness 2024/2025. No fake observations. Ky's exact sampling coordinates and their scope are documented in `pipeline/PLACES.md`.
- **184 distinct source frames** were read and reused for all four places: rain 60 in 2025 and 52 in 2026, plus 36 greenness frames in each year. Source URLs, file hashes and readings are in `pipeline/evidence/`.
- Corrected Dhaka rain-2025 January–December levels: `[0,0,0,0,0,-1,-1,0,0,0,0,0]`, five valid frames each month, all 1,500 sampled pixels classified. This is colour-decoding success, not proof of rainfall accuracy.
- Rain 2026 has only two sampled November dates at the cutoff, 14 November. November fails the three-frame minimum and December is future; both stay null in every 2026 rain disc. There are no archive breaks in the requested dates. The four rain-2026 discs are `scratched`; the other twelve are `mint`.
- All 16 crops are 256 × 256. Each is a **15 July** reference image from the disc's year, not an annual average or an image synchronized to each playing month. The original Dhaka rain crop uses the 15 July 2025 NASA composite.
- At Ky's Tonle Sap point, rain-2025 is wetter in June and November and near normal in the other sampled months. The greenness window has 64.22% and 62.67% colour match in 2024 and 2025. Every sampled frame meets the fixed valid-pixel threshold, but the result describes accepted vegetation pixels in a mixed land/water window. Hue's greenness match is 84.00% and 83.89%. These are decoding-coverage rates, not accuracy claims.
- Ky's new upstream commit `a46be20` supplies the score and native Web Audio engine and moves music ownership to Ky. This branch keeps his implementation. Sabik's separate Tone.js prototype is preserved locally outside the repository and is not part of this handoff.

## Ky: integration

1. Change `DATA_URL` in your `docs/js/app.js` from `data/discs.sample.json` to `data/discs.json` when you integrate this branch. Your existing dynamic imports find your music modules. No script-tag change is required.
2. Both A/B sides are supplied, with the same twelve calendar-month positions. The two missing 2026 rain months stay null; do not substitute fake B-side observations.
3. Place introductions come from the latest team document. Crop descriptions remain empty pending Bormey's review of the actual images. The exporter preserves existing disc descriptions and independent checks when rerun.
4. Add the source and SI notes below to your owned documentation. The optional `source.west_lon` field records the verified map layout; existing contract fields and shared labels are unchanged.

## Run it

From the repository root, with Python and Node available:

```text
python -m pip install -r pipeline/requirements.txt
python -m pytest pipeline/tests -q
python -m pipeline.run --place dhaka --dataset rain --year 2025
node --test
python -m http.server 8000 -d docs
```

After Ky switches the data URL, open `http://localhost:8000/`, collect the Dhaka disc and press Play. June and July 2025 have a drier category; the other months are near normal. The encoded notes represent image categories; any added field recordings are illustrative, not recordings captured in Dhaka by NASA.

Downloads are cached outside the published website in `cache/` and never committed. Use `--refresh` to update NASA listings and retry failed downloads. A network failure stops an export; it does not become a scientific missing observation. Future and not-yet-published dates remain missing, with no invented values. Only holes inside the listed archive become `breaks`. The clarified condition rule is implemented and tested: breaks win as `skips`, otherwise a null month means `scratched`, otherwise `mint`. Saturation is checked as well.

Reproduce this full export with `python -m pipeline.run --all --variant light`. NDVI samples days 5, 15 and 25. The inspected timestamp rectangle is guarded and clear of all selected windows; see `pipeline/evidence/ndvi-light-layout.json`. `--all --day15` instead uses the agreed full-resolution, day-15-only fallback, with `source.sample_days` explicitly changed to `[15]`.

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
- Sabik used OpenAI Codex to help implement and test the Python pipeline. The new authored files and real-data provenance identify that assistance truthfully. A separately tested music prototype was not included after Ky took over music. Existing Claude-assisted team work remains separately credited.
- Natural Earth, public-domain 1:110m land geometry, is used only to verify geographic registration: https://www.naturalearthdata.com/about/terms-of-use/ . Source URL and SHA256 are recorded in `pipeline/evidence/geography-check.json`; the external file stays in the uncommitted cache.

## Remaining team checks

The [live team document](https://docs.google.com/document/d/1XgIDQHjdR-5IGtX96clUcxXklNICMZ_j9mVAuMOil0I/edit?tab=t.uv0ru88njche), read 14 November, currently proposes Dhaka, Sylhet, Tonle Sap and Huế. It supplies introductions but no sampling coordinates or checked crop descriptions yet. Its newer introductions correctly describe rainfall differences from normal; earlier ideas about daily downpours cannot be demonstrated with this monthly anomaly pipeline. Historical flood examples from 2020/2022 are background, not events captured by our 2025/2026 discs.

The pipeline now uses Ky's coordinates from his team message. Bormey should still check that the place stories describe these sampling areas and supply crop descriptions. Complete subjective listening, NVDA testing, and mobile/Safari testing. Merge the reviewed branch and switch the data URL before claiming the public Pages game uses these real observations.

Known upstream follow-up for Ky: `schedule.js` checks `breaks.has(bar)` even though the JSON contract uses months 1–12 and `bar` is 0–11. Use `bar + 1` and update the regression case. This does not affect the first Dhaka disc, whose breaks list is empty.

Audio check still to perform on Ky's latest engine: listen when entering a null month and confirm whether the intended crackle-only behaviour holds. Earlier code review raised possible music/reverb and field-recording tails, but Ky has since changed the engine; that observation is not a confirmed defect in the latest version.
