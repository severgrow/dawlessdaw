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
  await button('Capture last');
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
  await button('Capture last');
  await page.getByText(/4 bars · 3 of 8 lanes · 110 BPM/).waitFor();
  assert(await page.getByRole('button', { name: 'Loop take', exact: true }).isDisabled());
  await page.getByText(/Take ready · Stop Circuit to loop/).waitFor();
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
  await page.getByText('Circuit Tracks MIDI preview', { exact: true }).click();
  await midi([0x93, 57, 90]);
  await midi([0x99, 60, 100]);
  await midi([0x99, 65, 80]);
  const monitor = page.locator('.tracks-monitor');
  await monitor.getByRole('row', { name: /MIDI 2 4 57 90/ }).waitFor();
  await monitor.getByRole('row', { name: /Drums 1–4 · Shared 10 60 100/ }).waitFor();
  await monitor.getByRole('row', { name: /Drums 1–4 · Shared 10 65 80/ }).waitFor();
  await monitor.getByRole('combobox', { name: 'Channel' }).selectOption('10');
  assert.equal(await monitor.locator('tbody tr').count(), 2);
  await monitor.getByRole('button', { name: 'Freeze', exact: true }).click();
  await midi([0x99, 66, 91]);
  assert.equal(await monitor.locator('tbody tr').count(), 2);
  await monitor.getByRole('button', { name: 'Resume', exact: true }).click();
  await monitor.getByRole('row', { name: /Drums 1–4 · Shared 10 66 91/ }).waitFor();
  await monitor.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(await monitor.locator('tbody tr').count(), 0);
  assert.equal(typeof report.midiSendTiming.session.p95Ms.song, 'number');
  assert.equal(report.midiSendTiming.session.heldNotesAtExport, 0);

  await tab('Play');
  await tab('Live');
  await page.getByRole('textbox', { name: 'Part name' }).fill('Break A');
  await button('Keep as Part');
  await page.getByText('Saved to Parts · Break A', { exact: true }).waitFor();
  await button('Open Part in Song');
  await button('Preview Part');
  const transport = page.getByRole('region', { name: 'Transport', exact: true });
  await transport.getByRole('status', { name: '110 BPM · SPLOT · Part preview' }).waitFor();
  await button('Stop preview');

  await button('Add to bar 1');
  await button('Cue bar 5');
  await button('Add to bar 5');
  await button('Cue bar 9');
  await button('Place independent copy');
  await page.getByText('Manage Part', { exact: true }).click();
  await button('Rename');
  await page.getByRole('textbox', { name: 'New Part name' }).fill('Main Break');
  await button('Save name');
  const timeline = page.getByRole('region', { name: 'Eight-track song timeline' });
  const clip = (name, bar) => timeline.getByRole('button', { name: new RegExp(`^${name}, Track 1, bar ${bar},`) });
  await clip('Main Break', 1).waitFor();
  await clip('Main Break', 5).waitFor();
  await clip('Break A', 9).waitFor();
  await button('Add to bar 9');
  await page.locator('.song-feedback').getByText(/Track 1 is occupied/).waitFor();
  await button('Undo');
  await clip('Break A', 5).waitFor();
  await button('Redo');
  await clip('Main Break', 5).waitFor();

  await page.getByRole('combobox', { name: 'Accent lane' }).selectOption('7');
  await button('Make accent variation');
  await button('Variation');
  await transport.getByRole('status', { name: '110 BPM · SPLOT · Part preview' }).waitFor();
  await button('Original');
  await button('Stop preview');
  await button('Save variation');
  await page.getByText('Saved accent variation on T7.', { exact: true }).waitFor();
  const verifyStored = () => page.evaluate(() => JSON.parse(localStorage.getItem('dawlessdaw.song.v1')));
  let stored = await verifyStored();
  assert.equal(stored.parts.length, 2);
  assert.equal(stored.parts[0].lanes.find(({ track }) => track === 7).notes[0].velocity, 82);
  assert.equal(stored.parts[1].lanes.find(({ track }) => track === 7).notes[0].velocity, 72);
  assert(Math.abs(stored.parts[1].lanes.find(({ track }) => track === 7).notes[0].at - 13.4) < 0.001);

  await button('Preview Part');
  await page.getByRole('button', { name: /^Main Break 4 bars/ }).click();
  await button('Queue next bar');
  await page.getByText(/Next bar · Main Break/).waitFor();
  await button('Cancel queued Part');
  assert.equal(await page.getByText(/Next bar · Main Break/).count(), 0);
  await button('Queue next bar');
  await page.clock.runFor(Math.ceil(PERIOD * 96) + 10);
  assert.equal(await page.getByText(/Next bar · Main Break/).count(), 0);
  await button('Stop preview');

  await button('Fit Song');
  await button('Follow playhead');
  await button('Cue bar 1');
  await transport.getByRole('status', { name: '110 BPM · Song · Ready' }).waitFor();
  await transport.getByRole('button', { name: 'Play Song', exact: true }).click();
  await transport.getByRole('status', { name: '110 BPM · SPLOT · Song playing' }).waitFor();
  await page.clock.runFor(Math.ceil(PERIOD * 96) + 20);
  await tab('Play');
  await tab('Rig');
  await tab('Build');
  await tab('Song');
  await transport.getByRole('status', { name: '110 BPM · SPLOT · Song playing' }).waitFor();
  await transport.getByRole('button', { name: 'Stop', exact: true }).click();

  await button('Loop section');
  for (let i = 0; i < 8; i++) {
    await page.evaluate((index) => {
      document.querySelector('.song-scroll').scrollLeft = index % 2 ? 520 : 0;
    }, i);
    const twoBarsMs = Math.ceil(PERIOD * 192);
    if (process.env.SPLOT_BENCH_REALTIME === '1') await page.waitForTimeout(twoBarsMs);
    else await page.clock.runFor(twoBarsMs);
  }
  await button('■ Stop song');
  await page.setViewportSize({ width: 1600, height: 900 });
  await clip('Break A', 9).dragTo(timeline.getByRole('button', { name: 'Cue bar 13', exact: true }));
  await clip('Break A', 13).waitFor();
  await button('Undo');
  await clip('Break A', 9).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.setViewportSize({ width: 950, height: 900 });
  const drawer = page.getByRole('button', { name: 'Parts · 2', exact: true });
  await drawer.waitFor();
  assert.equal(await drawer.getAttribute('aria-expanded'), 'false');
  const lastLane = await timeline.getByRole('button', { name: 'Mute track 8', exact: true }).boundingBox();
  assert(lastLane && lastLane.y + lastLane.height <= 880, 'show all eight lanes at 950×900 with Parts collapsed');
  await drawer.click();
  assert.equal(await page.getByRole('button', { name: 'Hide Parts · 2', exact: true }).getAttribute('aria-expanded'), 'true');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 900 });

  const midiDownload = page.waitForEvent('download');
  await button('Export MIDI');
  const file = await readFile(await (await midiDownload).path());
  assert.equal(file.toString('ascii', 0, 4), 'MThd');
  assert.equal(file.readUInt16BE(10), 4);
  await page.getByText('Song backup', { exact: true }).click();
  const backupDownload = page.waitForEvent('download');
  await button('Download backup');
  const backup = await readFile(await (await backupDownload).path());
  await button('Undo');
  assert.equal((await verifyStored()).parts.length, 1);
  await page.getByLabel('Open backup', { exact: true }).setInputFiles({
    name: 'splot-song-backup.json', mimeType: 'application/json', buffer: backup,
  });
  await page.getByText(/Restoring replaces the current Song and Parts/).waitFor();
  assert.equal((await verifyStored()).parts.length, 1);
  await button('Restore backup');
  assert.equal((await verifyStored()).parts.length, 2);
  await button('Undo');
  assert.equal((await verifyStored()).parts.length, 1);
  await button('Redo');
  await tab('Setup');
  await tab('Tests');
  const afterSoak = page.waitForEvent('download');
  await button('Export results');
  const session = JSON.parse(await readFile(await (await afterSoak).path(), 'utf8')).midiSendTiming.session;
  assert(session.song.sends >= 25, 'the loop soak should send notes through the app routes');
  assert(session.p95Ms.song <= 8, `simulated browser p95: ${session.p95Ms.song} ms`);
  assert(session.song.maxMs <= 20, `simulated browser worst send: ${session.song.maxMs} ms`);
  assert.equal(session.heldNotesAtExport, 0);
  console.log(`Loop soak · song MIDI handoff p95 ${session.p95Ms.song} ms · worst ${session.song.maxMs} ms · failed routed notes ${session.failedNoteSends.song} · held notes ${session.heldNotesAtExport}`);
  await page.reload();
  await tab('Build');
  await tab('Song');
  await clip('Main Break', 1).waitFor();
  await clip('Main Break', 5).waitFor();
  await clip('Break A', 9).waitFor();
  stored = await verifyStored();
  assert.equal(stored.bpm, 110);
  assert.equal(stored.clips.length, 9);
  assert.equal(stored.clips.filter(({ partId }) => partId).length, 6);

  await tab('Play');
  await tab('Live');
  await button('Check Rig');
  const rig = page.getByRole('region', { name: 'Check Rig', exact: true });
  const rigButton = (name) => rig.getByRole('button', { name, exact: true });
  const confirmSound = rigButton('I heard the right sound');
  await midi([0xfa]);
  assert(await rigButton('Listen for note').isDisabled());
  await midi([0xfc]);
  await setPort('mpc', 'disconnected');
  await rigButton('Listen for note').click();
  await midi([0x90, 37, 100]);
  await rig.getByText(/No output sent/).waitFor();
  assert(await confirmSound.isDisabled());
  await setPort('mpc', 'connected');
  assert(await confirmSound.isDisabled());

  const destinations = [
    ['mpc', 9], ['mpc', 10], ['mpc', 11], ['mpc', 12],
    ['fm1', 1], ['fm1', 2], ['sp', 1], ['sp', 2],
  ];
  for (const [index, [port, channel]] of destinations.entries()) {
    assert.equal(await rigButton(`T${index + 1} unchecked`).getAttribute('aria-pressed'), 'true');
    await rigButton('Listen for note').click();
    if (index === 0) {
      await midi([0x94, 43, 100]);
      assert(await confirmSound.isDisabled(), 'a note on another lane cannot confirm the selected lane');
      await midi([0x84, 43, 0]);
    }
    if (index === 6) {
      await midi([0x96, 80, 100]);
      await midi([0x86, 80, 0]);
      await rig.getByText(/outside the SP pad range/).waitFor();
      assert(await confirmSound.isDisabled());
      await rigButton('Try another note').click();
    }
    const note = port === 'sp' ? 60 : 37;
    const targetNote = port === 'sp' ? 36 : note;
    await clear();
    await midi([0x90 + index, note, 100]);
    await midi([0x80 + index, note, 0]);
    assert.deepEqual((await sent()).map(([id, data]) => [id, data]), [
      [port, [0x8f + channel, targetNote, 100]], [port, [0x7f + channel, targetNote, 0]],
    ]);
    if (port === 'sp') await rig.getByText(new RegExp(`SP Mode A · ${index === 6 ? 'A01' : 'B01'}`)).waitFor();
    await confirmSound.click();
  }
  await rig.getByText('8/8 heard', { exact: true }).waitFor();
  await page.reload();
  await tab('Live');
  await button('Check Rig');
  await rig.getByText('8/8 heard', { exact: true }).waitFor();
  await page.setViewportSize({ width: 950, height: 900 });
  const panelWidth = await rig.boundingBox();
  assert(panelWidth && panelWidth.x + panelWidth.width <= 950);
  await page.getByRole('listbox', { name: 'Tracks', exact: true }).getByRole('option', { name: /^T1 .*MPC/ }).click();
  const sound = page.getByRole('textbox', { name: 'T1 sound' });
  await sound.fill('Kick');
  await sound.press('Enter');
  await rig.getByText('7/8 heard', { exact: true }).waitFor();

  assert.deepEqual(errors, []);
  console.log('Circuit live bench passed: 110 BPM capture and loop, timing export, Parts workflow, 16-bar loop soak, and eight guided rig checks with persistence and mapping invalidation.');
} finally {
  await browser.close();
}
