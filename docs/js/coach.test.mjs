// Written by Ky with help from Claude (SI). See AI_USE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, stepDone, stepLabel, cardPlace } from './coach.js';

test('tour: short steps, each with a sentence; the doing steps wait for the visitor', () => {
  assert.ok(STEPS.length >= 8 && STEPS.length <= 12);
  for (const s of STEPS) assert.ok(s.text.length > 10 && s.text.length < 190, s.id);
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length, 'ids are unique');
  const pick = STEPS.find((s) => s.id === 'pick'); const play = STEPS.find((s) => s.id === 'play');
  assert.equal(stepDone(pick, { loadedDisc: null }), false);
  assert.equal(stepDone(pick, { loadedDisc: 'dhaka-rain-2025' }), true);
  assert.equal(stepDone(play, { playing: true }), true);
  assert.ok(STEPS.indexOf(pick) < STEPS.indexOf(play), 'a disc is picked before Play');
  assert.equal(stepDone(STEPS[0], {}), false, 'a reading step moves on with NEXT only');
  assert.equal(STEPS.at(-1).last, true);
  assert.equal(stepLabel(0), `HOW TO USE · 1/${STEPS.length}`);
});

test('tour card: under the spotlight when there is room, else above, beside, or at the bottom', () => {
  const card = { w: 340, h: 150 }; const view = { w: 1200, h: 800 };
  assert.deepEqual(cardPlace(null, card, view), { mode: 'middle' });
  assert.equal(cardPlace({ top: 100, height: 50, left: 0, width: 300 }, card, view).mode, 'below');
  assert.equal(cardPlace({ top: 500, height: 250, left: 0, width: 300 }, card, view).mode, 'above');
  const side = cardPlace({ top: 100, height: 650, left: 20, width: 500 }, card, view);
  assert.equal(side.mode, 'side'); assert.ok(side.left >= 520);
  assert.equal(cardPlace({ top: 40, height: 700, left: 0, width: 1200 }, card, view).mode, 'bottom');
  const narrow = cardPlace({ top: 180, height: 173, left: 20, width: 279 }, { w: 340, h: 177 }, { w: 581, h: 485 });
  assert.equal(narrow.mode, 'side'); assert.ok(narrow.w >= 220 && narrow.w < 340 && narrow.left >= 299);
});
