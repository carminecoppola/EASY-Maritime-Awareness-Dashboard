#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"
export EASY_OPEN_BROWSER=0

exec "${PYTHON_BIN}" app.py
