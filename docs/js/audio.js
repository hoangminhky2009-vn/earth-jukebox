// Written by Ky with help from Claude (SI). See AI_USE.md.
// Music engine: plays the note schedule from schedule.js with the Web Audio API (no library, every sound synthesized).
// Exports exactly the interface in notes/05_music.md, the same as audio-stub.js:
//   start, load, play, pause, stop, seek, setMode, duck, setVolume, onTick.
// One month = one bar = 2 s (120 BPM, 16 steps). A place changes only the instrument:
//   sea = plucked string (Karplus-Strong), south-asia = breathy flute, other = bright synth.
// Notes are scheduled about one bar ahead on the audio clock, so timing holds even when timers are throttled.
// Under the music runs a bed of real field recordings (CC0, see CREDITS.md) that follows the data month by month:
// rain discs blend wind → light rain → heavy rain with the level; greenness discs blend wind → birds with q;
// a missing month silences the bed (only crackle). Science mode has no bed.
// Claude cannot listen: levels are kept low and a compressor sits on the output.

import { schedule } from './schedule.js';
import { ambienceMix, LAYERS } from './ambience.js';

const BAR = 2;
const STEP = BAR / 16;
const AHEAD = BAR + 0.25;   // how far ahead of the audio clock notes are scheduled

let ac = null;
let master;    // volume
let duckGain;  // screen-reader ducking
let music;     // cut by a "skip" in a break month
let fxOut;     // skip warning sound (not cut by the skip itself)
let session;   // the current play-through; faded out and replaced on stop / pause / seek
let ambCut;    // field-recording bed (also cut by a skip)
const AMB_LEVEL = 0.55;
const AMB_TRIM = { wind: 1.3, 'rain-light': 1, 'rain-heavy': 0.7, birds: 0.9 };   // evens out the recordings
const ambBufs = {};
let ambLoading = null;
let amb = null;   // { layer: { src, g } } while playing

let disc = null;
let place = null;
let mode = 'music';
let notesByBar = Array.from({ length: 12 }, () => []);
let volume = 0.8;
let tickFn = () => {};

let playing = false;
let position = 0;    // bar to start from when play() is called
let nextBar = 0;
let nextTime = 0;
let pump = null;
const live = new Set();   // { src, t } scheduled sources of this session
const tickTimers = new Set();
const barStarts = [];     // [bar, time] of scheduled bars, newest last

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- setup ----------

function ensure() {
  if (ac) return ac;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  ac = new Ctx();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  master = gainNode(volume * 0.9);
  duckGain = gainNode(1);
  music = gainNode(1);
  fxOut = gainNode(1);
  const verb = ac.createConvolver();
  verb.buffer = impulse(1.8);
  const wet = gainNode(0.22);
  music.connect(duckGain);
  music.connect(verb); verb.connect(wet); wet.connect(duckGain);
  fxOut.connect(duckGain);
  ambCut = gainNode(AMB_LEVEL);
  ambCut.connect(duckGain);
  duckGain.connect(master); master.connect(comp); comp.connect(ac.destination);
  session = newSession();
  return ac;
}

function gainNode(v) { const g = ac.createGain(); g.gain.value = v; return g; }
function newSession() { const g = gainNode(1); g.connect(music); return g; }

/** Soft stereo room: decaying noise. */
function impulse(sec) {
  const n = Math.round(ac.sampleRate * sec);
  const b = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.35; d[i] = lp * (1 - i / n) ** 2.5; }
  }
  return b;
}

// ---------- instruments ----------

const ksCache = new Map();
/** Karplus-Strong plucked string, rendered once per pitch. */
function pluckBuffer(midi) {
  if (ksCache.has(midi)) return ksCache.get(midi);
  const sr = ac.sampleRate;
  const len = Math.round(sr * 1.4);
  const b = ac.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  const N = Math.max(2, Math.round(sr / midiHz(midi)));
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.5; d[i] = lp; }
  const decay = midi > 84 ? 0.990 : 0.996;
  for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1]);
  ksCache.set(midi, b);
  return b;
}

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const n = ac.sampleRate * 2;
  noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

