const DEFAULTS = {
  overlay: true,
  inline: true,
  panel: true,
  panelOpen: false,
  recent: true,
  exact: true,
  age: true,
  rank: true,
  history: true,
  bgRefresh: true,
  alerts: false,
};
const DEFAULT_COUNTRIES = ['US', 'GB', 'DE', 'JP', 'VN'];

const boxes = {};
for (const key of Object.keys(DEFAULTS)) {
  if (key === 'alerts') continue; // has its own handler: it asks for a permission
  boxes[key] = document.getElementById(key);
}
const countries = document.getElementById('countries');
const countriesStatus = document.getElementById('countriesStatus');

chrome.storage.sync.get({ ...DEFAULTS, countries: DEFAULT_COUNTRIES }, (saved) => {
  for (const [key, box] of Object.entries(boxes)) {
    box.checked = !!saved[key];
  }
  countries.value = (Array.isArray(saved.countries) ? saved.countries : DEFAULT_COUNTRIES).join(', ');
});

// Keep the switches in sync if flags change elsewhere (popup, content script).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    showUsage();
    if ('license' in changes) renderPro();
    return;
  }
  if (area !== 'sync') return;
  for (const [key, box] of Object.entries(boxes)) {
    if (key in changes) box.checked = !!changes[key].newValue;
  }
});

for (const [key, box] of Object.entries(boxes)) {
  box.addEventListener('change', () => {
    chrome.storage.sync.set({ [key]: box.checked });
  });
}

countries.addEventListener('change', () => {
  const parts = countries.value
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  const good = [...new Set(parts.filter((c) => /^[A-Z]{2}$/.test(c)))].slice(0, 8);
  const bad = parts.filter((c) => !/^[A-Z]{2}$/.test(c));
  const list = good.length ? good : DEFAULT_COUNTRIES;
  countries.value = list.join(', ');
  chrome.storage.sync.set({ countries: list }, () => {
    countriesStatus.textContent = bad.length
      ? 'Đã lưu. Bỏ qua mã không hợp lệ: ' + bad.join(', ') + ' (cần đúng 2 chữ cái, ví dụ US).'
      : 'Đã lưu ' + list.length + ' quốc gia.';
    setTimeout(() => (countriesStatus.textContent = ''), 4000);
  });
});

const status = document.getElementById('status');
function say(text) {
  status.textContent = text;
  setTimeout(() => (status.textContent = ''), 3000);
}

function refreshBadge() {
  try {
    chrome.runtime.sendMessage({ type: 'plsi:badge' }, () => void chrome.runtime.lastError);
  } catch {
    /* worker asleep and not waking; the next alarm fixes the badge */
  }
}

function removeWhere(test, done) {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter(test);
    chrome.storage.local.remove(keys, () => done(keys));
  });
}

document.getElementById('clearCache').addEventListener('click', () => {
  removeWhere(
    (k) => k.startsWith('app:') || k.startsWith('cc:'),
    (keys) => say('Đã xóa ' + keys.length + ' mục khỏi cache.')
  );
});

document.getElementById('clearRecent').addEventListener('click', () => {
  chrome.storage.local.get({ recent: [] }, ({ recent }) => {
    chrome.storage.local.set({ recent: [] }, () => {
      say('Đã xóa ' + recent.length + ' app khỏi Recent.');
    });
  });
});

document.getElementById('clearHistory').addEventListener('click', () => {
  if (!confirm('Xóa toàn bộ số liệu đã lưu theo ngày? Lượt cài thực tế mỗi ngày sẽ phải đo lại từ đầu.')) return;
  removeWhere(
    (k) => k.startsWith('h:'),
    (keys) => say('Đã xóa lịch sử của ' + keys.length + ' app.')
  );
});

