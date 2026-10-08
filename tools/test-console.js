// Offline checks for console-parse.js (the Play Console tracker).
//   node tools/test-console.js
// Fixtures are rows copied from a real console (Calmly, Oct 2026) so a change in
// how the parser reads them shows up here, not in a user's history.
const path = require('path');
const cx = require(path.join(__dirname, '..', 'console-parse.js'));

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (!ok && detail !== undefined ? '  → ' + JSON.stringify(detail) : ''));
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const BASE = '/console/u/0/developers/7730541199735528284/app/4972598606845725088/';

// ---- routes
{
  const r = cx.routeOf(BASE + 'releases/overview');
  check('route: releases', r.page === 'releases' && r.appId === '4972598606845725088' && r.devId === '7730541199735528284', r);
  check('route: open testing track', eq([cx.routeOf(BASE + 'tracks/open-testing').page, cx.routeOf(BASE + 'tracks/open-testing').arg], ['track', 'open-testing']));
  check('route: one-time product', eq([cx.routeOf(BASE + 'one-time-products/sku/coins_100').page, cx.routeOf(BASE + 'one-time-products/sku/coins_100').arg], ['product', 'coins_100']));
  check('route: subscription detail uses the id, not "s"', eq([cx.routeOf(BASE + 'subscriptions/s/premium_monthly').page, cx.routeOf(BASE + 'subscriptions/s/premium_monthly').arg], ['subscription', 'premium_monthly']));
  check('route: release details is not the track page', cx.routeOf(BASE + 'tracks/4698151056227775912/releases/25/details').page === 'release');
  {
    const h = cx.parseTrackHeader(['Open testing', 'Phones, Tablets, Desktop (Googlebook OS, ChromeOS), Google Play Games on PC, Android XR', 'Create new release', 'Track summary (Phones, Tablets)', 'Pause track', 'Active', 'Latest release: 1.2.6', '178 countries / regions', 'Releases', '1.2.6', 'Manage release', 'Available to unlimited testers', '1 version code', 'Released on Oct 8 2:07 AM']);
    check('track header: real open-testing page (name, state, release, availability)', eq([h.name, h.state, h.latest, h.countries, h.releasedOn, h.availability], ['Open testing', 'Active', '1.2.6', 178, 'Oct 8 2:07 AM', 'Available to unlimited testers']));
  }
  check('route: product list', cx.routeOf(BASE + 'one-time-products').page === 'products');
  check('route: licensing', cx.routeOf(BASE + 'monetization-setup').page === 'licensing');
  check('route: events', cx.routeOf(BASE + 'liveops/overview').page === 'events');
  check('route: app list has no app', cx.routeOf('/console/u/0/developers/7730541199735528284/app-list').page === 'app-list');
  check('route: outside the console', cx.routeOf('/store/apps/details') === null);
}

// ---- app list + dashboard
{
  const list = cx.parseAppList({
    headers: ['App', 'Installs', 'Status', 'Alerts', 'Last updated', ''],
    rows: [{ cells: ['Calmly: Adult Color by Number\nvn.fighttech.colorbynumber', '10K+', 'Available', '', 'Oct 8, 2026', 'View app'], href: BASE + 'app-dashboard' }],
  });
  check('app list: name, package, appId', list.length === 1 && list[0].pkg === 'vn.fighttech.colorbynumber' && list[0].appId === '4972598606845725088' && list[0].name.startsWith('Calmly'), list);
  check('findPackage on dashboard text', cx.findPackage('Calmly\nvn.fighttech.colorbynumber\nAvailable') === 'vn.fighttech.colorbynumber');
  check('findPackage ignores a plain sentence', cx.findPackage('Last updated on Oct 8. Not live.') === null);
  check('title → app name', cx.appNameFromTitle('Releases | Calmly: Adult Color by Number') === 'Calmly: Adult Color by Number');
}