let crackleBuf = null;
/** A whole bar of rough record crackle: faint hiss plus sparse pops (a missing month). */
function crackleBar() {
  if (crackleBuf) return crackleBuf;
  const n = Math.round(ac.sampleRate * BAR);
  crackleBuf = ac.createBuffer(1, n, ac.sampleRate);
  const d = crackleBuf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += ((Math.random() * 2 - 1) - lp) * 0.2;
    d[i] = lp * 0.25 + (Math.random() < 40 / ac.sampleRate ? (Math.random() * 2 - 1) * 0.9 : 0);
  }
  return crackleBuf;
}

function track(src, t) {
  const item = { src, t };
  live.add(item);
  src.onended = () => live.delete(item);
}

function env(g, t, peak, attack, end) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
}

function pluck(midi, t, vel, out) {
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(midi);
  const g = gainNode(0.3 * vel);
  g.gain.setValueAtTime(0.3 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  src.connect(g); g.connect(out);
  src.start(t); src.stop(t + 1.35);
  track(src, t);
}

function flute(midi, t, vel, out, dur = 0.3) {
  const f = midiHz(midi);
  const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = gainNode(0.18);
  const lfo = ac.createOscillator(); lfo.frequency.value = 5.5;
  const depth = gainNode(0);
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(f * 0.007, t + 0.18);
  lfo.connect(depth); depth.connect(o1.frequency);
  const g = ac.createGain();
  env(g, t, 0.14 * vel, 0.04, t + dur + 0.12);
  const breath = ac.createBufferSource(); breath.buffer = noise();
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * 2); bp.Q.value = 1.2;
  const gb = ac.createGain();
  env(gb, t, 0.03 * vel, 0.02, t + 0.12);
  o2.connect(g2); g2.connect(g); o1.connect(g); g.connect(out);
  breath.connect(bp); bp.connect(gb); gb.connect(out);
  const end = t + dur + 0.15;
  for (const s of [o1, o2, lfo]) { s.start(t); s.stop(end); }
  breath.start(t, Math.random()); breath.stop(t + 0.14);
  track(o1, t); track(o2, t); track(lfo, t); track(breath, t);
}

function synth(midi, t, vel, out, dur = 0.35) {
  const f = midiHz(midi);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(800, t + dur);
  const g = ac.createGain();
  env(g, t, 0.07 * vel, 0.006, t + dur + 0.05);
  const end = t + dur + 0.08;
  for (const det of [-7, 7]) {
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(end); track(o, t);
  }
  lp.connect(g); g.connect(out);
}

/** Sustained soft chord tone for the whole bar. Higher layers are a little brighter. */
function pad(midi, t, vel, out, layer = 0) {
  const f = midiHz(midi);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 500 * layer;
  const g = ac.createGain();
  const end = t + BAR - 0.02;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06 * vel * (midi < 48 ? 1.4 : 1), t + 0.35);
  g.gain.setValueAtTime(0.06 * vel * (midi < 48 ? 1.4 : 1), end - 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  const o1 = ac.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
  const g2 = gainNode(0.3);
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
  for (const o of [o1, o2]) { o.start(t); o.stop(end + 0.02); track(o, t); }
}

function beep(midi, t, vel, out) {
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = midiHz(midi);
  const g = ac.createGain();
  env(g, t, 0.16 * vel, 0.01, t + 0.4);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.42); track(o, t);
}

function pop(t, vel, out) {
  const src = ac.createBufferSource(); src.buffer = noise();
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
  const g = ac.createGain();
  env(g, t, 0.2 * vel, 0.001, t + 0.025);
  src.connect(hp); hp.connect(g); g.connect(out);
  src.start(t, Math.random()); src.stop(t + 0.03); track(src, t);
}

function crackle(t, out) {
  const src = ac.createBufferSource(); src.buffer = crackleBar();
  const g = gainNode(0.12);
  src.connect(g); g.connect(out); src.start(t); src.stop(t + BAR); track(src, t);
}

