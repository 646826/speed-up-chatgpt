#!/usr/bin/env bash
# Activate the GitHub Actions workflows: copies ci/workflows/*.yml into
# .github/workflows/ and commits. Run once after cloning:
#   bash scripts/setup-ci.sh && git push
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .github/workflows
cp ci/workflows/*.yml .github/workflows/
git add .github/workflows
git commit -m "ci: enable GitHub Actions workflows" || echo "nothing to commit"
echo "Workflows enabled. Push to trigger the first CI run."
