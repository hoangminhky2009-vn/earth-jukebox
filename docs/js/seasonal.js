// Pure calendar comparisons. Category differences are not physical-unit differences.
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const DATASET_NAMES = { rain: 'Rain compared with normal', ndvi: 'Vegetation greenness' };
export const categoryPitch = (dataset, level) => {
  if (!Number.isInteger(level)) return null;
  if (dataset === 'rain' && level >= -4 && level <= 4) return 60 + 2 * level;
  if (dataset === 'ndvi' && level >= 1 && level <= 4) return 60 + 4 * (level - 1);
  return null;
};
export function noteName(pitch) {
  if (pitch === null) return 'Silence';
  return `${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}
export const availableYears = (discs, place, dataset) => [...new Set(discs.filter(d => d.place === place && d.dataset === dataset).map(d => d.year))].sort((a,b) => a-b);
export const sharedYears = (discs, place) => availableYears(discs,place,'rain').filter(y => availableYears(discs,place,'ndvi').includes(y));
export const usable = (disc, month) => Boolean(disc && categoryPitch(disc.dataset, disc.levels?.[month]) !== null && !disc.breaks?.includes(month + 1));

export function compareMonths(a, b) {
  if (!a || !b || a.dataset !== b.dataset) throw new Error('Comparisons require the same dataset.');
  const counts = { compared: 0, changed: 0, higher: 0, lower: 0, same: 0, unavailable: 0 };
  const months = MONTHS.map((name, month) => {
    const valid = usable(a,month) && usable(b,month);
    const delta = valid ? b.levels[month] - a.levels[month] : null;
    const status = !valid ? 'unavailable' : delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'same';
    if (valid) { counts.compared++; counts[status]++; if (delta) counts.changed++; }
    else counts.unavailable++;
    return { month, name, delta, status, a: a.levels?.[month] ?? null, b: b.levels?.[month] ?? null };
  });
  return { months, counts };
}

export function differenceText(row, dataset) {
  if (row.status === 'unavailable') return 'Comparison unavailable';
  if (row.status === 'same') return 'Same category';
  const direction = dataset === 'rain' ? (row.delta > 0 ? 'wetter' : 'drier') : (row.delta > 0 ? 'greener' : 'less green');
  return `B is ${Math.abs(row.delta)} ${Math.abs(row.delta) === 1 ? 'category' : 'categories'} ${direction}`;
}

/** Each month lasts two seconds. Comparisons alternate A then B; duets start both together. */
export function buildPlan(a, b, { duet = false, changesOnly = false, month = null } = {}) {
  if (!a || !b) throw new Error('Choose two available records.');
  if (duet && (a.place !== b.place || a.year !== b.year || a.dataset !== 'rain' || b.dataset !== 'ndvi')) {
    throw new Error('A duet requires rain and greenness for the same place and year.');
  }
  if (!duet && a.dataset !== b.dataset) throw new Error('Comparisons require the same dataset.');
  const comparison = duet ? null : compareMonths(a,b);
  const selected = MONTHS.map((_,m) => m).filter(m => (month === null || m === month) &&
    (duet || !changesOnly || (comparison.months[m].delta !== null && comparison.months[m].delta !== 0)));
  const slots = selected.map((m,i) => ({ month: m, at: i * 2, status: duet ? 'duet' : comparison.months[m].status }));
  const events = slots.flatMap(slot => [a,b].flatMap((disc,track) => {
    if ((!duet && slot.status === 'unavailable') || !usable(disc, slot.month)) return [];
    return [{ month: slot.month, track, at: slot.at + (duet ? 0 : track), duration: duet ? 1.65 : 0.76,
      pitch: categoryPitch(disc.dataset, disc.levels[slot.month]), dataset: disc.dataset, level: disc.levels[slot.month] }];
  }));
  return { slots, events, duration: slots.length * 2, duet };
}
