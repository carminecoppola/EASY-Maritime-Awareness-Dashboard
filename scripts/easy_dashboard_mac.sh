#!/usr/bin/env bash
# =============================================================================
# EASY Maritime Awareness Dashboard - macOS remote launcher
#
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# Distributed under the BSD 3-Clause License (see LICENSE).
#
# The dashboard runs on a Raspberry Pi; the operator works from a Mac. This
# script is the single entry point that:
#
#   1. opens ONE authenticated SSH connection to the Raspberry (optionally
#      through a jump host) and keeps it alive for every following step;
#   2. makes sure the systemd service is running (it never restarts a service
#      that is already healthy, so a running mission is not interrupted);
#   3. waits until Flask answers its health endpoints;
#   4. forwards a local port to the dashboard over that same connection;
#   5. opens the default browser once the local endpoint really responds.
#
# Reusing a single connection (OpenSSH ControlMaster) means credentials or a
# key passphrase are requested at most once, instead of once per command.
#
# Configuration is read from, in decreasing priority:
#   - environment variables (EASY_*),
#   - the file $EASY_LAUNCHER_CONFIG, default ~/.config/easy/launcher.env.
# See scripts/easy_dashboard_mac.env.example for every supported setting.
#
# Usage:
#   scripts/easy_dashboard_mac.sh                  launch the dashboard
#   scripts/easy_dashboard_mac.sh --stop           close the shared connection
#   scripts/easy_dashboard_mac.sh --print-config   show the effective settings
#   scripts/easy_dashboard_mac.sh --install-home-launcher
#                                                  link the script as ~/easy_dashboard_mac.sh
# =============================================================================
set -euo pipefail

SCRIPT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/$(basename -- "${BASH_SOURCE[0]}")"
CONFIG_FILE="${EASY_LAUNCHER_CONFIG:-${XDG_CONFIG_HOME:-${HOME}/.config}/easy/launcher.env}"

# -----------------------------------------------------------------------------
# Configuration file: KEY=VALUE lines. Variables already present in the
# environment win over the file, so a one-off override never needs editing it.
# -----------------------------------------------------------------------------
load_config_file() {
  [[ -f "${CONFIG_FILE}" ]] || return 0
  local key value
  while IFS='=' read -r key value; do
    [[ "${key}" =~ ^EASY_[A-Z0-9_]+$ ]] || continue
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    if [[ -z "${!key:-}" ]]; then
      export "${key}=${value}"
    fi
  done < "${CONFIG_FILE}"
}
load_config_file

# Optional jump host (leave EASY_JUMP_HOST empty for a direct connection).
JUMP_USER="${EASY_JUMP_USER:-}"
JUMP_HOST="${EASY_JUMP_HOST:-}"
JUMP_PORT="${EASY_JUMP_PORT:-22}"

# Raspberry as seen from the jump host (or from this Mac when there is none).
TARGET_USER="${EASY_TARGET_USER:-pi}"
TARGET_HOST="${EASY_TARGET_HOST:-127.0.0.1}"
TARGET_PORT="${EASY_TARGET_PORT:-22}"

# Dashboard location and ports.
REMOTE_PROJECT="${EASY_REMOTE_PROJECT:-/home/pi/easy-dashboard}"
REMOTE_APP_PORT="${EASY_REMOTE_APP_PORT:-5000}"
LOCAL_PORT_START="${EASY_LOCAL_PORT:-5500}"

# Timing.
STARTUP_TIMEOUT="${EASY_STARTUP_TIMEOUT_SECONDS:-45}"
DEGRADED_START_DELAY="${EASY_DEGRADED_START_DELAY_SECONDS:-5}"
SSH_RETRIES="${EASY_SSH_RETRIES:-3}"
SSH_RETRY_DELAY="${EASY_SSH_RETRY_DELAY_SECONDS:-3}"

# Browser: empty means the macOS default browser, otherwise an application name.
BROWSER_APP="${EASY_BROWSER:-}"

SSH_TARGET="${TARGET_USER}@${TARGET_HOST}"

# The control socket must stay well below the 104-byte AF_UNIX path limit,
# hence a short directory and ssh's %C (hash of host/port/user) token.
CONTROL_DIR="${HOME}/.ssh"
CONTROL_PATH="${CONTROL_DIR}/easy-cm-%C"

