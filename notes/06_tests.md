# 06 — Tests + "done" criteria — option A

## Hand-built data for the pipeline (write these on Nov 14, before running on real data)
| # | Case | Build | Correct answer |
|---|---|---|---|
| 1 | Coordinates | 360×180 image, (lon 105, lat 10) · 3600×1800 image, Dhaka (lon 90.41, lat 23.81) | pixel (285, 80) · (2704, 661) |
| 2 | Transparent ≠ missing | 5×5 window, all alpha 0 but RGB = (95,54,3) | level 0, **not** `null` |
| 3 | Exact bar colour | Window of (0,69,56,255) | level +1, value 3.5 |
| 4 | Slightly-off colour | Window of (95,54,3,255) | level −1 (ΔE 4.9 < 10) |
| 5 | Bad pixels | 60% of pixels (128,128,128,255) | `null` |
| 6 | Saturated | All (189,230,225) · all (242,226,185) | +4 saturated · −4 saturated |
| 7 | Median toward 0 | 12 pixels −1 + 12 pixels +1 + 1 bad · 13 pixels +2 + 12 transparent | 0 · +2 |
| 8 | Rain month | 5 frames: −1, −1, 0, −2, `null` · only 2 valid frames | −1 (`frames_used` 4) · `null` |
| 9 | NDVI bar | 2-colour gradient bar, pixel exactly the colour at 25% | `p` = 0.25 ± 0.01 |
| 10 | NDVI snow, ocean | Window of (255,255,255) · window of (8,123,176) | `null` · `null` |
| 11 | NDVI level | `p` = 0.24 · 0.25 · 0.74 · 0.75 | 1 · 2 · 3 · 4 |
| 12 | Rain music | k = −4 … +4 | 0, 2, …, 16 notes; counting back gives the same k |

If a hand-worked answer turns out wrong ⇒ fix the answer and write it down (it happened twice in our last project).
Real numbers to compare against (read on Nov 12, frame 2025-07-15): Dhaka rain = −1 (25/25 pixels matched) · Mekong (Can Tho) rain = 0 (24/25 transparent) ·
NDVI Dhaka ≈ 0.36 · Sahara ≈ 0.15 · Amazon = 1.00 (saturated) · Pacific Ocean, Greenland = `null`.

## Web checks (Ky)
- Fake file with edge cases loads without a blank page; broken JSON ⇒ text error.
- Keyboard only, end to end: pick place → record → play → flip → details → stop.
- NVDA + Chrome/Firefox: every action is announced; every button has a name; the labels "wetter/drier than normal" and "low to high greenness" are read correctly.

## "Done" by milestone
| Milestone | Done when |
|---|---|
| Nov 14 + 30 min | `discs.sample.json` has all edge cases; repo has README + LICENSE + first commit |
| Nov 14 + 1 h | The 11 hand-built A1–A2 tests pass (case 12 is music, checked in S5); rain colour table re-checked on a composite |
| Nov 14 evening | 1 real disc (Dhaka × rain × 2025): frames → levels → JSON → plays sound, with a "colour match X%" line |
| Nov 15, 12:00 | 4–6 places × 2 datasets; list + keys + aria-live work; GitHub Pages is live |
| Nov 15, 21:00 | Pre-submission checklist passes |
