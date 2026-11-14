// Written by Ky with help from Claude (SI). See AI_USE.md.
// Silent stand-in for audio.js with exactly the same exports (see notes/05_music.md).
// play() calls the tick callback with an integer bar 0-11 every 2 seconds (one month per bar).

const BAR_MS = 2000;
let tickFn = () => {};
let bar = 0;
let timer = null;

function clear() { if (timer !== null) { clearInterval(timer); timer = null; } }

export async function start() { /* nothing to unlock in the stub */ }
export function load(disc, place) { clear(); bar = 0; console.debug('[audio-stub] load', disc?.id, place?.id); }
export function play() {
  clear();
  tickFn(bar);
  timer = setInterval(() => { bar = (bar + 1) % 12; tickFn(bar); }, BAR_MS);
}
export function pause() { clear(); }
export function stop() { clear(); bar = 0; }
export function seek(m) { bar = Math.min(11, Math.max(0, Math.round(m))); }
export function setMode(mode) { console.debug('[audio-stub] mode', mode); }
export function duck(db, ms) { console.debug('[audio-stub] duck', db, ms); }
export function setVolume(v) { console.debug('[audio-stub] volume', v); }
export function onTick(fn) { tickFn = fn; }
