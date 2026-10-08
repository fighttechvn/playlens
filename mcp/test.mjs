// End-to-end check: a real MCP client talks to server.js over stdio while a
// fake extension (same bridge-data.js the real one uses) answers over WebSocket.
//   cd mcp && npm install && node test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocket } from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(path.join(here, '..', 'console-parse.js'));
const bridge = require(path.join(here, '..', 'bridge-data.js'));

const PORT = 17000 + Math.floor(Math.random() * 2000);
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (!ok && detail !== undefined ? '  → ' + String(detail).slice(0, 300) : ''));
};

const now = Date.now();
const store = {
  'cx:idx': { byApp: { 1: 'a.b.c' }, apps: { 'a.b.c': { appId: '1', name: 'App C' } } },
  'c:a.b.c': { pkg: 'a.b.c', appId: '1', name: 'App C', lastSeen: now, releases: [{ track: 'production', release: '1.0 (1)', status: 'In review', inReview: true, updatedTs: now }], events: [] },
  license: { key: 'SECRET-LICENSE-KEY' },
};

const spawn = async () => {
  const c = new Client({ name: 'test', version: '0' });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(here, 'server.js')], env: { ...process.env, PLAYLENS_PORT: String(PORT) }, stderr: 'ignore' }));
  return c;
};
const run = async (c, name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  return { text: r.content[0].text, isError: !!r.isError };
};
const open = (url, headers) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    ws.once('unexpected-response', (_, res) => reject(new Error('HTTP ' + res.statusCode)));
  });

const owner = await spawn();
await new Promise((r) => setTimeout(r, 500));

const tools = (await owner.listTools()).tools.map((t) => t.name);
check('lists the tools', ['status', 'console_apps', 'console_app', 'console_history', 'console_events', 'watchlist', 'installs_history', 'ranks', 'storage_keys', 'storage_get', 'settings'].every((n) => tools.includes(n)), tools);
check('every tool is marked read-only', (await owner.listTools()).tools.every((t) => t.annotations && t.annotations.readOnlyHint === true));

{
  const s = await run(owner, 'status');
  check('status works while the extension is absent, with help', !s.isError && JSON.parse(s.text).connected === false && /Options/.test(s.text), s.text);
  const e = await run(owner, 'console_apps');
  check('other tools say how to connect', e.isError && /not connected/.test(e.text), e.text);
}

check('a web page (http Origin) is refused', await open(`ws://127.0.0.1:${PORT}/ext`, { Origin: 'https://evil.example' }).then(() => false, () => true));
check('no Origin on /ext is refused', await open(`ws://127.0.0.1:${PORT}/ext`).then(() => false, () => true));
check('wrong Host header is refused', await open(`ws://127.0.0.1:${PORT}/ext`, { Origin: 'chrome-extension://abc', Host: 'evil.example' }).then(() => false, () => true));
check('/peer with an Origin is refused', await open(`ws://127.0.0.1:${PORT}/peer`, { Origin: 'chrome-extension://abc' }).then(() => false, () => true));

const ext = await open(`ws://127.0.0.1:${PORT}/ext`, { Origin: 'chrome-extension://abcdef' });
const seen = [];
ext.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.t === 'ping') return ext.send(JSON.stringify({ t: 'pong' }));
  seen.push(m.method);
  ext.send(JSON.stringify({ id: m.id, result: bridge.handle(m.method, m.params, store, Date.now(), { version: '9.9.9', sync: {} }) }));
});
ext.send(JSON.stringify({ hello: true, version: '9.9.9', methods: bridge.methods }));
await new Promise((r) => setTimeout(r, 200));

{
  const s = JSON.parse((await run(owner, 'status')).text);
  check('status through the bridge', s.connected && s.extensionVersion === '9.9.9' && s.consoleApps === 1, s);
  const a = JSON.parse((await run(owner, 'console_apps', { inReview: true })).text);
  check('console_apps through the bridge', a.total === 1 && a.apps[0].pkg === 'a.b.c' && a.apps[0].tracks.production.status === 'In review', a);
  const app = await run(owner, 'console_app', { pkg: '1' });
  check('console_app by appId', JSON.parse(app.text).name === 'App C');
  const bad = await run(owner, 'console_app', { pkg: 'zzz' });
  check('an error answer is flagged isError', bad.isError && /No saved Console data/.test(bad.text));
  const lic = await run(owner, 'storage_get', { key: 'license' });
  check('licence key refused end to end', lic.isError && !lic.text.includes('SECRET'));
}

// A second Claude session: same port, forwards to the first.
const follower = await spawn();
await new Promise((r) => setTimeout(r, 500));
{
  const s = await run(follower, 'status');
  check('second session forwards to the port owner', s.text.includes('"connected": true') && s.text.includes('9.9.9'), s.text);
  const a = await run(follower, 'console_apps');
  check('second session gets data', JSON.parse(a.text).total === 1, a.text);
}

// Extension goes away.
ext.close();
await new Promise((r) => setTimeout(r, 300));
check('after the extension leaves, calls say not connected', (await run(owner, 'console_apps')).text.includes('not connected'));

await follower.close();
await owner.close();
console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
