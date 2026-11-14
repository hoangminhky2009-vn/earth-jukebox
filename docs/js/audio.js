// Written by Ky with help from Claude (SI). See AI_USE.md.
// Music engine: plays the note schedule from schedule.js with the Web Audio API (no library, every sound synthesized).
// Exports exactly the interface in notes/05_music.md, the same as audio-stub.js:
//   start, load, play, pause, stop, seek, setMode, duck, setVolume, onTick.
// One month = one bar = 2 s (120 BPM, 16 steps), played as lofi: a half-time beat (feels like 60 BPM), swing,
// electric-piano seventh chords, a soft bass, and the whole mix through a warm low-pass, light tape wobble and saturation.
// The beat and bass are accompaniment only (they carry no data and stop in missing months and science mode).
// A place changes only the lead instrument: sea = plucked string (Karplus-Strong), south-asia = breathy flute,
// other = electric piano.
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
const SWING = 0.55 * STEP;  // the off-beat sixteenths of the half-time feel land late
const swing = (step) => (step % 4 === 2 ? SWING : 0);

let ac = null;
let master;    // volume
let duckGain;  // screen-reader ducking
let music;     // cut by a "skip" in a break month
let fxOut;     // skip warning sound (not cut by the skip itself)
let leadSend;  // melody only: dark echo and a longer room
let vibrato;   // one shared 5.2 Hz LFO for the flute
let noteSend = 1;   // echo send of the note being played (lower in busy months)
let session;   // the current play-through; faded out and replaced on stop / pause / seek
let ambCut;    // field-recording bed (also cut by a skip)
const AMB_LEVEL = 0.22;   // field recordings sit well under the music
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
  ac = new Ctx({ latencyHint: 'playback' });   // bigger buffer: no dropouts on a busy laptop
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  master = gainNode(volume * 0.9);
  duckGain = gainNode(1);
  music = gainNode(1);
  fxOut = gainNode(1);
  const verb = ac.createConvolver();
  verb.buffer = impulse(1.8);
  const wet = gainNode(0.14);
  // lofi colour: warm low-pass -> slow tape wobble (modulated delay) -> soft saturation
  const warm = ac.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3200; warm.Q.value = 0.5;
  const wobble = ac.createDelay(0.05); wobble.delayTime.value = 0.012;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.55;
  const lfoDepth = gainNode(0.0016);
  lfo.connect(lfoDepth); lfoDepth.connect(wobble.delayTime); lfo.start();
  const sat = ac.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(1.1 * x) / Math.tanh(1.1); }
  sat.curve = curve;
  const pre = gainNode(0.7);   // headroom so the saturation only warms, never fuzzes
  music.connect(pre); pre.connect(warm); warm.connect(wobble); wobble.connect(sat); sat.connect(duckGain);
  music.connect(verb); verb.connect(wet); wet.connect(duckGain);
  // melody echo (3 steps, dark, fading) and a longer room, so single notes bloom instead of beeping
  leadSend = gainNode(1);
  const echo = ac.createDelay(1); echo.delayTime.value = 3 * STEP;
  const echoLP = ac.createBiquadFilter(); echoLP.type = 'lowpass'; echoLP.frequency.value = 1800;
  const fb = gainNode(0.2);
  const echoOut = gainNode(0.16);
  leadSend.connect(echo); echo.connect(echoLP); echoLP.connect(fb); fb.connect(echo);
  echoLP.connect(echoOut); echoOut.connect(music);
  const room = ac.createConvolver(); room.buffer = impulse(2.6);
  const roomOut = gainNode(0.2);
  vibrato = ac.createOscillator(); vibrato.frequency.value = 5.2; vibrato.start();
  leadSend.connect(room); room.connect(roomOut); roomOut.connect(duckGain);
  fxOut.connect(duckGain);
  ambCut = gainNode(AMB_LEVEL);
  const ambSoft = ac.createBiquadFilter(); ambSoft.type = 'lowpass'; ambSoft.frequency.value = 4500;
  ambCut.connect(ambSoft); ambSoft.connect(duckGain);
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
  const len = Math.round(sr * 2);
  const b = ac.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  // Fractional delay so the string is in tune: total loop delay = P + 0.5 (averaging filter) = one period.
  const P = sr / midiHz(midi) - 0.5;
  const N = Math.floor(P);
  const fr = P - N;
  let lp = 0;
  for (let i = 0; i < N + 2; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.22; d[i] = lp * 1.2; }   // dark, soft pluck (nylon)
  const decay = midi > 84 ? 0.994 : 0.997;
  for (let i = N + 2; i < len; i++) {
    const x0 = (1 - fr) * d[i - N] + fr * d[i - N - 1];
    const x1 = (1 - fr) * d[i - N - 1] + fr * d[i - N - 2];
    d[i] = decay * 0.5 * (x0 + x1);
  }
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

