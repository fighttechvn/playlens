// PlayLens core — parsing and number crunching shared by the content script,
// the background worker and the Node tests. No DOM, no chrome.* in here.
//
// Where the data comes from: an app's detail page carries a series of
// AF_initDataCallback blocks. One of them holds the whole listing as a nested
// array (no field names, only positions). The positions below were checked on
// productivity apps, games, a paid app and an app with no ratings yet — see
// research/FEATURES.md. Every field is read on its own and validated, and the
// older JSON-LD / label parsing stays as the base layer, so a layout change on
// Google's side costs the new fields and not the whole extension.

(function (root) {
  const CACHE_V = 2;
  const DAY_MS = 86400000;

  // ---------- small helpers ----------

  function pick(o, ...path) {
    for (const k of path) {
      if (o == null) return null;
      o = o[k];
    }
    return o ?? null;
  }

  const str = (v) => (typeof v === 'string' && v ? v : null);
  const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

  // Listing text arrives as an HTML fragment. It is only ever shown through
  // textContent, so tags are dropped rather than rendered.
  function plain(html, max) {
    if (typeof html !== 'string') return null;
    let t = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m)
      .trim();
    if (max && t.length > max) t = t.slice(0, max - 1).trimEnd() + '…';
    return t || null;
  }

  function median(nums) {
    const a = nums.filter((n) => typeof n === 'number' && !isNaN(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  const clamp01 = (n) => Math.max(0, Math.min(1, n));

  // ---------- detail page ----------

  function detailUrl(id, gl, hl) {
    return (
      'https://play.google.com/store/apps/details?id=' +
      encodeURIComponent(id) +
      '&hl=' +
      (hl || 'en') +
      '&gl=' +
      (gl || 'US')
    );
  }

  // The block is found by shape, not by its key ("ds:5" today): the listing is
  // the one with a long array at [1][2] whose [13][2] is the install count.
  function readDetailBlock(html) {
    const re = /AF_initDataCallback\(\{key: '[^']+', hash: '[^']+', data:(.*?), sideChannel: \{\}\}\);/gs;
    for (const m of html.matchAll(re)) {
      let d;
      try {
        d = JSON.parse(m[1]);
      } catch {
        continue;
      }
      const base = pick(d, 1, 2);
      if (Array.isArray(base) && base.length > 100 && Number.isInteger(pick(base, 13, 2))) {
        return base;
      }
    }
    return null;
  }

  function downloadsNum(text) {
    if (!text) return -1;
    const m = String(text).match(/([\d.,]+)\s*([KMB])?/);
    if (!m) return -1;
    const base = parseFloat(m[1].replace(/,/g, ''));
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1;
    return base * mult;
  }

  // "$0.99 - $59.99 per item" / "₫23,000 - ₫920,000 per item" / "$4.99 per item"
  function parseIapRange(text) {
    if (!text) return null;
    const nums = (String(text).match(/\d[\d.,]*\d|\d/g) || [])
      .map((s) => {
        // The last separator decides: three digits after it means it groups
        // thousands (23,000 · 15.000), anything else means decimals
        // (0.99 · 1,09 · 1.234,50).
        const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
        if (last === -1) return parseFloat(s);
        if (s.length - last - 1 === 3) return parseFloat(s.replace(/[.,]/g, ''));
        return parseFloat(s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1));
      })
      .filter((n) => !isNaN(n));
    if (!nums.length) return null;
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }

  function parseDetail(html) {
    const info = {
      v: CACHE_V,
      name: null,
      icon: null,
      downloads: null,
      rating: null,
      reviews: null,
      updated: null,
    };

    // --- base layer: JSON-LD and visible labels (what 1.x shipped with) ---
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
    const dl = html.match(/>([\d.,]+[KMB]?\+?)<\/div><div[^>]*>Downloads</);
    if (dl) info.downloads = dl[1];
    const up = html.match(/Updated on<\/div><div[^>]*>([^<]+)</);
    if (up) info.updated = up[1].trim();

    // --- listing block: everything the page knows but does not print on lists ---
    const b = readDetailBlock(html);
    if (!b) return info;

    const minInstalls = int(pick(b, 13, 1));
    const installs = int(pick(b, 13, 2));
    // The exact count can never be below the floor of the public bucket; if it
    // is, the position moved and the number is something else.
    if (installs != null && installs >= (minInstalls || 0)) info.installs = installs;
    if (minInstalls != null) info.minInstalls = minInstalls;
    if (!info.downloads) info.downloads = str(pick(b, 13, 3)) || str(pick(b, 13, 0));

    if (!info.name) info.name = str(pick(b, 0, 0));
    if (!info.icon) info.icon = str(pick(b, 95, 0, 3, 2));

    const score = pick(b, 51, 0, 1);
    if (typeof score === 'number' && score >= 1 && score <= 5) {
      info.score = Math.round(score * 100) / 100;
      if (info.rating == null) info.rating = Math.round(score * 10) / 10;
    }
    const ratings = int(pick(b, 51, 2, 1));
    if (ratings != null && info.reviews == null) info.reviews = ratings;
    const textReviews = int(pick(b, 51, 3, 1));
    if (textReviews != null) info.textReviews = textReviews;

    const stars = [1, 2, 3, 4, 5].map((s) => int(pick(b, 51, 1, s, 1)));
    if (stars.every((n) => n != null) && stars.some((n) => n > 0)) info.stars = stars;

    const released = int(pick(b, 10, 1, 0));
    if (released && released > 1e9 && released < 4e9) {
      info.releasedTs = released;
      info.released = str(pick(b, 10, 0));
    }
    const updatedTs = int(pick(b, 145, 0, 1, 0));
    if (updatedTs && updatedTs > 1e9 && updatedTs < 4e9) {
      info.updatedTs = updatedTs;
      if (!info.updated) info.updated = str(pick(b, 145, 0, 0));
    }

    const price = pick(b, 57, 0, 0, 0, 0, 1, 0);
    if (Array.isArray(price) && typeof price[0] === 'number') {
      info.price = price[0] / 1e6;
      info.currency = str(price[1]);
      info.priceText = str(price[2]);
    }
    const iap = str(pick(b, 19, 0));
    if (iap) {
      info.iap = iap.replace(/\s*per item$/i, '');
      const r = parseIapRange(iap);
      if (r) {
        info.iapMin = r.min;
        info.iapMax = r.max;
      }
    }
    info.ads = !!pick(b, 48);

    info.genre = str(pick(b, 79, 0, 0, 0));
    info.genreId = str(pick(b, 79, 0, 0, 2));
    info.version = str(pick(b, 140, 0, 0, 0));
    info.minAndroid = str(pick(b, 140, 1, 1, 0, 0, 1));
    info.contentRating = str(pick(b, 9, 0));

    info.dev = str(pick(b, 68, 0));
    const devUrl = str(pick(b, 68, 1, 4, 2));
    if (devUrl && devUrl.startsWith('/store/apps/')) info.devUrl = devUrl;
    info.devEmail = str(pick(b, 69, 1, 0));
    info.devSite = httpUrl(pick(b, 69, 0, 5, 2));
    info.privacy = httpUrl(pick(b, 99, 0, 5, 2));

    info.summary = plain(pick(b, 73, 0, 1), 160);
    info.whatsNew = plain(pick(b, 144, 1, 1), 400);

    const shots = pick(b, 78, 0);
    if (Array.isArray(shots)) {
      info.shots = shots
        .map((s) => str(pick(s, 3, 2)))
        .filter((u) => u && u.startsWith('https://'))
        .slice(0, 6);
    }

    const safety = pick(b, 136, 1);
    if (Array.isArray(safety)) {
      info.safety = safety
        .map((s) => {
          const text = plain(pick(s, 1), 120);
          const detail = plain(pick(s, 2, 1), 120);
          return text ? (detail ? [text, detail] : [text]) : null;
        })
        .filter(Boolean)
        .slice(0, 5);
    }

    // Drop the empties: every app is cached, and nulls are most of the bytes
    // for an app that has no ratings or no in-app purchases.
    for (const k of Object.keys(info)) {
      if (info[k] == null || (Array.isArray(info[k]) && !info[k].length)) delete info[k];
    }
    return info;
  }

  function httpUrl(v) {
    return typeof v === 'string' && /^https?:\/\//i.test(v) ? v : null;
  }

  // ---------- derived numbers ----------

  function installsOf(info) {
    if (!info) return null;
    if (info.installs != null) return info.installs;
    const n = downloadsNum(info.downloads);
    return n >= 0 ? n : null;
  }

  function updatedMs(info) {
    if (!info) return null;
    if (info.updatedTs) return info.updatedTs * 1000;
    const t = Date.parse(info.updated); // "Jan 7, 2025" parses fine in en
    return isNaN(t) ? null : t;
  }

  function ageDays(info, now) {
    if (!info || !info.releasedTs) return null;
    return Math.max(0, ((now || Date.now()) - info.releasedTs * 1000) / DAY_MS);
  }

  // Lifetime average. It says how big the app's life has been, not how it is
  // doing this month — the measured figure from velocity() is for that.
  function perDay(info, now) {
    const days = ageDays(info, now);
    if (days == null || info.installs == null) return null;
    return info.installs / Math.max(1, days);
  }

  function lowShare(info) {
    const s = info && info.stars;
    if (!s) return null;
    const total = s[0] + s[1] + s[2] + s[3] + s[4];
    return total ? (s[0] + s[1]) / total : null;
  }

  function rateShare(info) {
    if (!info || info.reviews == null || !info.installs) return null;
    return info.reviews / info.installs;
  }

  function ageLabel(days) {
    if (days == null) return null;
    if (days < 1) return 'today';
    if (days < 60) return Math.round(days) + 'd';
    if (days < 365 * 2) return Math.round(days / 30.44) + 'mo';
    return Math.round(days / 365.25) + 'y';
  }

  function ageClass(days) {
    if (days == null) return '';
    if (days <= 30) return 'plsi-age-new';
    if (days <= 365) return 'plsi-age-young';
    return 'plsi-age-old';
  }

  function compact(n) {
    if (n == null || isNaN(n)) return null;
    const a = Math.abs(n);
    const f = (v, s) => {
      const t = v < 100 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v));
      return (n < 0 ? '-' : '') + t + s;
    };
    if (a >= 1e9) return f(a / 1e9, 'B');
    if (a >= 1e6) return f(a / 1e6, 'M');
    if (a >= 1e3) return f(a / 1e3, 'K');
    return String(a < 10 && a % 1 ? Math.round(n * 10) / 10 : Math.round(n));
  }

  // ---------- history: install counts over time, kept on the device ----------
  //
  // A snapshot is [unixSeconds, installs, ratings, score×100]. One per app per
  // day at most; after 90 days they thin out to one a week.

  const SNAP_GAP_MS = 20 * 3600 * 1000;
  const SNAP_MAX = 200;

  function pushSnapshot(list, info, now) {
    list = Array.isArray(list) ? list : [];
    if (!info || info.installs == null) return { list, added: false };
    now = now || Date.now();
    const last = list[list.length - 1];
    if (last && now - last[0] * 1000 < SNAP_GAP_MS) return { list, added: false };
    const next = [
      ...list,
      [
        Math.floor(now / 1000),
        info.installs,
        info.reviews ?? null,
        info.score != null ? Math.round(info.score * 100) : null,
      ],
    ];
    return { list: thin(next, now), added: true };
  }

  function thin(list, now) {
    const cutoff = (now - 90 * DAY_MS) / 1000;
    const out = [];
    let lastWeek = null;
    for (const s of list) {
      if (s[0] >= cutoff) {
        out.push(s);
        continue;
      }
      const week = Math.floor(s[0] / (7 * 86400));
      if (week !== lastWeek) {
        out.push(s);
        lastWeek = week;
      }
    }
    return out.slice(-SNAP_MAX);
  }

  // Installs per day between the latest snapshot and the oldest one inside the
  // last 30 days (or the one before it, when the app was not seen that month).
  function velocity(list) {
    if (!Array.isArray(list) || list.length < 2) return null;
    const last = list[list.length - 1];
    const windowStart = last[0] - 30 * 86400;
    let base = null;
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i][0] >= windowStart) {
        base = list[i];
        break;
      }
    }
    if (!base) base = list[list.length - 2];
    const days = (last[0] - base[0]) / 86400;
    if (days < 0.75) return null;
    return {
      perDay: Math.max(0, (last[1] - base[1]) / days),
      days,
      from: base[0] * 1000,
      to: last[0] * 1000,
      ratingsPerDay:
        last[2] != null && base[2] != null ? Math.max(0, (last[2] - base[2]) / days) : null,
    };
  }

  // ---------- what changed between two looks at the same app ----------

  const DIFF_FIELDS = [
    ['name', 'Name'],
    ['version', 'Version'],
    ['downloads', 'Installs'],
    ['rating', 'Rating'],
    ['priceText', 'Price'],
    ['iap', 'In-app purchases'],
    ['ads', 'Ads'],
    ['genre', 'Category'],
    ['dev', 'Developer'],
  ];

  function diffInfo(a, b) {
    const out = [];
    if (!a || !b) return out;
    // An entry saved by 1.x has none of the new fields; comparing it would
    // report every one of them as a change.
    const legacy = a.v !== CACHE_V;
    for (const [f, label] of DIFF_FIELDS) {
      if (legacy && !['name', 'downloads', 'rating'].includes(f)) continue;
      const x = f === 'priceText' ? priceLabel(a) : a[f];
      const y = f === 'priceText' ? priceLabel(b) : b[f];
      // A field missing on either side was not read, which is not news. In-app
      // purchases are the exception: there, missing means the app has none.
      if ((x == null || y == null) && f !== 'iap') continue;
      if ((x ?? null) === (y ?? null)) continue;
      if (f === 'ads' && !!x === !!y) continue;
      out.push({ f: label, a: show(x), b: show(y) });
    }
    if (!legacy && a.updatedTs && b.updatedTs && b.updatedTs > a.updatedTs + 3600) {
      out.push({ f: 'Updated', a: a.updated || '', b: b.updated || '' });
    }
    return out;
  }

  const show = (v) => (v == null ? '—' : v === true ? 'yes' : v === false ? 'no' : String(v));

  function priceLabel(info) {
    if (!info || info.price == null) return null;
    return info.price > 0 ? info.priceText || info.price + ' ' + (info.currency || '') : 'Free';
  }

  // ---------- batchexecute: reviews and search suggestions ----------

  function batchUrl(rpcid, gl, hl) {
    return (
      'https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=' +
      rpcid +
      '&hl=' +
      (hl || 'en') +
      '&gl=' +
      (gl || 'US')
    );
  }

  function batchBody(rpcid, payload) {
    return 'f.req=' + encodeURIComponent(JSON.stringify([[[rpcid, JSON.stringify(payload), null, 'generic']]]));
  }

  function parseBatch(text) {
    for (const line of String(text).split('\n')) {
      const t = line.trim();
      if (!t.startsWith('[[')) continue;
      let outer;
      try {
        outer = JSON.parse(t);
      } catch {
        continue;
      }
      for (const row of outer) {
        if (row && row[0] === 'wrb.fr' && typeof row[2] === 'string') {
          try {
            return JSON.parse(row[2]);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  // sort: 1 most relevant, 2 newest, 3 rating. score: 1..5 or null for all.
  function reviewsPayload(id, opts) {
    const o = opts || {};
    return [
      null,
      [2, o.sort || 2, [o.count || 40, null, o.token || null], null, [null, o.score || null]],
      [id, 7],
    ];
  }

  function parseReviews(data) {
    const rows = pick(data, 0);
    const reviews = [];
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const stars = int(pick(r, 2));
        const id = str(pick(r, 0));
        if (!id || !stars) continue;
        reviews.push({
          id,
          author: str(pick(r, 1, 0)) || '',
          stars,
          text: str(pick(r, 4)) || '',
          t: (int(pick(r, 5, 0)) || 0) * 1000,
          likes: int(pick(r, 6)) || 0,
          version: str(pick(r, 10)),
          reply: str(pick(r, 7, 1)),
        });
      }
    }
    return { reviews, token: str(pick(data, 1, 1)) };
  }

  function suggestPayload(term) {
    return [[null, [term], [10], [2], 4]];
  }

  function parseSuggest(data) {
    const rows = pick(data, 0, 0);
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => str(pick(r, 0))).filter(Boolean);
  }

  // ---------- words people keep using in reviews ----------

  const STOP = new Set(
    (
      'the and for that this with you your have has had not but are was were they them its it is i a an of to in ' +
      'on at my me so be as or if app apps can cant dont just very really would could should will when what which ' +
      'there their than then from too all any get got use used using one out now even more much also been only ' +
      'about after again because every into over still some does did doesnt didnt wont ive im thats please like ' +
      'time make made want need give gave keep keeps lot lots way back good great nice love best well thing things ' +
      'always never since these those being many most other such here his her him she who why how let see try ' +
      'new old day yet off our put say set two own may'
    ).split(' ')
  );

  function topTerms(texts, n) {
    const counts = new Map();
    for (const text of texts) {
      const words = String(text || '')
        .toLowerCase()
        .replace(/[’']/g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
      const seen = new Set(); // count a term once per review
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        // three letters is enough: "ads", "bug", "pay" are what reviews are about
        const ok = w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w);
        if (ok) seen.add(w);
        const w2 = words[i + 1];
        if (w2 && w.length >= 3 && w2.length >= 3 && !STOP.has(w) && !STOP.has(w2)) {
          seen.add(w + ' ' + w2);
        }
      }
      for (const t of seen) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const all = [...counts.entries()].filter(([, c]) => c >= 2);
    // A pair that appears as often as its words makes the single words redundant.
    const pairs = all.filter(([t]) => t.includes(' '));
    const covered = new Set();
    for (const [t, c] of pairs) {
      for (const w of t.split(' ')) {
        if ((counts.get(w) || 0) <= c * 1.3) covered.add(w);
      }
    }
    return all
      .filter(([t]) => !covered.has(t))
      .sort((x, y) => y[1] - x[1] || (y[0].includes(' ') ? 1 : 0) - (x[0].includes(' ') ? 1 : 0))
      .slice(0, n || 12)
      .map(([term, count]) => ({ term, count }));
  }

  // ---------- a page of apps, summed up ----------

  function summarize(infos, now) {
    now = now || Date.now();
    const list = infos.filter(Boolean);
    const n = list.length;
    if (!n) return null;
    const share = (fn) => list.filter(fn).length / n;
    const installs = list.map(installsOf).filter((v) => v != null);
    const newest = list
      .filter((i) => i.releasedTs)
      .sort((a, b) => b.releasedTs - a.releasedTs)[0];
    let weighted = 0;
    let weight = 0;
    for (const i of list) {
      if (i.rating != null && i.reviews) {
        weighted += (i.score ?? i.rating) * i.reviews;
        weight += i.reviews;
      }
    }
    return {
      n,
      sumInstalls: installs.reduce((s, v) => s + v, 0),
      medInstalls: median(installs),
      medRating: median(list.map((i) => i.score ?? i.rating)),
      avgRating: weight ? weighted / weight : null,
      medAgeDays: median(list.map((i) => ageDays(i, now))),
      shareFresh: share((i) => {
        const t = updatedMs(i);
        return t != null && now - t <= 90 * DAY_MS;
      }),
      shareStale: share((i) => {
        const t = updatedMs(i);
        return t != null && now - t > 540 * DAY_MS;
      }),
      shareIap: share((i) => !!i.iap),
      shareAds: share((i) => !!i.ads),
      sharePaid: share((i) => i.price > 0),
      newest: newest ? { name: newest.name, days: ageDays(newest, now) } : null,
    };
  }

  // How open a search term looks, 0..100, judged from its first ten results.
  // Same ingredients and weights as play-research/analyze.py, but on fixed
  // scales instead of ranks, so one page can be scored on its own.
  function opportunity(infos, now) {
    now = now || Date.now();
    const top = infos.filter(Boolean).slice(0, 10);
    if (top.length < 5) return null;
    const n = top.length;
    const sum = top.reduce((s, i) => s + (installsOf(i) || 0), 0);
    const demand = clamp01((Math.log10(sum + 1) - 5) / 4.5);
    const withIap = top.filter((i) => i.iap);
    const medIapMax = median(withIap.map((i) => i.iapMax)) || 0;
    const monet = (withIap.length / n) * clamp01(Math.log10(medIapMax + 1) / 2);
    const entrenched = top.filter((i) => (installsOf(i) || 0) >= 1e7 && (i.rating || 0) >= 4.3).length;
    const compet = 1 - entrenched / n;
    const weakCount = top.filter((i) => {
      const t = updatedMs(i);
      return (i.rating != null && i.rating < 4.0) || (t != null && now - t > 540 * DAY_MS);
    }).length;
    const weak = weakCount / n;
    return {
      score: Math.round(100 * (0.35 * demand + 0.3 * monet + 0.25 * compet + 0.1 * weak)),
      n,
      demand,
      monet,
      compet,
      weak,
      sumInstalls: sum,
      entrenched,
      weakCount,
      medIapMax,
      shareIap: withIap.length / n,
    };
  }

  // ---------- search results ----------

  function searchUrl(term, gl, hl) {
    return (
      'https://play.google.com/store/search?q=' +
      encodeURIComponent(term) +
      '&c=apps&hl=' +
      (hl || 'en') +
      '&gl=' +
      (gl || 'US')
    );
  }

  // App ids of a search page, in the order the results are listed.
  function searchIds(html, max) {
    const ids = [];
    for (const m of String(html).matchAll(/\/store\/apps\/details\?id=([\w.]+)/g)) {
      if (!ids.includes(m[1])) ids.push(m[1]);
      if (ids.length >= (max || 10)) break;
    }
    return ids;
  }

  // Where a watched app stood for a search term, one entry a day:
  // { "focus timer": [[unixDay, rank], …] }
  function pushRank(map, term, rank, now) {
    map = map && typeof map === 'object' ? { ...map } : {};
    const day = Math.floor((now || Date.now()) / DAY_MS);
    const list = Array.isArray(map[term]) ? [...map[term]] : [];
    if (list.length && list[list.length - 1][0] === day) list[list.length - 1] = [day, rank];
    else list.push([day, rank]);
    delete map[term]; // re-insert so the most recent term is last
    map[term] = list.slice(-60);
    const terms = Object.keys(map);
    for (const t of terms.slice(0, Math.max(0, terms.length - 30))) delete map[t];
    return map;
  }

  // ---------- what is kept on the device ----------

  const store = {
    get(keys) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(keys, (o) => resolve(o || {}));
        } catch {
          resolve({});
        }
      });
    },
    set(obj) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.set(obj, () => resolve());
        } catch {
          resolve();
        }
      });
    },
    remove(keys) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.remove(keys, () => resolve());
        } catch {
          resolve();
        }
      });
    },
  };

  // Every fresh look at an app goes through here: it adds the day's snapshot
  // and, for a watched app, works out what changed since the last look.
  async function record(id, info, opts) {
    const o = opts || {};
    const now = o.now || Date.now();
    const hk = 'h:' + id;
    const wk = 'w:' + id;
    const got = await store.get([hk, wk]);
    const w = got[wk];
    const out = {};
    let changes = [];
    if (o.history !== false || w) {
      const r = pushSnapshot(got[hk], info, now);
      if (r.added) out[hk] = r.list;
    }
    if (w) {
      changes = diffInfo(w.info, info).map((c) => ({ ...c, t: now }));
      out[wk] = {
        ...w,
        name: info.name || w.name,
        icon: info.icon || w.icon,
        info,
        checked: now,
        changes: [...changes, ...(w.changes || [])].slice(0, 20),
        unseen: (w.unseen || 0) + changes.length,
      };
    }
    if (Object.keys(out).length) await store.set(out);
    return { history: out[hk] || got[hk] || [], watch: out[wk] || w || null, changes };
  }

  // ---------- housekeeping ----------

  // Keys in storage.local that are safe to drop: cached listings nobody has
  // looked at for a week, and histories of apps not seen for four months
  // (watched apps keep theirs). On top of that both are capped by count, so a
  // heavy week of browsing cannot fill the 10 MB the browser allows.
  function gcKeys(all, watchIds, now, caps) {
    now = now || Date.now();
    const cap = { cache: 1500, history: 3000, ...(caps || {}) };
    const keep = new Set(watchIds || []);
    const out = [];
    const caches = [];
    const hists = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('app:') || k.startsWith('cc:')) {
        if (!v || !v.t || now - v.t > 7 * DAY_MS) out.push(k);
        else caches.push([k, v.t]);
      } else if (k.startsWith('h:') || k.startsWith('kw:')) {
        const id = k.slice(k.indexOf(':') + 1);
        if (keep.has(id)) continue;
        if (k.startsWith('kw:')) {
          out.push(k); // ranks are only kept for watched apps
          continue;
        }
        const last = Array.isArray(v) && v.length ? v[v.length - 1][0] * 1000 : 0;
        if (now - last > 120 * DAY_MS) out.push(k);
        else hists.push([k, last]);
      }
    }
    for (const [list, max] of [
      [caches, cap.cache],
      [hists, cap.history],
    ]) {
      if (list.length <= max) continue;
      list.sort((a, b) => b[1] - a[1]);
      for (const [k] of list.slice(max)) out.push(k);
    }
    return out;
  }

  function csvLine(cells) {
    return cells
      .map((c) => {
        let s = c == null ? '' : String(c);
        // a cell opening with = + - @ is run as a formula by spreadsheets
        if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      })
      .join(',');
  }

  root.PLSI = {
    CACHE_V,
    DAY_MS,
    pick,
    plain,
    median,
    detailUrl,
    readDetailBlock,
    parseDetail,
    parseIapRange,
    downloadsNum,
    installsOf,
    updatedMs,
    ageDays,
    ageLabel,
    ageClass,
    perDay,
    lowShare,
    rateShare,
    compact,
    pushSnapshot,
    velocity,
    diffInfo,
    priceLabel,
    batchUrl,
    batchBody,
    parseBatch,
    reviewsPayload,
    parseReviews,
    suggestPayload,
    parseSuggest,
    topTerms,
    summarize,
    opportunity,
    searchUrl,
    searchIds,
    pushRank,
    store,
    record,
    gcKeys,
    csvLine,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
