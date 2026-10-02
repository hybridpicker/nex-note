#!/usr/bin/env bash
# Update Nex Note on Linux: pull the latest sources, rebuild and reinstall.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
git pull --ff-only
npm ci
exec "$REPO/linux/install.sh"
