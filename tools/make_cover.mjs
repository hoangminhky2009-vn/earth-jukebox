// Written by Ky with help from Claude (SI). See AI_USE.md.
// Takes the cover art from cover/cover.html the way Delphi made its itch cover: a screenshot of a title screen built from code,
// 630 x 500 at 2x (1260 x 1000), plus a 16:9 one (1280 x 720 at 2x). Needs Playwright with Chromium and internet (the font).
// Usage: node tools/make_cover.mjs [out folder]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.env.PLAYWRIGHT_CORE ?? 'C:/Users/ThinkPad T14/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright-core';
const { chromium } = require(root);
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? path.join(here, '..', 'cover');
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME ?? `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1223/chrome-win64/chrome.exe`;
const browser = await chromium.launch({ executablePath: exe, args: ['--allow-file-access-from-files'] });
// two covers: the title screen (cover.html) and the intro cover with the product itself (cover-product.html, the itch.io kind)
for (const [file, prefix] of [['cover-product.html', 'cover-intro'], ['cover.html', 'cover-title']]) {
  const url = pathToFileURL(path.join(here, '..', 'cover', file)).href;
  for (const [name, w, h] of [[`${prefix}-630x500`, 630, 500], [`${prefix}-16x9`, 1280, 720]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto(url); await page.waitForSelector('body[data-ready="1"]'); await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(OUT, `${name}.png`) }); await page.close(); console.log('saved', name);
  }
}
await browser.close();
