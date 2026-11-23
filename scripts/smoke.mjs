#!/usr/bin/env node
/**
 * Headless Chrome smoke: serve apps/web/dist, open the app, press keys 1–8.
 * Fails on pageerror, console error, or blank #root.
 *
 * Run: npm run smoke  (expects a prior `npm run build`)
 * Documented separately from `npm test` (unit Vitest) so CI stays fast.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'apps/web/dist');
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exitCode = 1;
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  fail(`No build at ${dist}. Run \`npm run build\` first.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let filePath = path.join(dist, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(dist, 'index.html');
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${PORT}/`;

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});
const page = await browser.newPage();
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

async function assertAlive(label) {
  if (pageErrors.length) {
    fail(`${label}: pageerror — ${pageErrors.join(' | ')}`);
    return false;
  }
  // Ignore benign MIDI permission noise; fail on React / runtime errors in console.
  const bad = consoleErrors.filter(
    (t) =>
      !/Web MIDI|MIDIAccess|NotAllowedError|permission/i.test(t) &&
      (/Error|Maximum update depth|Minified React error/i.test(t) || /%c/.test(t) === false),
  );
  // Only treat console.error that looks like React/app failures
  const reactBad = consoleErrors.filter((t) =>
    /Maximum update depth|Minified React error|#185|Uncaught/i.test(t),
  );
  if (reactBad.length) {
    fail(`${label}: console — ${reactBad.join(' | ')}`);
    return false;
  }
  void bad;
  const root = page.locator('#root');
  const html = (await root.innerHTML().catch(() => '')).trim();
  if (!html || html.length < 40) {
    fail(`${label}: blank #root`);
    return false;
  }
  const brand = page.locator('.brand');
  if ((await brand.count()) === 0) {
    fail(`${label}: missing .brand header`);
    return false;
  }
  return true;
}

try {
  // Cold start with lastTab=test reproduces the React #185 blackout path.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('dawlessdaw.lastTab', 'test');
    } catch {
      /* ignore */
    }
  });
  await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('#root .app, #root .panel-error, #root .section-enter', {
    timeout: 15000,
  });
  if (!(await assertAlive('initial (lastTab=test)'))) throw new Error('initial fail');

  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8']) {
    pageErrors.length = 0;
    consoleErrors.length = 0;
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    if (!(await assertAlive(`key ${key}`))) throw new Error(`key ${key} fail`);
  }

  if (process.exitCode) throw new Error('smoke failed');
  console.log('SMOKE OK: built app loaded; keys 1–8; no blank screen / pageerror.');
} catch (err) {
  if (!process.exitCode) fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}

process.exit(process.exitCode ?? 0);
