#!/usr/bin/env bash
# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause
#
# Render services/easy-dashboard.service for this checkout and the current user, install
# it in /etc/systemd/system and enable it. Safe to run repeatedly. It does not restart the
# service: use "sudo systemctl restart easy-dashboard.service" when you want that.
#
# Usage: scripts/install_service.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${EASY_SERVICE_USER:-$(id -un)}"
TEMPLATE="${PROJECT_DIR}/services/easy-dashboard.service"
TARGET="/etc/systemd/system/easy-dashboard.service"

sed -e "s#@PROJECT_DIR@#${PROJECT_DIR}#g" -e "s#@SERVICE_USER@#${SERVICE_USER}#g" "${TEMPLATE}" \
  | sudo tee "${TARGET}" >/dev/null
sudo chmod 644 "${TARGET}"
sudo systemctl daemon-reload
sudo systemctl enable easy-dashboard.service >/dev/null
echo "Installed ${TARGET} (user ${SERVICE_USER}, project ${PROJECT_DIR})"
