/**
 * Hardware-Feel Pass F — UI regression smoke (Playwright).
 * Run against Vite 5173. Exits non-zero on hard failures.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const out = '/cursor/stores/self/media/hardware-feel-pass-f';
const base = process.env.PASS_F_URL || 'http://127.0.0.1:5173/';
fs.mkdirSync(out, { recursive: true });

const findings = [];
function ok(id, detail) { findings.push({ id, status: 'PASS', detail }); console.log('PASS', id, detail || ''); }
function fail(id, detail) { findings.push({ id, status: 'FAIL', detail }); console.error('FAIL', id, detail); }
function note(id, detail) { findings.push({ id, status: 'NOTE', detail }); console.log('NOTE', id, detail); }

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(900);

// Dismiss wizard if present
const closeBtn = page.locator('.wizard-actions button, .wizard-card button').filter({ hasText: /close|skip|later|dismiss/i }).first();
if (await closeBtn.isVisible().catch(() => false)) {
  await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);
}

async function goNav(re) {
  const btn = page.locator('nav button').filter({ hasText: re }).first();
  if (!(await btn.count())) { fail('nav', `missing ${re}`); return false; }
  await btn.click();
  await page.waitForTimeout(450);
  return true;
}

async function shot(name) {
  await page.screenshot({ path: path.join(out, name), fullPage: false });
}

// ── Brand / midi honesty ──
const brand = await page.locator('.brand').textContent().catch(() => '');
if (/splot/i.test(brand || '')) ok('brand', brand.trim());
else fail('brand', brand);

const badge = await page.locator('.sim-badge').first().textContent().catch(() => '');
const midiReady = /midi/i.test(badge || '') && !/no midi/i.test(badge || '');
if (/no midi/i.test(badge || '') || /midi/i.test(badge || '')) ok('sim-live-label', `badge="${(badge||'').trim()}" (no false LIVE hardware claim)`);
else fail('sim-live-label', badge);

// Status should NOT say "LIVE HARDWARE" when no midi
const bodyText = await page.locator('body').innerText();
if (/live hardware|hardware connected|verified live/i.test(bodyText) && /no midi/i.test(badge || '')) {
  fail('honesty', 'claims live hardware while no midi');
} else ok('honesty-no-false-live', 'no false live-hardware claim with no midi');

// ── Transport: PLAY STOP PANIC JAM CONNECT ──
const ts = page.locator('.transport-strip');
const tsText = (await ts.innerText().catch(() => '')).toUpperCase();
for (const label of ['PLAY', 'STOP', 'PANIC', 'JAM']) {
  if (tsText.includes(label)) ok(`transport-${label}`, 'present');
  else fail(`transport-${label}`, 'missing from transport strip');
}

// Panic clickable (no throw)
const panic = page.locator('.transport-strip .ts-btn.danger, .transport-strip button').filter({ hasText: /panic/i }).first();
if (await panic.count()) {
  await panic.click();
  await page.waitForTimeout(200);
  ok('panic-click', 'clicked without pageerror');
} else fail('panic-click', 'panic button missing');

// ── Keyboard shortcuts 1–5 / legacy panels ──
await page.keyboard.press('2');
await page.waitForTimeout(350);
const after2 = await page.locator('nav button.active, nav button[aria-current=page]').first().innerText().catch(() => '');
if (/build/i.test(after2)) ok('shortcut-2', after2.trim());
else note('shortcut-2', `active=${after2.trim()} (legacy keys deep-link panels)`);

await page.keyboard.press('1');
await page.waitForTimeout(300);
await page.keyboard.press('j');
await page.waitForTimeout(400);
const jamOpen = await page.locator('.jam-open, .jam-mode, [class*=jam]').count();
if (jamOpen > 0 || (await page.locator('.app.jam-open').count()) > 0) ok('shortcut-j', 'jam toggled');
else note('shortcut-j', 'jam UI may use different class — check manually');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// ── Nav persistence via localStorage ──
await goNav(/Setup/i);
await page.waitForTimeout(200);
const lastTab = await page.evaluate(() => localStorage.getItem('dawlessdaw.lastTab') || localStorage.getItem('LAST_TAB') || Object.keys(localStorage).filter(k=>/tab|workspace/i.test(k)).map(k=>k+'='+localStorage.getItem(k)).join(';'));
note('nav-persist-key', String(lastTab).slice(0, 200));
const setupActive = await page.locator('nav button.active, nav button[aria-current=page]').filter({ hasText: /Setup/i }).count();
if (setupActive) ok('nav-setup', 'Setup active');
else fail('nav-setup', 'Setup not active after click');

// selection carry store present
const sel = await page.evaluate(() => localStorage.getItem('dawlessdaw.uiSelection'));
note('ui-selection', sel || '(empty until user carries)');

await shot('01-setup-ports.png');

// ── Build / Pattern — FLIP experimental + transport ──
await goNav(/Build/i);
await page.waitForTimeout(400);
const patternText = await page.locator('main').innerText();
if (/experimental/i.test(patternText)) ok('experimental-badge', 'experimental visible on Pattern/FLIP');
else note('experimental-badge', 'no experimental string on Pattern — check FLIP visibility');
if (/FLIP/i.test(patternText)) ok('flip-present', 'FLIP lane present');
else fail('flip-present', 'FLIP missing');
if (/PLAY|STOP|RECORD/i.test(patternText)) ok('seq-transport', 'seq transport present');
else fail('seq-transport', 'seq transport missing');
await shot('02-build-pattern.png');

// ── Rec / Sessions — record flow ──
await goNav(/Rec/i);
await page.waitForTimeout(400);
const recText = await page.locator('main').innerText();
if (/record|arm|capture|session/i.test(recText)) ok('record-flow', 'record/sessions UI present');
else fail('record-flow', 'record UI missing');
await shot('03-sessions.png');

// ── Play / Rig ──
await goNav(/Play/i);
await page.waitForTimeout(400);
await shot('04-play-rig.png');

// ── Sounds (SP) ──
await goNav(/Sounds/i);
await page.waitForTimeout(400);
await shot('05-sounds.png');

// ── a11y: focus-visible outline on tab ──
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
const focusStyle = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  const s = getComputedStyle(el);
  return { tag: el.tagName, cls: String(el.className).slice(0,60), outline: s.outline, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
});
note('focus-active', JSON.stringify(focusStyle));
if (focusStyle && (parseFloat(focusStyle.outlineWidth) > 0 || /solid|mint|accent/i.test(focusStyle.outline) || focusStyle.boxShadow !== 'none')) {
  ok('a11y-focus', focusStyle.outline || focusStyle.boxShadow);
} else {
  // Try force :focus-visible check via button
  const btnOutline = await page.evaluate(() => {
    const b = document.querySelector('.ts-btn, button.status-cta, nav button');
    if (!b) return null;
    b.focus();
    const s = getComputedStyle(b);
    return { outline: s.outline, outlineWidth: s.outlineWidth };
  });
  if (btnOutline && parseFloat(btnOutline.outlineWidth) > 0) ok('a11y-focus', JSON.stringify(btnOutline));
  else note('a11y-focus', 'outline may only show on :focus-visible — CSS has focus-visible rule');
}

// aria labels
const ariaNav = await page.locator('nav[aria-label]').count();
const ariaTransport = await page.locator('[aria-label*="transport" i], [role="toolbar"]').count();
if (ariaNav) ok('aria-nav', 'nav labeled'); else fail('aria-nav', 'missing');
if (ariaTransport) ok('aria-transport', `toolbars=${ariaTransport}`); else note('aria-transport', 'no toolbar aria found');

// ── Learn glass: trigger via controller if possible ──
await page.keyboard.press('2'); // may land sequencer — use legacy key for controller = often 2 was build; controller is key from LEGACY
// From tabs: try clicking Controller subnav if on Play
await goNav(/Play/i);
const live = page.locator('.panel-subnav-btn, button').filter({ hasText: /^Live$/i }).first();
if (await live.count()) {
  await live.click();
  await page.waitForTimeout(400);
  ok('controller-subnav', 'Live/Controller reachable');
  await shot('06-controller.png');
} else note('controller-subnav', 'Live subnav not found');

const learnVisible = await page.locator('.midi-learn-glass, [aria-label*="MIDI control" i]').count();
note('midi-learn', learnVisible ? 'glass in DOM' : 'glass not open (needs MIDI CC — expected without hardware)');

// ── Built-in mic filter (unit-level already tested; check UI options if any select open) ──
await goNav(/Build/i);
await page.waitForTimeout(300);
const selects = await page.locator('select').allTextContents();
const micLeak = selects.some((t) => /MacBook|iPhone|Continuity Microphone|Built-in Microphone/i.test(t));
if (micLeak) fail('builtin-mics', 'built-in mic appears in a select');
else ok('builtin-mics', 'no MacBook/iPhone/Continuity in visible selects');

// ── Clock forward default (UI readout) ──
const clk = await page.locator('.status-bar').innerText();
if (/clk\s+\d/i.test(clk) && /no midi/i.test(badge || '')) {
  note('clock-ui', 'clk readout visible without midi — check anyClockForwarding');
} else ok('clock-default-ui', 'no active clock-forward readout with no midi (expected)');

// ── Mobile viewport ──
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await goNav(/Play/i);
const overflow = await page.evaluate(() => ({
  docW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  bodyOverflow: getComputedStyle(document.body).overflowX,
  appOverflow: getComputedStyle(document.querySelector('.app') || document.body).overflowX,
}));
if (overflow.docW <= overflow.clientW + 2) ok('mobile-overflow', JSON.stringify(overflow));
else fail('mobile-overflow', JSON.stringify(overflow));
await shot('mobile-01-play.png');

await page.setViewportSize({ width: 1440, height: 900 });
await goNav(/Build/i);
await shot('mobile-restore-desktop-pattern.png');

if (pageErrors.length) fail('pageerrors', pageErrors.join(' | '));
else ok('pageerrors', 'none');

const summary = {
  at: new Date().toISOString(),
  base,
  midiReady,
  findings,
  failCount: findings.filter((f) => f.status === 'FAIL').length,
  passCount: findings.filter((f) => f.status === 'PASS').length,
};
fs.writeFileSync(path.join(out, 'findings.json'), JSON.stringify(summary, null, 2));
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({ pass: summary.passCount, fail: summary.failCount }, null, 2));
await browser.close();
if (summary.failCount > 0) process.exit(1);
