// PlayLens — app statistics on Google Play list pages (developer, collection,
// search, home) and a side panel to compare, watch and export them.
//
// On the cards, controlled by feature flags (extension popup):
//   - overlay: badge overlaid on each app icon
//   - inline:  extra info lines under the card's own rating line
// In the side panel (flag: panel):
//   - This page / Recent / Watchlist tables with a details drawer per app
//   - Keywords: search suggestions and how open each term looks
//
// Data source: each app's own detail page fetched with hl=en&gl=US so labels
// and number formats are stable to parse regardless of the UI language the
// user browses with. Parsing lives in core.js.
//
// play.google.com enforces Trusted Types (blocks innerHTML, even from content
// scripts) — all DOM here is built with createElement/textContent only.

(() => {
  const P = globalThis.PLSI;
  if (!P) return;

  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
  const CONCURRENCY = 3;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const RECENT_KEY = 'recent';
  const RECENT_MAX = 60;
  const WATCH_KEY = 'watch'; // index of watched ids; each entry lives in w:<id>

  const DEFAULT_FLAGS = {
    overlay: true, // badge on each icon
    inline: true, // info line under the card's rating
    panel: true, // side panel available (opens via floating button)
    panelOpen: false, // panel expanded state (persisted)
    recent: true, // remember apps whose detail page was opened
    exact: true, // exact install count instead of the "10M+" bucket
    age: true, // app age and installs per day on the cards
    rank: true, // position number on search result cards
    history: true, // keep a daily snapshot of every app seen
  };
  const DEFAULT_COLS = ['downloads', 'rating', 'reviews', 'updated', 'age', 'perday'];
  const DEFAULT_COUNTRIES = ['US', 'GB', 'DE', 'JP', 'VN'];

  const state = {
    flags: { ...DEFAULT_FLAGS },
    cols: [...DEFAULT_COLS],
    countries: [...DEFAULT_COUNTRIES],
    apps: new Map(), // id -> {id, name, icon, order, rank, status: 'loading'|'ok'|'error', info, hist}
    order: 0,
    sort: { key: 'page', dir: 1 },
    view: 'page', // page | recent | watch | keywords
    tool: null, // open toolbar: cols | filter | export
    filter: {},
    recent: [], // [{id, name, icon, info, t}] newest first, from storage.local
    watch: new Map(), // id -> {id, name, icon, info, added, checked, changes, unseen}
    hist: new Map(), // id -> snapshots, for rows that are not on this page
    drawer: null, // {id, el} the one expanded row
    kw: { seed: '', gl: 'US', az: false, items: [], busy: false, note: '' },
  };

  const seenIds = new Set();

  // ---------- chrome.storage helpers (no-op outside extension context) ----------

  function storageGet(area, keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage[area].get(keys, (obj) => resolve(obj || {}));
      } catch {
        resolve({});
      }
    });
  }

  function storageSet(area, obj) {
    try {
      chrome.storage[area].set(obj);
    } catch {
      /* extension context gone; ignore */
    }
  }

  function storageRemove(area, keys) {
    try {
      chrome.storage[area].remove(keys);
    } catch {
      /* extension context gone; ignore */
    }
  }

  function tellBackground(type) {
    try {
      chrome.runtime.sendMessage({ type }, () => void chrome.runtime.lastError);
    } catch {
      /* not running as extension */
    }
  }

  const cleanList = (v, fallback) =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : [...fallback];

  async function loadFlags() {
    const saved = await storageGet('sync', {
      ...DEFAULT_FLAGS,
      cols: DEFAULT_COLS,
      countries: DEFAULT_COUNTRIES,
    });
    for (const k of Object.keys(DEFAULT_FLAGS)) {
      if (typeof saved[k] === 'boolean') state.flags[k] = saved[k];
    }
    state.cols = cleanList(saved.cols, DEFAULT_COLS);
    state.countries = cleanList(saved.countries, DEFAULT_COUNTRIES).slice(0, 8);
    if (!state.countries.length) state.countries = [...DEFAULT_COUNTRIES];
  }

  function watchStorage() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          let touched = false;
          for (const [k, c] of Object.entries(changes)) {
            if (k === RECENT_KEY) {
              // Recent list is shared: another tab (or the options page) may change it.
              state.recent = c.newValue || [];
              touched = true;
            } else if (k.startsWith('w:')) {
              const id = k.slice(2);
              if (c.newValue) state.watch.set(id, c.newValue);
              else state.watch.delete(id);
              touched = true;
            } else if (k.startsWith('h:')) {
              const id = k.slice(2);
              const list = c.newValue || [];
              const app = state.apps.get(id);
              if (app) app.hist = list;
              state.hist.set(id, list);
            }
          }
          if (touched) schedulePanelRender();
          return;
        }
        if (area !== 'sync') return;
        let cards = false;
        for (const [k, c] of Object.entries(changes)) {
          if (k in DEFAULT_FLAGS) {
            state.flags[k] = c.newValue ?? DEFAULT_FLAGS[k];
            if (k === 'exact' || k === 'age' || k === 'rank') cards = true;
          } else if (k === 'cols') {
            state.cols = cleanList(c.newValue, DEFAULT_COLS);
          } else if (k === 'countries') {
            state.countries = cleanList(c.newValue, DEFAULT_COUNTRIES).slice(0, 8);
          }
        }
        applyFlags();
        if (cards) rerenderCards();
        schedulePanelRender();
      });
    } catch {
      /* not running as extension */
    }
  }

  // The lines under a card are read against Play's page, which has its own
  // ground whatever theme the system is in.
  function markGround() {
    let dark = false;
    for (const el of [document.body, document.documentElement]) {
      const m = el && getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (!m || (m.length > 3 && +m[3] === 0)) continue;
      dark = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] < 128;
      break;
    }
    document.documentElement.classList.toggle('plsi-ground-dark', dark);
  }

  function applyFlags() {
    markGround();
    // Inline line carries the same numbers, so it wins over the icon badge:
    // never show both for one card.
    const overlay = state.flags.overlay && !state.flags.inline;
    document.documentElement.classList.toggle('plsi-no-overlay', !overlay);
    document.documentElement.classList.toggle('plsi-no-inline', !state.flags.inline);
    if (state.flags.panel) {
      ensurePanel();
      setPanelOpen(state.flags.panelOpen);
    } else {
      removePanel();
    }
  }

  // ---------- where we are ----------

  function pageKind() {
    const p = location.pathname;
    if (p === '/store/search') return 'search';
    if (p === '/store/apps/details') return 'detail';
    if (p === '/store/apps/dev' || p === '/store/apps/developer') return 'dev';
    return 'list';
  }

  function pageQuery() {
    const q = new URLSearchParams(location.search).get('q');
    return q ? q.trim().toLowerCase() : null;
  }

  // ---------- fetch queue ----------

  const queue = [];
  let active = 0;

  // Jobs started for the cards of a page are dropped when the page changes;
  // jobs the user asked for (scores, refresh) are not.
  function run(task, forPage) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject, forPage: !!forPage });
      pump();
    });
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const job = queue.shift();
      active++;
      job
        .task()
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  }

  function dropPageJobs() {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].forPage) queue.splice(i, 1);
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- app data: cache, fetch, history ----------

  async function fetchAppInfo(id, gl) {
    const res = await fetch(P.detailUrl(id, gl), { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return P.parseDetail(await res.text());
  }

  const inflight = new Map();

  // Cached listing if it is recent enough, a fresh one otherwise. A fresh one
  // also leaves the day's snapshot and updates the watchlist entry.
  function getInfo(id, force) {
    if (inflight.has(id)) return inflight.get(id);
    const p = (async () => {
      const ck = 'app:' + id;
      const hk = 'h:' + id;
      const got = await storageGet('local', [ck, hk]);
      const c = got[ck];
      if (!force && c && c.v === P.CACHE_V && Date.now() - c.t < CACHE_TTL_MS) {
        return { info: c, hist: got[hk] || [] };
      }
      const info = await fetchAppInfo(id);
      storageSet('local', { [ck]: { ...info, t: Date.now() } });
      const r = await P.record(id, info, { history: state.flags.history });
      if (r.changes.length) tellBackground('plsi:badge');
      return { info, hist: r.history };
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  }

  async function collectGarbage() {
    const { gc } = await storageGet('local', 'gc');
    if (gc && Date.now() - gc < P.DAY_MS) return;
    const all = await storageGet('local', null);
    const keys = P.gcKeys(all, [...state.watch.keys()]);
    if (keys.length) storageRemove('local', keys);
    storageSet('local', { gc: Date.now() });
  }

  // ---------- recently viewed apps (storage.local, survives restarts) ----------

  async function loadRecent() {
    const obj = await storageGet('local', RECENT_KEY);
    state.recent = Array.isArray(obj[RECENT_KEY]) ? obj[RECENT_KEY] : [];
  }

  // Called when an app's own detail page is opened — that, not merely seeing a
  // card in a list, is what "visited" means.
  function rememberRecent(app) {
    if (!state.flags.recent || !app.info) return;
    const entry = {
      id: app.id,
      name: app.name || app.id,
      icon: app.icon || app.info.icon || null,
      info: app.info,
      t: Date.now(),
    };
    state.recent = [entry, ...state.recent.filter((r) => r.id !== app.id)].slice(0, RECENT_MAX);
    storageSet('local', { [RECENT_KEY]: state.recent });
    if (state.view === 'recent') schedulePanelRender();
  }

  function clearRecent() {
    state.recent = [];
    storageSet('local', { [RECENT_KEY]: [] });
    renderPanel();
  }

  // ---------- watchlist ----------

  async function loadWatch() {
    const obj = await storageGet('local', WATCH_KEY);
    const ids = Array.isArray(obj[WATCH_KEY]) ? obj[WATCH_KEY] : [];
    if (!ids.length) return;
    const entries = await storageGet(
      'local',
      ids.map((id) => 'w:' + id)
    );
    for (const id of ids) {
      const e = entries['w:' + id];
      if (e) state.watch.set(id, e);
    }
  }

  function saveWatchIndex() {
    storageSet('local', { [WATCH_KEY]: [...state.watch.keys()] });
  }

  function toggleWatch(app) {
    if (state.watch.has(app.id)) {
      state.watch.delete(app.id);
      storageRemove('local', ['w:' + app.id, 'kw:' + app.id]);
    } else {
      if (!app.info) return;
      const now = Date.now();
      const entry = {
        id: app.id,
        name: app.name || app.id,
        icon: app.icon || app.info.icon || null,
        info: app.info,
        added: now,
        checked: app.info.t || now,
        changes: [],
        unseen: 0,
      };
      state.watch.set(app.id, entry);
      storageSet('local', { ['w:' + app.id]: entry });
      if (app.rank && pageKind() === 'search') recordRank(app);
    }
    saveWatchIndex();
    tellBackground('plsi:badge');
    renderPanel();
  }

  function markSeen(id) {
    const w = state.watch.get(id);
    if (!w || !w.unseen) return;
    const next = { ...w, unseen: 0 };
    state.watch.set(id, next);
    storageSet('local', { ['w:' + id]: next });
    tellBackground('plsi:badge');
  }

  let watchBusy = false;

  // Re-reads watched apps that have not been looked at for a while. One at a
  // time through the shared queue, so it never crowds out the page's own cards.
  async function refreshWatch(maxAgeMs) {
    if (watchBusy) return;
    watchBusy = true;
    renderPanel();
    try {
      for (const w of [...state.watch.values()]) {
        if (Date.now() - (w.checked || 0) < maxAgeMs) continue;
        try {
          await run(() => getInfo(w.id, true));
        } catch {
          /* keep the old numbers; the next refresh tries again */
        }
        await sleep(300);
      }
    } finally {
      watchBusy = false;
      renderPanel();
    }
  }

  async function recordRank(app) {
    const q = pageQuery();
    if (!q || !app.rank) return;
    const key = 'kw:' + app.id;
    const got = await storageGet('local', key);
    storageSet('local', { [key]: P.pushRank(got[key], q, app.rank) });
  }

  // ---------- formatting ----------

  const full = (n) => (n == null ? null : Number(n).toLocaleString('en-US'));

  function pct(x, digits) {
    if (x == null || isNaN(x)) return null;
    const v = x * 100;
    const d = digits != null ? digits : v < 10 ? 1 : 0;
    return v.toFixed(d).replace(/\.0$/, '') + '%';
  }

  function installsText(info) {
    if (!info) return null;
    if (state.flags.exact && info.installs != null) return P.compact(info.installs);
    return info.downloads || (info.installs != null ? P.compact(info.installs) : null);
  }

  function freshnessClass(info) {
    const t = P.updatedMs(info);
    if (t == null) return '';
    const days = (Date.now() - t) / P.DAY_MS;
    if (days <= 180) return 'plsi-fresh';
    if (days <= 540) return 'plsi-aging';
    return 'plsi-stale';
  }

  function shortDate(v) {
    const t = typeof v === 'number' ? v : Date.parse(v);
    if (isNaN(t)) return String(v);
    const d = new Date(t);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2);
  }

  function ago(t) {
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.round(hours / 24);
    return days < 30 ? days + 'd ago' : Math.round(days / 30) + 'mo ago';
  }

  const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  // Age and pace of an app, as one short line for the cards.
  function growth(app) {
    const info = app.info;
    const days = P.ageDays(info);
    if (days == null) return null;
    const v = P.velocity(app.hist);
    const avg = P.perDay(info);
    const bits = [P.ageLabel(days) + ' old'];
    const tips = ['Released ' + (info.released || shortDate(info.releasedTs * 1000))];
    if (v) {
      bits.push(P.compact(v.perDay) + '/day now');
      tips.push(
        full(Math.round(v.perDay)) + ' installs a day, measured over the last ' + Math.round(v.days) + ' days'
      );
    } else if (avg != null) {
      bits.push('~' + P.compact(avg) + '/day');
    }
    if (avg != null) tips.push('average since launch: ' + full(Math.round(avg)) + ' installs a day');
    return { text: bits.join(' · '), title: tips.join(' · '), cls: P.ageClass(days) };
  }

  // ---------- DOM helpers ----------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(label, title, onClick, cls) {
    const b = el('button', 'plsi-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (title) b.title = title;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick(ev, b);
    });
    return b;
  }

  function select(options, value, onChange, title) {
    const s = el('select', 'plsi-select');
    if (title) s.title = title;
    for (const [v, label] of options) {
      const o = el('option', null, label);
      o.value = String(v);
      s.appendChild(o);
    }
    s.value = String(value);
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  function link(href, text, cls) {
    const a = el('a', cls || 'plsi-link', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function flashBtn(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = old), 1200);
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(
      () => flashBtn(btn, '✓'),
      () => flashBtn(btn, '✗')
    );
  }

  function download(name, mime, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = el('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  // The byte-order mark is what makes Excel read the file as UTF-8.
  const downloadCsv = (name, lines) => download(name, 'text/csv;charset=utf-8', '﻿' + lines.join('\r\n'));
  const downloadJson = (name, data) => download(name, 'application/json', JSON.stringify(data, null, 2));

  // ---------- icon badge (overlay mode) ----------

  function renderBadge(badge, app) {
    const info = app.info;
    badge.classList.remove('plsi-loading', 'plsi-error');
    badge.textContent = '';
    badge.plsiApp = app; // kept so the badge can re-render if the icon resizes
    // A search or list-row icon is ~64px wide; the full strip would just be
    // clipped there. The card prints the rating right beside the icon anyway,
    // so a small badge keeps the two things the card doesn't say: how many
    // installs, and how recently it was updated.
    const tight = badge.classList.contains('plsi-badge-sm');
    const installs = installsText(info);
    const line1 = [];
    if (state.flags.rank && app.rank) line1.push('#' + app.rank);
    if (installs) line1.push('⬇' + installs);
    if (tight) {
      if (!installs && info.rating != null) line1.push(info.rating + '★');
    } else if (info.reviews != null) {
      const r = info.rating != null ? info.rating + '★ ' : '';
      line1.push(r + P.compact(info.reviews));
    }
    if (line1.length) badge.appendChild(el('span', null, line1.join(' · ')));
    if (info.updated) {
      const when = tight ? shortDate(info.updated) : info.updated;
      badge.appendChild(el('span', freshnessClass(info), '⟳ ' + when));
    }
    const g = !tight && state.flags.age ? growth(app) : null;
    if (g) badge.appendChild(el('span', g.cls, g.text));
    if (!badge.childNodes.length) badge.appendChild(el('span', null, 'no data'));
  }

  // ---------- info lines under the card's rating (inline mode) ----------

  function renderInline(box, app) {
    const info = app.info;
    box.classList.remove('plsi-loading');
    box.textContent = '';
    // The card already shows the rating — add installs, rating count, update
    // date, and how old the app is.
    const line1 = [];
    const installs = installsText(info);
    if (installs) line1.push('⬇' + installs);
    if (info.reviews != null) line1.push(P.compact(info.reviews) + ' rv');
    const showRank = state.flags.rank && app.rank;
    if (line1.length || showRank) {
      const span = el('span');
      if (showRank) {
        const chip = el('b', 'plsi-rank', '#' + app.rank);
        chip.title = 'Position ' + app.rank + ' in this search';
        span.appendChild(chip);
      }
      span.appendChild(document.createTextNode(line1.join(' · ')));
      if (info.installs != null) span.title = full(info.installs) + ' installs';
      box.appendChild(span);
    }
    if (info.updated) {
      box.appendChild(el('span', freshnessClass(info), '⟳ ' + info.updated));
    }
    const g = state.flags.age ? growth(app) : null;
    if (g) {
      const span = el('span', g.cls, g.text);
      span.title = g.title;
      box.appendChild(span);
    }
    if (!box.childNodes.length) box.appendChild(el('span', null, 'no data'));
  }

  function rerenderCards() {
    for (const app of state.apps.values()) {
      if (app.status !== 'ok' || !app.info) continue;
      if (app.badge) renderBadge(app.badge, app);
      if (app.inline) renderInline(app.inline, app);
    }
  }

  function ratingLineEl(a) {
    // Deepest short element containing the ★ glyph = the card's rating line.
    let best = null;
    for (const e of a.querySelectorAll('*')) {
      if (e.closest('.plsi-inline, .plsi-badge')) continue;
      const t = (e.textContent || '').trim();
      if (t.length <= 10 && t.includes('★')) best = e;
    }
    if (!best) return null;
    // Climb to the whole rating block (parents that hold nothing but this text).
    const t = best.textContent.trim();
    while (
      best.parentElement &&
      best.parentElement !== a &&
      best.parentElement.textContent.trim() === t
    ) {
      best = best.parentElement;
    }
    return best;
  }

  function attachInline(app, a) {
    const box = el('div', 'plsi-inline plsi-loading', '…');
    box.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });
    const rating = ratingLineEl(a);
    if (rating && rating.parentElement) {
      rating.parentElement.insertBefore(box, rating.nextSibling);
    } else {
      a.appendChild(box); // card without rating — put it at the end
    }
    app.inline = box;
    if (app.status === 'ok' && app.info) renderInline(box, app);
  }

  // ---------- side panel: columns ----------
  //
  // val() feeds sorting and returns null when the app has no such number, so
  // those rows sink to the bottom whichever way the column is sorted.

  const COLS = [
    {
      key: 'rank',
      label: '#',
      w: 36,
      tip: 'Position in this search',
      only: 'search',
      dir: 1,
      val: (a) => a.rank ?? null,
      text: (a) => (a.rank ? String(a.rank) : '—'),
    },
    {
      key: 'name',
      label: 'App',
      tip: 'App name',
      fixed: true,
      dir: 1,
      val: (a) => (a.name || a.id).toLowerCase(),
    },
    {
      key: 'downloads',
      label: '⬇',
      w: 60,
      tip: 'Installs',
      val: (a) => P.installsOf(a.info),
      text: (a) => installsText(a.info),
      title: (a) =>
        a.info.installs != null
          ? full(a.info.installs) + ' installs · shown on Play as ' + (a.info.downloads || '—')
          : null,
    },
    {
      key: 'rating',
      label: '★',
      w: 44,
      tip: 'Average rating',
      val: (a) => a.info?.score ?? a.info?.rating ?? null,
      text: (a) => (a.info.rating != null ? String(a.info.rating) : null),
      title: (a) => (a.info.score != null ? String(a.info.score) : null),
    },
    {
      key: 'reviews',
      label: 'Rv',
      w: 54,
      tip: 'Number of ratings',
      val: (a) => a.info?.reviews ?? null,
      text: (a) => (a.info.reviews != null ? P.compact(a.info.reviews) : null),
      title: (a) => (a.info.reviews != null ? full(a.info.reviews) + ' ratings' : null),
    },
    {
      key: 'updated',
      label: 'Updated',
      w: 70,
      tip: 'Last update',
      val: (a) => P.updatedMs(a.info),
      text: (a) => (a.info.updated ? shortDate(a.info.updated) : null),
      title: (a) => a.info.updated || null,
      cls: (a) => freshnessClass(a.info),
    },
    {
      key: 'age',
      label: 'Age',
      w: 50,
      tip: 'Time since first release',
      dir: 1,
      val: (a) => P.ageDays(a.info),
      text: (a) => P.ageLabel(P.ageDays(a.info)),
      title: (a) => (a.info.released ? 'Released ' + a.info.released : null),
      cls: (a) => P.ageClass(P.ageDays(a.info)),
    },
    {
      key: 'perday',
      label: 'Avg/d',
      w: 58,
      tip: 'Average installs per day since launch',
      val: (a) => P.perDay(a.info),
      text: (a) => P.compact(P.perDay(a.info)),
      title: (a) => {
        const v = P.perDay(a.info);
        return v != null ? full(Math.round(v)) + ' installs a day on average since launch' : null;
      },
    },
    {
      key: 'now',
      label: 'Now/d',
      w: 58,
      tip: 'Installs per day, measured between the snapshots saved on this device',
      val: (a) => P.velocity(a.hist)?.perDay ?? null,
      text: (a) => {
        const v = P.velocity(a.hist);
        return v ? P.compact(v.perDay) : null;
      },
      title: (a) => {
        const v = P.velocity(a.hist);
        return v
          ? full(Math.round(v.perDay)) + ' installs a day between ' + shortDate(v.from) + ' and ' + shortDate(v.to)
          : 'Needs two snapshots at least a day apart';
      },
    },
    {
      key: 'low',
      label: '1–2★',
      w: 84,
      tip: 'Share of 1 and 2 star ratings, with the spread from 1★ to 5★',
      val: (a) => P.lowShare(a.info),
      cell: (td, a) => {
        const s = a.info.stars;
        if (!s) return false;
        td.appendChild(miniStars(s));
        td.appendChild(el('span', null, pct(P.lowShare(a.info), 0)));
        td.title = [5, 4, 3, 2, 1].map((n) => n + '★ ' + full(s[n - 1])).join(' · ');
        return true;
      },
    },
    {
      key: 'money',
      label: 'Price',
      w: 132,
      left: true,
      tip: 'Price, in-app purchases and ads',
      val: (a) => (a.info ? (a.info.price || 0) + (a.info.iapMax || 0) : null),
      cell: (td, a) => {
        const chips = moneyChips(a.info, true);
        if (!chips.childNodes.length) return false;
        td.appendChild(chips);
        return true;
      },
    },
    {
      key: 'rate',
      label: 'Rv/⬇',
      w: 56,
      tip: 'Ratings per 100 installs',
      val: (a) => P.rateShare(a.info),
      text: (a) => pct(P.rateShare(a.info)),
    },
    {
      key: 'genre',
      label: 'Category',
      w: 104,
      left: true,
      tip: 'Category',
      dir: 1,
      val: (a) => a.info?.genre?.toLowerCase() ?? null,
      text: (a) => a.info.genre || null,
    },
    {
      key: 'version',
      label: 'Version',
      w: 78,
      left: true,
      tip: 'Current version',
      val: (a) => a.info?.version ?? null,
      text: (a) => a.info.version || null,
    },
    {
      key: 'minAndroid',
      label: 'Min OS',
      w: 58,
      tip: 'Lowest Android version supported',
      val: (a) => parseFloat(a.info?.minAndroid) || null,
      text: (a) => a.info.minAndroid || null,
    },
    {
      key: 'dev',
      label: 'Developer',
      w: 124,
      left: true,
      tip: 'Developer',
      dir: 1,
      val: (a) => a.info?.dev?.toLowerCase() ?? null,
      text: (a) => a.info.dev || null,
    },
  ];

  function visibleCols() {
    const kind = pageKind();
    return COLS.filter((c) => {
      if (c.fixed) return true;
      if (c.only) return state.view === 'page' && c.only === kind && state.flags.rank;
      return state.cols.includes(c.key);
    });
  }

  // Five thin columns, 1★ on the left. Height is each star's share of the
  // biggest one; the two low ones are tinted so a bad spread shows at a glance.
  function miniStars(stars) {
    const max = Math.max(...stars, 1);
    const box = el('span', 'plsi-mini');
    stars.forEach((n, i) => {
      const bar = el('i', i < 2 ? 'plsi-mini-low' : null);
      bar.style.height = Math.max(8, Math.round((n / max) * 100)) + '%';
      box.appendChild(bar);
    });
    return box;
  }

  function moneyChips(info, brief) {
    const box = el('span', 'plsi-chips');
    if (!info) return box;
    if (info.price != null) {
      box.appendChild(
        info.price > 0
          ? el('span', 'plsi-chip plsi-chip-paid', info.priceText || String(info.price))
          : el('span', 'plsi-chip', 'Free')
      );
    }
    if (info.iap) {
      const c = el('span', 'plsi-chip plsi-chip-iap', brief ? 'IAP' : 'IAP ' + info.iap);
      c.title = 'In-app purchases: ' + info.iap + ' per item';
      box.appendChild(c);
    }
    if (info.ads) box.appendChild(el('span', 'plsi-chip plsi-chip-ads', 'Ads'));
    return box;
  }

  // ---------- side panel: filters ----------

  const FILTERS = [
    {
      key: 'min',
      label: 'Installs at least',
      options: [['', 'Any'], [1e3, '1K'], [1e4, '10K'], [1e5, '100K'], [1e6, '1M'], [1e7, '10M']],
      test: (i, v) => (P.installsOf(i) ?? -1) >= +v,
    },
    {
      key: 'max',
      label: 'Installs at most',
      options: [['', 'Any'], [1e4, '10K'], [1e5, '100K'], [1e6, '1M'], [1e7, '10M']],
      test: (i, v) => {
        const n = P.installsOf(i);
        return n != null && n <= +v;
      },
    },
    {
      key: 'age',
      label: 'Released within',
      options: [['', 'Any'], [30, '30 days'], [90, '90 days'], [365, '1 year'], [730, '2 years']],
      test: (i, v) => {
        const d = P.ageDays(i);
        return d != null && d <= +v;
      },
    },
    {
      key: 'upd',
      label: 'Updated',
      options: [['', 'Any'], ['90', 'Within 90 days'], ['365', 'Within 1 year'], ['old', 'Not for 18+ months']],
      test: (i, v) => {
        const t = P.updatedMs(i);
        if (t == null) return false;
        const d = (Date.now() - t) / P.DAY_MS;
        return v === 'old' ? d > 540 : d <= +v;
      },
    },
    {
      key: 'rating',
      label: 'Rating',
      options: [['', 'Any'], ['4.5', '4.5 and up'], ['4', '4.0 and up'], ['low', 'Below 4.0']],
      test: (i, v) => {
        if (i.rating == null) return false;
        return v === 'low' ? i.rating < 4 : i.rating >= +v;
      },
    },
    {
      key: 'price',
      label: 'Price',
      options: [['', 'Any'], ['free', 'Free'], ['paid', 'Paid']],
      test: (i, v) => (v === 'paid' ? i.price > 0 : !(i.price > 0)),
    },
    {
      key: 'iap',
      label: 'In-app purchases',
      options: [['', 'Any'], ['yes', 'Yes'], ['no', 'No']],
      test: (i, v) => !!i.iap === (v === 'yes'),
    },
    {
      key: 'ads',
      label: 'Ads',
      options: [['', 'Any'], ['yes', 'Yes'], ['no', 'No']],
      test: (i, v) => !!i.ads === (v === 'yes'),
    },
  ];

  const activeFilters = () => FILTERS.filter((f) => state.filter[f.key]);

  // Apps still loading pass: there is nothing to judge them by yet.
  function passes(app) {
    const on = activeFilters();
    if (!on.length || !app.info) return true;
    return on.every((f) => f.test(app.info, state.filter[f.key]));
  }

  // The same filter dims the cards on the page, so what the table hides is
  // easy to skip with the eye as well.
  function dimCards() {
    const on = activeFilters().length > 0;
    for (const app of state.apps.values()) {
      if (!app.anchor) continue;
      app.anchor.classList.toggle('plsi-dim', on && app.status === 'ok' && !passes(app));
    }
  }

  // ---------- side panel: shell ----------

  let panel = null;
  let panelCount = null;
  let panelTabs = []; // view switcher buttons
  let tabAction = null; // Clear (recent) / Refresh (watchlist)
  let toolBtns = {};
  let toolbar = null;
  let summaryBox = null;
  let listWrap = null;
  let table = null;
  let emptyNote = null;
  let kwView = null;
  let fab = null; // floating toggle button
  let renderTimer = null;

  function setView(view) {
    if (state.view === view) return;
    state.view = view;
    // "page" order and "recent" order mean different things — start each view
    // in its own natural order rather than carrying a sort across.
    state.sort = { key: 'page', dir: 1 };
    state.drawer = null;
    if (state.tool && view === 'keywords') setTool(null);
    if (view === 'recent' || view === 'watch') loadHistories();
    if (view === 'watch') refreshWatch(CACHE_TTL_MS);
    if (view === 'keywords' && !state.kw.seed) state.kw.seed = pageQuery() || '';
    renderPanel();
  }

  async function loadHistories() {
    const ids = (state.view === 'watch' ? [...state.watch.keys()] : state.recent.map((r) => r.id)).filter(
      (id) => !state.hist.has(id)
    );
    if (!ids.length) return;
    const got = await storageGet(
      'local',
      ids.map((id) => 'h:' + id)
    );
    for (const id of ids) state.hist.set(id, got['h:' + id] || []);
    schedulePanelRender();
  }

  function setTool(tool) {
    state.tool = state.tool === tool ? null : tool;
    renderToolbar();
  }

  function ensurePanel() {
    if (panel) return;

    fab = el('button', 'plsi-fab', '📊');
    fab.title = 'PlayLens — app list';
    fab.addEventListener('click', () => {
      state.flags.panelOpen = !state.flags.panelOpen;
      storageSet('sync', { panelOpen: state.flags.panelOpen });
      setPanelOpen(state.flags.panelOpen);
    });
    document.documentElement.appendChild(fab);

    panel = el('div', 'plsi-panel');

    const header = el('div', 'plsi-panel-header');
    const title = el('div', 'plsi-panel-title', 'PlayLens');
    panelCount = el('span', 'plsi-panel-count', '0');
    title.appendChild(panelCount);
    header.appendChild(title);

    const controls = el('div', 'plsi-panel-controls');
    toolBtns = {
      cols: button('Columns', 'Choose which columns to show', () => setTool('cols')),
      filter: button('Filter', 'Show only the apps that match', () => setTool('filter')),
      export: button('Export', 'Copy or download this list', () => setTool('export')),
    };
    for (const b of Object.values(toolBtns)) controls.appendChild(b);
    controls.appendChild(
      button('✕', 'Close panel', () => {
        state.flags.panelOpen = false;
        storageSet('sync', { panelOpen: false });
        setPanelOpen(false);
      })
    );
    header.appendChild(controls);
    panel.appendChild(header);

    const tabs = el('div', 'plsi-tabs');
    for (const t of [
      { key: 'page', label: 'This page', title: 'Apps found on the page you are on' },
      { key: 'recent', label: 'Recent', title: 'Apps whose detail page you opened, saved on this device' },
      { key: 'watch', label: 'Watchlist', title: 'Apps you follow: daily numbers and what changed' },
      { key: 'keywords', label: 'Keywords', title: 'Search suggestions and how open each term looks' },
    ]) {
      const b = el('button', 'plsi-tab', t.label);
      b.type = 'button';
      b.dataset.view = t.key;
      b.dataset.label = t.label;
      b.title = t.title;
      b.addEventListener('click', () => setView(t.key));
      tabs.appendChild(b);
      panelTabs.push(b);
    }
    tabAction = button('', '', () => {
      if (state.view === 'recent') clearRecent();
      else if (state.view === 'watch') refreshWatch(60 * 1000);
    }, 'plsi-clear');
    tabs.appendChild(tabAction);
    panel.appendChild(tabs);

    toolbar = el('div', 'plsi-toolbar plsi-hidden');
    panel.appendChild(toolbar);

    summaryBox = el('div', 'plsi-summary plsi-hidden');
    panel.appendChild(summaryBox);

    listWrap = el('div', 'plsi-panel-list');
    table = el('table', 'plsi-table');
    listWrap.appendChild(table);
    panel.appendChild(listWrap);

    kwView = el('div', 'plsi-kw plsi-hidden');
    panel.appendChild(kwView);

    document.documentElement.appendChild(panel);
    renderToolbar();
    renderPanel();
  }

  function removePanel() {
    panel?.remove();
    fab?.remove();
    panel = panelCount = tabAction = toolbar = summaryBox = listWrap = table = emptyNote = kwView = fab = null;
    panelTabs = [];
    toolBtns = {};
  }

  function setPanelOpen(open) {
    if (!panel) return;
    panel.classList.toggle('plsi-open', open);
    fab.classList.toggle('plsi-hidden', open);
  }

  // ---------- side panel: toolbar (columns, filter, export) ----------

  function renderToolbar() {
    if (!toolbar) return;
    toolbar.textContent = '';
    toolbar.classList.toggle('plsi-hidden', !state.tool);
    for (const [k, b] of Object.entries(toolBtns)) {
      b.classList.toggle('plsi-btn-on', state.tool === k);
    }
    markFilterButton();
    if (state.tool === 'cols') {
      const grid = el('div', 'plsi-checks');
      for (const c of COLS) {
        if (c.fixed || c.only) continue;
        const label = el('label', 'plsi-check');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = state.cols.includes(c.key);
        box.addEventListener('change', () => {
          const next = new Set(state.cols);
          if (box.checked) next.add(c.key);
          else next.delete(c.key);
          state.cols = COLS.map((x) => x.key).filter((k) => next.has(k));
          storageSet('sync', { cols: state.cols });
          renderPanel();
        });
        label.appendChild(box);
        label.appendChild(el('span', null, c.label === c.tip ? c.label : c.label + ' · ' + c.tip));
        grid.appendChild(label);
      }
      toolbar.appendChild(grid);
      toolbar.appendChild(
        button('Reset', 'Back to the default columns', () => {
          state.cols = [...DEFAULT_COLS];
          storageSet('sync', { cols: state.cols });
          renderToolbar();
          renderPanel();
        })
      );
    } else if (state.tool === 'filter') {
      const grid = el('div', 'plsi-fields');
      for (const f of FILTERS) {
        const label = el('label', 'plsi-field');
        label.appendChild(el('span', null, f.label));
        label.appendChild(
          select(f.options, state.filter[f.key] ?? '', (v) => {
            if (v) state.filter[f.key] = v;
            else delete state.filter[f.key];
            markFilterButton();
            renderPanel();
          })
        );
        grid.appendChild(label);
      }
      toolbar.appendChild(grid);
      toolbar.appendChild(
        button('Clear filters', 'Show every app again', () => {
          state.filter = {};
          renderToolbar();
          renderPanel();
        })
      );
    } else if (state.tool === 'export') {
      const row = el('div', 'plsi-actions');
      row.appendChild(button('Copy CSV', 'Copy the list to the clipboard', (ev, b) => copyText(listCsv().join('\n'), b)));
      row.appendChild(
        button('Download CSV', 'Save the list as a .csv file', () => downloadCsv(exportName() + '.csv', listCsv()))
      );
      row.appendChild(
        button('Download JSON', 'Save the list as a .json file', () => downloadJson(exportName() + '.json', listJson()))
      );
      toolbar.appendChild(row);
      toolbar.appendChild(
        el('div', 'plsi-note', 'Every field is exported, not only the visible columns. Filters apply.')
      );
    }
  }

  function markFilterButton() {
    if (!toolBtns.filter) return;
    const n = activeFilters().length;
    toolBtns.filter.textContent = n ? 'Filter · ' + n : 'Filter';
  }

  // ---------- export of the app list ----------

  const EXPORT_FIELDS = [
    ['package', (a) => a.id],
    ['name', (a) => a.name || ''],
    ['rank', (a) => a.rank ?? ''],
    ['keyword', (a) => (a.rank ? pageQuery() || '' : '')],
    ['installs', (a, i) => i.installs ?? ''],
    ['installs_shown', (a, i) => i.downloads || ''],
    ['rating', (a, i) => i.score ?? i.rating ?? ''],
    ['ratings', (a, i) => i.reviews ?? ''],
    ['written_reviews', (a, i) => i.textReviews ?? ''],
    ['star_1', (a, i) => i.stars?.[0] ?? ''],
    ['star_2', (a, i) => i.stars?.[1] ?? ''],
    ['star_3', (a, i) => i.stars?.[2] ?? ''],
    ['star_4', (a, i) => i.stars?.[3] ?? ''],
    ['star_5', (a, i) => i.stars?.[4] ?? ''],
    ['low_star_share', (a, i) => round(P.lowShare(i), 4)],
    ['ratings_per_install', (a, i) => round(P.rateShare(i), 5)],
    ['released', (a, i) => isoDay(i.releasedTs)],
    ['age_days', (a, i) => round(P.ageDays(i), 0)],
    // some listings carry the update only as text; updatedMs reads both
    ['updated', (a, i) => isoDay(Math.floor((P.updatedMs(i) || 0) / 1000)) || i.updated || ''],
    ['installs_per_day_average', (a, i) => round(P.perDay(i), 1)],
    ['installs_per_day_measured', (a) => round(P.velocity(a.hist)?.perDay, 1)],
    ['measured_over_days', (a) => round(P.velocity(a.hist)?.days, 1)],
    ['price', (a, i) => i.price ?? ''],
    ['currency', (a, i) => i.currency || ''],
    ['in_app_purchases', (a, i) => i.iap || ''],
    ['ads', (a, i) => (i.v ? (i.ads ? 'yes' : 'no') : '')],
    ['category', (a, i) => i.genre || ''],
    ['version', (a, i) => i.version || ''],
    ['min_android', (a, i) => i.minAndroid || ''],
    ['content_rating', (a, i) => i.contentRating || ''],
    ['developer', (a, i) => i.dev || ''],
    ['developer_email', (a, i) => i.devEmail || ''],
    ['developer_website', (a, i) => i.devSite || ''],
    ['privacy_policy', (a, i) => i.privacy || ''],
    ['summary', (a, i) => i.summary || ''],
    ['url', (a) => 'https://play.google.com/store/apps/details?id=' + a.id],
  ];

  function round(v, digits) {
    if (v == null || isNaN(v)) return '';
    const m = 10 ** digits;
    return Math.round(v * m) / m;
  }

  const isoDay = (sec) => (sec ? new Date(sec * 1000).toISOString().slice(0, 10) : '');

  const exportRows = () => currentRows().filter((a) => a.info && passes(a));

  function listCsv() {
    const lines = [P.csvLine(EXPORT_FIELDS.map(([name]) => name))];
    for (const a of exportRows()) {
      lines.push(P.csvLine(EXPORT_FIELDS.map(([, get]) => get(a, a.info))));
    }
    return lines;
  }

  function listJson() {
    return exportRows().map((a) => {
      const row = {};
      for (const [name, get] of EXPORT_FIELDS) {
        const v = get(a, a.info);
        if (v !== '') row[name] = v;
      }
      if (a.info.whatsNew) row.whats_new = a.info.whatsNew;
      if (a.info.shots) row.screenshots = a.info.shots;
      if (a.info.safety) row.data_safety = a.info.safety.map((s) => s.join(': '));
      if (a.hist?.length) {
        row.snapshots = a.hist.map((s) => ({ date: isoDay(s[0]), installs: s[1], ratings: s[2] }));
      }
      return row;
    });
  }

  function exportName() {
    const what =
      state.view !== 'page'
        ? state.view
        : pageKind() === 'search'
          ? slug(pageQuery() || 'search')
          : pageKind();
    return 'playlens-' + what + '-' + stamp();
  }

  // ---------- side panel: rows ----------

  function sortValue(app, key) {
    if (key === 'page') return app.order;
    const col = COLS.find((c) => c.key === key);
    if (!col) return app.order;
    const v = col.val(app);
    return v == null || (typeof v === 'number' && isNaN(v)) ? null : v;
  }

  // Rows for whichever view is showing. Stored entries are flat, so they are
  // shaped like scanned apps here and every view shares one render path.
  function currentRows() {
    if (state.view === 'recent') {
      return sortRows(
        state.recent.map((r, i) => ({
          id: r.id,
          name: r.name,
          icon: r.icon,
          info: r.info,
          hist: state.hist.get(r.id) || [],
          seenAt: r.t,
          order: i, // storage order is newest-first
          status: 'ok',
        }))
      );
    }
    if (state.view === 'watch') {
      return sortRows(
        [...state.watch.values()]
          .sort((a, b) => (b.unseen ? 1 : 0) - (a.unseen ? 1 : 0) || b.added - a.added)
          .map((w, i) => ({
            id: w.id,
            name: w.name,
            icon: w.icon,
            info: w.info,
            hist: state.hist.get(w.id) || [],
            watched: w,
            order: i,
            status: 'ok',
          }))
      );
    }
    return sortRows([...state.apps.values()]);
  }

  function sortRows(apps) {
    const { key, dir } = state.sort;
    apps.sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (va == null || vb == null) {
        if (va == null && vb == null) return a.order - b.order;
        return va == null ? 1 : -1;
      }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.order - b.order;
    });
    return apps;
  }

  function schedulePanelRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      renderPanel();
    }, 250);
  }

  const EMPTY = {
    page: 'No app cards found on this page.',
    recent: 'No apps yet. Open an app’s page and it lands here.',
    watch: 'Nothing watched yet. Press ☆ next to an app to follow its numbers day by day.',
  };

  function renderPanel() {
    if (!panel) return;

    const unseen = [...state.watch.values()].filter((w) => w.unseen).length;
    for (const b of panelTabs) {
      b.classList.toggle('plsi-tab-active', b.dataset.view === state.view);
      if (b.dataset.view === 'watch') {
        b.textContent = b.dataset.label + (state.watch.size ? ' ' + state.watch.size : '');
        b.classList.toggle('plsi-tab-dot', unseen > 0);
      }
    }

    const showAction =
      (state.view === 'recent' && state.recent.length > 0) || (state.view === 'watch' && state.watch.size > 0);
    tabAction.classList.toggle('plsi-hidden', !showAction);
    if (state.view === 'recent') {
      tabAction.textContent = 'Clear';
      tabAction.title = 'Forget every app in the recent list';
    } else if (state.view === 'watch') {
      tabAction.textContent = watchBusy ? 'Refreshing…' : 'Refresh';
      tabAction.title = 'Read the latest numbers of every watched app';
      tabAction.disabled = watchBusy;
    }

    const keywords = state.view === 'keywords';
    listWrap.classList.toggle('plsi-hidden', keywords);
    kwView.classList.toggle('plsi-hidden', !keywords);
    for (const b of Object.values(toolBtns)) b.classList.toggle('plsi-hidden', keywords);
    if (keywords) {
      toolbar.classList.add('plsi-hidden');
      summaryBox.classList.add('plsi-hidden');
      panelCount.textContent = String(state.kw.items.length);
      panel.style.width = '';
      renderKeywords();
      return;
    }
    toolbar.classList.toggle('plsi-hidden', !state.tool);

    const all = currentRows();
    const rows = all.filter(passes);
    panelCount.textContent = rows.length === all.length ? String(all.length) : rows.length + ' of ' + all.length;
    dimCards();
    renderSummary();

    const cols = visibleCols();
    const width = 34 + 210 + cols.reduce((s, c) => s + (c.w || 0), 0);
    panel.style.width = Math.max(420, width) + 'px';
    table.style.minWidth = width + 'px';
    table.textContent = '';

    const group = el('colgroup');
    const lead = el('col');
    lead.style.width = '34px';
    group.appendChild(lead);
    for (const c of cols) {
      const col = el('col');
      if (c.w) col.style.width = c.w + 'px';
      group.appendChild(col);
    }
    table.appendChild(group);

    const thead = el('thead');
    const head = el('tr');
    head.appendChild(el('th', 'plsi-col-lead'));
    for (const c of cols) {
      const on = state.sort.key === c.key;
      const th = el(
        'th',
        (c.fixed ? 'plsi-col-app' : c.left ? 'plsi-col-text' : 'plsi-col-num') + (on ? ' plsi-th-active' : ''),
        c.label + (on ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : '')
      );
      th.title = c.tip + ' — click to sort';
      th.addEventListener('click', () => {
        if (state.sort.key === c.key) state.sort.dir = -state.sort.dir;
        // sensible first direction: names A→Z, numbers biggest first
        else state.sort = { key: c.key, dir: c.dir || -1 };
        renderPanel();
      });
      head.appendChild(th);
    }
    thead.appendChild(head);
    table.appendChild(thead);

    const body = el('tbody');
    if (state.drawer && !rows.some((r) => r.id === state.drawer.id)) state.drawer = null;
    for (const app of rows) {
      body.appendChild(buildRow(app, cols));
      if (state.drawer?.id === app.id) {
        const tr = el('tr', 'plsi-drawer-row');
        const td = el('td');
        td.colSpan = cols.length + 1;
        td.appendChild(state.drawer.el);
        tr.appendChild(td);
        body.appendChild(tr);
      }
    }
    table.appendChild(body);

    if (emptyNote) {
      emptyNote.remove();
      emptyNote = null;
    }
    if (!rows.length) {
      emptyNote = el('div', 'plsi-empty', all.length ? 'No app matches the filters.' : EMPTY[state.view]);
      listWrap.appendChild(emptyNote);
    }
  }

  function buildRow(app, cols) {
    const open = state.drawer?.id === app.id;
    const tr = el('tr', 'plsi-row' + (app.self ? ' plsi-row-self' : '') + (open ? ' plsi-row-open' : ''));
    tr.addEventListener('click', () => {
      location.href = 'https://play.google.com/store/apps/details?id=' + app.id;
    });

    const tdLead = el('td', 'plsi-col-lead');
    const more = button(open ? '▾' : '▸', open ? 'Hide details' : 'Show details', () => toggleDrawer(app), 'plsi-more');
    more.disabled = !app.info;
    tdLead.appendChild(more);
    tr.appendChild(tdLead);

    for (const c of cols) {
      if (c.fixed) {
        tr.appendChild(buildAppCell(app));
        continue;
      }
      if (app.status !== 'ok' || !app.info) {
        if (c.key === 'rank') {
          tr.appendChild(el('td', 'plsi-col-num', c.text(app)));
          continue;
        }
        const td = el(
          'td',
          app.status === 'error' ? 'plsi-row-error' : 'plsi-row-muted',
          app.status === 'error' ? 'fetch failed' : '…'
        );
        td.colSpan = cols.length - cols.indexOf(c);
        tr.appendChild(td);
        break;
      }
      const td = el('td', (c.left ? 'plsi-col-text' : 'plsi-col-num') + ' ' + (c.cls ? c.cls(app) : ''));
      if (c.cell) {
        if (!c.cell(td, app)) td.textContent = '—';
      } else {
        td.textContent = c.text(app) ?? '—';
        const tip = c.title?.(app);
        if (tip) td.title = tip;
      }
      tr.appendChild(td);
    }
    return tr;
  }

  function buildAppCell(app) {
    const td = el('td', 'plsi-col-app');
    const cell = el('div', 'plsi-app-cell');
    if (app.icon) {
      const img = document.createElement('img');
      img.className = 'plsi-row-icon';
      img.src = app.icon;
      img.alt = '';
      img.loading = 'lazy';
      cell.appendChild(img);
    } else {
      cell.appendChild(el('div', 'plsi-row-icon plsi-row-noicon', '?'));
    }
    const label = el('div', 'plsi-row-label');
    const name = el('span', 'plsi-row-name', app.name || app.id);
    name.title = app.name || app.id;
    label.appendChild(name);
    const w = state.watch.get(app.id);
    if (state.view === 'watch' && w) {
      const last = w.changes?.[0];
      const sub = el(
        'span',
        'plsi-row-sub' + (w.unseen ? ' plsi-row-news' : ''),
        last ? last.f + ': ' + last.a + ' → ' + last.b : 'checked ' + ago(w.checked || w.added)
      );
      if (last) sub.title = ago(last.t);
      label.appendChild(sub);
    } else if (app.self) {
      label.appendChild(el('span', 'plsi-row-sub', 'this app'));
    } else if (app.seenAt) {
      label.appendChild(el('span', 'plsi-row-sub', ago(app.seenAt)));
    }
    cell.appendChild(label);

    const star = button(w ? '★' : '☆', w ? 'Stop watching' : 'Watch this app', () => toggleWatch(app), 'plsi-star');
    star.classList.toggle('plsi-star-on', !!w);
    star.disabled = !w && !app.info;
    cell.appendChild(star);

    td.appendChild(cell);
    return td;
  }

  function toggleDrawer(app) {
    if (state.drawer?.id === app.id) {
      state.drawer = null;
    } else {
      state.drawer = { id: app.id, el: buildDrawer(app) };
      markSeen(app.id);
    }
    renderPanel();
  }

  // ---------- side panel: what the page adds up to ----------

  function stat(label, value, tip) {
    const box = el('div', 'plsi-stat');
    box.appendChild(el('b', null, value ?? '—'));
    box.appendChild(el('span', null, label));
    if (tip) box.title = tip;
    return box;
  }

  function renderSummary() {
    summaryBox.textContent = '';
    const apps = state.view === 'page' ? [...state.apps.values()].filter((a) => !a.self) : [];
    const ready = apps.filter((a) => a.status === 'ok' && a.info).sort((a, b) => a.order - b.order);
    const kind = pageKind();
    if (ready.length < 2 || kind === 'detail') {
      summaryBox.classList.add('plsi-hidden');
      return;
    }
    summaryBox.classList.remove('plsi-hidden');
    const infos = ready.map((a) => a.info);

    if (kind === 'search') {
      const top = apps
        .filter((a) => a.rank && a.rank <= 10)
        .sort((a, b) => a.rank - b.rank);
      const loaded = top.filter((a) => a.info).map((a) => a.info);
      // an app that failed to load is left out; one still loading holds the score back
      const o = top.some((a) => a.status === 'loading') ? null : P.opportunity(loaded);
      const s = P.summarize(loaded);
      const head = el('div', 'plsi-summary-head');
      head.appendChild(el('span', 'plsi-summary-title', '“' + (pageQuery() || '') + '” · top ' + top.length));
      if (o) head.appendChild(scorePill(o));
      else if (top.some((a) => a.status === 'loading')) {
        head.appendChild(el('span', 'plsi-note', 'reading ' + loaded.length + ' of ' + top.length + '…'));
      } else {
        head.appendChild(el('span', 'plsi-note', 'too few results to score'));
      }
      summaryBox.appendChild(head);
      if (!s) return;
      const grid = el('div', 'plsi-stats');
      grid.appendChild(stat('installs, top ' + s.n, P.compact(s.sumInstalls), full(s.sumInstalls) + ' installs in total'));
      grid.appendChild(stat('median installs', P.compact(s.medInstalls)));
      grid.appendChild(stat('median age', P.ageLabel(s.medAgeDays)));
      grid.appendChild(stat('median rating', s.medRating != null ? s.medRating.toFixed(2) : null));
      grid.appendChild(stat('not updated 18 mo', pct(s.shareStale, 0)));
      grid.appendChild(stat('with purchases', pct(s.shareIap, 0)));
      grid.appendChild(stat('with ads', pct(s.shareAds, 0)));
      if (o) {
        grid.appendChild(
          stat('big and well rated', o.entrenched + ' of ' + o.n, '10M+ installs and rated 4.3 or higher: the hard ones to displace')
        );
      }
      summaryBox.appendChild(grid);
      return;
    }

    const s = P.summarize(infos);
    const head = el('div', 'plsi-summary-head');
    const devName = kind === 'dev' ? infos.map((i) => i.dev).find(Boolean) : null;
    head.appendChild(
      el('span', 'plsi-summary-title', kind === 'dev' ? (devName || 'Developer') + ' · ' + s.n + ' apps' : s.n + ' apps on this page')
    );
    if (ready.length < apps.length) {
      head.appendChild(el('span', 'plsi-note', 'reading ' + ready.length + ' of ' + apps.length + '…'));
    }
    summaryBox.appendChild(head);
    const grid = el('div', 'plsi-stats');
    grid.appendChild(stat('total installs', P.compact(s.sumInstalls), full(s.sumInstalls) + ' installs in total'));
    grid.appendChild(stat('median installs', P.compact(s.medInstalls)));
    grid.appendChild(
      stat('average rating', s.avgRating != null ? s.avgRating.toFixed(2) : null, 'Weighted by the number of ratings')
    );
    grid.appendChild(stat('median age', P.ageLabel(s.medAgeDays)));
    grid.appendChild(stat('updated in 90 days', pct(s.shareFresh, 0)));
    grid.appendChild(stat('with purchases', pct(s.shareIap, 0)));
    grid.appendChild(stat('with ads', pct(s.shareAds, 0)));
    if (s.newest) grid.appendChild(stat('newest: ' + s.newest.name, P.ageLabel(s.newest.days)));
    summaryBox.appendChild(grid);
  }

  // The score always comes with its word, never as a colour alone.
  function scorePill(o) {
    const level = o.score >= 60 ? ['Open', 'plsi-good'] : o.score >= 45 ? ['Contested', 'plsi-warn'] : ['Crowded', 'plsi-bad'];
    const pill = el('span', 'plsi-score ' + level[1], level[0] + ' · ' + o.score);
    pill.title =
      'Opportunity ' + o.score + ' of 100 — demand ' + pct(o.demand, 0) +
      ', money ' + pct(o.monet, 0) +
      ', room ' + pct(o.compet, 0) +
      ', weak rivals ' + pct(o.weak, 0) +
      '. A reading of the first results, not a forecast.';
    return pill;
  }

  // ---------- details drawer ----------

  function section(parent, title) {
    const box = el('div', 'plsi-sec');
    if (title) box.appendChild(el('div', 'plsi-sec-title', title));
    parent.appendChild(box);
    return box;
  }

  function keyValue(parent, key, value) {
    if (value == null || value === '') return;
    const row = el('div', 'plsi-kv');
    row.appendChild(el('span', 'plsi-k', key));
    if (value instanceof Node) row.appendChild(value);
    else row.appendChild(el('span', 'plsi-v', value));
    parent.appendChild(row);
  }

  function sparkline(hist) {
    const w = 132;
    const h = 30;
    const pts = hist.map((s) => [s[0], s[1]]);
    const x0 = pts[0][0];
    const x1 = pts[pts.length - 1][0];
    const ys = pts.map((p) => p[1]);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const px = (x) => (x1 === x0 ? w : 2 + ((x - x0) / (x1 - x0)) * (w - 6));
    const py = (y) => (y1 === y0 ? h / 2 : h - 3 - ((y - y0) / (y1 - y0)) * (h - 6));
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('class', 'plsi-spark');
    svg.setAttribute('role', 'img');
    const label = document.createElementNS(SVG_NS, 'title');
    label.textContent =
      'Installs from ' + full(ys[0]) + ' on ' + shortDate(x0 * 1000) + ' to ' + full(ys[ys.length - 1]) + ' on ' + shortDate(x1 * 1000);
    svg.appendChild(label);
    const line = document.createElementNS(SVG_NS, 'polyline');
    line.setAttribute('points', pts.map((p) => px(p[0]).toFixed(1) + ',' + py(p[1]).toFixed(1)).join(' '));
    line.setAttribute('fill', 'none');
    svg.appendChild(line);
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', px(x1).toFixed(1));
    dot.setAttribute('cy', py(ys[ys.length - 1]).toFixed(1));
    dot.setAttribute('r', '2.5');
    svg.appendChild(dot);
    return svg;
  }

  function buildDrawer(app) {
    const i = app.info;
    const box = el('div', 'plsi-drawer');

    // --- numbers ---
    const grid = el('div', 'plsi-stats');
    const v = P.velocity(app.hist);
    const avg = P.perDay(i);
    grid.appendChild(stat('installs' + (i.downloads ? ' · ' + i.downloads : ''), i.installs != null ? full(i.installs) : i.downloads));
    grid.appendChild(stat(i.released ? 'released ' + i.released : 'released', P.ageLabel(P.ageDays(i))));
    grid.appendChild(stat('a day, since launch', avg != null ? P.compact(avg) : null));
    grid.appendChild(
      stat(
        v ? 'a day, last ' + Math.round(v.days) + ' d' : 'a day, measured',
        v ? P.compact(v.perDay) : null,
        v ? null : 'Appears once this device has two snapshots of the app at least a day apart'
      )
    );
    grid.appendChild(stat('ratings', i.reviews != null ? full(i.reviews) : null));
    grid.appendChild(stat('ratings per install', pct(P.rateShare(i))));
    section(box).appendChild(grid);
    if (app.hist && app.hist.length >= 3) {
      const trend = section(box, 'Installs on this device’s record · ' + app.hist.length + ' days');
      trend.appendChild(sparkline(app.hist));
    }

    // --- ratings spread ---
    if (i.stars) {
      const sec = section(box, 'Ratings · ' + pct(P.lowShare(i), 0) + ' are 1–2★');
      const total = i.stars.reduce((s, n) => s + n, 0);
      const max = Math.max(...i.stars);
      for (const n of [5, 4, 3, 2, 1]) {
        const c = i.stars[n - 1];
        const row = el('div', 'plsi-bar-row');
        row.appendChild(el('span', 'plsi-bar-label', n + '★'));
        const track = el('span', 'plsi-bar-track');
        const fill = el('i', n <= 2 ? 'plsi-bar-low' : null);
        fill.style.width = Math.max(1, (c / max) * 100) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el('span', 'plsi-bar-num', pct(c / total, 0) + ' · ' + P.compact(c)));
        row.title = full(c) + ' ratings';
        sec.appendChild(row);
      }
    }

    // --- the listing ---
    const about = section(box, 'Listing');
    const money = moneyChips(i, false);
    if (money.childNodes.length) keyValue(about, 'Price', money);
    keyValue(about, 'Category', i.genre);
    keyValue(about, 'Rated', i.contentRating);
    keyValue(about, 'Version', i.version);
    keyValue(about, 'Android', i.minAndroid ? i.minAndroid + ' and up' : null);
    keyValue(about, 'Updated', i.updated);
    if (i.summary) about.appendChild(el('div', 'plsi-text', i.summary));
    if (i.shots?.length) {
      const strip = el('div', 'plsi-shots');
      for (const url of i.shots) {
        const img = document.createElement('img');
        img.src = url + '=h220';
        img.alt = '';
        img.loading = 'lazy';
        strip.appendChild(img);
      }
      about.appendChild(strip);
    }
    if (i.whatsNew) {
      const news = section(box, 'What’s new');
      news.appendChild(el('div', 'plsi-text', i.whatsNew));
    }

    // --- developer ---
    if (i.dev || i.devEmail || i.devSite) {
      const dev = section(box, 'Developer');
      if (i.dev) {
        keyValue(dev, 'Name', i.devUrl ? link('https://play.google.com' + i.devUrl, i.dev) : i.dev);
      }
      if (i.devEmail) {
        const wrap = el('span', 'plsi-v');
        wrap.appendChild(el('span', null, i.devEmail));
        wrap.appendChild(button('Copy', 'Copy the address', (ev, b) => copyText(i.devEmail, b), 'plsi-btn-sm'));
        keyValue(dev, 'Email', wrap);
      }
      if (i.devSite) keyValue(dev, 'Website', link(i.devSite, i.devSite.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')));
      if (i.privacy) keyValue(dev, 'Privacy', link(i.privacy, 'policy'));
    }

    // --- data safety ---
    if (i.safety?.length) {
      const safe = section(box, 'Data safety, as declared by the developer');
      for (const [text, detail] of i.safety) {
        const row = el('div', 'plsi-text');
        row.appendChild(el('span', null, text));
        if (detail) row.appendChild(el('span', 'plsi-muted', ' — ' + detail));
        safe.appendChild(row);
      }
    }

    // --- watchlist record ---
    const w = state.watch.get(app.id);
    if (w) {
      const log = section(box, 'Watching since ' + shortDate(w.added));
      if (w.changes?.length) {
        for (const c of w.changes.slice(0, 8)) {
          const row = el('div', 'plsi-text');
          row.appendChild(el('span', 'plsi-muted', shortDate(c.t) + '  '));
          row.appendChild(el('span', null, c.f + ': ' + c.a + ' → ' + c.b));
          log.appendChild(row);
        }
      } else {
        log.appendChild(el('div', 'plsi-note', 'No change seen yet.'));
      }
      const ranks = el('div');
      log.appendChild(ranks);
      storageGet('local', 'kw:' + app.id).then((got) => {
        const map = got['kw:' + app.id];
        if (!map) return;
        for (const [term, list] of Object.entries(map).reverse().slice(0, 8)) {
          const last = list[list.length - 1];
          const prev = list.length > 1 ? list[list.length - 2] : null;
          const move = prev ? prev[1] - last[1] : 0;
          const row = el('div', 'plsi-text');
          row.appendChild(el('span', null, '“' + term + '”  #' + last[1]));
          if (move) {
            row.appendChild(
              el('span', move > 0 ? 'plsi-up' : 'plsi-down', (move > 0 ? '  ▲' : '  ▼') + Math.abs(move))
            );
          }
          row.appendChild(el('span', 'plsi-muted', '  ' + shortDate(last[0] * P.DAY_MS)));
          ranks.appendChild(row);
        }
      });
    }

    // --- on demand ---
    const tools = section(box, 'Look closer');
    const bar = el('div', 'plsi-actions');
    const out = el('div', 'plsi-out');
    bar.appendChild(button('Compare countries', 'Rating and prices in ' + state.countries.join(', '), () => showCountries(app, out)));
    bar.appendChild(button('Low-star reviews', 'The newest 1 to 3 star reviews and what they keep saying', () => showReviews(app, out)));
    tools.appendChild(bar);
    tools.appendChild(out);

    // --- elsewhere ---
    const links = section(box, 'Elsewhere');
    const row = el('div', 'plsi-actions');
    const name = encodeURIComponent(i.name || app.name || app.id);
    row.appendChild(link('https://play.google.com/store/apps/details?id=' + app.id, 'Play page', 'plsi-btn'));
    row.appendChild(link('https://www.appbrain.com/app/' + app.id, 'AppBrain', 'plsi-btn'));
    row.appendChild(
      link('https://www.apkmirror.com/?post_type=app_release&searchtype=app&s=' + encodeURIComponent(app.id), 'APKMirror', 'plsi-btn')
    );
    row.appendChild(link('https://apps.apple.com/us/iphone/search?term=' + name, 'App Store', 'plsi-btn'));
    row.appendChild(button('Copy id', 'Copy the package name', (ev, b) => copyText(app.id, b)));
    links.appendChild(row);

    return box;
  }

  // ---------- drawer: the same app in other countries ----------

  async function countryInfo(id, gl) {
    const key = 'cc:' + id + ':' + gl;
    const got = await storageGet('local', key);
    const c = got[key];
    if (c && Date.now() - c.t < CACHE_TTL_MS) return c;
    const info = await run(() => fetchAppInfo(id, gl));
    const keep = {
      t: Date.now(),
      score: info.score,
      rating: info.rating,
      reviews: info.reviews,
      stars: info.stars,
      price: info.price,
      priceText: info.priceText,
      iap: info.iap,
    };
    storageSet('local', { [key]: keep });
    return keep;
  }

  async function showCountries(app, out) {
    out.textContent = '';
    const t = el('table', 'plsi-sub-table');
    const head = el('tr');
    for (const h of ['Country', '★', 'Ratings', '1–2★', 'Price', 'In-app']) head.appendChild(el('th', null, h));
    t.appendChild(head);
    out.appendChild(t);
    const note = el('div', 'plsi-note', 'Reading…');
    out.appendChild(note);
    for (const gl of state.countries) {
      const tr = el('tr');
      tr.appendChild(el('td', null, gl));
      t.appendChild(tr);
      try {
        const c = await countryInfo(app.id, gl);
        tr.appendChild(el('td', null, c.score != null ? c.score.toFixed(2) : '—'));
        tr.appendChild(el('td', null, c.reviews != null ? P.compact(c.reviews) : '—'));
        tr.appendChild(el('td', null, pct(P.lowShare(c), 0) || '—'));
        tr.appendChild(el('td', null, c.price > 0 ? c.priceText : c.price === 0 ? 'Free' : '—'));
        tr.appendChild(el('td', null, c.iap || '—'));
      } catch {
        const td = el('td', 'plsi-row-error', 'not available');
        td.colSpan = 5;
        tr.appendChild(td);
      }
      if (!out.isConnected) return;
    }
    note.textContent =
      'Installs are worldwide — Play does not publish them per country. Change the countries in the extension’s settings.';
  }

  // ---------- drawer: reviews ----------

  async function fetchReviews(id, opts) {
    const res = await fetch(P.batchUrl('oCPfdb'), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: P.batchBody('oCPfdb', P.reviewsPayload(id, opts)),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return P.parseReviews(P.parseBatch(await res.text()));
  }

  const STAR_SETS = {
    low: [1, 2, 3],
    1: [1],
    2: [2],
    3: [3],
    4: [4],
    5: [5],
    all: [null],
  };

  // Play filters by one star value at a time, so "1 to 3 stars" is three
  // streams read side by side and merged by date.
  function reviewReader(id, stars, sort) {
    const streams = STAR_SETS[stars].map((score) => ({ score, token: null, done: false }));
    const seen = new Set();
    return {
      get done() {
        return streams.every((s) => s.done);
      },
      async next(count) {
        const fresh = [];
        for (const s of streams) {
          if (s.done) continue;
          const r = await fetchReviews(id, { score: s.score, sort, count, token: s.token });
          s.token = r.token;
          if (!r.token || !r.reviews.length) s.done = true;
          for (const rv of r.reviews) {
            if (seen.has(rv.id)) continue;
            seen.add(rv.id);
            fresh.push(rv);
          }
        }
        return fresh;
      },
    };
  }

  function showReviews(app, out) {
    out.textContent = '';
    const ui = { stars: 'low', sort: 2, reader: null, list: [], busy: false, stop: false, max: 500, since: '' };

    const controls = el('div', 'plsi-actions');
    const reset = () => {
      ui.reader = null;
      ui.list = [];
      load();
    };
    controls.appendChild(
      select(
        [['low', '1–3★'], ['1', '1★'], ['2', '2★'], ['3', '3★'], ['4', '4★'], ['5', '5★'], ['all', 'All']],
        ui.stars,
        (v) => {
          ui.stars = v;
          reset();
        },
        'Which ratings to read'
      )
    );
    controls.appendChild(
      select([[2, 'Newest'], [1, 'Most relevant']], ui.sort, (v) => {
        ui.sort = +v;
        reset();
      }, 'Order')
    );
    const more = button('More', 'Read the next reviews', () => load());
    controls.appendChild(more);
    out.appendChild(controls);

    const terms = el('div', 'plsi-chips plsi-terms');
    const list = el('div', 'plsi-reviews');
    const status = el('div', 'plsi-note');
    out.appendChild(terms);
    out.appendChild(list);
    out.appendChild(status);

    // export
    const exp = el('div', 'plsi-actions');
    exp.appendChild(
      select([[100, 'up to 100'], [500, 'up to 500'], [1000, 'up to 1,000'], [3000, 'up to 3,000']], ui.max, (v) => (ui.max = +v), 'How many reviews to export')
    );
    exp.appendChild(
      select([['', 'any date'], [30, 'last 30 days'], [90, 'last 90 days'], [365, 'last year']], ui.since, (v) => (ui.since = v), 'How far back to go')
    );
    const csvBtn = button('Export CSV', 'Read the reviews and save them as .csv', () => exportReviews('csv'));
    const jsonBtn = button('Export JSON', 'Read the reviews and save them as .json', () => exportReviews('json'));
    const stopBtn = button('Stop', 'Stop reading and save what is there', () => (ui.stop = true), 'plsi-hidden');
    exp.appendChild(csvBtn);
    exp.appendChild(jsonBtn);
    exp.appendChild(stopBtn);
    out.appendChild(exp);
    const expNote = el('div', 'plsi-note', 'Exports carry the text, stars, date, app version, likes and the developer’s reply — not the reviewer’s name.');
    out.appendChild(expNote);

    function paint() {
      terms.textContent = '';
      for (const t of P.topTerms(ui.list.map((r) => r.text), 12)) {
        const chip = el('span', 'plsi-chip', t.term + ' ' + t.count);
        chip.title = 'In ' + t.count + ' of ' + ui.list.length + ' reviews';
        terms.appendChild(chip);
      }
      list.textContent = '';
      for (const r of ui.list) {
        const item = el('div', 'plsi-review');
        const head = el('div', 'plsi-review-head');
        head.appendChild(el('span', 'plsi-review-stars', '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars)));
        const meta = [shortDate(r.t)];
        if (r.version) meta.push('v' + r.version);
        if (r.likes) meta.push('👍 ' + r.likes);
        if (r.reply) meta.push('answered');
        head.appendChild(el('span', 'plsi-muted', meta.join(' · ')));
        item.appendChild(head);
        item.appendChild(el('div', 'plsi-text', r.text));
        list.appendChild(item);
      }
    }

    async function load() {
      if (ui.busy) return;
      ui.busy = true;
      status.textContent = 'Reading…';
      try {
        if (!ui.reader) ui.reader = reviewReader(app.id, ui.stars, ui.sort);
        const fresh = await ui.reader.next(20);
        ui.list = ui.list.concat(fresh);
        if (ui.sort === 2) ui.list.sort((a, b) => b.t - a.t);
        paint();
        status.textContent = ui.list.length
          ? ui.list.length + ' reviews read' + (ui.reader.done ? ' — that is all of them' : '')
          : 'No reviews with these ratings.';
        more.disabled = ui.reader.done;
      } catch {
        status.textContent = 'Could not read the reviews. Try again in a moment.';
      } finally {
        ui.busy = false;
      }
    }

    async function exportReviews(kind) {
      if (ui.busy) return;
      ui.busy = true;
      ui.stop = false;
      csvBtn.disabled = jsonBtn.disabled = true;
      stopBtn.classList.remove('plsi-hidden');
      const cutoff = ui.since ? Date.now() - +ui.since * P.DAY_MS : 0;
      const reader = reviewReader(app.id, ui.stars, 2);
      let rows = [];
      let failed = false;
      try {
        while (!reader.done && rows.length < ui.max && !ui.stop) {
          const fresh = await reader.next(100);
          const inRange = fresh.filter((r) => r.t >= cutoff);
          rows = rows.concat(inRange);
          expNote.textContent = 'Reading… ' + Math.min(rows.length, ui.max) + ' of up to ' + ui.max;
          // newest first: once a whole page is older than the cutoff, the rest is too
          if (cutoff && fresh.length && !inRange.length) break;
          await sleep(350);
        }
      } catch {
        failed = true;
      }
      rows.sort((a, b) => b.t - a.t);
      rows = rows.slice(0, ui.max);
      if (rows.length) {
        const name = 'playlens-reviews-' + slug(app.id.replace(/\./g, '-')) + '-' + stamp();
        const shaped = rows.map((r) => ({
          package: app.id,
          date: new Date(r.t).toISOString(),
          stars: r.stars,
          text: r.text,
          likes: r.likes,
          app_version: r.version || '',
          developer_reply: r.reply || '',
          review_id: r.id,
        }));
        if (kind === 'json') downloadJson(name + '.json', shaped);
        else {
          const keys = Object.keys(shaped[0]);
          downloadCsv(name + '.csv', [P.csvLine(keys), ...shaped.map((r) => P.csvLine(keys.map((k) => r[k])))]);
        }
      }
      expNote.textContent = rows.length
        ? 'Saved ' + rows.length + ' reviews' + (failed ? ' — reading stopped early, Play refused the next page.' : '.')
        : failed
          ? 'Could not read the reviews. Try again in a moment.'
          : 'No reviews in that range.';
      stopBtn.classList.add('plsi-hidden');
      csvBtn.disabled = jsonBtn.disabled = false;
      ui.busy = false;
    }

    load();
  }

  // ---------- keywords view ----------

  async function suggest(term, gl) {
    const res = await fetch(P.batchUrl('IJ4APc', gl), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: P.batchBody('IJ4APc', P.suggestPayload(term)),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return P.parseSuggest(P.parseBatch(await res.text()));
  }

  let kwRun = 0;

  async function runSuggest() {
    const kw = state.kw;
    const seed = kw.seed.trim().toLowerCase();
    if (!seed || kw.busy) return;
    const me = ++kwRun;
    kw.busy = true;
    kw.items = [];
    const seeds = kw.az ? [seed, ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => seed + ' ' + c)] : [seed];
    let failed = 0;
    for (let n = 0; n < seeds.length; n++) {
      if (me !== kwRun) return;
      kw.note = seeds.length > 1 ? 'Reading ' + (n + 1) + ' of ' + seeds.length + '…' : 'Reading…';
      renderKeywords();
      try {
        for (const term of await suggest(seeds[n], kw.gl)) {
          if (!kw.items.some((x) => x.term === term)) kw.items.push({ term, score: null });
        }
      } catch {
        failed++;
      }
      if (seeds.length > 1) await sleep(200);
    }
    kw.busy = false;
    kw.note = kw.items.length
      ? kw.items.length + ' suggestions for “' + seed + '” in ' + kw.gl + (failed ? ' · ' + failed + ' requests failed' : '')
      : failed
        ? 'Could not read the suggestions. Try again in a moment.'
        : 'Play suggests nothing for “' + seed + '”.';
    renderPanel();
  }

  async function scoreKeyword(item) {
    if (item.score === 'busy') return;
    item.score = 'busy';
    renderKeywords();
    try {
      const res = await run(() => fetch(P.searchUrl(item.term, state.kw.gl), { credentials: 'omit' }));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ids = P.searchIds(await res.text(), 10);
      const infos = await Promise.all(
        ids.map((id) =>
          run(() => getInfo(id))
            .then((r) => r.info)
            .catch(() => null)
        )
      );
      item.score = P.opportunity(infos) || 'none';
      item.sum = P.summarize(infos);
    } catch {
      item.score = 'error';
    }
    renderKeywords();
  }

  async function scoreFirst(n) {
    for (const item of state.kw.items.slice(0, n)) {
      if (item.score && typeof item.score === 'object') continue;
      await scoreKeyword(item);
    }
  }

  function keywordCsv() {
    const lines = [
      P.csvLine(['keyword', 'country', 'opportunity', 'installs_top10', 'median_installs', 'median_age_days', 'share_with_purchases', 'share_not_updated_18mo', 'big_and_well_rated']),
    ];
    for (const it of state.kw.items) {
      const o = typeof it.score === 'object' ? it.score : null;
      const s = it.sum;
      lines.push(
        P.csvLine([
          it.term,
          state.kw.gl,
          o ? o.score : '',
          o ? o.sumInstalls : '',
          s ? round(s.medInstalls, 0) : '',
          s ? round(s.medAgeDays, 0) : '',
          s ? round(s.shareIap, 2) : '',
          s ? round(s.shareStale, 2) : '',
          o ? o.entrenched : '',
        ])
      );
    }
    return lines;
  }

  let kwBuilt = false;
  let kwInput = null;
  let kwNote = null;
  let kwList = null;
  let kwActions = null;

  function buildKeywords() {
    kwView.textContent = '';
    const form = el('form', 'plsi-kw-form');
    kwInput = el('input', 'plsi-input');
    kwInput.type = 'text';
    kwInput.placeholder = 'A word to start from, e.g. focus timer';
    kwInput.value = state.kw.seed;
    kwInput.addEventListener('input', () => (state.kw.seed = kwInput.value));
    // Play binds single-key shortcuts ("/" focuses its search box)
    kwInput.addEventListener('keydown', (ev) => ev.stopPropagation());
    form.appendChild(kwInput);
    const gls = [...new Set([state.kw.gl, ...state.countries])];
    form.appendChild(select(gls.map((g) => [g, g]), state.kw.gl, (v) => (state.kw.gl = v), 'Country whose suggestions to read'));
    const go = el('button', 'plsi-btn plsi-btn-main', 'Suggest');
    go.type = 'submit';
    form.appendChild(go);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      runSuggest();
    });
    kwView.appendChild(form);

    const opts = el('label', 'plsi-check');
    const az = el('input');
    az.type = 'checkbox';
    az.checked = state.kw.az;
    az.addEventListener('change', () => (state.kw.az = az.checked));
    opts.appendChild(az);
    opts.appendChild(el('span', null, 'Also try the word followed by each letter a–z (27 requests)'));
    kwView.appendChild(opts);

    kwActions = el('div', 'plsi-actions');
    kwActions.appendChild(button('Score first 10', 'Read the top results of the first ten terms and score them', () => scoreFirst(10)));
    kwActions.appendChild(button('Copy', 'Copy the terms, one per line', (ev, b) => copyText(state.kw.items.map((x) => x.term).join('\n'), b)));
    kwActions.appendChild(
      button('CSV', 'Save the terms and their scores', () => downloadCsv('playlens-keywords-' + slug(state.kw.seed) + '-' + stamp() + '.csv', keywordCsv()))
    );
    kwView.appendChild(kwActions);

    kwNote = el('div', 'plsi-note');
    kwView.appendChild(kwNote);
    kwList = el('div', 'plsi-kw-list');
    kwView.appendChild(kwList);
    kwBuilt = true;
  }

  function renderKeywords() {
    if (!kwView) return;
    if (!kwBuilt || !kwView.contains(kwInput)) buildKeywords();
    if (document.activeElement !== kwInput && kwInput.value !== state.kw.seed) kwInput.value = state.kw.seed;
    const kw = state.kw;
    kwActions.classList.toggle('plsi-hidden', !kw.items.length);
    kwNote.textContent =
      kw.note ||
      'Type a word and Play’s own search suggestions are listed here. Score a term to see how open its first ten results look.';
    if (panelCount && state.view === 'keywords') panelCount.textContent = String(kw.items.length);
    kwList.textContent = '';
    for (const item of kw.items) {
      const row = el('div', 'plsi-kw-row');
      const a = el('a', 'plsi-link plsi-kw-term', item.term);
      a.href = '/store/search?q=' + encodeURIComponent(item.term) + '&c=apps';
      a.title = 'Open this search';
      row.appendChild(a);
      const s = item.score;
      if (s && typeof s === 'object') {
        if (item.sum) {
          row.appendChild(el('span', 'plsi-muted', P.compact(item.sum.medInstalls) + ' median · ' + P.ageLabel(item.sum.medAgeDays)));
        }
        row.appendChild(scorePill(s));
      } else if (s === 'busy') {
        row.appendChild(el('span', 'plsi-note', 'reading…'));
      } else {
        if (s === 'error') row.appendChild(el('span', 'plsi-row-error', 'failed'));
        if (s === 'none') row.appendChild(el('span', 'plsi-muted', 'too few results'));
        row.appendChild(button('Score', 'Read the first ten results of this term', () => scoreKeyword(item), 'plsi-btn-sm'));
      }
      kwList.appendChild(row);
    }
  }

  // ---------- cards: loading each app ----------

  function enqueue(id) {
    const app = state.apps.get(id);
    if (!app) return;
    run(() => processApp(app), true);
  }

  async function processApp(app) {
    let got;
    try {
      got = await getInfo(app.id);
    } catch {
      app.status = 'error';
      if (app.inline) {
        app.inline.classList.remove('plsi-loading');
        app.inline.textContent = '—';
      }
      if (app.badge) {
        app.badge.classList.remove('plsi-loading');
        app.badge.classList.add('plsi-error');
        app.badge.textContent = 'retry';
        app.badge.addEventListener(
          'click',
          (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            app.badge.classList.add('plsi-loading');
            app.badge.classList.remove('plsi-error');
            app.badge.textContent = '…';
            app.status = 'loading';
            enqueue(app.id);
          },
          { once: true }
        );
      }
      schedulePanelRender();
      return;
    }
    app.info = got.info;
    app.hist = got.hist;
    app.status = 'ok';
    if (got.info.name) app.name = got.info.name;
    if (!app.icon && got.info.icon) app.icon = got.info.icon;
    if (app.self) rememberRecent(app);
    if (app.badge) renderBadge(app.badge, app);
    if (app.inline) renderInline(app.inline, app);
    schedulePanelRender();
  }

  // ---------- DOM scanning ----------

  function appIdFromHref(href) {
    const m = href && href.match(/\/store\/apps\/details\?id=([\w.]+)/);
    return m ? m[1] : null;
  }

  function cardName(a) {
    // Best-effort name from the card text; replaced by the detail page's
    // JSON-LD name once fetched.
    const t = (a.textContent || '').trim();
    return t ? t.split('\n')[0].slice(0, 80) : null;
  }

  // Grid cards wrap the icon tightly, but list rows (the "Similar apps" rails on
  // a detail page) put the icon in a wide row container — pinning the badge to
  // the container's edges would stretch it across the title and rating. Measure
  // the icon instead and inset the badge to its box.
  function fitBadgeToIcon(badge, img, holder) {
    // Re-rendering a card resets its style attribute, dropping the relative
    // position the badge is anchored to — without it the offsets below would
    // resolve against some ancestor and drop the badge below the icon.
    if (getComputedStyle(holder).position === 'static') {
      holder.style.position = 'relative';
    }
    const ib = img.getBoundingClientRect();
    const hb = holder.getBoundingClientRect();
    if (!ib.width || !hb.width) return;
    badge.style.left = Math.max(0, Math.round(ib.left - hb.left)) + 'px';
    badge.style.right = Math.max(0, Math.round(hb.right - ib.right)) + 'px';
    badge.style.bottom = Math.max(0, Math.round(hb.bottom - ib.bottom)) + 'px';

    const tight = ib.width < 96;
    if (tight !== badge.classList.contains('plsi-badge-sm')) {
      badge.classList.toggle('plsi-badge-sm', tight);
      if (badge.plsiApp?.info) renderBadge(badge, badge.plsiApp);
    }
  }

  // Both boxes are watched: the icon settles late (lazy load) and the row around
  // it reflows as the rail lays out, and either one moves the badge.
  const fitted = new Map(); // icon or row element -> {badge, img, holder}
  const fitObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver((entries) => {
          for (const e of entries) {
            const t = fitted.get(e.target);
            if (t) fitBadgeToIcon(t.badge, t.img, t.holder);
          }
        })
      : null;

  // A resize observer misses pure movement: on a search card the screenshot
  // above the icon loads late and pushes the icon down without either box
  // changing size, which would leave the badge hanging below it.
  function refitAll() {
    const done = new Set();
    for (const t of fitted.values()) {
      if (done.has(t.badge) || !t.badge.isConnected) continue;
      done.add(t.badge);
      fitBadgeToIcon(t.badge, t.img, t.holder);
    }
  }

  let refitTimer = null;
  function scheduleRefit() {
    if (refitTimer) return;
    refitTimer = setTimeout(() => {
      refitTimer = null;
      refitAll();
    }, 150);
  }

  function attachBadge(app, img) {
    const holder = img.parentElement;
    if (!holder) return;
    if (getComputedStyle(holder).position === 'static') {
      holder.style.position = 'relative';
    }
    const badge = el('div', 'plsi-badge plsi-loading', '…');
    const cs = getComputedStyle(img);
    badge.style.borderBottomLeftRadius = cs.borderBottomLeftRadius;
    badge.style.borderBottomRightRadius = cs.borderBottomRightRadius;
    badge.addEventListener('click', (ev) => {
      // informational overlay inside an <a>; don't navigate on click
      ev.preventDefault();
      ev.stopPropagation();
    });
    const place = () => {
      holder.appendChild(badge);
      fitBadgeToIcon(badge, img, holder);
      const target = { badge, img, holder };
      for (const box of [img, holder]) {
        fitted.set(box, target);
        fitObserver?.observe(box);
      }
    };
    // Lazy icons have no box yet — attaching now would leave the badge
    // floating; wait for the image to load first.
    if (img.complete && img.naturalWidth > 0) {
      place();
    } else {
      img.addEventListener('load', place, { once: true });
    }
    app.badge = badge;
    if (app.status === 'ok' && app.info) renderBadge(badge, app);
  }

  // On a detail page, the app being viewed gets no badge — its numbers are
  // already on the page — but it belongs in the table, pinned above the
  // "Similar apps" and "More by …" rails it is meant to be compared against.
  function addSelfApp(id) {
    if (state.apps.has(id)) return;
    const h1 = document.querySelector('h1');
    state.apps.set(id, {
      id,
      name: (h1?.textContent || '').trim() || null,
      icon: document.querySelector('meta[property="og:image"]')?.content || null,
      order: -1, // ahead of everything scanned from the page
      self: true,
      status: 'loading',
      info: null,
      hist: [],
      badge: null,
      inline: null,
      anchor: null,
    });
    enqueue(id);
    schedulePanelRender();
  }

  // A search result puts a wide screenshot before the app icon, so the first
  // <img> in the card is the wrong one to badge. Icons are square and Play
  // serves them with an "=s<size>" crop; screenshots come as "=w<w>-h<h>".
  function iconOf(a) {
    const imgs = a.querySelectorAll('img');
    if (imgs.length < 2) return imgs[0] || null;
    for (const img of imgs) {
      if (img.naturalWidth > 0 && img.naturalWidth === img.naturalHeight) return img;
      if (/=s\d+/.test(img.currentSrc || img.src || '')) return img;
      const r = img.getBoundingClientRect();
      if (r.width > 0 && Math.abs(r.width - r.height) <= 2) return img;
    }
    return imgs[0];
  }

  // Play re-renders search cards a moment after they first appear and takes our
  // nodes with it. The card keeps its data-plsi mark, so without this it would
  // stay bare for the rest of the visit.
  function restoreDecor(app, a, img) {
    if (app.inline && !app.inline.isConnected) attachInline(app, a);
    if (
      app.badge &&
      !app.badge.isConnected &&
      img.complete &&
      img.naturalWidth > 0 &&
      !img.parentElement?.querySelector('.plsi-badge')
    ) {
      attachBadge(app, img);
    }
  }

  // Play keeps the page it came from in the document, hidden, so that Back is
  // instant. Those cards are not part of what is on screen.
  const isShown = (a) => typeof a.checkVisibility !== 'function' || a.checkVisibility();

  function dropApp(app) {
    app.badge?.remove();
    app.inline?.remove();
    if (app.anchor) {
      delete app.anchor.dataset.plsi;
      app.anchor.classList.remove('plsi-dim');
    }
    state.apps.delete(app.id);
    seenIds.delete(app.id);
  }

  function scan() {
    // Skip the app's own card on a detail page — the info is already there.
    const kind = pageKind();
    const selfId = kind === 'detail' ? new URLSearchParams(location.search).get('id') : null;
    if (selfId) addSelfApp(selfId);

    const present = []; // ids in page order, each once
    const presentIds = new Set();
    const anchors = document.querySelectorAll('a[href*="/store/apps/details?id="]');
    for (const a of anchors) {
      if (a.closest('.plsi-panel')) continue;
      const id = appIdFromHref(a.getAttribute('href'));
      if (!id || id === selfId) continue;

      // Only anchors that look like cards (contain an icon image).
      const img = iconOf(a);
      if (!img || !isShown(a)) continue;
      if (!presentIds.has(id)) {
        presentIds.add(id);
        present.push(id);
      }

      let app = state.apps.get(id);
      if (app && app.anchor === a) {
        // Play's redraw can take the mark along with our nodes
        a.dataset.plsi = '1';
        restoreDecor(app, a, img);
        continue;
      }
      if (app && a.dataset.plsi) continue;
      a.dataset.plsi = '1';

      if (!app) {
        app = {
          id,
          name: cardName(a),
          icon: img.currentSrc || img.src || null,
          order: state.order++,
          status: 'loading',
          info: null,
          hist: [],
          badge: null,
          inline: null,
          anchor: null,
        };
        state.apps.set(id, app);
        seenIds.delete(id);
        enqueue(id);
        schedulePanelRender();
      } else if (!app.icon) {
        app.icon = img.currentSrc || img.src || null;
      }

      if (seenIds.has(id)) {
        // one badge/inline per app per page — unless the card that carried
        // them was redrawn or belongs to the page Play has put away, then this
        // card takes over
        if (!app.anchor || (app.anchor.isConnected && isShown(app.anchor))) continue;
        app.badge?.remove();
        app.inline?.remove();
      }
      seenIds.add(id);
      app.anchor = a; // the card that owns the decorations, for restoreDecor
      attachBadge(app, img);
      attachInline(app, a);
    }

    // What is no longer on the page leaves the list with it.
    let changed = false;
    for (const app of [...state.apps.values()]) {
      if (app.self || presentIds.has(app.id)) continue;
      dropApp(app);
      changed = true;
    }

    // Position follows the cards as they stand now; on a search page that
    // position is the ranking.
    present.forEach((id, i) => {
      const app = state.apps.get(id);
      if (!app) return;
      const rank = kind === 'search' ? i + 1 : null;
      if (app.order === i && (app.rank ?? null) === rank) return;
      app.order = i;
      if (rank) app.rank = rank;
      else delete app.rank;
      changed = true;
      if (rank && state.watch.has(id)) recordRank(app);
      if (app.status === 'ok' && app.info) {
        if (app.badge) renderBadge(app.badge, app);
        if (app.inline) renderInline(app.inline, app);
      }
    });
    state.order = present.length;
    if (changed) schedulePanelRender();

    scheduleRefit();
  }

  // Play is an SPA: re-scan on DOM changes and URL changes.
  let scanTimer = null;
  let lastUrl = location.href;
  let settleTimer = null;
  const observer = new MutationObserver((records) => {
    if (scanTimer) return;
    // The panel redraws itself often; its own changes are not news.
    if (panel && records.every((r) => panel.contains(r.target))) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        seenIds.clear();
        state.apps.clear();
        state.order = 0;
        state.drawer = null;
        if (state.sort.key === 'rank') state.sort = { key: 'page', dir: 1 };
        dropPageJobs();
        fitted.clear();
        fitObserver?.disconnect();
        // Cards Play carries over to the next view keep their mark and their
        // old decorations — strip both so the new page is scanned from scratch.
        for (const n of document.querySelectorAll('.plsi-badge, .plsi-inline')) n.remove();
        for (const a of document.querySelectorAll('a[data-plsi]')) {
          delete a.dataset.plsi;
          a.classList.remove('plsi-dim');
        }
        schedulePanelRender();
        // the page Play came from is hidden a moment after the address changes
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
          markGround();
          scan();
        }, 2500);
      }
      scan();
    }, 400);
  });

  // ---------- boot ----------

  (async () => {
    await Promise.all([loadFlags(), loadRecent(), loadWatch()]);
    watchStorage();
    applyFlags();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // A screenshot loading elsewhere in the card moves the icon without
    // changing any box we observe, so re-fit on image loads and on resize too.
    document.addEventListener('load', scheduleRefit, true);
    addEventListener('resize', scheduleRefit);
    scan();
    collectGarbage();
  })();
})();
