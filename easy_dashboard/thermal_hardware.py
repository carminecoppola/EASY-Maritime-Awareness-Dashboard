# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Thermal camera runtime: PureThermal (FLIR Lepton) capture and preview rendering.

``ThermalState`` owns everything about the thermal sensor:

    discovery   find the PureThermal V4L2 node by name (``thermal_discovery.py``)
    capture     FFmpeg reads raw 16-bit (Y16) frames from the node
    rendering   each raw frame becomes a colour-mapped JPEG preview with a hotspot
                box and a statistics banner
    status      a state contract (STREAMING, READY, ...) for the API

Capture modes (``thermal.capture_mode`` in ``config.yaml``):

    continuous  a persistent FFmpeg process feeds a worker thread (default; it
                passed the 30-minute recovery test and the two-hour RGB+thermal
                endurance run);
    on_demand   one bounded single-frame FFmpeg transaction per request, so the
                device is released between frames.

There is also a ``mock`` mode that simulates a 16x12 heat map, which keeps the
dashboard usable on a machine with no sensor.

Safety: capture pauses (COOLDOWN) while the CPU is at or above 78 C, and a
failing stream is retried with exponential back-off. Raw values are
uncalibrated sensor counts, not temperatures: hotspot detection is relative to
the scene (percentiles of the frame).
"""

from __future__ import annotations

import io
import logging
import os
import select
import shutil
import subprocess
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import numpy as np
from PIL import Image, ImageDraw

from .media import RESAMPLE_NEAREST, draw_rounded_box, make_placeholder_jpeg
from .runtime_status import build_thermal_state_contract
from .stores import EventStore
from .thermal_discovery import PureThermalDiscovery
from .utils import read_cpu_temperature, which


LOGGER = logging.getLogger("easy-dashboard")


class ThermalState:
    """Owns thermal capture and produces dashboard-ready preview frames."""

    def __init__(self, config: Dict[str, Any], events: EventStore) -> None:
        """Read the thermal settings (environment variables ``EASY_THERMAL_*`` override ``config.yaml``) and prepare the state."""
        self.config = config
        self.events = events
        self.mode = str(config["thermal"].get("mode", "mock")).lower()
        self.capture_mode = str(config["thermal"].get("capture_mode", "continuous")).lower()
        if self.capture_mode not in {"on_demand", "continuous"}:
            self.capture_mode = "on_demand"
        self.stream_fps = max(1, min(30, int(config["thermal"].get("stream_fps", 9))))
        self.preview_fps = max(1, min(self.stream_fps, int(config["thermal"].get("preview_fps", 5))))
        self.enabled = bool(config["thermal"].get("enabled", True))
        self.configured_device = str(os.environ.get("EASY_THERMAL_DEVICE") or config["thermal"].get("device", "auto"))
        self.device = self.configured_device
        self.input_format = str(os.environ.get("EASY_THERMAL_INPUT_FORMAT") or config["thermal"].get("input_format", "y16")).lower()
        self.video_size = str(os.environ.get("EASY_THERMAL_VIDEO_SIZE") or config["thermal"].get("video_size", "160x120"))
        self._discovery = PureThermalDiscovery(self.video_size)
        self.threshold_celsius = float(config["thermal"].get("threshold_celsius", 35.0))
        self.delta_threshold = float(config["thermal"].get("delta_threshold", 8.0))
        self.detected = False
        self.discovery_method = "not_checked"
        self.device_candidates: list[Dict[str, Any]] = []
        self.last_stats: Dict[str, Any] = {}
        self.last_frame_bytes: Optional[bytes] = None
        self.last_frame_ts: float = 0.0
        self.last_frame_monotonic_ns: int = 0
        self._last_preview_monotonic_ns: int = 0
        self.last_event_ts: float = 0.0
        self.frame_seq = 0
        self.status = "MOCK" if self.mode == "mock" else "PENDING"
        self.error = ""
        self._rng = np.random.default_rng()
        self._base_map = self._build_base_map()
        self._anomaly_active = False
        self._capture_lock = threading.RLock()
        self._frame_lock = threading.Lock()
        self._detection_lock = threading.Lock()
        self._last_detection_attempt = 0.0
        self._detection_retry_seconds = 5.0
        self._worker_started = False
        self._retry_after = 0.0
        self._retry_delay_seconds = 60.0
        self._max_cpu_temperature = 78.0
        self._stop_event = threading.Event()
        self._stream_process: Optional[subprocess.Popen[bytes]] = None
        self._stream_attempt_count = 0
        self._stream_restart_count = 0
        self._stream_failure_count = 0
        self._invalid_frame_count = 0
        self._frame_times: deque[float] = deque(maxlen=max(12, self.stream_fps * 3))
        self._raw_frames: deque[tuple[int, int, bytes]] = deque(maxlen=3)
        self._first_stream_attempt_event = threading.Event()
        self._first_frame_event = threading.Event()
        self._rgb_pause_callback: Optional[Callable[[], None]] = None
        self._rgb_resume_callback: Optional[Callable[[], None]] = None

    def set_rgb_coordinator(self, pause: Callable[[], None], resume: Callable[[], None]) -> None:
        """Register callbacks that pause and resume the RGB camera around a thermal transaction.

        Not needed on the current hardware (RGB and thermal use independent paths); kept
        for setups where the two compete for the same bus.
        """
        self._rgb_pause_callback = pause
        self._rgb_resume_callback = resume

    def detect_device(self) -> bool:
        """Resolve the real PureThermal V4L2 node and update the detection state.

        A configured device is accepted only if it identifies itself as PureThermal/FLIR
        (unless ``EASY_THERMAL_ALLOW_UNVERIFIED_DEVICE=1``); with ``auto`` the device is
        discovered through ``v4l2-ctl`` and then sysfs.
        """
        detection_started = time.monotonic()
        LOGGER.info(
            "THERMAL detect begin enabled=%s mode=%s configured_device=%s input_format=%s video_size=%s",
            self.enabled,
            self.mode,
            self.configured_device,
            self.input_format,
            self.video_size,
        )
        with self._detection_lock:
            self._last_detection_attempt = time.monotonic()
            self.device_candidates = []
            if not self.enabled:
                self.detected = False
                self.discovery_method = "disabled"
                LOGGER.info("THERMAL detect skipped reason=disabled elapsed=%.3fs", time.monotonic() - detection_started)
                return False
            if self.mode == "mock":
                self.detected = True
                self.discovery_method = "mock"
                LOGGER.info("THERMAL detect complete mode=mock elapsed=%.3fs", time.monotonic() - detection_started)
                return True

            configured = self.configured_device.strip()
            if configured and configured.lower() not in {"auto", "detect", "purethermal"}:
                self.device = configured
                allow_unverified = os.environ.get("EASY_THERMAL_ALLOW_UNVERIFIED_DEVICE") == "1"
                self.detected = self._is_purethermal_device(configured) or (allow_unverified and Path(configured).exists())
                self.discovery_method = "configured_device_verified" if self.detected else "configured_device_rejected"
                if not self.detected:
                    self.error = (
                        f"Configured thermal device {configured} is not identified as PureThermal/FLIR. "
                        "Use thermal.device=auto or set EASY_THERMAL_ALLOW_UNVERIFIED_DEVICE=1 only for debugging."
                    )
                LOGGER.info(
                    "THERMAL detect configured complete elapsed=%.3fs detected=%s device=%s method=%s error=%r",
                    time.monotonic() - detection_started,
                    self.detected,
                    self.device,
                    self.discovery_method,
                    self.error,
                )
                return self.detected

            resolved = self._discover_purethermal_device()
            if resolved:
                self.device = resolved
                self.detected = True
                if self.status in {"PENDING", "NOT_DETECTED"}:
                    self.error = ""
                LOGGER.info(
                    "THERMAL detect complete elapsed=%.3fs detected=true device=%s method=%s candidates=%s",
                    time.monotonic() - detection_started,
                    self.device,
                    self.discovery_method,
                    [(item.get("path"), item.get("formats"), item.get("sizes"), item.get("selected")) for item in self.device_candidates],
                )
                return True
            self.detected = False
            self.status = "NOT_DETECTED"
            self.discovery_method = "not_found"
            self.error = "PureThermal video node not found. Check USB cable and v4l2-ctl --list-devices."
            LOGGER.warning("THERMAL detect failed elapsed=%.3fs error=%r", time.monotonic() - detection_started, self.error)
            return False

    def refresh_device(self, force: bool = False) -> bool:
        """Retry PureThermal discovery, throttling automatic requests."""
        if self.detected and not force:
            return True
        if not force and time.monotonic() - self._last_detection_attempt < self._detection_retry_seconds:
            return False
        detected = self.detect_device()
        if detected:
            self.start()
        return detected

    def _discover_purethermal_device(self) -> str | None:
        """Discover candidates with ``v4l2-ctl``, falling back to sysfs, and return the best node (None if none)."""
        candidates = self._discover_with_v4l2_ctl()
        if candidates:
            self.discovery_method = "v4l2-ctl"
            return self._select_thermal_candidate(candidates)
        candidates = self._discover_with_sysfs()
        if candidates:
            self.discovery_method = "sysfs"
            return self._select_thermal_candidate(candidates)
        return None

    def _discover_with_v4l2_ctl(self) -> list[Dict[str, Any]]:
        """Candidates from ``v4l2-ctl``, recorded in ``device_candidates``."""
        candidates = self._discovery.discover_with_v4l2_ctl()
        self.device_candidates.extend(candidates)
        return candidates

    def _discover_with_sysfs(self) -> list[Dict[str, Any]]:
        """Candidates from sysfs, recorded in ``device_candidates``."""
        candidates = self._discovery.discover_with_sysfs()
        self.device_candidates.extend(candidates)
        return candidates

    def _inspect_video_candidate(self, device_path: str, name: str, source: str) -> Dict[str, Any]:
        """Describe one candidate node (no capability probing)."""
        return self._discovery.inspect_candidate(device_path, name, source)

    def _select_thermal_candidate(self, candidates: list[Dict[str, Any]]) -> str:
        """Pick the best candidate path."""
        return PureThermalDiscovery.select_candidate(candidates)

    def _is_purethermal_device(self, device_path: str) -> bool:
        """True when the node identifies itself as PureThermal/FLIR."""
        return self._discovery.is_purethermal_device(device_path)

    @staticmethod
    def _name_looks_thermal(name: str) -> bool:
        """True when a device name mentions PureThermal, FLIR or Lepton."""
        return PureThermalDiscovery.name_looks_thermal(name)

    def _friendly_thermal_error(self, stderr: str, returncode: int | None = None) -> str:
        """Turn raw FFmpeg/V4L2 error text into an operator-friendly message."""
        message = (stderr or "").strip()
        lowered = message.lower()
        if "device or resource busy" in lowered or "busy" in lowered:
            return (
                f"Thermal device busy: {self.device} is already open by another process. "
                "Close other viewers/ffmpeg/v4l2 tools or restart the dashboard service."
            )
        if "ioctl" in lowered and "invalid argument" in lowered:
            return (
                f"Thermal capture format rejected on {self.device}. "
                f"Configured input_format={self.input_format}, video_size={self.video_size}."
            )
        if "no such file" in lowered or "cannot open video device" in lowered:
            return f"Thermal device not available: {self.device}. Run v4l2-ctl --list-devices to verify the PureThermal node."
        return message or f"thermal ffmpeg exited with code {returncode}"

    def _video_dimensions(self) -> tuple[int, int]:
        """Configured frame size as ``(width, height)``; defaults to 160x120."""
        try:
            width_text, height_text = self.video_size.lower().split("x", 1)
            return int(width_text), int(height_text)
        except Exception:
            return 160, 120

    def start(self) -> None:
        """Start the persistent worker (continuous mode) or mark the on-demand backend READY."""
        if not self.enabled or self.mode != "real" or not self.detected:
            return
        if self.capture_mode == "continuous":
            if self._worker_started:
                return
            self._stop_event.clear()
            self._first_stream_attempt_event.clear()
            self._worker_started = True
            self.status = "STARTING"
            self.error = "Waiting for first thermal frame"
            self._worker_thread = threading.Thread(
                target=self._continuous_worker_loop,
                name="easy-thermal-continuous",
                daemon=True,
            )
            self._worker_thread.start()
            return
        already_ready = self.status == "READY" and not self.error
        self.status = "READY"
        self.error = ""
        if not already_ready:
            LOGGER.info("THERMAL on-demand backend ready device=%s", self.device)

    def wait_for_bootstrap_attempt(self, timeout_seconds: float) -> str:
        """Wait until the first thermal frame arrives or the first stream attempt ends.

        Returns ``frame_received``, ``attempt_completed`` or ``timeout``.
        """
        if self._first_frame_event.is_set() or self.frame_seq > 0:
            return "frame_received"
        if self._first_stream_attempt_event.wait(max(0.0, timeout_seconds)):
            return "frame_received" if self._first_frame_event.is_set() or self.frame_seq > 0 else "attempt_completed"
        return "timeout"

    def stop(self) -> None:
        """Stop the worker and terminate the FFmpeg process."""
        self._stop_event.set()
        process = self._stream_process
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                process.kill()
        worker = getattr(self, "_worker_thread", None)
        if worker and worker is not threading.current_thread():
            worker.join(timeout=5.0)
        self._worker_started = False

    def _continuous_stream_command(self) -> list[str]:
        """FFmpeg command that streams raw Y16 frames from the V4L2 node to stdout."""
        return [
            shutil.which("ffmpeg") or "ffmpeg",
            "-nostdin", "-hide_banner", "-loglevel", "error",
            "-f", "v4l2", "-framerate", str(self.stream_fps),
            "-input_format", self.input_format, "-video_size", self.video_size,
            "-i", self.device, "-f", "rawvideo", "-pix_fmt", "gray16le", "pipe:1",
        ]

    def _read_continuous_frame(self, process: subprocess.Popen[bytes], frame_size: int, timeout: float = 3.0) -> bytes:
        """Read exactly one frame from the FFmpeg pipe (empty or short on timeout or exit)."""
        if process.stdout is None:
            return b""
        payload = bytearray()
        deadline = time.monotonic() + timeout
        fd = process.stdout.fileno()
        while len(payload) < frame_size and not self._stop_event.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0 or process.poll() is not None:
                break
            readable, _, _ = select.select([fd], [], [], min(0.25, remaining))
            if readable:
                chunk = os.read(fd, frame_size - len(payload))
                if not chunk:
                    break
                payload.extend(chunk)
        return bytes(payload)

    def _continuous_worker_loop(self) -> None:
        """Worker thread: keep one FFmpeg stream alive and publish every frame.

        Each frame updates the preview (rate-limited to ``preview_fps``), the raw-frame
        ring buffer, the statistics and the frame sequence. A broken stream is restarted
        with exponential back-off (up to 30 s); status becomes DEGRADED if frames had
        been flowing and ERROR otherwise.
        """
        width, height = self._video_dimensions()
        frame_size = width * height * 2
        saw_frame = False
        try:
            while not self._stop_event.is_set():
                cpu_temperature = read_cpu_temperature()
                # Thermal protection: pause capture while the Raspberry is too hot (checked on every cycle).
                if cpu_temperature is not None and cpu_temperature >= self._max_cpu_temperature:
                    self.status = "COOLDOWN"
                    self.error = f"Thermal stream paused: CPU temperature {cpu_temperature:.1f} C"
                    self._retry_after = time.time() + 10.0
                    self._stop_event.wait(10.0)
                    continue
                self._stream_attempt_count += 1
                if saw_frame:
                    self._stream_restart_count += 1
                process: subprocess.Popen[bytes] | None = None
                try:
                    process = subprocess.Popen(
                        self._continuous_stream_command(),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        bufsize=0,
                    )
                    self._stream_process = process
                    self.status = "STARTING"
                    while not self._stop_event.is_set():
                        payload = self._read_continuous_frame(process, frame_size)
                        if len(payload) != frame_size:
                            self._stream_failure_count += 1
                            if payload:
                                self._invalid_frame_count += 1
                            raise RuntimeError(f"thermal stream frame incomplete: {len(payload)}/{frame_size} bytes")
                        wall_ts = time.time()
                        monotonic_ns = time.monotonic_ns()
                        raw_map = np.frombuffer(payload, dtype="<u2").reshape((height, width)).astype(np.float32)
                        image, extra = self._real_thermal_palette(raw_map)
                        preview_interval_ns = int(1_000_000_000 / self.preview_fps)
                        preview = None
                        if self.last_frame_bytes is None or monotonic_ns - self._last_preview_monotonic_ns >= preview_interval_ns:
                            preview = self._encode_image(image)
                        with self._frame_lock:
                            self.frame_seq += 1
                            if preview is not None:
                                self.last_frame_bytes = preview
                                self._last_preview_monotonic_ns = monotonic_ns
                            self.last_frame_ts = wall_ts
                            self.last_frame_monotonic_ns = monotonic_ns
                            self._frame_times.append(monotonic_ns / 1_000_000_000.0)
                            self._raw_frames.append((self.frame_seq, monotonic_ns, payload))
                            self.last_stats = {
                                "mode": self.mode,
                                "status": "REAL",
                                "detected": True,
                                "capture_mode": self.capture_mode,
                                "frame_seq": self.frame_seq,
                                "received_wall_ts": wall_ts,
                                "received_monotonic_ns": monotonic_ns,
                                "radiometric": False,
                                **extra,
                            }
                            self.status = "REAL"
                            self.error = ""
                        saw_frame = True
                        self._first_frame_event.set()
                        self._first_stream_attempt_event.set()
                except Exception as exc:
                    if not self._stop_event.is_set():
                        self.status = "DEGRADED" if saw_frame else "ERROR"
                        self.error = self._friendly_thermal_error(str(exc))
                        self._retry_after = time.time() + min(30.0, 2.0 ** min(self._stream_attempt_count, 4))
                        self._first_stream_attempt_event.set()
                        self._stop_event.wait(max(0.0, self._retry_after - time.time()))
                finally:
                    if process and process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=2.0)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait(timeout=1.0)
                    self._stream_process = None
        finally:
            self._worker_started = False

    def _build_base_map(self) -> np.ndarray:
        """Smooth 16x12 temperature field around 24 C used by the simulator."""
        x = np.linspace(0, 1, 16)
        y = np.linspace(0, 1, 12)
        xx, yy = np.meshgrid(x, y)
        return 24.0 + 1.5 * np.sin(xx * np.pi * 2) + 0.7 * np.cos(yy * np.pi * 3)

    def _thermal_palette(self, temp_map: np.ndarray) -> Image.Image:
        """Render a simulated temperature matrix as a labelled false-colour image with hotspot boxes."""
        min_t = float(temp_map.min())
        max_t = float(temp_map.max())
        avg_t = float(temp_map.mean())
        span = max(0.1, max_t - min_t)
        normalized = np.clip((temp_map - min_t) / span, 0.0, 1.0)
        r = (normalized * 255).astype(np.uint8)
        g = (np.clip(1.0 - np.abs(normalized - 0.55) * 1.6, 0.0, 1.0) * 255).astype(np.uint8)
        b = ((1.0 - normalized) * 220 + 15).astype(np.uint8)
        rgb = np.dstack([r, g, b])
        image = Image.fromarray(rgb, mode="RGB").resize((640, 360), RESAMPLE_NEAREST)
        draw = ImageDraw.Draw(image)
        cell_w = 640 / 16.0
        cell_h = 360 / 12.0
        threshold = max(self.threshold_celsius, avg_t + max(self.delta_threshold, 2.5))
        hot_mask = temp_map >= threshold
        visited = set()
        for y in range(12):
            for x in range(16):
                if not hot_mask[y, x] or (x, y) in visited:
                    continue
                stack = [(x, y)]
                component = []
                while stack:
                    cx, cy = stack.pop()
                    if (cx, cy) in visited:
                        continue
                    if cx < 0 or cy < 0 or cx >= 16 or cy >= 12 or not hot_mask[cy, cx]:
                        continue
                    visited.add((cx, cy))
                    component.append((cx, cy))
                    stack.extend([(cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)])
                if not component:
                    continue
                xs = [c[0] for c in component]
                ys = [c[1] for c in component]
                left = int(max(0, min(xs) * cell_w))
                top = int(max(0, min(ys) * cell_h))
                right = int(min(639, (max(xs) + 1) * cell_w))
                bottom = int(min(359, (max(ys) + 1) * cell_h))
                color = (255, 60, 60) if self._anomaly_active else (255, 180, 70)
                draw_rounded_box(draw, (left + 2, top + 2, right - 2, bottom - 2), radius=12, outline=color, width=4)
        for x in range(1, 16):
            px = int(x * cell_w)
            draw.line((px, 0, px, 360), fill=(235, 246, 255), width=1)
        for y in range(1, 12):
            py = int(y * cell_h)
            draw.line((0, py, 640, py), fill=(235, 246, 255), width=1)
        draw_rounded_box(draw, (12, 12, 240, 48), radius=14, fill=(255, 122, 122) if self._anomaly_active else (38, 208, 178))
        draw.text((24, 20), "THERMAL ALARM" if self._anomaly_active else "THERMAL OK", fill=(8, 19, 30))
        footer = f"min {min_t:.1f} C | avg {float(temp_map.mean()):.1f} C | max {max_t:.1f} C | threshold {self.threshold_celsius:.1f} C"
        draw.rectangle((12, 308, 628, 348), fill=(0, 0, 0))
        draw.text((24, 321), footer, fill=(244, 248, 251))
        return image

    def _simulate_matrix(self) -> np.ndarray:
        """Simulated matrix: base field plus noise and, with 45% probability, a Gaussian-like hot spot."""
        noise = self._rng.normal(0, 0.6, size=(12, 16))
        drift = self._rng.normal(0, 0.15)
        temp_map = self._base_map + noise + drift
        if self._rng.random() < 0.45:
            cx = int(self._rng.integers(3, 13))
            cy = int(self._rng.integers(2, 10))
            amp = float(self._rng.uniform(4.0, 12.0))
            for y in range(12):
                for x in range(16):
                    dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                    temp_map[y, x] += max(0.0, amp - dist * 1.6)
        return np.clip(temp_map, 18.0, 58.0)

    def _single_frame_command(self) -> list[str]:
        """FFmpeg command that captures one raw Y16 frame to stdout."""
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        return [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "v4l2", "-framerate", "9",
            "-input_format", self.input_format, "-video_size", self.video_size, "-i", self.device,
            "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray16le", "pipe:1",
        ]

    def _single_frame_file_command(self, output_path: Path) -> list[str]:
        """Same capture, writing to a file (a tmpfs buffer) instead of a pipe."""
        command = self._single_frame_command()
        command[-1] = str(output_path)
        return command

    def _capture_y16_matrix(self) -> np.ndarray:
        """Capture one frame and close V4L2 cleanly after each transaction.

        PureThermal on the target Raspberry reliably completes one-frame FFmpeg
        captures, while a long-lived FFmpeg stdout pipe can remain open without
        ever delivering its first frame. Keeping the transaction bounded also
        prevents a failed reader from retaining /dev/video0 between retries.
        """
        process: subprocess.Popen[bytes] | None = None
        buffer_root = Path("/dev/shm") if Path("/dev/shm").is_dir() else Path("/tmp")
        buffer_path = buffer_root / f"easy-thermal-single-{os.getpid()}.raw"
        with self._capture_lock:
            try:
                buffer_path.unlink(missing_ok=True)
                process = subprocess.Popen(
                    self._single_frame_file_command(buffer_path),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
                self._stream_process = process
                _, stderr_bytes = process.communicate(timeout=4.0)
            except subprocess.TimeoutExpired:
                if process is not None:
                    process.kill()
                    stdout, stderr_bytes = process.communicate()
                else:
                    stderr_bytes = b""
                buffer_path.unlink(missing_ok=True)
                raise RuntimeError("thermal single-frame capture timed out")
            finally:
                self._stream_process = None
        stdout = buffer_path.read_bytes() if buffer_path.exists() else b""
        buffer_path.unlink(missing_ok=True)
        width, height = self._video_dimensions()
        expected_bytes = width * height * 2
        returncode = process.returncode if process is not None else None
        if returncode != 0:
            stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
            raise RuntimeError(self._friendly_thermal_error(stderr, returncode))
        if len(stdout) < expected_bytes:
            raise RuntimeError(f"incomplete thermal frame: {len(stdout)}/{expected_bytes} bytes")
        raw = np.frombuffer(stdout[:expected_bytes], dtype="<u2").reshape((height, width))
        return raw.astype(np.float32)

    def _real_thermal_palette(self, raw_map: np.ndarray) -> tuple[Image.Image, Dict[str, Any]]:
        """Colour-map a raw Y16 frame and detect the hotspot.

        The analysis ignores a 6-pixel border (sensor edge artefacts) and normalises on
        the 2nd-98th percentiles. The hotspot is the top 1% of pixels; an anomaly is
        flagged when the signal spread is at least 900 counts and the hotspot covers at
        least 0.6% of the frame. Returns the image and its statistics.
        """
        analysis_map = raw_map[6:-6, 6:-6]
        low = float(np.percentile(analysis_map, 2))
        high = float(np.percentile(analysis_map, 98))
        if high <= low:
            high = low + 1.0
        normalized = np.clip((raw_map - low) / (high - low), 0.0, 1.0)
        r = (np.clip((normalized - 0.18) * 1.42, 0.0, 1.0) * 255).astype(np.uint8)
        g = (np.clip(1.0 - np.abs(normalized - 0.58) * 2.05, 0.0, 1.0) * 255).astype(np.uint8)
        b = (np.clip(1.0 - normalized * 1.15, 0.0, 1.0) * 210).astype(np.uint8)
        rgb = np.dstack([r, g, b])
        image = Image.fromarray(rgb, mode="RGB").resize((640, 480), RESAMPLE_NEAREST)
        draw = ImageDraw.Draw(image)
        hot_threshold = float(np.percentile(analysis_map, 99.0))
        hot_mask_inner = analysis_map >= hot_threshold
        hot_mask = np.zeros_like(raw_map, dtype=bool)
        hot_mask[6:-6, 6:-6] = hot_mask_inner
        ys, xs = np.where(hot_mask)
        hotspot_percent = round(float(hot_mask.mean() * 100.0), 2)
        signal_spread = int(float(np.percentile(analysis_map, 99.0) - np.percentile(analysis_map, 5.0)))
        anomaly_active = signal_spread >= 900 and hotspot_percent >= 0.6
        if xs.size and ys.size:
            left = int(xs.min() * 4)
            top = int(ys.min() * 4)
            right = int((xs.max() + 1) * 4)
            bottom = int((ys.max() + 1) * 4)
            draw_rounded_box(draw, (left + 4, top + 4, right - 4, bottom - 4), radius=18, outline=(255, 96, 96) if anomaly_active else (255, 192, 96), width=4)
        draw_rounded_box(draw, (16, 16, 248, 56), radius=14, fill=(255, 96, 96) if anomaly_active else (38, 208, 178))
        draw.text((28, 24), "THERMAL ANOMALY" if anomaly_active else "WITHIN THRESHOLD", fill=(8, 19, 30))
        footer = f"signal {signal_spread} | hot {hotspot_percent:.2f}% | thr {hot_threshold:.0f} raw"
        draw.rectangle((16, 426, 624, 464), fill=(0, 0, 0))
        draw.text((28, 438), footer, fill=(244, 248, 251))
        stats = {
            "signal_spread": signal_spread,
            "hotspot_percent": hotspot_percent,
            "hot_threshold_raw": hot_threshold,
            "anomaly_active": anomaly_active,
        }
        return image, stats

    def _encode_image(self, image: Image.Image) -> bytes:
        """Encode an image as JPEG (quality 88)."""
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=88)
        return out.getvalue()

    def _mock_frame(self) -> tuple[bytes, Dict[str, Any]]:
        """One simulated frame with min/avg/max temperatures and the anomaly flag."""
        temp_map = self._simulate_matrix()
        anomaly = bool(temp_map.max() >= max(self.threshold_celsius, float(temp_map.mean()) + self.delta_threshold))
        self._anomaly_active = anomaly
        image = self._thermal_palette(temp_map)
        stats = {
            "mode": self.mode,
            "status": "MOCK",
            "detected": True,
            "min_c": round(float(temp_map.min()), 1),
            "avg_c": round(float(temp_map.mean()), 1),
            "max_c": round(float(temp_map.max()), 1),
            "threshold_celsius": self.threshold_celsius,
            "delta_threshold": self.delta_threshold,
            "anomaly_active": anomaly,
        }
        return self._encode_image(image), stats

    def frame(self) -> tuple[bytes, Dict[str, Any]]:
        """Return ``(jpeg, stats)`` for the current thermal view.

        In continuous mode it returns the latest cached frame (waiting up to 3 s for the
        first one). Otherwise it captures on demand. When nothing is available it
        returns an explanatory placeholder image instead of raising.
        """
        if not self.enabled:
            stats = {"status": "DISABLED", "mode": self.mode, "detected": False}
            return make_placeholder_jpeg("THERMAL DISABLED", "Thermal feed disabled", "#ffbc56"), stats
        if self.mode == "mock":
            frame, stats = self._mock_frame()
            self.last_frame_bytes = frame
            self.last_frame_ts = time.time()
            self.last_stats = stats
            self.frame_seq += 1
            return frame, stats
        if not self.detected:
            self.refresh_device()
        self.start()
        if self.capture_mode == "continuous":
            self._first_frame_event.wait(3.0)
            with self._frame_lock:
                if self.last_frame_bytes is not None:
                    return self.last_frame_bytes, dict(self.last_stats)
            stats = self.status_payload(refresh=False)
            return make_placeholder_jpeg("THERMAL STARTING", self.error or "Waiting for thermal stream", "#ffbc56"), stats
        try:
            return self._capture_on_demand()
        except Exception as exc:
            self.status = "ERROR"
            self.error = self._friendly_thermal_error(str(exc))
            LOGGER.warning("THERMAL on-demand capture failed error=%r", self.error)
        with self._frame_lock:
            if self.last_frame_bytes is not None:
                return self.last_frame_bytes, dict(self.last_stats)
        if not self.detected:
            stats = {
                "status": "NOT_DETECTED",
                "mode": self.mode,
                "detected": False,
                "device": self.device,
                "configured_device": self.configured_device,
                "input_format": self.input_format,
                "video_size": self.video_size,
                "discovery_method": self.discovery_method,
                "device_candidates": self.device_candidates,
                "error": self.error,
            }
            return make_placeholder_jpeg("THERMAL OFFLINE", self.error or "PureThermal device not detected", "#ff7a7a"), stats
        stats = {
            "status": self.status or "STARTING",
            "mode": self.mode,
            "detected": self.detected,
            "device": self.device,
            "configured_device": self.configured_device,
            "input_format": self.input_format,
            "video_size": self.video_size,
            "discovery_method": self.discovery_method,
            "error": self.error,
        }
        return make_placeholder_jpeg("THERMAL STARTING", self.error or "Waiting for thermal stream", "#ffbc56"), stats

    def last_frame(self) -> tuple[Optional[bytes], Dict[str, Any]]:
        """Return the cached preview without opening the PureThermal device."""
        with self._frame_lock:
            frame = self.last_frame_bytes
            stats = dict(self.last_stats)
        stats.update({"last_frame_ts": self.last_frame_ts, "frame_seq": self.frame_seq})
        return frame, stats

    def _capture_on_demand(self) -> tuple[bytes, Dict[str, Any]]:
        """Capture exactly one real frame, refusing when the CPU is too hot."""
        with self._capture_lock:
            cpu_temperature = read_cpu_temperature()
            if cpu_temperature is not None and cpu_temperature >= self._max_cpu_temperature:
                raise RuntimeError(f"thermal capture blocked: CPU temperature {cpu_temperature:.1f} C")
            paused = False
            started = time.monotonic()
            try:
                if self._rgb_pause_callback is not None:
                    self._rgb_pause_callback()
                    paused = True
                raw_map = self._capture_y16_matrix()
                image, extra = self._real_thermal_palette(raw_map)
                frame = self._encode_image(image)
                stats = {
                    "mode": self.mode,
                    "status": "REAL",
                    "detected": True,
                    "threshold_celsius": self.threshold_celsius,
                    "delta_threshold": self.delta_threshold,
                    **extra,
                }
                with self._frame_lock:
                    self.last_frame_bytes = frame
                    self.last_frame_ts = time.time()
                    self.last_stats = stats
                    self.frame_seq += 1
                    self.status = "REAL"
                    self.error = ""
                LOGGER.info("THERMAL on-demand frame seq=%s bytes=%s elapsed=%.3fs", self.frame_seq, len(frame), time.monotonic() - started)
                return frame, stats
            finally:
                if paused and self._rgb_resume_callback is not None:
                    self._rgb_resume_callback()

    def snapshot(self) -> tuple[bytes, Dict[str, Any]]:
        """Return the current frame with the snapshot timestamp and frame sequence added to its statistics."""
        frame, stats = self.frame()
        snapshot_stats = dict(stats)
        snapshot_stats["snapshot_ts"] = time.time()
        snapshot_stats["frame_seq"] = self.frame_seq
        return frame, snapshot_stats

    def status_payload(self, *, refresh: bool = True) -> Dict[str, Any]:
        """Full thermal status for the API: detection, device, capture mode, fps, restart and failure counters, errors and the normalised ``runtime_state``.

        Pass ``refresh=False`` to avoid triggering device discovery.
        """
        if refresh and self.enabled and self.mode == "real" and not self.detected:
            self.refresh_device()
        streaming = bool(self.last_frame_ts and time.time() - self.last_frame_ts <= 5.0)
        actual_fps = 0.0
        with self._frame_lock:
            if len(self._frame_times) > 1:
                elapsed = self._frame_times[-1] - self._frame_times[0]
                if elapsed > 0:
                    actual_fps = (len(self._frame_times) - 1) / elapsed
        effective_status = "REAL" if streaming else self.status
        payload = {
            "status": effective_status,
            "mode": self.mode,
            "enabled": self.enabled,
            "detected": self.detected or self.mode == "mock",
            "device": self.device,
            "configured_device": self.configured_device,
            "input_format": self.input_format,
            "video_size": self.video_size,
            "discovery_method": self.discovery_method,
            "device_candidates": self.device_candidates,
            "threshold_celsius": self.threshold_celsius,
            "delta_threshold": self.delta_threshold,
            "last_frame_ts": self.last_frame_ts,
            "frame_seq": self.frame_seq,
            "last_frame_monotonic_ns": self.last_frame_monotonic_ns,
            "capture_mode": self.capture_mode,
            "stream_fps_target": self.stream_fps,
            "preview_fps_target": self.preview_fps,
            "actual_fps": round(actual_fps, 2),
            "stream_attempts": self._stream_attempt_count,
            "stream_restarts": self._stream_restart_count,
            "stream_failures": self._stream_failure_count,
            "invalid_frames": self._invalid_frame_count,
            "raw_ring_size": len(self._raw_frames),
            "streaming": streaming,
            "retry_after_ts": self._retry_after,
            "cpu_temperature_limit": self._max_cpu_temperature,
            "error": self.error,
            "anomaly_active": self.last_stats.get("anomaly_active", self._anomaly_active),
            **{k: v for k, v in self.last_stats.items() if k not in {"status", "mode", "enabled", "detected", "device", "threshold_celsius", "delta_threshold", "last_frame_ts", "frame_seq", "error"}},
        }
        payload["runtime_state"] = build_thermal_state_contract(payload)
        return payload
