# How it works

## Data
- `pipeline/` (Python) reads dated NASA SVS frames, takes a small area around each agreed place, and matches the
  colours to the image's colour key. Each disc is 12 monthly levels (rain: −4…+4 compared with normal; greenness: 1…4),
  a note on missing months, and the source frames used. Source hashes, frame counts and colour-match rates are kept in
  `pipeline/evidence/`; limits are in `pipeline/HANDOFF.md`.
- `docs/data/discs.json` holds the 28 real discs (7 places × rain and greenness × two years). `discs.sample.json` is
  hand-made test data with a desert and a snow place (`?sample` in the address).

## Player and dialogs
- The console shows a condition mark on each disc (colour and shape), five real buttons and a green LCD line that reads out the month being played.
- The Details dialog (button or the I key) lists the 12-month chart and table, the NASA image of the disc, the piano roll, the dataset label and unit, its limits, colour match, frames used, the NASA SVS link and CREDITS.md; Esc closes it and focus goes back to where it was.
- Settings (High contrast, Reduce motion, Preview on focus, Volume) live in a dialog and are saved in this browser; contrast ratios of the colour pairs are checked by `node --test`.

## Pixel console
- The page is one 480x270 pixel canvas scaled to the window: a night sky with a dot-matrix world map (the ping sits on the place and takes the colour of the month playing), weather that follows the landscape (rain, sand, falling snow that piles on the lid), and a wooden console with a tray of discs and a slate deck. `docs/js/scene.js` paints it; every button is a real HTML button laid over the painting, and all state changes go through the store.
- The tray reads in columns: rain on top, greenness below. The main page holds a river place, the Amazon, a desert place and a snow place; the **More places** tab on the left of the box shows the other pages. The centre of each disc is painted for its landscape (river delta, city, wetland, lake, coast, forest, desert, ice).
- Enter or a click records a disc and puts it on the deck. The 12 lights on the deck are one row, or two (side A above side B) with a spoken comparison such as "7 of 12 months wetter in 2026".
- The first time a disc of a place is loaded, a story card covers most of the picture: pixel art of the place's landscape (made from a free nature photograph with `tools/make_pixel_art.py`, credited in CREDITS.md) with its name and story. It fades away over a little more than a second once Play is pressed (with Reduce motion it just shows for a moment and goes). A place without a picture has no card.
- The first click or key press starts audio (no start button). Turntable sounds are synthesized in `docs/js/foley.js`, separate from the music engine.

## Music
- `docs/js/schedule.js` turns a disc into notes, one bar (2 s) per month. A rain level k gives 4 + k data notes (0 to 8): up to four are the tune, and any extra in a wet month are short unpitched raindrop ticks. A greenness level q gives q layers in the chord (root, third, fifth, root) plus a steady pulse. A missing month is crackle only; a break in the source makes the record skip (`breaks` holds months 1–12).
- Harmony follows the basics: chords are plain major or minor triads in one register, the tune only uses notes of its month's chord and moves by small steps (never more than a fourth within a month), each month starts near where the last one ended, and December comes home to the tonic chord. The bass is one connected line (root, then a passing fifth into the next root). `node tools/note_audit.mjs` measures leaps and clashing notes on the real discs.
- Dry months sit lower and wet months higher, with fewer or more drops, and the background sound changes with the month too, so the state is heard in several ways at once.
- `docs/js/audio.js` plays the notes with the Web Audio API (no library) in a lofi style, with its own key, instruments and groove per landscape: Southeast Asia (plucked string, harp-like chords, hand drums), South Asia (flute, harmonium, tabla-like cycle over a continuous drone), desert (ney, oud, frame drum), snow and ice (bells, airy pad, almost no beat), elsewhere (electric piano, lofi kit).
- Under the music runs a quiet bed of real CC0 field recordings that follows the month (`docs/js/ambience.js`): wind, light and heavy rain, birds; in a desert a gusting open wind, and in snow places a hill wind with a howl in snowier months. It is faint in a normal month and swells the further a month is from normal.
- Round trip: reading the levels back from the notes gives back every month exactly (336 of 336 on the real discs); in science mode NDVI comes back within 0.020 (limit 1/48). `node --test` checks this.
