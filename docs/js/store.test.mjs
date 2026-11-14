// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from './store.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
const fresh = () => createStore(structuredClone(data));
const loaded = (id) => { const s = fresh(); s.record(id); s.load(id); return s; };

test('seek clamps to 0-11', () => {
  const s = loaded('dhaka-rain-2025');
  assert.equal(s.seek(-5).month, 0);
  assert.equal(s.state.position, 0);
  assert.equal(s.seek(99).month, 11);
  assert.equal(s.state.position, 11);
  assert.equal(s.seek(6).month, 6);
});

test('flip on a one-sided disc keeps the side and says so', () => {
  const s = loaded('sahara-rain-2025');
  let ev;
  s.on('flip', (p) => { ev = p; });
  const r = s.flip();
  assert.equal(r.ok, false);
  assert.equal(s.state.side, 'A');
  assert.equal(s.state.loadedDisc, 'sahara-rain-2025');
  assert.equal(ev.message, 'This disc has only one side');
  assert.equal(ev.changed, false);
});

test('flip on a two-sided disc swaps to the other side', () => {
  const s = loaded('dhaka-rain-2025');
  assert.equal(s.flip().ok, true);
  assert.equal(s.state.side, 'B');
  assert.equal(s.state.loadedDisc, 'dhaka-rain-2026');
});

test('record adds to collected and emits disc:record', () => {
  const s = fresh();
  let ev;
  s.on('disc:record', (p) => { ev = p; });
  assert.equal(s.state.collected.has('dhaka-rain-2025'), false);
  s.record('dhaka-rain-2025');
  assert.equal(s.state.collected.has('dhaka-rain-2025'), true);
  assert.equal(ev.discId, 'dhaka-rain-2025');
});

test('load of an unrecorded disc returns an error and changes nothing', () => {
  const s = fresh();
  const r = s.load('dhaka-rain-2025');
  assert.equal(r.ok, false);
  assert.match(r.error, /not been recorded/);
  assert.equal(s.state.loadedDisc, null);
  assert.equal(s.load('nope').ok, false);
});

test('play/pause/stop and mode emit their events and change state', () => {
  const s = loaded('dhaka-rain-2025');
  const seen = [];
  for (const e of ['play', 'pause', 'stop', 'mode', 'settings']) s.on(e, () => seen.push(e));
  s.play(); assert.equal(s.state.playing, true);
  s.pause(); assert.equal(s.state.playing, false);
  s.setMode('science'); assert.equal(s.state.mode, 'science');
  s.updateSettings({ preview: false }); assert.equal(s.state.settings.preview, false);
  s.stop();
  assert.deepEqual(seen, ['play', 'pause', 'mode', 'settings', 'stop']);
  assert.equal(s.setMode('loud').ok, false);
});

test('play with no disc loaded is an error, not a crash', () => {
  assert.equal(fresh().play().ok, false);
});
