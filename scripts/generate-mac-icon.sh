#!/usr/bin/env bash
# Thin wrapper — delegates to the unified icon generator.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/scripts/generate-app-icons.mjs"