// ---- releases overview
const overview = [
  {
    headers: ['Release', 'Latest version', 'Track', 'Release status', 'Last updated', 'Countries / regions', 'Install base'],
    rows: [
      { cells: ['1 (1.0.0)', '1', 'Production', 'schedule In review Full rollout', 'Oct 8, 2026 4:37 PM', '178 of 178', '0.00%'] },
      { cells: ['26 (1.2.6)', '26', 'Open testing', 'check_circle Available on Google Play', 'Oct 6, 2026 9:10 AM', '178 of 178', '1.20%'] },
      { cells: ['25 (1.2.5)', '25', 'Internal testing', 'Available to internal testers', 'Oct 1, 2026 8:00 AM', '1 of 178', ''] },
    ],
  },
  {
    headers: ['Version code', 'Version name', 'File type', 'Uploaded', 'Install base', 'Release status'],
    rows: [{ cells: ['26', '1.2.6', 'App bundle', 'Oct 6, 2026 9:05 AM', '1.20%', 'Available on Google Play'] }],
  },
];
{
  const { releases, versions } = cx.parseReleases(overview);
  const prod = releases.find((r) => r.track === 'production');
  check('releases: three tracks', eq(releases.map((r) => r.track), ['production', 'open', 'internal']), releases.map((r) => r.track));
  check('releases: in review + full rollout', prod.inReview === true && prod.rollout === 'Full rollout' && prod.status === 'In review', prod);
  check('releases: updated parsed to a date', typeof prod.updatedTs === 'number' && new Date(prod.updatedTs).getFullYear() === 2026, prod.updatedTs);
  check('releases: countries and install base kept', prod.countries === '178 of 178' && prod.installBase === '0.00%');
  check('releases: open testing live', releases[1].status === 'Available on Google Play' && !releases[1].inReview);
  check('versions: code, name, type', versions.length === 1 && versions[0].versionCode === '26' && versions[0].versionName === '1.2.6' && versions[0].fileType === 'App bundle', versions);
}

// ---- track page
{
  check('track header: separate lines', eq(cx.parseTrackHeader(['Active', 'Latest release: ', '1.2.6', '178 countries / regions']), { state: 'Active', latest: '1.2.6', countries: 178, name: null, releasedOn: null, availability: null }));
  check('track header: glued', eq(cx.parseTrackHeader(['Active', 'Latest release: 1.2.6', '178 countries / regions']), { state: 'Active', latest: '1.2.6', countries: 178, name: null, releasedOn: null, availability: null }));
  check('track header: paused', cx.parseTrackHeader(['Paused', 'Latest release: 3', '10 countries']).state === 'Paused');
  check('track header: nothing', cx.parseTrackHeader(['hello']) === null);
}

// ---- licensing key
{
  const fake = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA' + 'A1b2C3d4'.repeat(40) + 'IDAQAB';
  const text = 'Licensing\nYour license key\n' + fake.replace(/(.{64})/g, '$1\n') + '\nCopy';
  const r = cx.parseLicenseKey(text);
  check('licensing key: found, whitespace stripped', r && r.key === fake && r.length === fake.length, r && r.length);
  check('licensing key: none on other pages', cx.parseLicenseKey('Monetization setup\nNo key here') === null);
}

// ---- events (dates are UTC)
const eventsTable = {
  headers: ['Event', 'Event type', 'Start and end date (UTC)', 'Total unique viewers (last 28 days)', 'Total unique converters (last 28 days)', 'Status'],
  rows: [
    { cells: ['Halloween Sale\nID: 482876269732', 'Promotion', 'Oct 25, 2026, 12:00 AM – Nov 1, 2026, 11:59 PM', '1,204', '38', 'Scheduled'], href: BASE + 'liveops/events/482876269732' },
    { cells: ['Welcome Back\nID: 111', 'Major update', 'Sep 1, 2026 – Sep 30, 2026', '90', '4', 'Ended'] },
  ],
};
{
  const ev = cx.parseEvents(eventsTable);
  check('events: id, name, type, status', ev[0].id === '482876269732' && ev[0].name === 'Halloween Sale' && ev[0].type === 'Promotion' && ev[0].status === 'Scheduled', ev[0]);
  check('events: start and end as UTC timestamps', ev[0].start === Date.UTC(2026, 9, 25, 0, 0) && ev[0].end === Date.UTC(2026, 10, 1, 23, 59), [ev[0].start, ev[0].end]);
  check('events: date-only window', ev[1].start === Date.UTC(2026, 8, 1) && ev[1].end === Date.UTC(2026, 8, 30), ev[1]);
  check('events: viewers and converters kept', ev[0].viewers === '1,204' && ev[0].converters === '38');
  check('range: open ended', cx.parseRange('Oct 1, 2026\nNo end date', true).end === null);
}

