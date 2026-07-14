from __future__ import annotations

import io
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import psutil
from flask import Response
from PIL import Image, ImageDraw

from .constants import PROJECT_ROOT
from .media import RESAMPLE_NEAREST, draw_rounded_box, make_placeholder_jpeg, multipart_frame
from .stores import EventStore
from .utils import get_boot_seconds, get_hostname, get_ip_address, human_uptime, read_cpu_temperature, read_text_file, run_command, safe_device_listing, which


LOGGER = logging.getLogger("easy-dashboard")


class SystemProbe:
    def hostname(self) -> str:
        return get_hostname()

    def ip_address(self) -> str:
        return get_ip_address()

    def model(self) -> str:
        model_file = Path("/proc/device-tree/model")
        if model_file.exists():
            raw = model_file.read_bytes().replace(b"\x00", b"").decode("utf-8", errors="ignore").strip()
            if raw:
                return raw
        return read_text_file(Path("/proc/device-tree/model")) or "unknown"

    def os_release(self) -> str:
        return read_text_file(Path("/etc/os-release"))

    def python_version(self) -> str:
        return subprocess.run(["python3", "--version"], capture_output=True, text=True, check=False).stdout.strip() or "unknown"

    def cpu_temperature(self) -> Optional[float]:
        return read_cpu_temperature()

    def memory(self) -> Dict[str, Any]:
        mem = psutil.virtual_memory()
        return {
            "used_mb": round(mem.used / 1024 / 1024, 1),
            "available_mb": round(mem.available / 1024 / 1024, 1),
            "total_mb": round(mem.total / 1024 / 1024, 1),
            "percent": mem.percent,
        }

    def disk(self) -> Dict[str, Any]:
        usage = psutil.disk_usage(str(PROJECT_ROOT))
        return {
            "used_gb": round(usage.used / 1024 / 1024 / 1024, 2),
            "free_gb": round(usage.free / 1024 / 1024 / 1024, 2),
            "total_gb": round(usage.total / 1024 / 1024 / 1024, 2),
            "percent": usage.percent,
        }

    def camera_tools(self) -> Dict[str, bool]:
        return {
            "libcamera_hello": which("libcamera-hello") is not None,
            "rpicam_hello": which("rpicam-hello") is not None,
            "libcamera_vid": which("libcamera-vid") is not None,
            "rpicam_vid": which("rpicam-vid") is not None,
            "picamera2": _module_available("picamera2"),
        }

    def camera_list(self) -> str:
        for command in (["rpicam-hello", "--list-cameras"], ["libcamera-hello", "--list-cameras"]):
            if which(command[0]):
                _, output = run_command(command, timeout=10)
                if output:
                    return output
        return "No camera tooling available"

    def lsusb(self) -> str:
        _, output = run_command(["lsusb"], timeout=10)
        return output

    def i2cdetect(self) -> str:
        _, output = run_command(["i2cdetect", "-y", "1"], timeout=20)
        return output

    def video_devices(self) -> list[str]:
        return safe_device_listing("/dev/video*")

    def get_camera(self) -> str:
        if which("vcgencmd") is None:
            return "vcgencmd not available"
        _, output = run_command(["vcgencmd", "get_camera"], timeout=8)
        return output

    def uname(self) -> str:
        _, output = run_command(["uname", "-a"], timeout=8)
        return output

    def uptime(self) -> str:
        _, output = run_command(["uptime", "-p"], timeout=8)
        return output or human_uptime(get_boot_seconds())

    def preflight_summary(self) -> Dict[str, Any]:
        return {
            "hostname": self.hostname(),
            "ip_address": self.ip_address(),
            "model": self.model(),
            "os_release": self.os_release(),
            "python_version": self.python_version(),
            "cpu_temperature_c": self.cpu_temperature(),
            "memory": self.memory(),
            "disk": self.disk(),
            "camera_tools": self.camera_tools(),
            "camera_list": self.camera_list(),
            "lsusb": self.lsusb(),
            "i2cdetect": self.i2cdetect(),
            "video_devices": self.video_devices(),
            "vcgencmd_get_camera": self.get_camera(),
            "uname": self.uname(),
            "uptime": self.uptime(),
        }


