// Written by Ky with help from Claude (SI). See AI_USE.md.
// Hand-made cases for schedule() (notes/05_music.md), including the edges: k = -4 (no drops), k = +4 (accent),
// a missing month, a break, NDVI q = 1..4, science mode, and an unknown region.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, euclid, readBack, ROOT, SKIP_STEP } from './schedule.js';

const rain = (k, extra = {}) => ({ dataset: 'rain', levels: Array(12).fill(0).map((v, i) => (i === 3 ? k : v)), breaks: [], ...extra });
const ndvi = (q, extra = {}) => ({ dataset: 'ndvi', levels: Array(12).fill(2).map((v, i) => (i === 3 ? q : v)), values: Array(12).fill(0.4), breaks: [], ...extra });
const SEA = { region: 'sea' };
const bar = (notes, b) => notes.filter((n) => n.bar === b);

test('euclid: exactly n hits, gaps differ by at most 1, n = 0 and n = 16', () => {
  assert.deepEqual(euclid(0), []);
  assert.equal(euclid(16).length, 16);
  for (let n = 1; n <= 16; n++) {
    const s = euclid(n);
    assert.equal(s.length, n);
    const gaps = s.map((x, i) => ((s[(i + 1) % n] - x + 16) % 16) || 16);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `n=${n} gaps ${gaps}`);
  }
});

test('rain: n = 8 + 2k data notes for every k, 4 bed notes (seventh chord), steps and bars in range', () => {
  for (let k = -4; k <= 4; k++) {
    const notes = schedule(rain(k), SEA, 'music');
    const b = bar(notes, 3);
    assert.equal(b.filter((n) => n.kind === 'data').length, 8 + 2 * k, `k=${k}`);
    assert.equal(b.filter((n) => n.kind === 'bed').length, 4);
    for (const n of notes) {
      assert.ok(n.bar >= 0 && n.bar <= 11 && n.step >= 0 && n.step <= 15);
      assert.ok(Number.isInteger(n.pitch) && n.pitch >= 21 && n.pitch <= 108, `pitch ${n.pitch}`);
      assert.ok(n.velocity > 0 && n.velocity <= 1);
    }
  }
});

test('rain: drier = lower, wetter = higher (mean drop pitch)', () => {
  const mean = (k) => { const d = bar(schedule(rain(k), SEA, 'music'), 3).filter((n) => n.kind === 'data'); return d.reduce((a, n) => a + n.pitch, 0) / d.length; };
  for (let k = -3; k <= 3; k++) if (k !== 0) assert.ok(k < 0 ? mean(k) < mean(0) : mean(k) > mean(0), `k=${k}`);
});

test('rain: registers never overlap (chord 48-59, drops from 60) and drops sit on even steps', () => {
  for (const region of ['sea', 'south-asia', 'other']) for (let k = -4; k <= 4; k++) {
    const b = bar(schedule(rain(k), { region }), 3);
    for (const n of b.filter((x) => x.kind === 'bed')) assert.ok(n.pitch >= 48 && n.pitch <= 59, `bed ${n.pitch}`);
    for (const n of b.filter((x) => x.kind === 'data')) { assert.ok(n.pitch >= 60, `drop ${n.pitch}`); assert.equal(n.step % 2, 0); }
  }
});

test('rain: saturated bars are accented at full velocity, others are not', () => {
  for (const k of [-4, 4]) assert.ok(bar(schedule(rain(k), SEA), 3).filter((n) => n.kind === 'data').every((n) => n.velocity === 1));
  assert.ok(bar(schedule(rain(3), SEA), 3).filter((n) => n.kind === 'data').every((n) => n.velocity < 1));
});

test('null month: crackle only; break month: normal notes + exactly one skip at step 12', () => {
  const d = rain(2, { levels: [0, 0, 0, 2, null, 0, 0, 0, 0, 0, 0, 0], breaks: [3, 4] });
  const notes = schedule(d, SEA);
  assert.ok(bar(notes, 4).length > 0 && bar(notes, 4).every((n) => n.kind === 'crackle'));
  const b3 = bar(notes, 3);
  const skips = b3.filter((n) => n.kind === 'skip');
  assert.equal(skips.length, 1);
  assert.equal(skips[0].step, SKIP_STEP);
  assert.equal(b3.filter((n) => n.kind === 'data').length, 12);
  assert.equal(notes.filter((n) => n.kind === 'skip').length, 1);
});

test('NDVI: q distinct bed voices, a pulse of 4 on voice 0, no data notes in music mode', () => {
  for (let q = 1; q <= 4; q++) {
    const b = bar(schedule(ndvi(q), SEA), 3);
    assert.equal(new Set(b.filter((n) => n.kind === 'bed').map((n) => n.voice)).size, q);
    assert.equal(b.filter((n) => n.voice === 0).length, 4);
    assert.equal(b.filter((n) => n.kind === 'data').length, 0);
    const pitches = b.filter((n) => n.step === 0).map((n) => n.pitch);
    assert.equal(new Set(pitches.map((p) => Math.floor(p / 12))).size, q, 'each layer in its own octave');
  }
});

test('science mode: one voice, 4 data notes a bar; rain pitch = root + 2k, NDVI within 1/48', () => {
  const r = schedule(rain(-3), SEA, 'science');
  for (let b = 0; b < 12; b++) {
    const d = bar(r, b);
    assert.equal(d.length, 4);
    assert.ok(d.every((n) => n.kind === 'data' && n.voice === 0));
  }
  assert.ok(bar(r, 3).every((n) => n.pitch === ROOT - 6));
  const values = [0, 0.05, 0.1, 0.33, 0.5, 0.61, 0.7, 0.77, 0.8, 0.9, 0.95, 1];
  const s = schedule(ndvi(3, { values }), SEA, 'science');
  values.forEach((v, b) => assert.ok(Math.abs((bar(s, b)[0].pitch - ROOT) / 24 - v) <= 1 / 48, `bar ${b}`));
});

test('readBack gives the levels back exactly; unknown region falls back; same input = same output', () => {
  const d = rain(0, { levels: [-4, -3, -2, -1, 0, 1, 2, 3, 4, null, 0, 1], breaks: [2] });
  assert.deepEqual(readBack(schedule(d, SEA), 'rain'), d.levels);
  const g = ndvi(0, { levels: [1, 2, 3, 4, null, 4, 3, 2, 1, 1, 2, 3] });
  assert.deepEqual(readBack(schedule(g, { region: 'nowhere' }), 'ndvi'), g.levels);
  assert.deepEqual(schedule(d, SEA), schedule(d, SEA));
});