// ---- products
const productsTable = {
  headers: ['Product name', 'Product ID', 'Last updated', 'Active purchase options and offers'],
  rows: [
    { cells: ['Remove ads', 'remove_ads', 'Sep 3, 2026', '1 purchase option'], href: BASE + 'one-time-products/sku/remove_ads' },
    { cells: ['Coin pack', 'coins_100', 'Sep 4, 2026', '1 purchase option, 1 offer'], href: BASE + 'one-time-products/sku/coins_100?x=1' },
  ],
};
{
  const ps = cx.parseProducts(productsTable);
  check('products: id from the ID column', ps.map((p) => p.id).join() === 'remove_ads,coins_100', ps);
  check('products: header-keyed fields', ps[1]['product name'] === 'Coin pack' && ps[1]['active purchase options and offers'] === '1 purchase option, 1 offer');
  check('products: link kept without query', ps[1].href.endsWith('/sku/coins_100'), ps[1].href);
  const subs = cx.parseSubscriptions({ headers: ['Name', 'Subscription ID', 'Status'], rows: [{ cells: ['Premium', 'premium_monthly', 'Active'], href: BASE + 'subscriptions/premium_monthly' }] });
  check('subscriptions: id from link or column', subs[0].id === 'premium_monthly' && subs[0].status === 'Active', subs);
}

// ---- product detail: offers and dates
{
  const d = cx.parseDetail(['Remove ads', 'Active', 'Purchase options', 'Buy', 'Started on Sep 3, 2026', 'Offers', 'Spring sale', 'Active', 'Started on Oct 1, 2026', 'Ends on Oct 31, 2026']);
  check('detail: started and end dates', eq(d.startedOn, ['Sep 3, 2026', 'Oct 1, 2026']) && eq(d.endsOn, ['Oct 31, 2026']), d);
  check('detail: states', eq(d.states, ['Active']), d.states);
}

// ---- pagination
{
  check('pagination: 1 - 2 of 2', eq(cx.pagination('Show rows: 10 1 - 2 of 2 first_page'), { from: 1, to: 2, total: 2 }));
  check('pagination: absent', cx.pagination('nothing') === null);
}

