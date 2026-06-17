#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SRC="${ROOT_DIR}/services/easy-dashboard.service"
SERVICE_DST="/etc/systemd/system/easy-dashboard.service"

cd "${ROOT_DIR}"

python3 -m pip install --user --upgrade pip
python3 -m pip install --user -r requirements.txt

sudo install -m 644 "${SERVICE_SRC}" "${SERVICE_DST}"
sudo systemctl daemon-reload
sudo systemctl enable easy-dashboard.service

mkdir -p data/logs data/reports data/captures/rgb_left data/captures/rgb_right data/captures/thermal

echo "Installation complete."
echo "Start manually: ${ROOT_DIR}/start.sh"
echo "Or use: sudo systemctl start easy-dashboard.service"
