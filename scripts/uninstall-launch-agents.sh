#!/usr/bin/env bash
set -euo pipefail

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
BACKEND_LABEL="com.nemoclaw.backend"
UI_LABEL="com.nemoclaw.ui"
BRIDGE_LABEL="com.nanosquad.gmail-draft-bridge"

launchctl bootout "gui/$(id -u)/${BACKEND_LABEL}" >/dev/null 2>&1 || true
launchctl bootout "gui/$(id -u)/${UI_LABEL}" >/dev/null 2>&1 || true
launchctl bootout "gui/$(id -u)/${BRIDGE_LABEL}" >/dev/null 2>&1 || true

rm -f "$LAUNCH_AGENTS_DIR/${BACKEND_LABEL}.plist"
rm -f "$LAUNCH_AGENTS_DIR/${UI_LABEL}.plist"
rm -f "$LAUNCH_AGENTS_DIR/${BRIDGE_LABEL}.plist"

echo "Removed LaunchAgents ${BACKEND_LABEL}, ${UI_LABEL}, and ${BRIDGE_LABEL}."
