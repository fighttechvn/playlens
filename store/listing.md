# Chrome Web Store — submission package

**Live since 30 Aug 2026:** [https://chromewebstore.google.com/detail/playlens-%E2%80%93-app-stats-for/hnhlkgnfbcijmnaaclpliogmmnflekko](https://chromewebstore.google.com/detail/playlens-%E2%80%93-app-stats-for/hnhlkgnfbcijmnaaclpliogmmnflekko) — item `hnhlkgnfbcijmnaaclpliogmmnflekko`.
This file stays as the source of truth for the listing text; edit it here, then paste
the changed field into the dashboard.

Everything to copy-paste into the [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Upload file: `dist/playlens-v2.0.0.zip` (run `./build.sh`).

> **2.0.0 changes what the item asks for.** It adds the `alarms` permission and a host
> permission for `https://play.google.com/*` (1.6.1 reached the same site through the
> content script only). Before submitting: paste the new description, replace the
> screenshots, and fill in the two new justifications on the Privacy tab. Chrome should show
> no new warning to people who already have it installed — the site was already listed —
> but the review can take longer than a text-only update.

Every field below was written against the [listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
and the [Google branding guidelines](https://developer.chrome.com/docs/webstore/branding) — see
[Policy compliance](#policy-compliance) at the bottom for the specific checks.

## Store listing

**Name** (from manifest, shown automatically):
PlayLens – App Stats for Google Play

**Summary** (taken from `description` in `manifest.json`; max 132 chars — this is 128):
App statistics on Google Play lists: exact installs, app age, ratings spread, prices, a watchlist, keyword ideas and CSV export.

**Description:**

```
Researching Google Play means opening listings one by one just to see how they are doing. PlayLens puts the numbers on the list itself, with a side panel to compare, follow and export them.

ON EVERY CARD
⬇ Exact install count (49.2M, not just "10M+")
★ Rating and the exact number of ratings
⟳ Last-updated date, color-coded: green = within 6 months, amber = within 18 months, red = older
◷ Time since release and average downloads per day — new releases stand out
# Position number on search results

Works on search results, developer pages, collections, the home page and the "Similar" rails of a single listing.

SIDE PANEL
A sortable table of everything on the page. Pick the columns you need (category, version, minimum Android, price, in-app purchases, ads, ratings per install), filter by size, score, age or freshness, and save the result as CSV or JSON.

DETAILS FOR EACH ROW
The spread of 1–5★ with the share of unhappy users, price and in-app purchase range, data safety labels, developer email and website, store screenshots, and shortcuts to look the same title up elsewhere. One click compares price and score across countries.

REVIEWS
Read the latest 1–3★ reviews with the words that come up most, and save them as CSV or JSON. Reviewer names are left out.

WATCHLIST
Star anything to follow it. A daily record kept on your device gives measured growth per day with a small trend line, and marks changes of version, name, price or score. Followed titles are re-checked about every six hours — switch that off whenever you like.

KEYWORDS
Type a word to get the store's own search suggestions, then see how open each term looks, judged from the size, age, monetization and freshness of its first 10 results.

DEVELOPER PAGES
A summary of the whole portfolio: combined and median installs, average score, and how many titles were updated in the last 90 days.

Every part toggles from the toolbar popup or the settings page, and changes apply instantly.

PRIVATE BY DESIGN
No account. No analytics. No servers of our own. PlayLens sends requests only to play.google.com and reads the same public pages you could open yourself. Everything it keeps stays on your device and can be cleared from the settings page.

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
- Screenshots 1280×800 (`node tools/capture-store.js`): `store/screenshot-1-panel.png`,
  `store/screenshot-2-cards.png`, `store/screenshot-3-details.png`,
  `store/screenshot-4-watchlist.png`, `store/screenshot-5-keywords.png`
- Small promo tile 440×280: optional, skip

## Privacy tab

- **Single purpose description:**
  Shows public statistics about the apps listed on Google Play pages (installs, ratings, age, price, update date), and lets the user compare, follow and export them.
- **Permission justifications:**
  - `storage` — saves the user's display settings, the list of recently opened apps, the watchlist with its daily record of public numbers, and a 12-hour cache of public app data so pages load faster. All of it stays in the browser.
  - `clipboardWrite` — used only when the user clicks a Copy button (the table as CSV, a developer's email address, a list of search terms).
  - `alarms` — wakes the service worker about every six hours to re-read the Google Play pages of the apps the user put on the watchlist, so changes of version, price or rating can be shown. Nothing is scheduled to run against any other site, no request is made while the watchlist is empty, and the user can switch it off in the settings.
  - Host `https://play.google.com/*` — the extension's single purpose is to annotate Google Play pages. The content script reads the list the user is looking at and fetches the public detail pages of the apps on it; the service worker fetches the same public pages for the watchlist. It never runs on, or sends anything to, any other site.
- **Remote code:** No, all code is packaged in the extension.
- **Data usage:** check **nothing** (no data collected). Certify the disclosures.
- **Privacy policy URL:** https://fighttechvn.github.io/playlens/privacy.html
  (`docs/privacy.html` — updated for 2.0.0; it goes live when `main` is pushed, so push
  before submitting.)

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

Occurrence counts in the description above (word and its plural, any case) — the limit
is 5:

| Keyword | Count |
|---|---|
| Google Play | 2 |
| PlayLens | 4 |
| install / installs | 3 |
| review / reviews | 3 |
| rating / ratings | 3 |
| price | 4 |
| score | 4 |
| developer | 3 |
| search | 3 |
| CSV | 2 |
| panel | 2 |
| watchlist | 1 |
| keywords | 1 |

Every keyword describes something the extension actually does — no unrelated terms
(no "free VPN", "downloader", competitor names) are present. The three outside sites the
details view links to are deliberately not named in the description.

### Metadata accuracy

> "We don't allow extensions with misleading, inaccurate, incomplete … metadata"

- ✅ All screenshots are real captures of the current build at 1280×800, not mockups.
- ✅ The description claims no feature that isn't in the shipped code.
- ✅ Permissions listed in the manifest are exactly what the code uses: `storage`,
  `clipboardWrite`, `alarms`, and the one host `https://play.google.com/*`.
- ✅ No revenue or earnings figures are shown anywhere — they cannot be read from public
  pages, so the extension does not guess them.
- ✅ Reviewer names are left out of the reviews view and of the review export.

## Submit checklist (owner actions)

The first submission is done — kept here as the record of what it took, and as the
recipe if a second item ever needs the same treatment.

1. ~~Register a developer account at https://chrome.google.com/webstore/devconsole ($5 one-time fee).~~ ✅
2. ~~New item → upload `dist/playlens-v1.6.1.zip`.~~ ✅
3. ~~Fill Store listing + Privacy + Distribution tabs from this file.~~ ✅
4. ~~Submit for review.~~ ✅ approved.
5. ~~After approval, add the CWS link to README + landing page CTA.~~ ✅ both READMEs and `docs/index.html`.
6. ~~Grab the item ID from the dashboard URL~~ ✅ `hnhlkgnfbcijmnaaclpliogmmnflekko` — now in
   [api-publishing.md](api-publishing.md); every version after this one ships with `./tools/publish.sh`.

Still open for the owner: set the four `CWS_*` repository secrets so CI can publish updates.

### Updating to 2.0.0

1. Push `main` so the updated privacy policy is live.
2. Package → upload `dist/playlens-v2.0.0.zip`.
3. Store listing tab: paste the new description, replace the screenshots.
4. Privacy tab: new single purpose text, justifications for `alarms` and the host permission.
5. Submit for review.
