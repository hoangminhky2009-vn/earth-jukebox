// Written by Ky with help from Claude (SI). See AI_USE.md.
// The Player section (frame, spinning disc, five buttons, month readout), the Details dialog
// and the Settings dialog. Text builders are pure so they can run under node --test.

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
  mint: { icon: '★', text: 'Mint', note: 'every month has data' },
  scratched: { icon: '◐', text: 'Scratched', note: 'some months are missing' },
  skips: { icon: '✕', text: 'Skips', note: 'the colour match is weak in some months' },
};

/** Star Mint / half-circle Scratched / cross Skips: the word is always there, never colour alone. */
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
    ],
    svsUrl: ds.svs_url ?? disc.source?.svs_url ?? null,
    svsId: ds.svs ?? disc.source?.svs ?? null,
    creditsUrl: CREDITS_URL,
  };
}

// ---------------------------------------------------------------- DOM part (browser only)

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
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
    if (!dialog.open) dialog.showModal();
  };
}

/**
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{datasets: object, announce: (t:string)=>void, isStarted?: ()=>boolean}} opts
 */
export function initJukebox(store, opts) {
  const { datasets, announce } = opts;
  const $ = (id) => document.getElementById(id);
  const player = $('player');
  const img = $('frame-img');
  const ph = $('frame-ph');
  const discLabel = $('disc-label');
  const readout = $('readout');
  const condition = $('condition');
  const playBtn = $('btn-play');
  const modeBtn = $('btn-mode');
  const current = () => store.getDisc(store.state.loadedDisc);

  // --- frame image, with a text box in its place when the file is missing
  function showFrame(disc) {
    if (!disc) {
      img.hidden = true; img.removeAttribute('src'); img.alt = '';
      ph.textContent = 'No disc loaded'; ph.hidden = false;
      discLabel.removeAttribute('href');
      return;
    }
    ph.textContent = 'Frame image not available yet';
    img.alt = disc.description ?? '';
    img.classList.remove('is-missing');
    ph.hidden = true;
    img.hidden = false;
    img.removeAttribute('src');
    discLabel.removeAttribute('href'); // set again only once the <img> has loaded
    img.src = disc.frame;
  }
  // A failed load keeps the <img> (its alt text stays for screen readers) but hides its icon.
  img.addEventListener('error', () => {
    if (!img.getAttribute('src')) return;
    img.classList.add('is-missing');
    ph.hidden = false;
    discLabel.removeAttribute('href'); // the disc label falls back to its plain circle too
  });
  img.addEventListener('load', () => {
    img.classList.remove('is-missing'); ph.hidden = true;
    discLabel.setAttribute('href', img.getAttribute('src'));
  });

  function render() {
    const disc = current();
    const loaded = Boolean(disc);
    player.classList.toggle('is-playing', loaded && store.state.playing);
    player.classList.toggle('is-loaded', loaded);
    playBtn.textContent = store.state.playing ? 'Pause' : 'Play';
    modeBtn.setAttribute('aria-pressed', String(store.state.mode === 'science'));
    if (!loaded) {
      readout.textContent = 'No disc loaded. Pick a place, press Enter to record its disc, then Enter again to play it.';
      condition.hidden = true;
      return;
    }
    readout.textContent = readoutText(disc, store.state.position, datasets);
    condition.hidden = false;
    condition.textContent = `${conditionLabel(disc.condition)} · side ${disc.side}`;
    condition.dataset.condition = disc.condition;
  }
  let shown = null;
  function sync() {
    const id = store.state.loadedDisc;
    if (id !== shown) { shown = id; showFrame(current()); }
    render();
  }
  for (const ev of ['disc:load', 'play', 'pause', 'stop', 'seek', 'flip', 'mode', 'tick', 'eject']) store.on(ev, sync);
  sync();

  // --- the five buttons
  const guard = () => {
    if (opts.isStarted && !opts.isStarted()) { announce('Press the Start button first'); return false; }
    return true;
  };
  playBtn.addEventListener('click', () => {
    if (!guard()) return;
    const r = store.state.playing ? store.pause() : store.play();
    if (!r.ok) announce(r.error);
  });
  $('btn-stop').addEventListener('click', () => { if (guard()) store.stop(); });
  $('btn-flip').addEventListener('click', () => { store.flip(); }); // flip announces its own message
  modeBtn.addEventListener('click', () => { store.setMode(store.state.mode === 'music' ? 'science' : 'music'); });
  $('btn-eject').addEventListener('click', () => {
    const disc = current();
    const r = store.eject();
    announce(r.ok ? `Ejected: ${disc.id.replaceAll('-', ' ')}` : r.error);
  });

  // --- details dialog (button or I key)
  const detailsDialog = $('details-dialog');
  const detailsBtn = $('details-btn');
  const openDetails = wireDialog(detailsDialog, detailsBtn, $('details-close'));
  function fillDetails(disc) {
    const d = detailRows(disc, datasets);
    const body = $('details-body');
    body.replaceChildren();
    const dl = el('dl', { className: 'details-list' });
    for (const [term, value] of d.rows) dl.append(el('dt', {}, term), el('dd', {}, value));
    body.append(dl);
    const links = el('p', { className: 'details-links' });
    if (d.svsUrl) {
      links.append(el('a', { href: d.svsUrl, target: '_blank', rel: 'noopener' }, `NASA SVS ${d.svsId ?? ''} page (opens in a new tab)`));
    }
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
    showDetails(document.activeElement instanceof HTMLElement ? document.activeElement : detailsBtn);
  });

  // --- settings dialog (the inputs keep their ids; app.js binds them)
  const settingsBtn = $('settings-btn');
  const openSettings = wireDialog($('settings-dialog'), settingsBtn, $('settings-close'));
  settingsBtn.addEventListener('click', () => openSettings(settingsBtn));
}
