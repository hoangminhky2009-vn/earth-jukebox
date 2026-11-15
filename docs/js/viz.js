// Written by Ky with help from Claude (SI). See AI_USE.md.
// Pure helpers for the pixel console and the small data visualisations: no DOM, so they run under node --test.
// Biome look, shelf slots, month bars (chart A), A/B comparison (B), map ping colour (C), LCD text.

export const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** Disc ring colours by level (same palette for the disc, the LEDs and the chart). */
export const RAIN_COLORS = { '-4': '#e8834a', '-3': '#dd8f57', '-2': '#c99a6e', '-1': '#b59f86', '0': '#8d8a99', '1': '#7fa8b8', '2': '#6fb4cf', '3': '#62c3e3', '4': '#7fd8f2' };
export const NDVI_COLORS = { 1: '#9c8a5c', 2: '#a8b05a', 3: '#7cbf5f', 4: '#5fd17a' };
export const MISSING_COLOR = '#6b6577';
export const levelColor = (dataset, level) => (level === null || level === undefined ? MISSING_COLOR
  : (dataset === 'rain' ? RAIN_COLORS[String(level)] : NDVI_COLORS[level]) ?? MISSING_COLOR);

const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
const isMissing = (v) => v === null || v === undefined;

// ------------------------------------------------------------------ biome → disc art + weather

/** Biome text from the place (e.g. "monsoon-delta") → centre art and weather. Anything unknown: delta art, no weather. */
// The water landscape of each real place, used when its biome is the generic "monsoon-delta"
// (a more specific biome in the data, e.g. "monsoon-lake", always wins).
const PLACE_ART = { dhaka: 'city', sylhet: 'wetland', 'tonle-sap': 'lake', hue: 'coast' };

export function biomeLook(biome, placeId) {
  const t = String(biome ?? '').toLowerCase().split(/[\s_-]+/);
  const has = (...w) => w.some((x) => t.includes(x));
  if (has('desert')) return { art: 'desert', weather: 'sand' };
  if (has('rainforest', 'forest')) return { art: 'forest', weather: 'forest' };
  if (has('ice', 'polar', 'snow')) return { art: 'ice', weather: 'snow' };
  const rain = has('monsoon') ? 'rain' : 'none';
  if (has('lake')) return { art: 'lake', weather: rain };
  if (has('coast', 'lagoon')) return { art: 'coast', weather: rain };
  if (has('wetland', 'haor', 'hills')) return { art: 'wetland', weather: rain };
  if (has('city')) return { art: 'city', weather: rain };
  return { art: PLACE_ART[placeId] ?? 'delta', weather: rain };
}

// ------------------------------------------------------------------ shelf

/**
 * One slot per place + dataset pair, showing side A (the lowest side letter, then the earliest year).
 * Places run west to east, rain before greenness. `discs` lists every disc of the pair, side A first.
 */
