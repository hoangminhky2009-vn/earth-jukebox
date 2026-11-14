// Written by Ky with help from Claude (SI). See AI_USE.md.
// Quiet turntable foley, synthesized sample by sample (no recorded sounds, so nothing to license).
// It uses its own AudioContext, separate from the music engine (audio.js / audio-stub.js).
//   place:   the centre hole taps the spindle, the disc lands on the rubber mat with a faint slap.
//   needle:  the stylus touches the groove: a soft low bump, a contact tick, a short lead-in hush with a few pops.
//   lift:    a small tick and a weak thump as the stylus leaves the record.
//   crackle: a few pops for a missing month or a break in the source.   flip: a short airy swish.
// Claude cannot listen: the shapes follow how these sounds are made and the levels are kept low on purpose.

let ac = null;
let master = null;
let volume = 0.8;
const cache = {};   // 3 variants of each sound, built in idle time so the click itself has no hitch

function context() {
  if (ac) return ac;
  const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!Ctx) return null;
  ac = new Ctx();
  master = ac.createGain();
  master.gain.value = volume;
  master.connect(ac.destination);
  return ac;
}

function build(kind) {
  const sr = ac.sampleRate;
  const dur = { place: 0.12, needle: 0.6, lift: 0.1, crackle: 0.5, flip: 0.35 }[kind];
  const n = Math.round(sr * dur);
  const buf = ac.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const jit = 1 + (Math.random() - 0.5) * 0.06;
  const ticks = new Float32Array(n);
  let lp = 0; let lp2 = 0; let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = Math.random() * 2 - 1;
    const hp = w - prev; prev = w;
    lp += (w - lp) * 0.06; lp2 += (w - lp2) * 0.28;   // crude high-pass, ~450 Hz and ~2.5 kHz low-pass
    let v = 0;
    if (kind === 'place') {
      v += hp * Math.exp(-t / 0.0005) * 0.6 + Math.sin(2 * Math.PI * 3400 * jit * t) * Math.exp(-t / 0.0025) * 0.3;
      const u = t - 0.006;
      if (u > 0) {
        v += lp * Math.exp(-u / 0.008) * 0.5 + Math.sin(2 * Math.PI * 260 * jit * u) * Math.exp(-u / 0.01) * 0.25
          + hp * Math.exp(-u / 0.004) * 0.35 + Math.sin(2 * Math.PI * 5200 * jit * u) * Math.exp(-u / 0.003) * 0.12;
      }
    } else if (kind === 'needle') {
      v += Math.sin(2 * Math.PI * 190 * jit * t) * Math.exp(-t / 0.02) * 0.25
        + Math.sin(2 * Math.PI * 2600 * jit * t) * Math.exp(-t / 0.002) * 0.12
        + lp2 * Math.exp(-t / 0.0015) * 0.5;
      const fade = Math.min(1, t / 0.04) * Math.exp(-t / 0.16);
      v += lp2 * 0.006 * fade;
      if (t < 0.45 && Math.random() < 9 / sr) ticks[i] = (Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.08) * fade;
    } else if (kind === 'lift') {
      v += hp * Math.exp(-t / 0.0006) * 0.45 + Math.sin(2 * Math.PI * 2900 * t) * Math.exp(-t / 0.002) * 0.2;
    } else if (kind === 'crackle') {
      v += Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.5 : (Math.random() * 2 - 1) * 0.02;
    } else {
      v += lp2 * Math.sin(Math.PI * (i / n)) * 0.3;   // flip
    }
    d[i] = v;
  }
  const K = Math.round(sr * 0.004);   // each pop is a dull ~1.3 kHz blip, not a spike
  for (let i = 0; i < n; i++) {
    if (ticks[i]) for (let k = 0; k < K && i + k < n; k++) d[i + k] += ticks[i] * Math.sin(2 * Math.PI * 1300 * k / sr) * Math.exp(-k / (sr * 0.0012));
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const gain = { place: 0.28, needle: 0.22, lift: 0.16, crackle: 0.14, flip: 0.14 }[kind];
  for (let i = 0; i < n; i++) d[i] = (d[i] / (peak || 1)) * gain * Math.min(1, (n - i) / (sr * 0.008));
  return buf;
}

function warm() {
  if (!context()) return;
  for (const k of ['place', 'needle', 'lift', 'crackle', 'flip']) if (!cache[k]) cache[k] = [build(k), build(k), build(k)];
}

/** Call from a user gesture: creates the context and prepares the sounds. */
export function unlock() {
  if (!context()) return;
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  setTimeout(warm, 0);
}

/** Play one of: 'place', 'needle', 'lift', 'crackle', 'flip'. Silent (no error) before the first gesture. */
export function play(kind) {
  try {
    if (!ac) return;
    if (!cache[kind]) warm();
    const s = ac.createBufferSource();
    s.buffer = cache[kind][(Math.random() * 3) | 0];
    s.connect(master);
    s.start();
  } catch { /* sound is a bonus: never break the page */ }
}

/** 0 to 1, the same volume as the Settings slider. */
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, Number(v) || 0));
  if (master) master.gain.value = volume;
}
