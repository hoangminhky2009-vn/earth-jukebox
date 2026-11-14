// Written by Ky with help from Claude (SI). See AI_USE.md.
// The note schedule: a pure function from one disc to a list of notes (notes/05_music.md, "Note schedule").
// No audio and no DOM here, so it runs under `node --test`, in the piano roll and in the round-trip check.
// The rules are the same for every place, year and side; a place only changes the scale (and, in audio.js, the instrument).

export const ROOT = 60;          // MIDI middle C
export const STEPS = 16;         // sixteenth notes per bar (one bar = one month = 2 s at 120 BPM)

export const SCALES = {
  sea: [0, 2, 4, 7, 9],                 // major pentatonic
  'south-asia': [0, 2, 3, 5, 7, 9, 10], // dorian, close to raga Kafi
  other: [0, 2, 4, 6, 7, 9, 11],        // lydian
};

// Scale degree each bar's chord starts on: a 4-bar loop (3 times a year) in the lofi habit of ii - V - I - vi.
const CHORD_ROOTS = [1, 4, 0, 5];
// Raindrop melody: scale-degree offsets from the chord root, walked in order. It only shapes the tune;
// the data lives in how many drops fall (n) and in which octave.
const DROP_WALK = [0, 2, 4, 7, 4, 2, 4, 9, 7, 4, 2, 4, 7, 9, 11, 7];
const CRACKLE_STEPS = [0, 2, 5, 7, 9, 12, 14];
const SCIENCE_STEPS = [0, 4, 8, 12];
export const SKIP_STEP = 12;

/** Pitch of scale degree d (wraps up an octave each time round the scale). */
export function degree(scale, d, base) {
  return base + scale[((d % scale.length) + scale.length) % scale.length] + 12 * Math.floor(d / scale.length);
}

/** Euclidean rhythm: the steps (0-15) of exactly n hits spread as evenly as possible over 16 steps. */
export function euclid(n, steps = STEPS) {
  const out = [];
  for (let i = 0; i < steps; i++) if (Math.floor(((i + 1) * n) / steps) > Math.floor((i * n) / steps)) out.push(i);
  return out;
}

const isMissing = (v) => v === null || v === undefined;

/**
 * @param {object} disc  full disc object from discs.json
 * @param {object} place full place object (only `region` is used)
 * @param {'music'|'science'} mode
 * @returns {{bar:number, step:number, voice:number, pitch:number, velocity:number, kind:'data'|'bed'|'crackle'|'skip'}[]}
 */
export function schedule(disc, place, mode = 'music') {
  const scale = SCALES[place?.region] ?? SCALES.other;
  const breaks = new Set(disc.breaks ?? []);
  const notes = [];
  const add = (bar, step, voice, pitch, velocity, kind) => notes.push({ bar, step, voice, pitch, velocity, kind });

  for (let bar = 0; bar < 12; bar++) {
    const level = disc.levels[bar];
    const chord = CHORD_ROOTS[bar % 4];

    if (isMissing(level)) {
      // No data this month: crackle only, no chord and no data notes.
      CRACKLE_STEPS.forEach((s, i) => add(bar, s, 0, ROOT, i === 0 ? 0.5 : 0.35, 'crackle'));
    } else if (mode === 'science') {
      // One plain voice, 4 notes a bar; the pitch is the number.
      const pitch = disc.dataset === 'ndvi'
        ? ROOT + Math.round(24 * (disc.values?.[bar] ?? 0))   // 2 octaves for NDVI 0..1
        : ROOT + 2 * level;                                    // 9 pitches, 2 semitones apart, for k = -4..+4
      for (const s of SCIENCE_STEPS) add(bar, s, 0, pitch, 0.8, 'data');
    } else if (disc.dataset === 'rain') {
      // Raindrops: n = 8 + 2k notes; drier = fewer and an octave lower, wetter = more and an octave higher.
      const n = 8 + 2 * level;
      const octave = level < 0 ? -12 : level > 0 ? 12 : 0;
      const saturated = Math.abs(level) === 4;
      euclid(n).forEach((s, i) => {
        const vel = saturated ? 1 : (s % 4 === 0 ? 0.75 : 0.6);
        add(bar, s, 0, degree(scale, (chord + DROP_WALK[i]) % (2 * scale.length), ROOT + octave), vel, 'data');   // within 2 octaves
      });
      [0, 2, 4, 6].forEach((d, v) => add(bar, 0, v, degree(scale, chord + d, ROOT - 12), 0.5, 'bed'));   // seventh chord
    } else {
      // Greenness: q layers in the chord bed, each its own voice and octave, plus a steady pulse of 4 on voice 0.
      for (let v = 0; v < level; v++) add(bar, 0, v, degree(scale, chord + 2 * v, ROOT - 24 + 12 * v), 0.5, 'bed');
      for (const s of [4, 8, 12]) add(bar, s, 0, degree(scale, chord, ROOT - 24), 0.45, 'bed');
    }

    // A break in the source: keep the bar, add one skip marker; audio.js cuts the last quarter of the bar.
    // A missing month already crackles, and the contract says its bar holds crackle only.
    if (breaks.has(bar) && !isMissing(level)) add(bar, SKIP_STEP, 0, ROOT, 1, 'skip');
  }
  return notes;
}

/**
 * Read the levels back from a schedule (the round-trip check). Rain: k = (n - 8) / 2 from the data notes;
 * NDVI: q = number of distinct bed voices; a bar with only crackle is null.
 */
export function readBack(notes, dataset) {
  const out = [];
  for (let bar = 0; bar < 12; bar++) {
    const inBar = notes.filter((n) => n.bar === bar && n.kind !== 'skip');
    if (inBar.length && inBar.every((n) => n.kind === 'crackle')) { out.push(null); continue; }
    if (dataset === 'rain') out.push((inBar.filter((n) => n.kind === 'data').length - 8) / 2);
    else out.push(new Set(inBar.filter((n) => n.kind === 'bed').map((n) => n.voice)).size);
  }
  return out;
}
