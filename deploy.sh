#!/usr/bin/env bash
#
# Deploy a new version to the Chrome Web Store from this machine.
#
#   ./deploy.sh              # test, build, upload as a draft (review in the dashboard)
#   ./deploy.sh --publish    # ... and submit for review, then tag + GitHub release
#   ./deploy.sh --dry-run    # test + build only, nothing leaves the machine
#   ./deploy.sh -y           # skip the confirmation prompt
#
# Needs .env.cws (run `node tools/cws-setup.js` once) and, for the release step,
# the GitHub CLI. Bump "version" in manifest.json first — the store rejects a
# package whose version is not higher than the one it already has.
#
set -euo pipefail
cd "$(dirname "$0")"

PUBLISH=false DRY=false YES=false
for a in "$@"; do
  case "$a" in
    --publish) PUBLISH=true ;;
    --dry-run) DRY=true ;;
    -y|--yes)  YES=true ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $a (try --help)" >&2; exit 2 ;;
  esac
done

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
TAG="v${VERSION}"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
MODE="upload as a draft"; $PUBLISH && MODE="upload and SUBMIT FOR REVIEW"; $DRY && MODE="build only (dry run)"

echo "PlayLens ${TAG}  ·  branch ${BRANCH}  ·  ${MODE}"

if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
  echo "! working tree has uncommitted changes — the package would not match any commit"
fi
[[ "$BRANCH" != "main" ]] && echo "! not on main — releases normally ship from main"
if command -v gh >/dev/null && gh release view "$TAG" >/dev/null 2>&1; then
  echo "! ${TAG} already has a GitHub release — did you forget to bump the version?"
fi

echo "▸ Tests"
node tools/test-core.js >/dev/null
node tools/test-pro.js >/dev/null
echo "  ✓ passed"

if $DRY; then
  ./build.sh
  echo "✓ dry run done — nothing uploaded."
  exit 0
fi

if ! $YES; then
  read -r -p "Continue: ${MODE} for ${TAG}? [y/N] " ok
  [[ "$ok" =~ ^[Yy] ]] || { echo "Cancelled."; exit 1; }
fi

if $PUBLISH; then ./tools/publish.sh --publish; else ./tools/publish.sh; fi

# A release only makes sense once the version has actually been submitted.
if $PUBLISH && command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  if gh release view "$TAG" >/dev/null 2>&1; then
    echo "▸ ${TAG} already has a release — attaching the zip"
    gh release upload "$TAG" dist/playlens.zip --clobber
  else
    echo "▸ Tagging ${TAG} on GitHub"
    gh release create "$TAG" dist/playlens.zip --generate-notes --title "$TAG" --target "$(git rev-parse HEAD)"
  fi
fi
