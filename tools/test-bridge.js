// Offline checks for bridge-data.js (what the MCP bridge may return).
//   node tools/test-bridge.js
const path = require('path');
require(path.join(__dirname, '..', 'console-parse.js'));
const b = require(path.join(__dirname, '..', 'bridge-data.js'));

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (!ok && detail !== undefined ? '  → ' + JSON.stringify(detail).slice(0, 300) : ''));
}

const D = 86400000;
const now = Date.UTC(2026, 9, 8, 12, 0, 0);
const rel = (track, trackName, release, status, ago, inReview) => ({ track, trackName, release, status, inReview: !!inReview, updatedTs: now - ago * D });
const all = {
  'cx:idx': { byApp: { 111: 'vn.fighttech.go2048', 222: 'app.web.hiddencam' }, apps: { 'vn.fighttech.go2048': { appId: '111', name: 'Go Brain 2048' }, 'app.web.hiddencam': { appId: '222', name: 'Hidden Camera' }, 'vn.fighttech.nodata': { appId: '333', name: 'No data yet' } } },
  'c:vn.fighttech.go2048': {
    pkg: 'vn.fighttech.go2048', appId: '111', name: 'Go Brain 2048', firstSeen: now - 9 * D, lastSeen: now - 3600e3,
    releases: [rel('production', null, '1.4.0 (12)', 'Available', 2), rel('open', 'Open testing', '1.5.0 (13)', 'In review', 0, true)],
    events: [{ id: 'e1', name: 'Halloween', status: 'Active', start: now - 2 * D, end: now + 2 * D }, { id: 'e2', name: 'Old', end: now - 5 * D }, { id: 'e3', name: 'Far', end: now + 40 * D }],
    products: [{ id: 'a' }], subscriptions: [], promos: [], versions: [],
    license: { key: 'MIIBxyz', length: 7 },
  },
  'ch:vn.fighttech.go2048': [{ t: now - 3 * D, type: 'view', page: 'releases' }, { t: now - 2 * D, type: 'change', op: 'added', label: 'x' }, { t: now - D, type: 'action', label: 'Publish' }],
  'c:app.web.hiddencam': { pkg: 'app.web.hiddencam', appId: '222', name: 'Hidden Camera', lastSeen: now - 5 * D, releases: [rel('production', null, '2.0 (7)', 'Update in review', 1, true)], events: [] },
  watch: ['com.whatsapp'],
  'w:com.whatsapp': { id: 'com.whatsapp', name: 'WhatsApp', checked: now - D, unseen: 2, changes: [{ f: 'Version', a: '1', b: '2' }], info: { installs: 5e9 } },
  'h:com.whatsapp': [[Math.floor(now / 1000) - 86400, 5e9, 1000, 440], [Math.floor(now / 1000), 5.1e9, 1010, 441]],
  'rk:com.whatsapp': { 'US|chat app': [[Math.floor(now / 86400000) - 1, 3], [Math.floor(now / 86400000), 2]] },
  license: { key: 'SECRET-LICENSE-KEY', email: 'x@y.z' },
  consoleTrack: true,
};
const H = (m, p, ctx) => b.handle(m, p, all, now, ctx);

