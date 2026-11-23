#!/usr/bin/env node
/**
 * Phase C/D — MPC Library companion (fixtures, loopback-only).
 *
 *   node scripts/mpc-library-companion.mjs
 *   node scripts/mpc-library-companion.mjs --port 8787
 *
 * No shell, no SSH, no expansion-builder. Ctrl+C to stop.
 * Contract mirrored in `@dawlessdaw/mpc-library` (tested).
 */
import http from 'node:http';

const FIXTURES = [
  { id: 'fx-projects', name: 'Projects', kind: 'folder', relativePath: 'Projects' },
  {
    id: 'fx-demo-beat',
    name: 'Demo Beat.xpj',
    kind: 'project',
    relativePath: 'Projects/Demo Beat.xpj',
  },
  {
    id: 'fx-sketch-a',
    name: 'Sketch A.xpj',
    kind: 'project',
    relativePath: 'Projects/Sketch A.xpj',
  },
  {
    id: 'fx-night-bus',
    name: 'Night Bus.xpj',
    kind: 'project',
    relativePath: 'Projects/Night Bus.xpj',
  },
  { id: 'fx-audio', name: 'Audio', kind: 'folder', relativePath: 'Audio' },
  {
    id: 'fx-kick',
    name: 'kick_dry.wav',
    kind: 'sample',
    relativePath: 'Audio/kick_dry.wav',
  },
  {
    id: 'fx-hat',
    name: 'hat_open.wav',
    kind: 'sample',
    relativePath: 'Audio/hat_open.wav',
  },
  {
    id: 'fx-loop',
    name: 'loop_tape_12.wav',
    kind: 'sample',
    relativePath: 'Audio/loop_tape_12.wav',
  },
  { id: 'fx-expansions', name: 'Expansions', kind: 'folder', relativePath: 'Expansions' },
  {
    id: 'fx-exp-drums',
    name: 'Studio Drums Pack',
    kind: 'folder',
    relativePath: 'Expansions/Studio Drums Pack',
  },
  {
    id: 'fx-exp-keys',
    name: 'Keys Soft',
    kind: 'folder',
    relativePath: 'Expansions/Keys Soft',
  },
];

function isLoopbackOrigin(origin) {
  if (!origin) return true; // CLI / curl without Origin
  try {
    const u = new URL(origin);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1';
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);
let port = Number(process.env.MPC_LIBRARY_PORT ?? 8787);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  if (args[i] === '--ssh-opt-in') {
    console.error('SSH opt-in noted but Phase C/D has no SSH implementation — fixtures only.');
  }
}

const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  if (origin && !isLoopbackOrigin(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Origin not allowed' }));
    return;
  }
  if (req.method === 'OPTIONS') {
    const headers = {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    res.writeHead(204, headers);
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Read-only companion — GET only' }));
    return;
  }

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') {
    res.writeHead(200, headers);
    res.end(
      JSON.stringify({
        ok: true,
        version: '0.1.0-poc',
        mode: 'fixtures',
        readOnly: true,
        loopbackOnly: true,
        ssh: {
          available: false,
          optInRequired: true,
          reason: 'Phase C/D fixtures only — no SSH',
        },
      }),
    );
    return;
  }
  if (url.pathname === '/library') {
    res.writeHead(200, headers);
    res.end(
      JSON.stringify({
        rootLabel: 'fixtures (read-only PoC)',
        mode: 'fixtures',
        readOnly: true,
        entries: FIXTURES,
      }),
    );
    return;
  }
  res.writeHead(404, headers);
  res.end(JSON.stringify({ ok: false, error: `Unknown path ${url.pathname}` }));
});

server.listen(port, HOST, () => {
  console.log(`MPC Library companion (fixtures) http://${HOST}:${port}`);
  console.log('Read-only · loopback only · no shell · no SSH · Ctrl+C to stop');
});