/** Record skip: the music drops out for the last quarter of the bar with a short rough scratch. */
function skip(t) {
  music.gain.setTargetAtTime(0, t, 0.008);
  ambCut.gain.setTargetAtTime(0, t, 0.008);
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.22);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.8;
  const n = ac.createBufferSource(); n.buffer = noise();
  const g = ac.createGain();
  env(g, t, 0.12, 0.004, t + 0.24);
  o.connect(bp); n.connect(bp); bp.connect(g); g.connect(fxOut);
  o.start(t); o.stop(t + 0.26); n.start(t, Math.random()); n.stop(t + 0.26);
  track(o, t); track(n, t);
}

const LEAD = { sea: pluck, 'south-asia': flute, other: synth };

function sound(n, t, out) {
  if (n.kind === 'crackle') { if (n.step === 0) crackle(t, out); pop(t, n.velocity, out); return; }
  if (n.kind === 'skip') { skip(t); return; }
  if (mode === 'science') { beep(n.pitch, t, n.velocity, out); return; }
  const lead = LEAD[place?.region] ?? synth;
  if (n.kind === 'data') { lead(n.pitch, t, n.velocity * 0.6, out); return; }   // kept under the field recordings
  // bed: sustained chord tones at step 0; the greenness pulse (voice 0, 4 a bar) in the place's instrument
  if (n.step === 0) pad(n.pitch, t, n.velocity, out, n.voice);
  if (disc?.dataset === 'ndvi' && n.voice === 0) lead(n.pitch + 24, t, n.velocity * 0.8, out);
}

// ---------- field-recording bed ----------

function loadAmbience() {
  if (ambLoading) return ambLoading;
  ambLoading = Promise.all(LAYERS.map(async (name) => {
    const res = await fetch(new URL(`../audio/ambience/${name}.mp3`, import.meta.url));
    if (!res.ok) throw new Error(`${name}.mp3: HTTP ${res.status}`);
    ambBufs[name] = await ac.decodeAudioData(await res.arrayBuffer());
  })).then(() => { if (playing && !amb) startAmbience(); })
    .catch((err) => console.warn('Field recordings could not be loaded; music only:', err));
  return ambLoading;
}

function startAmbience() {
  if (amb || !LAYERS.every((n) => ambBufs[n])) return;
  amb = {};
  const now = ac.currentTime;
  for (const name of LAYERS) {
    const src = ac.createBufferSource();
    src.buffer = ambBufs[name];
    src.loop = true;
    const g = gainNode(0);
    src.connect(g); g.connect(ambCut);
    src.start(now, Math.random() * ambBufs[name].duration);
    amb[name] = { src, g };
  }
  const cur = currentBar();
  setAmbience(cur ? cur[0] : nextBar, now);
}

function setAmbience(b, t) {
  if (!amb) return;
  const mix = ambienceMix(disc, b, mode);
  for (const name of LAYERS) amb[name].g.gain.setTargetAtTime(mix[name] * AMB_TRIM[name], Math.max(t, ac.currentTime), 0.4);
}

function stopAmbience() {
  if (!amb) return;
  const now = ac.currentTime;
  for (const { src, g } of Object.values(amb)) {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + 0.3);
    src.stop(now + 0.35);
  }
  amb = null;
}

// ---------- transport ----------

function scheduleBar(b, t0, from = -Infinity) {
  music.gain.setValueAtTime(1, Math.max(t0, ac.currentTime));
  ambCut.gain.setValueAtTime(AMB_LEVEL, Math.max(t0, ac.currentTime));
  if (from < 0) setAmbience(b, t0);
  const out = session;
  for (const n of notesByBar[b]) {
    const t = t0 + n.step * STEP;
    if (t < from) continue;
    sound(n, t, out);
  }
  if (from === -Infinity) {
    barStarts.push([b, t0]);
    if (barStarts.length > 4) barStarts.shift();
    const id = setTimeout(() => { tickTimers.delete(id); if (playing) tickFn(b); }, Math.max(0, (t0 - ac.currentTime) * 1000));
    tickTimers.add(id);
  }
}

function fill() {
  while (nextTime < ac.currentTime + AHEAD) {
    scheduleBar(nextBar, nextTime);
    nextBar = (nextBar + 1) % 12;   // loops like the stub
    nextTime += BAR;
  }
}