SSH_OPTIONS=(
  -p "${TARGET_PORT}"
  -o ConnectTimeout=12
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
  -o ControlMaster=auto
  -o ControlPath="${CONTROL_PATH}"
  -o ControlPersist=4h
)
if [[ -n "${JUMP_HOST}" ]]; then
  SSH_OPTIONS+=(-J "${JUMP_USER:+${JUMP_USER}@}${JUMP_HOST}:${JUMP_PORT}")
fi

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

describe_route() {
  if [[ -n "${JUMP_HOST}" ]]; then
    echo "${SSH_TARGET}:${TARGET_PORT} via ${JUMP_HOST}"
  else
    echo "${SSH_TARGET}:${TARGET_PORT}"
  fi
}

# -----------------------------------------------------------------------------
# Command line shortcuts that do not touch the network.
# -----------------------------------------------------------------------------
case "${1:-}" in
  --install-home-launcher)
    ln -sfn "${SCRIPT_PATH}" "${HOME}/easy_dashboard_mac.sh"
    echo "Launcher installed: ${HOME}/easy_dashboard_mac.sh"
    echo "Run it from any directory with: ~/easy_dashboard_mac.sh"
    exit 0
    ;;
  --print-config)
    printf 'config_file=%s\njump=%s\ntarget=%s\ntarget_port=%s\nremote_project=%s\nremote_app_port=%s\nlocal_port_start=%s\nbrowser=%s\n' \
      "${CONFIG_FILE}" "${JUMP_USER:+${JUMP_USER}@}${JUMP_HOST:-none}" "${SSH_TARGET}" \
      "${TARGET_PORT}" "${REMOTE_PROJECT}" "${REMOTE_APP_PORT}" "${LOCAL_PORT_START}" \
      "${BROWSER_APP:-default}"
    exit 0
    ;;
  --stop)
    ssh "${SSH_OPTIONS[@]}" -O exit "${SSH_TARGET}" 2>/dev/null \
      && echo "Shared SSH connection closed." \
      || echo "No shared SSH connection was open."
    exit 0
    ;;
  -h|--help)
    sed -n '2,36p' "${SCRIPT_PATH}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  "") ;;
  *) fail "unknown option '$1' (try --help)" ;;
esac

# -----------------------------------------------------------------------------
# SSH helpers. Every command after open_master reuses the same connection.
# -----------------------------------------------------------------------------
master_alive() {
  ssh "${SSH_OPTIONS[@]}" -O check "${SSH_TARGET}" >/dev/null 2>&1
}

open_master() {
  local attempt
  for ((attempt = 1; attempt <= SSH_RETRIES; attempt++)); do
    # -f backgrounds ssh after authentication; ControlPersist keeps it alive.
    if ssh "${SSH_OPTIONS[@]}" -fN "${SSH_TARGET}"; then
      return 0
    fi
    if ((attempt < SSH_RETRIES)); then
      echo "    SSH connection failed; retrying in ${SSH_RETRY_DELAY}s (${attempt}/${SSH_RETRIES})..." >&2
      sleep "${SSH_RETRY_DELAY}"
    fi
  done
  return 1
}

remote() {
  ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" "$1"
}

remote_curl_ok() {
  remote "curl -fsS --connect-timeout 1 --max-time 2 http://127.0.0.1:${REMOTE_APP_PORT}$1 >/dev/null" 2>/dev/null
}

# A local port is usable when nothing listens on it, or when it already serves
# this dashboard (tunnel left over from a previous launch).
find_local_port() {
  local candidate
  for ((candidate = LOCAL_PORT_START; candidate < LOCAL_PORT_START + 50; candidate++)); do
    if ! lsof -nP -iTCP:"${candidate}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "${candidate}"
      return 0
    fi
    if curl -fsS --connect-timeout 1 --max-time 2 "http://127.0.0.1:${candidate}/health" >/dev/null 2>&1; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}

echo "EASY Dashboard - remote launcher"
echo "Raspberry: $(describe_route)"
echo

[[ -n "${JUMP_HOST}" || "${TARGET_HOST}" != "127.0.0.1" ]] \
  || fail "no Raspberry configured. Create ${CONFIG_FILE} (see scripts/easy_dashboard_mac.env.example)."

# -----------------------------------------------------------------------------
# 0. Connectivity and a single authenticated connection.
# -----------------------------------------------------------------------------
echo "0/4 Opening the SSH connection..."
if [[ -n "${JUMP_HOST}" ]]; then
  nc -z -G 6 "${JUMP_HOST}" "${JUMP_PORT}" >/dev/null 2>&1 \
    || fail "cannot reach the jump host ${JUMP_HOST}:${JUMP_PORT}. Check the network or VPN."