def _module_available(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


@dataclass
class RgbFeedState:
    name: str
    hardware_name: str
    crop: str
    enabled: bool = True
    status: str = "UNKNOWN"
    fps: float = 0.0
    last_acquisition_ts: float = 0.0
    error: str = ""


class RgbMasterSource:
    """Single owner of the shared RGB camera process and feed splitting logic."""

    def __init__(self, config: Dict[str, Any], events: EventStore, probe: SystemProbe) -> None:
        self.config = config
        self.events = events
        self.probe = probe
        self._camera_list_output: Optional[str] = None
        self._camera_list_lock = threading.Lock()
        self.camera_index = int(config["rgb"].get("camera_index", 0))
        self.width = int(config["rgb"].get("width", 1280))
        self.height = int(config["rgb"].get("height", 480))
        self.fps_target = int(config["rgb"].get("fps", 10))
        self.quality = int(config["rgb"].get("quality", 85))
        self.process: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._frame: Optional[bytes] = None
        self._frame_ts: float = 0.0
        self._frame_seq: int = 0
        self._stderr_tail: deque[str] = deque(maxlen=8)
        self._reader_thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._stop = False
        self._error = ""
        self._status = "OFFLINE"
        self._last_start_attempt = 0.0
        self._last_recovery_attempt = 0.0
        self._next_retry_ts = 0.0
        self._retry_backoff = 30.0
        self.enabled_feeds: dict[str, bool] = {"rgb_left": True, "rgb_right": True}
        self.detected = False
        self._detection_checked = False

    @property
    def camera_list_output(self) -> str:
        if self._camera_list_output is not None:
            return self._camera_list_output
        with self._camera_list_lock:
            if self._camera_list_output is None:
                try:
                    self._camera_list_output = self.probe.camera_list()
                except Exception:
                    LOGGER.exception("Failed to query libcamera device list")
                    self._camera_list_output = ""
        return self._camera_list_output

    def _camera_detected(self) -> bool:
        output = self.camera_list_output.lower()
        return "imx477" in output or "arducam" in output or ("available cameras" in output and "no cameras available" not in output)

    def refresh_detection(self) -> bool:
        """Refresh the RGB camera inventory without blocking app startup."""
        self._detection_checked = True
        self.detected = self._camera_detected()
        return self.detected

    def _busy_reason(self) -> bool:
        lowered = self._error.lower()
        return any(token in lowered for token in ("busy", "timeout", "in use", "failed to acquire"))

    def _mark_busy(self, message: str) -> None:
        self._error = message
        self._status = "BUSY"
        self._next_retry_ts = time.time() + self._retry_backoff

    def _is_benign_stderr(self, line: str) -> bool:
        lowered = line.lower()
        return any(
            token in lowered
            for token in (
                "embedded data buffer parsing failed",
                "zero sequence expected for first frame",
                "still capture image received",
            )
        )

    def camera_state(self) -> str:
        if not self.detected:
            return "OFFLINE"
        if self._busy_reason():
            return "BUSY"
        if self.process and self.process.poll() is None and self._frame is not None:
            return "DETECTED"
        if self.process and self.process.poll() is None:
            return "DETECTED"
        if self._error:
            return "BUSY" if self._busy_reason() else "DETECTED"
        return "DETECTED"

    def camera_message(self) -> str:
        if not self.detected:
            return "Camera not detected by libcamera"
        if self._busy_reason():
            return self._error or "Camera detected but acquisition is blocked"
        if self.process and self.process.poll() is None and self._frame is not None:
            return "Camera detected and streaming"
        if self.process and self.process.poll() is None:
            return "Camera detected, waiting for first frame"
        return "Camera detected and ready"

    def _terminate_process_locked(self) -> None:
        proc = self.process
        self.process = None
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()

    def start(self, force_restart: bool = False) -> bool:
        if not self.detected and not self._detection_checked:
            self.refresh_detection()
        with self._lock:
            if self.process and self.process.poll() is None:
                if not force_restart:
                    return True
                self._terminate_process_locked()
            now = time.time()
            if not force_restart and self._status in {"ERROR", "BUSY"} and now < self._next_retry_ts:
                return False
            self._last_start_attempt = now
            self._stop = False
            self._error = ""
            self._frame = None
            self._frame_ts = 0.0
            command = [
                which("rpicam-vid") or which("libcamera-vid") or "libcamera-vid",
                "--camera",
                str(self.camera_index),
                "-t",
                "0",
                "--nopreview",
                "--codec",
                "mjpeg",
                "--width",
                str(self.width),
                "--height",
                str(self.height),
                "--framerate",
                str(self.fps_target),
                "--quality",
                str(self.quality),
                "--inline",
                "--flush",
                "-o",
                "-",
            ]
            try:
                self.process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0,
                )
            except Exception as exc:
                self._status = "ERROR"
                self._error = f"Unable to start RGB stream: {exc}"
                self._next_retry_ts = now + self._retry_backoff
                self.events.add("RGB_CAM_LEFT", "STREAM_ERROR", self._error, "error")
                self.events.add("RGB_CAM_RIGHT", "STREAM_ERROR", self._error, "error")
                return False

            self._status = "STARTING"
            self._reader_thread = threading.Thread(target=self._read_stdout, daemon=True, name="rgb-stdout")
            self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True, name="rgb-stderr")
            self._reader_thread.start()
            self._stderr_thread.start()
            self.events.add("UC512_MULTIPLEXER", "STREAM_START", "RGB master source started", "info")
            return True

    def stop(self) -> None:
        with self._lock:
            self._stop = True
            self._terminate_process_locked()
            if self._status != "ERROR":
                self._status = "OFFLINE"

    def _read_stdout(self) -> None:
        assert self.process and self.process.stdout
        buffer = b""
        stream = self.process.stdout
        while not self._stop:
            chunk = stream.read(4096)
            if not chunk:
                if self.process and self.process.poll() is not None:
                    break
                time.sleep(0.02)
                continue
            buffer += chunk
            while True:
                start = buffer.find(b"\xff\xd8")
                end = buffer.find(b"\xff\xd9", start + 2)
                if start == -1 or end == -1:
                    if start > 0:
                        buffer = buffer[start:]
                    elif len(buffer) > 1024 * 1024:
                        buffer = buffer[-65536:]
                    break
                frame = buffer[start : end + 2]
                buffer = buffer[end + 2 :]
                with self._condition:
                    self._frame = frame
                    self._frame_ts = time.time()
                    self._frame_seq += 1
                    if self._status != "ERROR":
                        self._status = "ONLINE"
                    self._condition.notify_all()

        with self._condition:
            if self._status != "ERROR":
                self._status = "OFFLINE"
                self._condition.notify_all()
            if not self._stop:
                if self._status != "BUSY":
                    self._error = "RGB source stopped unexpectedly."
                    self.events.add("UC512_MULTIPLEXER", "STREAM_STOP", self._error, "warning")

    def _read_stderr(self) -> None:
        assert self.process and self.process.stderr
        for raw_line in self.process.stderr:
            if self._stop:
                break
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            if self._is_benign_stderr(line):
                self._stderr_tail.append(line)
                LOGGER.debug("rgb-source: %s", line)
                continue
            self._stderr_tail.append(line)
            lowered = line.lower()
            if "error" in lowered or "failed" in lowered or "timeout" in lowered:
                if "busy" in lowered or "failed to acquire" in lowered:
                    LOGGER.warning("rgb-source busy: %s", line)
                    self._mark_busy(line)
                else:
                    LOGGER.error("rgb-source error: %s", line)
                    self._error = line
                    self._status = "ERROR"
                    self._next_retry_ts = time.time() + self._retry_backoff
                self.events.add("UC512_MULTIPLEXER", "STREAM_ERROR", line, "error")
            else:
                LOGGER.info("rgb-source: %s", line)

    def any_enabled(self) -> bool:
        return any(self.enabled_feeds.values())

    def set_enabled(self, feed_name: str, enabled: bool) -> None:
        self.enabled_feeds[feed_name] = enabled
        self.events.add(
            feed_name.upper(),
            "FEED_ENABLE" if enabled else "FEED_DISABLE",
            f"{feed_name} stream {'enabled' if enabled else 'paused'}",
            "info",
        )
        if enabled:
            self.start(force_restart=True)
        elif not self.any_enabled():
            self.stop()

    def wait_for_frame(self, last_seq: int = 0, timeout: float = 3.0) -> tuple[Optional[bytes], int]:
        if not self.start():
            return None, last_seq
        end = time.time() + timeout
        with self._condition:
            while self._frame_seq <= last_seq and time.time() < end and not self._stop:
                remaining = end - time.time()
                self._condition.wait(timeout=max(0.1, remaining))
            frame = self._frame
            seq = self._frame_seq

        if frame is None and (time.time() - self._last_recovery_attempt) > 5.0:
            if self._status == "BUSY":
                return frame, seq
            self._last_recovery_attempt = time.time()
            self.events.add("UC512_MULTIPLEXER", "STREAM_RECOVERY", "No RGB frame received; restarting camera process", "warning")
            if self.start(force_restart=True):
                end = time.time() + timeout
                with self._condition:
                    while self._frame_seq <= seq and time.time() < end and not self._stop:
                        remaining = end - time.time()
                        self._condition.wait(timeout=max(0.1, remaining))
                    frame = self._frame
                    seq = self._frame_seq

        return frame, seq

    def latest_state(self) -> Dict[str, Any]:
        with self._condition:
            age_ms = int((time.time() - self._frame_ts) * 1000) if self._frame_ts else None
            fps = float(self.fps_target) if self._frame_seq > 1 and self._frame_ts else 0.0
            status = self._status
            if self._frame is not None and self.process and self.process.poll() is None:
                status = "ONLINE"
            return {
                "status": status,
                "camera_state": self.camera_state(),
                "error": self._error,
                "message": self.camera_message(),
                "detected": self.detected,
                "has_frame": self._frame is not None,
                "last_frame_ts": self._frame_ts,
                "last_frame_age_ms": age_ms,
                "fps": fps,
                "camera_index": self.camera_index,
                "width": self.width,
                "height": self.height,
                "process_running": bool(self.process and self.process.poll() is None),
            }

    def read_current_frame(self) -> Optional[bytes]:
        frame, _ = self.wait_for_frame(timeout=2.0)
        return frame

    def ensure_running(self) -> None:
        if self.enabled_feeds and any(self.enabled_feeds.values()):
            self.start()

    def _crop_snapshot(self, frame: bytes, side: str) -> bytes:
        if side not in {"left", "right"}:
            return frame
        crop = "0:0:iw*0.5:ih" if side == "left" else "iw*0.5:0:iw*0.5:ih"
        command = [
            which("ffmpeg") or "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "mjpeg",
            "-i",
            "pipe:0",
            "-vf",
            f"crop={crop}",
            "-frames:v",
            "1",
            "-f",
            "mjpeg",
            "pipe:1",
        ]
        try:
            completed = subprocess.run(command, input=frame, capture_output=True, check=True)
            return completed.stdout or frame
        except Exception:
            LOGGER.exception("Failed to crop RGB snapshot; returning full frame")
            return frame

    def capture_snapshot(self, side: str) -> tuple[bytes, bool]:
        frame = self.read_current_frame()
        if not frame:
            state = self.camera_state()
            label = f"RGB_CAM_{side.upper()} {state}"
            subtitle = self.camera_message()
            return make_placeholder_jpeg(label, subtitle, "#ffbc56" if state == "BUSY" else "#ff7a7a"), False
        return self._crop_snapshot(frame, side), True

    def stream_response(self, feed_name: str, side: str) -> Response:
        def generator():
            seq = 0
            while True:
                if not self.enabled_feeds.get(feed_name, True):
                    yield multipart_frame(make_placeholder_jpeg(f"RGB_CAM_{side.upper()} PAUSED", "Stream paused from dashboard", "#ffbc56"))
                    time.sleep(1.0)
                    continue
                frame, seq = self.wait_for_frame(last_seq=seq, timeout=5.0)
                if not frame:
                    state = self.camera_state()
                    subtitle = self.camera_message()
                    yield multipart_frame(make_placeholder_jpeg(f"RGB_CAM_{side.upper()} {state}", subtitle, "#ffbc56" if state == "BUSY" else "#ff7a7a"))
                    time.sleep(1.0)
                    continue
                yield multipart_frame(frame)

        return Response(generator(), mimetype="multipart/x-mixed-replace; boundary=frame")


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
        self._capture_lock = threading.Lock()
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
        if shutil.which("v4l2-ctl") is None:
            return []
        result = subprocess.run(["v4l2-ctl", "--list-devices"], capture_output=True, text=True, timeout=4.0, check=False)
        if result.returncode != 0:
            return []
        candidates: list[Dict[str, Any]] = []
        current_name = ""
        for raw_line in result.stdout.splitlines():
            line = raw_line.rstrip()
            if not line:
                current_name = ""
                continue
            if not line.startswith(("\t", " ")):
                current_name = line
                continue
            device_path = line.strip()
            if device_path.startswith("/dev/video") and self._name_looks_thermal(current_name):
                candidates.append(self._inspect_video_candidate(device_path, current_name, "v4l2-ctl"))
        self.device_candidates.extend(candidates)
        return candidates

    def _discover_with_sysfs(self) -> list[Dict[str, Any]]:
        candidates: list[Dict[str, Any]] = []
        for video_node in sorted(Path("/sys/class/video4linux").glob("video*")):
            name = read_text_file(video_node / "name")
            device_path = f"/dev/{video_node.name}"
            if self._name_looks_thermal(name):
                candidates.append(self._inspect_video_candidate(device_path, name, "sysfs"))
        self.device_candidates.extend(candidates)
        return candidates

    def _inspect_video_candidate(self, device_path: str, name: str, source: str) -> Dict[str, Any]:
        """Record capabilities without opening the device or starting a thermal stream."""
        formats: list[str] = []
        sizes: list[str] = []
        error = ""
        if shutil.which("v4l2-ctl") is not None:
            try:
                result = subprocess.run(
                    ["v4l2-ctl", "-d", device_path, "--list-formats-ext"],
                    capture_output=True,
                    text=True,
                    timeout=3.0,
                    check=False,
                )
                output = result.stdout or ""
                formats = sorted(set(re.findall(r"'([^']+)'", output)))
                sizes = sorted(set(re.findall(r"Size:\s+Discrete\s+(\d+x\d+)", output, flags=re.IGNORECASE)))
                if result.returncode != 0:
                    error = (result.stderr or "capability query failed").strip()
            except (OSError, subprocess.SubprocessError) as exc:
                error = str(exc)
        normalized_formats = {item.lower() for item in formats}
        return {
            "path": device_path,
            "name": name,
            "source": source,
            "formats": formats,
            "sizes": sizes,
            "supports_y16": "y16 " in normalized_formats or "y16" in normalized_formats,
            "supports_configured_size": self.video_size.lower() in {item.lower() for item in sizes},
            "error": error,
        }

    def _select_thermal_candidate(self, candidates: list[Dict[str, Any]]) -> str:
        """Prefer the node that exposes radiometric Y16 at the configured size."""
        def score(candidate: Dict[str, Any]) -> tuple[int, int, int]:
            path_match = re.search(r"(\d+)$", str(candidate.get("path", "")))
            node_number = int(path_match.group(1)) if path_match else 9999
            return (
                int(bool(candidate.get("supports_y16"))),
                int(bool(candidate.get("supports_configured_size"))),
                -node_number,
            )

        selected = max(candidates, key=score)
        for candidate in candidates:
            candidate["selected"] = candidate is selected
        return str(selected["path"])

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
        name_path = Path("/sys/class/video4linux") / Path(device_path).name / "name"
        return self._name_looks_thermal(read_text_file(name_path))

    @staticmethod
    def _name_looks_thermal(name: str) -> bool:
        normalized = str(name or "").lower()
        return any(token in normalized for token in ("purethermal", "pure thermal", "flir", "lepton"))

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
        if self._worker_started or not self.enabled or self.mode != "real" or not self.detected:
            if not self._worker_started:
                LOGGER.info(
                    "THERMAL start skipped enabled=%s mode=%s detected=%s status=%s",
                    self.enabled,
                    self.mode,
                    self.detected,
                    self.status,
                )
            return
        if time.time() < self._retry_after:
            LOGGER.info("THERMAL start deferred retry_after=%.3f now=%.3f", self._retry_after, time.time())
            return
        cpu_temperature = read_cpu_temperature()
        if cpu_temperature is not None and cpu_temperature >= self._max_cpu_temperature:
            self.status = "COOLDOWN"
            self.error = f"Thermal capture paused: Raspberry CPU temperature is {cpu_temperature:.1f} C"
            self._retry_after = time.time() + self._retry_delay_seconds
            LOGGER.warning("THERMAL start blocked reason=cpu_temperature temperature=%.1f limit=%.1f", cpu_temperature, self._max_cpu_temperature)
            return
        self._worker_started = True
        LOGGER.info(
            "THERMAL worker launch device=%s input_format=%s video_size=%s cpu_temperature=%s",
            self.device,
            self.input_format,
            self.video_size,
            cpu_temperature,
        )
        threading.Thread(target=self._real_worker_loop, daemon=True, name="thermal-real-worker").start()

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

    def _v4l2_stream_command(self) -> list[str]:
        width, height = self._video_dimensions()
        return [
            shutil.which("v4l2-ctl") or "v4l2-ctl",
            f"--device={self.device}",
            f"--set-fmt-video=width={width},height={height},pixelformat=Y16 ",
            "--stream-mmap=3",
            "--stream-count=1000000000",
            "--stream-to=-",
        ]

    @staticmethod
    def _read_raw_frame(stream: Any, frame_size: int) -> bytes:
        chunks: list[bytes] = []
        remaining = frame_size
        while remaining > 0:
            chunk = stream.read(remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def _capture_y16_matrix(self) -> np.ndarray:
        """Capture one frame and close V4L2 cleanly after each transaction.

        PureThermal on the target Raspberry reliably completes one-frame FFmpeg
        captures, while a long-lived FFmpeg stdout pipe can remain open without
        ever delivering its first frame. Keeping the transaction bounded also
        prevents a failed reader from retaining /dev/video0 between retries.
        """
        process: subprocess.Popen[bytes] | None = None
        with self._capture_lock:
            try:
                process = subprocess.Popen(
                    self._single_frame_command(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                self._stream_process = process
                stdout, stderr_bytes = process.communicate(timeout=4.0)
            except subprocess.TimeoutExpired:
                if process is not None:
                    process.kill()
                    stdout, stderr_bytes = process.communicate()
                else:
                    stdout, stderr_bytes = b"", b""
                raise RuntimeError("thermal single-frame capture timed out")
            finally:
                self._stream_process = None
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
            self._stream_attempt_count += 1
            attempt = self._stream_attempt_count
            attempt_started = time.monotonic()
            try:
                self.device = current_device
                command = self._v4l2_stream_command()
                if attempt <= 5 or attempt % 10 == 0:
                    LOGGER.info("THERMAL V4L2 stream attempt=%s device=%s command=%r", attempt, current_device, command)
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=0,
                )
                self._stream_process = process
                self.status = "STARTING" if not saw_frame else "REAL"
                if not saw_frame:
                    self.error = "Waiting for first thermal frame from PureThermal"
                assert process.stdout is not None
                while not self._stop_event.is_set():
                    payload = self._read_raw_frame(process.stdout, frame_size)
                    if len(payload) < frame_size:
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
                            "THERMAL first frame received attempt=%s device=%s bytes=%s elapsed=%.3fs frame_seq=%s backend=v4l2-ctl",
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
                if process and process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=1.0)
                    except subprocess.TimeoutExpired:
                        process.kill()
                self._stream_process = None
        self._worker_started = False
        LOGGER.info("THERMAL worker stopped attempts=%s frame_seq=%s last_error=%r", self._stream_attempt_count, self.frame_seq, self.error)

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
        return {
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
