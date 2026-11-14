// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambienceMix, LAYERS } from './ambience.js';

const rain = (k) => ({ dataset: 'rain', levels: [k, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
const ndvi = (q) => ({ dataset: 'ndvi', levels: [q, null, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] });
const total = (m) => LAYERS.reduce((a, k) => a + m[k], 0);

test('rain: normal = light rain only; wetter adds heavy rain; drier fades into wind; -4 = wind only', () => {
  assert.deepEqual(ambienceMix(rain(0), 0), { wind: 0, 'rain-light': 1, 'rain-heavy': 0, birds: 0 });
  assert.deepEqual(ambienceMix(rain(-4), 0), { wind: 0.8, 'rain-light': 0, 'rain-heavy': 0, birds: 0 });
  assert.equal(ambienceMix(rain(4), 0)['rain-heavy'], 1);
  for (let k = -3; k <= 4; k++) assert.ok(ambienceMix(rain(k), 0)['rain-heavy'] >= ambienceMix(rain(k - 1), 0)['rain-heavy']);
  for (let k = -3; k <= 4; k++) assert.ok(ambienceMix(rain(k), 0).wind <= ambienceMix(rain(k - 1), 0).wind);
  for (let k = -4; k <= 4; k++) for (const v of Object.values(ambienceMix(rain(k), 0))) assert.ok(v >= 0 && v <= 1);
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
