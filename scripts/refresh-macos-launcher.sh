#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-}"
if [[ -z "$PROJECT_DIR" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
fi

DESKTOP_DIR="$HOME/Desktop"
APP_PATH="$DESKTOP_DIR/PlanTrace.app"
COMMAND_PATH="$DESKTOP_DIR/PlanTrace.command"
ICON_SOURCE="$PROJECT_DIR/public/plantrace.icns"

mkdir -p "$DESKTOP_DIR"

quoted_project_dir="$(printf '%q' "$PROJECT_DIR")"
cat > "$COMMAND_PATH" <<EOF
#!/usr/bin/env bash
cd $quoted_project_dir
exec ./start-macOS.command
EOF
chmod +x "$COMMAND_PATH"

rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"

cat > "$APP_PATH/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>PlanTrace</string>
  <key>CFBundleExecutable</key>
  <string>PlanTrace</string>
  <key>CFBundleIconFile</key>
  <string>plantrace</string>
  <key>CFBundleIdentifier</key>
  <string>com.plantrace.desktop</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>PlanTrace</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.4.6</string>
  <key>CFBundleVersion</key>
  <string>1.4.6</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

if [[ -f "$ICON_SOURCE" ]]; then
  cp "$ICON_SOURCE" "$APP_PATH/Contents/Resources/plantrace.icns"
fi

cat > "$APP_PATH/Contents/MacOS/PlanTrace" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd $quoted_project_dir
exec ./start-macOS.command
EOF

chmod +x "$APP_PATH/Contents/MacOS/PlanTrace"
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true
touch "$APP_PATH"

printf 'PlanTrace macOS launcher refreshed: %s\n' "$APP_PATH"
printf 'Fallback command launcher refreshed: %s\n' "$COMMAND_PATH"
