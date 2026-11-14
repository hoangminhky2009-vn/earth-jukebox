// Written by Ky with help from Claude (SI). See AI_USE.md.
// Audit the note schedule the way an ear would: melodic leaps between consecutive tune notes, and pairs of notes
// that sound at the same time a minor/major second or a tritone apart (the "clash" intervals).
// Usage: node tools/note_audit.mjs [data/discs.json]   (prints one line per style and a total)
import { readFileSync } from 'node:fs';
import { schedule, styleOf } from '../docs/js/schedule.js';

const STEP = 2 / 16;
const file = new URL(`../docs/${process.argv[2] ?? 'data/discs.json'}`, import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const CLASH = new Set([1, 2, 6, 10, 11]);   // seconds, tritone and sevenths (folded into one octave)

/** How long each note sounds, close to what audio.js does. */
let DRONE = false;
function spans(notes) {
  const out = [];
  for (let bar = 0; bar < 12; bar++) {
    const inBar = notes.filter((n) => n.bar === bar);
    const tune = inBar.filter((n) => n.kind === 'data' && n.voice === 0).sort((a, b) => a.step - b.step);
    tune.forEach((n, i) => {
      const gap = ((tune[i + 1]?.step ?? 16) - n.step) * STEP;
      const len = tune[i + 1] ? Math.min(1.2, gap * 1.3) : gap * 0.85;   // as audio.js: the last note stops before the next chord
      out.push({ ...n, t0: bar * 2 + n.step * STEP, t1: bar * 2 + n.step * STEP + len + 0.1, role: 'tune' });
    });
    for (const n of inBar) {
      // raindrops (voice 1) are unpitched clicks in audio.js: no pitch to clash
      if (n.kind === 'bed' && n.step === 0) out.push({ ...n, t0: bar * 2, t1: bar * 2 + 2, role: 'bed' });
    }
    // South Asia also holds a drone on the tonic (C before transposing) in every month that has music
    if (DRONE && tune.length) out.push({ pitch: 48, t0: bar * 2, t1: bar * 2 + 2, role: 'bed' });
  }
  return out;
}

const rows = {};
for (const d of data.discs.filter((x) => x.dataset === 'rain')) {
  const place = data.places.find((p) => p.id === d.place);
  const style = styleOf(place);
  const r = (rows[style] ||= { tuneNotes: 0, leaps: [], bigLeaps: 0, clashes: 0, clashPairs: 0, dropJumps: 0 });
  DRONE = style === 'south-asia';
  const s = spans(schedule(d, place, 'music'));
  const tune = s.filter((n) => n.role === 'tune').sort((a, b) => a.t0 - b.t0);
  r.tuneNotes += tune.length;
  for (let i = 1; i < tune.length; i++) { const L = Math.abs(tune[i].pitch - tune[i - 1].pitch); r.leaps.push(L); if (L > 7) r.bigLeaps++; }
  // every pitched thing in time order (tune + drops): jumps of more than an octave between neighbours
  const all = s.filter((n) => n.role !== 'bed').sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < all.length; i++) if (Math.abs(all[i].pitch - all[i - 1].pitch) > 12) r.dropJumps++;
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const a = s[i]; const b = s[j];
      if (a.role === 'bed' && b.role === 'bed') continue;
      if (Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0) <= 0.05) continue;
      r.clashPairs++;
      if (CLASH.has(Math.abs(a.pitch - b.pitch) % 12)) r.clashes++;
    }
  }
}
for (const [style, r] of Object.entries(rows)) {
  const mean = r.leaps.reduce((a, x) => a + x, 0) / Math.max(1, r.leaps.length);
  console.log(`${style.padEnd(11)} tune leaps: mean ${mean.toFixed(1)} st, >7 st ${r.bigLeaps}/${r.leaps.length} | jumps >12 st incl. drops ${r.dropJumps} | clashing overlaps ${r.clashes}/${r.clashPairs} (${(100 * r.clashes / Math.max(1, r.clashPairs)).toFixed(0)}%)`);
}
