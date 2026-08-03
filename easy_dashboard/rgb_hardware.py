from __future__ import annotations

import io
import logging
import subprocess
import threading
import time
from collections import deque
from typing import Any, Dict, Optional

import numpy as np
from flask import Response
from PIL import Image

from .media import make_placeholder_jpeg, multipart_frame
from .rgb_capture import RgbCaptureCommands, RgbCaptureSettings, split_mjpeg_buffer
from .runtime_status import build_rgb_state_contract
from .stores import EventStore
from .system_probe import SystemProbe
from .utils import which


LOGGER = logging.getLogger("easy-dashboard")


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
        self.crop_ratio = min(0.9, max(0.1, float(config["rgb"].get("crop_ratio", 0.5))))
        self._commands = RgbCaptureCommands(
            RgbCaptureSettings(
                camera_index=self.camera_index,
                width=self.width,
                height=self.height,
                fps=self.fps_target,
                quality=self.quality,
            )
        )
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
        self._thermal_pause_requested = False
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
                proc.wait(timeout=2)

    def start(self, force_restart: bool = False) -> bool:
        if not self.detected and not self._detection_checked:
            self.refresh_detection()
        with self._lock:
            if self._thermal_pause_requested and not force_restart:
                return False
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
            command = self._commands.stream(which("rpicam-vid") or which("libcamera-vid") or "libcamera-vid")
            try:
                self.process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    bufsize=0,
                    start_new_session=True,
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

    def pause_for_thermal(self) -> None:
        """Release the shared V4L2 fabric for one thermal transaction."""
        with self._lock:
            self._thermal_pause_requested = True
            self._stop = True
            self._terminate_process_locked()
            reader = self._reader_thread
            stderr = self._stderr_thread
        for thread in (reader, stderr):
            if thread and thread is not threading.current_thread():
                thread.join(timeout=2.0)
        # libcamera may keep the media pipeline busy briefly after SIGTERM.
        time.sleep(1.0)

    def resume_after_thermal(self) -> None:
        """Resume RGB after PureThermal has closed its transaction."""
        time.sleep(1.0)
        with self._lock:
            self._thermal_pause_requested = False
        if self.any_enabled():
            self.start(force_restart=True)

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
            frames, buffer = split_mjpeg_buffer(buffer)
            for frame in frames:
                self._store_frame(frame)

        with self._condition:
            if self._status != "ERROR":
                self._status = "OFFLINE"
                self._condition.notify_all()
            if not self._stop:
                if self._status != "BUSY":
                    self._error = "RGB source stopped unexpectedly."
                    self.events.add("UC512_MULTIPLEXER", "STREAM_STOP", self._error, "warning")

    def _store_frame(self, frame: bytes) -> None:
        with self._condition:
            # libcamera can report a transient timeout while recovering
            # internally. A subsequent valid frame is the authoritative
            # signal that the shared RGB source is healthy again.
            self._error = ""
            self._next_retry_ts = 0.0
            self._frame = frame
            self._frame_ts = time.time()
            self._frame_seq += 1
            self._status = "ONLINE"
            self._condition.notify_all()

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
            payload = {
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
            payload["runtime_state"] = build_rgb_state_contract(payload, enabled=self.any_enabled())
            return payload

    def read_current_frame(self) -> Optional[bytes]:
        frame, _ = self.wait_for_frame(timeout=2.0)
        return frame

    def ensure_running(self) -> None:
        if self.enabled_feeds and any(self.enabled_feeds.values()):
            self.start()

    def _crop_snapshot(self, frame: bytes, side: str) -> bytes:
        if side not in {"left", "right"}:
            return frame
        try:
            with Image.open(io.BytesIO(frame)) as source:
                image = source.convert("RGB")
                split_x = max(1, min(image.width - 1, int(round(image.width * self.crop_ratio))))
                bounds = (0, 0, split_x, image.height) if side == "left" else (split_x, 0, image.width, image.height)
                cropped = image.crop(bounds)
                output = io.BytesIO()
                cropped.save(output, format="JPEG", quality=self.quality)
                return output.getvalue()
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

    def focus_score(self, side: str) -> Dict[str, Any]:
        """Sharpness estimate (Laplacian variance) to help manually focus a fixed lens.

        There is no motorized focus actuator on this camera module, so this is a
        live assist for turning the lens ring by hand, not autofocus.
        """
        frame = self.read_current_frame()
        if not frame:
            return {"ok": False, "error": "No RGB frame available", "score": None}
        try:
            cropped = self._crop_snapshot(frame, side)
            with Image.open(io.BytesIO(cropped)) as image:
                gray = image.convert("L")
                gray.thumbnail((480, 480))
                array = np.asarray(gray, dtype=np.float64)
            laplacian = (
                -4.0 * array[1:-1, 1:-1]
                + array[:-2, 1:-1]
                + array[2:, 1:-1]
                + array[1:-1, :-2]
                + array[1:-1, 2:]
            )
            return {"ok": True, "side": side, "score": round(float(laplacian.var()), 2)}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "score": None}

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

