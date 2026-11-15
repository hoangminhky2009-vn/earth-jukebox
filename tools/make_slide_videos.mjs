// Written by Ky with help from Claude (SI). See AI_USE.md.
// Records short silent screen clips of the running page for the demo (it never changes the page): a disc is put on the deck and played
// for its full year (24 s), through to the disc going back on the shelf. Clips are .webm, then ffmpeg makes .mp4 (H.264).
// No sound is recorded (the music is made live in the browser): record the sound with a screen recorder if the demo needs it.
// Usage: node tools/make_slide_videos.mjs [base url] [out folder] [clip name prefixes to record...]
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = process.env.PLAYWRIGHT_CORE ?? 'C:/Users/ThinkPad T14/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core';
const { chromium } = require(root);
const BASE = process.argv[2] ?? 'http://localhost:8780/';
const OUT = process.argv[3] ?? 'slides/video';
const ONLY = process.argv.slice(4);
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1223/chrome-win64/chrome.exe`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });

/** One clip: `label` is the disc's accessible name (a regex source), or null to use the "Hear a sample year" button. */
async function clip(name, label, seconds = 27) {
  if (ONLY.length && !ONLY.some((o) => name.startsWith(o))) return;
  const tmp = `${OUT}/_tmp`; rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: tmp, size: { width: 1280, height: 720 } } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ej-tour-done', '1'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  await page.goto(BASE); await page.waitForSelector('.slot'); await sleep(1800);
  if (label) {
    for (let k = 0; k < 4; k++) {
      if (await page.evaluate((l) => [...document.querySelectorAll('.slot')].some((b) => new RegExp(l).test(b.getAttribute('aria-label') ?? '')), label)) break;
      await page.evaluate(() => document.querySelector('.page-btn')?.click()); await sleep(400);
    }
    await page.evaluate((l) => [...document.querySelectorAll('.slot')].find((b) => new RegExp(l).test(b.getAttribute('aria-label') ?? ''))?.click(), label);
    await sleep(2200);   // the disc drops onto the deck and the story card shows (first time for each place)
    await page.evaluate(() => [...document.querySelectorAll('button.hit')].find((x) => x.getAttribute('aria-label') === 'Play')?.click());
  } else {
    await page.click('#sample-btn');
  }
  await sleep(seconds * 1000);
  await ctx.close();   // flushes the video
  const f = readdirSync(tmp).find((x) => x.endsWith('.webm'));
  renameSync(`${tmp}/${f}`, `${OUT}/${name}.webm`); rmSync(tmp, { recursive: true, force: true });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1.0', '-i', `${OUT}/${name}.webm`, '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}/${name}.mp4`]);
  console.log('saved', name, r.status === 0 ? '(mp4 ok)' : `(ffmpeg failed: ${r.stderr})`);
}

await clip('01-sample-year-hue-floods', null, 28);
await clip('02-tromso-snow-to-spring', '^Tromso, Greenness 2024');
await clip('03-amazon-rainforest-grows', '^Amazon, Greenness 2024');
await clip('04-alice-springs-desert', '^Alice Springs, Greenness 2024');
await clip('05-tonle-sap-mangrove', '^Tonle Sap, Greenness 2024');
await browser.close();
