// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { biomeLook, shelfSlots, slotLayout, monthBars, compareSides, pingColor, lcdText, PING, GREEN_SCALE } from './viz.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
const disc = (id) => data.discs.find((d) => d.id === id);

test('biome picks the disc art and the weather', () => {
  assert.deepEqual(biomeLook('monsoon-delta'), { art: 'delta', weather: 'rain' });
  assert.deepEqual(biomeLook('desert'), { art: 'desert', weather: 'sand' });
  assert.deepEqual(biomeLook('rainforest'), { art: 'forest', weather: 'forest' });
  assert.deepEqual(biomeLook('forest'), { art: 'forest', weather: 'forest' });
  for (const b of ['ice', 'polar', 'snow', 'ice-sheet']) assert.deepEqual(biomeLook(b), { art: 'ice', weather: 'snow' });
  for (const b of ['savanna', '', undefined, null, 'delta']) assert.deepEqual(biomeLook(b), { art: 'delta', weather: 'none' });
});

test('shelf: one slot per place + dataset pair, side A shown, west to east', () => {
  const slots = shelfSlots(data.discs, data.places);
  assert.deepEqual(slots.map((s) => s.discId), ['sahara-rain-2025', 'sahara-ndvi-2024', 'dhaka-rain-2025', 'mekong-ndvi-2024']);
  const dhaka = slots.find((s) => s.placeId === 'dhaka');
  assert.deepEqual(dhaka.discIds, ['dhaka-rain-2025', 'dhaka-rain-2026']);
  assert.equal(slots.length, 4); // the other 2 of 6 slots are the locked "???" ones
});

test('tray layout: 6 slots up to 6 pairs, 12 compact slots beyond', () => {
  assert.equal(slotLayout(4).count, 6);
  assert.equal(slotLayout(6).cols, 3);
  const c = slotLayout(7);
  assert.equal(c.count, 12);
  assert.ok(c.compact && c.cols * c.rows === 12);
  assert.ok(24 + 3 * c.stepX + c.w <= 244 && 118 + 2 * c.stepY + c.h <= 248); // last slot stays inside the tray
});

test('month bars: rain goes up or down from zero, with mm/day labels', () => {
  const bars = monthBars(disc('dhaka-rain-2025'), data.datasets); // 0,0,-1,-1,0,1,...,2,1
  assert.equal(bars.length, 12);
  assert.deepEqual([bars[0].kind, bars[0].steps, bars[0].short], ['normal', 0, '0']);
  assert.deepEqual([bars[2].kind, bars[2].dir, bars[2].steps, bars[2].short], ['drier', 'down', 1, '▼3.5']);
  assert.deepEqual([bars[10].kind, bars[10].dir, bars[10].steps, bars[10].short], ['wetter', 'up', 2, '▲7.5']);
  assert.equal(bars[2].text, '2 to 5 mm/day drier (about −3.5 mm/day)');
  assert.equal(bars[2].levelText, '▼ −1');
  assert.equal(bars[5].levelText, '▲ +1');
  assert.equal(bars[0].levelText, '● near normal');
  assert.equal(bars[0].name, 'January');
});

test('month bars: saturated rain says 15+, missing months say no data', () => {
  const sahara = monthBars(disc('sahara-rain-2025'), data.datasets); // ...,-4,0,4,...
  assert.equal(sahara[5].short, '▼15+');
  assert.equal(sahara[7].short, '▲15+');
  assert.equal(sahara[7].steps, 4);
  const b = monthBars(disc('dhaka-rain-2026'), data.datasets); // Nov, Dec are null
  assert.deepEqual([b[10].kind, b[10].steps, b[10].text, b[10].short], ['missing', 0, 'no data', 'no data']);
  assert.equal(b.filter((x) => x.kind === 'missing').length, 2);
});

test('month bars: greenness shows quarter levels', () => {
  const bars = monthBars(disc('mekong-ndvi-2024'), data.datasets); // 3,3,3,3,3,3,4,...
  assert.deepEqual([bars[0].kind, bars[0].steps, bars[0].of, bars[0].short, bars[0].levelText], ['green', 3, 4, '3/4', '3 of 4']);
  assert.equal(bars[6].steps, 4);
  assert.match(bars[0].text, /^medium to high greenness/);
});

