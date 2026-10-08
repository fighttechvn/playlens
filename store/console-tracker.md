# Console tracker

PlayLens reads the Play Console pages the developer opens and keeps one record per app (by package name), plus a history of changes and actions. Everything is local (`chrome.storage.local`); nothing is sent anywhere.

Viewer (`console.html`) has two tabs: **Các app** (one row per app: production / open / internal / closed release + status, "In review" highlighted, events with next expiry, IAP / subscription / promo counts, licensing key, last capture; search, sort, export all apps) and **Chi tiết app** (everything saved for one app, history, CSV / JSON). The overview row comes from `cx.summary`.

Files: `console-parse.js` (pure parsing and bookkeeping, tested in `tools/test-console.js`), `console.js` (content script on `play.google.com/console/*`), `console.html` + `console-view.js` (viewer, opened from Options → Play Console).

## API vs page reading

Android Publisher API v3 was **not called** to check this; the table is from its documentation as remembered. Verify before relying on it.

| Data | Publisher API | Console page |
|---|---|---|
| Tracks, releases, version codes, rollout % | yes (`edits.tracks`) | yes |
| "In review", "Update in review" state | no | yes |
| Install base per release, countries per release | no | yes |
| One-time products, subscriptions, base plans, offers | yes | yes |
| LiveOps events (id, type, start/end, viewers) | no | yes |
| Promo codes | no | yes |
| Licensing public key | no | yes (Monetization setup) |

The API also needs a service account or OAuth client with Console permission, which the extension does not have. So the first version reads pages; an optional API source can be added later for the rows marked "yes".

## What is read, per page

| Page (`/console/u/0/developers/<dev>/app/<appId>/…`) | Saved |
|---|---|
| `app-list` | package ↔ appId ↔ name (10 apps per page; learned as you page) |
| `app-dashboard` | package name for that appId |
| `releases/overview` | releases (track, version, status, rollout, last updated, countries, install base) and version codes |
| `tracks/<id>` | track state, latest release, countries, availability, release date |
| `liveops/overview` | events: id, name, type, start/end (UTC), viewers, converters, status |
| `one-time-products`, `…/sku/<id>` | products; offer start/end dates from the detail page |
| `subscriptions`, `subscriptions/s/<id>` | subscriptions |
| `promotions` | promo codes (an empty page saves nothing) |
| `monetization-setup` | licensing key (399 chars, ends `IDAQAB`) |

Rows render only when the tab has been painted; the content script polls every 1.5 s for up to 90 s, then again every 2 min while the tab is visible.

## Storage

| Key | Value |
|---|---|
| `cx:idx` | `{byApp:{appId:pkg}, apps:{pkg:{appId,devId,name}}}` |
| `c:<pkg>` | app record: `tracks`, `releases`, `versions`, `events`, `products`, `productDetails`, `subscriptions`, `promos`, `license` |
| `ch:<pkg>` | history array, newest last, capped at 1000 |
| `consoleTrack` | `false` switches capture off (default on) |

Each list item keeps `firstSeen`, `lastSeen` and a `trail` (last 50 states). Until the package name is known, records live under `id:<appId>` and are folded into the real package once the app list or dashboard has been opened.

History entry types: `view` (a page opened, deduped within 60 s), `change` (added / changed with field diffs / removed / back) and `action` (a button pressed, only from a fixed list of labels, never free text).

## Known gaps

- Verified on live pages: releases overview, LiveOps, one-time products, subscriptions list, track page, app list. Not seen with rows: promo codes, the track "Releases" tab, product/subscription detail pages beyond the line parser.
- An empty table is not recorded, so an event or product deleted down to zero rows is never marked removed.
- Console copy changes break the line/regex parsers; the header-keyed table reader is the more stable half.
