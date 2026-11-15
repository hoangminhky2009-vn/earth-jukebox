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

import { schedule, styleOf } from './schedule.js';
import { ambienceMix, LAYERS, BIRD_FILES, birdsFile } from './ambience.js';
import { sharedContext } from './foley.js';

const BAR = 2;
const STEP = BAR / 16;
const AHEAD = BAR + 0.25;   // how far ahead of the audio clock notes are scheduled
// How late the off-beat sixteenths of the half-time feel land, per style (lofi swings, the frame drum is straight).
const SWING_BY = { other: 0.55, sea: 0.3, 'south-asia': 0.4, desert: 0, snow: 0.2 };
let curStyle = 'other';
const swing = (step) => (step % 4 === 2 ? (SWING_BY[curStyle] ?? 0.55) * STEP : 0);
// Each region in its own key (semitones from C) with its own groove; the data rules do not change.
const TRANSPOSE = { other: 0, sea: 2, 'south-asia': -2, desert: 4, snow: 5 };

let ac = null;
let master;    // volume
let duckGain;  // screen-reader ducking
let music;     // cut by a "skip" in a break month
let fxOut;     // skip warning sound (not cut by the skip itself)
let leadSend;  // melody only: a send to the reverb
let vibrato;   // one shared 5.2 Hz LFO for the flute
let warm;      // master low-pass of the music (darker for rain discs)
let ambSoft;   // low-pass of the field recordings (deeper rain for rain discs)
let noteSend = 1;   // echo send of the note being played (lower in busy months)
let session;   // the current play-through; faded out and replaced on stop / pause / seek
let ambCut;    // field-recording bed (also cut by a skip)
const AMB_LEVEL = 0.3;    // field recordings sit well under the music
const AMB_TRIM = { wind: 1.3, 'rain-light': 1, 'rain-heavy': 0.7, birds: 0.9, 'snow-wind': 1.4, 'snow-howl': 0.6 };   // evens out the recordings
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
  ac = sharedContext() ?? new Ctx({ latencyHint: 'playback' });   // one context for the whole page, 'playback' buffer
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
  master = gainNode(volume * 1.2);
  duckGain = gainNode(1);
  music = gainNode(1);
  fxOut = gainNode(1);
  const verb = ac.createConvolver();
  verb.buffer = impulse(1.3);
  const wet = gainNode(0.14);
  // lofi colour: warm low-pass -> slow tape wobble (modulated delay)
  warm = ac.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3200; warm.Q.value = 0.5;
  const wobble = ac.createDelay(0.05); wobble.delayTime.value = 0.012;
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.55;
  const lfoDepth = gainNode(0);   // tape wobble off: it bent the dry sound but not its reverb, so the two beat (up to 19 cents apart)
  lfo.connect(lfoDepth); lfoDepth.connect(wobble.delayTime); lfo.start();
  const pre = gainNode(0.75);   // headroom
  music.connect(pre); pre.connect(warm); warm.connect(wobble); wobble.connect(duckGain);   // no waveshaper: it aliased into fizz
  music.connect(verb); verb.connect(wet); wet.connect(duckGain);
  // melody room only: the echo is gone (with dense months it stacked into a wash)
  leadSend = gainNode(1);
  const roomSend = gainNode(0.6);   // the melody's share of the one reverb (was 1.2: too washy)
  vibrato = ac.createOscillator(); vibrato.frequency.value = 5.2; vibrato.start();
  leadSend.connect(roomSend); roomSend.connect(verb);
  fxOut.connect(duckGain);
  ambCut = gainNode(AMB_LEVEL);
  ambSoft = ac.createBiquadFilter(); ambSoft.type = 'lowpass'; ambSoft.frequency.value = 4500;
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
  const tail = Math.min(1.2, 0.3 + dur * 1.2);   // short notes (busy months) ring briefly, long ones ring out
  g.gain.setValueAtTime(0.42 * vel, t + Math.max(0.15, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.15, dur) + tail);
  src.connect(lp); lp.connect(g); g.connect(leadOut(out, pan));
  src.start(t); src.stop(t + Math.max(0.15, dur) + tail + 0.05);
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
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.45);
  const breath = ac.createBufferSource(); breath.buffer = noise();
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f * 1.5); bp.Q.value = 1.6;
  const gb = ac.createGain();
  gb.gain.setValueAtTime(0.0001, t);
  gb.gain.linearRampToValueAtTime(0.06 * vel, t + 0.03);           // breathy onset ("chiff")
  gb.gain.linearRampToValueAtTime(0.025 * vel, t + 0.12);          // then air under the tone
  gb.gain.setValueAtTime(0.025 * vel, t + len);
  gb.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.35);
  const outG = leadOut(out, pan);
  o.connect(tone); tone.connect(g); g.connect(outG);
  breath.connect(bp); bp.connect(gb); gb.connect(outG);
  const end = t + len + 0.5;
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
  for (const det of [-1.5, 1.5]) {   // was +-5 cents: audible beating
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
  // legato: a soft attack, held for the whole length, a short release that overlaps the next bass note (no gap)
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.2 * vel, t + 0.03);
  g.gain.setValueAtTime(0.2 * vel, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
  const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
  const g2 = gainNode(0.35);
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
  for (const o of [o1, o2]) { o.start(t); o.stop(t + dur + 0.1); track(o, t); }
}

