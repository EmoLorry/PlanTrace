#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SCRIPT="$SCRIPT_DIR/scripts/install-from-github-macos.sh"

if [[ -f "$LOCAL_SCRIPT" ]]; then
  chmod +x "$LOCAL_SCRIPT" 2>/dev/null || true
  exec bash "$LOCAL_SCRIPT" "$@"
fi

TMP_DIR="${TMPDIR:-/tmp}/plantrace-installer-$$"
REMOTE_SCRIPT="$TMP_DIR/install-from-github-macos.sh"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

download_script() {
  local url="$1"
  curl -L --fail --connect-timeout 20 --max-time 90 -o "$REMOTE_SCRIPT" "$url"
}

echo "Downloading PlanTrace macOS installer..."
if ! download_script "https://raw.githubusercontent.com/EmoLorry/PlanTrace/main/scripts/install-from-github-macos.sh"; then
  if ! download_script "https://cdn.jsdelivr.net/gh/EmoLorry/PlanTrace@main/scripts/install-from-github-macos.sh"; then
    echo
    echo "Failed to download installer from GitHub."
    echo "Please check the network connection and try again."
    exit 1
  fi
fi

chmod +x "$REMOTE_SCRIPT"
exec bash "$REMOTE_SCRIPT" "$@"
