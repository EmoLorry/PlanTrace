#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/macos-common.sh"

PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_OWNER="EmoLorry"
REPO_NAME="PlanTrace"
BRANCH="main"
YES=0
NO_LAUNCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="$(cd "$2" && pwd)"
      shift 2
      ;;
    --repo-owner)
      REPO_OWNER="$2"
      shift 2
      ;;
    --repo-name)
      REPO_NAME="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --yes)
      YES=1
      shift
      ;;
    --no-launch)
      NO_LAUNCH=1
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

plantrace_ensure_node
plantrace_ensure_npm

TMP_ROOT="${TMPDIR:-/tmp}/plantrace-update-$$"
ZIP_PATH="$TMP_ROOT/source.zip"
EXTRACT_DIR="$TMP_ROOT/extract"
MANIFEST_PATH="$TMP_ROOT/version.json"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT
mkdir -p "$TMP_ROOT" "$EXTRACT_DIR"

download_first() {
  local out_file="$1"
  shift
  local last_error=""

  for url in "$@"; do
    if curl -L --fail --connect-timeout 20 --max-time 180 --retry 2 -o "$out_file" "$url"; then
      printf 'Download source: %s\n' "$url"
      return 0
    fi
    last_error="$url"
  done

  plantrace_fail "all download mirrors failed. Last tried: $last_error"
}

download_manifest() {
  local cache_bust="t=$(date +%s)"
  local raw="https://raw.githubusercontent.com/$REPO_OWNER/$REPO_NAME/$BRANCH/public/version.json?$cache_bust"
  local cdn="https://cdn.jsdelivr.net/gh/$REPO_OWNER/$REPO_NAME@$BRANCH/public/version.json?$cache_bust"
  local api="https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/contents/public/version.json?ref=$BRANCH&$cache_bust"

  if curl -L --fail --connect-timeout 15 --max-time 30 -o "$MANIFEST_PATH" "$raw"; then
    return
  fi
  if curl -L --fail --connect-timeout 15 --max-time 30 -o "$MANIFEST_PATH" "$cdn"; then
    return
  fi
  if curl -L --fail --connect-timeout 15 --max-time 30 -o "$TMP_ROOT/api-version.json" "$api"; then
    node - "$TMP_ROOT/api-version.json" "$MANIFEST_PATH" <<'NODE'
const fs = require('fs');
const input = process.argv[2];
const output = process.argv[3];
const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
const encoded = String(payload.content || '').replace(/\s/g, '');
fs.writeFileSync(output, Buffer.from(encoded, 'base64').toString('utf8'));
NODE
    return
  fi

  plantrace_fail "could not download version manifest."
}

get_manifest_version() {
  node - "$1" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(String(manifest.version || '0.0.0'));
NODE
}

get_local_version() {
  node - "$PROJECT_DIR" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const versionJs = path.join(root, 'src', 'version.js');
if (fs.existsSync(versionJs)) {
  const match = fs.readFileSync(versionJs, 'utf8').match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (match) {
    process.stdout.write(match[1]);
    process.exit(0);
  }
}
const manifestPath = path.join(root, 'public', 'version.json');
if (fs.existsSync(manifestPath)) {
  try {
    process.stdout.write(String(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || '0.0.0'));
    process.exit(0);
  } catch {}
}
const packagePath = path.join(root, 'package.json');
if (fs.existsSync(packagePath)) {
  try {
    process.stdout.write(String(JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || '0.0.0'));
    process.exit(0);
  } catch {}
}
process.stdout.write('0.0.0');
NODE
}

is_newer_version() {
  node - "$1" "$2" <<'NODE'
const remote = String(process.argv[2] || '0.0.0').split('.').map((part) => parseInt(part, 10) || 0);
const local = String(process.argv[3] || '0.0.0').split('.').map((part) => parseInt(part, 10) || 0);
for (let i = 0; i < 3; i += 1) {
  const r = remote[i] || 0;
  const l = local[i] || 0;
  if (r > l) process.exit(0);
  if (r < l) process.exit(1);
}
process.exit(1);
NODE
}

copy_replace_dir() {
  local src="$1"
  local dst="$2"
  [[ -d "$src" ]] || return 0
  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
}

