#!/usr/bin/env bash

plantrace_step() {
  printf '\n==> %s\n' "$1"
}

plantrace_fail() {
  printf '\nPlanTrace error: %s\n' "$1" >&2
  exit 1
}

plantrace_node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22) ? 0 : 1)' >/dev/null 2>&1
}

plantrace_ensure_node() {
  plantrace_step "Checking Node.js"

  if plantrace_node_version_ok; then
    printf 'Node.js %s found.\n' "$(node --version)"
    return
  fi

  if command -v brew >/dev/null 2>&1; then
    plantrace_step "Installing or updating Node.js with Homebrew"
    if ! brew install node; then
      brew upgrade node
    fi
    hash -r
  else
    open "https://nodejs.org/en/download" >/dev/null 2>&1 || true
    plantrace_fail "Node.js 20.19+ or 22.12+ is required. Homebrew was not found, so the Node.js download page was opened."
  fi

  if ! plantrace_node_version_ok; then
    plantrace_fail "Node.js is still missing or too old after install. Please install Node.js LTS and run the installer again."
  fi

  printf 'Node.js %s found.\n' "$(node --version)"
}

plantrace_ensure_npm() {
  command -v npm >/dev/null 2>&1 || plantrace_fail "npm was not found. Reinstall Node.js LTS and try again."
}

plantrace_install_dependencies() {
  local root="$1"
  plantrace_step "Installing dependencies"
  (cd "$root" && npm install --loglevel warn)
}

plantrace_chmod_project() {
  local root="$1"
  find "$root" -maxdepth 1 -name "*.command" -exec chmod +x {} + 2>/dev/null || true
  if [[ -d "$root/scripts" ]]; then
    find "$root/scripts" -maxdepth 1 -name "*.sh" -exec chmod +x {} + 2>/dev/null || true
  fi
}
