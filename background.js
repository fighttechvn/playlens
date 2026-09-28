// PlayLens service worker — keeps the watchlist current while no Play tab is
// open, and shows on the toolbar icon how many watched apps changed.
//
// It reads the same public detail pages the content script reads, only for
// apps the user put on the watchlist, and only when the "bgRefresh" setting is
// on. Nothing is sent anywhere else; results go to chrome.storage.local.

importScripts('core.js');

const P = globalThis.PLSI;

const ALARM = 'plsi-refresh';
const PERIOD_MIN = 360; // wake four times a day
const STALE_MS = 20 * 60 * 60 * 1000; // an app is re-read once it is 20h old
const MAX_PER_RUN = 40;
const GAP_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function syncGet(defaults) {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(defaults, (o) => resolve(o || defaults));
    } catch {
      resolve(defaults);
    }
  });
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM);
  if (!existing) {
    chrome.alarms.create(ALARM, { delayInMinutes: 5, periodInMinutes: PERIOD_MIN });
  }
}

async function watchEntries() {
  const { watch } = await P.store.get('watch');
  const ids = Array.isArray(watch) ? watch : [];
  if (!ids.length) return [];
  const got = await P.store.get(ids.map((id) => 'w:' + id));
  return ids.map((id) => got['w:' + id]).filter(Boolean);
}

async function updateBadge() {
  const entries = await watchEntries();
  const n = entries.filter((w) => w.unseen > 0).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#c5221f' });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

let running = false;

async function refresh() {
  if (running) return;
  running = true;
  try {
    const { bgRefresh, history } = await syncGet({ bgRefresh: true, history: true });
    if (bgRefresh) {
      const now = Date.now();
      const due = (await watchEntries())
        .filter((w) => now - (w.checked || 0) > STALE_MS)
        .sort((a, b) => (a.checked || 0) - (b.checked || 0))
        .slice(0, MAX_PER_RUN);
      for (const w of due) {
        try {
          const res = await fetch(P.detailUrl(w.id), { credentials: 'omit' });
          if (res.ok) {
            const info = P.parseDetail(await res.text());
            if (info && info.name) {
              await P.store.set({ ['app:' + w.id]: { ...info, t: Date.now() } });
              await P.record(w.id, info, { history });
            }
          }
        } catch {
          /* offline or refused; the next run tries again */
        }
        await sleep(GAP_MS);
      }
    }
    const all = await P.store.get(null);
    const watch = Array.isArray(all.watch) ? all.watch : [];
    const drop = P.gcKeys(all, watch);
    if (drop.length) await P.store.remove(drop);
    await P.store.set({ gc: Date.now() });
    await updateBadge();
  } finally {
    running = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) refresh();
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'plsi:badge') {
    updateBadge().then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === 'plsi:refresh') {
    refresh().then(() => reply({ ok: true }));
    return true;
  }
});
