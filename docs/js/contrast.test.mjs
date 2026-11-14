// Written by Ky with help from Claude (SI). See AI_USE.md.
// Reads the colour tokens declared in tokens.css and checks WCAG contrast of the text/background pairs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');

/** Variables declared in the first block whose selector is exactly `selector`. */
function vars(selector) {
  const esc = selector.replace('.', String.raw`\.`);
  const m = css.match(new RegExp(String.raw`(?:^|\n)${esc}\s*\{([^}]*)\}`));
  assert.ok(m, `${selector} block not found in tokens.css`);
  const out = {};
  for (const [, name, value] of m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim();
  return out;
}
const hex = (v) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v ?? '');
  assert.ok(m, `colour "${v}" is not a #rgb or #rrggbb value`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function ratio(a, b) {
  const [hi, lo] = [lum(hex(a)), lum(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground variable, background variable, minimum ratio]: main text 7:1, other text 4.5:1.
const PAIRS = [
  // main text: 7:1 on the page, the dark-wood dialog, the inset boxes and the slate hover face
  ['text-body', 'bg-page', 7], ['text-body', 'bg-panel-solid', 7], ['text-body', 'surface-inset-solid', 7],
  ['text-max', 'bg-panel-solid', 7], ['text-max', 'surface-inset-solid', 7], ['text-bright', 'accent-wash-solid', 7],
  ['btn-text', 'btn-face', 7], ['lcd-fg', 'lcd-bg', 7],
  // other text: 4.5:1
  ['text-muted', 'bg-page', 4.5], ['text-muted', 'bg-panel-solid', 4.5], ['text-muted', 'surface-inset-solid', 4.5],
  ['accent', 'bg-page', 4.5], ['accent', 'bg-panel-solid', 4.5], ['accent', 'surface-inset-solid', 4.5], ['accent-bright', 'bg-panel-solid', 4.5],
  ['win', 'bg-panel-solid', 4.5], ['gold-flame', 'bg-panel-solid', 4.5], ['teal', 'bg-panel-solid', 4.5],
  ['violet-soft', 'bg-panel-solid', 4.5], ['focus', 'bg-page', 4.5], ['focus', 'bg-panel-solid', 4.5],
];

for (const [label, selector] of [['default theme', ':root'], ['high-contrast theme', '.high-contrast']]) {
  test(`contrast: ${label}`, () => {
    const v = { ...vars(':root'), ...(selector === ':root' ? {} : vars(selector)) };
    for (const [fg, bg, min] of PAIRS) {
      const r = ratio(v[fg], v[bg]);
      console.log(`  ${label}: ${fg} on ${bg} = ${r.toFixed(2)}:1 (need ${min})`);
      assert.ok(r >= min, `${label}: --${fg} ${v[fg]} on --${bg} ${v[bg]} is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  });
}

test('contrast: ratio helper matches known values', () => {
  assert.ok(Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(ratio('#777777', '#ffffff') - 4.48) < 0.02);
});
