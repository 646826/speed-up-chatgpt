#!/usr/bin/env bash
# Build the Chrome Web Store package (dist/speed-up-chatgpt.zip)
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/generate-icons.mjs
rm -rf dist && mkdir -p dist
zip -r dist/speed-up-chatgpt.zip \
  manifest.json background content export popup preview icons LICENSE README.md \
  -x '*/.DS_Store' >/dev/null
echo "Built dist/speed-up-chatgpt.zip"
