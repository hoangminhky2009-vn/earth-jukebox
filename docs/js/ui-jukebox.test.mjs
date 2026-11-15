// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readoutText, conditionLabel, detailRows, framesText, metaText, levelInfo, framesShort } from './ui-jukebox.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
const disc = (id) => data.discs.find((d) => d.id === id);

test('rain readout follows the agreed pattern', () => {
  assert.equal(readoutText(disc('dhaka-rain-2025'), 2, data.datasets),
    'Rain · March 2025: 2 to 5 mm/day drier · colour match 100%');
});
test('missing month says crackle', () => {
  assert.equal(readoutText(disc('dhaka-rain-2026'), 10, data.datasets), 'November 2026: missing data (crackle)');
});

test('withheld snow values are distinguished from zero snow and ordinary missing data', async () => {
  const { frameFigure } = await import('./ui-jukebox.js');
  const snow = { ...disc('dhaka-rain-2025'), dataset: 'snow', levels: Array(12).fill(null),
    values: Array(12).fill(null), source: { status: 'withheld', limitation: 'Transparent pixels are ambiguous.' } };
  assert.match(readoutText(snow, 0, data.datasets), /percentage withheld/);
  assert.equal(levelInfo(snow, 0, data.datasets).text, '— withheld');
  const rows = detailRows(snow, data.datasets).rows;
  assert.match(rows.find(([key]) => key === 'Data status')[1], /Transparent pixels are ambiguous/);
  assert.match(rows.find(([key]) => key === 'Limits')[1], /never counted as snow-free/);
  assert.match(frameFigure(snow, { name: 'Tromso' }).caption, /Visual context only/);
});
test('ndvi readout shows the colour-scale position', () => {
  assert.equal(readoutText(disc('mekong-ndvi-2024'), 0, data.datasets),
    'Greenness · January 2024: medium to high greenness (0.62 on the colour scale)');
});
test('condition labels always carry a word', () => {
  assert.equal(conditionLabel('mint'), '✓ Mint');
  assert.equal(conditionLabel('scratched'), '✕ Scratched');
  assert.equal(conditionLabel('skips'), '↻ Skips');
});
test('details rows carry limits, SVS and CREDITS links', () => {
  const d = detailRows(disc('dhaka-rain-2025'), data.datasets);
  assert.match(d.rows.find((r) => r[0] === 'Limits')[1], /3 months.*15 mm\/day/);
  assert.equal(d.svsUrl, 'https://svs.gsfc.nasa.gov/4897');
  assert.equal(d.creditsUrl, 'https://github.com/hoangminhky2009-vn/earth-jukebox/blob/main/CREDITS.md');
  assert.match(detailRows(disc('mekong-ndvi-2024'), data.datasets).rows.find((r) => r[0] === 'Limits')[1], /no NDVI values/);
  assert.equal(framesText(disc('dhaka-rain-2025')), '5 frames per month (60 in total)');
});

test('meta line names the disc, dataset, source and side', () => {
  assert.equal(metaText(disc('dhaka-rain-2025'), data.datasets), '>_ disc/dhaka-rain-2025 · rain · source: NASA SVS 4897 · side A');
  assert.equal(metaText(null, data.datasets), '>_ no disc loaded · pick a place');
});
test('level row: rain has a sign, greenness a position, missing says so', () => {
  const d = disc('dhaka-rain-2025'); // levels 0,0,-1,-1,0,1,...
  assert.deepEqual(levelInfo(d, 0, data.datasets), { dir: 'flat', glyph: '●', text: '● near normal' });
  assert.equal(levelInfo(d, 2, data.datasets).text, '▼ −1');
  assert.equal(levelInfo(d, 2, data.datasets).dir, 'down');
  assert.equal(levelInfo(d, 5, data.datasets).text, '▲ +1');
  assert.equal(levelInfo(d, 10, data.datasets).text, '▲ +2');
  assert.match(levelInfo(disc('mekong-ndvi-2024'), 0, data.datasets).text, /^● 3 of 4$/);
  assert.equal(levelInfo(disc('dhaka-rain-2026'), 10, data.datasets).dir, 'none');
});
test('frames short form', () => {
  assert.equal(framesShort(disc('dhaka-rain-2025')), '5/month · 60 total');
  assert.equal(framesShort({ frames_used: [3, 5] }), '3-5/month · 8 total');
  assert.equal(framesShort({ frames_used: [] }), 'not recorded');
});

test('frame figure: 15 July image of the year, place name without "and surroundings", factual alt when no description', async () => {
  const { frameFigure } = await import('./ui-jukebox.js');
  const f = frameFigure({ id: 'hue-rain-2025', place: 'hue', dataset: 'rain', year: 2025, frame: 'data/frames/hue-rain-2025.png', description: '' },
    { name: 'Hue and surroundings, Vietnam' });
  assert.equal(f.src, 'data/frames/hue-rain-2025.png');
  assert.match(f.caption, /15 July 2025, centred on Hue:/);
  assert.match(f.alt, /^NASA map of rain compared with normal/);
  assert.equal(frameFigure({ frame: 'x.png', dataset: 'ndvi', year: 2024, description: 'Reviewed text.' }, { name: 'X' }).alt, 'Reviewed text.');
  assert.equal(frameFigure({ dataset: 'rain' }, null), null);
});
