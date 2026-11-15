// Publish a compact, reproducible subset of pipeline evidence for the month inspector.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const data = JSON.parse(await readFile(new URL('docs/data/discs.json',root),'utf8'));
const result = { meaning:'Colour-decoding evidence from NASA rendered frames, not an independent physical measurement validation.', discs:{} };
const cache = new Map();
for (const disc of data.discs) {
  // The seasonal inspector covers SVS rain and greenness; snow keeps its GIBS evidence in the main player.
  if (!['rain','ndvi'].includes(disc.dataset)) continue;
  const key = `${disc.dataset}-${disc.year}`;
  if (!cache.has(key)) cache.set(key,JSON.parse(await readFile(new URL(`pipeline/evidence/${key}.json`,root),'utf8')));
  const e = cache.get(key).places[disc.place];
  if (!e) throw new Error(`Missing pipeline evidence for ${disc.id}`);
  for (let m=0;m<12;m++) if (e.months[m].level !== disc.levels[m] || e.months[m].frames_used !== disc.frames_used[m]) throw new Error(`Stale evidence for ${disc.id}, month ${m+1}`);
  result.discs[disc.id] = { crop:e.crop, frames:Object.entries(e.frames).map(([date,f])=>({date,status:f.status,url:f.url,sha256:f.sha256 ?? null,
    sampled_pixels:f.reading?.sampled_pixels ?? null,matched_pixels:f.reading?.matched_pixels ?? null,match_pct:f.reading?.match_pct ?? null,
    centre_pixel:f.reading?.centre_pixel ?? null,transparent_pixels:f.reading?.transparent_pixels ?? null})) };
}
await writeFile(new URL('docs/data/seasonal-evidence.json',root),JSON.stringify(result));
console.log(`Published verified source evidence for ${Object.keys(result.discs).length} records.`);
