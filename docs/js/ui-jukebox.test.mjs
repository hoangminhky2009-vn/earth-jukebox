// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readoutText, conditionLabel, detailRows, framesText } from './ui-jukebox.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
const disc = (id) => data.discs.find((d) => d.id === id);

test('rain readout follows the agreed pattern', () => {
  assert.equal(readoutText(disc('dhaka-rain-2025'), 2, data.datasets),
    'Rain · March 2025: 2 to 5 mm/day drier · colour match 100%');
});
test('missing month says crackle', () => {
  assert.equal(readoutText(disc('dhaka-rain-2026'), 10, data.datasets), 'November 2026: missing data (crackle)');
});
test('ndvi readout shows the colour-scale position', () => {
  assert.equal(readoutText(disc('mekong-ndvi-2024'), 0, data.datasets),
    'Greenness · January 2024: medium to high greenness (0.62 on the colour scale)');
});
test('condition labels always carry a word', () => {
  assert.equal(conditionLabel('mint'), '★ Mint');
  assert.equal(conditionLabel('scratched'), '◐ Scratched');
  assert.equal(conditionLabel('skips'), '✕ Skips');
});
test('details rows carry limits, SVS and CREDITS links', () => {
  const d = detailRows(disc('dhaka-rain-2025'), data.datasets);
  assert.match(d.rows.find((r) => r[0] === 'Limits')[1], /3 months.*15 mm\/day/);
  assert.equal(d.svsUrl, 'https://svs.gsfc.nasa.gov/4897');
  assert.equal(d.creditsUrl, 'https://github.com/hoangminhky2009-vn/earth-jukebox/blob/main/CREDITS.md');
  assert.match(detailRows(disc('mekong-ndvi-2024'), data.datasets).rows.find((r) => r[0] === 'Limits')[1], /no NDVI values/);
  assert.equal(framesText(disc('dhaka-rain-2025')), '5 frames per month (60 in total)');
});
