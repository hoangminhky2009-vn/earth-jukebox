// Written by Ky with help from Claude (SI). See AI_USE.md.
// Piano roll: draws the note schedule (12 bars x 16 steps) as SVG, with a playhead that slides over
// each bar in 2 seconds. Label and geometry functions are pure so they run under node --test.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const BAR_MS = 2000;
const BAR_W = 64;           // SVG units per bar (4 per sixteenth step)
const STEP_W = BAR_W / 16;
const PLOT_H = 150;
const PAD = 8;              // top and bottom padding inside the plot
const LABEL_H = 18;
export const ROLL_SIZE = { width: BAR_W * 12, height: PLOT_H + LABEL_H, barW: BAR_W, plotH: PLOT_H };

const isMissing = (v) => v === null || v === undefined;

// ------------------------------------------------------------------ text (pure)

/** "+2", "0" or "−3" with a real minus sign. */
function signed(k) { return k > 0 ? `+${k}` : k < 0 ? `−${-k}` : '0'; }

/** First month index with the biggest (pick='max') or smallest (pick='min') value; -1 when no values. */
function extreme(values, pick) {
  let best = -1;
  values.forEach((v, i) => {
    if (typeof v !== 'number') return;
    if (best < 0 || (pick === 'max' ? v > values[best] : v < values[best])) best = i; // strict: ties keep the first month
  });
  return best;
}

/** The text a screen reader gets for the roll, worked out from the disc's levels (values for NDVI). */
export function rollLabel(disc) {
  const levels = disc.levels;
  const missing = levels.map((l, i) => (isMissing(l) ? MONTHS[i] : null)).filter(Boolean);
  const tail = missing.length ? ` Missing: ${missing.join(', ')}.` : '';
  if (missing.length === levels.length) return '12 months. No data in any month.';

  if (disc.dataset === 'ndvi') {
    const hasValues = Array.isArray(disc.values) && disc.values.some((v) => typeof v === 'number');
    const vals = hasValues ? disc.values.map((v, i) => (isMissing(levels[i]) ? null : v)) : levels;
    const hi = extreme(vals, 'max');
    const lo = extreme(vals, 'min');
    if (vals[hi] === vals[lo]) return `12 months. Same greenness in every month with data.${tail}`;
    return `12 months. Greenest: ${MONTHS[hi]}. Least green: ${MONTHS[lo]}.${tail}`;
  }
  const hi = extreme(levels, 'max');
  const lo = extreme(levels, 'min');
  if (levels[hi] === levels[lo]) return `12 months. Same compared with normal in every month with data (${signed(levels[hi])}).${tail}`;
  return `12 months. Wettest compared with normal: ${MONTHS[hi]} (${signed(levels[hi])}). Driest: ${MONTHS[lo]} (${signed(levels[lo])}).${tail}`;
}

// ------------------------------------------------------------------ geometry (pure)

/** Diagonal strokes laid over a rectangle, as one SVG path string. */
function slashes(x, y, w, h) {
  let d = '';
  for (let cy = y + 6; cy < y + h; cy += 9) {
    for (let cx = x + 4; cx < x + w; cx += 8) d += `M${cx - 2.5} ${cy + 3}L${cx + 2.5} ${cy - 3}`;
  }
  return d;
}

/**
 * Turn a note list into drawable shapes. Pitch runs up the page, bars run left to right.
 * kind data = dot, bed = long faint bar, crackle = slashes over the whole bar, skip = cut cell with a cross.
 */
export function layoutRoll(notes) {
  const pitched = notes.filter((n) => n.kind === 'data' || n.kind === 'bed');
  const lo = pitched.length ? Math.min(...pitched.map((n) => n.pitch)) : 60;
  const hi = pitched.length ? Math.max(...pitched.map((n) => n.pitch)) : 72;
  const span = Math.max(hi - lo, 12);              // at least an octave tall, so small ranges are not stretched
  const usable = PLOT_H - 2 * PAD;
  const yOf = (pitch) => PAD + ((hi - pitch + (span - (hi - lo)) / 2) / span) * usable;
  const shapes = [];

  const crackleBars = new Set(notes.filter((n) => n.kind === 'crackle').map((n) => n.bar));
  for (const bar of [...crackleBars].sort((a, b) => a - b)) {
    const x = bar * BAR_W;
    shapes.push({ type: 'crackle', kind: 'crackle', bar, x, y: 0, w: BAR_W, h: PLOT_H, d: slashes(x, 0, BAR_W, PLOT_H) });
  }
  for (const n of notes) {
    if (n.kind === 'skip') {
      const x = n.bar * BAR_W + n.step * STEP_W;
      const w = (n.bar + 1) * BAR_W - x;
      const cx = x + w / 2;
      const cy = PLOT_H / 2;
      shapes.push({ type: 'skip', kind: 'skip', bar: n.bar, x, y: 0, w, h: PLOT_H, d: `M${cx - 5} ${cy - 5}L${cx + 5} ${cy + 5}M${cx + 5} ${cy - 5}L${cx - 5} ${cy + 5}` });
    } else if (n.kind === 'data') {
      shapes.push({ type: 'dot', kind: 'data', bar: n.bar, cx: n.bar * BAR_W + (n.step + 0.5) * STEP_W, cy: yOf(n.pitch), r: 1.4 + n.velocity * 1.4, velocity: n.velocity });
    }
  }
  // Bed notes last until the next note of the same voice in that bar, or the end of the bar.
  const beds = notes.filter((n) => n.kind === 'bed').sort((a, b) => a.bar - b.bar || a.voice - b.voice || a.step - b.step);
  beds.forEach((n, i) => {
    const next = beds[i + 1];
    const endStep = next && next.bar === n.bar && next.voice === n.voice ? next.step : 16;
    shapes.push({ type: 'bed', kind: 'bed', bar: n.bar, x: n.bar * BAR_W + n.step * STEP_W, y: yOf(n.pitch) - 1.5, w: (endStep - n.step) * STEP_W - 0.5, h: 3 });
  });
  return { ...ROLL_SIZE, shapes };
}

