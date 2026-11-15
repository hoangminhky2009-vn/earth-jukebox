# Earth Jukebox

**By The Delta Force, for NASA Space Apps Challenge 2026: "The Earth Information Jukebox".**

An accessible jukebox that turns NASA Earth Information Center images into music. Every disc is one place and one
kind of data over twelve months; the music tells you, month by month, whether it was wetter or drier than normal,
or how green the land was. Play it, listen, then open **Details** to see the numbers and the NASA image behind it.

**Play it:** https://hoangminhky2009-vn.github.io/earth-jukebox/ (turn the sound on)

## How to use it

1. Click or press any key once (browsers only allow sound after that).
2. Pick a disc from the tray (Enter, click, or drag it onto the turntable). The tray has a main page (a river, the
   Amazon, a desert and a snow place) and a **More places** tab on the left of the box.
3. Press **Play**. The arm swings in, the record spins and the music starts. Twelve lights show the twelve months;
   the screen says what each month is ("2-5mm drier").
4. **Flip** swaps to the other side (the same place in another year). **Science mode** plays one plain note per month
   so you can hear the numbers themselves. **Details** shows a chart, a table and the NASA image.

Keyboard: **Space** play or pause, **Left/Right** move between months, **F** flip, **M** music or science mode,
**Esc** stop, **I** details. Everything on the page is a real button; the page announces changes to screen readers
and lowers the music while it speaks.

## What the sound means

- **Rain discs** (NASA SVS 4897, rain compared with normal): a wetter month sounds higher and has more raindrops, a
  drier month sounds lower and has fewer (none in the driest). Near normal is four notes in the middle.
- **Greenness discs** (NASA SVS 5544): the greener the land, the more layers play together.
- **A missing month** (no data, for example snow cover or a date not yet published) is crackle, not music: nothing
  is made up. **A break in the source** makes the record skip.
- Quiet field recordings (rain, wind, birds) follow the same month; they are real, freely licensed recordings, and the birds are recorded in each place's own region (Amazon, Cambodia, Bengal, outback Australia, Tromsø).
- Every place uses the same rules; only the style changes with the landscape (river, forest, desert, snow).

## Data and honesty

Every number comes from NASA Scientific Visualization Studio frames read by our own code (`pipeline/`): the colour
of a small area around each place is matched to the colour key of the image. These are categories ("2 to 5 mm/day
drier than normal"), not measured rainfall. The rain images show a departure from normal that fades over about three
months. Limits and checks are listed in `pipeline/HANDOFF.md`. We never invent, smooth or fix values; the music can be
read back to the same categories (`node --test`: 360 of 360 real months match).

The snow place (Tromso) also has **snow cover** discs (2025, 2026): the share of the land under snow each month, read
the same way from NASA's monthly MODIS Terra snow map served by NASA GIBS (`pipeline/snow.py`; the map's colour key
gives every whole percent its own colour, so it decodes exactly). There is no data in the polar night (December,
January).

## Run it yourself

```text
python -m http.server 8000 -d docs        # then open http://localhost:8000
node --test                               # JavaScript tests (Node 20 or newer)
python -m pytest pipeline/tests -q        # data pipeline tests
python -m pipeline.run --all --variant light   # rebuild docs/data/discs.json (downloads NASA frames)
```

Add `?sample` to the address to load the hand-made sample data. `HOW_IT_WORKS.md` explains the parts; the file
formats are in `notes/`.

## How we used SI

We used Claude (Anthropic) for the web page, the music and the notes, and OpenAI Codex for the data pipeline. Every
code file says so in its first line; the full account is in [AI_USE.md](AI_USE.md).

## Credits and licence

NASA SVS data, field recordings, fonts and tools are listed with their licences in [CREDITS.md](CREDITS.md). The code
is under the Apache License 2.0 ([LICENSE](LICENSE)). NASA images are credited to NASA's Scientific Visualization
Studio and are not relicensed by us. We do not use NASA logos.