let neyWave = null;
/** Ney (end-blown reed flute of the desert regions): mostly air, a soft dark tone, a slide up into each note
 *  and a slow, wide vibrato that grows as the note is held. */
function ney(midi, t, vel, out, dur, pan = 0) {
  if (!neyWave) neyWave = ac.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.22, 0.07, 0.02]));
  const f = midiHz(midi);
  const len = Math.max(0.22, dur);
  const o = ac.createOscillator(); o.setPeriodicWave(neyWave);
  o.frequency.setValueAtTime(f * 0.944, t);                        // a semitone below, sliding up like a player's lip
  o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  const depth = gainNode(0);
  depth.gain.setValueAtTime(0, t + 0.15);
  depth.gain.linearRampToValueAtTime(f * 0.011, t + Math.max(0.3, len));
  vibrato.connect(depth); depth.connect(o.frequency);
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = Math.min(4000, f * 2.2);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.1);
  g.gain.setValueAtTime(0.11 * vel, t + len);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.35);
  const air = ac.createBufferSource(); air.buffer = noise();
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f * 1.3); bp.Q.value = 0.9;
  const ga = ac.createGain();
  ga.gain.setValueAtTime(0.0001, t);
  ga.gain.linearRampToValueAtTime(0.07 * vel, t + 0.05);            // the breath is a big part of the ney's sound
  ga.gain.linearRampToValueAtTime(0.04 * vel, t + 0.2);
  ga.gain.setValueAtTime(0.04 * vel, t + len);
  ga.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.3);
  const outG = leadOut(out, pan);
  o.connect(tone); tone.connect(g); g.connect(outG);
  air.connect(bp); bp.connect(ga); ga.connect(outG);
  const end = t + len + 0.4;
  o.start(t); o.stop(end); o.addEventListener('ended', () => depth.disconnect());
  air.start(t, Math.random()); air.stop(end);
  track(o, t); track(air, t);
}

/** Oud-like pluck (desert): darker string with a body resonance and a small pitch slide into the note. */
function oud(midi, t, vel, out, dur, pan = 0) {
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(midi);
  src.playbackRate.setValueAtTime(1.025, t);
  src.playbackRate.exponentialRampToValueAtTime(1, t + 0.05);
  const body = ac.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 1500; body.Q.value = 1.4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.48 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.2, dur) + 0.8);
  src.connect(body); body.connect(g); g.connect(leadOut(out, pan));
  src.start(t); src.stop(t + Math.max(0.2, dur) + 0.85);
  track(src, t);
}

/** Bell / celesta (snow): FM with an inharmonic ratio, bright strike that rings long and cold. */
function bell(midi, t, vel, out, dur, pan = 0) {
  const f = midiHz(midi);
  const mod = ac.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 3.5;
  const idx = ac.createGain();
  idx.gain.setValueAtTime(f * 1.6 * vel, t);
  idx.gain.exponentialRampToValueAtTime(f * 0.05 + 1, t + 0.7);
  const car = ac.createOscillator(); car.type = 'sine'; car.frequency.value = f;
  mod.connect(idx); idx.connect(car.frequency);
  const g = ac.createGain();
  const end = t + Math.max(0.6, dur) + 1.6;
  env(g, t, 0.1 * vel, 0.003, end);
  car.connect(g); g.connect(leadOut(out, pan));
  for (const o of [mod, car]) { o.start(t); o.stop(end + 0.05); track(o, t); }
}

