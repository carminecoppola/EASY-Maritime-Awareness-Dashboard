#!/usr/bin/env python3
# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Exercise the continuous ThermalState worker on the real sensor.

Runs the persistent thermal worker for ``--duration`` seconds while reading the
live RGB streams of the running dashboard, so it shows whether thermal capture
disturbs RGB. It can inject an FFmpeg failure to verify recovery, and reports
frame counts, restarts, throttling flags and CPU temperature. It does not
change the installed service.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

from easy_dashboard.thermal_hardware import ThermalState
from easy_dashboard.utils import read_cpu_temperature


def main() -> int:
    """Run the validation and print the report."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, default=20.0)
    parser.add_argument("--fps", type=int, default=9)
    parser.add_argument("--device", default="/dev/video0")
    parser.add_argument("--rgb-base-url", default="http://127.0.0.1:5000")
    parser.add_argument("--progress-file")
    parser.add_argument("--inject-ffmpeg-failure-at", type=float)
    args = parser.parse_args()

    config = {
        "thermal": {
            "enabled": True,
            "mode": "real",
            "capture_mode": "continuous",
            "stream_fps": args.fps,
            "preview_fps": min(5, args.fps),
            "device": args.device,
            "input_format": "y16",
            "video_size": "160x120",
            "threshold_celsius": 35.0,
            "delta_threshold": 8.0,
        }
    }
    thermal = ThermalState(config, events=None)  # type: ignore[arg-type]
    thermal.detected = True
    thermal.device = args.device
    started = time.monotonic()
    start_temperature = read_cpu_temperature()
    thermal.start()
    stop_readers = threading.Event()
    rgb_counts = {"rgb_left": 0, "rgb_right": 0}
    rgb_errors: dict[str, str] = {}

    def read_rgb(feed: str) -> None:
        """Count the MJPEG frames received from one live RGB stream, recording any error."""
        marker = b"--frame"
        remainder = b""
        try:
            with urllib.request.urlopen(f"{args.rgb_base_url}/video/{feed}", timeout=10) as response:
                while not stop_readers.is_set():
                    chunk = response.read(64 * 1024)
                    if not chunk:
                        break
                    combined = remainder + chunk
                    rgb_counts[feed] += combined.count(marker)
                    remainder = combined[-(len(marker) - 1):]
        except Exception as exc:
            if not stop_readers.is_set():
                rgb_errors[feed] = str(exc)

    readers = [threading.Thread(target=read_rgb, args=(feed,), daemon=True) for feed in rgb_counts]
    for reader in readers:
        reader.start()

    def throttled_value() -> str | None:
        """Raw ``vcgencmd get_throttled`` output, or None."""
        try:
            return subprocess.run(
                ["vcgencmd", "get_throttled"], capture_output=True, text=True, timeout=2, check=False
            ).stdout.strip() or None
        except Exception:
            return None

    def write_progress(payload: dict) -> None:
        """Atomically write the progress JSON (only with ``--progress-file``)."""
        if not args.progress_file:
            return
        path = Path(args.progress_file)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(temporary, path)

    temperatures: list[float] = []
    injected = False
    samples = []
    try:
        while time.monotonic() - started < args.duration:
            time.sleep(1.0)
            elapsed_now = time.monotonic() - started
            if args.inject_ffmpeg_failure_at is not None and not injected and elapsed_now >= args.inject_ffmpeg_failure_at:
                process = thermal._stream_process
                if process is not None and process.poll() is None:
                    process.terminate()
                    injected = True
            status = thermal.status_payload(refresh=False)
            samples.append(status)
            temperature = read_cpu_temperature()
            if temperature is not None:
                temperatures.append(temperature)
            write_progress({
                "running": True,
                "elapsed_seconds": round(elapsed_now, 1),
                "duration_seconds": args.duration,
                "thermal_frame_seq": status.get("frame_seq"),
                "thermal_actual_fps": status.get("actual_fps"),
                "thermal_invalid_frames": status.get("invalid_frames"),
                "thermal_stream_restarts": status.get("stream_restarts"),
                "rgb_frames": dict(rgb_counts),
                "rgb_errors": dict(rgb_errors),
                "temperature_c": temperature,
                "max_temperature_c": max(temperatures) if temperatures else None,
                "throttled": throttled_value(),
            })
    finally:
        stop_readers.set()
        thermal.stop()
        for reader in readers:
            reader.join(timeout=2.0)
    elapsed = time.monotonic() - started
    final = samples[-1] if samples else thermal.status_payload(refresh=False)
    result = {
        "ok": final.get("frame_seq", 0) > 0 and final.get("invalid_frames", 0) == 0,
        "elapsed_seconds": round(elapsed, 3),
        "start_temperature_c": start_temperature,
        "end_temperature_c": read_cpu_temperature(),
        "max_temperature_c": max(temperatures) if temperatures else None,
        "throttled": throttled_value(),
        "frame_seq": final.get("frame_seq"),
        "actual_fps": final.get("actual_fps"),
        "invalid_frames": final.get("invalid_frames"),
        "stream_attempts": final.get("stream_attempts"),
        "stream_restarts": final.get("stream_restarts"),
        "stream_failures": final.get("stream_failures"),
        "raw_ring_size": final.get("raw_ring_size"),
        "status": final.get("status"),
        "error": final.get("error"),
        "rgb_frames": rgb_counts,
        "rgb_errors": rgb_errors,
        "fault_injected": injected,
    }
    result["ok"] = bool(
        result["ok"]
        and not rgb_errors
        and all(count > 0 for count in rgb_counts.values())
        and (result["max_temperature_c"] is None or result["max_temperature_c"] < 78.0)
    )
    write_progress({"running": False, **result})
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