test('A/B comparison counts wetter months and names the sides', () => {
  // 2025: 0,0,-1,-1,0,1,-1,-1,0,1,2,1   2026: 1,1,0,0,-1,-2,-1,0,1,2,null,null
  const c = compareSides(disc('dhaka-rain-2026'), disc('dhaka-rain-2025')); // argument order does not matter
  assert.deepEqual([c.up, c.down, c.same, c.compared], [7, 2, 1, 10]);
  assert.equal(c.word, 'wetter');
  assert.equal(c.text, 'Side A 2025 vs side B 2026: 7 of 12 months wetter in 2026 (10 months have data on both sides)');
});

test('A/B comparison: greenness says greener; no pair gives null', () => {
  const c = compareSides(disc('mekong-ndvi-2024'), disc('mekong-ndvi-2025'));
  assert.deepEqual([c.up, c.down, c.compared], [0, 1, 12]);
  assert.equal(c.text, 'Side A 2024 vs side B 2025: 0 of 12 months greener in 2025');
  assert.equal(compareSides(disc('sahara-rain-2025'), null), null);
  assert.equal(compareSides(disc('sahara-rain-2025'), disc('dhaka-rain-2025')), null);
  assert.equal(compareSides(disc('sahara-rain-2025'), disc('sahara-rain-2025')), null);
});

test('ping colour follows the month: drier orange, wetter teal, normal cream, missing grey', () => {
  const d25 = disc('dhaka-rain-2025'); const d26 = disc('dhaka-rain-2026');
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  assert.equal(pingColor(d25, 0), PING.normal);
  const [rd, , bd] = rgb(pingColor(d25, 2));   // drier
  const [rw, , bw] = rgb(pingColor(d25, 10));  // wetter
  assert.ok(rd > bd + 30, 'drier is warm');
  assert.ok(bw > rw + 30, 'wetter is cool');
  assert.equal(pingColor(d26, 10), PING.missing);
  const sahara = disc('sahara-rain-2025'); // -4 in June, +4 in August
  assert.equal(pingColor(sahara, 5), PING.drier);
  assert.equal(pingColor(sahara, 7), PING.wetter);
});

test('ping colour: greenness uses a green scale, no disc uses the idle gold', () => {
  const g = disc('mekong-ndvi-2024');
  assert.equal(pingColor(g, 0), GREEN_SCALE[3]);
  assert.equal(pingColor(g, 6), GREEN_SCALE[4]);
  assert.notEqual(GREEN_SCALE[1], GREEN_SCALE[4]);
  assert.equal(pingColor(null, 0), PING.idle);
});

test('LCD line: short wording, glyph, missing month', () => {
  const d = disc('dhaka-rain-2025');
  assert.equal(lcdText(d, 'Dhaka, Bangladesh', 2, data.datasets), 'DHAKA // MAR ▼ 2-5mm drier');
  assert.equal(lcdText(d, 'Dhaka, Bangladesh', 0, data.datasets), 'DHAKA // JAN • normal');
  assert.equal(lcdText(d, 'Dhaka, Bangladesh', 10, data.datasets), 'DHAKA // NOV ▲ 5-10mm wetter');
  assert.equal(lcdText(disc('sahara-rain-2025'), 'Sahara, Algeria', 5, data.datasets), 'SAHARA // JUN ▼ 15+mm drier');
  assert.equal(lcdText(disc('sahara-rain-2025'), 'Sahara, Algeria', 7, data.datasets), 'SAHARA // AUG ▲ 15+mm wetter');
  assert.equal(lcdText(disc('dhaka-rain-2026'), 'Dhaka, Bangladesh', 11, data.datasets), 'DHAKA // DEC ░ NO DATA');
  assert.equal(lcdText(disc('mekong-ndvi-2024'), 'Mekong Delta, Vietnam', 0, data.datasets), 'MEKONG DELTA // JAN medium to high greenness');
});
