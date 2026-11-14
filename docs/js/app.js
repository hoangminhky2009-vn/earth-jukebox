// Written by Ky with help from Claude (SI). See AI_USE.md.
// Page wiring: loads data, creates the store, connects audio, the pixel scene, announcements and settings.

import { validate } from './validate.js';
import { createStore } from './store.js';
import { initA11y, announce } from './a11y.js';
import { initDialogs } from './ui-jukebox.js';
import { createScene } from './scene.js';
import * as foley from './foley.js';
import { initRoll } from './roll.js';

const DATA_URL = 'data/discs.sample.json'; // K5 switches this to data/discs.json

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
function firstGesture() {
  if (started) return;
  started = true;
  foley.unlock();
  kickAudio();
}
addEventListener('pointerdown', firstGesture, { capture: true, once: true });
addEventListener('keydown', firstGesture, { capture: true, once: true });

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
  store.on('play', () => audio.play());
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
  createScene(store, { datasets: data.datasets, announce });
  // After a disc lands on the deck, say so (a11y.js joins it to a "Recorded: ..." sentence spoken a moment before).
  store.on('disc:load', ({ disc }) => {
    const p = place(disc);
    announce(`On the deck: ${p.name.split(',')[0]}, ${disc.dataset === 'rain' ? 'rain' : 'greenness'} ${disc.year}, side ${disc.side}. Press Space to play.`);
  });

  initRoll(store, { container: document.getElementById('roll-box'), svgHost: document.getElementById('roll'), getSchedule: () => schedule });
  initDialogs(store, { datasets: data.datasets, announce });

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

  if (started) kickAudio(); // a gesture came in while the data was still loading
}

main();
