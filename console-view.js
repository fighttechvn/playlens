// Viewer for what console.js saved: one app at a time, by package name.
const P = globalThis.PLSI;
const cx = P.cx;
const K = cx.KEY;
const $ = (id) => document.getElementById(id);

const state = { idx: { apps: {}, byApp: {} }, pkg: null, app: null, hist: [] };

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

const fmt = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

function say(t) {
  $('status').textContent = t;
}

function chip(text, tone) {
  return el('span', { class: 'chip' + (tone ? ' ' + tone : ''), text });
}

function statusTone(s) {
  const t = String(s || '').toLowerCase();
  if (/review|scheduled|draft|paused/.test(t)) return 'warn';
  if (/reject|halt|removed|ended|expired|inactive/.test(t)) return 'bad';
  if (/available|active|live|full rollout/.test(t)) return 'good';
  return '';
}

function table(root, cols, rows, empty) {
  root.replaceChildren();
  if (!rows.length) {
    root.append(el('div', { class: 'empty', text: empty }));
    return;
  }
  root.append(
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, cols.map((c) => el('th', { text: c.h })))),
      el(
        'tbody',
        {},
        rows.map((r) =>
          el(
            'tr',
            { class: r.gone ? 'gone' : '' },
            cols.map((c) => {
              const v = c.v(r);
              return el('td', { class: c.cls || '' }, v == null || v === '' ? '—' : v);
            })
          )
        )
      )
    )
  );
}

function trailOf(item, fields) {
  const t = item.trail || [];
  if (t.length < 2) return null;
  return el(
    'details',
    {},
    el('summary', { text: t.length + ' lần đổi' }),
    el('ul', { class: 'trail' }, t.map((x) => el('li', { text: fmt(x.t) + ' — ' + fields.map((f) => x[f]).filter((v) => v != null && v !== '').join(' · ') })))
  );
}

function render() {
  const a = state.app;
  $('empty').hidden = !!a;
  $('body').hidden = !a;
  if (!a) return;

  const trackNames = { production: 'Production', open: 'Open testing', closed: 'Closed testing', internal: 'Internal testing' };
  const tr = $('tracks');
  tr.replaceChildren();
  for (const [k, t] of Object.entries(a.tracks || {})) {
    tr.append(
      el(
        'div',
        { class: 'track' },
        el('b', { text: trackNames[k] || k }),
        el('span', {}, chip(t.state || '—', statusTone(t.state))),
        el('div', {}, el('small', { text: 'Bản ' + (t.latest || '—') + (t.countries != null ? ' · ' + t.countries + ' quốc gia' : '') })),
        t.availability || t.releasedOn ? el('div', {}, el('small', { text: [t.availability, t.releasedOn && 'phát hành ' + t.releasedOn].filter(Boolean).join(' · ') })) : null,
        el('div', {}, el('small', { text: 'Ghi nhận ' + fmt(t.t) }))
      )
    );
  }

  table(
    $('releases'),
    [
      { h: 'Track', v: (r) => r.trackName || r.track },
      { h: 'Release', v: (r) => r.release },
      { h: 'Trạng thái', v: (r) => el('span', {}, chip(r.status || '—', statusTone(r.status)), r.rollout ? ' ' + r.rollout : '', trailOf(r, ['status', 'rollout', 'updated'])) },
      { h: 'Cập nhật (Console)', v: (r) => r.updated },
      { h: 'Quốc gia', v: (r) => r.countries },
      { h: 'Install base', v: (r) => r.installBase },
      { h: 'Thấy lần đầu', v: (r) => fmt(r.firstSeen) },
    ],
    a.releases || [],
    'Mở Release → Overview để lưu.'
  );

  table(
    $('versions'),
    [
      { h: 'Version code', v: (r) => r.versionCode },
      { h: 'Version name', v: (r) => r.versionName },
      { h: 'Loại file', v: (r) => r.fileType },
      { h: 'Upload', v: (r) => r.uploaded },
      { h: 'Install base', v: (r) => r.installBase },
      { h: 'Trạng thái', v: (r) => r.status },
    ],
    a.versions || [],
    'Chưa có.'
  );

  const now = Date.now();
  table(
    $('events'),
    [
      { h: 'Sự kiện', v: (r) => r.name },
      { h: 'ID', cls: 'id', v: (r) => r.id },
      { h: 'Loại', v: (r) => r.type },
      { h: 'Bắt đầu (UTC)', v: (r) => (r.start ? fmt(r.start) : r.startRaw) },
      { h: 'Hết hạn (UTC)', v: (r) => (r.end ? fmt(r.end) : r.endRaw) },
      {
        h: 'Còn lại',
        v: (r) => {
          if (!r.end) return null;
          const d = Math.ceil((r.end - now) / 86400000);
          return d < 0 ? chip('đã hết hạn ' + -d + ' ngày', 'bad') : chip(d === 0 ? 'hết hạn hôm nay' : 'còn ' + d + ' ngày', d <= 3 ? 'warn' : 'good');
        },
      },
      { h: 'Trạng thái', v: (r) => el('span', {}, chip(r.status || '—', statusTone(r.status)), trailOf(r, ['status', 'startRaw', 'endRaw'])) },
      { h: 'Người xem / mua', v: (r) => [r.viewers, r.converters].filter(Boolean).join(' / ') },
    ],
    a.events || [],
    'Mở Grow users → LiveOps → Overview để lưu.'
  );

  const det = (id) => (a.productDetails || {})[id];
  table(
    $('products'),
    [
      { h: 'Sản phẩm', v: (r) => r['product name'] || r.name || r.id },
      { h: 'ID', cls: 'id', v: (r) => r.id },
      { h: 'Gói & offer', v: (r) => r['active purchase options and offers'] },
      { h: 'Cập nhật (Console)', v: (r) => r['last updated'] },
      {
        h: 'Ngày offer',
        v: (r) => {
          const d = det(r.id);
          if (!d) return null;
          return [(d.startedOn || []).map((x) => 'bắt đầu ' + x).join(', '), (d.endsOn || []).map((x) => 'hết ' + x).join(', ')].filter(Boolean).join(' · ');
        },
      },
      { h: 'Thấy lần đầu', v: (r) => fmtDay(r.firstSeen) },
    ],
    a.products || [],
    'Mở Monetize → One-time products để lưu (mở từng sản phẩm để lấy ngày offer).'
  );

  const genericCols = (items) => {
    const keys = [];
    for (const it of items) for (const k of Object.keys(it)) if (!['key', 'href', 'firstSeen', 'lastSeen', 'trail', 'gone'].includes(k) && !keys.includes(k)) keys.push(k);
    return [...keys.map((k) => ({ h: k, v: (r) => r[k], cls: k === 'id' ? 'id' : '' })), { h: 'Thấy lần đầu', v: (r) => fmtDay(r.firstSeen) }];
  };
  table($('subs'), genericCols(a.subscriptions || []), a.subscriptions || [], 'Chưa có subscription nào được ghi.');
  table($('promos'), genericCols(a.promos || []), a.promos || [], 'Mở Monetize → Promo codes để lưu.');

  const lic = $('license');
  lic.replaceChildren();
  if (!a.license) lic.append(el('div', { class: 'empty', text: 'Mở Monetize → Monetization setup để lấy khóa.' }));
  else {
    lic.append(
      el('code', { class: 'key', text: a.license.key }),
      el(
        'div',
        { class: 'bar', style: 'margin-top:8px' },
        el('button', { id: 'copyKey', text: 'Copy khóa' }),
        el('span', { class: 'sub', style: 'margin:0', text: a.license.length + ' ký tự · lấy lúc ' + fmt(a.license.first) + ' · thấy lần cuối ' + fmt(a.license.seen) })
      )
    );
    $('copyKey').addEventListener('click', async () => {
      await navigator.clipboard.writeText(a.license.key);
      say('Đã copy khóa Licensing.');
    });
  }

  renderHistory();
}

