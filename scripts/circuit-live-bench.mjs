import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const PERIOD = 60_000 / (110 * 24);
const LOOP_MS = PERIOD * 384;
const origin = 'http://127.0.0.1:5186';
const dist = new URL('../apps/web/dist/', import.meta.url);
const noteEvents = [
  [0, [0x90, 36, 111]], [3, [0x80, 36, 0]],
  [13.4, [0x96, 60, 72]], [16.4, [0x86, 60, 0]],
  [48, [0x90, 36, 96]], [51, [0x80, 36, 0]],
  [300, [0x94, 43, 103]], // No release until the captured loop ends.
];
const expected = [
  ['mpc', [0x98, 36, 111]],
  ['mpc', [0x88, 36, 0]],
  ['sp', [0x90, 36, 72]],
  ['sp', [0x80, 36, 0]],
  ['mpc', [0x98, 36, 96]],
  ['mpc', [0x88, 36, 0]],
  ['fm1', [0x90, 43, 103]],
];

const browser = await chromium.launch({
  executablePath: process.env.SPLOT_CHROMIUM,
  args: ['--no-sandbox'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.route(`${origin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const asset = new URL(pathname === '/' ? 'index.html' : pathname.slice(1), dist);
    await route.fulfill({ path: fileURLToPath(asset) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('dawlessdaw.connectWizard.dismissed', '1');
    window.sent = [];
    const makePort = (id, name, type) => ({
      id, name, type, state: 'connected', connection: 'open',
      open: async () => {},
      send(bytes) {
        if (this.state === 'disconnected') throw new DOMException('Disconnected', 'InvalidStateError');
        window.sent.push([id, [...bytes], performance.now()]);
      },
    });
    const input = makePort('circuit', 'Circuit Rhythm MIDI In', 'input');
    const outputs = new Map([
      ['mpc', makePort('mpc', 'MPC One', 'output')],
      ['fm1', makePort('fm1', 'Felucca', 'output')],
      ['sp', makePort('sp', 'SP-404MKII', 'output')],
    ]);
    const access = { inputs: new Map([[input.id, input]]), outputs, onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access });
    window.emitMidi = (data, timeStamp = performance.now()) => input.onmidimessage({ data, timeStamp });
    window.portState = (id, state) => {
      outputs.get(id).state = state;
      access.onstatechange(new Event('statechange'));
    };
  });

  const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
  const button = (name) => page.getByRole('button', { name, exact: true }).click();
  const clear = () => page.evaluate(() => { window.sent.length = 0; });
  const sent = () => page.evaluate(() => window.sent);
  const midi = (data) => page.evaluate((bytes) => window.emitMidi(bytes), data);
  const setPort = (id, state) => page.evaluate(([port, next]) => window.portState(port, next), [id, state]);
  const fixture = async (dropout = 0) => {
    await page.evaluate(({ notes, period, dropout }) => {
      const base = performance.now() + 20;
      const schedule = (time, bytes) => setTimeout(() => window.emitMidi(bytes, base + time), 20 + Math.ceil(time));
      schedule(-1, [0xfa]);
      const timeFor = (tick) => tick * period + (tick >= 200 ? dropout : 0);
      for (let tick = 0; tick <= 384; tick++) schedule(timeFor(tick), [0xf8]);
      for (const [tick, data] of notes) schedule(timeFor(tick), data);
    }, { notes: noteEvents, period: PERIOD, dropout });
    await page.clock.runFor(Math.ceil(LOOP_MS) + 40 + dropout);
  };

  await page.goto(origin);
  await page.getByRole('button', { name: '3 outputs routed' }).waitFor();
  await tab('Live');
  await page.getByRole('option', { name: /T1.*MPC.*ch 9/ }).waitFor();

  await fixture(350);
  await button('Capture take');
  await page.getByText('Clock was interrupted. Capture again after a continuous take.', { exact: true }).waitFor();
  await midi([0xfc]);
  await clear();

  await fixture();
  const live = await sent();
  assert.deepEqual(live.map(([port, data]) => [port, data]), expected);
  for (let i = 0; i < live.length; i++) {
    assert(Math.abs(live[i][2] - live[0][2] - noteEvents[i][0] * PERIOD) < 2);
  }
  await page.getByRole('status', { name: /110 BPM · Circuit/ }).waitFor();
  await button('Capture take');
  await page.getByText(/4 bars · 3 of 8 lanes · 110 BPM/).waitFor();
  await button('Loop take');
  await page.getByText('Stop Circuit before looping the take.', { exact: true }).waitFor();
  await midi([0xfc]);

  await clear();
  await button('Loop take');
  await page.getByRole('region', { name: 'Transport', exact: true }).getByRole('status', { name: '110 BPM · SPLOT · Looping' }).waitFor();
  const first = (await sent()).find(([, data]) => data[0] === 0x98)[2];
  // Incoming pad strikes must remain silent while replay owns the routes.
  await midi([0x90, 99, 90]);
  await tab('Rig');
  await page.getByRole('region', { name: 'Transport', exact: true }).getByRole('status', { name: '110 BPM · SPLOT · Looping' }).waitFor();
  await tab('Live');
  await page.clock.runFor(Math.ceil(LOOP_MS) + 12);
  const allReplay = await sent();
  assert.deepEqual(allReplay[0].slice(0, 2), ['fm1', [0x80, 43, 0]]);
  const replay = allReplay.slice(1, expected.length + 3);
  assert.deepEqual(replay.map(([port, data]) => [port, data]), [
    ...expected, ['fm1', [0x80, 43, 0]], expected[0],
  ]);
  for (let i = 0; i < expected.length; i++) {
    assert(Math.abs(replay[i][2] - first - noteEvents[i][0] * PERIOD) <= 5);
  }
  assert(Math.abs(replay.at(-1)[2] - first - LOOP_MS) <= 5);
  assert.equal(replay.at(-2)[2], replay.at(-1)[2]);
  await button('Stop loop');
  await clear();
  await button('Loop take');
  await page.clock.runFor(Math.ceil(300 * PERIOD) + 20);
  assert.deepEqual((await sent()).at(-1).slice(0, 2), ['fm1', [0x90, 43, 103]]);
  await button('Stop loop');
  assert.deepEqual((await sent()).at(-1).slice(0, 2), ['fm1', [0x80, 43, 0]]);

  await clear();
  await button('Loop take');
  await setPort('sp', 'disconnected');
  await page.getByText('Song stopped. MIDI routes changed.', { exact: true }).waitFor();
  await page.clock.runFor(500);
  assert.deepEqual((await sent()).map(([port, data]) => [port, data]), [expected[0], expected[1]]);
  await setPort('sp', 'connected');
  await page.getByRole('option', { name: /T7.*SP.*ch 1/ }).waitFor();
  await button('Loop take');
  await midi([0xfa]);
  await page.getByText('Song stopped. Circuit transport is live.', { exact: true }).waitFor();
  await midi([0xfc]);
  await page.clock.runFor(3000);
  await page.getByRole('status', { name: /Clock lost/ }).waitFor();

  await tab('Setup');
  await tab('Tests');
  await page.getByText(/note-ons received.*sent.*worst since reset/).waitFor();
  const downloading = page.waitForEvent('download');
  await button('Export results');
  const report = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
  assert.equal(report.midiSendTiming.session.received, 9);
  assert.equal(report.midiSendTiming.session.live.sends, 8);
  assert(report.midiSendTiming.session.worstSends.song.delayMs <= 5);
  assert.deepEqual(errors, []);
  console.log('Circuit live bench passed: 110 BPM, three routes, preserved groove, clean wrap, stop, hot-plug, and timing export.');
} finally {
  await browser.close();
}
