# Chrome Web Store — submission package

Everything to copy-paste into the [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Upload file: `dist/playlens-v1.5.1.zip` (run `./build.sh`).

Every field below was written against the [listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
and the [Google branding guidelines](https://developer.chrome.com/docs/webstore/branding) — see
[Policy compliance](#policy-compliance) at the bottom for the specific checks.

## Store listing

**Name** (from manifest, shown automatically):
PlayLens – App Stats for Google Play

**Summary** (max 132 chars — this is 130):
See downloads, exact review counts and last-updated dates for every app on Google Play list pages. Free, open source, no tracking.

**Description:**

```
Researching apps on Google Play means opening them one by one just to see how many downloads they have. PlayLens puts those numbers on the list itself.

For every app card on a Google Play list page — developer pages, search results, collections, the home page — PlayLens adds:

⬇ Download count (100K+, 1M+, 100M+)
★ Rating and the EXACT review count (824.1K, not a rounded "824K") — read from each app's own detail page
⟳ Last-updated date, color-coded: green = updated within 6 months, amber = within 18 months, red = older

WHO IT'S FOR
Developers sizing up competitors, ASO and marketing teams building research lists, and anyone who wants to know whether something is still maintained before installing it.

THREE VIEWS — TURN ON WHAT YOU LIKE
• Icon overlay badge — a compact strip along the bottom of each icon. No layout shift.
• Inline info line — an extra line right under each card's own rating, styled to match the page.
• Sortable side panel — a table of everything scanned so far. Sort by installs, rating, reviews or update date, click a row to open it, and copy the whole table as CSV for a spreadsheet.

Each view toggles independently from the toolbar popup or the full settings page, and changes apply instantly with no page reload.

PRIVATE BY DESIGN
No account. No analytics. No external servers. PlayLens runs only on play.google.com and reads the same public pages you could open yourself. Results are cached on your device for 12 hours and nothing ever leaves your browser.

FREE AND OPEN SOURCE
MIT licensed. Source code, issue tracker and releases:
https://github.com/fighttechvn/playlens

—
PlayLens is an independent project. It is not affiliated with, endorsed by, or sponsored by Google. Google Play is a trademark of Google LLC.
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

## Policy compliance

Checks run against the published policies before submitting. Re-run them if any listing
text changes.

### Trademark (branding guidelines)

> "Don't use any Google trademarks or any confusingly similar marks as the name of your
> extension or company without written permission from Google."

The guidelines do permit descriptive use with `for` / `for use with` / `compatible with`.

- ✅ The name is `PlayLens – App Stats for **Google Play**` — the mark appears only in the
  permitted `for` construction, after our own brand. The earlier name
  (`PlayLens – Play Store Downloads, Reviews & Update Dates`) put the mark inside the name
  itself with no qualifier, which is what the rule forbids.
- ✅ Attribution sentence is the last line of the description.
- ✅ Non-affiliation is stated explicitly in the same line.
- ✅ Icon is our own mark (magnifier ring + solid white triangle on a blue square). The
  Google Play logo is a four-colour pennant — no shape, palette or wordmark is borrowed.
- ℹ️ The guidelines suggest a ™ symbol alongside the mark (`for Google Play™`). We omit it
  in the title (unusual in store titles, and the attribution line covers the requirement).
  If a reviewer objects, add it to the manifest `name` and resubmit — nothing else changes.

### Keyword spam (listing requirements)

> "Unnatural repetition of the same keyword more than 5 times" · "irrelevant or excessive
> keywords in an extensions description in an attempt to manipulate its ranking"

Occurrence counts in the description above — the limit is 5:

| Keyword | Count |
|---|---|
| Google Play | 3 |
| PlayLens | 4 |
| download / downloads | 2 |
| review / reviews | 2 |
| rating | 3 |
| app / apps | 4 |

Every keyword describes something the extension actually does — no unrelated terms
(no "free VPN", "downloader", competitor names) are present.

### Metadata accuracy

> "We don't allow extensions with misleading, inaccurate, incomplete … metadata"

- ✅ Both screenshots are real captures of the current build at 1280×800, not mockups.
- ✅ The description claims no feature that isn't in the shipped code.
- ✅ Permissions listed in the manifest are exactly the two the code uses.

## Submit checklist (owner actions)

1. Register a developer account at https://chrome.google.com/webstore/devconsole ($5 one-time fee).
2. New item → upload `dist/playlens-v1.5.1.zip`.
3. Fill Store listing + Privacy + Distribution tabs from this file.
4. Submit for review. Typical review time: a few hours to a few days; first submissions with host permissions can take longer.
5. After approval, add the CWS link to README + landing page CTA.
