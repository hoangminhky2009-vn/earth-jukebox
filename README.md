# Earth Jukebox

**By The Delta Force, for NASA Space Apps Challenge 2026: "The Earth Information Jukebox".**

An accessible jukebox that turns NASA Earth Information Center images into music. Every disc is one place and one
kind of data over twelve months; the music tells you, month by month, whether it was wetter or drier than normal,
or how green the land was. Play it, listen, then open **Details** to see the numbers and the NASA image behind it.

**Play it:** https://hoangminhky2009-vn.github.io/earth-jukebox/ (turn the sound on)

## How to use it

1. Choose a place, variable and year using the labelled controls, then **Put on the deck**. You can also choose a
   disc from the pixel tray. There are 32 rain/greenness records across eight places, including the Ferlo grasslands
   in Senegal. Two withheld snow records remain in the source archive and are hidden from the playable choices.
2. Press **Play record**. Twelve lights follow the calendar and the readout explains each month's category.
3. **Flip** switches years while keeping the same calendar position. **Science mode** plays a plain data note;
   **See the evidence** opens the original chart, table and source image.
4. Scroll to **The same months. A different story.** Compare years at one place, or two places in a shared year.
   A plays before B for each month. **Hear only what changed** skips equal categories and unavailable pairs.
5. **Rain + greenness** plays both variables for one place and shared year, with independent track switches.
   Select any month to read its categories, hear it alone, or inspect the dated NASA source frames.
6. **Download audition WAV** saves the comparison audio; **Download data + sources** saves its note plan,
   monthly values, sampling locations and available frame evidence. Phone users can use the same labelled controls.

Keyboard: **Space** play or pause, **Left/Right** move between months, **F** flip, **M** music or science mode,
**Esc** stop, **I** details. Everything on the page is a real button; the page announces changes to screen readers
and lowers the music while it speaks.

## What the sound means

- **Rain discs** (NASA SVS 4897, rain compared with normal): a wetter month sounds higher and has more raindrops, a
  drier month sounds lower and has fewer (none in the driest). Near normal is four notes in the middle.
- **Greenness discs** (NASA SVS 5544): the greener the land, the more layers play together.
- **A missing month** (no data, for example snow cover or a date not yet published) is crackle, not music: nothing
  is made up. **A break in the source** makes the record skip.
- Quiet field recordings (rain, wind, birds) follow the same month; they are real, freely licensed recordings, and the birds are recorded in each place's own region (Cambodia, Bengal, outback Australia; the Amazon and Tromsø keep gentle park birds).
- Every place uses the same rules; only the original record's style changes with the landscape (river, forest, desert, snow).
- Seasonal auditions use a separate fixed pitch scale: rain categories rise two semitones per step; greenness
  categories rise four. A and B use identical sounds so place and year changes cannot alter the mapping.
  Unavailable comparison pairs are silent; a duet keeps its independently usable track. The main record player's
  crackle and skip behaviour stays as described above.

## Data and honesty

Every number comes from NASA Scientific Visualization Studio frames read by our own code (`pipeline/`): the colour
of a small area around each place is matched to the colour key of the image. These are categories ("2 to 5 mm/day
drier than normal"), not measured rainfall. The rain images show a departure from normal that fades over about three
months. Limits and checks are listed in `pipeline/HANDOFF.md`. We never invent, smooth or fix values; the music can be
read back to the same categories (`node --test`: 408 of 408 stored monthly slots match, including missing slots).
Comparisons count only usable pairs. Category differences are not exact rainfall or calibrated NDVI differences;
rain and greenness playing together does not establish a causal relationship.

Tromso's snow records retain NASA MODIS Terra images for visual context, but all numerical snow values are
**withheld**. GIBS transparency does not distinguish zero snow from cloud, night, water or other unavailable data.
It must not be converted to zero. Both snow discs are hidden from the tray and labelled controls so visitors do not
load an empty record. Source metadata, images and evidence are retained for review. Raw MOD10CM data and quality
flags are needed before quantitative snow playback can return.
Seasonal auditions cover rain and greenness.

## Run it yourself

```text
python -m http.server 8000 -d docs        # then open http://localhost:8000
node --test                               # JavaScript tests (Node 20 or newer)
python -m pytest pipeline/tests -q        # data pipeline tests
python -m pipeline.run --all --variant light   # rebuild docs/data/discs.json (downloads NASA frames)
node tools/build_seasonal_evidence.mjs    # refresh the browser's frame evidence after a data rebuild
python tools/make_month_maps.py --place ferlo  # rebuild Ferlo's dated monthly map crops
```

Add `?sample` to the address to load the hand-made sample data. `HOW_IT_WORKS.md` explains the parts; the file
formats are in `notes/`.

## How we used SI

We used Claude (Anthropic) for the original web page, music and notes, and OpenAI Codex for the data pipeline and
seasonal comparison updates. The scope, checks and remaining team confirmations are recorded in [AI_USE.md](AI_USE.md).

## Credits and licence

NASA SVS data, field recordings, fonts and tools are listed with their licences in [CREDITS.md](CREDITS.md). The code
is under the Apache License 2.0 ([LICENSE](LICENSE)). NASA images are credited to NASA's Scientific Visualization
Studio and are not relicensed by us. We do not use NASA logos.
