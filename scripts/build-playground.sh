#!/usr/bin/env bash
# Builds the web playground (demo school) for GitHub Pages into ./playground-dist.
# The demo sign-in is compiled in only here (EXPO_PUBLIC_DEMO_LOGIN / NEXT_PUBLIC_DEMO_LOGIN);
# store and production builds never set these flags.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/playground-dist"
REPO_PATH="/${PAGES_REPO:-ZCS-connect}"
rm -rf "$OUT" && mkdir -p "$OUT"

( cd "$ROOT/apps/mobile" && EXPO_PUBLIC_DEMO_LOGIN=1 EXPO_BASE_URL="$REPO_PATH/app" \
    npx expo export --platform web --clear --output-dir "$OUT/app" )

( cd "$ROOT/apps/console" && rm -rf .next out && PLAYGROUND=1 NEXT_PUBLIC_DEMO_LOGIN=1 \
    NEXT_PUBLIC_BASE_PATH="$REPO_PATH/console" NEXT_TELEMETRY_DISABLED=1 npx next build && cp -r out "$OUT/console" )

cp "$OUT/app/index.html" "$OUT/404.html"   # deep links into the app fall back to the SPA
cp "$ROOT/scripts/playground-index.html" "$OUT/index.html"
mkdir -p "$OUT/privacy" "$OUT/support"   # beta privacy policy and support URLs
cp "$ROOT/scripts/pages/privacy.html" "$OUT/privacy/index.html"
cp "$ROOT/scripts/pages/support.html" "$OUT/support/index.html"
touch "$OUT/.nojekyll"                      # keep _expo/ and _next/ folders
echo "Built $OUT — publish it to the gh-pages branch."
