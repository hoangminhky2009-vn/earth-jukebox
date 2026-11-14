// Written by Ky with help from Claude (SI). See AI_USE.md.
// The "Places" list: one real button per place, west to east, the main keyboard route.
// Under a selected or recorded place its discs appear as small chip buttons, so every disc can be reached by keyboard.

const DISC_NAME = { rain: 'Rain', ndvi: 'Greenness' };

/** Visible text of a disc chip, e.g. "Rain 2025 · A" (CSS makes it upper case). */
export function discChipText(disc) {
  return `${DISC_NAME[disc.dataset] ?? disc.dataset} ${disc.year} · ${disc.side}`;
}

/** Accessible name of a disc chip: says what Enter will do. */
export function discChipLabel(disc, { recorded, onDeck }) {
  const base = `${DISC_NAME[disc.dataset] ?? disc.dataset} ${disc.year}, side ${disc.side}`;
  if (onDeck) return `${base}, loaded`;
  return recorded ? `${base}, recorded. Enter plays it` : `${base}, not recorded. Enter records it`;
}

/** The discs to show under a place, or [] when the place is neither selected nor recorded. */
export function chipDiscs(store, placeId) {
  const discs = store.discsOf(placeId);
  const show = store.state.selectedPlace === placeId || discs.some((d) => store.state.collected.has(d.id));
  return show ? discs : [];
}

/**
 * Enter on a disc: record it if new, otherwise load and play it (after Start).
 * @returns {'recorded'|'blocked'|'played'|'failed'}
 */
export function activateDisc(store, discId, opts = {}) {
  if (!store.state.collected.has(discId)) return store.record(discId).ok ? 'recorded' : 'failed';
  if (opts.canPlay && !opts.canPlay()) { opts.onBlocked?.('Press the Start button first'); return 'blocked'; }
  if (!store.load(discId).ok) return 'failed';
  store.play();
  return 'played';
}

/**
 * Build the list inside `nav`. Up/Down move focus (roving tabindex); Enter records an unrecorded
 * disc, or loads and plays a recorded one.
 * @param {HTMLElement} nav container element
 * @param {ReturnType<import('./store.js').createStore>} store
 * @param {{canPlay?: () => boolean, onBlocked?: (msg: string) => void}} [opts]
 */
export function initPlaceList(nav, store, opts = {}) {
  const places = [...store.state.places].sort((a, b) => a.lon - b.lon);
  const ul = document.createElement('ul');
  ul.className = 'place-list';
  const chip = (cls, text) => {
    const s = document.createElement('span');
    s.className = `chip px-notch ${cls}`.trim();
    s.textContent = text;
    return s;
  };
  const rows = places.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'place';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'place-btn px-frame';
    b.dataset.place = p.id;
    b.setAttribute('aria-label', p.name);
    b.tabIndex = i === 0 ? 0 : -1;
    const name = document.createElement('span');
    name.className = 'place-name';
    name.textContent = p.name;
    const chips = document.createElement('span');
    chips.className = 'place-chips';
    chips.setAttribute('aria-hidden', 'true');
    chips.id = `place-chips-${p.id}`;
    b.setAttribute('aria-describedby', chips.id);
    b.append(name, chips);
    const discs = document.createElement('div');
    discs.className = 'disc-chips';
    discs.setAttribute('role', 'group');
    discs.setAttribute('aria-label', `Discs of ${p.name.split(',')[0]}`);
    discs.hidden = true;
    li.append(b, discs);
    ul.append(li);
    return { p, b, chips, discs };
  });
  const buttons = rows.map((r) => r.b);
  nav.append(ul);

  /** Redraw the status chips and the disc chips; never touches the place buttons. */
  function renderRows() {
    const loaded = store.getDisc(store.state.loadedDisc);
    for (const { p, b, chips, discs } of rows) {
      const recorded = store.discsOf(p.id).some((d) => store.state.collected.has(d.id));
      const onDeck = loaded?.place === p.id;
      b.classList.toggle('is-selected', store.state.selectedPlace === p.id);
      b.classList.toggle('is-deck', onDeck);
      chips.replaceChildren(
        ...[p.region, p.biome].filter(Boolean).map((t) => chip('', String(t).replaceAll('-', ' '))),
        chip(recorded ? 'chip-win' : '', recorded ? '● Recorded' : 'Not recorded'),
        ...(onDeck ? [chip('chip-on', '▶ On deck')] : []),
      );
      const show = chipDiscs(store, p.id);
      const focusedId = document.activeElement?.dataset?.disc;
      discs.replaceChildren(...show.map((d) => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'disc-chip px-notch';
        c.dataset.disc = d.id;
        c.dataset.side = d.side;
        const isRec = store.state.collected.has(d.id);
        const deck = store.state.loadedDisc === d.id;
        c.dataset.recorded = String(isRec);
        c.dataset.deck = String(deck);
        c.setAttribute('aria-label', discChipLabel(d, { recorded: isRec, onDeck: deck }));
        const g = document.createElement('span');
        g.setAttribute('aria-hidden', 'true');
        g.textContent = deck ? '▶' : isRec ? '●' : '○';
        c.append(g, document.createTextNode(discChipText(d)));
        return c;
      }));
      discs.hidden = show.length === 0;
      if (focusedId) discs.querySelector(`[data-disc="${focusedId}"]`)?.focus();
    }
  }
  for (const ev of ['place:select', 'disc:record', 'disc:load', 'flip', 'eject']) store.on(ev, renderRows);
  renderRows();

  function setCurrent(i) {
    buttons.forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; });
  }
  function activate(button) {
    const placeId = button.dataset.place;
    store.selectPlace(placeId);
    const disc = store.primaryDisc(placeId);
    if (!disc) return;
    activateDisc(store, disc.id, opts);
  }

  buttons.forEach((b, i) => {
    b.addEventListener('focus', () => { setCurrent(i); store.focusPlace(b.dataset.place); });
    // Mouse clicks only (detail > 0); keyboard Enter is handled below, Space belongs to play/pause.
    b.addEventListener('click', (e) => { if (e.detail > 0) activate(b); });
  });
  ul.addEventListener('click', (e) => {
    const c = e.target.closest?.('.disc-chip');
    if (c && e.detail > 0) activateDisc(store, c.dataset.disc, opts);
  });
  ul.addEventListener('keydown', (e) => {
    const chipEl = document.activeElement?.closest?.('.disc-chip');
    const i = chipEl ? rows.findIndex((r) => r.discs.contains(chipEl)) : buttons.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // From a chip, Up goes back to its place and Down to the next place.
      const next = chipEl && e.key === 'ArrowUp' ? i
        : Math.min(buttons.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
      buttons[next].focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (chipEl) activateDisc(store, chipEl.dataset.disc, opts);
      else activate(buttons[i]);
    }
  });
  return { buttons };
}
