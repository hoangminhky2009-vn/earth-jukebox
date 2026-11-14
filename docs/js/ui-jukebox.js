// Written by Ky with help from Claude (SI). See AI_USE.md.
// The Details dialog (facts, 12-month chart, month table, piano roll) and the Settings dialog.
// Text builders are pure so they can run under node --test; the console itself is drawn by scene.js.

import { monthBars } from './viz.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const READOUT_NAME = { rain: 'Rain', ndvi: 'Greenness' };
const CREDITS_URL = 'https://github.com/hoangminhky2009-vn/earth-jukebox/blob/main/CREDITS.md';
// Honest limits of each dataset, shown in the Details dialog.
const LIMITS = {
  rain: 'Rain is smoothed over about 3 months and saturates beyond ±15 mm/day: stronger rain or drought still reads as 15+.',
  ndvi: 'Greenness is a position on the image’s colour scale (low to high). It is not an NDVI number: the scale carries no NDVI values.',
};
const CONDITION = {
  mint: { icon: '✓', text: 'Mint', note: 'every month has data' },
  scratched: { icon: '✕', text: 'Scratched', note: 'some months are missing' },
  skips: { icon: '↻', text: 'Skips', note: 'the colour match is weak in some months' },
};

/** Check Mint / cross Scratched / loop Skips (mono glyphs): the word is always there, never colour alone. */
export function conditionLabel(condition) {
  const c = CONDITION[condition];
  return c ? `${c.icon} ${c.text}` : String(condition);
}

/** One line for the month being played, e.g. "Rain · July 2025: 2 to 5 mm/day drier · colour match 100%". */
export function readoutText(disc, month, datasets) {
  const m = Math.min(11, Math.max(0, Math.floor(month)));
  const when = `${MONTHS[m]} ${disc.year}`;
  const level = disc.levels[m];
  if (level === null || level === undefined) return `${when}: missing data (crackle)`;
  const found = datasets?.[disc.dataset]?.levels.find((l) => l.level === level);
  const label = found ? found.label : `level ${level}`;
  const name = READOUT_NAME[disc.dataset] ?? disc.dataset;
  if (disc.dataset === 'ndvi') {
    const v = disc.values?.[m];
    const pos = typeof v === 'number' ? ` (${v} on the colour scale)` : '';
    return `${name} · ${when}: ${label}${pos}`;
  }
  return `${name} · ${when}: ${label} · colour match ${Math.round(disc.match_pct)}%`;
}

/** The small mono line under the header: ">_ disc/dhaka-rain-2025 · rain · source: NASA SVS 4897 · side A". */
export function metaText(disc, datasets) {
  if (!disc) return '>_ no disc loaded · pick a place';
  const svs = datasets?.[disc.dataset]?.svs ?? disc.source?.svs;
  return `>_ disc/${disc.id} · ${disc.dataset} · source: NASA SVS${svs ? ` ${svs}` : ''} · side ${disc.side}`;
}

/**
 * The LEVEL row and the trend glyph for a month. Rain has a sign (wetter or drier than normal);
 * greenness has no "normal", so it shows its position on the scale. dir is 'up', 'down', 'flat' or 'none'.
 */
export function levelInfo(disc, month, datasets) {
  const m = Math.min(11, Math.max(0, Math.floor(month)));
  const level = disc.levels[m];
  if (level === null || level === undefined) return { dir: 'none', glyph: '', text: '— missing' };
  if (disc.dataset === 'rain') {
    if (level > 0) return { dir: 'up', glyph: '▲', text: `▲ +${level}` };
    if (level < 0) return { dir: 'down', glyph: '▼', text: `▼ −${Math.abs(level)}` };
    return { dir: 'flat', glyph: '●', text: '● near normal' };
  }
  const top = Math.max(...(datasets?.[disc.dataset]?.levels ?? [{ level }]).map((l) => l.level));
  return { dir: 'flat', glyph: '', text: `● ${level} of ${top}` };
}

/** Short form for the stats block: "5/month · 60 total" or "3-5/month · 48 total". */
export function framesShort(disc) {
  const f = disc.frames_used ?? [];
  if (!f.length) return 'not recorded';
  const lo = Math.min(...f);
  const hi = Math.max(...f);
  return `${lo === hi ? lo : `${lo}-${hi}`}/month · ${f.reduce((a, b) => a + b, 0)} total`;
}

/** "5 frames per month (60 in total)" or "3 to 5 frames per month (48 in total)". */
export function framesText(disc) {
  const f = disc.frames_used ?? [];
  if (!f.length) return 'not recorded';
  const lo = Math.min(...f);
  const hi = Math.max(...f);
  const total = f.reduce((a, b) => a + b, 0);
  return `${lo === hi ? lo : `${lo} to ${hi}`} frames per month (${total} in total)`;
}

