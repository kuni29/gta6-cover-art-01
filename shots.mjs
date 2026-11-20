// Captures Neon Coast Cover Studio's screenshots with a stock headless Chrome.
// Starts the repo's static server, loads fixed ?shot= scenes, then saves:
//   1-cover.jpg  the app's real exported PNG (1920 x 1080), scaled to the gate's limits
//   2-editor.jpg the studio in a browser, photos loaded, panels framed
//   3-cover.jpg  a portrait cover the app draws at screenshot size
//   4-cover.jpg  a square full-bleed cover the app draws at screenshot size
// Run from the repo root: node shots.mjs
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const tools = join(process.env.HOME, 'workspace/makefun/token-radar-tools');
const require = createRequire(join(tools, 'package.json'));
const puppeteer = require('puppeteer-core');
const exe = join(tools, 'chrome/linux-157.0.8103.78/chrome-linux64/chrome');
const PORT = 8137;
const base = `http://localhost:${PORT}/`;
const shotsDir = join(here, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const server = spawn('node', [join(here, 'serve.ts'), '--port', String(PORT)], { stdio: 'ignore' });
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

function scene(params) {
  return new URLSearchParams(params).toString();
}

async function openScene(browser, params, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(`${base}?${scene(params)}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction('window.__shotReady === true', { timeout: 20000 });
  return page;
}

const WORDS = { kicker: 'Welcome to', caption: 'Neon Coast', subtitle: 'vice season', badge: 'Launch Week' };
let browser;
try {
  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });

  // 1 — the exported cover: the app's own PNG export at 1920 x 1080, scaled down with PIL.
  {
    const page = await openScene(browser, {
      shot: 'editor', layout: 'hero', grade: 'sunset', size: 'wide',
      photos: 'neon,boulevard,pier', pfy: '0,0.9,0.55,0', pzoom: '1,1.1,1.05,1', ...WORDS,
    }, { width: 1280, height: 800 });
    const dataUrl = await page.evaluate(() => window.neonCoast.exportDataURL());
    const pngPath = '/tmp/gta6-export-wide.png';
    writeFileSync(pngPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
im.resize((1280, 720), Image.LANCZOS).save(${JSON.stringify(join(shotsDir, '1-cover.jpg'))}, quality=82)
`]);
    await page.close();
    console.log('captured 1-cover.jpg (app export, scaled)');
  }

  // 2 — the editor with photos loaded.
  {
    const page = await openScene(browser, {
      shot: 'editor', layout: 'grid', grade: 'sunset', size: 'portrait',
      photos: 'neon,boulevard,pier', ...WORDS,
    }, { width: 1280, height: 800 });
    await page.screenshot({ path: join(shotsDir, '2-editor.jpg'), type: 'jpeg', quality: 82 });
    await page.close();
    console.log('captured 2-editor.jpg');
  }

  // 3 — a portrait cover, drawn by the app at 1024 x 1280.
  {
    const page = await openScene(browser, {
      shot: 'cover', layout: 'grid', grade: 'sunset', size: 'portrait',
      photos: 'neon,boulevard,pier', ...WORDS,
    }, { width: 1024, height: 1280 });
    await page.evaluate(() => window.neonCoast.renderAt(1024, 1280));
    await new Promise((r) => setTimeout(r, 150));
    await page.screenshot({ path: join(shotsDir, '3-cover.jpg'), type: 'jpeg', quality: 82 });
    await page.close();
    console.log('captured 3-cover.jpg');
  }

  // 4 — a square full-bleed cover, drawn by the app at 1024 x 1024.
  {
    const page = await openScene(browser, {
      shot: 'cover', layout: 'full', grade: 'neon', size: 'square', photos: 'neon',
      kicker: 'Welcome to', caption: 'Neon Nights', subtitle: 'after dark', badge: 'Launch Week',
    }, { width: 1024, height: 1024 });
    await page.evaluate(() => window.neonCoast.renderAt(1024, 1024));
    await new Promise((r) => setTimeout(r, 150));
    await page.screenshot({ path: join(shotsDir, '4-cover.jpg'), type: 'jpeg', quality: 82 });
    await page.close();
    console.log('captured 4-cover.jpg');
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}

for (const name of ['1-cover.jpg', '2-editor.jpg', '3-cover.jpg', '4-cover.jpg']) {
  const p = join(shotsDir, name);
  console.log(name, statSync(p).size, 'bytes');
}
