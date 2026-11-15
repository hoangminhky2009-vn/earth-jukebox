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
  // each real river place gets its own water landscape; a specific biome in the data wins
  assert.deepEqual(biomeLook('monsoon-delta', 'tonle-sap'), { art: 'lake', weather: 'rain' });
  assert.deepEqual(biomeLook('monsoon-delta', 'hue'), { art: 'coast', weather: 'rain' });
  assert.deepEqual(biomeLook('monsoon-delta', 'sylhet'), { art: 'wetland', weather: 'rain' });
  assert.deepEqual(biomeLook('monsoon-delta', 'dhaka'), { art: 'city', weather: 'rain' });
  assert.deepEqual(biomeLook('monsoon-delta', 'mekong'), { art: 'delta', weather: 'rain' });
  assert.deepEqual(biomeLook('monsoon-lake', 'dhaka'), { art: 'lake', weather: 'rain' });
});

test('shelf: one slot per place + dataset pair, side A shown, west to east', () => {
  const slots = shelfSlots(data.discs, data.places);
  assert.deepEqual(slots.map((s) => s.discId), ['sahara-rain-2025', 'sahara-ndvi-2024', 'ladakh-rain-2025', 'dhaka-rain-2025', 'mekong-ndvi-2024']);
  const dhaka = slots.find((s) => s.placeId === 'dhaka');
  assert.deepEqual(dhaka.discIds, ['dhaka-rain-2025', 'dhaka-rain-2026']);
  assert.equal(slots.length, 5);
});