/** Small deterministic "random" in 0..1 per note, so a disc sounds the same every time it plays. */
function hash01(a, b, c) {
  const h = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Output stage for one melody note: slight stereo spread, plus a send to the melody echo and room. */
function leadOut(out, pan, send = noteSend) {
  const g = gainNode(1);
  const p = ac.createStereoPanner(); p.pan.value = pan;
  g.connect(p); p.connect(out);
  if (send > 0) { const s = gainNode(send); g.connect(s); s.connect(leadSend); }
  return g;
}

/** Nylon-string pluck (Karplus-Strong with a dark, soft excitation). */
function pluck(midi, t, vel, out, dur, pan = 0) {
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(midi);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.42 * vel, t);
  g.gain.setValueAtTime(0.42 * vel, t + Math.max(0.15, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.15, dur) + 0.9);
  src.connect(lp); lp.connect(g); g.connect(leadOut(out, pan));
  src.start(t); src.stop(t + Math.max(0.15, dur) + 0.95);
  track(src, t);
}

let fluteWave = null;
/** Bansuri-like flute: soft harmonics (not a bare sine), breath through the whole note, a small scoop into pitch,
 *  delayed vibrato, and notes that last until the next one (legato). */
function flute(midi, t, vel, out, dur, pan = 0) {
  if (!fluteWave) fluteWave = ac.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.32, 0.11, 0.05, 0.02]));
  const f = midiHz(midi);
  const len = Math.max(0.2, dur);
  const o = ac.createOscillator(); o.setPeriodicWave(fluteWave);
  o.frequency.setValueAtTime(f * 0.982, t);                        // scoop up ~30 cents, like a player
  o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  const depth = gainNode(0);
  depth.gain.setValueAtTime(0, t + 0.12);
  depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
  vibrato.connect(depth); depth.connect(o.frequency);
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = Math.min(6000, f * 3);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.13 * vel, t + 0.07);
  g.gain.setValueAtTime(0.13 * vel, t + len);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.22);
  const breath = ac.createBufferSource(); breath.buffer = noise();
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f * 1.5); bp.Q.value = 1.6;
  const gb = ac.createGain();
  gb.gain.setValueAtTime(0.0001, t);
  gb.gain.linearRampToValueAtTime(0.06 * vel, t + 0.03);           // breathy onset ("chiff")
  gb.gain.linearRampToValueAtTime(0.025 * vel, t + 0.12);          // then air under the tone
  gb.gain.setValueAtTime(0.025 * vel, t + len);
  gb.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.2);
  const outG = leadOut(out, pan);
  o.connect(tone); tone.connect(g); g.connect(outG);
  breath.connect(bp); bp.connect(gb); gb.connect(outG);
  const end = t + len + 0.25;
  o.start(t); o.stop(end);
  o.addEventListener('ended', () => depth.disconnect());   // free the shared LFO's fan-out
  breath.start(t, Math.random()); breath.stop(end);
  track(o, t); track(breath, t);
}

/** Electric piano (two-operator FM, Rhodes-like), mellow: low modulation, two carriers a few cents apart (chorus). */
function keys(midi, t, vel, out, dur = 1.6, pan = 0, send = 0) {
  const f = midiHz(midi);
  const mod = ac.createOscillator(); mod.type = 'sine'; mod.frequency.value = f;
  const idx = ac.createGain();
  idx.gain.setValueAtTime(f * 0.9 * vel, t);
  idx.gain.exponentialRampToValueAtTime(f * 0.05 + 1, t + 0.4);
  mod.connect(idx);
  const g = ac.createGain();
  env(g, t, 0.09 * vel, 0.006, t + dur);
  const outG = send > 0 ? leadOut(out, pan, send) : out;
  const oscs = [mod];
  for (const det of [-5, 5]) {
    const car = ac.createOscillator(); car.type = 'sine'; car.frequency.value = f; car.detune.value = det;
    idx.connect(car.frequency); car.connect(g); oscs.push(car);
  }
  g.connect(outG);
  for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); track(o, t); }
}

// ---------- half-time beat and bass (accompaniment, no data) ----------

function kick(t, vel, out) {
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
  const g = ac.createGain();
  env(g, t, 0.5 * vel, 0.004, t + 0.38);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4); track(o, t);
}

