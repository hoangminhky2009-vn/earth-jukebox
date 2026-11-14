// Written by Ky with help from Claude (SI). See AI_USE.md.
// The note schedule: a pure function from one disc to a list of notes (notes/05_music.md, "Note schedule").
// No audio and no DOM here, so it runs under `node --test`, in the piano roll and in the round-trip check.
// The data rules are the same for every place, year and side; a place only changes the style: scale and chord loop here,
// key, instruments and groove in audio.js.

export const ROOT = 60;          // MIDI middle C
export const STEPS = 16;         // sixteenth notes per bar (one bar = one month = 2 s at 120 BPM)

// A musical style per place: its region, unless the biome is very distinct (desert, snow/ice).
export const SCALES = {
  sea: [0, 2, 4, 7, 9],                 // major pentatonic
  'south-asia': [0, 2, 3, 5, 7, 9, 10], // dorian, close to raga Kafi
  other: [0, 2, 4, 6, 7, 9, 11],        // lydian
  desert: [0, 1, 4, 5, 7, 8, 10],       // phrygian dominant (hijaz colour)
  snow: [0, 2, 5, 7, 9],                // suspended pentatonic: open, cold, no thirds to lean on
};

/** Style of a place: 'desert' or 'snow' from its biome, else its region ('sea', 'south-asia', 'other'). */
export function styleOf(place) {
  const biome = String(place?.biome ?? '');
  if (/desert|arid/i.test(biome)) return 'desert';
  if (/snow|ice|polar|glacier/i.test(biome)) return 'snow';
  return place?.region in SCALES ? place.region : 'other';
}

