// Written by Ky with help from Claude (SI). See AI_USE.md.
// The single source of truth for page state. Pure logic, no DOM. Only this module changes state;
// every action emits the event named in the design notes (place:focus, place:select, disc:record,
// disc:load, play, pause, stop, seek, flip, mode, settings, tick, eject).

const EVENTS = ['place:focus', 'place:select', 'disc:record', 'disc:load', 'play', 'pause', 'stop',
  'seek', 'flip', 'mode', 'settings', 'tick', 'eject'];

/** @param {{places:object[], discs:object[], datasets?:object}} data parsed discs.json */
export function createStore(data) {
  const reduced = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  const state = {
    discs: data.discs,
    places: data.places,
    selectedPlace: null,
    loadedDisc: null,
    side: 'A',
    mode: 'music',
    playing: false,
    position: 0,
    settings: { preview: true, highContrast: false, reducedMotion: reduced, volume: 0.8 },
    collected: new Set(),
  };
  const listeners = new Map(EVENTS.map((e) => [e, []]));

  function emit(event, payload) {
    for (const fn of [...listeners.get(event)]) fn(payload);
  }
  const getDisc = (id) => state.discs.find((d) => d.id === id) ?? null;
  const getPlace = (id) => state.places.find((p) => p.id === id) ?? null;
  /** Discs of a place in a stable order: rain before ndvi, then year, then side. */
  const discsOf = (placeId) => state.discs
    .filter((d) => d.place === placeId)
    .sort((a, b) => b.dataset.localeCompare(a.dataset) || a.year - b.year || a.side.localeCompare(b.side));
  /** The disc a place offers first (the one announced on focus, recorded by Enter). */
  const primaryDisc = (placeId) => discsOf(placeId)[0] ?? null;

  const fail = (error) => ({ ok: false, error });

  return {
    state, getDisc, getPlace, discsOf, primaryDisc,

    /** Subscribe: fn(payload). Returns an unsubscribe function. */
    on(event, fn) {
      if (!listeners.has(event)) throw new Error(`Unknown event "${event}"`);
      listeners.get(event).push(fn);
      return () => { const l = listeners.get(event); l.splice(l.indexOf(fn), 1); };
    },

    focusPlace(placeId) {
      if (!getPlace(placeId)) return fail(`No place "${placeId}"`);
      emit('place:focus', { placeId });
      return { ok: true };
    },
    selectPlace(placeId) {
      if (!getPlace(placeId)) return fail(`No place "${placeId}"`);
      state.selectedPlace = placeId;
      emit('place:select', { placeId });
      return { ok: true };
    },
    record(discId) {
      const disc = getDisc(discId);
      if (!disc) return fail(`No disc "${discId}"`);
      state.collected.add(discId);
      emit('disc:record', { discId, disc });
      return { ok: true, disc };
    },
    load(discId) {
      const disc = getDisc(discId);
      if (!disc) return fail(`No disc "${discId}"`);
      if (!state.collected.has(discId)) return fail('This disc has not been recorded yet');
      state.loadedDisc = discId;
      state.side = disc.side;
      state.position = 0;
      state.playing = false;
      emit('disc:load', { discId, disc, place: getPlace(disc.place) });
      return { ok: true, disc };
    },
    play() {
      if (!state.loadedDisc) return fail('No disc loaded');
      state.playing = true;
      emit('play', { position: state.position });
      return { ok: true };
    },
    pause() {
      if (!state.loadedDisc) return fail('No disc loaded');
      state.playing = false;
      emit('pause', { position: state.position });
      return { ok: true };
    },
    stop() {
      state.playing = false;
      state.position = 0;
      emit('stop', {});
      return { ok: true };
    },
    /** Jump to a month; clamped to 0–11. */
    seek(month) {
      if (!state.loadedDisc) return fail('No disc loaded');
      const m = Math.min(11, Math.max(0, Math.round(Number(month) || 0)));
      state.position = m;
      emit('seek', { month: m });
      return { ok: true, month: m };
    },
    /** Called by the audio engine once per bar (integer 0–11). */
    tick(position) {
      state.position = position;
      emit('tick', position);
    },
    /** Swap to the other side: the disc of the same place and dataset with the other side letter. */
    flip() {
      const cur = getDisc(state.loadedDisc);
      if (!cur) {
        emit('flip', { changed: false, side: state.side, message: 'No disc loaded' });
        return fail('No disc loaded');
      }
      const other = state.discs.find((d) => d.place === cur.place && d.dataset === cur.dataset && d.side !== cur.side);
      if (!other) {
        const message = 'This disc has only one side';
        emit('flip', { changed: false, side: state.side, disc: cur, message });
        return fail(message);
      }
      state.loadedDisc = other.id;
      state.side = other.side;
      emit('flip', { changed: true, side: other.side, disc: other, place: getPlace(other.place) });
      return { ok: true, disc: other };
    },
    /** Take the disc out of the jukebox. Stops playback first (emits stop), then eject. */
    eject() {
      const discId = state.loadedDisc;
      if (!discId) return fail('No disc loaded');
      state.loadedDisc = null;
      state.playing = false;
      state.position = 0;
      state.side = 'A';
      emit('stop', {});
      emit('eject', { discId, disc: getDisc(discId) });
      return { ok: true };
    },
    setMode(mode) {
      if (mode !== 'music' && mode !== 'science') return fail(`Unknown mode "${mode}"`);
      state.mode = mode;
      emit('mode', { mode });
      return { ok: true };
    },
    updateSettings(patch) {
      Object.assign(state.settings, patch);
      emit('settings', { ...state.settings });
      return { ok: true };
    },
  };
}