export function shelfSlots(discs, places) {
  const lon = new Map(places.map((p) => [p.id, p.lon]));
  const groups = new Map();
  for (const d of discs) {
    const key = `${d.place}|${d.dataset}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  const slots = [...groups.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.side.localeCompare(b.side) || a.year - b.year);
    return { key: `${sorted[0].place}|${sorted[0].dataset}`, placeId: sorted[0].place, dataset: sorted[0].dataset, discId: sorted[0].id, discIds: sorted.map((d) => d.id) };
  });
  return slots.sort((a, b) => (lon.get(a.placeId) ?? 0) - (lon.get(b.placeId) ?? 0) || b.dataset.localeCompare(a.dataset));
}

/** Tray geometry in internal pixels: 6 big slots (3×2), or 12 compact ones (4×3) when there are more pairs. */
/** The river place shown on the main tray page (the team picks its standout river here). */
export const FEATURED_RIVER = 'dhaka';
export const PAGE_TITLES = { main: 'River, forest, desert and ice', more: 'More places' };

/**
 * Tray pages. The main page has six fixed spots, read as columns (top = rain, bottom = greenness):
 * the featured river place (rain, greenness), a forest place (rain, greenness), then a desert place (greenness)
 * above a snow/ice place (greenness): in deserts the rain departure is always about zero, while greenness moves. A spot with no disc in the data stays empty. Every other disc goes to "More places"
 * pages, 6 a page, so nothing is dropped.
 */
export function shelfPages(slots, places, per = 6) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const art = (id) => biomeLook(byId.get(id)?.biome, id).art;
  const isRiver = (id) => !['forest', 'desert', 'ice'].includes(art(id));
  const riverId = slots.some((s) => s.placeId === FEATURED_RIVER) ? FEATURED_RIVER : slots.find((s) => isRiver(s.placeId))?.placeId;
  const want = [
    [(id) => id === riverId, 'rain'], [(id) => id === riverId, 'ndvi'],
    [(id) => art(id) === 'forest', 'rain'], [(id) => art(id) === 'forest', 'ndvi'],
    [(id) => art(id) === 'desert', 'ndvi'], [(id) => art(id) === 'ice', 'ndvi'],
  ];
  const main = want.map(([pick, ds]) => slots.find((s) => pick(s.placeId) && s.dataset === ds) ?? null);
  const rest = slots.filter((s) => !main.includes(s));
  const pages = [{ key: 'main', title: PAGE_TITLES.main, slots: main }];
  for (let i = 0; i < rest.length; i += per) pages.push({ key: 'more', title: PAGE_TITLES.more, slots: rest.slice(i, i + per) });
  return pages;
}

/** Tray grid for n place+dataset pairs. Exactly n slots (no empty "???" fillers); discs as big as the grid allows. */
export function slotLayout(n) {
  if (n <= 6) return { count: n, cols: 3, rows: 2, w: 70, h: 64, stepX: 72, stepY: 66, discR: 22, cy: 27, compact: false };
  if (n <= 8) return { count: n, cols: 4, rows: 2, w: 54, h: 64, stepX: 55, stepY: 66, discR: 22, cy: 27, compact: false };
  return { count: Math.min(n, 12), cols: 4, rows: 3, w: 54, h: 42, stepX: 55, stepY: 43, discR: 15, cy: 17, compact: true };
}

// ------------------------------------------------------------------ A: month bars

/**
 * Twelve bar specs for the Details chart and table. Rain: bars up (wetter) or down (drier) from a zero line,
 * `steps` = how many blocks (|level|, 0 = a thin line). Greenness: `steps` quarter blocks (level of 4).
 * Missing months: kind "missing", no steps. `text` is the sentence for the table; `short` is the label on the chart.
 */
export function monthBars(disc, datasets) {
  const ds = datasets?.[disc.dataset];
  const top = Math.max(4, ...(ds?.levels ?? []).map((l) => l.level));
  return disc.levels.map((level, m) => {
    const base = { month: m, label: MONTH_ABBR[m], name: MONTH_NAMES[m], level: isMissing(level) ? null : level };
    if (isMissing(level)) return { ...base, kind: 'missing', dir: 'none', steps: 0, short: 'no data', levelText: 'no data', text: 'no data', color: MISSING_COLOR };
    const found = ds?.levels.find((l) => l.level === level);
    const label = found ? found.label : `level ${level}`;
    if (disc.dataset === 'rain') {
      const v = typeof disc.values?.[m] === 'number' ? disc.values[m] : found?.value;
      const sat = Math.abs(level) >= 4 || disc.saturated?.[m] === true;
      const kind = level > 0 ? 'wetter' : level < 0 ? 'drier' : 'normal';
      const dir = level > 0 ? 'up' : level < 0 ? 'down' : 'flat';
      const glyph = level > 0 ? '▲' : level < 0 ? '▼' : '●';
      const mag = sat ? '15+' : typeof v === 'number' ? String(Math.abs(v)) : String(Math.abs(level));
      const about = level === 0 || typeof v !== 'number' ? '' : ` (about ${signed(v)} mm/day)`;
      return { ...base, kind, dir, steps: Math.abs(level), short: level === 0 ? '0' : `${glyph}${mag}`,
        levelText: level === 0 ? '● near normal' : `${glyph} ${signed(level)}`, text: `${label}${about}`, color: levelColor('rain', level) };
    }
    const v = disc.values?.[m];
    const pos = typeof v === 'number' ? ` (${v} on the colour scale)` : '';
    return { ...base, kind: 'green', dir: 'flat', steps: level, of: top, short: `${level}/${top}`,
      levelText: `${level} of ${top}`, text: `${label}${pos}`, color: levelColor('ndvi', level) };
  });
}

// ------------------------------------------------------------------ B: side A vs side B

/**
 * Compare the two sides of a place + dataset, month by month (levels, months with data on both sides only).
 * Returns null unless both discs share place and dataset. The text is the deck's accessible description.
 */
export function compareSides(x, y) {
  if (!x || !y || x.place !== y.place || x.dataset !== y.dataset || x.id === y.id) return null;
  const [a, b] = [x, y].sort((p, q) => p.side.localeCompare(q.side));
  let up = 0; let down = 0; let same = 0; let compared = 0;
  for (let m = 0; m < 12; m++) {
    const la = a.levels[m]; const lb = b.levels[m];
    if (isMissing(la) || isMissing(lb)) continue;
    compared++;
    if (lb > la) up++; else if (lb < la) down++; else same++;
  }
  const word = a.dataset === 'rain' ? 'wetter' : 'greener';
  const tail = compared < 12 ? ` (${compared} months have data on both sides)` : '';
  return { a: { side: a.side, year: a.year }, b: { side: b.side, year: b.year }, up, down, same, compared, word,
    text: `Side ${a.side} ${a.year} vs side ${b.side} ${b.year}: ${up} of 12 months ${word} in ${b.year}${tail}` };
}

// ------------------------------------------------------------------ C: ping colour

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => '#' + hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
export const PING = { drier: '#e8834a', wetter: '#4fd6e0', normal: '#f4ead2', missing: '#8d8a99', idle: '#f6d27a' };
export const GREEN_SCALE = { 1: '#b9c26a', 2: '#8fcf6a', 3: '#5fd17a', 4: '#2fe08a' };

/** Map ping colour for a month: drier warm orange, wetter teal, near normal cream, missing grey; greenness on a green scale. */
export function pingColor(disc, month) {
  const level = disc?.levels?.[month];
  if (isMissing(level)) return disc ? PING.missing : PING.idle;
  if (disc.dataset === 'ndvi') return GREEN_SCALE[level] ?? PING.missing;
  if (level === 0) return PING.normal;
  return mixHex(PING.normal, level < 0 ? PING.drier : PING.wetter, Math.min(1, 0.45 + 0.1375 * Math.abs(level)));
}

// ------------------------------------------------------------------ LCD

/** Short LCD wording of a level: rain "2-5mm drier", greenness the dataset label. */
function lcdLevel(disc, level, ds) {
  const found = ds?.levels.find((l) => l.level === level);
  if (disc.dataset !== 'rain') return found ? found.label : `level ${level}`;
  if (level === 0) return 'normal';
  const neg = (v) => (isMissing(v) ? null : -v);
  const [lo, hi] = !found ? [null, null] : level > 0 ? [found.min, found.max] : [neg(found.max), neg(found.min)];
  const range = isMissing(lo) && isMissing(hi) ? `${Math.abs(level)}` : isMissing(hi) ? `${lo}+` : `${lo}-${hi}`;
  return `${range}mm ${level > 0 ? 'wetter' : 'drier'}`;
}

/** The green LCD line while a month plays, e.g. "DHAKA // MAR ▼ 2-5mm drier". */
export function lcdText(disc, placeName, month, datasets) {
  const name = String(placeName).split(',')[0].replace(/\s+(and surroundings|near .*)$/i, '').toUpperCase();
  const level = disc.levels[month];
  if (isMissing(level)) return `${name} // ${MONTH_ABBR[month]} ░ NO DATA`;
  const glyph = disc.dataset === 'rain' ? (level < 0 ? '▼ ' : level > 0 ? '▲ ' : '• ') : '';
  return `${name} // ${MONTH_ABBR[month]} ${glyph}${lcdLevel(disc, level, datasets?.[disc.dataset])}`;
}

// ------------------------------------------------------------------ story card (pixel art of the place, first load)

/** The place's story for the card: the draft marker is dropped and the first letter is capitalised. */
export function storyText(place) {
  const t = String(place?.story ?? '').replace(/^Draft intro[^:]*:\s*/i, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** A new card for a place: it fades in, then fades away as the record starts to turn. */
export const newCard = (place) => ({ id: place.id, a: 0, t: 0, fading: false });

/**
 * Advance a card by dt seconds.
 * - appears over 0.3 s and starts fading the moment it is fully there (no hold), so it is gone after about 6 s
 * - the moment Play is pressed it finishes fading within 1.2 s, about when the needle lands and the record turns
 * - reduced motion: no fading at all, the card is shown for 2.5 s and cut away
 * @returns {boolean} true while the card should still be drawn
 */
export function stepCard(card, dt, { rm = false, playing = false } = {}) {
  card.t += dt;
  if (rm) { card.a = card.t < 2.5 ? 1 : 0; return card.a > 0; }
  if (!card.fading && card.a >= 1) card.fading = true;
  if (!card.fading) card.a = Math.min(1, card.a + dt / 0.3);
  else card.a = Math.max(0, card.a - dt / (playing ? 1.2 : 5.7));
  return !(card.fading && card.a <= 0.01);
}
