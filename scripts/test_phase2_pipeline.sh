#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8765}"
TEST_DIR="${ROOT_DIR}/runtime/replay/test_inference"
MAX_FRAMES="${MAX_FRAMES:-12}"
export BASE_URL MAX_FRAMES

if [[ ! -d "${TEST_DIR}" ]]; then
  echo "ERROR: missing replay folder ${TEST_DIR}" >&2
  exit 1
fi

sample_count=$(find "${TEST_DIR}" -maxdepth 1 -type f \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' \) | wc -l | tr -d ' ')
if [[ "${sample_count}" -eq 0 ]]; then
  echo "ERROR: no valid images found in ${TEST_DIR}" >&2
  exit 1
fi

echo "== Phase 2 Pipeline Validation =="
echo "Replay folder: ${TEST_DIR}"
echo "Samples found: ${sample_count}"

python3 - <<'PY'
import json
import os
import sys
import urllib.request

base = os.environ.get("BASE_URL", "http://127.0.0.1:8765")
max_frames = int(os.environ.get("MAX_FRAMES", "12"))


def request_json(path, method="GET", payload=None):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def print_json(title, payload):
    print(f"== {title} ==")
    print(json.dumps(payload, indent=2))


status = request_json("/api/frame-provider/status")
print_json("Frame Provider Status", status)

configured = request_json(
    "/api/frame-provider/configure",
    method="POST",
    payload={
        "source_type": "REPLAY_FOLDER",
        "source_path": "runtime/replay/test_inference",
        "loop": True,
        "save_temp_frames": False,
    },
)
print_json("Configure Replay Folder", configured)

try:
    stopped = request_json("/api/session/stop", method="POST")
    print_json("Stop Previous Session", stopped)
except Exception:
    pass

started = request_json(
    "/api/session/start",
    method="POST",
    payload={"mode": "replay_folder", "operator": "phase2-validation"},
)
print_json("Start Validation Session", started)

cleared_detections = request_json("/api/detection/clear", method="POST")
print_json("Clear Current Detections", cleared_detections)

cleared_events = request_json("/api/events/clear", method="POST")
print_json("Clear Current Events", cleared_events)

reset = request_json("/api/frame-provider/reset", method="POST")
print_json("Reset Provider", reset)

first_frame = request_json("/api/frame-provider/next-frame", method="POST")
print_json("Next Frame", first_frame)

reset = request_json("/api/frame-provider/reset", method="POST")

result = None
for frame_index in range(1, max_frames + 1):
    candidate = request_json("/api/inference/run-on-next-frame", method="POST")
    print(f"Frame {frame_index}: {candidate.get('image_path', '')} -> detections={candidate.get('count')}")
    if candidate.get("count", 0) > 0:
        result = candidate
        break

if result is None:
    print(f"ERROR: no detections produced after {max_frames} frames from runtime/replay/test_inference", file=sys.stderr)
    sys.exit(1)

print_json("Run Inference On Next Frame", result)

detections = request_json("/api/detection/current")
events = request_json("/api/events/current")
session = request_json("/api/session/status")

print_json("Current Detections", detections)
print_json("Current Events", events)
print_json("Session Status", session)

if detections.get("count", 0) <= 0:
    print("ERROR: detection manager did not persist detections", file=sys.stderr)
    sys.exit(1)
if events.get("count", 0) <= 0:
    print("ERROR: event engine did not persist current events", file=sys.stderr)
    sys.exit(1)
current = session.get("current") or {}
metrics = current.get("metrics") or {}
if metrics.get("inference_calls", 0) <= 0:
    print("ERROR: session metrics did not register inference calls", file=sys.stderr)
    sys.exit(1)

print("VALIDATION_OK")
PY
