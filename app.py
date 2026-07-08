#!/usr/bin/env python3
from __future__ import annotations

import atexit
import io
import json
import logging
import os
import random
import shutil
import socket
import subprocess
import threading
import time
from datetime import datetime, timezone
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

import psutil
from flask import Flask, Response, jsonify, redirect, render_template, request, send_file
from PIL import Image, ImageDraw
import numpy as np

from detection_manager import DetectionManager
from event_manager import EventManager
from inference_worker import InferenceWorker, find_first_image
from session_manager import SessionManager
from source_manager import SourceManager


PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
LOG_DIR = DATA_DIR / "logs"
REPORT_DIR = DATA_DIR / "reports"
CAPTURES_DIR = DATA_DIR / "captures"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
RGB_LEFT_DIR = CAPTURES_DIR / "rgb_left"
RGB_RIGHT_DIR = CAPTURES_DIR / "rgb_right"
THERMAL_DIR = CAPTURES_DIR / "thermal"
SNAPSHOT_FEED_MAP = {
    "rgb_left": {"label": "RGB Left", "source": "RGB_CAM_LEFT", "folder": "rgb_left"},
    "rgb_right": {"label": "RGB Right", "source": "RGB_CAM_RIGHT", "folder": "rgb_right"},
    "thermal": {"label": "Thermal", "source": "THERMAL_FLIR", "folder": "thermal"},
}
PRELIGHT_REPORT = REPORT_DIR / "preflight_report.txt"
EVENTS_LOG = LOG_DIR / "events.jsonl"
CONFIG_PATH = PROJECT_ROOT / "config.yaml"

for directory in (
    DATA_DIR,
    LOG_DIR,
    REPORT_DIR,
    CAPTURES_DIR,
    SNAPSHOTS_DIR,
    RGB_LEFT_DIR,
    RGB_RIGHT_DIR,
    THERMAL_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)
for feed_name, feed_meta in SNAPSHOT_FEED_MAP.items():
    (SNAPSHOTS_DIR / feed_meta["folder"]).mkdir(parents=True, exist_ok=True)


_RESAMPLE = getattr(Image, "Resampling", Image)
RESAMPLE_BICUBIC = getattr(_RESAMPLE, "BICUBIC", Image.BICUBIC)
RESAMPLE_NEAREST = getattr(_RESAMPLE, "NEAREST", Image.NEAREST)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
LOGGER = logging.getLogger("easy-dashboard")


DEFAULT_CONFIG: Dict[str, Any] = {
    "app": {"host": "0.0.0.0", "port": 5000, "debug": False},
    "rgb": {
        "enabled": True,
        "mode": "split_stereo",
        "camera_index": 0,
        "width": 1280,
        "height": 480,
        "fps": 10,
        "quality": 85,
        "crop_ratio": 0.5,
    },
    "thermal": {
        "enabled": True,
        "mode": "real",
        "threshold_celsius": 35.0,
        "delta_threshold": 8.0,
        "device": "/dev/video0",
    },
    "events": {"max_events": 200},
}


NAV_ITEMS = [
    {"key": "live", "label": "Live", "href": "/"},
    {"key": "detections", "label": "Rilevazioni", "href": "/thermal-events"},
    {"key": "log", "label": "Log", "href": "/snapshots"},
    {"key": "system", "label": "Sistema", "href": "/system-diagnostics"},
]


def _coerce_scalar(raw: str) -> Any:
    value = raw.strip()
    lower = value.lower()
    if lower in {"true", "yes", "on"}:
        return True
    if lower in {"false", "no", "off"}:
        return False
    if lower in {"null", "none", "~"}:
        return None
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value.strip("\"'")


def load_simple_yaml(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    root: Dict[str, Any] = {}
    stack: list[tuple[int, Dict[str, Any]]] = [(0, root)]
    for raw_line in path.read_text().splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        while len(stack) > 1 and indent < stack[-1][0]:
            stack.pop()
        current = stack[-1][1]
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not value:
            child: Dict[str, Any] = {}
            current[key] = child
            stack.append((indent + 2, child))
        else:
            current[key] = _coerce_scalar(value)
    return root


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def draw_rounded_box(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, *, fill=None, outline=None, width: int = 1) -> None:
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    else:
        draw.rectangle(box, fill=fill, outline=outline, width=width)


def load_config() -> Dict[str, Any]:
    return deep_merge(DEFAULT_CONFIG, load_simple_yaml(CONFIG_PATH))


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def rome_now_iso() -> str:
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo("Europe/Rome")).isoformat(timespec="seconds")
    except Exception:
        return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def human_uptime(seconds: int) -> str:
    hours, rem = divmod(max(0, seconds), 3600)
    minutes, secs = divmod(rem, 60)
    days, hours = divmod(hours, 24)
    if days:
        return f"{days}d {hours}h {minutes}m {secs}s"
    return f"{hours}h {minutes}m {secs}s"


def run_command(command: Iterable[str], timeout: int = 8) -> tuple[int, str]:
    try:
        completed = subprocess.run(
            list(command),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = (completed.stdout or "") + (completed.stderr or "")
        return completed.returncode, output.strip()
    except Exception as exc:  # pragma: no cover - defensive
        return 1, f"{type(exc).__name__}: {exc}"


def which(command: str) -> Optional[str]:
    from shutil import which as _which

    return _which(command)


def read_text_file(path: Path) -> str:
    try:
        return path.read_text().strip()
    except Exception:
        return ""


def read_cpu_temperature() -> Optional[float]:
    temp_path = Path("/sys/class/thermal/thermal_zone0/temp")
    try:
        raw = temp_path.read_text().strip()
        return round(int(raw) / 1000.0, 1)
    except Exception:
        return None


def get_hostname() -> str:
    try:
        return socket.gethostname()
    except Exception:
        return "unknown"


def get_ip_address() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip_addr = sock.getsockname()[0]
        sock.close()
        return ip_addr
    except OSError:
        return "127.0.0.1"


def get_boot_seconds() -> int:
    return int(time.time() - psutil.boot_time())


def safe_device_listing(pattern: str) -> list[str]:
    import glob

    return sorted(glob.glob(pattern))


def build_placeholder_svg(title: str, subtitle: str, accent: str = "#26d0b2") -> bytes:
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 480" role="img" aria-label="{title}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#09111a"/>
      <stop offset="100%" stop-color="#193040"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{accent}"/>
      <stop offset="100%" stop-color="#ffbc56"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="480" fill="url(#bg)"/>
  <rect x="40" y="40" width="1200" height="400" rx="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)"/>
  <text x="80" y="150" fill="#f4f8fb" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="700">{title}</text>
  <text x="80" y="215" fill="#9bb2c2" font-family="DejaVu Sans, Arial, sans-serif" font-size="28">{subtitle}</text>
  <rect x="80" y="275" width="1120" height="22" rx="11" fill="rgba(255,255,255,0.08)"/>
  <rect x="80" y="275" width="760" height="22" rx="11" fill="url(#accent)"/>
  <text x="80" y="355" fill="#9bb2c2" font-family="DejaVu Sans, Arial, sans-serif" font-size="22">EASY Maritime Awareness</text>
</svg>"""
    return svg.encode("utf-8")


def make_thermal_svg(stats: Dict[str, Any]) -> bytes:
    width = 640
    height = 360
    cols = 16
    rows = 12
    temp_map = stats.get("matrix") or []
    if not temp_map:
        temp_map = [[24.0 for _ in range(cols)] for _ in range(rows)]
    flat = [value for row in temp_map for value in row]
    min_t = stats.get("min_c", min(flat))
    max_t = stats.get("max_c", max(flat))
    avg_t = stats.get("avg_c", sum(flat) / len(flat))
    cell_w = width / cols
    cell_h = height / rows
    rects = []

    def lerp(a: float, b: float, t: float) -> float:
        return a + (b - a) * t

    def color_for(temp: float) -> str:
        span = max(0.1, max_t - min_t)
        t = max(0.0, min(1.0, (temp - min_t) / span))
        r = int(lerp(0x14, 0xFF, t))
        g = int(lerp(0x5A, 0x68, t))
        b = int(lerp(0xA0, 0x2C, t))
        return f"#{r:02x}{g:02x}{b:02x}"

    for y, row in enumerate(temp_map):
        for x, temp in enumerate(row):
            rects.append(
                f'<rect x="{x * cell_w:.1f}" y="{y * cell_h:.1f}" width="{cell_w + 0.4:.1f}" '
                f'height="{cell_h + 0.4:.1f}" fill="{color_for(temp)}"/>'
            )
    anomaly = stats.get("anomaly_active", False)
    badge_fill = "#ff7a7a" if anomaly else "#26d0b2"
    badge_text = "THERMAL_ANOMALY" if anomaly else "THERMAL_OK"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">
  <rect width="{width}" height="{height}" fill="#09111a"/>
  {''.join(rects)}
  <rect x="10" y="10" width="220" height="32" rx="16" fill="{badge_fill}" opacity="0.9"/>
  <text x="22" y="32" fill="#051018" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="700">{badge_text}</text>
  <rect x="10" y="308" width="620" height="42" rx="12" fill="rgba(0,0,0,0.50)"/>
  <text x="24" y="333" fill="#f4f8fb" font-family="DejaVu Sans, Arial, sans-serif" font-size="14">
    min {min_t:.1f} C | avg {avg_t:.1f} C | max {max_t:.1f} C | threshold {stats.get("threshold_celsius", 35.0):.1f} C
  </text>
</svg>"""
    return svg.encode("utf-8")


def make_placeholder_jpeg(title: str, subtitle: str, accent: str = "#26d0b2") -> bytes:
    image = Image.new("RGB", (1280, 480), (9, 17, 26))
    draw = ImageDraw.Draw(image)
    draw_rounded_box(draw, (40, 40, 1240, 440), radius=24, fill=(20, 34, 46), outline=(33, 70, 93), width=2)
    draw_rounded_box(draw, (80, 275, 1200, 297), radius=11, fill=(255, 255, 255))
    draw_rounded_box(draw, (80, 275, 840, 297), radius=11, fill=(38, 208, 178) if accent == "#26d0b2" else (255, 122, 122))
    draw.text((80, 110), title, fill=(244, 248, 251))
    draw.text((80, 178), subtitle, fill=(155, 178, 194))
    draw.text((80, 345), "EASY Maritime Awareness", fill=(155, 178, 194))
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=90)
    return out.getvalue()


