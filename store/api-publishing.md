# Automating version updates

`tools/publish.sh` uploads a new build to the Chrome Web Store without touching the
dashboard, and CI does it for you when a new version reaches `main`. Setup is a one-time
~10 minutes.

## What it can and can't do

The [CWS API](https://developer.chrome.com/docs/webstore/using-api) only moves packages.
It cannot create the listing text, upload screenshots, or answer the privacy
declarations — so **the first submission had to be done by hand** in the dashboard (see
[listing.md](listing.md)). That is done: the item exists, and the API handles every
version after it.

## One-time setup

Steps 1–2 need your Google account, so they are yours to do — nothing can consent on
your behalf. Everything after that is one command.

**1. Enable the API.** In [Google Cloud Console](https://console.cloud.google.com/),
create a project (any name), then enable **Chrome Web Store API** under
*APIs & Services → Library*.

**2. Create an OAuth client.** *APIs & Services → Credentials → Create credentials →
OAuth client ID*. Application type **Desktop app**. Keep the **client ID** and
**client secret** at hand.

If prompted to configure the consent screen: User type **External**, fill the required
name/email fields, add scope `https://www.googleapis.com/auth/chromewebstore`, and add
your own Google account under **Test users**.

> **Then set *Publishing status* to "In production"** (*Google Auth Platform → Audience →
> Publish app*). While the screen is left in *Testing*, Google expires the refresh token
> after **7 days** and the pipeline fails with `invalid_grant` a week later. In production
> the app stays unverified — you only see a warning screen once, on your own account —
> and the token lasts until you revoke it.

**3. Run the setup script.**

```bash
node tools/cws-setup.js
```

It asks for the client ID and secret (the secret is not echoed), opens Google for you to
approve, catches the answer on a local port, writes `.env.cws` (mode 600, gitignored),
checks it against the store, and — if `gh` is logged in — pushes the four values to the
repository as GitHub Actions secrets. The item ID defaults to PlayLens,
`hnhlkgnfbcijmnaaclpliogmmnflekko` (the 32-character string in the dashboard and listing
URLs).

Check it again any time, e.g. before a release:

```bash
node tools/cws-setup.js --check
```

<details><summary>Doing it by hand instead</summary>

Open this URL, replacing `YOUR_CLIENT_ID`:

```
https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&access_type=offline&prompt=consent
```

Approve it; the browser lands on a `http://localhost/?code=...` page that fails to load —
expected. Copy the `code` from the address bar and exchange it (single-use):

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=THE_CODE_FROM_THE_URL" -d "grant_type=authorization_code" \
  -d "redirect_uri=http://localhost"
```

Put `refresh_token` in `.env.cws` together with the other three values:

```bash
CWS_CLIENT_ID=...
CWS_CLIENT_SECRET=...
CWS_REFRESH_TOKEN=...
CWS_ITEM_ID=hnhlkgnfbcijmnaaclpliogmmnflekko
```

and add the same four as repository secrets (*Settings → Secrets and variables → Actions*).
</details>

## Releasing after that

```bash
# bump "version" in manifest.json first
./tools/publish.sh              # upload as a draft — inspect it in the dashboard
./tools/publish.sh --publish    # upload and submit for review
```

The draft-by-default is deliberate: an upload is reversible, a submission is not.

## From GitHub Actions — the automatic pipeline

`.github/workflows/publish.yml` runs the same script in CI. With the four `CWS_*` secrets
in place, shipping is:

```bash
# 1. bump "version" in manifest.json on a claude/* branch, PR → develop → uat → main
# 2. that's it
```

When a push to `main` changes `manifest.json` to a version that has no GitHub release yet,
the workflow builds the zip, uploads it to the store, tags `vX.Y.Z` and creates the release
with the zip attached. GitHub Pages (`docs/`) redeploys from `main` on its own.
A merge that touches `manifest.json` without changing the version does nothing.

**Draft or submit?** By default the upload is a **draft** — open the dashboard and press
*Submit for review*. To submit automatically, set the repository variable once
(`node tools/cws-setup.js` offers to):

```bash
gh variable set CWS_AUTO_SUBMIT --repo fighttechvn/playlens --body true
```

Other ways in: publishing a GitHub release by hand (always submits; the tag must match the
manifest), or *Actions → Publish to Chrome Web Store → Run workflow* (the checkbox chooses).

Until the secrets exist the workflow builds the zip and says so in a notice — merges don't
turn red, and no tag is created, so the version still ships once the secrets are added
(re-run it from the Actions tab). If only some of the four are set, it fails on purpose.

If you want a human gate on publishing, create an environment named `chrome-web-store`
with required reviewers and add `environment: chrome-web-store` to the job.

## Notes

- A version number can only go up, and can never be reused — even for a rejected build.
- Review is required for every update, not just the first one. Small metadata-only
  updates are usually fast; permission changes are slow.
- If `--publish` reports `ITEM_PENDING_REVIEW`, that is success, not an error.
- Never commit `.env.cws`. Anyone holding the refresh token can publish as you. If it
  leaks, revoke it at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
