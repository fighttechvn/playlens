#!/usr/bin/env node
// PlayLens MCP server — lets Claude read what the PlayLens extension keeps in
// the browser (Play Console records, watchlist, install history). Read-only.
//
//   Claude  --stdio/MCP-->  this process  --WebSocket 127.0.0.1:17893-->  extension
//
// The extension connects out to us (it cannot listen), and only after the user
// switched "Let Claude read my PlayLens data" on in its Options. Several
// Claude sessions can run this at once: the first one owns the port, the others
// forward their questions to it.
//
// Logs go to stderr only: stdout belongs to the MCP protocol.

import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';

const PORT = Number(process.env.PLAYLENS_PORT) || 17893;
const EXT_ID = process.env.PLAYLENS_EXTENSION_ID || ''; // optional: pin to one extension id
const TIMEOUT_MS = 15000;
const MAX_CHARS = 120000;
const log = (...a) => console.error('[playlens-mcp]', ...a);

// ---------- the link to the extension ----------

let ext = null; // the extension's socket, when this process owns the port
let extInfo = null;
let peer = null; // the owner's socket, when this process is a follower
let seq = 0;
const pending = new Map();

function settle(id, fn) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  fn(p);
}

function ask(sock, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => settle(id, (p) => p.reject(new Error('The extension did not answer in time.'))), TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    sock.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

const NOT_CONNECTED =
  'The PlayLens extension is not connected. In Chrome open PlayLens → Options → "Claude (MCP)" and turn on "Let Claude read my PlayLens data", then keep Chrome open. It reconnects within 30 seconds.';

async function call(method, params) {
  if (peer && peer.readyState === WebSocket.OPEN) return ask(peer, method, params);
  if (ext && ext.readyState === WebSocket.OPEN) return ask(ext, method, params);
  throw new Error(NOT_CONNECTED);
}

function hostOk(req) {
  return new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]).has(req.headers.host || '');
}

// Owner side: accept the extension at /ext and followers at /peer.
function serve() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(404).end();
    });
    const wss = new WebSocketServer({ noServer: true });

    srv.on('upgrade', (req, socket, head) => {
      const origin = req.headers.origin || '';
      const path = (req.url || '').split('?')[0];
      const fromExt = path === '/ext' && origin.startsWith('chrome-extension://') && (!EXT_ID || origin === 'chrome-extension://' + EXT_ID);
      const fromPeer = path === '/peer' && !origin; // browsers always send an Origin; a web page cannot be a peer
      if (!hostOk(req) || !(fromExt || fromPeer)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        return socket.destroy();
      }
      wss.handleUpgrade(req, socket, head, (ws) => (fromExt ? onExtension(ws) : onPeer(ws)));
    });

    srv.once('error', reject);
    srv.listen(PORT, '127.0.0.1', () => {
      srv.off('error', reject);
      resolve();
    });
  });
}

function onExtension(ws) {
  if (ext && ext !== ws) ext.close();
  ext = ws;
  extInfo = null;
  log('extension connected');
  const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'ping' })), 20000);
  ws.on('message', (data) => {
    let m;
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (m.hello) extInfo = { version: m.version, methods: m.methods };
    else if (m.id != null) settle(m.id, (p) => (m.error ? p.reject(new Error(m.error)) : p.resolve(m.result)));
  });
  ws.on('close', () => {
    clearInterval(ping);
    if (ext === ws) {
      ext = null;
      log('extension disconnected');
    }
  });
}

// A follower's question goes to the extension; the answer goes back.
function onPeer(ws) {
  ws.on('message', async (data) => {
    let m;
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (m.method === 'x-info') return ws.send(JSON.stringify({ id: m.id, result: { connected: !!ext && ext.readyState === WebSocket.OPEN, extension: extInfo } }));
    let reply;
    try {
      reply = { id: m.id, result: await call(m.method, m.params) };
    } catch (e) {
      reply = { id: m.id, error: e.message };
    }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
  });
}

