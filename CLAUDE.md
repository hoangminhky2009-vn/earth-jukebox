# Earth Jukebox — rules for every Claude session

Copy this file to the repo root as `CLAUDE.md` on Nov 14. Written before the event as part of our plan; declared in AI_USE.md.

## Context
- NASA Space Apps Challenge 2026, challenge "The Earth Information Jukebox", **Universal Event** (online, judged on the submission page only).
- Submission opens Nov 14, 9:00; closes **Nov 15, 23:59, Team Owner's local time**. Test submission at 21:00 on Nov 15.
- Team: Yến (lead: story, demo, submission form), Ky (web app, integration, docs), Sabik (data pipeline, music engine), Bormey (places, text descriptions, listening and screen-reader tests).
- Replies: to **Ky in Vietnamese** (short, casual, with numbers and tables); to **Sabik in English** (short). Everything written **into the repo or the page is English**.
- Design notes: `notes/00_start_here.md` first, then `notes/02_pipeline.md`, `03_json.md`, `05_music.md`, `06_tests.md`.
  Ky's Vietnamese notes (architecture, web, repo, risks) are outside the repo: `C:\Users\ThinkPad T14\Desktop\SpaceApps2026_ChuanBi\`.

## Who owns which files — never edit the other person's files
| Sabik | Ky |
|---|---|
| `pipeline/**`, `docs/data/discs.json`, `docs/data/frames/**`, `docs/js/schedule.js`, `docs/js/schedule.test.mjs`, `docs/js/audio.js`, `docs/audio-test.html`, `docs/vendor/**` | `docs/index.html`, `docs/css/**`, `docs/js/{app,store,ui-list,ui-jukebox,roll,a11y,validate,audio-stub}.js` + their `*.test.mjs`, `docs/js/{contrast,roundtrip}.test.mjs`, `docs/js/roll.fixture.js`, `docs/data/discs.sample.json`, `package.json`, `README.md`, `HOW_IT_WORKS.md`, `AI_USE.md`, `CREDITS.md` |
The contract between the two halves is `notes/03_json.md` plus the audio interface in `notes/05_music.md`. Only **add** fields; tell the other person.

## Hard rules
1. **English only** in the repo, on the page and in slides. No NASA logos, flags or mission insignia anywhere.
2. **SI must be visible inside the project** (submission guide): every code file starts with one comment line
   `Written by <name> with help from Claude (SI). See AI_USE.md.`; `discs.json` carries `provenance`; the page footer says it; README has a two-line "How we used SI" section linking to `AI_USE.md`.
   `AI_USE.md` is one short paragraph (where and how we used Claude). No log and no table: do not add to it after each task.
   Keep the `Co-Authored-By: Claude` line in commit messages: it is the SI metadata for the code.
3. Every external source (data, library, font, sound, image) goes into `CREDITS.md` with its licence. Only CC0, CC-BY, MIT, Apache-2.0. Never use copyrighted music or images.
4. No photos, video, voice or likeness of anyone under 18 (Ky, Sabik and Bormey are under 18).
5. Never print keys or tokens. Never create accounts or type passwords for the user.
6. Small commits whenever something works (`pipeline: rain levels for Dhaka`). Never commit `cache/` or full-size frames.
7. Tests before code for the pipeline and `schedule()`; run them before saying "done", and say exactly what was not checked.
8. After each finished part, add 3 plain lines to `HOW_IT_WORKS.md`.
9. Data honesty: every number comes from a NASA frame read by our code. Never invent, smooth or "fix" values by hand; missing stays `null`.

## Commands
| Task | Command |
|---|---|
| Python tests | `python -m pytest pipeline/tests -q` |
| JS tests (Node 20+) | `node --test` from the repo root (finds every `*.test.mjs`; on Node 22+ a folder argument like `docs/js/` fails) |
| Run the pipeline | `python -m pipeline.run --place dhaka --dataset rain --year 2025` (add `--all` for everything) |
| Local preview | `python -m http.server 8000 -d docs` → http://localhost:8000 |
| Pages URL | `https://<user>.github.io/<repo>/` (relative paths only, e.g. `data/discs.json`) |

## Quota
Default to Sonnet; switch to Opus only when stuck for more than 15 minutes. Read only the part of a file you need. One work package per session, then close it.

## Milestones
| When | Done when |
|---|---|
| Nov 14 + 30 min | JSON format agreed; repo, LICENSE, notes, sample data committed |
| Nov 14 evening | One real disc (Dhaka × rain × 2025) plays end to end in the page |
| Nov 15, 12:00 | Feature freeze: 4–6 places × 2 datasets; Pages live |
| Nov 15, 21:00 | Pre-submission checklist passes; test submission saved |
