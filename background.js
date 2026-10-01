// PlayLens service worker — keeps the watchlist current while no Play tab is
// open, and shows on the toolbar icon how many watched apps changed.
//
// It reads the same public detail pages the content script reads, only for
// apps the user put on the watchlist, and only when the "bgRefresh" setting is
// on. Nothing is sent anywhere else; results go to chrome.storage.local.
//
// With a Pro licence it also reads Play's search page once a day for each
// keyword the user tracks, notes where the watched app stands, and — when the
// user switched alerts on and allowed notifications — says what moved. Once a
// day it asks Polar whether the licence key is still good (see license.js).

importScripts('core.js', 'license.js');

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

// Reads each tracked keyword's search page (once a day, one page per
// keyword/country even when several apps share it) and files where every
// watched app stood. Returns the moves worth telling about.
async function checkRanks(limit) {
  const all = await P.store.get(null);
  const watch = Array.isArray(all.watch) ? all.watch : [];
  const pairs = P.trackedPairs(all, watch, limit);
  if (!pairs.length) return [];
  const today = Math.floor(Date.now() / P.DAY_MS);
  const maps = {};
  const byPage = new Map();
  for (const p of pairs) {
    maps[p.id] = all['rk:' + p.id] || {};
    const list = maps[p.id][p.key];
    if (list && list.length && list[list.length - 1][0] === today) continue;
    const page = p.key;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(p);
  }
  const moves = [];
  for (const [key, group] of byPage) {
    const { gl, term } = P.parseTrackKey(key);
    let html = null;
    try {
      const res = await fetch(P.searchUrl(term, gl), { credentials: 'omit' });
      if (res.ok) html = await res.text();
    } catch {
      /* offline or refused; the next run tries again */
    }
    if (html) {
      for (const p of group) {
        maps[p.id] = P.pushTrack(maps[p.id], key, P.rankIn(html, p.id));
        const m = P.trackMove(maps[p.id][key]);
        const w = all['w:' + p.id];
        if (m) moves.push({ ...m, term, gl, name: (w && w.name) || p.id, id: p.id });
      }
    }
    await sleep(GAP_MS);
  }
  const out = {};
  for (const id of Object.keys(maps)) if (all['rk:' + id] !== maps[id]) out['rk:' + id] = maps[id];
  if (Object.keys(out).length) await P.store.set(out);
  return moves;
}

async function alertsAllowed() {
  const { alerts } = await syncGet({ alerts: false });
  if (!alerts) return false;
  try {
    return await chrome.permissions.contains({ permissions: ['notifications'] });
  } catch {
    return false;
  }
}

async function alert(changes, moves) {
  if (!(await alertsAllowed())) return;
  const lines = P.alertText(changes, moves);
  if (!lines) return;
  const first = (changes[0] || moves.find((m) => m.entered || m.left || Math.abs(m.move) >= 3) || {}).id || '';
  chrome.notifications.create('plsi:' + first + ':' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'PlayLens — ' + lines.length + (lines.length === 1 ? ' change' : ' changes'),
    message: lines.slice(0, 4).join('\n') + (lines.length > 4 ? '\n+' + (lines.length - 4) + ' more' : ''),
  });
}

let clicksBound = false;

function listenForClicks() {
  if (clicksBound || !chrome.notifications) return; // permission not granted (yet)
  clicksBound = true;
  chrome.notifications.onClicked.addListener((nid) => {
    const id = nid.split(':')[1];
    if (id) chrome.tabs.create({ url: 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(id) });
    chrome.notifications.clear(nid);
  });
}

listenForClicks();
chrome.permissions.onAdded.addListener(listenForClicks);

let running = false;

async function refresh() {
  if (running) return;
  running = true;
  try {
    const { bgRefresh, history } = await syncGet({ bgRefresh: true, history: true });
    const lic = await P.license.read();
    let state = P.license.status(lic);
    if (P.license.needsCheck(lic)) state = (await P.license.revalidate()).state;
    const changes = [];
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
              const r = await P.record(w.id, info, { history });
              for (const c of r.changes) changes.push({ ...c, name: w.name || w.id, id: w.id });
            }
          }
        } catch {
          /* offline or refused; the next run tries again */
        }
        await sleep(GAP_MS);
      }
    }
    const moves = bgRefresh ? await checkRanks(P.license.limits(lic).rankPairs) : [];
    if (state.pro) await alert(changes, moves);
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
  if (msg.type === 'plsi:options') {
    chrome.runtime.openOptionsPage();
    reply({ ok: true });
    return;
  }
  if (msg.type === 'plsi:refresh') {
    refresh().then(() => reply({ ok: true }));
    return true;
  }
});
