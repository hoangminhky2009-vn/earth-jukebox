// Written by Ky with help from Claude (SI). See AI_USE.md.
// Which field recordings sound under one month, and how loud (0..1 each). Pure, so node --test can check it.
// The level of the month decides; the place's biome decides what that weather sounds like there:
// a normal month in a desert is dry wind (rain there is an event), in snow or ice it is wind, elsewhere it is rain.

export const LAYERS = ['wind', 'rain-light', 'rain-heavy', 'birds'];

/**
 * @param {object} disc full disc object
 * @param {number} bar 0-11
 * @param {'music'|'science'} mode
 * @param {object} [place] full place object (its biome): desert = wind with rain only in wetter months; snow/ice = wind
 * @returns {{wind:number, 'rain-light':number, 'rain-heavy':number, birds:number}}
 */
export function ambienceMix(disc, bar, mode = 'music', place = null) {
  const mix = { wind: 0, 'rain-light': 0, 'rain-heavy': 0, birds: 0 };
  const level = disc?.levels?.[bar];
  if (mode !== 'music' || level === null || level === undefined) return mix;   // missing month: silence (crackle only)
  const biome = String(place?.biome ?? '');
  const desert = /desert|arid/i.test(biome);
  if (disc.dataset === 'rain' && desert) {
    // a desert's normal is no rain: dry wind always, stronger when drier; rain only in a wetter-than-normal month
    mix.wind = 0.5 + 0.5 * (Math.max(0, -level) / 4);
    if (level > 0) {
      mix.wind *= 1 - 0.4 * (level / 4);
      mix['rain-light'] = 0.3 + 0.15 * level;
      mix['rain-heavy'] = level >= 3 ? 0.5 * (level - 2) : 0;
    }
  } else if (disc.dataset === 'rain') {
    const wet = (level + 4) / 8;                       // 0 = 4 steps drier ... 0.5 = normal ... 1 = 4 steps wetter
    mix.wind = Math.max(0, (0.5 - wet) * 2) * 0.8;     // drier months: wind takes over
    mix['rain-light'] = Math.min(1, wet * 2) * (1 - Math.max(0, wet - 0.5));
    mix['rain-heavy'] = Math.max(0, (wet - 0.5) * 2);  // wetter months: heavy rain comes in
    // the further from normal, the louder the bed: a normal month is a quiet backdrop, an extreme month swells
    const swell = 0.5 + 0.5 * (Math.abs(level) / 4);
    for (const k of LAYERS) mix[k] *= swell;
    if (/snow|ice|polar/i.test(biome)) {   // snow is quiet: fold the rain into a stronger wind
      mix.wind = Math.min(1, mix.wind + 0.6 * (mix['rain-light'] + mix['rain-heavy']));
      mix['rain-light'] = 0; mix['rain-heavy'] = 0;
    }
  } else {
    const green = (level - 1) / 3;                     // q = 1..4 -> 0..1
    mix.birds = desert ? 0.6 * green : 0.15 + 0.85 * green;   // bare desert: no birds until it greens up
    mix.wind = desert ? 0.25 + 0.6 * (1 - green) : (1 - green) * 0.6;
  }
  for (const k of LAYERS) mix[k] = Math.round(mix[k] * 1000) / 1000;
  return mix;
}
