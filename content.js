// PlayLens — shows downloads / reviews / last-updated for every app in
// Google Play list pages (developer, collection, search, home).
//
// Three display modes, controlled by feature flags (extension popup):
//   - overlay: badge overlaid on each app icon
//   - inline:  extra info line under the card's own rating line
//   - panel:   fixed side panel on the right listing all scanned apps
//
// Data source: each app's own detail page fetched with hl=en&gl=US so the
// "Downloads" / "Updated on" labels are stable to parse regardless of the
// UI language the user browses with.
//
// play.google.com enforces Trusted Types (blocks innerHTML, even from content
// scripts) — all DOM here is built with createElement/textContent only.

(() => {
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
  const CONCURRENCY = 3;

  const RECENT_KEY = 'recent';
  const RECENT_MAX = 60;

  const DEFAULT_FLAGS = {
    overlay: true, // badge on each icon
    inline: true, // info line under the card's rating
    panel: true, // side panel available (opens via floating button)
    panelOpen: false, // panel expanded state (persisted)
    recent: true, // remember apps whose detail page was opened
  };

  const state = {
    flags: { ...DEFAULT_FLAGS },
    apps: new Map(), // id -> {id, name, icon, order, status: 'loading'|'ok'|'error', info}
    order: 0,
    sort: { key: 'page', dir: 1 }, // key: page|name|downloads|rating|reviews|updated
    view: 'page', // panel view: page (apps on this page) | recent (visited apps)
    recent: [], // [{id, name, icon, info, t}] newest first, from storage.local
  };

  const seenIds = new Set();
  const queue = [];
  let active = 0;

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

  async function loadFlags() {
    const saved = await storageGet('sync', DEFAULT_FLAGS);
    state.flags = { ...DEFAULT_FLAGS, ...saved };
  }

  function watchFlags() {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        // Recent list is shared: another tab (or the options page) may change it.
        if (area === 'local' && changes[RECENT_KEY]) {
          state.recent = changes[RECENT_KEY].newValue || [];
          if (state.view === 'recent') schedulePanelRender();
          return;
        }
        if (area !== 'sync') return;
        for (const k of Object.keys(changes)) {
          if (k in DEFAULT_FLAGS) state.flags[k] = changes[k].newValue;
        }
        applyFlags();
      });
    } catch {
      /* not running as extension */
    }
  }

  function applyFlags() {
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

  // ---------- data cache ----------

  async function cacheGet(id) {
    const obj = await storageGet('local', 'app:' + id);
    const v = obj['app:' + id];
    return v && Date.now() - v.t < CACHE_TTL_MS ? v : null;
  }

  function cacheSet(id, data) {
    storageSet('local', { ['app:' + id]: { ...data, t: Date.now() } });
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

  // ---------- fetch + parse ----------

  async function fetchAppInfo(id) {
    const url =
      'https://play.google.com/store/apps/details?id=' +
      encodeURIComponent(id) +
      '&hl=en&gl=US';
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();

    const info = {
      name: null,
      icon: null,
      downloads: null,
      rating: null,
      reviews: null,
      updated: null,
    };

    // JSON-LD block: exact name, rating value and review count
    const ldm = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    if (ldm) {
      try {
        const ld = JSON.parse(ldm[1]);
        if (ld.name) info.name = ld.name;
        if (typeof ld.image === 'string') info.icon = ld.image;
        if (ld.aggregateRating) {
          info.rating = Math.round(parseFloat(ld.aggregateRating.ratingValue) * 10) / 10;
          info.reviews = parseInt(ld.aggregateRating.ratingCount, 10);
        }
      } catch {
        /* fall through to regex below */
      }
    }
    if (info.reviews == null) {
      const m = html.match(
        /"aggregateRating":\{"@type":"AggregateRating","ratingValue":"([\d.]+)","ratingCount":"(\d+)"\}/
      );
      if (m) {
        info.rating = Math.round(parseFloat(m[1]) * 10) / 10;
        info.reviews = parseInt(m[2], 10);
      }
    }

    // <div class="...">1M+</div><div class="...">Downloads</div>
    const dl = html.match(/>([\d.,]+[KMB]?\+?)<\/div><div[^>]*>Downloads</);
    if (dl) info.downloads = dl[1];

    // Updated on</div><div class="...">Jan 7, 2025</div>
    const up = html.match(/Updated on<\/div><div[^>]*>([^<]+)</);
    if (up) info.updated = up[1].trim();

    return info;
  }

  // ---------- formatting ----------

  function compact(n) {
    if (n == null) return null;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function downloadsNum(text) {
    if (!text) return -1;
    const m = text.match(/([\d.,]+)\s*([KMB])?/);
    if (!m) return -1;
    const base = parseFloat(m[1].replace(/,/g, ''));
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1;
    return base * mult;
  }

  function freshnessClass(updatedText) {
    const t = Date.parse(updatedText); // "Jan 7, 2025" parses fine in en
    if (isNaN(t)) return '';
    const days = (Date.now() - t) / 86400000;
    if (days <= 180) return 'plsi-fresh';
    if (days <= 540) return 'plsi-aging';
    return 'plsi-stale';
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- icon badge (overlay mode) ----------

  function renderBadge(badge, info) {
    badge.classList.remove('plsi-loading', 'plsi-error');
    badge.textContent = '';
    badge.plsiInfo = info; // kept so the badge can re-render if the icon resizes
    // A search or list-row icon is ~64px wide; the full strip would just be
    // clipped there. The card prints the rating right beside the icon anyway,
    // so a small badge keeps the two things the card doesn't say: how many
    // installs, and how recently it was updated.
    const tight = badge.classList.contains('plsi-badge-sm');
    const line1 = [];
    if (info.downloads) line1.push('⬇' + info.downloads);
    if (tight) {
      if (!line1.length && info.rating != null) line1.push(info.rating + '★');
    } else if (info.reviews != null) {
      const r = info.rating != null ? info.rating + '★ ' : '';
      line1.push(r + compact(info.reviews));
    }
    if (line1.length) badge.appendChild(el('span', null, line1.join(' · ')));
    if (info.updated) {
      const when = tight ? shortDate(info.updated) : info.updated;
      badge.appendChild(el('span', freshnessClass(info.updated), '⟳ ' + when));
    }
    if (!badge.childNodes.length) badge.appendChild(el('span', null, 'no data'));
  }

  // ---------- info line under the card's rating (inline mode) ----------

  function renderInline(box, info) {
    box.classList.remove('plsi-loading');
    box.textContent = '';
    // The card already shows the rating — add downloads + review count + update date.
    const line1 = [];
    if (info.downloads) line1.push('⬇' + info.downloads);
    if (info.reviews != null) line1.push(compact(info.reviews) + ' rv');
    if (line1.length) box.appendChild(el('span', null, line1.join(' · ')));
    if (info.updated) {
      box.appendChild(el('span', freshnessClass(info.updated), '⟳ ' + info.updated));
    }
    if (!box.childNodes.length) box.appendChild(el('span', null, 'no data'));
  }

  function ratingLineEl(a) {
    // Deepest short element containing the ★ glyph = the card's rating line.
    let best = null;
    for (const e of a.querySelectorAll('*')) {
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
    if (app.status === 'ok' && app.info) renderInline(box, app.info);
  }

  // ---------- side panel (table layout) ----------

  const COLUMNS = [
    { key: 'name', label: 'App', cls: 'plsi-col-app' },
    { key: 'downloads', label: '⬇', cls: 'plsi-col-num' },
    { key: 'rating', label: '★', cls: 'plsi-col-num' },
    { key: 'reviews', label: 'Rv', cls: 'plsi-col-num' },
    { key: 'updated', label: 'Updated', cls: 'plsi-col-upd' },
  ];

  let panel = null;
  let panelBody = null; // tbody
  let panelHead = null; // tr of th cells
  let panelCount = null;
  let panelTabs = []; // view switcher buttons
  let clearBtn = null;
  let emptyNote = null;
  let fab = null; // floating toggle button
  let renderTimer = null;

  function setView(view) {
    if (state.view === view) return;
    state.view = view;
    // "page" order and "recent" order mean different things — start each view
    // in its own natural order rather than carrying a sort across.
    state.sort = { key: 'page', dir: 1 };
    renderPanel();
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

    const copy = el('button', 'plsi-btn', 'CSV');
    copy.title = 'Copy list as CSV';
    copy.addEventListener('click', () => {
      const rows = [['package', 'name', 'downloads', 'rating', 'reviews', 'updated']];
      for (const a of currentRows()) {
        const i = a.info || {};
        rows.push([a.id, a.name || '', i.downloads || '', i.rating ?? '', i.reviews ?? '', i.updated || '']);
      }
      const csv = rows
        .map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(','))
        .join('\n');
      navigator.clipboard.writeText(csv).then(
        () => flashBtn(copy, '✓'),
        () => flashBtn(copy, '✗')
      );
    });
    controls.appendChild(copy);

    const close = el('button', 'plsi-btn', '✕');
    close.title = 'Close panel';
    close.addEventListener('click', () => {
      state.flags.panelOpen = false;
      storageSet('sync', { panelOpen: false });
      setPanelOpen(false);
    });
    controls.appendChild(close);

    header.appendChild(controls);
    panel.appendChild(header);

    const tabs = el('div', 'plsi-tabs');
    for (const t of [
      { key: 'page', label: 'This page', title: 'Apps found on the page you are on' },
      { key: 'recent', label: 'Recent', title: 'Apps whose detail page you opened, saved on this device' },
    ]) {
      const b = el('button', 'plsi-tab', t.label);
      b.dataset.view = t.key;
      b.title = t.title;
      b.addEventListener('click', () => setView(t.key));
      tabs.appendChild(b);
      panelTabs.push(b);
    }
    clearBtn = el('button', 'plsi-btn plsi-clear', 'Clear');
    clearBtn.title = 'Forget every app in the recent list';
    clearBtn.addEventListener('click', clearRecent);
    tabs.appendChild(clearBtn);
    panel.appendChild(tabs);

    const wrap = el('div', 'plsi-panel-list');
    const table = el('table', 'plsi-table');
    const thead = document.createElement('thead');
    panelHead = document.createElement('tr');
    for (const col of COLUMNS) {
      const th = el('th', col.cls, col.label);
      th.dataset.key = col.key;
      th.title = 'Sort by ' + col.label;
      th.addEventListener('click', () => {
        if (state.sort.key === col.key) {
          state.sort.dir = -state.sort.dir;
        } else {
          // sensible first direction: names A→Z, numbers/dates biggest first
          state.sort = { key: col.key, dir: col.key === 'name' ? 1 : -1 };
        }
        renderPanel();
      });
      panelHead.appendChild(th);
    }
    thead.appendChild(panelHead);
    table.appendChild(thead);
    panelBody = document.createElement('tbody');
    table.appendChild(panelBody);
    wrap.appendChild(table);
    panel.appendChild(wrap);

    document.documentElement.appendChild(panel);
    renderPanel();
  }

  function flashBtn(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => (btn.textContent = old), 1200);
  }

  function removePanel() {
    panel?.remove();
    fab?.remove();
    panel = panelBody = panelHead = panelCount = clearBtn = emptyNote = fab = null;
    panelTabs = [];
  }

  function setPanelOpen(open) {
    if (!panel) return;
    panel.classList.toggle('plsi-open', open);
    fab.classList.toggle('plsi-hidden', open);
  }

  function sortValue(app, key) {
    const i = app.info;
    switch (key) {
      case 'name':
        return (app.name || app.id).toLowerCase();
      case 'downloads':
        return downloadsNum(i?.downloads);
      case 'rating':
        return i?.rating ?? -1;
      case 'reviews':
        return i?.reviews ?? -1;
      case 'updated':
        return Date.parse(i?.updated) || 0;
      default:
        return app.order;
    }
  }

  // Rows for whichever view is showing. Recent entries are stored flat, so they
  // are shaped like scanned apps here and both views share one render path.
  function currentRows() {
    if (state.view === 'recent') {
      return sortRows(
        state.recent.map((r, i) => ({
          id: r.id,
          name: r.name,
          icon: r.icon,
          info: r.info,
          seenAt: r.t,
          order: i, // storage order is newest-first
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
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.order - b.order;
    });
    return apps;
  }

  function shortDate(text) {
    const t = Date.parse(text);
    if (isNaN(t)) return text;
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

  function schedulePanelRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      renderPanel();
    }, 250);
  }

  function renderPanel() {
    if (!panelBody) return;

    const rows = currentRows();
    panelCount.textContent = String(rows.length);
    for (const b of panelTabs) {
      b.classList.toggle('plsi-tab-active', b.dataset.view === state.view);
    }
    clearBtn.classList.toggle('plsi-hidden', state.view !== 'recent' || !state.recent.length);

    // sort indicators on headers
    for (const th of panelHead.children) {
      const active = th.dataset.key === state.sort.key;
      th.classList.toggle('plsi-th-active', active);
      const col = COLUMNS.find((c) => c.key === th.dataset.key);
      th.textContent = col.label + (active ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : '');
    }

    panelBody.textContent = '';

    if (emptyNote) {
      emptyNote.remove();
      emptyNote = null;
    }
    if (!rows.length) {
      emptyNote = el(
        'div',
        'plsi-empty',
        state.view === 'recent'
          ? 'No apps yet. Open an app’s page and it lands here.'
          : 'No app cards found on this page.'
      );
      panelBody.parentElement.parentElement.appendChild(emptyNote);
    }

    for (const app of rows) {
      const tr = el('tr', 'plsi-row' + (app.self ? ' plsi-row-self' : ''));
      tr.addEventListener('click', () => {
        location.href = 'https://play.google.com/store/apps/details?id=' + app.id;
      });

      // App: icon + name
      const tdApp = el('td', 'plsi-col-app');
      const cell = el('div', 'plsi-app-cell');
      if (app.icon) {
        const img = document.createElement('img');
        img.className = 'plsi-row-icon';
        img.src = app.icon;
        img.alt = '';
        cell.appendChild(img);
      } else {
        cell.appendChild(el('div', 'plsi-row-icon plsi-row-noicon', '?'));
      }
      const label = el('div', 'plsi-row-label');
      const name = el('span', 'plsi-row-name', app.name || app.id);
      name.title = app.name || app.id;
      label.appendChild(name);
      if (app.self) {
        label.appendChild(el('span', 'plsi-row-sub', 'this app'));
      } else if (app.seenAt) {
        label.appendChild(el('span', 'plsi-row-sub', ago(app.seenAt)));
      }
      cell.appendChild(label);
      tdApp.appendChild(cell);
      tr.appendChild(tdApp);

      const i = app.info;
      if (app.status === 'loading') {
        const td = el('td', 'plsi-row-span plsi-row-muted', '…');
        td.colSpan = COLUMNS.length - 1;
        tr.appendChild(td);
      } else if (app.status === 'error') {
        const td = el('td', 'plsi-row-span plsi-row-error', 'fetch failed');
        td.colSpan = COLUMNS.length - 1;
        tr.appendChild(td);
      } else if (i) {
        tr.appendChild(el('td', 'plsi-col-num', i.downloads || '—'));
        tr.appendChild(el('td', 'plsi-col-num', i.rating != null ? String(i.rating) : '—'));
        tr.appendChild(el('td', 'plsi-col-num', i.reviews != null ? compact(i.reviews) : '—'));
        const tdUp = el(
          'td',
          'plsi-col-upd ' + (i.updated ? freshnessClass(i.updated) : ''),
          i.updated ? shortDate(i.updated) : '—'
        );
        if (i.updated) tdUp.title = i.updated;
        tr.appendChild(tdUp);
      }
      panelBody.appendChild(tr);
    }
  }

  // ---------- fetch queue ----------

  function enqueue(id) {
    queue.push(id);
    pump();
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const id = queue.shift();
      active++;
      processApp(id).finally(() => {
        active--;
        pump();
      });
    }
  }

  async function processApp(id) {
    const app = state.apps.get(id);
    let info = await cacheGet(id);
    if (!info) {
      try {
        info = await fetchAppInfo(id);
        cacheSet(id, info);
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
              enqueue(id);
            },
            { once: true }
          );
        }
        schedulePanelRender();
        return;
      }
    }
    app.info = info;
    app.status = 'ok';
    if (info.name) app.name = info.name;
    if (!app.icon && info.icon) app.icon = info.icon;
    if (app.self) rememberRecent(app);
    if (app.badge) renderBadge(app.badge, info);
    if (app.inline) renderInline(app.inline, info);
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
      if (badge.plsiInfo) renderBadge(badge, badge.plsiInfo);
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
    if (app.status === 'ok' && app.info) renderBadge(badge, app.info);
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

  function scan() {
    // Skip the app's own card on a detail page — the info is already there.
    const onDetailPage = location.pathname === '/store/apps/details';
    const selfId = onDetailPage ? new URLSearchParams(location.search).get('id') : null;
    if (selfId) addSelfApp(selfId);

    const anchors = document.querySelectorAll('a[href*="/store/apps/details?id="]');
    for (const a of anchors) {
      const id = appIdFromHref(a.getAttribute('href'));
      if (!id || id === selfId) continue;

      // Only anchors that look like cards (contain an icon image).
      const img = iconOf(a);
      if (!img) continue;

      let app = state.apps.get(id);
      if (a.dataset.plsi) {
        if (app && app.anchor === a) restoreDecor(app, a, img);
        continue;
      }
      a.dataset.plsi = '1';

      if (!app) {
        app = {
          id,
          name: cardName(a),
          icon: img.currentSrc || img.src || null,
          order: state.order++,
          status: 'loading',
          info: null,
          badge: null,
          inline: null,
          anchor: null,
        };
        state.apps.set(id, app);
        enqueue(id);
        schedulePanelRender();
      } else if (!app.icon) {
        app.icon = img.currentSrc || img.src || null;
      }

      if (seenIds.has(id)) continue; // one badge/inline per app per page
      seenIds.add(id);
      app.anchor = a; // the card that owns the decorations, for restoreDecor
      attachBadge(app, img);
      attachInline(app, a);
    }

    scheduleRefit();
  }

  // Play is an SPA: re-scan on DOM changes and URL changes.
  let scanTimer = null;
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        seenIds.clear();
        state.apps.clear();
        state.order = 0;
        fitted.clear();
        fitObserver?.disconnect();
        // Cards Play carries over to the next view keep their mark and their
        // old decorations — strip both so the new page is scanned from scratch.
        for (const n of document.querySelectorAll('.plsi-badge, .plsi-inline')) n.remove();
        for (const a of document.querySelectorAll('a[data-plsi]')) delete a.dataset.plsi;
        schedulePanelRender();
      }
      scan();
    }, 400);
  });

  // ---------- boot ----------

  (async () => {
    await Promise.all([loadFlags(), loadRecent()]);
    watchFlags();
    applyFlags();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // A screenshot loading elsewhere in the card moves the icon without
    // changing any box we observe, so re-fit on image loads and on resize too.
    document.addEventListener('load', scheduleRefit, true);
    addEventListener('resize', scheduleRefit);
    scan();
  })();
})();