// Scale degree each bar's chord starts on: a 4-bar loop (3 times a year), one per region so places sound different
// (accompaniment only: the data rules are the same everywhere).
const CHORD_LOOPS = {
  other: [1, 4, 0, 5],          // lydian, the lofi habit of ii - V - I - vi
  sea: [0, 2, 3, 1],            // pentatonic, gentle and open
  'south-asia': [0, 3, 0, 6],   // dorian modal vamp: i - IV - i - bVII, close to the drone
  desert: [0, 1, 0, 6],         // i - bII - i - bVII, the hijaz cadence
  snow: [0, 3, 1, 3],           // slow, open, hovering
};
// Raindrop melody: four shapes of chord tones (offsets from the chord root, one per drop slot). The change from the
// month before picks the shape: wetter than last month = the tune climbs, drier = it falls, same = it alternates.
// The data itself lives in how many drops fall (n) and in which register; the shape only makes it a tune.
// One set of shapes per style, so each place has its own melodic habit (chord-tone / scale-degree offsets).
const SHAPE_SETS = {
  other: {   // lofi jazz: arpeggios through the seventh chord
    up: [0, 2, 4, 2, 4, 6, 7, 9], down: [9, 7, 6, 4, 2, 4, 2, 0],
    same: [[2, 4, 6, 4, 2, 0, 2, 4], [4, 2, 0, 2, 4, 2, 6, 4], [0, 4, 2, 6, 4, 7, 6, 2], [6, 4, 4, 2, 2, 0, 4, 2]],
  },
  sea: {     // pentatonic leaps and returns
    up: [0, 1, 2, 4, 5, 6, 7, 9], down: [9, 7, 6, 5, 4, 2, 1, 0],
    same: [[2, 0, 4, 2, 6, 4, 2, 0], [0, 2, 1, 4, 2, 5, 4, 2], [4, 5, 4, 2, 1, 2, 0, 2], [1, 4, 6, 4, 1, 2, 4, 2]],
  },
  'south-asia': {   // stepwise, turning around a note like an ornament
    up: [0, 1, 2, 1, 2, 3, 4, 5], down: [5, 4, 3, 4, 3, 2, 1, 0],
    same: [[2, 3, 2, 1, 0, 1, 2, 4], [4, 3, 4, 5, 4, 2, 3, 2], [0, 1, 0, -1, 0, 2, 1, 0], [2, 4, 3, 2, 3, 1, 2, 0]],
  },
  desert: {  // stepwise through the augmented second of the hijaz scale
    up: [0, 1, 2, 3, 4, 3, 4, 5], down: [5, 4, 3, 2, 1, 2, 1, 0],
    same: [[2, 1, 2, 3, 2, 1, 0, 1], [0, 1, 2, 1, 4, 3, 2, 1], [4, 3, 2, 3, 1, 2, 1, 0], [2, 3, 4, 3, 2, 1, 2, 0]],
  },
  snow: {    // wide, open intervals
    up: [0, 2, 4, 7, 4, 9, 7, 11], down: [11, 7, 9, 4, 7, 2, 4, 0],
    same: [[0, 4, 2, 7, 4, 9, 2, 4], [7, 2, 4, 0, 9, 4, 2, 7], [4, 7, 9, 4, 2, 0, 4, 2], [2, 9, 4, 7, 0, 4, 7, 2]],
  },
};
const ROTATE = [0, 3, 5, 2];  // and the drops start on a different slot each month (same count, new rhythm)
const BAND = 12;   // each register is one octave: dry 55-67, normal 60-72, wet 66-78 (kept low: warm, not shrill)
const fold = (p, base) => { let q = p; while (q > base + BAND) q -= 12; while (q < base) q += 12; return q; };
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
  const style = styleOf(place);
  const scale = SCALES[style];
  const loop = CHORD_LOOPS[style];
  const breaks = new Set(disc.breaks ?? []);
  const notes = [];
  const add = (bar, step, voice, pitch, velocity, kind) => notes.push({ bar, step, voice, pitch, velocity, kind });

  let prevLevel = null;   // level of the month before (melody shape)
  let prevLast = null;    // last drop of the month before (smooth joins)
  for (let bar = 0; bar < 12; bar++) {
    const level = disc.levels[bar];
    const chord = loop[bar % 4];

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
      // Drops sit on the 8 off-beat-swung sixteenths of the half-time feel (even steps); above 8, the extra
      // drops are a third on top of a drop (two notes at once), so the count stays n without crowding the beat.
      // Registers: bass 36-47 (audio.js), chord 43-54, drops from 55 (dry) / 60 (normal) / 66 (wet): drier = lower.
      const n = 8 + 2 * level;
      const lo = level < 0 ? ROOT - 5 : level > 0 ? ROOT + 6 : ROOT;   // bottom of the drop register
      const saturated = Math.abs(level) === 4;
      const same = prevLevel === null || prevLevel === level;
      const set = SHAPE_SETS[style];
      const shape = same ? set.same[bar % 4] : level > prevLevel ? set.up : set.down;
      const rot = n < 8 ? ROTATE[bar % 4] : 0;
      const slots = euclid(Math.min(n, 8), 8).map((x) => (x + rot) % 8).sort((a, b) => a - b);
      const extra = new Set(euclid(Math.max(0, n - 8), 8));
      // Start on the chord tone that lands nearest the last note of the month before, so months join smoothly.
      let shift = 0;
      let bestCost = Infinity;
      if (slots.length) {
        for (const r of [0, -2, 2, -4, 4]) {
          const first = fold(degree(scale, chord + shape[slots[0]] + r, ROOT), lo);
          const cost = (prevLast === null ? 0 : Math.abs(first - prevLast)) + Math.abs(r) * 0.1;
          if (cost < bestCost) { bestCost = cost; shift = r; }
        }
      }
      slots.forEach((slot) => {
        const s = slot * 2;
        const d = chord + shape[slot] + shift;
        const pitch = fold(degree(scale, d, ROOT), lo);
        add(bar, s, 0, pitch, saturated ? 1 : (s % 8 === 0 ? 0.75 : 0.6), 'data');
        prevLast = pitch;
        if (extra.has(slot)) {
          let h = degree(scale, d + 2, ROOT);   // a third above the drop
          while (h <= pitch) h += 12;
          while (h - pitch > 12) h -= 12;
          if (h > 108) h -= 12;
          add(bar, s, 1, h, saturated ? 1 : 0.5, 'data');
        }
      });
      // Seventh chord, folded into one octave (43-54) so it never rubs against the drops.
      [0, 2, 4, 6].forEach((d, v) => add(bar, 0, v, 43 + ((((degree(scale, chord + d, ROOT - 12) - 43) % 12) + 12) % 12), 0.5, 'bed'));
    } else {
      // Greenness: q layers in the chord bed, each its own voice and octave, plus a steady pulse of 4 on voice 0.
      for (let v = 0; v < level; v++) add(bar, 0, v, degree(scale, chord + 2 * v, ROOT - 24 + 12 * v), 0.5, 'bed');
      for (const s of [4, 8, 12]) add(bar, s, 0, degree(scale, chord, ROOT - 24), 0.45, 'bed');
    }

    if (!isMissing(level)) prevLevel = level;

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
