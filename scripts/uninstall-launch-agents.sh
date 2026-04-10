#!/usr/bin/env bash
set -euo pipefail

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
BACKEND_LABEL="com.nemoclaw.backend"
UI_LABEL="com.nemoclaw.ui"

launchctl bootout "gui/$(id -u)/${BACKEND_LABEL}" >/dev/null 2>&1 || true
launchctl bootout "gui/$(id -u)/${UI_LABEL}" >/dev/null 2>&1 || true

rm -f "$LAUNCH_AGENTS_DIR/${BACKEND_LABEL}.plist"
rm -f "$LAUNCH_AGENTS_DIR/${UI_LABEL}.plist"

echo "Removed LaunchAgents ${BACKEND_LABEL} and ${UI_LABEL}."
