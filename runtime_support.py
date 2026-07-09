from __future__ import annotations

"""Small shared helpers for the runtime managers.

The Phase 6 managers persist similar JSON snapshots and UTC timestamps.
Keeping that plumbing in one place makes the manager modules shorter and
keeps naming consistent across detections, events and sessions.
"""

import json
import time
import uuid
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def parse_utc_ts(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return time.mktime(time.strptime(value, "%Y-%m-%dT%H:%M:%SZ"))
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
