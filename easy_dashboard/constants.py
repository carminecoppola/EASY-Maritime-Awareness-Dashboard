from __future__ import annotations

from pathlib import Path
from typing import Any, Dict


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
LOG_DIR = DATA_DIR / "logs"
REPORT_DIR = DATA_DIR / "reports"
CAPTURES_DIR = DATA_DIR / "captures"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
RGB_LEFT_DIR = CAPTURES_DIR / "rgb_left"
RGB_RIGHT_DIR = CAPTURES_DIR / "rgb_right"
THERMAL_DIR = CAPTURES_DIR / "thermal"
PRELIGHT_REPORT = REPORT_DIR / "preflight_report.txt"
EVENTS_LOG = LOG_DIR / "events.jsonl"
CONFIG_PATH = PROJECT_ROOT / "config.yaml"

SNAPSHOT_FEED_MAP = {
    "rgb_left": {"label": "RGB Left", "source": "RGB_CAM_LEFT", "folder": "rgb_left"},
    "rgb_right": {"label": "RGB Right", "source": "RGB_CAM_RIGHT", "folder": "rgb_right"},
    "thermal": {"label": "Thermal", "source": "THERMAL_FLIR", "folder": "thermal"},
}

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
    {"key": "log", "label": "Foto e log", "href": "/snapshots"},
    {"key": "system", "label": "Sistema", "href": "/system-diagnostics"},
]


def ensure_runtime_directories() -> None:
    """Create the local runtime folders expected by the dashboard."""
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

    for feed_meta in SNAPSHOT_FEED_MAP.values():
        (SNAPSHOTS_DIR / feed_meta["folder"]).mkdir(parents=True, exist_ok=True)


ensure_runtime_directories()
