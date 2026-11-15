// Written by Ky with help from Claude (SI). See AI_USE.md.
// The pixel console: a 480x270 canvas scaled to the window (night sky with a dot-matrix world map, one wooden console
// with a tray of discs and a slate deck), weather that settles on the console, and accessible HTML buttons laid over the
// painting. It reads and changes state only through the store, and reacts to the store's events.
// Ported from the owner-approved sample (art_samples.html, v12); data now comes from the loaded discs.

import { biomeLook, shelfSlots, shelfPages, slotLayout, storyText, newCard, stepCard, monthIcon, panelTitle, GREEN_SCALE, gaugeFill, peakMonths, weatherIntensity, greenGrowth, bladeHeight, plantKind, plantHeight, plantStage, FLORA, FLORA_COLOURS, compareSides, pingColor, lcdText, levelColor, PING, MONTH_ABBR } from './viz.js';
import * as foley from './foley.js';

const W = 480; const H = 270;

/* ======================= pixel helpers ======================= */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (x, y, t) => t > (BAYER[y & 3][x & 3] + 0.5) / 16;
function h2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s) {
  const xi = Math.floor(x); const yi = Math.floor(y); const fx = x - xi; const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx); const v = fy * fy * (3 - 2 * fy);
  const a = h2(xi, yi, s); const b = h2(xi + 1, yi, s); const c = h2(xi, yi + 1, s); const d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 9) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 21) * 0.1;
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a); const B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
const lit = (c, k) => mix(c, k > 0 ? '#ffffff' : '#000000', Math.abs(k));

/* ======================= disc art ======================= */
const MAPS = {
  delta(u, v, x, y) {
    const n = fbm(u * 3 + 5, v * 3 + 2, 4); let c = dith(x, y, n) ? '#5c9e4f' : '#4a8443';
    const rv = [v - (0.18 * Math.sin(u * 2.4) + 0.55 * u), v - (0.3 * Math.sin(u * 3 + 1) + 0.15 + u * 0.9)];
    const d = Math.min(Math.abs(rv[0]), Math.abs(rv[1]) + (u < -0.2 ? 1 : 0));
    if (d < 0.1) c = d < 0.04 ? '#a7d8e8' : '#5fa8c8';
    return c;
  },
  desert(u, v, x, y) {
    const w = v * 4.2 + 0.7 * Math.sin(u * 3.1) + fbm(u * 2, v * 2, 7) * 1.2; const f = w - Math.floor(w);
    if (f < 0.55) return dith(x, y, f / 0.55) ? '#e8c27a' : '#f4d9a0';
    if (f < 0.62) return '#fff0cc';
    return dith(x, y, (f - 0.62) / 0.38) ? '#b07a45' : '#cf9a5c';
  },
  forest(u, v, x, y) {
    const g = 0.3; const cx = Math.floor(u / g); const cy = Math.floor(v / g); let best = 9; let bx = 0; let by = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const px = (cx + i + h2(cx + i, cy + j, 3)) * g; const py = (cy + j + h2(cx + i, cy + j, 5)) * g; const dd = Math.hypot(u - px, v - py);
        if (dd < best) { best = dd; bx = u - px; by = v - py; }
      }
    }
    if (best < 0.17) { const s = (bx + by) / 0.17; return s < -0.5 ? '#9ad27a' : s < 0.35 ? '#5aa152' : '#3a7340'; }
    return dith(x, y, fbm(u * 4, v * 4, 2)) ? '#26492e' : '#1e3b25';
  },
  // Dhaka: delta channels with a grey city of blocks in the middle
  city(u, v, x, y) {
    const base = MAPS.delta(u, v, x, y);
    if (base === '#a7d8e8' || base === '#5fa8c8') return base;                 // keep the rivers
    if (Math.hypot(u + 0.05, v + 0.05) < 0.55) {
      const bx = Math.floor((u + 2) * 7); const by = Math.floor((v + 2) * 7);
      if ((u * 7 + 20) % 1 < 0.18 || (v * 7 + 20) % 1 < 0.18) return '#3b3a40';  // streets
      const h = h2(bx, by, 9); return h > 0.66 ? '#d8d2c4' : h > 0.33 ? '#a9a39a' : '#7d7a78';
    }
    return base;
  },
  // Sylhet: green hills (dark ridges) and many round wetland ponds (haor)
  wetland(u, v, x, y) {
    const n = fbm(u * 2.5 + 3, v * 2.5 + 8, 21);
    const g = 0.42; const cx = Math.floor(u / g); const cy = Math.floor(v / g);
    const px = (cx + 0.25 + 0.5 * h2(cx, cy, 31)) * g; const py = (cy + 0.25 + 0.5 * h2(cx, cy, 37)) * g;
    const pr = 0.07 + 0.08 * h2(cx, cy, 41);
    if (h2(cx, cy, 43) > 0.3 && Math.hypot(u - px, v - py) < pr) return Math.hypot(u - px, v - py) < pr * 0.6 ? '#9fd4e6' : '#5fa8c8';
    if (n > 0.62) return dith(x, y, (n - 0.62) / 0.38) ? '#2f6a3a' : '#3d7f45';      // hills
    return dith(x, y, n) ? '#6fb15c' : '#5c9e4f';
  },
  // Tonle Sap: a big lake with a sandy shore, floating villages, rice fields around
  lake(u, v, x, y) {
    const e = Math.hypot(u * 0.85 + 0.05, v * 1.15 - 0.05) + (fbm(u * 3, v * 3, 51) - 0.5) * 0.25;
    if (e < 0.62) {
      if (h2(Math.floor(u * 14), Math.floor(v * 14), 53) > 0.94) return '#7a4b2a';   // stilt houses / boats
      return dith(x, y, vnoise(u * 6, v * 6, 55)) ? '#4f97bd' : '#3f86ad';
    }
    if (e < 0.7) return '#d9c48e';                                                   // shore
    return ((Math.floor((u + v) * 9) & 1) ? '#7fbf5e' : '#6aa94f');                 // paddies
  },
  // Hue: land, a river winding to a lagoon and the sea with wave crests
  coast(u, v, x, y) {
    const shore = v + 0.35 * u - 0.15 + (fbm(u * 3, v * 3, 61) - 0.5) * 0.2;
    if (shore > 0.12) {
      const crest = Math.sin((u * 9 + v * 5)) > 0.93;
      return crest ? '#d6eef6' : dith(x, y, 0.5 + shore * 0.4) ? '#2f6f9a' : '#3a80aa';   // sea
    }
    if (shore > 0.0) return dith(x, y, 0.5) ? '#8fcfd8' : '#7cc1cf';                       // lagoon
    if (Math.abs(v - (0.25 * Math.sin(u * 3.2) - 0.25 + 0.3 * u)) < 0.06) return '#5fa8c8'; // river
    return dith(x, y, fbm(u * 3, v * 3, 63)) ? '#5c9e4f' : '#4a8443';
  },
  ice(u, v, x, y) {
    const n = fbm(u * 3, v * 3, 13);
    if (Math.abs(vnoise(u * 5, v * 5, 17) - 0.5) < 0.03) return '#7fa6c9';
    return n > 0.6 ? '#ffffff' : dith(x, y, n) ? '#e6f0fb' : '#c3d9ef';
  },
};

/** Outer ring = 12 months coloured by level, centre = biome art. Returns the canvas. */
function paintDisc(N, d, art) {
  const cnv = document.createElement('canvas'); cnv.width = cnv.height = N;
  const g = cnv.getContext('2d'); const c = (N - 1) / 2; const R = N / 2 - 0.6; const rL = R * 0.5; const rIn = R * 0.56; const rOut = R * 0.93;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c; const dy = y - c; const r = Math.hypot(dx, dy); if (r > R) continue;
      const ang = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI); let col;
      if (r > R - 1) col = '#1b120f';
      else if (r > rOut) col = dith(x, y, 0.5) ? '#2b2433' : '#211b29';
      else if (r > rIn) {
        const m = Math.floor(ang / (Math.PI / 6)); const k = d.levels[m];
        if ((ang - m * Math.PI / 6) * r < 0.9) col = '#1b120f';
        else if (k === null || k === undefined) col = ((x >> 1) + (y >> 1)) & 1 ? '#6b6577' : '#2d2836';
        else { const b = levelColor(d.dataset, k); col = Math.round(r) % 2 ? b : lit(b, -0.25); }
        if (d.breaks && d.breaks.includes(m + 1) && Math.abs(ang - (m + 0.5) * Math.PI / 6 + Math.sin(r * 1.9) * 0.05) * r < 0.8) col = '#120c0a';
        if (m === 0 && (ang * r) < 1.6 && r > rOut - 2.5) col = '#fff6e0';
      } else if (r > rL) col = '#1b120f';
      else if (r > rL - 1) col = '#e8d9b5';
      else if (r > Math.max(2.2, N / 20)) col = MAPS[art](dx / rL, dy / rL, x, y);
      else col = r > N / 40 ? '#e8d9b5' : '#1b120f';
      const [rr, gg, bb] = rgb(col); const i = (y * N + x) * 4;
      img.data[i] = rr; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cnv;
}

/* ======================= layout (internal pixels) ======================= */
const ROOF = 104; const X0 = 14; const X1 = 466; const GROUND = 262;
const PL = { x: 322, y: 180, r: 55 }; const BIG_R = 51; const PIVOT = { x: 398, y: 130 };
const BTN = { play: { x: 412, y: 118, w: 46, h: 40 }, stop: { x: 412, y: 162, w: 22, h: 26 }, flip: { x: 436, y: 162, w: 22, h: 26 }, sci: { x: 412, y: 192, w: 22, h: 26 }, eject: { x: 436, y: 192, w: 22, h: 26 } };
const LCD = { x: 270, y: 240, w: 136, h: 10 };
const ANT = { x: 462, y: 58 };
const LEDS = { x: 411, pitch: 4, rowA: 225, rowB: 232 };       // 12 LEDs per row, 3 px wide
const GAUGE = { x: 247, y: 117, w: 6, h: 130 };   // the glass tube in the slot between the tray and the deck: a rain gauge (or sap gauge for greenness)
const LED_BOX = { x: 409, y: 222, w: 50, h: 24 };               // the accessible group over the LED rows and their year labels
const MAP_Y = 12; const MAP_H = ROOF - 20;
const toMap = (lat, lon) => [Math.round((lon + 180) / 360 * W), Math.round(MAP_Y + (78 - lat) / 140 * MAP_H)];

const LAND = [[-168, -140, 55, 72], [-140, -60, 50, 72], [-128, -65, 30, 50], [-118, -97, 23, 32], [-106, -85, 15, 23], [-92, -78, 8, 15], [-82, -76, 25, 30],
  [-55, -20, 60, 84], [-80, -50, -5, 10], [-81, -35, -15, -5], [-75, -40, -25, -15], [-72, -52, -38, -25], [-75, -64, -55, -38],
  [-10, 40, 36, 60], [5, 40, 55, 71], [-8, 2, 50, 59], [-17, 35, 5, 35], [-8, 50, -5, 12], [8, 42, -18, -5], [12, 36, -35, -18], [43, 50, -25, -12],
  [35, 58, 13, 30], [40, 180, 50, 75], [45, 145, 30, 50], [60, 90, 25, 30], [68, 90, 8, 25], [90, 122, 18, 30], [95, 110, 0, 18], [130, 145, 32, 45],
  [95, 120, -8, 5], [120, 141, -10, 0], [114, 153, -38, -12], [166, 179, -46, -35]];
const isLand = (lat, lon) => LAND.some(([a, b, c, d]) => lon >= a && lon <= b && lat >= c && lat <= d);

const PAL = {
  none: { sky: ['#15112a', '#1d1836', '#272044', '#332852'], dot: '#463b6c' },
  snow: { sky: ['#1a2139', '#232e4b', '#2e3c5e', '#3c4d73'], dot: '#55688f' },
  rain: { sky: ['#101a29', '#172638', '#1f3349', '#2a425b'], dot: '#3d5a73' },
  sand: { sky: ['#26182b', '#3a2232', '#563038', '#76483d'], dot: '#8a5d4c' },
  forest: { sky: ['#101c1d', '#172829', '#1f3735', '#294741'], dot: '#3e6457' },
};
const GLYPH = {
  play: ['#....', '##...', '###..', '####.', '#####', '####.', '###..', '##...', '#....'],
  pause: ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  stop: ['#####', '#####', '#####', '#####', '#####'],
  flip: ['..#...', '.######', '..#...', '......', '...#..', '######.', '...#..'],
  sci: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'],
  eject: ['..#..', '.###.', '#####', '.....', '#####'],
};
const LOCK = ['..###...', '.#...#..', '.#...#..', '#######.', '###.###.', '###.###.', '#######.'];
const COND_TEXT = { mint: 'mint', scratched: 'scratched, some months missing', skips: 'skips, a break in the source' };
const COND_COLOR = { mint: '#7fd8a8', scratched: '#e8834a', skips: '#f6d27a' };
const DS_SHORT = { rain: 'RAIN', ndvi: 'GREEN', snow: 'SNOW' };
const DS_LONG = { rain: 'Rain', ndvi: 'Greenness', snow: 'Snow cover' };
// Tray / LCD label: the place without its country and without "and surroundings" ("Sylhet and surroundings, Bangladesh" -> "Sylhet").
const shortName = (place) => String(place?.name ?? '').split(',')[0].replace(/\s+(and surroundings|near .*)$/i, '');

