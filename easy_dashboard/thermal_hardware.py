from __future__ import annotations

import io
import logging
import os
import shutil
import subprocess
import threading
import time
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
        self.config = config
        self.events = events
        self.mode = str(config["thermal"].get("mode", "mock")).lower()
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
        self._first_stream_attempt_event = threading.Event()
        self._first_frame_event = threading.Event()
        self._rgb_pause_callback: Optional[Callable[[], None]] = None
        self._rgb_resume_callback: Optional[Callable[[], None]] = None

    def set_rgb_coordinator(self, pause: Callable[[], None], resume: Callable[[], None]) -> None:
        self._rgb_pause_callback = pause
        self._rgb_resume_callback = resume

    def detect_device(self) -> bool:
        """Resolve the real PureThermal V4L2 node and update detection state."""
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
        candidates = self._discovery.discover_with_v4l2_ctl()
        self.device_candidates.extend(candidates)
        return candidates

    def _discover_with_sysfs(self) -> list[Dict[str, Any]]:
        candidates = self._discovery.discover_with_sysfs()
        self.device_candidates.extend(candidates)
        return candidates

    def _inspect_video_candidate(self, device_path: str, name: str, source: str) -> Dict[str, Any]:
        return self._discovery.inspect_candidate(device_path, name, source)

    def _select_thermal_candidate(self, candidates: list[Dict[str, Any]]) -> str:
        return PureThermalDiscovery.select_candidate(candidates)

    def _thermal_stream_candidates(self) -> list[str]:
        """Return candidate video nodes, trying the selected one first and then fallbacks."""
        ordered: list[str] = []
        if self.device:
            ordered.append(self.device)
        for candidate in self.device_candidates:
            path = str(candidate.get("path") or "").strip()
            if path and path not in ordered:
                ordered.append(path)
        return ordered

    def _is_purethermal_device(self, device_path: str) -> bool:
        return self._discovery.is_purethermal_device(device_path)

    @staticmethod
    def _name_looks_thermal(name: str) -> bool:
        return PureThermalDiscovery.name_looks_thermal(name)

    def _friendly_thermal_error(self, stderr: str, returncode: int | None = None) -> str:
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
        try:
            width_text, height_text = self.video_size.lower().split("x", 1)
            return int(width_text), int(height_text)
        except Exception:
            return 160, 120

    def start(self) -> None:
        """Prepare the device; real acquisition is deliberately on demand."""
        if not self.enabled or self.mode != "real" or not self.detected:
            return
        already_ready = self.status == "READY" and not self.error
        self.status = "READY"
        self.error = ""
        if not already_ready:
            LOGGER.info("THERMAL on-demand backend ready device=%s", self.device)

    def wait_for_bootstrap_attempt(self, timeout_seconds: float) -> str:
        """Wait until the first thermal frame arrives or the first stream attempt ends."""
        if self._first_frame_event.is_set() or self.frame_seq > 0:
            return "frame_received"
        if self._first_stream_attempt_event.wait(max(0.0, timeout_seconds)):
            return "frame_received" if self._first_frame_event.is_set() or self.frame_seq > 0 else "attempt_completed"
        return "timeout"

    def stop(self) -> None:
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

    def _build_base_map(self) -> np.ndarray:
        x = np.linspace(0, 1, 16)
        y = np.linspace(0, 1, 12)
        xx, yy = np.meshgrid(x, y)
        return 24.0 + 1.5 * np.sin(xx * np.pi * 2) + 0.7 * np.cos(yy * np.pi * 3)

    def _thermal_palette(self, temp_map: np.ndarray) -> Image.Image:
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
        draw.text((24, 20), "ALLARME TERMICO" if self._anomaly_active else "TERMICO OK", fill=(8, 19, 30))
        footer = f"min {min_t:.1f} C | avg {float(temp_map.mean()):.1f} C | max {max_t:.1f} C | soglia {self.threshold_celsius:.1f} C"
        draw.rectangle((12, 308, 628, 348), fill=(0, 0, 0))
        draw.text((24, 321), footer, fill=(244, 248, 251))
        return image

    def _simulate_matrix(self) -> np.ndarray:
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
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        return [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "v4l2", "-framerate", "9",
            "-input_format", self.input_format, "-video_size", self.video_size, "-i", self.device,
            "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray16le", "pipe:1",
        ]

    def _single_frame_file_command(self, output_path: Path) -> list[str]:
        command = self._single_frame_command()
        command[-1] = str(output_path)
        return command

    def _ffmpeg_stream_command(self, output_path: Path) -> list[str]:
        width, height = self._video_dimensions()
        return [
            shutil.which("ffmpeg") or "ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "v4l2", "-framerate", "9", "-input_format", self.input_format,
            "-video_size", f"{width}x{height}", "-i", self.device,
            "-frames:v", "90", "-f", "rawvideo", "-pix_fmt", "gray16le", str(output_path),
        ]

    @staticmethod
    def _read_growing_file_frame(
        stream: Any,
        process: subprocess.Popen[bytes],
        frame_size: int,
        timeout_seconds: float,
    ) -> bytes:
        """Read one frame while FFmpeg grows a regular tmpfs file."""
        chunks: list[bytes] = []
        remaining = frame_size
        deadline = time.monotonic() + timeout_seconds
        while remaining > 0 and time.monotonic() < deadline:
            chunk = stream.read(remaining)
            if chunk:
                chunks.append(chunk)
                remaining -= len(chunk)
                continue
            if process.poll() is not None:
                break
            time.sleep(0.02)
        return b"".join(chunks)

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
        draw.text((28, 24), "ANOMALIA TERMICA" if anomaly_active else "NELLA SOGLIA", fill=(8, 19, 30))
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
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=88)
        return out.getvalue()

    def _mock_frame(self) -> tuple[bytes, Dict[str, Any]]:
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

    def _real_worker_loop(self) -> None:
        width, height = self._video_dimensions()
        frame_size = width * height * 2
        saw_frame = False
        LOGGER.info(
            "THERMAL worker begin device=%s dimensions=%sx%s expected_frame_bytes=%s candidates=%s",
            self.device,
            width,
            height,
            frame_size,
            self._thermal_stream_candidates(),
        )
        while not self._stop_event.is_set():
            stream_candidates = self._thermal_stream_candidates()
            if not stream_candidates:
                self.status = "STARTING"
                self.error = "No thermal video candidates available"
                self._retry_after = time.time() + 5.0
                time.sleep(1.0)
                continue
            process: subprocess.Popen[bytes] | None = None
            current_device = stream_candidates[0]
            stream: Any = None
            self._stream_attempt_count += 1
            attempt = self._stream_attempt_count
            attempt_started = time.monotonic()
            buffer_root = Path("/dev/shm") if Path("/dev/shm").is_dir() else Path("/tmp")
            buffer_path = buffer_root / f"easy-thermal-{os.getpid()}.raw"
            try:
                self.device = current_device
                buffer_path.unlink(missing_ok=True)
                command = self._ffmpeg_stream_command(buffer_path)
                if attempt <= 5 or attempt % 10 == 0:
                    LOGGER.info(
                        "THERMAL FFmpeg batch attempt=%s device=%s buffer=%s command=%r",
                        attempt,
                        current_device,
                        buffer_path,
                        command,
                    )
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
                self._stream_process = process
                self.status = "STARTING" if not saw_frame else "REAL"
                if not saw_frame:
                    self.error = "Waiting for first thermal frame from PureThermal"
                file_deadline = time.monotonic() + 4.0
                while not buffer_path.exists() and process.poll() is None and time.monotonic() < file_deadline:
                    time.sleep(0.02)
                if not buffer_path.exists():
                    raise RuntimeError("thermal V4L2 buffer was not created")
                stream = buffer_path.open("rb", buffering=0)
                while not self._stop_event.is_set():
                    payload = self._read_growing_file_frame(stream, process, frame_size, 4.0)
                    if len(payload) < frame_size:
                        if not payload and process.poll() == 0:
                            break
                        raise RuntimeError(f"thermal V4L2 stream ended: received {len(payload)}/{frame_size} bytes")
                    raw_map = np.frombuffer(payload, dtype="<u2").reshape((height, width)).astype(np.float32)
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
                    self._first_frame_event.set()
                    self._first_stream_attempt_event.set()
                    if not saw_frame:
                        LOGGER.info(
                            "THERMAL first frame received attempt=%s device=%s bytes=%s elapsed=%.3fs frame_seq=%s backend=ffmpeg",
                            attempt,
                            current_device,
                            len(payload),
                            time.monotonic() - attempt_started,
                            self.frame_seq,
                        )
                    saw_frame = True
                    self._anomaly_active = bool(extra.get("anomaly_active"))
            except Exception as exc:
                backoff = 1.0 if not saw_frame else 5.0
                message = str(exc)
                recoverable = "stream ended" in message
                if recoverable:
                    self.error = f"Recovering thermal stream from PureThermal on {current_device}"
                    self.status = "STARTING"
                elif saw_frame:
                    self.error = self._friendly_thermal_error(message)
                    self.status = "ERROR"
                else:
                    self.error = self._friendly_thermal_error(message) or "Waiting for first thermal frame from PureThermal"
                    self.status = "STARTING"
                self._retry_after = time.time() + backoff
                self._first_stream_attempt_event.set()
                if attempt <= 5 or attempt % 10 == 0 or not recoverable:
                    LOGGER.warning(
                        "THERMAL stream failed attempt=%s device=%s elapsed=%.3fs saw_frame=%s recoverable=%s process_returncode=%s error=%r next_retry_seconds=%.1f",
                        attempt,
                        current_device,
                        time.monotonic() - attempt_started,
                        saw_frame,
                        recoverable,
                        None,
                        message,
                        backoff,
                    )
                self._stop_event.wait(backoff)
            finally:
                if stream is not None:
                    stream.close()
                if process and process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=1.0)
                    except subprocess.TimeoutExpired:
                        process.kill()
                if process:
                    try:
                        _, stderr = process.communicate(timeout=1.0)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        _, stderr = process.communicate()
                    LOGGER.info(
                        "THERMAL FFmpeg batch exit attempt=%s returncode=%s stderr=%r",
                        attempt, process.returncode,
                        stderr.decode("utf-8", errors="replace").strip()[-500:],
                    )
                self._stream_process = None
                buffer_path.unlink(missing_ok=True)
        self._worker_started = False
        LOGGER.info("THERMAL worker stopped attempts=%s frame_seq=%s last_error=%r", self._stream_attempt_count, self.frame_seq, self.error)

    def _real_worker_single_frame_loop(self) -> None:
        """Capture real frames as bounded one-frame FFmpeg transactions.

        PureThermal exposes the device and accepts single-frame V4L2 captures,
        but its continuous streaming path can remain open without delivering
        any buffers. A short-lived transaction also guarantees that the device
        is released before the next attempt and while RGB is active.
        """
        width, height = self._video_dimensions()
        expected_bytes = width * height * 2
        saw_frame = False
        LOGGER.info(
            "THERMAL single-frame worker begin device=%s dimensions=%sx%s expected_frame_bytes=%s",
            self.device, width, height, expected_bytes,
        )
        while not self._stop_event.is_set():
            self._stream_attempt_count += 1
            attempt = self._stream_attempt_count
            started = time.monotonic()
            rgb_paused = False
            try:
                if self._rgb_pause_callback is not None:
                    self._rgb_pause_callback()
                    rgb_paused = True
                raw_map = self._capture_y16_matrix()
                image, extra = self._real_thermal_palette(raw_map)
                frame = self._encode_image(image)
                with self._frame_lock:
                    self.last_frame_bytes = frame
                    self.last_frame_ts = time.time()
                    self.last_stats = {
                        "mode": self.mode, "status": "REAL", "detected": True,
                        "threshold_celsius": self.threshold_celsius,
                        "delta_threshold": self.delta_threshold, **extra,
                    }
                    self.frame_seq += 1
                    self.status = "REAL"
                    self.error = ""
                    seq = self.frame_seq
                self._first_frame_event.set()
                self._first_stream_attempt_event.set()
                self._anomaly_active = bool(extra.get("anomaly_active"))
                if not saw_frame:
                    LOGGER.info(
                        "THERMAL first frame received attempt=%s device=%s bytes=%s elapsed=%.3fs frame_seq=%s backend=ffmpeg-single",
                        attempt, self.device, expected_bytes, time.monotonic() - started, seq,
                    )
                saw_frame = True
                self._stop_event.wait(5.0)
            except Exception as exc:
                self._first_stream_attempt_event.set()
                self.status = "STARTING" if not saw_frame else "ERROR"
                self.error = self._friendly_thermal_error(str(exc))
                self._retry_after = time.time() + (1.0 if not saw_frame else 5.0)
                LOGGER.warning(
                    "THERMAL single-frame failed attempt=%s elapsed=%.3fs error=%r next_retry_seconds=%.1f",
                    attempt, time.monotonic() - started, str(exc),
                    1.0 if not saw_frame else 5.0,
                )
                self._stop_event.wait(1.0 if not saw_frame else 5.0)
            finally:
                if rgb_paused and not self._stop_event.is_set() and self._rgb_resume_callback is not None:
                    try:
                        self._rgb_resume_callback()
                    except Exception:
                        LOGGER.exception("THERMAL failed to resume RGB after thermal capture")
        self._worker_started = False
        LOGGER.info(
            "THERMAL single-frame worker stopped attempts=%s frame_seq=%s last_error=%r",
            self._stream_attempt_count, self.frame_seq, self.error,
        )

    def frame(self) -> tuple[bytes, Dict[str, Any]]:
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
        """Capture exactly one real frame while RGB owns no camera handle."""
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
        frame, stats = self.frame()
        snapshot_stats = dict(stats)
        snapshot_stats["snapshot_ts"] = time.time()
        return frame, snapshot_stats

    def status_payload(self, *, refresh: bool = True) -> Dict[str, Any]:
        if refresh and self.enabled and self.mode == "real" and not self.detected:
            self.refresh_device()
        streaming = bool(self.last_frame_ts and time.time() - self.last_frame_ts <= 5.0)
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
            "streaming": streaming,
            "retry_after_ts": self._retry_after,
            "cpu_temperature_limit": self._max_cpu_temperature,
            "error": self.error,
            "anomaly_active": self.last_stats.get("anomaly_active", self._anomaly_active),
            **{k: v for k, v in self.last_stats.items() if k not in {"status", "mode", "enabled", "detected", "device", "threshold_celsius", "delta_threshold", "last_frame_ts", "frame_seq", "error"}},
        }
        payload["runtime_state"] = build_thermal_state_contract(payload)
        return payload
