#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${ROOT_DIR}"
./preflight_check.sh || true
echo "EASY dashboard started from Raspberry."
echo "On Raspberry LAN: http://$(hostname -I | awk '{print $1}'):5000"
echo "On Mac via tunnel: http://127.0.0.1:5000"
exec python3 app.py
