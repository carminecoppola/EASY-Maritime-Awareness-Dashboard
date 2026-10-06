# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Small helpers shared by the runtime managers.

The detection, event and session managers persist similar JSON snapshots and
UTC timestamps, and all of them classify component states the same way.
Keeping that plumbing in one module keeps naming and behaviour consistent.

Status vocabulary:
    HEALTHY  - the component works (READY, STREAMING, CONNECTED, ...).
    DEGRADED - the component is coming up or recovering (INITIALIZING, ...).
    OFFLINE  - the component is absent or failed (ERROR, NOT_PRESENT, ...).
"""

from __future__ import annotations

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
    """Return ``value`` as an upper-case, stripped status string (``default`` if empty)."""
    resolved = str(value or default).strip().upper()
    return resolved or default


def health_from_status(status: Any) -> str:
    """Map a component status to a coarse health level: GOOD, DEGRADED, OFFLINE or UNKNOWN."""
    value = normalize_status(status)
    if value in HEALTHY_STATUSES:
        return "GOOD"
    if value in DEGRADED_STATUSES:
        return "DEGRADED"
    if value in OFFLINE_STATUSES:
        return "OFFLINE"
    return "UNKNOWN"


def is_active_status(status: Any) -> bool:
    """Return True when the status means the component is running or starting up."""
    return normalize_status(status) in ACTIVE_STATUSES


def status_from_payload(payload: Any, default: str = "UNKNOWN") -> str:
    """Extract a status from a component payload.

    The first non-empty ``status``/``state``/``health``/``mode`` key wins; a bare
    ``ok`` flag maps to READY/ERROR. A plain string is normalised directly.
    """
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
    """Return the first error message found in a payload, or an empty string."""
    if not isinstance(payload, dict):
        return ""
    for key in ("error", "config_error", "last_error"):
        if payload.get(key):
            return str(payload[key])
    return ""


def utc_now_iso() -> str:
    """Return the current UTC time as ``YYYY-MM-DDTHH:MM:SSZ``."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def parse_utc_ts(value: str | None) -> float | None:
    """Parse a ``utc_now_iso`` timestamp into epoch seconds (None if invalid)."""
    if not value:
        return None
    try:
        # The trailing Z is UTC. time.mktime() interprets the tuple as local
        # time and shifted mission durations by the host timezone.
        return float(calendar.timegm(time.strptime(value, "%Y-%m-%dT%H:%M:%SZ")))
    except Exception:
        return None


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write ``payload`` to ``path`` without ever exposing a half-written file.

    The JSON goes to a unique temporary file in the same directory and is then
    renamed over the target, which is atomic on POSIX filesystems.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    temp_path.replace(path)


def read_json(path: Path, default: dict[str, Any] | None = None) -> dict[str, Any]:
    """Read a JSON object from ``path``; return ``default`` (or ``{}``) if it is missing or corrupt."""
    if not path.exists():
        return default or {}
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default or {}


def directory_has_frames(path: Path) -> bool:
    """Return True when ``path`` contains at least one image file (searched recursively)."""
    if not path.exists():
        return False
    for candidate in path.rglob("*"):
        if candidate.is_file() and candidate.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            return True
    return False