class EventStore:
    def __init__(self, path: Path, limit: int = 200) -> None:
        self.path = path
        self.limit = limit
        self._lock = threading.Lock()
        self._events: deque[Dict[str, Any]] = deque(maxlen=limit)
        self._load_existing()

    def _load_existing(self) -> None:
        if not self.path.exists():
            return
        try:
            with self.path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    event = json.loads(line)
                    self._events.append(event)
        except Exception:
            LOGGER.exception("Failed to load existing events log")

    def add(self, source: str, event_type: str, description: str, severity: str = "info", meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        meta = meta or {}
        action_map = {
            "STREAM_ERROR": "Controlla processo camera e riavvia lo stream se resta fermo.",
            "SNAPSHOT_ERROR": "Ripeti lo snapshot; se ricapita controlla spazio disco e stato feed.",
            "NOT_DETECTED": "Controlla cavo, alimentazione e device video.",
            "THERMAL_HOTSPOT": "Verifica la scena termica e confronta con RGB.",
            "INFERENCE_START": "Verifica runtime/replay e attendi i primi risultati AI.",
            "INFERENCE_STOP": "Riattiva il worker se la demo AI deve continuare.",
            "INFERENCE_ERROR": "Controlla runtime/models, runtime/config e la disponibilità di onnxruntime.",
            "DETECTED": "Apri runtime/sessions e verifica le rilevazioni AI annotate.",
            "SESSION_START": "La sessione è attiva: acquisizioni e detection verranno archiviate.",
            "SESSION_STOP": "Sessione fermata. Puoi consultare l'archivio in runtime/sessions.",
            "DETECTION_NEW": "Detection registrata nel manager e nella sessione corrente.",
            "SOURCE_SELECT": "La sorgente è stata aggiornata nel Source Manager.",
            "SOURCE_SELECT_FAILED": "Verifica che la sorgente richiesta esista ancora.",
            "SOURCE_REFRESH": "La registry delle sorgenti è stata aggiornata.",
        }
        event = {
            "id": f"{int(time.time() * 1000)}-{len(self._events)}",
            "timestamp": utc_now_iso(),
            "source": source,
            "type": event_type,
            "description": description,
            "severity": severity,
            "action": meta.get("action") or action_map.get(event_type, "Nessuna azione richiesta."),
            "meta": meta,
        }
        with self._lock:
            self._events.append(event)
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        return event

    def list(self, limit: int = 50) -> list[Dict[str, Any]]:
        with self._lock:
            return list(self._events)[-limit:]


class SnapshotStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self._lock = threading.Lock()
        self.root.mkdir(parents=True, exist_ok=True)
        for feed_name, feed_meta in SNAPSHOT_FEED_MAP.items():
            (self.root / feed_meta["folder"]).mkdir(parents=True, exist_ok=True)

    def _feed_meta(self, feed: str) -> Dict[str, str]:
        if feed not in SNAPSHOT_FEED_MAP:
            raise KeyError(feed)
        return SNAPSHOT_FEED_MAP[feed]

    def _feed_dir(self, feed: str) -> Path:
        return self.root / self._feed_meta(feed)["folder"]

    def _snapshot_payload(self, path: Path, feed: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        stat = path.stat()
        feed_meta = self._feed_meta(feed)
        payload_meta = meta or {}
        payload = {
            "feed": feed,
            "feed_label": feed_meta["label"],
            "source": feed_meta["source"],
            "filename": path.name,
            "path": str(path),
            "url": f"/snapshots/{feed}/{path.name}",
            "download_url": f"/snapshots/{feed}/{path.name}?download=1",
            "created_ts": stat.st_mtime,
            "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(stat.st_mtime)),
            "size_bytes": stat.st_size,
            "meta": payload_meta,
        }
        sidecar = path.with_suffix(".json")
        if sidecar.exists():
            try:
                payload["meta"] = json.loads(sidecar.read_text())
            except Exception:
                LOGGER.exception("Failed to read snapshot metadata sidecar: %s", sidecar)
        return payload

    def save(self, feed: str, frame: bytes, *, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        feed_dir = self._feed_dir(feed)
        stamp = time.strftime("%Y%m%d_%H%M%S")
        suffix_ms = int((time.time() % 1) * 1000)
        filename = f"{stamp}_{suffix_ms:03d}_{feed}.jpg"
        path = feed_dir / filename
        sidecar = path.with_suffix(".json")
        payload_meta = meta or {}
        payload_meta.setdefault("saved_at", utc_now_iso())
        payload_meta.setdefault("feed", feed)
        payload_meta.setdefault("feed_label", self._feed_meta(feed)["label"])
        with self._lock:
            path.write_bytes(frame)
            sidecar.write_text(json.dumps(payload_meta, ensure_ascii=False, indent=2))
        return self._snapshot_payload(path, feed, payload_meta)

    def list_recent(self, limit: int = 24) -> list[Dict[str, Any]]:
        entries: list[Dict[str, Any]] = []
        for feed, feed_meta in SNAPSHOT_FEED_MAP.items():
            feed_dir = self.root / feed_meta["folder"]
            if not feed_dir.exists():
                continue
            for image_path in feed_dir.glob("*.jpg"):
                try:
                    entries.append(self._snapshot_payload(image_path, feed))
                except Exception:
                    LOGGER.exception("Failed to inspect snapshot: %s", image_path)
        entries.sort(key=lambda item: item.get("created_ts", 0.0), reverse=True)
        return entries[:limit]

    def summary(self) -> Dict[str, Any]:
        recent = self.list_recent(999)
        by_feed: Dict[str, Dict[str, Any]] = {}
        for feed, feed_meta in SNAPSHOT_FEED_MAP.items():
            items = [item for item in recent if item["feed"] == feed]
            total_size = sum(int(item.get("size_bytes") or 0) for item in items)
            by_feed[feed] = {
                "label": feed_meta["label"],
                "count": len(items),
                "size_bytes": total_size,
                "latest": items[0] if items else None,
            }
        return {
            "count": len(recent),
            "size_bytes": sum(int(item.get("size_bytes") or 0) for item in recent),
            "by_feed": by_feed,
            "latest": recent[0] if recent else None,
            "root": str(self.root),
        }

    def get_path(self, feed: str, filename: str) -> Path:
        feed_dir = self._feed_dir(feed)
        candidate = (feed_dir / filename).resolve()
        if feed_dir.resolve() not in candidate.parents and candidate != feed_dir.resolve():
            raise ValueError("Invalid snapshot path")
        return candidate


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
    def __init__(self, config: Dict[str, Any], events: EventStore, probe: SystemProbe) -> None:
        self.config = config
        self.events = events
        self.probe = probe
        self.camera_list_output = probe.camera_list()
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
        self.detected = self._camera_detected()

    def _camera_detected(self) -> bool:
        output = self.camera_list_output.lower()
        return "imx477" in output or "arducam" in output or ("available cameras" in output and "no cameras available" not in output)

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
            fps = 0.0
            if self._frame_seq > 1 and self._frame_ts:
                fps = float(self.fps_target)
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
        crop_ratio = float(self.config["rgb"].get("crop_ratio", 0.5))
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
                    yield _multipart_frame(
                        make_placeholder_jpeg(
                            f"RGB_CAM_{side.upper()} PAUSED",
                            "Stream paused from dashboard",
                            "#ffbc56",
                        )
                    )
                    time.sleep(1.0)
                    continue
                frame, seq = self.wait_for_frame(last_seq=seq, timeout=5.0)
                if not frame:
                    state = self.camera_state()
                    subtitle = self.camera_message()
                    yield _multipart_frame(
                        make_placeholder_jpeg(
                            f"RGB_CAM_{side.upper()} {state}",
                            subtitle,
                            "#ffbc56" if state == "BUSY" else "#ff7a7a",
                        )
                    )
                    time.sleep(1.0)
                    continue
                yield _multipart_frame(frame)

        return Response(generator(), mimetype="multipart/x-mixed-replace; boundary=frame")


def _multipart_frame(jpeg_bytes: bytes) -> bytes:
    return b"--frame\r\nContent-Type: image/jpeg\r\nCache-Control: no-cache\r\n\r\n" + jpeg_bytes + b"\r\n"


class ThermalState:
    def __init__(self, config: Dict[str, Any], events: EventStore) -> None:
        self.config = config
        self.events = events
        self.mode = str(config["thermal"].get("mode", "mock")).lower()
        self.enabled = bool(config["thermal"].get("enabled", True))
        self.device = str(os.environ.get("EASY_THERMAL_DEVICE") or config["thermal"].get("device", "/dev/video0"))
        self.threshold_celsius = float(config["thermal"].get("threshold_celsius", 35.0))
        self.delta_threshold = float(config["thermal"].get("delta_threshold", 8.0))
        self.detected = False
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
        self._worker_started = False
        self._stop_event = threading.Event()
        self._stream_process: Optional[subprocess.Popen[bytes]] = None

    def start(self) -> None:
        if self._worker_started or not self.enabled or self.mode != "real" or not self.detected:
            return
        self._worker_started = True
        threading.Thread(target=self._real_worker_loop, daemon=True, name="thermal-real-worker").start()

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
                draw_rounded_box(
                    draw,
                    (left + 2, top + 2, right - 2, bottom - 2),
                    radius=12,
                    outline=color,
                    width=4,
                )
        for x in range(1, 16):
            px = int(x * cell_w)
            draw.line((px, 0, px, 360), fill=(235, 246, 255), width=1)
        for y in range(1, 12):
            py = int(y * cell_h)
            draw.line((0, py, 640, py), fill=(235, 246, 255), width=1)
        draw_rounded_box(
            draw,
            (12, 12, 240, 48),
            radius=14,
            fill=(255, 122, 122) if self._anomaly_active else (38, 208, 178),
        )
        draw.text((24, 20), "ALLARME TERMICO" if self._anomaly_active else "TERMICO OK", fill=(8, 19, 30))
        footer = (
            f"min {min_t:.1f} C | avg {float(temp_map.mean()):.1f} C | max {max_t:.1f} C | "
            f"soglia {self.threshold_celsius:.1f} C"
        )
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

    def _capture_y16_matrix(self) -> np.ndarray:
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "v4l2",
            "-input_format",
            "gray16le",
            "-video_size",
            "160x120",
            "-i",
            self.device,
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "pipe:1",
        ]
        with self._capture_lock:
            result = subprocess.run(command, capture_output=True, timeout=3.0, check=False)
        expected_bytes = 160 * 120 * 2
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(stderr or f"ffmpeg exited with code {result.returncode}")
        if len(result.stdout) < expected_bytes:
            raise RuntimeError(f"incomplete thermal frame: {len(result.stdout)} bytes")
        raw = np.frombuffer(result.stdout[:expected_bytes], dtype="<u2").reshape((120, 160))
        return raw.astype(np.float32)

    def _stream_command(self) -> list[str]:
        ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        return [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "v4l2",
            "-framerate",
            "9",
            "-input_format",
            "gray16le",
            "-video_size",
            "160x120",
            "-i",
            self.device,
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray16le",
            "pipe:1",
        ]

    @staticmethod
    def _read_exact(stream: Any, size: int) -> bytes:
        chunks = []
        remaining = size
        while remaining > 0:
            chunk = stream.read(remaining)
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

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
            draw_rounded_box(
                draw,
                (max(2, left), max(2, top), min(638, right), min(478, bottom)),
                radius=10,
                outline=(255, 74, 74) if anomaly_active else (255, 196, 84),
                width=4,
            )

        draw_rounded_box(
            draw,
            (12, 12, 286, 52),
            radius=14,
            fill=(255, 122, 122) if anomaly_active else (38, 208, 178),
        )
        draw.text((24, 23), "ALLARME HOTSPOT" if anomaly_active else "TERMICA REALE", fill=(8, 19, 30))
        footer = (
            f"PureThermal {self.device} | segnale raw min {int(raw_map.min())} "
            f"avg {int(raw_map.mean())} max {int(raw_map.max())}"
        )
        draw.rectangle((12, 428, 628, 468), fill=(0, 0, 0))
        draw.text((24, 441), footer, fill=(244, 248, 251))
        stats = {
            "raw_min": int(raw_map.min()),
            "raw_max": int(raw_map.max()),
            "raw_avg": int(raw_map.mean()),
            "hotspot_percent": hotspot_percent,
            "signal_spread": signal_spread,
            "anomaly_active": anomaly_active,
            "unit": "raw",
        }
        return image, stats

    def _publish_real_frame(self, raw_map: np.ndarray) -> tuple[bytes, Dict[str, Any]]:
        image, real_stats = self._real_thermal_palette(raw_map)
        self._anomaly_active = bool(real_stats["anomaly_active"])
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=88)
        frame_bytes = output.getvalue()
        stats = {
            "status": "REAL",
            "detected": True,
            "mode": self.mode,
            "fps": 9.0,
            "anomaly_active": real_stats["anomaly_active"],
            "threshold_celsius": self.threshold_celsius,
            "delta_threshold": self.delta_threshold,
            "min_c": None,
            "max_c": None,
            "avg_c": None,
            "raw_min": real_stats["raw_min"],
            "raw_max": real_stats["raw_max"],
            "raw_avg": real_stats["raw_avg"],
            "hotspot_percent": real_stats["hotspot_percent"],
            "signal_spread": real_stats["signal_spread"],
            "unit": "raw",
            "device": self.device,
        }
        with self._frame_lock:
            self.last_frame_bytes = frame_bytes
            self.last_stats = stats
            self.last_frame_ts = time.time()
            self.error = ""
            self.status = "REAL"
        if real_stats["anomaly_active"] and (time.time() - self.last_event_ts) > 8.0:
            self.last_event_ts = time.time()
            self.events.add(
                "THERMAL_FLIR",
                "THERMAL_HOTSPOT",
                f"Hotspot reale: {real_stats['hotspot_percent']:.2f}% frame, raw max {real_stats['raw_max']}",
                "warning",
                meta=real_stats,
            )
        return frame_bytes, stats

    def _real_worker_loop(self) -> None:
        expected_bytes = 160 * 120 * 2
        while not self._stop_event.is_set():
            process: Optional[subprocess.Popen[bytes]] = None
            try:
                process = subprocess.Popen(
                    self._stream_command(),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                self._stream_process = process
                if not process.stdout:
                    raise RuntimeError("thermal stream stdout unavailable")
                while not self._stop_event.is_set():
                    payload = self._read_exact(process.stdout, expected_bytes)
                    if len(payload) != expected_bytes:
                        break
                    raw_map = np.frombuffer(payload, dtype="<u2").reshape((120, 160)).astype(np.float32)
                    self._publish_real_frame(raw_map)
                if process.poll() is not None and process.returncode not in (0, None):
                    stderr = b""
                    if process.stderr:
                        stderr = process.stderr.read(1000)
                    raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or f"ffmpeg exited {process.returncode}")
            except Exception as exc:
                self.error = f"PureThermal stream lento/non leggibile su {self.device}: {exc}"
                self.status = "ERROR"
                LOGGER.warning("Thermal stream worker failed: %s", exc)
                time.sleep(1.0)
            finally:
                if process and process.poll() is None:
                    process.terminate()
                self._stream_process = None

    def frame(self) -> tuple[bytes, Dict[str, Any]]:
        self.frame_seq += 1
        if not self.enabled:
            placeholder = make_placeholder_jpeg(
                "THERMAL_FLIR DISABLED",
                "Thermal pipeline paused in config",
                "#ffbc56",
            )
            self.last_stats = {
                "status": "DISABLED",
                "detected": self.detected,
                "mode": self.mode,
                "fps": 0.0,
                "anomaly_active": False,
                "threshold_celsius": self.threshold_celsius,
                "delta_threshold": self.delta_threshold,
                "min_c": None,
                "max_c": None,
                "avg_c": None,
            }
            return placeholder, self.last_stats

        if self.mode == "real" and not self.detected:
            placeholder = make_placeholder_jpeg(
                "THERMAL_FLIR NOT DETECTED",
                "Real sensor path is reserved but no device is active yet",
                "#ff7a7a",
            )
            self.last_stats = {
                "status": "NOT_DETECTED",
                "detected": False,
                "mode": "real",
                "fps": 0.0,
                "anomaly_active": False,
                "threshold_celsius": self.threshold_celsius,
                "delta_threshold": self.delta_threshold,
                "min_c": None,
                "max_c": None,
                "avg_c": None,
            }
            return placeholder, self.last_stats

        if self.mode == "real":
            self.start()
            with self._frame_lock:
                if self.last_frame_bytes:
                    return self.last_frame_bytes, dict(self.last_stats)
            placeholder = make_placeholder_jpeg(
                "THERMAL_FLIR STARTING",
                f"PureThermal reale in inizializzazione su {self.device}",
                "#26d0b2",
            )
            self.last_stats = {
                "status": "STARTING",
                "detected": self.detected,
                "mode": self.mode,
                "fps": 0.0,
                "anomaly_active": False,
                "threshold_celsius": self.threshold_celsius,
                "delta_threshold": self.delta_threshold,
                "min_c": None,
                "max_c": None,
                "avg_c": None,
                "device": self.device,
                "unit": "raw",
            }
            return placeholder, self.last_stats

        temp_map = self._simulate_matrix()
        min_c = float(temp_map.min())
        max_c = float(temp_map.max())
        avg_c = float(temp_map.mean())
        anomaly_active = (max_c - avg_c) >= self.delta_threshold or max_c >= self.threshold_celsius
        self._anomaly_active = anomaly_active
        self.last_frame_ts = time.time()
        self.last_stats = {
            "status": "MOCK" if self.mode == "mock" else "REAL",
            "detected": self.detected,
            "mode": self.mode,
            "fps": 1.0,
            "anomaly_active": anomaly_active,
            "threshold_celsius": self.threshold_celsius,
            "delta_threshold": self.delta_threshold,
            "min_c": round(min_c, 1),
            "max_c": round(max_c, 1),
            "avg_c": round(avg_c, 1),
            "matrix": temp_map.round(1).tolist(),
        }
        if anomaly_active and (time.time() - self.last_event_ts) > 8.0:
            self.last_event_ts = time.time()
            self.events.add(
                "THERMAL_FLIR",
                "THERMAL_ANOMALY",
                f"Hot region detected: max {max_c:.1f} C, avg {avg_c:.1f} C",
                "warning",
                meta={"min_c": round(min_c, 1), "max_c": round(max_c, 1), "avg_c": round(avg_c, 1)},
            )
        image = self._thermal_palette(temp_map)
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=92)
        return output.getvalue(), self.last_stats

    def snapshot(self) -> tuple[bytes, Dict[str, Any]]:
        frame, stats = self.frame()
        return frame, stats

    def status_payload(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "mode": self.mode,
            "detected": self.detected,
            "status": self.last_stats.get("status", self.status),
            "threshold_celsius": self.threshold_celsius,
            "delta_threshold": self.delta_threshold,
            "fps": self.last_stats.get("fps", 0.0),
            "min_c": self.last_stats.get("min_c"),
            "max_c": self.last_stats.get("max_c"),
            "avg_c": self.last_stats.get("avg_c"),
            "anomaly_active": self.last_stats.get("anomaly_active", False),
            "last_frame_ts": self.last_frame_ts,
            "message": self.error if self.error else ("Mock thermal feed active" if self.mode == "mock" else f"PureThermal reale attivo su {self.device}"),
            "raw_min": self.last_stats.get("raw_min"),
            "raw_max": self.last_stats.get("raw_max"),
            "raw_avg": self.last_stats.get("raw_avg"),
            "hotspot_percent": self.last_stats.get("hotspot_percent"),
            "signal_spread": self.last_stats.get("signal_spread"),
            "unit": self.last_stats.get("unit", "celsius" if self.mode == "mock" else "raw"),
            "device": self.device,
        }