document.getElementById('clearWatch').addEventListener('click', () => {
  if (!confirm('Xóa toàn bộ Watchlist, gồm cả nhật ký thay đổi và thứ hạng từ khóa?')) return;
  removeWhere(
    (k) => k === 'watch' || k.startsWith('w:') || k.startsWith('kw:') || k.startsWith('rk:'),
    (keys) => {
      say('Đã xóa ' + keys.filter((k) => k.startsWith('w:')).length + ' app khỏi Watchlist.');
      refreshBadge();
    }
  );
});

const usage = document.getElementById('usage');
function showUsage() {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all);
    const count = (p) => keys.filter((k) => k.startsWith(p)).length;
    const kb = Math.round(JSON.stringify(all).length / 1024);
    usage.textContent =
      'Đang lưu trên máy: ' +
      count('app:') + ' app trong cache, ' +
      count('h:') + ' app có lịch sử, ' +
      count('w:') + ' app trong Watchlist — khoảng ' +
      (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB') +
      ' trên 10 MB cho phép.';
  });
}
showUsage();

// ---------- PlayLens Pro ----------

const L = PLSI.license;
const $ = (id) => document.getElementById(id);
const ERRORS = {
  not_configured: 'Cổng thanh toán chưa được bật trong bản này — chưa thể kích hoạt khóa.',
  empty: 'Hãy dán khóa bản quyền nhận qua email.',
  not_found: 'Không tìm thấy khóa này. Kiểm tra lại từng ký tự (khóa bắt đầu bằng PLAY-).',
  inactive: 'Khóa này đã bị thu hồi hoặc hết hạn.',
  limit: 'Khóa đã dùng hết số thiết bị (3). Gỡ khóa ở một máy khác, hoặc quản lý thiết bị trong trang khách hàng của Polar.',
  network: 'Không kết nối được tới Polar. Thử lại sau ít phút.',
};
const REASONS = {
  revoked: 'Khóa đã bị thu hồi (huỷ thuê bao hoặc hoàn tiền).',
  expired: 'Khóa đã hết hạn. Gia hạn để dùng lại Pro.',
  lapsed: 'Không kiểm tra được khóa quá 14 ngày. Mở lại kết nối mạng để xác nhận.',
};
const licStatus = $('licStatus');
let busy = false;

function plansRow() {
  const box = $('plans');
  box.textContent = '';
  for (const p of L.plans()) {
    const node = document.createElement(p.url ? 'a' : 'span');
    node.textContent = p.id === 'monthly' ? 'Tháng · ' + p.price : p.id === 'yearly' ? 'Năm · ' + p.price : 'Trọn đời · ' + p.price;
    if (p.url) {
      node.href = p.url;
      node.target = '_blank';
      node.rel = 'noopener';
    } else {
      node.className = 'soon';
      node.title = 'Sắp mở bán';
    }
    box.appendChild(node);
  }
  if (!L.plans().some((p) => p.url)) {
    const note = document.createElement('div');
    note.className = 'desc';
    note.textContent = 'Sắp mở bán — giá dự kiến như trên.';
    box.appendChild(note);
  }
}

async function renderPro() {
  const rec = await L.read();
  const st = L.status(rec);
  $('proBadge').textContent = st.pro ? 'Pro' : 'Free';
  $('proBadge').classList.toggle('on', st.pro);
  $('proTitle').textContent = st.pro ? 'PlayLens Pro đang bật' : 'Gói Free';
  let desc;
  if (st.pro) {
    desc = st.lifetime ? 'Khóa trọn đời.' : 'Hết hạn ' + new Date(st.expiresAt).toLocaleDateString('vi-VN') + '.';
  } else {
    desc = REASONS[st.reason] || (L.configured() ? 'Dán khóa bản quyền để mở khóa Pro.' : 'Gói Pro sắp mở bán. Dán khóa ở đây khi có.');
  }
  $('proDesc').textContent = desc;
  const has = !!(rec && rec.key);
  $('keyForm').hidden = has && st.pro;
  $('keyHave').hidden = !has;
  $('licMask').textContent = has ? L.mask(rec.key) : '';
  $('plans').hidden = st.pro && st.lifetime;
  $('alertsRow').classList.toggle('off', !st.pro);
  $('alerts').disabled = !st.pro;
  const { alerts } = await new Promise((r) => chrome.storage.sync.get({ alerts: false }, r));
  let allowed = false;
  try {
    allowed = await chrome.permissions.contains({ permissions: ['notifications'] });
  } catch {
    /* no permissions API: leave it off */
  }
  $('alerts').checked = st.pro && !!alerts && allowed;
}

