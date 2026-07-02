#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:5000}"
IMAGE_PATH="${2:-runtime/replay/test_inference/001_seaships__001253.jpg}"

echo "[1/5] GET /api/inference/status"
curl -fsS "${BASE_URL}/api/inference/status" | python3 -m json.tool

echo "[2/5] POST /api/inference/start"
curl -fsS -X POST "${BASE_URL}/api/inference/start" \
  -H "Content-Type: application/json" \
  -d '{"mode":"replay","interval_seconds":1.5}' | python3 -m json.tool

echo "[3/5] POST /api/inference/run-on-image"
curl -fsS -X POST "${BASE_URL}/api/inference/run-on-image" \
  -H "Content-Type: application/json" \
  -d "{\"image_path\":\"${IMAGE_PATH}\"}" | python3 -m json.tool

echo "[4/5] GET /api/detections/current"
curl -fsS "${BASE_URL}/api/detections/current" | python3 -m json.tool

echo "[5/5] POST /api/inference/stop"
curl -fsS -X POST "${BASE_URL}/api/inference/stop" | python3 -m json.tool

