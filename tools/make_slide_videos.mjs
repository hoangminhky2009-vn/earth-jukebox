// Written by Ky with help from Claude (SI). See AI_USE.md.
// Records short screen clips (with sound) of the running page for the demo (it never changes the page): a disc is put on the deck and played
// for its full year (24 s), through to the disc going back on the shelf. Clips are .webm, then ffmpeg makes .mp4 (H.264).
// The sound is captured from the page itself: everything the page sends to the speakers is also sent to a MediaRecorder (the music
// is made live in the browser), then ffmpeg puts that sound under the picture, lined up by the time the recorder started.
// Usage: node tools/make_slide_videos.mjs [base url] [out folder] [clip name prefixes to record...]
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  // capture the page's sound: anything connected to a speaker (AudioDestinationNode) is also connected to a MediaStreamDestination
  await ctx.addInitScript(() => {
    window.__recs = [];
    const orig = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = orig.call(this, dest, ...rest);
      if (dest instanceof AudioDestinationNode) {
        const ac = dest.context;
        if (!ac.__rec) {
          const md = ac.createMediaStreamDestination(); ac.__rec = md;
          const mr = new MediaRecorder(md.stream, { mimeType: 'audio/webm;codecs=opus' }); const chunks = [];
          mr.ondataavailable = (e) => chunks.push(e.data); mr.start(250);
          window.__recs.push({ mr, chunks, t0: Date.now() });
        }
        orig.call(this, ac.__rec);
      }
      return r;
    };
    window.__stopRec = async () => {
      const out = [];
      for (const r of window.__recs) {
        await new Promise((res) => { r.mr.onstop = res; r.mr.stop(); });
        const blob = new Blob(r.chunks, { type: 'audio/webm' }); const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        out.push({ t0: r.t0, b64: btoa(bin) });
      }
      return out;
    };
  });
  const tVideo = Date.now();
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
  const recs = await page.evaluate(() => window.__stopRec());
  await ctx.close();   // flushes the video
  const f = readdirSync(tmp).find((x) => x.endsWith('.webm'));
  renameSync(`${tmp}/${f}`, `${OUT}/${name}.webm`); rmSync(tmp, { recursive: true, force: true });
  const args = ['-v', 'error', '-y', '-i', `${OUT}/${name}.webm`];
  let filter = '';
  recs.forEach((rc, i) => { writeFileSync(`${OUT}/${name}.audio${i}.webm`, Buffer.from(rc.b64, 'base64')); args.push('-i', `${OUT}/${name}.audio${i}.webm`);
    const delay = Math.max(0, rc.t0 - tVideo); filter += `[${i + 1}:a]adelay=${delay}|${delay}[a${i}];`; });
  if (recs.length) { filter += recs.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${recs.length}:normalize=0[aout]`; args.push('-filter_complex', filter, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '160k'); }
  args.push('-ss', '1.0', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}/${name}.mp4`);
  const r = spawnSync('ffmpeg', args);
  for (let i = 0; i < recs.length; i++) rmSync(`${OUT}/${name}.audio${i}.webm`, { force: true });
  console.log('saved', name, `sound tracks: ${recs.length}`, r.status === 0 ? '(mp4 ok)' : `(ffmpeg failed: ${r.stderr})`);
}

await clip('01-sample-year-hue-floods', null, 28);
await clip('02-tromso-snow-to-spring', '^Tromso, Greenness 2024');
await clip('03-amazon-rainforest-grows', '^Amazon, Greenness 2024');
await clip('04-alice-springs-desert', '^Alice Springs, Greenness 2024');
await clip('05-tonle-sap-mangrove', '^Tonle Sap, Greenness 2024');
await browser.close();