/** Low frame-drum stroke (desert "doum"). */
function doum(t, vel, out) {
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(58, t + 0.12);
  const g = ac.createGain();
  env(g, t, 0.42 * vel, 0.004, t + 0.42);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45); track(o, t);
}

/** Rim stroke (desert "tek"): a short bright knock. */
function tek(t, vel, out) {
  const n = ac.createBufferSource(); n.buffer = noise();
  const hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2800; hp.Q.value = 2;
  const g = ac.createGain();
  env(g, t, 0.1 * vel, 0.001, t + 0.06);
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 1150;
  const go = ac.createGain();
  env(go, t, 0.04 * vel, 0.001, t + 0.04);
  n.connect(hp); hp.connect(g); g.connect(out); o.connect(go); go.connect(out);
  n.start(t, Math.random()); n.stop(t + 0.07); o.start(t); o.stop(t + 0.05);
  track(n, t); track(o, t);
}

/** Hand drum (Southeast Asia groove): a short pitched thump with a little slap. */
function tom(t, vel, out, hz) {
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(hz * 1.3, t);
  o.frequency.exponentialRampToValueAtTime(hz, t + 0.06);
  const g = ac.createGain();
  env(g, t, 0.28 * vel, 0.003, t + 0.28);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3); track(o, t);
}

/** Shaker: soft band of noise. */
function shaker(t, vel, out) {
  const n = ac.createBufferSource(); n.buffer = noise();
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6000; bp.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.03 * vel, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  n.connect(bp); bp.connect(g); g.connect(out);
  n.start(t, Math.random()); n.stop(t + 0.09); track(n, t);
}

/** Low hand drum with the upward pitch bend of a pressed drum head (South Asia groove, tabla-like). */
function bayan(t, vel, out) {
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(112, t + 0.18);
  const g = ac.createGain();
  env(g, t, 0.36 * vel, 0.004, t + 0.5);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.52); track(o, t);
}

/** Ringing tuned stroke on the small drum, pitched to the tonic. */
function tin(t, vel, out, hz) {
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
  const o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 2.76;   // inharmonic overtone of a drum head
  const g = ac.createGain();
  env(g, t, 0.09 * vel, 0.002, t + 0.22);
  const g2 = gainNode(0.25);
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
  for (const x of [o, o2]) { x.start(t); x.stop(t + 0.24); track(x, t); }
}

/** Drone on the tonic and fifth for one bar, overlapping the next (tanpura-like). */
/** Drone (pedal point, tanpura-like): ONE continuous tone on the tonic for the whole play-through (it used to be
 *  restarted every month, which pulsed every 2 s like a loop). It only goes quiet in months with no music. */
let droneG = null;
function startDrone(out, tonic) {
  droneG = gainNode(0);
  for (const [m, det, lvl] of [[tonic, 0, 0.022], [tonic + 12, 0, 0.014]]) {   // tonic only: every South Asia chord contains it
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(m); o.detune.value = det;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.7;
    const g = gainNode(lvl);
    o.connect(lp); lp.connect(g); g.connect(droneG);
    o.start(); track(o, ac.currentTime);
  }
  droneG.connect(out);
}
function setDrone(on, t) {
  if (droneG) droneG.gain.setTargetAtTime(on ? 1 : 0, Math.max(t, ac.currentTime), 0.35);
}