def run_preflight_script() -> None:
    script = PROJECT_ROOT / "preflight_check.sh"
    if not script.exists():
        LOGGER.warning("Preflight script missing: %s", script)
        return
    try:
        subprocess.run(["bash", str(script)], cwd=PROJECT_ROOT, check=False)
    except Exception:
        LOGGER.exception("Failed to run preflight script")


def append_startup_notice(events: EventStore, probe: SystemProbe, config: Dict[str, Any]) -> None:
    events.add(
        "SYSTEM",
        "STARTUP",
        f"EASY dashboard starting on {probe.hostname()} at {probe.ip_address()}",
        "info",
    )
    events.add(
        "SYSTEM",
        "CONFIG",
        f"RGB mode {config['rgb'].get('mode')} | thermal mode {config['thermal'].get('mode')}",
        "info",
    )


def build_camera_inventory(rgb: RgbMasterSource, thermal: ThermalState) -> Dict[str, Any]:
    camera_entries = []
    camera_list_output = rgb.camera_list_output
    for line in camera_list_output.splitlines():
        line = line.strip()
        if line and ":" in line and "Available cameras" not in line:
            camera_entries.append(line)
    rgb_state = rgb.latest_state()
    return {
        "uc512_multiplexer": {
            "logical_name": "UC512_MULTIPLEXER",
            "hardware_name": "Arducam CamArray UC-512",
            "state": rgb_state["camera_state"],
            "status": rgb_state["status"],
            "message": rgb_state["message"],
        },
        "rgb_cameras": [
            {
                "logical_name": "RGB_CAM_LEFT",
                "hardware_name": "Arducam UC-517 LEFT",
                "state": rgb_state["camera_state"],
                "fps": rgb_state["fps"],
                "last_acquisition_ts": rgb_state["last_frame_ts"],
                "error": rgb_state["error"],
                "enabled": rgb.enabled_feeds["rgb_left"],
                "message": rgb_state["message"],
            },
            {
                "logical_name": "RGB_CAM_RIGHT",
                "hardware_name": "Arducam UC-517 RIGHT",
                "state": rgb_state["camera_state"],
                "fps": rgb_state["fps"],
                "last_acquisition_ts": rgb_state["last_frame_ts"],
                "error": rgb_state["error"],
                "enabled": rgb.enabled_feeds["rgb_right"],
                "message": rgb_state["message"],
            },
        ],
        "thermal_camera": {
            "logical_name": "THERMAL_FLIR",
            "hardware_name": "FLIR/Lepton Thermal Sensor",
            "state": "DETECTED" if thermal.detected or thermal.mode == "mock" else "OFFLINE",
            "mode": thermal.mode,
            "status": thermal.status_payload(),
        },
        "camera_tools": SystemProbe().camera_tools(),
        "raw_libcamera_output": camera_list_output,
        "camera_entries": camera_entries,
    }


