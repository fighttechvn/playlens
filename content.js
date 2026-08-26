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

  const DEFAULT_FLAGS = {
    overlay: true, // badge on each icon
    inline: true, // info line under the card's rating
    panel: true, // side panel available (opens via floating button)
    panelOpen: false, // panel expanded state (persisted)
  };

  const state = {
    flags: { ...DEFAULT_FLAGS },
    apps: new Map(), // id -> {id, name, icon, order, status: 'loading'|'ok'|'error', info}
    order: 0,
    sort: { key: 'page', dir: 1 }, // key: page|name|downloads|rating|reviews|updated
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

  // ---------- fetch + parse ----------

  async function fetchAppInfo(id) {
    const url =
      'https://play.google.com/store/apps/details?id=' +
      encodeURIComponent(id) +
      '&hl=en&gl=US';
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();

    const info = { name: null, downloads: null, rating: null, reviews: null, updated: null };

    // JSON-LD block: exact name, rating value and review count
    const ldm = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    if (ldm) {
      try {
        const ld = JSON.parse(ldm[1]);
        if (ld.name) info.name = ld.name;
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
    const line1 = [];
    if (info.downloads) line1.push('⬇' + info.downloads);
    if (info.reviews != null) {
      const r = info.rating != null ? info.rating + '★ ' : '';
      line1.push(r + compact(info.reviews));
    }
    if (line1.length) badge.appendChild(el('span', null, line1.join(' · ')));
    if (info.updated) {
      badge.appendChild(el('span', freshnessClass(info.updated), '⟳ ' + info.updated));
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
  let fab = null; // floating toggle button
  let renderTimer = null;

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
      for (const a of sortedApps()) {
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
    panel = panelBody = panelHead = panelCount = fab = null;
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

  function sortedApps() {
    const apps = [...state.apps.values()];
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

  function schedulePanelRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      renderPanel();
    }, 250);
  }

  function renderPanel() {
    if (!panelBody) return;
    panelCount.textContent = String(state.apps.size);

    // sort indicators on headers
    for (const th of panelHead.children) {
      const active = th.dataset.key === state.sort.key;
      th.classList.toggle('plsi-th-active', active);
      const col = COLUMNS.find((c) => c.key === th.dataset.key);
      th.textContent = col.label + (active ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : '');
    }

    panelBody.textContent = '';
    for (const app of sortedApps()) {
      const tr = el('tr', 'plsi-row');
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
      const name = el('span', 'plsi-row-name', app.name || app.id);
      name.title = app.name || app.id;
      cell.appendChild(name);
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
    // Lazy icons have no box yet — attaching now would leave the badge
    // floating; wait for the image to load first.
    if (img.complete && img.naturalWidth > 0) {
      holder.appendChild(badge);
    } else {
      img.addEventListener('load', () => holder.appendChild(badge), { once: true });
    }
    app.badge = badge;
    if (app.status === 'ok' && app.info) renderBadge(badge, app.info);
  }

  function scan() {
    // Skip the app's own card on a detail page — the info is already there.
    const onDetailPage = location.pathname === '/store/apps/details';
    const selfId = onDetailPage ? new URLSearchParams(location.search).get('id') : null;

    const anchors = document.querySelectorAll('a[href*="/store/apps/details?id="]');
    for (const a of anchors) {
      if (a.dataset.plsi) continue;
      a.dataset.plsi = '1';

      const id = appIdFromHref(a.getAttribute('href'));
      if (!id || id === selfId) continue;

      // Only anchors that look like cards (contain an icon image).
      const img = a.querySelector('img');
      if (!img) continue;

      let app = state.apps.get(id);
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
        };
        state.apps.set(id, app);
        enqueue(id);
        schedulePanelRender();
      } else if (!app.icon) {
        app.icon = img.currentSrc || img.src || null;
      }

      if (seenIds.has(id)) continue; // one badge/inline per app per page
      seenIds.add(id);
      attachBadge(app, img);
      attachInline(app, a);
    }
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
        schedulePanelRender();
      }
      scan();
    }, 400);
  });

  // ---------- boot ----------

  (async () => {
    await loadFlags();
    watchFlags();
    applyFlags();
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
  })();
})();