copy_merge_dir() {
  local src="$1"
  local dst="$2"
  [[ -d "$src" ]] || return 0
  mkdir -p "$dst"
  cp -R "$src"/. "$dst"/
}

plantrace_step "Checking latest version"
download_manifest
LOCAL_VERSION="$(get_local_version)"
REMOTE_VERSION="$(get_manifest_version "$MANIFEST_PATH")"

printf 'Current version: v%s\n' "$LOCAL_VERSION"
printf 'Latest version:  v%s\n' "$REMOTE_VERSION"

if ! is_newer_version "$REMOTE_VERSION" "$LOCAL_VERSION"; then
  printf '\nPlanTrace is already up to date.\n'
  if [[ -f "$PROJECT_DIR/scripts/refresh-macos-launcher.sh" ]]; then
    plantrace_step "Refreshing desktop launcher"
    bash "$PROJECT_DIR/scripts/refresh-macos-launcher.sh" "$PROJECT_DIR"
  fi
  exit 0
fi

if [[ "$YES" != "1" ]]; then
  printf '\nUpdate PlanTrace to v%s now? (Y/n) ' "$REMOTE_VERSION"
  read -r answer
  if [[ "$answer" =~ ^[Nn][Oo]?$ ]]; then
    printf 'Update canceled.\n'
    exit 0
  fi
fi

plantrace_step "Downloading latest source"
download_first "$ZIP_PATH" \
  "https://codeload.github.com/$REPO_OWNER/$REPO_NAME/zip/refs/heads/$BRANCH" \
  "https://github.com/$REPO_OWNER/$REPO_NAME/archive/refs/heads/$BRANCH.zip"

plantrace_step "Extracting source"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"
SOURCE_ROOT="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[[ -n "$SOURCE_ROOT" && -d "$SOURCE_ROOT/src" ]] || plantrace_fail "downloaded archive does not look like a PlanTrace project."

plantrace_step "Applying update"
for dir in src public; do
  if [[ -d "$SOURCE_ROOT/$dir" ]]; then
    copy_replace_dir "$SOURCE_ROOT/$dir" "$PROJECT_DIR/$dir"
    printf 'Updated %s/\n' "$dir"
  fi
done

if [[ -d "$SOURCE_ROOT/scripts" ]]; then
  copy_merge_dir "$SOURCE_ROOT/scripts" "$PROJECT_DIR/scripts"
  printf 'Updated scripts/\n'
fi

files=(
  ".gitattributes"
  "index.html"
  "package.json"
  "package-lock.json"
  "eslint.config.js"
  "vite.config.js"
  "install.bat"
  "start.bat"
  "Install-PlanTrace-From-GitHub.bat"
  "Update-PlanTrace.bat"
  "Install-PlanTrace-From-GitHub-Windows.bat"
  "Update-PlanTrace-Windows.bat"
  "Start-PlanTrace-Windows.bat"
  "Install-PlanTrace-Local-Windows.bat"
  "Install-PlanTrace-From-GitHub-macOS.command"
  "Update-PlanTrace-macOS.command"
  "start-macOS.command"
  "install-macOS.command"
  "README.md"
  "DEPLOY.md"
  "LICENSE"
)

for file in "${files[@]}"; do
  if [[ -f "$SOURCE_ROOT/$file" ]]; then
    cp "$SOURCE_ROOT/$file" "$PROJECT_DIR/$file"
    printf 'Updated %s\n' "$file"
  fi
done

plantrace_chmod_project "$PROJECT_DIR"
plantrace_install_dependencies "$PROJECT_DIR"

if [[ -f "$PROJECT_DIR/scripts/refresh-macos-launcher.sh" ]]; then
  plantrace_step "Refreshing desktop launcher"
  bash "$PROJECT_DIR/scripts/refresh-macos-launcher.sh" "$PROJECT_DIR"
fi

printf '\nPlanTrace updated to v%s.\n' "$REMOTE_VERSION"
printf 'User data in data/, backups/, and legacy browser localStorage was not changed.\n'

if [[ "$NO_LAUNCH" != "1" ]]; then
  printf 'Start PlanTrace now? (Y/n) '
  read -r launch
  if [[ ! "$launch" =~ ^[Nn][Oo]?$ ]]; then
    open "$PROJECT_DIR/start-macOS.command"
  fi
fi
