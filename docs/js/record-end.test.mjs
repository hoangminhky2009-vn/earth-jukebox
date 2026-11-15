import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from './store.js';
import { bindRecordEnd } from './record-end.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));
function setup() {
  const store = createStore(structuredClone(data));
  store.record('dhaka-rain-2025'); store.load('dhaka-rain-2025'); store.play();
  let end; let nextId = 0; const timers = new Map(); const announcements = [];
  bindRecordEnd(store, { onEnd(fn) { end = fn; } }, {
    announce: (text) => announcements.push(text),
    setTimer(fn, delay) { assert.equal(delay, 1200); const id = nextId++; timers.set(id, fn); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  return { store, end: () => end(), announcements, flush() {
    for (const [id, fn] of [...timers]) { timers.delete(id); fn(); }
  } };
}

test('a completed record stops before returning to the shelf', () => {
  const { store, end, flush, announcements } = setup();
  end();
  assert.equal(store.state.playing, false);
  assert.equal(store.state.loadedDisc, 'dhaka-rain-2025');
  assert.equal(announcements.length, 1);
  flush();
  assert.equal(store.state.loadedDisc, null);
});

test('starting a comparison during the needle lift is not interrupted by delayed eject', () => {
  const { store, end, flush } = setup();
  let comparisonPlaying = false;
  for (const event of ['play', 'disc:load', 'flip', 'eject', 'stop']) {
    store.on(event, () => { comparisonPlaying = false; });
  }
  end();
  store.pause(); // The comparison transport hands off from the record this way.
  comparisonPlaying = true;
  flush();
  assert.equal(comparisonPlaying, true);
  assert.equal(store.state.loadedDisc, 'dhaka-rain-2025');
});

test('new transport actions cancel the old eject even when the same disc is loaded again', () => {
  const actions = {
    replay: (store) => { store.play(); store.pause(); },
    pause: (store) => store.pause(),
    stop: (store) => store.stop(),
    seek: (store) => store.seek(5),
    flip: (store) => { store.flip(); store.flip(); },
    load: (store) => store.load('dhaka-rain-2025'),
    eject: (store) => { store.eject(); store.load('dhaka-rain-2025'); },
  };
  for (const [name, act] of Object.entries(actions)) {
    const { store, end, flush } = setup();
    end(); act(store); flush();
    assert.equal(store.state.loadedDisc, 'dhaka-rain-2025', name);
  }
});

test('a later completed replay can still return to the shelf', () => {
  const { store, end, flush } = setup();
  end(); store.play(); flush();
  assert.equal(store.state.loadedDisc, 'dhaka-rain-2025');
  end(); flush();
  assert.equal(store.state.loadedDisc, null);
});
