#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/macos-common.sh"

PROJECT_DIR="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  plantrace_fail "package.json was not found in $PROJECT_DIR"
fi

plantrace_ensure_node
plantrace_ensure_npm

if [[ ! -f "$PROJECT_DIR/node_modules/vite/bin/vite.js" ]]; then
  printf 'Dependencies are missing. Installing them now...\n'
  plantrace_install_dependencies "$PROJECT_DIR"
fi

plantrace_chmod_project "$PROJECT_DIR"

printf '\nPlanTrace is starting.\n'
printf 'Browser URL: http://localhost:5173\n'
printf 'Keep this window open while using PlanTrace.\n\n'

(sleep 2; open "http://localhost:5173" >/dev/null 2>&1 || true) &
cd "$PROJECT_DIR"
exec npm run start