/** Where the playhead is (SVG x) for a bar and how far through the 2 seconds it is. Reduced motion: bar start only. */
export function playheadX(bar, elapsedMs, reduced) {
  const frac = reduced ? 0 : Math.min(1, Math.max(0, elapsedMs / BAR_MS));
  return (Math.min(11, Math.max(0, bar)) + frac) * BAR_W;
}

// ------------------------------------------------------------------ DOM part (browser only)

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.append(e);
  return e;
}

/** Build the <svg> for a layout. */
export function renderRoll(layout, label) {
  const svg = svgEl('svg', { class: 'roll-svg', viewBox: `0 0 ${layout.width} ${layout.height}`, role: 'img', 'aria-label': label, focusable: 'false' });
  svgEl('rect', { class: 'roll-bg', x: 0, y: 0, width: layout.width, height: layout.plotH }, svg);
  for (let b = 0; b < 12; b++) {
    if (b > 0) svgEl('line', { class: 'roll-barline', x1: b * layout.barW, x2: b * layout.barW, y1: 0, y2: layout.plotH }, svg);
    svgEl('text', { class: 'roll-month', x: b * layout.barW + layout.barW / 2, y: layout.plotH + 13, 'text-anchor': 'middle' }, svg).textContent = MONTHS[b].slice(0, 3);
  }
  for (const s of layout.shapes) {
    if (s.type === 'dot') svgEl('rect', { class: 'roll-dot', x: s.cx - s.r, y: s.cy - s.r, width: s.r * 2, height: s.r * 2 }, svg); // square: pixel UI has no curves
    else if (s.type === 'bed') svgEl('rect', { class: 'roll-bed', x: s.x, y: s.y, width: s.w, height: s.h }, svg);
    else if (s.type === 'crackle') {
      svgEl('rect', { class: 'roll-crackle-bg', x: s.x, y: s.y, width: s.w, height: s.h }, svg);
      svgEl('path', { class: 'roll-crackle', d: s.d }, svg);
    } else if (s.type === 'skip') {
      svgEl('rect', { class: 'roll-skip-bg', x: s.x, y: s.y, width: s.w, height: s.h }, svg);
      svgEl('path', { class: 'roll-skip', d: s.d }, svg);
    }
  }
  svgEl('line', { class: 'roll-playhead', x1: 0, x2: 0, y1: 0, y2: layout.plotH }, svg);
  return svg;
}

/**
 * Wire the roll to the store.
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{container: HTMLElement, svgHost: HTMLElement, getSchedule: () => (disc:object, place:object, mode:string) => object[]}} opts
 */
export function initRoll(store, opts) {
  const { container, svgHost, getSchedule } = opts; // container = box shown/hidden; svgHost = where the <svg> goes
  let head = null;
  let raf = null;
  let anchor = { bar: 0, t: 0 };

  const reduced = () => store.state.settings.reducedMotion;
  const moveTo = (x) => { if (head) { head.setAttribute('x1', x); head.setAttribute('x2', x); } };

  function frame(now) {
    raf = null;
    if (!store.state.playing || !head) return;
    if (container.getClientRects().length === 0) { raf = requestAnimationFrame(frame); return; } // hidden (dialog closed): skip the drawing
    moveTo(playheadX(anchor.bar, now - anchor.t, reduced()));
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }
  function startLoop() { if (raf === null && store.state.playing && head) raf = requestAnimationFrame(frame); }
  function snapTo(bar) { anchor = { bar, t: performance.now() }; moveTo(playheadX(bar, 0, true)); }

  function redraw() {
    stopLoop();
    const disc = store.getDisc(store.state.loadedDisc);
    svgHost.replaceChildren();
    head = null;
    container.hidden = !disc;
    if (!disc) return;
    let svg;
    try {
      const notes = getSchedule()(disc, store.getPlace(disc.place), store.state.mode);
      svg = renderRoll(layoutRoll(notes), rollLabel(disc));
    } catch (err) {
      console.error('Could not draw the piano roll:', err);
      container.hidden = true;
      return;
    }
    head = svg.querySelector('.roll-playhead');
    svgHost.append(svg);
    snapTo(store.state.position);
    startLoop();
  }

  for (const ev of ['disc:load', 'flip', 'mode', 'eject']) store.on(ev, redraw);
  store.on('play', () => { snapTo(store.state.position); startLoop(); });
  store.on('pause', stopLoop);
  store.on('stop', () => { stopLoop(); snapTo(0); });
  store.on('seek', ({ month }) => snapTo(month));
  store.on('tick', (bar) => { snapTo(bar); startLoop(); });
  store.on('settings', () => { if (!store.state.playing) snapTo(anchor.bar); });
  redraw();
}