function licSay(text, bad) {
  licStatus.textContent = text;
  licStatus.classList.toggle('err', !!bad);
}

$('licGo').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  $('licGo').disabled = true;
  licSay('Đang kiểm tra khóa…');
  const label = 'PlayLens · ' + (navigator.userAgentData?.platform || navigator.platform || 'browser');
  const r = await L.activate($('licKey').value, label);
  busy = false;
  $('licGo').disabled = false;
  if (r.ok) {
    $('licKey').value = '';
    licSay('Đã bật Pro. Cảm ơn bạn đã ủng hộ PlayLens!');
  } else {
    licSay(ERRORS[r.error] || ERRORS.network, true);
  }
  renderPro();
});
$('licKey').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('licGo').click();
});

$('licOff').addEventListener('click', async () => {
  if (!confirm('Gỡ khóa khỏi máy này? Bạn vẫn dùng được khóa trên máy khác, và dán lại ở đây bất cứ lúc nào.')) return;
  await L.deactivate();
  licSay('Đã gỡ khóa khỏi máy này.');
  renderPro();
});

// The permission prompt only opens from a click, so ask here and nowhere else.
$('alerts').addEventListener('change', async () => {
  const box = $('alerts');
  const out = $('alertsStatus');
  out.textContent = '';
  if (!box.checked) {
    chrome.storage.sync.set({ alerts: false });
    try {
      await chrome.permissions.remove({ permissions: ['notifications'] });
    } catch {
      /* already gone */
    }
    return;
  }
  let granted = false;
  try {
    granted = await chrome.permissions.request({ permissions: ['notifications'] });
  } catch {
    granted = false;
  }
  box.checked = granted;
  chrome.storage.sync.set({ alerts: granted });
  if (!granted) out.textContent = 'Chưa có quyền thông báo nên cảnh báo vẫn tắt.';
});

plansRow();
renderPro();

// ---------- Claude (MCP) ----------
// Local toggle (not synced: it only makes sense on the machine that runs the MCP server).
const mcpBox = document.getElementById('mcpBridge');
const mcpStatus = document.getElementById('mcpStatus');
const MCP_TEXT = {
  off: '',
  connected: 'Đã kết nối với máy chủ MCP. Claude có thể đọc dữ liệu.',
  waiting: 'Chưa thấy máy chủ MCP trên máy này. Chạy lệnh bên dưới (hoặc mở Claude Code) rồi giữ Chrome mở; PlayLens tự nối lại trong 30 giây.',
};

function showMcp() {
  if (!mcpBox.checked) {
    mcpStatus.textContent = '';
    return;
  }
  try {
    chrome.runtime.sendMessage({ type: 'plsi:bridge' }, (r) => {
      void chrome.runtime.lastError;
      mcpStatus.textContent = MCP_TEXT[(r && r.state) || 'waiting'] || '';
    });
  } catch {
    mcpStatus.textContent = MCP_TEXT.waiting;
  }
}

chrome.storage.local.get('mcpBridge', (o) => {
  mcpBox.checked = !!(o && o.mcpBridge);
  showMcp();
});
mcpBox.addEventListener('change', () => {
  chrome.storage.local.set({ mcpBridge: mcpBox.checked }, () => setTimeout(showMcp, 800));
});
setInterval(() => {
  if (mcpBox.checked && !document.hidden) showMcp();
}, 5000);
