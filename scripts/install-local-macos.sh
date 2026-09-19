#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/macos-common.sh"

PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCH=0
CREATE_SHORTCUT=0
SKIP_NODE_INSTALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="$(cd "$2" && pwd)"
      shift 2
      ;;
    --launch)
      LAUNCH=1
      shift
      ;;
    --create-shortcut)
      CREATE_SHORTCUT=1
      shift
      ;;
    --skip-node-install)
      SKIP_NODE_INSTALL=1
      shift
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  plantrace_fail "package.json was not found in $PROJECT_DIR"
fi

if [[ "$SKIP_NODE_INSTALL" == "1" ]]; then
  plantrace_node_version_ok || plantrace_fail "Node.js 20.19+ or 22.12+ is required."
else
  plantrace_ensure_node
fi

plantrace_ensure_npm
plantrace_install_dependencies "$PROJECT_DIR"
plantrace_chmod_project "$PROJECT_DIR"

if [[ "$CREATE_SHORTCUT" == "1" ]]; then
  plantrace_step "Creating desktop launcher"
  shortcut="$HOME/Desktop/PlanTrace.command"
  quoted_project_dir="$(printf '%q' "$PROJECT_DIR")"
  cat > "$shortcut" <<EOF
#!/usr/bin/env bash
cd $quoted_project_dir
exec ./start-macOS.command
EOF
  chmod +x "$shortcut"
  printf 'Launcher created: %s\n' "$shortcut"
fi

if [[ "$LAUNCH" == "1" ]]; then
  plantrace_step "Launching PlanTrace"
  open "$PROJECT_DIR/start-macOS.command"
fi

printf '\nPlanTrace install complete.\n'
