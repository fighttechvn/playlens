# Automating version updates

`tools/publish.sh` uploads a new build to the Chrome Web Store without touching the
dashboard. Setup is a one-time ~10 minutes; after that every release is one command.

## What it can and can't do

The [CWS API](https://developer.chrome.com/docs/webstore/using-api) only moves packages.
It cannot create the listing text, upload screenshots, or answer the privacy
declarations — so **the first submission must be done by hand** in the dashboard (see
[listing.md](listing.md)). Once the item exists, the API handles every version after it.

## One-time setup

Steps 1–4 need your Google account, so they are yours to do — a script can't consent on
your behalf.

**1. Enable the API.** In [Google Cloud Console](https://console.cloud.google.com/),
create a project (any name), then enable **Chrome Web Store API** under
*APIs & Services → Library*.

**2. Create an OAuth client.** *APIs & Services → Credentials → Create credentials →
OAuth client ID*. Application type **Desktop app**. Note the **client ID** and
**client secret**.

If prompted to configure the consent screen: User type **External**, fill the required
name/email fields, add scope `https://www.googleapis.com/auth/chromewebstore`, and add
your own Google account under **Test users**. It never needs to leave testing mode.

**3. Get a refresh token.** Open this URL in a browser, replacing `YOUR_CLIENT_ID`:

```
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&access_type=offline&prompt=consent
```

Approve it. The browser lands on a `http://localhost/?code=...` page that fails to load —
that's expected. Copy the `code` value out of the address bar and exchange it:

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=THE_CODE_FROM_THE_URL" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=http://localhost"
```

The response contains `refresh_token`. It does not expire unless you revoke it, but the
code is single-use — if the exchange fails, redo step 3 for a fresh one.

**4. Find the item ID.** After the first manual submission, it's the 32-character string
in the dashboard URL: `.../devconsole/.../<ITEM_ID>/edit`.

**5. Write the credentials file.** Create `.env.cws` in the repo root — it is gitignored,
and must stay that way:

```bash
CWS_CLIENT_ID=...
CWS_CLIENT_SECRET=...
CWS_REFRESH_TOKEN=...
CWS_ITEM_ID=...
```

## Releasing after that

```bash
# bump "version" in manifest.json first
./tools/publish.sh              # upload as a draft — inspect it in the dashboard
./tools/publish.sh --publish    # upload and submit for review
```

The draft-by-default is deliberate: an upload is reversible, a submission is not.

## Notes

- A version number can only go up, and can never be reused — even for a rejected build.
- Review is required for every update, not just the first one. Small metadata-only
  updates are usually fast; permission changes are slow.
- If `--publish` reports `ITEM_PENDING_REVIEW`, that is success, not an error.
- Never commit `.env.cws`. Anyone holding the refresh token can publish as you. If it
  leaks, revoke it at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
