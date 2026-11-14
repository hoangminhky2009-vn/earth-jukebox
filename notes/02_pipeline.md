# 02 — Data pipeline (A1–A4), written spec — option A (team decision, Nov 12)

Goal: for each place × dataset × year, produce 12 monthly **levels read from the EIC frames**:
- **Rain** = "wetter / drier than normal" (SVS 4897: IMERG rain compared with its long-term average, smoothed over ~3 months).
- **NDVI** = "vegetation greenness from Low to High" = **position on the colour bar**, 0–1 (the bar has no numbers).
No mandatory VEDA comparison any more; it is replaced by a **colour-match check** (A3). Worked example: `00_start_here.md`.

## Frame sources (tested Nov 11–12)
| Dataset | Frame folder (prefix `https://svs.gsfc.nasa.gov/vis/a000000/`) | Image | Dates available | Years we use |
|---|---|---|---|---|
| Rain | `a004800/a004897/frames/3600x1800_2x1_15p/flatalpha/imergvar_alpha.YYYY.MM.DD.png` | 3600×1800, 0.1°/px, RGBA, alpha is only 0 or 255, ~0.26 MB | 2024-07-01 → today, missing 2024-11-26/27 | **2025 (A) vs 2026 (B)**; 2026 has no Nov–Dec ⇒ "scratched" disc |
| NDVI | `a005500/a005544/frames/8640x4320_2x1_30p/equirectangular/SNPP_VIIRS.YYYYMMDD.ndvi_w_snow.oceanblue.png` | 8640×4320, ~0.042°/px, RGB, ocean blue, snow white, **~15 MB** | 2023-12-27 → 2026-06-13, no gaps | **2024 (A) vs 2025 (B)** |
| NDVI (light) | `a005500/a005544/frames/4096x2048_2x1_30p/equirectangular_w_dates/` | 4096×2048, date text burned in | same | use if the date text does not cover our places |

- Both are **standard equirectangular** frames (−180° at the left edge, 90°N at the top), checked with known points.
- **Do NOT** use the 1920×1080 composite frames for coordinates (16:9, Pacific-centred, not a plain 2:1 map). Use them only to look at the labelled colour bar.
- Image next to the disc: rain uses the `3600x1800_2x1_15p/flatcomposite/` version (same grid, with a base map); NDVI is cropped from the NDVI frame.
- Download each frame once and read all places from it. Keep downloads in `cache/` and **never commit** the full frames (`.gitignore`); commit only small crops.

## A1 — Colour bars
**Rain (8 colours + transparent; read from the labelled bar on the composite frame):**
| Level | Bar RGB | Meaning (mm/day compared with normal) | Value stored |
|---|---|---|---|
| −4 | (242,226,185) | below −15 (segment −20…−15 plus the arrow) | −17.5, **saturated** |
| −3 | (211,170,94) | −15 … −10 | −12.5 |
| −2 | (161,103,18) | −10 … −5 | −7.5 |
| −1 | (84,48,2) — appears as (95,54,3) in the data frame | −5 … −2 | −3.5 |
| 0 | **transparent** (alpha = 0) | −2 … +2 = near normal | 0 |
| +1 | (0,69,56) | +2 … +5 | 3.5 |
| +2 | (11,125,118) | +5 … +10 | 7.5 |
| +3 | (102,187,177) | +10 … +15 | 12.5 |
| +4 | (189,230,225) | above +15 | 17.5, **saturated** |

On Nov 14, re-check this table by sampling the bar on a composite frame (x 768–1151 at y 47) — 5 minutes.

**NDVI:** `a005500/a005544/NDVI_colorbar.png` (1000×250 RGBA). The bar interior is x 101 → 798 (white outline at 99–100 and 799–800), y 101–148.
Take 256 evenly spaced samples along x; each sample = median of rows y 115–135 (the bar has a slight vertical shading). Sample i ⇒ position `p = i / 255` (0 = Low, 1 = High).
Convert every colour to **CIELAB** (sRGB → XYZ → Lab, about 10 lines of NumPy; no extra library needed).

