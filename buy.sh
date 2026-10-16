#!/usr/bin/env bash
# NanoTab one-click buyer setup — wallet + config + backup in one command.
#
# Usage:
#   curl -fsSL https://nanotab.dev/buy.sh | bash
#
# What it does:
#   1. Clones (or updates) the NanoTab repo into ~/.nanotab/src
#   2. Installs + builds the agent SDK
#   3. Runs `nanotab buy-init` — creates buyer wallet ($5 budget, $0.10/call),
#      writes config, backs up the key, prints wallet + fund instructions.
#
# Requirements: node >= 18, npm, git. No ETH needed — gas is paid in USDC.
set -euo pipefail

SRC_DIR="${NANOTAB_SRC:-$HOME/.nanotab/src}"
REPO="https://github.com/HectorTries/nanotab.git"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 not found — please install it first." >&2; exit 1; }; }
need node; need npm; need git

echo "▸ fetching NanoTab…"
if [ -d "$SRC_DIR/.git" ]; then
  git -C "$SRC_DIR" pull --ff-only -q || true
else
  git clone -q "$REPO" "$SRC_DIR"
fi

echo "▸ installing SDK…"
npm --prefix "$SRC_DIR/packages/agent-sdk" install --no-audit --no-fund -q 2>&1 | tail -1 || true
npm --prefix "$SRC_DIR/packages/agent-sdk" run build -s

echo "▸ creating your buyer wallet…"
node "$SRC_DIR/packages/agent-sdk/dist/cli.js" buy-init "$@"

echo ""
echo "Done. To buy from code:"
echo "  const { nanotabFetch } = require('$SRC_DIR/packages/agent-sdk/dist/index.js');"
