#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATER="$SCRIPT_DIR/scripts/update-from-github-macos.sh"

if [[ ! -f "$UPDATER" ]]; then
  echo "Missing updater script: $UPDATER"
  exit 1
fi

chmod +x "$UPDATER" 2>/dev/null || true
exec bash "$UPDATER" --project-dir "$SCRIPT_DIR" "$@"