## A2 — Reading one place on one frame
1. **Coordinates → pixel:** `x = floor((lon + 180) / 360 × W)`, `y = floor((90 − lat) / 180 × H)`.
2. **Window ≈ 0.5°:** rain 5×5 px; NDVI 11×11 px (8640 version) or 5×5 (4096 version).
3. **Each rain pixel:** check **alpha FIRST** — alpha = 0 ⇒ level 0 (transparent pixels still hold leftover RGB; don't read it). Alpha = 255 ⇒ nearest of the 8 colours by ΔE (Lab);
   ΔE ≤ 10 ⇒ that level, > 10 ⇒ bad pixel. (Test on 2025-07-15: every colour matched with ΔE 0–4.9.)
4. **Each NDVI pixel:** near-white (R, G and B all ≥ 250 = snow/cloud) ⇒ bad; otherwise nearest bar sample, ΔE ≤ **15** ⇒ position `p`, > 15 ⇒ bad (ocean blue lands here).
   The limit is 15 because frame colours sit about ΔE 9 from the bar on vegetated land (a limit of 10 drops about half the pixels).
5. More than 50% bad pixels in the window ⇒ this frame is `null` for this place.
6. **Value of one frame:** rain = median of the pixel levels, **truncated toward 0** (`int(np.trunc(np.median(levels)))`; 12 pixels at −1 and 12 at +1 ⇒ 0); NDVI = median `p`.

## Monthly values
- **Rain:** frames on days 1, 8, 15, 22, 28 of each month (5 frames). Month level = median of the valid frame levels, truncated toward 0; needs ≥ 3 valid frames, else `null`.
  Each frame already accumulates ~3 months, so neighbouring months looking similar is expected; the app says "smoothed over ~3 months".
- **NDVI:** frames on days 5, 15, 25 (3 frames). Month position = median; needs ≥ 2 valid frames, else `null`.
  With the day-15-only fallback (below) the month needs that 1 frame, and the disc's `source.sample_days` = `[15]`.
- Download size: rain 24 months × 5 = 120 frames ≈ 31 MB. NDVI 8640 version: 72 frames ≈ 1.1 GB (heavy) ⇒ try the 4096 version first (if the date text is clear of our places);
  otherwise the 8640 version on day 15 only (24 frames ≈ 360 MB).
- **NDVI level** (for the music): `p < 0.25` → 1 · `< 0.5` → 2 · `< 0.75` → 3 · `≥ 0.75` → 4.
  Round `p` to 2 decimals **first** (the number stored in `values`), then take the level and the saturation flag from that rounded value — otherwise
  e.g. p = 0.745 gives level 3 but is stored as 0.75 (level 4) and both validators reject the disc.
- **Saturated:** rain |level| = 4; NDVI `p ≤ 0.02` or `≥ 0.98` (e.g. Amazon = 1.00).

## A3 — Colour-match check (replaces "compare with VEDA")
- `match_pct` = % of all sampled pixels (all frames × window) that matched the colour bar; `median_de` = median ΔE of the matched pixels. Shown in the app ("colour match 100%").
- Eye check: for each place, open one composite frame and compare the level we read with the colour you see ⇒ one line in the README.
- **Stretch goal (Nov 15, only if time):** compare the dry/wet sign with an independent number source (e.g. NASA POWER monthly rain, or the Resources released on Nov 13) ⇒ `check.sign_agree_pct`.

## A4 — Flags + export
- `breaks`: months where a sampled day is missing from the SVS frame list (none seen in 2025–2026 so far).
- `condition`: `skips` if there are `breaks` (wins); `scratched` if any month is `null`; otherwise `mint`.
- 256×256 crop around the place ⇒ `docs/data/frames/<id>.png`.
- Validate against `03_json.md` before writing; if invalid ⇒ stop, never write a broken file.

## Libraries
Pillow, NumPy, requests, pytest. Lab computed with NumPy. Network calls use a disk cache, 3 retries, 1-second pause.

## Order of work on Nov 14
1. Hand-built tests for A1–A2 (`06_tests.md`) first.
2. **One place × rain × 2025** (Dhaka; see the worked example) through A1→A4 ⇒ `discs.json` ⇒ commit.
3. Expand to 4–6 places × 2 datasets × 2 years.
