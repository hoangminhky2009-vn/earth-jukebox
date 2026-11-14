// Written by Ky with help from Claude (SI). See AI_USE.md.
// Stand-in for Sabik's schedule.js, used only to try the piano roll: same signature, same rules as
// notes/05_music.md ("Note schedule"). app.js loads this file only when schedule.js is missing.

const ROOT = 60; // middle C
const SCALES = {
  sea: [0, 2, 4, 7, 9],              // major pentatonic
  'south-asia': [0, 2, 3, 5, 7, 9, 10], // dorian
  other: [0, 2, 4, 6, 7, 9, 11],     // lydian
};
const CHORD_ROOTS = [0, 3, 4, 1];     // scale degree where the chord of bars 0..3 starts (4-bar loop)
const CRACKLE_STEPS = [0, 2, 5, 7, 9, 12, 14];

/** Pitch of scale degree `d` (may exceed the scale length: goes up an octave each time round). */
function degree(scale, d, base) {
  return base + scale[d % scale.length] + 12 * Math.floor(d / scale.length);
}

/** Steps (0-15) of an even rhythm with exactly n hits: step i hits when floor((i+1)n/16) > floor(i n/16). */
export function evenSteps(n) {
  const steps = [];
  for (let i = 0; i < 16; i++) if (Math.floor(((i + 1) * n) / 16) > Math.floor((i * n) / 16)) steps.push(i);
  return steps;
}

/** @returns {{bar:number, step:number, voice:number, pitch:number, velocity:number, kind:string}[]} */
export function schedule(disc, place, mode) {
  const scale = SCALES[place?.region] ?? SCALES.other;
  const notes = [];
  const add = (bar, step, voice, pitch, velocity, kind) => notes.push({ bar, step, voice, pitch, velocity, kind });
  const breaks = new Set(disc.breaks ?? []);

  for (let bar = 0; bar < 12; bar++) {
    const level = disc.levels[bar];
    if (level === null || level === undefined) {
      for (const s of CRACKLE_STEPS) add(bar, s, 0, ROOT, 0.4, 'crackle');
    } else if (mode === 'science') {
      const pitch = disc.dataset === 'ndvi'
        ? ROOT + Math.round(24 * (disc.values?.[bar] ?? 0))
        : ROOT + 2 * level;
      for (const s of [0, 4, 8, 12]) add(bar, s, 0, pitch, 0.8, 'data');
    } else if (disc.dataset === 'rain') {
      const n = 8 + 2 * level;
      const octave = level < 0 ? -12 : level > 0 ? 12 : 0;
      const accent = Math.abs(level) === 4 ? 1 : 0.7;
      evenSteps(n).forEach((s, i) => add(bar, s, 0, degree(scale, i, ROOT + octave), accent, 'data'));
      const start = CHORD_ROOTS[bar % 4];
      [0, 2, 4].forEach((d, v) => add(bar, 0, v, degree(scale, start + d, ROOT - 12), 0.5, 'bed'));
    } else {
      const start = CHORD_ROOTS[bar % 4];
      for (let v = 0; v < level; v++) add(bar, 0, v, degree(scale, start + 2 * v, ROOT - 24 + 12 * v), 0.5, 'bed');
      for (const s of [4, 8, 12]) add(bar, s, 0, degree(scale, start, ROOT - 24), 0.5, 'bed'); // pulse: 4 notes with the step-0 one
    }
    if (breaks.has(bar) && !(level === null || level === undefined)) add(bar, 12, 0, ROOT, 1, 'skip');
  }
  return notes;
}
