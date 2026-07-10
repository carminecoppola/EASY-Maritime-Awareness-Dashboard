#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${EASY_DASHBOARD_URL:-http://127.0.0.1:5000}"
PYTHON_BIN="${EASY_PYTHON_BIN:-./.venv/bin/python}"

echo "EASY Raspberry runtime validation"
echo "URL: ${BASE_URL}"
echo

if [[ -x "${PYTHON_BIN}" ]]; then
  "${PYTHON_BIN}" scripts/smoke_dashboard.py
else
  python3 scripts/smoke_dashboard.py
fi

echo
echo "Checking HTTP endpoints..."
for endpoint in \
  "/health" \
  "/api/dashboard/state" \
  "/thermal/status" \
  "/api/acquisition/status" \
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
