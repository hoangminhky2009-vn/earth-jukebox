import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareMonths, buildPlan, categoryPitch, availableYears, sharedYears, noteName } from './seasonal.js';
import { encodeWav } from './seasonal-audio.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.json', import.meta.url)));
const disc = (dataset, levels, patch = {}) => ({ id: 'test', place: 'dhaka', dataset, year: 2025, levels, breaks: [], ...patch });

test('comparison counts only valid matching months, including real zeroes', () => {
  const a = disc('rain', [0, -1, 1, null, 0, 2, ...Array(6).fill(0)]);
  const b = disc('rain', [1, -2, 1, 0, null, 3, ...Array(6).fill(0)], { breaks: [6] });
  const c = compareMonths(a, b);
  assert.deepEqual(c.counts, { compared: 9, changed: 2, higher: 1, lower: 1, same: 7, unavailable: 3 });
  assert.equal(c.months[0].delta, 1);
  assert.equal(c.months[3].delta, null);
  assert.equal(c.months[5].status, 'unavailable');
});

test('changes-only is an ordered list of changed comparable months, never missing or equal', () => {
  const a = disc('rain', [0, 0, null, 1, ...Array(8).fill(0)]);
  const b = disc('rain', [0, 2, 3, -1, ...Array(8).fill(0)]);
  const plan = buildPlan(a, b, { changesOnly: true });
  assert.deepEqual(plan.slots.map(s => s.month), [1, 3]);
  assert.equal(plan.duration, 4);
  assert.deepEqual(plan.events.map(e => [e.month, e.track, e.at]), [[1, 0, 0], [1, 1, 1], [3, 0, 2], [3, 1, 3]]);
  assert.equal(buildPlan(a, a, { changesOnly: true }).duration, 0);
});

test('all-month plan preserves twelve positions; unavailable pairs stay silent', () => {
  const a = disc('rain', Array(12).fill(0));
  const b = disc('rain', [...Array(10).fill(-1), null, null]);
  const plan = buildPlan(a, b);
  assert.equal(plan.duration, 24);
  assert.equal(plan.slots.length, 12);
  assert.equal(plan.events.length, 20);
  assert.ok(plan.events.every(e => e.month < 10));
});

test('duet requires same place and year, aligns both variables, and supports independent missing tracks', () => {
  const rain = disc('rain', [null, ...Array(11).fill(0)]);
  const green = disc('ndvi', Array(12).fill(3));
  assert.throws(() => buildPlan(rain, { ...green, year: 2024 }, { duet: true }), /same place and year/);
  assert.throws(() => buildPlan(rain, { ...green, place: 'ferlo' }, { duet: true }), /same place and year/);
  assert.throws(() => buildPlan(rain, green), /same dataset/);
  const plan = buildPlan(rain, green, { duet: true });
  assert.equal(plan.events.length, 23);
  assert.equal(plan.events[0].track, 1);
  assert.deepEqual(plan.events.filter(e => e.month === 1).map(e => e.at), [2, 2]);
});

test('fixed category mapping is monotone and identical across places', () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, i) => categoryPitch('rain', i - 4)), [52,54,56,58,60,62,64,66,68]);
  assert.deepEqual([1,2,3,4].map(q => categoryPitch('ndvi', q)), [60,64,68,72]);
  for (const invalid of [null, undefined, NaN, 5, -5, 0.5]) assert.equal(categoryPitch('rain', invalid), null);
  assert.equal(noteName(60), 'C4');
  const a = disc('rain', Array(12).fill(1));
  const b = { ...a, place: 'tromso' };
  assert.deepEqual(buildPlan(a, b).events.map(e => e.pitch), Array(24).fill(62));
});

test('real data contains Ferlo, shared-year duets, and valid comparisons for every place', () => {
  assert.ok(data.places.some(p => p.id === 'ferlo'));
  for (const p of data.places) {
    assert.ok(sharedYears(data.discs, p.id).includes(2025));
    for (const dataset of ['rain','ndvi']) {
      const years = availableYears(data.discs, p.id, dataset);
      const a = data.discs.find(d => d.place === p.id && d.dataset === dataset && d.year === years[0]);
      const b = data.discs.find(d => d.place === p.id && d.dataset === dataset && d.year === years[1]);
      const c = compareMonths(a,b);
      assert.equal(c.counts.compared + c.counts.unavailable, 12);
      assert.equal(c.counts.changed + c.counts.same, c.counts.compared);
    }
  }
});

test('WAV export declares PCM frames correctly and clamps samples', () => {
  const wav = encodeWav({ numberOfChannels: 1, sampleRate: 44100, length: 4, getChannelData: () => new Float32Array([-2, 0, 0.5, 2]) });
  const v = new DataView(wav);
  assert.equal(new TextDecoder().decode(wav.slice(0,4)), 'RIFF');
  assert.equal(v.getUint32(24,true), 44100);
  assert.equal(v.getUint32(40,true), 8);
  assert.equal(v.getInt16(44,true), -32768);
  assert.equal(v.getInt16(50,true), 32767);
});
