#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-testbench}"
ENVIRONMENT="${2:-RP2350A}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

AIRYN_MODEL="$PROFILE" pio run -e "$ENVIRONMENT" -t upload
