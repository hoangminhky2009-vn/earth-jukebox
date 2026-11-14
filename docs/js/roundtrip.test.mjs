// Written by Ky with help from Claude (SI). See AI_USE.md.
// Round-trip check (notes/05_music.md): play every disc through schedule(), read the levels back from the notes,
// and compare with discs.json. Expect a 100% match. Runs on the real data when it exists, else on the sample.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { schedule, readBack, ROOT } from './schedule.js';

const files = ['../data/discs.json', '../data/discs.sample.json']
  .map((f) => new URL(f, import.meta.url))
  .filter((u) => existsSync(u));

for (const url of files) {
  const name = url.pathname.split('/').pop();
  const data = JSON.parse(readFileSync(url, 'utf8'));
  const placeOf = (d) => data.places.find((p) => p.id === d.place);

  test(`${name}: music mode gives back every level (${data.discs.length} discs)`, () => {
    let months = 0;
    for (const d of data.discs) {
      assert.deepEqual(readBack(schedule(d, placeOf(d), 'music'), d.dataset), d.levels, d.id);
      months += d.levels.length;
    }
    console.log(`  round-trip ${name}: ${months}/${months} months match`);
  });

  test(`${name}: science mode gives back the numbers (rain k exact, NDVI within 1/48)`, () => {
    let worst = 0;
    for (const d of data.discs) {
      const notes = schedule(d, placeOf(d), 'science');
      d.levels.forEach((lv, b) => {
        const first = notes.find((n) => n.bar === b && n.kind === 'data');
        if (lv === null) { assert.equal(first, undefined); return; }
        if (d.dataset === 'rain') assert.equal((first.pitch - ROOT) / 2, lv, `${d.id} bar ${b}`);
        else worst = Math.max(worst, Math.abs((first.pitch - ROOT) / 24 - d.values[b]));
      });
    }
    assert.ok(worst <= 1 / 48, `worst NDVI error ${worst}`);
    console.log(`  round-trip ${name}: worst NDVI error ${worst.toFixed(4)} (limit ${(1 / 48).toFixed(4)})`);
  });
}
