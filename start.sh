#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${ROOT_DIR}"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

APP_URL="http://127.0.0.1:5000"
JUMP_USER="${EASY_JUMP_USER:-ccoppola}"
JUMP_HOST="${EASY_JUMP_HOST:-193.205.230.76}"
TARGET_USER="${EASY_TARGET_USER:-pi}"
TARGET_HOST="${EASY_TARGET_HOST:-127.0.0.1}"
TARGET_PORT="${EASY_TARGET_PORT:-44222}"
REMOTE_APP_PORT="${EASY_REMOTE_APP_PORT:-5000}"
LOCAL_PORT="${EASY_LOCAL_PORT:-5500}"
RASPBERRY_IP="$(hostname -I | awk '{print $1}')"
MAC_TUNNEL_COMMAND="ssh -fNT -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L ${LOCAL_PORT}:127.0.0.1:${REMOTE_APP_PORT} -J ${JUMP_USER}@${JUMP_HOST} -p ${TARGET_PORT} ${TARGET_USER}@${TARGET_HOST} && open http://127.0.0.1:${LOCAL_PORT}"

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
echo "COMMAND TO RUN ON THE MAC"
echo "-------------------------"
echo
echo "   ${MAC_TUNNEL_COMMAND}"
echo
echo "Safari URL: http://127.0.0.1:${LOCAL_PORT}"
echo "Run the command after restarting the Mac. If the tunnel is already active,"
echo "just open or refresh the Safari URL above."
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
