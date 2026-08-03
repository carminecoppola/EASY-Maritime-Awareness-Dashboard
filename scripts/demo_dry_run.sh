#!/usr/bin/env bash
set -euo pipefail

# End-to-end rehearsal of the exact flow a live demo would follow: healthcheck
# -> start a replay session -> run N inferences -> check focus assist ->
# stop the session -> confirm the dataset actually recorded something.
#
# Safe to repeat: it starts and stops its own session and does not touch
# camera/network configuration. Run it on the Pi itself, or point --url at
# it from the operator's laptop (e.g. over the demo hotspot).
#
# Usage:
#   ./scripts/demo_dry_run.sh
#   ./scripts/demo_dry_run.sh --url http://192.168.50.1:5000 --runs 20

BASE_URL="${EASY_DASHBOARD_URL:-http://127.0.0.1:5000}"
RUNS="${EASY_DEMO_DRY_RUN_RUNS:-10}"
TOKEN="${EASY_DASHBOARD_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) BASE_URL="$2"; shift 2 ;;
    --runs) RUNS="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

CURL_ARGS=(-fsS --max-time 15)
if [[ -n "${TOKEN}" ]]; then
  CURL_ARGS+=(-H "X-EASY-Token: ${TOKEN}")
fi

PASS=1
step() { echo; echo "== $1 =="; }
check() {
  if [[ "$2" == "1" ]]; then
    echo "  OK: $1"
  else
    echo "  FAIL: $1"
    PASS=0
  fi
}

step "1/6 Waiting for dashboard readiness"
ready=0
for _ in $(seq 1 30); do
  if curl "${CURL_ARGS[@]}" "${BASE_URL}/health/ready" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
check "dashboard reachable at ${BASE_URL}" "${ready}"
if [[ "${ready}" -ne 1 ]]; then
  echo "Aborting: dashboard never became ready." >&2
  exit 1
fi

step "2/6 Checking the replay source"
sources_json="$(curl "${CURL_ARGS[@]}" "${BASE_URL}/api/sources/status")"
replay_ok="$(echo "${sources_json}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
selected = data.get('selected_source') or {}
print(1 if selected.get('id') == 'replay' and selected.get('status') in ('ONLINE', 'STREAMING') else 0)
")"
check "replay source selected and online" "${replay_ok}"

step "3/6 Starting a replay session"
session_json="$(curl "${CURL_ARGS[@]}" -X POST -H 'Content-Type: application/json' -d '{"mode":"replay","operator":"demo-dry-run"}' "${BASE_URL}/api/session/start")"
session_ok="$(echo "${session_json}" | python3 -c "import json,sys; print(1 if json.load(sys.stdin).get('ok') else 0)")"
session_id="$(echo "${session_json}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('session') or {}).get('session_id') or '')")"
check "session started (${session_id:-unknown})" "${session_ok}"

step "4/6 Running ${RUNS} inference request(s)"
inference_ok_count=0
for i in $(seq 1 "${RUNS}"); do
  result="$(curl "${CURL_ARGS[@]}" -X POST "${BASE_URL}/api/inference/run-on-next-frame" || echo '{"ok":false}')"
  ok="$(echo "${result}" | python3 -c "import json,sys; print(1 if json.load(sys.stdin).get('ok') else 0)" 2>/dev/null || echo 0)"
  if [[ "${ok}" == "1" ]]; then
    inference_ok_count=$((inference_ok_count + 1))
  fi
  printf "  run %02d/%s: %s\n" "${i}" "${RUNS}" "$([ "${ok}" == "1" ] && echo ok || echo FAILED)"
  sleep 0.3
done
check "inference requests succeeded (${inference_ok_count}/${RUNS})" "$([ "${inference_ok_count}" -gt 0 ] && echo 1 || echo 0)"

step "5/6 Checking focus assist"
for side_path in "rgb_left" "rgb_right"; do
  focus_json="$(curl "${CURL_ARGS[@]}" "${BASE_URL}/api/focus/${side_path}" || echo '{"ok":false}')"
  focus_ok="$(echo "${focus_json}" | python3 -c "import json,sys; print(1 if json.load(sys.stdin).get('ok') else 0)" 2>/dev/null || echo 0)"
  score="$(echo "${focus_json}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('score'))" 2>/dev/null || echo '?')"
  echo "  ${side_path}: ok=${focus_ok} score=${score}"
done

step "6/6 Stopping the session and checking the dataset recorded it"
curl "${CURL_ARGS[@]}" -X POST "${BASE_URL}/api/session/stop" >/dev/null
if [[ -n "${session_id}" ]]; then
  manifest_json="$(curl "${CURL_ARGS[@]}" "${BASE_URL}/api/session/manifest?session_id=${session_id}")"
  items="$(echo "${manifest_json}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
manifest = data.get('manifest') or {}
print(manifest.get('counts', {}).get('items', 0))
" 2>/dev/null || echo 0)"
  check "session manifest recorded items (count=${items})" "$([ "${items}" -gt 0 ] && echo 1 || echo 0)"
else
  check "session manifest recorded items" "0"
fi

echo
if [[ "${PASS}" -eq 1 ]]; then
  echo "DEMO DRY RUN: PASS"
else
  echo "DEMO DRY RUN: FAIL -- see FAIL lines above" >&2
  exit 1
fi
