from __future__ import annotations

"""Translate hardware runtime state into the stable device-manager contract."""

import time
from typing import Any

from runtime_support import normalize_status


def _is_fresh(timestamp: Any, max_age_seconds: float = 5.0) -> bool:
    try:
        return bool(timestamp and time.time() - float(timestamp) <= max_age_seconds)
    except (TypeError, ValueError):
        return False


def build_rgb_device_status(rgb: Any, feed_id: str) -> dict[str, Any]:
    if rgb is None or not hasattr(rgb, "latest_state"):
        return {"status": "NOT_PRESENT", "fps": 0.0, "configuration": {"feed": feed_id, "reason": "RGB runtime not available"}}
    try:
        state = rgb.latest_state()
    except Exception as exc:
        return {"status": "ERROR", "fps": 0.0, "error": str(exc), "configuration": {"feed": feed_id}}

    enabled = bool((getattr(rgb, "enabled_feeds", {}) or {}).get(feed_id, True))
    camera_state = normalize_status(state.get("camera_state") or state.get("status"))
    last_frame_ts = state.get("last_frame_ts")
    detected = bool(state.get("detected") or camera_state in {"DETECTED", "BUSY"})
    if not enabled:
        status = "NOT_PRESENT"
    elif camera_state in {"ERROR", "FAILED", "OFFLINE"}:
        status = "ERROR"
    elif camera_state == "BUSY":
        status = "INITIALIZING"
    elif detected and _is_fresh(last_frame_ts):
        status = "STREAMING"
    elif detected:
        status = "CONNECTED"
    else:
        status = "NOT_PRESENT"
    return {
        "status": status,
        "fps": float(state.get("fps") or 0.0),
        "error": state.get("error") or "",
        "configuration": {"feed": feed_id, "enabled": enabled, "camera_state": camera_state, "last_frame_ts": last_frame_ts, "message": state.get("message") or ""},
    }


def build_thermal_device_status(thermal: Any) -> dict[str, Any]:
    if thermal is None or not hasattr(thermal, "status_payload"):
        return {"status": "NOT_PRESENT", "fps": 0.0, "configuration": {"reason": "Thermal runtime not available"}}
    try:
        state = thermal.status_payload()
    except Exception as exc:
        return {"status": "ERROR", "fps": 0.0, "error": str(exc), "configuration": {}}

    thermal_state = normalize_status(state.get("status") or state.get("mode"))
    last_frame_ts = state.get("last_frame_ts")
    detected = bool(state.get("detected") or thermal_state in {"REAL", "MOCK"})
    if thermal_state in {"ERROR", "FAILED", "OFFLINE"}:
        status = "ERROR"
    elif thermal_state in {"DISABLED", "NOT_DETECTED"}:
        status = "NOT_PRESENT"
    elif thermal_state in {"STARTING", "LOADING", "PENDING", "CHECKING", "COOLDOWN"}:
        status = "INITIALIZING"
    elif detected and _is_fresh(last_frame_ts):
        status = "STREAMING"
    elif detected:
        status = "CONNECTED"
    else:
        status = "UNKNOWN"
    return {
        "status": status,
        "fps": float(state.get("fps") or state.get("frame_rate") or 0.0),
        "temperature": state.get("avg_c"),
        "error": state.get("error") or "",
        "configuration": {
            "mode": state.get("mode"), "detected": detected, "device": state.get("device"),
            "configured_device": state.get("configured_device"), "input_format": state.get("input_format"),
            "video_size": state.get("video_size"), "discovery_method": state.get("discovery_method"),
            "last_frame_ts": last_frame_ts,
        },
    }