/** Beat, bass (and in South Asia a drone) for one bar; a groove per region; silent in missing months and science mode. */
function groove(b, t0, from, out) {
  const notes = notesByBar[b];
  if (mode !== 'music' || !notes.some((n) => n.kind === 'data' || n.kind === 'bed')) return;
  const at = (step) => t0 + step * STEP + swing(step);
  const hit = (step, fn) => { const t = at(step); if (t >= from) fn(t); };
  const region = styleOf(place);
  const tonic = 48 + TRANSPOSE[region];
  if (region === 'sea') {
    // light hand percussion: one soft kick, three tuned hand-drum strokes, a shaker on the eighths
    // V8: half the strokes - one kick, two hand drums, shaker on the off-beats only
    hit(0, (t) => kick(t, 0.6, out));
    hit(10, (t) => tom(t, 1, out, 165));
    if (b % 4 === 3) hit(14, (t) => tom(t, 0.5, out, 147));
    for (const s of [2, 6, 10, 14]) hit(s, (t) => shaker(t, 0.7, out));
  } else if (region === 'south-asia') {
    // tabla-like cycle over a drone on the tonic and fifth
    // V8: half the strokes - low drum on 1 and the and-of-3, one ringing stroke on 3
    hit(0, (t) => bayan(t, 1, out));
    hit(10, (t) => bayan(t, 0.7, out));
    const tinHz = midiHz(tonic + 24);
    hit(8, (t) => tin(t, 1, out, tinHz));
    if (b % 4 === 3) hit(14, (t) => tin(t, 0.4, out, tinHz));
  } else if (region === 'desert') {
    // frame-drum cycle (maqsum-like): doum on 1 and 3, tek strokes between, a roll before the loop turns
    // V8: doum on 1 and 3, one tek between, a short roll only before the loop turns
    for (const s of [0, 8]) hit(s, (t) => doum(t, s === 0 ? 1 : 0.8, out));
    hit(6, (t) => tek(t, 0.9, out));
    if (b % 4 === 3) for (const s of [14, 15]) hit(s, (t) => tek(t, 0.4, out));
  } else if (region === 'snow') {
    // almost nothing: a soft heartbeat every other month, so the bells ring in open space
    if (b % 2 === 0) hit(0, (t) => kick(t, 0.3, out));
  } else {
    // lofi kit
    hit(0, (t) => kick(t, 1, out));
    hit(10, (t) => kick(t, 0.75, out));
    hit(8, (t) => snare(t, 1, out));
    if (b % 4 === 3) hit(14, (t) => snare(t, 0.3, out));   // small fill before the loop turns
    for (const s of [2, 10]) hit(s, (t) => hat(t, 1, out));   // V8: two hats instead of four
  }
  // Bass line (one connected line, as in any harmony textbook): the chord root held for three beats, then the
  // chord's fifth as a passing note that leads into next month's root; one long note when the chord does not change.
  const rootOf = (bb) => {
    const r = notesByBar[bb]?.find((n) => n.kind === 'bed' && n.step === 0 && n.voice === 0);
    return r ? 36 + ((((r.pitch - 36) % 12) + 12) % 12) : null;   // in the octave above C2
  };
  const low = rootOf(b);
  if (low === null) return;
  const next = rootOf((b + 1) % 12);
  const vel = region === 'south-asia' || region === 'snow' ? 0.6 : 0.9;
  if (next === null || next === low) {
    hit(0, (t) => bass(low, t, vel, out, BAR - 0.02));
  } else {
    const fifth = low + 7 > 47 ? low - 5 : low + 7;
    hit(0, (t) => bass(low, t, vel, out, 12 * STEP));
    hit(12, (t) => bass(fifth, t0 + 12 * STEP, vel * 0.8, out, 4 * STEP - 0.02));
  }
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

/** Harmonium-like reed pad (South Asia): two detuned pulse-ish waves, bellows swell, held for the bar. */
function harmonium(midi, t, vel, out) {
  const f = midiHz(midi);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.6;
  const g = ac.createGain();
  const end = t + BAR - 0.05;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.03 * vel, t + 0.18);
  g.gain.linearRampToValueAtTime(0.024 * vel, t + 1.0);
  g.gain.linearRampToValueAtTime(0.0001, end + 0.25);
  for (const [type, det] of [['square', -2], ['sawtooth', 2]]) {   // was +-6 cents: rough beating on the upper harmonics
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(end + 0.3); track(o, t);
  }
  lp.connect(g); g.connect(out);
}

