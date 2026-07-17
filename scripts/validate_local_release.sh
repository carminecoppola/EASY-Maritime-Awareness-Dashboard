#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

if [[ -n "${EASY_PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="${EASY_PYTHON_BIN}"
elif [[ -x "./.venv/bin/python" ]]; then
  PYTHON_BIN="./.venv/bin/python"
else
  PYTHON_BIN="python3"
fi

echo "EASY local release validation"
echo "Python: ${PYTHON_BIN}"

echo "[1/5] Compiling Python"
"${PYTHON_BIN}" -m compileall -q \
  app.py \
  easy_dashboard \
  scripts \
  tests \
  *_manager.py \
  frame_provider.py \
  inference_*.py \
  runtime_catalog.py \
  runtime_support.py \
  system_orchestrator.py

echo "[2/5] Running regression tests"
PYTHONWARNINGS=error::ResourceWarning "${PYTHON_BIN}" -m unittest discover -s tests -v

echo "[3/5] Running dashboard smoke test"
"${PYTHON_BIN}" scripts/smoke_dashboard.py

echo "[4/5] Checking JavaScript syntax"
for file in static/js/dashboard_*.js; do
  node --check "${file}"
done

echo "[5/5] Checking shell syntax"
bash -n install.sh start.sh preflight_check.sh scripts/*.sh

echo "Local release validation: OK"
