#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_INSTALLER="$SCRIPT_DIR/scripts/install-local-macos.sh"

if [[ ! -f "$LOCAL_INSTALLER" ]]; then
  echo "Missing installer script: $LOCAL_INSTALLER"
  exit 1
fi

chmod +x "$LOCAL_INSTALLER" 2>/dev/null || true
exec bash "$LOCAL_INSTALLER" --project-dir "$SCRIPT_DIR" --launch --create-shortcut "$@"
