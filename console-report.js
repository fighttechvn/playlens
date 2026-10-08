// PlayLens · Console report — pure, no chrome.* and no DOM.
//
// Turns the rows console-view.js builds ({pkg, has, sum, rec, devId}) into
//   csvApps(rows, now)       one line per app, for a spreadsheet
//   html(rows, now, opts)    a single self-contained page: overview + one section per app
// The page has no script and no external file, so it can be saved, mailed, or
// printed to PDF as it is.

(function (root) {
  const P = root.PLSI || (root.PLSI = {});
  const r = {};

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const day = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
  const stamp = (ts) => (ts ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '');
  const DAY = 86400000;

  const csvCell = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const trackText = (t) => (t ? [t.release, t.status, t.rollout].filter(Boolean).join(' · ') : '');
  const closedText = (list) => (list || []).map((t) => (t.name ? t.name.replace(/^Closed testing\s*-\s*/i, '') + ': ' : '') + trackText(t)).join(' | ');

  // ---------- CSV: one line per app ----------

  const CSV_HEAD = [
    'package', 'name', 'app_id', 'developer_id',
    'production', 'open_testing', 'closed_testing', 'internal_testing', 'releases_in_review',
    'events', 'next_event', 'next_event_ends', 'products', 'subscriptions', 'promos',
    'licensing_key', 'first_seen', 'last_seen',
  ];

  r.csvApps = function csvApps(rows, now) {
    const out = [CSV_HEAD];
    for (const x of rows) {
      const s = x.sum;
      const t = s.tracks || {};
      out.push([
        x.pkg, s.name || '', s.appId || '', x.devId || '',
        trackText(t.production), trackText(t.open), closedText(t.closed), trackText(t.internal), s.inReview || 0,
        s.events ? s.events.total : 0, s.events && s.events.nextName ? s.events.nextName : '', s.events ? day(s.events.nextEnd) : '',
        s.products || 0, s.subscriptions || 0, s.promos || 0,
        x.rec && x.rec.license ? x.rec.license.key : '', day(s.firstSeen), day(s.lastSeen),
      ]);
    }
    return out.map((l) => l.map(csvCell).join(',')).join('\n');
  };

  // ---------- HTML report ----------

  const CSS = `
:root{--bg:#fff;--fg:#1f1f1f;--muted:#5f6368;--card:#f6f7f8;--line:#d9dce0;--good:#146c2e;--warn:#8a5300;--bad:#b3261e;--accent:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#1f1f1f;--fg:#e3e3e3;--muted:#9aa0a6;--card:#2a2a2a;--line:#3c4043;--good:#6dd58c;--warn:#f5b768;--bad:#f2b8b5;--accent:#a8c7fa}}
@media print{:root{--bg:#fff;--fg:#1f1f1f;--muted:#5f6368;--card:#f6f7f8;--line:#d9dce0;--good:#146c2e;--warn:#8a5300;--bad:#b3261e;--accent:#0b57d0}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 24px 48px}
h1{margin:0 0 4px;font-size:22px}
h2{margin:30px 0 8px;font-size:17px}
h3{margin:18px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.meta{color:var(--muted);margin:0 0 16px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.stat{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:6px 14px;min-width:120px}
.stat b{display:block;font-size:19px;font-variant-numeric:tabular-nums}
.stat span{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 6px}
th,td{text-align:left;vertical-align:top;padding:6px 8px;border-top:1px solid var(--line)}
th{border-top:0;border-bottom:1px solid var(--line);color:var(--muted);font-weight:600;white-space:nowrap}
td{font-variant-numeric:tabular-nums}
td small{display:block;color:var(--muted)}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px}
.key{display:block;border:1px solid var(--line);background:var(--card);border-radius:6px;padding:8px 10px;word-break:break-all}
.good{color:var(--good)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.dev{margin:22px 0 6px;font-size:13px;color:var(--accent);font-weight:600}
.app{border-top:2px solid var(--line);margin-top:30px;padding-top:4px}
.none{color:var(--muted)}
a{color:var(--accent)}
@media print{main{max-width:none;padding:0}.app{break-before:page;margin-top:0}.app:first-of-type{break-before:auto}tr{break-inside:avoid}}
@page{margin:14mm}
`;

  function tbl(heads, rows, empty) {
    if (!rows.length) return '<p class="none">' + esc(empty) + '</p>';
    return (
      '<table><thead><tr>' + heads.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((c) => '<tr>' + c.map((v) => '<td>' + v + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>'
    );
  }

  function trackCellHtml(t) {
    if (!t) return '<span class="none">—</span>';
    const tone = t.inReview ? 'warn' : /production|available|live/i.test(t.status || '') ? 'good' : '';
    return esc(t.release || '—') + '<small class="' + tone + '">' + esc([t.status, t.rollout].filter(Boolean).join(' · ')) + '</small>';
  }

  function overviewRow(x, now) {
    const s = x.sum;
    const t = s.tracks || {};
    const e = s.events || {};
    const left = e.nextEnd ? Math.ceil((e.nextEnd - now) / DAY) : null;
    return [
      esc(s.name || x.pkg) + '<small class="mono">' + esc(x.pkg) + '</small>',
      trackCellHtml(t.production),
      trackCellHtml(t.open),
      (t.closed || []).length ? (t.closed || []).map((c) => '<small>' + esc((c.name || 'Closed').replace(/^Closed testing\s*-\s*/i, '')) + '</small>' + trackCellHtml(c)).join('') : '<span class="none">—</span>',
      trackCellHtml(t.internal),
      e.total ? esc(e.total + ' event') + (e.nextEnd ? '<small class="' + (left <= 3 ? 'warn' : 'good') + '">' + esc(day(e.nextEnd) + (left < 0 ? ' · đã hết hạn' : ' · còn ' + left + ' ngày')) + '</small>' : '') : '<span class="none">—</span>',
      esc([s.products, s.subscriptions, s.promos].join(' / ')),
      s.hasKey ? '<span class="good">đã lưu</span>' : x.has ? '<span class="warn">chưa lấy</span>' : '',
      esc(day(s.lastSeen) || 'chưa có dữ liệu'),
    ];
  }

  function appSection(x, now, hist) {
    const a = x.rec;
    const s = x.sum;
    let h = '<section class="app" id="app-' + esc(x.pkg) + '"><h2>' + esc(s.name || x.pkg) + '</h2>';
    h += '<p class="meta"><span class="mono">' + esc(x.pkg) + '</span>' + (s.appId ? ' · app id ' + esc(s.appId) : '') + (x.devId ? ' · developer ' + esc(x.devId) : '') + ' · ghi nhận lần cuối ' + esc(stamp(s.lastSeen)) + '</p>';
    if (!a) return h + '<p class="none">Chưa có trang nào của app này được mở, nên chưa có dữ liệu.</p></section>';

    h += '<h3>Release theo track</h3>';
    h += tbl(
      ['Track', 'Release', 'Trạng thái', 'Cập nhật (Console)', 'Quốc gia', 'Install base'],
      (a.releases || []).filter((v) => !v.gone).map((v) => [esc(v.trackName || v.track), esc(v.release), esc([v.status, v.rollout].filter(Boolean).join(' · ')), esc(v.updated), esc(v.countries), esc(v.installBase)]),
      'Chưa có release.'
    );
    h += '<h3>Phiên bản</h3>';
    h += tbl(
      ['Version code', 'Version name', 'Loại file', 'Upload', 'Install base', 'Trạng thái'],
      (a.versions || []).filter((v) => !v.gone).map((v) => [esc(v.versionCode), esc(v.versionName), esc(v.fileType), esc(v.uploaded), esc(v.installBase), esc(v.status)]),
      'Chưa có.'
    );
    h += '<h3>Sự kiện (UTC)</h3>';
    h += tbl(
      ['Sự kiện', 'ID', 'Loại', 'Bắt đầu', 'Hết hạn', 'Còn lại', 'Trạng thái'],
      (a.events || []).filter((v) => !v.gone).map((v) => {
        const d = v.end ? Math.ceil((v.end - now) / DAY) : null;
        return [esc(v.name), '<span class="mono">' + esc(v.id) + '</span>', esc(v.type), esc(day(v.start) || v.startRaw), esc(day(v.end) || v.endRaw), d == null ? '' : d < 0 ? '<span class="bad">đã hết hạn ' + -d + ' ngày</span>' : '<span class="' + (d <= 3 ? 'warn' : 'good') + '">' + (d === 0 ? 'hôm nay' : d + ' ngày') + '</span>', esc(v.status)];
      }),
      'Chưa có sự kiện.'
    );
    h += '<h3>Sản phẩm trả phí một lần (IAP)</h3>';
    h += tbl(
      ['Sản phẩm', 'ID', 'Gói & offer', 'Cập nhật (Console)'],
      (a.products || []).filter((v) => !v.gone).map((v) => [esc(v['product name'] || v.name || v.id), '<span class="mono">' + esc(v.id) + '</span>', esc(v['active purchase options and offers']), esc(v['last updated'])]),
      'Chưa có.'
    );
    const generic = (items) => {
      const live = (items || []).filter((v) => !v.gone);
      const keys = [];
      for (const it of live) for (const k of Object.keys(it)) if (!['key', 'href', 'firstSeen', 'lastSeen', 'trail', 'gone'].includes(k) && !keys.includes(k)) keys.push(k);
      return { keys, live };
    };
    for (const [title, list, empty] of [['Subscription', a.subscriptions, 'Chưa có.'], ['Mã khuyến mãi', a.promos, 'Chưa có.']]) {
      const g = generic(list);
      h += '<h3>' + title + '</h3>' + tbl(g.keys, g.live.map((it) => g.keys.map((k) => esc(it[k]))), empty);
    }
    h += '<h3>Khóa Licensing</h3>' + (a.license ? '<code class="key mono">' + esc(a.license.key) + '</code><p class="meta">' + esc(a.license.length) + ' ký tự · lấy lúc ' + esc(stamp(a.license.first)) + '</p>' : '<p class="none">Chưa lấy (mở Monetize → Monetization setup).</p>');

    const recent = (hist || []).slice(-30).reverse();
    h += '<h3>Lịch sử gần đây' + (hist && hist.length > recent.length ? ' (' + recent.length + '/' + hist.length + ')' : '') + '</h3>';
    h += tbl(
      ['Thời gian', 'Loại', 'Nội dung'],
      recent.map((e) => [esc(stamp(e.t)), esc(e.type), esc([e.label, e.op, e.section || e.page].filter(Boolean).join(' · '))]),
      'Chưa có.'
    );
    return h + '</section>';
  }

  // opts: {title, hist:{pkg:[entries]}}
  r.html = function html(rows, now, opts) {
    const o = opts || {};
    const title = o.title || 'PlayLens · Báo cáo Play Console';
    const withData = rows.filter((x) => x.has);
    const soon = withData.filter((x) => x.sum.events && x.sum.events.nextEnd && x.sum.events.nextEnd - now <= 3 * DAY).length;

    // Developer accounts: the Console URL carries the developer id, so group by it.
    const devs = [];
    for (const x of rows) if (!devs.includes(x.devId || '')) devs.push(x.devId || '');
    devs.sort();

    let h = '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title><style>' + CSS + '</style></head><body><main>';
    h += '<h1>' + esc(title) + '</h1><p class="meta">Xuất lúc ' + esc(stamp(now)) + ' · dữ liệu PlayLens đã ghi trên máy này</p>';
    h += '<div class="stats">' + [[rows.length, 'app'], [withData.length, 'app có dữ liệu'], [withData.reduce((n, x) => n + (x.sum.inReview || 0), 0), 'release đang In review'], [soon, 'app có event hết hạn ≤ 3 ngày'], [withData.filter((x) => x.sum.hasKey).length, 'app đã có khóa Licensing']]
      .map(([n, l]) => '<div class="stat"><b>' + esc(n) + '</b><span>' + esc(l) + '</span></div>').join('') + '</div>';

    const heads = ['App', 'Production', 'Open testing', 'Closed', 'Internal', 'Event', 'IAP/Sub/Promo', 'Licensing', 'Ghi nhận'];
    for (const d of devs) {
      const list = rows.filter((x) => (x.devId || '') === d);
      if (devs.length > 1 || d) h += '<div class="dev">Tài khoản developer ' + esc(d || '(chưa rõ)') + ' · ' + list.length + ' app</div>';
      h += tbl(heads, list.map((x) => overviewRow(x, now)), 'Chưa có app.');
    }
    for (const x of rows) if (x.has || o.includeEmpty) h += appSection(x, now, (o.hist || {})[x.pkg]);
    return h + '</main></body></html>';
  };

  P.cxReport = r;
  if (typeof module !== 'undefined' && module.exports) module.exports = r;
})(globalThis);
