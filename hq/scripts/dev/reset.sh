#!/usr/bin/env bash
# Reset hq's dev database.
#
# Stop the dev server (wasp start) BEFORE running this, otherwise the running
# server holds DB connections and will re-seed mid-reset.
#
# Touches hq only. hq never reads or writes a site's disk, so the site's data
# folder (its SITE_ROOT) and the agent containers it runs are the site's to
# clear, not this script's.
# The DB reset clears all records — including the GitHub PAT and your admin user.
# After reset: open the first-admin link hq prints when it starts, then re-enter
# the GitHub PAT in Settings → Git Integration.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "==> Resetting database..."
cd "$PROJECT_DIR"
npx wasp db reset
