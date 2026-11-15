// Written by Ky with help from Claude (SI). See AI_USE.md.
// Screen-reader announcements, keyboard shortcuts and the 1-second preview.
// Message builders are pure (no DOM) so they can run under node --test.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const DATASET_NAME = { rain: 'rain', ndvi: 'vegetation', snow: 'snow cover' };

let datasets = {};
let hooks = { duck: () => {}, write: null };

const shortName = (place) => place.name.split(',')[0];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Condition: mint." / "Condition: scratched, 2 months missing." / "Condition: skips, 1 month with a break." */
export function conditionText(disc) {
  const missing = disc.levels.filter((x) => x === null).length;
  if (disc.condition === 'scratched') return `Condition: scratched, ${plural(missing, 'month')} missing.`;
  if (disc.condition === 'skips') return `Condition: skips, ${plural(disc.breaks?.length ?? 0, 'month')} with a break.`;
  return `Condition: ${disc.condition}.`;
}

/** Month label from the dataset's own levels, e.g. "August: 2 to 5 mm/day wetter". */
export function monthText(disc, month, dsets = datasets) {
  const level = disc.levels[month];
  if (level === null) return `${MONTHS[month]}: no data`;
  const found = dsets[disc.dataset]?.levels.find((l) => l.level === level);
  return `${MONTHS[month]}: ${found ? found.label : `level ${level}`}`;
}

export const messages = {
  focus(store, { placeId }) {
    const place = store.getPlace(placeId);
    const biome = String(place.biome ?? '').replaceAll('-', ' ');
    const head = `${shortName(place)}${biome ? `, ${biome}` : ''}.`;
    const disc = store.primaryDisc(placeId);
    if (!disc) return `${head} No discs yet.`;
    const name = DATASET_NAME[disc.dataset] ?? disc.dataset;
    const cap = name[0].toUpperCase() + name.slice(1);
    return `${head} ${cap} ${disc.year}, side ${disc.side}. ${conditionText(disc)}`;
  },
  record(store, { disc }) {
    const place = store.getPlace(disc.place);
    return `Recorded: ${shortName(place)} ${DATASET_NAME[disc.dataset] ?? disc.dataset} ${disc.year}. ${conditionText(disc)}`;
  },
  play: () => 'Playing',
  pause: (store) => `Paused at ${MONTHS[Math.floor(store.state.position)]}`,
  stop: () => 'Stopped',
  seek(store, { month }) {
    return monthText(store.getDisc(store.state.loadedDisc), month);
  },
  flip(store, p) {
    if (!p.changed) return p.message;
    return `Side ${p.side}, ${p.disc.year}`;
  },
  mode: (store, { mode }) => (mode === 'science' ? 'Science mode' : 'Music mode'),
};

let lastSaid = { text: '', at: 0, joined: false };

/**
 * Say something through the polite live region, and duck the music so the reader is heard.
 * Two sentences sent within 150 ms (e.g. "Recorded: ..." then "On the deck: ...") are joined, so the second does not cut off the first.
 * Only pairs are joined: a held key (many messages in a row) still says just the latest one.
 */
export function announce(text) {
  hooks.duck(-12, 1500);
  if (hooks.write) { hooks.write(text); return; }
  if (typeof document === 'undefined') return;
  const live = document.getElementById('live');
  if (!live) return;
  const now = Date.now();
  const join = now - lastSaid.at < 150 && !lastSaid.joined;
  const joined = join ? `${lastSaid.text} ${text}` : text;
  lastSaid = { text: joined, at: now, joined: join };
  live.textContent = '';
  // Small delay so repeated identical messages are still announced.
  setTimeout(() => { live.textContent = joined; }, 50);
}

/** Keys that should not trigger shortcuts: typing in a field, or a dialog is open. */
function blocked(e) {
  const t = e.target;
  const tag = t?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t?.isContentEditable) return true;
  if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) return true;
  return false;
}

/**
 * Wire announcements, shortcuts and preview to the store.
 * @param store the store
 * @param {object} [opts]
 * @param {(db:number, ms:number)=>void} [opts.duck] audio.duck
 * @param {(text:string)=>void} [opts.write] replaces the live-region write (tests)
 * @param {()=>boolean} [opts.isStarted] false before the first click or key press: shortcuts stay silent
 * @param {{start:(place:object)=>void, stop:()=>void, canStart?:()=>boolean}} [opts.preview]
 * @returns {{onKeyDown:(e:{key:string,target?:any,preventDefault?:()=>void})=>void}}
 */
export function initA11y(store, opts = {}) {
  datasets = opts.datasets ?? opts.data?.datasets ?? datasets;
  hooks = { duck: opts.duck ?? (() => {}), write: opts.write ?? null };
  const preview = opts.preview;
  let timer = null;
  let previewing = false;

  function cancelPreview() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (previewing) { previewing = false; preview?.stop(); }
  }

  for (const ev of ['record', 'play', 'pause', 'stop', 'seek', 'flip', 'mode']) {
    const name = ev === 'record' ? 'disc:record' : ev;
    const fn = messages[ev];
    store.on(name, (p) => { cancelPreview(); announce(fn(store, p)); });
  }
  store.on('place:select', cancelPreview);
  store.on('place:focus', (p) => {
    cancelPreview(); // focus moved: drop the pending timer and stop any preview
    announce(messages.focus(store, p));
    if (!preview) return;
    timer = setTimeout(() => {
      timer = null;
      if (!store.state.settings.preview) return;
      if (preview.canStart && !preview.canStart()) return;
      previewing = true;
      preview.start(store.getPlace(p.placeId));
    }, 1000);
  });
  // Moving focus out of the list altogether also cancels (the list sends no event for that).
  if (typeof document !== 'undefined') {
    document.addEventListener('focusin', (e) => {
      if (!e.target.closest?.('.slot')) cancelPreview();
    });
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || blocked(e)) return;
    if (opts.isStarted && !opts.isStarted()) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const onOtherButton = e.target?.tagName === 'BUTTON' && !e.target.closest?.('.place-list, .slot');
    const act = (fn) => { e.preventDefault?.(); fn(); };
    const noDisc = () => announce('No disc loaded');
    switch (key) {
      case ' ':
        if (onOtherButton) return; // let a focused button keep its own Space behaviour
        act(() => {
          if (!store.state.loadedDisc) noDisc();
          else if (store.state.playing) store.pause(); else store.play();
        });
        break;
      case 'ArrowRight': case 'ArrowLeft':
        act(() => {
          if (!store.state.loadedDisc) { noDisc(); return; }
          store.seek(Math.floor(store.state.position) + (key === 'ArrowRight' ? 1 : -1));
        });
        break;
      case 'f': act(() => { store.flip(); }); break;
      case 'm': act(() => { store.setMode(store.state.mode === 'music' ? 'science' : 'music'); }); break;
      case 'Escape': act(() => { store.stop(); }); break;
      default: break; // Up/Down and Enter are handled by the place list
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown);
  return { onKeyDown };
}
