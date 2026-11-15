// Written by Ky with help from Claude (SI). See AI_USE.md.
// Page wiring: loads data, creates the store, connects audio, the pixel scene, announcements and settings.

import { validate } from './validate.js';
import { createStore } from './store.js';
import { initA11y, announce } from './a11y.js';
import { initDialogs } from './ui-jukebox.js';
import { initCoach } from './coach.js';
import { createScene } from './scene.js';
import * as foley from './foley.js';
import { initRoll } from './roll.js';

// Real NASA-derived discs; add ?sample to the address to load the hand-made sample (it has a desert and a snow place).
const DATA_URL = new URLSearchParams(location.search).has('sample') ? 'data/discs.sample.json' : 'data/discs.json';

function showError(text) {
  const el = document.getElementById('load-error');
  el.textContent = text;
  el.hidden = false;
}

/** Real engine if audio.js loads; otherwise the silent stub, with the real error printed. */
async function loadAudio() {
  try {
    return await import('./audio.js');
  } catch (err) {
    console.warn('audio.js could not be loaded, using audio-stub.js instead:', err);
    return import('./audio-stub.js');
  }
}

/** Sabik's schedule.js if it exists; otherwise the stand-in notes in roll.fixture.js. */
async function loadSchedule() {
  try {
    return (await import('./schedule.js')).schedule;
  } catch (err) {
    console.warn('schedule.js could not be loaded, using roll.fixture.js instead:', err);
    return (await import('./roll.fixture.js')).schedule;
  }
}

function loadSetting(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; }
  catch { return fallback; }
}
function saveSetting(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage blocked: ignore */ }
}

// Browsers only allow audio after a user gesture: the first click or key press starts everything (no "Press to start" button).
let started = false;
let audioEngine = null;
let volumeNow = 0.8;
function kickAudio() {
  if (!audioEngine) return;
  audioEngine.start().then(() => audioEngine.setVolume(volumeNow)).catch((err) => { console.error(err); announce('Sound could not start'); });
}
// Phones (iOS Safari above all) only let sound start from the end of a touch (touchend or click), not from pointerdown,
// and only inside the gesture itself. So every touch, click or key press tries again until the audio really runs.
const audioRunning = () => foley.sharedContext()?.state === 'running';
const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'];
function onGesture() {
  started = true;
  if (!audioRunning()) { foley.unlock(); kickAudio(); }
  if (audioRunning()) for (const g of GESTURES) removeEventListener(g, onGesture, true);
}
for (const g of GESTURES) addEventListener(g, onGesture, true);

