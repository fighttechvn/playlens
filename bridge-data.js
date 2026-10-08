// PlayLens · what the MCP bridge may read — pure, no chrome.* and no DOM.
//
// bridge.js (service worker) hands a snapshot of chrome.storage.local to
// handle(); mcp/server.js asks for these methods over a local WebSocket and
// shows the answers to Claude. Everything here only reads. The Pro licence key
// ("license") is never returned, by any method.

(function (root) {
  const P = root.PLSI || (root.PLSI = {});
  const b = {};

  const DAY = 86400000;
  const MAX_ITEMS = 500;

  // Keys storage_get may return. "license" is deliberately absent.
  const READABLE = /^(watch|kwl|gc|consoleTrack|cx:idx|(w|h|app|cc|kw|rk|c|ch):.+)$/;
  b.readable = (key) => READABLE.test(String(key));

  const cx = () => P.cx;
  const idxOf = (all) => all['cx:idx'] || { apps: {}, byApp: {} };

  // Every package we know anything about: the index plus any saved record.
  function packages(all) {
    const set = new Set(Object.keys(idxOf(all).apps || {}));
    for (const k of Object.keys(all)) if (k.startsWith('c:') || k.startsWith('ch:')) set.add(k.slice(k.indexOf(':') + 1));
    return [...set].sort();
  }

  // A package name, or the numeric Console app id, to a package name.
  function resolvePkg(all, ref) {
    const r = String(ref == null ? '' : ref).trim();
    if (!r) return null;
    const idx = idxOf(all);
    if (/^\d+$/.test(r) && idx.byApp && idx.byApp[r]) return idx.byApp[r];
    return packages(all).includes(r) ? r : null;
  }

  function unknown(all, ref) {
    const r = String(ref || '').toLowerCase();
    const near = packages(all)
      .filter((p) => p.toLowerCase().includes(r) || (idxOf(all).apps[p] || {}).name?.toLowerCase().includes(r))
      .slice(0, 8);
    return { error: 'No saved Console data for "' + ref + '".', known: near.length ? near : packages(all).slice(0, 8) };
  }

  function summaryOf(all, pkg, now) {
    const rec = all['c:' + pkg] || null;
    const known = idxOf(all).apps[pkg] || {};
    const s = cx().summary(rec || { pkg, name: known.name, appId: known.appId }, now);
    if (!s.name) s.name = known.name || null;
    if (!s.appId) s.appId = known.appId || null;
    s.hasData = !!rec;
    if (!rec) s.lastSeen = null;
    return s;
  }

  const iso = (ts) => (ts ? new Date(ts).toISOString() : null);

  // Timestamps are easy for a model to misread as numbers: give both.
  function stamp(o, fields) {
    const out = { ...o };
    for (const f of fields) if (typeof o[f] === 'number') out[f + 'At'] = iso(o[f]);
    return out;
  }

  const handlers = {
    status(all, p, now, ctx) {
      const pk = packages(all);
      return {
        extensionVersion: (ctx && ctx.version) || null,
        consoleTracking: all.consoleTrack !== false,
        consoleApps: pk.filter((x) => all['c:' + x]).length,
        knownPackages: pk.length,
        watchlist: Array.isArray(all.watch) ? all.watch.length : 0,
        installHistories: Object.keys(all).filter((k) => k.startsWith('h:')).length,
        now: iso(now),
      };
    },

    // One row per app: what is live on each track, review state, events, counts.
    console_apps(all, p, now) {
      const q = String(p.query || '').trim().toLowerCase();
      let rows = packages(all).map((pkg) => summaryOf(all, pkg, now));
      if (q) rows = rows.filter((r) => r.pkg.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q));
      if (p.inReview) rows = rows.filter((r) => r.inReview > 0);
      if (p.eventsWithinDays != null) {
        const lim = now + Number(p.eventsWithinDays) * DAY;
        rows = rows.filter((r) => r.events.nextEnd && r.events.nextEnd <= lim);
      }
      rows.sort((x, y) => (y.lastSeen || 0) - (x.lastSeen || 0));
      return {
        total: rows.length,
        apps: rows.slice(0, Math.min(Number(p.limit) || 100, MAX_ITEMS)).map((r) => ({
          ...stamp(r, ['firstSeen', 'lastSeen']),
          events: stamp(r.events, ['nextEnd']),
        })),
      };
    },

    // The full record of one app, optionally cut down to some sections.
    console_app(all, p) {
      const pkg = resolvePkg(all, p.pkg);
      if (!pkg) return unknown(all, p.pkg);
      const rec = all['c:' + pkg];
      if (!rec) return { pkg, ...(idxOf(all).apps[pkg] || {}), note: 'Known from the app list, but no page of this app has been opened yet.' };
      const want = Array.isArray(p.sections) && p.sections.length ? new Set(p.sections) : null;
      const out = { pkg, appId: rec.appId, name: rec.name, firstSeen: iso(rec.firstSeen), lastSeen: iso(rec.lastSeen) };
      for (const [k, v] of Object.entries(rec)) {
        if (['pkg', 'appId', 'name', 'firstSeen', 'lastSeen', 'v', 'devId'].includes(k)) continue;
        if (!want || want.has(k)) out[k] = v;
      }
      return out;
    },

    // What the user did and what changed, newest first.
    console_history(all, p) {
      const pkg = resolvePkg(all, p.pkg);
      if (!pkg) return unknown(all, p.pkg);
      let h = Array.isArray(all['ch:' + pkg]) ? all['ch:' + pkg] : [];
      if (p.type) h = h.filter((x) => x.type === p.type);
      if (p.since) {
        const t = Date.parse(p.since);
        if (!Number.isNaN(t)) h = h.filter((x) => x.t >= t);
      }
      const out = h.slice().reverse().slice(0, Math.min(Number(p.limit) || 50, MAX_ITEMS));
      return { pkg, total: h.length, entries: out.map((x) => stamp(x, ['t'])) };
    },

    // Events that start or end soon, across every app.
    console_events(all, p, now) {
      const within = p.withinDays == null ? 14 : Number(p.withinDays);
      const lim = now + within * DAY;
      const out = [];
      for (const pkg of packages(all)) {
        const rec = all['c:' + pkg];
        if (!rec) continue;
        for (const e of rec.events || []) {
          if (e.gone) continue;
          const ended = e.end != null && e.end < now;
          if (ended && !p.includeEnded) continue;
          const endsSoon = e.end != null && e.end <= lim;
          const startsSoon = e.start != null && e.start > now && e.start <= lim;
          if (!(endsSoon || startsSoon)) continue;
          out.push({
            pkg,
            app: rec.name || null,
            ...stamp({ id: e.id, name: e.name, type: e.type, status: e.status, start: e.start, end: e.end }, ['start', 'end']),
            daysLeft: e.end != null ? Math.ceil((e.end - now) / DAY) : null,
          });
        }
      }
      out.sort((x, y) => (x.end || Infinity) - (y.end || Infinity));
      return { total: out.length, events: out.slice(0, MAX_ITEMS) };
    },

    // The watchlist, as PlayLens itself shows it.
    watchlist(all) {
      const ids = Array.isArray(all.watch) ? all.watch : [];
      return {
        total: ids.length,
        apps: ids
          .map((id) => all['w:' + id])
          .filter(Boolean)
          .map((w) => ({ id: w.id, name: w.name, checked: iso(w.checked), unseenChanges: w.unseen || 0, recentChanges: (w.changes || []).slice(0, 10), info: w.info || null })),
      };
    },

    // Installs / ratings / score over time for a Play Store app (daily snapshots).
    installs_history(all, p) {
      const id = String(p.id || '').trim();
      const h = Array.isArray(all['h:' + id]) ? all['h:' + id] : null;
      if (!h) {
        const have = Object.keys(all).filter((k) => k.startsWith('h:')).map((k) => k.slice(2)).slice(0, 12);
        return { error: 'No install history for "' + id + '".', known: have };
      }
      const pts = h.map(([t, installs, reviews, score]) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), installs, reviews, score: score == null ? null : score / 100 }));
      return { id, total: pts.length, points: pts.slice(-Math.min(Number(p.limit) || 120, MAX_ITEMS)) };
    },

    // Keyword rank history of a watched app.
    ranks(all, p) {
      const id = String(p.id || '').trim();
      const m = all['rk:' + id];
      if (!m) return { error: 'No rank data for "' + id + '".' };
      return {
        id,
        keywords: Object.entries(m).map(([k, list]) => {
          const [gl, ...t] = k.split('|');
          return { gl, term: t.join('|'), points: (list || []).slice(-60).map(([d, rank]) => ({ date: new Date(d * 86400000).toISOString().slice(0, 10), rank })) };
        }),
      };
    },

    // Names and rough sizes only; values come from storage_get.
    storage_keys(all) {
      const keys = Object.keys(all)
        .sort()
        .map((k) => ({ key: k, bytes: JSON.stringify(all[k] === undefined ? null : all[k]).length, readable: b.readable(k) }));
      return { total: keys.length, keys };
    },

    storage_get(all, p) {
      const key = String(p.key || '');
      if (key === 'license') return { error: 'The licence key is never exposed.' };
      if (!b.readable(key)) return { error: 'Key not readable. Use storage_keys to see what exists.' };
      if (!(key in all)) return { error: 'No such key.' };
      return { key, value: all[key] };
    },

    settings(all, p, now, ctx) {
      return { settings: (ctx && ctx.sync) || {} };
    },
  };

  b.methods = Object.keys(handlers);

  b.handle = function handle(method, params, all, now, ctx) {
    const fn = handlers[method];
    if (!fn) return { error: 'Unknown method "' + method + '". Known: ' + b.methods.join(', ') };
    return fn(all || {}, params || {}, now || Date.now(), ctx || {});
  };

  P.bridge = b;
  if (typeof module !== 'undefined' && module.exports) module.exports = b;
})(globalThis);
