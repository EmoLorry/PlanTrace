#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="EmoLorry"
REPO_NAME="PlanTrace"
BRANCH="main"
INSTALL_ROOT="$HOME/Applications"
APP_NAME="PlanTrace"
NO_LAUNCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --install-root)
      INSTALL_ROOT="$2"
      shift 2
      ;;
    --app-name)
      APP_NAME="$2"
      shift 2
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

step() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nPlanTrace install failed: %s\n' "$1" >&2
  exit 1
}

download_first() {
  local out_file="$1"
  shift
  local last_error=""

  for url in "$@"; do
    printf 'Downloading: %s\n' "$url"
    if curl -L --fail --connect-timeout 20 --max-time 180 --retry 2 -o "$out_file" "$url"; then
      printf 'Download source: %s\n' "$url"
      return 0
    fi
    last_error="$url"
  done

  fail "all download mirrors failed. Last tried: $last_error"
}

command -v curl >/dev/null 2>&1 || fail "curl was not found."
command -v unzip >/dev/null 2>&1 || fail "unzip was not found."

INSTALL_DIR="$INSTALL_ROOT/$APP_NAME"
TMP_ROOT="${TMPDIR:-/tmp}/plantrace-install-$$"
ZIP_PATH="$TMP_ROOT/source.zip"
EXTRACT_DIR="$TMP_ROOT/extract"
PRESERVE_DIR="$INSTALL_ROOT/${APP_NAME}-user-data-preserve-$(date +%s)-$$"

cleanup() {
  local status=$?
  rm -rf "$TMP_ROOT"
  if [[ "$status" -eq 0 ]]; then
    rm -rf "$PRESERVE_DIR"
    return
  fi

  if [[ -d "$PRESERVE_DIR" ]]; then
    mkdir -p "$INSTALL_DIR"
    for name in backups data; do
      if [[ -d "$PRESERVE_DIR/$name" ]]; then
        rm -rf "$INSTALL_DIR/$name"
        cp -R "$PRESERVE_DIR/$name" "$INSTALL_DIR/$name"
      fi
    done
    printf '\nExisting user data was restored after install failure.\n' >&2
    printf 'A safety copy was kept at: %s\n' "$PRESERVE_DIR" >&2
  fi
}
trap cleanup EXIT

step "Preparing installer workspace"
mkdir -p "$TMP_ROOT" "$EXTRACT_DIR" "$INSTALL_ROOT"

step "Downloading $REPO_OWNER/$REPO_NAME ($BRANCH)"
download_first "$ZIP_PATH" \
  "https://codeload.github.com/$REPO_OWNER/$REPO_NAME/zip/refs/heads/$BRANCH" \
  "https://github.com/$REPO_OWNER/$REPO_NAME/archive/refs/heads/$BRANCH.zip"

step "Extracting source"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"
SOURCE_DIR="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[[ -n "$SOURCE_DIR" ]] || fail "the downloaded archive did not contain a project directory."
[[ -d "$SOURCE_DIR/src" ]] || fail "the downloaded archive does not look like a PlanTrace project."

step "Installing to $INSTALL_DIR"
for name in backups data; do
  if [[ -d "$INSTALL_DIR/$name" ]]; then
    mkdir -p "$PRESERVE_DIR"
    cp -R "$INSTALL_DIR/$name" "$PRESERVE_DIR/$name"
  fi
done

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -R "$SOURCE_DIR"/. "$INSTALL_DIR"/

for name in backups data; do
  if [[ -d "$PRESERVE_DIR/$name" ]]; then
    rm -rf "$INSTALL_DIR/$name"
    cp -R "$PRESERVE_DIR/$name" "$INSTALL_DIR/$name"
  fi
done

find "$INSTALL_DIR" -maxdepth 1 -name "*.command" -exec chmod +x {} + 2>/dev/null || true
find "$INSTALL_DIR/scripts" -maxdepth 1 -name "*.sh" -exec chmod +x {} + 2>/dev/null || true

LOCAL_INSTALLER="$INSTALL_DIR/scripts/install-local-macos.sh"
[[ -f "$LOCAL_INSTALLER" ]] || fail "scripts/install-local-macos.sh was not found in the downloaded project."

install_args=(--project-dir "$INSTALL_DIR" --create-shortcut)
if [[ "$NO_LAUNCH" != "1" ]]; then
  install_args+=(--launch)
fi

bash "$LOCAL_INSTALLER" "${install_args[@]}"

printf '\nPlanTrace was installed to %s\n' "$INSTALL_DIR"
