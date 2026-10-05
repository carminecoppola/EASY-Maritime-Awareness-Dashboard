# EASY Maritime Awareness Dashboard
# Copyright (c) 2026 Carmine Coppola and EASY contributors.
# SPDX-License-Identifier: BSD-3-Clause

"""Normalise hardware state for the APIs, the managers and the operator interface.

The hardware adapters keep their native states (``DETECTED``, ``BUSY``, ``REAL``,
...). The functions here add one stable vocabulary that every consumer can rely on:

    STREAMING     frames are arriving and fresh (younger than 5 seconds)
    READY         the device is present and idle, or waiting for its first frame
    INITIALIZING  the device is starting up or recovering
    NOT_PRESENT   disabled, not detected, or absent
    ERROR         the device failed

Each *contract* also carries ``health``, ``ready``, ``streaming`` and
``service_healthy`` flags so the UI never has to interpret native states.
"""

from __future__ import annotations

import time
from typing import Any, Mapping

from runtime_support import normalize_status


ERROR_STATES = {"ERROR", "FAILED", "OFFLINE"}
INITIALIZING_STATES = {"BUSY", "STARTING", "LOADING", "PENDING", "CHECKING", "COOLDOWN", "INITIALIZING"}
NOT_PRESENT_STATES = {"DISABLED", "NOT_DETECTED", "NOT_PRESENT"}


def _is_fresh(timestamp: Any, max_age_seconds: float = 5.0) -> bool:
    """True when ``timestamp`` (epoch seconds) is at most ``max_age_seconds`` old."""
    try:
        return bool(timestamp and time.time() - float(timestamp) <= max_age_seconds)
    except (TypeError, ValueError):
        return False


def build_rgb_state_contract(state: Mapping[str, Any] | None, *, enabled: bool = True) -> dict[str, Any]:
    """Build the state contract of the RGB cameras from the capture runtime state.

    Freshness of the last frame decides between STREAMING and READY. A detected
    RGB device counts as service-healthy even while its first frame is pending.
    """
    payload = dict(state or {})
    camera_state = normalize_status(payload.get("camera_state"))
    process_state = normalize_status(payload.get("status"))
    native_state = process_state if process_state != "UNKNOWN" else camera_state
    last_frame_ts = payload.get("last_frame_ts")
    fresh = _is_fresh(last_frame_ts)
    detected = bool(payload.get("detected") or camera_state in {"DETECTED", "BUSY", "ONLINE"})

    if not enabled:
        availability = "NOT_PRESENT"
    elif camera_state in ERROR_STATES or process_state in ERROR_STATES:
        availability = "ERROR"
    elif detected and fresh:
        availability = "STREAMING"
    elif camera_state in INITIALIZING_STATES or process_state in INITIALIZING_STATES:
        availability = "INITIALIZING"
    elif detected:
        availability = "READY"
    else:
        availability = "NOT_PRESENT"

    ready = availability in {"READY", "STREAMING"}
    return {
        "availability": availability,
        "health": "GOOD" if ready else "DEGRADED" if availability == "INITIALIZING" else "OFFLINE",
        "capture_mode": "continuous",
        "detected": detected,
        "ready": ready,
        "streaming": availability == "STREAMING",
        "operational": availability == "STREAMING",
        # Keep service health compatible with the previous /health rule: a
        # detected RGB device is healthy even while its first frame is pending.
        "service_healthy": availability in {"READY", "STREAMING", "INITIALIZING"},
        "fresh": fresh,
        "last_frame_ts": last_frame_ts,
        "native_state": native_state,
        "camera_state": camera_state,
    }


