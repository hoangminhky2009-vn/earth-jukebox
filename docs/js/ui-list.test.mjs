// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from './store.js';
import { discChipText, discChipLabel, chipDiscs, activateDisc } from './ui-list.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
const disc = (id) => data.discs.find((d) => d.id === id);

test('disc chip text names dataset, year and side', () => {
  assert.equal(discChipText(disc('dhaka-rain-2025')), 'Rain 2025 · A');
  assert.equal(discChipText(disc('mekong-ndvi-2024')), 'Greenness 2024 · A');
  assert.match(discChipLabel(disc('dhaka-rain-2026'), { recorded: false, onDeck: false }), /not recorded.*records/);
  assert.match(discChipLabel(disc('dhaka-rain-2026'), { recorded: true, onDeck: false }), /recorded.*plays/);
  assert.match(discChipLabel(disc('dhaka-rain-2026'), { recorded: true, onDeck: true }), /loaded/);
});

test('chips show for a selected or recorded place only, and cover every disc of it', () => {
  const store = createStore(data);
  assert.deepEqual(chipDiscs(store, 'mekong'), []);
  store.selectPlace('mekong');
  assert.deepEqual(chipDiscs(store, 'mekong').map((d) => d.id), ['mekong-ndvi-2024', 'mekong-ndvi-2025']);
  store.record('sahara-ndvi-2024'); // recorded but not selected: still shown, with the other disc of that place
  assert.deepEqual(chipDiscs(store, 'sahara').map((d) => d.id), ['sahara-rain-2025', 'sahara-ndvi-2024']);
});

test('every disc in the data is reachable through some place chip list', () => {
  const store = createStore(data);
  const seen = new Set();
  for (const p of data.places) { store.selectPlace(p.id); for (const d of chipDiscs(store, p.id)) seen.add(d.id); }
  assert.deepEqual([...seen].sort(), data.discs.map((d) => d.id).sort());
});

test('activateDisc records first, then loads and plays, and respects the Start guard', () => {
  const store = createStore(data);
  const told = [];
  const opts = { canPlay: () => false, onBlocked: (m) => told.push(m) };
  assert.equal(activateDisc(store, 'sahara-ndvi-2024', opts), 'recorded');
  assert.equal(store.state.loadedDisc, null);
  assert.equal(activateDisc(store, 'sahara-ndvi-2024', opts), 'blocked');
  assert.deepEqual(told, ['Press the Start button first']);
  assert.equal(activateDisc(store, 'sahara-ndvi-2024', { canPlay: () => true }), 'played');
  assert.equal(store.state.loadedDisc, 'sahara-ndvi-2024');
  assert.equal(store.state.playing, true);
  assert.equal(activateDisc(store, 'nope', {}), 'failed');
});
