# How it works

## Player and dialogs
- The console shows a condition mark on each disc (colour and shape), five real buttons and a green LCD line that reads out the month being played.
- The Details dialog (button or the I key) lists the 12-month chart and table, the piano roll, the dataset label and unit, its limits, colour match, frames used, the NASA SVS link and CREDITS.md; Esc closes it and focus goes back to where it was.
- Settings (High contrast, Reduce motion, Preview on focus, Volume) live in a dialog and are saved in this browser; contrast ratios of the colour pairs are checked by `node --test`.

## Pixel console
- The page is one 480x270 pixel canvas scaled to the window: a night sky with a dot-matrix world map (the ping sits on the place and takes the colour of the month playing: orange drier, teal wetter, cream near normal, grey missing), and a wooden console with a tray of discs and a slate deck. `docs/js/scene.js` paints it; every button is a real HTML button laid over the painting, and all state changes go through the store.
- One tray slot per place and dataset shows side A; Enter or a click records it and puts it on the deck. The 12 lights on the deck are one row, or two (side A above side B) with a spoken comparison such as "7 of 12 months wetter in 2026". Details has a 12-month chart with a table of the same numbers.
- The first click or key press starts audio (no start button). Turntable sounds are synthesized in `docs/js/foley.js`, separate from the music engine.

## Music
- `docs/js/schedule.js` turns a disc into notes, one bar (2 s) per month: a rain level k gives 8 + 2k raindrop notes spread evenly (drier = fewer and lower, wetter = more and higher); a greenness level q gives q layers in the chord bed; a missing month is crackle only; a break in the source makes the record skip.
- `docs/js/audio.js` plays those notes with the Web Audio API in a lofi style: electric-piano seventh chords (ii-V-I-vi loop), a half-time beat with swing and a soft bass (accompaniment only, silent in missing months), a warm low-pass and a light tape wobble. The lead changes with the place: plucked string for Southeast Asia, flute for South Asia, electric piano elsewhere. Quietly underneath runs a bed of real CC0 field recordings that follows the same month: wind, light rain, heavy rain, birds (`docs/js/ambience.js`).
- Round trip: reading the levels back from the notes gives 72 of 72 months exactly on the sample data; in science mode NDVI comes back within 0.020 (limit 1/48). `node --test` checks this.
- The tune of the drops follows the change from the month before: it climbs when the month is wetter, falls when it is drier, and each month starts near the last note of the one before, so months join smoothly. The field-recording bed is quiet in a normal month and swells the further a month is from normal; in snow or ice places it is wind, not rain.
