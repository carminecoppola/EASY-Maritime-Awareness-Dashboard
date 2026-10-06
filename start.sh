#!/usr/bin/env bash
# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause
#
# Start the dashboard in the foreground on the Raspberry Pi (manual mode, without systemd).
# Runs the pre-flight report, prints the access URLs and opens a browser when a desktop
# session is available (EASY_OPEN_BROWSER=0 disables it).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${ROOT_DIR}"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

APP_URL="http://127.0.0.1:5000"
REMOTE_APP_PORT="${EASY_REMOTE_APP_PORT:-5000}"
RASPBERRY_IP="$(hostname -I | awk '{print $1}')"

./scripts/preflight_check.sh || true
echo
echo "EASY Dashboard"
echo "=============="
echo "Raspberry LAN: http://${RASPBERRY_IP}:${REMOTE_APP_PORT}"
echo
echo "REMOTE ACCESS FROM THE MAC"
echo "--------------------------"
echo
echo "From the Mac repository run:"
echo "   ./scripts/easy_dashboard_mac.sh"
echo "It manages systemd, readiness, the SSH tunnel and the browser."
echo

if [[ "${EASY_OPEN_BROWSER:-1}" == "1" && -n "${DISPLAY:-}" ]]; then
  echo "Opening browser on ${APP_URL}..."
  (
    sleep 3
    if command -v chromium-browser >/dev/null 2>&1; then
      chromium-browser "${APP_URL}" >/dev/null 2>&1 || xdg-open "${APP_URL}" >/dev/null 2>&1 || true
    else
      xdg-open "${APP_URL}" >/dev/null 2>&1 || true
    fi
  ) &
else
  echo "Browser auto-open skipped. Open ${APP_URL} manually from the Raspberry desktop."
fi

exec "${PYTHON_BIN}" app.py