function snare(t, vel, out) {
  const n = ac.createBufferSource(); n.buffer = noise();
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.7;
  const g = ac.createGain();
  env(g, t, 0.16 * vel, 0.003, t + 0.2);
  n.connect(bp); bp.connect(g); g.connect(out);
  const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = 185;
  const go = ac.createGain();
  env(go, t, 0.07 * vel, 0.002, t + 0.09);
  o.connect(go); go.connect(out);
  n.start(t, Math.random()); n.stop(t + 0.22); o.start(t); o.stop(t + 0.1);
  track(n, t); track(o, t);
}

function hat(t, vel, out) {
  const n = ac.createBufferSource(); n.buffer = noise();
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const g = ac.createGain();
  env(g, t, 0.03 * vel, 0.002, t + 0.05);
  n.connect(hp); hp.connect(g); g.connect(out);
  n.start(t, Math.random()); n.stop(t + 0.05); track(n, t);
}

function bass(midi, t, vel, out, dur) {
  const f = midiHz(midi);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2 * vel, t + 0.015);
  g.gain.setValueAtTime(0.2 * vel, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
  const g2 = gainNode(0.35);
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
  for (const o of [o1, o2]) { o.start(t); o.stop(t + dur + 0.02); track(o, t); }
}

/** Beat, bass and a light chord re-strike for one bar; silent in missing months and science mode. */
function groove(b, t0, from, out) {
  const notes = notesByBar[b];
  if (mode !== 'music' || !notes.some((n) => n.kind === 'data' || n.kind === 'bed')) return;
  const at = (step) => t0 + step * STEP + swing(step);
  const hit = (step, fn) => { const t = at(step); if (t >= from) fn(t); };
  hit(0, (t) => kick(t, 1, out));
  hit(10, (t) => kick(t, 0.75, out));
  hit(8, (t) => snare(t, 1, out));
  for (const s of [2, 6, 10, 14]) hit(s, (t) => hat(t, 1, out));
  const chord = notes.filter((n) => n.kind === 'bed' && n.step === 0);
  if (!chord.length) return;
  const root = Math.min(...chord.map((n) => n.pitch));
  const low = 36 + ((((root - 36) % 12) + 12) % 12);   // bass in the octave above C2
  hit(0, (t) => bass(low, t, 1, out, 1.1));
  hit(10, (t) => bass(low, t, 0.7, out, 0.5));
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

const LEAD = {
  sea: pluck,
  'south-asia': flute,
  other: (m, t, v, out, dur, pan) => keys(m, t, v * 1.3, out, dur + 0.6, pan, noteSend),
};

function sound(n, t, out) {
  if (n.kind === 'crackle') { if (n.step === 0) crackle(t, out); pop(t, n.velocity, out); return; }
  if (n.kind === 'skip') { skip(t); return; }
  if (mode === 'science') { beep(n.pitch, t, n.velocity, out); return; }
  const lead = LEAD[place?.region] ?? LEAD.other;
  if (n.kind === 'data') {
    // played like a person: a few ms early or late, a little louder or softer, notes held until the next one
    const r = hash01(n.bar, n.step, n.voice);
    const tt = Math.max(ac.currentTime, t + (r - 0.5) * 0.024);
    const v = n.velocity * (n.voice ? 0.5 : 0.75) * (0.85 + 0.3 * hash01(n.step, n.bar, 7));
    noteSend = n.busy ? 0.3 : 1;
    lead(n.pitch, tt, v, out, n.len ?? 0.3, (r - 0.5) * 0.5);
    noteSend = 1;
    return;
  }
  // bed: electric-piano chord at step 0; the greenness pulse (voice 0, 4 a bar) in the place's instrument
  if (n.step === 0) keys(n.pitch, t, n.velocity * (n.pitch < 48 ? 1.3 : 1), out, 1.8);
  if (disc?.dataset === 'ndvi' && n.voice === 0) lead(n.pitch + 24, t, n.velocity * 0.8, out, 4 * STEP, 0);
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
    const t = t0 + n.step * STEP + (n.kind === 'skip' ? 0 : swing(n.step));
    if (t < from) continue;
    sound(n, t, out);
  }
  groove(b, t0, from, out);
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
  // legato: each drop lasts until the next drop of the bar (the last one until the bar ends), at most 0.9 s
  for (const bar of notesByBar) {
    const drops = bar.filter((n) => n.kind === 'data' && n.voice === 0).sort((a, b) => a.step - b.step);
    drops.forEach((n, i) => { n.len = Math.min(0.9, ((drops[i + 1]?.step ?? 16) - n.step) * STEP); n.busy = drops.length >= 7; });
    for (const n of bar) if (n.kind === 'data' && n.voice !== 0) { n.len = drops.find((d) => d.step === n.step)?.len ?? 0.3; n.busy = true; }
  }
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
