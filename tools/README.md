# tools/

Checks and asset generators — not part of the shipped extension (`build.sh` excludes them).

The scripts that drive a browser need Playwright; they point at an existing install path
at the top of the file — adjust it if you move things around.

- `test-core.js` → checks `core.js` (parsing, formatting, scoring, reviews, suggestions)
  against live Google Play pages and a few fixed cases. Needs Node 18+ only. Run it
  before a release: a field that comes back empty for every app means Google moved it.
- `icon.svg` + `render-icon.js` → regenerate `icons/icon{16,32,48,128}.png`
- `capture-store.js` → capture `store/screenshot-*.png` (1280×800, the size the
  Chrome Web Store expects) from a live Google Play search page, with the extension
  loaded unpacked into a fresh profile: panel, cards, details, Watchlist, Keywords
- `test-bridge.js` → checks `bridge-data.js`, what the MCP server may read from the extension (see `mcp/README.md`; `mcp/test.mjs` is the end-to-end check)
- `publish.sh` → upload a build to the Chrome Web Store (see `store/api-publishing.md`)
- `cws-setup.js` → one-command setup of the store credentials (`.env.cws` + GitHub secrets); `--check` verifies them

```bash
node tools/test-core.js
node tools/render-icon.js
node tools/capture-store.js
```

Notes for anything that drives a browser against play.google.com:

- `page.addScriptTag` does not work — the Trusted Types policy rejects the injection.
  `render-icon.js` aside, the scripts load the real extension with
  `chromium.launchPersistentContext(dir, { channel: 'chromium', args: ['--load-extension=…'] })`;
  the `chromium` channel is what lets extensions run headless.
- The 📊 button is hidden while the panel is open, so wait for it with
  `state: 'attached'` when a profile is reused.
- Section titles are uppercased by CSS: `innerText` returns them in capitals,
  `textContent` as written.
