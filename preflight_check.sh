#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${ROOT_DIR}/data"
REPORT_DIR="${DATA_DIR}/reports"
REPORT="${REPORT_DIR}/preflight_report.txt"

mkdir -p "${REPORT_DIR}"

run_block() {
  local title="$1"
  shift
  {
    printf '\n===== %s =====\n' "$title"
    if "$@" > /tmp/easy-preflight.out 2>&1; then
      cat /tmp/easy-preflight.out
    else
      printf 'COMMAND FAILED: %s\n' "$*"
      cat /tmp/easy-preflight.out
    fi
  } >> "${REPORT}"
}

ip_probe() {
  if command -v ip >/dev/null 2>&1 && ip -o -4 addr show scope global >/tmp/easy-ip.out 2>/tmp/easy-ip.err; then
    awk '{split($4, a, "/"); print a[1]}' /tmp/easy-ip.out | paste -sd ' ' -
    return 0
  fi
  if hostname -I >/tmp/easy-ip.out 2>/tmp/easy-ip.err; then
    cat /tmp/easy-ip.out
    return 0
  fi
  echo "LAN IP unavailable in this environment"
}

{
  printf 'EASY Preflight Report\n'
  printf 'Generated: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf 'Project: %s\n' "${ROOT_DIR}"
} > "${REPORT}"

run_block "Hostname" hostname
run_block "IP Address" ip_probe
run_block "Raspberry Model" bash -lc 'cat /proc/device-tree/model 2>/dev/null | tr -d "\0"'
run_block "OS Release" cat /etc/os-release
run_block "Python Version" python3 --version
run_block "CPU Temperature" bash -lc 'if [ -r /sys/class/thermal/thermal_zone0/temp ]; then awk "{printf \"%.1f C\n\", \$1/1000}" /sys/class/thermal/thermal_zone0/temp; fi'
run_block "RAM" free -h
run_block "Disk" df -h
run_block "Camera Tools" bash -lc 'command -v rpicam-hello || true; command -v libcamera-hello || true; command -v rpicam-vid || true; command -v libcamera-vid || true; command -v vcgencmd || true'
run_block "Camera List" timeout 4s bash -lc 'if command -v libcamera-hello >/dev/null 2>&1; then libcamera-hello --list-cameras; elif command -v rpicam-hello >/dev/null 2>&1; then rpicam-hello --list-cameras; else echo "No camera tool available"; fi'
run_block "USB" lsusb
# Do not probe every address on the camera control bus during startup. Some
# camera/multiplexer combinations can hold SCL low after an active scan.
run_block "I2C Adapters" bash -lc 'if command -v i2cdetect >/dev/null 2>&1; then i2cdetect -l; else echo "i2cdetect not available"; fi'
run_block "Video Devices" bash -lc 'ls /dev/video* 2>/dev/null || true'
run_block "Camera Status" vcgencmd get_camera
run_block "Kernel Camera Logs" bash -lc 'dmesg | grep -iE "camera|imx|ov|arducam|lepton|flir|unicam|csi|video|i2c|spi|error|failed" | tail -100'

echo "Report written to ${REPORT}"
