// PlayLens · Play Console tracker — pure parsing and bookkeeping.
//
// No DOM, no chrome.* here, so tools/test-console.js can run all of it in Node.
// console.js reads the page into plain {headers, rows} tables and text lines,
// hands them to the functions below and stores what comes back.
//
// What the Play Developer API (androidpublisher v3) cannot give us — and why
// this reads the console page instead — is listed in store/console-tracker.md.

(function (root) {
  const P = root.PLSI || (root.PLSI = {});
  const cx = {};

  const HISTORY_CAP = 1000;
  const TRAIL_CAP = 50;
  const VIEW_GAP_MS = 60 * 1000;

  const clean = (s) => String(s == null ? '' : s).replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  const oneLine = (s) => clean(s).replace(/\n+/g, ' ');

  // ---------- where we are ----------

  // /console/u/0/developers/<dev>/app/<appId>/<page…>
  cx.routeOf = function routeOf(pathname) {
    const m = /\/console\/u\/\d+\/developers\/(\d+)(?:\/app\/(\d+))?(?:\/(.*))?$/.exec(pathname || '');
    if (!m) return null;
    const rest = (m[3] || '').replace(/\/+$/, '');
    const seg = rest.split('/');
    const r = { devId: m[1], appId: m[2] || null, path: rest, page: 'other', arg: null };
    if (!r.appId) {
      if (seg[0] === 'app-list') r.page = 'app-list';
      return r;
    }
    if (seg[0] === 'app-dashboard') r.page = 'dashboard';
    else if (rest === 'releases/overview') r.page = 'releases';
    else if (seg[0] === 'tracks' && seg[1]) { r.page = seg.length > 2 ? 'release' : 'track'; r.arg = seg[1]; } // …/releases/25/details is one release, not the track page
    else if (seg[0] === 'monetization-setup') r.page = 'licensing';
    else if (seg[0] === 'one-time-products' && seg[1] === 'sku' && seg[2]) { r.page = 'product'; r.arg = seg[2]; }
    else if (seg[0] === 'one-time-products') r.page = 'products';
    else if (seg[0] === 'subscriptions' && seg[1]) { r.page = 'subscription'; r.arg = seg[1] === 's' ? seg[2] || null : seg[1]; } // /subscriptions/s/<id>
    else if (seg[0] === 'subscriptions') r.page = 'subscriptions';
    else if (seg[0] === 'liveops') r.page = 'events';
    else if (seg[0] === 'promotions' || seg[0] === 'promo-codes') r.page = 'promos';
    else r.page = seg[0] || 'other';
    return r;
  };

  // ---------- small helpers ----------

  // The console prints "Oct 8, 2026 4:37 PM" in the viewer's zone and event
  // windows in UTC, so the caller says which one it is reading.
  cx.parseDate = function parseDate(s, utc) {
    const t = oneLine(s).replace(/,\s*(\d{1,2}:\d{2})/, ' $1').replace(/\s+at\s+/i, ' ');
    if (!/\d{4}/.test(t)) return null;
    const ms = Date.parse(utc && !/utc|gmt|z$/i.test(t) ? t + ' UTC' : t);
    return Number.isFinite(ms) ? ms : null;
  };

  cx.parseRange = function parseRange(text, utc) {
    const parts = clean(text)
      .split(/\n|\s[–—-]\s|\s+to\s+/i)
      .map(oneLine)
      .filter(Boolean);
    const out = { startRaw: parts[0] || null, endRaw: parts[1] || null, start: null, end: null };
    if (parts[0]) out.start = cx.parseDate(parts[0], utc);
    if (parts[1]) out.end = cx.parseDate(parts[1], utc);
    return out;
  };

  const col = (headers, re) => headers.findIndex((h) => re.test(h));

  // {headers:[…], rows:[{cells:[…], href}]} → [{<header>: cell, _href}]
  cx.rowsOf = function rowsOf(table) {
    if (!table || !Array.isArray(table.headers)) return [];
    const hs = table.headers.map((h) => oneLine(h).toLowerCase());
    return (table.rows || [])
      .filter((r) => r && Array.isArray(r.cells) && r.cells.some((c) => clean(c)))
      .map((r) => {
        const o = { _href: r.href || null };
        hs.forEach((h, i) => {
          if (h) o[h] = clean(r.cells[i]);
        });
        return o;
      });
  };

  const pick = (o, re) => {
    for (const k of Object.keys(o)) if (k[0] !== '_' && re.test(k)) return o[k];
    return '';
  };

  const hrefTail = (h) => {
    if (!h) return null;
    const p = String(h).split(/[?#]/)[0].replace(/\/+$/, '');
    return p.slice(p.lastIndexOf('/') + 1) || null;
  };

  // "1 - 2 of 2" under a table; tells us whether the page showed every row.
  cx.pagination = function pagination(text) {
    const m = /(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)/.exec(String(text || ''));
    return m ? { from: +m[1], to: +m[2], total: +m[3] } : null;
  };

  // ---------- app list / dashboard ----------

  const PKG_RE = /\b(?:[a-z][a-z0-9_]*\.){1,}[a-z][a-z0-9_]*\b/;
  const PKG_STRICT = /^(?:[a-z][a-z0-9_]*)(?:\.[a-z][a-z0-9_]*)+$/;

  cx.findPackage = function findPackage(text) {
    const m = /\b(?:vn|com|app|net|org|io|dev|co|me|xyz|info|tv|ai)\.[a-z0-9_]+(?:\.[a-z0-9_]+)+/.exec(String(text || ''));
    return m && PKG_STRICT.test(m[0]) ? m[0] : null;
  };

  cx.parseAppList = function parseAppList(table) {
    const out = [];
    for (const r of cx.rowsOf(table)) {
      const first = Object.keys(r).filter((k) => k[0] !== '_').map((k) => r[k]).find(Boolean) || '';
      const lines = first.split('\n').map(oneLine).filter(Boolean);
      const pkg = lines.find((l) => PKG_RE.test(l) && PKG_STRICT.test(l)) || cx.findPackage(first);
      const m = /\/app\/(\d+)(?:\/|$)/.exec(String(r._href || ''));
      if (!pkg || !m) continue;
      out.push({
        pkg,
        appId: m[1],
        name: lines.find((l) => l !== pkg) || pkg,
        installs: pick(r, /install/),
        status: pick(r, /status/),
        updated: pick(r, /updated/),
      });
    }
    return out;
  };

  // "Releases | Calmly: Adult Color by Number" → the app name
  cx.appNameFromTitle = function appNameFromTitle(title) {
    const t = oneLine(title);
    const i = t.indexOf(' | ');
    return i > 0 ? t.slice(i + 3).trim() || null : null;
  };

  // ---------- releases ----------

  cx.trackKey = function trackKey(s) {
    const t = oneLine(s).toLowerCase();
    if (/production/.test(t)) return 'production';
    if (/open/.test(t)) return 'open';
    if (/closed/.test(t)) return 'closed';
    if (/internal/.test(t)) return 'internal';
    return t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
  };

  const STATUS_RE =
    /(Update in review|In review|Available on Google Play|Available to (?:internal |opt-in )?testers?|Not (?:yet )?(?:live|published)|Draft|Halted|Paused|Rejected|Removed|Superseded|Approved|Ready to send|Changes not sent)/gi;
  const ROLLOUT_RE = /(Full rollout|\d+(?:\.\d+)?\s?% rollout|Rolling out|Rollout (?:halted|completed))/i;

  cx.parseStatus = function parseStatus(raw) {
    const t = oneLine(raw);
    const found = [];
    for (const m of t.matchAll(STATUS_RE)) if (!found.includes(m[1])) found.push(m[1]);
    const ro = ROLLOUT_RE.exec(t);
    return {
      status: found.join(', ') || t.replace(/^[a-z_]+\s+(?=[A-Z0-9])/, ''),
      inReview: /in review/i.test(t),
      rollout: ro ? ro[1] : null,
    };
  };

  // tables: every table found on /releases/overview
  cx.parseReleases = function parseReleases(tables) {
    const releases = [];
    const versions = [];
    for (const tb of tables || []) {
      const hs = (tb.headers || []).map((h) => oneLine(h).toLowerCase());
      if (col(hs, /^release$/) >= 0 && col(hs, /track/) >= 0) {
        for (const r of cx.rowsOf(tb)) {
          const st = cx.parseStatus(pick(r, /release status|status/));
          const name = oneLine(pick(r, /^release$/));
          const track = cx.trackKey(pick(r, /track/));
          releases.push({
            // several closed tracks can exist (Alpha, Beta…): keep them apart
            key: (track === 'closed' ? oneLine(pick(r, /track/)).toLowerCase() : track) + '|' + name,
            track,
            trackName: oneLine(pick(r, /track/)),
            release: name,
            latestVersion: oneLine(pick(r, /latest version/)),
            status: st.status,
            inReview: st.inReview,
            rollout: st.rollout,
            updated: oneLine(pick(r, /last updated/)),
            updatedTs: cx.parseDate(pick(r, /last updated/), false),
            countries: oneLine(pick(r, /countries/)),
            installBase: oneLine(pick(r, /install base/)),
          });
        }
      } else if (col(hs, /version code/) >= 0) {
        for (const r of cx.rowsOf(tb)) {
          const code = oneLine(pick(r, /version code/));
          if (!code) continue;
          const st = cx.parseStatus(pick(r, /status/));
          versions.push({
            key: code,
            versionCode: code,
            versionName: oneLine(pick(r, /version name/)),
            fileType: oneLine(pick(r, /file type/)),
            uploaded: oneLine(pick(r, /uploaded/)),
            uploadedTs: cx.parseDate(pick(r, /uploaded/), false),
            installBase: oneLine(pick(r, /install base/)),
            status: st.status,
          });
        }
      }
    }
    return { releases, versions };
  };

  // lines of the track page: "Active", "Latest release: ", "1.2.6", "178 countries / regions"
  cx.parseTrackHeader = function parseTrackHeader(lines) {
    const ls = (lines || []).map(oneLine).filter(Boolean);
    const i = ls.findIndex((l) => /^Latest release:?/i.test(l));
    // the state sits just before "Latest release" — the rest of the page may say "Active" too
    const near = i >= 0 ? ls.slice(Math.max(0, i - 3), i + 1) : ls;
    const state = /\b(Active|Paused|Inactive|Draft|Halted)\b/.exec(near.join(' '));
    let latest = null;
    let countries = null;
    if (i >= 0) {
      const same = ls[i].replace(/^Latest release:?\s*/i, '');
      // the version and the country count can arrive glued: "1.2.6178 countries"
      const glued = /^(.*?)(\d+)\s*countries/i.exec(same || ls[i + 1] || '');
      if (same && !/countries/i.test(same)) latest = same;
      else if (!same && ls[i + 1] && !/countries/i.test(ls[i + 1])) latest = ls[i + 1];
      else if (glued) {
        latest = glued[1].trim() || null;
        countries = +glued[2];
      }
      if (countries == null) {
        const c = ls.slice(i).map((l) => /(\d+)\s*countries/i.exec(l)).find(Boolean);
        if (c) countries = +c[1];
      }
    }
    if (!state && !latest) return null;
    // the page title is the track's name; the URL only carries a numeric id
    const nm = ls.slice(0, 12).find((l) => /^(Production|Open testing|Closed testing\b.*|Internal testing)$/i.test(l));
    const rel = ls.map((l) => /^Released on (.+)$/i.exec(l)).find(Boolean);
    const avail = ls.find((l) => /^Available (?:to|on) /i.test(l));
    return { state: state ? state[1] : null, latest, countries, name: nm || null, releasedOn: rel ? rel[1] : null, availability: avail || null };
  };

  // ---------- licensing key ----------

  cx.parseLicenseKey = function parseLicenseKey(text) {
    const m = /MIIB[A-Za-z0-9+/=\s]{200,}/.exec(String(text || ''));
    if (!m) return null;
    let key = m[0].replace(/\s+/g, '');
    // an RSA public key ends with the exponent 65537 ("IDAQAB"); whatever the
    // page prints after it (a "Copy" button, say) is not part of the key
    const end = key.indexOf('IDAQAB', 200);
    if (end > 0) key = key.slice(0, end + 6);
    return key.length >= 200 ? { key, length: key.length } : null;
  };

  // ---------- products, subscriptions, promo codes, events ----------

  // One generic reader: every header becomes a field, the id comes from the
  // "ID" column or the last segment of the row's link.
  function generic(table, idRe) {
    return cx.rowsOf(table)
      .map((r) => {
        const idCol = idRe ? oneLine(pick(r, idRe)) : '';
        const id = idCol || hrefTail(r._href);
        if (!id) return null;
        const rec = { key: id, id };
        for (const [k, v] of Object.entries(r)) if (k[0] !== '_') rec[k] = v.includes('\n') ? v.split('\n').map(oneLine).join(' · ') : v;
        if (r._href) rec.href = String(r._href).split(/[?#]/)[0];
        return rec;
      })
      .filter(Boolean);
  }

  cx.parseProducts = (table) => generic(table, /product id/);
  cx.parseSubscriptions = (table) => generic(table, /^(?:subscription |product )?id$/);
  cx.parsePromos = (table) => generic(table, /^(?:promo )?code(?:s)?$/);

  cx.parseEvents = function parseEvents(table) {
    const out = [];
    for (const r of cx.rowsOf(table)) {
      const lines = pick(r, /^event$/).split('\n').map(oneLine).filter(Boolean);
      const idLine = lines.find((l) => /\bID:\s*\d+/i.test(l)) || '';
      const id = (/ID:\s*(\d+)/i.exec(idLine) || [])[1] || hrefTail(r._href);
      if (!id) continue;
      const range = cx.parseRange(pick(r, /start and end|date/), true);
      out.push({
        key: id,
        id,
        name: lines.find((l) => !/\bID:\s*\d+/i.test(l)) || id,
        type: oneLine(pick(r, /event type|type/)),
        start: range.start,
        end: range.end,
        startRaw: range.startRaw,
        endRaw: range.endRaw,
        viewers: oneLine(pick(r, /viewers/)),
        converters: oneLine(pick(r, /converters/)),
        status: oneLine(pick(r, /^status$/)),
      });
    }
    return out;
  };

  // A product/subscription detail page: keep the dates and states we can see
  // and the first lines of text, so nothing is lost if a pattern is missed.
  cx.parseDetail = function parseDetail(lines) {
    const ls = (lines || []).map(oneLine).filter(Boolean);
    const dates = (re) => ls.map((l) => re.exec(l)).filter(Boolean).map((m) => m[1].trim());
    const states = [];
    for (const l of ls) if (/^(Active|Inactive|Draft|Archived|Cancelled|Canceled|Scheduled|Expired)$/i.test(l)) states.push(l);
    return {
      startedOn: dates(/Started on (.+)$/i),
      endsOn: dates(/(?:Ends|Ended|Expires|Expired) on (.+)$/i),
      states: [...new Set(states)],
      lines: ls.slice(0, 120),
    };
  };

  // ---------- keeping the record of one app ----------

  const SKIP = new Set(['firstSeen', 'lastSeen', 'trail', 'gone', 'href']);
  const labelOf = (n) => n.name || n['product name'] || n['subscription name'] || n.release || n.versionCode || n.id || n.key;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Merge a fresh list into the stored one. Every item keeps when it was first
  // and last seen and a trail of the moments any field changed.
  // `complete`: the page showed every row, so a missing one has really gone.
  cx.mergeList = function mergeList(prev, next, now, complete) {
    const old = new Map((prev || []).map((x) => [x.key, x]));
    const seen = new Set();
    const list = [];
    const changes = [];
    const snap = (o) => {
      const s = { t: now };
      for (const [k, v] of Object.entries(o)) if (!SKIP.has(k) && k !== 'key') s[k] = v;
      return s;
    };
    for (const n of next) {
      seen.add(n.key);
      const p = old.get(n.key);
      if (!p) {
        list.push({ ...n, firstSeen: now, lastSeen: now, trail: [snap(n)] });
        changes.push({ op: 'added', key: n.key, label: labelOf(n) });
        continue;
      }
      const diff = {};
      for (const k of Object.keys(n)) if (!SKIP.has(k) && !same(p[k], n[k])) diff[k] = [p[k] == null ? null : p[k], n[k]];
      const rec = { ...p, ...n, firstSeen: p.firstSeen, lastSeen: now, trail: p.trail || [snap(p)] };
      delete rec.gone;
      if (Object.keys(diff).length) {
        rec.trail = [...rec.trail, snap(n)].slice(-TRAIL_CAP);
        changes.push({ op: 'changed', key: n.key, label: labelOf(n), fields: diff });
      } else if (p.gone) {
        changes.push({ op: 'back', key: n.key, label: labelOf(n) });
      }
      list.push(rec);
    }
    for (const p of prev || []) {
      if (seen.has(p.key)) continue;
      if (complete && !p.gone) {
        list.push({ ...p, gone: now });
        changes.push({ op: 'removed', key: p.key, label: labelOf(p) });
      } else list.push(p);
    }
    return { list, changes };
  };

  cx.blankApp = function blankApp(pkg, ids, now) {
    return {
      v: 1,
      pkg,
      appId: (ids && ids.appId) || null,
      devId: (ids && ids.devId) || null,
      name: null,
      firstSeen: now,
      lastSeen: now,
      releases: [],
      versions: [],
      tracks: {},
      products: [],
      productDetails: {},
      subscriptions: [],
      subscriptionDetails: {},
      events: [],
      promos: [],
      license: null,
    };
  };

  const mergeObj = (prev, next, now, label) => {
    const diff = {};
    for (const k of Object.keys(next)) if (!same((prev || {})[k], next[k])) diff[k] = [prev && prev[k] != null ? prev[k] : null, next[k]];
    const rec = { ...(prev || {}), ...next, t: now };
    const changes = Object.keys(diff).length ? [{ op: prev ? 'changed' : 'added', key: label, label, fields: diff }] : [];
    return { rec, changes };
  };

  // Fold one parsed page into the app record. Returns the new record and the
  // list of things that changed (for the history).
  // payload by section:
  //   releases      {releases, versions, completeVersions}
  //   track         {key, header}
  //   licensing     {key, length}
  //   products / subscriptions / promos / events   {items, complete}
  //   product / subscription                       {id, detail}
  cx.applySection = function applySection(app, section, payload, now) {
    const a = { ...app, lastSeen: now };
    let changes = [];
    const tag = (cs, prefix) => cs.map((c) => ({ ...c, section, label: (prefix ? prefix + ' · ' : '') + c.label }));
    const list = (field, items, complete, prefix) => {
      const r = cx.mergeList(a[field], items, now, complete);
      a[field] = r.list;
      changes = changes.concat(tag(r.changes, prefix));
    };
    switch (section) {
      case 'releases':
        list('releases', payload.releases || [], true);
        list('versions', payload.versions || [], !!payload.completeVersions, 'version');
        break;
      case 'track': {
        const r = mergeObj((a.tracks || {})[payload.key], payload.header || {}, now, payload.key + ' track');
        a.tracks = { ...(a.tracks || {}), [payload.key]: r.rec };
        changes = tag(r.changes);
        break;
      }
      case 'licensing': {
        const prev = a.license;
        if (!prev) {
          a.license = { key: payload.key, length: payload.length, first: now, seen: now };
          changes = [{ section, op: 'added', key: 'license', label: 'Licensing key captured', fields: { length: [null, payload.length] } }];
        } else if (prev.key !== payload.key) {
          a.license = { key: payload.key, length: payload.length, first: now, seen: now, previous: prev.key };
          changes = [{ section, op: 'changed', key: 'license', label: 'Licensing key changed', fields: { length: [prev.length, payload.length] } }];
        } else a.license = { ...prev, seen: now };
        break;
      }
      case 'products':
        list('products', payload.items || [], payload.complete);
        break;
      case 'subscriptions':
        list('subscriptions', payload.items || [], payload.complete);
        break;
      case 'promos':
        list('promos', payload.items || [], payload.complete);
        break;
      case 'events':
        list('events', payload.items || [], payload.complete);
        break;
      case 'product':
      case 'subscription': {
        const field = section === 'product' ? 'productDetails' : 'subscriptionDetails';
        const d = payload.detail || {};
        const keep = { startedOn: d.startedOn, endsOn: d.endsOn, states: d.states };
        const r = mergeObj((a[field] || {})[payload.id], { ...keep, lines: d.lines }, now, section + ' ' + payload.id);
        a[field] = { ...(a[field] || {}), [payload.id]: r.rec };
        // the raw lines move on every visit; only dates and states are news
        changes = tag(
          r.changes.map((c) => {
            if (!c.fields) return c;
            const f = { ...c.fields };
            delete f.lines;
            return Object.keys(f).length ? { ...c, fields: f } : null;
          }).filter(Boolean)
        );
        break;
      }
      default:
    }
    return { app: a, changes };
  };

  // ---------- history ----------

  cx.changeEntries = function changeEntries(changes, now, page) {
    return changes.map((c) => ({ t: now, type: 'change', section: c.section, op: c.op, label: c.label, fields: c.fields || undefined, page }));
  };

  // Buttons worth a line in the history. Only the label of the control is
  // kept — never anything typed into a form.
  const ACTION_RE =
    /^(?:create new release|create release|promote release|manage rollout|pause track|resume track|halt rollout|resume rollout|increase rollout|complete rollout|save|save as draft|discard release|next|start rollout to (?:production|open testing|closed testing|internal testing)|rollout release|send \d+ changes? for review|send changes for review|publish(?: changes)?|create subscription|create one-time product|create promo code|create event|activate|deactivate|archive|delete|cancel|submit|add (?:a )?(?:base plan|offer|testers?)|remove)\b/i;

  cx.actionLabel = function actionLabel(text) {
    const t = oneLine(text).slice(0, 80);
    return t && t.length >= 2 && ACTION_RE.test(t) ? t : null;
  };

  cx.appendHistory = function appendHistory(hist, entries, cap) {
    const out = (hist || []).slice();
    for (const e of entries || []) {
      const last = out[out.length - 1];
      if (e.type === 'view' && last && last.type === 'view' && last.path === e.path && e.t - last.t < VIEW_GAP_MS) continue;
      if (e.type === 'action' && last && last.type === 'action' && last.label === e.label && last.path === e.path && e.t - last.t < 1500) continue;
      out.push(e);
    }
    const max = cap || HISTORY_CAP;
    return out.length > max ? out.slice(out.length - max) : out;
  };

  // ---------- the index of apps ----------

  // idx: {byApp:{<appId>:<pkg>}, apps:{<pkg>:{appId,devId,name}}}
  cx.learn = function learn(idx, pkg, appId, devId, name) {
    const i = idx && idx.byApp ? { byApp: { ...idx.byApp }, apps: { ...idx.apps } } : { byApp: {}, apps: {} };
    if (appId) i.byApp[appId] = pkg;
    i.apps[pkg] = { ...(i.apps[pkg] || {}), appId: appId || (i.apps[pkg] || {}).appId || null, devId: devId || (i.apps[pkg] || {}).devId || null, name: name || (i.apps[pkg] || {}).name || null };
    return i;
  };

  cx.KEY = { idx: 'cx:idx', app: (pkg) => 'c:' + pkg, hist: (pkg) => 'ch:' + pkg, flag: 'consoleTrack' };
  cx.HISTORY_CAP = HISTORY_CAP;

  // ---------- export ----------

  const csvCell = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const iso = (ts) => (ts ? new Date(ts).toISOString() : '');

  // One flat table for a spreadsheet: every dated thing the app has.
  cx.toCsv = function toCsv(app, hist) {
    const rows = [['type', 'name', 'id', 'status', 'start / first seen', 'end / updated', 'details']];
    for (const r of app.releases || []) rows.push(['release', r.release, r.track, [r.status, r.rollout].filter(Boolean).join(' · '), iso(r.firstSeen), r.updated, 'countries ' + r.countries + ' · installs ' + r.installBase]);
    for (const v of app.versions || []) rows.push(['version', v.versionName, v.versionCode, v.status, v.uploaded, '', v.fileType + ' · installs ' + v.installBase]);
    for (const e of app.events || []) rows.push(['event', e.name, e.id, e.status, iso(e.start), iso(e.end), e.type]);
    for (const p of app.products || []) rows.push(['product', p['product name'] || p.id, p.id, '', iso(p.firstSeen), p['last updated'] || '', p['active purchase options and offers'] || '']);
    for (const s of app.subscriptions || []) rows.push(['subscription', s.name || s['subscription name'] || s['product name'] || s.id, s.id, s.status || '', iso(s.firstSeen), s['last updated'] || '', '']);
    for (const p of app.promos || []) rows.push(['promo', p.id, p.id, p.status || '', iso(p.firstSeen), '', '']);
    for (const h of hist || []) rows.push(['history/' + h.type, h.label || '', h.section || h.page || '', h.op || '', iso(h.t), '', h.fields ? JSON.stringify(h.fields) : '']);
    return rows.map((r) => r.map(csvCell).join(',')).join('\n');
  };

  P.cx = cx;
  if (typeof module !== 'undefined' && module.exports) module.exports = cx;
})(globalThis);
