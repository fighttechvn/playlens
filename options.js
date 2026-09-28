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
};
const DEFAULT_COUNTRIES = ['US', 'GB', 'DE', 'JP', 'VN'];

const boxes = {};
for (const key of Object.keys(DEFAULTS)) {
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
    (k) => k === 'watch' || k.startsWith('w:') || k.startsWith('kw:'),
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
