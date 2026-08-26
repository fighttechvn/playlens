# PlayLens

**PlayLens – App Stats for Google Play**

English | [Tiếng Việt](README.vi.md) · [Landing page](https://fighttechvn.github.io/playlens/)

Chrome extension that shows **⬇ downloads · rating★ + review count · ⟳ last-updated date** for every app on Google Play list pages (developer pages, collections/clusters, search, home) — no more opening apps one by one.

![PlayLens on a Google Play search results page](docs/assets/demo.png)

Three display modes, each toggleable independently via feature flags:

1. **Icon overlay badge** — a compact info strip on the bottom of each app icon (zero layout shift). Automatically hidden while mode 2 is on, so the same numbers never appear twice on one card.
2. **Inline under the rating** — a small line (`⬇100M+ · 824.1K rv` + `⟳ update date`, color-coded) inserted right below each card's own rating.
3. **Side panel** — a fixed panel on the right rendered as a **table**: App (icon + name) · ⬇ downloads · ★ rating · Rv reviews · Updated (`d/M/yy`, freshness-colored). **Click a column header to sort** (click again to reverse, ▲/▼ indicator); click a row to open the app. A **CSV** button copies the whole list to the clipboard. Toggle with the floating 📊 button on the right edge; the open state is remembered.

## Install

1. [Download `playlens.zip`](https://github.com/fighttechvn/playlens/releases/latest/download/playlens.zip) and unzip it (or clone this repo).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and pick the folder.
4. Open any Google Play list page. Click the extension icon on the toolbar to adjust flags.

## Packaging

```bash
./build.sh
```

Creates `dist/playlens-v<version>.zip` (version read from `manifest.json`, runtime files only, no `.DS_Store`) — ready to upload to the Chrome Web Store or share. CI runs the same build when `develop` is merged into `uat` (see `.github/workflows/build.yml`).

## Publishing

The first Chrome Web Store submission is manual — the API can't create listing text or upload screenshots. Everything to paste in is in [store/listing.md](store/listing.md).

Once the item exists, version updates are one command:

```bash
./tools/publish.sh              # upload as a draft
./tools/publish.sh --publish    # upload and submit for review
```

Setup for that (OAuth client, refresh token, item ID) is in [store/api-publishing.md](store/api-publishing.md).

## Branches & CI

- `main` — releases (landing page in `docs/` published via GitHub Pages)
- `develop` — day-to-day development
- `uat` — merged from `develop` for testing; every push/merge to `uat` triggers GitHub Actions to run `build.sh` and attach the zip as a run artifact.

## Feature flags (popup / settings page)

| Flag | Default | Meaning |
|---|---|---|
| `overlay` | on | Badge overlaid on each icon (suppressed while `inline` is on) |
| `inline` | on | Info line under each card's own rating |
| `panel` | on | Right-side list panel (with the 📊 button) |
| `panelOpen` | off | Auto-open the panel on page load |

Flags live in `chrome.storage.sync` and apply **instantly** (the content script listens to `storage.onChanged` — no page reload).

Besides the quick popup there is a **full settings page** (`options.html`): right-click the extension icon → *Options*, or click "⚙ Open full settings" in the popup — per-flag toggles with detailed descriptions plus a **Clear app data cache** button.

## How it works

- The content script scans every `details?id=...` anchor that contains an image (app card). For each app it fetches the detail page with `hl=en&gl=US` (stable labels to parse) and extracts:
  - **App name + rating + review count** — parsed from JSON-LD (`SoftwareApplication`): canonical name and **exact** review counts (e.g. 53,623 → `53.6K rv`)
  - **Downloads** — regex around the `Downloads` label (e.g. `1M+`)
  - **Updated on** — the update date, color-coded by freshness: green ≤ 6 months, amber ≤ 18 months, red older
- Badges wait for lazy-loaded icons to finish loading before attaching (avoids floating badges on zero-height images); corner radius is copied from the icon.
- 12h cache in `chrome.storage.local`, at most 3 detail fetches in parallel. Play is an SPA → a MutationObserver re-scans on scroll/navigation; changing pages resets the panel list.
- play.google.com enforces a **Trusted Types** CSP (blocks `innerHTML` even for content scripts) → all UI is built with `createElement`/`textContent`.

## Limitations

- Parsing relies on Play's HTML structure (JSON-LD + the `Downloads` / `Updated on` labels). If Google changes the markup, update the regexes in `content.js` (`fetchAppInfo`).
- Apps without a rating (too new) only show downloads + update date.

## License

[MIT](LICENSE) © [FightTech VN](https://github.com/fighttechvn)

---

PlayLens is an independent project, not affiliated with, endorsed by or sponsored by Google. Google Play is a trademark of Google LLC.
