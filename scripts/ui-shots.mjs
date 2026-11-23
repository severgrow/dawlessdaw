import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || '/cursor/stores/self/media/ui-ux-polish';
const tag = process.argv[3] || 'before';
const base = process.argv[4] || 'http://127.0.0.1:5173/';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

// Dismiss connect wizard if present so chrome is visible
const closeBtn = page.locator('.wizard-actions button').filter({ hasText: /close/i }).first();
if (await closeBtn.isVisible().catch(() => false)) {
  await closeBtn.click();
  await page.waitForTimeout(300);
}

async function shot(name) {
  const file = path.join(out, `${name}-${tag}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

await shot('play-rig');

// Transport / jam
const jam = page.locator('.ts-btn.jam');
if (await jam.isVisible().catch(() => false)) {
  await jam.click();
  await page.waitForTimeout(400);
  await shot('jam');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// Nav top tabs by label
async function clickNav(label) {
  await page.locator('nav.nav button').filter({ hasText: new RegExp(`^\\s*\\d?\\s*${label}`, 'i') }).first().click();
  await page.waitForTimeout(450);
}

await clickNav('Play');
// subnav controller
const live = page.locator('.panel-subnav-btn').filter({ hasText: /controller/i });
if (await live.isVisible().catch(() => false)) {
  await live.click();
  await page.waitForTimeout(400);
  await shot('play-controller');
}

await clickNav('Build');
await shot('build-pattern');
const circuit = page.locator('.panel-subnav-btn').filter({ hasText: /^Circuit$/i });
if (await circuit.isVisible().catch(() => false)) {
  await circuit.click();
  await page.waitForTimeout(400);
  await shot('build-circuit');
}

await clickNav('Sounds');
await shot('sounds');

await clickNav('Record');
await shot('record-sessions');

await clickNav('Settings');
await shot('settings-ports');
const timing = page.locator('.panel-subnav-btn').filter({ hasText: /Timing/i });
if (await timing.isVisible().catch(() => false)) {
  await timing.click();
  await page.waitForTimeout(400);
  await shot('settings-timing');
}

// Re-open wizard from Settings
await clickNav('Settings');
const reconnect = page.getByRole('button', { name: /Connect guide|Connect your rig/i }).first();
if (await reconnect.isVisible().catch(() => false)) {
  await reconnect.click();
  await page.waitForTimeout(450);
}
if (await page.locator('.wizard-card').isVisible().catch(() => false)) {
  await shot('connect-wizard');
}

await browser.close();
console.log('done', tag);
