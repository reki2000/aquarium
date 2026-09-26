// Render the running dev server headlessly and save screenshots for visual checks.
// Usage: node scripts/screenshot.mjs [baseUrl] [outDir]   (npm run dev must be running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outDir = process.argv[3] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  // Optional: reuse an already-downloaded Chromium (e.g. CHROME_PATH=~/.cache/ms-playwright/chromium-XXXX/chrome-linux64/chrome).
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

// SHOT_QUERY appends URL params to every shot, e.g. SHOT_QUERY='quality=low&backend=webgl'.
const q = process.env.SHOT_QUERY ? `?${process.env.SHOT_QUERY}` : '';
const tag = process.env.SHOT_QUERY ? `-${process.env.SHOT_QUERY.replace(/[^a-z0-9]+/gi, '_')}` : '';
const shots = [
  { name: `overview${tag}`, query: q },
  { name: `macro${tag}`, query: q, setup: `window.__aqualium.view.follow = 3; window.__aqualium.setMode('follow');` },
];

const timeout = Number(process.env.SHOT_TIMEOUT ?? 180_000);
try {
  for (const shot of shots) {
    await page.goto(`${base}${shot.query}`);
    await page.waitForFunction(() => window.__aqualium?.debug?.ready, null, { timeout });
    if (shot.setup) await page.evaluate(shot.setup);
    await page.waitForFunction((n) => window.__aqualium.debug.frames > n, 40, { timeout });
    await page.screenshot({ path: `${outDir}/${shot.name}.png`, timeout });
    console.log(`saved ${outDir}/${shot.name}.png — ${await page.textContent('#status')}`);
  }
} catch (e) {
  await page.screenshot({ path: `${outDir}/failure.png` }).catch(() => {});
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  console.log([...new Set(logs)].slice(0, 60).join('\n'));
  await browser.close();
}