/** Rows for the Details dialog: [term, value] pairs plus the link targets. */
export function detailRows(disc, datasets) {
  const ds = datasets?.[disc.dataset] ?? {};
  const cond = CONDITION[disc.condition];
  return {
    rows: [
      ['Dataset', ds.label ?? disc.dataset],
      ['Unit', ds.unit ?? 'not given'],
      ['Condition', `${conditionLabel(disc.condition)}${cond ? ` (${cond.note})` : ''}`],
      ['Colour match', `${Math.round(disc.match_pct)}%`],
      ['Frames used', framesText(disc)],
      ['Limits', LIMITS[disc.dataset] ?? 'See the unit above.'],
      ['Description', disc.description ?? ''],
    ].filter(([, value]) => String(value).trim() !== ''),   // no empty rows (descriptions are still being written)
    svsUrl: ds.svs_url ?? disc.source?.svs_url ?? null,
    svsId: ds.svs ?? disc.source?.svs ?? null,
    creditsUrl: CREDITS_URL,
  };
}

/**
 * The NASA frame shown in Details: every frame is the 15 July image of the disc's year, cut to 256 x 256 px around
 * the place (pipeline/run.py). Alt text = the reviewed description when there is one, else a plain factual one.
 */
export function frameFigure(disc, place) {
  if (!disc?.frame) return null;
  const where = String(place?.name ?? disc.place).split(',')[0].replace(/\s+and surroundings$/i, '');
  const date = `15 July ${disc.year}`;
  const what = disc.dataset === 'rain'
    ? 'rain compared with normal (brown = drier, green and turquoise = wetter)'
    : 'vegetation greenness (pale = bare, deep green = dense plants)';
  const alt = String(disc.description ?? '').trim() || `NASA map of ${what}, ${date}, centred on ${where}.`;
  const caption = `NASA Scientific Visualization Studio frame, ${date}, centred on ${where}: ${what}. One day's picture for this disc; the music uses all 12 months.`;
  return { src: disc.frame, alt, caption };
}

// ---------------------------------------------------------------- DOM part (browser only)

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}

// Chart geometry (SVG units). Each column is 24 wide; a block is one level (rain) or one quarter (greenness).
const COL = 24; const BLOCK = 11; const PITCH = 12; const RAIN_ZERO = 70; const NDVI_BASE = 120;

/**
 * The 12-month chart (for the eye: the table under it carries the same facts for screen readers).
 * Rain: pixel bars up (wetter, ▲) or down (drier, ▼) from a zero line, with the mm/day label.
 * Greenness: quarter blocks filled from the bottom. Missing months: a grey checker cell labelled "no data".
 */
export function renderMonthChart(bars, dataset) {
  const rain = dataset === 'rain';
  const root = svg('svg', { class: 'chart-svg', viewBox: `0 0 ${COL * 12} 150`, 'aria-hidden': 'true', focusable: 'false' });
  root.append(svg('defs', {}, svg('pattern', { id: 'chart-checker', width: 4, height: 4, patternUnits: 'userSpaceOnUse' },
    svg('rect', { width: 4, height: 4, fill: '#6b6577' }), svg('rect', { width: 2, height: 2, fill: '#2d2836' }), svg('rect', { x: 2, y: 2, width: 2, height: 2, fill: '#2d2836' }))));
  root.append(svg('rect', { class: 'chart-zero', x: 0, y: rain ? RAIN_ZERO : NDVI_BASE + 1, width: COL * 12, height: 1 }));
  for (const b of bars) {
    const x = b.month * COL + 3; const w = COL - 6; const cx = b.month * COL + COL / 2;
    const text = (y, t) => svg('text', { x: cx, y, 'text-anchor': 'middle', 'font-size': 7.5 }, t);
    if (b.kind === 'missing') {
      root.append(svg('rect', { x, y: rain ? RAIN_ZERO - 24 : NDVI_BASE - 48, width: w, height: 48, fill: 'url(#chart-checker)' }));
      const ty = rain ? RAIN_ZERO - 34 : NDVI_BASE + 9; // two short lines, so neighbouring labels do not touch
      root.append(text(ty, 'no'), text(ty + 7, 'data'));
    } else if (rain) {
      if (b.steps === 0) root.append(svg('rect', { class: 'c-bar', x, y: RAIN_ZERO - 2, width: w, height: 3, fill: b.color }));
      for (let i = 0; i < b.steps; i++) {
        const y = b.dir === 'up' ? RAIN_ZERO - PITCH * (i + 1) : RAIN_ZERO + 2 + PITCH * i;
        root.append(svg('rect', { class: 'c-bar', x, y, width: w, height: BLOCK, fill: b.color }));
      }
      const above = RAIN_ZERO - (b.dir === 'up' ? PITCH * b.steps : 0) - 5;
      const below = RAIN_ZERO + 2 + (b.dir === 'down' ? PITCH * b.steps : 0) + 8;
      root.append(text(b.dir === 'down' ? below : above, b.short));
    } else {
      for (let i = 0; i < b.of; i++) {
        const y = NDVI_BASE - PITCH * (i + 1) + 1;
        root.append(i < b.steps
          ? svg('rect', { class: 'c-bar', x, y, width: w, height: BLOCK, fill: b.color })
          : svg('rect', { class: 'chart-empty', x: x + 0.5, y: y + 0.5, width: w - 1, height: BLOCK - 1 }));
      }
      root.append(text(NDVI_BASE + 10, b.short));
    }
    root.append(svg('text', { class: 'c-month', x: cx, y: 145, 'text-anchor': 'middle', 'font-size': 7.5 }, b.label));
  }
  return root;
}