/** Airy pad (snow): slow swell of sine and soft triangle, long release into the next month. */
function air(midi, t, vel, out) {
  const f = midiHz(midi);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.04 * vel, t + 0.8);
  g.gain.linearRampToValueAtTime(0.0001, t + BAR + 0.8);
  const o1 = ac.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; o2.detune.value = 5;
  const g2 = gainNode(0.25);
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
  for (const o of [o1, o2]) { o.start(t); o.stop(t + BAR + 0.85); track(o, t); }
}

/** How each style plays its chord (the bed notes at step 0): stab, harp arpeggio, reed pad, oud strum, or air. */
function playBed(n, t, out) {
  const v = n.velocity * (n.pitch < 48 ? 1.3 : 1);
  if (curStyle === 'sea') {
    // harp-like: the chord broken upwards across the first half of the bar
    // in the chord's own low register (43-54), softer: it no longer sits on top of the plucked melody
    pluck(n.pitch, t + n.voice * 3 * STEP + swing(n.voice * 3), v * 0.45, out, 0.6, (n.voice - 1.5) * 0.2);
  } else if (curStyle === 'south-asia') {
    harmonium(n.pitch, t, v, out);
  } else if (curStyle === 'desert') {
    // no sustained chord: root and fifth strummed on the oud, again on beat 3
    if (n.voice === 0 || n.voice === 2) {
      for (const s of [0, 8]) oud(n.pitch + 12, t + s * STEP + n.voice * 0.012, v * (s ? 0.35 : 0.5), out, 0.3, n.voice ? 0.2 : -0.2);
    }
  } else if (curStyle === 'snow') {
    air(n.pitch + 12, t, v, out);
  } else {
    keys(n.pitch, t, v, out, 1.8);
  }
}

/** Raindrop: a short unpitched tick (filtered noise), so the extra wet-month notes never clash with the tune. */
function droplet(midi, t, vel, out, pan = 0) {
  const n = ac.createBufferSource(); n.buffer = noise();
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200 + 400 * Math.random(); bp.Q.value = 3;
  const g = ac.createGain();
  env(g, t, 0.09 * vel, 0.001, t + 0.07);
  const p = ac.createStereoPanner(); p.pan.value = pan;
  n.connect(bp); bp.connect(g); g.connect(p); p.connect(out);
  n.start(t, Math.random()); n.stop(t + 0.08); track(n, t);
}

const LEAD = {
  sea: pluck,
  'south-asia': flute,
  desert: ney,   // the oud now strums the chord (playBed), the ney sings the data
  snow: bell,
  other: (m, t, v, out, dur, pan) => keys(m, t, v * 1.3, out, dur + 1.0, pan, noteSend),
};

function sound(n, t, out) {
  if (n.kind === 'crackle') { if (n.step === 0) crackle(t, out); pop(t, n.velocity, out); return; }
  if (n.kind === 'skip') { skip(t); return; }
  if (mode === 'science') { beep(n.pitch, t, n.velocity, out); return; }
  const lead = LEAD[styleOf(place)] ?? LEAD.other;
  if (n.kind === 'data') {
    // played like a person: a few ms early or late, a little louder or softer, notes held until the next one
    const r = hash01(n.bar, n.step, n.voice);
    const tt = Math.max(ac.currentTime, t + (r - 0.5) * 0.024);
    const v = n.velocity * (n.voice ? 0.5 : 0.75) * (0.85 + 0.3 * hash01(n.step, n.bar, 7));
    noteSend = n.busy ? 0.3 : 1;
    if (n.voice === 1) { droplet(n.pitch, tt, n.velocity >= 1 ? 0.9 : 0.6, out, (r - 0.5) * 1.2); return; }   // extra wet notes = raindrops
    lead(n.pitch, tt, v, out, n.len ?? 0.3, (r - 0.5) * 0.5);
    noteSend = 1;
    return;
  }
  // bed: electric-piano chord at step 0; the greenness pulse (voice 0, 4 a bar) in the place's instrument
  if (n.step === 0) playBed(n, t, out);
  if (disc?.dataset !== 'rain' && n.voice === 0) lead(n.pitch + 24, t, n.velocity * 0.8, out, 4 * STEP, 0);
}

// ---------- field-recording bed ----------