function renderHistory() {
  const kind = $('histKind').value;
  const ul = $('hist');
  ul.replaceChildren();
  const list = state.hist.filter((h) => !kind || h.type === kind).slice().reverse();
  if (!list.length) ul.append(el('li', {}, el('span'), el('span'), el('span', { text: 'Chưa có.' })));
  for (const h of list.slice(0, 400)) {
    const label = h.type === 'view' ? h.path : h.label;
    const detail = h.fields
      ? Object.entries(h.fields)
          .map(([k, [o, n]]) => k + ': ' + fmtVal(o) + ' → ' + fmtVal(n))
          .join('  ·  ')
      : '';
    ul.append(
      el(
        'li',
        {},
        el('time', { text: fmt(h.t) }),
        chip(h.type === 'change' ? (h.op || 'đổi') : h.type === 'action' ? 'thao tác' : 'mở trang'),
        el('span', {}, label, detail ? el('div', { class: 'd', text: detail }) : null)
      )
    );
  }
}

function fmtVal(v) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' && v > 1e11) return fmt(v);
  return String(v).length > 60 ? String(v).slice(0, 57) + '…' : String(v);
}

async function load(pkg) {
  state.pkg = pkg;
  if (!pkg) {
    state.app = null;
    state.hist = [];
    return render();
  }
  const got = await P.store.get([K.app(pkg), K.hist(pkg)]);
  state.app = got[K.app(pkg)] || null;
  state.hist = got[K.hist(pkg)] || [];
  render();
}

async function init() {
  const all = await new Promise((r) => chrome.storage.local.get(null, r));
  state.idx = all[K.idx] || { apps: {}, byApp: {} };
  const pkgs = new Set(Object.keys(state.idx.apps || {}));
  for (const k of Object.keys(all)) if (k.startsWith('c:')) pkgs.add(k.slice(2));
  const have = [...pkgs].filter((p) => all[K.app(p)] || all[K.hist(p)]).sort();
  const sel = $('app');
  sel.replaceChildren();
  for (const p of have) {
    const name = (state.idx.apps[p] || {}).name;
    sel.append(el('option', { value: p, text: (name ? name + ' — ' : '') + p }));
  }
  sel.disabled = !have.length;
  await load(have[0] || null);
  $('on').checked = all[K.flag] !== false;
}

function download(name, type, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

$('app').addEventListener('change', (e) => load(e.target.value));
$('histKind').addEventListener('change', renderHistory);
$('on').addEventListener('change', (e) => chrome.storage.local.set({ [K.flag]: e.target.checked }));
$('csv').addEventListener('click', () => {
  if (!state.app) return;
  download(state.pkg + '-console.csv', 'text/csv', cx.toCsv(state.app, state.hist));
});
$('json').addEventListener('click', () => {
  if (!state.app) return;
  download(state.pkg + '-console.json', 'application/json', JSON.stringify({ app: state.app, history: state.hist }, null, 2));
});
$('del').addEventListener('click', async () => {
  if (!state.pkg || !confirm('Xóa toàn bộ dữ liệu Console đã lưu của ' + state.pkg + ' (gồm lịch sử)?')) return;
  await P.store.remove([K.app(state.pkg), K.hist(state.pkg)]);
  say('Đã xóa dữ liệu của ' + state.pkg + '.');
  init();
});

try {
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !state.pkg) return;
    if (ch[K.app(state.pkg)] || ch[K.hist(state.pkg)]) load(state.pkg);
  });
} catch {
  /* page opened outside the extension */
}

init();
