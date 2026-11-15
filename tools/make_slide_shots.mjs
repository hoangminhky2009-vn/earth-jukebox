// Written by Ky with help from Claude (SI). See AI_USE.md.
// Takes the screenshots for the slides from the running page (it never changes the page): the front page, and one striking month
// of several discs. Needs Playwright with Chromium; run the site first (python -m http.server 8780 --directory docs).
// Usage: node tools/make_slide_shots.mjs [base url] [out folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = process.env.PLAYWRIGHT_CORE ?? 'C:/Users/ThinkPad T14/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core';
const { chromium } = require(root);
const BASE = process.argv[2] ?? 'http://localhost:8780/';
const OUT = process.argv[3] ?? 'slides';
const ONLY = process.argv.slice(4);   // optional: only the shots whose name starts with one of these
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1223/chrome-win64/chrome.exe`;

const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { localStorage.setItem('ej-tour-done', '1'); } catch { /* ignore */ } });
const page = await ctx.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

async function fresh() { await page.goto(BASE); await page.waitForSelector('.slot'); await sleep(1500); }

/** Put the disc matching `label` on the deck, play it, jump to month index `month` (0-11) and wait for the scene to settle. */
async function shot(name, label, month, settle = 9000) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o))) return;
  await fresh();
  for (let k = 0; k < 4; k++) {
    const slot = page.locator('.slot', { has: page.locator(`xpath=self::*`) }).filter({ hasText: '' });
    const found = await page.evaluate((l) => [...document.querySelectorAll('.slot')].some((b) => new RegExp(l).test(b.getAttribute('aria-label') ?? '')), label);
    if (found) break;
    await page.evaluate(() => document.querySelector('.page-btn')?.click()); await sleep(350);
  }
  await page.evaluate((l) => [...document.querySelectorAll('.slot')].find((b) => new RegExp(l).test(b.getAttribute('aria-label') ?? ''))?.click(), label);
  await sleep(1800);   // the story card shows the first time; it fades by itself
  await page.evaluate(() => [...document.querySelectorAll('button.hit')].find((x) => x.getAttribute('aria-label') === 'Play')?.click());
  await sleep(2600);
  for (let i = 0; i < month; i++) { await page.keyboard.press('ArrowRight'); await sleep(70); }
  await sleep(settle);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name, await page.evaluate(() => document.getElementById('lcd')?.textContent));
}

// 1. the front page, a disc waiting
await fresh(); await page.screenshot({ path: `${OUT}/01-front-page.png` }); console.log('saved 01-front-page');
// 2-7. striking months: [file name, disc, month keys pressed after the first bar, seconds to settle]. The record advances 2 s a month,
// and the plants and weather take a few seconds to build up, so the keys and the wait are chosen to land on the peak month.
await shot('02-hue-flood-nov', '^Hue, Rain 2025', 8, 4200);
await shot('03-amazon-rainforest', '^Amazon, Greenness 2024', 4, 4500);
await shot('04-alice-springs-desert', '^Alice Springs, Greenness 2024', 2, 6500);
await shot('05-tromso-snow-to-spring', '^Tromso, Greenness 2024', 0, 14500);
await shot('06-tonle-sap-mangrove', '^Tonle Sap, Greenness 2024', 0, 5500);
await shot('07-dhaka-delta', '^Dhaka, Greenness 2024', 8, 4500);
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
