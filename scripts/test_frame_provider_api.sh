#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8765}"
TEST_DIR="${ROOT_DIR}/runtime/replay/test_inference"

if [[ ! -d "${TEST_DIR}" ]]; then
  echo "ERROR: missing replay folder ${TEST_DIR}" >&2
  exit 1
fi

sample_count=$(find "${TEST_DIR}" -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' \) | wc -l | tr -d ' ')
if [[ "${sample_count}" -eq 0 ]]; then
  echo "ERROR: no valid images found in ${TEST_DIR}" >&2
  exit 1
fi

echo "== Frame Provider Status =="
curl -s "${BASE_URL}/api/frame-provider/status"
echo

echo "== Configure Replay Folder =="
curl -s -X POST "${BASE_URL}/api/frame-provider/configure" \
  -H "Content-Type: application/json" \
  -d '{"source_type":"REPLAY_FOLDER","source_path":"runtime/replay/test_inference","loop":true,"save_temp_frames":false}'
echo

echo "== Next Frame =="
curl -s -X POST "${BASE_URL}/api/frame-provider/next-frame"
echo

echo "== Run Inference On Next Frame =="
curl -s -X POST "${BASE_URL}/api/inference/run-on-next-frame"
echo

echo "== Detection Current =="
curl -s "${BASE_URL}/api/detection/current"
echo

echo "== Event Current =="
curl -s "${BASE_URL}/api/events/current"
echo

echo "== Session Status =="
curl -s "${BASE_URL}/api/session/status"
echo
