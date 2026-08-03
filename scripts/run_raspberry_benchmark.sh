#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${PROJECT_ROOT}"

PYTHON_BIN="${EASY_PYTHON_BIN:-${PROJECT_ROOT}/.venv/bin/python}"
if [[ ! -x "${PYTHON_BIN}" ]]; then
  PYTHON_BIN="python3"
fi

START_LIMIT="${EASY_BENCHMARK_START_TEMP:-70}"
STOP_LIMIT="${EASY_BENCHMARK_STOP_TEMP:-78}"
DURATION="${EASY_BENCHMARK_DURATION:-300}"
INTERVAL="${EASY_BENCHMARK_INTERVAL:-2}"
STARTUP_RUNS="${EASY_BENCHMARK_STARTUP_RUNS:-3}"
API_RUNS="${EASY_BENCHMARK_API_RUNS:-30}"
INFERENCE_RUNS="${EASY_BENCHMARK_INFERENCE_RUNS:-10}"
THERMAL_STRESS_SECONDS="${EASY_BENCHMARK_THERMAL_STRESS_SECONDS:-0}"

temperature="$(vcgencmd measure_temp 2>/dev/null | sed -E "s/[^0-9.]+//g")"
if [[ -z "${temperature}" ]]; then
  echo "Unable to read Raspberry Pi CPU temperature." >&2
  exit 1
fi

awk -v measured="${temperature}" -v limit="${START_LIMIT}" 'BEGIN { exit !(measured < limit) }' || {
  echo "CPU temperature is ${temperature} C; benchmark requires less than ${START_LIMIT} C." >&2
  exit 1
}

echo "EASY Raspberry Pi runtime benchmark"
echo "Initial temperature: ${temperature} C"
echo "Steady-state duration: ${DURATION}s"
echo "Startup runs: ${STARTUP_RUNS}; API runs: ${API_RUNS}; inference runs: ${INFERENCE_RUNS}"
if [[ "${THERMAL_STRESS_SECONDS}" != "0" ]]; then
  echo "Thermal stress phase: ${THERMAL_STRESS_SECONDS}s of synthetic CPU load after steady-state sampling"
fi
echo
echo "The benchmark will restart easy-dashboard.service. Refreshing sudo credentials..."
sudo -v

exec "${PYTHON_BIN}" scripts/benchmark_raspberry_runtime.py \
  --duration "${DURATION}" \
  --interval "${INTERVAL}" \
  --startup-runs "${STARTUP_RUNS}" \
  --api-runs "${API_RUNS}" \
  --inference-runs "${INFERENCE_RUNS}" \
  --thermal-stress-seconds "${THERMAL_STRESS_SECONDS}" \
  --stop-temperature-limit "${STOP_LIMIT}"
