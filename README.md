# PlayLens

**PlayLens – App Stats for Google Play**

English | [Tiếng Việt](README.vi.md) · [Chrome Web Store](https://chromewebstore.google.com/detail/playlens-%E2%80%93-app-stats-for/hnhlkgnfbcijmnaaclpliogmmnflekko) · [Landing page](https://fighttechvn.github.io/playlens/)

Chrome extension that puts **exact installs · rating + number of ratings · last-updated date · app age · installs per day** on every app of a Google Play list page (search, developer pages, collections, home, the rails of an app page) — and a side panel to compare, follow and export them.

![PlayLens on a Google Play search results page](docs/assets/demo.png)

## What it does

**On the cards**

- **Info lines under the rating** — `#2 ⬇49.2M · 813K rv`, `⟳ Sep 23, 2026` (green ≤ 6 months, amber ≤ 18, red older), `12y old · ~11.1K/day`. Apps released in the last 30 days are set in bold on a tint, those under a year in colour.
- **Icon overlay badge** — the same numbers as a strip on the icon, for those who prefer it (hidden while the info lines are on, so nothing shows twice).
- **Rank number** on search results (`#1`, `#2`…), following the cards as they stand on the page.

**In the side panel** (📊 button on the right edge)

| Tab | What is in it |
|---|---|
| **This page** | A table of every app on the page. Click a header to sort, **Columns** to choose what to show, **Filter** to narrow it down (cards left out are dimmed on the page too), **Export** to copy or download CSV / JSON with all 36 fields. On an app's own page the app itself is pinned on top of its *Similar apps*. |
| **Recent** | Apps whose page you opened, newest first (up to 60). |
| **Watchlist** | Apps you starred (☆). Shows what changed since you last looked — version, name, price, rating — and the installs per day measured from the daily record. |
| **Keywords** | Play's own search suggestions for a word (optionally followed by each letter a–z), each scored for how open it looks. |

Above the table, a **summary**: on a search page the first ten results (total and median installs, median age and rating, share with purchases / ads, share not updated for 18 months) and an *Open / Contested / Crowded* verdict; on a developer page the whole portfolio.

**▸ Details of one app** — exact installs next to Play's bucket, release date, installs per day (since launch and measured), ratings per install, the spread of 1–5★ with the share of 1–2★, price / in-app purchases / ads, category, version, minimum Android, data safety labels, developer email and website (with a copy button), store screenshots, links to AppBrain, APKMirror and the App Store. On request: **Compare countries** (one request each) and **Low-star reviews** — the latest 1–3★ with the words that come up most, plus an export of reviews filtered by stars and date. Reviewer names are left out on purpose.

**In the background** — about every six hours the service worker re-reads the pages of the apps on the Watchlist and puts the number of changed apps on the toolbar icon. Nothing is requested while the Watchlist is empty, and it can be switched off.

## PlayLens Pro (optional, paid)

Everything above is free and stays free. **Pro** adds what takes time to build up or runs in the background:

| | Free | Pro |
|---|---|---|
| **Rank tracker** — follow a keyword in a country for an app on the Watchlist; the service worker checks once a day and draws the position over time | 3 pairs | 150 pairs, 90 days |
| **Alerts** — desktop notification when a followed keyword moves, or a watched app changes version, price or rating | — | ✓ (asks for the optional `notifications` permission) |
| **Compare apps** — pick apps in the table (⇄), side-by-side table, installs and rating history charts | 2 apps, no charts | up to 6 apps + charts |
| **Report** — one HTML or Markdown file of what changed on the Watchlist in 7 / 30 / 90 days | — | ✓ |
| **Backup and restore** of watchlist, daily history and ranks | — | ✓ |
| **Keyword lists** — save sets of keywords, *Score all*, opportunity by country | first ten scored | unlimited scoring, 20 lists |

Pro is sold through [Polar](https://polar.sh) (merchant of record: payment, tax, refunds); you get a licence key by email and paste it in the settings page. The key is checked against `api.polar.sh` about once a day (up to 3 browsers per key); offline for two weeks and Pro keeps working. This is a convenience and a way to support the project, not DRM — the source is MIT and anyone can read how the check works.

**Setting it up (maintainers).** Create the products in Polar (Monthly / Yearly / Lifetime) with a *License Keys* benefit (prefix `PLAY-`, 3 activations), then fill `CONFIG.ORG_ID` and `CONFIG.CHECKOUT` in [`license.js`](license.js) and `CHECKOUT` in `docs/index.html`. Try it first on Polar's sandbox by pointing `CONFIG.API` to `https://sandbox-api.polar.sh`. The proposal and numbers are in [research/PREMIUM.md](research/PREMIUM.md). Until the ids are filled in, the settings page says "coming soon" and nothing is sent to Polar.

What it does not do: estimate revenue. That cannot be read from public pages, so PlayLens does not guess.

## Install

[**Add to Chrome from the Chrome Web Store**](https://chromewebstore.google.com/detail/playlens-%E2%80%93-app-stats-for/hnhlkgnfbcijmnaaclpliogmmnflekko) — then open any Google Play list page. Click the extension icon on the toolbar to adjust flags.

To run it from source instead:

1. [Download `playlens.zip`](https://github.com/fighttechvn/playlens/releases/latest/download/playlens.zip) and unzip it (or clone this repo).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and pick the folder.

## Packaging

```bash
./build.sh
```

Creates `dist/playlens-v<version>.zip` (version read from `manifest.json`, runtime files only, no `.DS_Store`) — ready to upload to the Chrome Web Store or share. CI runs the same build when `develop` is merged into `uat` (see `.github/workflows/build.yml`).

## Landing page and blog

`docs/` is generated — do not edit the HTML by hand. Page chrome and the landing page live in `tools/site/` (`layout.js`, `home.js`), the guides in `tools/site/posts.js`, the look in `docs/site.css`.

```bash
node tools/build-site.js   # rewrites docs/*.html, docs/blog/, sitemap.xml, robots.txt
```

The Polar checkout links go in `CHECKOUT` inside `tools/site/home.js` (and in `license.js`); rebuild afterwards.

## Publishing

The extension is live as item `hnhlkgnfbcijmnaaclpliogmmnflekko`; the listing text it was submitted with is in [store/listing.md](store/listing.md). The first submission had to be manual — the API can't create listing text or upload screenshots — but version updates are now one command:

```bash
./tools/publish.sh              # upload as a draft
./tools/publish.sh --publish    # upload and submit for review
```

Or let CI do it — with the four `CWS_*` repository secrets set, publishing a GitHub release uploads the build and submits it for review (`.github/workflows/publish.yml`).

Setup for either path (OAuth client, refresh token, item ID) is in [store/api-publishing.md](store/api-publishing.md).

## Branches & CI

- `main` — releases (landing page in `docs/` published via GitHub Pages)
- `develop` — day-to-day development
- `uat` — merged from `develop` for testing; every push/merge to `uat` triggers GitHub Actions to run `build.sh`, attach the zip as a run artifact, and refresh the rolling **`uat` pre-release** so testers have a link that needs no GitHub login:

  ```
  https://github.com/fighttechvn/playlens/releases/download/uat/playlens-uat.zip
  ```

  The tag is recreated on each build, so the link always serves the newest uat package. Pre-releases are excluded from the Chrome Web Store workflow — only a real `vX.Y.Z` release ships to the store.

## Settings (popup / settings page)

| Flag | Default | Meaning |
|---|---|---|
| `overlay` | on | Badge overlaid on each icon (suppressed while `inline` is on) |
| `inline` | on | Info lines under each card's own rating |
| `panel` | on | Right-side panel (with the 📊 button) |
| `panelOpen` | off | Open the panel on page load |
| `recent` | on | Remember apps whose detail page you open, in the Recent tab |
| `exact` | on | Exact install count (`49.2M`) instead of Play's bucket (`10M+`) |
| `age` | on | App age and installs per day on the cards |
| `rank` | on | Position number on search result cards, in the table and in exports |
| `history` | on | Keep one snapshot a day of every app seen, to measure growth |
| `bgRefresh` | on | Update the Watchlist in the background, about every six hours |
| `alerts` | off | Pro: desktop notifications (switching it on asks for the `notifications` permission) |

Also stored: `cols` (the columns of the table) and `countries` (two-letter codes for *Compare countries* and the Keywords tab, up to 8; default `US, GB, DE, JP, VN`).

Settings live in `chrome.storage.sync` and apply **instantly** (the content script listens to `storage.onChanged` — no page reload).

Besides the quick popup there is a **full settings page** (`options.html`): right-click the extension icon → *Options*, or click "⚙ Open full settings" in the popup. It also shows how much is stored and has a button to clear each kind of data: cache, Recent, history, Watchlist.

## How it works

- `core.js` holds everything that can run without a page — parsing, formatting, scoring — and is shared by the content script and the service worker. `node tools/test-core.js` checks it against live Play pages; `node tools/test-pro.js` checks the Pro helpers and the licence logic offline. `license.js` holds the Polar calls and the Free/Pro limits.
- The content script scans every `details?id=...` anchor that contains an image (app card). For each app it fetches the detail page with `hl=en&gl=US` (stable labels) and reads the listing block of the page's `AF_initDataCallback` data: exact installs, rating histogram, release date, price, purchases, ads, category, version, developer contact, screenshots, data safety.
- Reviews and search suggestions come from the same `batchexecute` endpoint the Play site itself calls. They are requested only when you ask.
- The **opportunity score** of a search term is `0.35 × demand + 0.30 × monetization + 0.25 × competition + 0.10 × weakness`, each from the first ten results: ≥ 60 *Open*, 45–59 *Contested*, below *Crowded*. It is a way to sort ideas, not a forecast.
- 12h cache in `chrome.storage.local`, at most 3 detail fetches in parallel. Stored under `app:<id>` (cache), `h:<id>` (daily snapshots, 200 at most), `w:<id>` (watchlist entry), `kw:<id>` (positions of a watched app), `rk:<id>` (Pro rank tracker, 90 days), `kwl` (saved keyword lists), `license` (key and last check), `cc:<id>:<gl>` (country comparison).
- Play is a single-page app, which takes some care:
  - It redraws search cards a moment after they appear, dropping our nodes and marks — every re-scan puts them back on the card that owns them.
  - It keeps the page you came from in the document, hidden, so that Back is instant. Cards that are not shown (`checkVisibility()`) are left alone, apps no longer on the page leave the table, and rank is the order of the cards on screen.
- The info lines sit on Play's page, so their colours follow the page's ground; the panel follows the system theme.
- play.google.com enforces a **Trusted Types** CSP (blocks `innerHTML` even for content scripts) → all UI is built with `createElement`/`textContent`, SVG with `createElementNS`.

## Limitations

- Parsing relies on the position of fields in Play's page data. If Google moves them, `node tools/test-core.js` shows which ones broke; the paths are in `core.js` (`parseDetail`).
- Installs per day *since launch* is an average over the app's whole life. The *measured* figure needs at least two daily snapshots of the app, so it appears from the second day on.
- Apps without a rating (too new) only show installs and dates.
- The link to AppBrain is built from the package name; whether AppBrain has a page for it is up to AppBrain.

## License

[MIT](LICENSE) © [FightTech VN](https://github.com/fighttechvn)

---

PlayLens is an independent project, not affiliated with, endorsed by or sponsored by Google. Google Play is a trademark of Google LLC.
