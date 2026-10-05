#!/usr/bin/env bash
# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause
#
# Entry point used by the systemd unit: run the dashboard with the project's virtual
# environment (or the system Python) and without opening a browser.
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
