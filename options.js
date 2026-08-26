const DEFAULTS = { overlay: true, inline: true, panel: true, panelOpen: false, recent: true };

const boxes = {};
for (const key of Object.keys(DEFAULTS)) {
  boxes[key] = document.getElementById(key);
}

chrome.storage.sync.get(DEFAULTS, (flags) => {
  for (const [key, box] of Object.entries(boxes)) {
    box.checked = !!flags[key];
  }
});

// Keep the switches in sync if flags change elsewhere (popup, content script).
chrome.storage.onChanged.addListener((changes, area) => {
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

const status = document.getElementById('status');
document.getElementById('clearCache').addEventListener('click', () => {
  chrome.storage.local.get(null, (all) => {
    const keys = Object.keys(all).filter((k) => k.startsWith('app:'));
    chrome.storage.local.remove(keys, () => {
      status.textContent = 'Đã xóa ' + keys.length + ' app khỏi cache.';
      setTimeout(() => (status.textContent = ''), 3000);
    });
  });
});

document.getElementById('clearRecent').addEventListener('click', () => {
  chrome.storage.local.get({ recent: [] }, ({ recent }) => {
    chrome.storage.local.set({ recent: [] }, () => {
      status.textContent = 'Đã xóa ' + recent.length + ' app khỏi Recent.';
      setTimeout(() => (status.textContent = ''), 3000);
    });
  });
});
