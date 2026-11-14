# Sampling points supplied by Ky

The place names and introduction text come from Bormey's [live team document, place tab](https://docs.google.com/document/d/1XgIDQHjdR-5IGtX96clUcxXklNICMZ_j9mVAuMOil0I/edit?tab=t.uv0ru88njche), read on 14 November 2026. The exact coordinates below come from Ky's team message shared by Sabik on 14 November. They replace the provisional implementation points. Prepared by Sabik with help from OpenAI Codex (SI).

| Export place | Centre latitude, longitude | Basis and scope |
|---|---|---|
| Dhaka | 23.81, 90.41 | Ky's point, unchanged from the first configuration. The window is not a city-wide average. |
| Sylhet and surroundings | 24.90, 91.87 | Ky's point, replacing longitude 91.88. It is not a station measurement or a Sylhet–Sunamganj regional average. |
| Tonle Sap | 12.88, 104.07 | Ky's point, replacing the provisional Phnom Krom point at 13.293056, 103.838611. The name is now simply Tonle Sap. This is not a whole-lake average. |
| Hue and surroundings | 16.46, 107.59 | Ky's point, replacing 16.469444, 107.577778. This is not a Perfume River basin average. |

Each rain window is 5 × 5 pixels (about 0.5° wide). Light NDVI windows are 5 × 5 pixels (about 0.44° wide). They are nearest-palette estimates from displayed images, not administrative-area statistics or direct station observations. Tonle Sap's window can include water and flooded land. We retain invalid/missing results according to the fixed reader rules rather than moving the point to force a desired greenness value.

At Ky's Tonle Sap point, 64.22% (2024) and 62.67% (2025) of sampled NDVI pixels match the vegetation colour scale. All sampled frames still meet the fixed minimum-valid-pixel rule. Its greenness describes the accepted vegetation-colour pixels in this mixed window, not lake water or a whole-area average. Hue's corresponding match rates are 84.00% and 83.89%. These rates describe decoding coverage, not scientific accuracy.

Geographic correction on 14 November: the rain source map starts at 20 E; the NDVI source starts at 180 W. The first rain export incorrectly treated both alike and was replaced. `pipeline/evidence/geography-check.json` records independent coastline registration. The 256-pixel rain preview spans 25.6 degrees and is much broader than the 5-pixel sampling window. In the corrected Dhaka preview, Dhaka is at the centre; the bounds are 77.6–103.2 E and 11.1–36.7 N. The image is a regional context view, not a city boundary or a whole-region data average.

The light NDVI timestamp is in the far southwest of the global image, outside all selected windows. The pipeline checks the inspected image dimensions and excludes the timestamp rectangle. Layout inspection evidence is in `evidence/ndvi-light-layout.json`.

Background sources for the introduction text:

- Dhaka: [World Bank, Flood Risk Management in Dhaka, 2018](https://documents.worldbank.org/en/publication/documents-reports/documentdetail/585131520257159174).
- Sylhet: [NASA, Floods Swamp Bangladesh, June 2022](https://science.nasa.gov/earth/earth-observatory/floods-swamp-bangladesh-150014/).
- Tonle Sap: [NASA, Tonle Sap Wetlands, Cambodia, 2003](https://science.nasa.gov/earth/earth-observatory/tonle-sap-wetlands-cambodia-3483/), using 2002–2003 imagery.
- Hue: [Copernicus, October 2020 flood response](https://mapping.emergency.copernicus.eu/news/the-copernicus-emergency-management-service-forecasts-and-monitors-3-consecutive-extreme-weather-events-for-october-in-vietnam/).

These sources provide context, not the values in the music. Every exported monthly value comes from the pipeline's dated NASA SVS frames for the stated year. The 2020 and 2022 floods cannot be heard as events in 2025/2026 discs. Historical stories are not an independent physical validation of the colour decoding.

Place introductions are available, but Bormey's checked descriptions of the actual dated crops are still pending. Disc descriptions remain empty until provided; do not substitute an unreviewed flood story as image alternative text.
