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

echo "[1/7] Building React frontend (run npm ci in frontend/ first)"
(cd frontend && npm run build)

echo "[2/7] Running frontend unit tests"
(cd frontend && npm run test)

echo "[3/7] Compiling Python"
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

echo "[4/7] Running regression tests"
PYTHONWARNINGS=error::ResourceWarning "${PYTHON_BIN}" -m unittest discover -s tests -v

echo "[5/7] Running dashboard smoke test"
"${PYTHON_BIN}" scripts/smoke_dashboard.py

echo "[6/7] Checking shell syntax"
bash -n install.sh start.sh preflight_check.sh scripts/*.sh

echo "[7/7] Running browser smoke tests (install Playwright Chromium first)"
export EASY_PYTHON_BIN
EASY_PYTHON_BIN="$("${PYTHON_BIN}" -c 'import sys; print(sys.executable)')"
(cd frontend && npm run test:e2e)

echo "Local release validation: OK"
