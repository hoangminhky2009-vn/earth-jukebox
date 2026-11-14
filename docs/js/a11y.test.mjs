// Written by Ky with help from Claude (SI). See AI_USE.md.
// Drives store + keyboard handler with the planned key walk-through and checks the exact sentences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from './store.js';
import { initA11y } from './a11y.js';

const data = JSON.parse(readFileSync(new URL('../data/discs.sample.json', import.meta.url), 'utf8'));

function rig() {
  const store = createStore(structuredClone(data));
  const said = [];
  const ducks = [];
  const keys = initA11y(store, { datasets: data.datasets, write: (t) => said.push(t), duck: (d, ms) => ducks.push([d, ms]) });
  const press = (key, target = { tagName: 'BODY' }) => keys.onKeyDown({ key, target, preventDefault() {} });
  return { store, said, ducks, press };
}

test('key walk-through produces the planned sentences', () => {
  const { store, said, ducks, press } = rig();
  store.focusPlace('dhaka');
  const d = store.primaryDisc('dhaka');           // first disc: dhaka-rain-2025
  store.selectPlace('dhaka'); store.record(d.id); // Enter 1
  store.selectPlace('dhaka'); store.load(d.id); store.play(); // Enter 2
  press(' ');          // pause
  press('ArrowRight'); // seek
  press('f'); press('m'); press('Escape');
  console.log(said.map((s) => `  - ${s}`).join('\n'));
  assert.equal(said[0], 'Dhaka, monsoon delta. Rain 2025, side A. Condition: mint.');
  assert.equal(said[1], 'Recorded: Dhaka rain 2025. Condition: mint.');
  assert.equal(said[2], 'Playing');
  assert.match(said[3], /^Paused at January$/);
  assert.match(said[4], /^February: /);
  assert.equal(said[5], 'Side B, 2026');
  assert.equal(said[6], 'Science mode');
  assert.equal(said[7], 'Stopped');
  assert.equal(ducks.length, said.length);
  assert.deepEqual(ducks[0], [-12, 1500]);
});

test('scratched disc record sentence names the missing months', () => {
  const { store, said } = rig();
  store.record('dhaka-rain-2026');
  assert.match(said[0], /^Recorded: Dhaka rain 2026\. Condition: scratched, \d+ months? missing\.$/);
});

test('shortcuts are ignored while typing, and with a dialog or no disc handled', () => {
  const { said, press } = rig();
  press('m', { tagName: 'INPUT' });
  press('f', { tagName: 'TEXTAREA' });
  assert.equal(said.length, 0);
  press(' '); // nothing loaded
  assert.equal(said[0], 'No disc loaded');
});

test('flip on a one-sided disc announces it', () => {
  const { store, said, press } = rig();
  store.record('sahara-rain-2025'); store.load('sahara-rain-2025');
  said.length = 0;
  press('f');
  assert.deepEqual(said, ['This disc has only one side']);
});
