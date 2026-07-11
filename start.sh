#!/usr/bin/env bash
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

./preflight_check.sh || true
echo
echo "EASY Dashboard"
echo "=============="
echo "Raspberry LAN: http://${RASPBERRY_IP}:${REMOTE_APP_PORT}"
if systemctl is-active --quiet rainbow-tunnel.service 2>/dev/null; then
  echo "Tunnel Raspberry -> Purple: ACTIVE"
else
  echo "Tunnel Raspberry -> Purple: NOT ACTIVE"
  echo "Check it with: systemctl status rainbow-tunnel.service"
fi
echo
echo "REMOTE ACCESS FROM THE MAC"
echo "--------------------------"
echo
echo "From the Mac repository run:"
echo "   ./scripts/easy_dashboard_mac.sh"
echo "It manages systemd, readiness, the SSH tunnel and Safari."
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
