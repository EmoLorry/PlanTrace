#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STARTER="$SCRIPT_DIR/scripts/start-macos.sh"

if [[ ! -f "$STARTER" ]]; then
  echo "Missing starter script: $STARTER"
  exit 1
fi

chmod +x "$STARTER" 2>/dev/null || true
exec bash "$STARTER" "$SCRIPT_DIR" "$@"