def build_thermal_state_contract(state: Mapping[str, Any] | None) -> dict[str, Any]:
    """Build the state contract of the thermal sensor.

    A missing or disabled thermal device is not a service failure (only ERROR is);
    simulated (mock) mode is always STREAMING.
    """
    payload = dict(state or {})
    native_state = normalize_status(payload.get("status") or payload.get("mode"))
    mode = str(payload.get("mode") or "").lower()
    capture_mode = str(payload.get("capture_mode") or "on_demand").lower()
    last_frame_ts = payload.get("last_frame_ts")
    fresh = _is_fresh(last_frame_ts)
    detected = bool(payload.get("detected") or mode == "mock" or native_state in {"REAL", "MOCK", "READY"})

    if native_state in ERROR_STATES:
        availability = "ERROR"
    elif native_state in NOT_PRESENT_STATES:
        availability = "NOT_PRESENT"
    elif mode == "mock" or (detected and fresh):
        availability = "STREAMING"
    elif native_state in INITIALIZING_STATES:
        availability = "INITIALIZING"
    elif detected:
        # READY is valid before the continuous worker has produced its first
        # frame, and remains the normal idle state for legacy single-frame mode.
        availability = "READY"
    else:
        availability = "NOT_PRESENT"

    ready = availability in {"READY", "STREAMING"}
    return {
        "availability": availability,
        "health": "GOOD" if ready else "DEGRADED" if availability == "INITIALIZING" else "OFFLINE",
        "capture_mode": "simulated" if mode == "mock" else capture_mode,
        "detected": detected,
        "ready": ready,
        "streaming": availability == "STREAMING",
        "operational": ready,
        # A missing/disabled optional thermal device did not fail /health in
        # the existing API. Preserve that behavior while exposing availability.
        "service_healthy": availability != "ERROR",
        "fresh": fresh,
        "last_frame_ts": last_frame_ts,
        "native_state": native_state,
    }


def runtime_is_healthy(rgb_state: Mapping[str, Any] | None, thermal_state: Mapping[str, Any] | None) -> bool:
    """True when neither the RGB nor the thermal runtime is in a failed state."""
    rgb_contract = build_rgb_state_contract(rgb_state)
    thermal_contract = build_thermal_state_contract(thermal_state)
    return bool(rgb_contract["service_healthy"] and thermal_contract["service_healthy"])


def build_rgb_device_status(rgb: Any, feed_id: str) -> dict[str, Any]:
    """Translate the RGB runtime state into the status payload the device manager expects."""
    if rgb is None or not hasattr(rgb, "latest_state"):
        return {"status": "NOT_PRESENT", "fps": 0.0, "configuration": {"feed": feed_id, "reason": "RGB runtime not available"}}
    try:
        state = rgb.latest_state()
    except Exception as exc:
        return {"status": "ERROR", "fps": 0.0, "error": str(exc), "configuration": {"feed": feed_id}}

    enabled = bool((getattr(rgb, "enabled_feeds", {}) or {}).get(feed_id, True))
    contract = build_rgb_state_contract(state, enabled=enabled)
    return {
        "status": "CONNECTED" if contract["availability"] == "READY" else contract["availability"],
        "fps": float(state.get("fps") or 0.0),
        "error": state.get("error") or "",
        "runtime_state": contract,
        "configuration": {
            "feed": feed_id,
            "enabled": enabled,
            "camera_state": contract["camera_state"],
            "last_frame_ts": contract["last_frame_ts"],
            "message": state.get("message") or "",
        },
    }


def build_thermal_device_status(thermal: Any) -> dict[str, Any]:
    """Translate the thermal runtime state into the status payload the device manager expects."""
    if thermal is None or not hasattr(thermal, "status_payload"):
        return {"status": "NOT_PRESENT", "fps": 0.0, "configuration": {"reason": "Thermal runtime not available"}}
    try:
        state = thermal.status_payload(refresh=False)
    except Exception as exc:
        return {"status": "ERROR", "fps": 0.0, "error": str(exc), "configuration": {}}

    contract = build_thermal_state_contract(state)
    return {
        "status": "CONNECTED" if contract["availability"] == "READY" else contract["availability"],
        "fps": float(state.get("fps") or state.get("frame_rate") or 0.0),
        "temperature": state.get("avg_c"),
        "error": state.get("error") or "",
        "runtime_state": contract,
        "configuration": {
            "mode": state.get("mode"),
            "detected": contract["detected"],
            "device": state.get("device"),
            "configured_device": state.get("configured_device"),
            "input_format": state.get("input_format"),
            "video_size": state.get("video_size"),
            "discovery_method": state.get("discovery_method"),
            "last_frame_ts": contract["last_frame_ts"],
        },
    }
