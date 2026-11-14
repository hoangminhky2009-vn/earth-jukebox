# 03 — `discs.json` format (contract between the pipeline and the web app) — option A

Agree it in the first 30 minutes on Nov 14; after that **only add fields, never rename or delete** (if you must, tell each other).
The music uses `levels` (integers); Science mode and the detail card use `values`. Full example: `00_start_here.md`.

## Root
| Field | Type | Notes |
|---|---|---|
| `version` | integer | Increase when fields are added |
| `generated` | ISO date-time string | When the pipeline ran |
| `provenance` | object | Required by the submission guide (SI must be acknowledged in code **and data** metadata): `{ "source": "Colours read from NASA SVS frames (Earth Information Center)", "made_with": "Python pipeline written by the team with help from Claude (SI); see AI_USE.md" }` |
| `datasets` | object | Labels + level table per dataset (below) — the web app reads labels from here, never hard-codes them |
| `places` | array of Place | |
| `discs` | array of Disc | |

## `datasets`
- `rain`: `label` = "Rain: wetter or drier than normal", `unit` = "mm/day compared with normal, smoothed over ~3 months",
  `svs` = "4897", `svs_url`, `levels` = 9 rows `{ level, min, max, value, label }` exactly as the A1 table in `02_pipeline.md`
  (e.g. `{ "level": -1, "min": -5, "max": -2, "value": -3.5, "label": "2 to 5 mm/day drier" }`; open ends use `null`).
- `ndvi`: `label` = "Vegetation greenness: low to high", `unit` = "position on the image's colour scale (0 = low, 1 = high); the scale has no NDVI numbers",
  `svs` = "5544", `svs_url`, `levels` = 4 rows `{ level, min, max, label }` (0–0.25 · 0.25–0.5 · 0.5–0.75 · 0.75–1).

## Place
| Field | Type | Notes |
|---|---|---|
| `id` | string | `dhaka`, `mekong`… |
| `name` | string | Name read by screen readers |
| `lat`, `lon` | number | Decimal degrees |
| `biome` | string | `rainforest`, `desert`, `monsoon-delta`… |
| `region` | string | `sea`, `south-asia`, `other` ⇒ picks scale + instrument |
| `story` | string | One sentence (Bormey) |

## Disc
| Field | Type | Notes |
|---|---|---|
| `id` | string | `dhaka-rain-2025` |
| `place` | string | Points to `places[].id` |
| `dataset` | `"rain"` \| `"ndvi"` | |
| `year` | number | Rain: 2025/2026 · NDVI: 2024/2025 |
| `side` | `"A"` \| `"B"` | A = older year, B = newer year, **same 12 calendar months** |
| `levels` | 12 × (integer \| null) | Rain −4…+4 · NDVI 1…4. `null` = missing |
| `values` | 12 × (number \| null) | Rain: the level's value (−17.5…17.5 mm/day) · NDVI: position 0–1 (2 decimals) |
| `saturated` | 12 × bool | Rain \|level\| = 4 · NDVI ≤ 0.02 or ≥ 0.98 |
| `frames_used` | 12 × integer | Valid frames in the month (rain max 5, NDVI max 3) |
| `match_pct` | number | % of pixels that matched the colour bar (A3) |
| `median_de` | number | Median ΔE of matched pixels |
| `condition` | `"mint"` \| `"scratched"` \| `"skips"` | |
| `breaks` | array of month numbers (1–12) | Months with missing SVS frames |
| `frame` | string | Crop image, relative path `data/frames/<id>.png` |
| `source` | object | `{ "svs": "4897", "svs_url": "https://svs.gsfc.nasa.gov/4897", "frames": "<frame folder>", "sample_days": [1, 8, 15, 22, 28] }` |
| `description` | string | Text description of the frame (Bormey), ≤ 40 words |
| `check` | null \| object | Stretch goal: `{ "source": "...", "sign_agree_pct": 83 }` |

## Validation rules (the pipeline runs them before writing; the web app runs them on load)
- Monthly arrays have exactly 12 items. `place` exists. `id`s are unique.
- Rain: `levels[i]` ∈ −4…4 and `values[i]` equals that level's `value`. NDVI: `values[i]` ∈ [0, 1] and `levels[i]` matches its quarter.
- A `null` month: `levels` and `values` both `null`, `saturated` false. Any `null` month ⇔ `condition` ≠ `mint`.
- An A/B pair with the same `place` + `dataset` has different `year`s.
- Invalid ⇒ the pipeline stops; the web app shows a text error (no blank page).

## Fake sample file (Ky makes it on Nov 14 in 10 minutes, with all edge cases)
3 places × 2 datasets, including: one rain 2026 disc with Nov–Dec `null` (scratched), one disc with `breaks: [6]` (skips), one rain disc with level ±4 (saturated),
one NDVI disc with `values` = 1.00 (saturated), one A/B pair. The fake file has an extra root field `"fake": true` so it is never mistaken for real data.
