# Data expansion ready for review — 15 November 2026

Prepared by Sabik with help from OpenAI Codex (SI).

## Ready for Ky

This branch adds northern Ferlo, Senegal, to the seven existing places. It contains **8 places, 32 real-data discs**, and four new 256-pixel reference images. It uses the existing rain and vegetation datasets and music rules; no new dataset or app interface is required.

- Ferlo centre: **15.6035 N, 15.2857 W**. The point is published site C2L4 in [Brandt et al. (2014), Table 1](https://www.mdpi.com/2072-4292/6/3/2408), an open tree/shrub savanna landscape with pasture and small-scale cropping.
- Rain: 2025 side A and 2026 side B. Vegetation: 2024 side A and 2025 side B.
- All **28 existing discs retain their scientific fields and identical reference-image bytes**. Four existing rain-2025 discs now include Bormey's checked descriptions, preserved word for word from the shared document. Their source snapshot is in `reviewed_descriptions.json`.
- Corrected three draft introductions to say “rainfall differences from normal and vegetation greenness”: greenness is not an anomaly from normal.
- Existing places were reprocessed from the cached NASA images. Existing evidence records are retained; Ferlo's new readings, actual source hashes and crops are appended to each dataset/year evidence file. Cached PNG bytes can differ from later downloads without pixel changes: one historical NDVI source was downloaded again and its decoded pixels matched exactly despite different SHA256 hashes.

Merge after reviewing the data and the Ferlo story. No web, music or top-level documentation files were edited. The existing app discovers the new discs under **More places**. Ferlo currently uses the generic artwork and music style; it does not claim to reproduce Senegalese instruments. Dedicated grassland artwork is optional, not needed for loading or playback.

## Checked

- Python: **67 tests pass**. JavaScript: **85 tests pass**.
- Real-data score round trip: **384/384 monthly entries match**; missing entries remain missing. Science-mode greenness error is at most **0.0200**, within the 1/48 test tolerance.
- All 32 discs match their monthly evidence and have valid 256 × 256 image files. The export uses **184 distinct dated source URLs**.
- Local browser: Ferlo selection by keyboard, playback state, Stop, A/B flip, Details, image loading and missing months; no console warnings/errors during the check. Switching to Tonle Sap updates the piano-roll description correctly with the current populated tray. Dhaka's new description appears as image alternative text and in Details.
- This was not an NVDA test or a subjective listening assessment. Those remain with the team. The current application already fixes the previously reported one-month gap-marker error. Its null-slot guard is still absent, but the current main tray has no empty slots, so the earlier switching exception did not recur.

## For Yen: the short story

“Compare one landscape across two years. In our Ferlo samples, vegetation reaches the higher greenness category in August 2024 and September 2025. The same colour-to-sound rules let listeners explore that difference.”

This is a comparison of two sampled years, not evidence of a long-term climate trend. In music mode several numerical values share one category; use Details or science mode to inspect finer differences. The 2025 numerical maximum is October (0.74 on the image colour scale), while September, October and November all use music level 3.

## For Bormey

Use [the Ferlo review sheet](FERLO_REVIEW.md) for the images, dates, monthly values, caption drafts and sources. Its four new caption drafts are not inserted into the app as reviewed text. The four completed Bangladesh/Cambodia/Vietnam rain-2025 descriptions are now included; **28 of the 32 discs still use the app's factual fallback image description** while reviewed text is completed.

## Important limits

Ferlo rain is in the near-normal colour category in every valid sampled month. This does **not** mean zero rainfall or no dry season. November and December 2026 stay null: the refreshed listing ends on 13 November, giving only two scheduled November frames, below the three-frame minimum.

Every Ferlo vegetation month has 3 valid frames in both years, with 100% of sampled pixels matching the colour scale. This is decoding coverage, not scientific accuracy. The 5 × 5 vegetation window spans about 47 × 49 km, so the story describes a landscape around the coordinate, not a particular field or watering hole. The much wider reference crop is a dated 15 July image, not the annual average or a view synchronized to each playing month. The rain map accumulates daily departures and lets them fade over about three months. Greenness values are colour-scale positions, not measured NDVI.

## Reproduce and finish credits

Run `python -m pipeline.run --all --variant light`, `python -m pytest pipeline/tests -q`, and `node --test`. The exporter preserves descriptions already present in `discs.json`. Raw source frames remain in the ignored local cache.

Ky can integrate these three method lines into HOW_IT_WORKS:

The expanded collection includes a northern Ferlo savanna landscape using the same NASA colour-reading rules as the other places.
Comparing its 2024 and 2025 vegetation discs illustrates differences in the timing of higher greenness categories.
Source hashes, frame counts and missing-data flags are retained; colour positions and musical categories are not direct satellite measurements.

Credit additions for Ky: NASA Scientific Visualization Studio [rain SVS 4897](https://svs.gsfc.nasa.gov/4897/) and [vegetation SVS 5544](https://svs.gsfc.nasa.gov/5544/); Brandt, Verger, Diouf, Baret and Samimi (2014), *Remote Sensing* 6, 2408–2434, DOI [10.3390/rs6032408](https://doi.org/10.3390/rs6032408), CC BY, for site coordinates/background; NASA Earth Observatory, Adam Voiland (2020), [Scouting Watering Holes from Space](https://science.nasa.gov/earth/earth-observatory/scouting-watering-holes-from-space-146490/), for herding context. No photographs or figures from those articles were copied. The values come from SVS frames, not those background articles. This data work used OpenAI Codex assistance.
