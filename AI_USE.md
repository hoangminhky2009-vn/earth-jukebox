<!-- Draft. Copy to the repo root on Nov 14. At the end of the event, replace every [TEAM] part with what really happened, then delete this line. -->
# How we used SI (Super Intelligence / AI)

We used **Claude** (Anthropic, through Claude Code) as a coding and writing assistant, and **OpenAI Codex** (Sabik, for the data pipeline in `pipeline/` and its review notes). Every file made with either says so in its first line.

- **Where:** Claude wrote most of the JavaScript in `docs/js/` (the page, the pixel scene, the music engine and its tests), the sound-cutting script in `tools/`, and the notes and documents. OpenAI Codex helped write and test the Python data pipeline in `pipeline/` that reads colours from NASA SVS frames. The disc art and the console are painted by our code on a canvas, and the music is synthesized live; the background sounds are real CC0 recordings (see `CREDITS.md`), not AI-made.
- **What we did ourselves:** [TEAM: only what is true, e.g. chose the places, wrote the place descriptions, tuned the music by ear, tested with keyboard and screen reader, checked results against hand-worked examples.]
- **Before the event (Nov 5–13):** we used Claude to study the NASA frames and to write design notes (how to read the colour bars, the data format, the music rules, the tests), one worked example with an illustration, prompts, and a generic accessible page template. Apart from that template, all code, data processing and sound in the product were made on Nov 14–15.
- **The idea:** [TEAM: who came up with the jukebox discs, Side A/B and the "scratched disc" for missing data, and what Claude suggested. The rules say SI should not be used to come up with the idea.]
- **Not used:** no AI-generated images, video, voices or sound samples. The music is synthesized live by our code; the background sounds are real field recordings released as CC0 (listed in `CREDITS.md`), not AI-made. The one illustration in `notes/` has a visible SI label.
- **Marked in metadata:** `provenance` in `docs/data/discs.json`; commits made through Claude Code keep their `Co-Authored-By: Claude` line.
