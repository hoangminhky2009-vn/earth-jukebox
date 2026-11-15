import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schedule } from './schedule.js';
import { frameFigure } from './ui-jukebox.js';
import { validate } from './validate.js';
import { createStore, playableCatalog } from './store.js';
import { shelfSlots, shelfPages } from './viz.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.json', import.meta.url), 'utf8'));
const maps = JSON.parse(readFileSync(new URL('../data/maps/index.json', import.meta.url), 'utf8'));

test('the playable catalog hides withheld snow on every tray page without changing the source archive', () => {
  const before = JSON.stringify(data);
  const catalog = playableCatalog(data);
  assert.equal(catalog.discs.length, 32);
  assert.ok(catalog.discs.every(d => d.dataset !== 'snow'));
  const store = createStore(catalog);
  assert.equal(store.getDisc('tromso-snow-2025'), null);
  assert.equal(store.record('tromso-snow-2026').ok, false);
  const slots = shelfSlots(catalog.discs, catalog.places);
  assert.equal(slots.length, 16);
  const pages = shelfPages(slots, catalog.places);
  assert.ok(pages.flatMap(page => page.slots).filter(Boolean).every(slot => slot.dataset !== 'snow'));
  assert.equal(pages[0].slots.find(slot => slot?.placeId === 'tromso').dataset, 'ndvi');
  assert.deepEqual(catalog.discs.filter(d => d.place === 'tromso').map(d => d.dataset).sort(), ['ndvi', 'ndvi', 'rain', 'rain']);
  assert.equal(JSON.stringify(data), before);
  assert.equal(data.discs.reduce((count, d) => count + d.levels.length, 0), 408);
});

test('missing months alone do not hide a record from the catalog', () => {
  const ordinary = { id: 'partial-rain', levels: [0, null] };
  const empty = { id: 'empty-test', levels: [null, null] };
  const withheld = { id: 'withheld', source: { status: 'withheld' }, levels: [null, null] };
  assert.deepEqual(playableCatalog({ discs: [ordinary, empty, withheld] }).discs, [ordinary, empty]);
});

test('every usable rain/greenness month has a dated NASA map with the declared dimensions', () => {
  for (const disc of data.discs.filter(d => ['rain', 'ndvi'].includes(d.dataset))) {
    disc.levels.forEach((level, month) => {
      const entry = maps.discs[disc.id]?.[month];
      if (level === null) { assert.equal(entry, undefined, `${disc.id}/${month}: unavailable month`); return; }
      assert.ok(entry, `${disc.id}/${month}: missing map`);
      assert.ok(entry.date.startsWith(`${disc.year}-${String(month + 1).padStart(2, '0')}-`), `${disc.id}: map month`);
      assert.equal(new URL(entry.url).hostname, 'svs.gsfc.nasa.gov');
      assert.equal(entry.file, `data/maps/${disc.id}-${String(month + 1).padStart(2, '0')}.png`);
      const png = readFileSync(new URL(`../${entry.file}`, import.meta.url));
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(png.readUInt32BE(16), maps.size_px[0]);
      assert.equal(png.readUInt32BE(20), maps.size_px[1]);
    });
  }
});

test('unresolved snow observations cannot publish percentages or data notes', () => {
  const evidence = JSON.parse(readFileSync(new URL('../../pipeline/evidence/snow.json', import.meta.url), 'utf8'));
  const snow = data.discs.filter(d => d.dataset === 'snow');
  assert.equal(snow.length, 2);
  for (const disc of snow) {
    assert.equal(disc.source.status, 'withheld');
    assert.match(disc.source.limitation, /transparency|transparent/i);
    assert.deepEqual(disc.values, Array(12).fill(null));
    assert.deepEqual(disc.levels, Array(12).fill(null));
    assert.deepEqual(disc.frames_used, Array(12).fill(0));
    assert.deepEqual(disc.saturated, Array(12).fill(false));
    assert.equal(disc.condition, 'scratched');
    const place = data.places.find(p => p.id === disc.place);
    for (const mode of ['music', 'science']) assert.equal(schedule(disc, place, mode).filter(n => n.kind === 'data' || n.kind === 'bed').length, 0);
    disc.values.forEach((_, m) => assert.equal(evidence.months[`${disc.year}-${String(m + 1).padStart(2, '0')}`].value, null));
  }
});

test('the four reviewed July descriptions remain exact and supply the image alternative text', () => {
  const reviewed = JSON.parse(readFileSync(new URL('../../pipeline/reviewed_descriptions.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(reviewed.descriptions).length, 4);
  for (const [id, description] of Object.entries(reviewed.descriptions)) {
    const disc = data.discs.find(d => d.id === id);
    assert.equal(disc.description, description, id);
    assert.equal(frameFigure(disc, data.places.find(p => p.id === disc.place)).alt, description);
  }
});

test('the browser rejects restored snow estimates and unreviewed old snow records', () => {
  assert.deepEqual(validate(data), []);
  for (const alter of [
    d => { d.values[0] = 0.5; d.levels[0] = 3; d.frames_used[0] = 1; },
    d => { delete d.source.status; },
  ]) {
    const copy = structuredClone(data);
    alter(copy.discs.find(d => d.dataset === 'snow'));
    assert.ok(validate(copy).some(message => /snow/.test(message)));
  }
});