test('tray layout: exactly one slot per pair (no empty fillers), big discs up to 8 pairs, compact beyond', () => {
  assert.equal(slotLayout(4).count, 4);
  assert.equal(slotLayout(6).cols, 3);
  const m = slotLayout(8);
  assert.ok(m.count === 8 && m.cols === 4 && m.rows === 2 && m.discR === 22 && !m.compact);
  assert.ok(24 + 3 * m.stepX + m.w <= 244 && 118 + m.stepY + m.h <= 248);   // last slot stays inside the tray
  assert.ok(m.discR * 2 <= m.w - 4);                                           // disc fits its slot
  const c = slotLayout(10);
  assert.ok(c.compact && c.count === 10 && c.cols * c.rows === 12);
  assert.ok(24 + 3 * c.stepX + c.w <= 244 && 118 + 2 * c.stepY + c.h <= 248);
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

test('tray pages: main page = river pair, forest pair, desert greenness over ice greenness; everything else on More places', async () => {
  const { shelfPages } = await import('./viz.js');
  const places = [{ id: 'dhaka', biome: 'monsoon-delta' }, { id: 'hue', biome: 'monsoon-delta' }, { id: 'amazon', biome: 'rainforest' },
    { id: 'zagora', biome: 'desert' }, { id: 'leh', biome: 'snow-mountain' }];
  const slots = places.flatMap((p) => ['rain', 'ndvi'].map((ds) => ({ placeId: p.id, dataset: ds })));
  const pages = shelfPages(slots, places);
  assert.deepEqual(pages[0].slots.map((s) => s && `${s.placeId} ${s.dataset}`),
    ['dhaka rain', 'dhaka ndvi', 'amazon rain', 'amazon ndvi', 'zagora ndvi', 'leh ndvi']);
  assert.deepEqual(pages[1].slots.map((s) => `${s.placeId} ${s.dataset}`), ['hue rain', 'hue ndvi', 'zagora rain', 'leh rain']);
  // only river data (today's real data): river pair on the main page, the other spots empty, the rest on More places
  const rivers = shelfPages(slots.slice(0, 4), places);
  assert.deepEqual(rivers[0].slots.map((s) => (s ? s.placeId : null)), ['dhaka', 'dhaka', null, null, null, null]);
  assert.equal(rivers[1].slots.length, 2);
});

test('story card: the draft marker is dropped from the story', async () => {
  const { storyText } = await import('./viz.js');
  assert.equal(storyText({ story: 'Draft intro (to be reviewed by Bormey): explore rainfall near Manaus.' }), 'Explore rainfall near Manaus.');
  assert.equal(storyText({ story: 'Explore which months were wetter.' }), 'Explore which months were wetter.');
  assert.equal(storyText({}), '');
});

test('story card: fades in, then starts fading at once; gone after about 4 s, or within 1.2 s of Play', async () => {
  const { newCard, stepCard } = await import('./viz.js');
  const c = newCard({ id: 'dhaka' });
  for (let i = 0; i < 6; i++) stepCard(c, 0.05);           // 0.3 s: fully in
  assert.equal(c.a, 1);
  stepCard(c, 0.05);
  assert.ok(c.a < 1, 'starts fading right after it appears');
  let n = 0; let prev = c.a;
  while (stepCard(c, 0.05) && n < 400) { assert.ok(c.a <= prev + 1e-9, 'opacity never rises'); prev = c.a; n++; }
  assert.ok(n > 65 && n < 85, `gone after about 4 s (${n} steps)`);
  const p = newCard({ id: 'dhaka' });
  for (let i = 0; i < 20; i++) stepCard(p, 0.05);          // 1 s in, still quite visible
  assert.ok(p.a > 0.6);
  let m = 0; while (stepCard(p, 0.05, { playing: true }) && m < 200) m++;
  assert.ok(m <= 24, `Play finishes the fade within 1.2 s (${m} steps)`);
});

test('story card: reduced motion shows it fully for 2.5 s and cuts it, no fade', async () => {
  const { newCard, stepCard } = await import('./viz.js');
  const r = newCard({ id: 'hue' });
  assert.equal(stepCard(r, 1, { rm: true }), true);
  assert.equal(r.a, 1);
  assert.equal(stepCard(r, 2, { rm: true }), false);
  assert.equal(r.a, 0);
});

test('sky pictures: the picture and its size follow the level; missing months have none', async () => {
  const { monthIcon, panelTitle } = await import('./viz.js');
  assert.deepEqual(monthIcon('rain', 3), { kind: 'rain', size: 3 });
  assert.deepEqual(monthIcon('rain', -4), { kind: 'sun', size: 4 });
  assert.deepEqual(monthIcon('rain', 0), { kind: 'calm', size: 0 });
  assert.deepEqual(monthIcon('ndvi', 2), { kind: 'plant', size: 2 });
  assert.equal(monthIcon('rain', null).kind, 'missing');
  assert.equal(monthIcon('ndvi', undefined).kind, 'missing');
  assert.equal(panelTitle([{ dataset: 'rain', year: 2025 }, { dataset: 'rain', year: 2026 }], { rain: { svs: '4897' } }, 'Manaus and surroundings, Brazil'),
    'MANAUS · RAIN VS NORMAL · TOP 2025, BOTTOM 2026 · NASA SVS 4897');
  assert.equal(panelTitle([{ dataset: 'ndvi', year: 2024 }], {}), 'GREENNESS · 2024');
  assert.equal(panelTitle([], {}), '');
});

test('gauge: fills with the level (rain half full at normal); peak months are the highest, none for a flat year', async () => {
  const { gaugeFill, peakMonths } = await import('./viz.js');
  assert.equal(gaugeFill('rain', 0), 0.5);
  assert.equal(gaugeFill('rain', 4), 1);
  assert.equal(gaugeFill('rain', -4), 0);
  assert.equal(gaugeFill('ndvi', 2), 0.5);
  assert.equal(gaugeFill('ndvi', null), null);
  assert.deepEqual(peakMonths([0, 1, 3, 3, -1, 0, 0, 0, 0, 0, 0, 0], 'rain'), [2, 3]);
  assert.deepEqual(peakMonths([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'rain'), []);
  assert.deepEqual(peakMonths([0, 0, 0, 0, 0, -1, -1, 0, 0, 0, 0, 0], 'rain'), [], 'a dry year has no wet peak');
  assert.deepEqual(peakMonths([1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1], 'ndvi'), [], 'four months share the top: no clear peak');
  assert.deepEqual(peakMonths([null, 1, 2, null, 1, 1, 3, 1, 1, 1, 1, 1], 'ndvi'), [6]);
  assert.deepEqual(peakMonths(Array(12).fill(null), 'rain'), []);
});

test('snow cover: its own colours, pictures, title and tray spot', async () => {
  const { levelColor, SNOW_COLORS, monthIcon, panelTitle, shelfPages, compareSides } = await import('./viz.js');
  assert.equal(levelColor('snow', 4), SNOW_COLORS[4]);
  assert.deepEqual(monthIcon('snow', 3), { kind: 'snow', size: 3 });
  assert.equal(panelTitle([{ dataset: 'snow', year: 2025 }], { snow: { gibs_layer: 'X' } }, 'Tromso, Norway'), 'TROMSO · SNOW COVER · 2025 · NASA MODIS');
  const places = [{ id: 'tromso', biome: 'snow-coast', lon: 19 }];
  const slots = [{ placeId: 'tromso', dataset: 'ndvi' }, { placeId: 'tromso', dataset: 'snow' }];
  assert.equal(shelfPages(slots, places)[0].slots[5].dataset, 'ndvi', 'the ice spot shows greenness');
  assert.equal(shelfPages(slots.slice(1), places)[0].slots[5].dataset, 'snow', 'and falls back to snow cover when there is no greenness disc');
  const c = compareSides({ id: 'a', place: 't', dataset: 'snow', side: 'A', year: 2025, levels: Array(12).fill(2) },
    { id: 'b', place: 't', dataset: 'snow', side: 'B', year: 2026, levels: Array(12).fill(3) });
  assert.equal(c.word, 'snowier');
});

