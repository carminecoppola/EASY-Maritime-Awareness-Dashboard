#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${ROOT_DIR}"
./preflight_check.sh || true
echo "EASY dashboard started from Raspberry."
echo "On Raspberry LAN: http://$(hostname -I | awk '{print $1}'):5000"
echo "Mac fixed access:"
echo "  ssh -N -L 5000:127.0.0.1:5000 -J ccoppola@193.205.230.76 -p 44222 pi@127.0.0.1"
echo "  then open http://127.0.0.1:5000"
exec python3 app.py
