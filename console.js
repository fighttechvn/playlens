// PlayLens · Play Console tracker (content script for play.google.com/console).
//
// While you work in the console, this reads the pages you open — releases per
// track, version codes, products, subscriptions, promo codes, events with their
// start and end dates, the licensing key — and keeps one record per app (by
// package name) plus a history of what changed and which buttons you pressed.
//
// Everything stays in chrome.storage.local on this device. Nothing is sent
// anywhere. What is read from a page and how it is turned into a record lives
// in console-parse.js; this file only touches the page and the storage.

(function () {
  const P = globalThis.PLSI;
  const cx = P && P.cx;
  if (!cx || window.top !== window) return;

  const K = cx.KEY;
  const POLL_MS = 1500;
  const RECAPTURE_MS = 2 * 60 * 1000;
  const GIVE_UP_MS = 90 * 1000;

  let enabled = true;
  let route = null; // {devId, appId, page, arg, path}
  let routeKey = '';
  let routeSince = 0;
  let lastCapture = 0;
  let captured = false;
  let busy = false;

  // ---------- storage (one write at a time) ----------

  let chain = Promise.resolve();
  const queue = (fn) => (chain = chain.then(fn, fn).catch(() => {}));

  // ---------- reading the page ----------

  const mainRoot = () => document.querySelector('[role=main], main') || document.body;

  function lines(root) {
    const out = [];
    const walker = document.createTreeWalker(root || mainRoot(), NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const el = n.parentElement;
        if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.closest('nav, [role=navigation], [class*="side-nav"], console-nav, #plsi-console-pill, [aria-hidden=true]')) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let n = walker.nextNode(); n && out.length < 400; n = walker.nextNode()) out.push(n.nodeValue.replace(/\s+/g, ' ').trim());
    return out;
  }

  const CELL = '[role=cell], [role=gridcell], td, ess-cell';
  const HEAD = '[role=columnheader], th';

  function hrefPath(row) {
    const a = row.querySelector('a[href]');
    if (!a) return null;
    try {
      return new URL(a.getAttribute('href'), location.href).pathname;
    } catch {
      return null;
    }
  }

  // Visible text of a cell, one line per text node (the parsers split on lines,
  // like innerText). The console draws icons as ligature text ("check_circle",
  // "arrow_right_alt") inside <i aria-hidden="true">; drop those.
  function textOf(el) {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest('[aria-hidden=true]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim()) out.push(n.nodeValue.replace(/\s+/g, ' ').trim());
    return out.join('\n');
  }

  // Every table-like block on the page as {headers, rows:[{cells, href}]}.
  function tables() {
    const out = [];
    const all = [...document.querySelectorAll('ess-particle-table, table, [role=table], [role=grid]')];
    // ess-particle-table wraps a role=grid element: keep only the outermost
    for (const root of all.filter((a) => !all.some((b) => b !== a && b.contains(a)))) {
      let rowEls = [...root.querySelectorAll('[role=row], tr')];
      if (!rowEls.length) {
        // custom elements without ARIA rows: group the cells by their parent
        const byParent = new Map();
        for (const c of root.querySelectorAll(CELL + ', ' + HEAD)) {
          if (!byParent.has(c.parentElement)) byParent.set(c.parentElement, []);
          byParent.get(c.parentElement).push(c);
        }
        rowEls = [...byParent.keys()];
      }
      let headers = [];
      const rows = [];
      for (const r of rowEls) {
        const heads = r.querySelectorAll(HEAD);
        const cells = [...r.querySelectorAll(CELL + ', ' + HEAD)];
        if (!cells.length) continue;
        if (heads.length && !headers.length) {
          headers = [...heads].map(textOf);
          continue;
        }
        rows.push({ cells: cells.map(textOf), href: hrefPath(r) });
      }
      if (!headers.length && rows.length > 1) headers = rows.shift().cells; // first row is the header
      if (headers.length) out.push({ headers, rows });
    }
    return out;
  }

  const pageText = () => (document.body.innerText || '').slice(0, 200000);

  // ---------- the index of apps and the record per app ----------

  async function loadIdx() {
    const o = await P.store.get(K.idx);
    return o[K.idx] || { byApp: {}, apps: {} };
  }

  // Package name for the app on screen. Until the dashboard or the app list has
  // been seen, records go under id:<appId> and are folded in later.
  async function pkgFor(r, name) {
    const idx = await loadIdx();
    const known = idx.byApp[r.appId];
    if (known) {
      if (name && (!idx.apps[known] || idx.apps[known].name !== name)) await P.store.set({ [K.idx]: cx.learn(idx, known, r.appId, r.devId, name) });
      return known;
    }
    return 'id:' + r.appId;
  }

  async function learnPackage(pkg, r, name) {
    const idx = await loadIdx();
    const prov = 'id:' + r.appId;
    await P.store.set({ [K.idx]: cx.learn(idx, pkg, r.appId, r.devId, name) });
    // fold anything saved before the package was known
    const got = await P.store.get([K.app(prov), K.hist(prov), K.app(pkg), K.hist(pkg)]);
    if (got[K.app(prov)] || got[K.hist(prov)]) {
      const out = {};
      if (got[K.app(prov)] && !got[K.app(pkg)]) out[K.app(pkg)] = { ...got[K.app(prov)], pkg };
      if (got[K.hist(prov)]) out[K.hist(pkg)] = cx.appendHistory(got[K.hist(pkg)] || [], got[K.hist(prov)]);
      await P.store.set(out);
      await P.store.remove([K.app(prov), K.hist(prov)]);
    }
  }

  async function mutate(pkg, r, section, payload, name) {
    const now = Date.now();
    const got = await P.store.get([K.app(pkg), K.hist(pkg)]);
    let app = got[K.app(pkg)] || cx.blankApp(pkg, r, now);
    if (name) app.name = name;
    app.appId = app.appId || r.appId;
    app.devId = app.devId || r.devId;
    const res = cx.applySection(app, section, payload, now);
    const hist = cx.appendHistory(got[K.hist(pkg)] || [], cx.changeEntries(res.changes, now, r.path));
    await P.store.set({ [K.app(pkg)]: res.app, [K.hist(pkg)]: hist });
    return res.changes;
  }

  async function logEntries(pkg, entries) {
    const got = await P.store.get(K.hist(pkg));
    await P.store.set({ [K.hist(pkg)]: cx.appendHistory(got[K.hist(pkg)] || [], entries) });
  }

  // ---------- what to read on each page ----------

  const completeOf = (tbl, text) => {
    const pg = cx.pagination(text);
    return pg ? pg.total <= tbl.rows.length : false;
  };

  const find = (tbs, re) => tbs.find((t) => t.headers.some((h) => re.test(h.toLowerCase())));

  // returns {section, payload} when the page has what we need, null to keep waiting
  function read(r) {
    const text = pageText();
    switch (r.page) {
      case 'app-list': {
        const tbs = tables();
        const apps = tbs.flatMap((t) => cx.parseAppList(t));
        return apps.length ? { section: 'app-list', payload: apps } : null;
      }
      case 'dashboard': {
        const pkg = cx.findPackage(lines().join('\n'));
        return pkg ? { section: 'dashboard', payload: { pkg } } : null;
      }
      case 'releases': {
        const out = cx.parseReleases(tables());
        if (!out.releases.length && !out.versions.length) return null;
        return { section: 'releases', payload: { ...out, completeVersions: false } };
      }
      case 'track': {
        const h = cx.parseTrackHeader(lines());
        return h ? { section: 'track', payload: { key: h.name && /closed/i.test(h.name) ? h.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : cx.trackKey(h.name || r.arg), header: h } } : null;
      }
      case 'licensing': {
        const pre = document.querySelector('snippet pre.wrap, snippet pre, pre.wrap');
        const k = cx.parseLicenseKey(pre ? pre.innerText : text);
        return k ? { section: 'licensing', payload: k } : null;
      }
      case 'products':
      case 'subscriptions':
      case 'promos':
      case 'events': {
        const tbs = tables();
        const tb = r.page === 'events' ? find(tbs, /event/) : tbs[0];
        if (!tb) return null;
        const parse = { products: cx.parseProducts, subscriptions: cx.parseSubscriptions, promos: cx.parsePromos, events: cx.parseEvents }[r.page];
        return { section: r.page, payload: { items: parse(tb), complete: completeOf(tb, text) } };
      }
      case 'product':
      case 'subscription': {
        const ls = lines();
        return ls.length > 8 ? { section: r.page, payload: { id: r.arg, detail: cx.parseDetail(ls) } } : null;
      }
      default:
        return undefined; // nothing to read here, only the visit is logged
    }
  }

  async function capture(r) {
    const got = read(r);
    if (got === undefined) return true;
    if (!got) return false;
    const name = cx.appNameFromTitle(document.title);

    if (got.section === 'app-list') {
      let idx = await loadIdx();
      for (const a of got.payload) idx = cx.learn(idx, a.pkg, a.appId, r.devId, a.name);
      await P.store.set({ [K.idx]: idx });
      for (const a of got.payload) await learnPackage(a.pkg, { ...r, appId: a.appId }, a.name);
      return true;
    }
    if (got.section === 'dashboard') {
      await learnPackage(got.payload.pkg, r, name);
      await mutate(got.payload.pkg, r, 'dashboard', {}, name);
      return true;
    }
    const pkg = await pkgFor(r, name);
    const changes = await mutate(pkg, r, got.section, got.payload, name);
    pill(r.page, changes);
    return true;
  }

  // ---------- visible feedback ----------

  let pillTimer = null;
  function pill(page, changes) {
    let el = document.getElementById('plsi-console-pill');
    if (!el) {
      el = document.createElement('div');
      el.id = 'plsi-console-pill';
      el.setAttribute('role', 'status');
      el.style.cssText =
        'position:fixed;left:16px;bottom:16px;z-index:2147483000;padding:6px 12px;border-radius:999px;background:#1f1f1f;color:#fff;font:500 12px/1.4 Roboto,Arial,sans-serif;opacity:0;transition:opacity .2s;pointer-events:none';
      document.documentElement.appendChild(el);
    }
    el.textContent = 'PlayLens đã lưu · ' + page + (changes.length ? ' · ' + changes.length + ' thay đổi' : '');
    el.style.opacity = '1';
    clearTimeout(pillTimer);
    pillTimer = setTimeout(() => (el.style.opacity = '0'), 2500);
  }

  // ---------- the loop ----------

  async function tick() {
    if (!enabled || busy) return;
    const r = cx.routeOf(location.pathname);
    const key = r ? r.path + '|' + (r.appId || '') : '';
    const now = Date.now();
    if (key !== routeKey) {
      routeKey = key;
      route = r;
      routeSince = now;
      captured = false;
      lastCapture = 0;
      if (r && r.appId) {
        const pkg = await pkgFor(r, null);
        await queue(() => logEntries(pkg, [{ t: now, type: 'view', path: r.path, page: r.page }]));
      }
    }
    if (!route) return;
    const stale = captured && now - lastCapture > RECAPTURE_MS && document.visibilityState === 'visible';
    if ((!captured && now - routeSince < GIVE_UP_MS) || stale) {
      busy = true;
      try {
        if (await queue(() => capture(route))) {
          captured = true;
          lastCapture = Date.now();
        }
      } catch {
        /* the page was mid-render; the next tick tries again */
      } finally {
        busy = false;
      }
    }
  }

  // What you press: only a known button label is kept, never anything typed.
  document.addEventListener(
    'click',
    (e) => {
      if (!enabled || !route || !route.appId) return;
      const el = e.target && e.target.closest ? e.target.closest('button, [role=button], [role=menuitem], a') : null;
      if (!el) return;
      const label = cx.actionLabel(el.getAttribute('aria-label') || el.innerText || '');
      if (!label) return;
      const r = route;
      pkgFor(r, null).then((pkg) => queue(() => logEntries(pkg, [{ t: Date.now(), type: 'action', label, path: r.path, page: r.page }])));
      // the console takes a moment to apply what you pressed; look again after
      setTimeout(() => {
        captured = false;
        routeSince = Date.now();
      }, 3000);
    },
    true
  );

  // ---------- start ----------

  P.store.get(K.flag).then((o) => {
    enabled = o[K.flag] !== false;
  });
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch[K.flag]) enabled = ch[K.flag].newValue !== false;
    });
  } catch {
    /* extension reloaded under us */
  }
  setInterval(tick, POLL_MS);
  tick();
})();