async function main() {
  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    showError(`Could not load ${DATA_URL}: ${err.message}`);
    return;
  }
  const problems = validate(data);
  if (problems.length) {
    showError(`${DATA_URL} is not valid: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (and ${problems.length - 5} more)` : ''}`);
    return;
  }

  const audio = await loadAudio();
  audioEngine = audio;
  const schedule = await loadSchedule();
  const store = createStore(data);

  // Store events drive the audio engine (audio gets the full objects, never ids).
  const place = (disc) => store.getPlace(disc.place);
  store.on('disc:load', ({ disc }) => audio.load(disc, place(disc)));
  // Music starts when the needle touches the record (scene → onNeedleDown), not when Play is pressed:
  // the arm swings in first (~0.7 s), then the platter spins and the sound begins.
  // Resume inside the gesture that pressed Play (the music itself starts a moment later, when the needle lands).
  store.on('play', () => { if (!audioRunning()) audio.start().catch(() => {}); });
  store.on('pause', () => audio.pause());
  store.on('stop', () => audio.stop());
  store.on('seek', ({ month }) => audio.seek(month));
  store.on('flip', (p) => {
    if (!p.changed) return;
    audio.load(p.disc, p.place);
    if (store.state.playing) audio.play();
  });
  store.on('mode', ({ mode }) => audio.setMode(mode));
  store.on('settings', (s) => audio.setVolume(s.volume));
  audio.onTick((bar) => store.tick(bar));
  // End of the year: the music stops, the needle lifts, then the disc goes back on the shelf (the tray returns).
  audio.onEnd?.(() => {
    const d = store.state.loadedDisc;
    store.stop();
    announce('End of the year. The disc goes back on the shelf.');
    setTimeout(() => { if (store.state.loadedDisc === d && !store.state.playing) store.eject(); }, 1200);
  });

  // 1-second preview: only when nothing is loaded, so it never clobbers the user's disc.
  let previewTimer = null;
  const preview = {
    canStart: () => started && !store.state.loadedDisc,
    start(p) {
      const disc = store.primaryDisc(p.id);
      if (!disc) return;
      audio.load(disc, p);
      audio.play();
      previewTimer = setTimeout(() => audio.stop(), 9000);
    },
    stop() { clearTimeout(previewTimer); audio.stop(); },
  };

  initA11y(store, { datasets: data.datasets, duck: audio.duck, isStarted: () => started, preview });
  const scene = createScene(store, { datasets: data.datasets, announce, onNeedleDown: () => { if (store.state.playing) audio.play(); } });
  // After a disc lands on the deck, say so (a11y.js joins it to a "Recorded: ..." sentence spoken a moment before).
  store.on('disc:load', ({ disc }) => {
    const p = place(disc);
    announce(`On the deck: ${p.name.split(',')[0]}, ${{ rain: 'rain', snow: 'snow cover' }[disc.dataset] ?? 'greenness'} ${disc.year}, side ${disc.side}. Press Space to play.`);
  });

  initRoll(store, { container: document.getElementById('roll-box'), svgHost: document.getElementById('roll'), getSchedule: () => schedule });
  initDialogs(store, { datasets: data.datasets, announce });

  // How to use: a guided tour with a spotlight (button, H key, and once on the first visit)
  const coach = initCoach(store, { boxOf: scene.boxOf, announce, reducedMotion: () => Boolean(store.state.settings.reducedMotion) });
  document.getElementById('help-btn').addEventListener('click', () => coach.start());
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'h' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t?.tagName) || t?.isContentEditable || document.querySelector('dialog[open]')) return;
    e.preventDefault(); coach.start();
  });
  // "Hear a sample year": one press puts a striking disc on the deck and plays it (Hue's 2025 rain: the autumn floods)
  document.getElementById('sample-btn').addEventListener('click', () => {
    coach.stop();
    const id = store.getDisc('hue-rain-2025') ? 'hue-rain-2025' : store.state.discs[0]?.id;
    if (!id) return;
    if (!store.state.collected.has(id)) store.record(id);
    if (store.state.loadedDisc !== id) { store.selectPlace(store.getDisc(id).place); store.load(id); }
    store.seek(0);
    const r = store.play(); if (!r.ok) announce(r.error);
  });
  if (coach.firstVisit()) setTimeout(() => coach.start(), 900);

  // Settings toggles (persisted per browser).
  function bindToggle(inputId, key, fallback, apply) {
    const input = document.getElementById(inputId);
    const set = (on) => { input.checked = on; apply(on); };
    set(loadSetting(key, fallback));
    input.addEventListener('change', () => {
      set(input.checked);
      saveSetting(key, input.checked);
      announce(`${input.parentElement.textContent.trim()} ${input.checked ? 'on' : 'off'}`);
    });
  }
  bindToggle('opt-contrast', 'opt-contrast', store.state.settings.highContrast, (on) => {
    document.documentElement.classList.toggle('high-contrast', on);
    store.updateSettings({ highContrast: on });
  });
  bindToggle('opt-motion', 'opt-motion', store.state.settings.reducedMotion, (on) => {
    document.documentElement.classList.toggle('reduce-motion', on);
    store.updateSettings({ reducedMotion: on });
  });
  bindToggle('opt-preview', 'opt-preview', true, (on) => store.updateSettings({ preview: on }));

  const volume = document.getElementById('opt-volume');
  volume.value = store.state.settings.volume;
  volume.addEventListener('input', () => store.updateSettings({ volume: Number(volume.value) }));
  volumeNow = store.state.settings.volume;
  foley.setVolume(volumeNow);
  store.on('settings', (st) => { volumeNow = st.volume; });

  if (started && !audioRunning()) kickAudio(); // a gesture came in while the data was still loading
}

main();