fi
mkdir -p "${CONTROL_DIR}" && chmod 700 "${CONTROL_DIR}"
if master_alive; then
  echo "    Reusing the existing SSH connection."
else
  if ! ssh-add -l >/dev/null 2>&1; then
    echo "    No SSH key is loaded in the agent: you may be asked for credentials once."
    echo "    Tip: ssh-add --apple-use-keychain ~/.ssh/<key> removes the prompt for good."
  fi
  open_master || fail "unable to open the SSH connection after ${SSH_RETRIES} attempts"
fi

# -----------------------------------------------------------------------------
# 1. Service on the Raspberry: start only when it is not already ready.
# -----------------------------------------------------------------------------
echo "1/4 Checking the service on the Raspberry..."
if remote_curl_ok /health/ready; then
  echo "    Service already running and ready; leaving it untouched (no restart, no interrupted mission)."
else
  echo "    Service not ready; installing the unit and restarting it..."
  remote "cd '${REMOTE_PROJECT}' && ./scripts/install_service.sh && sudo systemctl restart easy-dashboard.service" \
    || fail "unable to restart easy-dashboard.service (check EASY_REMOTE_PROJECT and sudo rights)"
fi

# -----------------------------------------------------------------------------
# 2. Wait for Flask. /health/ready means every sensor is up; /health alone
#    means the interface works but a sensor still needs attention.
# -----------------------------------------------------------------------------
echo "2/4 Waiting for dashboard readiness..."
remote_ready=0
remote_available=0
for ((attempt = 1; attempt <= STARTUP_TIMEOUT; attempt++)); do
  if remote_curl_ok /health/ready; then
    remote_ready=1
    echo "    Service ready after ${attempt}s."
    break
  fi
  if remote_curl_ok /health; then
    remote_available=1
    if ((attempt >= DEGRADED_START_DELAY)); then
      echo "    Dashboard available after ${attempt}s; sensor readiness still needs attention."
      break
    fi
  fi
  sleep 1
done

if [[ "${remote_ready}" -ne 1 && "${remote_available}" -ne 1 ]]; then
  remote "sudo systemctl status easy-dashboard.service --no-pager; journalctl -u easy-dashboard.service -n 40 --no-pager" || true
  fail "the dashboard did not respond within ${STARTUP_TIMEOUT}s"
fi

if [[ "${remote_ready}" -ne 1 ]]; then
  echo "    WARNING: the interface will open in degraded mode; check the sensor status in Live/System."
fi

# -----------------------------------------------------------------------------
# 3. Local port forward, added to the already open connection.
# -----------------------------------------------------------------------------
LOCAL_PORT="$(find_local_port)" || fail "no local port available between ${LOCAL_PORT_START} and $((LOCAL_PORT_START + 49))"
LOCAL_URL="http://127.0.0.1:${LOCAL_PORT}"

if curl -fsS --connect-timeout 1 --max-time 2 "${LOCAL_URL}/health" >/dev/null 2>&1; then
  echo "3/4 Tunnel already active on port ${LOCAL_PORT}."
else
  echo "3/4 Creating the tunnel on port ${LOCAL_PORT}..."
  ssh "${SSH_OPTIONS[@]}" -O forward -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_APP_PORT}" "${SSH_TARGET}" \
    || fail "unable to create the tunnel on local port ${LOCAL_PORT}"
fi

local_ready=0
for _ in {1..15}; do
  if curl -fsS --connect-timeout 1 --max-time 2 "${LOCAL_URL}/health" >/dev/null 2>&1; then
    local_ready=1
    break
  fi
  sleep 1
done
[[ "${local_ready}" -eq 1 ]] || fail "the tunnel is open, but ${LOCAL_URL}/health is not responding"

# -----------------------------------------------------------------------------
# 4. Open the browser only now that the endpoint is known to answer.
# -----------------------------------------------------------------------------
echo "4/4 Opening the browser..."
if [[ -n "${BROWSER_APP}" ]]; then
  open -a "${BROWSER_APP}" "${LOCAL_URL}"
else
  open "${LOCAL_URL}"
fi
echo
if [[ "${remote_ready}" -eq 1 ]]; then
  echo "Dashboard ready: ${LOCAL_URL}"
else
  echo "Dashboard available with sensor warnings: ${LOCAL_URL}"
fi
echo "The service stays managed by systemd on the Raspberry."
echo "Close the shared SSH connection with: $(basename "${SCRIPT_PATH}") --stop"
