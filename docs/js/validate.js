// Written by Ky with help from Claude (SI). See AI_USE.md.
// Checks a discs.json object against the "Validation rules" in notes/03_json.md. Pure logic, no DOM.

const MONTHLY = ['levels', 'values', 'saturated', 'frames_used'];
const CONDITIONS = ['mint', 'scratched', 'skips'];

/** NDVI quarter level (1–4) for a colour-scale position 0–1. */
export function ndviLevel(v) {
  if (v < 0.25) return 1;
  if (v < 0.5) return 2;
  if (v < 0.75) return 3;
  return 4;
}

/** Condition the rules expect: breaks ⇒ skips, else any missing month ⇒ scratched, else mint. */
export function expectedCondition(disc) {
  if (Array.isArray(disc.breaks) && disc.breaks.length > 0) return 'skips';
  if (Array.isArray(disc.levels) && disc.levels.some((x) => x === null)) return 'scratched';
  return 'mint';
}

/**
 * Validate a parsed discs.json object.
 * @returns {string[]} English error messages naming the disc id and month; empty when valid.
 */
export function validate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['File is not a JSON object'];
  if (!Array.isArray(data.places)) errors.push('Missing "places" array');
  if (!Array.isArray(data.discs)) errors.push('Missing "discs" array');
  if (errors.length) return errors;

  const placeIds = new Set(data.places.map((p) => p.id));
  const rainValue = new Map((data.datasets?.rain?.levels ?? []).map((r) => [r.level, r.value]));
  const seenIds = new Set();
  const pairYears = new Map(); // "place|dataset" -> years seen

  for (const disc of data.discs) {
    const id = disc.id ?? '(no id)';

    if (seenIds.has(id)) errors.push(`${id}: duplicate disc id`);
    seenIds.add(id);

    if (!placeIds.has(disc.place)) errors.push(`${id}: place "${disc.place}" does not exist`);

    if (!['rain', 'ndvi', 'snow'].includes(disc.dataset)) {
      errors.push(`${id}: unknown dataset "${disc.dataset}"`);
      continue;
    }

    const key = `${disc.place}|${disc.dataset}`;
    const years = pairYears.get(key) ?? [];
    if (years.includes(disc.year)) errors.push(`${id}: another ${disc.dataset} disc for "${disc.place}" has the same year ${disc.year}`);
    pairYears.set(key, [...years, disc.year]);

    if (!CONDITIONS.includes(disc.condition)) {
      errors.push(`${id}: unknown condition "${disc.condition}"`);
    }

    const badLength = MONTHLY.filter((f) => !Array.isArray(disc[f]) || disc[f].length !== 12);
    if (badLength.length) {
      for (const f of badLength) errors.push(`${id}: "${f}" must have exactly 12 months`);
      continue; // month-by-month checks would only repeat the same problem
    }

    for (let i = 0; i < 12; i++) {
      const m = `month ${i + 1}`;
      const level = disc.levels[i];
      const value = disc.values[i];
      const sat = disc.saturated[i];

      if (level === null || value === null) {
        if (level !== null || value !== null) errors.push(`${id}, ${m}: level and value must both be null`);
        if (sat !== false) errors.push(`${id}, ${m}: a missing month must have saturated = false`);
        continue;
      }

      if (disc.dataset === 'rain') {
        if (!Number.isInteger(level) || level < -4 || level > 4) {
          errors.push(`${id}, ${m}: rain level ${level} is outside −4…4`);
          continue;
        }
        if (value !== rainValue.get(level)) errors.push(`${id}, ${m}: value ${value} does not match level ${level} (expected ${rainValue.get(level)})`);
        if (sat !== (Math.abs(level) === 4)) errors.push(`${id}, ${m}: saturated must be ${Math.abs(level) === 4}`);
      } else {
        if (typeof value !== 'number' || value < 0 || value > 1) {
          errors.push(`${id}, ${m}: ${disc.dataset} value ${value} is outside 0–1`);
          continue;
        }
        if (level !== ndviLevel(value)) errors.push(`${id}, ${m}: level ${level} does not match value ${value} (expected ${ndviLevel(value)})`);
        const expectSat = value <= 0.02 || value >= 0.98;
        if (sat !== expectSat) errors.push(`${id}, ${m}: saturated must be ${expectSat}`);
      }
    }

    if (CONDITIONS.includes(disc.condition) && disc.condition !== expectedCondition(disc)) {
      errors.push(`${id}: condition "${disc.condition}" should be "${expectedCondition(disc)}"`);
    }
  }
  return errors;
}
