// PlayLens · MCP bridge (service worker side).
//
// Off by default. When the user switches "Let Claude read my PlayLens data" on
// in Options, this opens one WebSocket to ws://127.0.0.1:17893, the port the
// local MCP server (mcp/server.js in the repo) listens on, and answers its
// read-only questions from chrome.storage.local. It never connects anywhere
// but this machine and it never writes. Data answered is listed in
// bridge-data.js; the Pro licence key is not among it.

(function () {
  const P = globalThis.PLSI;
  const URL = 'ws://127.0.0.1:17893/ext';
  const ALARM = 'plsi-bridge';
  const FLAG = 'mcpBridge';

  let ws = null;
  let state = 'off'; // off | waiting (on, no server found yet) | connected
  let lastError = null;

  const syncGet = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.sync.get(null, (o) => resolve(o || {}));
      } catch {
        resolve({});
      }
    });

  async function enabled() {
    return !!(await P.store.get(FLAG))[FLAG];
  }

  async function answer(msg) {
    const all = await P.store.get(null);
    const ctx = { version: chrome.runtime.getManifest().version };
    if (msg.method === 'settings') ctx.sync = await syncGet();
    return P.bridge.handle(msg.method, msg.params, all, Date.now(), ctx);
  }

  function close() {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    ws = null;
  }

  function open() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    let sock;
    try {
      sock = new WebSocket(URL);
    } catch (e) {
      lastError = String(e);
      state = 'waiting';
      return;
    }
    ws = sock;
    sock.onopen = () => {
      state = 'connected';
      lastError = null;
      sock.send(JSON.stringify({ hello: true, version: chrome.runtime.getManifest().version, methods: P.bridge.methods }));
    };
    sock.onmessage = async (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      // The server pings every 20 s; answering keeps this worker awake.
      if (msg.t === 'ping') return sock.send(JSON.stringify({ t: 'pong' }));
      if (msg.id == null || typeof msg.method !== 'string') return;
      let reply;
      try {
        reply = { id: msg.id, result: await answer(msg) };
      } catch (e) {
        reply = { id: msg.id, error: String((e && e.message) || e) };
      }
      if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(reply));
    };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      state = 'waiting';
    };
    sock.onerror = () => {
      lastError = 'Could not reach the MCP server on 127.0.0.1:17893. Is it running?';
    };
  }

  async function sync() {
    if (await enabled()) {
      if (state === 'off') state = 'waiting';
      open();
    } else {
      close();
      state = 'off';
    }
  }

  async function ensureAlarm() {
    const on = await enabled();
    const have = await chrome.alarms.get(ALARM);
    if (on && !have) chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
    if (!on && have) chrome.alarms.clear(ALARM);
  }

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM) sync();
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && FLAG in ch) {
      ensureAlarm();
      sync();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.type !== 'plsi:bridge') return;
    // Options asks how the connection is doing (and wakes this worker to retry).
    sync().then(() => reply({ state, error: state === 'connected' ? null : lastError }));
    return true;
  });

  ensureAlarm();
  sync();
})();
