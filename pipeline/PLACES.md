# Sampling points for the four proposed places

The place names and introduction text come from Bormey's [live team document, place tab](https://docs.google.com/document/d/1XgIDQHjdR-5IGtX96clUcxXklNICMZ_j9mVAuMOil0I/edit?tab=t.uv0ru88njche), read on 14 November 2026. It gives no exact coordinates. The points below are implementation choices for team review; they are not claimed to have been approved by Bormey. Prepared by Sabik with help from OpenAI Codex (SI).

| Export place | Centre latitude, longitude | Basis and scope |
|---|---|---|
| Dhaka | 23.81, 90.41 | Retains the already agreed and checked team centre. This is not the BMD weather station. |
| Sylhet and surroundings | 24.90, 91.88 | Sylhet station coordinates in the [Bangladesh Meteorological Department report](https://presite.bmd.gov.bd/file/2017/04/09/pdf/36934.pdf). The image window samples surrounding land, not a station measurement or a Sylhet–Sunamganj regional average. |
| Tonle Sap near Phnom Krom | 13.293056, 103.838611 | Lakeshore field-study point, 13°17′35″N, 103°50′19″E, [Table 1, page 2](https://hp.brs.nihon-u.ac.jp/~museum/doc/kanpou/Vol.28_Bioresource_Sciences_1-6.pdf). [APSARA](https://apsaraauthority.gov.kh/2021/08/09/phnom-krom/) places Phnom Krom on the lake banks near Siem Reap. This matches the proposed lakeshore-community focus; it is not a whole-lake average. |
| Hue and surroundings | 16.469444, 107.577778 | Hue Citadel coordinate from [UNESCO geographical data](https://whc.unesco.org/en/list/0678/maps/). This is not a Perfume River basin average. |

Each rain window is 5 × 5 pixels (about 0.5° wide). Light NDVI windows are 5 × 5 pixels (about 0.44° wide). They are nearest-palette estimates from displayed images, not administrative-area statistics or direct station observations. Tonle Sap's window can include water and flooded land. We retain invalid/missing results according to the fixed reader rules rather than moving the point to force a desired greenness value.

The light NDVI timestamp is in the far southwest of the global image, outside all selected windows. The pipeline checks the inspected image dimensions and excludes the timestamp rectangle. Layout inspection evidence is in `evidence/ndvi-light-layout.json`.

Background sources for the introduction text:

- Dhaka: [World Bank, Flood Risk Management in Dhaka, 2018](https://documents.worldbank.org/en/publication/documents-reports/documentdetail/585131520257159174).
- Sylhet: [NASA, Floods Swamp Bangladesh, June 2022](https://science.nasa.gov/earth/earth-observatory/floods-swamp-bangladesh-150014/).
- Tonle Sap: [NASA, Tonle Sap Wetlands, Cambodia, 2003](https://science.nasa.gov/earth/earth-observatory/tonle-sap-wetlands-cambodia-3483/), using 2002–2003 imagery.
- Hue: [Copernicus, October 2020 flood response](https://mapping.emergency.copernicus.eu/news/the-copernicus-emergency-management-service-forecasts-and-monitors-3-consecutive-extreme-weather-events-for-october-in-vietnam/).

These sources provide context, not the values in the music. Every exported monthly value comes from the pipeline's dated NASA SVS frames for the stated year. The 2020 and 2022 floods cannot be heard as events in 2025/2026 discs. Historical stories are not an independent physical validation of the colour decoding.

Place introductions are available, but Bormey's checked descriptions of the actual dated crops are still pending. Disc descriptions remain empty until provided; do not substitute an unreviewed flood story as image alternative text.