{
  const s = H('status', {}, { version: '2.1.0' });
  check('status: counts', s.consoleApps === 2 && s.knownPackages === 3 && s.watchlist === 1 && s.installHistories === 1 && s.extensionVersion === '2.1.0', s);
}
{
  const r = H('console_apps', {});
  check('console_apps: all known packages, newest first', r.total === 3 && r.apps[0].pkg === 'vn.fighttech.go2048', r.apps.map((a) => a.pkg));
  const a = r.apps[0];
  check('console_apps: track + review + ISO times', a.tracks.production.release === '1.4.0 (12)' && a.inReview === 1 && /^2026-10-0/.test(a.lastSeenAt) && a.events.nextEnd != null && /^2026-/.test(a.events.nextEndAt), a);
  check('console_apps: package without data is flagged', r.apps.find((x) => x.pkg === 'vn.fighttech.nodata').hasData === false);
  check('console_apps: inReview filter', H('console_apps', { inReview: true }).total === 2);
  check('console_apps: query by name', H('console_apps', { query: 'hidden' }).apps[0].pkg === 'app.web.hiddencam');
  check('console_apps: eventsWithinDays', H('console_apps', { eventsWithinDays: 3 }).total === 1);
}
{
  const r = H('console_app', { pkg: '111' });
  check('console_app: by numeric appId', r.pkg === 'vn.fighttech.go2048' && r.releases.length === 2 && r.license.key === 'MIIBxyz', Object.keys(r));
  const c = H('console_app', { pkg: 'vn.fighttech.go2048', sections: ['events'] });
  check('console_app: sections', c.events.length === 3 && !c.releases && !c.license);
  check('console_app: unknown lists neighbours', H('console_app', { pkg: 'nope' }).error && H('console_app', { pkg: 'nope' }).known.length);
  check('console_app: known but empty', !!H('console_app', { pkg: 'vn.fighttech.nodata' }).note);
}
{
  const r = H('console_history', { pkg: 'vn.fighttech.go2048' });
  check('console_history: newest first', r.entries[0].type === 'action' && r.total === 3 && /^2026-/.test(r.entries[0].tAt), r.entries);
  check('console_history: type + limit', H('console_history', { pkg: 'vn.fighttech.go2048', type: 'view', limit: 1 }).entries.length === 1);
  check('console_history: since', H('console_history', { pkg: 'vn.fighttech.go2048', since: new Date(now - 1.5 * D).toISOString() }).entries.length === 1);
}
{
  const r = H('console_events', {});
  check('console_events: default window skips ended and far', r.events.length === 1 && r.events[0].name === 'Halloween' && r.events[0].daysLeft === 2, r.events);
  check('console_events: includeEnded', H('console_events', { includeEnded: true, withinDays: 60 }).events.length === 3);
}
{
  const w = H('watchlist', {});
  check('watchlist', w.total === 1 && w.apps[0].unseenChanges === 2 && w.apps[0].name === 'WhatsApp', w);
  const h = H('installs_history', { id: 'com.whatsapp' });
  check('installs_history: dates, score /100', h.points.length === 2 && h.points[1].installs === 5.1e9 && h.points[1].score === 4.41 && /^2026-10-0/.test(h.points[1].date), h);
  check('installs_history: unknown id', !!H('installs_history', { id: 'x' }).error);
  const r = H('ranks', { id: 'com.whatsapp' });
  check('ranks', r.keywords[0].gl === 'US' && r.keywords[0].term === 'chat app' && r.keywords[0].points[1].rank === 2, r);
}
{
  const k = H('storage_keys', {});
  check('storage_keys: lists license as NOT readable', k.keys.find((x) => x.key === 'license').readable === false && k.keys.find((x) => x.key === 'c:app.web.hiddencam').readable === true);
  check('storage_get: readable key', H('storage_get', { key: 'watch' }).value[0] === 'com.whatsapp');
  check('storage_get: licence refused', !!H('storage_get', { key: 'license' }).error && !JSON.stringify(H('storage_get', { key: 'license' })).includes('SECRET'));
  check('storage_get: unlisted key refused', !!H('storage_get', { key: 'something-else' }).error);
  const everything = JSON.stringify(b.methods.map((m) => H(m, { pkg: '111', id: 'com.whatsapp', key: 'license' }, { sync: { exact: true } })));
  check('no method ever returns the licence key', !everything.includes('SECRET-LICENSE-KEY') && !everything.includes('x@y.z'));
  check('settings comes from sync storage', H('settings', {}, { sync: { exact: true } }).settings.exact === true);
  check('unknown method', /Unknown method/.test(H('delete_everything', {}).error));
}

if (failed) {
  console.log('\n' + failed + ' failed');
  process.exit(1);
}
console.log('\nall ok');