/**
 * Build the scene inside #screen and wire it to the store.
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{datasets: object, announce?: (t:string)=>void}} opts
 */
export function createScene(store, opts) {
  const { datasets, announce = () => {} } = opts;
  const $ = (id) => document.getElementById(id);
  const cv = $('cv'); const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const screen = $('screen'); const hits = $('hits'); const lcdEl = $('lcd'); const coordsEl = $('coords');
  const RM = () => Boolean(store.state.settings.reducedMotion);

  function fit() {   // fills the window above the footer line, never scrolls
    const foot = document.querySelector('.foot')?.offsetHeight ?? 30;
    screen.style.setProperty('--s', String(Math.max(0.2, Math.min(innerWidth / W, (innerHeight - foot - 4) / H))));
  }
  fit(); addEventListener('resize', fit);
  const pos = (el, x, y, w, h) => Object.assign(el.style, { left: `${x / W * 100}%`, top: `${y / H * 100}%`, width: `${w / W * 100}%`, height: `${h / H * 100}%` });

  const P = (c, x, y, w = 1, h = 1, g = ctx) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); };

  /* ---------- story card: pixel art of the place, shown the first time a place's disc is loaded ---------- */
  const cardImgs = new Map();   // place id -> Image (only places whose picture exists in docs/art/places/)
  for (const pl of store.state.places) {
    const im = new Image();
    im.onload = () => cardImgs.set(pl.id, im);
    im.src = new URL(`../art/places/${pl.id}.png`, import.meta.url).href;
  }
  const shownCards = new Set();   // places whose card was already shown in this visit
  /* ---------- map screen: while a disc is on the deck the tray becomes a screen showing the real NASA image of the
     month playing, cut around the place (tools/make_month_maps.py), with the place marked; it crossfades month to month ---------- */
  const MAP = { x: 24, y: 118, w: 216, h: 112 };
  let mapIdx = null; const mapImgs = new Map(); let mapCur = null; let mapPrev = null; let mapFade = 1; let mapOnNow = false;
  fetch(new URL('../data/maps/index.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((j) => { mapIdx = j; }).catch(() => {});
  const mapEntry = (d, m) => mapIdx?.discs?.[d?.id]?.[m] ?? null;
  function mapImg(entry) {
    if (!entry) return null;
    let im = mapImgs.get(entry.file);
    if (!im) { im = new Image(); im.src = new URL(`../${entry.file}`, import.meta.url).href; mapImgs.set(entry.file, im); }
    return im;
  }
  const preloadMaps = (d) => { for (let m = 0; m < 12; m++) mapImg(mapEntry(d, m)); };
  const mapEl = document.createElement('div'); mapEl.className = 'map-label'; mapEl.setAttribute('aria-hidden', 'true'); mapEl.hidden = true;
  cv.parentElement.append(mapEl);
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let card = null;
  const cardEl = document.createElement('div'); cardEl.className = 'story-card'; cardEl.setAttribute('aria-hidden', 'true');
  cardEl.hidden = true; cv.parentElement.append(cardEl);
  let cardOpacity = -1;
  const CARD = { x: 24, y: 13, w: 432, h: 244 };
  /* ---------- sky calendar: the 12 months of the disc on the deck as little pixel scenes over the world map ---------- */
  // So the data can be read without sound: one picture a month (a row per year), sized by the level, a playhead, labels.
  const SC = { x0: 44, cell: 31, top: 27, bottom: 87 };
  const scEl = document.createElement('div'); scEl.className = 'sky-chart'; scEl.setAttribute('aria-hidden', 'true'); scEl.hidden = true;
  const scTitle = document.createElement('div'); scTitle.className = 'sc-title'; pos(scTitle, SC.x0, 19, 380, 7);
  const scAxis = [0, 1, 2].map(() => { const e = document.createElement('div'); e.className = 'sc-axis'; return e; });
  const scMonths = MONTH_ABBR.map((m, i) => { const e = document.createElement('div'); e.className = 'sc-month'; e.textContent = m; pos(e, SC.x0 + i * SC.cell, 89, SC.cell, 7); return e; });
  scEl.append(scTitle, ...scAxis, ...scMonths); cv.parentElement.append(scEl);
  let scKey = ''; let scNow = -1;
  /* ---------- data ---------- */
  // The tray has pages (rivers and monsoon / forest, desert and ice); one layout for all pages so slots never move.
  const pages = shelfPages(shelfSlots(store.state.discs, store.state.places), store.state.places);
  const L = slotLayout(Math.max(1, ...pages.map((pg) => pg.slots.length)));
  hits.classList.toggle('compact', L.compact);
  // slots are read in columns: each column is one place, rain on top and greenness below
  const SLOT = (i) => ({ x: 24 + Math.floor(i / L.rows) * L.stepX, y: 118 + (i % L.rows) * L.stepY, w: L.w, h: L.h });
  let page = 0;
  let shelf = [];
  const setShelf = () => { shelf = Array.from({ length: L.count }, (_, i) => pages[page].slots[i] ?? null); };
  setShelf();
  const slotOfDisc = (id) => shelf.findIndex((s) => s && s.discIds.includes(id));
  const placeOf = (d) => store.getPlace(d.place);
  const look = (d) => biomeLook(placeOf(d)?.biome, d.place);
  const art = new Map();   // disc id -> { small, big }, painted when first needed
  const getArt = (id, size) => {
    const d = store.getDisc(id);
    const e = art.get(id) ?? {}; art.set(id, e);
    if (!e[size]) e[size] = paintDisc(size === 'small' ? L.discR * 2 : BIG_R * 2, d, look(d).art);
    return e[size];
  };
  const loadedDisc = () => store.getDisc(store.state.loadedDisc);
  const monthNow = () => Math.min(11, Math.max(0, Math.floor(store.state.position)));
  const pairOf = (d) => (d ? store.state.discs.filter((x) => x.place === d.place && x.dataset === d.dataset).sort((a, b) => a.side.localeCompare(b.side) || a.year - b.year) : []);
  const slotInDeck = (s) => Boolean(s && store.state.loadedDisc && s.discIds.includes(store.state.loadedDisc));

  /* ---------- sky ---------- */
  let palFrom = PAL.none; let palTo = PAL.none; let palT = 1; let weather = 'none';
  const skyC = document.createElement('canvas'); skyC.width = W; skyC.height = H; const sg = skyC.getContext('2d');
  // The sky layout is fixed and only colours change, so every pixel is classified once (colour slot 0-10) and each repaint is a table lookup.
  const skySlot = new Uint8Array(W * H);   // 0-3 band, 4-7 band darkened (scanline), 8 star, 9 dot, 10 dot darkened
  for (let y = 0; y < H; y++) {
    const f = Math.min(0.999, y / (ROOF + 10)) * 3; const band = Math.floor(f); const frac = f - band;
    for (let x = 0; x < W; x++) {
      let k = y > ROOF + 10 ? 3 : dith(x, y, frac) ? Math.min(3, band + 1) : band;
      if (h2(x, y, 77) > 0.9985 && y < ROOF - 20) k = 8;
      if (y < ROOF - 6 && x % 3 === 0 && y % 3 === 0) { const lon = x / W * 360 - 180; const lat = 78 - (y - MAP_Y) / MAP_H * 140; if (lat < 80 && lat > -62 && isLand(lat, lon)) k = 9; }
      if (y % 2 === 0 && y < ROOF) k = k < 4 ? k + 4 : k === 9 ? 10 : k;
      skySlot[y * W + x] = k;
    }
  }
  const skyImg = sg.createImageData(W, H); const skyU32 = new Uint32Array(skyImg.data.buffer);
  function renderSky() {
    const sky = palFrom.sky.map((c, i) => mix(c, palTo.sky[i], palT)); const dot = mix(palFrom.dot, palTo.dot, palT);
    const cols = [...sky, ...sky.map((c) => lit(c, -0.06)), lit(sky[0], 0.45), dot, lit(dot, -0.06)]
      .map((c) => { const [r, g, b] = rgb(c); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; });   // little-endian RGBA
    for (let i = 0; i < skySlot.length; i++) skyU32[i] = cols[skySlot[i]];
    sg.putImageData(skyImg, 0, 0);
  }
  function setWeather(w) {
    if (w === weather) return;
    palFrom = { sky: PAL[weather].sky.map((c, i) => mix(c, palTo.sky[i], palT)), dot: mix(palFrom.dot, palTo.dot, palT) };
    palTo = PAL[w]; palT = 0; weather = w;
  }

  /* ---------- console (static parts cached) ---------- */
  const conC = document.createElement('canvas'); conC.width = W; conC.height = H; const cg = conC.getContext('2d');
  function renderConsole() {
    const p = (c, x, y, w, h) => P(c, x, y, w, h, cg);
    cg.clearRect(0, 0, W, H);
    p('#1b120f', X0 - 1, ROOF, X1 - X0 + 2, 254 - ROOF);
    for (let y = ROOF + 8; y < 254; y++) {
      for (let x = X0; x < X1; x++) { const g = Math.sin(x * 0.07 + Math.sin(y * 0.5) * 1.2 + fbm(x * 0.05, y * 0.2, 3) * 4); p(g > 0.55 ? '#7b4f36' : g < -0.6 ? '#5e3b29' : '#6c4530', x, y, 1, 1); }
    }
    p('#1b120f', X0 - 3, ROOF - 1, X1 - X0 + 6, 10);
    p('#e3ae7f', X0 - 2, ROOF, X1 - X0 + 4, 1); p('#c48b5e', X0 - 2, ROOF + 1, X1 - X0 + 4, 4); p('#9a6845', X0 - 2, ROOF + 5, X1 - X0 + 4, 2); p('#3b2418', X0 - 2, ROOF + 7, X1 - X0 + 4, 1);
    p('#1b120f', X0 + 10, 254, 26, 8); p('#3b2418', X0 + 11, 254, 24, 7); p('#1b120f', X1 - 36, 254, 26, 8); p('#3b2418', X1 - 35, 254, 24, 7);
    cg.globalAlpha = 0.35; p('#000000', X0 - 4, GROUND, X1 - X0 + 8, 3); cg.globalAlpha = 1;
    p('#1b120f', 20, 114, 224, 136); p('#2a1c1b', 22, 116, 220, 132); p('#140d0c', 22, 116, 220, 2); p('#4a3029', 22, 246, 220, 2);
    for (let i = 0; i < L.count; i++) { const s = SLOT(i); p('#33221f', s.x, s.y, s.w, s.h - 2); p('#1b120f', s.x, s.y + s.h - 2, s.w, 1); p('#5a3a30', s.x, s.y + s.h - 1, s.w, 1); }
    p('#120b0a', 246, 114, 8, 136);
    p('#1b120f', GAUGE.x - 1, GAUGE.y - 1, GAUGE.w + 2, GAUGE.h + 2); p('#1a2128', GAUGE.x, GAUGE.y, GAUGE.w, GAUGE.h);   // the gauge tube in the slot
    for (let i = 1; i < 8; i++) p(i === 4 ? '#6b7a88' : '#3a4752', GAUGE.x + GAUGE.w - (i === 4 ? 3 : 2), Math.round(GAUGE.y + GAUGE.h - GAUGE.h * i / 8), i === 4 ? 3 : 2, 1);   // scale ticks
    p('#1b120f', 256, 112, 206, 142); p('#3a4752', 258, 114, 202, 138); p('#56677a', 258, 114, 202, 1); p('#56677a', 258, 114, 1, 138); p('#242c33', 258, 251, 202, 1);
    for (let y = 116; y < 250; y += 3) for (let x = 260; x < 458; x += 1) if (h2(x >> 4, y, 8) > 0.7) p('#3f4d59', x, y, 1, 1);
    for (const [x, y] of [[261, 117], [456, 117], [261, 248], [456, 248]]) { p('#8e9aa6', x, y, 2, 2); p('#e8d9b5', x, y, 1, 1); }
    for (let y = -PL.r; y <= PL.r; y++) {
      for (let x = -PL.r; x <= PL.r; x++) {
        const r = Math.hypot(x, y); const a = Math.atan2(y, x); if (r > PL.r) continue;
        let c; if (r > PL.r - 1) c = '#1b120f'; else if (r > PL.r - 4) c = (Math.floor((a + Math.PI) / (Math.PI / 30)) % 2) ? '#e8d9b5' : '#8e9aa6'; else c = Math.round(r) % 3 === 0 ? '#1f1a24' : '#2b2533';
        p(c, PL.x + x, PL.y + y, 1, 1);
      }
    }
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const r = Math.hypot(x, y); if (r <= 9) p(r > 8 ? '#1b120f' : (x + y < -3 ? '#c2c9cf' : '#8e9aa6'), PIVOT.x + x, PIVOT.y + y, 1, 1); }
    p('#1b120f', LCD.x - 2, LCD.y - 2, LCD.w + 4, LCD.h + 4); p('#14251a', LCD.x, LCD.y, LCD.w, LCD.h); p('#0d1912', LCD.x, LCD.y, LCD.w, 1);
    for (let i = 0; i <= 46; i++) { const x = Math.round(452 + (ANT.x - 452) * i / 46); const y = Math.round(ROOF - (ROOF - ANT.y) * i / 46); p('#1b120f', x - 1, y, 3, 1); p('#c2c9cf', x, y, 1, 1); }
    p('#1b120f', 447, ROOF - 4, 10, 4); p('#8e9aa6', 448, ROOF - 3, 8, 3);
    for (let y = 122; y < 236; y += 3) for (let x = 262; x < 266; x += 3) p('#242c33', x, y, 2, 2);
  }

  /* ---------- state of the painting (the store owns the real state) ---------- */
  let shownId = null; let playing = false; let spinning = false; let armA = 0; let angle = 0; let speed = 0;
  let settle = 0; let fly = null; let drag = null; let flipT = 0; let pressed = null; let pressedT = 0; let glitch = 0;
  let touched = false; let hoverId = null; let pendingFrom = null;
  const snowH = new Float32Array(W); const sandH = new Float32Array(W);
  let gaugeA = 0;   // shown fill of the gauge, eased toward the month playing
  let leaves = []; let parts = []; let rings = []; let pingR = 0; let ringT = 0;

  /* ---------- accessible hit areas over the painting (built once, updated in place so focus is never lost) ---------- */
  const slotEls = []; const btnEls = {};
  function slotName(s) { return shortName(store.getPlace(s.placeId)); }
  function slotYr(s) { const d = store.getDisc(s.discId); return `${DS_SHORT[d.dataset] ?? d.dataset.toUpperCase()} ${String(d.year).slice(2)} · ${d.side}`; }
  function activate(i, from) {
    const s = shelf[i]; if (!s || slotInDeck(s)) return;
    pendingFrom = from ?? null;
    store.selectPlace(s.placeId);
    if (!store.state.collected.has(s.discId)) store.record(s.discId);
    store.load(s.discId);
  }
  for (let i = 0; i < L.count; i++) {
    const cur = () => shelf[i];   // which disc a slot holds depends on the tray page shown
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hit slot'; pos(b, SLOT(i).x, SLOT(i).y, SLOT(i).w, SLOT(i).h);
    const name = document.createElement('span'); name.className = 'name'; const main = document.createTextNode(''); const yr = document.createElement('span'); yr.className = 'yr';
    const ds = document.createElement('span'); ds.className = 'ds'; ds.setAttribute('aria-hidden', 'true');
    name.append(ds, main, yr); b.append(name);
    b.addEventListener('click', () => { if (!cur()) return; if (!b.dataset.dragged) activate(i); delete b.dataset.dragged; });
    b.addEventListener('pointerdown', (e) => { const sl = cur(); if (!sl || slotInDeck(sl)) return; drag = { id: sl.discId, i, sx: e.clientX, sy: e.clientY, on: false }; b.setPointerCapture(e.pointerId); });
    b.addEventListener('pointermove', (e) => {
      if (!drag || drag.i !== i) return;
      if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.on = true;
      if (drag.on) { const r = cv.getBoundingClientRect(); drag.x = (e.clientX - r.left) / r.width * W; drag.y = (e.clientY - r.top) / r.height * H; }
    });
    b.addEventListener('pointerup', () => {
      if (drag && drag.on) {
        b.dataset.dragged = '1';
        if (Math.hypot(drag.x - PL.x, drag.y - PL.y) < PL.r + 6) { const dd = drag; drag = null; activate(dd.i, { x: dd.x, y: dd.y }); return; }
      }
      drag = null;
    });
    b.addEventListener('pointercancel', () => { drag = null; });
    b.addEventListener('mouseenter', () => { hoverId = cur()?.discId ?? null; });
    b.addEventListener('mouseleave', () => { hoverId = null; });
    b.addEventListener('focus', () => {
      const sl = cur(); if (!sl) return;
      hoverId = sl.discId;
      // Focus announces the place and its first disc (the a11y module), so only the first slot of a place says it.
      const primary = store.primaryDisc(sl.placeId);
      if (primary && primary.id === sl.discId) store.focusPlace(sl.placeId);
    });
    b.addEventListener('blur', () => { hoverId = null; });
    slotEls.push({ b, main, yr, ds });
    hits.append(b);
  }
  // Page switch: a small real button in the bottom-right corner of the tray, only when there is more than one page.
  const pageBtn = document.createElement('button'); pageBtn.type = 'button'; pageBtn.className = 'hit page-btn';
  pos(pageBtn, 222, 233, 21, 13);
  pageBtn.hidden = pages.length < 2;
  pageBtn.addEventListener('click', () => {
    page = (page + 1) % pages.length; setShelf(); syncHits();
    announce(`Tray page ${page + 1} of ${pages.length}: ${pages[page].title}. ${pages[page].slots.length} discs.`);
  });
  hits.append(pageBtn);
  const doPress = (key) => { pressed = key; pressedT = 5; };
  const ACTIONS = {
    play: () => { const r = store.state.playing ? store.pause() : store.play(); if (!r.ok) announce(r.error); },
    stop: () => { store.stop(); },
    flip: () => { store.flip(); },
    sci: () => { store.setMode(store.state.mode === 'music' ? 'science' : 'music'); },
    eject: () => {
      const d = loadedDisc(); const slot = d ? slotOfDisc(d.id) : -1;
      const r = store.eject(); announce(r.ok ? `Ejected: ${d.id.replaceAll('-', ' ')}` : r.error);
      if (r.ok && slot >= 0) slotEls[slot].b.focus();   // the eject button is about to be disabled: keep focus somewhere useful
    },
  };
  for (const key of ['play', 'stop', 'flip', 'sci', 'eject']) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hit'; pos(b, BTN[key].x, BTN[key].y, BTN[key].w, BTN[key].h);
    b.addEventListener('click', () => { doPress(key); ACTIONS[key](); });
    btnEls[key] = b; hits.append(b);
  }
  // One accessible group for the 12-month LED rows (decoration for the eye; the group's name carries the meaning).
  const ledGroup = document.createElement('div'); ledGroup.className = 'hit-led'; ledGroup.setAttribute('role', 'group');
  pos(ledGroup, LED_BOX.x, LED_BOX.y, LED_BOX.w, LED_BOX.h);
  const ledYears = document.createElement('span'); ledYears.className = 'led-years'; ledYears.setAttribute('aria-hidden', 'true');
  const ledNote = document.createElement('span'); ledNote.className = 'sr'; ledGroup.append(ledYears, ledNote);
  hits.append(ledGroup);
  pos(lcdEl, LCD.x, LCD.y, LCD.w, LCD.h);

  function syncHits() {
    const d = loadedDisc(); const deck = Boolean(d);
    if (pages.length > 1) {
      const nxt = pages[(page + 1) % pages.length];
      pageBtn.textContent = `${page + 1}/${pages.length} ${page === pages.length - 1 ? '\u25C0' : '\u25B6'}`;
      pageBtn.setAttribute('aria-label', `Tray page ${page + 1} of ${pages.length}: ${pages[page].title}. Show ${nxt.title}`);
    }
    shelf.forEach((s, i) => {
      const { b, main, yr, ds } = slotEls[i];
      b.hidden = !s;
      if (!s) { main.nodeValue = ''; yr.textContent = ''; ds.textContent = ''; return; }
      const first = store.getDisc(s.discId); const inDeck = slotInDeck(s);
      b.setAttribute('aria-label', inDeck ? `${slotName(s)}, ${DS_LONG[s.dataset] ?? s.dataset}, on the deck`
        : `${slotName(s)}, ${DS_LONG[s.dataset] ?? s.dataset} ${first.year}, side ${first.side}, ${COND_TEXT[first.condition] ?? first.condition}. Press to put it on the deck.`);
      main.nodeValue = inDeck ? 'IN DECK' : slotName(s).toUpperCase();
      yr.textContent = ` · ${slotYr(s)}`;
      ds.textContent = inDeck ? '' : (DS_SHORT[s.dataset] ?? s.dataset.toUpperCase());   // same place twice: say which dataset
    });
    const label = { play: store.state.playing ? 'Pause' : 'Play', stop: 'Stop', flip: 'Flip to the other side', sci: 'Science mode', eject: 'Eject' };
    for (const key of Object.keys(btnEls)) {
      const b = btnEls[key]; b.setAttribute('aria-label', label[key]); b.title = label[key]; b.disabled = key !== 'sci' && !deck;
    }
    btnEls.sci.setAttribute('aria-pressed', String(store.state.mode === 'science'));
    const pair = pairOf(d); const cmp = pair.length > 1 ? compareSides(pair[0], pair[1]) : null;
    ledYears.textContent = !d ? '' : cmp ? `A ${cmp.a.year} · B ${cmp.b.year}` : `${d.side} ${d.year}`;
    ledNote.textContent = 'Month lights, one per month';
    const pk = d ? peakMonths(d.levels, d.dataset).map((m) => MONTH_ABBR[m]) : [];
    const pkText = pk.length ? `. ${d.dataset === 'rain' ? 'Wettest' : 'Greenest'} ${d.year}: ${pk.join(', ')}` : '';
    ledGroup.setAttribute('aria-label', (!d ? 'Month lights, empty' : cmp ? cmp.text : `Side ${d.side} ${d.year}, one light per month`) + pkText);
  }

  /* ---------- reactions to the store ---------- */
  function lift() { if (armA > 0.9) foley.play('lift'); }
  function halt() { playing = false; spinning = false; }
  store.on('disc:load', ({ disc }) => {
    preloadMaps(disc);
    const pg = pages.findIndex((pp) => pp.slots.some((x) => x.discIds.includes(disc.id)));
    if (pg >= 0 && pg !== page) { page = pg; setShelf(); }
    lift(); halt(); touched = false; flipT = 0;
    card = null; cardEl.hidden = true;
    const cardPlace = placeOf(disc);
    if (cardPlace && cardImgs.has(cardPlace.id) && !shownCards.has(cardPlace.id)) {
      shownCards.add(cardPlace.id);
      card = newCard(cardPlace);
      const nm = document.createElement('b'); nm.textContent = shortName(cardPlace).toUpperCase();
      cardEl.replaceChildren(nm, document.createTextNode(storyText(cardPlace)));
      pos(cardEl, CARD.x + 8, CARD.y + CARD.h - 40, CARD.w - 16, 36);
      cardEl.hidden = false; cardOpacity = -1;
      if (opts.announce) { setTimeout(() => opts.announce(`About ${shortName(cardPlace)}: ${storyText(cardPlace)}`), 1400); }
    }
    const idx = slotOfDisc(disc.id); const s = SLOT(Math.max(0, idx));
    const from = pendingFrom ?? { x: s.x + s.w / 2, y: s.y + L.cy };
    pendingFrom = null;
    shownId = disc.id; angle = 0; speed = 0;
    fly = { id: disc.id, t: 0, x0: from.x, y0: from.y, r0: L.discR };
    if (RM()) fly.t = 1;
    setWeather(look(disc).weather); syncHits();
  });
  store.on('play', () => { playing = true; syncHits(); });
  store.on('pause', () => { lift(); halt(); syncHits(); });
  store.on('stop', () => { lift(); halt(); touched = false; syncHits(); });
  store.on('eject', () => { lift(); halt(); touched = false; shownId = null; fly = null; setWeather('none'); syncHits(); });
  store.on('seek', () => { touched = true; });
  store.on('tick', () => { if (spinning) onMonth(); });
  store.on('flip', (p) => {
    if (p.changed) preloadMaps(p.disc);
    if (!p.changed) { flipT = RM() ? 0 : 6; return; }
    touched = false; foley.play('flip'); flipT = RM() ? 0 : 12;
    setTimeout(() => { shownId = p.disc.id; setWeather(look(p.disc).weather); syncHits(); }, RM() ? 0 : 200);
    syncHits();
  });
  for (const ev of ['mode', 'disc:record']) store.on(ev, syncHits);
  store.on('settings', (s) => foley.setVolume(s.volume));

  /** A new month is sounding: crackle and a glitch line for a missing month or a break in the source. */
  function onMonth() {
    touched = true;
    const d = loadedDisc(); if (!d) return;
    const m = monthNow(); const k = d.levels[m];
    if (k === null || k === undefined || (d.breaks && d.breaks.includes(m + 1))) { foley.play('crackle'); glitch = 8; }
  }

  /* ---------- drawing helpers ---------- */
  function drawButton(key, glyph, ledOn, ledCol) {
    const b = BTN[key]; const dn = pressed === key && pressedT > 0 ? 2 : 0;
    P('#1b120f', b.x, b.y, b.w, b.h);
    if (!dn) P('#120b0a', b.x + 2, b.y + b.h, b.w, 2);
    P('#e8d9b5', b.x + 1 + dn, b.y + 1 + dn, b.w - 2, b.h - 2); P('#fff6e0', b.x + 1 + dn, b.y + 1 + dn, b.w - 2, 1); P('#b9a888', b.x + 1 + dn, b.y + b.h - 2 + dn, b.w - 2, 1);
    P(ledOn ? ledCol : '#6b5d4a', b.x + b.w - 7 + dn, b.y + 3 + dn, 4, 2);
    ctx.fillStyle = '#3b2418'; const g = GLYPH[glyph]; const s = 2; const gx = b.x + dn + Math.round((b.w - g[0].length * s) / 2); const gy = b.y + dn + Math.round((b.h - g.length * s) / 2);
    g.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') ctx.fillRect(gx + x * s, gy + y * s, s, s); }));
  }
  function circle(x0, y0, r, col, alpha = 1) { ctx.globalAlpha = alpha; for (let a = 0; a < 6.283; a += 0.9 / Math.max(r, 1)) P(col, Math.round(x0 + Math.cos(a) * r), Math.round(y0 + Math.sin(a) * r)); ctx.globalAlpha = 1; }
  function drawDiscAt(img, x, y, r, rot = 0, sx = 1) { ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(sx, 1); ctx.drawImage(img, -r, -r, r * 2, r * 2); ctx.restore(); }

  /* ---------- weather particles ---------- */
  const surface = (x) => ((x >= X0 - 2 && x < X1 + 2) ? ROOF - snowH[x | 0] - sandH[x | 0] : GROUND);
  // Snow lies level along the whole lid; sand piles are highest in the middle and taper to nothing at the ends.
  const edgeDist = (x) => Math.min(x - X0, X1 - 1 - x);
  const snowCap = (x) => (edgeDist(x) < -2 ? 0 : edgeDist(x) < 1 ? 5 : 8);   // snow lies flat across the whole lid (only the very corners are a little lower)
  const sandCap = (x) => (edgeDist(x) < -2 ? 0 : edgeDist(x) < 1 ? 2 : 4);   // sand spreads in a thin layer with small lumps along the whole lid
  const pileSand = (x, h) => { if (x >= 0 && x < W && sandH[x] < sandCap(x)) sandH[x] = Math.min(sandCap(x), sandH[x] + h); };
  const pileSnow = (x, h) => { if (x >= 0 && x < W && snowH[x] < snowCap(x)) snowH[x] = Math.min(snowCap(x), snowH[x] + h); };
  // The weather follows the month playing: it eases toward the month's intensity, so a downpour builds and a snowfall thins
  // out gradually (and the snow on the lid melts when the month is green).
  let wxNow = 0.5;
  /* ---------- plants behind the lid: each landscape grows its own (FLORA in viz.js) through a life cycle as the months green up
     (seedling, sapling, young plant, mature, lush: a different shape at each stage, not a scaled copy), as tall as the sky
     allows and drawn a little see-through so the sky calendar still shows ---------- */
  const FLORA_X = (count) => Array.from({ length: count }, (_, i) => 20 + Math.round(i * 440 / count) + Math.round((h2(i, 3, 17) - 0.5) * 9));
  const floraSpots = {};
  function drawFlora(d, rm) {
    if (!d || growNow <= 0.03 || card) return;
    const art = look(d).art; const spec = FLORA[art] ?? FLORA.delta;
    const gDesert = art === 'desert' ? 1.5 : 1;   // a desert's greenness is low on this scale even when it is at its best: its plants (cacti, in dry colours) are judged against that
    const xs = floraSpots[art] ?? (floraSpots[art] = FLORA_X(spec.count));
    const t = rm ? 0 : performance.now() / 1000; const lush = (art === 'desert' ? FLORA_COLOURS.desert : FLORA_COLOURS.green)[Math.max(1, Math.min(4, Math.round(1 + growNow * 3)))];
    const leaf = (k) => lit(lush, k); const wood = '#5a3d27'; const woodHi = '#7a5535'; const white = '#e8e0d0'; const sage = '#6f8f55'; const sageHi = '#8fae72';
    const order = xs.map((x, i) => [x, h2(i, 5, 23), i]).sort((a2, b2) => a2[1] - b2[1]);
    ctx.globalAlpha = 0.72;
    for (const [x0, seed, i] of order) {
      const g = Math.min(1, growNow * gDesert); const stage = plantStage(g, seed, art); if (!stage) continue;
      const h = plantHeight(g, seed, spec.max, art); const kind = plantKind(seed, art);
      const sway = rm ? 0 : Math.sin(t * 1.4 + i) * (kind === 'fern' || kind === 'reed' ? 0.9 : 1.4);
      const topX = x0 + Math.round(sway * (h / 40)); const base = ROOF; const cs = [0.3, 0.45, 0.65, 0.85, 1][stage - 1];
      const trunk = (w, col = wood, hi = woodHi) => { for (let y = 0; y < h; y++) { const f = y / h; const cx = Math.round(x0 + (topX - x0) * f * f); P(col, cx, base - y, w, 1); P(hi, cx, base - y, 1, 1); } };
      const dome = (cx, cy, r, wide = 1.25) => { for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy) * wide); P(leaf(dy < -r * 0.3 ? 0.12 : dy > r * 0.4 ? -0.35 : -0.1), cx - w, cy + dy, w * 2 + 1, 1); } };
      // young plants are a sprout or a thin stem with a few leaves; a young tree is branches with leaf clusters at the tips;
      // only mature and lush trees get a full crown
      const sprout = () => { P(leaf(-0.1), x0, base - 1, 1, 2 + (stage > 1 ? 1 : 0)); P(leaf(0.2), x0 - 1, base - 2 - (stage > 1 ? 1 : 0), 1, 1); P(leaf(0.2), x0 + 1, base - 3, 1, 1); };
      const branches = (cx, cy, r, tips) => { for (const side of [-1, 0, 1]) { const len = Math.max(2, Math.round(r * (side === 0 ? 0.8 : 1)));
          for (let k = 0; k <= len; k++) P(wood, cx + Math.round(side * k * 0.9), cy + Math.round(len * 0.4) - Math.round(k * (side === 0 ? 1 : 0.5)));
          if (tips) { const tx = cx + Math.round(side * len * 0.9); const ty = cy + Math.round(len * 0.4) - Math.round(len * (side === 0 ? 1 : 0.5)); P(leaf(0.1), tx - 1, ty - 1, 3, 2); P(leaf(0.35), tx, ty - 2, 1, 1); } } };
      const crown = (cx, cy, r, wide = 1.25) => { if (stage <= 3) branches(cx, cy, Math.max(2, Math.round(r * cs)), true); else dome(cx, cy, Math.max(3, Math.round(r * cs)), wide); if (stage === 3) P(leaf(0.2), cx - 1, cy - 1, 3, 2); };
      const fan = (cx, cy, len, n, droop) => { for (let a = 0; a < n; a++) { const ang = (a / (n - 1)) * Math.PI - Math.PI;
        for (let s2 = 0; s2 <= len; s2++) { const f = s2 / len; const px = cx + Math.round(Math.cos(ang) * s2 * 0.95); const py = cy + Math.round(Math.sin(ang) * s2 * 0.5 + f * f * len * droop);
          P(leaf(f > 0.6 ? -0.3 : 0.05), px, py); if (s2 % 3 === 1) P(leaf(-0.4), px, py + 1); } } };
      const spikes = (cx, cy, n, len, col, hi) => { for (let a = 0; a < n; a++) { const ang = -Math.PI / 2 + (a - (n - 1) / 2) * (Math.PI * 0.8 / Math.max(1, n - 1)); for (let s2 = 0; s2 <= len; s2++) P(s2 > len * 0.7 ? hi : col, cx + Math.round(Math.cos(ang) * s2), cy + Math.round(Math.sin(ang) * s2)); } };
      const treeLike = ['tree', 'willow', 'birch', 'casuarina', 'gum', 'mangrove', 'giant', 'palm', 'coconut', 'bamboo', 'banana'].includes(kind);
      if (stage === 1 && treeLike) { sprout(); continue; }
      if (stage === 2 && treeLike && kind !== 'bamboo' && kind !== 'banana') { P(kind === 'birch' || kind === 'gum' ? white : wood, x0, base - Math.max(3, h), 1, Math.max(3, h)); sprout(); P(leaf(0.1), x0 - 1, base - Math.max(3, h) - 1, 3, 1); continue; }
      if (kind === 'fern') {
        for (let a = -3; a <= 3; a++) { const len = Math.round(h * (0.9 - Math.abs(a) * 0.12) * (stage < 3 ? 0.7 : 1) + 2);
          for (let s2 = 0; s2 <= len; s2++) { const f = s2 / len; const px = x0 + Math.round(a * f * (h * 0.55) / 3 + sway * f); const py = base - Math.round(h * 0.9 * Math.sin(f * Math.PI * 0.55) - f * f * h * 0.45);
            P(leaf(-0.2 + 0.3 * f), px, py); if (s2 % 2 === 0) P(leaf(-0.35), px, py + 1); } }
      } else if (kind === 'palm') {
        trunk(1); fan(topX, base - h, Math.max(4, Math.round(h * 0.38 * cs)), stage < 4 ? 5 : 7, 0.55); P(leaf(0.3), topX, base - h - 1, 1, 1);
      } else if (kind === 'tree') {
        trunk(stage > 3 ? 2 : 1); crown(topX, base - h, Math.max(4, Math.round(h * 0.3)));
        if (stage >= 5) { const vine = 3 + Math.round(h2(i, 9, 47) * 4); const r = Math.max(4, Math.round(h * 0.3)); for (let k = 0; k < 2; k++) P(leaf(-0.2), topX - r + 1 + k * (r * 2 - 2), base - h + r - 1, 1, vine); }
      } else if (kind === 'giant') {
        trunk(stage > 3 ? 3 : 2);
        if (stage >= 4) for (let k = 1; k <= 5; k++) { P(wood, x0 - k, base - Math.max(0, 5 - k) - 1, 1, Math.max(1, 6 - k)); P(wood, x0 + 2 + k, base - Math.max(0, 5 - k) - 1, 1, Math.max(1, 6 - k)); }
        if (stage <= 3) crown(topX, base - h, Math.max(5, Math.round(h * 0.3)));
        else { const cw = Math.max(10, Math.round(h * 0.55 * cs)); const cy = base - h; const ch = Math.max(3, Math.round(h * 0.13));
          for (let dy = -ch; dy <= ch; dy++) { const w = Math.round(cw * Math.sqrt(1 - (dy / ch) ** 2)); P(leaf(dy < 0 ? 0.15 : -0.3), topX + 1 - w, cy + dy, w * 2 + 1, 1); }
          for (let k = 0; k < 6; k++) P(leaf(0.45), topX + 1 - cw + Math.round(h2(i, k, 51) * cw * 2), cy - ch + Math.round(h2(i, k, 53) * ch), 3, 1); }
      } else if (kind === 'reed') {
        for (let k = -1; k <= 1; k++) { const hh = Math.max(2, h - Math.abs(k) * 2); for (let y = 0; y < hh; y++) P(leaf(-0.15 + 0.3 * y / hh), x0 + k * 2 + Math.round(sway * y / hh), base - y); if (stage > 2) P('#8a6a3a', x0 + k * 2 + Math.round(sway), base - hh, 1, Math.min(3, hh)); }
      } else if (kind === 'mangrove') {   // gnarled trunk on arching prop roots standing in the water, branches and hanging moss
        const top = base - h; const spread = Math.max(4, Math.round(h * 0.45 * (0.6 + cs * 0.4)));
        for (const side of [-1, 1]) for (const k of [0, 1, 2]) { const reach = spread * (0.55 + k * 0.3); const hgt = Math.max(3, Math.round(h * (0.55 - k * 0.12)));
          for (let u = 0; u <= 1; u += 1 / Math.max(6, Math.round(reach + hgt))) { const px = x0 + side * (2 + Math.round(reach * u)); const py = base - Math.round(hgt * (1 - u) * (1 - u) * 1.3 + hgt * 0.15 * (1 - u)); P(wood, px, Math.min(base - 1, py)); if (u > 0.9) P(woodHi, px, base - 1); } }
        for (let y = Math.round(h * 0.45); y < h; y++) P(wood, x0 + Math.round(Math.sin(y * 0.8) * 0.6), base - y, 2, 1);
        crown(x0, top, Math.max(4, Math.round(h * 0.28)), 1.5);
        if (stage >= 4) for (let k = 0; k < 4; k++) P(leaf(-0.3), x0 - spread + Math.round(h2(i, k, 71) * spread * 2), top + 3, 1, 3 + Math.round(h2(i, k, 73) * 4));
      } else if (kind === 'willow') {
        trunk(1); const r = Math.max(3, Math.round(h * 0.26)); crown(topX, base - h, r, 1.3);
        if (stage >= 4) for (let k = -r; k <= r; k += 2) P(leaf(-0.15), topX + k, base - h + Math.round(r * 0.5), 1, Math.round(r * 0.9 + 1 + h2(i, k + 9, 57) * 3));
      } else if (kind === 'bamboo') {
        const culms = stage < 3 ? [0] : stage < 4 ? [-2, 0] : [-2, 0, 2];
        for (const k of culms) { const hh = Math.round(h * (k === 0 ? 1 : 0.8)); for (let y = 0; y < hh; y++) P(y % 5 === 4 ? '#c9d98a' : '#7fa84a', x0 + k + Math.round(sway * y / hh), base - y);
          if (stage >= 3) for (let l = 0; l < 4; l++) { P(leaf(0.1), x0 + k + Math.round(sway) - 2 + l, base - hh + (l % 2), 1, 1); P(leaf(-0.2), x0 + k + Math.round(sway) + 1 + l, base - hh + 1 + (l % 2), 1, 1); } }
      } else if (kind === 'banana') {
        trunk(stage > 2 ? 2 : 1, '#8fa85a', '#b5c97a'); const nl = stage < 3 ? 2 : stage < 4 ? 3 : 5;
        for (let a = 0; a < nl; a++) { const ang = (a / Math.max(1, nl - 1)) * Math.PI - Math.PI; const L = Math.max(4, h * 0.7); for (let s2 = 0; s2 <= L; s2++) { const f = s2 / L; P(leaf(0.1 - 0.3 * f), topX + Math.round(Math.cos(ang) * s2), base - h + Math.round(Math.sin(ang) * s2 * 0.5 + f * f * h * 0.5), 1, 2); } }
      } else if (kind === 'coconut') {
        for (let y = 0; y < h; y++) { const f = y / h; P(wood, x0 + Math.round(f * f * 5 - 2), base - y); } const cx = x0 + 3;
        fan(cx, base - h, Math.max(4, Math.round(h * 0.34 * cs)), stage < 4 ? 5 : 7, 0.6); if (stage >= 4) { P('#7a4a2a', cx, base - h + 2, 2, 2); P('#7a4a2a', cx - 2, base - h + 3, 2, 2); }
      } else if (kind === 'casuarina') {
        trunk(1); const n = Math.round(h * 0.55 * cs); for (let k = 1; k <= n; k++) { const w = Math.round(k * 0.22 * (0.6 + cs * 0.4)); const y = base - h + k * 2 - 4; if (y > base - 3) break; P(leaf(-0.3 + 0.2 * ((k + i) % 2)), topX - w, y, w * 2 + 1, 1); P(leaf(-0.45), topX - w, y + 1, 1, 2); P(leaf(-0.45), topX + w, y + 1, 1, 2); }
      } else if (kind === 'saguaro') {   // ribbed column; arms grow out and up as it matures; a flower on top when lush
        const w = stage < 3 ? 2 : 3; for (let y = 0; y < h; y++) { P(sage, x0, base - y, w, 1); P(sageHi, x0 + (w > 2 ? 1 : 0), base - y, 1, 1); } P(sage, x0, base - h - 1, w, 1);
        if (stage >= 3) { const a1 = Math.round(h * 0.5); P(sage, x0 - 4, base - a1, 4, 2); P(sage, x0 - 4, base - a1 - Math.round(h * 0.28), 2, Math.round(h * 0.28) + 2); P(sageHi, x0 - 4, base - a1 - Math.round(h * 0.28), 1, Math.round(h * 0.28)); }
        if (stage >= 4) { const a2 = Math.round(h * 0.38); P(sage, x0 + w, base - a2, 4, 2); P(sage, x0 + w + 2, base - a2 - Math.round(h * 0.22), 2, Math.round(h * 0.22) + 2); P(sageHi, x0 + w + 2, base - a2 - Math.round(h * 0.22), 1, Math.round(h * 0.22)); }
        if (stage >= 5) { P('#f4e9d8', x0, base - h - 2, 2, 1); P('#e8a0b0', x0 + 1, base - h - 3, 1, 1); }
      } else if (kind === 'joshua') {   // joshua tree: a thick forking trunk ending in spiky clusters
        const t1 = Math.round(h * 0.5); for (let y = 0; y < t1; y++) P('#7a6a50', x0, base - y, stage > 2 ? 2 : 1, 1);
        const forks = stage < 3 ? [0] : stage < 4 ? [-1, 1] : [-2, 0, 2];
        for (const f of forks) { const bx = x0 + 1 + f * 3; for (let k = 0; k < Math.max(2, h - t1); k++) P('#7a6a50', x0 + Math.round(f * k * 0.9), base - t1 - k); spikes(x0 + Math.round(f * Math.max(2, h - t1) * 0.9), base - h, stage < 3 ? 3 : 6, Math.max(2, Math.round(2 + stage * 0.8)), '#5d6a42', '#a9b07a'); }
      } else if (kind === 'pear') {   // prickly pear: stacked flat pads, red fruit when lush
        const pad = (cx, cy, rw, rh) => { for (let dy = -rh; dy <= rh; dy++) { const ww = Math.round(rw * Math.sqrt(1 - (dy / rh) ** 2)); P(dy < 0 ? sageHi : sage, cx - ww, cy + dy, ww * 2 + 1, 1); } };
        const r = Math.max(2, Math.round(h * 0.4)); pad(x0, base - r, r, r);
        if (stage >= 3) { pad(x0 - r, base - 2 * r - 1, Math.max(2, r - 1), r); } if (stage >= 4) pad(x0 + r, base - 2 * r - 2, Math.max(2, r - 1), r);
        if (stage >= 5) { P('#c0392b', x0 - r, base - 3 * r - 1, 1, 1); P('#c0392b', x0 + r, base - 3 * r - 2, 1, 1); }
      } else if (kind === 'agave') {   // rosette of upright spiky leaves; a tall flower stalk when lush
        spikes(x0, base - 1, stage < 3 ? 3 : stage < 4 ? 5 : 7, Math.max(3, h), '#6f8f6a', '#9ab58a');
        if (stage >= 5) { for (let y = 0; y < h * 1.6; y++) P('#8a7a55', x0, base - y); P('#e8d28a', x0, base - Math.round(h * 1.6) - 1, 1, 2); }
      } else if (kind === 'spinifex') {
        for (let a = -5; a <= 5; a++) { const len = Math.max(2, Math.round(h * (1 - Math.abs(a) * 0.1))); for (let s2 = 0; s2 <= len; s2++) P(s2 > len * 0.6 ? '#c9b46a' : '#9a8a4a', x0 + Math.round(a * s2 * 0.45), base - s2); }
      } else if (kind === 'gum') {
        trunk(2, white, '#ffffff'); crown(topX, base - h, Math.max(3, Math.round(h * 0.2)), 1.3);
      } else if (kind === 'spruce') {
        const w0 = Math.max(3, Math.round(h * 0.28)); P(wood, topX, base - 3, 1, 3); const tiers = stage < 3 ? 2 : stage < 4 ? 3 : 4; const th = Math.round((h - 3) / tiers);
        for (let tier = 0; tier < tiers; tier++) { const y = base - 3 - tier * th; const w = Math.max(1, Math.round(w0 * (1 - tier * 0.7 / tiers))); for (let dy = 0; dy <= th + 1; dy++) { const ww = Math.round(w * (1 - dy / (th + 2))) + 1; P(leaf(-0.45 + 0.1 * tier), topX - ww, y - dy, ww * 2 + 1, 1); } }
      } else if (kind === 'birch') {
        trunk(1, white, '#ffffff'); for (let y = 3; y < h - 3; y += 4) P('#3a3a3a', x0, base - y, 1, 1);
        const r = Math.max(3, Math.round(h * 0.26)); crown(topX, base - h + 1, r, 1.1);
      }
    }
    ctx.globalAlpha = 1;
  }
  // Grass on the lid: it grows with the greenness of the month playing and withers back when the disc comes off.
  const growA = new Float32Array(W); const growSeed = Float32Array.from({ length: W }, (_, x) => h2(x, 7, 31)); let growNow = 0;
  const wxTarget = () => { const d = loadedDisc(); return d && spinning ? weatherIntensity(d, monthNow(), weather) : 0.5; };
  function spawnWeather() {
    const r = Math.random; const wx = wxNow;
    if (weather === 'snow') {
      // at 0.5 and above it snows as it always did (fast to a full sky, then steady); below that it thins out
      const n = parts.filter((p) => p.k === 'snow').length; const cap = wx >= 0.5 ? 130 : Math.round(10 + wx * 240);
      for (let i = 0; i < (n < 50 && wx >= 0.5 ? 6 : r() < Math.min(1, 0.1 + wx * 1.8) ? 1 : 0) && n + i < cap; i++) {
        const near = r() < 0.45;
        parts.push({ k: 'snow', near, sz: near ? (r() < 0.3 ? 3 : 2) : 1, x: r() * W, y: n < 50 ? r() * ROOF : -3, vx: (r() - 0.5) * 0.12, vy: near ? 0.22 + r() * 0.12 : 0.1 + r() * 0.08, t: r() * 6, sw: near ? 0.22 : 0.1, f: 0.02 + r() * 0.03 });
      }
    }
    if (weather === 'rain') {
      const n = Math.round(wx * 14) + (wx > 0.15 ? 1 : 0);   // a dry month drizzles at most; a wet one pours
      for (let i = 0; i < n; i++) parts.push({ k: 'rain', x: r() * (W + 120), y: -4, vx: -1.2 - wx * 1.2, vy: 2.4 + wx * 0.8 + r() * 0.8 });
    }
    if (weather === 'sand' && parts.filter((p) => p.k === 'sand').length < 8 + wx * 110 && r() < 0.3 + wx * 0.7) parts.push({ k: 'sand', x: -4, y: r() * (ROOF + 20), vx: 1 + r() * 1.4, vy: 0.05 + r() * 0.15, c: r() > 0.5 ? '#d9a066' : '#b9824a' });
    if (weather === 'forest') {
      if (r() < 0.04) parts.push({ k: 'leaf', x: r() * W, y: -3, vx: 0, vy: 0.35, t: r() * 6, c: ['#6aa84f', '#d98c3a', '#b5532e', '#9ac46a'][(r() * 4) | 0] });
      if (parts.filter((p) => p.k === 'fly').length < 9) parts.push({ k: 'fly', x: r() * W, y: 20 + r() * (ROOF - 30), vx: (r() - 0.5) * 0.3, vy: (r() - 0.5) * 0.3, t: r() * 6, perch: null });
    }
  }
  function stepParticles() {
    const out = [];
    for (const p of parts) {
      if (p.k === 'snow') {
        p.t += p.f; p.x += p.vx + Math.sin(p.t) * p.sw; p.y += p.vy;
        const s = surface(p.x); if (!p.near && p.y >= ROOF) continue;
        if (p.y >= s) {
          if (s < GROUND && p.x >= X0 - 2 && p.x < X1 + 2) { const xi = p.x | 0; const add = 4 + 20 * wxNow; pileSnow(xi, add); pileSnow(xi + 1, add * 0.35); pileSnow(xi - 1, add * 0.35); }   // each flake that lands adds a lot while it snows hard, so a 24 s record visibly builds a snow bank (the fall speed is unchanged)
          continue;
        }
      } else if (p.k === 'rain') {
        p.x += p.vx; p.y += p.vy; const s = surface(p.x);
        if (p.y >= s) {
          for (let i = 0; i < 3; i++) out.push({ k: 'splash', x: p.x, y: s - 1, vx: (Math.random() - 0.5) * 1.4, vy: -Math.random() * 1.2 - 0.3, life: 10 });
          if (s < GROUND && Math.random() < 0.08) out.push({ k: 'streak', x: Math.random() < 0.5 ? X0 - 1 + Math.random() * 3 : X1 - 2 + Math.random() * 3, y: ROOF + 8, vy: 0.5 + Math.random() * 0.4 });
          continue;
        }
      } else if (p.k === 'splash') { p.x += p.vx; p.y += p.vy; p.vy += 0.25; if (--p.life <= 0) continue; }
      else if (p.k === 'streak' || p.k === 'drip') {
        p.y += p.vy; if (p.k === 'drip') p.vy += 0.12;
        if (p.y >= GROUND) { out.push({ k: 'splash', x: p.x, y: GROUND - 1, vx: (Math.random() - 0.5), vy: -0.6, life: 6 }); continue; }
      } else if (p.k === 'sand') {
        p.x += p.vx; p.y += p.vy + Math.sin(p.x * 0.1) * 0.05; const s = surface(p.x);
        if (p.y >= s && s < GROUND) { if (Math.random() < 0.35) { const xi = p.x | 0; const add = 1 + 2.2 * wxNow; pileSand(xi, add); for (const [o, w] of [[1, 0.75], [2, 0.5], [3, 0.3]]) { pileSand(xi + o, add * w); pileSand(xi - o, add * w); } continue; } p.y = s - 1; }
        if (p.x > W + 4) continue;
      } else if (p.k === 'leaf') {
        p.t += 0.06; p.x += Math.sin(p.t) * 0.5 + (p.vx || 0) * 0.2; p.y += p.vy;
        const s = surface(p.x); if (!p.falling && p.y >= s && s < GROUND && leaves.length < 14) { leaves.push({ x: p.x | 0, y: s - 1, c: p.c }); continue; }
        if (p.y > GROUND) continue;
      } else if (p.k === 'fly') {
        p.t += 0.05;
        if (!p.perch && Math.random() < 0.002) p.perch = Math.random() < 0.5 ? { x: ANT.x, y: ANT.y - 1 } : { x: X0 + Math.random() * (X1 - X0), y: ROOF - 2 };
        if (p.perch) { p.x += (p.perch.x - p.x) * 0.02; p.y += (p.perch.y - p.y) * 0.02; if (Math.random() < 0.002) p.perch = null; }
        else { p.x += p.vx + Math.sin(p.t * 0.7) * 0.2; p.y += p.vy + Math.cos(p.t * 0.5) * 0.15; if (p.y > ROOF - 4) p.vy = -Math.abs(p.vy); if (p.y < 10) p.vy = Math.abs(p.vy); if (p.x < 0 || p.x > W) p.vx *= -1; }
        if (weather !== 'forest' && Math.random() < 0.01) continue;
      } else if (p.k === 'clump') { p.x += p.vx; p.y += p.vy; p.vy += 0.15; if (p.y >= GROUND) continue; }
      if (p.y < H + 5 && p.x > -140 && p.x < W + 140) out.push(p);
    }
    parts = out;
    for (let x = X0 - 2; x < X1 + 1; x++) { const d = sandH[x] - sandH[x + 1]; if (Math.abs(d) > 0.9) { sandH[x] -= d * 0.25; sandH[x + 1] += d * 0.25; } }   // sand spreads out
    for (let x = X0 - 2; x < X1 + 1; x++) { const d = snowH[x] - snowH[x + 1]; if (Math.abs(d) > 0.6) { snowH[x] -= d * 0.3; snowH[x + 1] += d * 0.3; } }   // snow settles level
    for (let x = X0 - 2; x < X1 + 2; x++) { snowH[x] = Math.min(snowH[x], snowCap(x)); sandH[x] = Math.min(sandH[x], sandCap(x)); }
    // snow on the lid stays through the snowy months and only melts, slowly, in a really green month (the record is just 24 s long)
    const melt = weather !== 'snow' ? 0.012 : wxNow < 0.2 ? 0.006 + 0.014 * (0.2 - wxNow) / 0.2 : 0;
    if (melt > 0) for (let x = X0 - 2; x < X1 + 2; x++) if (snowH[x] > 0) { snowH[x] = Math.max(0, snowH[x] - melt); if (Math.random() < 0.0015 * snowH[x]) parts.push({ k: 'drip', x, y: ROOF + 8, vy: 0.2 }); }
    if (weather !== 'sand') { for (let x = X0 - 2; x < X1 + 2; x++) sandH[x] = Math.max(0, sandH[x] - 0.006); }
    if (weather !== 'forest' && leaves.length && Math.random() < 0.01) { const l = leaves.shift(); parts.push({ k: 'leaf', x: l.x, y: l.y, vx: 1, vy: 0.3, t: 0, c: l.c, falling: true }); }
  }
  function drawParticles() {
    for (const p of parts) {
      if (p.k === 'snow') {
        if (!p.near) { ctx.globalAlpha = 0.55; P('#c9d6ea', p.x, p.y); ctx.globalAlpha = 1; }
        else if (p.sz === 2) { P('#f4f8ff', p.x, p.y, 2, 2); P('#c9d6ea', p.x + 1, p.y + 1); }
        else { P('#ffffff', p.x, p.y); ctx.globalAlpha = 0.7; P('#dfe9f7', p.x - 1, p.y); P('#dfe9f7', p.x + 1, p.y); P('#dfe9f7', p.x, p.y - 1); P('#dfe9f7', p.x, p.y + 1); ctx.globalAlpha = 1; }
      } else if (p.k === 'rain') { ctx.globalAlpha = 0.55; P('#9cc3e0', p.x, p.y); P('#9cc3e0', p.x + 1, p.y - 2); P('#6f97b6', p.x + 2, p.y - 4); ctx.globalAlpha = 1; }
      else if (p.k === 'splash') P('#c7e3ff', p.x, p.y);
      else if (p.k === 'streak' || p.k === 'drip') { P('#9cc3e0', p.x, p.y); ctx.globalAlpha = 0.4; P('#9cc3e0', p.x, p.y - 2, 1, 2); ctx.globalAlpha = 1; }
      else if (p.k === 'sand') { ctx.globalAlpha = 0.7; P(p.c, p.x, p.y); if (dith(p.x | 0, p.y | 0, 0.5)) P(p.c, p.x - 1, p.y); ctx.globalAlpha = 1; }
      else if (p.k === 'leaf') { const f = Math.sin(p.t) > 0; P(p.c, p.x, p.y, f ? 2 : 1, 1); P(lit(p.c, -0.3), p.x, p.y + 1, 1, 1); }
      else if (p.k === 'fly') { const g = 0.5 + 0.5 * Math.sin(p.t * 2); P(g > 0.6 ? '#f9e27d' : '#8a7d3a', p.x, p.y); if (g > 0.75) { ctx.globalAlpha = 0.25; P('#f9e27d', p.x - 1, p.y - 1, 3, 3); ctx.globalAlpha = 1; } }
      else if (p.k === 'clump') P('#eef4ff', p.x, p.y, 2, 2);
    }
  }

  /* ---------- LED rows: one row, or two (side A above side B) when the place + dataset has both sides ---------- */
  function drawLeds(d) {
    const pair = pairOf(d).slice(0, 2); const rows = d ? (pair.length > 1 ? pair : [d]) : [null];
    rows.forEach((rd, r) => {
      const y = r === 0 ? LEDS.rowA : LEDS.rowB;
      P('#1b120f', LEDS.x - 2, y - 1, LEDS.pitch * 12 + 1, 6);
      for (let m = 0; m < 12; m++) {
        const x = LEDS.x + m * LEDS.pitch; let c = '#3a4752';
        if (rd) c = levelColor(rd.dataset, rd.levels[m]);
        const now = rd && d && rd.id === d.id && spinning && m === monthNow();
        P(now ? lit(c, 0.3) : rd ? lit(c, -0.45) : c, x, y, 3, 3);
        if (now) P('#fff6e0', x, y + 4, 3, 1);
      }
    });
  }

  const disc = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); P(c, cx - w, cy + y, w * 2 + 1, 1); } };
  function cloud(cx, cy, w, c) {
    const r = 3; P(c, cx - (w >> 1), cy, w, 3);
    disc(cx - (w >> 2), cy, r, c); disc(cx + (w >> 2), cy, r, c); disc(cx, cy - 2, r + 1, c);
    P(lit(c, -0.25), cx - (w >> 1), cy + 3, w, 1); P(lit(c, 0.3), cx - 2, cy - 6, 4, 1);
  }
  /** One month's picture in a cell 31 x 29 px: x0, y0 = top left of the cell; t = time (0 when motion is reduced). */
  function drawMonth(ic, x0, y0, t, cur) {
    const cx = x0 + 15; const gy = y0 + 25;   // centre, ground line
    if (ic.kind === 'missing') {
      for (let x = x0 + 4; x < x0 + 27; x += 2) P('#8d8a99', x, gy, 1, 1);
      for (let a = 0; a < 6.28; a += 0.5) P('#8d8a99', cx + Math.round(Math.cos(a) * 6), y0 + 10 + Math.round(Math.sin(a) * 4));
      return;
    }
    if (ic.kind === 'plant') {
      const g = monthPal[ic.size]; const sway = cur && t ? Math.round(Math.sin(t * 3)) : 0;
      P('#5a3d27', x0 + 2, gy, 27, 4); P('#7a5535', x0 + 2, gy, 27, 1);
      for (let i = 0; i < ic.size * 2; i++) P(lit(g, -0.2), x0 + 4 + ((i * 7) % 23), gy - 1, 1, 1);   // grass tufts
      if (ic.size === 1) { P('#6a8a3a', cx, gy - 4, 1, 4); P(g, cx - 2 + sway, gy - 5, 2, 1); P(g, cx + 1 + sway, gy - 6, 2, 1); }
      else if (ic.size === 2) { disc(cx + sway, gy - 4, 4, lit(g, -0.15)); disc(cx - 1 + sway, gy - 5, 2, g); P(lit(g, -0.3), cx - 4, gy - 1, 9, 1); }
      else {
        const big = ic.size === 4; const h = big ? 9 : 6; const r = big ? 8 : 6;
        P('#5a3d27', cx - 1, gy - h, 3, h); P('#7a5535', cx - 1, gy - h, 1, h);
        disc(cx + sway, gy - h - r + 2, r, lit(g, -0.2)); disc(cx - 2 + sway, gy - h - r + 1, r - 2, g);
        if (big) { disc(cx - 6 + sway, gy - h - 2, 4, lit(g, -0.1)); disc(cx + 6 + sway, gy - h - 3, 4, lit(g, -0.25)); P(lit(g, 0.35), cx - 4 + sway, gy - h - r - 2, 3, 1); }
      }
      return;
    }
    if (ic.kind === 'snow') {
      // a snowflake: bigger and brighter the more of the land is under snow; snow on the ground in the same share
      const k = ic.size; const arm = 2 + k * 2; const cy = y0 + 12;
      const col = ['#7f93a8', '#a9bccf', '#d6e2ee', '#ffffff'][k - 1];
      const turn = cur && t ? Math.floor(t * 2) % 2 : 0;   // the playing month's flake twinkles between two poses
      const dirs = turn ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1], [1, 1], [1, -1]];
      for (const [dx, dy] of dirs) {
        const diag = dx && dy; const len = diag ? Math.round(arm * 0.72) : arm;
        for (let i = 1; i <= len; i++) { P(col, cx + dx * i, cy + dy * i); P(col, cx - dx * i, cy - dy * i); }
        if (k >= 2 && !diag) {   // little branches near the tips
          const b = Math.round(len * 0.6);
          for (const sgn of [1, -1]) {
            const bx = cx + dx * b * sgn; const by = cy + dy * b * sgn;
            P(col, bx + dy - (dx ? dx * sgn : 0) * 0, by + dx, 1, 1); P(col, bx - dy, by - dx, 1, 1);
            if (k >= 4) { P(col, bx + 2 * dy, by + 2 * dx); P(col, bx - 2 * dy, by - 2 * dx); }
          }
        }
      }
      P(turn ? '#ffffff' : lit(col, 0.3), cx - 1, cy - 1, 3, 3); P(lit(col, -0.35), cx, cy, 1, 1);
      // ground: white for the share under snow, the rest bare
      const white = Math.round(27 * [0.1, 0.35, 0.65, 1][k - 1]);
      P('#6f7d4a', x0 + 2, gy, 27, 4); P('#5a3d27', x0 + 2, gy + 2, 27, 2);
      P('#e8eef6', x0 + 2 + ((27 - white) >> 1), gy, white, 2); P('#ffffff', x0 + 2 + ((27 - white) >> 1), gy, white, 1);
      return;
    }
    if (ic.kind === 'sun') {
      const r = 2 + ic.size; const sy = y0 + 9; const tw = t ? Math.floor(t * 2) % 2 : 0;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const d = r + 2 + ((i + tw) % 2); P('#f6c552', cx + Math.round(Math.cos(a) * d), sy + Math.round(Math.sin(a) * d)); }
      disc(cx, sy, r, '#f2a93b'); disc(cx - 1, sy - 1, Math.max(1, r - 2), '#f8cf62');
      P('#a8743f', x0 + 2, gy, 27, 4); P('#c99a5c', x0 + 2, gy, 27, 1);
      for (let i = 0; i < ic.size * 3; i++) { const x = x0 + 4 + ((i * 9) % 22); P('#6b4426', x, gy + 1 + (i % 2), 2, 1); P('#6b4426', x + 1, gy + 2 + (i % 2), 1, 1); }   // cracks
      if (t && ic.size >= 3) for (let i = 0; i < 3; i++) { const y = gy - 3 - ((Math.floor(t * 6) + i * 2) % 6); ctx.globalAlpha = 0.35; P('#f6c552', x0 + 7 + i * 7, y, 3, 1); ctx.globalAlpha = 1; }   // heat shimmer
      return;
    }
    // rain or calm
    const k = ic.kind === 'rain' ? ic.size : 0;
    const w = 10 + k * 3; const cy = y0 + 6;
    const col = k === 0 ? '#e9edf2' : ['#c7d0dc', '#a9b6c6', '#8796aa', '#6c7b90'][k - 1];
    P('#4f6a3a', x0 + 2, gy, 27, 4); P('#6f8a4a', x0 + 2, gy, 27, 1);
    if (k) {
      const n = k * 3;
      for (let i = 0; i < n; i++) {
        const dx = cx - (w >> 1) + 1 + Math.round((i + 0.5) * (w - 2) / n);
        const fall = t ? (t * (10 + k * 3) + (i * 7) % 13) % 14 : (i * 5) % 14;
        P('#9cc9ea', dx, cy + 5 + Math.round(fall), 1, 2);
      }
      P('#5b93c4', cx - 2 - k * 2, gy, 4 + k * 4, 1); P('#7fb3dc', cx - 1 - k * 2, gy, 2 + k * 3, 1);   // puddle
    }
    cloud(cx, cy, w, col);
  }

  // The weather calendar shows only while the music plays (needle down); otherwise the sky is the plain map.
  const skyChartOn = (d) => Boolean(d) && !card && spinning;
  let monthPal = GREEN_SCALE;   // the calendar's plants: dry sage and ochre in a desert, green elsewhere
  function drawSkyChart(d) {
    if (!skyChartOn(d)) { if (!scEl.hidden) scEl.hidden = true; return; }
    monthPal = look(d).art === 'desert' ? FLORA_COLOURS.desert : GREEN_SCALE;
    const pair = pairOf(d).slice(0, 2); const set = pair.length > 1 ? pair : [d];
    const rowY = set.length > 1 ? [28, 58] : [43];
    const key = set.map((x) => x.id).join('+');
    if (key !== scKey || scEl.hidden) {
      scKey = key; scTitle.textContent = panelTitle(set, datasets, placeOf(d)?.name);
      scAxis.forEach((e, i) => { const rd = set[i]; e.textContent = rd ? `${rd.year}` : ''; e.classList.toggle('on', Boolean(rd && rd.id === d.id)); if (rd) pos(e, 4, rowY[i] + 12, SC.x0 - 7, 7); });
      scEl.hidden = false;
    }
    if (scAxis.some((e, i) => set[i] && e.classList.contains('on') !== (set[i].id === d.id))) scKey = '';   // side flipped: refresh labels next frame
    // the map steps back behind the pictures
    ctx.globalAlpha = 0.5; P('#0b0d1a', 0, 17, W, ROOF - 17); ctx.globalAlpha = 1;
    const now = spinning ? monthNow() : -1; const t = RM() ? 0 : performance.now() / 1000;
    for (let m = 0; m < 12; m++) {
      const cx = SC.x0 + m * SC.cell;
      if (m === now) { ctx.globalAlpha = 0.12; P('#ffffff', cx, SC.top, SC.cell - 1, SC.bottom - SC.top); ctx.globalAlpha = 1; }
      set.forEach((rd, i) => {
        ctx.globalAlpha = rd.id === d.id ? 1 : 0.55;
        drawMonth(monthIcon(rd.dataset, rd.levels[m]), cx, rowY[i], m === now || !spinning ? t : 0, m === now);
        ctx.globalAlpha = 1;
      });
    }
    if (spinning) {   // playhead: moves through the year with the music
      const x = Math.round(SC.x0 + Math.min(12, Math.max(0, store.state.position)) * SC.cell);
      ctx.globalAlpha = 0.6; P('#fff6e0', x, SC.top - 1, 1, SC.bottom - SC.top + 2); ctx.globalAlpha = 1;
      P('#fff6e0', x - 1, SC.top - 2, 3, 1);
    }
    const pk = peakMonths(d.levels, d.dataset); const ri = set.findIndex((x) => x.id === d.id);
    for (const m of pk) {
      const sx = SC.x0 + m * SC.cell + 27; const sy = rowY[ri] + 2; const tw = !RM() && Math.floor(performance.now() / 300) % 2;
      P('#1b120f', sx - 2, sy - 2, 5, 5); P('#f6d27a', sx - 1, sy, 3, 1); P('#f6d27a', sx, sy - 1, 1, 3); P(tw ? '#ffffff' : '#fff6e0', sx, sy, 1, 1);
    }
    const pkKey = `${now}|${pk.join(',')}`;
    if (pkKey !== scNow) { scMonths.forEach((e, i) => { e.classList.toggle('now', i === now); e.classList.toggle('peak', pk.includes(i)); }); scNow = pkKey; }
  }

  /* ---------- gauge: water (or sap) rises and falls with the month playing; a gold high-water mark at the year's peak ---------- */
  function drawGauge(d) {
    if (!d) return;
    const rain = d.dataset === 'rain'; const bottom = GAUGE.y + GAUGE.h;
    const hpx = Math.round(gaugeA * (GAUGE.h - 2));
    if (hpx > 0) {
      const top = bottom - hpx; const c = rain ? '#3f8fc4' : d.dataset === 'snow' ? '#dfe9f7' : '#4fbf6a';
      P(lit(c, -0.25), GAUGE.x, top, GAUGE.w, hpx); P(c, GAUGE.x + 1, top, GAUGE.w - 3, hpx);
      const wob = RM() ? 0 : Math.floor(performance.now() / 160) % GAUGE.w;
      P(lit(c, 0.45), GAUGE.x, top, GAUGE.w, 1); P('#ffffff', GAUGE.x + wob, top, 1, 1);   // the surface and a glint
      if (!RM() && spinning) for (let i = 0; i < 2; i++) { const by = bottom - ((performance.now() / 40 + i * 37) % Math.max(1, hpx)); P(lit(c, 0.3), GAUGE.x + 2 + i, by, 1, 1); }   // bubbles
    }
    P('#9fb0c0', GAUGE.x, GAUGE.y, 1, GAUGE.h);   // glass highlight
    const pk = peakMonths(d.levels, d.dataset);
    if (pk.length) {
      const y = Math.round(bottom - gaugeFill(d.dataset, d.levels[pk[0]]) * (GAUGE.h - 2));
      const onPeak = spinning && pk.includes(monthNow());
      const col = onPeak && Math.floor(performance.now() / 250) % 2 ? '#ffffff' : '#f6d27a';
      P('#1b120f', GAUGE.x - 3, y - 1, GAUGE.w + 6, 3); P(col, GAUGE.x - 2, y, GAUGE.w + 4, 1);   // high-water mark
      P(col, GAUGE.x - 4, y - 1, 1, 3); P(col, GAUGE.x - 3, y, 1, 1);                                 // little arrow on the wood side
    }
  }

  function drawMapScreen(d, rm) {
    const on = Boolean(d) && Boolean(shownId) && !fly;
    if (on !== mapOnNow) {   // the slots go away under the screen (and come back with the shelf)
      mapOnNow = on; hits.classList.toggle('map-on', on); mapEl.hidden = !on;
      if (on) { mapCur = null; mapPrev = null; mapFade = 1; }
    }
    if (!on) return;
    const m = monthNow(); const e = mapEntry(d, m); const im = mapImg(e);
    const key = e ? e.file : `none-${m}`;
    if (key !== mapCur?.key) { mapPrev = mapCur; mapCur = { key, im, e }; mapFade = rm || !mapPrev ? 1 : 0; }
    // bezel
    P('#1b120f', 20, 114, 224, 136); P('#0b0f14', 22, 116, 220, 132);
    P('#2a3440', MAP.x - 1, MAP.y - 1, MAP.w + 2, 1); P('#2a3440', MAP.x - 1, MAP.y + MAP.h, MAP.w + 2, 1);
    const paint = (c, a) => {
      if (!c) return;
      ctx.globalAlpha = a;
      if (c.im && c.im.complete && c.im.naturalWidth) ctx.drawImage(c.im, MAP.x, MAP.y, MAP.w, MAP.h);
      else {   // no NASA image this month: static
        for (let y = 0; y < MAP.h; y += 2) for (let x = 0; x < MAP.w; x += 2) if (Math.random() < 0.35) P(Math.random() < 0.5 ? '#3a4752' : '#56677a', MAP.x + x, MAP.y + y, 2, 2);
      }
      ctx.globalAlpha = 1;
    };
    paint(mapPrev, 1); paint(mapCur, mapFade);
    // CRT scanlines, faint
    ctx.globalAlpha = 0.14; for (let y = MAP.y; y < MAP.y + MAP.h; y += 2) P('#000000', MAP.x, y, MAP.w, 1); ctx.globalAlpha = 1;
    // the place: a small gold square the size of the area the music reads (about half a degree), with a ring that pulses
    const cx = MAP.x + (MAP.w >> 1); const cy = MAP.y + (MAP.h >> 1); const bl = rm || Math.floor(performance.now() / 500) % 2;
    P('#1b120f', cx - 3, cy - 3, 7, 1); P('#1b120f', cx - 3, cy + 3, 7, 1); P('#1b120f', cx - 3, cy - 3, 1, 7); P('#1b120f', cx + 3, cy - 3, 1, 7);
    const sq = bl ? '#ffe39a' : '#f6d27a';
    P(sq, cx - 2, cy - 2, 5, 1); P(sq, cx - 2, cy + 2, 5, 1); P(sq, cx - 2, cy - 2, 1, 5); P(sq, cx + 2, cy - 2, 1, 5);
    if (!rm) circle(cx, cy, 5 + (performance.now() / 150) % 7, '#f6d27a', 0.35);
    // label strip (text is DOM)
    P('#120b0a', 22, MAP.y + MAP.h + 1, 220, 248 - (MAP.y + MAP.h + 1));
    const place = placeOf(d); const name = shortName(place).toUpperCase();
    const when = e ? (e.date.length > 7 ? `${Number(e.date.slice(8, 10))} ${MONTH_ABBR[m]} ${e.date.slice(0, 4)}` : `${MONTH_ABBR[m]} ${e.date.slice(0, 4)}`) : `${MONTH_ABBR[m]} ${d.year}`;
    const txt = e ? `${name} · ${when} · ${e.source}` : `${name} · ${when} · NO NASA IMAGE THIS MONTH`;
    if (mapEl.textContent !== txt) { mapEl.textContent = txt; pos(mapEl, 24, MAP.y + MAP.h + 3, 216, 12); }
  }

  /* ---------- main draw ---------- */
  function draw() {
    const rm = RM(); const d = loadedDisc();
    ctx.drawImage(skyC, 0, 0);
    drawSkyChart(d);
    // map ping + coordinates for the disc on the deck (or the one hovered / focused)
    const focusDisc = store.getDisc(hoverId) ?? d;
    if (focusDisc) {
      const place = placeOf(focusDisc); const lat = Number(place?.lat); const lon = Number(place?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const [mx, my] = toMap(lat, lon);
        const col = d && focusDisc.id === d.id ? pingColor(d, monthNow()) : PING.idle;   // C: the ping takes the colour of the month playing
        P(col, mx - 1, my - 1, 3, 3); circle(mx, my, rm ? 5 : pingR, col, rm ? 0.6 : Math.max(0, 1 - pingR / 14));
        const txt = skyChartOn(d) ? '' : `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
        if (coordsEl.textContent !== txt) { coordsEl.textContent = txt; pos(coordsEl, mx + 6, my - 4, 120, 8); coordsEl.style.width = 'auto'; coordsEl.style.height = 'auto'; }
      }
    } else if (coordsEl.textContent) coordsEl.textContent = '';
    for (const r of rings) circle(ANT.x, ANT.y, r.r, '#f6d27a', Math.max(0, 0.8 - r.r / 30));
    P(playing && spinning ? '#f6d27a' : '#8e9aa6', ANT.x - 1, ANT.y - 2, 3, 3);
    drawFlora(d, rm);   // behind the lid
    ctx.drawImage(conC, 0, 0);
    // grass on the lid (greenness discs): blades with a darker root and a bright tip, a few flowers when it is lush; snow lies over it
    if (growNow > 0.02) {
      const t = rm ? 0 : performance.now() / 1000; const gc = (look(loadedDisc() ?? { place: '' }).art === 'desert' ? FLORA_COLOURS.desert : GREEN_SCALE)[Math.max(1, Math.min(4, Math.round(1 + growNow * 3)))];
      for (let x = X0; x < X1; x++) {
        const hgt = bladeHeight(growNow, growSeed[x]); if (!hgt) continue;
        const sway = rm || hgt < 3 ? 0 : Math.round(Math.sin(t * 2 + x * 0.35) * 0.7);
        P(lit(gc, -0.35), x, ROOF - hgt + 1, 1, hgt - 1); P(lit(gc, 0.15), x + sway, ROOF - hgt, 1, 1);
        if (growNow > 0.7 && hgt >= 5 && growSeed[x] > 0.93) P(growSeed[x] > 0.97 ? '#f6a5c0' : '#fff0a0', x + sway, ROOF - hgt - 1, 1, 1);
      }
    }
    // accumulations on the lip and in the gap
    for (let x = X0 - 2; x < X1 + 2; x++) {
      const s = snowH[x] | 0; const a = sandH[x] | 0;
      if (a > 0) { P('#c9925a', x, ROOF - a, 1, a); P('#e3b47c', x, ROOF - a, 1, 1); }
      if (s > 0) { P('#dfe9f7', x, ROOF - a - s, 1, s); P('#ffffff', x, ROOF - a - s, 1, 1); }
    }
    for (const l of leaves) { P(l.c, l.x, l.y, 2, 1); P(lit(l.c, -0.3), l.x + 1, l.y + 1); }
    // shelf discs (side A of each pair), status mark = condition by colour AND shape
    shelf.forEach((s, i) => {
      const sl = SLOT(i); const cx = sl.x + sl.w / 2; const cy = sl.y + L.cy; const R = L.discR - 2;
      if (!s) return;   // a shorter tray page: plain wood
      if (slotInDeck(s) || (drag && drag.on && drag.id === s.discId)) { for (let a = 0; a < 6.28; a += 0.3) P('#8a7a60', cx + Math.cos(a) * R, cy + Math.sin(a) * R); return; }
      const lifted = hoverId === s.discId ? -4 : 0; P('#1b120f', cx - R + 3, cy + R + 1 + (lifted ? 4 : 0), R * 2 - 6, 2);
      drawDiscAt(getArt(s.discId, 'small'), cx, cy + lifted, L.discR, lifted ? -0.12 : 0);
      const cond = store.getDisc(s.discId).condition;
      P('#1b120f', sl.x + 3, sl.y + 3, 6, 6); P(COND_COLOR[cond] ?? '#8d8a99', sl.x + 4, sl.y + 4, 4, 4);
      if (cond === 'scratched') P('#1b120f', sl.x + 4, sl.y + 7, 4, 1);
      if (cond === 'skips') P('#1b120f', sl.x + 6, sl.y + 6, 2, 2);
    });
    // (the story card is painted at the very end of draw())
    drawMapScreen(d, rm);
    // disc on the platter (or placing: it appears just above the platter, then snaps down)
    if (fly) {
      const t = fly.t; const appear = Math.min(1, t / 0.3); const fall = t < 0.62 ? 0 : (t - 0.62) / 0.38; const e = fall * fall * fall;
      const up = 12 * (1 - e); const sc = 1.05 - 0.05 * e;
      ctx.globalAlpha = (0.18 + 0.32 * e) * appear;
      for (let dy = -BIG_R; dy <= BIG_R; dy++) { const w = Math.round(Math.sqrt(BIG_R * BIG_R - dy * dy) * (1.02 - 0.04 * e)); P('#000000', PL.x - w + 2, PL.y + dy + 3, w * 2, 1); }
      ctx.globalAlpha = appear; drawDiscAt(getArt(fly.id, 'big'), PL.x, PL.y - up, BIG_R * sc, 0); ctx.globalAlpha = 1;
    }
    if (shownId && !fly) {
      const fs = flipT > 0 ? Math.abs(Math.cos((12 - flipT) / 12 * Math.PI)) || 0.05 : 1;
      drawDiscAt(getArt(shownId, 'big'), PL.x, PL.y + (settle === 2 ? 1 : 0), BIG_R, angle, fs); if (flipT > 0) flipT--;
      if (glitch > 0 && glitch % 2) { ctx.globalAlpha = 0.5; P('#e8834a', PL.x - BIG_R, PL.y - 1 + (glitch % 5) - 2, BIG_R * 2, 1); ctx.globalAlpha = 1; }
    }
    // tonearm: rest -> outer groove
    const a = -0.42 + 0.42 * (armA * armA * (3 - 2 * armA));
    const rot = (x, y) => { const dx = x - PIVOT.x; const dy = y - PIVOT.y; const c = Math.cos(a); const s = Math.sin(a); return [PIVOT.x + dx * c - dy * s, PIVOT.y + dx * s + dy * c]; };
    const seg = (A, B, col, w) => { const n = Math.max(Math.abs(B[0] - A[0]), Math.abs(B[1] - A[1])) | 0; for (let i = 0; i <= n; i++) P(col, A[0] + (B[0] - A[0]) * i / n - (w >> 1), A[1] + (B[1] - A[1]) * i / n - (w >> 1), w, w); };
    const p0 = rot(PIVOT.x, PIVOT.y); const p1 = rot(PIVOT.x - 3, PIVOT.y + 56); const p2 = rot(PIVOT.x - 36, PIVOT.y + 72); const cw = rot(PIVOT.x + 4, PIVOT.y - 15);
    seg(p0, cw, '#1b120f', 5); seg(p0, cw, '#8e9aa6', 3);
    seg(p0, p1, '#1b120f', 3); seg(p1, p2, '#1b120f', 3); seg(p0, p1, '#e8d9b5', 1); seg(p1, p2, '#e8d9b5', 1);
    P('#1b120f', p2[0] - 4, p2[1] - 3, 8, 6); P('#c2c9cf', p2[0] - 3, p2[1] - 2, 6, 4); P(spinning ? '#f6d27a' : '#6b5d4a', p2[0] - 1, p2[1] + 1, 2, 2);
    P('#1b120f', PIVOT.x - 3, PIVOT.y - 3, 6, 6); P('#fff6e0', PIVOT.x - 2, PIVOT.y - 2, 4, 4);
    // buttons + LEDs
    drawButton('play', playing ? 'pause' : 'play', playing, '#7fd8a8'); drawButton('stop', 'stop', false); drawButton('flip', 'flip', false);
    drawButton('sci', 'sci', store.state.mode === 'science', '#b9a3f0'); drawButton('eject', 'eject', false);
    drawLeds(d);
    drawGauge(d);
    // a dragged disc on top of everything
    if (drag && drag.on) drawDiscAt(getArt(drag.id, 'big'), drag.x, drag.y, 26, 0);
    if (!rm) drawParticles();
    // story card: the place's pixel art over most of the picture, with a caption strip; it fades as the record turns
    const cardOn = Boolean(card) && card.a > 0.01;
    if (cardOn) {
      const im = cardImgs.get(card.id);
      ctx.globalAlpha = card.a;
      P('#1b120f', CARD.x - 3, CARD.y - 3, CARD.w + 6, CARD.h + 6);
      P('#e8d9b5', CARD.x - 2, CARD.y - 2, CARD.w + 4, CARD.h + 4);
      P('#1b120f', CARD.x - 1, CARD.y - 1, CARD.w + 2, CARD.h + 2);
      ctx.drawImage(im, CARD.x, CARD.y, CARD.w, CARD.h);
      ctx.globalAlpha = card.a * 0.78; P('#120b0a', CARD.x, CARD.y + CARD.h - 44, CARD.w, 44);
      ctx.globalAlpha = 1;
    }
    const op = cardOn ? Math.round(card.a * 100) / 100 : 0;
    if (op !== cardOpacity) { cardOpacity = op; cardEl.style.opacity = String(op); screen.classList.toggle('card-on', cardOn); }
    // LCD
    let want;
    if (!d) want = 'INSERT A DISC';
    else if (spinning || touched) want = lcdText(d, placeOf(d).name, monthNow(), datasets);
    else want = playing ? '...' : `${shortName(placeOf(d)).toUpperCase()} · READY`;
    if (lcdEl.textContent !== want) lcdEl.textContent = want;
  }

  /* ---------- main loop (~30 fps) ---------- */
  let last = performance.now();
  renderConsole(); renderSky(); syncHits();
  setInterval(() => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now; const rm = RM();
    if (palT < 1) { palT = Math.min(1, palT + dt / 1.8); renderSky(); }
    // arm first, platter second
    const armTarget = playing && !fly ? 1 : 0;
    const armSpeed = rm ? 1 : dt / 0.7; armA += Math.sign(armTarget - armA) * Math.min(Math.abs(armTarget - armA), armSpeed);
    if (playing && armA >= 1 && !spinning && !fly) { foley.play('needle'); spinning = true; onMonth(); if (opts.onNeedleDown) opts.onNeedleDown(); }
    speed += ((spinning ? 80 : 0) - speed) * Math.min(1, dt * 2);   // 80 deg/s = one turn every 4.5 s, eases in and out
    if (!rm) angle += speed * dt * Math.PI / 180;
    if (fly) { fly.t = Math.min(1, fly.t + dt / 0.55); if (fly.t >= 1) { fly = null; foley.play('place'); settle = 3; } }
    if (settle > 0) settle--;
    if (pressedT > 0) pressedT--;
    if (glitch > 0) glitch--;
    if (!rm) { spawnWeather(); stepParticles(); }
    pingR = (pingR + dt * 10) % 14; ringT += dt;
    if (playing && spinning && ringT > 1.1) { ringT = 0; rings.push({ r: 0 }); }
    rings = rings.map((r) => ({ r: r.r + dt * 16 })).filter((r) => r.r < 30);
    { const d = loadedDisc(); const f = d && spinning ? gaugeFill(d.dataset, d.levels[monthNow()]) : 0; const target = f ?? 0;
      gaugeA += (target - gaugeA) * (rm ? 1 : Math.min(1, dt * 3)); }
    if (mapFade < 1) mapFade = Math.min(1, mapFade + dt / 0.6);
    wxNow += (wxTarget() - wxNow) * Math.min(1, dt * 0.8);
    { const d = loadedDisc(); const g = d && spinning ? greenGrowth(d, monthNow()) : 0; if (g !== null) growNow += (g - growNow) * Math.min(1, dt * (g > growNow ? 0.5 : 0.25)); }
    if (card && !stepCard(card, dt, { rm, playing })) { card = null; cardEl.hidden = true; }
    draw();
  }, 33);

  /** Screen box of a part of the console, for the How to use spotlight (coach.js). */
  const AREAS = { tray: { x: 20, y: 114, w: 224, h: 136 }, deck: { x: 256, y: 112, w: 206, h: 142 }, sky: { x: 0, y: 17, w: W, h: ROOF - 17 },
    gauge: { x: GAUGE.x - 2, y: GAUGE.y - 2, w: GAUGE.w + 4, h: GAUGE.h + 4 }, lcd: LCD };
  function boxOf(key) {
    const el = { play: btnEls.play, stop: btnEls.stop, flip: btnEls.flip, sci: btnEls.sci, eject: btnEls.eject, page: pageBtn,
      details: document.getElementById('details-btn'), settings: document.getElementById('settings-btn') }[key];
    if (el) { const r = el.getBoundingClientRect(); return r.width && getComputedStyle(el).visibility !== 'hidden' ? r : null; }
    const a = AREAS[key]; if (!a) return null;
    const c = cv.getBoundingClientRect();
    return { left: c.left + a.x / W * c.width, top: c.top + a.y / H * c.height, width: a.w / W * c.width, height: a.h / H * c.height };
  }
  return { slotButtons: slotEls.map((s) => s.b), months: MONTH_ABBR, boxOf };
}
