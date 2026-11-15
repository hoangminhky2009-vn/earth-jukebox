// Written by Ky with help from Claude (SI). See AI_USE.md.
// "How to use": a guided tour in the style of the team's Delphi game (its CoachTap), without the mascot.
// The whole page dims, a gold-edged spotlight cuts out the part being taught, and a small text card next to it
// types one short sentence at a time (a blinking block cursor while it types). Some steps wait for the visitor
// to do the thing (put a disc on the deck, press Play): the spotlight lets clicks through to the real control.
// Pure parts (the script and when a step is done) are exported for node --test; the DOM part is browser only.

/**
 * The tour. `target`: what the spotlight shows (a key the scene resolves to a box on screen; null = the card
 * stands alone in the middle). `wait(state)`: the step is done when the visitor has done it (no NEXT button).
 */
export const STEPS = [
  { id: 'welcome', target: null,
    text: 'Earth Jukebox turns one year of NASA data about a real place into music and pictures. One minute and you know it all.' },
  { id: 'tray', target: 'tray',
    text: 'This is the record tray. Each disc is one place and one year: RAIN (wetter or drier than normal), GREEN (how green the land is) or SNOW (how much of the land is white).' },
  { id: 'pick', target: 'tray', wait: (s) => Boolean(s.loadedDisc),
    text: 'Click a disc to put it on the turntable (or drag it there).' },
  { id: 'play', target: 'play', wait: (s) => Boolean(s.playing),
    text: 'Press PLAY (or Space). Each month lasts 2 seconds, so a disc is a year in 24 seconds.' },
  { id: 'listen', target: 'deck',
    text: 'Listen: a wetter month has more, higher notes and raindrops; a drier one fewer, lower notes and wind. Greener means fuller chords and birds.' },
  { id: 'sky', target: 'sky',
    text: 'The sky becomes the year: a rain cloud or a sun, a sprout that grows into a tree, a snowflake. The bigger the picture, the stronger the month.' },
  { id: 'gauge', target: 'gauge',
    text: 'This tube rises and falls with each month. The gold line marks the peak of the year.' },
  { id: 'lcd', target: 'lcd',
    text: 'The green screen says the month in words.' },
  { id: 'flip', target: 'flip', wait: (s, seen) => seen.flipped === true, next: true,
    text: 'Every place has two years. Press FLIP to hear the other one and compare.' },
  { id: 'pages', target: 'page',
    text: 'More places (rivers, a lake, a coast) are on the next pages of the tray.' },
  { id: 'details', target: 'details', last: true,
    text: 'DETAILS shows the 12 numbers, a chart and the NASA image behind the disc. Enjoy the music of the Earth!' },
];

/** Is the step done by what the visitor did? (Steps without `wait` move on with NEXT.) */
export function stepDone(step, state, seen = {}) {
  return typeof step.wait === 'function' && step.wait(state, seen);
}

/** Label of the card: "HOW TO USE · 3/11". */
export const stepLabel = (i) => `HOW TO USE · ${i + 1}/${STEPS.length}`;

/**
 * Where the card goes: under the spotlight if there is room, else above it, else beside it (right, then left),
 * else at the bottom of the screen. Sizes in CSS pixels; `view` = { w, h }, `card` = { w, h }.
 */
export function cardPlace(box, card, view, gap = 14) {
  if (!box) return { mode: 'middle' };
  const clampTop = (t) => Math.max(8, Math.min(view.h - card.h - 8, Math.round(t)));
  if (view.h - (box.top + box.height) >= card.h + gap * 2) return { mode: 'below', top: Math.round(box.top + box.height + gap) };
  if (box.top >= card.h + gap * 2) return { mode: 'above', top: Math.round(box.top - gap - card.h) };
  const midTop = clampTop(box.top + box.height / 2 - card.h / 2);
  if (view.w - (box.left + box.width) >= card.w + gap * 2) return { mode: 'side', top: midTop, left: Math.round(box.left + box.width + gap) };
  if (box.left >= card.w + gap * 2) return { mode: 'side', top: midTop, left: Math.round(box.left - gap - card.w) };
  // small window: a narrower card on the side with more room (it grows taller, so it is placed from the top)
  const right = view.w - (box.left + box.width) - gap * 2; const left = box.left - gap * 2; const room = Math.max(right, left);
  if (room >= 220) {
    const w = Math.floor(room); const h = Math.round(card.h * card.w / w * 1.1);
    return { mode: 'side', w, top: Math.max(8, Math.min(view.h - h - 8, Math.round(box.top + box.height / 2 - h / 2))),
      left: right >= left ? Math.round(box.left + box.width + gap) : gap };
  }
  return { mode: 'bottom' };
}

// ---------------------------------------------------------------- DOM part (browser only)

const DONE_KEY = 'ej-tour-done';

/**
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{ boxOf: (key: string) => DOMRect|null, announce: (t: string) => void, reducedMotion: () => boolean }} opts
 * @returns {{ start: () => void, stop: () => void, firstVisit: () => boolean }}
 */
