#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PNPM_BIN="$(command -v pnpm || true)"

if [[ -z "$PNPM_BIN" ]]; then
  echo "pnpm not found in PATH. Install pnpm first, then rerun this script."
  exit 1
fi

mkdir -p "$LAUNCH_AGENTS_DIR"
mkdir -p "$PROJECT_ROOT/logs"

BACKEND_LABEL="com.nemoclaw.backend"
UI_LABEL="com.nemoclaw.ui"
BACKEND_PLIST="$LAUNCH_AGENTS_DIR/${BACKEND_LABEL}.plist"
UI_PLIST="$LAUNCH_AGENTS_DIR/${UI_LABEL}.plist"

cat > "$BACKEND_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${BACKEND_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PNPM_BIN}</string>
    <string>backend:start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${PROJECT_ROOT}/logs/backend.launch.out.log</string>
  <key>StandardErrorPath</key>
  <string>${PROJECT_ROOT}/logs/backend.launch.err.log</string>
</dict>
</plist>
PLIST

cat > "$UI_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${UI_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PNPM_BIN}</string>
    <string>start:ui</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${PROJECT_ROOT}/logs/ui.launch.out.log</string>
  <key>StandardErrorPath</key>
  <string>${PROJECT_ROOT}/logs/ui.launch.err.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/${BACKEND_LABEL}" >/dev/null 2>&1 || true
launchctl bootout "gui/$(id -u)/${UI_LABEL}" >/dev/null 2>&1 || true

launchctl bootstrap "gui/$(id -u)" "$BACKEND_PLIST"
launchctl bootstrap "gui/$(id -u)" "$UI_PLIST"

launchctl enable "gui/$(id -u)/${BACKEND_LABEL}"
launchctl enable "gui/$(id -u)/${UI_LABEL}"

launchctl kickstart -k "gui/$(id -u)/${BACKEND_LABEL}"
launchctl kickstart -k "gui/$(id -u)/${UI_LABEL}"

echo "Installed and started LaunchAgents:"
echo "- ${BACKEND_LABEL}"
echo "- ${UI_LABEL}"
echo ""
echo "UI:      http://localhost:3000"
echo "Backend: http://localhost:8000/health"