// Follower side.
function follow() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/peer`);
    ws.once('error', reject);
    ws.once('open', () => {
      ws.off('error', reject);
      peer = ws;
      ws.on('message', (data) => {
        let m;
        try {
          m = JSON.parse(String(data));
        } catch {
          return;
        }
        if (m.id != null) settle(m.id, (p) => (m.error ? p.reject(new Error(m.error)) : p.resolve(m.result)));
      });
      ws.on('close', () => {
        peer = null;
        for (const id of [...pending.keys()]) settle(id, (p) => p.reject(new Error('The other PlayLens MCP process (owner of the port) exited. Restart this server.')));
      });
      resolve();
    });
  });
}

// ---------- the MCP tools ----------

const server = new McpServer({ name: 'playlens', version: '1.0.0' });

function text(value) {
  let s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (s.length > MAX_CHARS) s = s.slice(0, MAX_CHARS) + `\n… truncated at ${MAX_CHARS} characters; narrow the query (limit, sections, since).`;
  return s;
}

function tool(name, description, shape, method = name) {
  server.registerTool(
    name,
    { description, inputSchema: shape, annotations: { readOnlyHint: true, openWorldHint: false } },
    async (args) => {
      try {
        const out = await call(method, args);
        const failed = out && typeof out === 'object' && out.error;
        return { content: [{ type: 'text', text: text(out) }], isError: !!failed };
      } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true };
      }
    }
  );
}

server.registerTool(
  'status',
  {
    description: 'Is the PlayLens extension connected, which version, and how much data it holds (Console apps, watchlist size, install histories). Call this first.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    try {
      return { content: [{ type: 'text', text: text({ connected: true, ...(await call('status', {})) }) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: text({ connected: false, help: e.message }) }] };
    }
  }
);

tool(
  'console_apps',
  'One row per app seen in Google Play Console, newest capture first: what is live on Production / Open testing / Internal / each Closed track (release, status, rollout, "In review"), event count and next expiry, counts of IAP / subscriptions / promo codes / version codes, whether the Licensing key was captured. Use this to find which apps need attention.',
  {
    query: z.string().optional().describe('Match on app name or package name'),
    inReview: z.boolean().optional().describe('Only apps with a release currently in review'),
    eventsWithinDays: z.number().optional().describe('Only apps with an event ending within this many days'),
    limit: z.number().int().min(1).max(500).optional(),
  },
  'console_apps'
);

tool(
  'console_app',
  'Everything saved for one app: tracks, releases (with status history trail), version codes, LiveOps events (start/end), one-time products, subscriptions, promo codes, and the Licensing public key. Accepts a package name or the numeric Console app id.',
  {
    pkg: z.string().describe('Package name (vn.fighttech.go2048) or numeric Play Console app id'),
    sections: z
      .array(z.enum(['tracks', 'releases', 'versions', 'events', 'products', 'productDetails', 'subscriptions', 'subscriptionDetails', 'promos', 'license']))
      .optional()
      .describe('Only these parts; default is all'),
  }
);

tool(
  'console_history',
  'Per-app log, newest first: pages the user opened ("view"), data that changed ("change": added / changed with field diffs / removed), and buttons they pressed in the Console ("action").',
  {
    pkg: z.string(),
    type: z.enum(['view', 'change', 'action']).optional(),
    since: z.string().optional().describe('ISO date; only entries at or after it'),
    limit: z.number().int().min(1).max(500).optional().describe('Default 50'),
  }
);

tool(
  'console_events',
  'LiveOps events across all apps that end (or start) within a window, sorted by expiry. Default window 14 days; set includeEnded for past ones.',
  {
    withinDays: z.number().optional().describe('Default 14'),
    includeEnded: z.boolean().optional(),
  }
);

tool('watchlist', 'The apps on the PlayLens watchlist (Play Store apps): last check, unseen changes, current public info.', {});

tool(
  'installs_history',
  'Daily snapshots of a Play Store app the user has looked at: installs, rating count and score over time. Id is the Play package name.',
  { id: z.string().describe('Package name, e.g. com.whatsapp'), limit: z.number().int().min(1).max(500).optional().describe('Latest N points; default 120') }
);

tool('ranks', 'Keyword rank history of a watched Play Store app, per country and search term.', { id: z.string().describe('Package name of the watched app') });

tool('storage_keys', 'List every key in the extension\'s local storage with its size and whether storage_get may return it. The Pro licence key is never readable.', {});

tool('storage_get', 'Raw value of one readable storage key (e.g. "c:vn.fighttech.go2048", "w:com.whatsapp"). Prefer the specific tools; use this for anything they do not cover.', { key: z.string() });

tool('settings', 'The extension\'s settings (toggles, countries) from synced storage.', {});

// ---------- go ----------

try {
  await serve();
  log(`listening on 127.0.0.1:${PORT} for the extension`);
} catch (e) {
  if (e.code !== 'EADDRINUSE') throw e;
  try {
    await follow();
    log(`port ${PORT} is taken by another PlayLens MCP process; forwarding to it`);
  } catch (err) {
    log(`port ${PORT} is in use by something that is not a PlayLens MCP server: ${err.message}`);
  }
}

await server.connect(new StdioServerTransport());