def build_operations_payload(
    camera_inventory: Dict[str, Any],
    rgb_state: Dict[str, Any],
    thermal_state: Dict[str, Any],
    inference_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    def _stream_status(state: Any, last_ts: Any, *, detected: bool, mode: str = "") -> str:
        state_value = str(state or "").upper()
        mode_value = str(mode or "").lower()
        if mode_value == "mock":
            return "ONLINE"
        if state_value in {"ERROR", "FAILED", "DISABLED", "OFFLINE"}:
            return "OFFLINE"
        if state_value == "NOT_DETECTED":
            return "NOT_DETECTED"
        if detected and last_ts:
            try:
                if time.time() - float(last_ts) <= 5.0:
                    return "ONLINE"
            except Exception:
                pass
            return "OFFLINE"
        return "NOT_DETECTED" if not detected else "OFFLINE"

    rgb_cameras = camera_inventory.get("rgb_cameras", [])
    rgb_left_status = _stream_status(
        rgb_cameras[0]["state"] if rgb_cameras else rgb_state.get("camera_state", "--"),
        rgb_cameras[0].get("last_acquisition_ts") if rgb_cameras else rgb_state.get("last_frame_ts"),
        detected=bool(rgb_cameras[0].get("enabled", True) if rgb_cameras else rgb_state.get("detected")),
    )
    rgb_right_status = _stream_status(
        rgb_cameras[1]["state"] if len(rgb_cameras) > 1 else rgb_state.get("camera_state", "--"),
        rgb_cameras[1].get("last_acquisition_ts") if len(rgb_cameras) > 1 else rgb_state.get("last_frame_ts"),
        detected=bool(rgb_cameras[1].get("enabled", True) if len(rgb_cameras) > 1 else rgb_state.get("detected")),
    )
    thermal_status = _stream_status(
        thermal_state.get("status", "--"),
        thermal_state.get("last_frame_ts"),
        detected=bool(thermal_state.get("detected")),
        mode=str(thermal_state.get("mode", "")).lower(),
    )
    detected_sensors = int(bool(rgb_state.get("detected"))) + int(bool(thermal_state.get("detected") or thermal_state.get("mode") == "mock"))
    online_sensors = int(rgb_left_status == "ONLINE") + int(rgb_right_status == "ONLINE") + int(thermal_status == "ONLINE")
    inference_state = inference_state or {}
    inference_ok = bool(inference_state.get("ok"))
    inference_running = bool(inference_state.get("running"))
    inference_count = int(inference_state.get("count") or 0)
    inference_error = str(inference_state.get("error") or inference_state.get("config_error") or "")
    last_detections = inference_state.get("last_detections")
    if not isinstance(last_detections, list):
        last_detections = []

    attention_level = "LOW"
    attention_reason = "AI inference ready in Replay/Demo mode." if inference_ok else "No active detections pipeline connected."
    attention_tone = "muted"
    if inference_count > 0:
        attention_level = "ELEVATED"
        attention_reason = f"AI detected {inference_count} object{'s' if inference_count != 1 else ''} in the latest replay image."
        attention_tone = "warn"
    if inference_error:
        attention_level = "WATCH"
        attention_reason = inference_error
        attention_tone = "error"
    if thermal_state.get("anomaly_active"):
        attention_level = "ELEVATED"
        attention_reason = "Thermal hotspot flagged by the FLIR pipeline."
        attention_tone = "warn"
    if rgb_state.get("status") in {"ERROR", "BUSY"}:
        attention_level = "WATCH"
        attention_reason = rgb_state.get("error") or "RGB acquisition needs attention."
        attention_tone = "error" if rgb_state.get("status") == "ERROR" else "warn"

    recording_supported = which("ffmpeg") is not None
    pipeline = {
        "fusion": {
            "state": "Preview not connected",
            "supported": False,
            "message": "Multimodal fusion preview. RGB + Thermal fusion will appear here.",
        },
        "inference": {
            "state": "Running" if inference_running else "Ready" if inference_ok else "Error",
            "supported": inference_ok,
            "message": (
                inference_error
                or (
                    f"ONNX Runtime ready. Last run produced {inference_count} detection{'s' if inference_count != 1 else ''}."
                    if inference_count
                    else "ONNX Runtime ready in Replay/Demo mode."
                )
            ),
            "backend": inference_state.get("backend", "onnx"),
            "model_path": inference_state.get("model_path"),
            "last_image": inference_state.get("last_image"),
            "last_inference_ms": inference_state.get("last_inference_ms"),
            "fps": inference_state.get("fps"),
        },
        "recording": {
            "state": "Ready" if recording_supported else "Not available",
            "supported": recording_supported,
            "message": "Recording controls are available from Acquisition.",
        },
        "snapshot": {
            "state": "Ready",
            "supported": True,
            "message": "Snapshot capture is already functional.",
        },
    }
    sensor_health = {
        "online_count": online_sensors,
        "detected_count": detected_sensors,
        "total_count": 3,
        "rgb_left": {
            "state": rgb_left_status,
            "enabled": rgb_cameras[0]["enabled"] if rgb_cameras else True,
        },
        "rgb_right": {
            "state": rgb_right_status,
            "enabled": rgb_cameras[1]["enabled"] if len(rgb_cameras) > 1 else True,
        },
        "thermal": {
            "state": thermal_status,
            "mode": thermal_state.get("mode", "--"),
            "detected": thermal_state.get("detected", False),
        },
    }
    detections = []
    for detection in last_detections:
        detections.append(
            {
                "label": detection.get("class_name") or detection.get("label") or "Detection",
                "confidence": detection.get("confidence"),
                "bbox": detection.get("box_xyxy") or detection.get("bbox"),
                "source": "ai_inference",
                "source_label": detection.get("source_label") or inference_state.get("source_label"),
                "image_path": detection.get("image_path") or inference_state.get("last_image"),
                "state": "detected",
                "message": f"{detection.get('class_name') or 'object'} detected by ONNX Runtime",
            }
        )
    if not detections:
        detections = [
            {
                "label": "No detections yet",
                "confidence": None,
                "source": "ai_inference" if inference_ok else "placeholder",
                "state": "idle",
                "message": "Run Replay/Demo inference to populate detections." if inference_ok else "The AI detection pipeline is not connected.",
            }
        ]
    return {
        "attention": {
            "level": attention_level,
            "tone": attention_tone,
            "reason": attention_reason,
        },
        "detections": detections,
        "sensor_health": sensor_health,
        "pipeline": pipeline,
    }


def build_system_payload(probe: SystemProbe) -> Dict[str, Any]:
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory = probe.memory()
    disk = probe.disk()
    return {
        "hostname": probe.hostname(),
        "ip_address": probe.ip_address(),
        "model": probe.model(),
        "os_release": probe.os_release(),
        "python_version": probe.python_version(),
        "cpu_temperature_c": probe.cpu_temperature(),
        "cpu_percent": cpu_percent,
        "ram": memory,
        "disk": disk,
        "uptime_seconds": get_boot_seconds(),
        "uptime_human": human_uptime(get_boot_seconds()),
        "vcgencmd_get_camera": probe.get_camera(),
    }


def dashboard_context(
    page_key: str,
    page_title: str,
    page_subtitle: str,
    *,
    template_name: str = "index.html",
    hostname: str,
    ip_address: str,
    asset_version: str,
    thermal_device: str,
    thermal_mode: str,
    **extra: Any,
) -> str:
    return render_template(
        template_name,
        page_key=page_key,
        page_title=page_title,
        page_subtitle=page_subtitle,
        nav_items=NAV_ITEMS,
        ip_address=ip_address,
        hostname=hostname,
        asset_version=asset_version,
        thermal_device=thermal_device,
        thermal_mode=thermal_mode,
        **extra,
    )


def create_app() -> Flask:
    config = load_config()
    app = Flask(__name__)
    def asset_version() -> str:
        return str(int(time.time()))
    events = EventStore(EVENTS_LOG, int(config["events"].get("max_events", 200)))
    snapshot_store = SnapshotStore(SNAPSHOTS_DIR)
    probe = SystemProbe()
    thermal = ThermalState(config, events)
    rgb = RgbMasterSource(config, events, probe)
    source_manager = SourceManager(runtime_root=PROJECT_ROOT / "runtime", replay_root=PROJECT_ROOT / "runtime" / "replay", events=events, logger=LOGGER)
    session_manager = SessionManager(events=events, hostname=probe.hostname())
    event_manager = EventManager(events=events, session_manager=session_manager)
    detection_manager = DetectionManager(events=events, session_manager=session_manager, event_manager=event_manager)
    inference = InferenceWorker(events=events, detection_manager=detection_manager, source_manager=source_manager)

    run_preflight_script()
    append_startup_notice(events, probe, config)
    thermal.detected = "PureThermal" in probe.lsusb() or Path(thermal.device).exists()
    if thermal.detected:
        events.add("THERMAL_FLIR", "DETECTED", "Thermal sensor or PureThermal device detected", "info")
    else:
        events.add("THERMAL_FLIR", "NOT_DETECTED", "Thermal sensor not detected; using mock mode", "warning")
    thermal.start()

    rgb.ensure_running()

    @app.context_processor
    def inject_asset_version() -> Dict[str, str]:
        return {"asset_version": asset_version()}

    def _rgb_keepalive() -> None:
        while True:
            time.sleep(5.0)
            rgb.ensure_running()

    threading.Thread(target=_rgb_keepalive, daemon=True, name="rgb-keepalive").start()
    events.add("UC512_MULTIPLEXER", "STREAM_AUTOSTART", "RGB stream started on application boot", "info")

    @app.route("/")
    def index() -> str:
        return dashboard_context(
            "live",
            "Monitor",
            "Streaming live",
            template_name="index.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/mission")
    def mission_page() -> str:
        return redirect("/")

    @app.route("/sensors")
    def sensors_page() -> str:
        return redirect("/")

    @app.route("/thermal-events")
    def thermal_events_page() -> str:
        return dashboard_context(
            "detections",
            "Eventi",
            "Eventi correnti e timeline operativa",
            template_name="thermal_events.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/system-diagnostics")
    def system_diagnostics_page() -> str:
        return dashboard_context(
            "system",
            "Sistema",
            "Stato hardware e dispositivi",
            template_name="system_diagnostics.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/health")
    def health():
        camera_inventory = build_camera_inventory(rgb, thermal)
        system_payload = build_system_payload(probe)
        rgb_state = rgb.latest_state()
        thermal_state = thermal.status_payload()
        inference_state = inference.status()
        sources_state = source_manager.get_status()
        detection_state = detection_manager.get_current_detections()
        session_state = session_manager.status()
        operations_inference_state = dict(inference_state)
        operations_inference_state.update(
            {
                "count": detection_state.get("count", 0),
                "last_detections": detection_state.get("detections", []),
                "last_image": detection_state.get("last_image") or inference_state.get("last_image"),
                "last_run_ts": detection_state.get("last_run_ts") or inference_state.get("last_run_ts"),
                "last_inference_ms": detection_state.get("last_inference_ms") or inference_state.get("last_inference_ms"),
                "fps": detection_state.get("fps") or inference_state.get("fps"),
                "source": detection_state.get("source") or inference_state.get("source"),
                "source_label": detection_state.get("source_label") or inference_state.get("source_label"),
            }
        )
        operations_payload = build_operations_payload(camera_inventory, rgb_state, thermal_state, operations_inference_state)
        ok = rgb_state["camera_state"] in {"DETECTED", "BUSY"} and thermal_state["status"] in {
            "MOCK",
            "REAL",
            "STARTING",
            "NOT_DETECTED",
            "DISABLED",
        }
        return jsonify(
            {
                "ok": ok,
                "service": "easy-dashboard",
                "timestamp": utc_now_iso(),
                "system": system_payload,
                "cameras": camera_inventory,
                "sources": sources_state,
                "rgb": rgb_state,
                "thermal": thermal_state,
                "inference": inference_state,
                "detection_manager": detection_state,
                "session": session_state,
                "operations": operations_payload,
                "events_count": len(events.list(9999)),
            }
        )

    @app.route("/system")
    def system():
        return jsonify(build_system_payload(probe))

    @app.route("/cameras")
    def cameras():
        return jsonify(build_camera_inventory(rgb, thermal))

    @app.route("/api/sources", methods=["GET"])
    def api_sources():
        return jsonify(source_manager.get_status())

    @app.route("/api/sources/status", methods=["GET"])
    def api_sources_status():
        return jsonify(source_manager.get_status())

    @app.route("/api/sources/<source_id>", methods=["GET"])
    def api_source_detail(source_id: str):
        source = source_manager.get_source(source_id)
        if not source:
            return jsonify({"ok": False, "error": "Source not found", "id": source_id}), 404
        return jsonify({"ok": True, "source": source})

    @app.route("/api/sources/refresh", methods=["POST"])
    def api_sources_refresh():
        payload = request.get_json(force=True, silent=True) or {}
        source_id = payload.get("source_id") or payload.get("id")
        if source_id:
            return jsonify(source_manager.refresh_status(str(source_id)))
        return jsonify(source_manager.refresh_status())

    @app.route("/api/sources/select", methods=["POST"])
    def api_sources_select():
        payload = request.get_json(force=True, silent=True) or {}
        source_id = str(payload.get("source_id") or payload.get("id") or "").strip()
        if not source_id:
            return jsonify({"ok": False, "error": "source_id is required"}), 400
        result = source_manager.select_source(source_id)
        if result.get("ok") is False:
            return jsonify(result), 404
        return jsonify(result)

    @app.route("/events")
    def events_endpoint():
        limit = int(request.args.get("limit", 50))
        all_events = events.list(9999)
        severity_counts: Dict[str, int] = {}
        source_counts: Dict[str, int] = {}
        for event in all_events:
            severity = str(event.get("severity", "info")).lower()
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            source = str(event.get("source", "unknown"))
            source_counts[source] = source_counts.get(source, 0) + 1
        return jsonify(
            {
                "events": events.list(limit),
                "count": len(all_events),
                "summary": {
                    "severity": severity_counts,
                    "sources": source_counts,
                },
            }
        )

    @app.route("/video/rgb_left")
    def video_rgb_left():
        return rgb.stream_response("rgb_left", "left")

    @app.route("/video/rgb_right")
    def video_rgb_right():
        return rgb.stream_response("rgb_right", "right")

    @app.route("/video/rgb_left/start", methods=["POST"])
    def start_rgb_left():
        rgb.set_enabled("rgb_left", True)
        return jsonify({"ok": True, "feed": "rgb_left", "enabled": True, "state": rgb.latest_state()})

    @app.route("/video/rgb_left/stop", methods=["POST"])
    def stop_rgb_left():
        rgb.set_enabled("rgb_left", False)
        return jsonify({"ok": True, "feed": "rgb_left", "enabled": False, "state": rgb.latest_state()})

    @app.route("/video/rgb_right/start", methods=["POST"])
    def start_rgb_right():
        rgb.set_enabled("rgb_right", True)
        return jsonify({"ok": True, "feed": "rgb_right", "enabled": True, "state": rgb.latest_state()})

    @app.route("/video/rgb_right/stop", methods=["POST"])
    def stop_rgb_right():
        rgb.set_enabled("rgb_right", False)
        return jsonify({"ok": True, "feed": "rgb_right", "enabled": False, "state": rgb.latest_state()})

    def _snapshot_error(feed: str, filename: str, error_message: str, snapshot_info: Dict[str, Any], status_code: int = 503):
        return (
            jsonify(
                {
                    "ok": False,
                    "feed": feed,
                    "filename": filename,
                    "url": snapshot_info["url"],
                    "download_url": snapshot_info["download_url"],
                    "error": error_message,
                    "snapshot": snapshot_info,
                }
            ),
            status_code,
        )

    def _snapshot_success(feed: str, snapshot_info: Dict[str, Any], status_code: int = 200):
        return (
            jsonify(
                {
                    "ok": True,
                    "feed": feed,
                    "filename": snapshot_info["filename"],
                    "url": snapshot_info["url"],
                    "download_url": snapshot_info["download_url"],
                    "snapshot": snapshot_info,
                }
            ),
            status_code,
        )

    def _capture_snapshot(feed: str, capture_fn, meta: Dict[str, Any]):
        try:
            frame, ok = capture_fn()
            meta = dict(meta)
            meta["capture_ok"] = ok
            snapshot_info = snapshot_store.save(feed, frame, meta=meta)
            return frame, ok, snapshot_info, meta
        except Exception as exc:
            LOGGER.exception("Failed to save snapshot for %s", feed)
            events.add(
                meta.get("source", feed.upper()),
                "SNAPSHOT_ERROR",
                f"Snapshot failed for {feed}: {exc}",
                "error",
                meta=meta,
            )
            return None, False, None, meta

    @app.route("/api/snapshots/recent")
    def api_snapshots_recent():
        limit = int(request.args.get("limit", 24))
        summary = snapshot_store.summary()
        return jsonify(
            {
                "count": summary["count"],
                "items": snapshot_store.list_recent(limit),
                "feeds": SNAPSHOT_FEED_MAP,
                "summary": summary,
            }
        )

    @app.route("/snapshots")
    def snapshots_gallery():
        return dashboard_context(
            "log",
            "Log di sistema",
            "Errori e attività di sistema",
            template_name="snapshots.html",
            hostname=probe.hostname(),
            ip_address=probe.ip_address(),
            asset_version=asset_version(),
            thermal_device=thermal.device,
            thermal_mode=config["thermal"].get("mode", "mock"),
        )

    @app.route("/snapshots/<feed>/<path:filename>")
    def serve_snapshot(feed: str, filename: str):
        if feed not in SNAPSHOT_FEED_MAP:
            return jsonify({"ok": False, "error": "Unknown snapshot feed"}), 404
        try:
            path = snapshot_store.get_path(feed, filename)
        except Exception:
            return jsonify({"ok": False, "error": "Invalid snapshot path"}), 404
        if not path.exists():
            return jsonify({"ok": False, "error": "Snapshot not found"}), 404
        download_requested = request.args.get("download") == "1"
        send_file_kwargs = {
            "mimetype": "image/jpeg",
            "as_attachment": download_requested,
            "conditional": True,
        }
        return send_file(
            path,
            **send_file_kwargs,
        )

    @app.route("/snapshot/rgb_left", methods=["GET", "POST"])
    def snapshot_rgb_left():
        meta = {
            "feed": "rgb_left",
            "source": "RGB_CAM_LEFT",
            "snapshot_type": "rgb",
            "camera_state": rgb.camera_state(),
            "camera_message": rgb.camera_message(),
            "width": rgb.width,
            "height": rgb.height,
        }
        frame, ok, snapshot_info, meta = _capture_snapshot("rgb_left", lambda: rgb.capture_snapshot("left"), meta)
        if snapshot_info is None:
            return _snapshot_error("rgb_left", "rgb_left_snapshot.jpg", meta.get("camera_message", "Snapshot failed"), {"url": "#", "download_url": "#"}, 503)
        events.add("RGB_CAM_LEFT", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
        if not ok:
            return _snapshot_error("rgb_left", snapshot_info["filename"], "RGB left offline", snapshot_info, 503)
        return _snapshot_success("rgb_left", snapshot_info)

    @app.route("/snapshot/rgb_right", methods=["GET", "POST"])
    def snapshot_rgb_right():
        meta = {
            "feed": "rgb_right",
            "source": "RGB_CAM_RIGHT",
            "snapshot_type": "rgb",
            "camera_state": rgb.camera_state(),
            "camera_message": rgb.camera_message(),
            "width": rgb.width,
            "height": rgb.height,
        }
        frame, ok, snapshot_info, meta = _capture_snapshot("rgb_right", lambda: rgb.capture_snapshot("right"), meta)
        if snapshot_info is None:
            return _snapshot_error("rgb_right", "rgb_right_snapshot.jpg", meta.get("camera_message", "Snapshot failed"), {"url": "#", "download_url": "#"}, 503)
        events.add("RGB_CAM_RIGHT", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
        if not ok:
            return _snapshot_error("rgb_right", snapshot_info["filename"], "RGB right offline", snapshot_info, 503)
        return _snapshot_success("rgb_right", snapshot_info)

    @app.route("/thermal/status")
    def thermal_status():
        return jsonify(thermal.status_payload())

    @app.route("/thermal/frame")
    def thermal_frame():
        frame, stats = thermal.frame()
        return Response(frame, mimetype="image/jpeg", headers={"X-EASY-THERMAL-STATUS": stats.get("status", "unknown")})

    @app.route("/thermal/snapshot", methods=["GET", "POST"])
    @app.route("/snapshot/thermal", methods=["GET", "POST"])
    def thermal_snapshot():
        frame, stats = thermal.snapshot()
        meta = dict(stats)
        meta.update({"feed": "thermal", "snapshot_type": "thermal"})
        try:
            snapshot_info = snapshot_store.save("thermal", frame, meta=meta)
        except Exception as exc:
            LOGGER.exception("Failed to save thermal snapshot")
            events.add("THERMAL_FLIR", "SNAPSHOT_ERROR", f"Snapshot failed: {exc}", "error", meta=meta)
            return _snapshot_error("thermal", "thermal_snapshot.jpg", "Unable to save thermal snapshot", {"url": "#", "download_url": "#"}, 503)
        events.add("THERMAL_FLIR", "SNAPSHOT_SAVED", f"Saved {snapshot_info['filename']}", "info", meta=meta)
        if snapshot_info["meta"].get("status") in {"NOT_DETECTED", "DISABLED"}:
            return _snapshot_error("thermal", snapshot_info["filename"], "Thermal feed unavailable", snapshot_info, 503)
        return _snapshot_success("thermal", snapshot_info)

    @app.route("/api/stream-state", methods=["GET"])
    def stream_state():
        return jsonify(
            {
                "rgb_left": {
                    "enabled": rgb.enabled_feeds["rgb_left"],
                    "state": rgb.latest_state(),
                },
                "rgb_right": {
                    "enabled": rgb.enabled_feeds["rgb_right"],
                    "state": rgb.latest_state(),
                },
            }
        )

    @app.route("/api/stream-state", methods=["POST"])
    def set_stream_state():
        payload = request.get_json(force=True, silent=True) or {}
        for feed_name in ("rgb_left", "rgb_right"):
            if feed_name in payload:
                rgb.set_enabled(feed_name, bool(payload[feed_name]))
        return jsonify(
            {
                "ok": True,
                "rgb_left": rgb.enabled_feeds["rgb_left"],
                "rgb_right": rgb.enabled_feeds["rgb_right"],
            }
        )

    def _inference_json(payload: Dict[str, Any], status_code: int = 200):
        return jsonify(payload), status_code

    def _parse_json_payload() -> Dict[str, Any]:
        return request.get_json(force=True, silent=True) or {}

    @app.route("/api/inference/status", methods=["GET"])
    def api_inference_status():
        status_payload = inference.status()
        detection_state = detection_manager.get_current_detections()
        status_payload["count"] = detection_state.get("count", status_payload.get("count", 0))
        status_payload["last_detections"] = detection_state.get("detections", status_payload.get("last_detections", []))
        status_payload["last_image"] = detection_state.get("last_image") or status_payload.get("last_image")
        status_payload["last_run_ts"] = detection_state.get("last_run_ts") or status_payload.get("last_run_ts")
        status_payload["last_inference_ms"] = detection_state.get("last_inference_ms") or status_payload.get("last_inference_ms")
        status_payload["fps"] = detection_state.get("fps") or status_payload.get("fps")
        status_payload["detection_manager"] = {
            "current_detections_path": detection_state.get("current_detections_path"),
            "history_path": detection_state.get("history_path"),
            "session_id": detection_state.get("session_id"),
        }
        status_payload["frame_provider"] = inference.frame_provider_status()
        return jsonify(status_payload)

    @app.route("/api/frame-provider/status", methods=["GET"])
    def api_frame_provider_status():
        return jsonify(inference.frame_provider_status())

    @app.route("/api/frame-provider/configure", methods=["POST"])
    def api_frame_provider_configure():
        payload = _parse_json_payload()
        result = inference.configure_frame_provider(
            source_type=payload.get("source_type"),
            source_path=payload.get("source_path"),
            source_name=payload.get("source_name"),
            loop=payload.get("loop"),
            save_temp_frames=payload.get("save_temp_frames"),
        )
        return jsonify(result), 200 if result.get("ok") else 400

    @app.route("/api/frame-provider/reset", methods=["POST"])
    def api_frame_provider_reset():
        return jsonify(inference.reset_frame_provider())

    @app.route("/api/frame-provider/next-frame", methods=["POST"])
    def api_frame_provider_next_frame():
        try:
            return jsonify(inference.next_frame())
        except Exception as exc:
            return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)

    @app.route("/api/inference/start", methods=["POST"])
    def api_inference_start():
        payload = _parse_json_payload()
        mode = str(payload.get("mode", "replay"))
        interval_seconds = payload.get("interval_seconds")
        try:
            interval_seconds = None if interval_seconds is None else float(interval_seconds)
        except Exception:
            return _inference_json({"ok": False, "error": "Invalid interval_seconds value"}, 400)
        result = inference.start(mode=mode, interval_seconds=interval_seconds)
        return _inference_json(result, 200 if result.get("ok") else 503)

    @app.route("/api/inference/stop", methods=["POST"])
    def api_inference_stop():
        return jsonify(inference.stop())

    @app.route("/api/inference/run-on-image", methods=["POST"])
    def api_inference_run_on_image():
        payload = _parse_json_payload()
        image_path = payload.get("image_path") or payload.get("path") or request.args.get("image_path") or request.args.get("path")
        if image_path is None:
            try:
                image_path = str(find_first_image(inference.replay_dir))
            except Exception:
                return _inference_json({"ok": False, "error": f"No replay images found in {inference.replay_dir}"}, 404)
        result = inference.run_on_image(image_path)
        return _inference_json(result, 200 if result.get("ok") else 400)

    @app.route("/api/inference/run-on-next-frame", methods=["POST"])
    def api_inference_run_on_next_frame():
        try:
            result = inference.run_on_next_frame()
        except Exception as exc:
            return _inference_json({"ok": False, "error": str(exc), "provider": inference.frame_provider_status()}, 400)
        return _inference_json(result, 200 if result.get("ok") else 400)

    @app.route("/api/detections/current", methods=["GET"])
    def api_detections_current():
        return jsonify(detection_manager.get_current_detections())

    @app.route("/api/detection/current", methods=["GET"])
    def api_detection_current():
        return jsonify(detection_manager.get_current_detections())

    @app.route("/api/detection/history", methods=["GET"])
    def api_detection_history():
        return jsonify(detection_manager.get_history())

    @app.route("/api/detection/<detection_id>", methods=["GET"])
    def api_detection_detail(detection_id: str):
        detection = detection_manager.get_detection(detection_id)
        if not detection:
            return jsonify({"ok": False, "error": "Detection not found", "id": detection_id}), 404
        return jsonify({"ok": True, "detection": detection})

    @app.route("/api/detection/clear", methods=["DELETE", "POST"])
    def api_detection_clear():
        return jsonify(detection_manager.clear())

    @app.route("/api/events/current", methods=["GET"])
    def api_events_current():
        return jsonify(event_manager.get_current_events())

    @app.route("/api/events/history", methods=["GET"])
    def api_events_history():
        return jsonify(event_manager.get_history())

    @app.route("/api/events/<event_id>", methods=["GET"])
    def api_event_detail(event_id: str):
        event_payload = event_manager.get_event(event_id)
        if not event_payload:
            return jsonify({"ok": False, "error": "Event not found", "id": event_id}), 404
        return jsonify({"ok": True, "event": event_payload})

    @app.route("/api/events/clear", methods=["DELETE", "POST"])
    def api_events_clear():
        return jsonify(event_manager.clear())

    @app.route("/api/session/start", methods=["POST"])
    def api_session_start():
        payload = _parse_json_payload()
        result = session_manager.start_session(
            mode=str(payload.get("mode") or "replay"),
            operator=str(payload.get("operator") or "operator"),
            model_name=Path(str(inference.model_path)).name,
            model_type=str(inference.backend or "onnx"),
            notes=str(payload.get("notes") or ""),
        )
        return jsonify(result), 200 if result.get("ok") else 400

    @app.route("/api/session/stop", methods=["POST"])
    def api_session_stop():
        current = session_manager.get_current_session()
        session_id = str(current.get("session_id") or "") if current else ""
        result = session_manager.stop_session()
        if session_id:
            try:
                event_manager.resolve_session_events(session_id, notes="Session stopped")
            except Exception:
                pass
        return jsonify(result)

    @app.route("/api/session/status", methods=["GET"])
    def api_session_status():
        return jsonify(session_manager.status())

    @app.route("/api/session/current", methods=["GET"])
    def api_session_current():
        current = session_manager.get_current_session()
        return jsonify({"ok": True, "running": bool(current), "session": current})

    @app.route("/api/session/list", methods=["GET"])
    def api_session_list():
        return jsonify(session_manager.list_sessions())

    @app.route("/api/inference/preview", methods=["GET"])
    def api_inference_preview():
        preview_path = inference.current_preview_path
        if not preview_path.exists():
            return jsonify({"ok": False, "error": "Detection preview not available yet"}), 404
        response = send_file(
            preview_path,
            mimetype="image/jpeg",
            as_attachment=False,
            conditional=True,
        )
        response.headers["Cache-Control"] = "no-store, max-age=0"
        return response

    @app.teardown_appcontext
    def _shutdown(_exc: Optional[BaseException]) -> None:
        # Keep the source process alive across requests, but if Flask exits cleanly
        # make sure the camera process is not orphaned.
        pass

    atexit.register(rgb.stop)
    atexit.register(thermal.stop)
    atexit.register(inference.stop)

    return app


app = create_app()


if __name__ == "__main__":
    cfg = load_config()
    host = str(cfg["app"].get("host", "0.0.0.0"))
    port = int(cfg["app"].get("port", 5000))
    probe = SystemProbe()
    LOGGER.info("Starting EASY dashboard on %s:%s", host, port)
    LOGGER.info("Open in Mac browser via tunnel: http://127.0.0.1:%s", port)
    LOGGER.info("Open on Raspberry LAN: http://%s:%s", probe.ip_address(), port)
    app.run(host=host, port=port, threaded=True, debug=bool(cfg["app"].get("debug", False)))
