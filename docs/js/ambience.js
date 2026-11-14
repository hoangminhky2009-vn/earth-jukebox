// Written by Ky with help from Claude (SI). See AI_USE.md.
// Which field recordings sound under one month, and how loud (0..1 each). Pure, so node --test can check it.
// Same rule for every place: only the level of the month decides.

export const LAYERS = ['wind', 'rain-light', 'rain-heavy', 'birds'];

/**
 * @param {object} disc full disc object
 * @param {number} bar 0-11
 * @param {'music'|'science'} mode
 * @param {object} [place] full place object: in snow or ice places precipitation falls as snow, so the bed is wind, not rain
 * @returns {{wind:number, 'rain-light':number, 'rain-heavy':number, birds:number}}
 */
export function ambienceMix(disc, bar, mode = 'music', place = null) {
  const mix = { wind: 0, 'rain-light': 0, 'rain-heavy': 0, birds: 0 };
  const level = disc?.levels?.[bar];
  if (mode !== 'music' || level === null || level === undefined) return mix;   // missing month: silence (crackle only)
  if (disc.dataset === 'rain') {
    const wet = (level + 4) / 8;                       // 0 = 4 steps drier ... 0.5 = normal ... 1 = 4 steps wetter
    mix.wind = Math.max(0, (0.5 - wet) * 2) * 0.8;     // drier months: wind takes over
    mix['rain-light'] = Math.min(1, wet * 2) * (1 - Math.max(0, wet - 0.5));
    mix['rain-heavy'] = Math.max(0, (wet - 0.5) * 2);  // wetter months: heavy rain comes in
    // the further from normal, the louder the bed: a normal month is a quiet backdrop, an extreme month swells
    const swell = 0.5 + 0.5 * (Math.abs(level) / 4);
    for (const k of LAYERS) mix[k] *= swell;
    if (/snow|ice|polar/i.test(place?.biome ?? '')) {   // snow is quiet: fold the rain into a stronger wind
      mix.wind = Math.min(1, mix.wind + 0.6 * (mix['rain-light'] + mix['rain-heavy']));
      mix['rain-light'] = 0; mix['rain-heavy'] = 0;
    }
  } else {
    const green = (level - 1) / 3;                     // q = 1..4 -> 0..1
    mix.birds = 0.15 + 0.85 * green;
    mix.wind = (1 - green) * 0.6;
  }
  for (const k of LAYERS) mix[k] = Math.round(mix[k] * 1000) / 1000;
  return mix;
}
