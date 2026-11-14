// Written by Ky with help from Claude (SI). See AI_USE.md.
// The "Places" list: one real button per place, west to east, the main keyboard route.

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
  const buttons = places.map((p, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn place-btn';
    b.dataset.place = p.id;
    b.textContent = p.name;
    b.tabIndex = i === 0 ? 0 : -1;
    li.append(b);
    ul.append(li);
    return b;
  });
  nav.append(ul);

  function setCurrent(i) {
    buttons.forEach((b, j) => { b.tabIndex = j === i ? 0 : -1; });
  }
  function activate(button) {
    const placeId = button.dataset.place;
    store.selectPlace(placeId);
    const disc = store.primaryDisc(placeId);
    if (!disc) return;
    if (!store.state.collected.has(disc.id)) { store.record(disc.id); return; }
    if (opts.canPlay && !opts.canPlay()) { opts.onBlocked?.('Press the Start button first'); return; }
    if (store.load(disc.id).ok) store.play();
  }

  buttons.forEach((b, i) => {
    b.addEventListener('focus', () => { setCurrent(i); store.focusPlace(b.dataset.place); });
    // Mouse clicks only (detail > 0); keyboard Enter is handled below, Space belongs to play/pause.
    b.addEventListener('click', (e) => { if (e.detail > 0) activate(b); });
  });
  ul.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(buttons.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
      buttons[next].focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(buttons[i]);
    }
  });
  return { buttons };
}
