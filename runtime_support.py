from __future__ import annotations

"""Small shared helpers for the runtime managers.

The Phase 6 managers persist similar JSON snapshots and UTC timestamps.
Keeping that plumbing in one place makes the manager modules shorter and
keeps naming consistent across detections, events and sessions.
"""

import calendar
import json
import time
import uuid
from pathlib import Path
from typing import Any


HEALTHY_STATUSES = {"READY", "ONLINE", "CONNECTED", "STREAMING", "RUNNING", "DETECTED", "MOCK", "REAL"}
DEGRADED_STATUSES = {"INITIALIZING", "STARTING", "LOADING", "PENDING", "WAITING", "CHECKING", "COOLDOWN"}
OFFLINE_STATUSES = {"ERROR", "FAILED", "OFFLINE", "DISCONNECTED", "NOT_PRESENT", "NOT_AVAILABLE"}
ACTIVE_STATUSES = HEALTHY_STATUSES | {"INITIALIZING", "STARTING", "LOADING"}


def normalize_status(value: Any, default: str = "UNKNOWN") -> str:
    resolved = str(value or default).strip().upper()
    return resolved or default


def health_from_status(status: Any) -> str:
    value = normalize_status(status)
    if value in HEALTHY_STATUSES:
        return "GOOD"
    if value in DEGRADED_STATUSES:
        return "DEGRADED"
    if value in OFFLINE_STATUSES:
        return "OFFLINE"
    return "UNKNOWN"


def is_active_status(status: Any) -> bool:
    return normalize_status(status) in ACTIVE_STATUSES


def status_from_payload(payload: Any, default: str = "UNKNOWN") -> str:
    if isinstance(payload, dict):
        for key in ("status", "state", "health", "mode"):
            if payload.get(key) not in (None, ""):
                return normalize_status(payload[key], default)
        if payload.get("ok") is True:
            return "READY"
        if payload.get("ok") is False:
            return "ERROR"
    if isinstance(payload, str):
        return normalize_status(payload, default)
    return default


def error_from_payload(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("error", "config_error", "last_error"):
        if payload.get(key):
            return str(payload[key])
    return ""


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def parse_utc_ts(value: str | None) -> float | None:
    if not value:
        return None
    try:
        # The trailing Z is UTC. time.mktime() interprets the tuple as local
        # time and shifted mission durations by the host timezone.
        return float(calendar.timegm(time.strptime(value, "%Y-%m-%dT%H:%M:%SZ")))
    except Exception:
        return None


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    temp_path.replace(path)


def read_json(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.exists():
        return default or {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default or {}


def directory_has_frames(path: Path) -> bool:
    if not path.exists():
        return False
    for candidate in path.rglob("*"):
        if candidate.is_file() and candidate.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            return True
    return False
