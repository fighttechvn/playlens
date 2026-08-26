# Chrome Web Store — submission package

Everything to copy-paste into the [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Upload file: `dist/playlens-v1.5.0.zip` (run `./build.sh`).

## Store listing

**Name** (from manifest, shown automatically):
PlayLens – Play Store Downloads, Reviews & Update Dates

**Summary** (max 132 chars):
See downloads, review counts and last-updated dates for every app right on Google Play list pages. Free, open source, no tracking.

**Description:**

```
Researching apps on Google Play? Stop opening them one by one.

PlayLens shows the numbers that matter for every app card on Google Play list pages — developer pages, search results, collections and the home page:

⬇ Download count (e.g. 100M+)
★ Rating and EXACT review count (824.1K, not "824K-ish" — parsed from each app's own detail page)
⟳ Last-updated date, color-coded: green = updated within 6 months, amber = within 18, red = older

THREE VIEWS, YOUR CHOICE
• Icon overlay badge — a compact strip on the bottom of each app icon. Zero layout shift.
• Inline line — an extra info line right below each card's own rating, styled to match Play.
• Sortable side panel — a table of every scanned app. Sort by downloads, rating, reviews or update date; click a row to open the app; export the whole list as CSV.

Each view can be toggled independently from the popup or the full settings page — changes apply instantly, no reload.

PRIVATE BY DESIGN
No account, no analytics, no external servers. PlayLens only runs on play.google.com and fetches the same public app pages you could open yourself. Results are cached locally for 12 hours. Nothing ever leaves your browser.

FREE & OPEN SOURCE
MIT licensed. Source code, issues and releases:
https://github.com/fighttechvn/playlens
```

**Category:** Tools (alt: Developer Tools)
**Language:** English

**Graphics:**
- Store icon 128×128: `icons/icon128.png`
- Screenshots 1280×800: `store/screenshot-1-panel.png`, `store/screenshot-2-cards.png`
- Small promo tile 440×280: optional, skip

## Privacy tab

- **Single purpose description:**
  Displays public app statistics (download count, review count, last-updated date) on Google Play list pages.
- **Permission justifications:**
  - `storage` — saves the user's display settings (feature flags) and a 12-hour local cache of public app stats so list pages load faster.
  - `clipboardWrite` — used only when the user clicks the CSV button to copy the visible app list to the clipboard.
  - Host `play.google.com` (content script) — the extension's single purpose is to annotate Google Play list pages; it reads list pages and fetches public app detail pages on the same site. It never runs anywhere else.
- **Remote code:** No, all code is packaged in the extension.
- **Data usage:** check **nothing** (no data collected). Certify the disclosures.
- **Privacy policy URL:** https://fighttechvn.github.io/playlens/privacy.html

## Distribution

- Visibility: Public
- Regions: All regions
- Pricing: Free

## Submit checklist (owner actions)

1. Register a developer account at https://chrome.google.com/webstore/devconsole ($5 one-time fee).
2. New item → upload `dist/playlens-v1.5.0.zip`.
3. Fill Store listing + Privacy + Distribution tabs from this file.
4. Submit for review. Typical review time: a few hours to a few days; first submissions with host permissions can take longer.
5. After approval, add the CWS link to README + landing page CTA.