export function initCoach(store, opts) {
  const { boxOf, announce, reducedMotion } = opts;
  const root = document.createElement('div'); root.className = 'coach'; root.hidden = true;
  const hole = document.createElement('div'); hole.className = 'coach-hole';
  const dim = document.createElement('div'); dim.className = 'coach-dim';
  const card = document.createElement('div'); card.className = 'coach-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'How to use');
  const head = document.createElement('div'); head.className = 'coach-head';
  const label = document.createElement('span'); label.className = 'coach-label';
  const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'coach-skip'; skip.textContent = 'SKIP ✕';
  head.append(label, skip);
  const text = document.createElement('p'); text.className = 'coach-text'; text.setAttribute('aria-hidden', 'true');
  const next = document.createElement('button'); next.type = 'button'; next.className = 'coach-next';
  card.append(head, text, next);
  root.append(dim, hole, card);
  document.body.append(root);

  let i = -1; let shown = 0; let typing = null; let follow = null; const seen = {};
  const step = () => STEPS[i];

  function finish() {
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode: the tour just runs again next time */ }
    stop();
  }
  function stop() {
    clearInterval(typing); clearInterval(follow); typing = follow = null;
    root.hidden = true; i = -1;
  }
  function render() {
    const s = step(); if (!s) return;
    const full = s.text;
    const done = shown >= full.length;
    // the rest of the sentence is already there but invisible, so the card has its final size from the start
    // (it is placed once and does not grow over the spotlight while the text types)
    text.textContent = full.slice(0, shown);
    if (!done) {
      const c = document.createElement('span'); c.className = 'coach-cursor'; c.textContent = '▌';
      const ghost = document.createElement('span'); ghost.className = 'coach-ghost'; ghost.textContent = full.slice(shown);
      text.append(c, ghost);
    }
    const waiting = s.wait && !s.next && !stepDone(s, store.state, seen);
    next.hidden = Boolean(waiting && done);
    next.textContent = !done ? 'FAST ▸▸' : s.last ? 'DONE ▸' : (s.wait && s.next) ? 'NEXT ▸ (or try it)' : 'NEXT ▸';
  }
  function place() {
    const s = step(); if (!s) return;
    const box = s.target ? boxOf(s.target) : null;
    root.classList.toggle('no-target', !box);
    if (box) Object.assign(hole.style, { left: `${box.left - 4}px`, top: `${box.top - 4}px`, width: `${box.width + 8}px`, height: `${box.height + 8}px` });
    const keep = card.style.width; card.style.width = '';   // measure the card at its natural size (no flip-flop)
    const size = { w: card.offsetWidth || 340, h: card.offsetHeight || 150 }; card.style.width = keep;
    const p = cardPlace(box ? { top: box.top - 4, height: box.height + 8, left: box.left - 4, width: box.width + 8 } : null,
      size, { w: window.innerWidth, h: window.innerHeight });
    card.dataset.place = p.mode;
    card.style.top = p.top !== undefined ? `${p.top}px` : '';
    card.style.left = p.left !== undefined ? `${p.left}px` : '';
    card.style.width = p.w !== undefined ? `${p.w}px` : '';
  }
  function go(n) {
    clearInterval(typing);
    i = n;
    if (i >= STEPS.length) { finish(); return; }
    const s = step();
    label.textContent = stepLabel(i);
    shown = reducedMotion() ? s.text.length : 0;
    render(); place();
    announce(s.text);
    if (shown < s.text.length) typing = setInterval(() => { shown = Math.min(s.text.length, shown + 2); render(); if (shown >= s.text.length) clearInterval(typing); }, 28);
    if (!s.wait || s.next) setTimeout(() => { if (step() === s && !root.hidden) next.focus({ preventScroll: true }); }, 0);
  }
  next.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = step(); if (!s) return;
    if (shown < s.text.length) { shown = s.text.length; clearInterval(typing); render(); return; }   // first click: show the whole sentence
    go(i + 1);
  });
  card.addEventListener('click', () => { const s = step(); if (s && shown < s.text.length) { shown = s.text.length; clearInterval(typing); render(); } });
  skip.addEventListener('click', (e) => { e.stopPropagation(); finish(); });

  // steps that wait for the visitor: move on as soon as it is done
  const check = () => { const s = step(); if (s && stepDone(s, store.state, seen)) setTimeout(() => { if (step() === s) go(i + 1); }, 500); };
  store.on('disc:load', check);
  store.on('play', check);
  store.on('flip', (p) => { if (p.changed) { seen.flipped = true; check(); } });

  function start() {
    root.hidden = false; seen.flipped = false;
    clearInterval(follow); follow = setInterval(place, 300);   // the console scales with the window: keep the spotlight on it
    go(0);
  }
  const firstVisit = () => { try { return !localStorage.getItem(DONE_KEY); } catch { return false; } };
  return { start, stop, firstVisit };
}
