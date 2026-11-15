// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambienceMix, LAYERS } from './ambience.js';

const rain = (k) => ({ dataset: 'rain', levels: [k, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
const ndvi = (q) => ({ dataset: 'ndvi', levels: [q, null, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] });
const total = (m) => LAYERS.reduce((a, k) => a + m[k], 0);

const Z = { 'snow-wind': 0, 'snow-howl': 0 };
test('rain: normal = light rain only; wetter adds heavy rain; drier fades into wind; -4 = wind only', () => {
  assert.deepEqual(ambienceMix(rain(0), 0), { wind: 0, 'rain-light': 0.5, 'rain-heavy': 0, birds: 0, ...Z });
  assert.deepEqual(ambienceMix(rain(-4), 0), { wind: 0.8, 'rain-light': 0, 'rain-heavy': 0, birds: 0, ...Z });
  assert.equal(ambienceMix(rain(4), 0)['rain-heavy'], 1);
  for (let k = -3; k <= 4; k++) assert.ok(ambienceMix(rain(k), 0)['rain-heavy'] >= ambienceMix(rain(k - 1), 0)['rain-heavy']);
  for (let k = -3; k <= 4; k++) assert.ok(ambienceMix(rain(k), 0).wind <= ambienceMix(rain(k - 1), 0).wind);
  for (let k = -4; k <= 4; k++) for (const v of Object.values(ambienceMix(rain(k), 0))) assert.ok(v >= 0 && v <= 1);
});

test('rain: the bed is quietest in a normal month and swells as the month gets further from normal', () => {
  const sum = (k) => total(ambienceMix(rain(k), 0));
  for (let k = 1; k <= 4; k++) { assert.ok(sum(k) > sum(k - 1), `wet ${k}`); assert.ok(sum(-k) > sum(-k + 1), `dry ${k}`); }
  assert.ok(sum(0) < sum(4) / 2);
});

test('greenness: more birds and less wind as q goes up; no rain', () => {
  for (let q = 2; q <= 4; q++) {
    assert.ok(ambienceMix(ndvi(q), 0).birds > ambienceMix(ndvi(q - 1), 0).birds);
    assert.ok(ambienceMix(ndvi(q), 0).wind < ambienceMix(ndvi(q - 1), 0).wind);
    assert.equal(ambienceMix(ndvi(q), 0)['rain-light'] + ambienceMix(ndvi(q), 0)['rain-heavy'], 0);
  }
});

test('missing month and science mode are silent', () => {
  assert.equal(total(ambienceMix(rain(2), 1)), 0);
  assert.equal(total(ambienceMix(ndvi(3), 1)), 0);
  assert.equal(total(ambienceMix(rain(2), 0, 'science')), 0);
});

test('snow or ice places: no rain or park wind; hill wind always, the howl only in snowier months', () => {
  const snow = { biome: 'snow-mountain' };
  for (let k = -4; k <= 4; k++) {
    const m = ambienceMix(rain(k), 0, 'music', snow);
    assert.equal(m['rain-light'] + m['rain-heavy'] + m.wind + m.birds, 0);
    assert.ok(m['snow-wind'] > 0 && m['snow-wind'] <= 1);
    assert.equal(m['snow-howl'] > 0, k > 0);
  }
  assert.ok(ambienceMix(rain(4), 0, 'music', snow)['snow-howl'] > ambienceMix(rain(1), 0, 'music', snow)['snow-howl']);
});

test('desert: a gusting open wind every month, a howl when driest, no rain unless wetter, no birds when bare', () => {
  const sand = { biome: 'desert' };
  for (let k = -4; k <= 0; k++) {
    const m = ambienceMix(rain(k), 0, 'music', sand);
    assert.equal(m['rain-light'] + m['rain-heavy'] + m.birds + m.wind, 0, `k=${k}`);
    assert.ok(m['snow-wind'] >= 0.55);
  }
  assert.ok(ambienceMix(rain(-4), 0, 'music', sand)['snow-wind'] > ambienceMix(rain(0), 0, 'music', sand)['snow-wind']);
  assert.ok(ambienceMix(rain(-4), 0, 'music', sand)['snow-howl'] > 0);
  assert.equal(ambienceMix(rain(-2), 0, 'music', sand)['snow-howl'], 0);
  assert.ok(ambienceMix(rain(1), 0, 'music', sand)['rain-light'] > 0);
  assert.ok(ambienceMix(rain(4), 0, 'music', sand)['rain-heavy'] > 0);
  for (let k = -4; k <= 4; k++) for (const v of Object.values(ambienceMix(rain(k), 0, 'music', sand))) assert.ok(v >= 0 && v <= 1);
  assert.equal(ambienceMix(ndvi(1), 0, 'music', sand).birds, 0);
});

test('birds come from the region of the place; snow places hear them only when there is little snow', async () => {
  const { ambienceMix, birdsFile } = await import('./ambience.js');
  assert.equal(birdsFile({ biome: 'snow-coast' }), 'birds');
  assert.equal(birdsFile({ biome: 'desert' }), 'birds-outback');
  assert.equal(birdsFile({ biome: 'rainforest' }), 'birds');
  assert.equal(birdsFile({ biome: 'monsoon-delta', region: 'south-asia' }), 'birds-bengal');
  assert.equal(birdsFile({ biome: 'monsoon-delta', region: 'sea' }), 'birds-mekong');
  assert.equal(birdsFile({}), 'birds');
  const place = { biome: 'snow-coast' };
  const full = ambienceMix({ dataset: 'snow', levels: Array(12).fill(4) }, 0, 'music', place);
  const little = ambienceMix({ dataset: 'snow', levels: Array(12).fill(1) }, 0, 'music', place);
  assert.equal(full.birds, 0);
  assert.ok(little.birds >= 0.4);
  assert.ok(full['snow-wind'] > little['snow-wind']);
});
