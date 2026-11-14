// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rollLabel, layoutRoll, playheadX } from './roll.js';
import { schedule } from './roll.fixture.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
const disc = (id) => data.discs.find((d) => d.id === id);
const place = (d) => data.places.find((p) => p.id === d.place);
const bar = (notes, b) => notes.filter((n) => n.bar === b);
const fakeRain = (level, extra = {}) => ({ dataset: 'rain', levels: Array(12).fill(0).map((v, i) => (i === 3 ? level : v)), breaks: [], ...extra });

test('label: mint rain disc', () => {
  assert.equal(rollLabel(disc('dhaka-rain-2025')),
    '12 months. Wettest compared with normal: November (+2). Driest: March (−1).');
});

test('label: scratched rain disc lists missing months and uses a real minus sign', () => {
  assert.equal(rollLabel(disc('dhaka-rain-2026')),
    '12 months. Wettest compared with normal: October (+2). Driest: June (−2). Missing: November, December.');
});

test('label: ties pick the first month; no "Missing" when nothing is missing', () => {
  const d = { dataset: 'rain', levels: [1, 3, 3, -2, 0, -2, 0, 0, 0, 0, 0, 0] };
  const t = rollLabel(d);
  assert.match(t, /Wettest compared with normal: February \(\+3\)\. Driest: April \(−2\)\./);
  assert.ok(!t.includes('Missing'));
});

test('label: NDVI uses values, first month wins ties', () => {
  const d = disc('mekong-ndvi-2024');
  const v = d.values;
  const hi = v.indexOf(Math.max(...v));
  const lo = v.indexOf(Math.min(...v));
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  assert.equal(rollLabel(d), `12 months. Greenest: ${months[hi]}. Least green: ${months[lo]}.`);
});

test('label: NDVI with a missing month, and flat NDVI', () => {
  const d = { dataset: 'ndvi', levels: [2, 3, null, 4, 1, 1, 2, 2, 2, 2, 2, 2], values: [0.3, 0.5, null, 0.9, 0.1, 0.1, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] };
  assert.equal(rollLabel(d), '12 months. Greenest: April. Least green: May. Missing: March.');
  assert.match(rollLabel({ dataset: 'ndvi', levels: Array(12).fill(1), values: Array(12).fill(0.2) }), /^12 months\. Same greenness/);
});

test('fixture: rain bar has n = 8 + 2k data notes, evenly spread, for k = -4..4, plus bed notes', () => {
  for (let k = -4; k <= 4; k++) {
    const d = fakeRain(k);
    const notes = schedule(d, { region: 'sea' }, 'music');
    const b = bar(notes, 3);
    const data = b.filter((n) => n.kind === 'data');
    assert.equal(data.length, 8 + 2 * k, `k=${k}`);
    assert.equal(new Set(data.map((n) => n.step)).size, data.length, 'one note per step');
    assert.ok(data.every((n) => n.step >= 0 && n.step <= 15));
    assert.ok(b.some((n) => n.kind === 'bed'), 'bed always plays');
    assert.equal(b.filter((n) => n.kind === 'crackle' || n.kind === 'skip').length, 0);
    if (Math.abs(k) === 4) assert.ok(data.every((n) => n.velocity === 1), 'saturated = accent');
  }
});

test('fixture: Euclidean spacing is even (gaps differ by at most 1)', () => {
  for (let k = -3; k <= 4; k++) {
    const steps = bar(schedule(fakeRain(k), { region: 'sea' }, 'music'), 3).filter((n) => n.kind === 'data').map((n) => n.step);
    const gaps = steps.map((s, i) => (steps[(i + 1) % steps.length] - s + 16) % 16 || 16);
    if (steps.length > 1) assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `k=${k} gaps ${gaps}`);
  }
});

test('fixture: drier = lower, wetter = higher', () => {
  const mean = (k) => { const x = bar(schedule(fakeRain(k), { region: 'other' }, 'music'), 3).filter((n) => n.kind === 'data'); return x.reduce((a, n) => a + n.pitch, 0) / x.length; };
  assert.ok(mean(-2) < mean(0) && mean(0) < mean(2));
});

test('fixture: a null month has only crackle notes', () => {
  const d = disc('dhaka-rain-2026');
  const notes = schedule(d, place(d), 'music');
  for (const b of [10, 11]) {
    const x = bar(notes, b);
    assert.ok(x.length > 0 && x.every((n) => n.kind === 'crackle'));
  }
});

test('fixture: a breaks month keeps its notes and adds exactly one skip note at step 12', () => {
  const d = disc('sahara-ndvi-2024'); // breaks: [6]
  const notes = schedule(d, place(d), 'music');
  const b = bar(notes, 6);
  const skips = b.filter((n) => n.kind === 'skip');
  assert.equal(skips.length, 1);
  assert.equal(skips[0].step, 12);
  assert.ok(b.some((n) => n.kind === 'bed'));
  assert.equal(bar(notes, 5).filter((n) => n.kind === 'skip').length, 0);
});

test('fixture: NDVI level q = q distinct bed voices, 4 notes of voice 0 per bar, no data notes', () => {
  for (const id of ['mekong-ndvi-2024', 'sahara-ndvi-2024']) {
    const d = disc(id);
    const notes = schedule(d, place(d), 'music');
    for (let b = 0; b < 12; b++) {
      const x = bar(notes, b).filter((n) => n.kind === 'bed');
      assert.equal(new Set(x.map((n) => n.voice)).size, d.levels[b], `${id} bar ${b}`);
      assert.equal(x.filter((n) => n.voice === 0).length, 4);
      assert.equal(bar(notes, b).filter((n) => n.kind === 'data').length, 0);
    }
  }
});

test('fixture: science mode is one voice, 4 data notes per bar', () => {
  const d = disc('dhaka-rain-2025');
  const notes = schedule(d, place(d), 'science');
  for (let b = 0; b < 12; b++) {
    const x = bar(notes, b);
    assert.equal(x.length, 4);
    assert.ok(x.every((n) => n.kind === 'data' && n.voice === 0));
  }
});

test('layout: each kind gets its own shape type', () => {
  const kinds = (d, mode = 'music') => new Set(layoutRoll(schedule(d, place(d), mode)).shapes.map((s) => s.type));
  assert.deepEqual([...kinds(disc('dhaka-rain-2026'))].sort(), ['bed', 'crackle', 'dot']);
  assert.ok(kinds(disc('sahara-ndvi-2024')).has('skip'));
  assert.deepEqual([...kinds(disc('mekong-ndvi-2024'))], ['bed']);
  const l = layoutRoll(schedule(disc('dhaka-rain-2025'), { region: 'sea' }, 'music'));
  assert.ok(l.shapes.every((s) => (s.cx ?? s.x) >= 0 && (s.cx ?? s.x) <= l.width && (s.cy ?? s.y) >= 0 && (s.cy ?? s.y) <= l.plotH));
});

test('playhead: slides 2 s per bar, jumps with reduced motion', () => {
  assert.equal(playheadX(0, 0, false), 0);
  assert.equal(playheadX(3, 1000, false), 3.5 * 64);
  assert.equal(playheadX(3, 5000, false), 4 * 64);
  assert.equal(playheadX(3, 1000, true), 3 * 64);
});
