#!/usr/bin/env bash
#
# Upload a new version to the Chrome Web Store (and optionally publish it).
#
# Only works once the item exists — the FIRST submission must go through the
# dashboard by hand, because the API cannot set the store listing, screenshots
# or privacy declarations. After that, every version bump is one command.
#
#   ./tools/publish.sh              # upload as a draft, review it in the dashboard
#   ./tools/publish.sh --publish    # upload and submit for review
#
# Setup: see store/api-publishing.md
#
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.cws"
PUBLISH=false
[[ "${1:-}" == "--publish" ]] && PUBLISH=true

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ $ENV_FILE not found. See store/api-publishing.md for how to create it." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

for var in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN CWS_ITEM_ID; do
  if [[ -z "${!var:-}" ]]; then
    echo "✗ $var is not set in $ENV_FILE" >&2
    exit 1
  fi
done

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
ZIP="dist/playlens-v${VERSION}.zip"

echo "▸ Building v${VERSION}"
./build.sh >/dev/null
[[ -f "$ZIP" ]] || { echo "✗ $ZIP was not produced" >&2; exit 1; }

echo "▸ Refreshing access token"
TOKEN=$(curl -sS -X POST https://oauth2.googleapis.com/token \
  -d "client_id=${CWS_CLIENT_ID}" \
  -d "client_secret=${CWS_CLIENT_SECRET}" \
  -d "refresh_token=${CWS_REFRESH_TOKEN}" \
  -d "grant_type=refresh_token" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);sys.exit('✗ '+d.get('error_description',d['error'])) if 'error' in d else print(d['access_token'])")

echo "▸ Uploading $ZIP"
curl -sS -X PUT \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CWS_ITEM_ID}" \
  | python3 -c "
import json,sys
d = json.load(sys.stdin)
state = d.get('uploadState')
if state in ('FAILURE', 'NOT_FOUND'):
    for e in d.get('itemError', [{'error_detail': d}]):
        print('  ' + str(e.get('error_detail')), file=sys.stderr)
    sys.exit('✗ upload failed')
print(f'  uploadState: {state}')
"

if [[ "$PUBLISH" == false ]]; then
  echo "✓ v${VERSION} uploaded as a draft."
  echo "  Review it at https://chrome.google.com/webstore/devconsole, or re-run with --publish."
  exit 0
fi

echo "▸ Submitting for review"
curl -sS -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${CWS_ITEM_ID}/publish" \
  | python3 -c "
import json,sys
d = json.load(sys.stdin)
for w in d.get('statusDetail', []):
    print('  ' + w)
if any(s not in ('OK', 'ITEM_PENDING_REVIEW') for s in d.get('status', [])):
    sys.exit('✗ publish rejected: ' + ', '.join(d.get('status', ['unknown'])))
"
echo "✓ v${VERSION} submitted for review."
