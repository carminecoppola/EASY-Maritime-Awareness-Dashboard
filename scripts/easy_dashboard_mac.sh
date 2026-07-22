#!/usr/bin/env bash
set -euo pipefail

# Single Mac entry point for a dashboard running remotely on the Raspberry.
# It restarts systemd remotely, waits for Flask, creates the SSH tunnel and
# opens Safari only after the local endpoint is actually reachable.

JUMP_USER="${EASY_JUMP_USER:-ccoppola}"
JUMP_HOST="${EASY_JUMP_HOST:-193.205.230.76}"
TARGET_USER="${EASY_TARGET_USER:-pi}"
TARGET_HOST="${EASY_TARGET_HOST:-127.0.0.1}"
TARGET_PORT="${EASY_TARGET_PORT:-44222}"
REMOTE_APP_PORT="${EASY_REMOTE_APP_PORT:-5000}"
REMOTE_PROJECT="${EASY_REMOTE_PROJECT:-/home/pi/Desktop/carmine/easy-dashboard}"
LOCAL_PORT_START="${EASY_LOCAL_PORT:-5500}"
STARTUP_TIMEOUT="${EASY_STARTUP_TIMEOUT_SECONDS:-45}"
SSH_RETRIES="${EASY_SSH_RETRIES:-3}"
SSH_RETRY_DELAY="${EASY_SSH_RETRY_DELAY_SECONDS:-3}"
SCRIPT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/$(basename -- "${BASH_SOURCE[0]}")"

SSH_TARGET="${TARGET_USER}@${TARGET_HOST}"
SSH_OPTIONS=(
  -J "${JUMP_USER}@${JUMP_HOST}"
  -p "${TARGET_PORT}"
  -o ConnectTimeout=12
  -o ConnectionAttempts=2
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)

if [[ "${1:-}" == "--install-home-launcher" ]]; then
  ln -sfn "${SCRIPT_PATH}" "${HOME}/easy_dashboard_mac.sh"
  echo "Launcher installed: ${HOME}/easy_dashboard_mac.sh"
  echo "You can now run it from any directory with: ~/easy_dashboard_mac.sh"
  exit 0
fi

if [[ "${1:-}" == "--print-config" ]]; then
  printf 'jump=%s@%s\ntarget=%s\ntarget_port=%s\nremote_project=%s\nremote_app_port=%s\nlocal_port_start=%s\n' \
    "${JUMP_USER}" "${JUMP_HOST}" "${SSH_TARGET}" "${TARGET_PORT}" \
    "${REMOTE_PROJECT}" "${REMOTE_APP_PORT}" "${LOCAL_PORT_START}"
  exit 0
fi

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

run_remote_with_retry() {
  local command="$1"
  local attempt
  for ((attempt = 1; attempt <= SSH_RETRIES; attempt++)); do
    if ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" "${command}"; then
      return 0
    fi
    if ((attempt < SSH_RETRIES)); then
      echo "    SSH connection interrupted; retrying in ${SSH_RETRY_DELAY}s (${attempt}/${SSH_RETRIES})..." >&2
      sleep "${SSH_RETRY_DELAY}"
    fi
  done
  return 1
}

create_tunnel_with_retry() {
  local local_port="$1"
  local attempt
  for ((attempt = 1; attempt <= SSH_RETRIES; attempt++)); do
    if ssh -fNT "${SSH_OPTIONS[@]}" \
      -o ExitOnForwardFailure=yes \
      -L "${local_port}:127.0.0.1:${REMOTE_APP_PORT}" \
      "${SSH_TARGET}"; then
      return 0
    fi
    if ((attempt < SSH_RETRIES)); then
      echo "    Tunnel connection interrupted; retrying in ${SSH_RETRY_DELAY}s (${attempt}/${SSH_RETRIES})..." >&2
      sleep "${SSH_RETRY_DELAY}"
    fi
  done
  return 1
}

find_local_port() {
  local candidate
  for ((candidate = LOCAL_PORT_START; candidate < LOCAL_PORT_START + 50; candidate++)); do
    if ! lsof -nP -iTCP:"${candidate}" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "${candidate}"
      return 0
    fi
    if curl -fsS --connect-timeout 1 --max-time 2 "http://127.0.0.1:${candidate}/health/ready" >/dev/null 2>&1; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}

echo "EASY Dashboard · remote launcher"
echo "Raspberry: ${SSH_TARGET} via ${JUMP_HOST}"
echo

echo "1/4 Restarting the service on the Raspberry..."
run_remote_with_retry \
  "cd '${REMOTE_PROJECT}' && sudo install -m 644 services/easy-dashboard.service /etc/systemd/system/easy-dashboard.service && sudo systemctl daemon-reload && sudo systemctl enable easy-dashboard.service >/dev/null && sudo systemctl restart easy-dashboard.service" \
  || fail "unable to restart easy-dashboard.service after ${SSH_RETRIES} SSH attempts"

echo "2/4 Waiting for dashboard readiness..."
remote_ready=0
for ((attempt = 1; attempt <= STARTUP_TIMEOUT; attempt++)); do
  if ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" \
    "curl -fsS --connect-timeout 1 --max-time 2 http://127.0.0.1:${REMOTE_APP_PORT}/health/ready >/dev/null" \
    2>/dev/null; then
    remote_ready=1
    echo "    Service ready after ${attempt}s."
    break
  fi
  sleep 1
done

if [[ "${remote_ready}" -ne 1 ]]; then
  ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" \
    "sudo systemctl status easy-dashboard.service --no-pager; journalctl -u easy-dashboard.service -n 40 --no-pager" \
    || true
  fail "the service did not respond within ${STARTUP_TIMEOUT}s"
fi

LOCAL_PORT="$(find_local_port)" || fail "no local port available between ${LOCAL_PORT_START} and $((LOCAL_PORT_START + 49))"
LOCAL_URL="http://127.0.0.1:${LOCAL_PORT}"

if curl -fsS --connect-timeout 1 --max-time 2 "${LOCAL_URL}/health/ready" >/dev/null 2>&1; then
  echo "3/4 Tunnel already active on port ${LOCAL_PORT}."
else
  echo "3/4 Creating the SSH tunnel on port ${LOCAL_PORT}..."
  create_tunnel_with_retry "${LOCAL_PORT}" \
    || fail "unable to create the SSH tunnel after ${SSH_RETRIES} attempts"
fi

local_ready=0
for _ in {1..15}; do
  if curl -fsS --connect-timeout 1 --max-time 2 "${LOCAL_URL}/health/ready" >/dev/null 2>&1; then
    local_ready=1
    break
  fi
  sleep 1
done
[[ "${local_ready}" -eq 1 ]] || fail "the tunnel is open, but ${LOCAL_URL}/health/ready is not responding"

echo "4/4 Opening Safari..."
open -a Safari "${LOCAL_URL}"
echo
echo "Dashboard ready: ${LOCAL_URL}"
echo "The service remains managed by systemd on the Raspberry."
