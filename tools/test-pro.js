// Offline checks for the Pro helpers (core.js) and the licence logic (license.js).
//   node tools/test-pro.js
// No network and no browser: Polar is replaced by a stub fetch.
const path = require('path');
const mem = {};
globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        if (keys === null) return cb({ ...mem });
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out = {};
        for (const k of list) if (k in mem) out[k] = mem[k];
        cb(out);
      },
      set(o, cb) { Object.assign(mem, JSON.parse(JSON.stringify(o))); cb && cb(); },
      remove(k, cb) { for (const x of [].concat(k)) delete mem[x]; cb && cb(); },
    },
  },
};
require(path.join(__dirname, '..', 'core.js'));
require(path.join(__dirname, '..', 'license.js'));
const P = globalThis.PLSI;
const L = P.license;

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (!ok && detail !== undefined ? '  → ' + JSON.stringify(detail) : ''));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1, 12);

(async () => {
  console.log('licence status');
  const good = { key: 'PLAY-ABCDEFGH-1234', status: 'granted', expiresAt: 0, validatedAt: T0 };
  check('no record → free', same(L.status(null, T0), { pro: false, reason: 'none' }));
  check('granted → pro, lifetime', L.status(good, T0).pro && L.status(good, T0).lifetime);
  check('revoked → free', L.status({ ...good, status: 'revoked' }, T0).reason === 'revoked');
  check('expired → free', L.status({ ...good, expiresAt: T0 - 1 }, T0).reason === 'expired');
  check('future expiry → pro', L.status({ ...good, expiresAt: T0 + DAY }, T0).pro);
  check('13 days offline still pro', L.status(good, T0 + 13 * DAY).pro);
  check('15 days offline lapses', L.status(good, T0 + 15 * DAY).reason === 'lapsed');
  check('limits follow status', L.limits(good, T0).rankPairs === 150 && L.limits(null, T0).rankPairs === 3);
  check('revalidate after 20 h', !L.needsCheck(good, T0 + 19 * 3600e3) && L.needsCheck(good, T0 + 21 * 3600e3));
  check('revoked never rechecked', !L.needsCheck({ ...good, status: 'revoked' }, T0 + 5 * DAY));
  check('mask long', L.mask('PLAY-ABCDEFGH-1234') === 'PLAY-…1234', L.mask('PLAY-ABCDEFGH-1234'));
  check('mask short hides all', L.mask('abc') === '•••');
  check('plans and buyUrl fall back to pricing page', L.plans().length === 3 && L.buyUrl('yearly') === L.CONFIG.PRICING_URL);

  console.log('\nlicence calls (stub Polar)');
  let calls = [];
  let polar = {};
  globalThis.fetch = async (url, init) => {
    const ep = url.split('/').pop();
    const body = JSON.parse(init.body);
    calls.push([ep, body]);
    const r = polar[ep] ? polar[ep](body) : { code: 500 };
    return { status: r.code, json: async () => { if (r.json === undefined) throw new Error('empty'); return r.json; } };
  };
  check('unconfigured → no call', (await L.activate('PLAY-X', 'm', T0)).error === 'not_configured' && calls.length === 0);
  L.CONFIG.ORG_ID = '11111111-2222-3333-4444-555555555555';
  check('empty key', (await L.activate('  ', 'm', T0)).error === 'empty');
  polar = { validate: () => ({ code: 404, json: {} }) };
  check('404 → not_found', (await L.activate('PLAY-X', 'm', T0)).error === 'not_found');
  polar = { validate: () => ({ code: 200, json: { status: 'revoked' } }) };
  check('revoked key → inactive', (await L.activate('PLAY-X', 'm', T0)).error === 'inactive');
  polar = { validate: () => ({ code: 200, json: { status: 'granted', limit_activations: 3 } }), activate: () => ({ code: 403, json: {} }) };
  check('403 → limit, nothing stored', (await L.activate('PLAY-X', 'm', T0)).error === 'limit' && !mem.license);
  polar = { validate: () => ({ code: 503 }) };
  check('5xx → network', (await L.activate('PLAY-X', 'm', T0)).error === 'network');
  polar = {
    validate: (b) => ({ code: 200, json: { status: 'granted', limit_activations: 3, expires_at: b.activation_id ? '2027-01-01T00:00:00Z' : null } }),
    activate: () => ({ code: 200, json: { id: 'act-9' } }),
  };
  calls = [];
  const ok = await L.activate(' PLAY-X ', 'a'.repeat(200), T0);
  check('activation succeeds', ok.ok && ok.state.pro, ok);
  check('stored record', mem.license && mem.license.key === 'PLAY-X' && mem.license.activationId === 'act-9' && mem.license.expiresAt === Date.parse('2027-01-01T00:00:00Z'), mem.license);
  check('label cut to 80', calls.find((c) => c[0] === 'activate')[1].label.length === 80);
  check('org id on every call', calls.every((c) => c[1].organization_id === L.CONFIG.ORG_ID));

  polar = { validate: () => ({ code: 404, json: {} }) };
  let rv = await L.revalidate(T0 + DAY);
  check('revalidate 404 → revoked', rv.checked && !rv.state.pro && mem.license.status === 'revoked', rv);
  mem.license = { ...good };
  polar = { validate: () => ({ code: 502 }) };
  rv = await L.revalidate(T0 + DAY);
  check('revalidate network error changes nothing', !rv.checked && rv.state.pro && mem.license.validatedAt === T0, rv);
  polar = { validate: () => ({ code: 200, json: { status: 'granted', expires_at: null } }) };
  rv = await L.revalidate(T0 + 2 * DAY);
  check('revalidate ok refreshes time', rv.checked && mem.license.validatedAt === T0 + 2 * DAY);
  mem.license = { ...good, activationId: 'act-9' };
  calls = [];
  polar = { deactivate: () => ({ code: 204 }) };
  await L.deactivate();
  check('deactivate frees the slot and forgets', calls[0][0] === 'deactivate' && calls[0][1].activation_id === 'act-9' && !mem.license, calls);
  L.CONFIG.ORG_ID = '';

  console.log('\nrank tracker');
  const k = P.trackKey('  Focus Timer ', 'us');
  check('trackKey normalises', k === 'US|focus timer', k);
  check('parseTrackKey', same(P.parseTrackKey('US|a|b'), { gl: 'US', term: 'a|b' }));
  let m = P.pushTrack({}, k, 7, T0);
  m = P.pushTrack(m, k, 5, T0 + 100);
  check('same day overwrites', m[k].length === 1 && m[k][0][1] === 5, m);
  m = P.pushTrack(m, k, 3, T0 + DAY);
  check('next day appends', m[k].length === 2);
  let big = {};
  for (let i = 0; i < 120; i++) big = P.pushTrack(big, k, 1 + (i % 9), T0 + i * DAY);
  check('keeps 90 days', big[k].length === 90 && big[k][0][0] === Math.floor(T0 / DAY) + 30, big[k].length);
  check('input map untouched', same(P.pushTrack(m, k, 9, T0 + 2 * DAY)[k].length, 3) && m[k].length === 2);
  check('move: climbed', P.trackMove([[1, 9], [2, 4]]).move === 5);
  check('move: fell', P.trackMove([[1, 4], [2, 9]]).move === -5);
  const ent = P.trackMove([[1, 0], [2, 10]]);
  check('move: entered', ent.entered && ent.move === 21, ent);
  const lft = P.trackMove([[1, 10], [2, 0]]);
  check('move: left', lft.left && lft.move === -21, lft);
  check('move: first day is zero', P.trackMove([[1, 3]]).move === 0 && P.trackMove([]) === null);
  const all = { watch: ['a', 'b'], 'rk:a': { 'US|x': [[1, 2]], 'GB|y': [[1, 3]] }, 'rk:b': { 'US|z': [[1, 4]] }, 'rk:gone': { 'US|q': [[1, 1]] } };
  check('trackedPairs in watch order, cut to limit', P.trackedPairs(all, ['a', 'b'], 2).length === 2 && P.trackedPairs(all, ['a', 'b'])[2].term === 'z');
  check('countTracked counts everything stored', P.countTracked(all) === 4);
  const html = '<a href="/store/apps/details?id=com.a"></a><a href="/store/apps/details?id=com.b"></a><a href="/store/apps/details?id=com.a"></a>';
  check('rankIn finds place, dedups', P.rankIn(html, 'com.b') === 2 && P.rankIn(html, 'com.zzz') === 0);

  console.log('\nbackup');
  const store = { watch: ['a'], 'w:a': { name: 'A', info: {}, changes: [] }, 'h:a': [[1, 2, 3, 400]], 'rk:a': { 'US|x': [[1, 2]] }, 'kw:a': {}, 'app:a': { t: 1 }, recent: [1], license: { key: 'SECRET' } };
  const b = P.makeBackup(store, T0);
  check('backup holds history only', same(Object.keys(b.data).sort(), ['h:a', 'kw:a', 'rk:a', 'w:a', 'watch']), Object.keys(b.data));
  check('backup never carries the licence key', !JSON.stringify(b).includes('SECRET'));
  const rb = P.readBackup(JSON.parse(JSON.stringify(b)));
  check('round trip', rb && rb.skipped === 0 && rb.apps === 1 && same(rb.data, b.data));
  check('rejects other json', P.readBackup({ a: 1 }) === null && P.readBackup(null) === null && P.readBackup({ format: 'x', data: {} }) === null);
  const evil = P.readBackup({ format: 'playlens-backup', version: 1, data: { license: { key: 'x', status: 'granted' }, watch: 'nope', 'h:z': 5, 'w:q': { name: 'Q' }, '__proto__': { a: 1 } } });
  check('drops licence, bad shapes and unknown keys', evil && same(Object.keys(evil.data), ['w:q']) && evil.skipped >= 3, evil);

  console.log('\nreport');
  const rep = {
    watch: ['a'],
    'w:a': { name: 'Alpha <b>', info: { installs: 1500, score: 4.5 }, changes: [{ t: T0 - DAY, f: 'Version', a: '1', b: '2', name: 'Alpha' }, { t: T0 - 40 * DAY, f: 'Price', a: 'Free', b: '$1' }] },
    'h:a': [[Math.floor((T0 - 6 * DAY) / 1000), 1000, 10, 440], [Math.floor(T0 / 1000), 1500, 12, 450]],
    'rk:a': { 'US|focus': [[1, 9], [2, 4]] },
  };
  const rows = P.reportRows(rep, T0, 7);
  check('one row, growth and rating move', rows.length === 1 && rows[0].growth === 500 && Math.abs(rows[0].ratingMove - 0.1) < 1e-9, rows[0]);
  check('only changes inside the window', rows[0].changes.length === 1);
  check('rank move in row', rows[0].ranks[0].move === 5 && rows[0].ranks[0].term === 'focus');
  const md = P.reportMarkdown(rows, T0, 7);
  check('markdown mentions rank and change', /#4 \(▲5\)/.test(md) && /Version: 1 → 2/.test(md), md);
  const htm = P.reportHtml(rows, T0, 7);
  check('html escapes names', htm.includes('Alpha &lt;b&gt;') && !htm.includes('Alpha <b>'));
  check('empty watchlist is fine', P.reportRows({}, T0, 7).length === 0);

  console.log('\ncompare');
  check('indexSeries base 100', same(P.indexSeries([[1, 50], [2, 75]]), [[1, 100], [2, 150]]));
  check('indexSeries needs two points and a base', P.indexSeries([[1, 5]]) === null && P.indexSeries([[1, 0], [2, 5]]) === null);
  check('ratingSeries', same(P.ratingSeries([[1, 1, 1, 450], [2, 1, 1, null], [3, 1, 1, 460]]), [[1, 4.5], [3, 4.6]]) && P.ratingSeries([[1, 1, 1, 450]]) === null);
  check('best: bigger', same(P.bestIndexes([1, 5, 3], 1), [1]));
  check('best: smaller', same(P.bestIndexes([4, 2, 9], -1), [1]));
  check('best: ties and gaps give none', same(P.bestIndexes([2, 2], 1), []) && same(P.bestIndexes([null, 3], 1), []) && same(P.bestIndexes([1, 2], 0), []));
  check('best: shared top', same(P.bestIndexes([5, 5, 1], 1), [0, 1]));

  console.log('\nsaved keyword lists');
  let lists = P.saveKeywordList([], 'a', 'US', [{ term: 't1', score: { score: 70 }, sum: { medInstalls: 1000.4, medAgeDays: 99.6 } }, { term: '' }, { term: 't2' }], T0);
  check('keeps terms with scores', lists[0].items.length === 2 && lists[0].items[0].score === 70 && lists[0].items[0].med === 1000 && lists[0].items[0].age === 100 && lists[0].items[1].score === null, lists[0]);
  lists = P.saveKeywordList(lists, 'b', 'GB', [], T0 + 1);
  lists = P.saveKeywordList(lists, 'a', 'US', [{ term: 'n' }], T0 + 2);
  check('same name replaces and moves first', lists.length === 2 && lists[0].name === 'a' && lists[0].items.length === 1);
  let many = [];
  for (let i = 0; i < 30; i++) many = P.saveKeywordList(many, 'n' + i, 'US', [], T0, 20);
  check('capped at the limit', many.length === 20 && many[0].name === 'n29');

  console.log('\nalerts');
  check('nothing to say → null', P.alertText([], []) === null && P.alertText([{ f: 'Description', name: 'x', a: '', b: '' }], [{ move: 1 }]) === null);
  const lines = P.alertText([{ f: 'Version', name: 'Alpha', a: '1', b: '2' }], [{ name: 'Alpha', term: 'k', gl: 'US', move: 4, rank: 3 }, { name: 'Alpha', term: 'j', gl: 'US', entered: true, rank: 20, move: 11 }, { name: 'Alpha', term: 'l', gl: 'US', left: true, move: -9 }, { name: 'Alpha', term: 'small', gl: 'US', move: 2, rank: 5 }]);
  check('lines for change, climb, entry, exit; not a 2-place move', lines.length === 4 && /up 4 to #3/.test(lines[1]) && /entered/.test(lines[2]) && /left/.test(lines[3]), lines);

  console.log('\nstorage hygiene');
  const gc = P.gcKeys({ 'rk:a': {}, 'rk:z': {}, 'kw:z': {}, 'h:a': [[Math.floor(T0 / 1000), 1, 1, 1]] }, ['a'], T0);
  check('ranks of unwatched apps are collected', same(gc.sort(), ['kw:z', 'rk:z']), gc);

  console.log(failed ? '\n' + failed + ' check(s) FAILED' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