function loadAmbience() {
  if (ambLoading) return ambLoading;
  ambLoading = Promise.all([...new Set([...LAYERS, ...BIRD_FILES])].map(async (name) => {
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
    const buf = name === 'birds' ? ambBufs[birdsFile(place)] ?? ambBufs.birds : ambBufs[name];   // the place's own birds
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = gainNode(0);
    src.connect(g); g.connect(ambCut);
    src.start(now, Math.random() * buf.duration);
    amb[name] = { src, g, buf };
  }
  const cur = currentBar();
  setAmbience(cur ? cur[0] : nextBar, now);
}

function setAmbience(b, t) {
  if (!amb) return;
  // another place on the deck: swap the birds recording for its region (same gain, so the mix carries on)
  const want = ambBufs[birdsFile(place)] ?? ambBufs.birds;
  if (amb.birds && want && amb.birds.buf !== want) {
    const now = ac.currentTime; const old = amb.birds.src;
    const src = ac.createBufferSource(); src.buffer = want; src.loop = true; src.connect(amb.birds.g);
    src.start(now, Math.random() * want.duration); old.stop(now + 0.05);
    amb.birds = { ...amb.birds, src, buf: want };
  }
  const mix = ambienceMix(disc, b, mode, place);
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
  if (from < 0) setDrone(mode === 'music' && notesByBar[b].some((n) => n.kind === 'data' || n.kind === 'bed'), t0);
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
  droneG = null;   // its oscillators were in `live` and are stopped above
  session = newSession();
}

function rebuild() {
  notesByBar = Array.from({ length: 12 }, () => []);
  if (!disc) return;
  if (ac) {   // rain discs sound darker and deeper: lower music low-pass, rain recordings without their hiss
    const rain = disc.dataset === 'rain';
    const dry = /desert|arid/i.test(place?.biome ?? '');   // desert wind keeps its dry hiss
    warm.frequency.setTargetAtTime(rain ? 2200 : 3200, ac.currentTime, 0.1);
    ambSoft.frequency.setTargetAtTime(rain && !dry ? 2600 : 4500, ac.currentTime, 0.1);
  }
  curStyle = styleOf(place);
  const tr = mode === 'music' ? (TRANSPOSE[curStyle] ?? 0) : 0;   // each style in its own key
  for (const n of schedule(disc, place, mode)) {
    if (tr && (n.kind === 'data' || n.kind === 'bed')) n.pitch += tr;
    notesByBar[n.bar].push(n);
  }
  // legato: each drop lasts until the next drop of the bar (the last one until the bar ends), at most 0.9 s
  for (const bar of notesByBar) {
    const drops = bar.filter((n) => n.kind === 'data' && n.voice === 0).sort((a, b) => a.step - b.step);
    // legato when there is room; in busy (wet) months each drop stops before the next one, so drops stay separate
    const busy = drops.length >= 6;
    drops.forEach((n, i) => { const last = !drops[i + 1]; const gap = ((drops[i + 1]?.step ?? 16) - n.step) * STEP; n.len = last ? gap * 0.85 : busy ? gap * 0.8 : Math.min(1.2, gap * 1.3); n.busy = busy; });   // the last note ends before next month's chord
    for (const n of bar) if (n.kind === 'data' && n.voice !== 0) { n.len = drops.find((d) => d.step === n.step)?.len ?? 0.3; n.busy = true; }
  }
  if (ac && mode === 'music' && ['sea', 'desert'].includes(styleOf(place))) {
    for (const bar of notesByBar) for (const n of bar) if (n.kind === 'data' || n.voice === 0) { pluckBuffer(n.pitch); pluckBuffer(n.pitch + 24); }
  }
}

function begin(fromBar) {
  ensure();
  playing = true;
  nextBar = fromBar;
  nextTime = ac.currentTime + 0.06;
  if (mode === 'music' && styleOf(place) === 'south-asia') startDrone(session.beat ?? session, 48 + TRANSPOSE['south-asia']);
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
  if (ac) master.gain.setTargetAtTime(volume * 1.2, ac.currentTime, 0.03);
}

export function onTick(fn) { tickFn = typeof fn === 'function' ? fn : () => {}; }