/** The bar sounding now (from the bars already scheduled). */
function currentBar() {
  const now = ac ? ac.currentTime : 0;
  let cur = null;
  for (const bs of barStarts) if (bs[1] <= now + 0.001) cur = bs;
  return cur;
}

function clearTimers() {
  clearInterval(pump); pump = null;
  for (const id of tickTimers) clearTimeout(id);
  tickTimers.clear();
}

/** Fade the current session out and start a fresh one (no clicks). */
function silence() {
  clearTimers();
  barStarts.length = 0;
  if (!ac) return;
  const now = ac.currentTime;
  const old = session;
  old.gain.cancelScheduledValues(now);
  old.gain.setValueAtTime(old.gain.value, now);
  old.gain.linearRampToValueAtTime(0, now + 0.04);
  for (const item of live) { try { item.src.stop(now + 0.05); } catch { /* already stopped */ } }
  live.clear();
  setTimeout(() => old.disconnect(), 200);
  music.gain.cancelScheduledValues(now);
  music.gain.setValueAtTime(1, now);
  ambCut.gain.cancelScheduledValues(now);
  ambCut.gain.setValueAtTime(AMB_LEVEL, now);
  stopAmbience();
  session = newSession();
}

function rebuild() {
  notesByBar = Array.from({ length: 12 }, () => []);
  if (!disc) return;
  for (const n of schedule(disc, place, mode)) notesByBar[n.bar].push(n);
  if (ac && mode === 'music' && place?.region === 'sea') {
    for (const bar of notesByBar) for (const n of bar) if (n.kind === 'data' || n.voice === 0) { pluckBuffer(n.pitch); pluckBuffer(n.pitch + 24); }
  }
}

function begin(fromBar) {
  ensure();
  playing = true;
  nextBar = fromBar;
  nextTime = ac.currentTime + 0.06;
  fill();
  pump = setInterval(fill, 100);
  loadAmbience();
  startAmbience();
}

// ---------- the contract ----------

export async function start() {
  ensure();
  if (ac.state !== 'running') await ac.resume();
  rebuild();
  loadAmbience();
}

export function load(d, p) {
  silence();
  playing = false;
  disc = d; place = p; position = 0;
  if (ac) rebuild(); else notesByBar = Array.from({ length: 12 }, () => []);
}

export function play() {
  if (!disc) return;
  ensure();
  if (ac.state !== 'running') ac.resume();
  if (notesByBar.every((b) => b.length === 0)) rebuild();
  silence();
  begin(position);
}

export function pause() {
  const cur = currentBar();
  if (cur) position = cur[0];
  playing = false;
  silence();
}

export function stop() {
  playing = false;
  position = 0;
  silence();
}

export function seek(m) {
  position = Math.min(11, Math.max(0, Math.round(Number(m) || 0)));
  if (playing) { silence(); begin(position); }
}

export function setMode(m) {
  if (m !== 'music' && m !== 'science') return;
  mode = m;
  rebuild();
  if (!playing || !ac) return;
  // Swap the sound from now on without losing the beat: drop notes not yet started, reschedule the rest of this bar.
  const now = ac.currentTime;
  for (const item of [...live]) if (item.t > now + 0.01) { try { item.src.stop(); } catch { /* not started */ } live.delete(item); }
  const cur = currentBar();
  if (cur) { scheduleBar(cur[0], cur[1], now + 0.02); setAmbience(cur[0], now); }
  for (const bs of barStarts) if (bs[1] > now + 0.001) scheduleBar(bs[0], bs[1], -1e9);
}

/** Lower the music by `db` for `ms` so a screen reader is heard, then come back. */
export function duck(db, ms) {
  if (!ac) return;
  const now = ac.currentTime;
  const g = duckGain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.setTargetAtTime(10 ** (db / 20), now, 0.05);
  g.setTargetAtTime(1, now + ms / 1000, 0.25);
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, Number(v) || 0));
  if (ac) master.gain.setTargetAtTime(volume * 0.9, ac.currentTime, 0.03);
}

export function onTick(fn) { tickFn = typeof fn === 'function' ? fn : () => {}; }
