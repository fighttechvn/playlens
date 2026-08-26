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

for (const [key, box] of Object.entries(boxes)) {
  box.addEventListener('change', () => {
    chrome.storage.sync.set({ [key]: box.checked });
  });
}

document.getElementById('openOptions').addEventListener('click', (ev) => {
  ev.preventDefault();
  chrome.runtime.openOptionsPage();
});
