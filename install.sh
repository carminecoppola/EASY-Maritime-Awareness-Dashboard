#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SRC="${ROOT_DIR}/services/easy-dashboard.service"
SERVICE_DST="/etc/systemd/system/easy-dashboard.service"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"

cd "${ROOT_DIR}"

if [[ -x "${PYTHON_BIN}" ]]; then
  "${PYTHON_BIN}" -m pip install --upgrade pip
  "${PYTHON_BIN}" -m pip install -r requirements.txt
else
  python3 -m pip install --user --upgrade pip
  python3 -m pip install --user -r requirements.txt
fi

chmod +x "${ROOT_DIR}/start.sh" "${ROOT_DIR}/scripts/run_service.sh" "${ROOT_DIR}/scripts/validate_raspberry_runtime.sh"

sudo install -m 644 "${SERVICE_SRC}" "${SERVICE_DST}"
sudo systemctl daemon-reload
sudo systemctl enable easy-dashboard.service

mkdir -p data/logs data/reports data/captures/rgb_left data/captures/rgb_right data/captures/thermal data/snapshots

echo "Installation complete."
echo "Start manually: ${ROOT_DIR}/start.sh"
echo "Or use service mode:"
echo "  sudo systemctl restart easy-dashboard.service"
echo "  curl http://127.0.0.1:5000/health"
echo "  ./scripts/validate_raspberry_runtime.sh"