/** A real table of the same twelve months: month, level, value text. */
export function renderMonthTable(bars, disc) {
  const table = el('table', { className: 'month-table' });
  table.append(el('caption', {}, `Month by month, ${disc.year} (side ${disc.side})`));
  table.append(el('thead', {}, el('tr', {}, ...['Month', 'Level', 'Value'].map((h) => el('th', { scope: 'col' }, h)))));
  const body = el('tbody');
  for (const b of bars) {
    const tr = el('tr', {}, el('th', { scope: 'row' }, b.name), el('td', {}, b.levelText), el('td', {}, b.text));
    tr.dataset.kind = b.kind;
    body.append(tr);
  }
  table.append(body);
  return table;
}

/** Wire a modal dialog: Close button, backdrop click and Esc all close it and return focus to the opener. */
function wireDialog(dialog, opener, closeBtn) {
  let from = opener;
  // "close" fires for Esc, the Close button and the backdrop alike.
  dialog.addEventListener('close', () => { (from ?? opener)?.focus(); });
  closeBtn?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  return (trigger) => {
    from = trigger ?? opener;
    if (!dialog.open) { dialog.showModal(); dialog.querySelector('h2')?.focus(); dialog.scrollTop = 0; } // start at the top, with the title read first
  };
}

/**
 * The Details dialog (Details button or I key) and the Settings dialog. The console buttons live in scene.js.
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{datasets: object, announce: (t:string)=>void}} opts
 */
export function initDialogs(store, opts) {
  const { datasets, announce } = opts;
  const $ = (id) => document.getElementById(id);
  const current = () => store.getDisc(store.state.loadedDisc);

  const detailsDialog = $('details-dialog');
  const detailsBtn = $('details-btn');
  const openDetails = wireDialog(detailsDialog, detailsBtn, $('details-close'));
  function fillDetails(disc) {
    const d = detailRows(disc, datasets);
    const bars = monthBars(disc, datasets);
    $('details-meta').textContent = metaText(disc, datasets);
    const body = $('details-body');
    body.replaceChildren();
    body.append(el('h3', {}, 'Twelve months'));
    body.append(el('div', { className: 'chart' }, renderMonthChart(bars, disc.dataset)));
    body.append(el('p', { className: 'chart-note' }, disc.dataset === 'rain'
      ? 'Bars up (▲) are wetter than normal, bars down (▼) are drier, in mm/day. Each number is the middle of its band. A grey checker cell means no data.'
      : 'Four blocks = the greenness scale split in quarters (low to high). A grey checker cell means no data.'));
    body.append(renderMonthTable(bars, disc));
    const fig = frameFigure(disc, store.getPlace(disc.place));
    if (fig) {
      body.append(el('h3', {}, 'The NASA image'));
      body.append(el('figure', { className: 'frame-fig' },
        el('img', { src: fig.src, alt: fig.alt, width: 256, height: 256, loading: 'lazy' }),
        el('figcaption', {}, fig.caption)));
    }
    body.append(el('h3', {}, 'About this disc'));
    const dl = el('dl', { className: 'details-list' });
    for (const [term, value] of d.rows) dl.append(el('dt', {}, term), el('dd', {}, value));
    body.append(dl);
    const links = el('p', { className: 'details-links' });
    if (d.svsUrl) links.append(el('a', { href: d.svsUrl, target: '_blank', rel: 'noopener' }, `NASA SVS ${d.svsId ?? ''} page (opens in a new tab)`));
    links.append(el('a', { href: d.creditsUrl, target: '_blank', rel: 'noopener' }, 'CREDITS.md (opens in a new tab)'));
    body.append(links);
  }
  function showDetails(trigger) {
    const disc = current();
    if (!disc) { announce('No disc loaded'); return; }
    fillDetails(disc);
    openDetails(trigger);
  }
  detailsBtn.addEventListener('click', () => showDetails(detailsBtn));
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'i' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t?.tagName) || t?.isContentEditable) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    const a = document.activeElement;
    showDetails(a instanceof HTMLElement && a !== document.body ? a : detailsBtn);
  });

  // --- settings dialog (the inputs keep their ids; app.js binds them)
  const settingsBtn = $('settings-btn');
  const openSettings = wireDialog($('settings-dialog'), settingsBtn, $('settings-close'));
  settingsBtn.addEventListener('click', () => openSettings(settingsBtn));
}
