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

SSH_TARGET="${TARGET_USER}@${TARGET_HOST}"
SSH_OPTIONS=(
  -J "${JUMP_USER}@${JUMP_HOST}"
  -p "${TARGET_PORT}"
  -o ConnectTimeout=12
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)

if [[ "${1:-}" == "--print-config" ]]; then
  printf 'jump=%s@%s\ntarget=%s\ntarget_port=%s\nremote_project=%s\nremote_app_port=%s\nlocal_port_start=%s\n' \
    "${JUMP_USER}" "${JUMP_HOST}" "${SSH_TARGET}" "${TARGET_PORT}" \
    "${REMOTE_PROJECT}" "${REMOTE_APP_PORT}" "${LOCAL_PORT_START}"
  exit 0
fi

fail() {
  echo "ERRORE: $*" >&2
  exit 1
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

echo "EASY Dashboard · avvio remoto"
echo "Raspberry: ${SSH_TARGET} via ${JUMP_HOST}"
echo

echo "1/4 Riavvio il servizio sulla Raspberry..."
ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" \
  "cd '${REMOTE_PROJECT}' && sudo install -m 644 services/easy-dashboard.service /etc/systemd/system/easy-dashboard.service && sudo systemctl daemon-reload && sudo systemctl enable easy-dashboard.service >/dev/null && sudo systemctl restart easy-dashboard.service" \
  || fail "impossibile riavviare easy-dashboard.service via SSH"

echo "2/4 Attendo che la dashboard sia pronta..."
remote_ready=0
for ((attempt = 1; attempt <= STARTUP_TIMEOUT; attempt++)); do
  if ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" \
    "curl -fsS --connect-timeout 1 --max-time 2 http://127.0.0.1:${REMOTE_APP_PORT}/health/ready >/dev/null" \
    2>/dev/null; then
    remote_ready=1
    echo "    Servizio pronto dopo ${attempt}s."
    break
  fi
  sleep 1
done

if [[ "${remote_ready}" -ne 1 ]]; then
  ssh "${SSH_OPTIONS[@]}" "${SSH_TARGET}" \
    "sudo systemctl status easy-dashboard.service --no-pager; journalctl -u easy-dashboard.service -n 40 --no-pager" \
    || true
  fail "il servizio non ha risposto entro ${STARTUP_TIMEOUT}s"
fi

LOCAL_PORT="$(find_local_port)" || fail "nessuna porta locale libera tra ${LOCAL_PORT_START} e $((LOCAL_PORT_START + 49))"
LOCAL_URL="http://127.0.0.1:${LOCAL_PORT}"

if curl -fsS --connect-timeout 1 --max-time 2 "${LOCAL_URL}/health/ready" >/dev/null 2>&1; then
  echo "3/4 Tunnel già attivo sulla porta ${LOCAL_PORT}."
else
  echo "3/4 Creo il tunnel SSH sulla porta ${LOCAL_PORT}..."
  ssh -fNT "${SSH_OPTIONS[@]}" \
    -o ExitOnForwardFailure=yes \
    -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_APP_PORT}" \
    "${SSH_TARGET}" \
    || fail "impossibile creare il tunnel SSH"
fi

local_ready=0
for _ in {1..15}; do
  if curl -fsS --connect-timeout 1 --max-time 2 "${LOCAL_URL}/health/ready" >/dev/null 2>&1; then
    local_ready=1
    break
  fi
  sleep 1
done
[[ "${local_ready}" -eq 1 ]] || fail "tunnel creato, ma ${LOCAL_URL}/health/ready non risponde"

echo "4/4 Apro Safari..."
open -a Safari "${LOCAL_URL}"
echo
echo "Dashboard pronta: ${LOCAL_URL}"
echo "Il servizio resta gestito da systemd sulla Raspberry."
