#!/usr/bin/env bash
set -euo pipefail

BACKEND_LABEL="com.nemoclaw.backend"
UI_LABEL="com.nemoclaw.ui"
BRIDGE_LABEL="com.nanosquad.gmail-draft-bridge"

printf "\n== %s ==\n" "$BACKEND_LABEL"
launchctl print "gui/$(id -u)/${BACKEND_LABEL}" 2>/dev/null || echo "not loaded"

printf "\n== %s ==\n" "$UI_LABEL"
launchctl print "gui/$(id -u)/${UI_LABEL}" 2>/dev/null || echo "not loaded"

printf "\n== %s ==\n" "$BRIDGE_LABEL"
launchctl print "gui/$(id -u)/${BRIDGE_LABEL}" 2>/dev/null || echo "not loaded"
