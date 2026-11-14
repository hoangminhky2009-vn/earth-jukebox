// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from './validate.js';

const sample = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(sample);
const disc = (data, id) => data.discs.find((d) => d.id === id);

/** Break a copy of the sample in one way and expect exactly one error mentioning `hint`. */
function expectOne(mutate, hint) {
  const data = copy();
  mutate(data);
  const errors = validate(data);
  assert.equal(errors.length, 1, `expected 1 error, got ${errors.length}: ${JSON.stringify(errors)}`);
  assert.match(errors[0], hint);
}

test('sample file is valid', () => {
  assert.deepEqual(validate(sample), []);
});

test('a missing month', () => {
  expectOne((d) => disc(d, 'dhaka-rain-2025').levels.pop(), /dhaka-rain-2025: "levels" must have exactly 12 months/);
});

test('rain level 5', () => {
  expectOne((d) => { disc(d, 'dhaka-rain-2025').levels[3] = 5; }, /dhaka-rain-2025, month 4: rain level 5/);
});

test('value does not match level', () => {
  expectOne((d) => { disc(d, 'dhaka-rain-2025').values[2] = 3.5; }, /dhaka-rain-2025, month 3: value 3.5 does not match level -1/);
});

test('a null month marked saturated', () => {
  expectOne((d) => { disc(d, 'dhaka-rain-2026').saturated[10] = true; }, /dhaka-rain-2026, month 11: a missing month/);
});

test('condition "mint" with a null month', () => {
  expectOne((d) => { disc(d, 'dhaka-rain-2026').condition = 'mint'; }, /dhaka-rain-2026: condition "mint" should be "scratched"/);
});

test('place that does not exist', () => {
  expectOne((d) => { disc(d, 'sahara-rain-2025').place = 'atlantis'; }, /sahara-rain-2025: place "atlantis" does not exist/);
});

test('duplicate disc id', () => {
  expectOne((d) => { disc(d, 'mekong-ndvi-2025').id = 'mekong-ndvi-2024'; }, /mekong-ndvi-2024: duplicate disc id/);
});
