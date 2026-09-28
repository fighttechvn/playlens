// Checks core.js against the live store and a few fixed cases.
//   node tools/test-core.js
// Run it before a release: if a field comes back empty for EVERY app below,
// Google moved it and the position in core.js needs another look.
const path = require('path');
require(path.join(__dirname, '..', 'core.js'));
const P = globalThis.PLSI;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail !== undefined ? '  → ' + detail : ''));
}

async function get(url, init) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.text();
}

const post = (rpcid, payload, gl) =>
  get(P.batchUrl(rpcid, gl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: P.batchBody(rpcid, payload),
  }).then(P.parseBatch);

(async () => {
  console.log('pure functions');
  check('iap range $', JSON.stringify(P.parseIapRange('$0.99 - $59.99 per item')) === '{"min":0.99,"max":59.99}');
  check('iap range ₫', JSON.stringify(P.parseIapRange('₫23,000 - ₫920,000 per item')) === '{"min":23000,"max":920000}');
  check('iap range €', JSON.stringify(P.parseIapRange('1,09 € - 1.234,50 € per item')) === '{"min":1.09,"max":1234.5}', JSON.stringify(P.parseIapRange('1,09 € - 1.234,50 € per item')));
  check('iap range Rp', JSON.stringify(P.parseIapRange('Rp 15.000 - Rp 1.499.000 per item')) === '{"min":15000,"max":1499000}');
  check('iap single', JSON.stringify(P.parseIapRange('$4.99 per item')) === '{"min":4.99,"max":4.99}');
  check('compact', P.compact(49185779) === '49.2M' && P.compact(813462) === '813K' && P.compact(71) === '71', [P.compact(49185779), P.compact(813462), P.compact(71)].join(' '));
  check('plain', P.plain('a &amp; b<br>c <b>d</b>') === 'a & b\nc d');
  check('csv formula guard', P.csvLine(['=1+1', '-5', 'a"b']) === '"\'=1+1","-5","a""b"', P.csvLine(['=1+1', '-5', 'a"b']));

  const day = 86400000;
  const t0 = Date.UTC(2026, 8, 1);
  let h = [];
  let r = P.pushSnapshot(h, { installs: 1000, reviews: 10, score: 4.5 }, t0);
  check('snapshot added', r.added && r.list.length === 1);
  r = P.pushSnapshot(r.list, { installs: 1100 }, t0 + 3600e3);
  check('snapshot within 20h skipped', !r.added && r.list.length === 1);
  r = P.pushSnapshot(r.list, { installs: 1700 }, t0 + 7 * day);
  const v = P.velocity(r.list);
  check('velocity', v && Math.round(v.perDay) === 100, v && v.perDay);
  check('velocity needs two points', P.velocity([[1, 2, 3, 4]]) === null);

  const old = { v: 2, name: 'A', version: '1.0', rating: 4.2, downloads: '1M+', updatedTs: 1000000000, price: 0 };
  const neu = { v: 2, name: 'A', version: '1.1', rating: 4.3, downloads: '5M+', updatedTs: 1000090000, price: 0, updated: 'x' };
  const d = P.diffInfo(old, neu).map((c) => c.f).join(',');
  check('diff', d === 'Version,Installs,Rating,Updated', d);
  const legacy = P.diffInfo({ name: 'A', rating: 4.2, downloads: '1M+' }, neu).map((c) => c.f).join(',');
  check('diff against a 1.x entry compares only what 1.x stored', legacy === 'Installs,Rating', legacy);
  check('diff skips fields missing before', P.diffInfo({ v: 2, name: 'A' }, neu).length === 0);
  const iapNew = P.diffInfo({ v: 2, name: 'A' }, { v: 2, name: 'A', iap: '$0.99 - $9.99' }).map((c) => c.f).join(',');
  check('diff reports in-app purchases being added', iapNew === 'In-app purchases', iapNew);

  const terms = P.topTerms(['Too many ads now', 'ads everywhere, too many ads', 'subscription is expensive', 'expensive subscription', 'crashes on start', 'it crashes on start every time'], 5);
  const names = terms.map((t) => t.term);
  check('top terms', names.includes('ads') && names.includes('subscription') && names.includes('crashes'), JSON.stringify(terms));
  check('top terms counts once per review', terms.find((t) => t.term === 'ads').count === 2);

  console.log('\nranks, storage, housekeeping');
  const html = '<a href="/store/apps/details?id=a.one"></a><a href="/store/apps/details?id=b.two&hl=en"></a><a href="/store/apps/details?id=a.one"></a><a href="/store/apps/details?id=c.three"></a>';
  check('search ids keep page order, no repeats', P.searchIds(html).join(',') === 'a.one,b.two,c.three', P.searchIds(html).join(','));
  check('search ids honour the limit', P.searchIds(html, 2).length === 2);

  let ranks = P.pushRank(null, 'focus timer', 7, t0);
  ranks = P.pushRank(ranks, 'focus timer', 5, t0 + 3600e3);
  check('rank: one entry a day, last one wins', ranks['focus timer'].length === 1 && ranks['focus timer'][0][1] === 5, JSON.stringify(ranks));
  ranks = P.pushRank(ranks, 'focus timer', 4, t0 + day);
  check('rank: next day adds an entry', ranks['focus timer'].length === 2);
  for (let i = 0; i < 40; i++) ranks = P.pushRank(ranks, 'term ' + i, 1, t0 + day);
  check('rank: at most 30 terms kept, oldest dropped', Object.keys(ranks).length === 30 && !('focus timer' in ranks), Object.keys(ranks).length);

  // a stand-in for chrome.storage.local
  const mem = {};
  globalThis.chrome = {
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          for (const k of keys === null ? Object.keys(mem) : [].concat(keys)) if (k in mem) out[k] = mem[k];
          cb(JSON.parse(JSON.stringify(out)));
        },
        set(obj, cb) {
          Object.assign(mem, JSON.parse(JSON.stringify(obj)));
          cb();
        },
        remove(keys, cb) {
          for (const k of [].concat(keys)) delete mem[k];
          cb();
        },
      },
    },
  };
  const a1 = { v: 2, name: 'A', version: '1.0', rating: 4.2, score: 4.2, installs: 1000, reviews: 10, downloads: '1K+', price: 0 };
  let rec = await P.record('x.app', a1, { now: t0 });
  check('record: first look stores a snapshot', mem['h:x.app'].length === 1 && rec.changes.length === 0 && rec.watch === null);
  rec = await P.record('y.app', a1, { now: t0, history: false });
  check('record: history off stores nothing', !('h:y.app' in mem));
  mem['w:x.app'] = { id: 'x.app', name: 'A', info: a1, added: t0, checked: t0, changes: [], unseen: 0 };
  const a2 = { ...a1, version: '1.1', installs: 1700, downloads: '1K+' };
  rec = await P.record('x.app', a2, { now: t0 + 7 * day, history: false });
  check('record: watched app reports the change', rec.changes.map((c) => c.f).join(',') === 'Version', JSON.stringify(rec.changes));
  check('record: watched app keeps history even with history off', mem['h:x.app'].length === 2);
  check('record: unseen counted, newest change first', mem['w:x.app'].unseen === 1 && mem['w:x.app'].changes[0].t === t0 + 7 * day && mem['w:x.app'].info.version === '1.1');
  check('record: measured speed from the two snapshots', Math.round(P.velocity(rec.history).perDay) === 100);
  rec = await P.record('x.app', a2, { now: t0 + 8 * day });
  check('record: no change, nothing new unseen', rec.changes.length === 0 && mem['w:x.app'].unseen === 1);

  const nowGc = t0 + 200 * day;
  const sec = (ms) => Math.floor(ms / 1000);
  const all = {
    'app:fresh': { t: nowGc - day },
    'app:stale': { t: nowGc - 8 * day },
    'app:broken': {},
    'cc:fresh:US': { t: nowGc - day },
    'cc:stale:US': { t: nowGc - 9 * day },
    'h:seen': [[sec(nowGc - 10 * day), 1, 1, 1]],
    'h:gone': [[sec(nowGc - 130 * day), 1, 1, 1]],
    'h:watched': [[sec(nowGc - 130 * day), 1, 1, 1]],
    'kw:watched': { t: [[1, 1]] },
    'kw:dropped': { t: [[1, 1]] },
    'w:watched': { id: 'watched' },
    watch: ['watched'],
    recent: [],
  };
  const drop = P.gcKeys(all, ['watched'], nowGc).sort().join(',');
  check('gc: drops only what is stale', drop === 'app:broken,app:stale,cc:stale:US,h:gone,kw:dropped', drop);
  const many = {};
  for (let i = 0; i < 6; i++) many['app:n' + i] = { t: nowGc - i * 1000 };
  for (let i = 0; i < 6; i++) many['h:n' + i] = [[sec(nowGc) - i, 1, 1, 1]];
  const capped = P.gcKeys(many, [], nowGc, { cache: 4, history: 5 }).sort().join(',');
  check('gc: over the cap, the oldest go first', capped === 'app:n4,app:n5,h:n5', capped);

  console.log('\ndetail pages (live)');
  const apps = ['cc.forestapp', 'com.mojang.minecraftpe', 'com.whatsapp', 'vn.fighttech.go2048'];
  const infos = {};
  const seen = {};
  for (const id of apps) {
    const info = P.parseDetail(await get(P.detailUrl(id)));
    infos[id] = info;
    for (const k of Object.keys(info)) seen[k] = (seen[k] || 0) + 1;
    const bytes = JSON.stringify(info).length;
    console.log(
      '  ' + id.padEnd(26),
      String(info.installs).padStart(12),
      (info.released || '').padEnd(13),
      String(info.score ?? '—').padEnd(5),
      (info.stars ? 'stars' : '     '),
      (info.version || '—').padEnd(10),
      bytes + 'B'
    );
    check(id + ' name + installs', !!info.name && info.installs >= (info.minInstalls || 0));
    check(id + ' released', info.releasedTs > 1e9);
    check(id + ' cache size', bytes < 3000, bytes);
  }
  for (const k of ['installs', 'releasedTs', 'updatedTs', 'genre', 'dev', 'devUrl', 'devEmail', 'price', 'shots', 'summary', 'safety', 'contentRating']) {
    check('field "' + k + '" present on every app', seen[k] === apps.length, seen[k] + '/' + apps.length);
  }
  for (const k of ['stars', 'score', 'version', 'minAndroid', 'iap', 'whatsNew']) {
    check('field "' + k + '" present on some app', seen[k] > 0, (seen[k] || 0) + '/' + apps.length);
  }
  check('paid app has a price', infos['com.mojang.minecraftpe'].price > 0, infos['com.mojang.minecraftpe'].priceText);
  check('unrated app has no stars', !infos['vn.fighttech.go2048'].stars || infos['vn.fighttech.go2048'].reviews > 0);

  console.log('\ncountry');
  const vn = P.parseDetail(await get(P.detailUrl('cc.forestapp', 'VN')));
  check('installs are global', vn.installs === infos['cc.forestapp'].installs, vn.installs);
  check('rating is per country', vn.score != null, 'US ' + infos['cc.forestapp'].score + ' · VN ' + vn.score);
  check('iap is localised', vn.iap !== infos['cc.forestapp'].iap, vn.iap);

  console.log('\nreviews');
  const rv = P.parseReviews(await post('oCPfdb', P.reviewsPayload('cc.forestapp', { score: 1, count: 20 })));
  check('reviews returned', rv.reviews.length > 0, rv.reviews.length);
  check('star filter respected', rv.reviews.every((x) => x.stars === 1));
  check('review has text and date', rv.reviews.every((x) => x.text && x.t > 1e12));
  check('next page token', !!rv.token);
  if (rv.token) {
    const rv2 = P.parseReviews(await post('oCPfdb', P.reviewsPayload('cc.forestapp', { score: 1, count: 20, token: rv.token })));
    check('second page differs', rv2.reviews.length > 0 && rv2.reviews[0].id !== rv.reviews[0].id, rv2.reviews.length);
  }

  console.log('\nsuggestions');
  const sg = P.parseSuggest(await post('IJ4APc', P.suggestPayload('focus ti')));
  check('suggestions returned', sg.length > 0, sg.join(' | '));

  console.log('\nsummary');
  const list = Object.values(infos);
  const s = P.summarize(list);
  check('summary', s.n === 4 && s.sumInstalls > 1e9, JSON.stringify({ n: s.n, sum: P.compact(s.sumInstalls), med: P.compact(s.medInstalls) }));
  check('opportunity needs five apps', P.opportunity(list) === null);
  const o = P.opportunity([...list, ...list]);
  check('opportunity in range', o && o.score >= 0 && o.score <= 100, o && o.score);

  console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
