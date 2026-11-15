// Written by Ky with help from Claude (SI). See AI_USE.md.
// Which field recordings sound under one month, and how loud (0..1 each). Pure, so node --test can check it.
// The level of the month decides; the place's biome decides what that weather sounds like there:
// a normal month in a desert is dry wind (rain there is an event), in snow or ice it is wind, elsewhere it is rain.

export const LAYERS = ['wind', 'rain-light', 'rain-heavy', 'birds', 'snow-wind', 'snow-howl'];

/** Recordings of birds from each place's own region (CREDITS.md); the "birds" layer plays the one for the place. */
export const BIRD_FILES = ['birds', 'birds-amazon', 'birds-mekong', 'birds-bengal', 'birds-outback', 'birds-arctic'];
export function birdsFile(place) {
  const biome = String(place?.biome ?? ''); const region = String(place?.region ?? '');
  if (/snow|ice|polar|glacier/i.test(biome)) return 'birds-arctic';      // Tromso, Norway
  if (/desert|arid/i.test(biome)) return 'birds-outback';                  // arid Australia
  if (/rainforest|forest/i.test(biome)) return 'birds-amazon';             // Amazon, Brazil
  if (region === 'south-asia') return 'birds-bengal';                      // Bengal delta
  if (region === 'sea' || /southeast/i.test(region)) return 'birds-mekong';   // Siem Reap, Cambodia
  return 'birds';                                                          // a park (any other place)
}

/**
 * @param {object} disc full disc object
 * @param {number} bar 0-11
 * @param {'music'|'science'} mode
 * @param {object} [place] full place object (its biome): desert = wind with rain only in wetter months; snow/ice = wind
 * @returns {{wind:number, 'rain-light':number, 'rain-heavy':number, birds:number}}
 */
export function ambienceMix(disc, bar, mode = 'music', place = null) {
  const mix = { wind: 0, 'rain-light': 0, 'rain-heavy': 0, birds: 0, 'snow-wind': 0, 'snow-howl': 0 };
  const level = disc?.levels?.[bar];
  if (mode !== 'music' || level === null || level === undefined) return mix;   // missing month: silence (crackle only)
  const biome = String(place?.biome ?? '');
  const desert = /desert|arid/i.test(biome);
  if (disc.dataset === 'rain' && desert) {
    // a desert's normal is no rain: an open, gusting wind always (the hill-storm recording), stronger when drier,
    // howling in the driest months; rain only in a wetter-than-normal month
    const dry = Math.max(0, -level) / 4;
    mix['snow-wind'] = 0.55 + 0.45 * dry;
    mix['snow-howl'] = level <= -3 ? 0.35 * (-level - 2) : 0;
    if (level > 0) {
      mix['snow-wind'] *= 1 - 0.4 * (level / 4);
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
    if (/snow|ice|polar|glacier/i.test(biome)) {
      // snow does not patter: open-hill wind always, stronger the further from normal; a snowier month adds the howl
      for (const k of LAYERS) mix[k] = 0;
      mix['snow-wind'] = 0.45 + 0.35 * (Math.abs(level) / 4);
      mix['snow-howl'] = level > 0 ? Math.min(1, 0.25 * level) : 0;
    }
  } else if (disc.dataset === 'snow') {
    // snow cover: the hill wind grows with the snow, the howl comes in when nearly all the land is white;
    // a month with little snow has the summer birds of the place (its own Arctic recording)
    const snow = (level - 1) / 3;
    mix['snow-wind'] = 0.3 + 0.5 * snow;
    mix['snow-howl'] = level >= 4 ? 0.35 : 0;
    mix.birds = 0.7 * (1 - snow);
  } else {
    const green = (level - 1) / 3;                     // q = 1..4 -> 0..1
    if (/snow|ice|polar|glacier/i.test(biome)) {       // snow places: hill wind, Arctic birds when it greens up
      mix['snow-wind'] = 0.3 + 0.4 * (1 - green);
      mix.birds = 0.7 * green;
      for (const k of LAYERS) mix[k] = Math.round(mix[k] * 1000) / 1000;
      return mix;
    }
    mix.birds = desert ? 0.6 * green : 0.15 + 0.85 * green;   // bare desert: no birds until it greens up
    if (desert) mix['snow-wind'] = 0.25 + 0.6 * (1 - green); else mix.wind = (1 - green) * 0.6;
  }
  for (const k of LAYERS) mix[k] = Math.round(mix[k] * 1000) / 1000;
  return mix;
}
