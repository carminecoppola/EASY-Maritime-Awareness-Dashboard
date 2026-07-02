#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${ROOT_DIR}"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

APP_URL="http://127.0.0.1:5000"
./preflight_check.sh || true
echo "EASY dashboard started from Raspberry."
echo "On Raspberry LAN: http://$(hostname -I | awk '{print $1}'):5000"
echo "Mac fixed access:"
echo "  ssh -N -L 5000:127.0.0.1:5000 -J ccoppola@193.205.230.76 -p 44222 pi@127.0.0.1"
echo "  then open http://127.0.0.1:5000"

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
