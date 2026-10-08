// Offline checks for console-report.js (HTML report + CSV of apps).
//   node tools/test-report.js
const path = require('path');
const cx = require(path.join(__dirname, '..', 'console-parse.js'));
const R = require(path.join(__dirname, '..', 'console-report.js'));

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (!ok && detail !== undefined ? '  → ' + JSON.stringify(detail).slice(0, 300) : ''));
}

const D = 86400000;
const now = Date.UTC(2026, 9, 8, 12, 0, 0);
const rel = (track, trackName, release, status, inReview) => ({ track, trackName, release, status, inReview: !!inReview, updatedTs: now });
const rec = {
  pkg: 'vn.fighttech.go2048', appId: '111', name: 'Go <Brain> "2048"', firstSeen: now - 9 * D, lastSeen: now,
  releases: [rel('production', null, '1.4.0 (12)', 'Available'), rel('open', 'Open testing', '1.5.0 (13)', 'In review', true), rel('closed', 'Closed testing - Alpha', '1.6.0', 'Draft')],
  events: [{ id: 'e1', name: 'Halloween, big', status: 'Active', start: now - 2 * D, end: now + 2 * D }],
  products: [{ id: 'coins', 'product name': 'Coins' }], subscriptions: [{ id: 'sub1', name: 'Pro' }], promos: [], versions: [],
  license: { key: 'MIIBxyz+/=', length: 10, first: now },
};
const rows = [
  { pkg: rec.pkg, has: true, sum: cx.summary(rec, now), rec, devId: '777' },
  { pkg: 'app.web.hiddencam', has: false, sum: cx.summary({ pkg: 'app.web.hiddencam', name: 'Hidden Camera' }, now), rec: null, devId: '888' },
];
const hist = { [rec.pkg]: [{ t: now - D, type: 'action', label: 'Publish <b>' }] };

const csv = R.csvApps(rows, now);
const lines = csv.split('\n');
check('csv: header + one line per app', lines.length === 3 && lines[0].startsWith('package,name,app_id,developer_id'), lines.length);
check('csv: quotes a name containing a comma and a quote', lines[1].includes('"Go <Brain> ""2048"""'), lines[1]);
check('csv: tracks, review count, next event and key', lines[1].includes('1.5.0 (13) · In review') && lines[1].includes('Alpha: 1.6.0 · Draft') && lines[1].includes('2026-10-10') && lines[1].includes('MIIBxyz+/='), lines[1]);
check('csv: an app without data still has a line', lines[2].startsWith('app.web.hiddencam,Hidden Camera'), lines[2]);

const html = R.html(rows, now, { hist });
check('html: standalone page without script or external file', /^<!DOCTYPE html>/.test(html) && !/<script|<link|src=|http:\/\//i.test(html));
check('html: escapes names and history', !html.includes('<Brain>') && html.includes('Go &lt;Brain&gt; &quot;2048&quot;') && html.includes('Publish &lt;b&gt;'));
check('html: groups by developer account', html.includes('Tài khoản developer 777') && html.includes('Tài khoản developer 888'));
check('html: per-app section only for apps with data', html.includes('id="app-vn.fighttech.go2048"') && !html.includes('id="app-app.web.hiddencam"'));
check('html: licensing key, event and countdown', html.includes('MIIBxyz+/=') && html.includes('Halloween, big') && html.includes('2 ngày'));
check('html: print keeps one app per page', html.includes('break-before:page'));

console.log(failed ? '\n' + failed + ' FAILED' : '\nall ok');
process.exit(failed ? 1 : 0);