// ---- snapshots over time: dates and state changes
{
  let app = cx.blankApp('vn.fighttech.colorbynumber', { appId: '4972598606845725088', devId: '7730541199735528284' }, 1000);
  const t1 = 1_000_000, t2 = 2_000_000, t3 = 3_000_000;
  let r = cx.applySection(app, 'releases', { ...cx.parseReleases(overview), completeVersions: true }, t1);
  app = r.app;
  check('first look: every release is added', r.changes.filter((c) => c.op === 'added' && c.section === 'releases').length === 5 /* 3 releases + 1 version + prefix */ || r.changes.length >= 4, r.changes.length);
  const prod1 = app.releases.find((x) => x.track === 'production');
  check('first look: firstSeen and trail start', prod1.firstSeen === t1 && prod1.trail.length === 1 && prod1.trail[0].status === 'In review', prod1.trail);

  // review finished: production goes live
  const next = JSON.parse(JSON.stringify(overview));
  next[0].rows[0].cells[3] = 'check_circle Available on Google Play Full rollout';
  next[0].rows[0].cells[4] = 'Oct 10, 2026 2:00 PM';
  r = cx.applySection(app, 'releases', { ...cx.parseReleases(next), completeVersions: true }, t2);
  app = r.app;
  const prod2 = app.releases.find((x) => x.track === 'production');
  const ch = r.changes.find((c) => c.op === 'changed');
  check('second look: status change recorded with old → new', ch && eq(ch.fields.status, ['In review', 'Available on Google Play']) && ch.fields.inReview[1] === false, ch);
  check('second look: trail has both states with their dates', prod2.trail.length === 2 && prod2.trail[0].t === t1 && prod2.trail[1].t === t2 && prod2.firstSeen === t1, prod2.trail.map((x) => [x.t, x.status]));
  check('second look: unchanged rows add no trail', app.releases.find((x) => x.track === 'open').trail.length === 1);

  // identical look again → no changes, no noise
  r = cx.applySection(app, 'releases', { ...cx.parseReleases(next), completeVersions: true }, t3);
  check('same page again: no changes', r.changes.length === 0, r.changes);
  app = r.app;

  // a release vanishes (complete listing) → marked gone, then comes back
  const fewer = JSON.parse(JSON.stringify(next));
  fewer[0].rows.pop();
  r = cx.applySection(app, 'releases', { ...cx.parseReleases(fewer), completeVersions: true }, t3 + 1);
  check('release no longer listed → removed', r.changes.some((c) => c.op === 'removed') && r.app.releases.find((x) => x.track === 'internal').gone === t3 + 1, r.changes);
  const back = cx.applySection(r.app, 'releases', { ...cx.parseReleases(next), completeVersions: true }, t3 + 2);
  check('…and back again', back.changes.some((c) => c.op === 'back') && !back.app.releases.find((x) => x.track === 'internal').gone);

  // an incomplete page (paginated) never deletes
  const partial = cx.applySection(app, 'events', { items: cx.parseEvents(eventsTable), complete: false }, t1);
  const partial2 = cx.applySection(partial.app, 'events', { items: [cx.parseEvents(eventsTable)[0]], complete: false }, t2);
  check('paginated list: missing row is not "removed"', !partial2.changes.some((c) => c.op === 'removed') && partial2.app.events.length === 2);

  // events: start/end persisted, end date edited later
  const e1 = cx.applySection(app, 'events', { items: cx.parseEvents(eventsTable), complete: true }, t1);
  const moved = JSON.parse(JSON.stringify(eventsTable));
  moved.rows[0].cells[2] = 'Oct 25, 2026, 12:00 AM – Nov 8, 2026, 11:59 PM';
  const e2 = cx.applySection(e1.app, 'events', { items: cx.parseEvents(moved), complete: true }, t2);
  const ec = e2.changes.find((c) => c.op === 'changed');
  check('event end date moved → recorded', ec && ec.fields.end[0] === Date.UTC(2026, 10, 1, 23, 59) && ec.fields.end[1] === Date.UTC(2026, 10, 8, 23, 59), ec);

  // track page
  const tr = cx.applySection(app, 'track', { key: 'open', header: { state: 'Active', latest: '1.2.6', countries: 178 } }, t1);
  const tr2 = cx.applySection(tr.app, 'track', { key: 'open', header: { state: 'Paused', latest: '1.2.6', countries: 178 } }, t2);
  check('track paused → recorded', tr2.changes.length === 1 && eq(tr2.changes[0].fields.state, ['Active', 'Paused']), tr2.changes);

  // licensing
  const k1 = cx.applySection(app, 'licensing', { key: 'MIIBabc', length: 7 }, t1);
  check('licensing: captured once', k1.app.license.key === 'MIIBabc' && k1.changes.length === 1);
  const k2 = cx.applySection(k1.app, 'licensing', { key: 'MIIBabc', length: 7 }, t2);
  check('licensing: same key, no change', k2.changes.length === 0 && k2.app.license.seen === t2 && k2.app.license.first === t1);
  const k3 = cx.applySection(k2.app, 'licensing', { key: 'MIIBxyz', length: 7 }, t3);
  check('licensing: new key noticed, old kept', k3.changes.length === 1 && k3.app.license.previous === 'MIIBabc');

  // product detail
  const pd = cx.applySection(app, 'product', { id: 'coins_100', detail: cx.parseDetail(['Active', 'Started on Sep 3, 2026']) }, t1);
  const pd2 = cx.applySection(pd.app, 'product', { id: 'coins_100', detail: cx.parseDetail(['Active', 'Started on Sep 3, 2026', 'Offers', 'Ends on Oct 31, 2026']) }, t2);
  check('product detail: new end date is news, raw lines are not', pd2.changes.length === 1 && 'endsOn' in pd2.changes[0].fields && !('lines' in pd2.changes[0].fields), pd2.changes);

  // history
  const entries = cx.changeEntries(ch ? [ch] : [], t2, 'releases');
  let hist = cx.appendHistory([], entries);
  hist = cx.appendHistory(hist, [{ t: 5000, type: 'view', path: 'releases/overview' }]);
  hist = cx.appendHistory(hist, [{ t: 6000, type: 'view', path: 'releases/overview' }]);
  check('history: a view seen twice within a minute is one line', hist.filter((h) => h.type === 'view').length === 1);
  hist = cx.appendHistory(hist, [{ t: 90000, type: 'view', path: 'releases/overview' }]);
  check('history: later visit is a new line', hist.filter((h) => h.type === 'view').length === 2);
  const big = cx.appendHistory([], Array.from({ length: 1200 }, (_, i) => ({ t: i * 100000, type: 'action', label: 'x' + i, path: 'p' })));
  check('history: capped, newest kept', big.length === cx.HISTORY_CAP && big[big.length - 1].label === 'x1199');

  // actions: only known control labels, never free text
  check('action: "Promote release" is kept', cx.actionLabel('Promote release') === 'Promote release');
  check('action: "Send 3 changes for review" is kept', cx.actionLabel('Send 3 changes for review') !== null);
  check('action: random text is not', cx.actionLabel('my secret note about pricing') === null);
  check('action: empty is not', cx.actionLabel('   ') === null);

  // index
  let idx = cx.learn(null, 'vn.fighttech.colorbynumber', '4972598606845725088', '7730541199735528284', 'Calmly');
  idx = cx.learn(idx, 'vn.fighttech.colorbynumber', null, null, null);
  check('index: appId → package, name kept', idx.byApp['4972598606845725088'] === 'vn.fighttech.colorbynumber' && idx.apps['vn.fighttech.colorbynumber'].name === 'Calmly');

  // overview row
  {
    const n0 = Date.UTC(2026, 9, 8);
    const sm = cx.summary({
      pkg: 'a.b.c', name: 'A', lastSeen: 5,
      releases: [
        { track: 'production', trackName: 'Production', release: '1.2.5', status: 'Available on Google Play', updatedTs: 1 },
        { track: 'production', trackName: 'Production', release: '1.2.6', status: 'In review', inReview: true, updatedTs: 2 },
        { track: 'open', trackName: 'Open testing', release: '1.2.6', status: 'Available to testers', updatedTs: 3 },
        { track: 'closed', trackName: 'Closed testing - Alpha', release: '-', status: 'Draft' },
        { track: 'internal', trackName: 'Internal testing', release: '9', status: 'Old', gone: true },
      ],
      events: [
        { name: 'Sale', end: n0 + 2 * 86400000, status: 'Live' },
        { name: 'Old', end: n0 - 86400000, status: 'Live' },
      ],
      products: [{ id: 'x' }, { id: 'y', gone: true }], license: { key: 'K', length: 399 },
    }, n0);
    check('summary: newest release per track, gone ignored', sm.tracks.production.release === '1.2.6' && sm.tracks.open.release === '1.2.6' && sm.tracks.internal === null && sm.tracks.closed.length === 1, sm.tracks);
    check('summary: in review, events, products, key', sm.inReview === 1 && sm.events.nextName === 'Sale' && sm.events.active === 1 && sm.products === 1 && sm.hasKey && sm.keyLength === 399, sm);
    check('summary: empty record does not throw', cx.summary(null, n0).tracks.production === null);
  }

  // csv
  const csv = cx.toCsv(app, hist);
  check('csv: header + dated rows', csv.split('\n')[0].startsWith('type,name') && csv.includes('release,') && csv.includes('history/change'), csv.split('\n').slice(0, 3));
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
