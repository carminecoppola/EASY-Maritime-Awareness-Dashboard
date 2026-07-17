#!/usr/bin/env python3
from __future__ import annotations

"""Short, temperature-aware validation of the real Raspberry camera runtime."""

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate EASY hardware through its public HTTP API.")
    parser.add_argument("--url", default="http://127.0.0.1:5000", help="Dashboard base URL")
    parser.add_argument("--timeout", type=float, default=12.0, help="HTTP and RGB recovery timeout")
    parser.add_argument("--start-temperature-limit", type=float, default=70.0)
    parser.add_argument("--stop-temperature-limit", type=float, default=78.0)
    parser.add_argument("--skip-thermal", action="store_true", help="Do not trigger the on-demand thermal capture")
    return parser.parse_args()


def request_json(base_url: str, path: str, *, timeout: float) -> dict[str, Any]:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise RuntimeError(f"{path} did not return a JSON object")
    return payload


def request_bytes(base_url: str, path: str, *, timeout: float) -> tuple[bytes, str]:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        content_type = str(response.headers.get("Content-Type") or "")
        return response.read(), content_type


def cpu_temperature() -> float | None:
    try:
        completed = subprocess.run(
            ["vcgencmd", "measure_temp"],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    match = re.search(r"(-?\d+(?:\.\d+)?)", completed.stdout)
    return float(match.group(1)) if match else None


def validate_rgb_payload(payload: dict[str, Any], *, minimum_fps: float = 1.0) -> dict[str, Any]:
    measurements: dict[str, Any] = {}
    for feed in ("rgb_left", "rgb_right"):
        state = (payload.get(feed) or {}).get("state") or {}
        runtime_state = state.get("runtime_state") or {}
        measurement = {
            "detected": bool(state.get("detected")),
            "has_frame": bool(state.get("has_frame")),
            "process_running": bool(state.get("process_running")),
            "fps": float(state.get("fps") or 0.0),
            "availability": runtime_state.get("availability"),
        }
        measurements[feed] = measurement
        if not measurement["detected"] or not measurement["has_frame"] or not measurement["process_running"]:
            raise RuntimeError(f"{feed} is not delivering frames: {measurement}")
        if measurement["fps"] < minimum_fps:
            raise RuntimeError(f"{feed} FPS below {minimum_fps}: {measurement['fps']}")
    return measurements


def wait_for_rgb(base_url: str, *, timeout: float) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    last_error = "RGB status unavailable"
    while time.monotonic() < deadline:
        try:
            payload = request_json(base_url, "/api/stream-state", timeout=min(3.0, timeout))
            return validate_rgb_payload(payload)
        except Exception as exc:
            last_error = str(exc)
            time.sleep(0.5)
    raise RuntimeError(f"RGB did not recover within {timeout:.1f}s: {last_error}")


def enforce_temperature(limit: float, stage: str) -> float | None:
    measured = cpu_temperature()
    if measured is not None and measured >= limit:
        raise RuntimeError(f"CPU temperature {measured:.1f} C at {stage}; limit is {limit:.1f} C")
    return measured


def run_validation(args: argparse.Namespace) -> dict[str, Any]:
    report: dict[str, Any] = {
        "ok": False,
        "url": args.url,
        "thermal_tested": not args.skip_thermal,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    report["temperature_before_c"] = enforce_temperature(args.start_temperature_limit, "validation start")

    health = request_json(args.url, "/health", timeout=args.timeout)
    report["health_ok"] = bool(health.get("ok"))
    report["runtime_state"] = health.get("runtime_state") or {}
    if not report["health_ok"]:
        raise RuntimeError("/health reports ok=false")

    report["rgb_before"] = wait_for_rgb(args.url, timeout=args.timeout)
    if not args.skip_thermal:
        thermal_before = request_json(args.url, "/thermal/status", timeout=args.timeout)
        thermal_runtime = thermal_before.get("runtime_state") or {}
        if not thermal_before.get("detected"):
            raise RuntimeError(f"PureThermal not detected: {thermal_before.get('error') or thermal_before.get('status')}")
        if thermal_runtime.get("availability") not in {"READY", "STREAMING"}:
            raise RuntimeError(f"PureThermal is not ready: {thermal_runtime}")

        frame_seq_before = int(thermal_before.get("frame_seq") or 0)
        frame, content_type = request_bytes(args.url, "/thermal/frame", timeout=args.timeout)
        if "image/jpeg" not in content_type.lower() or not frame.startswith(b"\xff\xd8"):
            raise RuntimeError(f"/thermal/frame did not return JPEG data ({content_type}, {len(frame)} bytes)")
        thermal_after = request_json(args.url, "/thermal/status", timeout=args.timeout)
        frame_seq_after = int(thermal_after.get("frame_seq") or 0)
        if frame_seq_after <= frame_seq_before:
            raise RuntimeError(f"thermal frame_seq did not increase: {frame_seq_before} -> {frame_seq_after}")
        report["thermal"] = {
            "device": thermal_after.get("device"),
            "status": thermal_after.get("status"),
            "availability": (thermal_after.get("runtime_state") or {}).get("availability"),
            "frame_seq_before": frame_seq_before,
            "frame_seq_after": frame_seq_after,
            "jpeg_bytes": len(frame),
        }
        report["rgb_after_thermal"] = wait_for_rgb(args.url, timeout=args.timeout)

    report["temperature_after_c"] = enforce_temperature(args.stop_temperature_limit, "validation end")
    report["ok"] = True
    report["completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return report


def main() -> int:
    args = parse_args()
    try:
        report = run_validation(args)
    except Exception as exc:
        report = {"ok": False, "error": str(exc), "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        print(json.dumps(report, indent=2, sort_keys=True), file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
