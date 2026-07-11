#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${EASY_DASHBOARD_URL:-http://127.0.0.1:5000}"
PYTHON_BIN="${EASY_PYTHON_BIN:-./.venv/bin/python}"
STARTUP_TIMEOUT_SECONDS="${EASY_STARTUP_TIMEOUT_SECONDS:-30}"

echo "EASY Raspberry runtime validation"
echo "URL: ${BASE_URL}"
echo

if [[ -x "${PYTHON_BIN}" ]]; then
  "${PYTHON_BIN}" scripts/smoke_dashboard.py
else
  python3 scripts/smoke_dashboard.py
fi

echo
echo "Waiting for dashboard readiness (max ${STARTUP_TIMEOUT_SECONDS}s)..."
ready=0
for ((attempt = 1; attempt <= STARTUP_TIMEOUT_SECONDS; attempt++)); do
  if curl -fsS --connect-timeout 1 --max-time 2 "${BASE_URL}/health" >/dev/null 2>&1; then
    ready=1
    echo "Dashboard ready after ${attempt}s."
    break
  fi
  sleep 1
done

if [[ "${ready}" -ne 1 ]]; then
  echo "ERROR: dashboard did not become ready at ${BASE_URL} within ${STARTUP_TIMEOUT_SECONDS}s." >&2
  echo "Check the service with:" >&2
  echo "  sudo systemctl status easy-dashboard.service --no-pager" >&2
  echo "  journalctl -u easy-dashboard.service -n 100 --no-pager" >&2
  exit 1
fi

echo
echo "Checking HTTP endpoints..."
for endpoint in \
  "/health" \
  "/api/dashboard/state" \
  "/thermal/status" \
  "/api/acquisition/status" \
  "/api/dataset/export/status" \
  "/api/session/status"; do
  echo "GET ${endpoint}"
  curl -fsS "${BASE_URL}${endpoint}" >/dev/null
done

echo
echo "Checking media endpoints..."
curl -fsSI "${BASE_URL}/thermal/frame" | grep -qi "content-type: image/jpeg"
curl -fsSI "${BASE_URL}/video/rgb_left" | grep -qi "multipart/x-mixed-replace"
curl -fsSI "${BASE_URL}/video/rgb_right" | grep -qi "multipart/x-mixed-replace"

echo
echo "Runtime validation: OK"
