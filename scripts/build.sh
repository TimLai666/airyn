#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-dev/test_model}"
ENVIRONMENT="${2:-RP2350A}"

AIRYN_PROFILE="$PROFILE" pio run -e "$ENVIRONMENT"

